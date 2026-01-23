/**
 * HillshadeCalculator - Computes hillshade values for 2D region rendering
 *
 * Uses neighbor elevation differencing to estimate surface gradient,
 * then applies standard hillshade calculation for lighting effect.
 */
import { getLightDirection, computeHillshadeFromGradient } from '../../terrain/lighting.js';

// Default configuration
const DEFAULT_CONFIG = {
  azimuth: 315,      // Light direction (0=N, 90=E, 180=S, 270=W, 315=NW)
  elevation: 45,     // Light elevation above horizon (15-75)
  intensity: 1.0,    // Hillshade strength (0-1)
  ambient: 0.3,      // Shadow floor / minimum brightness (0-1)
  // Gradient scale needs to be very high because:
  // - Elevation is in [-1, 1] range
  // - Distances between region centroids are 500-1000+ meters
  // - Raw gradient is ~0.0001, needs to be scaled to ~1.0 for visible shading
  gradientScale: 5000.0
};

export class HillshadeCalculator {
  /**
   * @param {Object} options
   * @param {number} options.azimuth - Light direction (0-360, 315=NW default)
   * @param {number} options.elevation - Light elevation (15-75, 45 default)
   * @param {number} options.intensity - Hillshade strength (0-1)
   * @param {number} options.ambient - Shadow floor (0-1)
   * @param {number} options.gradientScale - Gradient scaling factor
   */
  constructor(options = {}) {
    this.azimuth = options.azimuth ?? DEFAULT_CONFIG.azimuth;
    this.elevation = options.elevation ?? DEFAULT_CONFIG.elevation;
    this.intensity = options.intensity ?? DEFAULT_CONFIG.intensity;
    this.ambient = options.ambient ?? DEFAULT_CONFIG.ambient;
    this.gradientScale = options.gradientScale ?? DEFAULT_CONFIG.gradientScale;

    // Cached light direction vector
    this._lightDir = null;
    this._updateLightDirection();

    // Cache for hillshade values: Map<regionId, hillshadeValue>
    this._cache = new Map();

    // Elevation normalization parameters (set during precompute)
    this._elevationScale = 1.0;
    this._elevationOffset = 0.0;
  }

  /**
   * Update light parameters
   * @param {Object} params - Partial parameter updates
   */
  setParameters(params) {
    let needsLightUpdate = false;

    if (params.azimuth !== undefined && params.azimuth !== this.azimuth) {
      this.azimuth = params.azimuth;
      needsLightUpdate = true;
    }
    if (params.elevation !== undefined && params.elevation !== this.elevation) {
      this.elevation = params.elevation;
      needsLightUpdate = true;
    }
    if (params.intensity !== undefined) {
      this.intensity = params.intensity;
    }
    if (params.ambient !== undefined) {
      this.ambient = params.ambient;
    }
    if (params.gradientScale !== undefined) {
      this.gradientScale = params.gradientScale;
    }

    if (needsLightUpdate) {
      this._updateLightDirection();
      this._cache.clear();
    }
  }

  /**
   * Update cached light direction from azimuth/elevation
   */
  _updateLightDirection() {
    this._lightDir = getLightDirection(this.azimuth, this.elevation);
  }

  /**
   * Precompute hillshade for all regions
   * @param {Object[]} regions - Array of region objects from IslandGraph
   */
  precompute(regions) {
    this._cache.clear();

    // Build region lookup map for efficient neighbor access
    const regionMap = new Map(regions.map(r => [r.id, r]));

    // First pass: find elevation range for land regions only
    let minLandElev = Infinity;
    let maxLandElev = -Infinity;
    for (const region of regions) {
      if (!region.isOcean) {
        minLandElev = Math.min(minLandElev, region.elevation);
        maxLandElev = Math.max(maxLandElev, region.elevation);
      }
    }

    // Store normalization parameters for gradient scaling
    const elevRange = maxLandElev - minLandElev;
    this._elevationScale = elevRange > 0.001 ? 1.0 / elevRange : 1.0;
    this._elevationOffset = minLandElev;

    // Second pass: compute hillshade with normalized elevations
    let minHillshade = 1;
    let maxHillshade = 0;

    for (const region of regions) {
      const hillshade = this._computeRegionHillshade(region, regionMap);
      this._cache.set(region.id, hillshade);

      minHillshade = Math.min(minHillshade, hillshade);
      maxHillshade = Math.max(maxHillshade, hillshade);
    }

    console.log(`Hillshade precomputed: range [${minHillshade.toFixed(3)}, ${maxHillshade.toFixed(3)}]`);
    console.log(`Land elevation range: [${minLandElev.toFixed(3)}, ${maxLandElev.toFixed(3)}] (normalized to [0, 1])`);
  }

