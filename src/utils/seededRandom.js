/**
 * Seeded random number generation using Mulberry32 algorithm
 */
import { hashGridCell } from './hash.js';

/**
 * Creates a seeded random number generator using Mulberry32
 * @param {number} seed - Integer seed value
 * @returns {function} - Returns random float in [0, 1)
 */
export function createSeededRandom(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate random points within bounds using seeded RNG
 * @param {number} count - Number of points
 * @param {number} seed - Random seed
 * @param {Array} bounds - [minX, minY, maxX, maxY]
 * @returns {Array} - Array of [x, y] coordinate pairs
 */
export function generateSeededPoints(count, seed, bounds) {
  const random = createSeededRandom(seed);
  const [minX, minY, maxX, maxY] = bounds;
  const width = maxX - minX;
  const height = maxY - minY;

  const points = [];
  for (let i = 0; i < count; i++) {
    points.push([
      minX + random() * width,
      minY + random() * height
    ]);
  }
  return points;
}

/**
 * Generate points on a jittered grid with deterministic positioning
 * Points are placed on a regular grid with hash-based jitter offsets.
 * This ensures adjacent chunks generate identical points in overlapping regions.
 *
 * @param {number} worldSeed - World seed for deterministic hashing
 * @param {Array} bounds - [minX, minY, maxX, maxY] chunk bounds
 * @param {number} spacing - Grid spacing (distance between grid cell centers)
 * @param {number} margin - Extra area beyond bounds to generate points for seamless edges
 * @returns {Array} - Array of [x, y] coordinate pairs in world space
 */
export function generateJitteredGridPoints(worldSeed, bounds, spacing, margin = 0) {
  const [minX, minY, maxX, maxY] = bounds;

  // Extended bounds include margin for seamless chunk boundaries
  const extMinX = minX - margin;
  const extMinY = minY - margin;
  const extMaxX = maxX + margin;
  const extMaxY = maxY + margin;

  // Compute grid cell indices to iterate
  const gxMin = Math.floor(extMinX / spacing);
  const gxMax = Math.floor(extMaxX / spacing);
  const gyMin = Math.floor(extMinY / spacing);
  const gyMax = Math.floor(extMaxY / spacing);

  const points = [];
  const jitterMax = spacing * 0.4; // 80% of cell width total, leaves buffer to prevent overlap

  for (let gx = gxMin; gx <= gxMax; gx++) {
    for (let gy = gyMin; gy <= gyMax; gy++) {
      // Deterministic hash for this grid cell (same result regardless of which chunk generates it)
      const hash = hashGridCell(worldSeed, gx, gy);

      // Convert hash to jitter offsets in [-jitterMax, +jitterMax]
      // Use different bits of hash for X and Y to avoid correlation
      const jitterX = ((hash & 0xFFFF) / 0xFFFF) * 2 * jitterMax - jitterMax;
      const jitterY = (((hash >> 16) & 0xFFFF) / 0xFFFF) * 2 * jitterMax - jitterMax;

      // Point position: grid cell center + jitter
      const px = gx * spacing + spacing / 2 + jitterX;
      const py = gy * spacing + spacing / 2 + jitterY;

      points.push([px, py]);
    }
  }

  return points;
}
