/**
 * RunwayMesh - Creates Three.js mesh for runway with markings
 *
 * Renders the runway surface and markings (threshold, centerline, numbers)
 * in an 8-bit pixel art style.
 */

import * as THREE from 'three';
import {
  AIRBASE_COLORS,
  MARKING_DIMENSIONS,
  RUNWAY_DEFAULTS
} from '../data/airbases.js';

export class RunwayMesh {
  /**
   * @param {Object} airbase - Airbase instance
   */
  constructor(airbase) {
    this.airbase = airbase;

    // Three.js group containing all runway elements
    this.group = new THREE.Group();
    this.group.name = `runway_${airbase.id}`;

    // Elevation scale (matches terrain)
    this.elevationScale = RUNWAY_DEFAULTS.elevationScale;

    // World elevation in scaled units
    this.worldElevation = airbase.elevation * this.elevationScale;

    // Build runway components
    this.buildRunwaySurface();
    this.buildThresholdMarkings();
    this.buildCenterline();
    this.buildRunwayNumbers();
  }

  /**
   * Build the main runway surface (gray asphalt)
   */
  buildRunwaySurface() {
    const geometry = new THREE.PlaneGeometry(
      this.airbase.runwayLength,
      this.airbase.runwayWidth
    );

    const material = new THREE.MeshLambertMaterial({
      color: AIRBASE_COLORS.runway,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Position at runway center, rotated flat and oriented
    mesh.position.set(
      this.airbase.position.x,
      this.airbase.position.z,
      this.worldElevation + 0.5 // Slightly above terrain to prevent z-fighting
    );

    // Rotate to lie flat (XY plane -> XZ plane) then align with heading
    mesh.rotation.x = 0; // Already in XY, no rotation needed if we use Z as up
    mesh.rotation.z = -this.airbase.heading * Math.PI / 180;

    this.group.add(mesh);
    this.runwaySurface = mesh;
  }

  /**
   * Build threshold markings (piano keys) at both ends
   */
  buildThresholdMarkings() {
    const config = MARKING_DIMENSIONS.threshold;
    const headingRad = this.airbase.heading * Math.PI / 180;

    // Create markings for both thresholds
    this.buildThresholdEnd(
      this.airbase.threshold.x,
      this.airbase.threshold.z,
      headingRad,
      config
    );

    this.buildThresholdEnd(
      this.airbase.oppositeThreshold.x,
      this.airbase.oppositeThreshold.z,
      headingRad + Math.PI, // Opposite direction
      config
    );
  }

  /**
   * Build threshold markings for one end of runway
   */
  buildThresholdEnd(thresholdX, thresholdZ, headingRad, config) {
    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);

    // Total width of all bars
    const totalWidth = config.numBars * config.barWidth +
                      (config.numBars - 1) * config.gapWidth;
    const startOffset = -totalWidth / 2;

    for (let i = 0; i < config.numBars; i++) {
      const barGeometry = new THREE.PlaneGeometry(config.barLength, config.barWidth);
      const barMaterial = new THREE.MeshBasicMaterial({
        color: AIRBASE_COLORS.markings,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });

      const bar = new THREE.Mesh(barGeometry, barMaterial);

      // Position relative to threshold
      // alongOffset: distance along runway from threshold
      // acrossOffset: perpendicular distance from centerline
      const alongOffset = config.offsetFromEnd + config.barLength / 2;
      const acrossOffset = startOffset + i * (config.barWidth + config.gapWidth) + config.barWidth / 2;

      // Transform to world coordinates
      const worldX = thresholdX + alongOffset * cos - acrossOffset * sin;
      const worldZ = thresholdZ + alongOffset * sin + acrossOffset * cos;

      bar.position.set(worldX, worldZ, this.worldElevation + 1);
      bar.rotation.z = -this.airbase.heading * Math.PI / 180;

      this.group.add(bar);
    }
  }

  /**
   * Build centerline dashes along the runway
   */
  buildCenterline() {
    const config = MARKING_DIMENSIONS.centerline;
    const headingRad = this.airbase.heading * Math.PI / 180;
    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);

    // Calculate number of dashes
    const runwayLength = this.airbase.runwayLength;
    const cycleLength = config.dashLength + config.gapLength;
    const numDashes = Math.floor(runwayLength / cycleLength);

    // Start position (half runway length from center, plus half dash)
    const startAlong = -runwayLength / 2 + config.dashLength / 2 + 200; // 200ft margin from threshold

    for (let i = 0; i < numDashes; i++) {
      const dashGeometry = new THREE.PlaneGeometry(config.dashLength, config.width);
      const dashMaterial = new THREE.MeshBasicMaterial({
        color: AIRBASE_COLORS.markings,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });

      const dash = new THREE.Mesh(dashGeometry, dashMaterial);

      // Position along centerline
      const alongOffset = startAlong + i * cycleLength;

      // Transform to world coordinates
      const worldX = this.airbase.position.x + alongOffset * cos;
      const worldZ = this.airbase.position.z + alongOffset * sin;

      dash.position.set(worldX, worldZ, this.worldElevation + 1);
      dash.rotation.z = -this.airbase.heading * Math.PI / 180;

      this.group.add(dash);
    }
  }

