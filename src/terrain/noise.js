/**
 * Seeded noise functions for terrain generation
 * Implements fractal Brownian motion (fBm) with domain warping
 *
 * Layer Hierarchy (Chunk A):
 * - Continental (0.00025): Zone classification (deep ocean / ocean / coastal / inland)
 * - Regional (0.0008): Broad elevation shapes (land only)
 * - Local (0.003): Hills/valleys, amplitude 0.15, subordinate to regional
 * - Detail (0.02): Color variation only, not geometry
 * - Moisture (0.002): Biome variation on land
 */
import { createNoise2D } from 'simplex-noise';
import { createSeededRandom } from '../utils/seededRandom.js';

// Zone classification enum
export const Zone = {
  DEEP_OCEAN: 0,
  OCEAN: 1,
  COASTAL: 2,
  INLAND: 3
};

// Zone thresholds based on continental noise value
export const ZONE_THRESHOLDS = {
  deepOcean: -0.5,   // Below this: deep ocean
  ocean: -0.25,      // -0.5 to -0.25: regular ocean (lowered for more ocean)
  coastal: 0.1       // -0.25 to 0.1: coastal, >= 0.1: inland
};

// Layer configuration for different noise types
const NOISE_LAYERS = {
  continental: {
    baseFrequency: 0.000125, // wavelength ~8000 units (halved for larger continents/oceans)
    octaves: 2,
    lacunarity: 2.0,
    persistence: 0.5,
    warpStrength: 200,       // increased from 150 for more organic coastlines
    warpFrequency: 0.000075  // halved to match new frequency scale
  },
  regional: {
    baseFrequency: 0.0008,   // wavelength ~1250 units (NEW)
    octaves: 3,
    lacunarity: 2.0,
    persistence: 0.5,
    warpStrength: 80,
    warpFrequency: 0.0005
  },
  local: {
    baseFrequency: 0.003,    // wavelength ~333 units
    octaves: 4,
    lacunarity: 2.0,
    persistence: 0.5,
    warpStrength: 30,
    warpFrequency: 0.002,
    amplitude: 0.15          // subordinate to regional
  },
  moisture: {
    baseFrequency: 0.002,    // wavelength ~500 units (unchanged)
    octaves: 3,
    lacunarity: 2.0,
    persistence: 0.6,
    warpStrength: 80,
    warpFrequency: 0.001
  },
  detail: {
    baseFrequency: 0.02,     // wavelength ~50 units (was 0.0333)
    octaves: 2,
    lacunarity: 2.0,
    persistence: 0.5,
    warpStrength: 0,
    warpFrequency: 0
  }
};

// Ridged multifractal configuration (separate from NOISE_LAYERS due to different algorithm)
const RIDGED_CONFIG = {
  baseFrequency: 0.0006,   // Wavelength ~1667 units
  octaves: 5,
  lacunarity: 2.2,
  persistence: 0.5,
  sharpness: 2.5,          // Ridge narrowness (power exponent)
  warpStrength: 60,
  warpFrequency: 0.0003
};

// Blending parameters for ridged noise
const RIDGED_BLEND = {
  factor: 0.5,             // How much ridged replaces regional (0-1)
  maskThresholdLow: 0.4,   // Regional value where ridges begin
  maskThresholdHigh: 0.7,  // Regional value where ridges are full strength
  amplitude: 0.4           // Maximum elevation contribution from ridges
};

// Noise generators (initialized by initNoise)
let noiseGenerators = {
  continental: null,
  regional: null,
  local: null,
  moisture: null,
  detail: null,
  warpX: null,
  warpY: null,
  ridged: null
};

let initialized = false;

/**
 * Sample noise with fractal Brownian motion (octave stacking)
 * @param {Function} noiseFn - Base 2D noise function
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} config - Layer configuration
 * @returns {number} - Noise value in [-1, 1]
 */
