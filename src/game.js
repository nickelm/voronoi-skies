/**
 * Voronoi Skies - Game Logic Module
 *
 * Contains all game state, initialization, update, and render logic.
 * Exported functions are used by FlightScreen.
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
import { FlightControlIndicator } from './ui/FlightControlIndicator.js';
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
let flightControlIndicator = null;
let debugElement = null;
let currentCameraZ = 500;
const TERRAIN_Z = 0;

// Phase 2 Test Targets
const MAX_TARGETS = 5;
const TARGET_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
const TARGET_COLORS = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];
const testTargets = [];
let nextTargetId = 0;

const SCREEN_INSET = 30;
const VISIBILITY_MARGIN = 50;

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

// Escape key tracking for menu return
let escapePressed = false;

// Track if game is initialized
let isInitialized = false;

/**
 * Initialize the game with a specific world seed
 * @param {number} worldSeed - Seed for world generation
 */
export async function initGame(worldSeed = 42) {
  if (isInitialized) {
    console.warn('Game already initialized');
    return;
  }

  // Initialize input handling
  input.init();

  // Initialize touch controls with tap callbacks
  input.initTouch({
    onSingleTap: () => dropTarget(),
    onDoubleTap: () => clearAllTargets(),
  });

  console.log(`Voronoi Skies Initialized with seed: ${worldSeed}`);

  // Get loading UI elements
  loadingOverlay = document.getElementById('loading-overlay');
  loadingBar = document.getElementById('loading-bar');
  loadingText = document.getElementById('loading-text');

  // Show loading overlay
  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
  }

  // Initialize renderer
  const container = document.getElementById('game-container');
  renderer.init(container);

  // Initialize terrain renderer
  terrainRenderer = new TerrainRenderer();

  // Add terrain to scene
  const scene = renderer.getScene();
  scene.add(terrainRenderer.getGroup());

  // Set up lighting
  setupLighting(scene);

  // Initialize noise
  initNoise(worldSeed);

  // Initialize airbase registry
  airbaseRegistry = new AirbaseRegistry(worldSeed);
  airbaseRegistry.generateAirbases();
  airbaseRegistry.ensureStarterAirbase(0, 0);

  // Initialize chunk manager
  chunkManager = new ChunkManager({
    worldSeed: worldSeed,
    chunkSize: 2000,
    loadRadius: 5,
    gridSpacing: 25,
    boundaryMode: 'none',
    terrainGroup: terrainRenderer.getTerrainGroup(),
    onLoadProgress: updateLoadingProgress,
    airbaseRegistry: airbaseRegistry,
  });

  // Initialize airbase renderer
  airbaseRenderer = new AirbaseRenderer(
    airbaseRegistry,
    terrainRenderer.getTerrainGroup()
  );

  // Create player aircraft
  player = new Aircraft(0, 0);

  // Queue initial chunks
  chunkManager.initializeAtPosition(player.x, player.y);

  // Add shadow to terrain group
  terrainRenderer.getTerrainGroup().add(player.getShadowMesh());

  // Add player mesh to scene
  scene.add(player.getMesh());

  // Get debug element
  debugElement = document.getElementById('debug');

  // Set up lighting controls
  initLightingControls();

  // Initialize Voronoi cell manager
  const threeRenderer = renderer.getRenderer();
  const mainCamera = renderer.getCamera();
  voronoiCellManager = new VoronoiCellManager(threeRenderer, scene, mainCamera);
  voronoiCellManager.initPlayerCell();

  // Initialize label overlay
  voronoiCellManager.initLabelOverlay(container);

  // Initialize airbase cell controller
  airbaseCellController = new AirbaseCellController(
    airbaseRegistry,
    voronoiCellManager
  );

  // Initialize UI cell manager
  uiCellManager = new UiCellManager(voronoiCellManager);

  // Initialize flight control indicator
  flightControlIndicator = new FlightControlIndicator({ container });

  isInitialized = true;
}

