/**
 * Generates Voronoi terrain cells for a single chunk
 */
import { Delaunay } from 'd3-delaunay';
import { generateJitteredGridPoints } from '../utils/seededRandom.js';
import { initNoise, classifyZone, Zone, isWaterZone, moisture, detail, computeElevation, getElevation } from './noise.js';
import { biome, biomeFromZone, getCellColor, getBaseColor } from './biomes.js';
import { LightingConfig, getLightDirection, computeHillshadeFromGradient, AOConfig } from './lighting.js';

// Elevation scaling factor: maps noise [-1, 1] to world units (feet)
// Higher values create steeper slopes for more dramatic hillshade
const ELEVATION_SCALE = 400;

export class ChunkGenerator {
  /**
   * @param {number} worldSeed - World seed for noise initialization
   */
  constructor(worldSeed) {
    this.worldSeed = worldSeed;
    this.noiseInitialized = false;
  }

  /**
   * Initialize noise functions (only needs to be called once)
   */
  initializeNoise() {
    if (!this.noiseInitialized) {
      initNoise(this.worldSeed);
      this.noiseInitialized = true;
    }
  }

  /**
   * Generate Voronoi cells for a chunk
   * Uses jittered grid for seamless chunk boundaries.
   * Two-pass approach: first compute terrain data, then determine biomes with neighbor access.
   *
   * @param {Chunk} chunk - The chunk to generate cells for
   * @param {number} chunkSeed - Unused (kept for API compatibility), uses worldSeed internally
   * @param {Object} config - Generation configuration
   * @param {number} config.gridSpacing - Distance between grid cell centers (default 115)
   * @returns {Array} - Array of cell objects
   */
  generateChunk(chunk, chunkSeed, config = {}) {
    const {
      gridSpacing = 25  // ~6400 cells per 2000x2000 chunk
    } = config;

    // Ensure noise is initialized
    this.initializeNoise();

    const bounds = chunk.bounds;
    const [minX, minY, maxX, maxY] = bounds;

    // Margin ensures cells near edges have proper neighbors from adjacent chunks
    // 2x spacing guarantees all relevant neighbor points are included
    const margin = gridSpacing * 2;

    // Generate points using global jittered grid (deterministic based on world coordinates)
    const points = generateJitteredGridPoints(this.worldSeed, bounds, gridSpacing, margin);

    // Extended bounds for Voronoi computation (includes margin area)
    const extendedBounds = [
      minX - margin,
      minY - margin,
      maxX + margin,
      maxY + margin
    ];

    // Create Voronoi diagram over extended area
    const delaunay = Delaunay.from(points);
    const voronoi = delaunay.voronoi(extendedBounds);

    // === PASS 1: Compute terrain data, filter to cells inside chunk bounds ===
    const cellData = [];
    for (let index = 0; index < points.length; index++) {
      const polygon = voronoi.cellPolygon(index);
      if (!polygon) continue;

      // Compute centroid (different from seed point)
      const centroid = this.computeCentroid(polygon);

      // Filter: only keep cells whose centroid falls within actual chunk bounds
      // This ensures each cell is rendered by exactly one chunk
      if (centroid[0] < minX || centroid[0] >= maxX ||
          centroid[1] < minY || centroid[1] >= maxY) {
        continue;
      }

      // Sample noise layers at centroid using world coordinates
      const { zone, continentalValue } = classifyZone(centroid[0], centroid[1]);
      // Skip detailed moisture sampling for water zones (use 0.5 default)
      const moist = isWaterZone(zone) ? 0.5 : moisture(centroid[0], centroid[1]);
      const det = detail(centroid[0], centroid[1]);

      // Compute final elevation with zone-based approach
      const { elevation: finalElevation } = computeElevation(centroid[0], centroid[1]);

      cellData.push({
        index,
        seedPoint: points[index],
        centroid,
        polygon,
        zone,
        continental: continentalValue,
        elevation: finalElevation,
        moisture: moist,
        detail: det,
        biome: null,
        color: null,
        hillshade: 0
      });
    }

    // Build index map for quick lookup (maps original point index to cell data)
    const cellMap = new Map(cellData.map(c => [c.index, c]));

    // === PASS 2: Determine biomes and hillshade with neighbor access ===
    for (const cell of cellData) {
      // Get neighbor indices from Delaunay triangulation
      const neighborIndices = this.getNeighborIndices(delaunay, cell.index, points.length);

      // Collect neighbor elevations (may include cells outside chunk that aren't rendered)
      const neighborElevations = [];
      for (const ni of neighborIndices) {
        // Try to get from our cell map first
        const neighborCell = cellMap.get(ni);
        if (neighborCell) {
          neighborElevations.push(neighborCell.elevation);
        } else {
          // Neighbor is outside chunk - compute elevation at its seed point
          const neighborPoint = points[ni];
          if (neighborPoint) {
            const neighborFinalElev = getElevation(neighborPoint[0], neighborPoint[1]);
            neighborElevations.push(neighborFinalElev);
          }
        }
      }

      const neighbors = { elevations: neighborElevations };

      // Determine biome with zone-aware function
      cell.biome = biomeFromZone(cell.zone, cell.elevation, cell.moisture);

      // Compute hillshade from elevation gradient at cell centroid
      cell.hillshade = this.computeHillshade(cell);

      // Calculate color with hillshade
      const variation = (cell.detail + 1) / 2;
      cell.color = getCellColor(cell.biome, cell.elevation, variation, cell.hillshade);
    }

    chunk.cells = cellData;

    // Build Delaunay triangle data with 3D elevation
    chunk.triangles = this.buildTriangles(delaunay, points, bounds);

    return cellData;
  }

