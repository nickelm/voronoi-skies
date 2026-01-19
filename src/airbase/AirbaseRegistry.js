/**
 * AirbaseRegistry - Manages procedural generation and lookup of airbases
 *
 * Generates airbases deterministically based on world seed, ensuring:
 * - Consistent placement across sessions
 * - Airbases only on suitable terrain (not water, not mountains)
 * - Minimum spacing between airbases
 */

import { Airbase } from './Airbase.js';
import { createSeededRandom } from '../utils/seededRandom.js';
import {
  RUNWAY_DEFAULTS,
  PLACEMENT_CONSTRAINTS,
  PHONETIC_ALPHABET,
  AIRBASE_SUFFIXES
} from '../data/airbases.js';

// Import noise functions for terrain sampling
// Note: These must be initialized before calling generateAirbases
import { getElevation, classifyZone, isLandZone } from '../terrain/noise.js';

export class AirbaseRegistry {
  /**
   * @param {number} worldSeed - World seed for deterministic generation
   */
  constructor(worldSeed) {
    this.worldSeed = worldSeed;

    // All generated airbases
    this.airbases = [];

    // Map for quick lookup by ID
    this.airbaseById = new Map();

    // Spatial index for quick bounds queries
    // Maps chunk key to array of airbases affecting that chunk
    this.chunkIndex = new Map();
  }

  /**
   * Generate all airbases for the world
   * Should be called after noise is initialized
   */
  generateAirbases() {
    const seedOffset = 9999; // Offset to differentiate from terrain seed
    const rng = createSeededRandom(this.worldSeed + seedOffset);

    const gridSize = PLACEMENT_CONSTRAINTS.gridSize;
    const searchRadius = PLACEMENT_CONSTRAINTS.searchRadius;

    let airbaseIndex = 0;

    // Search grid of candidate regions
    for (let gx = -searchRadius; gx <= searchRadius; gx++) {
      for (let gy = -searchRadius; gy <= searchRadius; gy++) {
        // Candidate center with random offset
        const candidateX = gx * gridSize + (rng() - 0.5) * gridSize * 0.5;
        const candidateZ = gy * gridSize + (rng() - 0.5) * gridSize * 0.5;

        // Check if this location is suitable
        const suitability = this.checkSuitability(candidateX, candidateZ, rng);
        if (!suitability.suitable) {
          continue;
        }

        // Check minimum spacing from existing airbases
        if (!this.checkSpacing(candidateX, candidateZ)) {
          continue;
        }

        // Create airbase at this location
        const airbase = this.createAirbase(
          candidateX,
          candidateZ,
          suitability.elevation,
          suitability.heading,
          airbaseIndex,
          rng
        );

        this.airbases.push(airbase);
        this.airbaseById.set(airbase.id, airbase);
        airbaseIndex++;
      }
    }

    // Build spatial index after all airbases are created
    this.buildChunkIndex();

    console.log(`AirbaseRegistry: Generated ${this.airbases.length} airbases`);
  }

  /**
   * Check if a location is suitable for an airbase
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate
   * @param {function} rng - Seeded random function
   * @returns {{suitable: boolean, elevation: number, heading: number}}
   */
  checkSuitability(x, z, rng) {
    // Sample terrain at candidate center
    const elevation = getElevation(x, z);
    const { zone } = classifyZone(x, z);

    // Reject water zones
    if (!isLandZone(zone)) {
      return { suitable: false };
    }

    // Reject if elevation out of range
    if (elevation < PLACEMENT_CONSTRAINTS.minElevation ||
        elevation > PLACEMENT_CONSTRAINTS.maxElevation) {
      return { suitable: false };
    }

    // Check slope by sampling corners of potential runway
    const runwayHalfLength = RUNWAY_DEFAULTS.length / 2;
    const samples = [
      getElevation(x - runwayHalfLength, z),
      getElevation(x + runwayHalfLength, z),
      getElevation(x, z - runwayHalfLength),
      getElevation(x, z + runwayHalfLength)
    ];

    const maxElev = Math.max(...samples, elevation);
    const minElev = Math.min(...samples, elevation);
    const slope = maxElev - minElev;

    if (slope > PLACEMENT_CONSTRAINTS.maxSlope) {
      return { suitable: false };
    }

    // Determine runway heading
    // Option 1: Find direction of least slope
    // Option 2: Random from seed (simpler, still deterministic)
    const heading = Math.floor(rng() * 36) * 10; // 0, 10, 20, ... 350

    return {
      suitable: true,
      elevation: elevation,
      heading: heading
    };
  }