/**
 * Stop and clean up the game
 */
export function stopGame() {
  if (!isInitialized) return;

  // Clear targets
  clearAllTargets();

  // Dispose flight control indicator
  if (flightControlIndicator) {
    flightControlIndicator.dispose();
    flightControlIndicator = null;
  }

  // Dispose chunk manager
  if (chunkManager) {
    chunkManager.dispose();
    chunkManager = null;
  }

  // Dispose airbase renderer
  if (airbaseRenderer) {
    airbaseRenderer.dispose();
    airbaseRenderer = null;
  }

  // Dispose terrain renderer
  if (terrainRenderer) {
    terrainRenderer.dispose();
    terrainRenderer = null;
  }

  // Dispose voronoi cell manager
  if (voronoiCellManager) {
    voronoiCellManager.dispose();
    voronoiCellManager = null;
  }

  // Dispose renderer
  renderer.dispose();

  // Reset state
  player = null;
  airbaseRegistry = null;
  airbaseCellController = null;
  uiCellManager = null;
  directionalLight = null;
  ambientLight = null;
  hemisphereLight = null;
  escapePressed = false;
  isInitialized = false;

  console.log('Game stopped and cleaned up');
}

/**
 * Check if user wants to return to menu (ESC pressed)
 */
export function shouldReturnToMenu() {
  if (escapePressed) {
    escapePressed = false;
    return true;
  }
  return false;
}

/**
 * Update game state
 */
export function update(deltaTime) {
  if (!isInitialized || !player) return;

  const inputState = input.getInputState();

  // Update player aircraft
  player.update(deltaTime, inputState);

  // Update flight control indicator
  if (flightControlIndicator) {
    flightControlIndicator.update({
      throttle: player.throttle,
      stickX: player.stickX,
      stickY: player.pitchAngle,
      status: {
        afterburner: player.throttle > 1.0,
        speedBrake: false,
        flaps: false,
        gear: false,
      },
      inputActive:
        inputState.turnLeft ||
        inputState.turnRight ||
        inputState.throttleUp ||
        inputState.throttleDown ||
        inputState.climbUp ||
        inputState.climbDown ||
        inputState.touchActive,
    });
  }

  // Update chunk system
  const viewportRegions = buildViewportRegions();
  chunkManager.update(viewportRegions, player.heading, deltaTime);

  // Update airbase rendering
  updateAirbaseRendering();

  // Update PAPI lights
  if (airbaseRenderer) {
    airbaseRenderer.updatePAPILights(player.x, player.y, player.altitude);
  }

  // Update camera Z
  currentCameraZ = renderer.updateAltitudeZoom(player.altitude, deltaTime);

  // Update terrain transform
  const aircraftScreenY = player.getScreenY();
  const prevAircraftZ = player.screenZ;
  terrainRenderer.updateTransform(
    player.x,
    player.y,
    player.heading,
    TERRAIN_Z,
    aircraftScreenY,
    prevAircraftZ,
    currentCameraZ
  );

  const pivotY = terrainRenderer.getPivotY();

  // Update aircraft mesh Z
  player.updateMeshZ(currentCameraZ, TERRAIN_Z, pivotY);

  // Update shadow
  player.updateShadowZ(TERRAIN_Z);

  // Update blur
  renderer.updateBlur(player.altitude);

  // Update test targets
  updateTestTargets();

  // Update Voronoi cell cameras
  voronoiCellManager.updateCameras();
}

/**
 * Render the game
 */
export function render() {
  if (!isInitialized || !voronoiCellManager) return;

  voronoiCellManager.render();
  voronoiCellManager.renderLabels(currentCameraZ, player.x, player.y);
}

/**
 * Update debug display
 */
