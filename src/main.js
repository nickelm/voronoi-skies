/**
 * Voronoi Skies - Entry point and game loop
 */

import * as THREE from 'three';
import * as input from './input.js';
import * as renderer from './renderer.js';
import { Aircraft } from './entities/aircraft.js';
import { TerrainRenderer } from './terrain/TerrainRenderer.js';
import { ChunkManager } from './terrain/ChunkManager.js';
import { LightingConfig, applyTimePreset } from './terrain/lighting.js';
import { VoronoiCellManager } from './voronoi/VoronoiCellManager.js';
import { AirbaseCellController } from './voronoi/AirbaseCellController.js';
import { UiCellManager } from './ui/UiCellManager.js';
import { initNoise } from './terrain/noise.js';
import { AirbaseRegistry, AirbaseRenderer } from './airbase/index.js';

// Game state
let player = null;
let terrainRenderer = null;
let chunkManager = null;
let voronoiCellManager = null;
let airbaseCellController = null;
let uiCellManager = null;
let airbaseRegistry = null;
let airbaseRenderer = null;
let lastTime = 0;
let debugElement = null;
let currentCameraZ = 500;  // Main camera Z (changes with altitude)
const TERRAIN_Z = 0;       // Terrain is FIXED at Z=0

// Phase 2 Test Targets - Multiple targets at fixed world positions
const MAX_TARGETS = 5;
const TARGET_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
const TARGET_COLORS = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];
const testTargets = [];  // Array of target objects
let nextTargetId = 0;    // Incrementing ID for deterministic ordering

const SCREEN_INSET = 30;
const VISIBILITY_MARGIN = 50;  // Margin for on-screen detection (matches reference test)

// Three.js lighting
let directionalLight = null;
let ambientLight = null;
let hemisphereLight = null;

// Lighting control state
let lightingControlsEnabled = true;

// Loading UI elements
let loadingOverlay = null;
let loadingBar = null;
let loadingText = null;

function init() {
  // Initialize input handling
  input.init();

  // Initialize touch controls with tap callbacks
  input.initTouch({
    onSingleTap: () => dropTarget(),
    onDoubleTap: () => clearAllTargets(),
  });

  console.log('Voronoi Skies Initialized');

  // Get loading UI elements
  loadingOverlay = document.getElementById('loading-overlay');
  loadingBar = document.getElementById('loading-bar');
  loadingText = document.getElementById('loading-text');

  // Initialize renderer
  const container = document.getElementById('game-container');
  renderer.init(container);

  // Initialize terrain renderer (provides pivot/terrain group hierarchy)
  terrainRenderer = new TerrainRenderer();

  // Add terrain to scene (before player so it renders behind)
  const scene = renderer.getScene();
  scene.add(terrainRenderer.getGroup());

  // Set up Three.js lighting for GPU-accelerated terrain shading
  setupLighting(scene);

  // Initialize noise on main thread for terrain elevation queries (shadow projection)
  // Must be done BEFORE generating airbases since they sample terrain elevation
  const worldSeed = 42;
  initNoise(worldSeed);

  // Initialize airbase registry and generate airbases
  airbaseRegistry = new AirbaseRegistry(worldSeed);
  airbaseRegistry.generateAirbases();

  // Ensure at least one airbase near spawn for testing/gameplay
  airbaseRegistry.ensureStarterAirbase(0, 0);

  // Initialize chunk manager for infinite terrain with progress callback
  chunkManager = new ChunkManager({
    worldSeed: worldSeed,
    chunkSize: 2000,
    loadRadius: 5,         // 11x11 grid = 121 chunks for high altitude view
    gridSpacing: 25,       // ~6400 cells per chunk
    boundaryMode: 'none',  // No visible cell edges (cleanest look)
    terrainGroup: terrainRenderer.getTerrainGroup(),
    onLoadProgress: updateLoadingProgress,
    airbaseRegistry: airbaseRegistry  // Pass registry for terrain flattening
  });

  // Initialize airbase renderer for runway meshes and PAPI lights
  airbaseRenderer = new AirbaseRenderer(airbaseRegistry, terrainRenderer.getTerrainGroup());

  // Create player aircraft at origin
  player = new Aircraft(0, 0);

  // Queue initial chunks for async loading (closest to player first)
  chunkManager.initializeAtPosition(player.x, player.y);

  // Add shadow mesh to terrain group so it transforms with terrain
  // This allows the shadow to be positioned in world coordinates
  terrainRenderer.getTerrainGroup().add(player.getShadowMesh());

  // Add player mesh to scene
  scene.add(player.getMesh());

  // Get debug element for FPS display
  debugElement = document.getElementById('debug');

  // Set up lighting keyboard controls
  initLightingControls();

  // Initialize Voronoi cell manager for split-screen rendering
  const threeRenderer = renderer.getRenderer();
  const mainCamera = renderer.getCamera();
  voronoiCellManager = new VoronoiCellManager(threeRenderer, scene, mainCamera);
  voronoiCellManager.initPlayerCell();

  // Initialize airbase cell controller for dynamic airbase cells
  airbaseCellController = new AirbaseCellController(airbaseRegistry, voronoiCellManager);

  // Initialize UI cell manager for 2D orthographic UI cells
  uiCellManager = new UiCellManager(voronoiCellManager);
  // Register a test UI cell at bottom-right (90% x, 85% y)
  uiCellManager.registerUiCell('test-ui', 0.9, 0.85, 'test');

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

/**
 * Update loading progress bar
 * @param {number} loaded - Number of chunks loaded
 * @param {number} total - Total chunks to load
 */
function updateLoadingProgress(loaded, total) {
  if (loadingBar) {
    const percent = total > 0 ? (loaded / total) * 100 : 0;
    loadingBar.style.width = `${percent}%`;
  }
  if (loadingText) {
    loadingText.textContent = `Generating terrain... ${loaded}/${total}`;
  }

  // Hide overlay when loading is complete
  if (loaded >= total && loadingOverlay) {
    loadingOverlay.classList.add('hidden');
    // Remove from DOM after transition
    setTimeout(() => {
      if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
      }
    }, 500);
  }
}

