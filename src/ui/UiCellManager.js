/**
 * UiCellManager - Manages 2D UI cells with orthographic projection
 *
 * UI cells are Voronoi cells that render 2D content (instruments, gauges)
 * at fixed screen positions. Each UI cell has its own isolated scene and
 * orthographic camera.
 *
 * This class acts as a facade over VoronoiCellManager for UI-specific concerns:
 * - Creates cells with orthographic cameras
 * - Manages dedicated scenes per cell
 * - Handles position updates (pixel or ratio-based)
 * - Provides enable/disable functionality
 */

import { VoronoiCell } from '../voronoi/VoronoiCell.js';
import { UiSceneFactory } from './UiSceneFactory.js';

export class UiCellManager {
  /**
   * @param {import('../voronoi/VoronoiCellManager.js').VoronoiCellManager} voronoiCellManager
   */
  constructor(voronoiCellManager) {
    this._cellManager = voronoiCellManager;

    // Map of id -> UiCellData
    this._uiCells = new Map();

    // Scene factory for creating UI content
    this._sceneFactory = new UiSceneFactory();

    // Listen for resize events to update positions
    this._resizeHandler = () => this._onResize();
    window.addEventListener('resize', this._resizeHandler);
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
   * @returns {VoronoiCell} The created UI cell
   */
  registerUiCell(id, x, y, instrumentType, options = {}) {
    // Remove existing cell with same id if present
    if (this._uiCells.has(id)) {
      this.removeUiCell(id);
    }

    // Create scene based on instrument type
    let sceneData;
    switch (instrumentType) {
      case 'test':
        sceneData = this._sceneFactory.createTestScene(options.color);
        break;
      default:
        sceneData = this._sceneFactory.createTestScene(options.color);
    }

    // Calculate deconfliction radius in pixels
    const screenDiag = Math.hypot(window.innerWidth, window.innerHeight);
    const deconflictRatio = options.deconflictRadius !== undefined ? options.deconflictRadius : 0.05;
    const deconflictRadius = deconflictRatio * screenDiag;

    // Create cell via VoronoiCellManager
    const cell = this._cellManager.createCell('ui', {
      cameraType: 'orthographic',
      scene: sceneData.scene,
      deconflictRadius
    });

    // Calculate actual screen position
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const actualX = x < 1 ? x * screenW : x;
    const actualY = y < 1 ? y * screenH : y;

    cell.seed = { x: actualX, y: actualY };

    // UI cells are always exclusive (never merge with player)
    cell.onScreen = false;

    // Recompute Voronoi now that seed position is set
    this._cellManager.computeVoronoi();

    // Store UI-specific data
    const uiCellData = {
      cell,
      scene: sceneData.scene,
      sceneData,
      enabled: true,
      posX: x,
      posY: y,
      instrumentType,
      deconflictRatio
    };

    this._uiCells.set(id, uiCellData);

    return cell;
  }

  /**
   * Remove a UI cell by id
   * @param {string} id - UI cell identifier
   */
  removeUiCell(id) {
    const uiCellData = this._uiCells.get(id);
    if (!uiCellData) return;

    // Unregister from VoronoiCellManager
    this._cellManager.unregisterCell(uiCellData.cell);

    // Dispose scene resources
    this._disposeScene(uiCellData.scene);

    this._uiCells.delete(id);
  }

  /**
   * Enable or disable a UI cell
   * @param {string} id - UI cell identifier
   * @param {boolean} enabled - Whether the cell should be visible
   */
  setEnabled(id, enabled) {
    const uiCellData = this._uiCells.get(id);
    if (!uiCellData) return;

    if (enabled === uiCellData.enabled) return;

    uiCellData.enabled = enabled;

    if (enabled) {
      // Re-register with VoronoiCellManager
      this._cellManager.registerCell(uiCellData.cell);
    } else {
      // Unregister from VoronoiCellManager (but keep in our map)
      this._cellManager.unregisterCell(uiCellData.cell);
    }
  }

  /**
   * Update UI cell position
   * @param {string} id - UI cell identifier
   * @param {number} x - New X position (pixels if >= 1, ratio if < 1)
   * @param {number} y - New Y position (pixels if >= 1, ratio if < 1)
   */
  setPosition(id, x, y) {
    const uiCellData = this._uiCells.get(id);
    if (!uiCellData) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const actualX = x < 1 ? x * screenW : x;
    const actualY = y < 1 ? y * screenH : y;

    uiCellData.posX = x;
    uiCellData.posY = y;
    uiCellData.cell.seed = { x: actualX, y: actualY };

    if (uiCellData.enabled) {
      this._cellManager.computeVoronoi();
    }
  }

  /**
   * Get UI cell data by id
   * @param {string} id - UI cell identifier
   * @returns {Object|undefined} UI cell data or undefined
   */
  getUiCell(id) {
    return this._uiCells.get(id);
  }

  /**
   * Check if a UI cell exists and is enabled
   * @param {string} id - UI cell identifier
   * @returns {boolean}
   */
  isEnabled(id) {
    const data = this._uiCells.get(id);
    return data ? data.enabled : false;
  }

  /**
   * Update instrument displays (for animated instruments)
   * @param {Object} playerState - Current player state
   * @param {number} [playerState.altitude] - Altitude in feet
   * @param {number} [playerState.heading] - Heading in degrees
   */
  updateInstruments(playerState) {
    // Future: animate instrument needles, update readouts, etc.
  }

  /**
   * Clean up all resources
   */
  dispose() {
    window.removeEventListener('resize', this._resizeHandler);

    for (const [id, data] of this._uiCells) {
      this._cellManager.unregisterCell(data.cell);
      this._disposeScene(data.scene);
    }
    this._uiCells.clear();
  }

  /**
   * Handle window resize - reposition UI cells based on stored ratios
   * @private
   */
  _onResize() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const screenDiag = Math.hypot(screenW, screenH);

    for (const [id, data] of this._uiCells) {
      // Recalculate position from stored ratio/pixel values
      const actualX = data.posX < 1 ? data.posX * screenW : data.posX;
      const actualY = data.posY < 1 ? data.posY * screenH : data.posY;

      data.cell.seed = { x: actualX, y: actualY };

      // Update deconfliction radius based on new screen size
      data.cell.deconflictRadius = data.deconflictRatio * screenDiag;
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
}
