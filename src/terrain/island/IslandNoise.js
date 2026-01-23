/**
 * IslandNoise - FastNoiseLite wrapper for island terrain
 *
 * Provides FBm-based elevation noise with optional domain warping,
 * plus shape noise for organic coastline generation.
 */
import FastNoiseLite from 'fastnoise-lite';

// Default configuration
const DEFAULT_CONFIG = {
  elevation: {
    frequency: 0.00008,
    octaves: 4,
    lacunarity: 2.0,
    gain: 0.5
  },
  shape: {
    frequency: 0.5,    // Base frequency for angular sampling (coordinates are ~[-2, 2])
    octaves: 3,
    lacunarity: 2.0,
    gain: 0.5
  },
  domainWarp: {
    enabled: false,
    amplitude: 1524,    // ~5000 feet in meters
    frequency: 0.00004
  }
};

// Module state
let elevationNoise = null;
let shapeNoise = null;
let warpNoise = null;
let currentConfig = null;

/**
 * Initialize noise generators with island seed
 * @param {number} seed - Island-derived seed
 * @param {Object} config - Optional override configuration
 */
export function initIslandNoise(seed, config = {}) {
  // Merge config with defaults
  currentConfig = {
    elevation: { ...DEFAULT_CONFIG.elevation, ...config.elevation },
    shape: { ...DEFAULT_CONFIG.shape, ...config.shape },
    domainWarp: { ...DEFAULT_CONFIG.domainWarp, ...config.domainWarp }
  };

  // Create elevation noise generator
  elevationNoise = new FastNoiseLite(seed);
  elevationNoise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  elevationNoise.SetFractalType(FastNoiseLite.FractalType.FBm);
  elevationNoise.SetFractalOctaves(currentConfig.elevation.octaves);
  elevationNoise.SetFrequency(currentConfig.elevation.frequency);
  elevationNoise.SetFractalLacunarity(currentConfig.elevation.lacunarity);
  elevationNoise.SetFractalGain(currentConfig.elevation.gain);

  // Create shape noise generator (different seed)
  shapeNoise = new FastNoiseLite(seed + 1000);
  shapeNoise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
  shapeNoise.SetFractalType(FastNoiseLite.FractalType.FBm);
  shapeNoise.SetFractalOctaves(currentConfig.shape.octaves);
  shapeNoise.SetFrequency(currentConfig.shape.frequency);
  shapeNoise.SetFractalLacunarity(currentConfig.shape.lacunarity);
  shapeNoise.SetFractalGain(currentConfig.shape.gain);

  // Create domain warp generator (different seed for independence)
  if (currentConfig.domainWarp.enabled) {
    warpNoise = new FastNoiseLite(seed + 100);
    warpNoise.SetDomainWarpType(FastNoiseLite.DomainWarpType.OpenSimplex2);
    warpNoise.SetDomainWarpAmp(currentConfig.domainWarp.amplitude);
    warpNoise.SetFrequency(currentConfig.domainWarp.frequency);
  } else {
    warpNoise = null;
  }
}

/**
 * Sample island elevation at coordinates
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @returns {number} Noise value approximately [-1, 1]
 */
export function sampleIslandElevation(x, y) {
  if (!elevationNoise) {
    throw new Error('IslandNoise not initialized. Call initIslandNoise() first.');
  }

  let wx = x, wy = y;

  // Apply domain warp if enabled
  if (currentConfig.domainWarp.enabled && warpNoise) {
    // FastNoiseLite warps coordinates in place via object reference
    const coord = { x, y };
    warpNoise.DomainWrap(coord);
    wx = coord.x;
    wy = coord.y;
  }

  return elevationNoise.GetNoise(wx, wy);
}

/**
 * Sample shape noise for coastline variation
 * Used with angular coordinates to create organic island shapes
 * @param {number} x - Normalized X coordinate (typically cos(angle) * scale)
 * @param {number} y - Normalized Y coordinate (typically sin(angle) * scale)
 * @returns {number} Noise value approximately [-1, 1]
 */
export function sampleShapeNoise(x, y) {
  if (!shapeNoise) {
    throw new Error('IslandNoise not initialized. Call initIslandNoise() first.');
  }

  return shapeNoise.GetNoise(x, y);
}

/**
 * Get current configuration (for debugging/inspection)
 * @returns {Object} Current noise configuration
 */
export function getIslandNoiseConfig() {
  return currentConfig ? { ...currentConfig } : null;
}
