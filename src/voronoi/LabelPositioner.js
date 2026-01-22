/**
 * LabelPositioner - Utility functions for computing label positions
 *
 * Used to find the best position for distance/magnification labels
 * on Voronoi cell borders.
 */

/**
 * Check if a line segment lies on the screen edge
 * @param {number} x1 - Start X coordinate
 * @param {number} y1 - Start Y coordinate
 * @param {number} x2 - End X coordinate
 * @param {number} y2 - End Y coordinate
 * @param {number} screenW - Screen width
 * @param {number} screenH - Screen height
 * @param {number} [threshold=2] - Distance threshold for edge detection
 * @returns {boolean} True if segment lies on a screen edge
 */
export function isOnScreenEdge(x1, y1, x2, y2, screenW, screenH, threshold = 2) {
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
 * Find intersection point between a ray and a line segment
 * @param {number} rayOriginX - Ray origin X
 * @param {number} rayOriginY - Ray origin Y
 * @param {number} rayDirX - Ray direction X (not normalized)
 * @param {number} rayDirY - Ray direction Y (not normalized)
 * @param {number} segX1 - Segment start X
 * @param {number} segY1 - Segment start Y
 * @param {number} segX2 - Segment end X
 * @param {number} segY2 - Segment end Y
 * @returns {{x: number, y: number, t: number}|null} Intersection point and ray parameter, or null
 */
function raySegmentIntersection(rayOriginX, rayOriginY, rayDirX, rayDirY, segX1, segY1, segX2, segY2) {
  const segDirX = segX2 - segX1;
  const segDirY = segY2 - segY1;

  const denom = rayDirX * segDirY - rayDirY * segDirX;

  // Parallel or coincident
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((segX1 - rayOriginX) * segDirY - (segY1 - rayOriginY) * segDirX) / denom;
  const u = ((segX1 - rayOriginX) * rayDirY - (segY1 - rayOriginY) * rayDirX) / denom;

  // t must be positive (ray goes forward), u must be in [0, 1] (on segment)
  if (t > 0 && u >= 0 && u <= 1) {
    return {
      x: rayOriginX + t * rayDirX,
      y: rayOriginY + t * rayDirY,
      t: t
    };
  }

  return null;
}

/**
 * Find where the radial line from screen center to seed intersects the cell border
 *
 * This gives a unique, consistent position for labels that sits on the
 * "path" from the main viewport to the target cell.
 *
 * @param {Array<[number, number]>} polygon - Array of [x, y] vertices
 * @param {number} seedX - Cell seed X position
 * @param {number} seedY - Cell seed Y position
 * @param {number} screenW - Screen width
 * @param {number} screenH - Screen height
 * @returns {{x: number, y: number}|null} Intersection point, or null
 */
export function findRadialIntersection(polygon, seedX, seedY, screenW, screenH) {
  if (!polygon || polygon.length < 3) return null;

  const centerX = screenW / 2;
  const centerY = screenH / 2;

  // Ray direction from center toward seed
  const rayDirX = seedX - centerX;
  const rayDirY = seedY - centerY;

  // If seed is at center, can't compute direction
  if (Math.abs(rayDirX) < 1e-10 && Math.abs(rayDirY) < 1e-10) return null;

  let closestIntersection = null;
  let closestT = Infinity;

  // Check intersection with each polygon segment
  for (let i = 0; i < polygon.length - 1; i++) {
    const x1 = polygon[i][0];
    const y1 = polygon[i][1];
    const x2 = polygon[i + 1][0];
    const y2 = polygon[i + 1][1];

    // Skip segments on screen edges - we want the internal border
    if (isOnScreenEdge(x1, y1, x2, y2, screenW, screenH)) continue;

    const intersection = raySegmentIntersection(
      centerX, centerY,
      rayDirX, rayDirY,
      x1, y1, x2, y2
    );

    if (intersection && intersection.t < closestT) {
      closestT = intersection.t;
      closestIntersection = intersection;
    }
  }

  return closestIntersection ? { x: closestIntersection.x, y: closestIntersection.y } : null;
}

/**
 * Find the longest non-screen-edge segment in a polygon (fallback method)
 *
 * @param {Array<[number, number]>} polygon - Array of [x, y] vertices
 * @param {number} screenW - Screen width
 * @param {number} screenH - Screen height
 * @returns {{x: number, y: number, length: number}|null} Midpoint and length of longest segment, or null
 */
export function findLongestNonEdgeSegment(polygon, screenW, screenH) {
  if (!polygon || polygon.length < 3) return null;

  let longest = { x: screenW / 2, y: screenH / 2, length: 0 };

  for (let i = 0; i < polygon.length - 1; i++) {
    const x1 = polygon[i][0];
    const y1 = polygon[i][1];
    const x2 = polygon[i + 1][0];
    const y2 = polygon[i + 1][1];

    // Skip screen-edge segments
    if (isOnScreenEdge(x1, y1, x2, y2, screenW, screenH)) continue;

    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length > longest.length) {
      longest = {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
        length
      };
    }
  }

  return longest.length > 0 ? longest : null;
}
