/**
 * AirbaseCellController - Manages airbase cell lifecycle and camera behavior
 *
 * Handles dynamic creation/destruction of airbase cells based on detection range,
 * seed positioning based on bearing/distance, and smooth merge transitions.
 */

import * as THREE from 'three';

// State machine states
const AirbaseCellState = {
  INACTIVE: 'inactive',   // No airbase in range
  ACTIVE: 'active',       // Cell visible, normal operation
  MERGING: 'merging',     // Transition animation in progress
  MERGED: 'merged'        // Cells combined, single view
};

// Configuration constants
const CONFIG = {
  detectionRangeFt: 40 * 6076,    // 40nm in feet
  mergeRangeFt: 2 * 6076,         // 2nm in feet
  mergeDuration: 1.5,             // seconds
  cameraHeight: 500,              // feet above runway
  cameraBackDistance: 1000,       // feet behind threshold
  cameraFOV: 60,
  maxSeedRadius: 0.35,            // fraction of screen dimension
  minSeedRadius: 50               // pixels (before merge takes over)
};

export class AirbaseCellController {
  /**
   * @param {AirbaseRegistry} airbaseRegistry - Registry for airbase queries
   * @param {VoronoiCellManager} cellManager - Manager for cell operations
   */
  constructor(airbaseRegistry, cellManager) {
    this.registry = airbaseRegistry;
    this.cellManager = cellManager;

    // Current state
    this.state = AirbaseCellState.INACTIVE;
    this.trackedAirbase = null;
    this.airbaseCell = null;

    // Merge transition state
    this.mergeProgress = 0;
    this.mergeDirection = 1;  // 1 = merging, -1 = unmerging

    // Camera blending state (captured at merge start)
    this.sourcePos = new THREE.Vector3();
    this.sourceLookAt = new THREE.Vector3();
    this.sourceFOV = CONFIG.cameraFOV;

    // Reusable vectors for calculations
    this._tempVec = new THREE.Vector3();
    this._lookAtVec = new THREE.Vector3();
  }

  /**
   * Update controller each frame
   * @param {number} playerX - Player world X position
   * @param {number} playerZ - Player world Z position (Y in terrain coords)
   * @param {number} playerAltitude - Player altitude in feet
   * @param {number} deltaTime - Frame delta in seconds
   */
  update(playerX, playerZ, playerAltitude, deltaTime) {
    // Query nearest airbase
    const nearest = this.registry.getNearestAirbase(playerX, playerZ);
    if (!nearest) {
      this.handleNoAirbase();
      return;
    }

    const { airbase, distance } = nearest;

    // State machine update
    switch (this.state) {
      case AirbaseCellState.INACTIVE:
        this.updateInactive(airbase, distance);
        break;

      case AirbaseCellState.ACTIVE:
        this.updateActive(airbase, distance, playerX, playerZ, deltaTime);
        break;

      case AirbaseCellState.MERGING:
        this.updateMerging(airbase, distance, deltaTime);
        break;

      case AirbaseCellState.MERGED:
        this.updateMerged(airbase, distance);
        break;
    }
  }

  /**
   * Handle case when no airbase exists in registry
   */
  handleNoAirbase() {
    if (this.state !== AirbaseCellState.INACTIVE) {
      this.deactivateCell();
    }
  }

  /**
   * Update in INACTIVE state - check for detection
   */
  updateInactive(airbase, distance) {
    if (distance < CONFIG.detectionRangeFt) {
      this.activateCell(airbase);
    }
  }

  /**
   * Update in ACTIVE state - update seed position, check for merge trigger
   */
  updateActive(airbase, distance, playerX, playerZ, deltaTime) {
    // Check if airbase went out of range
    if (distance > CONFIG.detectionRangeFt) {
      this.deactivateCell();
      return;
    }

    // Check if we should switch to tracking a closer airbase
    if (airbase.id !== this.trackedAirbase.id) {
      this.switchTrackedAirbase(airbase);
    }

    // Update seed position based on bearing and distance
    this.updateSeedPosition(playerX, playerZ, airbase, distance);

    // Update camera to show runway
    this.setupRunwayCamera(airbase, this.airbaseCell.camera);

    // Check for merge trigger
    if (distance < CONFIG.mergeRangeFt) {
      this.startMerge();
    }
  }

