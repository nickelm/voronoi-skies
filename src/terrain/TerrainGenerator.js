/**
 * Generates Voronoi terrain cells with biome assignment
 */
import { Delaunay } from 'd3-delaunay';
import { generateSeededPoints, createSeededRandom } from '../utils/seededRandom.js';
import { initNoise, sampleBiome, sampleElevation } from './noise.js';
import { getBiomeFromNoise, getCellColor } from './biomes.js';

export class TerrainGenerator {
  /**
   * @param {Object} config
   * @param {number[]} config.worldBounds - [minX, minY, maxX, maxY]
   * @param {number} config.cellCount - Number of Voronoi cells
   * @param {number} config.seed - Random seed for reproducibility
   */
  constructor(config = {}) {
    this.worldBounds = config.worldBounds || [0, 0, 4000, 4000];
    this.cellCount = config.cellCount || 300;
    this.worldSeed = config.seed || 12345;

    this.cells = [];
    this.voronoi = null;
  }

  /**
   * Generate terrain cells
   * @returns {Array} - Array of cell objects
   */
  generate() {
    // Initialize noise with derived seeds
    initNoise(this.worldSeed, this.worldSeed + 1000);

    // Generate seed points
    const points = generateSeededPoints(
      this.cellCount,
      this.worldSeed,
      this.worldBounds
    );

    // Create Voronoi diagram
    const delaunay = Delaunay.from(points);
    this.voronoi = delaunay.voronoi(this.worldBounds);

    // Build cell data
    const random = createSeededRandom(this.worldSeed + 2000);

    this.cells = points.map((point, index) => {
      const polygon = this.voronoi.cellPolygon(index);
      if (!polygon) return null;

      // Compute centroid (different from seed point)
      const centroid = this.computeCentroid(polygon);

      // Sample noise at centroid
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

    return this.cells;
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
   * Get generated cells
   * @returns {Array} - Array of cell objects
   */
  getCells() {
    return this.cells;
  }
}