export function updateDebug(deltaTime) {
  if (!debugElement || !isInitialized || !player) return;

  const fps = Math.round(1 / deltaTime);
  const chunkX = Math.floor(player.x / 2000);
  const chunkY = Math.floor(player.y / 2000);

  let airbaseInfo = 'None';
  if (airbaseRenderer && airbaseRegistry) {
    const nearestInfo = airbaseRenderer.getNearestGlideslopeStatus(
      player.x,
      player.y,
      player.altitude
    );
    if (nearestInfo) {
      const distNm = (nearestInfo.distance / 6076).toFixed(1);
      airbaseInfo = `${nearestInfo.airbase.name} ${distNm}nm ${nearestInfo.status}`;
    }
  }

  let targetInfo = `${testTargets.length}/${MAX_TARGETS}`;
  if (testTargets.length === 0) {
    targetInfo += ' (press 9)';
  }

  const targetLines = testTargets.map((t) => {
    const dx = t.worldX - player.x;
    const dy = t.worldY - player.y;
    const dist = Math.hypot(dx, dy);
    const distNm = (dist / 6076).toFixed(1);
    return `  ${t.name}: ${distNm}nm ${t.onScreen ? '\u2713' : '\u25CB'}`;
  });

  const inputState = input.getInputState();
  const touchInfo = inputState.touchActive
    ? `Turn: ${inputState.touchTurn.toFixed(2)} Thr: ${inputState.touchThrottle.toFixed(2)}`
    : 'Inactive';

  debugElement.innerHTML = [
    `FPS: ${fps}`,
    `X: ${Math.round(player.x)}`,
    `Y: ${Math.round(player.y)}`,
    `HDG: ${Math.round((player.heading * 180) / Math.PI)}\u00B0`,
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
    `AZ: ${LightingConfig.azimuth}\u00B0 EL: ${LightingConfig.elevation}\u00B0`,
    `INT: ${LightingConfig.intensity.toFixed(2)} AMB: ${LightingConfig.ambient.toFixed(2)}`,
    `--- ESC: Menu ---`,
  ].join('<br>');
}

// ============================================
// Internal Helper Functions
// ============================================

function updateLoadingProgress(loaded, total) {
  if (loadingBar) {
    const percent = total > 0 ? (loaded / total) * 100 : 0;
    loadingBar.style.width = `${percent}%`;
  }
  if (loadingText) {
    loadingText.textContent = `Generating terrain... ${loaded}/${total}`;
  }

  if (loaded >= total && loadingOverlay) {
    loadingOverlay.classList.add('hidden');
    setTimeout(() => {
      if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
      }
    }, 500);
  }
}

function setupLighting(scene) {
  ambientLight = new THREE.AmbientLight(0xffffff, LightingConfig.ambient);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(
    new THREE.Color(
      LightingConfig.color.r,
      LightingConfig.color.g,
      LightingConfig.color.b
    ),
    LightingConfig.intensity
  );
  updateLightDirection();
  scene.add(directionalLight);

  hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3d3028, 0.35);
  scene.add(hemisphereLight);

  scene.fog = new THREE.Fog(new THREE.Color(0x87ceeb), 1000, 50000);
}

function updateLightDirection() {
  if (!directionalLight) return;

  const azRad = (LightingConfig.azimuth * Math.PI) / 180;
  const elRad = (LightingConfig.elevation * Math.PI) / 180;
  const cosEl = Math.cos(elRad);
  const distance = 1000;

  directionalLight.position.set(
    Math.sin(azRad) * cosEl * distance,
    Math.cos(azRad) * cosEl * distance,
    Math.sin(elRad) * distance
  );
}