  /**
   * Update in MERGING state - animate camera blend
   */
  updateMerging(airbase, distance, deltaTime) {
    // Check if player backed off - reverse merge
    if (distance > CONFIG.mergeRangeFt) {
      this.mergeDirection = -1;
    } else {
      this.mergeDirection = 1;
    }

    // Update merge progress
    this.mergeProgress += (deltaTime / CONFIG.mergeDuration) * this.mergeDirection;
    this.mergeProgress = Math.max(0, Math.min(1, this.mergeProgress));

    // Get player cell camera for blending target
    const playerCell = this.cellManager.getPlayerCell();
    if (!playerCell) return;

    // Blend cameras
    this.blendCameras(this.mergeProgress, this.airbaseCell.camera, playerCell.camera);

    // Animate seed toward player seed
    this.animateSeedForMerge(playerCell);

    // Recompute Voronoi with updated seed
    this.cellManager.computeVoronoi();

    // Check for state transitions
    if (this.mergeProgress >= 1) {
      this.completeMerge();
    } else if (this.mergeProgress <= 0) {
      // Fully reversed - back to ACTIVE
      this.state = AirbaseCellState.ACTIVE;
      this.mergeProgress = 0;
    }
  }

  /**
   * Update in MERGED state - check for unmerge trigger
   */
  updateMerged(airbase, distance) {
    // If player moves away, start unmerge
    if (distance > CONFIG.mergeRangeFt) {
      this.startUnmerge(airbase);
    }
  }

  /**
   * Activate airbase cell when entering detection range
   */
  activateCell(airbase) {
    this.trackedAirbase = airbase;
    this.airbaseCell = this.cellManager.addCell('airbase');
    this.state = AirbaseCellState.ACTIVE;

    // Initial seed position will be set on first update
    console.log(`AirbaseCellController: Activated cell for ${airbase.name}`);
  }

  /**
   * Deactivate airbase cell when exiting detection range
   */
  deactivateCell() {
    if (this.airbaseCell) {
      this.cellManager.removeCell(this.airbaseCell);
      this.airbaseCell = null;
    }
    this.trackedAirbase = null;
    this.state = AirbaseCellState.INACTIVE;
    this.mergeProgress = 0;

    console.log('AirbaseCellController: Deactivated cell');
  }

  /**
   * Switch to tracking a different (closer) airbase
   */
  switchTrackedAirbase(newAirbase) {
    this.trackedAirbase = newAirbase;
    console.log(`AirbaseCellController: Switched to tracking ${newAirbase.name}`);
  }

  /**
   * Start merge transition
   */
  startMerge() {
    this.state = AirbaseCellState.MERGING;
    this.mergeDirection = 1;
    this.mergeProgress = 0;

    // Capture current camera state as source for blending
    this.sourcePos.copy(this.airbaseCell.camera.position);
    this.sourceLookAt.set(
      this.trackedAirbase.oppositeThreshold.x,
      0,
      this.trackedAirbase.oppositeThreshold.z
    );
    this.sourceFOV = this.airbaseCell.camera.fov;

    // Capture source seed position
    this.sourceSeedX = this.airbaseCell.seed.x;
    this.sourceSeedY = this.airbaseCell.seed.y;

    console.log('AirbaseCellController: Starting merge');
  }

  /**
   * Complete merge transition
   */
  completeMerge() {
    this.state = AirbaseCellState.MERGED;

    // Remove the airbase cell - now showing single view
    if (this.airbaseCell) {
      this.cellManager.removeCell(this.airbaseCell);
      this.airbaseCell = null;
    }

    console.log('AirbaseCellController: Merge complete');
  }

  /**
   * Start unmerge transition (player backing off from merged state)
   */
  startUnmerge(airbase) {
    // Recreate the airbase cell
    this.airbaseCell = this.cellManager.addCell('airbase');
    this.trackedAirbase = airbase;

    // Start merge in reverse
    this.state = AirbaseCellState.MERGING;
    this.mergeDirection = -1;
    this.mergeProgress = 1;

    // Capture camera state (will be player camera initially)
    const playerCell = this.cellManager.getPlayerCell();
    if (playerCell) {
      this.sourcePos.copy(playerCell.camera.position);
      this.sourceFOV = playerCell.camera.fov;
    }

    // Set seed at player position (will animate outward)
    const playerSeed = playerCell ? playerCell.seed : { x: window.innerWidth / 2, y: window.innerHeight * 0.7 };
    this.airbaseCell.seed.x = playerSeed.x;
    this.airbaseCell.seed.y = playerSeed.y;
    this.sourceSeedX = playerSeed.x;
    this.sourceSeedY = playerSeed.y;

    console.log('AirbaseCellController: Starting unmerge');
  }

