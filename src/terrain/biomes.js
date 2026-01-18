/**
 * Biome definitions and color palettes for terrain
 * Uses continental, elevation, and moisture noise for biome determination
 */

import { LightingConfig, applyHillshadeToColor } from './lighting.js';

export const Biome = {
  // Water biomes
  DEEP_OCEAN: 0,
  SHALLOW_WATER: 1,

  // Coastal
  BEACH: 2,

  // Low elevation land
  PLAINS: 3,
  GRASSLAND: 4,

  // Medium elevation land
  SHRUBLAND: 5,
  FOREST: 6,

  // Medium-high elevation land
  HIGHLAND: 7,
  DENSE_FOREST: 8,

  // High elevation
  MOUNTAIN: 9,
  SNOW: 10,

  // @deprecated - kept for backward compatibility
  OCEAN: 11,
  SHALLOW_OCEAN: 12,
  ROCKY_COAST: 13,
  MARSH: 14,
  DESERT: 15,
  SAVANNA: 16,
  ALPINE: 17,
  TUNDRA: 18,
  SNOW_PEAKS: 19
};

// Each biome has 3 shade variations for visual variety
export const BiomeColors = {
  // Water biomes
  [Biome.DEEP_OCEAN]:    [0x0a2463, 0x0e306b, 0x123c73],
  [Biome.SHALLOW_WATER]: [0x1e5f8a, 0x2570a0, 0x2c81b6],

  // Coastal
  [Biome.BEACH]:         [0xc9b896, 0xd4c4a8, 0xdfd0ba],

  // Low elevation land
  [Biome.PLAINS]:        [0x9a8855, 0xa89560, 0xb6a26b],
  [Biome.GRASSLAND]:     [0x7a9f5f, 0x8aaf6f, 0x9abf7f],

  // Medium elevation land
  [Biome.SHRUBLAND]:     [0x5a7a4a, 0x658855, 0x709660],
  [Biome.FOREST]:        [0x2d5a27, 0x376b30, 0x417c39],

  // Medium-high elevation land
  [Biome.HIGHLAND]:      [0x8a9a8a, 0x95a595, 0xa0b0a0],
  [Biome.DENSE_FOREST]:  [0x1a4a1a, 0x245524, 0x2e602e],

  // High elevation
  [Biome.MOUNTAIN]:      [0x6b6b6b, 0x7a7a7a, 0x898989],
  [Biome.SNOW]:          [0xd0d8d5, 0xdae2df, 0xe4ece9],

  // @deprecated - colors for backward compatibility
  [Biome.OCEAN]:         [0x1a4a7a, 0x1e5485, 0x225e90],
  [Biome.SHALLOW_OCEAN]: [0x1e5f8a, 0x2570a0, 0x2c81b6],
  [Biome.ROCKY_COAST]:   [0x6b6b6b, 0x7a7a7a, 0x898989],
  [Biome.MARSH]:         [0x3a5f4a, 0x446b54, 0x4e775e],
  [Biome.DESERT]:        [0xc2a566, 0xccb070, 0xd6bb7a],
  [Biome.SAVANNA]:       [0x9a8855, 0xa89560, 0xb6a26b],
  [Biome.ALPINE]:        [0x8a9a8a, 0x95a595, 0xa0b0a0],
  [Biome.TUNDRA]:        [0x9ab0a5, 0xa5bbaf, 0xb0c6ba],
  [Biome.SNOW_PEAKS]:    [0xd0d8d5, 0xdae2df, 0xe4ece9]
};

// Elevation thresholds for biome lookup table
const ELEV_DEEP_OCEAN = -0.3;
const ELEV_WATER = 0;
const ELEV_BEACH = 0.05;
const ELEV_LOW = 0.3;
const ELEV_MEDIUM = 0.5;
const ELEV_HIGH = 0.7;
const ELEV_MOUNTAIN = 0.85;

// Moisture threshold: below = low, above = high
const MOISTURE_THRESHOLD = 0.5;

/**
 * Check if any neighbor is water (elevation < 0)
 * @param {Object} neighbors - Neighbor data object
 * @param {number[]} neighbors.elevations - Array of neighbor cell elevations
 * @returns {boolean} - True if at least one neighbor is water
 */
function hasWaterNeighbor(neighbors) {
  if (!neighbors || !neighbors.elevations || neighbors.elevations.length === 0) {
    return false;
  }
  return neighbors.elevations.some(e => e < ELEV_WATER);
}

/**
 * Determine biome from elevation and moisture with neighbor context
 * Uses lookup table approach with elevation thresholds
 * @param {number} elevation - Elevation value [-1, 1]
 * @param {number} moisture - Moisture value [0, 1]
 * @param {Object} neighbors - Neighbor elevation data (optional)
 * @param {number[]} neighbors.elevations - Array of neighbor cell elevations
 * @returns {number} - Biome enum value
 */
