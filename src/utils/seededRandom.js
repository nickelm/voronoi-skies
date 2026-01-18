/**
 * Seeded random number generation using Mulberry32 algorithm
 */

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
