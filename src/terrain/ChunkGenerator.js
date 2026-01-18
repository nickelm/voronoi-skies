/**
 * Generates Voronoi terrain cells for a single chunk
 */
import { Delaunay } from 'd3-delaunay';
import { generateSeededPoints, createSeededRandom } from '../utils/seededRandom.js';
import { initNoise, sampleBiome, sampleElevation } from './noise.js';
import { getBiomeFromNoise, getCellColor } from './biomes.js';

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
      initNoise(this.worldSeed, this.worldSeed + 1000);
      this.noiseInitialized = true;
    }
  }

  /**
   * Generate Voronoi cells for a chunk
   * @param {Chunk} chunk - The chunk to generate cells for
   * @param {number} chunkSeed - Deterministic seed for this chunk
   * @param {number} cellCount - Number of cells to generate
   * @returns {Array} - Array of cell objects
   */
  generateChunk(chunk, chunkSeed, cellCount = 75) {
    // Ensure noise is initialized
    this.initializeNoise();

    const bounds = chunk.bounds;

    // Generate seed points within chunk bounds
    const points = generateSeededPoints(cellCount, chunkSeed, bounds);

    // Create Voronoi diagram for this chunk
    const delaunay = Delaunay.from(points);
    const voronoi = delaunay.voronoi(bounds);

    // Build cell data with biome/color
    const random = createSeededRandom(chunkSeed + 2000);

    const cells = points.map((point, index) => {
      const polygon = voronoi.cellPolygon(index);
      if (!polygon) return null;

      // Compute centroid (different from seed point)
      const centroid = this.computeCentroid(polygon);

      // Sample noise at centroid using world coordinates
      const biomeNoise = sampleBiome(centroid[0], centroid[1]);
      const elevation = sampleElevation(centroid[0], centroid[1]);

      // Determine biome and color
      const biome = getBiomeFromNoise(biomeNoise);
      const variation = random(); // Per-cell random for shade variation
      const color = getCellColor(biome, elevation, variation);

      return {
        index,
        seedPoint: point,
        centroid,
        polygon,
        biome,
        elevation,
        color
      };
    }).filter(c => c !== null);

    chunk.cells = cells;
    return cells;
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
}