function initLightingControls() {
  window.addEventListener('keydown', (e) => {
    // ESC key to return to menu
    if (e.code === 'Escape') {
      escapePressed = true;
      return;
    }

    if (!lightingControlsEnabled) return;

    let updated = false;

    switch (e.code) {
      case 'KeyL':
        LightingConfig.azimuth =
          ((LightingConfig.azimuth + (e.shiftKey ? -15 : 15)) % 360 + 360) % 360;
        updateLightDirection();
        updated = true;
        break;

      case 'KeyK':
        LightingConfig.elevation = Math.max(
          5,
          Math.min(90, LightingConfig.elevation + (e.shiftKey ? -5 : 5))
        );
        updateLightDirection();
        updated = true;
        break;

      case 'KeyI':
        LightingConfig.intensity = Math.max(
          0,
          Math.min(2, LightingConfig.intensity + (e.shiftKey ? -0.1 : 0.1))
        );
        if (directionalLight) directionalLight.intensity = LightingConfig.intensity;
        updated = true;
        break;

      case 'KeyU':
        LightingConfig.ambient = Math.max(
          0,
          Math.min(1, LightingConfig.ambient + (e.shiftKey ? -0.1 : 0.1))
        );
        if (ambientLight) ambientLight.intensity = LightingConfig.ambient;
        updated = true;
        break;

      case 'Digit1':
        applyTimePresetWithSky('dawn');
        updated = true;
        break;

      case 'Digit2':
        applyTimePresetWithSky('noon');
        updated = true;
        break;

      case 'Digit3':
        applyTimePresetWithSky('night');
        updated = true;
        break;

      case 'Digit9':
        if (e.shiftKey) {
          clearAllTargets();
        } else {
          dropTarget();
        }
        break;
    }

    if (updated) {
      console.log(
        `Light: AZ=${LightingConfig.azimuth}\u00B0 EL=${LightingConfig.elevation}\u00B0 INT=${LightingConfig.intensity.toFixed(2)} AMB=${LightingConfig.ambient.toFixed(2)}`
      );
    }
  });

  window.addEventListener(
    'wheel',
    (e) => {
      if (!voronoiCellManager) return;

      const cell = voronoiCellManager.getCellAtPoint(e.clientX, e.clientY);
      if (!cell) return;

      if (cell.type === 'player') return;

      if (cell.terrainZ === null) {
        cell.terrainZ = renderer.getCameraZ();
      }

      const ZOOM_SPEED = 200;
      const MIN_CAMERA_Z = 500;
      const MAX_CAMERA_Z = 15600;

      const delta = e.deltaY > 0 ? ZOOM_SPEED : -ZOOM_SPEED;
      cell.terrainZ = Math.max(
        MIN_CAMERA_Z,
        Math.min(MAX_CAMERA_Z, cell.terrainZ + delta)
      );

      e.preventDefault();

      const target = testTargets.find((t) => t.cell === cell);
      if (target) {
        console.log(`${target.name} camera Z: ${cell.terrainZ.toFixed(0)}`);
      }
    },
    { passive: false }
  );
}

function applyTimePresetWithSky(presetName) {
  const preset = applyTimePreset(presetName);
  if (preset) {
    syncLightsToConfig(preset.sky);
  }
}

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
    ambientLight.color.setRGB(
      LightingConfig.color.r,
      LightingConfig.color.g,
      LightingConfig.color.b
    );
  }
  if (hemisphereLight && LightingConfig.hemisphere) {
    const hemi = LightingConfig.hemisphere;
    hemisphereLight.color.setRGB(
      hemi.skyColor.r,
      hemi.skyColor.g,
      hemi.skyColor.b
    );
    hemisphereLight.groundColor.setRGB(
      hemi.groundColor.r,
      hemi.groundColor.g,
      hemi.groundColor.b
    );
    hemisphereLight.intensity = hemi.intensity;
  }
  const scene = renderer.getScene();
  if (skyColor && scene) {
    scene.background.setRGB(skyColor.r, skyColor.g, skyColor.b);
    if (scene.fog) {
      scene.fog.color.setRGB(skyColor.r, skyColor.g, skyColor.b);
    }
  }
  updateLightDirection();
}

