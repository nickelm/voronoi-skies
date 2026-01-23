/**
 * SpatialIndex - R-tree spatial index for fast region queries
 *
 * Wraps rbush library for AABB-based spatial indexing with
 * point-in-polygon refinement for accurate region lookup.
 */

import RBush from 'rbush';

/**
 * Ray casting point-in-polygon test
 * @param {number} x - Test point X
 * @param {number} y - Test point Y
 * @param {number[][]} vertices - Polygon vertices (CCW, closed: last = first)
 * @returns {boolean} True if point is inside polygon
 */
function pointInPolygon(x, y, vertices) {
  let inside = false;
  const n = vertices.length - 1;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i][0], yi = vertices[i][1];
    const xj = vertices[j][0], yj = vertices[j][1];

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

export class SpatialIndex {
  /**
   * Create a spatial index for fast region queries
   * @param {Object[]} regions - Array of regions with vertices and id
   */
  constructor(regions) {
    this.regions = regions;
    this.tree = new RBush();
    this._build();
  }

  /**
   * Build the R-tree from regions
   * @private
   */
  _build() {
    const items = [];

    for (const region of this.regions) {
      if (!region.vertices || region.vertices.length < 3) continue;

      const bounds = computeBounds(region.vertices);
      items.push({
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        region: region
      });
    }

    // Bulk load for optimal tree structure
    this.tree.load(items);
  }

  /**
   * Find the region containing a point
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @returns {Object|null} Region object or null if outside all regions
   */
  findRegion(x, y) {
    // Query R-tree for candidate regions (AABB contains point)
    const candidates = this.tree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y
    });

    // Refine with point-in-polygon test
    for (const item of candidates) {
      if (pointInPolygon(x, y, item.region.vertices)) {
        return item.region;
      }
    }

    return null;
  }

  /**
   * Query all regions overlapping a bounding box
   * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds - AABB
   * @returns {Object[]} Array of regions overlapping bounds
   */
  queryBounds(bounds) {
    const items = this.tree.search(bounds);
    return items.map(item => item.region);
  }

  /**
   * Find nearest river edge to a point
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @param {Object[]} riverEdges - Array of river edge objects
   * @param {Object[]} corners - Array of corner objects (for position lookup)
   * @param {number} maxDistance - Maximum search distance
   * @returns {{edge: Object, distance: number}|null}
   */
  findNearestRiver(x, y, riverEdges, corners, maxDistance) {
    let nearest = null;
    let minDist = maxDistance;

    for (const edge of riverEdges) {
      const c0 = corners[edge.corners[0]];
      const c1 = corners[edge.corners[1]];
      if (!c0 || !c1) continue;

      const dist = this._distanceToSegment(
        x, y,
        c0.position[0], c0.position[1],
        c1.position[0], c1.position[1]
      );

      if (dist < minDist) {
        minDist = dist;
        nearest = { edge, distance: dist };
      }
    }

    return nearest;
  }

  /**
   * Compute distance from point to line segment
   * @private
   */
  _distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      // Degenerate segment (point)
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    // Project point onto line, clamped to segment
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
  }
}
