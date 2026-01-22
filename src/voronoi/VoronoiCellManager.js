/**
 * VoronoiCellManager - Orchestrates Voronoi cell rendering
 *
 * Responsibilities:
 * - Manages the lifecycle of all Voronoi cells (player, target, UI)
 * - Computes Voronoi tessellation from cell seeds
 * - Handles seed deconfliction to prevent overlapping cells
 * - Renders cells with appropriate stencil masking
 *
 * Cell types:
 * - 'player': Always at screen center, perspective camera, shared scene
 * - 'target': World-space entities, perspective camera, shared scene
 * - 'ui': Screen-space UI elements, orthographic camera, dedicated scene
 */

import * as THREE from 'three';
import { Delaunay } from 'd3-delaunay';
import { VoronoiCell } from './VoronoiCell.js';
import { ViewportManager } from '../viewport/ViewportManager.js';
import { CellBorderRenderer } from './CellBorderRenderer.js';
import { LabelOverlay } from './LabelOverlay.js';

// Minimum distance between seeds before deconfliction kicks in
const DEFAULT_MIN_SEED_DISTANCE = 40;

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

    // Label overlay for distance/magnification labels
    this.labelOverlay = new LabelOverlay();

    // Active cells (private - use methods to access)
    this._cells = [];

    // Voronoi tessellation
    this._voronoi = null;

    // Screen bounds for Voronoi computation
    this._bounds = [0, 0, window.innerWidth, window.innerHeight];

    // Deconfliction settings
    this._minSeedDistance = DEFAULT_MIN_SEED_DISTANCE;

    // Listen for resize events
    this._resizeHandler = () => this._onResize();
    window.addEventListener('resize', this._resizeHandler);
  }

  // ============================================
  // Public API - Cell Management
  // ============================================

  /**
   * Initialize with player cell only
   */
  initPlayerCell() {
    const playerCell = new VoronoiCell({
      id: 0,
      type: 'player'
    });
    playerCell.seed = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };

    this._cells = [playerCell];
    this._computeVoronoi();
  }

  /**
   * Create and register a new cell
   * @param {string} type - Cell type: 'target' | 'ui'
   * @param {Object} [config] - Additional configuration
   * @param {string} [config.cameraType] - 'perspective' | 'orthographic'
   * @param {THREE.Scene} [config.scene] - Dedicated scene for UI cells
   * @param {number} [config.deconflictRadius] - Custom deconfliction radius in pixels
   * @returns {VoronoiCell} The created cell
   */
  createCell(type, config = {}) {
    const id = this._cells.length;
    const cell = new VoronoiCell({
      id,
      type,
      cameraType: config.cameraType,
      scene: config.scene
    });

    // Store deconfliction radius on the cell if provided
    if (config.deconflictRadius !== undefined) {
      cell.deconflictRadius = config.deconflictRadius;
    }

    this._cells.push(cell);
    this._computeVoronoi();
    return cell;
  }

  /**
   * Register an externally-created cell
   * Use this when you need full control over cell creation
   * @param {VoronoiCell} cell - The cell to register
   */
  registerCell(cell) {
    cell.id = this._cells.length;
    this._cells.push(cell);
    this._computeVoronoi();
  }

  /**
   * Unregister a cell (remove from manager but don't dispose)
   * @param {VoronoiCell} cell - Cell to unregister
   */
  unregisterCell(cell) {
    const index = this._cells.indexOf(cell);
    if (index !== -1) {
      this._cells.splice(index, 1);
      this._reassignIds();
      this._computeVoronoi();
    }
  }

  /**
   * Remove and dispose a cell
   * @param {VoronoiCell} cell - Cell to remove
   */
  removeCell(cell) {
    this.unregisterCell(cell);
    // Note: Scene disposal is the responsibility of whoever created the scene
  }

  /**
   * Get the player cell
   * @returns {VoronoiCell|null}
   */
  getPlayerCell() {
    return this._cells.find(c => c.type === 'player') || null;
  }

  /**
   * Get all cells of a specific type
   * @param {string} type - Cell type to filter by
   * @returns {VoronoiCell[]}
   */
  getCellsByType(type) {
    return this._cells.filter(c => c.type === type);
  }

  /**
   * Get all registered cells (read-only copy)
   * @returns {VoronoiCell[]}
   */
  getCells() {
    return [...this._cells];
  }

  /**
   * Get cell count
   * @returns {number}
   */
  getCellCount() {
    return this._cells.length;
  }

  /**
   * Find which cell contains the given screen coordinates
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @returns {VoronoiCell|null}
   */
  getCellAtPoint(x, y) {
    for (const cell of this._cells) {
      if (cell.containsPoint(x, y)) {
        return cell;
      }
    }
    return null;
  }

  // ============================================
  // Public API - Deconfliction
  // ============================================

  /**
   * Set the minimum seed distance for deconfliction
   * @param {number} distance - Minimum distance in pixels
   */
  setMinSeedDistance(distance) {
    this._minSeedDistance = distance;
  }

  /**
   * Deconflict seeds that are too close together
   *
   * Rules:
   * - Player seed is immovable (always at center)
   * - UI seeds are immovable (fixed positions)
   * - Target seeds are pushed away from immovable seeds
   * - Target seeds are pushed apart from each other
   *
   * @param {Array<{seedX: number, seedY: number, id: any}>} mobileSeeds - Seeds that can be moved (targets)
   * @param {Array<{x: number, y: number, radius?: number}>} [fixedSeeds] - Additional immovable seeds with optional custom radius
   */
  deconflictSeeds(mobileSeeds, fixedSeeds = []) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const cx = screenW / 2;
    const cy = screenH / 2;

    // Collect all immovable seeds: player + UI cells + any provided fixed seeds
    const immovableSeeds = [];

    // Add player seed
    const playerCell = this.getPlayerCell();
    if (playerCell) {
      immovableSeeds.push({
        x: playerCell.seed.x,
        y: playerCell.seed.y,
        radius: this._minSeedDistance
      });
    }

    // Add UI cell seeds
    for (const cell of this._cells) {
      if (cell.type === 'ui') {
        immovableSeeds.push({
          x: cell.seed.x,
          y: cell.seed.y,
          radius: cell.deconflictRadius || this._minSeedDistance
        });
      }
    }

    // Add any externally-provided fixed seeds
    for (const seed of fixedSeeds) {
      immovableSeeds.push({
        x: seed.x,
        y: seed.y,
        radius: seed.radius || this._minSeedDistance
      });
    }

    // Phase 1: Push mobile seeds away from immovable seeds
    for (const mobile of mobileSeeds) {
      for (const fixed of immovableSeeds) {
        const dist = Math.hypot(mobile.seedX - fixed.x, mobile.seedY - fixed.y);
        const minDist = fixed.radius;
        if (dist < minDist) {
          const dx = mobile.seedX - fixed.x;
          const dy = mobile.seedY - fixed.y;
          const len = Math.hypot(dx, dy) || 1;
          const pushDist = minDist - dist + 5;
          mobile.seedX += (dx / len) * pushDist;
          mobile.seedY += (dy / len) * pushDist;
        }
      }
    }

    // Phase 2: Push mobile seeds apart from each other
    for (const mobile of mobileSeeds) {
      for (const other of mobileSeeds) {
        if (mobile === other) continue;

        const dist = Math.hypot(mobile.seedX - other.seedX, mobile.seedY - other.seedY);
        if (dist < this._minSeedDistance) {
          // Push apart along tangent to screen edge
          const edgeDx = mobile.seedX - cx;
          const edgeDy = mobile.seedY - cy;
          const edgeLen = Math.hypot(edgeDx, edgeDy);

          if (edgeLen > 0) {
            const tangentX = -edgeDy / edgeLen;
            const tangentY = edgeDx / edgeLen;
            const offset = (this._minSeedDistance - dist) / 2 + 5;
            // Deterministic ordering by id
            const sign = mobile.id < other.id ? 1 : -1;
            mobile.seedX += tangentX * offset * sign;
            mobile.seedY += tangentY * offset * sign;
          }
        }
      }

      // Clamp to screen bounds
      const margin = 5;
      mobile.seedX = Math.max(margin, Math.min(screenW - margin, mobile.seedX));
      mobile.seedY = Math.max(margin, Math.min(screenH - margin, mobile.seedY));
    }
  }

  // ============================================
  // Public API - Rendering
  // ============================================

  /**
   * Recompute Voronoi tessellation
   * Call this after updating seed positions
   */
  computeVoronoi() {
    this._computeVoronoi();
  }

  /**
   * Update cell cameras based on main camera
   */
  updateCameras() {
    if (!this.mainCamera) return;

    for (const cell of this._cells) {
      if (cell.type === 'player') {
        cell.updateCameraFromMain(this.mainCamera);
      }
    }
  }

  /**
   * Render all cells
   */
  render() {
    this.viewportManager.clearBuffers();

    const playerCell = this.getPlayerCell();
    if (!playerCell) return;

    if (this._cells.length === 1) {
      // Fast path: single cell, no stencil masking needed
      this.renderer.render(this.scene, playerCell.camera);
    } else {
      // Multi-cell path: use stencil masking
      this._renderMultiCell();
      this.borderRenderer.render(this.renderer);
    }
  }

  /**
   * Initialize label overlay with container
   * @param {HTMLElement} container - The game container element
   */
  initLabelOverlay(container) {
    this.labelOverlay.init(container);
  }

  /**
   * Render distance/magnification labels for exclusive (off-screen) cells
   * @param {number} playerCameraZ - Current player camera Z
   * @param {number} playerX - Player world X position
   * @param {number} playerY - Player world Y position
   */
  renderLabels(playerCameraZ, playerX, playerY) {
    this.labelOverlay.clear();

    // Get exclusive target cells (off-screen targets)
    const exclusiveCells = this._cells.filter(c =>
      c.type === 'target' &&
      c.onScreen === false
    );

    for (const cell of exclusiveCells) {
      const target = cell.target;
      if (!target) continue;

      // Compute distance in nautical miles
      const distFeet = Math.hypot(target.worldX - playerX, target.worldY - playerY);
      const distNm = distFeet / 6076;

      // Compute magnification (ratio of player camera Z to cell camera Z)
      const blendedCameraZ = cell.getBlendedTerrainZ(playerCameraZ);
      const magnification = playerCameraZ / blendedCameraZ;

      // Format: [1.9 nm/1.5x]
      const text = `[${distNm.toFixed(1)} nm/${magnification.toFixed(1)}x]`;

      // Use cell id as unique identifier for DOM element reuse
      const cellId = `cell-${cell.id}`;
      this.labelOverlay.drawBoxedLabel(cellId, text, cell.seed.x, cell.seed.y, {
        bgColor: 'rgba(0, 0, 0, 0.75)',
        textColor: '#00ff00',
        borderColor: '#00ff00'
      });
    }

    // Remove labels for cells that no longer exist
    this.labelOverlay.finalize();
  }

  /**
   * Clean up resources
   */
  dispose() {
    window.removeEventListener('resize', this._resizeHandler);
    this.viewportManager.dispose();
    this.borderRenderer.dispose();
    this.labelOverlay.dispose();
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Reassign sequential IDs after cell removal
   * @private
   */
  _reassignIds() {
    this._cells.forEach((c, i) => c.id = i);
  }

  /**
   * Compute Voronoi tessellation from cell seeds
   * @private
   */
  _computeVoronoi() {
    if (this._cells.length === 0) return;

    const points = this._cells.map(cell => [cell.seed.x, cell.seed.y]);
    const delaunay = Delaunay.from(points);
    this._voronoi = delaunay.voronoi(this._bounds);

    this._cells.forEach((cell, index) => {
      const polygon = this._voronoi.cellPolygon(index);
      cell.updatePolygon(polygon);
    });

    this.borderRenderer.updateFromCells(this._cells);
  }

  /**
   * Render multiple cells with stencil masking
   * @private
   */
  _renderMultiCell() {
    const gl = this.renderer.getContext();

    const playerCell = this.getPlayerCell();
    const onScreenCells = this._cells.filter(c => c.type === 'player' || c.onScreen === true);
    const exclusiveCells = this._cells.filter(c => c.type !== 'player' && c.onScreen === false);

    // Phase 1: Write all stencil masks
    for (const cell of onScreenCells) {
      if (cell.polygon) {
        this.viewportManager.writeMask(cell.polygon, 1);
      }
    }

    for (let i = 0; i < exclusiveCells.length; i++) {
      const cell = exclusiveCells[i];
      if (cell.polygon) {
        this.viewportManager.writeMask(cell.polygon, i + 2);
      }
    }

    // Phase 2: Render all scenes with stencil test
    if (playerCell) {
      this._renderCellWithStencil(playerCell, 1, false);
    }

    for (let i = 0; i < exclusiveCells.length; i++) {
      const cell = exclusiveCells[i];
      const refValue = i + 2;

      if (cell.type === 'ui') {
        this._renderUiCell(cell, refValue);
      } else {
        this._renderCellWithStencil(cell, refValue, true);
      }
    }
  }

  /**
   * Render a single cell where stencil matches refValue
   * @private
   */
  _renderCellWithStencil(cell, refValue, useFrustumShift = false) {
    const gl = this.renderer.getContext();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    this.renderer.setScissorTest(false);
    gl.viewport(0, 0, screenW, screenH);

    if (useFrustumShift) {
      const ndcOffsetX = (cell.seed.x / screenW) * 2 - 1;
      const ndcOffsetY = 1 - (cell.seed.y / screenH) * 2;

      cell.camera.aspect = screenW / screenH;
      cell.camera.updateProjectionMatrix();

      const projMatrix = cell.camera.projectionMatrix;
      projMatrix.elements[8] = -ndcOffsetX;
      projMatrix.elements[9] = -ndcOffsetY;
    } else {
      cell.camera.aspect = screenW / screenH;
      cell.camera.updateProjectionMatrix();
    }

    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, refValue, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0x00);

    this.renderer.render(this.scene, cell.camera);

    gl.disable(gl.STENCIL_TEST);
  }

  /**
   * Render a 2D UI cell with orthographic projection
   * @private
   */
  _renderUiCell(cell, refValue) {
    const gl = this.renderer.getContext();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    this.renderer.setScissorTest(false);
    gl.viewport(0, 0, screenW, screenH);

    cell.updateOrthographicFrustum();

    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, refValue, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0x00);

    if (cell.scene) {
      this.renderer.render(cell.scene, cell.camera);
    }

    gl.disable(gl.STENCIL_TEST);
  }

  /**
   * Handle window resize
   * @private
   */
  _onResize() {
    this._bounds = [0, 0, window.innerWidth, window.innerHeight];

    const playerCell = this.getPlayerCell();
    if (playerCell) {
      playerCell.seed.x = window.innerWidth / 2;
      playerCell.seed.y = window.innerHeight / 2;
    }

    this._computeVoronoi();
  }
}