  /**
   * Compute seed position based on bearing and distance
   */
  updateSeedPosition(playerX, playerZ, airbase, distance) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Bearing from player to airbase
    const bearing = Math.atan2(
      airbase.position.x - playerX,
      airbase.position.z - playerZ
    );

    // Player seed at bottom-center
    const playerSeedX = screenW / 2;
    const playerSeedY = screenH * 0.7;

    // Normalize distance: 0 = at merge range, 1 = at detection edge
    const normalizedDist = Math.max(0, Math.min(1,
      (distance - CONFIG.mergeRangeFt) / (CONFIG.detectionRangeFt - CONFIG.mergeRangeFt)
    ));

    // Map to screen radius
    const maxRadius = Math.min(screenW, screenH) * CONFIG.maxSeedRadius;
    const seedRadius = CONFIG.minSeedRadius + normalizedDist * (maxRadius - CONFIG.minSeedRadius);

    // Convert bearing to screen direction
    // Screen Y increases downward, bearing 0 = north = up on screen
    const screenAngle = -bearing + Math.PI;

    this.airbaseCell.seed.x = playerSeedX + Math.sin(screenAngle) * seedRadius;
    this.airbaseCell.seed.y = playerSeedY - Math.cos(screenAngle) * seedRadius * 0.6;  // Compress Y for top placement

    // Recompute Voronoi
    this.cellManager.computeVoronoi();
  }

  /**
   * Animate seed position during merge
   */
  animateSeedForMerge(playerCell) {
    const t = this.smoothstep(this.mergeProgress);

    // Target is player seed
    const targetX = playerCell.seed.x;
    const targetY = playerCell.seed.y;

    // Interpolate from source to target
    this.airbaseCell.seed.x = this.sourceSeedX + (targetX - this.sourceSeedX) * t;
    this.airbaseCell.seed.y = this.sourceSeedY + (targetY - this.sourceSeedY) * t;
  }

  /**
   * Setup camera for runway approach view
   */
  setupRunwayCamera(airbase, camera) {
    const headingRad = airbase.heading * Math.PI / 180;

    // Position behind threshold along runway heading
    const camX = airbase.threshold.x - Math.cos(headingRad) * CONFIG.cameraBackDistance;
    const camZ = airbase.threshold.z - Math.sin(headingRad) * CONFIG.cameraBackDistance;

    camera.position.set(camX, CONFIG.cameraHeight, camZ);
    camera.lookAt(
      airbase.oppositeThreshold.x,
      0,
      airbase.oppositeThreshold.z
    );
    camera.fov = CONFIG.cameraFOV;
    camera.updateProjectionMatrix();
  }

  /**
   * Blend camera parameters during merge transition
   */
  blendCameras(progress, airbaseCamera, playerCamera) {
    const t = this.smoothstep(progress);

    // Interpolate position
    airbaseCamera.position.lerpVectors(this.sourcePos, playerCamera.position, t);

    // Interpolate lookAt
    // Source lookAt is runway end, target is whatever player camera is looking at
    // For simplicity, blend toward a point in front of player camera
    this._tempVec.set(0, 0, -1000);
    this._tempVec.applyQuaternion(playerCamera.quaternion);
    this._tempVec.add(playerCamera.position);

    this._lookAtVec.lerpVectors(this.sourceLookAt, this._tempVec, t);
    airbaseCamera.lookAt(this._lookAtVec);

    // Interpolate FOV
    airbaseCamera.fov = this.sourceFOV + (playerCamera.fov - this.sourceFOV) * t;
    airbaseCamera.updateProjectionMatrix();
  }

  /**
   * Smoothstep interpolation function
   */
  smoothstep(t) {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
  }

  /**
   * Get current state (for debugging)
   */
  getState() {
    return {
      state: this.state,
      trackedAirbase: this.trackedAirbase?.name || null,
      mergeProgress: this.mergeProgress
    };
  }
}