function isTargetVisible(worldX, worldY, playerX, playerY, playerHeading) {
  const mainCamera = renderer.getCamera();
  const cameraZ = renderer.getCameraZ();

  const fovRad = (mainCamera.fov * Math.PI) / 180;
  const aspect = mainCamera.aspect;

  const halfHeight = Math.tan(fovRad / 2) * cameraZ;
  const halfWidth = halfHeight * aspect;

  const marginFraction = 0.1;
  const visibleHalfWidth = halfWidth * (1 - marginFraction);
  const visibleHalfHeight = halfHeight * (1 - marginFraction);

  const offsetX = worldX - playerX;
  const offsetY = worldY - playerY;

  const cos = Math.cos(playerHeading);
  const sin = Math.sin(playerHeading);
  const rotatedX = offsetX * cos - offsetY * sin;
  const rotatedY = offsetX * sin + offsetY * cos;

  return (
    Math.abs(rotatedX) <= visibleHalfWidth &&
    Math.abs(rotatedY) <= visibleHalfHeight
  );
}

function projectToScreen(worldX, worldY, playerX, playerY, playerHeading) {
  const mainCamera = renderer.getCamera();
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  const offsetX = worldX - playerX;
  const offsetY = worldY - playerY;

  const cos = Math.cos(playerHeading);
  const sin = Math.sin(playerHeading);
  const rotatedX = offsetX * cos - offsetY * sin;
  const rotatedY = offsetX * sin + offsetY * cos;

  const cameraZ = renderer.getCameraZ();
  const fovRad = (mainCamera.fov * Math.PI) / 180;
  const aspect = mainCamera.aspect;
  const halfHeight = Math.tan(fovRad / 2) * cameraZ;
  const halfWidth = halfHeight * aspect;

  const screenX = screenW / 2 + (rotatedX / halfWidth) * (screenW / 2);
  const screenY = screenH / 2 - (rotatedY / halfHeight) * (screenH / 2);

  return { x: screenX, y: screenY };
}

function rayToScreenEdge(targetX, targetY, screenW, screenH) {
  const cx = screenW / 2;
  const cy = screenH / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: 0 };

  let tMin = Infinity;
  let hit = null;

  if (dx < 0) {
    const t = -cx / dx;
    const y = cy + t * dy;
    if (y >= 0 && y <= screenH && t < tMin) {
      tMin = t;
      hit = { x: 0, y };
    }
  }
  if (dx > 0) {
    const t = (screenW - cx) / dx;
    const y = cy + t * dy;
    if (y >= 0 && y <= screenH && t < tMin) {
      tMin = t;
      hit = { x: screenW, y };
    }
  }
  if (dy < 0) {
    const t = -cy / dy;
    const x = cx + t * dx;
    if (x >= 0 && x <= screenW && t < tMin) {
      tMin = t;
      hit = { x, y: 0 };
    }
  }
  if (dy > 0) {
    const t = (screenH - cy) / dy;
    const x = cx + t * dx;
    if (x >= 0 && x <= screenW && t < tMin) {
      tMin = t;
      hit = { x, y: screenH };
    }
  }

  return hit || { x: cx, y: 0 };
}

