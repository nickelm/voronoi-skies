/**
 * Point distribution with Lloyd relaxation for island generation
 */

import { Delaunay } from 'd3-delaunay';
import { createSeededRandom } from '../../utils/seededRandom.js';

/**
 * Generate points within circular bounds with Lloyd relaxation
 * @param {Object} config
 * @param {number} config.seed - Random seed
 * @param {number} config.count - Number of interior points
 * @param {number} config.radius - Island radius in world units
 * @param {number} [config.lloydIterations=2] - Relaxation passes
 * @param {number[]} [config.center=[0,0]] - [x, y] center point
 * @returns {number[][]} Array of [x, y] points
 */
export function generatePoints(config) {
  const {
    seed,
    count,
    radius,
    lloydIterations = 2,
    center = [0, 0]
  } = config;

  const random = createSeededRandom(seed);

  // Generate random points within circular bounds
  const points = [];
  while (points.length < count) {
    // Generate in square, reject if outside circle
    const x = (random() * 2 - 1) * radius + center[0];
    const y = (random() * 2 - 1) * radius + center[1];

    const dx = x - center[0];
    const dy = y - center[1];
    if (dx * dx + dy * dy <= radius * radius) {
      points.push([x, y]);
    }
  }

  // Apply Lloyd relaxation
  let relaxedPoints = points;
  for (let i = 0; i < lloydIterations; i++) {
    relaxedPoints = lloydRelax(relaxedPoints, radius, center);
  }

  return relaxedPoints;
}

/**
 * Perform one Lloyd relaxation iteration
 * Moves each point to the centroid of its Voronoi cell
 * @param {number[][]} points - Current point positions
 * @param {number} radius - Clamp boundary to this radius
 * @param {number[]} center - Center point [x, y]
 * @returns {number[][]} Relaxed points
 */
export function lloydRelax(points, radius, center) {
  if (points.length === 0) return [];

  // Build Voronoi diagram with extended bounds
  const margin = radius * 0.2;
  const bounds = [
    center[0] - radius - margin,
    center[1] - radius - margin,
    center[0] + radius + margin,
    center[1] + radius + margin
  ];

  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi(bounds);

  const relaxed = [];

  for (let i = 0; i < points.length; i++) {
    const polygon = voronoi.cellPolygon(i);

    if (!polygon || polygon.length < 3) {
      // Keep original point if cell is degenerate
      relaxed.push([...points[i]]);
      continue;
    }

    // Compute centroid of polygon
    const centroid = computeCentroid(polygon);

    // Clamp to circular boundary
    const dx = centroid[0] - center[0];
    const dy = centroid[1] - center[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > radius) {
      // Project onto circle boundary
      const scale = radius / dist;
      centroid[0] = center[0] + dx * scale;
      centroid[1] = center[1] + dy * scale;
    }

    relaxed.push(centroid);
  }

  return relaxed;
}

/**
 * Compute centroid of a polygon
 * @param {number[][]} polygon - Array of [x, y] vertices (closed, last = first)
 * @returns {number[]} [x, y] centroid
 */
function computeCentroid(polygon) {
  let cx = 0;
  let cy = 0;
  let area = 0;

  // Shoelace formula for centroid
  for (let i = 0; i < polygon.length - 1; i++) {
    const x0 = polygon[i][0];
    const y0 = polygon[i][1];
    const x1 = polygon[i + 1][0];
    const y1 = polygon[i + 1][1];

    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  area *= 0.5;

  if (Math.abs(area) < 1e-10) {
    // Degenerate polygon, return average of vertices
    let sumX = 0, sumY = 0;
    for (let i = 0; i < polygon.length - 1; i++) {
      sumX += polygon[i][0];
      sumY += polygon[i][1];
    }
    return [sumX / (polygon.length - 1), sumY / (polygon.length - 1)];
  }

  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

/**
 * Generate boundary points around the perimeter
 * These will be forced to ocean elevation
 * @param {number} count - Number of boundary points
 * @param {number} radius - Circle radius
 * @param {number[]} center - Center point [x, y]
 * @returns {number[][]} Array of [x, y] boundary points
 */
export function generateBoundaryPoints(count, radius, center) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    points.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius
    ]);
  }
  return points;
}
