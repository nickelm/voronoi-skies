/**
 * Biome definitions and color palettes for terrain
 * Uses zone classification, elevation, and moisture noise for biome determination
 */

import { LightingConfig, applyHillshadeToColor } from './lighting.js';
import { Zone } from './noise.js';

export const Biome = {
  // Water biomes
  DEEP_OCEAN: 0,
  OCEAN: 11,         // Medium depth ocean
  SHALLOW_WATER: 1,

  // Coastal
  BEACH: 2,

  // Low elevation land
  DESERT: 15,        // Dry low elevation
  PLAINS: 3,         // Moderate moisture low elevation
  GRASSLAND: 4,      // Wet low elevation

  // Medium elevation land
  SHRUBLAND: 5,      // Dry medium elevation
  FOREST: 6,         // Moderate-wet medium elevation

  // Medium-high elevation land
  HIGHLAND: 7,       // Dry high elevation
  DENSE_FOREST: 8,   // Wet high elevation

  // High elevation
  MOUNTAIN: 9,
  SNOW: 10,

  // @deprecated - kept for backward compatibility only
  SHALLOW_OCEAN: 12,
  ROCKY_COAST: 13,
  MARSH: 14,
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

// Elevation thresholds for biome lookup table (from specification)
const ELEV_DEEP_OCEAN = -0.4;  // Below = deep ocean
const ELEV_OCEAN = -0.1;       // -0.4 to -0.1 = ocean
const ELEV_WATER = 0;          // -0.1 to 0 = shallow water
const ELEV_BEACH = 0.08;       // 0 to 0.08 = beach
const ELEV_LOW = 0.25;         // 0.08 to 0.25 = low land
const ELEV_MEDIUM = 0.45;      // 0.25 to 0.45 = medium land
const ELEV_HIGH = 0.65;        // 0.45 to 0.65 = high land
const ELEV_MOUNTAIN = 0.8;     // 0.65 to 0.8 = mountain, above = snow

// Moisture thresholds: 3 bands (dry, moderate, wet)
const MOISTURE_LOW = 0.3;      // Below = dry
const MOISTURE_MID = 0.6;      // 0.3 to 0.6 = moderate, above = wet

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
 * Determine biome from elevation and moisture
 * Uses lookup table approach matching the biome specification table
 * @param {number} elevation - Elevation value [-1, 1]
 * @param {number} moisture - Moisture value [0, 1]
 * @param {Object} neighbors - Neighbor elevation data (unused, kept for API compatibility)
 * @returns {number} - Biome enum value
 */
export function biome(elevation, moisture, neighbors = null) {
  // Deep ocean: elev < -0.4
  if (elevation < ELEV_DEEP_OCEAN) {
    return Biome.DEEP_OCEAN;
  }

  // Ocean: -0.4 to -0.1
  if (elevation < ELEV_OCEAN) {
    return Biome.OCEAN;
  }

  // Shallow water: -0.1 to 0
  if (elevation < ELEV_WATER) {
    return Biome.SHALLOW_WATER;
  }

  // Beach: 0 to 0.08 (no neighbor check required)
  if (elevation < ELEV_BEACH) {
    return Biome.BEACH;
  }

  // Low elevation: 0.08 to 0.25
  if (elevation < ELEV_LOW) {
    if (moisture < MOISTURE_LOW) return Biome.DESERT;
    if (moisture < MOISTURE_MID) return Biome.PLAINS;
    return Biome.GRASSLAND;
  }

  // Medium elevation: 0.25 to 0.45
  if (elevation < ELEV_MEDIUM) {
    if (moisture < MOISTURE_LOW) return Biome.SHRUBLAND;
    if (moisture < MOISTURE_MID) return Biome.GRASSLAND;
    return Biome.FOREST;
  }

  // Medium-high elevation: 0.45 to 0.65
  if (elevation < ELEV_HIGH) {
    if (moisture < MOISTURE_LOW) return Biome.HIGHLAND;
    if (moisture < MOISTURE_MID) return Biome.FOREST;
    return Biome.DENSE_FOREST;
  }

  // Mountain: 0.65 to 0.8
  if (elevation < ELEV_MOUNTAIN) {
    return Biome.MOUNTAIN;
  }

  // Snow: > 0.8
  return Biome.SNOW;
}

/**
 * Determine biome from zone and elevation
 * Zone-aware approach: water zones ignore moisture, land zones use elevation/moisture lookup
 * @param {number} zone - Zone enum from classifyZone()
 * @param {number} elevation - Elevation value from computeElevation()
 * @param {number} moisture - Moisture value [0, 1] (only used for land zones)
 * @returns {number} - Biome enum value
 */
export function biomeFromZone(zone, elevation, moisture) {
  // Water zones: use zone directly for biome
  if (zone === Zone.DEEP_OCEAN) {
    return Biome.DEEP_OCEAN;
  }

  if (zone === Zone.OCEAN) {
    // Could subdivide further based on elevation if desired
    return elevation < -0.4 ? Biome.DEEP_OCEAN : Biome.OCEAN;
  }

  // Coastal zone: beach, shallow water, or low land
  if (zone === Zone.COASTAL) {
    if (elevation < 0) {
      return Biome.SHALLOW_WATER;
    }
    if (elevation < ELEV_BEACH) {
      return Biome.BEACH;
    }
    // Low coastal land - use moisture for variety
    if (moisture < MOISTURE_LOW) return Biome.PLAINS;
    if (moisture < MOISTURE_MID) return Biome.GRASSLAND;
    return Biome.GRASSLAND;
  }

  // Inland zone: full elevation/moisture lookup
  return biome(elevation, moisture, null);
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
 * Get base color for a cell (without hillshade applied)
 * Used for GPU-based lighting where Three.js handles shading
 * @param {number} biome - Biome enum value
 * @param {number} elev - Elevation value [-1, 1]
 * @param {number} variation - Random variation seed [0, 1)
 * @returns {number} - RGB hex color
 */
export function getBaseColor(biome, elev, variation) {
  const colors = BiomeColors[biome];
  if (!colors) return 0xFF00FF; // Magenta for missing biome (debug)

  // Use variation to select base shade (0, 1, or 2)
  const shadeIndex = Math.floor(variation * 3) % 3;
  let baseColor = colors[shadeIndex];

  // Continuous subtle variation using fractional part of variation
  // This creates smooth variation within each discrete shade
  const fractionalVariation = (variation * 3) % 1;  // 0 to 1 within shade
  const variationRange = 0.06;  // +/- 6% lightness variation
  const variationOffset = (fractionalVariation - 0.5) * 2 * variationRange;

  // Normalize elevation from [-1, 1] to [0, 1] for shading
  const normalizedElev = (elev + 1) / 2;

  // Apply subtle elevation tint (higher = slightly lighter base)
  // This is independent of directional lighting
  const elevationTint = normalizedElev * 0.08; // Max 8% lightening from elevation

  // Combined adjustment: elevation tint (always positive) + variation (can be negative)
  const adjustment = elevationTint + variationOffset;

  // Extract RGB components
  const r = ((baseColor >> 16) & 0xFF);
  const g = ((baseColor >> 8) & 0xFF);
  const b = (baseColor & 0xFF);

  // Apply adjustment to each channel
  const adjustColor = (c, adj) => {
    if (adj >= 0) {
      return Math.min(255, c + Math.floor((255 - c) * adj));
    } else {
      return Math.max(0, c + Math.floor(c * adj));
    }
  };

  let finalR = adjustColor(r, adjustment);
  let finalG = adjustColor(g, adjustment);
  let finalB = adjustColor(b, adjustment);

  // Apply underwater depth darkening
  if (elev < 0) {
    // Smoothstep from 0 at surface to 1 at deep (-0.5)
    const depthFactor = Math.min(1, Math.max(0, -elev / 0.5));
    // Water tint color (dark blue-green)
    const waterTint = { r: 26, g: 77, b: 102 };  // ~0x1a4d66

    // Mix base color toward water tint (70% max blend at max depth)
    const blend = depthFactor * 0.7;
    finalR = Math.round(finalR * (1 - blend) + waterTint.r * blend);
    finalG = Math.round(finalG * (1 - blend) + waterTint.g * blend);
    finalB = Math.round(finalB * (1 - blend) + waterTint.b * blend);
  }

  return (finalR << 16) | (finalG << 8) | finalB;
}

/**
 * Get final color for a cell (with CPU hillshade baked in)
 * @deprecated Use getBaseColor() with GPU lighting instead
 * @param {number} biome - Biome enum value
 * @param {number} elev - Elevation value [-1, 1]
 * @param {number} variation - Random variation seed [0, 1)
 * @param {number} hillshade - Hillshade value [0, 1], 1 = fully lit, 0 = in shadow
 * @returns {number} - RGB hex color
 */
export function getCellColor(biome, elev, variation, hillshade = 0.5) {
  const baseColor = getBaseColor(biome, elev, variation);
  // Apply hillshade lighting using the lighting module
  return applyHillshadeToColor(baseColor, hillshade, LightingConfig);
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
