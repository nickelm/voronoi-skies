/**
 * IslandGenerator - Main API for generating island graphs
 *
 * Orchestrates the full pipeline: point distribution → Voronoi construction
 * → elevation assignment → ocean/land classification → coastline marking
 */

import { Delaunay } from 'd3-delaunay';
import { generatePoints, generateBoundaryPoints } from './PointDistribution.js';
import { IslandGraph } from './IslandGraph.js';
import { initIslandNoise, sampleIslandElevation, sampleShapeNoise } from './IslandNoise.js';
import { generateRivers } from './Rivers.js';
import { propagateMoisture } from './Moisture.js';
import { assignBiomes } from './BiomeClassifier.js';

/**
 * Island mask function - boosts interior, forces ocean at boundary
 * Uses angular noise to create organic, non-circular coastlines
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @param {number[]} center - Island center [x, y]
 * @param {number} radius - Island radius
 * @param {number} shapeVariation - How much the radius varies (0-0.4)
 * @param {number} interiorBoost - Elevation boost at center (default 0.25)
 * @param {number} falloffStart - Where edge falloff begins (default 0.7)
 * @returns {number} Elevation modifier [-1, +interiorBoost]
 */
function islandMask(x, y, center, radius, shapeVariation = 0.3, interiorBoost = 0.25, falloffStart = 0.7) {
  const dx = x - center[0];
  const dy = y - center[1];
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Use angle to sample shape noise - creates consistent coastline shape
  const angle = Math.atan2(dy, dx);
  // Sample noise in a circle to avoid seam at angle wrap
  const nx = Math.cos(angle) * 2;
  const ny = Math.sin(angle) * 2;
  // FBm shape noise for organic coastlines
  const shape = sampleShapeNoise(nx, ny);

  // Vary effective radius based on angle (shape noise)
  const effectiveRadius = radius * (1 + shape * shapeVariation);
  const d = dist / effectiveRadius;

  if (d > 1.0) return -1.0;      // Deep ocean beyond radius

  // Interior: boost at center, linear taper to 0 at falloffStart
  if (d < falloffStart) {
    return interiorBoost * (1 - d / falloffStart);
  }

  // Edge: smooth falloff from 0 to -0.8
  const t = (d - falloffStart) / (1.0 - falloffStart);
  const smoothT = t * t * (3 - 2 * t);  // smoothstep
  return -smoothT * 0.8;
}

/**
 * Compute centroid of a polygon
 * @param {number[][]} polygon - Closed polygon (last = first)
 * @returns {number[]} [x, y] centroid
 */
