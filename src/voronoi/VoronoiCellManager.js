/**
 * VoronoiCellManager - Orchestrates Voronoi cell rendering
 * Manages cells, computes tessellation, and coordinates multi-pass rendering
 */

import * as THREE from 'three';
import { Delaunay } from 'd3-delaunay';
import { VoronoiCell } from './VoronoiCell.js';
import { StencilRenderer } from './StencilRenderer.js';
import { CellBorderRenderer } from './CellBorderRenderer.js';

export class VoronoiCellManager {
  /**
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
   * @param {THREE.Scene} scene - The main game scene
   */
  constructor(renderer, scene, mainCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.mainCamera = mainCamera;

    // Stencil mask handler
    this.stencilRenderer = new StencilRenderer(renderer);

    // Border renderer
    this.borderRenderer = new CellBorderRenderer();

    // Active cells
    this.cells = [];

    // Voronoi tessellation
    this.voronoi = null;

    // Screen bounds for Voronoi computation
    this.bounds = [0, 0, window.innerWidth, window.innerHeight];

    // Listen for resize events
    window.addEventListener('resize', () => this.onResize());
  }

  /**
   * Initialize with two hardcoded test cells
   */
  initTestCells() {
    // Player cell: seed at bottom-center of screen
    const playerCell = new VoronoiCell({
      id: 0,
      type: 'player'
    });
    playerCell.seed = {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.7
    };

    // Target cell: seed at top-right area
    const targetCell = new VoronoiCell({
      id: 1,
      type: 'target'
    });
    targetCell.seed = {
      x: window.innerWidth / 2 + 150,
      y: window.innerHeight * 0.3
    };

    this.cells = [playerCell, targetCell];
    this.computeVoronoi();

    // Debug: log cell info
    console.log('VoronoiCellManager: Initialized test cells');
    this.cells.forEach((cell, i) => {
      console.log(`Cell ${i}: seed=(${cell.seed.x.toFixed(0)}, ${cell.seed.y.toFixed(0)}), aabb=(${cell.aabb.x}, ${cell.aabb.y}, ${cell.aabb.width}, ${cell.aabb.height})`);
    });
  }

  /**
   * Compute Voronoi tessellation from cell seeds
   */
  computeVoronoi() {
    if (this.cells.length === 0) return;

    // Extract seed points as [x, y] array
    const points = this.cells.map(cell => [cell.seed.x, cell.seed.y]);

    // Create Voronoi diagram using d3-delaunay
    const delaunay = Delaunay.from(points);
    this.voronoi = delaunay.voronoi(this.bounds);

    // Update each cell with its polygon
    this.cells.forEach((cell, index) => {
      const polygon = this.voronoi.cellPolygon(index);
      cell.updatePolygon(polygon);
    });

    // Update border geometry
    this.borderRenderer.updateFromCells(this.cells);
  }

  /**
   * Update cell cameras based on main camera
   * For Chunk 1: player cell matches main camera, target cell has different FOV
   * to visually prove stencil masking works
   */
  updateCameras() {
    if (!this.mainCamera) return;

    // Player cell (cell 0) uses main camera exactly
    if (this.cells[0]) {
      this.cells[0].updateCameraFromMain(this.mainCamera);
    }

    // Target cell (cell 1) uses different FOV to prove independent rendering
    if (this.cells[1]) {
      this.cells[1].updateCameraFromMain(this.mainCamera);
      // Wider FOV makes terrain appear smaller/zoomed out
      this.cells[1].camera.fov = 90;
      this.cells[1].camera.updateProjectionMatrix();
    }
  }

  /**
   * Render all cells with stencil masking
   * This replaces the single renderer.render() call
   */
  render() {
    // Clear all buffers at start of frame
    this.renderer.clear(true, true, true);

    // Render each cell separately - write mask then render scene immediately
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      const stencilRef = i + 1;
      if (!cell.polygon) continue;

      // 1. Clear stencil renderer and add just this cell's mask
      this.stencilRenderer.clearMasks();
      this.stencilRenderer.writeStencilMask(cell, stencilRef);

      // 2. Render this mask to stencil buffer
      this.stencilRenderer.renderMasksToStencil();

      // 3. Set scissor to cell's AABB (optimization)
      const scissorY = window.innerHeight - cell.aabb.y - cell.aabb.height;
      this.renderer.setScissor(cell.aabb.x, scissorY, cell.aabb.width, cell.aabb.height);
      this.renderer.setScissorTest(true);

      // 4. Clear depth buffer for this cell (keep color and stencil)
      this.renderer.clear(false, true, false);

      // 5. Enable stencil test using raw WebGL (before Three.js can reset it)
      const gl = this.renderer.getContext();
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.EQUAL, stencilRef, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilMask(0x00);  // Don't write to stencil during scene render

      // 6. Render scene with cell's camera
      this.renderer.render(this.scene, cell.camera);

      // 7. Disable stencil test
      gl.disable(gl.STENCIL_TEST);

      // 8. Disable scissor for next cell
      this.renderer.setScissorTest(false);
    }

    // Render borders on top
    this.borderRenderer.render(this.renderer);
  }

  /**
   * Handle window resize
   */
  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.bounds = [0, 0, width, height];
    this.stencilRenderer.onResize(width, height);
    this.borderRenderer.onResize(width, height);

    // Recompute Voronoi with new bounds
    this.computeVoronoi();
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stencilRenderer.dispose();
    this.borderRenderer.dispose();
  }
}
