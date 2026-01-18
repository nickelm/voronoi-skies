/**
 * Represents a single terrain chunk with its Voronoi cells and meshes
 */
import * as THREE from 'three';

export class Chunk {
  /**
   * @param {number} chunkX - Chunk X coordinate (integer)
   * @param {number} chunkY - Chunk Y coordinate (integer)
   * @param {number} chunkSize - Size of chunk in world units
   */
  constructor(chunkX, chunkY, chunkSize) {
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.chunkSize = chunkSize;

    // World bounds for this chunk [minX, minY, maxX, maxY]
    this.bounds = [
      chunkX * chunkSize,
      chunkY * chunkSize,
      (chunkX + 1) * chunkSize,
      (chunkY + 1) * chunkSize
    ];

    // THREE.Group containing cell mesh and edge mesh
    this.group = new THREE.Group();

    // Cell data (for potential future queries)
    this.cells = [];

    // Delaunay triangle data
    this.triangles = [];

    // Mesh references for disposal
    this.cellMesh = null;
    this.edgeMesh = null;

    // Generation state
    this.isGenerated = false;
  }

  /**
   * Get the unique key for this chunk
   * @returns {string} - Key in format "chunkX,chunkY"
   */
  getKey() {
    return `${this.chunkX},${this.chunkY}`;
  }

  /**
   * Dispose of all GPU resources and clear references
   */
  dispose() {
    if (this.cellMesh) {
      this.cellMesh.geometry.dispose();
      this.cellMesh.material.dispose();
      this.cellMesh = null;
    }

    if (this.edgeMesh) {
      this.edgeMesh.geometry.dispose();
      this.edgeMesh.material.dispose();
      this.edgeMesh = null;
    }

    if (this.group) {
      this.group.clear();
      this.group = null;
    }

    this.cells = [];
    this.triangles = [];
    this.isGenerated = false;
  }
}