function computeCentroid(polygon) {
  if (!polygon || polygon.length < 3) return [0, 0];

  let cx = 0, cy = 0, area = 0;

  for (let i = 0; i < polygon.length - 1; i++) {
    const x0 = polygon[i][0];
    const y0 = polygon[i][1];
    const x1 = polygon[i + 1][0];
    const y1 = polygon[i + 1][1];

    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  area *= 0.5;

  if (Math.abs(area) < 1e-10) {
    // Fallback: simple average
    let sumX = 0, sumY = 0;
    for (let i = 0; i < polygon.length - 1; i++) {
      sumX += polygon[i][0];
      sumY += polygon[i][1];
    }
    return [sumX / (polygon.length - 1), sumY / (polygon.length - 1)];
  }

  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

/**
 * Generate an island graph from configuration
 * @param {Object} config
 * @param {number} config.seed - World seed
 * @param {number} [config.radius=15000] - Island radius in meters
 * @param {number} [config.regionCount=2000] - Number of regions
 * @param {number} [config.lloydIterations=2] - Relaxation passes
 * @param {number[]} [config.center=[0,0]] - Island center point
 * @param {number} [config.interiorBoost=0.35] - Elevation boost at center (0.0-0.5)
 * @param {number} [config.noiseAmplitude=0.4] - Noise amplitude (0.3-0.5)
 * @param {number} [config.noiseFrequency=0.00008] - Noise frequency for FastNoiseLite
 * @param {number} [config.falloffStart=0.7] - Where edge falloff begins (0.6-0.8)
 * @param {number} [config.shapeVariation=0.3] - Coastline irregularity (0.0-0.5)
 * @param {number} [config.noiseOctaves=4] - FBm octave count
 * @param {number} [config.noiseLacunarity=2.0] - Frequency multiplier per octave
 * @param {number} [config.noiseGain=0.5] - Amplitude multiplier per octave
 * @param {boolean} [config.domainWarpEnabled=false] - Enable domain warping for organic coastlines
 * @param {number} [config.domainWarpAmplitude=1524] - Warp amplitude in meters (~5000 feet)
 * @param {number} [config.domainWarpFrequency=0.00004] - Warp frequency
 * @param {Object} [config.rivers] - River generation config
 * @param {number} [config.rivers.rainfall=1.0] - Rainfall per corner
 * @param {number} [config.rivers.threshold=50] - Flow threshold for river marking
 * @param {Object} [config.moisture] - Moisture propagation config
 * @param {number} [config.moisture.decay=0.9] - Moisture decay per step
 * @param {number} [config.moisture.uphillPenalty=0.7] - Extra decay going uphill
 * @param {number} [config.moisture.riverMoisture=0.8] - Initial moisture for river-adjacent
 * @param {string} [config.biomeConfig='tropical'] - Biome preset name
 * @returns {IslandGraph}
 */
export function generate(config) {
  const startTime = performance.now();

  const {
    seed,
    radius = 15000,
    regionCount = 2000,
    lloydIterations = 2,
    center = [0, 0],
    // Elevation tuning parameters
    interiorBoost = 0.35,
    noiseAmplitude = 0.4,
    noiseFrequency = 0.00008,
    falloffStart = 0.7,
    shapeVariation = 0.3,
    // FastNoiseLite parameters
    noiseOctaves = 4,
    noiseLacunarity = 2.0,
    noiseGain = 0.5,
    domainWarpEnabled = false,
    domainWarpAmplitude = 1524,   // ~5000 feet in meters
    domainWarpFrequency = 0.00004,
    // Phase 1: Rivers, moisture, biomes
    rivers = {},
    moisture = {},
    biomeConfig = 'tropical'
  } = config;

  // 1. Generate interior points with Lloyd relaxation
  const interiorPoints = generatePoints({
    seed,
    count: regionCount,
    radius: radius * 0.95,  // Slightly inside to ensure boundary points are outermost
    lloydIterations,
    center
  });

  // 2. Add boundary points (will be forced to ocean)
  const boundaryCount = Math.floor(regionCount * 0.1);  // ~10% boundary points
  const boundaryPoints = generateBoundaryPoints(boundaryCount, radius, center);

  // Mark which indices are boundary points
  const boundaryStartIndex = interiorPoints.length;
  const allPoints = [...interiorPoints, ...boundaryPoints];

  // 3. Build Voronoi diagram
  const margin = radius * 0.15;
  const bounds = [
    center[0] - radius - margin,
    center[1] - radius - margin,
    center[0] + radius + margin,
    center[1] + radius + margin
  ];

  const delaunay = Delaunay.from(allPoints);
  const voronoi = delaunay.voronoi(bounds);

  // 4. Initialize noise functions (elevation + shape via FastNoiseLite)
  initIslandNoise(seed + 8000, {
    elevation: {
      frequency: noiseFrequency,
      octaves: noiseOctaves,
      lacunarity: noiseLacunarity,
      gain: noiseGain
    },
    domainWarp: {
      enabled: domainWarpEnabled,
      amplitude: domainWarpAmplitude,
      frequency: domainWarpFrequency
    }
  });

  // 5. Extract corners (Voronoi vertices)
  const corners = [];
  const cornerMap = new Map();  // position string → corner ID

  function getOrCreateCorner(x, y) {
    // Round to avoid floating point key issues
    const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
    if (cornerMap.has(key)) {
      return cornerMap.get(key);
    }

    const corner = {
      id: corners.length,
      position: [x, y],
      elevation: 0,  // Will be computed later
      adjacentRegions: []
    };

    cornerMap.set(key, corner.id);
    corners.push(corner);
    return corner.id;
  }

  // 6. Extract regions
  const regions = [];
  const regionEdges = [];  // Track edges per region for later

  for (let i = 0; i < allPoints.length; i++) {
    const polygon = voronoi.cellPolygon(i);

    if (!polygon || polygon.length < 3) {
      // Degenerate cell - create minimal placeholder
      regions.push({
        id: i,
        centroid: [...allPoints[i]],
        vertices: [],
        elevation: -1,  // Ocean
        isOcean: true,
        neighbors: [],
        isBoundary: i >= boundaryStartIndex
      });
      regionEdges.push([]);
      continue;
    }

    const centroid = computeCentroid(polygon);
    const isBoundary = i >= boundaryStartIndex;

    // Extract corner IDs for this region
    const regionCornerIds = [];
    for (let j = 0; j < polygon.length - 1; j++) {
      const cornerId = getOrCreateCorner(polygon[j][0], polygon[j][1]);
      regionCornerIds.push(cornerId);
      corners[cornerId].adjacentRegions.push(i);
    }

    regions.push({
      id: i,
      centroid,
      vertices: polygon,
      elevation: 0,  // Will be computed
      isOcean: false,
      neighbors: [],
      isBoundary,
      cornerIds: regionCornerIds
    });
    regionEdges.push([]);
  }

  // 7. Assign corner elevations
  for (const corner of corners) {
    const [x, y] = corner.position;
    const mask = islandMask(x, y, center, radius, shapeVariation, interiorBoost, falloffStart);
    const noise = sampleIslandElevation(x, y) * noiseAmplitude;
    corner.elevation = noise + mask;
  }

  // 8. Compute region elevations (average of corners)
  for (const region of regions) {
    if (!region.cornerIds || region.cornerIds.length === 0) {
      region.elevation = -1;
      region.isOcean = true;
      continue;
    }

    // Boundary regions are forced to ocean
    if (region.isBoundary) {
      region.elevation = -0.8;
      region.isOcean = true;
      continue;
    }

    // Blend average and max to preserve peaks while keeping some smoothness
    let sum = 0;
    let maxElev = -Infinity;
    for (const cornerId of region.cornerIds) {
      const elev = corners[cornerId].elevation;
      sum += elev;
      if (elev > maxElev) maxElev = elev;
    }
    const avgElev = sum / region.cornerIds.length;
    // 60% average, 40% max - preserves peaks on land
    region.elevation = avgElev * 0.6 + maxElev * 0.4;
    region.isOcean = region.elevation < 0;
  }

  // 9. Build neighbor lists using Delaunay adjacency
  for (let i = 0; i < regions.length; i++) {
    const neighborIds = [];
    for (const j of delaunay.neighbors(i)) {
      neighborIds.push(j);
    }
    regions[i].neighbors = neighborIds;
  }

  // 10. Build edges
  const edges = [];
  const edgeMap = new Map();  // "minId,maxId" → edge index

  function getEdgeKey(r1, r2) {
    return r1 < r2 ? `${r1},${r2}` : `${r2},${r1}`;
  }

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if (!region.cornerIds || region.cornerIds.length < 2) continue;

    for (let j = 0; j < region.cornerIds.length; j++) {
      const c1 = region.cornerIds[j];
      const c2 = region.cornerIds[(j + 1) % region.cornerIds.length];

      // Find the other region sharing this edge
      // Look for a neighbor that shares both corners
      let otherRegion = -1;
      for (const neighborId of region.neighbors) {
        const neighbor = regions[neighborId];
        if (!neighbor.cornerIds) continue;

        const hasC1 = neighbor.cornerIds.includes(c1);
        const hasC2 = neighbor.cornerIds.includes(c2);
        if (hasC1 && hasC2) {
          otherRegion = neighborId;
          break;
        }
      }

      const edgeKey = getEdgeKey(i, otherRegion);
      if (!edgeMap.has(edgeKey)) {
        const r1Ocean = regions[i].isOcean;
        const r2Ocean = otherRegion >= 0 ? regions[otherRegion].isOcean : true;

        const edge = {
          id: edges.length,
          regions: [i, otherRegion],
          corners: [c1, c2],
          isCoastline: r1Ocean !== r2Ocean
        };

        edgeMap.set(edgeKey, edge.id);
        edges.push(edge);
        regionEdges[i].push(edge.id);
        if (otherRegion >= 0) {
          regionEdges[otherRegion].push(edge.id);
        }
      }
    }
  }

  // 11. Generate rivers (drainage network)
  generateRivers(corners, edges, regions, rivers);
  const riverCount = edges.filter(e => e.isRiver).length;

  // 12. Propagate moisture from water sources
  propagateMoisture(regions, edges, moisture);

  // 13. Assign biomes based on elevation and moisture
  assignBiomes(regions, biomeConfig);

  // 14. Clean up temporary properties from regions
  for (const region of regions) {
    delete region.cornerIds;
    delete region.isBoundary;
  }

  // 15. Build the graph
  const graph = new IslandGraph();
  graph.regions = regions;
  graph.edges = edges;
  graph.corners = corners;
  graph.buildCaches();

  // Log generation stats
  const elapsed = performance.now() - startTime;
  const landCount = regions.filter(r => !r.isOcean).length;
  const coastCount = edges.filter(e => e.isCoastline).length;

  console.log(`Island generated in ${elapsed.toFixed(1)}ms:`);
  console.log(`  Regions: ${regions.length} (${landCount} land, ${regions.length - landCount} ocean)`);
  console.log(`  Edges: ${edges.length} (${coastCount} coastline, ${riverCount} river)`);
  console.log(`  Corners: ${corners.length}`);
  console.log(`  Land ratio: ${(landCount / regions.length * 100).toFixed(1)}%`);

  return graph;
}