/**
 * Set up Three.js lighting for GPU-accelerated terrain shading
 * @param {THREE.Scene} scene - The scene to add lights to
 */
function setupLighting(scene) {
  // Ambient light provides base illumination (shadow floor)
  ambientLight = new THREE.AmbientLight(0xffffff, LightingConfig.ambient);
  scene.add(ambientLight);

  // Directional light provides sun-like illumination
  directionalLight = new THREE.DirectionalLight(
    new THREE.Color(LightingConfig.color.r, LightingConfig.color.g, LightingConfig.color.b),
    LightingConfig.intensity
  );

  // Set initial light direction from config
  updateLightDirection();
  scene.add(directionalLight);

  // Hemisphere light: sky/ground gradient ambient
  hemisphereLight = new THREE.HemisphereLight(
    0x87CEEB,  // Sky: soft blue-white
    0x3d3028,  // Ground: dark warm gray
    0.35       // Intensity (supplement, not replacement)
  );
  scene.add(hemisphereLight);

  // Atmosphere haze: distance-based fog blending terrain toward sky color
  // Terrain Z ranges from 100 (ground) to -15000 (max altitude)
  // Camera at Z=600, so distances range from ~500 to ~15600
  // Start fog early, extend far for subtle gradual blend (~30% at horizon)
  scene.fog = new THREE.Fog(
    new THREE.Color(0x87CEEB),  // Sky color (matches hemisphere sky)
    1000,   // Near: fog starts gently at this distance
    50000   // Far: very gradual falloff (subtle haze, not thick fog)
  );
}

/**
 * Update directional light position from azimuth/elevation
 * Light direction = vector FROM light TO origin (opposite of position)
 */
function updateLightDirection() {
  if (!directionalLight) return;

  const azRad = LightingConfig.azimuth * Math.PI / 180;
  const elRad = LightingConfig.elevation * Math.PI / 180;
  const cosEl = Math.cos(elRad);

  // Position light far away in the direction it should shine FROM
  // Azimuth 315° (NW) means light comes from NW, so position light at NW
  const distance = 1000;
  directionalLight.position.set(
    Math.sin(azRad) * cosEl * distance,
    Math.cos(azRad) * cosEl * distance,
    Math.sin(elRad) * distance
  );
}

