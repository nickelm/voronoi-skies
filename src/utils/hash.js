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