function updateTestTargets() {
  if (testTargets.length === 0) return;

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  const offScreenTargets = [];

  for (const target of testTargets) {
    target.onScreen = isTargetVisible(
      target.worldX,
      target.worldY,
      player.x,
      player.y,
      player.heading
    );

    const projected = projectToScreen(
      target.worldX,
      target.worldY,
      player.x,
      player.y,
      player.heading
    );
    target.projectedX = projected.x;
    target.projectedY = projected.y;

    if (target.onScreen) {
      target.seedX = projected.x;
      target.seedY = projected.y;
    } else {
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

  if (offScreenTargets.length > 0) {
    voronoiCellManager.deconflictSeeds(offScreenTargets);
  }

  for (const target of testTargets) {
    if (!target.cell || !voronoiCellManager.getCells().includes(target.cell)) {
      target.cell = voronoiCellManager.createCell('target');
      target.cell.target = target;
      target.cell.setTerrainZ(target.initialCameraZ);
    }

    target.cell.seed.x = target.seedX;
    target.cell.seed.y = target.seedY;
    target.cell.onScreen = target.onScreen;

    target.cell.setProjectedPosition(target.projectedX, target.projectedY);

    if (!target.onScreen) {
      const markerWorldPos = new THREE.Vector3();
      target.marker.getWorldPosition(markerWorldPos);

      const mainCamera = renderer.getCamera();
      const cameraZ = renderer.getCameraZ();

      const blendedCameraZ = target.cell.getBlendedTerrainZ(
        cameraZ,
        VISIBILITY_MARGIN
      );

      target.cell.camera.position.set(
        markerWorldPos.x,
        markerWorldPos.y,
        blendedCameraZ
      );
      target.cell.camera.lookAt(markerWorldPos.x, markerWorldPos.y, TERRAIN_Z);
      target.cell.camera.up.set(0, 1, 0);
      target.cell.camera.fov = mainCamera.fov;
      target.cell.camera.aspect = screenW / screenH;
      target.cell.camera.near = mainCamera.near;
      target.cell.camera.far = mainCamera.far;
      target.cell.camera.updateProjectionMatrix();
    }
  }

  if (testTargets.length > 0) {
    voronoiCellManager.computeVoronoi();
  }
}

function dropTarget() {
  if (testTargets.length >= MAX_TARGETS) {
    console.log(`Maximum ${MAX_TARGETS} targets reached`);
    return;
  }

  const targetIndex = testTargets.length;
  const targetId = nextTargetId++;

  const target = {
    id: targetId,
    worldX: player.x,
    worldY: player.y,
    name: TARGET_NAMES[targetIndex],
    color: TARGET_COLORS[targetIndex],
    marker: null,
    cell: null,
    onScreen: true,
  };

  target.initialCameraZ = renderer.getCameraZ();

  const markerGeometry = new THREE.BoxGeometry(50, 50, 50);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: target.color });
  target.marker = new THREE.Mesh(markerGeometry, markerMaterial);
  target.marker.name = `targetMarker_${target.name}`;
  target.marker.position.set(target.worldX, target.worldY, 5);
  terrainRenderer.getTerrainGroup().add(target.marker);

  testTargets.push(target);

  console.log(
    `Target ${target.name} dropped at (${target.worldX.toFixed(0)}, ${target.worldY.toFixed(0)}) cameraZ:${target.initialCameraZ.toFixed(0)} [${testTargets.length}/${MAX_TARGETS}]`
  );
}

function clearAllTargets() {
  for (const target of testTargets) {
    if (target.marker) {
      terrainRenderer.getTerrainGroup().remove(target.marker);
      target.marker.geometry.dispose();
      target.marker.material.dispose();
    }

    if (target.cell && voronoiCellManager.getCells().includes(target.cell)) {
      voronoiCellManager.removeCell(target.cell);
    }
  }

  testTargets.length = 0;
  console.log('All targets cleared');
}

function buildViewportRegions() {
  const regions = [];

  regions.push({
    x: player.x,
    y: player.y,
    radius: 5,
    priority: 1,
    id: 'player',
  });

  for (const target of testTargets) {
    if (!target.onScreen && target.cell) {
      regions.push({
        x: target.worldX,
        y: target.worldY,
        radius: 2,
        priority: 2,
        id: `target_${target.id}`,
      });
    }
  }

  return regions;
}

function updateAirbaseRendering() {
  if (!airbaseRenderer) return;

  const chunkSize = 2000;
  for (const [key] of chunkManager.chunks) {
    const [chunkX, chunkY] = key.split(',').map(Number);
    airbaseRenderer.onChunkLoaded(chunkX, chunkY, chunkSize);
  }
}