/**
 * Initialize keyboard controls for lighting adjustments
 * Now updates Three.js lights directly (no chunk regeneration!)
 * L/Shift+L: Rotate light azimuth ±15°
 * K/Shift+K: Adjust elevation ±5°
 * I/Shift+I: Adjust intensity ±0.1
 * U/Shift+U: Adjust ambient ±0.1
 */
function initLightingControls() {
  window.addEventListener('keydown', (e) => {
    if (!lightingControlsEnabled) return;

    let updated = false;

    switch (e.code) {
      case 'KeyL':
        // Rotate azimuth: L = +15° (clockwise), Shift+L = -15° (counter-clockwise)
        LightingConfig.azimuth = ((LightingConfig.azimuth + (e.shiftKey ? -15 : 15)) % 360 + 360) % 360;
        updateLightDirection();
        updated = true;
        break;

      case 'KeyK':
        // Adjust elevation: K = +5°, Shift+K = -5°
        LightingConfig.elevation = Math.max(5, Math.min(90, LightingConfig.elevation + (e.shiftKey ? -5 : 5)));
        updateLightDirection();
        updated = true;
        break;

      case 'KeyI':
        // Adjust intensity: I = +0.1, Shift+I = -0.1
        LightingConfig.intensity = Math.max(0, Math.min(2, LightingConfig.intensity + (e.shiftKey ? -0.1 : 0.1)));
        if (directionalLight) directionalLight.intensity = LightingConfig.intensity;
        updated = true;
        break;

      case 'KeyU':
        // Adjust ambient: U = +0.1, Shift+U = -0.1
        LightingConfig.ambient = Math.max(0, Math.min(1, LightingConfig.ambient + (e.shiftKey ? -0.1 : 0.1)));
        if (ambientLight) ambientLight.intensity = LightingConfig.ambient;
        updated = true;
        break;

      case 'Digit1':
        // Dawn preset
        applyTimePresetWithSky('dawn');
        console.log('Time preset: DAWN');
        updated = true;
        break;

      case 'Digit2':
        // Noon preset
        applyTimePresetWithSky('noon');
        console.log('Time preset: NOON');
        updated = true;
        break;

      case 'Digit3':
        // Night preset
        applyTimePresetWithSky('night');
        console.log('Time preset: NIGHT');
        updated = true;
        break;

      // Phase 2 Test Target Controls
      case 'Digit9':
        if (e.shiftKey) {
          // Shift+9: Clear all targets
          clearAllTargets();
        } else {
          // 9: Drop new target at current position
          dropTarget();
        }
        break;

      // UI Cell Toggle
      case 'Digit0':
        if (uiCellManager) {
          const isCurrentlyEnabled = uiCellManager.isEnabled('test-ui');
          uiCellManager.setEnabled('test-ui', !isCurrentlyEnabled);
        }
        break;
    }

    if (updated) {
      console.log(`Light: AZ=${LightingConfig.azimuth}° EL=${LightingConfig.elevation}° INT=${LightingConfig.intensity.toFixed(2)} AMB=${LightingConfig.ambient.toFixed(2)}`);
    }
  });

  // Mouse wheel handler for cell altitude control
  window.addEventListener('wheel', (e) => {
    if (!voronoiCellManager) return;

    // Find which cell the mouse is over
    const cell = voronoiCellManager.getCellAtPoint(e.clientX, e.clientY);
    if (!cell) return;

    // Only allow altitude adjustment for non-player cells
    if (cell.type === 'player') return;

    // Initialize terrainZ if not set (use current player camera Z)
    if (cell.terrainZ === null) {
      cell.terrainZ = renderer.getCameraZ();
    }

    // Adjust altitude based on scroll direction
    // Scroll up (negative deltaY) = zoom in = decrease camera Z
    // Scroll down (positive deltaY) = zoom out = increase camera Z
    const ZOOM_SPEED = 200;
    const MIN_CAMERA_Z = 500;
    const MAX_CAMERA_Z = 15600;

    const delta = e.deltaY > 0 ? ZOOM_SPEED : -ZOOM_SPEED;
    cell.terrainZ = Math.max(MIN_CAMERA_Z, Math.min(MAX_CAMERA_Z, cell.terrainZ + delta));

    // Prevent page scroll
    e.preventDefault();

    // Find the associated target for logging
    const target = testTargets.find(t => t.cell === cell);
    if (target) {
      console.log(`${target.name} camera Z: ${cell.terrainZ.toFixed(0)}`);
    }
  }, { passive: false });
}

