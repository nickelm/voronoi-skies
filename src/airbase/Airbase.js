/**
 * Airbase - Data structure for an airfield with runway
 *
 * Represents a single airbase with its position, runway configuration,
 * and associated systems (TACAN, ILS).
 */

import { AirbaseFlattenZone } from './AirbaseFlattenZone.js';

export class Airbase {
  /**
   * @param {Object} config
   * @param {string} config.id - Unique identifier
   * @param {string} config.name - Display name
   * @param {Object} config.position - {x, z} world position of runway center
   * @param {number} config.heading - Runway heading in degrees (0-360, 0=north)
   * @param {number} config.elevation - Field elevation (normalized [-1, 1])
   * @param {number} config.runwayLength - Runway length in feet
   * @param {number} config.runwayWidth - Runway width in feet
   * @param {number} [config.tacanChannel] - TACAN station channel (optional)
   * @param {number} [config.ilsFrequency] - ILS frequency (optional)
   * @param {number} [config.apronRadius=500] - Terrain smoothing zone in feet
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.position = { ...config.position };
    this.heading = config.heading;
    this.elevation = config.elevation;
    this.runwayLength = config.runwayLength;
    this.runwayWidth = config.runwayWidth;
    this.tacanChannel = config.tacanChannel || null;
    this.ilsFrequency = config.ilsFrequency || null;
    this.apronRadius = config.apronRadius || 500;

    // Create flatten zone for terrain modification
    this.flattenZone = new AirbaseFlattenZone(this);

    // Compute runway endpoints
    this.computeRunwayEndpoints();
  }

  /**
   * Compute runway threshold positions (both ends)
   */
  computeRunwayEndpoints() {
    const headingRad = this.heading * Math.PI / 180;
    const halfLength = this.runwayLength / 2;
    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);

    // Primary threshold (start of runway based on heading)
    this.threshold = {
      x: this.position.x - halfLength * cos,
      z: this.position.z - halfLength * sin
    };

    // Opposite threshold
    this.oppositeThreshold = {
      x: this.position.x + halfLength * cos,
      z: this.position.z + halfLength * sin
    };

    // Runway number is heading / 10 (rounded)
    this.runwayNumber = Math.round(this.heading / 10) % 36 || 36;
    this.oppositeRunwayNumber = (this.runwayNumber + 18 - 1) % 36 + 1;
  }

  /**
   * Get axis-aligned bounding box for the runway + apron area
   * Used for chunk intersection tests
   * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}}
   */
  getBounds() {
    return this.flattenZone.bounds;
  }

  /**
   * Check if this airbase's flatten zone intersects with given bounds
   * @param {Array} bounds - [minX, minZ, maxX, maxZ]
   * @returns {boolean}
   */
  intersectsBounds(bounds) {
    const [minX, minZ, maxX, maxZ] = bounds;
    const fb = this.flattenZone.bounds;

    // AABB intersection test
    return !(fb.maxX < minX || fb.minX > maxX ||
             fb.maxZ < minZ || fb.minZ > maxZ);
  }

  /**
   * Transform world coordinates to runway-local coordinates
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {{along: number, across: number}}
   */
  toRunwayLocal(worldX, worldZ) {
    return this.flattenZone.toRunwayLocal(worldX, worldZ);
  }

  /**
   * Transform runway-local coordinates to world coordinates
   * @param {number} along - Distance along runway from center
   * @param {number} across - Distance perpendicular to runway
   * @returns {{x: number, z: number}}
   */
  runwayToWorld(along, across) {
    return this.flattenZone.runwayToWorld(along, across);
  }

  /**
   * Get the distance from a point to the runway threshold
   * Used for approach angle calculations
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {number} - Distance in feet
   */
  getDistanceToThreshold(worldX, worldZ) {
    const dx = worldX - this.threshold.x;
    const dz = worldZ - this.threshold.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Format runway number as string (e.g., "09", "27", "36")
   * @param {number} num - Runway number (1-36)
   * @returns {string}
   */
  static formatRunwayNumber(num) {
    return num.toString().padStart(2, '0');
  }

  /**
   * Get formatted runway designator (e.g., "RWY 27")
   * @returns {string}
   */
  getRunwayDesignator() {
    return `RWY ${Airbase.formatRunwayNumber(this.runwayNumber)}`;
  }

  /**
   * Serialize airbase for storage or transfer
   * @returns {Object}
   */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      position: { ...this.position },
      heading: this.heading,
      elevation: this.elevation,
      runwayLength: this.runwayLength,
      runwayWidth: this.runwayWidth,
      tacanChannel: this.tacanChannel,
      ilsFrequency: this.ilsFrequency,
      apronRadius: this.apronRadius
    };
  }
}