  /**
   * Compute hillshade value based on elevation gradient at cell centroid
   * Uses finite differences with a small epsilon to compute true gradient
   * @param {Object} cell - The cell to compute hillshade for
   * @returns {number} - Hillshade value in [0, 1], 1 = fully lit, 0 = in shadow
   */
  computeHillshade(cell) {
    // Get light direction from configurable settings
    const lightDir = getLightDirection(LightingConfig.azimuth, LightingConfig.elevation);

    const cx = cell.centroid[0];
    const cy = cell.centroid[1];

    // Use a small epsilon for finite differences
    // This should be small relative to noise frequency but large enough for numerical stability
    // Regional frequency is 0.0008 (wavelength ~1250 units), so epsilon of 10 units is reasonable
    const epsilon = 10;

    // Sample computed elevation at centroid and offset positions
    const elevCenter = getElevation(cx, cy);
    const elevPosX = getElevation(cx + epsilon, cy);
    const elevNegX = getElevation(cx - epsilon, cy);
    const elevPosY = getElevation(cx, cy + epsilon);
    const elevNegY = getElevation(cx, cy - epsilon);

    // Central difference gradient: dE/dx and dE/dy
    const gradX = (elevPosX - elevNegX) / (2 * epsilon);
    const gradY = (elevPosY - elevNegY) / (2 * epsilon);

    // Scale gradient for visual effect
    // Noise returns values in [-1, 1], so gradient magnitude is typically small
    // We need to amplify significantly for visible hillshading
    const gradientScale = 500;

    // Compute hillshade using the lighting module
    return computeHillshadeFromGradient(gradX * gradientScale, gradY * gradientScale, lightDir);
  }