/**
 * Apply a time preset and update sky/lights
 * @param {string} presetName - 'dawn', 'noon', or 'night'
 */
function applyTimePresetWithSky(presetName) {
  const preset = applyTimePreset(presetName);
  if (preset) {
    syncLightsToConfig(preset.sky);
  }
}

/**
 * Sync Three.js lights to current LightingConfig values
 * Called after applying a time preset
 * @param {Object} skyColor - Optional sky color {r, g, b} for background
 */
function syncLightsToConfig(skyColor = null) {
  if (directionalLight) {
    directionalLight.intensity = LightingConfig.intensity;
    directionalLight.color.setRGB(
      LightingConfig.color.r,
      LightingConfig.color.g,
      LightingConfig.color.b
    );
  }
  if (ambientLight) {
    ambientLight.intensity = LightingConfig.ambient;
    // Tint ambient light with the light color
    ambientLight.color.setRGB(
      LightingConfig.color.r,
      LightingConfig.color.g,
      LightingConfig.color.b
    );
  }
  // Update hemisphere light from config
  if (hemisphereLight && LightingConfig.hemisphere) {
    const hemi = LightingConfig.hemisphere;
    hemisphereLight.color.setRGB(hemi.skyColor.r, hemi.skyColor.g, hemi.skyColor.b);
    hemisphereLight.groundColor.setRGB(hemi.groundColor.r, hemi.groundColor.g, hemi.groundColor.b);
    hemisphereLight.intensity = hemi.intensity;
  }
  // Update sky/background color and fog
  const scene = renderer.getScene();
  if (skyColor && scene) {
    scene.background.setRGB(skyColor.r, skyColor.g, skyColor.b);
    // Sync fog color with sky for consistent atmosphere
    if (scene.fog) {
      scene.fog.color.setRGB(skyColor.r, skyColor.g, skyColor.b);
    }
  }
  updateLightDirection();
}

// ============================================
// Phase 2 Test Target Helper Functions
// ============================================

/**
 * Check if a target is visible within the main camera's view of the terrain.
 *
 * Instead of projecting to screen and checking bounds, we calculate the visible
 * terrain rectangle from the camera's frustum and check if the target is inside.
 * This is more accurate because it works in world coordinates.
 *
 * @param {number} worldX - Target world X position
 * @param {number} worldY - Target world Y position
 * @param {number} playerX - Player world X
 * @param {number} playerY - Player world Y
 * @param {number} playerHeading - Player heading in radians
 * @returns {boolean} True if target is visible on screen
 */
function isTargetVisible(worldX, worldY, playerX, playerY, playerHeading) {
  const mainCamera = renderer.getCamera();
  const cameraZ = renderer.getCameraZ();

  // Calculate visible terrain dimensions at Z=0
  // Using camera FOV and distance to terrain
  const fovRad = mainCamera.fov * Math.PI / 180;
  const aspect = mainCamera.aspect;

  // Half-height and half-width of visible terrain at Z=0
  // Camera is at Z=cameraZ looking at Z=0, so distance = cameraZ
  const halfHeight = Math.tan(fovRad / 2) * cameraZ;
  const halfWidth = halfHeight * aspect;

  // Apply margin (as fraction of visible area, not pixels)
  const marginFraction = 0.1;  // 10% margin on each side
  const visibleHalfWidth = halfWidth * (1 - marginFraction);
  const visibleHalfHeight = halfHeight * (1 - marginFraction);

  // Get offset from player to target in world coordinates
  const offsetX = worldX - playerX;
  const offsetY = worldY - playerY;

  // Rotate by player heading to get offset in camera/screen space
  // After rotation: +X is right on screen, +Y is up on screen (toward top)
  const cos = Math.cos(playerHeading);
  const sin = Math.sin(playerHeading);
  const rotatedX = offsetX * cos - offsetY * sin;
  const rotatedY = offsetX * sin + offsetY * cos;

  // Check if rotated position is within visible rectangle
  // Note: pivotY affects where the center of the view is, but for visibility
  // we care about the offset from player position, which is at screen center
  const visible = Math.abs(rotatedX) <= visibleHalfWidth &&
                  Math.abs(rotatedY) <= visibleHalfHeight;

  return visible;
}

