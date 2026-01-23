/**
 * IslandGraph - Data structure for discrete polygon-based island geography
 *
 * Holds the complete island as a graph of regions (Voronoi polygons),
 * edges (boundaries), and corners (vertices).
 */

import { SpatialIndex } from './SpatialIndex.js';

/**
 * Ray casting point-in-polygon test
 * @param {number} x - Test point X
 * @param {number} y - Test point Y
 * @param {number[][]} vertices - Polygon vertices (CCW, closed: last = first)
 * @returns {boolean} True if point is inside polygon
 */
function pointInPolygon(x, y, vertices) {
  let inside = false;
  const n = vertices.length - 1; // Last vertex = first, so skip it

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i][0], yi = vertices[i][1];
    const xj = vertices[j][0], yj = vertices[j][1];

    // Check if ray from (x, y) going right crosses this edge
    if (((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Compute AABB for a polygon
 * @param {number[][]} vertices - Polygon vertices
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
function computeBounds(vertices) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const [x, y] of vertices) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Check if two AABBs overlap
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} a
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} b
 * @returns {boolean}
 */
function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
         a.minY <= b.maxY && a.maxY >= b.minY;
}

export class IslandGraph {
  constructor() {
    this.regions = [];   // Array of Region objects
    this.edges = [];     // Array of Edge objects
    this.corners = [];   // Array of Corner objects
    this.bounds = null;  // { minX, minY, maxX, maxY }

    // Internal: cached region bounds for faster queries
    this._regionBounds = [];
  }

  /**
   * Find the region containing a point (brute-force for Phase 0a)
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @returns {Object|null} Region object or null if outside all regions
   */
  findRegion(x, y) {
    // Quick bounds check
    if (this.bounds) {
      if (x < this.bounds.minX || x > this.bounds.maxX ||
          y < this.bounds.minY || y > this.bounds.maxY) {
        return null;
      }
    }

    // Brute-force search with AABB pre-check
    for (let i = 0; i < this.regions.length; i++) {
      const region = this.regions[i];
      const rb = this._regionBounds[i];

      // Skip if point is outside region's AABB
      if (rb && (x < rb.minX || x > rb.maxX || y < rb.minY || y > rb.maxY)) {
        continue;
      }

      if (pointInPolygon(x, y, region.vertices)) {
        return region;
      }
    }

    return null;
  }

  /**
   * Find all regions overlapping an axis-aligned bounding box
   * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds
   * @returns {Object[]} Array of Region objects
   */
  queryBounds(bounds) {
    const results = [];

    for (let i = 0; i < this.regions.length; i++) {
      const rb = this._regionBounds[i];
      if (rb && boundsOverlap(rb, bounds)) {
        results.push(this.regions[i]);
      }
    }

    return results;
  }

  /**
   * Get neighboring regions for a given region
   * @param {number} regionId - Region ID
   * @returns {Object[]} Array of neighbor Region objects
   */
  getNeighbors(regionId) {
    const region = this.regions[regionId];
    if (!region) return [];

    return region.neighbors
      .filter(id => id >= 0 && id < this.regions.length)
      .map(id => this.regions[id]);
  }

  /**
   * Get a region by ID
   * @param {number} id - Region ID
   * @returns {Object|undefined}
   */
  getRegion(id) {
    return this.regions[id];
  }

  /**
   * Get an edge by ID
   * @param {number} id - Edge ID
   * @returns {Object|undefined}
   */
  getEdge(id) {
    return this.edges[id];
  }

  /**
   * Get a corner by ID
   * @param {number} id - Corner ID
   * @returns {Object|undefined}
   */
  getCorner(id) {
    return this.corners[id];
  }

  /**
   * Get all land regions
   * @returns {Object[]}
   */
  getLandRegions() {
    return this.regions.filter(r => !r.isOcean);
  }

  /**
   * Get all ocean regions
   * @returns {Object[]}
   */
  getOceanRegions() {
    return this.regions.filter(r => r.isOcean);
  }