  /**
   * Build runway numbers at both ends
   */
  buildRunwayNumbers() {
    const config = MARKING_DIMENSIONS.numbers;
    const headingRad = this.airbase.heading * Math.PI / 180;

    // Primary threshold number
    this.buildNumber(
      this.airbase.runwayNumber,
      this.airbase.threshold.x,
      this.airbase.threshold.z,
      headingRad,
      config
    );

    // Opposite threshold number
    this.buildNumber(
      this.airbase.oppositeRunwayNumber,
      this.airbase.oppositeThreshold.x,
      this.airbase.oppositeThreshold.z,
      headingRad + Math.PI,
      config
    );
  }

  /**
   * Build a runway number using simple geometry (8-bit style)
   * @param {number} num - Runway number (1-36)
   * @param {number} thresholdX
   * @param {number} thresholdZ
   * @param {number} headingRad
   * @param {Object} config
   */
  buildNumber(num, thresholdX, thresholdZ, headingRad, config) {
    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);

    // Format as two digits
    const numStr = num.toString().padStart(2, '0');

    // Position along runway from threshold
    const alongOffset = config.offsetFromThreshold;

    // Create each digit
    const digitSpacing = config.width * 1.5;
    const totalWidth = digitSpacing * 2;
    const startX = -totalWidth / 2 + config.width / 2;

    for (let i = 0; i < 2; i++) {
      const digit = parseInt(numStr[i]);
      const digitMesh = this.createDigitMesh(digit, config);

      if (digitMesh) {
        // Position relative to threshold
        const acrossOffset = startX + i * digitSpacing;

        // Transform to world coordinates
        const worldX = thresholdX + alongOffset * cos - acrossOffset * sin;
        const worldZ = thresholdZ + alongOffset * sin + acrossOffset * cos;

        digitMesh.position.set(worldX, worldZ, this.worldElevation + 1);
        digitMesh.rotation.z = -headingRad;

        this.group.add(digitMesh);
      }
    }
  }

  /**
   * Create a simple 7-segment style digit mesh
   * @param {number} digit - 0-9
   * @param {Object} config
   * @returns {THREE.Group}
   */
  createDigitMesh(digit, config) {
    const group = new THREE.Group();
    const segWidth = config.width;
    const segHeight = config.height / 2;
    const thickness = segWidth * 0.3;

    const material = new THREE.MeshBasicMaterial({
      color: AIRBASE_COLORS.markings,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });

    // 7-segment definitions: [top, topRight, bottomRight, bottom, bottomLeft, topLeft, middle]
    const segments = {
      0: [1, 1, 1, 1, 1, 1, 0],
      1: [0, 1, 1, 0, 0, 0, 0],
      2: [1, 1, 0, 1, 1, 0, 1],
      3: [1, 1, 1, 1, 0, 0, 1],
      4: [0, 1, 1, 0, 0, 1, 1],
      5: [1, 0, 1, 1, 0, 1, 1],
      6: [1, 0, 1, 1, 1, 1, 1],
      7: [1, 1, 1, 0, 0, 0, 0],
      8: [1, 1, 1, 1, 1, 1, 1],
      9: [1, 1, 1, 1, 0, 1, 1]
    };

    const pattern = segments[digit];
    if (!pattern) return null;

    // Segment positions relative to digit center
    // Horizontal segments
    const hGeo = new THREE.PlaneGeometry(segWidth * 0.6, thickness);
    // Vertical segments
    const vGeo = new THREE.PlaneGeometry(thickness, segHeight * 0.8);

    // Top horizontal
    if (pattern[0]) {
      const seg = new THREE.Mesh(hGeo, material);
      seg.position.set(0, segHeight * 0.9, 0);
      group.add(seg);
    }

    // Top right vertical
    if (pattern[1]) {
      const seg = new THREE.Mesh(vGeo, material);
      seg.position.set(segWidth * 0.35, segHeight * 0.45, 0);
      group.add(seg);
    }

    // Bottom right vertical
    if (pattern[2]) {
      const seg = new THREE.Mesh(vGeo, material);
      seg.position.set(segWidth * 0.35, -segHeight * 0.45, 0);
      group.add(seg);
    }

    // Bottom horizontal
    if (pattern[3]) {
      const seg = new THREE.Mesh(hGeo, material);
      seg.position.set(0, -segHeight * 0.9, 0);
      group.add(seg);
    }

    // Bottom left vertical
    if (pattern[4]) {
      const seg = new THREE.Mesh(vGeo, material);
      seg.position.set(-segWidth * 0.35, -segHeight * 0.45, 0);
      group.add(seg);
    }

    // Top left vertical
    if (pattern[5]) {
      const seg = new THREE.Mesh(vGeo, material);
      seg.position.set(-segWidth * 0.35, segHeight * 0.45, 0);
      group.add(seg);
    }

    // Middle horizontal
    if (pattern[6]) {
      const seg = new THREE.Mesh(hGeo, material);
      seg.position.set(0, 0, 0);
      group.add(seg);
    }

    return group;
  }

  /**
   * Dispose of all Three.js resources
   */
  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    // Remove from parent if attached
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
