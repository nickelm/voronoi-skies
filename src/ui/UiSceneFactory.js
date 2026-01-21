/**
 * UiSceneFactory - Creates Three.js scenes for UI cells
 *
 * Each UI cell needs its own isolated scene with content positioned
 * at the origin (0, 0). The orthographic camera frustum adjustment
 * will map the origin to the cell's seed position on screen.
 *
 * IMPORTANT: Do NOT use scene.background - it causes issues with stencil buffer.
 * Instead, use explicit background quads.
 */

import * as THREE from 'three';

export class UiSceneFactory {
  // Default size for UI cell content (pixels)
  static UI_CELL_SIZE = 120;

  /**
   * Create a simple test scene for UI cell verification
   *
   * The test scene contains:
   * - A colored background quad
   * - A yellow circle at the center (origin marker)
   * - Crosshair lines to show alignment
   *
   * @param {number} [color=0x2a4a6a] - Hex color for the background
   * @returns {{scene: THREE.Scene, marker: THREE.Mesh}}
   */
  createTestScene(color = 0x2a4a6a) {
    const scene = new THREE.Scene();
    const size = UiSceneFactory.UI_CELL_SIZE;

    // Background quad (NOT scene.background - causes stencil issues)
    const bgQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 3, size * 3),
      new THREE.MeshBasicMaterial({ color })
    );
    bgQuad.position.z = -5;
    scene.add(bgQuad);

    // Border quad to show cell boundary
    const borderSize = size * 0.9;
    const borderGeom = new THREE.BufferGeometry();
    const borderVerts = new Float32Array([
      -borderSize, -borderSize, 0,
      borderSize, -borderSize, 0,
      borderSize, borderSize, 0,
      -borderSize, borderSize, 0,
      -borderSize, -borderSize, 0
    ]);
    borderGeom.setAttribute('position', new THREE.BufferAttribute(borderVerts, 3));
    const border = new THREE.Line(
      borderGeom,
      new THREE.LineBasicMaterial({ color: 0x446688 })
    );
    border.position.z = -4;
    scene.add(border);

    // Crosshair lines to show origin alignment
    // LineSegments expects pairs of vertices: [start1, end1, start2, end2, ...]
    const crosshairSize = size * 0.5;
    const crosshairGeom = new THREE.BufferGeometry();
    const crosshairVerts = new Float32Array([
      // Horizontal line (left to right)
      -crosshairSize, 0, 0,
      crosshairSize, 0, 0,
      // Vertical line (bottom to top)
      0, -crosshairSize, 0,
      0, crosshairSize, 0
    ]);
    crosshairGeom.setAttribute('position', new THREE.BufferAttribute(crosshairVerts, 3));
    const crosshair = new THREE.LineSegments(
      crosshairGeom,
      new THREE.LineBasicMaterial({ color: 0x88aacc })
    );
    crosshair.position.z = -3;
    scene.add(crosshair);

    // Center marker (yellow circle) to verify positioning
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(10, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    marker.position.z = 0;
    scene.add(marker);

    // Label text would go here in a real implementation
    // For now, just the visual markers

    return { scene, marker };
  }

  /**
   * Create a placeholder scene for future instrument types
   * Returns the same as createTestScene but with different color
   *
   * @param {string} instrumentType - Type of instrument
   * @returns {{scene: THREE.Scene, marker: THREE.Mesh}}
   */
  createInstrumentScene(instrumentType) {
    // Color coding for different instrument types
    const colors = {
      altimeter: 0x1a3a2a,   // Dark green
      compass: 0x3a2a1a,     // Dark brown
      airspeed: 0x2a1a3a,    // Dark purple
      default: 0x2a4a6a      // Default blue
    };

    const color = colors[instrumentType] || colors.default;
    return this.createTestScene(color);
  }
}
