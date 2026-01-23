/**
 * BiomeClassifier - Classify regions into biomes based on elevation and moisture
 *
 * Per spec section 2.8.
 */

/**
 * Island biome identifiers
 */
export const IslandBiome = {
  // Ocean
  DEEP_OCEAN: 'deep_ocean',
  OCEAN: 'ocean',
  REEF: 'reef',

  // Lakes (inland water)
  LAKE: 'lake',

  // Coastal
  SANDY_BEACH: 'sandy_beach',
  BEACH: 'beach',
  MANGROVE: 'mangrove',

  // Lowland
  GRASSLAND: 'grassland',
  WOODLAND: 'woodland',
  JUNGLE: 'jungle',

  // Midland
  SHRUBLAND: 'shrubland',
  FOREST: 'forest',
  RAINFOREST: 'rainforest',

  // Highland
  ROCKY: 'rocky',
  ALPINE_MEADOW: 'alpine_meadow',
  CLOUD_FOREST: 'cloud_forest',

  // Peak
  BARE_ROCK: 'bare_rock',
  SNOW: 'snow'
};

/**
 * Biome color palette for strategic map rendering
 * Colors chosen to be distinct and match the aesthetic
 */
export const BiomeColors = {
  // Ocean (blue gradient)
  [IslandBiome.DEEP_OCEAN]: '#0a2463',
  [IslandBiome.OCEAN]: '#1a4a7a',
  [IslandBiome.REEF]: '#2c81b6',

  // Lakes (inland water - teal/cyan to distinguish from ocean)
  [IslandBiome.LAKE]: '#1a8a8a',

  // Coastal (sandy/green)
  [IslandBiome.SANDY_BEACH]: '#dfd0ba',
  [IslandBiome.BEACH]: '#c9b896',
  [IslandBiome.MANGROVE]: '#3a5f4a',

  // Lowland (green gradient)
  [IslandBiome.GRASSLAND]: '#9abf7f',
  [IslandBiome.WOODLAND]: '#7a9f5f',
  [IslandBiome.JUNGLE]: '#2d5a27',

  // Midland (varied greens/browns)
  [IslandBiome.SHRUBLAND]: '#8a9a6a',
  [IslandBiome.FOREST]: '#376b30',
  [IslandBiome.RAINFOREST]: '#1a4a1a',

  // Highland (grays/greens)
  [IslandBiome.ROCKY]: '#7a7a7a',
  [IslandBiome.ALPINE_MEADOW]: '#8aaa8a',
  [IslandBiome.CLOUD_FOREST]: '#2a5a3a',

  // Peak (white/gray)
  [IslandBiome.BARE_ROCK]: '#6b6b6b',
  [IslandBiome.SNOW]: '#dae2df'
};

/**
 * Tropical biome preset - lush vegetation, mangroves, coral reefs
 */
const TROPICAL_PRESET = {
  name: 'tropical',

  // Elevation thresholds (ocean boundary at 0.0 to match isOcean flag)
  elevation: {
    deepOcean: -0.4,
    ocean: 0.0,      // Match isOcean threshold (elevation < 0)
    beach: 0.05,
    low: 0.3,
    mid: 0.6,
    high: 0.85
  },

  // Moisture thresholds
  moisture: {
    dry: 0.2,
    moderate: 0.5
  },

  // Biome matrix [elevation band][moisture band]
  matrix: {
    deepOcean: { dry: IslandBiome.DEEP_OCEAN, moderate: IslandBiome.DEEP_OCEAN, wet: IslandBiome.DEEP_OCEAN },
    ocean: { dry: IslandBiome.OCEAN, moderate: IslandBiome.OCEAN, wet: IslandBiome.REEF },
    beach: { dry: IslandBiome.SANDY_BEACH, moderate: IslandBiome.BEACH, wet: IslandBiome.MANGROVE },
    low: { dry: IslandBiome.GRASSLAND, moderate: IslandBiome.WOODLAND, wet: IslandBiome.JUNGLE },
    mid: { dry: IslandBiome.SHRUBLAND, moderate: IslandBiome.FOREST, wet: IslandBiome.RAINFOREST },
    high: { dry: IslandBiome.ROCKY, moderate: IslandBiome.ALPINE_MEADOW, wet: IslandBiome.CLOUD_FOREST },
    peak: { dry: IslandBiome.BARE_ROCK, moderate: IslandBiome.SNOW, wet: IslandBiome.SNOW }
  }
};

/**
 * Temperate biome preset - forests, grasslands, snowy peaks
 */
