/**
 * Builds Three.js meshes for a single terrain chunk
 */
import * as THREE from 'three';

export class ChunkRenderer {
  constructor() {
    // Shared materials for all chunks (memory optimization)
    this.cellMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });

    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x1a1a1a
    });
  }

  /**
   * Build meshes for a chunk and add them to the chunk's group
   * @param {Chunk} chunk - The chunk to build meshes for
   */
  buildChunkMeshes(chunk) {
    const cells = chunk.cells;
    if (!cells || cells.length === 0) return;

    // Build cell geometry
    const cellMesh = this.buildCellMesh(cells);
    cellMesh.position.z = -10; // Behind aircraft
    chunk.cellMesh = cellMesh;
    chunk.group.add(cellMesh);

    // Build edge geometry
    const edgeMesh = this.buildEdgeMesh(cells);
    edgeMesh.position.z = -9; // Slightly in front of terrain fills
    chunk.edgeMesh = edgeMesh;
    chunk.group.add(edgeMesh);

    chunk.isGenerated = true;
  }

  /**
   * Build the filled cell mesh using fan triangulation
   * @param {Array} cells - Array of cell objects
   * @returns {THREE.Mesh}
   */
  buildCellMesh(cells) {
    const positions = [];
    const colors = [];
    const indices = [];

    let vertexOffset = 0;

    for (const cell of cells) {
      const polygon = cell.polygon;
      if (!polygon || polygon.length < 3) continue;

      const color = new THREE.Color(cell.color);

      // Fan triangulation from centroid
      const cx = cell.centroid[0];
      const cy = cell.centroid[1];

      // Add centroid vertex
      positions.push(cx, cy, 0);
      colors.push(color.r, color.g, color.b);
      const centroidIndex = vertexOffset;
      vertexOffset++;

      // Add perimeter vertices (polygon is closed, last = first)
      const perimeterStart = vertexOffset;
      const numPerimeter = polygon.length - 1;
      for (let i = 0; i < numPerimeter; i++) {
        positions.push(polygon[i][0], polygon[i][1], 0);
        colors.push(color.r, color.g, color.b);
        vertexOffset++;
      }

      // Create triangles (fan from centroid)
      for (let i = 0; i < numPerimeter; i++) {
        const next = (i + 1) % numPerimeter;
        indices.push(
          centroidIndex,
          perimeterStart + i,
          perimeterStart + next
        );
      }
    }

    // Build BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color',
      new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    // Use shared material but clone it so disposal works per-chunk
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Build edge lines for cell boundaries
   * @param {Array} cells - Array of cell objects
   * @returns {THREE.LineSegments}
   */
  buildEdgeMesh(cells) {
    const positions = [];

    for (const cell of cells) {
      const polygon = cell.polygon;
      if (!polygon || polygon.length < 3) continue;

      const numPerimeter = polygon.length - 1;
      for (let i = 0; i < numPerimeter; i++) {
        const next = (i + 1) % numPerimeter;
        positions.push(
          polygon[i][0], polygon[i][1], 0,
          polygon[next][0], polygon[next][1], 0
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3));

    // Use a new material per chunk for proper disposal
    const material = new THREE.LineBasicMaterial({
      color: 0x1a1a1a
    });

    return new THREE.LineSegments(geometry, material);
  }
}
