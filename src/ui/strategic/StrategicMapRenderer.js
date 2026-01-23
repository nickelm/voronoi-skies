/**
 * StrategicMapRenderer - Canvas 2D renderer for island visualization
 *
 * Renders an IslandGraph as a 2D map with biome-based coloring,
 * coastline highlighting, rivers, and support for pan/zoom interaction.
 */

import { getBiomeColor } from '../../terrain/island/BiomeClassifier.js';

// Color palette for fallback (when no biome assigned)
const COLORS = {
  BACKGROUND: '#0a0a12',
  COASTLINE: '#1a1a1a',

  // Ocean (depth gradient)
  DEEP_OCEAN: '#0a2463',
  SHALLOW_OCEAN: '#1e5f8a',

  // Land (elevation bands)
  BEACH: '#c9b896',
  LOWLAND: '#7a9f5f',
  FOREST: '#2d5a27',
  MOUNTAIN: '#6b6b6b',
  SNOW: '#d0d8d5',

  // Rivers
  RIVER: '#2570a0'
};

// River rendering configuration
const RIVER_WIDTH_BASE = 1;
const RIVER_WIDTH_SCALE = 0.015;  // Width increases with flow
const RIVER_MAX_WIDTH = 6;

export class StrategicMapRenderer {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} options.canvas - Canvas element to render to
   * @param {Object} options.island - IslandGraph instance
   */
  constructor(options = {}) {
    if (!options.canvas) {
      throw new Error('StrategicMapRenderer requires a canvas element');
    }
    if (!options.island) {
      throw new Error('StrategicMapRenderer requires an island graph');
    }

    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.island = options.island;

    // View transform: offsetX/Y is the world coordinate at canvas center
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1; // Pixels per world unit (higher = more zoomed in)
  }

  /**
   * Render the complete island map
   */
  render() {
    this.clear();
    this.renderRegions();
    this.renderCoastlines();
    this.renderRivers();
  }

  /**
   * Clear the canvas
   */
  clear() {
    this.ctx.fillStyle = COLORS.BACKGROUND;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render all regions as filled polygons
   */
  renderRegions() {
    const ctx = this.ctx;

    for (const region of this.island.regions) {
      const verts = region.vertices;
      if (!verts || verts.length < 3) continue;

      ctx.beginPath();
      const [sx, sy] = this.worldToScreen(verts[0]);
      ctx.moveTo(sx, sy);

      for (let i = 1; i < verts.length; i++) {
        const [px, py] = this.worldToScreen(verts[i]);
        ctx.lineTo(px, py);
      }

      ctx.closePath();
      ctx.fillStyle = this.getRegionColor(region);
      ctx.fill();
    }
  }

  /**
   * Render coastline edges with emphasis
   */
  renderCoastlines() {
    const ctx = this.ctx;
    const coastlines = this.island.getCoastlineEdges();

    ctx.strokeStyle = COLORS.COASTLINE;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    for (const edge of coastlines) {
      const c0 = this.island.getCorner(edge.corners[0]);
      const c1 = this.island.getCorner(edge.corners[1]);

      if (!c0 || !c1) continue;

      const [x0, y0] = this.worldToScreen(c0.position);
      const [x1, y1] = this.worldToScreen(c1.position);

      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }

    ctx.stroke();
  }

  /**
   * Render rivers as blue lines along river edges
   */
  renderRivers() {
    const ctx = this.ctx;

    // Get river edges (if method exists)
    if (!this.island.getRiverEdges) return;
    const rivers = this.island.getRiverEdges();
    if (!rivers || rivers.length === 0) return;

    ctx.strokeStyle = COLORS.RIVER;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Sort by flow (draw smaller rivers first, larger on top)
    const sorted = [...rivers].sort((a, b) => (a.riverFlow || 0) - (b.riverFlow || 0));

    for (const edge of sorted) {
      const c0 = this.island.getCorner(edge.corners[0]);
      const c1 = this.island.getCorner(edge.corners[1]);
      if (!c0 || !c1) continue;

      // Width based on flow
      const flow = edge.riverFlow || 0;
      const width = Math.min(
        RIVER_WIDTH_BASE + flow * RIVER_WIDTH_SCALE,
        RIVER_MAX_WIDTH
      );
      ctx.lineWidth = width;

      const [x0, y0] = this.worldToScreen(c0.position);
      const [x1, y1] = this.worldToScreen(c1.position);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  /**
   * Convert world coordinates to screen coordinates
   * @param {number[]} worldPos - [wx, wy] world position
   * @returns {number[]} [sx, sy] screen position
   */
  worldToScreen([wx, wy]) {
    const sx = (wx - this.offsetX) * this.scale + this.canvas.width / 2;
    const sy = (wy - this.offsetY) * this.scale + this.canvas.height / 2;
    return [sx, sy];
  }

  /**
   * Convert screen coordinates to world coordinates
   * @param {number} sx - Screen X
   * @param {number} sy - Screen Y
   * @returns {number[]} [wx, wy] world position
   */
  screenToWorld(sx, sy) {
    const wx = (sx - this.canvas.width / 2) / this.scale + this.offsetX;
    const wy = (sy - this.canvas.height / 2) / this.scale + this.offsetY;
    return [wx, wy];
  }

  /**
   * Get fill color for a region based on biome or elevation
   * @param {Object} region - Region object
   * @returns {string} CSS color string
   */
  getRegionColor(region) {
    // Use biome color if biome is assigned
    // For ocean regions, biome will be 'deep_ocean', 'ocean', or 'reef'
    if (region.biome) {
      return getBiomeColor(region.biome);
    }

    // Fallback: elevation-based coloring (for islands without biome assignment)
    if (region.isOcean) {
      const depth = Math.min(1, Math.abs(region.elevation));
      return this._lerpColor(COLORS.SHALLOW_OCEAN, COLORS.DEEP_OCEAN, depth);
    }

    const e = Math.max(0, Math.min(1, region.elevation));
    if (e < 0.1) return COLORS.BEACH;
    if (e < 0.3) return COLORS.LOWLAND;
    if (e < 0.6) return COLORS.FOREST;
    if (e < 0.8) return COLORS.MOUNTAIN;
    return COLORS.SNOW;
  }

  /**
   * Linearly interpolate between two hex colors
   * @param {string} color1 - Start color (hex string)
   * @param {string} color2 - End color (hex string)
   * @param {number} t - Interpolation factor [0, 1]
   * @returns {string} Interpolated color as hex string
   */
  _lerpColor(color1, color2, t) {
    const c1 = this._parseHex(color1);
    const c2 = this._parseHex(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);

    return `rgb(${r},${g},${b})`;
  }

  /**
   * Parse hex color string to RGB
   * @param {string} hex - Color string like '#0a2463'
   * @returns {{r: number, g: number, b: number}}
   */
  _parseHex(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  /**
   * Set view to fit entire island with padding
   */
  fitToIsland() {
    const bounds = this.island.bounds;
    if (!bounds) return;

    const padding = 0.1; // 10% padding on each side

    const worldWidth = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;

    // Calculate scale to fit island in canvas
    const scaleX = this.canvas.width * (1 - 2 * padding) / worldWidth;
    const scaleY = this.canvas.height * (1 - 2 * padding) / worldHeight;

    this.scale = Math.min(scaleX, scaleY);

    // Center on island
    this.offsetX = (bounds.minX + bounds.maxX) / 2;
    this.offsetY = (bounds.minY + bounds.maxY) / 2;

    this.render();
  }

  /**
   * Handle canvas resize
   */
  resize() {
    // Trigger re-render on next frame
    this.render();
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.ctx = null;
    this.canvas = null;
    this.island = null;
  }
}
