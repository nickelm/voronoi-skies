/**
 * AirbaseFlattenZone - Defines the terrain flattening zone for an airbase runway
 *
 * The runway area is flattened to a constant elevation, with a smooth
 * transition zone (apron) blending back to natural terrain.
 */

/**
 * Smoothstep interpolation
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
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class AirbaseFlattenZone {
  /**
   * @param {Object} airbase - Airbase configuration
   * @param {Object} airbase.position - {x, z} world position of runway center
   * @param {number} airbase.heading - Runway heading in degrees
   * @param {number} airbase.elevation - Target elevation (normalized [-1, 1])
   * @param {number} airbase.runwayLength - Runway length in feet
   * @param {number} airbase.runwayWidth - Runway width in feet
   * @param {number} [airbase.apronRadius=500] - Smooth transition zone radius in feet
   */
  constructor(airbase) {
    this.airbase = airbase;

    // Runway geometry
    this.centerX = airbase.position.x;
    this.centerZ = airbase.position.z;
    this.headingRad = airbase.heading * Math.PI / 180;
    this.halfLength = airbase.runwayLength / 2;
    this.halfWidth = airbase.runwayWidth / 2;

    // Target elevation (normalized, will be converted to world units by terrain system)
    this.targetElevation = airbase.elevation;

    // Apron zone for smooth blending
    this.apronRadius = airbase.apronRadius || 500;

    // Pre-compute trig values for coordinate transforms
    this.cosHeading = Math.cos(-this.headingRad);
    this.sinHeading = Math.sin(-this.headingRad);

    // Compute AABB for quick rejection tests
    this.computeBounds();
  }

  /**
   * Compute axis-aligned bounding box that encompasses runway + apron
   */
  computeBounds() {
    // Total extent including apron
    const totalHalfLength = this.halfLength + this.apronRadius;
    const totalHalfWidth = this.halfWidth + this.apronRadius;

    // Get the four corners of the rotated rectangle
    const corners = [
      this.runwayToWorld(totalHalfLength, totalHalfWidth),
      this.runwayToWorld(totalHalfLength, -totalHalfWidth),
      this.runwayToWorld(-totalHalfLength, totalHalfWidth),
      this.runwayToWorld(-totalHalfLength, -totalHalfWidth)
    ];

    // Find AABB
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const corner of corners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minZ = Math.min(minZ, corner.z);
      maxZ = Math.max(maxZ, corner.z);
    }

    this.bounds = { minX, maxX, minZ, maxZ };
  }

  /**
   * Transform world coordinates to runway-local coordinates
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate
   * @returns {{along: number, across: number}} - Runway-local coords
   */
  toRunwayLocal(worldX, worldZ) {
    // Translate to runway center
    const dx = worldX - this.centerX;
    const dz = worldZ - this.centerZ;

    // Rotate by negative heading to get runway-aligned coords
    return {
      along: dx * this.cosHeading - dz * this.sinHeading,
      across: dx * this.sinHeading + dz * this.cosHeading
    };
  }

  /**
   * Transform runway-local coordinates to world coordinates
   * @param {number} along - Distance along runway from center
   * @param {number} across - Distance perpendicular to runway from centerline
   * @returns {{x: number, z: number}} - World coordinates
   */
  runwayToWorld(along, across) {
    // Rotate by positive heading
    const cos = Math.cos(this.headingRad);
    const sin = Math.sin(this.headingRad);

    return {
      x: this.centerX + along * cos - across * sin,
      z: this.centerZ + along * sin + across * cos
    };
  }

  /**
   * Check if world coordinates are within the AABB (quick rejection)
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {boolean}
   */
  inBounds(worldX, worldZ) {
    return worldX >= this.bounds.minX && worldX <= this.bounds.maxX &&
           worldZ >= this.bounds.minZ && worldZ <= this.bounds.maxZ;
  }

  /**
   * Compute distance from runway rectangle edge (0 if inside runway)
   * @param {number} along - Runway-local along coordinate
   * @param {number} across - Runway-local across coordinate
   * @returns {number} - Distance from runway edge (0 if inside)
   */
  distanceFromRunway(along, across) {
    // Distance from edge in each dimension (negative if inside)
    const distAlong = Math.max(0, Math.abs(along) - this.halfLength);
    const distAcross = Math.max(0, Math.abs(across) - this.halfWidth);

    // Euclidean distance from rectangle
    return Math.sqrt(distAlong * distAlong + distAcross * distAcross);
  }

  /**
   * Get modified elevation for a world position
   * @param {number} worldX - World X coordinate
   * @param {number} worldZ - World Z coordinate (note: terrain uses Y for horizontal)
   * @param {number} naturalElevation - Natural terrain elevation at this point
   * @returns {{elevation: number, modified: boolean}}
   */
  getModifiedElevation(worldX, worldZ, naturalElevation) {
    // Quick AABB rejection
    if (!this.inBounds(worldX, worldZ)) {
      return { elevation: naturalElevation, modified: false };
    }

    // Transform to runway-local coordinates
    const local = this.toRunwayLocal(worldX, worldZ);

    // Check if inside runway rectangle
    if (Math.abs(local.along) <= this.halfLength &&
        Math.abs(local.across) <= this.halfWidth) {
      return { elevation: this.targetElevation, modified: true };
    }

    // Check if in apron zone
    const dist = this.distanceFromRunway(local.along, local.across);
    if (dist < this.apronRadius) {
      // Smoothstep blend from runway edge to apron edge
      const t = smoothstep(0, this.apronRadius, dist);
      const blendedElev = lerp(this.targetElevation, naturalElevation, t);
      return { elevation: blendedElev, modified: true };
    }

    return { elevation: naturalElevation, modified: false };
  }

  /**
   * Serialize for transfer to Web Worker
   * @returns {Object} - Plain object with all data needed for flattening
   */
  serialize() {
    return {
      centerX: this.centerX,
      centerZ: this.centerZ,
      headingRad: this.headingRad,
      halfLength: this.halfLength,
      halfWidth: this.halfWidth,
      targetElevation: this.targetElevation,
      apronRadius: this.apronRadius,
      cosHeading: this.cosHeading,
      sinHeading: this.sinHeading,
      bounds: { ...this.bounds }
    };
  }
}
