/**
 * Airbase constants and configuration
 *
 * Default values for runway dimensions, PAPI angles, and other airbase-related settings.
 */

// Runway dimension defaults (all in feet, 1 unit = 1 foot)
export const RUNWAY_DEFAULTS = {
  // Standard runway dimensions
  length: 10000,          // 10,000 ft typical runway
  minLength: 3300,        // ~1000m minimum
  maxLength: 12000,       // 12,000 ft maximum
  width: 150,             // 150 ft standard width

  // Terrain flattening
  apronRadius: 500,       // Smooth transition zone around runway

  // Elevation
  elevationScale: 400     // Same as terrain ELEVATION_SCALE
};

// PAPI (Precision Approach Path Indicator) configuration
export const PAPI_CONFIG = {
  // Standard PAPI angles (degrees above horizon)
  // Aircraft should see 2 red/2 white at correct 3-degree glideslope
  angles: [2.5, 2.83, 3.17, 3.5],

  // Visual glideslope reference
  targetGlideslope: 3.0,  // degrees

  // Light positioning relative to runway threshold
  distanceFromThreshold: 1000,  // ft along runway from threshold
  offsetFromCenterline: 75,     // ft beside runway (on left side)
  lightSpacing: 30,             // ft between lights

  // Light appearance
  lightRadius: 10,              // ft radius of each light
  lightHeight: 5                // ft above runway elevation
};

// Runway marking dimensions (8-bit pixel style)
export const MARKING_DIMENSIONS = {
  // Threshold markings (piano keys)
  threshold: {
    numBars: 8,               // Number of bars
    barLength: 150,           // ft
    barWidth: 20,             // ft
    gapWidth: 20,             // ft between bars
    offsetFromEnd: 50         // ft from runway end
  },

  // Centerline dashes
  centerline: {
    dashLength: 120,          // ft
    gapLength: 80,            // ft
    width: 3                  // ft
  },

  // Touchdown zone
  touchdownZone: {
    barLength: 75,            // ft
    barWidth: 10,             // ft
    spacing: 500              // ft between zones
  },

  // Runway numbers
  numbers: {
    height: 60,               // ft
    width: 20,                // ft per digit
    offsetFromThreshold: 500  // ft from threshold
  }
};

// Color definitions (hex)
export const AIRBASE_COLORS = {
  runway: 0x3a3a3a,           // Dark gray asphalt
  markings: 0xffffff,         // White runway markings
  papiRed: 0xff0000,          // PAPI below glideslope
  papiWhite: 0xffffff         // PAPI above glideslope
};

// Airbase placement constraints for procedural generation
export const PLACEMENT_CONSTRAINTS = {
  // Terrain requirements (normalized elevation values)
  minElevation: 0.05,         // No water/beaches
  maxElevation: 0.5,          // No mountains
  maxSlope: 0.1,              // Maximum elevation difference across runway area

  // Spacing between airbases
  minSpacing: 30000,          // ft minimum distance between airbases
  gridSize: 30000,            // ft grid spacing for candidate placement

  // How many candidate regions to search
  searchRadius: 5             // Number of grid cells in each direction
};

// Named airbase templates (for specific placements or testing)
export const AIRBASE_TEMPLATES = {
  homeBase: {
    id: 'homebase',
    name: 'Alpha Field',
    runwayLength: 10000,
    runwayWidth: 150,
    tacanChannel: 42,
    ilsFrequency: 109.5
  },
  forward: {
    id: 'forward',
    name: 'Bravo Strip',
    runwayLength: 6000,
    runwayWidth: 100,
    tacanChannel: 56,
    ilsFrequency: null
  },
  captured: {
    id: 'captured',
    name: 'Charlie Base',
    runwayLength: 8000,
    runwayWidth: 150,
    tacanChannel: 71,
    ilsFrequency: 110.3
  }
};

// Phonetic alphabet for procedural naming
export const PHONETIC_ALPHABET = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
  'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'X-ray', 'Yankee', 'Zulu'
];

// Suffix words for airbase names
export const AIRBASE_SUFFIXES = [
  'Field', 'AFB', 'Strip', 'Base', 'Airfield', 'International'
];
