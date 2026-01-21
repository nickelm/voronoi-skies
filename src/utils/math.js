/**
 * Math utility functions
 */

/**
 * Smoothstep interpolation function
 * Returns 0 when x <= edge0, 1 when x >= edge1, and smoothly interpolates between
 * Uses Hermite interpolation (cubic) for smooth transitions without sharp corners
 *
 * @param {number} edge0 - Lower edge (returns 0 at or below this value)
 * @param {number} edge1 - Upper edge (returns 1 at or above this value)
 * @param {number} x - Value to interpolate
 * @returns {number} Smoothly interpolated value in [0, 1]
 */
export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