function sampleFBm(noiseFn, x, y, config) {
  let value = 0;
  let amplitude = 1;
  let frequency = config.baseFrequency;
  let maxAmplitude = 0;

  for (let i = 0; i < config.octaves; i++) {
    value += noiseFn(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= config.persistence;
    frequency *= config.lacunarity;
  }

  // Normalize to [-1, 1]
  return value / maxAmplitude;
}

/**
 * Sample ridged multifractal noise with feedback weighting
 * Unlike fBm, uses feedback where ridge strength amplifies detail in subsequent octaves
 *
 * @param {Function} noiseFn - Base 2D noise function
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} config - Ridged multifractal configuration
 * @returns {number} - Noise value in [0, 1] (ridged noise is always positive)
 */
function sampleRidgedMultifractal(noiseFn, x, y, config) {
  let value = 0;
  let amplitude = 1;
  let frequency = config.baseFrequency;
  let weight = 1.0;
  let maxAmplitude = 0;

  for (let i = 0; i < config.octaves; i++) {
    // Base noise in [-1, 1]
    const n = noiseFn(x * frequency, y * frequency);

    // Ridge transform: 1 - |n| creates ridges at zero-crossings
    let ridge = 1.0 - Math.abs(n);

    // Sharpening: raise to power to make ridges narrower
    ridge = Math.pow(ridge, config.sharpness);

    // Apply weight feedback from previous octave
    ridge *= weight;

    // Update weight for next octave (clamped feedback)
    weight = Math.min(1.0, Math.max(0.0, ridge));

    value += ridge * amplitude;
    maxAmplitude += amplitude;

    frequency *= config.lacunarity;
    amplitude *= config.persistence;
  }

  return value / maxAmplitude;
}

/**
 * Apply domain warping to coordinates
 * @param {number} x - Original X coordinate
 * @param {number} y - Original Y coordinate
 * @param {Object} config - Layer configuration with warp settings
 * @returns {number[]} - Warped [x, y] coordinates
 */
function warpCoordinates(x, y, config) {
  if (config.warpStrength === 0) {
    return [x, y];
  }

  // Sample warp noise at the position
  const warpX = noiseGenerators.warpX(
    x * config.warpFrequency,
    y * config.warpFrequency
  );
  const warpY = noiseGenerators.warpY(
    x * config.warpFrequency,
    y * config.warpFrequency
  );

  // Displace coordinates
  return [
    x + warpX * config.warpStrength,
    y + warpY * config.warpStrength
  ];
}

/**
 * Initialize all noise generators with a world seed
 * @param {number} worldSeed - Base seed for determinism
 */
export function initNoise(worldSeed) {
  // Derive unique seeds for each layer (stable offsets)
  const seeds = {
    continental: worldSeed,
    regional: worldSeed + 1000,
    local: worldSeed + 2000,
    moisture: worldSeed + 3000,
    detail: worldSeed + 4000,
    warpX: worldSeed + 5000,
    warpY: worldSeed + 6000,
    ridged: worldSeed + 7000
  };

  // Create noise generators
  for (const [key, seed] of Object.entries(seeds)) {
    noiseGenerators[key] = createNoise2D(createSeededRandom(seed));
  }

  initialized = true;
}

/**
 * Sample continental noise (zone determination)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function continental(x, y) {
  const config = NOISE_LAYERS.continental;
  const [wx, wy] = warpCoordinates(x, y, config);
  return sampleFBm(noiseGenerators.continental, wx, wy, config);
}

/**
 * Sample regional noise - broad elevation shapes (land only)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function regional(x, y) {
  const config = NOISE_LAYERS.regional;
  const [wx, wy] = warpCoordinates(x, y, config);
  return sampleFBm(noiseGenerators.regional, wx, wy, config);
}

/**
 * Sample local noise - hills and valleys (subordinate to regional)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function local(x, y) {
  const config = NOISE_LAYERS.local;
  const [wx, wy] = warpCoordinates(x, y, config);
  return sampleFBm(noiseGenerators.local, wx, wy, config);
}

/**
 * Sample moisture at world coordinates
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [0, 1]
 */
export function moisture(x, y) {
  const config = NOISE_LAYERS.moisture;
  const [wx, wy] = warpCoordinates(x, y, config);
  const raw = sampleFBm(noiseGenerators.moisture, wx, wy, config);
  // Remap from [-1, 1] to [0, 1]
  return (raw + 1) / 2;
}

/**
 * Sample detail noise for local color variation (not geometry)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function detail(x, y) {
  const config = NOISE_LAYERS.detail;
  return sampleFBm(noiseGenerators.detail, x, y, config);
}

/**
 * Sample ridged multifractal noise for mountain ridges
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [0, 1], peaks at ridgelines
 */
export function ridged(x, y) {
  const config = RIDGED_CONFIG;
  const [wx, wy] = warpCoordinates(x, y, config);
  return sampleRidgedMultifractal(noiseGenerators.ridged, wx, wy, config);
}

/**
 * Remap a value from one range to another
 * @param {number} value - Input value
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} - Remapped value
 */
function remap(value, inMin, inMax, outMin, outMax) {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

/**
 * Smoothstep interpolation for smooth blending
 * @param {number} edge0 - Lower edge
 * @param {number} edge1 - Upper edge
 * @param {number} x - Input value
 * @returns {number} - Smoothly interpolated value in [0, 1]
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Classify a point into terrain zones based on continental noise
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {{zone: number, continentalValue: number}} - Zone enum and raw continental value
 */
export function classifyZone(x, y) {
  const cont = continental(x, y);

  let zone;
  if (cont < ZONE_THRESHOLDS.deepOcean) {
    zone = Zone.DEEP_OCEAN;
  } else if (cont < ZONE_THRESHOLDS.ocean) {
    zone = Zone.OCEAN;
  } else if (cont < ZONE_THRESHOLDS.coastal) {
    zone = Zone.COASTAL;
  } else {
    zone = Zone.INLAND;
  }

  return { zone, continentalValue: cont };
}

/**
 * Check if a zone is water (deep ocean or ocean)
 * @param {number} zone - Zone enum value
 * @returns {boolean}
 */
export function isWaterZone(zone) {
  return zone === Zone.DEEP_OCEAN || zone === Zone.OCEAN;
}

/**
 * Check if a zone is land (coastal or inland)
 * @param {number} zone - Zone enum value
 * @returns {boolean}
 */
export function isLandZone(zone) {
  return zone === Zone.COASTAL || zone === Zone.INLAND;
}

/**
 * Compute final elevation using zone-based approach
 * - Deep Ocean: deep negative elevation based on continental value
 * - Ocean: moderate negative elevation
 * - Coastal: low positive elevation, regional noise muted
 * - Inland: full regional + local combination
 *
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {{elevation: number, zone: number}} - Final elevation [-1, 1] and zone
 */
export function computeElevation(x, y) {
  const { zone, continentalValue } = classifyZone(x, y);

  let elevation;

  switch (zone) {
    case Zone.DEEP_OCEAN:
      // Deep ocean: remap continental [-1, -0.5] to elevation [-1, -0.6]
      elevation = remap(continentalValue, -1, ZONE_THRESHOLDS.deepOcean, -1, -0.6);
      break;

    case Zone.OCEAN: {
      // Ocean with continental shelf gradient near coast
      // Base remap from continental [-0.5, -0.25] to elevation [-0.6, -0.15]
      const baseOceanElev = remap(
        continentalValue,
        ZONE_THRESHOLDS.deepOcean,
        ZONE_THRESHOLDS.ocean,
        -0.6,
        -0.15
      );

      // Continental shelf: smooth gradient in the upper ocean zone (near coast)
      // Shelf zone: continental values from -0.35 to -0.25 (near coast)
      const shelfThreshold = -0.35;
      if (continentalValue > shelfThreshold) {
        // Smoothstep from shelf threshold to coast for gradual rise
        const shelfFactor = smoothstep(shelfThreshold, ZONE_THRESHOLDS.ocean, continentalValue);
        // Blend from deep (-0.4) to shallow (-0.15) across shelf
        elevation = -0.4 + shelfFactor * 0.25;
      } else {
        elevation = baseOceanElev;
      }
      break;
    }

    case Zone.COASTAL: {
      // Coastal: low elevation with muted regional, light local influence
      // Remap continental [-0.25, 0.1] to base [0, 0.15]
      const coastalBase = remap(
        continentalValue,
        ZONE_THRESHOLDS.ocean,
        ZONE_THRESHOLDS.coastal,
        0,
        0.15
      );
      const coastalRegional = regional(x, y) * 0.3;  // muted regional
      const coastalLocal = local(x, y) * NOISE_LAYERS.local.amplitude * 0.5;  // half local
      elevation = coastalBase + coastalRegional * 0.1 + coastalLocal;
      elevation = Math.max(0, Math.min(0.3, elevation));  // clamp coastal range
      break;
    }

    case Zone.INLAND:
    default: {
      // Inland: full regional + local + ridged mountain blend
      const inlandness = (continentalValue - ZONE_THRESHOLDS.coastal) /
                         (1 - ZONE_THRESHOLDS.coastal);
      const baseElevation = 0.1 + inlandness * 0.2;  // [0.1, 0.3] base

      // Regional provides main shape
      const regionalValue = regional(x, y);
      const regionalNormalized = (regionalValue + 1) / 2;
      const regionalContrib = regionalNormalized * 0.5 * (0.5 + inlandness * 0.5);

      // Mountain mask: smoothstep from regional value
      // Ridges appear in higher-elevation areas (regional > 0.4)
      const mountainMask = smoothstep(
        RIDGED_BLEND.maskThresholdLow,
        RIDGED_BLEND.maskThresholdHigh,
        regionalValue
      );

      // Sample ridged noise and scale to contribution range
      const ridgedValue = ridged(x, y);
      const ridgedContrib = ridgedValue * RIDGED_BLEND.amplitude;

      // Blend: add ridged contribution where mountains should exist
      const blendedRegional = regionalContrib + mountainMask * RIDGED_BLEND.factor * ridgedContrib;

      // Local adds hills/valleys
      const localContrib = local(x, y) * NOISE_LAYERS.local.amplitude;

      elevation = baseElevation + blendedRegional + localContrib;
      elevation = Math.max(0.05, Math.min(1, elevation));  // clamp to valid land range
      break;
    }
  }

  return { elevation, zone };
}

/**
 * Get elevation only (convenience wrapper)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Final elevation [-1, 1]
 */
export function getElevation(x, y) {
  return computeElevation(x, y).elevation;
}

// ============================================
// DEPRECATED: Backward compatibility aliases
// ============================================

/**
 * @deprecated Use regional() instead
 * Sample elevation noise at world coordinates
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function elevation(x, y) {
  return regional(x, y);
}

/**
 * @deprecated Use continental() instead
 * Sample biome noise at world coordinates
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Noise value in [-1, 1]
 */
export function sampleBiome(x, y) {
  return continental(x, y);
}

/**
 * @deprecated Use regional() instead
 * Sample elevation noise at world coordinates
 * Note: Returns [0, 1] for backward compatibility (new regional() returns [-1, 1])
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Elevation value in [0, 1]
 */
export function sampleElevation(x, y) {
  return (regional(x, y) + 1) / 2;
}
