/**
 * IslandTemplates - Preset configurations for island generation
 *
 * Per spec section 3.
 */

/**
 * Tropical Volcanic template
 * Central mountain peak with radial drainage, dense jungle lowlands
 */
const TROPICAL_VOLCANIC = {
  name: 'Tropical Volcanic',
  regionCount: 2000,
  radius: 30000,
  lloydIterations: 2,

  // Elevation parameters
  interiorBoost: 0.4,
  noiseAmplitude: 0.35,
  noiseFrequency: 0.0003,
  falloffStart: 0.6,
  shapeVariation: 0.25,

  // River generation
  rivers: {
    rainfall: 1.0,
    threshold: 12,
    lakes: {
      minLakeDepth: 0.04,
      minLakeCorners: 4,
      maxLakes: 6
    }
  },

  // Moisture propagation
  moisture: {
    decay: 0.92,
    uphillPenalty: 0.7,
    riverMoisture: 0.85
  },

  biomeConfig: 'tropical'
};

/**
 * Archipelago template
 * Multiple smaller landmasses with shallow seas between
 */
const ARCHIPELAGO = {
  name: 'Archipelago',
  regionCount: 2500,
  radius: 35000,
  lloydIterations: 2,

  // Lower interior boost creates multiple islands
  interiorBoost: 0.15,
  noiseAmplitude: 0.5,
  noiseFrequency: 0.0004,
  falloffStart: 0.5,
  shapeVariation: 0.4,

  rivers: {
    rainfall: 0.8,
    threshold: 10,
    lakes: {
      minLakeDepth: 0.03,
      minLakeCorners: 3,
      maxLakes: 10  // Archipelago can have many small lakes
    }
  },

  moisture: {
    decay: 0.95,  // Higher decay - moisture spreads easily between small islands
    uphillPenalty: 0.8,
    riverMoisture: 0.7
  },

  biomeConfig: 'tropical'
};

/**
 * Continental Fragment template
 * Mountain range along one edge, river valleys perpendicular
 */
const CONTINENTAL = {
  name: 'Continental',
  regionCount: 3000,
  radius: 40000,
  lloydIterations: 2,

  interiorBoost: 0.3,
  noiseAmplitude: 0.45,
  noiseFrequency: 0.00025,
  falloffStart: 0.65,
  shapeVariation: 0.2,

  rivers: {
    rainfall: 1.2,
    threshold: 18,
    lakes: {
      minLakeDepth: 0.06,
      minLakeCorners: 6,
      maxLakes: 5  // Fewer but larger lakes
    }
  },

  moisture: {
    decay: 0.88,
    uphillPenalty: 0.6,  // Strong rain shadow
    riverMoisture: 0.75
  },

  biomeConfig: 'temperate'
};

/**
 * Arctic template
 * Lower elevation overall, ice/snow at lower elevations
 */
const ARCTIC = {
  name: 'Arctic',
  regionCount: 1500,
  radius: 25000,
  lloydIterations: 2,

  interiorBoost: 0.2,
  noiseAmplitude: 0.3,
  noiseFrequency: 0.0003,
  falloffStart: 0.7,
  shapeVariation: 0.15,

  rivers: {
    rainfall: 0.5,  // Less rainfall
    threshold: 8,
    lakes: {
      minLakeDepth: 0.03,
      minLakeCorners: 4,
      maxLakes: 8  // Glacial lakes
    }
  },

  moisture: {
    decay: 0.85,
    uphillPenalty: 0.9,  // Weak rain shadow
    riverMoisture: 0.6
  },

  biomeConfig: 'arctic'
};

/**
 * Atoll template
 * Ring-shaped with central lagoon, very low elevation
 */
const ATOLL = {
  name: 'Atoll',
  regionCount: 1200,
  radius: 20000,
  lloydIterations: 2,

  // Very low interior boost, creates ring shape
  interiorBoost: 0.08,
  noiseAmplitude: 0.15,
  noiseFrequency: 0.0005,
  falloffStart: 0.4,
  shapeVariation: 0.3,

  rivers: {
    rainfall: 0.3,
    threshold: 15,  // Low threshold for minimal rivers
    lakes: {
      minLakeDepth: 0.02,
      minLakeCorners: 3,
      maxLakes: 3  // Atolls have few lakes
    }
  },

  moisture: {
    decay: 0.95,
    uphillPenalty: 0.9,
    riverMoisture: 0.9
  },

  biomeConfig: 'tropical'
};

/**
 * All available island templates
 */
export const IslandTemplates = {
  tropical_volcanic: TROPICAL_VOLCANIC,
  archipelago: ARCHIPELAGO,
  continental: CONTINENTAL,
  arctic: ARCTIC,
  atoll: ATOLL
};

/**
 * Get template by name
 * @param {string} name - Template name (e.g., 'tropical_volcanic')
 * @returns {Object|null} Template configuration or null if not found
 */
export function getTemplate(name) {
  return IslandTemplates[name] || null;
}

/**
 * Merge template with overrides
 * @param {string} templateName - Base template name
 * @param {Object} overrides - Config overrides
 * @returns {Object} Merged configuration
 */
export function mergeTemplate(templateName, overrides = {}) {
  const template = getTemplate(templateName);
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }

  // Deep merge for nested objects
  const mergedRivers = {
    ...template.rivers,
    ...(overrides.rivers || {}),
    lakes: {
      ...(template.rivers?.lakes || {}),
      ...(overrides.rivers?.lakes || {})
    }
  };

  return {
    ...template,
    ...overrides,
    rivers: mergedRivers,
    moisture: { ...template.moisture, ...(overrides.moisture || {}) }
  };
}

/**
 * Get list of available template names
 * @returns {string[]} Array of template names
 */
export function getTemplateNames() {
  return Object.keys(IslandTemplates);
}