/**
 * Project a world position to screen coordinates
 *
 * This game's coordinate system:
 * - World: X = east, Y = north (2D plane)
 * - Screen: Camera at Z=cameraZ looking at origin along -Z
 * - Terrain rotates around Z axis by player heading
 * - The pivotGroup applies: rotation.z = heading, then terrainGroup offset = -playerPos
 *
 * To project a world point to screen:
 * 1. Get offset from player position
 * 2. Rotate by player heading (same as terrain rotation)
 * 3. Project through camera
 *
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @param {number} playerX - Player world X
 * @param {number} playerY - Player world Y
 * @param {number} playerHeading - Player heading in radians
 * @returns {{x: number, y: number}}
 */
function projectToScreen(worldX, worldY, playerX, playerY, playerHeading) {
  const mainCamera = renderer.getCamera();
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Get offset from player to target
  const offsetX = worldX - playerX;
  const offsetY = worldY - playerY;

  // Apply heading rotation (same as pivotGroup.rotation.z)
  const cos = Math.cos(playerHeading);
  const sin = Math.sin(playerHeading);
  const rotatedX = offsetX * cos - offsetY * sin;
  const rotatedY = offsetX * sin + offsetY * cos;

  // Calculate visible terrain dimensions (same as isTargetVisible)
  const cameraZ = renderer.getCameraZ();
  const fovRad = mainCamera.fov * Math.PI / 180;
  const aspect = mainCamera.aspect;
  const halfHeight = Math.tan(fovRad / 2) * cameraZ;
  const halfWidth = halfHeight * aspect;

  // Map from world-space offset to screen coordinates
  // Player is at screen center, rotatedX/rotatedY is offset from player
  // World range [-halfWidth, +halfWidth] maps to screen [0, screenW]
  // World range [-halfHeight, +halfHeight] maps to screen [screenH, 0] (Y inverted)
  const screenX = screenW / 2 + (rotatedX / halfWidth) * (screenW / 2);
  const screenY = screenH / 2 - (rotatedY / halfHeight) * (screenH / 2);

  return { x: screenX, y: screenY };
}

/**
 * Find where a ray from screen center to a point intersects the screen edge
 * @param {number} targetX - Target screen X
 * @param {number} targetY - Target screen Y
 * @param {number} screenW - Screen width
 * @param {number} screenH - Screen height
 * @returns {{x: number, y: number}}
 */
function rayToScreenEdge(targetX, targetY, screenW, screenH) {
  const cx = screenW / 2;
  const cy = screenH / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: 0 };

  let tMin = Infinity;
  let hit = null;

  // Left edge
  if (dx < 0) {
    const t = -cx / dx;
    const y = cy + t * dy;
    if (y >= 0 && y <= screenH && t < tMin) { tMin = t; hit = { x: 0, y }; }
  }
  // Right edge
  if (dx > 0) {
    const t = (screenW - cx) / dx;
    const y = cy + t * dy;
    if (y >= 0 && y <= screenH && t < tMin) { tMin = t; hit = { x: screenW, y }; }
  }
  // Top edge
  if (dy < 0) {
    const t = -cy / dy;
    const x = cx + t * dx;
    if (x >= 0 && x <= screenW && t < tMin) { tMin = t; hit = { x, y: 0 }; }
  }
  // Bottom edge
  if (dy > 0) {
    const t = (screenH - cy) / dy;
    const x = cx + t * dx;
    if (x >= 0 && x <= screenW && t < tMin) { tMin = t; hit = { x, y: screenH }; }
  }

  return hit || { x: cx, y: 0 };
}

