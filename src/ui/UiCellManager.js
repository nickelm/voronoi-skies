/**
 * UiCellManager - Manages 2D UI cells with orthographic projection
 *
 * UI cells are Voronoi cells that render 2D content (instruments, gauges)
 * at fixed screen positions. Each UI cell has its own isolated scene and
 * orthographic camera.
 */

import { VoronoiCell } from '../voronoi/VoronoiCell.js';
import { UiSceneFactory } from './UiSceneFactory.js';

export class UiCellManager {
  /**
   * @param {import('../voronoi/VoronoiCellManager.js').VoronoiCellManager} voronoiCellManager
   */
  constructor(voronoiCellManager) {
    this.cellManager = voronoiCellManager;

    // Map of id -> { cell, scene, enabled, sceneData }
    this.uiCells = new Map();

    // Scene factory for creating UI content
    this.sceneFactory = new UiSceneFactory();

    // Listen for resize events to update positions
    window.addEventListener('resize', () => this._onResize());
  }

  /**
   * Register a UI cell at an arbitrary screen position
   *
   * @param {string} id - Unique identifier for this UI cell
   * @param {number} x - Screen X coordinate (pixels if >= 1, ratio if < 1)
   * @param {number} y - Screen Y coordinate (pixels if >= 1, ratio if < 1)
   * @param {string} instrumentType - Type of instrument: 'test' | 'altimeter' | 'compass'
   * @param {Object} [options] - Additional options
   * @param {number} [options.color] - Color for test scenes
   * @param {number} [options.deconflictRadius=0.05] - Deconfliction radius as screen ratio (0-1)
   *        Targets within this radius will be pushed away to ensure UI visibility
   * @returns {VoronoiCell} The created UI cell
   */
  registerUiCell(id, x, y, instrumentType, options = {}) {
    // Remove existing cell with same id if present
    if (this.uiCells.has(id)) {
      this.removeUiCell(id);
    }

    // Create scene based on instrument type
    let sceneData;
    switch (instrumentType) {
      case 'test':
        sceneData = this.sceneFactory.createTestScene(options.color);
        break;
      // Future instrument types can be added here
      default:
        sceneData = this.sceneFactory.createTestScene(options.color);
    }

    // Create VoronoiCell with orthographic camera
    const cell = new VoronoiCell({
      id: this.cellManager.cells.length,
      type: 'ui',
      cameraType: 'orthographic',
      scene: sceneData.scene
    });

    // Calculate actual screen position
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const actualX = x < 1 ? x * screenW : x;
    const actualY = y < 1 ? y * screenH : y;

    cell.seed = { x: actualX, y: actualY };

    // UI cells are always exclusive (never merge with player)
    cell.onScreen = false;

    // Store original position ratios for resize handling
    // Default deconfliction radius is 5% of screen diagonal
    const deconflictRadius = options.deconflictRadius !== undefined ? options.deconflictRadius : 0.05;

    const uiCellData = {
      cell,
      scene: sceneData.scene,
      sceneData,
      enabled: true,
      posX: x,
      posY: y,
      instrumentType,
      deconflictRadius
    };

    this.uiCells.set(id, uiCellData);

    // Add to VoronoiCellManager
    this.cellManager.cells.push(cell);
    this.cellManager.computeVoronoi();

    return cell;
  }

  /**
   * Remove a UI cell by id
   * @param {string} id - UI cell identifier
   */
  removeUiCell(id) {
    const uiCellData = this.uiCells.get(id);
    if (!uiCellData) return;

    // Remove from VoronoiCellManager
    this.cellManager.removeCell(uiCellData.cell);

    // Dispose scene resources
    this._disposeScene(uiCellData.scene);

    this.uiCells.delete(id);
  }

  /**
   * Enable or disable a UI cell
   * @param {string} id - UI cell identifier
   * @param {boolean} enabled - Whether the cell should be visible
   */
  setEnabled(id, enabled) {
    const uiCellData = this.uiCells.get(id);
    if (!uiCellData) return;

    if (enabled === uiCellData.enabled) return;

    uiCellData.enabled = enabled;

    if (enabled) {
      // Re-add to VoronoiCellManager
      this.cellManager.cells.push(uiCellData.cell);
    } else {
      // Remove from VoronoiCellManager (but keep in our map)
      const index = this.cellManager.cells.indexOf(uiCellData.cell);
      if (index !== -1) {
        this.cellManager.cells.splice(index, 1);
      }
    }

    this.cellManager.computeVoronoi();
  }

  /**
   * Update UI cell position
   * @param {string} id - UI cell identifier
   * @param {number} x - New X position (pixels if >= 1, ratio if < 1)
   * @param {number} y - New Y position (pixels if >= 1, ratio if < 1)
   */
  setPosition(id, x, y) {
    const uiCellData = this.uiCells.get(id);
    if (!uiCellData) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const actualX = x < 1 ? x * screenW : x;
    const actualY = y < 1 ? y * screenH : y;

    uiCellData.posX = x;
    uiCellData.posY = y;
    uiCellData.cell.seed = { x: actualX, y: actualY };

    if (uiCellData.enabled) {
      this.cellManager.computeVoronoi();
    }
  }

  /**
   * Get all active UI cell seeds for deconfliction
   * @returns {Array<{id: string, x: number, y: number, radius: number}>}
   *          radius is in pixels, computed from the relative deconflictRadius
   */
  getActiveUiSeeds() {
    const seeds = [];
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    // Use screen diagonal for radius calculation
    const screenDiag = Math.hypot(screenW, screenH);

    for (const [id, data] of this.uiCells) {
      if (data.enabled) {
        seeds.push({
          id,
          x: data.cell.seed.x,
          y: data.cell.seed.y,
          // Convert relative radius to pixels based on screen diagonal
          radius: data.deconflictRadius * screenDiag
        });
      }
    }
    return seeds;
  }

  /**
   * Update instrument displays (for animated instruments)
   * @param {Object} playerState - Current player state
   * @param {number} [playerState.altitude] - Altitude in feet
   * @param {number} [playerState.heading] - Heading in degrees
   */
  updateInstruments(playerState) {
    // Future: animate instrument needles, update readouts, etc.
    // For now, test scenes don't need updates
  }

  /**
   * Handle window resize - reposition UI cells based on stored ratios
   * @private
   */
  _onResize() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    for (const [id, data] of this.uiCells) {
      // Recalculate position from stored ratio/pixel values
      const actualX = data.posX < 1 ? data.posX * screenW : data.posX;
      const actualY = data.posY < 1 ? data.posY * screenH : data.posY;

      data.cell.seed = { x: actualX, y: actualY };
    }

    // VoronoiCellManager will recompute Voronoi on its own resize handler
  }

  /**
   * Dispose of a scene's resources
   * @private
   * @param {THREE.Scene} scene
   */
  _disposeScene(scene) {
    scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  /**
   * Clean up all resources
   */
  dispose() {
    for (const [id, data] of this.uiCells) {
      this._disposeScene(data.scene);
    }
    this.uiCells.clear();
  }
}
