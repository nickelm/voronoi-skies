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
}