  /**
   * Get hillshade value for a region
   * @param {Object} region - Region object with id
   * @returns {number} Hillshade factor [0, 1], 1=fully lit, 0=in shadow
   */
  getHillshade(region) {
    return this._cache.get(region.id) ?? 0.5;
  }

  /**
   * Apply hillshade to a base color
   * @param {string} hexColor - Base color as hex string (#RRGGBB)
   * @param {number} hillshade - Hillshade value [0, 1]
   * @returns {string} Shaded color as rgb() string
   */
  applyToColor(hexColor, hillshade) {
    // Parse hex color
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Compute luminance factor:
    // luminance = ambient + hillshade * intensity * (1 - ambient)
    // At hillshade=0 (shadow): luminance = ambient
    // At hillshade=1 (full light): luminance = ambient + intensity*(1-ambient)
    const luminance = this.ambient + hillshade * this.intensity * (1 - this.ambient);

    // Apply luminance and clamp
    const finalR = Math.min(255, Math.max(0, Math.round(r * luminance)));
    const finalG = Math.min(255, Math.max(0, Math.round(g * luminance)));
    const finalB = Math.min(255, Math.max(0, Math.round(b * luminance)));

    return `rgb(${finalR},${finalG},${finalB})`;
  }

  /**
   * Normalize an elevation value to [0, 1] range based on land elevation range
   */
  _normalizeElevation(elevation) {
    return (elevation - this._elevationOffset) * this._elevationScale;
  }

  /**
   * Internal: compute hillshade for a single region using neighbor differencing
   * @param {Object} region - Region with centroid, elevation, neighbors[]
   * @param {Map} regionMap - Map of regionId -> region
   * @returns {number} Hillshade value [0, 1]
   */
  _computeRegionHillshade(region, regionMap) {
    const cx = region.centroid[0];
    const cy = region.centroid[1];
    // Use normalized elevation for consistent gradient scaling
    const e0 = this._normalizeElevation(region.elevation);

    // Accumulate gradient components from all neighbors
    let sumGradX = 0;
    let sumGradY = 0;
    let count = 0;

    for (const neighborId of region.neighbors) {
      const neighbor = regionMap.get(neighborId);
      if (!neighbor) continue;

      const ncx = neighbor.centroid[0];
      const ncy = neighbor.centroid[1];
      const ne = this._normalizeElevation(neighbor.elevation);

      // Direction and distance to neighbor
      const dx = ncx - cx;
      const dy = ncy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Skip degenerate cases
      if (dist < 0.001) continue;

      // Elevation difference per unit distance in this direction
      const de = ne - e0;
      const gradMag = de / dist;

      // Decompose gradient magnitude into X and Y components
      // Direction is normalized (dx/dist, dy/dist)
      sumGradX += (dx / dist) * gradMag;
      sumGradY += (dy / dist) * gradMag;
      count++;
    }

    // Handle regions with no valid neighbors
    if (count === 0) {
      return 0.5; // Neutral lighting
    }

    // Average gradient across all neighbors
    const gradX = sumGradX / count;
    const gradY = sumGradY / count;

    // Scale gradient for visual effect
    // Elevation is typically [0, 1] or [-1, 1], need scaling for visible shading
    const scaledGradX = gradX * this.gradientScale;
    const scaledGradY = gradY * this.gradientScale;

    // Compute hillshade using lighting.js function
    return computeHillshadeFromGradient(scaledGradX, scaledGradY, this._lightDir);
  }

  /**
   * Clear cached values
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Get cache statistics for debugging
   * @returns {{size: number}}
   */
  getCacheStats() {
    return { size: this._cache.size };
  }
}