export function biome(elevation, moisture, neighbors = null) {
  // Deep ocean: elev < -0.3
  if (elevation < ELEV_DEEP_OCEAN) {
    return Biome.DEEP_OCEAN;
  }

  // Shallow water: -0.3 to 0
  if (elevation < ELEV_WATER) {
    return Biome.SHALLOW_WATER;
  }

  // Beach zone: 0 to 0.05, but ONLY if neighbors water
  if (elevation < ELEV_BEACH) {
    if (hasWaterNeighbor(neighbors)) {
      return Biome.BEACH;
    }
    // Not adjacent to water - treat as low elevation land
    return moisture < MOISTURE_THRESHOLD ? Biome.PLAINS : Biome.GRASSLAND;
  }

  // Low elevation: 0.05 to 0.3
  if (elevation < ELEV_LOW) {
    return moisture < MOISTURE_THRESHOLD ? Biome.PLAINS : Biome.GRASSLAND;
  }

  // Medium elevation: 0.3 to 0.5
  if (elevation < ELEV_MEDIUM) {
    return moisture < MOISTURE_THRESHOLD ? Biome.SHRUBLAND : Biome.FOREST;
  }

  // Medium-high elevation: 0.5 to 0.7
  if (elevation < ELEV_HIGH) {
    return moisture < MOISTURE_THRESHOLD ? Biome.HIGHLAND : Biome.DENSE_FOREST;
  }

  // High elevation: 0.7 to 0.85
  if (elevation < ELEV_MOUNTAIN) {
    return Biome.MOUNTAIN;
  }

  // Snow: > 0.85
  return Biome.SNOW;
}

/**
 * @deprecated Use biome(elevation, moisture, neighbors) instead
 * Determine biome from continental, elevation, and moisture values
 * Note: Beach detection won't work correctly without neighbor data
 * @param {number} cont - Continental value [-1, 1] (negative = ocean)
 * @param {number} elev - Elevation value [-1, 1]
 * @param {number} moist - Moisture value [0, 1]
 * @returns {number} - Biome enum value
 */
export function getBiome(cont, elev, moist) {
  // Map continental noise to elevation-based ocean detection
  // Continental < -0.2 meant ocean in old system
  if (cont < -0.2) {
    if (cont < -0.5) return Biome.DEEP_OCEAN;
    return Biome.SHALLOW_WATER;
  }

  // For land, use elevation directly with new function
  // No neighbor data available - beach won't work correctly
  return biome(elev, moist, null);
}

/**
 * Get final color for a cell
 * @param {number} biome - Biome enum value
 * @param {number} elev - Elevation value [-1, 1]
 * @param {number} variation - Random variation seed [0, 1)
 * @param {number} hillshade - Hillshade value [0, 1], 1 = fully lit, 0 = in shadow
 * @returns {number} - RGB hex color
 */
export function getCellColor(biome, elev, variation, hillshade = 0.5) {
  const colors = BiomeColors[biome];
  if (!colors) return 0xFF00FF; // Magenta for missing biome (debug)

  // Use variation to select base shade (0, 1, or 2)
  const shadeIndex = Math.floor(variation * 3) % 3;
  let baseColor = colors[shadeIndex];

  // Normalize elevation from [-1, 1] to [0, 1] for shading
  const normalizedElev = (elev + 1) / 2;

  // Apply subtle elevation tint (higher = slightly lighter base)
  // This is independent of directional lighting
  const elevationTint = normalizedElev * 0.08; // Max 8% lightening from elevation

  // Apply elevation tint to base color
  const r = ((baseColor >> 16) & 0xFF);
  const g = ((baseColor >> 8) & 0xFF);
  const b = (baseColor & 0xFF);

  const tintedR = Math.min(255, r + Math.floor((255 - r) * elevationTint));
  const tintedG = Math.min(255, g + Math.floor((255 - g) * elevationTint));
  const tintedB = Math.min(255, b + Math.floor((255 - b) * elevationTint));

  const tintedColor = (tintedR << 16) | (tintedG << 8) | tintedB;

  // Apply hillshade lighting using the lighting module
  // This handles ambient, intensity, and light color
  return applyHillshadeToColor(tintedColor, hillshade, LightingConfig);
}

// ============================================
// DEPRECATED: Backward compatibility
// ============================================

/**
 * @deprecated Use biome(elevation, moisture, neighbors) instead
 * Get biome from single noise value
 * @param {number} noiseValue - Value in range [-1, 1]
 * @returns {number} - Biome enum value
 */
export function getBiomeFromNoise(noiseValue) {
  // Approximate old behavior: treat noise as continental
  // Use neutral elevation (0) and mid moisture (0.5)
  return getBiome(noiseValue, 0, 0.5);
}
