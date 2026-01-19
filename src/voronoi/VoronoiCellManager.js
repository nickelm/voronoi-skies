/**
 * VoronoiCellManager - Orchestrates Voronoi cell rendering
 * Manages cells, computes tessellation, and coordinates multi-pass rendering
 *
 * Key principle: Write ALL masks to stencil first, THEN render all scenes
 * (Interleaving mask/scene per cell destroys previous stencil values)
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
   * Initialize with player cell only
   * Other cells (airbase, target) are added dynamically by controllers
   */
  initPlayerCell() {
    // Player cell: seed at bottom-center of screen
    const playerCell = new VoronoiCell({
      id: 0,
      type: 'player'
    });
    playerCell.seed = {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.7
    };

    this.cells = [playerCell];
    this.computeVoronoi();

    console.log('VoronoiCellManager: Initialized player cell');
  }

  /**
   * Add a new cell dynamically
   * @param {string} type - Cell type identifier ('airbase', 'target', etc.)
   * @returns {VoronoiCell} The created cell
   */
  addCell(type) {
    const id = this.cells.length;
    const cell = new VoronoiCell({ id, type });
    this.cells.push(cell);
    console.log(`VoronoiCellManager: Added ${type} cell (id=${id})`);
    return cell;
  }

  /**
   * Remove a cell by reference
   * @param {VoronoiCell} cell - Cell to remove
   */
  removeCell(cell) {
    const index = this.cells.indexOf(cell);
    if (index !== -1) {
      this.cells.splice(index, 1);
      // Re-index remaining cells
      this.cells.forEach((c, i) => c.id = i);
      this.computeVoronoi();
      console.log(`VoronoiCellManager: Removed cell, ${this.cells.length} cells remaining`);
    }
  }

  /**
   * Get player cell (always type 'player')
   * @returns {VoronoiCell|null}
   */
  getPlayerCell() {
    return this.cells.find(c => c.type === 'player') || null;
  }

  /**
   * @deprecated Use initPlayerCell() instead
   * Initialize with two hardcoded test cells (kept for backwards compatibility)
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
   * Player cell copies main camera; other cell types are managed externally
   */
  updateCameras() {
    if (!this.mainCamera) return;

    for (const cell of this.cells) {
      if (cell.type === 'player') {
        // Player cell uses main camera exactly
        cell.updateCameraFromMain(this.mainCamera);
      }
      // 'airbase' cells are managed by AirbaseCellController
      // 'target' cells would be managed by a future TargetCellController
    }
  }

  /**
   * Render all cells with stencil masking
   *
   * CRITICAL: Write ALL masks first, THEN render all scenes
   * This follows the validated pattern from stencil-test.html
   */
  render() {
    const gl = this.renderer.getContext();

    // 1. Clear ALL buffers once with explicit background color (#1a3a52)
    gl.clearColor(0.102, 0.227, 0.322, 1);
    this.renderer.clear(true, true, true);

    // 2. Write ALL masks to stencil buffer FIRST
    const cellData = [];
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (!cell.polygon) continue;

      const stencilRef = i + 1;  // ref 0 means "no cell"
      const maskMesh = this.stencilRenderer.createPolygonMesh(cell.polygon, stencilRef);
      if (maskMesh) {
        this.stencilRenderer.writeMaskToStencil(maskMesh, stencilRef);
        cellData.push({ mesh: maskMesh, ref: stencilRef, cell });
      }
    }

    // 3. Render scene for EACH cell where stencil matches its ref value
    for (const { mesh, ref, cell } of cellData) {
      // Clear depth only (preserve color and stencil)
      this.renderer.clearDepth();

      // Configure stencil test: only render where stencil == ref
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.EQUAL, ref, 0xFF);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilMask(0x00);  // Don't modify stencil during scene render

      // Render scene with cell's camera
      this.renderer.render(this.scene, cell.camera);

      gl.disable(gl.STENCIL_TEST);

      // Dispose mask mesh (created fresh each frame)
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    // 4. Render borders on top (no stencil test)
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
