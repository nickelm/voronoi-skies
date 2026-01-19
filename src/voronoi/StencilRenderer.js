/**
 * StencilRenderer - Handles stencil buffer operations for Voronoi cell masking
 * Writes cell polygons to the stencil buffer and manages stencil testing
 */

import * as THREE from 'three';

export class StencilRenderer {
  /**
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.gl = renderer.getContext();

    // Orthographic camera for screen-space stencil mask rendering
    // Use same settings as working debug camera: near=-1, far=1, no position offset
    this.maskCamera = new THREE.OrthographicCamera(
      0, window.innerWidth,
      window.innerHeight, 0,
      -1, 1
    );
    // Don't set position.z - leave at 0 like the working debug camera

    // DEBUG: Log camera setup
    console.log('StencilRenderer: maskCamera setup', {
      left: 0, right: window.innerWidth,
      top: window.innerHeight, bottom: 0,
      position: this.maskCamera.position.clone()
    });

    // Scene for stencil mask geometry
    this.maskScene = new THREE.Scene();
  }

  /**
   * Create a material for stencil writing
   * @param {number} stencilRef - The stencil reference value
   */
  createStencilMaterial(stencilRef) {
    // DEBUG: Make mask visible to verify polygon shape
    // Set colorWrite to true and add a color to see the mask
    const debugVisible = true;

    return new THREE.MeshBasicMaterial({
      color: debugVisible ? (stencilRef === 1 ? 0xff0000 : 0x0000ff) : 0x000000,
      colorWrite: debugVisible,  // Set to false for production
      depthWrite: false,
      stencilWrite: true,
      stencilRef: stencilRef,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilFail: THREE.ReplaceStencilOp
    });
  }

  /**
   * Create a mesh from polygon vertices
   * @param {Array} polygon - Array of [x, y] screen-space vertices (Y=0 at top)
   * @param {number} stencilRef - Stencil reference value
   * @returns {THREE.Mesh|null}
   */
  createPolygonMesh(polygon, stencilRef) {
    if (!polygon || polygon.length < 3) return null;

    const height = window.innerHeight;

    // DEBUG: Log raw polygon coordinates
    console.log(`  Raw polygon coords:`, polygon.map(p => `(${p[0].toFixed(0)}, ${p[1].toFixed(0)})`).join(', '));

    // DEBUG: Try using BufferGeometry with manual triangulation instead of ShapeGeometry
    // For now, create a simple test triangle to verify the rendering works
    const geometry = new THREE.BufferGeometry();

    // Convert polygon to flipped Y coordinates
    const flippedY = (y) => height - y;
    const vertices = [];

    // Simple fan triangulation from first vertex
    // polygon[0] is the pivot, create triangles: 0-1-2, 0-2-3, 0-3-4, etc.
    for (let i = 1; i < polygon.length - 2; i++) {
      // Triangle: polygon[0], polygon[i], polygon[i+1]
      vertices.push(
        polygon[0][0], flippedY(polygon[0][1]), 0,
        polygon[i][0], flippedY(polygon[i][1]), 0,
        polygon[i + 1][0], flippedY(polygon[i + 1][1]), 0
      );
    }

    console.log(`  Created ${vertices.length / 9} triangles from ${polygon.length} vertices`);

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingBox();
    console.log(`  Computed bounding box:`, geometry.boundingBox);

    // Use stencil-writing material
    // colorWrite: false for production (invisible mask)
    // Set to true with colors for debugging
    const DEBUG_VISIBLE = false;

    const material = new THREE.MeshBasicMaterial({
      color: DEBUG_VISIBLE ? (stencilRef === 1 ? 0xff0000 : 0x0000ff) : 0x000000,
      colorWrite: DEBUG_VISIBLE,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilRef: stencilRef,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilFail: THREE.ReplaceStencilOp,
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Add a cell's polygon mask to the scene (doesn't render yet)
   * @param {VoronoiCell} cell - Cell with polygon data
   * @param {number} stencilRef - Stencil reference value (unique per cell)
   */
  writeStencilMask(cell, stencilRef) {
    // Create mask mesh from cell polygon with stencil material
    const mesh = this.createPolygonMesh(cell.polygon, stencilRef);
    if (!mesh) return;

    this.maskScene.add(mesh);
  }

  /**
   * Clear all masks from the scene
   */
  clearMasks() {
    while (this.maskScene.children.length > 0) {
      const mesh = this.maskScene.children[0];
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.maskScene.remove(mesh);
    }
    this.maskMesh = null;
  }

  /**
   * Render all masks to the stencil buffer
   * Call this once after adding all masks, before rendering scenes
   */
  renderMasksToStencil() {
    if (this.maskScene.children.length === 0) return;

    // Enable stencil writing
    const state = this.renderer.state;
    state.buffers.stencil.setTest(true);
    state.buffers.stencil.setMask(0xff);

    // Render the mask scene (writes to stencil buffer via material properties)
    this.renderer.render(this.maskScene, this.maskCamera);
  }

  /**
   * Enable stencil test for scene rendering
   * Only pixels where stencil equals ref will be drawn
   * Uses Three.js state to ensure settings persist through render call
   * @param {number} stencilRef - Stencil reference value to test against
   */
  enableStencilTest(stencilRef) {
    const gl = this.gl;
    const state = this.renderer.state;

    // Use Three.js state management to enable stencil
    state.buffers.stencil.setTest(true);
    state.buffers.stencil.setFunc(gl.EQUAL, stencilRef, 0xff);
    state.buffers.stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
    state.buffers.stencil.setMask(0x00);
  }

  /**
   * Disable stencil test
   */
  disableStencilTest() {
    const state = this.renderer.state;
    state.buffers.stencil.setTest(false);
  }

  /**
   * Handle window resize
   * @param {number} width - New window width
   * @param {number} height - New window height
   */
  onResize(width, height) {
    this.maskCamera.right = width;
    this.maskCamera.top = height;
    this.maskCamera.updateProjectionMatrix();
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.clearMasks();
  }
}
