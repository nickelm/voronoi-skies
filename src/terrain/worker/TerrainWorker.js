/**
 * Web Worker for terrain generation
 * Handles noise computation, Delaunay triangulation, and mesh data packing
 * Returns transferable typed arrays for zero-copy transfer to main thread
 */
import { Delaunay } from 'd3-delaunay';
import { generateJitteredGridPoints } from '../../utils/seededRandom.js';
import { initNoise, moisture, detail, getElevation } from '../noise.js';
import { biome, getBaseColor } from '../biomes.js';

// Worker state
let noiseInitialized = false;
let currentWorldSeed = null;

// Elevation scaling factor: maps noise [-1, 1] to world units (feet)
const ELEVATION_SCALE = 400;

/**
 * Handle messages from main thread
 */
self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'init':
      handleInit(payload);
      break;

    case 'generate':
      handleGenerate(payload);
      break;

    default:
      console.warn('TerrainWorker: unknown message type', type);
  }
};

/**
 * Initialize noise generators with world seed
 */
function handleInit({ worldSeed }) {
  if (!noiseInitialized || currentWorldSeed !== worldSeed) {
    initNoise(worldSeed);
    noiseInitialized = true;
    currentWorldSeed = worldSeed;
  }
  self.postMessage({ type: 'init_complete' });
}

/**
 * Generate chunk data and return as transferable buffers
 */
function handleGenerate(payload) {
  const { requestId, chunkX, chunkY, chunkSize, gridSpacing, aoConfig } = payload;

  try {
    const result = generateChunkData(chunkX, chunkY, chunkSize, gridSpacing, aoConfig);

    // Post result with transferable buffers for zero-copy
    self.postMessage({
      type: 'chunk_ready',
      payload: {
        requestId,
        chunkX,
        chunkY,
        positions: result.positions,
        normals: result.normals,
        colors: result.colors,
        bounds: result.bounds
      }
    }, result.transferables);

  } catch (error) {
    self.postMessage({
      type: 'chunk_error',
      payload: {
        requestId,
        chunkX,
        chunkY,
        error: error.message
      }
    });
  }
}

/**
 * Generate terrain data for a chunk
 * Returns flat typed arrays ready for BufferGeometry
 */
