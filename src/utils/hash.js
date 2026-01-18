/**
 * Hash utilities for deterministic chunk seeding
 */

/**
 * Combine world seed with chunk coordinates for deterministic chunk seed
 * Uses a variant of the xxHash algorithm for good distribution
 * @param {number} worldSeed - Base world seed
 * @param {number} chunkX - Chunk X coordinate (integer)
 * @param {number} chunkY - Chunk Y coordinate (integer)
 * @returns {number} - Deterministic seed for this chunk
 */
export function hashChunkSeed(worldSeed, chunkX, chunkY) {
  let h = worldSeed;
  h = Math.imul(h ^ (chunkX * 374761393), 2654435761);
  h = Math.imul(h ^ (chunkY * 668265263), 2654435761);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Hash a grid cell position for deterministic jittered point placement
 * Uses same algorithm as hashChunkSeed but with additional mixing
 * @param {number} worldSeed - Base world seed
 * @param {number} gx - Grid X coordinate (integer)
 * @param {number} gy - Grid Y coordinate (integer)
 * @returns {number} - 32-bit unsigned hash value
 */
export function hashGridCell(worldSeed, gx, gy) {
  let h = worldSeed;
  h = Math.imul(h ^ (gx * 374761393), 2654435761);
  h = Math.imul(h ^ (gy * 668265263), 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0);
}
