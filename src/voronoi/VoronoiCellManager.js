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
    }
  }

  /**
   * Render multiple cells with stencil masking
   * @private
   */
  _renderMultiCell() {
    const gl = this.renderer.getContext();

    // Separate cells by type
    const playerCell = this.getPlayerCell();
    const exclusiveCells = this.cells.filter(c => c.type !== 'player');

    // 1. Write ALL stencil masks first
    // Player/on-screen cells get ref=1
    if (playerCell && playerCell.polygon) {
      this.viewportManager.writeMask(playerCell.polygon, 1);
    }

    // Exclusive cells get ref=2, 3, 4...
    for (let i = 0; i < exclusiveCells.length; i++) {
      const cell = exclusiveCells[i];
      if (cell.polygon) {
        this.viewportManager.writeMask(cell.polygon, i + 2);
      }
    }

    // 2. Render player cell (ref=1)
    if (playerCell) {
      this._renderCellWithStencil(playerCell, 1);
    }

    // 3. Render exclusive cells
    for (let i = 0; i < exclusiveCells.length; i++) {
      const cell = exclusiveCells[i];
      this._renderCellWithStencil(cell, i + 2);
    }
  }

  /**
   * Render a single cell where stencil matches refValue
   * @private
   */
  _renderCellWithStencil(cell, refValue) {
    const gl = this.renderer.getContext();

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
  }
}
