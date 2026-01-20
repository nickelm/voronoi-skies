/**
 * VoronoiCellManager - Orchestrates Voronoi cell rendering
 *
 * Uses ViewportManager for all rendering operations.
 * Currently simplified: single cell = simple fullscreen render.
 * Multi-cell stencil rendering will be added via ViewportManager.
 */

import * as THREE from 'three';
import { Delaunay } from 'd3-delaunay';
import { VoronoiCell } from './VoronoiCell.js';
import { ViewportManager } from '../viewport/ViewportManager.js';
import { CellBorderRenderer } from './CellBorderRenderer.js';

export class VoronoiCellManager {
  /**
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
   * @param {THREE.Scene} scene - The main game scene
   * @param {THREE.Camera} mainCamera - The main camera
   */
  constructor(renderer, scene, mainCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.mainCamera = mainCamera;

    // Viewport manager handles all rendering
    this.viewportManager = new ViewportManager(renderer);

    // Border renderer for cell boundaries
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
   */
  initPlayerCell() {
    const playerCell = new VoronoiCell({
      id: 0,
      type: 'player'
    });
    // Player seed at screen center
    playerCell.seed = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };

    this.cells = [playerCell];
    this.computeVoronoi();

    console.log('VoronoiCellManager: Initialized player cell at screen center');
  }

