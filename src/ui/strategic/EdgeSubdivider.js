/**
 * EdgeSubdivider - Subdivides Voronoi edges with noise displacement
 * for organic terrain rendering.
 *
 * Each edge is subdivided into N segments, with each subdivision point
 * displaced perpendicular to the edge using 2D noise sampling.
 * Coastlines receive more subdivisions and larger displacement amplitude.
 */
import FastNoiseLite from 'fastnoise-lite';

// Default configuration
const DEFAULT_CONFIG = {
  subdivisions: 5,           // Interior edge subdivisions
  noiseAmplitude: 0.25,      // Displacement as fraction of edge length
  noiseFrequency: 0.001,     // Noise sampling frequency
  coastlineSubdivisions: 8,  // More subdivisions for coastlines
  coastlineAmplitude: 0.35   // Larger displacement for coastlines
};

export class EdgeSubdivider {
  /**
   * @param {Object} options
   * @param {number} options.seed - Island seed for deterministic noise
   * @param {number} options.subdivisions - Default subdivision count (3-10)
   * @param {number} options.noiseAmplitude - Displacement amplitude (0.1-0.5)
   * @param {number} options.noiseFrequency - Noise sampling frequency
   * @param {number} options.coastlineSubdivisions - Subdivisions for coastlines
   * @param {number} options.coastlineAmplitude - Amplitude for coastlines
   */
  constructor(options = {}) {
    this.seed = options.seed ?? 42;
    this.subdivisions = options.subdivisions ?? DEFAULT_CONFIG.subdivisions;
    this.noiseAmplitude = options.noiseAmplitude ?? DEFAULT_CONFIG.noiseAmplitude;
    this.noiseFrequency = options.noiseFrequency ?? DEFAULT_CONFIG.noiseFrequency;
    this.coastlineSubdivisions = options.coastlineSubdivisions ?? DEFAULT_CONFIG.coastlineSubdivisions;
    this.coastlineAmplitude = options.coastlineAmplitude ?? DEFAULT_CONFIG.coastlineAmplitude;

    // Cache for subdivided paths: Map<edgeId, {points: [x,y][], isCoastline: boolean}>
    this._cache = new Map();

    // Initialize noise generator with offset seed for independence
    this._noise = new FastNoiseLite(this.seed + 5000);
    this._noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);
    this._noise.SetFrequency(this.noiseFrequency);
  }

  /**
   * Update parameters and clear cache
   * @param {Object} params - Partial parameter updates
   */
  setParameters(params) {
    let frequencyChanged = false;

    if (params.subdivisions !== undefined) {
      this.subdivisions = params.subdivisions;
    }
    if (params.noiseAmplitude !== undefined) {
      this.noiseAmplitude = params.noiseAmplitude;
    }
    if (params.noiseFrequency !== undefined && params.noiseFrequency !== this.noiseFrequency) {
      this.noiseFrequency = params.noiseFrequency;
      this._noise.SetFrequency(this.noiseFrequency);
      frequencyChanged = true;
    }
    if (params.coastlineSubdivisions !== undefined) {
      this.coastlineSubdivisions = params.coastlineSubdivisions;
    }
    if (params.coastlineAmplitude !== undefined) {
      this.coastlineAmplitude = params.coastlineAmplitude;
    }

    // Always clear cache when parameters change
    this._cache.clear();
  }

  /**
   * Precompute subdivisions for all edges
   * @param {Object[]} edges - Array of edge objects from IslandGraph
   * @param {Function} getCorner - Function to get corner by ID
   */
  precompute(edges, getCorner) {
    this._cache.clear();
    for (const edge of edges) {
      this._subdivideEdge(edge, getCorner);
    }
  }

  /**
   * Get subdivided path for an edge (computes if not cached)
   * @param {Object} edge - Edge object with id, corners[], isCoastline
   * @param {Function} getCorner - Function to get corner by ID
   * @returns {number[][]} Array of [x, y] points along the path
   */
  getSubdividedPath(edge, getCorner) {
    if (!this._cache.has(edge.id)) {
      this._subdivideEdge(edge, getCorner);
    }
    return this._cache.get(edge.id).points;
  }

  /**
   * Check if an edge is a coastline (from cache)
   * @param {number} edgeId - Edge ID
   * @returns {boolean}
   */
  isCoastline(edgeId) {
    const cached = this._cache.get(edgeId);
    return cached ? cached.isCoastline : false;
  }

  /**
   * Internal: compute subdivided path for a single edge
   * @param {Object} edge - Edge object
   * @param {Function} getCorner - Function to get corner by ID
   */
  _subdivideEdge(edge, getCorner) {
    const c0 = getCorner(edge.corners[0]);
    const c1 = getCorner(edge.corners[1]);

    // Handle missing corners gracefully
    if (!c0 || !c1) {
      this._cache.set(edge.id, { points: [], isCoastline: edge.isCoastline });
      return;
    }

    const p0 = c0.position;
    const p1 = c1.position;

    // Edge vector
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const length = Math.sqrt(dx * dx + dy * dy);

    // Handle degenerate edges
    if (length < 0.001) {
      this._cache.set(edge.id, { points: [p0.slice()], isCoastline: edge.isCoastline });
      return;
    }

    // Perpendicular direction (normalized, 90 degrees CCW)
    const perpX = -dy / length;
    const perpY = dx / length;

    // Determine subdivisions and amplitude based on edge type
    const isCoastline = edge.isCoastline;
    const subdivs = isCoastline ? this.coastlineSubdivisions : this.subdivisions;
    const amplitude = isCoastline ? this.coastlineAmplitude : this.noiseAmplitude;
    const maxDisplacement = amplitude * length;

    // Build path starting with first corner
    const points = [p0.slice()];

    for (let i = 1; i < subdivs; i++) {
      const t = i / subdivs;

      // Interpolated position along edge
      const baseX = p0[0] + dx * t;
      const baseY = p0[1] + dy * t;

      // Sample noise at this position for displacement
      // Noise returns approximately [-1, 1]
      const noiseValue = this._noise.GetNoise(baseX, baseY);
      const displacement = noiseValue * maxDisplacement;

      // Apply perpendicular displacement
      points.push([
        baseX + perpX * displacement,
        baseY + perpY * displacement
      ]);
    }

    // End with second corner
    points.push(p1.slice());

    this._cache.set(edge.id, { points, isCoastline });
  }

  /**
   * Clear cached subdivisions
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Get cache statistics for debugging
   * @returns {{size: number, coastlines: number}}
   */
  getCacheStats() {
    let coastlines = 0;
    for (const entry of this._cache.values()) {
      if (entry.isCoastline) coastlines++;
    }
    return { size: this._cache.size, coastlines };
  }
}
