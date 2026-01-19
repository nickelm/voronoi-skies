/**
 * PAPILights - Precision Approach Path Indicator lights for glideslope indication
 *
 * PAPI lights provide visual glideslope information to pilots:
 * - All white: too high
 * - 2 white / 2 red: on glideslope (3 degrees)
 * - All red: too low
 *
 * NOTE: Lights face UP for top-down view (not toward approaching aircraft)
 */

import * as THREE from 'three';
import { PAPI_CONFIG, AIRBASE_COLORS, RUNWAY_DEFAULTS } from '../data/airbases.js';

export class PAPILights {
  /**
   * @param {Object} airbase - Airbase instance
   */
  constructor(airbase) {
    this.airbase = airbase;

    // Three.js group containing all PAPI lights
    this.group = new THREE.Group();
    this.group.name = `papi_${airbase.id}`;

    // Light meshes and materials for color updates
    this.lights = [];
    this.materials = [];

    // PAPI configuration
    this.config = PAPI_CONFIG;

    // Elevation scale (matches terrain)
    this.elevationScale = RUNWAY_DEFAULTS.elevationScale;

    // Build PAPI lights
    this.buildLights();
  }

  /**
   * Build the 4 PAPI lights beside the runway
   */
  buildLights() {
    const headingRad = this.airbase.heading * Math.PI / 180;
    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);

    // World elevation in scaled units
    const worldElevation = this.airbase.elevation * this.elevationScale;

    // Position PAPI lights beside runway, near threshold
    // Offset from centerline (on left side when approaching)
    const offsetFromCenterline = this.airbase.runwayWidth / 2 + this.config.offsetFromCenterline;

    for (let i = 0; i < 4; i++) {
      // Create light geometry (disc facing up)
      const geometry = new THREE.CircleGeometry(this.config.lightRadius, 8);
      const material = new THREE.MeshBasicMaterial({
        color: AIRBASE_COLORS.papiWhite,
        side: THREE.DoubleSide
      });

      const light = new THREE.Mesh(geometry, material);

      // Position along runway from threshold
      const alongOffset = this.config.distanceFromThreshold + i * this.config.lightSpacing;

      // Position relative to threshold
      // On left side of runway when approaching (negative across offset)
      const acrossOffset = -offsetFromCenterline;

      // Transform to world coordinates
      const worldX = this.airbase.threshold.x + alongOffset * cos - acrossOffset * sin;
      const worldZ = this.airbase.threshold.z + alongOffset * sin + acrossOffset * cos;

      // Position light facing UP (XY plane, Z is up)
      light.position.set(worldX, worldZ, worldElevation + this.config.lightHeight);

      // No rotation needed - circle already faces up in XY plane with Z as up

      // Store for updates
      this.lights.push(light);
      this.materials.push(material);
      light.userData.papiIndex = i;

      this.group.add(light);
    }
  }

  /**
   * Update PAPI light colors based on aircraft position
   * @param {number} aircraftX - Aircraft world X position
   * @param {number} aircraftZ - Aircraft world Z position (horizontal)
   * @param {number} aircraftAltitude - Aircraft altitude in feet
   */
  updateColors(aircraftX, aircraftZ, aircraftAltitude) {
    // Calculate distance from threshold along approach path
    const distToThreshold = this.airbase.getDistanceToThreshold(aircraftX, aircraftZ);

    // Avoid division by zero
    if (distToThreshold < 100) {
      // Very close - show all red (too low to be on glideslope at threshold)
      for (let i = 0; i < 4; i++) {
        this.materials[i].color.setHex(AIRBASE_COLORS.papiRed);
      }
      return;
    }

    // Calculate altitude above field elevation
    const fieldElevation = this.airbase.elevation * this.elevationScale;
    const altitudeAboveField = aircraftAltitude - fieldElevation;

    // Calculate current approach angle (degrees)
    const approachAngle = Math.atan2(altitudeAboveField, distToThreshold) * 180 / Math.PI;

    // Update each light based on its threshold angle
    // Each light has a different angle threshold
    // If aircraft angle > light threshold: white (too high for that light)
    // If aircraft angle <= light threshold: red (at or below that light's path)
    const thresholds = this.config.angles;

    for (let i = 0; i < 4; i++) {
      const isWhite = approachAngle > thresholds[i];
      this.materials[i].color.setHex(
        isWhite ? AIRBASE_COLORS.papiWhite : AIRBASE_COLORS.papiRed
      );
    }
  }

  /**
   * Get the current glideslope status as text
   * @param {number} aircraftX
   * @param {number} aircraftZ
   * @param {number} aircraftAltitude
   * @returns {string} - 'HIGH', 'ON GLIDE', 'LOW', 'SLIGHTLY HIGH', 'SLIGHTLY LOW'
   */
  getGlideslopeStatus(aircraftX, aircraftZ, aircraftAltitude) {
    const distToThreshold = this.airbase.getDistanceToThreshold(aircraftX, aircraftZ);
    if (distToThreshold < 100) return 'AT THRESHOLD';

    const fieldElevation = this.airbase.elevation * this.elevationScale;
    const altitudeAboveField = aircraftAltitude - fieldElevation;
    const approachAngle = Math.atan2(altitudeAboveField, distToThreshold) * 180 / Math.PI;

    const thresholds = this.config.angles;

    // Count white lights
    let whiteCount = 0;
    for (let i = 0; i < 4; i++) {
      if (approachAngle > thresholds[i]) whiteCount++;
    }

    switch (whiteCount) {
      case 0: return 'LOW';
      case 1: return 'SLIGHTLY LOW';
      case 2: return 'ON GLIDE';
      case 3: return 'SLIGHTLY HIGH';
      case 4: return 'HIGH';
      default: return 'UNKNOWN';
    }
  }

  /**
   * Dispose of all Three.js resources
   */
  dispose() {
    for (const light of this.lights) {
      if (light.geometry) light.geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }

    // Remove from parent if attached
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }

    this.lights = [];
    this.materials = [];
  }
}