  /**
   * Check minimum spacing from existing airbases
   * @param {number} x
   * @param {number} z
   * @returns {boolean} - true if spacing is acceptable
   */
  checkSpacing(x, z) {
    const minSpacing = PLACEMENT_CONSTRAINTS.minSpacing;
    const minSpacingSq = minSpacing * minSpacing;

    for (const airbase of this.airbases) {
      const dx = x - airbase.position.x;
      const dz = z - airbase.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < minSpacingSq) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create an airbase at the specified location
   * @param {number} x - World X
   * @param {number} z - World Z
   * @param {number} elevation - Normalized elevation
   * @param {number} heading - Runway heading in degrees
   * @param {number} index - Airbase index for naming
   * @param {function} rng - Seeded random function
   * @returns {Airbase}
   */
  createAirbase(x, z, elevation, heading, index, rng) {
    // Generate procedural name
    const name = this.generateName(index, rng);

    // Vary runway length slightly
    const lengthVariation = 0.8 + rng() * 0.4; // 80% to 120%
    const runwayLength = Math.round(RUNWAY_DEFAULTS.length * lengthVariation / 100) * 100;

    // TACAN channel (spaced to avoid conflicts)
    const tacanChannel = 10 + index * 5;

    // ILS frequency (some airbases don't have ILS)
    const hasILS = rng() > 0.3; // 70% chance of ILS
    const ilsFrequency = hasILS ? (108.1 + index * 0.2) : null;

    return new Airbase({
      id: `airbase_${index}`,
      name: name,
      position: { x, z },
      heading: heading,
      elevation: elevation,
      runwayLength: runwayLength,
      runwayWidth: RUNWAY_DEFAULTS.width,
      tacanChannel: tacanChannel,
      ilsFrequency: ilsFrequency,
      apronRadius: RUNWAY_DEFAULTS.apronRadius
    });
  }

  /**
   * Generate a procedural name for an airbase
   * @param {number} index - Airbase index
   * @param {function} rng - Seeded random function
   * @returns {string}
   */
  generateName(index, rng) {
    // Use phonetic alphabet cyclically, with suffix
    const phonetic = PHONETIC_ALPHABET[index % PHONETIC_ALPHABET.length];
    const suffixIndex = Math.floor(rng() * AIRBASE_SUFFIXES.length);
    const suffix = AIRBASE_SUFFIXES[suffixIndex];

    return `${phonetic} ${suffix}`;
  }

  /**
   * Build spatial index for fast chunk queries
   * Maps chunk coordinates to airbases that affect them
   */
  buildChunkIndex(chunkSize = 2000) {
    this.chunkIndex.clear();

    for (const airbase of this.airbases) {
      const bounds = airbase.getBounds();

      // Find all chunks this airbase overlaps
      const minChunkX = Math.floor(bounds.minX / chunkSize);
      const maxChunkX = Math.floor(bounds.maxX / chunkSize);
      const minChunkZ = Math.floor(bounds.minZ / chunkSize);
      const maxChunkZ = Math.floor(bounds.maxZ / chunkSize);

      for (let cx = minChunkX; cx <= maxChunkX; cx++) {
        for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
          const key = `${cx},${cz}`;
          if (!this.chunkIndex.has(key)) {
            this.chunkIndex.set(key, []);
          }
          this.chunkIndex.get(key).push(airbase);
        }
      }
    }
  }

