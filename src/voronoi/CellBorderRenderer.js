/**
 * CellBorderRenderer - Draws borders between Voronoi cells
 * Renders as an overlay on top of all cells (no stencil masking)
 */

import * as THREE from 'three';

export class CellBorderRenderer {
  constructor() {
    // Orthographic camera for screen-space border rendering
    // Camera positioned at Z=1 looking at Z=0 where the border geometry is
    this.camera = new THREE.OrthographicCamera(
      0, window.innerWidth,
      window.innerHeight, 0,
      0.1, 10
    );
    this.camera.position.z = 1;

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

    const height = window.innerHeight;
    const positions = [];

    // Collect all cell edges
    // Flip Y coordinate: screen Y=0 at top -> WebGL Y=height at top
    for (const cell of cells) {
      if (!cell.polygon) continue;

      const polygon = cell.polygon;
      for (let i = 0; i < polygon.length - 1; i++) {
        positions.push(
          polygon[i][0], height - polygon[i][1], 0,
          polygon[i + 1][0], height - polygon[i + 1][1], 0
        );
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
   * @param {number} width - New window width
   * @param {number} height - New window height
   */
  onResize(width, height) {
    this.camera.right = width;
    this.camera.top = height;
    this.camera.updateProjectionMatrix();
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
