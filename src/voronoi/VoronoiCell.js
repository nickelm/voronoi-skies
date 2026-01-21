/**
 * VoronoiCell - Data structure for a single Voronoi viewport cell
 * Each cell has its own camera for rendering a different view
 */

import * as THREE from 'three';
import { smoothstep } from '../utils/math.js';

export class VoronoiCell {
  /**
   * @param {Object} config
   * @param {number} config.id - Unique cell identifier
   * @param {string} config.type - Cell type: 'player' | 'target' | 'ui'
   * @param {string} [config.cameraType='perspective'] - Camera type: 'perspective' | 'orthographic'
   * @param {THREE.Scene} [config.scene=null] - Dedicated scene for UI cells
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

    // Camera type: 'perspective' for 3D world cells, 'orthographic' for 2D UI cells
    this.cameraType = config.cameraType || 'perspective';

    // Dedicated scene for UI cells (null for 3D cells that share the world scene)
    this.scene = config.scene || null;

    // Create camera based on type
    if (this.cameraType === 'orthographic') {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      this.camera = new THREE.OrthographicCamera(
        -screenW / 2, screenW / 2,
        screenH / 2, -screenH / 2,
        0.1, 100
      );
      this.camera.position.z = 10;
    } else {
      this.camera = new THREE.PerspectiveCamera(60, 1, 1, 20000);
    }

    // World position this camera looks at
    this.cameraTarget = { x: 0, y: 0 };
    this.cameraDistance = 600;  // Distance from target (matches main camera Z)

    // Target tracking properties (Phase 2)
    this.target = null;                    // Reference to tracked entity
    this.worldPosition = { x: 0, z: 0 };   // World position of target
    this.onScreen = true;                  // Whether target is within player viewport

    // Camera altitude/zoom properties
    // terrainZ: actually stores CAMERA Z for this cell (legacy name)
    // Terrain is FIXED at Z=0. Camera Z controls zoom level.
    // Lower values = closer to terrain = zoomed in, Higher values = farther = zoomed out
    this.terrainZ = null;                  // null means "use player's camera Z"

    // Projected screen position (updated each frame for blending calculations)
    this.projectedX = 0;
    this.projectedY = 0;
  }

  /**
   * Set the cell's independent camera Z (zoom level)
   * Note: "terrainZ" is a legacy name - this actually sets CAMERA Z position.
   * @param {number} cameraZ - Camera Z value (500 = close/zoomed in, higher = zoomed out)
   */
  setTerrainZ(cameraZ) {
    this.terrainZ = cameraZ;
  }

  /**
   * Set the cell's projected screen position (for blending calculations)
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   */
  setProjectedPosition(x, y) {
    this.projectedX = x;
    this.projectedY = y;
  }

  /**
   * Calculate blended camera Z based on screen position
   *
   * When cell is on-screen: use player's camera Z (same zoom)
   * When cell is off-screen: use cell's own camera Z (independent zoom)
   * Transition uses smoothstep for smooth visual blending
   *
   * Note: "terrainZ" is a legacy name - this actually stores CAMERA Z position.
   * The terrain is FIXED at Z=0. Camera Z controls zoom level.
   *
   * @param {number} playerCameraZ - Current player camera Z
   * @param {number} visibilityMargin - Margin inside screen edge for "on-screen" (default 10)
   * @param {number} blendMargin - Distance beyond screen edge for full cell altitude (default 100)
   * @returns {number} Blended camera Z for this cell
   */
  getBlendedTerrainZ(playerCameraZ, visibilityMargin = 10, blendMargin = 100) {
    // If no independent camera Z set, always use player's
    if (this.terrainZ === null) {
      return playerCameraZ;
    }

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Calculate distance to nearest screen edge (positive = inside, negative = outside)
    const distToLeft = this.projectedX;
    const distToRight = screenW - this.projectedX;
    const distToTop = this.projectedY;
    const distToBottom = screenH - this.projectedY;
    const minDistToEdge = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    // If well inside screen, use player's camera Z
    if (minDistToEdge > visibilityMargin) {
      return playerCameraZ;
    }

    // If well outside screen, use cell's own camera Z
    if (minDistToEdge < -blendMargin) {
      return this.terrainZ;
    }

    // In transition zone: smoothstep blend
    const t = smoothstep(-blendMargin, visibilityMargin, minDistToEdge);
    return this.terrainZ + t * (playerCameraZ - this.terrainZ);
  }

  /**
   * Update the orthographic camera frustum to center on seed position
   * This is the key technique for 2D UI cells - adjusting the frustum bounds
   * so that world origin (0,0) maps to the seed position on screen.
   */
  updateOrthographicFrustum() {
    if (this.cameraType !== 'orthographic') return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Adjust frustum so origin maps to seed position
    // When camera.left = -seed.x, world X=0 maps to screen X=seed.x
    this.camera.left = -this.seed.x;
    this.camera.right = screenW - this.seed.x;
    this.camera.top = this.seed.y;
    this.camera.bottom = this.seed.y - screenH;
    this.camera.updateProjectionMatrix();
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
   * Check if a screen point is inside this cell's polygon
   * Uses ray casting algorithm for point-in-polygon test
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @returns {boolean} True if point is inside polygon
   */
  containsPoint(x, y) {
    if (!this.polygon || this.polygon.length < 3) return false;

    let inside = false;
    const n = this.polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = this.polygon[i][0], yi = this.polygon[i][1];
      const xj = this.polygon[j][0], yj = this.polygon[j][1];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
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
