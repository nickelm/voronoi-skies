/**
 * TerrainSampler - Utility for querying terrain elevation at any world position
 * Used for shadow projection and other systems that need terrain height data
 */

import { getElevation } from './noise.js';

// Elevation scale factor (matches TerrainWorker.js mesh generation)
const ELEVATION_SCALE = 400;

/**
 * Sample terrain elevation at a world position
 * Returns elevation scaled to match terrain mesh Z coordinates
 * @param {number} worldX - World X coordinate
 * @param {number} worldY - World Y coordinate
 * @returns {number} - Elevation matching terrain mesh Z scale
 */
export function sampleTerrainElevation(worldX, worldY) {
  const rawElevation = getElevation(worldX, worldY);
  return rawElevation * ELEVATION_SCALE;
}

/**
 * Get raw elevation value without scaling
 * @param {number} worldX - World X coordinate
 * @param {number} worldY - World Y coordinate
 * @returns {number} - Raw elevation in [-1, 1] range
 */
export function sampleRawElevation(worldX, worldY) {
  return getElevation(worldX, worldY);
}