  /**
   * Get airbases that may affect a given bounds area
   * @param {Array} bounds - [minX, minZ, maxX, maxZ]
   * @returns {Airbase[]}
   */
  getAirbasesInBounds(bounds) {
    const [minX, minZ, maxX, maxZ] = bounds;
    const chunkSize = 2000;

    // Find affected chunks
    const minChunkX = Math.floor(minX / chunkSize);
    const maxChunkX = Math.floor(maxX / chunkSize);
    const minChunkZ = Math.floor(minZ / chunkSize);
    const maxChunkZ = Math.floor(maxZ / chunkSize);

    const result = new Set();

    for (let cx = minChunkX; cx <= maxChunkX; cx++) {
      for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
        const key = `${cx},${cz}`;
        const airbases = this.chunkIndex.get(key);
        if (airbases) {
          for (const airbase of airbases) {
            // Double-check actual intersection
            if (airbase.intersectsBounds(bounds)) {
              result.add(airbase);
            }
          }
        }
      }
    }

    return Array.from(result);
  }

  /**
   * Get airbases in a specific chunk
   * @param {number} chunkX
   * @param {number} chunkY - Actually Z in world coords
   * @param {number} chunkSize
   * @returns {Airbase[]}
   */
  getAirbasesInChunk(chunkX, chunkY, chunkSize = 2000) {
    const bounds = [
      chunkX * chunkSize,
      chunkY * chunkSize,
      (chunkX + 1) * chunkSize,
      (chunkY + 1) * chunkSize
    ];
    return this.getAirbasesInBounds(bounds);
  }

  /**
   * Get airbase by ID
   * @param {string} id
   * @returns {Airbase|null}
   */
  getAirbaseById(id) {
    return this.airbaseById.get(id) || null;
  }

  /**
   * Find the nearest airbase to a position
   * @param {number} x
   * @param {number} z
   * @returns {{airbase: Airbase, distance: number}|null}
   */
  getNearestAirbase(x, z) {
    if (this.airbases.length === 0) return null;

    let nearest = null;
    let nearestDistSq = Infinity;

    for (const airbase of this.airbases) {
      const dx = x - airbase.position.x;
      const dz = z - airbase.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = airbase;
      }
    }

    return {
      airbase: nearest,
      distance: Math.sqrt(nearestDistSq)
    };
  }

  /**
   * Get all airbases
   * @returns {Airbase[]}
   */
  getAllAirbases() {
    return [...this.airbases];
  }

  /**
   * Get airbase count
   * @returns {number}
   */
  getCount() {
    return this.airbases.length;
  }

  /**
   * Add a manually specified airbase (for testing or special scenarios)
   * @param {Object} config - Airbase configuration
   * @returns {Airbase}
   */
  addAirbase(config) {
    const airbase = new Airbase(config);
    this.airbases.push(airbase);
    this.airbaseById.set(airbase.id, airbase);

    // Rebuild spatial index
    this.buildChunkIndex();

    return airbase;
  }

  /**
   * Ensure at least one airbase exists near a given position
   * @param {number} nearX - X coordinate to check near
   * @param {number} nearZ - Z coordinate to check near
   * @param {number} maxDistance - Maximum distance to consider "near" (default: 50000ft)
   * @returns {Airbase|null} - The added airbase, or null if one already exists
   */
  ensureStarterAirbase(nearX = 0, nearZ = 0, maxDistance = 50000) {
    const nearest = this.getNearestAirbase(nearX, nearZ);
    if (nearest && nearest.distance < maxDistance) {
      return null;
    }

    const offset = 15000;  // ~2.5nm from requested position
    console.log('AirbaseRegistry: Adding starter airbase near spawn');
    return this.addAirbase({
      id: 'homebase',
      name: 'Alpha Field',
      position: { x: nearX + offset, z: nearZ + offset },
      heading: 270,
      elevation: 0.1,
      runwayLength: 10000,
      runwayWidth: 150,
      tacanChannel: 42,
      ilsFrequency: 109.5,
      apronRadius: 500
    });
  }
}
