/**
 * Voronoi tessellation utilities using d3-delaunay
 */

import { Delaunay } from 'd3-delaunay';

let delaunay = null;
let voronoi = null;

export function createVoronoi(points, bounds = [0, 0, 800, 600]) {
  if (points.length === 0) {
    delaunay = null;
    voronoi = null;
    return null;
  }

  // points should be array of [x, y] pairs
  delaunay = Delaunay.from(points);
  voronoi = delaunay.voronoi(bounds);
  return voronoi;
}

export function getCellPolygon(index) {
  if (!voronoi || index < 0) {
    return null;
  }
  return voronoi.cellPolygon(index);
}

export function findCell(x, y) {
  if (!delaunay) {
    return -1;
  }
  return delaunay.find(x, y);
}

export function getVoronoi() {
  return voronoi;
}

export function getDelaunay() {
  return delaunay;
}
