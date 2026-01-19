/**
 * CellBorderRenderer - Draws borders between Voronoi cells
 * Renders as an overlay on top of all cells (no stencil masking)
 * Uses NDC coordinates [-1, 1] to match StencilRenderer
 */

import * as THREE from 'three';

export class CellBorderRenderer {
  constructor() {
    // Orthographic camera in NDC coordinates: [-1, 1] range
    // Matches the mask camera in StencilRenderer
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Scene for border geometry
    this.scene = new THREE.Scene();

    // Border line material - green for visibility during testing
    this.borderMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 2
    });

    // Border mesh (LineSegments)
    this.borderMesh = null;
  }

  /**
   * Convert screen coordinates to NDC [-1, 1]
   * @param {number} screenX - Screen X (0 = left edge)
   * @param {number} screenY - Screen Y (0 = top edge)
   * @returns {Array} [ndcX, ndcY] in range [-1, 1]
   */
  screenToNDC(screenX, screenY) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = 1 - (screenY / height) * 2;
    return [ndcX, ndcY];
  }

  /**
   * Build border geometry from Voronoi cell polygons
   * @param {Array} cells - Array of VoronoiCell instances
   */
  updateFromCells(cells) {
    // Dispose old geometry
    if (this.borderMesh) {
      this.borderMesh.geometry.dispose();
      this.scene.remove(this.borderMesh);
      this.borderMesh = null;
    }

    if (!cells || cells.length === 0) return;

    const positions = [];

    // Collect all cell edges and convert to NDC
    for (const cell of cells) {
      if (!cell.polygon) continue;

      const polygon = cell.polygon;
      for (let i = 0; i < polygon.length - 1; i++) {
        const [x1, y1] = this.screenToNDC(polygon[i][0], polygon[i][1]);
        const [x2, y2] = this.screenToNDC(polygon[i + 1][0], polygon[i + 1][1]);
        positions.push(x1, y1, 0, x2, y2, 0);
      }
    }

    if (positions.length === 0) return;

    // Create geometry from positions
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3));

    this.borderMesh = new THREE.LineSegments(geometry, this.borderMaterial);
    this.scene.add(this.borderMesh);
  }

  /**
   * Render borders (call after all cells have been rendered)
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
   */
  render(renderer) {
    if (!this.borderMesh) return;

    // Disable depth test so borders draw on top
    const gl = renderer.getContext();
    gl.disable(gl.DEPTH_TEST);

    renderer.render(this.scene, this.camera);

    // Re-enable depth test
    gl.enable(gl.DEPTH_TEST);
  }

  /**
   * Handle window resize
   * NDC camera is fixed [-1, 1], no update needed
   * Border geometry will be rebuilt when computeVoronoi() is called
   */
  onResize(width, height) {
    // NDC camera doesn't need updating - coordinates are normalized
    // Borders will be rebuilt via updateFromCells() after Voronoi recomputation
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.borderMesh) {
      this.borderMesh.geometry.dispose();
    }
    this.borderMaterial.dispose();
  }
}