/**
 * Update all test targets each frame
 *
 * Each target is at a FIXED world position (set when dropped with key 9).
 * As player moves/turns, targets may go on-screen or off-screen.
 *
 * IMPORTANT: ALL targets get a Voronoi seed to protect their screen space:
 * - On-screen targets: seed at projected screen position, merged with player cell (ref=1)
 * - Off-screen targets: seed at screen edge, exclusive cell with own camera
 */
function updateTestTargets() {
  if (testTargets.length === 0) return;

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // First pass: compute projected positions and seed positions for ALL targets
  const offScreenTargets = [];

  for (const target of testTargets) {
    // Check visibility using world-space frustum intersection
    target.onScreen = isTargetVisible(target.worldX, target.worldY, player.x, player.y, player.heading);

    // Project to screen for seed positioning (same projection for all targets)
    const projected = projectToScreen(target.worldX, target.worldY, player.x, player.y, player.heading);
    target.projectedX = projected.x;
    target.projectedY = projected.y;

    if (target.onScreen) {
      // ON-SCREEN: seed at projected screen position
      target.seedX = projected.x;
      target.seedY = projected.y;
    } else {
      // OFF-SCREEN: seed at screen edge along bearing
      const edge = rayToScreenEdge(projected.x, projected.y, screenW, screenH);
      const dx = edge.x - screenW / 2;
      const dy = edge.y - screenH / 2;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        target.seedX = edge.x - (dx / len) * SCREEN_INSET;
        target.seedY = edge.y - (dy / len) * SCREEN_INSET;
      } else {
        target.seedX = screenW / 2;
        target.seedY = SCREEN_INSET;
      }
      offScreenTargets.push(target);
    }
  }

  // Apply deconfliction to off-screen targets (VoronoiCellManager handles UI seeds)
  if (offScreenTargets.length > 0) {
    voronoiCellManager.deconflictSeeds(offScreenTargets);
  }

  // Second pass: update cells for ALL targets
  for (const target of testTargets) {
    // Ensure cell exists for this target
    if (!target.cell || !voronoiCellManager.getCells().includes(target.cell)) {
      target.cell = voronoiCellManager.createCell('target');
      target.cell.target = target;
      // Set the cell's independent terrain Z from the target's initial value
      target.cell.setTerrainZ(target.initialCameraZ);
    }

    // Update seed position (all targets have seeds)
    target.cell.seed.x = target.seedX;
    target.cell.seed.y = target.seedY;
    target.cell.onScreen = target.onScreen;

    // Update cell's projected position for blending calculations
    target.cell.setProjectedPosition(target.projectedX, target.projectedY);

    if (!target.onScreen) {
      // OFF-SCREEN: update target camera for exclusive rendering
      //
      // The target marker is in the terrainGroup. Get its actual world position
      // after all terrain transforms have been applied.
      const markerWorldPos = new THREE.Vector3();
      target.marker.getWorldPosition(markerWorldPos);

      const mainCamera = renderer.getCamera();
      const cameraZ = renderer.getCameraZ();

      // Get blended camera Z from the cell (handles smoothstep transition)
      const blendedCameraZ = target.cell.getBlendedTerrainZ(cameraZ, VISIBILITY_MARGIN);

      // Position camera directly above the marker's world position
      target.cell.camera.position.set(markerWorldPos.x, markerWorldPos.y, blendedCameraZ);
      target.cell.camera.lookAt(markerWorldPos.x, markerWorldPos.y, TERRAIN_Z);
      target.cell.camera.up.set(0, 1, 0);
      target.cell.camera.fov = mainCamera.fov;
      target.cell.camera.aspect = screenW / screenH;
      target.cell.camera.near = mainCamera.near;
      target.cell.camera.far = mainCamera.far;
      target.cell.camera.updateProjectionMatrix();

      // Debug: log camera position occasionally
      if (Math.random() < 0.005) {
        console.log(`${target.name} camera at (${markerWorldPos.x.toFixed(0)}, ${markerWorldPos.y.toFixed(0)}, ${blendedCameraZ.toFixed(0)})`);
      }
    }
    // ON-SCREEN targets don't need camera updates - they render with player camera
  }

  // Always recompute Voronoi since all targets have seeds
  if (testTargets.length > 0) {
    voronoiCellManager.computeVoronoi();
  }

}

/**
 * Drop a new target at the player's current position
 * Up to MAX_TARGETS can exist simultaneously
 */
