/**
 * Seeded noise functions for terrain generation
 * Uses FastNoiseLite for fractal Brownian motion (fBm) with domain warping
 *
 * Layer Hierarchy:
 * - Continental (0.000125): Zone classification (deep ocean / ocean / coastal / inland)
 * - Regional (0.0008): Broad elevation shapes (land only)
 * - Local (0.003): Hills/valleys, amplitude 0.15, subordinate to regional
 * - Detail (0.02): Color variation only, not geometry
 * - Moisture (0.002): Biome variation on land
 * - Ridged (0.0006): Mountain ridge generation
 */
import FastNoiseLite from 'fastnoise-lite';

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
  ocean: -0.25,      // -0.5 to -0.25: regular ocean
  coastal: 0.1       // -0.25 to 0.1: coastal, >= 0.1: inland
};

// Layer configuration for different noise types
const NOISE_LAYERS = {
  continental: {
    frequency: 0.000125,
    octaves: 2,
    lacunarity: 2.0,
    gain: 0.5,
    warpAmplitude: 200,
    warpFrequency: 0.000075
  },
  regional: {
    frequency: 0.0008,
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.5,
    warpAmplitude: 80,
    warpFrequency: 0.0005
  },
  local: {
    frequency: 0.003,
    octaves: 4,
    lacunarity: 2.0,
    gain: 0.5,
    warpAmplitude: 30,
    warpFrequency: 0.002,
    amplitude: 0.15
  },
  moisture: {
    frequency: 0.002,
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.6,
    warpAmplitude: 80,
    warpFrequency: 0.001
  },
  detail: {
    frequency: 0.02,
    octaves: 2,
    lacunarity: 2.0,
    gain: 0.5,
    warpAmplitude: 0,
    warpFrequency: 0
  }
};

// Ridged multifractal configuration
const RIDGED_CONFIG = {
  frequency: 0.0006,
  octaves: 5,
  lacunarity: 2.2,
  gain: 0.5,
  warpAmplitude: 60,
  warpFrequency: 0.0003
};

// Blending parameters for ridged noise
const RIDGED_BLEND = {
  factor: 0.5,
  maskThresholdLow: 0.4,
  maskThresholdHigh: 0.7,
  amplitude: 0.4
};

// Noise generators (initialized by initNoise)
let noiseGenerators = {
  continental: null,
  regional: null,
  local: null,
  moisture: null,
  detail: null,
  ridged: null
};

// Domain warp generators
let warpGenerators = {
  continental: null,
  regional: null,
  local: null,
  moisture: null,
  ridged: null
};

let initialized = false;

/**
 * Create a FastNoiseLite FBm generator
 */
function createFBmNoise(seed, config) {
  const noise = new FastNoiseLite(seed);
  noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  noise.SetFractalType(FastNoiseLite.FractalType.FBm);
  noise.SetFractalOctaves(config.octaves);
  noise.SetFrequency(config.frequency);
  noise.SetFractalLacunarity(config.lacunarity);
  noise.SetFractalGain(config.gain);
  return noise;
}

/**
 * Create a FastNoiseLite ridged noise generator
 */
function createRidgedNoise(seed, config) {
  const noise = new FastNoiseLite(seed);
  noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  noise.SetFractalType(FastNoiseLite.FractalType.Ridged);
  noise.SetFractalOctaves(config.octaves);
  noise.SetFrequency(config.frequency);
  noise.SetFractalLacunarity(config.lacunarity);
  noise.SetFractalGain(config.gain);
  return noise;
}

/**
 * Create a FastNoiseLite domain warp generator
 */
function createDomainWarp(seed, config) {
  if (!config.warpAmplitude || config.warpAmplitude === 0) {
    return null;
  }
  const warp = new FastNoiseLite(seed);
  warp.SetDomainWarpType(FastNoiseLite.DomainWarpType.OpenSimplex2);
  warp.SetDomainWarpAmp(config.warpAmplitude);
  warp.SetFrequency(config.warpFrequency);
  return warp;
}

/**
 * Sample noise with optional domain warping
 */
function sampleWithWarp(noise, warp, x, y) {
  if (warp) {
    const coord = { x, y };
    warp.DomainWrap(coord);
    return noise.GetNoise(coord.x, coord.y);
  }
  return noise.GetNoise(x, y);
}

/**
 * Initialize all noise generators with a world seed
 * @param {number} worldSeed - Base seed for determinism
 */
export function initNoise(worldSeed) {
  // Create noise generators with unique seeds
  noiseGenerators.continental = createFBmNoise(worldSeed, NOISE_LAYERS.continental);
  noiseGenerators.regional = createFBmNoise(worldSeed + 1000, NOISE_LAYERS.regional);
  noiseGenerators.local = createFBmNoise(worldSeed + 2000, NOISE_LAYERS.local);
  noiseGenerators.moisture = createFBmNoise(worldSeed + 3000, NOISE_LAYERS.moisture);
  noiseGenerators.detail = createFBmNoise(worldSeed + 4000, NOISE_LAYERS.detail);
  noiseGenerators.ridged = createRidgedNoise(worldSeed + 7000, RIDGED_CONFIG);

  // Create domain warp generators
  warpGenerators.continental = createDomainWarp(worldSeed + 5000, NOISE_LAYERS.continental);
  warpGenerators.regional = createDomainWarp(worldSeed + 5100, NOISE_LAYERS.regional);
  warpGenerators.local = createDomainWarp(worldSeed + 5200, NOISE_LAYERS.local);
  warpGenerators.moisture = createDomainWarp(worldSeed + 5300, NOISE_LAYERS.moisture);
  warpGenerators.ridged = createDomainWarp(worldSeed + 5400, RIDGED_CONFIG);

  initialized = true;
}