  /**
   * Compute ambient occlusion factor for a vertex based on surrounding elevation
   * Samples 8 surrounding points and determines how "enclosed" the vertex is
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @param {number} elevation - Vertex elevation (raw noise value, not scaled)
   * @returns {number} - AO factor in [0, 1], 1 = fully lit, 0 = fully occluded
   */
  computeVertexAO(x, y, elevation) {
    if (!AOConfig.enabled) return 1.0;

    const { samplingRadius, maxHeight, strength } = AOConfig;

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

  /**
   * Get neighbor cell indices using Delaunay triangulation
   * @param {Delaunay} delaunay - Delaunay triangulation
   * @param {number} cellIndex - Index of cell to find neighbors for
   * @param {number} totalCells - Total number of cells (for bounds checking)
   * @returns {number[]} - Array of neighbor cell indices
   */
  getNeighborIndices(delaunay, cellIndex, totalCells) {
    const neighbors = [];

    // d3-delaunay provides neighbors via delaunay.neighbors(i)
    // This returns an iterable of indices
    for (const neighborIndex of delaunay.neighbors(cellIndex)) {
      if (neighborIndex >= 0 && neighborIndex < totalCells) {
        neighbors.push(neighborIndex);
      }
    }

    return neighbors;
  }

  /**
   * Compute centroid of a polygon
   * @param {Array} polygon - Array of [x, y] points (closed, last = first)
   * @returns {number[]} - [cx, cy] centroid coordinates
   */
  computeCentroid(polygon) {
    let cx = 0, cy = 0;
    const n = polygon.length - 1; // Polygon is closed, last = first
    for (let i = 0; i < n; i++) {
      cx += polygon[i][0];
      cy += polygon[i][1];
    }
    return [cx / n, cy / n];
  }

  /**
   * Build Delaunay triangle data for the chunk
   * @param {Delaunay} delaunay - Delaunay triangulation
   * @param {Array} points - Array of [x, y] seed points
   * @param {number[]} bounds - [minX, minY, maxX, maxY] chunk bounds
   * @returns {Array} - Array of triangle data objects
   */
  buildTriangles(delaunay, points, bounds) {
    const triangleIndices = delaunay.triangles;
    const numTriangles = triangleIndices.length / 3;
    const triangles = [];
    const [minX, minY, maxX, maxY] = bounds;

    // Pre-compute elevation for all points (used for 3D vertex positions)
    const pointElevations = points.map(([x, y]) => getElevation(x, y));

    // Pre-compute AO for all points (valleys darker, ridges brighter)
    const pointAO = points.map(([x, y], i) =>
      this.computeVertexAO(x, y, pointElevations[i])
    );

    for (let t = 0; t < numTriangles; t++) {
      const i0 = triangleIndices[t * 3 + 0];
      const i1 = triangleIndices[t * 3 + 1];
      const i2 = triangleIndices[t * 3 + 2];

      // Get vertex positions with 3D elevation
      const v0 = { x: points[i0][0], y: points[i0][1], z: pointElevations[i0] * ELEVATION_SCALE };
      const v1 = { x: points[i1][0], y: points[i1][1], z: pointElevations[i1] * ELEVATION_SCALE };
      const v2 = { x: points[i2][0], y: points[i2][1], z: pointElevations[i2] * ELEVATION_SCALE };

      // Compute centroid (including z for 3D terrain)
      const centroid = {
        x: (v0.x + v1.x + v2.x) / 3,
        y: (v0.y + v1.y + v2.y) / 3,
        z: (v0.z + v1.z + v2.z) / 3
      };

      // Average elevation for biome determination (raw, not scaled)
      const avgElevation = (pointElevations[i0] + pointElevations[i1] + pointElevations[i2]) / 3;

      // Filter: only keep triangles whose centroid is within chunk bounds
      if (centroid.x < minX || centroid.x >= maxX ||
          centroid.y < minY || centroid.y >= maxY) {
        continue;
      }

      // Compute face normal from actual 3D geometry
      const faceNormal = this.computeFaceNormal(v0, v1, v2);

      // Sample moisture and detail at centroid for biome/color variation
      const moist = moisture(centroid.x, centroid.y);
      const det = detail(centroid.x, centroid.y);

      // Determine biome from average elevation (no neighbor context for triangles)
      const triangleBiome = biome(avgElevation, moist, null);

      // Get base color without hillshade (GPU will handle lighting)
      const variation = (det + 1) / 2;
      const baseColor = getBaseColor(triangleBiome, avgElevation, variation);

      triangles.push({
        indices: [i0, i1, i2],
        vertices: [v0, v1, v2],
        centroid,
        faceNormal,
        averageElevation: avgElevation,
        biome: triangleBiome,
        baseColor,  // Used by GPU lighting
        vertexAO: [pointAO[i0], pointAO[i1], pointAO[i2]]  // Per-vertex ambient occlusion
      });
    }

    // Compute per-vertex normals by averaging face normals of adjacent triangles
    // This enables smooth Gouraud shading
    const vertexNormals = new Map();  // pointIndex -> {nx, ny, nz}

    for (const tri of triangles) {
      const fn = tri.faceNormal;
      for (const idx of tri.indices) {
        if (!vertexNormals.has(idx)) {
          vertexNormals.set(idx, { nx: 0, ny: 0, nz: 0 });
        }
        const vn = vertexNormals.get(idx);
        vn.nx += fn.x;
        vn.ny += fn.y;
        vn.nz += fn.z;
      }
    }

    // Normalize averaged normals
    for (const [idx, vn] of vertexNormals) {
      const len = Math.sqrt(vn.nx * vn.nx + vn.ny * vn.ny + vn.nz * vn.nz);
      if (len > 0) {
        vn.nx /= len;
        vn.ny /= len;
        vn.nz /= len;
      }
    }

    // Add vertex normals to each triangle
    for (const tri of triangles) {
      tri.vertexNormals = tri.indices.map(idx => {
        const vn = vertexNormals.get(idx);
        return { x: vn.nx, y: vn.ny, z: vn.nz };
      });
    }

    return triangles;
  }

  /**
   * Compute face normal from three vertices using cross product
   * @param {{x: number, y: number, z: number}} v0 - First vertex
   * @param {{x: number, y: number, z: number}} v1 - Second vertex
   * @param {{x: number, y: number, z: number}} v2 - Third vertex
   * @returns {{x: number, y: number, z: number}} - Normalized face normal
   */
  computeFaceNormal(v0, v1, v2) {
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
}
