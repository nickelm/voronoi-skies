/**
 * Seeded noise functions for terrain generation
 */
import { createNoise2D } from 'simplex-noise';
import { createSeededRandom } from '../utils/seededRandom.js';

let biomeNoise = null;
let elevationNoise = null;

/**
 * Initialize noise functions with seeds
 * @param {number} biomeSeed - Seed for biome noise
 * @param {number} elevationSeed - Seed for elevation noise
 */
export function initNoise(biomeSeed, elevationSeed) {
  biomeNoise = createNoise2D(createSeededRandom(biomeSeed));
  elevationNoise = createNoise2D(createSeededRandom(elevationSeed));
}

/**
 * Sample biome noise at world coordinates
 * Returns value in range [-1, 1]
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Noise value in [-1, 1]
 */
export function sampleBiome(x, y) {
  const scale = 0.0008; // ~1250 unit features
  return biomeNoise(x * scale, y * scale);
}

/**
 * Sample elevation noise at world coordinates
 * Returns value in range [0, 1]
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Elevation value in [0, 1]
 */
export function sampleElevation(x, y) {
  const scale = 0.002; // Higher frequency for elevation variation
  return (elevationNoise(x * scale, y * scale) + 1) / 2;
}