const TEMPERATE_PRESET = {
  name: 'temperate',

  elevation: {
    deepOcean: -0.4,
    ocean: 0.0,      // Match isOcean threshold
    beach: 0.05,
    low: 0.25,
    mid: 0.5,
    high: 0.75
  },

  moisture: {
    dry: 0.25,
    moderate: 0.55
  },

  matrix: {
    deepOcean: { dry: IslandBiome.DEEP_OCEAN, moderate: IslandBiome.DEEP_OCEAN, wet: IslandBiome.DEEP_OCEAN },
    ocean: { dry: IslandBiome.OCEAN, moderate: IslandBiome.OCEAN, wet: IslandBiome.OCEAN },
    beach: { dry: IslandBiome.SANDY_BEACH, moderate: IslandBiome.BEACH, wet: IslandBiome.BEACH },
    low: { dry: IslandBiome.GRASSLAND, moderate: IslandBiome.GRASSLAND, wet: IslandBiome.WOODLAND },
    mid: { dry: IslandBiome.SHRUBLAND, moderate: IslandBiome.FOREST, wet: IslandBiome.FOREST },
    high: { dry: IslandBiome.ROCKY, moderate: IslandBiome.ALPINE_MEADOW, wet: IslandBiome.FOREST },
    peak: { dry: IslandBiome.BARE_ROCK, moderate: IslandBiome.SNOW, wet: IslandBiome.SNOW }
  }
};

/**
 * Arctic biome preset - snow and ice at lower elevations
 */
const ARCTIC_PRESET = {
  name: 'arctic',

  elevation: {
    deepOcean: -0.4,
    ocean: 0.0,      // Match isOcean threshold
    beach: 0.05,
    low: 0.2,
    mid: 0.4,
    high: 0.6
  },

  moisture: {
    dry: 0.3,
    moderate: 0.6
  },

  matrix: {
    deepOcean: { dry: IslandBiome.DEEP_OCEAN, moderate: IslandBiome.DEEP_OCEAN, wet: IslandBiome.DEEP_OCEAN },
    ocean: { dry: IslandBiome.OCEAN, moderate: IslandBiome.OCEAN, wet: IslandBiome.OCEAN },
    beach: { dry: IslandBiome.BEACH, moderate: IslandBiome.BEACH, wet: IslandBiome.BEACH },
    low: { dry: IslandBiome.ROCKY, moderate: IslandBiome.GRASSLAND, wet: IslandBiome.GRASSLAND },
    mid: { dry: IslandBiome.ROCKY, moderate: IslandBiome.ALPINE_MEADOW, wet: IslandBiome.ALPINE_MEADOW },
    high: { dry: IslandBiome.BARE_ROCK, moderate: IslandBiome.SNOW, wet: IslandBiome.SNOW },
    peak: { dry: IslandBiome.SNOW, moderate: IslandBiome.SNOW, wet: IslandBiome.SNOW }
  }
};

/**
 * Available biome presets
 */
export const BiomePresets = {
  tropical: TROPICAL_PRESET,
  temperate: TEMPERATE_PRESET,
  arctic: ARCTIC_PRESET
};

/**
 * Get biome preset by name
 * @param {string} name - Preset name
 * @returns {Object} Biome preset configuration
 */
function getPreset(name) {
  return BiomePresets[name] || TROPICAL_PRESET;
}

/**
 * Classify single region biome based on elevation and moisture
 * @param {number} elevation - Region elevation [-1, 1]
 * @param {number} moisture - Region moisture [0, 1]
 * @param {Object} preset - Biome preset configuration
 * @returns {string} Biome identifier
 */
export function classifyBiome(elevation, moisture, preset) {
  const { elevation: e, moisture: m, matrix } = preset;

  // Determine elevation band
  let elevBand;
  if (elevation < e.deepOcean) {
    elevBand = 'deepOcean';
  } else if (elevation < e.ocean) {
    elevBand = 'ocean';
  } else if (elevation < e.beach) {
    elevBand = 'beach';
  } else if (elevation < e.low) {
    elevBand = 'low';
  } else if (elevation < e.mid) {
    elevBand = 'mid';
  } else if (elevation < e.high) {
    elevBand = 'high';
  } else {
    elevBand = 'peak';
  }

  // Determine moisture band
  let moistBand;
  if (moisture < m.dry) {
    moistBand = 'dry';
  } else if (moisture < m.moderate) {
    moistBand = 'moderate';
  } else {
    moistBand = 'wet';
  }

  return matrix[elevBand][moistBand];
}

/**
 * Assign biomes to all regions based on elevation and moisture
 * @param {Object[]} regions - Regions with elevation and moisture
 * @param {string|Object} config - Biome preset name or custom configuration
 */
export function assignBiomes(regions, config = 'tropical') {
  const preset = typeof config === 'string' ? getPreset(config) : config;

  for (const region of regions) {
    // Lakes get special biome
    if (region.isLake) {
      region.biome = IslandBiome.LAKE;
      continue;
    }

    region.biome = classifyBiome(region.elevation, region.moisture, preset);
  }
}

/**
 * Get biome color for rendering
 * @param {string} biome - Biome identifier
 * @returns {string} CSS color string
 */
export function getBiomeColor(biome) {
  return BiomeColors[biome] || '#ff00ff';  // Magenta for unknown
}