function generateChunkData(chunkX, chunkY, chunkSize, gridSpacing, aoConfig) {
  const bounds = [
    chunkX * chunkSize,
    chunkY * chunkSize,
    (chunkX + 1) * chunkSize,
    (chunkY + 1) * chunkSize
  ];
  const [minX, minY, maxX, maxY] = bounds;

  // Margin ensures cells near edges have proper neighbors
  const margin = gridSpacing * 2;

  // Generate jittered grid points (deterministic based on world coordinates)
  const points = generateJitteredGridPoints(currentWorldSeed, bounds, gridSpacing, margin);

  // Extended bounds for Voronoi computation
  const extendedBounds = [
    minX - margin,
    minY - margin,
    maxX + margin,
    maxY + margin
  ];

  // Create Delaunay triangulation
  const delaunay = Delaunay.from(points);
  const triangleIndices = delaunay.triangles;
  const numTriangles = triangleIndices.length / 3;

  // Pre-compute elevation and AO for all points
  const pointElevations = new Float32Array(points.length);
  const pointAO = new Float32Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    pointElevations[i] = getElevation(px, py);
    pointAO[i] = computeVertexAO(px, py, pointElevations[i], aoConfig);
  }

  // Collect triangles whose centroid falls within chunk bounds
  const filteredTriangles = [];

  for (let t = 0; t < numTriangles; t++) {
    const i0 = triangleIndices[t * 3 + 0];
    const i1 = triangleIndices[t * 3 + 1];
    const i2 = triangleIndices[t * 3 + 2];

    const v0 = points[i0];
    const v1 = points[i1];
    const v2 = points[i2];

    // Compute centroid
    const cx = (v0[0] + v1[0] + v2[0]) / 3;
    const cy = (v0[1] + v1[1] + v2[1]) / 3;

    // Filter: only keep triangles whose centroid is within chunk bounds
    if (cx >= minX && cx < maxX && cy >= minY && cy < maxY) {
      filteredTriangles.push({ i0, i1, i2, cx, cy });
    }
  }

  // Compute vertex normals by averaging face normals
  const vertexNormalAccum = new Map();

  for (const { i0, i1, i2 } of filteredTriangles) {
    const v0 = {
      x: points[i0][0],
      y: points[i0][1],
      z: pointElevations[i0] * ELEVATION_SCALE
    };
    const v1 = {
      x: points[i1][0],
      y: points[i1][1],
      z: pointElevations[i1] * ELEVATION_SCALE
    };
    const v2 = {
      x: points[i2][0],
      y: points[i2][1],
      z: pointElevations[i2] * ELEVATION_SCALE
    };

    const fn = computeFaceNormal(v0, v1, v2);

    for (const idx of [i0, i1, i2]) {
      if (!vertexNormalAccum.has(idx)) {
        vertexNormalAccum.set(idx, { nx: 0, ny: 0, nz: 0 });
      }
      const vn = vertexNormalAccum.get(idx);
      vn.nx += fn.x;
      vn.ny += fn.y;
      vn.nz += fn.z;
    }
  }

  // Normalize accumulated normals
  for (const [idx, vn] of vertexNormalAccum) {
    const len = Math.sqrt(vn.nx * vn.nx + vn.ny * vn.ny + vn.nz * vn.nz);
    if (len > 0) {
      vn.nx /= len;
      vn.ny /= len;
      vn.nz /= len;
    }
  }

  // Build output arrays: 3 vertices per triangle, each with position(3), normal(3), color(3)
  const triCount = filteredTriangles.length;
  const vertexCount = triCount * 3;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  let vIdx = 0;

  for (const { i0, i1, i2, cx, cy } of filteredTriangles) {
    const indices = [i0, i1, i2];

    // Compute average elevation for biome determination
    const avgElev = (pointElevations[i0] + pointElevations[i1] + pointElevations[i2]) / 3;

    // Sample noise at centroid for biome/color
    const moist = moisture(cx, cy);
    const det = detail(cx, cy);

    // Determine biome from average elevation (matches main thread ChunkGenerator)
    const triangleBiome = biome(avgElev, moist, null);

    // Get base color
    const variation = (det + 1) / 2;
    const baseColor = getBaseColor(triangleBiome, avgElev, variation);

    // Extract RGB as floats [0, 1]
    const baseR = ((baseColor >> 16) & 0xFF) / 255;
    const baseG = ((baseColor >> 8) & 0xFF) / 255;
    const baseB = (baseColor & 0xFF) / 255;

    // Write vertex data
    for (let i = 0; i < 3; i++) {
      const ptIdx = indices[i];
      const pt = points[ptIdx];
      const elev = pointElevations[ptIdx];
      const ao = pointAO[ptIdx];
      const vn = vertexNormalAccum.get(ptIdx) || { nx: 0, ny: 0, nz: 1 };

      // Position (x, y, z)
      positions[vIdx * 3 + 0] = pt[0];
      positions[vIdx * 3 + 1] = pt[1];
      positions[vIdx * 3 + 2] = elev * ELEVATION_SCALE;

      // Normal
      normals[vIdx * 3 + 0] = vn.nx;
      normals[vIdx * 3 + 1] = vn.ny;
      normals[vIdx * 3 + 2] = vn.nz;

      // Color with AO baked in
      colors[vIdx * 3 + 0] = baseR * ao;
      colors[vIdx * 3 + 1] = baseG * ao;
      colors[vIdx * 3 + 2] = baseB * ao;

      vIdx++;
    }
  }

  return {
    positions,
    normals,
    colors,
    bounds,
    transferables: [positions.buffer, normals.buffer, colors.buffer]
  };
}

/**
 * Compute face normal from three vertices using cross product
 */
function computeFaceNormal(v0, v1, v2) {
  // edge1 = v1 - v0
  const e1x = v1.x - v0.x;
  const e1y = v1.y - v0.y;
  const e1z = v1.z - v0.z;

  // edge2 = v2 - v0
  const e2x = v2.x - v0.x;
  const e2y = v2.y - v0.y;
  const e2z = v2.z - v0.z;

  // cross product
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;

  // normalize
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return { x: 0, y: 0, z: 1 };
  return { x: nx / len, y: ny / len, z: nz / len };
}

/**
 * Compute ambient occlusion factor for a vertex
 * Samples 8 surrounding points and determines how "enclosed" the vertex is
 */
function computeVertexAO(x, y, elevation, aoConfig) {
  if (!aoConfig || !aoConfig.enabled) return 1.0;

  const { samplingRadius, maxHeight, strength } = aoConfig;

  // 8 directions: N, NE, E, SE, S, SW, W, NW
  const directions = [
    [0, 1], [0.707, 0.707], [1, 0], [0.707, -0.707],
    [0, -1], [-0.707, -0.707], [-1, 0], [-0.707, 0.707]
  ];

  let totalOcclusion = 0;

  for (const [dx, dy] of directions) {
    const sampleX = x + dx * samplingRadius;
    const sampleY = y + dy * samplingRadius;
    const sampleElev = getElevation(sampleX, sampleY);

    // Height difference (positive = neighbor is higher = occluding)
    const heightDiff = sampleElev - elevation;

    // Smoothstep for gradual occlusion transition
    if (heightDiff > 0) {
      const t = Math.min(1, heightDiff / maxHeight);
      // Smoothstep: 3t^2 - 2t^3
      totalOcclusion += t * t * (3 - 2 * t);
    }
  }

  // Average occlusion across all samples
  const avgOcclusion = totalOcclusion / directions.length;

  // AO factor: 1 = no occlusion, lower = more shadow
  return 1.0 - (avgOcclusion * strength);
}
