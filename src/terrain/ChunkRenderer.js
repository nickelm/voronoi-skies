/**
 * Builds Three.js meshes for a single terrain chunk
 * Uses MeshLambertMaterial with vertex normals for GPU-accelerated lighting
 */
import * as THREE from 'three';

// Boundary rendering modes
export const BoundaryMode = {
  NONE: 'none',           // No cell boundaries (cleanest look)
  DARKER_SHADE: 'darker', // Edges use darker shade of cell fill
  BIOME_CHANGE: 'biome'   // Edges only where biome changes
};

export class ChunkRenderer {
  constructor() {
    // Shared materials for all chunks - using Lambert for proper lighting
    this.cellMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true  // Use face normals for flat-shaded look
    });

    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x1a1a1a
    });
  }

  /**
   * Build meshes for a chunk and add them to the chunk's group
   * Uses Delaunay triangles if available, otherwise falls back to Voronoi cells
   * @param {Chunk} chunk - The chunk to build meshes for
   * @param {string} boundaryMode - Boundary rendering mode (default 'none')
   */
  buildChunkMeshes(chunk, boundaryMode = BoundaryMode.NONE) {
    // Prefer Delaunay triangles if available
    if (chunk.triangles && chunk.triangles.length > 0) {
      const cellMesh = this.buildTriangleMesh(chunk.triangles);
      cellMesh.position.z = -10; // Behind aircraft
      chunk.cellMesh = cellMesh;
      chunk.group.add(cellMesh);

      // Build edge geometry only if boundary mode requires it
      if (boundaryMode !== BoundaryMode.NONE) {
        const edgeMesh = this.buildTriangleEdgeMesh(chunk.triangles);
        edgeMesh.position.z = -9; // Slightly in front of terrain fills
        chunk.edgeMesh = edgeMesh;
        chunk.group.add(edgeMesh);
      }

      // Build water plane at sea level
      const waterMesh = this.buildWaterMesh(chunk.bounds);
      chunk.waterMesh = waterMesh;
      chunk.group.add(waterMesh);

      chunk.isGenerated = true;
      return;
    }

    // Fallback to Voronoi cells
    const cells = chunk.cells;
    if (!cells || cells.length === 0) return;

    // Build cell geometry
    const cellMesh = this.buildCellMesh(cells);
    cellMesh.position.z = -10; // Behind aircraft
    chunk.cellMesh = cellMesh;
    chunk.group.add(cellMesh);

    // Build edge geometry only if boundary mode requires it
    if (boundaryMode !== BoundaryMode.NONE) {
      const edgeMesh = this.buildEdgeMesh(cells, boundaryMode);
      edgeMesh.position.z = -9; // Slightly in front of terrain fills
      chunk.edgeMesh = edgeMesh;
      chunk.group.add(edgeMesh);
    }

    // Build water plane at sea level
    const waterMesh = this.buildWaterMesh(chunk.bounds);
    chunk.waterMesh = waterMesh;
    chunk.group.add(waterMesh);

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
   * @param {string} boundaryMode - Boundary rendering mode
   * @returns {THREE.LineSegments}
   */
  buildEdgeMesh(cells, boundaryMode = BoundaryMode.DARKER_SHADE) {
    if (boundaryMode === BoundaryMode.DARKER_SHADE) {
      return this.buildEdgeMesh_DarkerShade(cells);
    }
    // Default fallback (also used for BIOME_CHANGE as simplified version)
    return this.buildEdgeMesh_DarkerShade(cells);
  }

  /**
   * Build edge mesh with darker shade of each cell's color
   * @param {Array} cells - Array of cell objects
   * @returns {THREE.LineSegments}
   */
  buildEdgeMesh_DarkerShade(cells) {
    const positions = [];
    const colors = [];

    for (const cell of cells) {
      const polygon = cell.polygon;
      if (!polygon || polygon.length < 3) continue;

      // Compute darker shade of cell color (multiply by 0.7)
      const baseColor = new THREE.Color(cell.color);
      const darkColor = baseColor.clone().multiplyScalar(0.7);

      const numPerimeter = polygon.length - 1;
      for (let i = 0; i < numPerimeter; i++) {
        const next = (i + 1) % numPerimeter;
        positions.push(
          polygon[i][0], polygon[i][1], 0,
          polygon[next][0], polygon[next][1], 0
        );
        // Add colors for both vertices of each line segment
        colors.push(
          darkColor.r, darkColor.g, darkColor.b,
          darkColor.r, darkColor.g, darkColor.b
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color',
      new THREE.Float32BufferAttribute(colors, 3));

    // Use vertex colors for per-edge coloring
    const material = new THREE.LineBasicMaterial({
      vertexColors: true
    });

    return new THREE.LineSegments(geometry, material);
  }

  /**
   * Build mesh from Delaunay triangles with 3D elevation and vertex normals
   * Uses smooth Gouraud shading via per-vertex normals
   * @param {Array} triangles - Array of triangle data objects
   * @returns {THREE.Mesh}
   */
  buildTriangleMesh(triangles) {
    const positions = [];
    const normals = [];
    const colors = [];

    for (const tri of triangles) {
      // Use baseColor (without hillshade baked in) for proper GPU lighting
      const baseColor = new THREE.Color(tri.baseColor !== undefined ? tri.baseColor : tri.color);

      // Add three vertices per triangle with per-vertex normals for smooth shading
      for (let i = 0; i < 3; i++) {
        const v = tri.vertices[i];
        // Use per-vertex normals if available, fall back to face normal
        const vn = tri.vertexNormals ? tri.vertexNormals[i] : tri.faceNormal;
        // Apply per-vertex ambient occlusion (valleys darker, ridges brighter)
        const ao = tri.vertexAO ? tri.vertexAO[i] : 1.0;
        const color = baseColor.clone().multiplyScalar(ao);

        positions.push(v.x, v.y, v.z);
        normals.push(vn.x, vn.y, vn.z);
        colors.push(color.r, color.g, color.b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Use Lambert material with smooth shading (per-vertex normals)
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: false  // Smooth shading with interpolated vertex normals
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * Build chunk meshes from pre-computed typed arrays (from worker)
   * @param {Chunk} chunk - Target chunk to populate
   * @param {Float32Array} positions - Vertex positions (3 floats per vertex)
   * @param {Float32Array} normals - Vertex normals (3 floats per vertex)
   * @param {Float32Array} colors - Vertex colors (3 floats per vertex, RGB with AO baked in)
   * @param {number[]} bounds - [minX, minY, maxX, maxY] chunk bounds
   */
  buildFromBuffers(chunk, positions, normals, colors, bounds) {
    const geometry = new THREE.BufferGeometry();

    // Set attributes directly from typed arrays
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Use Lambert material for proper GPU lighting with smooth shading
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: false  // Smooth shading with interpolated vertex normals
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -10; // Behind aircraft

    chunk.cellMesh = mesh;
    chunk.group.add(mesh);

    // Build water plane at sea level
    const waterMesh = this.buildWaterMesh(bounds);
    chunk.waterMesh = waterMesh;
    chunk.group.add(waterMesh);

    chunk.isGenerated = true;
  }

  /**
   * Build a transparent water plane mesh for a chunk
   * @param {number[]} bounds - [minX, minY, maxX, maxY] chunk bounds
   * @returns {THREE.Mesh}
   */
  buildWaterMesh(bounds) {
    const [minX, minY, maxX, maxY] = bounds;
    const width = maxX - minX;
    const height = maxY - minY;

    // Single plane at sea level (z=0)
    const geometry = new THREE.PlaneGeometry(width, height, 1, 1);

    const material = new THREE.MeshStandardMaterial({
      color: 0x1a5a7a,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.1,   // Lower roughness for sharper specular reflections
      metalness: 0.3    // Higher metalness for sun reflection on water
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Position at center of chunk, z=0 (sea level)
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, 0);

    return mesh;
  }

  /**
   * Build edge lines for Delaunay triangle boundaries
   * @param {Array} triangles - Array of triangle data objects
   * @returns {THREE.LineSegments}
   */
  buildTriangleEdgeMesh(triangles) {
    const positions = [];
    const colors = [];

    for (const tri of triangles) {
      const darkColor = new THREE.Color(tri.color).multiplyScalar(0.7);
      const verts = tri.vertices;

      // Three edges per triangle
      for (let i = 0; i < 3; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % 3];
        positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        colors.push(darkColor.r, darkColor.g, darkColor.b,
                    darkColor.r, darkColor.g, darkColor.b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
  }
}
