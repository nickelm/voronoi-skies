/**
 * Renders terrain cells using Three.js
 */
import * as THREE from 'three';

export class TerrainRenderer {
  constructor() {
    // Pivot group positioned at aircraft's screen location - handles rotation
    this.pivotGroup = new THREE.Group();
    this.pivotGroup.position.set(0, -180, 0);

    // Terrain group is child of pivot - handles translation
    this.terrainGroup = new THREE.Group();
    this.pivotGroup.add(this.terrainGroup);

    this.cellMesh = null;
    this.edgeMesh = null;

    // Base screen position for pivot (matches aircraft)
    this.baseScreenY = -180;
  }

  /**
   * Build terrain meshes from cell data
   * @param {Array} cells - Array of cell objects from TerrainGenerator
   */
  buildMeshes(cells) {
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

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });

    this.cellMesh = new THREE.Mesh(geometry, material);
    this.cellMesh.position.z = -10; // Behind aircraft
    this.terrainGroup.add(this.cellMesh);
  }

  /**
   * Build edge lines for cell boundaries
   * @param {Array} cells - Array of cell objects from TerrainGenerator
   */
  buildEdges(cells) {
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

    const material = new THREE.LineBasicMaterial({
      color: 0x1a1a1a
    });

    this.edgeMesh = new THREE.LineSegments(geometry, material);
    this.edgeMesh.position.z = -9; // Slightly in front of terrain fills
    this.terrainGroup.add(this.edgeMesh);
  }

  /**
   * Get the pivot group for adding to scene
   * @returns {THREE.Group}
   */
  getGroup() {
    return this.pivotGroup;
  }

  /**
   * Get the terrain group for adding chunk meshes
   * @returns {THREE.Group}
   */
  getTerrainGroup() {
    return this.terrainGroup;
  }

  /**
   * Update terrain group transform to match player state
   * With perspective camera, terrain Z position controls apparent size
   * @param {number} playerX - Player world X
   * @param {number} playerY - Player world Y
   * @param {number} heading - Player heading in radians (0 = up/north)
   * @param {number} terrainZ - Z position for terrain (from altitude calculation)
   * @param {number} aircraftScreenY - Aircraft's Y position in 3D space
   * @param {number} aircraftZ - Aircraft's Z position
   * @param {number} cameraZ - Camera's Z position
   */
  updateTransform(playerX, playerY, heading, terrainZ = 0, aircraftScreenY = -35, aircraftZ = 500, cameraZ = 600) {
    // With perspective, we need to scale the pivot Y so terrain appears to rotate
    // around the aircraft's screen position. The formula accounts for perspective:
    // pivotY = aircraftY * (cameraZ - terrainZ) / (cameraZ - aircraftZ)
    const perspectiveScale = (cameraZ - terrainZ) / (cameraZ - aircraftZ);
    const pivotY = aircraftScreenY * perspectiveScale;

    // Update pivot position
    this.pivotGroup.position.y = pivotY;
    this.pivotGroup.position.z = terrainZ;

    // Rotate pivot around aircraft's screen position
    // Heading convention: 0 = north (+Y), increases clockwise
    // Three.js rotation.z: positive = counterclockwise
    // To make aircraft's heading direction point up on screen, rotate terrain by +heading
    this.pivotGroup.rotation.z = heading;

    // Translate terrain within pivot so player world position is at pivot origin
    this.terrainGroup.position.set(-playerX, -playerY, 0);
  }
}