function dropTarget() {
  if (testTargets.length >= MAX_TARGETS) {
    console.log(`Maximum ${MAX_TARGETS} targets reached`);
    return;
  }

  const targetIndex = testTargets.length;
  const targetId = nextTargetId++;

  // Create target object
  // terrainZ will be set on the VoronoiCell, not on the target itself
  const target = {
    id: targetId,
    worldX: player.x,  // Drop at current position (not ahead)
    worldY: player.y,
    name: TARGET_NAMES[targetIndex],
    color: TARGET_COLORS[targetIndex],
    marker: null,
    cell: null,        // VoronoiCell will be created on first update
    onScreen: true
  };

  // Initialize camera Z to current player camera Z (same altitude as aircraft when dropped)
  // Can be adjusted via mouse wheel when hovering over the cell
  target.initialCameraZ = renderer.getCameraZ();

  // Create debug marker - a bright box visible in the terrain
  const markerGeometry = new THREE.BoxGeometry(50, 50, 50);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: target.color });
  target.marker = new THREE.Mesh(markerGeometry, markerMaterial);
  target.marker.name = `targetMarker_${target.name}`;
  target.marker.position.set(target.worldX, target.worldY, 5);
  terrainRenderer.getTerrainGroup().add(target.marker);

  testTargets.push(target);

  console.log(`Target ${target.name} dropped at (${target.worldX.toFixed(0)}, ${target.worldY.toFixed(0)}) cameraZ:${target.initialCameraZ.toFixed(0)} [${testTargets.length}/${MAX_TARGETS}]`);
}

/**
 * Clear all test targets
 */
function clearAllTargets() {
  for (const target of testTargets) {
    // Remove marker
    if (target.marker) {
      terrainRenderer.getTerrainGroup().remove(target.marker);
      target.marker.geometry.dispose();
      target.marker.material.dispose();
    }

    // Remove Voronoi cell if it exists
    if (target.cell && voronoiCellManager.getCells().includes(target.cell)) {
      voronoiCellManager.removeCell(target.cell);
    }
  }

  testTargets.length = 0;
  console.log('All targets cleared');
}

// ============================================
// Game Loop
// ============================================

function gameLoop(currentTime) {
  // Calculate delta time in seconds
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Update
  update(deltaTime);

  // Render
  render();

  // Update debug display
  updateDebug(deltaTime);

  // Next frame
  requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
  // Get current input state
  const inputState = input.getInputState();

  // Update player aircraft
  player.update(deltaTime, inputState);

  // Update chunk system (load/unload based on player position)
  chunkManager.update(player.x, player.y, player.heading, deltaTime);

  // Update airbase rendering - add runway meshes for loaded chunks
  updateAirbaseRendering();

  // Update PAPI lights based on player position
  if (airbaseRenderer) {
    airbaseRenderer.updatePAPILights(player.x, player.y, player.altitude);
  }

  // Update camera Z position based on altitude (camera moves, terrain FIXED at Z=0)
  // Higher altitude = higher camera Z = camera further from terrain = zoomed out
  currentCameraZ = renderer.updateAltitudeZoom(player.altitude, deltaTime);

  // Update terrain transform FIRST - this computes pivotY which other systems need
  // Terrain is FIXED at TERRAIN_Z=0, camera moves with altitude
  const aircraftScreenY = player.getScreenY();
  // For terrain transform, use previous frame's aircraftZ initially, then update
  const prevAircraftZ = player.screenZ;
  terrainRenderer.updateTransform(player.x, player.y, player.heading, TERRAIN_Z, aircraftScreenY, prevAircraftZ, currentCameraZ);

  // Now get pivotY (computed by updateTransform)
  const pivotY = terrainRenderer.getPivotY();

  // Update aircraft mesh Z to stay between camera and terrain
  // Also pass pivotY so aircraft Y matches terrain position
  player.updateMeshZ(currentCameraZ, TERRAIN_Z, pivotY);

  // Update shadow position (computed in world coordinates)
  player.updateShadowZ(TERRAIN_Z);

  // Update terrain blur based on altitude (currently disabled)
  renderer.updateBlur(player.altitude);

  // Update airbase cell behavior (detection, merge transitions)
  // DISABLED for debugging Voronoi split screen
  // if (airbaseCellController) {
  //   airbaseCellController.update(player.x, player.y, player.altitude, deltaTime);
  // }

  // Update Phase 2 test targets
  updateTestTargets();

  // Update Voronoi cell cameras
  voronoiCellManager.updateCameras();
}