  /**
   * Get all lake regions
   * @returns {Object[]}
   */
  getLakeRegions() {
    return this.regions.filter(r => r.isLake);
  }

  /**
   * Get all coastline edges
   * @returns {Object[]}
   */
  getCoastlineEdges() {
    return this.edges.filter(e => e.isCoastline);
  }

  /**
   * Get all river edges
   * @returns {Object[]}
   */
  getRiverEdges() {
    return this.edges.filter(e => e.isRiver);
  }

  /**
   * Get or build the spatial index (lazy initialization)
   * @returns {SpatialIndex}
   */
  getSpatialIndex() {
    if (!this._spatialIndex) {
      this._spatialIndex = new SpatialIndex(this.regions);
    }
    return this._spatialIndex;
  }

  /**
   * Find region using spatial index (fast O(log n) lookup)
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @returns {Object|null} Region object or null if outside all regions
   */
  findRegionFast(x, y) {
    return this.getSpatialIndex().findRegion(x, y);
  }

  /**
   * Build internal caches (call after populating regions)
   */
  buildCaches() {
    // Compute bounds for each region
    this._regionBounds = this.regions.map(region =>
      computeBounds(region.vertices)
    );

    // Compute overall bounds
    if (this.regions.length > 0) {
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      for (const rb of this._regionBounds) {
        if (rb.minX < minX) minX = rb.minX;
        if (rb.maxX > maxX) maxX = rb.maxX;
        if (rb.minY < minY) minY = rb.minY;
        if (rb.maxY > maxY) maxY = rb.maxY;
      }

      this.bounds = { minX, minY, maxX, maxY };
    }
  }

  /**
   * Serialize graph to JSON-compatible object
   * @returns {Object}
   */
  toJSON() {
    return {
      version: '2.0',
      bounds: this.bounds,
      regions: this.regions.map(r => ({
        id: r.id,
        centroid: r.centroid,
        vertices: r.vertices,
        elevation: r.elevation,
        isOcean: r.isOcean,
        isLake: r.isLake || false,
        neighbors: r.neighbors,
        // Phase 1 additions
        moisture: r.moisture,
        biome: r.biome
      })),
      edges: this.edges.map(e => ({
        id: e.id,
        regions: e.regions,
        corners: e.corners,
        isCoastline: e.isCoastline,
        // Phase 1 additions
        isRiver: e.isRiver,
        riverFlow: e.riverFlow
      })),
      corners: this.corners.map(c => ({
        id: c.id,
        position: c.position,
        elevation: c.elevation,
        adjacentRegions: c.adjacentRegions,
        // Phase 1 additions
        downslope: c.downslope,
        water: c.water
      }))
    };
  }

  /**
   * Deserialize graph from JSON object
   * @param {Object} data - Serialized graph data
   * @returns {IslandGraph}
   */
  static fromJSON(data) {
    const graph = new IslandGraph();

    graph.bounds = data.bounds;
    graph.regions = data.regions.map(r => ({ ...r }));
    graph.edges = data.edges.map(e => ({ ...e }));
    graph.corners = data.corners.map(c => ({ ...c }));

    // Handle v1.0 format - add default values for new fields
    if (data.version === '1.0' || !data.version) {
      for (const region of graph.regions) {
        if (region.moisture === undefined) region.moisture = 0;
        if (region.biome === undefined) region.biome = null;
        if (region.isLake === undefined) region.isLake = false;
      }
      for (const edge of graph.edges) {
        if (edge.isRiver === undefined) edge.isRiver = false;
        if (edge.riverFlow === undefined) edge.riverFlow = 0;
      }
      for (const corner of graph.corners) {
        if (corner.downslope === undefined) corner.downslope = -1;
        if (corner.water === undefined) corner.water = 0;
      }
    }

    graph.buildCaches();

    return graph;
  }
}