  /**
   * Add a new cell dynamically
   * @param {string} type - Cell type identifier ('target', 'ui', etc.)
   * @returns {VoronoiCell} The created cell
   */
  addCell(type) {
    const id = this.cells.length;
    const cell = new VoronoiCell({ id, type });
    this.cells.push(cell);
    this.computeVoronoi();
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
      this.cells.forEach((c, i) => c.id = i);
      this.computeVoronoi();
      console.log(`VoronoiCellManager: Removed cell, ${this.cells.length} cells remaining`);
    }
  }

  /**
   * Get player cell
   * @returns {VoronoiCell|null}
   */
  getPlayerCell() {
    return this.cells.find(c => c.type === 'player') || null;
  }

  /**
   * Compute Voronoi tessellation from cell seeds
   */
  computeVoronoi() {
    if (this.cells.length === 0) return;

    const points = this.cells.map(cell => [cell.seed.x, cell.seed.y]);
    const delaunay = Delaunay.from(points);
    this.voronoi = delaunay.voronoi(this.bounds);

    this.cells.forEach((cell, index) => {
      const polygon = this.voronoi.cellPolygon(index);
      cell.updatePolygon(polygon);
    });

    // Update border geometry
    this.borderRenderer.updateFromCells(this.cells);
  }

  /**
   * Update cell cameras based on main camera
   */
  updateCameras() {
    if (!this.mainCamera) return;

    for (const cell of this.cells) {
      if (cell.type === 'player') {
        cell.updateCameraFromMain(this.mainCamera);
      }
    }
  }

  /**
   * Render all cells
   *
   * Single cell: simple fullscreen render (no stencil needed)
   * Multiple cells: use ViewportManager for stencil-masked rendering
   */
  render() {
    // Clear all buffers
    this.viewportManager.clearBuffers();

    const playerCell = this.getPlayerCell();
    if (!playerCell) return;

    if (this.cells.length === 1) {
      // Fast path: single cell, no stencil masking needed
      this.renderer.render(this.scene, playerCell.camera);
    } else {
      // Multi-cell path: use stencil masking via ViewportManager
      this._renderMultiCell();

      // Render borders on top of all cells
      this.borderRenderer.render(this.renderer);
    }
  }

  /**
   * Render multiple cells with stencil masking
   * Uses two-phase rendering: write all masks first, then render all scenes
   *
   * Cell classification:
   * - On-screen cells (player + on-screen targets): share stencil ref=1, render with player camera
   * - Off-screen cells (off-screen targets): get unique refs (2, 3, 4...), render with own cameras
   *
   * @private
   */
  _renderMultiCell() {
    const gl = this.renderer.getContext();

    // Separate cells into on-screen (merged) and off-screen (exclusive)
    const playerCell = this.getPlayerCell();
    const onScreenCells = this.cells.filter(c => c.type === 'player' || c.onScreen === true);
    const exclusiveCells = this.cells.filter(c => c.type !== 'player' && c.onScreen === false);

    // Debug logging (occasional)
    if (Math.random() < 0.005) {
      console.log('_renderMultiCell: on-screen cells:', onScreenCells.length,
        'exclusive cells:', exclusiveCells.length,
        exclusiveCells.map(c => ({ seed: c.seed, polyLen: c.polygon?.length, onScreen: c.onScreen })));
    }

    // Phase 1: Write ALL stencil masks first

    // On-screen cells (player + visible targets) all get ref=1 - they merge
    for (const cell of onScreenCells) {
      if (cell.polygon) {
        this.viewportManager.writeMask(cell.polygon, 1);
      }
    }

    // Off-screen/exclusive cells get ref=2, 3, 4...
    for (let i = 0; i < exclusiveCells.length; i++) {
      const cell = exclusiveCells[i];
      if (cell.polygon) {
        this.viewportManager.writeMask(cell.polygon, i + 2);
      }
    }

    // Phase 2: Render all scenes with stencil test

    // 2a. Render merged on-screen area (ref=1) with player camera - NO frustum shift
    if (playerCell) {
      this._renderCellWithStencil(playerCell, 1, false);
    }

    // 2b. Render exclusive off-screen cells WITH frustum shift
    for (let i = 0; i < exclusiveCells.length; i++) {
      const cell = exclusiveCells[i];
      this._renderCellWithStencil(cell, i + 2, true);
    }
  }

  /**
   * Render a single cell where stencil matches refValue
   *
   * For non-player cells, we use frustum shifting to achieve the seed alignment effect.
   * This is more reliable than viewport offset because it doesn't clip at screen edges.
   *
   * @private
   * @param {VoronoiCell} cell - Cell to render
   * @param {number} refValue - Stencil reference value
   * @param {boolean} useFrustumShift - Whether to shift the frustum (false for player cell at center)
   */
  _renderCellWithStencil(cell, refValue, useFrustumShift = false) {
    const gl = this.renderer.getContext();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // IMPORTANT: Disable scissor test and set full-screen viewport
    this.renderer.setScissorTest(false);
    gl.viewport(0, 0, screenW, screenH);

    // Apply frustum shift for non-centered cells
    // This shifts what the camera sees so the target appears at the seed position
    if (useFrustumShift) {
      // Calculate the NDC offset: how far the seed is from screen center
      // Seed at center = (0,0) in NDC, seed at left edge = (-1, y)
      const ndcOffsetX = (cell.seed.x / screenW) * 2 - 1;  // -1 to 1
      const ndcOffsetY = 1 - (cell.seed.y / screenH) * 2;  // -1 to 1 (Y flipped)

      // Apply asymmetric frustum by modifying the projection matrix
      // This shifts the view without changing the viewport
      cell.camera.aspect = screenW / screenH;
      cell.camera.updateProjectionMatrix();

      // Modify projection matrix to shift the frustum
      // This is equivalent to: projMatrix * translateMatrix(-ndcOffsetX, -ndcOffsetY, 0)
      const projMatrix = cell.camera.projectionMatrix;
      projMatrix.elements[8] = -ndcOffsetX;   // Shift X in clip space
      projMatrix.elements[9] = -ndcOffsetY;   // Shift Y in clip space
    } else {
      cell.camera.aspect = screenW / screenH;
      cell.camera.updateProjectionMatrix();
    }

    // Clear depth between cells
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Configure stencil test
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, refValue, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0x00);

    // Render with cell's camera
    this.renderer.render(this.scene, cell.camera);

    gl.disable(gl.STENCIL_TEST);
  }

  /**
   * Handle window resize
   */
  onResize() {
    this.bounds = [0, 0, window.innerWidth, window.innerHeight];

    // Update player seed to new center
    const playerCell = this.getPlayerCell();
    if (playerCell) {
      playerCell.seed.x = window.innerWidth / 2;
      playerCell.seed.y = window.innerHeight / 2;
    }

    this.computeVoronoi();
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.viewportManager.dispose();
    this.borderRenderer.dispose();
  }
}