/**
 * Sample continental noise (zone determination)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function continental(x, y) {
  return sampleWithWarp(noiseGenerators.continental, warpGenerators.continental, x, y);
}

/**
 * Sample regional noise - broad elevation shapes (land only)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function regional(x, y) {
  return sampleWithWarp(noiseGenerators.regional, warpGenerators.regional, x, y);
}

/**
 * Sample local noise - hills and valleys (subordinate to regional)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function local(x, y) {
  return sampleWithWarp(noiseGenerators.local, warpGenerators.local, x, y);
}

/**
 * Sample moisture at world coordinates
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [0, 1]
 */
export function moisture(x, y) {
  const raw = sampleWithWarp(noiseGenerators.moisture, warpGenerators.moisture, x, y);
  return (raw + 1) / 2;
}

/**
 * Sample detail noise for local color variation (not geometry)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function detail(x, y) {
  return noiseGenerators.detail.GetNoise(x, y);
}

/**
 * Sample ridged multifractal noise for mountain ridges
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [0, 1], peaks at ridgelines
 */
export function ridged(x, y) {
  const raw = sampleWithWarp(noiseGenerators.ridged, warpGenerators.ridged, x, y);
  // FastNoiseLite ridged returns [-1, 1], normalize to [0, 1]
  return (raw + 1) / 2;
}

/**
 * Remap a value from one range to another
 */
function remap(value, inMin, inMax, outMin, outMax) {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

/**
 * Smoothstep interpolation for smooth blending
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
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {{elevation: number, zone: number}} - Final elevation [-1, 1] and zone
 */
export function computeElevation(x, y) {
  const { zone, continentalValue } = classifyZone(x, y);

  let elevation;

  switch (zone) {
    case Zone.DEEP_OCEAN:
      elevation = remap(continentalValue, -1, ZONE_THRESHOLDS.deepOcean, -1, -0.6);
      break;

    case Zone.OCEAN: {
      const baseOceanElev = remap(
        continentalValue,
        ZONE_THRESHOLDS.deepOcean,
        ZONE_THRESHOLDS.ocean,
        -0.6,
        -0.15
      );

      const shelfThreshold = -0.35;
      if (continentalValue > shelfThreshold) {
        const shelfFactor = smoothstep(shelfThreshold, ZONE_THRESHOLDS.ocean, continentalValue);
        elevation = -0.4 + shelfFactor * 0.25;
      } else {
        elevation = baseOceanElev;
      }
      break;
    }

    case Zone.COASTAL: {
      const coastalBase = remap(
        continentalValue,
        ZONE_THRESHOLDS.ocean,
        ZONE_THRESHOLDS.coastal,
        0,
        0.15
      );
      const coastalRegional = regional(x, y) * 0.3;
      const coastalLocal = local(x, y) * NOISE_LAYERS.local.amplitude * 0.5;
      elevation = coastalBase + coastalRegional * 0.1 + coastalLocal;
      elevation = Math.max(0, Math.min(0.3, elevation));
      break;
    }

    case Zone.INLAND:
    default: {
      const inlandness = (continentalValue - ZONE_THRESHOLDS.coastal) /
                         (1 - ZONE_THRESHOLDS.coastal);
      const baseElevation = 0.1 + inlandness * 0.2;

      const regionalValue = regional(x, y);
      const regionalNormalized = (regionalValue + 1) / 2;
      const regionalContrib = regionalNormalized * 0.5 * (0.5 + inlandness * 0.5);

      const mountainMask = smoothstep(
        RIDGED_BLEND.maskThresholdLow,
        RIDGED_BLEND.maskThresholdHigh,
        regionalValue
      );

      const ridgedValue = ridged(x, y);
      const ridgedContrib = ridgedValue * RIDGED_BLEND.amplitude;

      const blendedRegional = regionalContrib + mountainMask * RIDGED_BLEND.factor * ridgedContrib;

      const localContrib = local(x, y) * NOISE_LAYERS.local.amplitude;

      elevation = baseElevation + blendedRegional + localContrib;
      elevation = Math.max(0.05, Math.min(1, elevation));
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
 */
export function elevation(x, y) {
  return regional(x, y);
}

/**
 * @deprecated Use continental() instead
 */
export function sampleBiome(x, y) {
  return continental(x, y);
}

/**
 * @deprecated Use regional() instead
 * Note: Returns [0, 1] for backward compatibility
 */
export function sampleElevation(x, y) {
  return (regional(x, y) + 1) / 2;
}