/**
 * Update airbase rendering - add runway meshes for newly loaded chunks
 */
function updateAirbaseRendering() {
  if (!airbaseRenderer) return;

  // Process all active chunks for airbase rendering
  const chunkSize = 2000;
  for (const [key] of chunkManager.chunks) {
    const [chunkX, chunkY] = key.split(',').map(Number);
    airbaseRenderer.onChunkLoaded(chunkX, chunkY, chunkSize);
  }
}

function render() {
  // Use Voronoi cell manager for multi-pass stencil rendering
  voronoiCellManager.render();
}

function updateDebug(deltaTime) {
  if (debugElement) {
    const fps = Math.round(1 / deltaTime);
    const chunkX = Math.floor(player.x / 2000);
    const chunkY = Math.floor(player.y / 2000);

    // Get nearest airbase info
    let airbaseInfo = 'None';
    if (airbaseRenderer && airbaseRegistry) {
      const nearestInfo = airbaseRenderer.getNearestGlideslopeStatus(player.x, player.y, player.altitude);
      if (nearestInfo) {
        const distNm = (nearestInfo.distance / 6076).toFixed(1); // Convert feet to nautical miles
        airbaseInfo = `${nearestInfo.airbase.name} ${distNm}nm ${nearestInfo.status}`;
      }
    }

    // Build test targets info
    let targetInfo = `${testTargets.length}/${MAX_TARGETS}`;
    if (testTargets.length === 0) {
      targetInfo += ' (press 9)';
    }

    // Build individual target status lines
    const targetLines = testTargets.map(t => {
      const dx = t.worldX - player.x;
      const dy = t.worldY - player.y;
      const dist = Math.hypot(dx, dy);
      const distNm = (dist / 6076).toFixed(1);
      return `  ${t.name}: ${distNm}nm ${t.onScreen ? '✓' : '○'}`;
    });

    // Get touch state for debug display
    const inputState = input.getInputState();
    const touchInfo = inputState.touchActive
      ? `Turn: ${inputState.touchTurn.toFixed(2)} Thr: ${inputState.touchThrottle.toFixed(2)}`
      : 'Inactive';

    debugElement.innerHTML = [
      `FPS: ${fps}`,
      `X: ${Math.round(player.x)}`,
      `Y: ${Math.round(player.y)}`,
      `HDG: ${Math.round(player.heading * 180 / Math.PI)}°`,
      `ALT: ${Math.round(player.altitude)}ft`,
      `THR: ${Math.round(player.throttle * 100)}%`,
      `SPD: ${Math.round(player.speed)}`,
      `CAM_Z: ${currentCameraZ.toFixed(0)}`,
      `CHUNK: ${chunkX},${chunkY}`,
      `ACTIVE: ${chunkManager.getActiveChunkCount()}`,
      `QUEUE: ${chunkManager.getQueuedChunkCount()}`,
      `--- TOUCH CONTROLS ---`,
      `TOUCH: ${touchInfo}`,
      `TAP: drop view | 2x TAP: clear`,
      `--- VORONOI CELLS ---`,
      `CELLS: ${voronoiCellManager ? voronoiCellManager.getCellCount() : 0}`,
      `--- TARGETS (9/Shift+9) ---`,
      `COUNT: ${targetInfo}`,
      ...targetLines,
      `--- AIRBASE ---`,
      `NEAR: ${airbaseInfo}`,
      `RENDERED: ${airbaseRenderer ? airbaseRenderer.getRenderedCount() : 0}`,
      `--- LIGHT (L/K/I/U) ---`,
      `AZ: ${LightingConfig.azimuth}° EL: ${LightingConfig.elevation}°`,
      `INT: ${LightingConfig.intensity.toFixed(2)} AMB: ${LightingConfig.ambient.toFixed(2)}`,
    ].join('<br>');
  }
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
