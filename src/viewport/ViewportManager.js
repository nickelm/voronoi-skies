/**
 * ViewportManager - Orchestrates multi-viewport stencil rendering
 *
 * Phase 1: Foundation with raw GL clearing and mask writing
 *
 * Target architecture (from spec-voronoi-viewport.md):
 * ViewportManager
 * ├── VoronoiLayout          # (Phase 2+) Computes cell polygons from seeds
 * ├── Viewport[]             # (Phase 2+) Renderable screen regions
 * └── renderSequence()       # Orchestrates multi-pass rendering
 */

import * as THREE from 'three';

export class ViewportManager {
  /**
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer (must have stencil: true)
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.gl = renderer.getContext();

    // Background color (#1a3a52 = rgb(0.102, 0.227, 0.322))
    this.backgroundColor = { r: 0.102, g: 0.227, b: 0.322 };

    // Screen dimensions (updated on resize)
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;

    // Mask rendering resources
    this.maskScene = new THREE.Scene();
    this.maskCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Bind resize handler
    this._boundOnResize = () => this._onResize();
    window.addEventListener('resize', this._boundOnResize);
  }

  /**
   * Clear all buffers using raw WebGL calls
   * CRITICAL: Use raw GL, not Three.js clear(), for reliable stencil behavior
   */
  clearBuffers() {
    const gl = this.gl;
    gl.clearColor(
      this.backgroundColor.r,
      this.backgroundColor.g,
      this.backgroundColor.b,
      1.0
    );
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  /**
   * Write a stencil mask for a polygon region
   * @param {Array} polygon - Array of [x, y] screen-space vertices
   * @param {number} refValue - Stencil reference value (1-255)
   */
  writeMask(polygon, refValue) {
    const mask = this._createMaskMesh(polygon);
    if (!mask) return;

    const gl = this.gl;

    // Configure stencil to write refValue wherever mask renders
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, refValue, 0xFF);
    gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
    gl.stencilMask(0xFF);

    // Render mask to write stencil values
    this.maskScene.add(mask);
    this.renderer.render(this.maskScene, this.maskCamera);
    this.maskScene.remove(mask);

    gl.disable(gl.STENCIL_TEST);

    // Clean up
    mask.geometry.dispose();
    mask.material.dispose();
  }

  /**
   * Create a mask mesh from polygon vertices
   * @private
   * @param {Array} polygon - Array of [x, y] screen-space vertices
   * @returns {THREE.Mesh|null}
   */
  _createMaskMesh(polygon) {
    if (!polygon || polygon.length < 3) return null;

    // Convert screen coords to NDC [-1, 1]
    const ndc = polygon.map(([x, y]) => [
      (x / this.screenW) * 2 - 1,
      1 - (y / this.screenH) * 2  // Y flipped for WebGL
    ]);

    // Fan triangulation from first vertex
    const positions = [];
    for (let i = 1; i < ndc.length - 1; i++) {
      positions.push(ndc[0][0], ndc[0][1], 0);
      positions.push(ndc[i][0], ndc[i][1], 0);
      positions.push(ndc[i + 1][0], ndc[i + 1][1], 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    // Material that writes stencil but not color/depth
    const material = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide  // Required for reliable stencil writes
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Set background color for buffer clearing
   * @param {number} r - Red (0-1)
   * @param {number} g - Green (0-1)
   * @param {number} b - Blue (0-1)
   */
  setBackgroundColor(r, g, b) {
    this.backgroundColor = { r, g, b };
  }

  /**
   * Handle window resize
   * @private
   */
  _onResize() {
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;
  }

  /**
   * Clean up resources
   */
  dispose() {
    window.removeEventListener('resize', this._boundOnResize);

    // Clean up any remaining meshes in mask scene
    while (this.maskScene.children.length > 0) {
      const mesh = this.maskScene.children[0];
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      this.maskScene.remove(mesh);
    }
  }
}
