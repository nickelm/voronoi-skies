/**
 * StencilRenderer - Handles stencil buffer operations for Voronoi cell masking
 * Uses raw WebGL calls for reliable stencil control (Three.js material properties don't work)
 * Uses NDC coordinates [-1, 1] for mask geometry
 */

import * as THREE from 'three';

export class StencilRenderer {
  /**
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.gl = renderer.getContext();

    // Orthographic camera in NDC coordinates: [-1, 1] range
    // This matches the working stencil-test.html approach
    this.maskCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Scene for stencil mask geometry
    this.maskScene = new THREE.Scene();
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
    // NDC: X from -1 (left) to 1 (right)
    // NDC: Y from -1 (bottom) to 1 (top) - inverted from screen coords
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = 1 - (screenY / height) * 2;
    return [ndcX, ndcY];
  }

  /**
   * Create a mesh from polygon vertices in screen coordinates
   * Converts to NDC and uses fan triangulation
   * @param {Array} polygon - Array of [x, y] screen-space vertices
   * @param {number} stencilRef - Stencil reference value (unused, kept for API compat)
   * @returns {THREE.Mesh|null}
   */
  createPolygonMesh(polygon, stencilRef) {
    if (!polygon || polygon.length < 3) return null;

    // Convert polygon vertices to NDC
    const ndcVertices = polygon.map(([x, y]) => this.screenToNDC(x, y));

    // Fan triangulation from first vertex
    // For polygon [0, 1, 2, 3, 4], create triangles: 0-1-2, 0-2-3, 0-3-4
    const positions = [];
    for (let i = 1; i < ndcVertices.length - 1; i++) {
      positions.push(
        ndcVertices[0][0], ndcVertices[0][1], 0,
        ndcVertices[i][0], ndcVertices[i][1], 0,
        ndcVertices[i + 1][0], ndcVertices[i + 1][1], 0
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    // Simple material - NO Three.js stencil properties (they don't work reliably)
    // colorWrite: false makes mask invisible
    // depthWrite/depthTest: false prevents depth buffer interference
    const material = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Write a single mask to stencil buffer using raw WebGL
   * @param {THREE.Mesh} maskMesh - The mask geometry
   * @param {number} refValue - Stencil reference value to write
   */
  writeMaskToStencil(maskMesh, refValue) {
    const gl = this.gl;

    // Configure stencil to write refValue wherever mask renders
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, refValue, 0xFF);
    gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
    gl.stencilMask(0xFF);

    // Render mask to write stencil values
    this.maskScene.add(maskMesh);
    this.renderer.render(this.maskScene, this.maskCamera);
    this.maskScene.remove(maskMesh);

    gl.disable(gl.STENCIL_TEST);
  }

  /**
   * Handle window resize
   * NDC camera is fixed [-1, 1], no update needed
   */
  onResize(width, height) {
    // NDC camera doesn't need updating - coordinates are normalized
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Clean up any remaining meshes in the scene
    while (this.maskScene.children.length > 0) {
      const mesh = this.maskScene.children[0];
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      this.maskScene.remove(mesh);
    }
  }
}
