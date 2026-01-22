/**
 * CellBorderRenderer - Draws borders between Voronoi cells
 * Renders as an overlay on top of all cells (no stencil masking)
 * Uses NDC coordinates [-1, 1] to match StencilRenderer
 */

import * as THREE from 'three';
import { findRadialIntersection, findLongestNonEdgeSegment } from './LabelPositioner.js';

export class CellBorderRenderer {
  constructor() {
    // Orthographic camera in NDC coordinates: [-1, 1] range
    // Matches the mask camera in StencilRenderer
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Scene for border geometry
    this.scene = new THREE.Scene();

    // Border line material - green for visibility during testing
    this.borderMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 2
    });

    // Border mesh (LineSegments)
    this.borderMesh = null;

    // Edge marker for off-screen target indicator
    this.edgeMarkerMesh = null;
    this.edgeMarkerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      depthTest: false,
      depthWrite: false
    });
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
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = 1 - (screenY / height) * 2;
    return [ndcX, ndcY];
  }

  /**
   * Check if a line segment lies on the screen edge
   * @param {number} x1 - Start X (screen coords)
   * @param {number} y1 - Start Y (screen coords)
   * @param {number} x2 - End X (screen coords)
   * @param {number} y2 - End Y (screen coords)
   * @returns {boolean} True if segment is on screen edge
   */
  isOnScreenEdge(x1, y1, x2, y2) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const threshold = 2;

    // Left edge
    if (Math.abs(x1) < threshold && Math.abs(x2) < threshold) return true;
    // Right edge
    if (Math.abs(x1 - screenW) < threshold && Math.abs(x2 - screenW) < threshold) return true;
    // Top edge
    if (Math.abs(y1) < threshold && Math.abs(y2) < threshold) return true;
    // Bottom edge
    if (Math.abs(y1 - screenH) < threshold && Math.abs(y2 - screenH) < threshold) return true;

    return false;
  }

  /**
   * Build border geometry from Voronoi cell polygons
   * Only draws borders for EXCLUSIVE (off-screen) cells, not merged on-screen cells
   * Also skips segments that lie on screen edges
   * @param {Array} cells - Array of VoronoiCell instances
   */
  updateFromCells(cells) {
    // Dispose old geometry
    if (this.borderMesh) {
      this.borderMesh.geometry.dispose();
      this.scene.remove(this.borderMesh);
      this.borderMesh = null;
    }

    if (!cells || cells.length === 0) return;

    const positions = [];

    // Only draw borders for EXCLUSIVE cells (off-screen targets, UI cells)
    // On-screen cells (player + visible targets) merge and should have no internal borders
    const exclusiveCells = cells.filter(c => c.type !== 'player' && c.onScreen === false);

    // Collect edges from exclusive cells, skip screen-edge segments
    for (const cell of exclusiveCells) {
      if (!cell.polygon) continue;

      const polygon = cell.polygon;
      for (let i = 0; i < polygon.length - 1; i++) {
        const sx1 = polygon[i][0];
        const sy1 = polygon[i][1];
        const sx2 = polygon[i + 1][0];
        const sy2 = polygon[i + 1][1];

        // Skip segments on screen edges
        if (this.isOnScreenEdge(sx1, sy1, sx2, sy2)) continue;

        const [x1, y1] = this.screenToNDC(sx1, sy1);
        const [x2, y2] = this.screenToNDC(sx2, sy2);
        positions.push(x1, y1, 0, x2, y2, 0);
      }
    }

    if (positions.length === 0) return;

    // Create geometry from positions
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3));

    this.borderMesh = new THREE.LineSegments(geometry, this.borderMaterial);
    this.scene.add(this.borderMesh);
  }

  /**
   * Update edge marker position for off-screen target indicator
   * @param {Object|null} screenPos - { x, y } in screen coordinates, or null to hide
   */
  updateEdgeMarker(screenPos) {
    // Remove existing marker
    if (this.edgeMarkerMesh) {
      this.scene.remove(this.edgeMarkerMesh);
      this.edgeMarkerMesh.geometry.dispose();
      this.edgeMarkerMesh = null;
    }

    if (!screenPos) return;

    // Convert to NDC
    const [ndcX, ndcY] = this.screenToNDC(screenPos.x, screenPos.y);

    // Create a small circle at the edge point
    const geometry = new THREE.CircleGeometry(0.015, 16);
    this.edgeMarkerMesh = new THREE.Mesh(geometry, this.edgeMarkerMaterial);
    this.edgeMarkerMesh.position.set(ndcX, ndcY, 0);
    this.scene.add(this.edgeMarkerMesh);
  }

  /**
   * Render borders (call after all cells have been rendered)
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
   */
  render(renderer) {
    if (!this.borderMesh && !this.edgeMarkerMesh) return;

    const gl = renderer.getContext();

    // Reset viewport to full screen (in case it was changed)
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(false);

    // Ensure stencil test is disabled so we can draw everywhere
    gl.disable(gl.STENCIL_TEST);

    // Disable depth test so borders/markers draw on top
    gl.disable(gl.DEPTH_TEST);

    renderer.render(this.scene, this.camera);

    // Re-enable depth test
    gl.enable(gl.DEPTH_TEST);
  }

  /**
   * Compute label position for a cell
   *
   * Uses radial intersection: finds where the line from screen center to
   * the cell's seed intersects the cell border. This gives a unique,
   * consistent position on the "path" from main viewport to target cell.
   *
   * Falls back to longest non-edge segment midpoint if radial fails.
   *
   * @param {VoronoiCell} cell - The cell to compute label position for
   * @returns {{x: number, y: number}|null} Label position in screen coordinates, or null
   */
  computeLabelPosition(cell) {
    if (!cell.polygon) return null;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Primary: radial intersection from screen center toward seed
    const radialResult = findRadialIntersection(
      cell.polygon,
      cell.seed.x,
      cell.seed.y,
      screenW,
      screenH
    );

    if (radialResult) {
      return { x: radialResult.x, y: radialResult.y };
    }

    // Fallback: midpoint of longest non-edge segment
    const fallbackResult = findLongestNonEdgeSegment(cell.polygon, screenW, screenH);
    return fallbackResult ? { x: fallbackResult.x, y: fallbackResult.y } : null;
  }

  /**
   * Handle window resize
   * NDC camera is fixed [-1, 1], no update needed
   * Border geometry will be rebuilt when computeVoronoi() is called
   */
  onResize(width, height) {
    // NDC camera doesn't need updating - coordinates are normalized
    // Borders will be rebuilt via updateFromCells() after Voronoi recomputation
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.borderMesh) {
      this.borderMesh.geometry.dispose();
    }
    if (this.edgeMarkerMesh) {
      this.edgeMarkerMesh.geometry.dispose();
    }
    this.borderMaterial.dispose();
    this.edgeMarkerMaterial.dispose();
  }
}
