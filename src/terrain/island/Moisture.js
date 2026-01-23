/**
 * Moisture - BFS moisture propagation from water sources
 *
 * Moisture spreads inland from ocean and rivers with decay.
 * Per spec section 2.7.
 */

import { findRiverAdjacentRegions } from './Rivers.js';

/**
 * Propagate moisture from water sources inland via BFS
 *
 * Algorithm:
 * 1. Initialize: ocean=1.0, river-adjacent=0.8, others=0.0
 * 2. BFS propagation with decay
 * 3. Apply uphill penalty for rain shadow effect
 *
 * @param {Object[]} regions - Array of Region objects
 * @param {Object[]} edges - Array of Edge objects (with isRiver flags)
 * @param {Object} config - Moisture config
 * @param {number} [config.decay=0.9] - Moisture decay per step
 * @param {number} [config.uphillPenalty=0.7] - Extra decay going uphill
 * @param {number} [config.riverMoisture=0.8] - Initial moisture for river-adjacent
 */
export function propagateMoisture(regions, edges, config = {}) {
  const {
    decay = 0.9,
    uphillPenalty = 0.7,
    riverMoisture = 0.8
  } = config;

  // Find regions adjacent to rivers
  const riverAdjacent = findRiverAdjacentRegions(regions, edges);

  // 1. Initialize moisture values
  const queue = [];

  for (const region of regions) {
    if (region.isOcean) {
      region.moisture = 1.0;
      queue.push(region);
    } else if (region.isLake) {
      // Lakes are also water sources
      region.moisture = 1.0;
      queue.push(region);
    } else if (riverAdjacent.has(region.id)) {
      region.moisture = riverMoisture;
      queue.push(region);
    } else {
      region.moisture = 0.0;
    }
  }

  // 2. BFS propagation with decay
  // Use a simple array-based queue (shift/push)
  let head = 0;

  while (head < queue.length) {
    const region = queue[head++];

    // Process each neighbor
    for (const neighborId of region.neighbors) {
      if (neighborId < 0 || neighborId >= regions.length) continue;

      const neighbor = regions[neighborId];
      if (!neighbor || neighbor.isOcean || neighbor.isLake) continue;

      // Calculate decay factor
      let effectiveDecay = decay;

      // Apply uphill penalty (rain shadow effect)
      if (neighbor.elevation > region.elevation) {
        effectiveDecay *= uphillPenalty;
      }

      const newMoisture = region.moisture * effectiveDecay;

      // Only update if we found a wetter path
      if (newMoisture > neighbor.moisture) {
        neighbor.moisture = newMoisture;
        queue.push(neighbor);
      }
    }
  }

  // Clamp all moisture values to [0, 1]
  for (const region of regions) {
    region.moisture = Math.max(0, Math.min(1, region.moisture));
  }
}
