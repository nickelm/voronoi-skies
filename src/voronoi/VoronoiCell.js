/**
 * VoronoiCell - Data structure for a single Voronoi viewport cell
 * Each cell has its own camera for rendering a different view
 */

import * as THREE from 'three';

export class VoronoiCell {
  /**
   * @param {Object} config
   * @param {number} config.id - Unique cell identifier
   * @param {string} config.type - Cell type: 'player' | 'target'
   */
  constructor(config) {
    this.id = config.id;
    this.type = config.type;

    // Screen-space seed position for Voronoi computation
    this.seed = { x: 0, y: 0 };

    // Polygon vertices from d3-delaunay (array of [x, y] pairs)
    this.polygon = null;

    // Axis-aligned bounding box for scissor optimization
    this.aabb = { x: 0, y: 0, width: 0, height: 0 };

    // Each cell has its own perspective camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 1, 20000);

    // World position this camera looks at
    this.cameraTarget = { x: 0, y: 0 };
    this.cameraDistance = 600;  // Distance from target (matches main camera Z)

    // Target tracking properties (Phase 2)
    this.target = null;                    // Reference to tracked entity
    this.worldPosition = { x: 0, z: 0 };   // World position of target
    this.onScreen = true;                  // Whether target is within player viewport
    this.cameraAltitude = 80;              // Camera height for this cell's view
  }

  /**
   * Update the cell's polygon from Voronoi computation
   * @param {Array} polygon - Array of [x, y] screen-space vertices
   */
  updatePolygon(polygon) {
    this.polygon = polygon;
    this.computeAABB();
  }

  /**
   * Compute axis-aligned bounding box from polygon vertices
   * Used for scissor rect optimization
   */
  computeAABB() {
    if (!this.polygon || this.polygon.length === 0) {
      this.aabb = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const [x, y] of this.polygon) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    this.aabb = {
      x: Math.floor(minX),
      y: Math.floor(minY),
      width: Math.ceil(maxX - minX),
      height: Math.ceil(maxY - minY)
    };
  }

  /**
   * Update camera to match main camera settings
   * For now, all cells render the same view - just proving stencil works
   * @param {THREE.Camera} mainCamera - The main scene camera to copy from
   */
  updateCameraFromMain(mainCamera) {
    // Copy position and rotation from main camera
    this.camera.position.copy(mainCamera.position);
    this.camera.rotation.copy(mainCamera.rotation);
    this.camera.fov = mainCamera.fov;
    this.camera.aspect = mainCamera.aspect;
    this.camera.near = mainCamera.near;
    this.camera.far = mainCamera.far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update camera with offset for target cell
   * Creates a slightly different view to prove cells are independent
   * @param {THREE.Camera} mainCamera - The main scene camera
   * @param {number} offsetX - X offset from main camera
   * @param {number} offsetY - Y offset from main camera
   */
  updateCameraWithOffset(mainCamera, offsetX = 0, offsetY = 0) {
    this.camera.position.set(
      mainCamera.position.x + offsetX,
      mainCamera.position.y + offsetY,
      mainCamera.position.z
    );
    this.camera.rotation.copy(mainCamera.rotation);
    this.camera.fov = mainCamera.fov;
    this.camera.aspect = mainCamera.aspect;
    this.camera.near = mainCamera.near;
    this.camera.far = mainCamera.far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update camera to view a target at specified world position (Phase 2)
   *
   * IMPORTANT: This game uses a different coordinate system than the test HTML:
   * - Terrain is a 2D plane in XY (not XZ)
   * - Camera looks along Z axis toward negative Z (not along Y)
   * - Terrain rotates around Z axis via pivotGroup.rotation.z
   * - World coords: X = east, Y = north, Z = altitude (but camera Z is distance)
   *
   * The main camera sits at Z=600 looking at origin. The terrain group is positioned
   * and rotated to show the correct view. For a target cell, we need to set up the
   * camera to view a different world position as if it were at the screen center.
   *
   * @param {number} targetWorldX - Target world X position
   * @param {number} targetWorldY - Target world Y position
   * @param {number} cameraZ - Camera Z distance (same as main camera, e.g., 600)
   * @param {number} playerHeading - Player heading in radians
   * @param {number} playerX - Player world X (for relative positioning)
   * @param {number} playerY - Player world Y (for relative positioning)
   * @param {THREE.Camera} mainCamera - Optional main camera to copy FOV/near/far from
   */
  updateCameraForTarget(targetWorldX, targetWorldY, cameraZ, playerHeading, playerX, playerY, mainCamera = null) {
    // Calculate offset from player to target in world coordinates
    const offsetX = targetWorldX - playerX;
    const offsetY = targetWorldY - playerY;

    // Apply heading rotation to get screen-space offset
    // Same rotation as terrain uses (pivotGroup.rotation.z = heading)
    const cos = Math.cos(playerHeading);
    const sin = Math.sin(playerHeading);
    const screenOffsetX = offsetX * cos - offsetY * sin;
    const screenOffsetY = offsetX * sin + offsetY * cos;

    // Position camera offset from origin by the rotated amount
    // The camera looks at its position minus Z, so we offset X and Y
    this.camera.position.set(screenOffsetX, screenOffsetY, cameraZ);
    this.camera.lookAt(screenOffsetX, screenOffsetY, 0);
    this.camera.up.set(0, 1, 0);  // Y is up in screen space

    // Copy FOV and clip planes from main camera if provided
    if (mainCamera) {
      this.camera.fov = mainCamera.fov;
      this.camera.near = mainCamera.near;
      this.camera.far = mainCamera.far;
    }

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
