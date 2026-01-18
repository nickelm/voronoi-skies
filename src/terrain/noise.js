/**
 * Seeded noise functions for terrain generation
 * Implements fractal Brownian motion (fBm) with domain warping
 */
import { createNoise2D } from 'simplex-noise';
import { createSeededRandom } from '../utils/seededRandom.js';

// Layer configuration for different noise types
const NOISE_LAYERS = {
  continental: {
    baseFrequency: 0.0005,  // wavelength ~2000 units
    octaves: 2,             // reduced from 4 for broader land masses
    lacunarity: 2.0,        // frequency multiplier per octave
    persistence: 0.5,       // amplitude multiplier per octave
    warpStrength: 150,      // domain warp displacement
    warpFrequency: 0.0003   // frequency of warp noise
  },
  elevation: {
    baseFrequency: 0.00333, // wavelength ~300 units (was 0.005, λ ~200)
    octaves: 5,
    lacunarity: 2.0,
    persistence: 0.5,
    warpStrength: 50,
    warpFrequency: 0.002
  },
  moisture: {
    baseFrequency: 0.002,   // wavelength ~500 units
    octaves: 3,
    lacunarity: 2.0,
    persistence: 0.6,
    warpStrength: 80,
    warpFrequency: 0.001
  },
  detail: {
    baseFrequency: 0.0333,  // wavelength ~30 units (was 0.02, λ ~50)
    octaves: 2,
    lacunarity: 2.0,
    persistence: 0.5,
    warpStrength: 0,        // no warp for detail
    warpFrequency: 0
  }
};

// Noise generators (initialized by initNoise)
let noiseGenerators = {
  continental: null,
  elevation: null,
  moisture: null,
  detail: null,
  warpX: null,
  warpY: null
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
    elevation: worldSeed + 1000,
    moisture: worldSeed + 2000,
    detail: worldSeed + 3000,
    warpX: worldSeed + 4000,
    warpY: worldSeed + 5000
  };

  // Create noise generators
  for (const [key, seed] of Object.entries(seeds)) {
    noiseGenerators[key] = createNoise2D(createSeededRandom(seed));
  }

  initialized = true;
}

/**
 * Sample continental noise (land vs ocean)
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1], negative = ocean, positive = land
 */
export function continental(x, y) {
  const config = NOISE_LAYERS.continental;
  const [wx, wy] = warpCoordinates(x, y, config);
  return sampleFBm(noiseGenerators.continental, wx, wy, config);
}

/**
 * Sample elevation at world coordinates
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function elevation(x, y) {
  const config = NOISE_LAYERS.elevation;
  const [wx, wy] = warpCoordinates(x, y, config);
  return sampleFBm(noiseGenerators.elevation, wx, wy, config);
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
 * Sample detail noise for local variation
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Value in [-1, 1]
 */
export function detail(x, y) {
  const config = NOISE_LAYERS.detail;
  return sampleFBm(noiseGenerators.detail, x, y, config);
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
 * Compute final elevation using continental threshold for ocean mapping
 * Uses continental noise to determine land vs ocean, then applies appropriate elevation.
 * Ocean areas: continental value remapped to negative elevations [-1, -0.1]
 * Land areas: elevation noise scaled by distance from continental threshold
 *
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @param {number} threshold - Continental threshold (default 0), values below are ocean
 * @returns {number} - Final elevation in [-1, 1], negative = underwater
 */
export function computeElevation(x, y, threshold = 0) {
  const cont = continental(x, y);
  const baseElev = elevation(x, y);

  if (cont < threshold) {
    // Ocean: remap continental to negative elevations
    // Map continental range [-1, threshold] to elevation range [-1, -0.1]
    return remap(cont, -1, threshold, -1, -0.1);
  } else {
    // Land: full elevation range scaled by continental excess
    // The further above threshold, the more elevation variation allowed
    const landFactor = (cont - threshold) / (1 - threshold);
    return baseElev * landFactor;
  }
}

// ============================================
// DEPRECATED: Backward compatibility aliases
// ============================================

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
 * @deprecated Use elevation() instead
 * Sample elevation noise at world coordinates
 * Note: Returns [0, 1] for backward compatibility (new elevation() returns [-1, 1])
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} - Elevation value in [0, 1]
 */
export function sampleElevation(x, y) {
  return (elevation(x, y) + 1) / 2;
}
