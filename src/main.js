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
import { initNoise } from './terrain/noise.js';
import { AirbaseRegistry, AirbaseRenderer } from './airbase/index.js';

// Game state
let player = null;
let terrainRenderer = null;
let chunkManager = null;
let voronoiCellManager = null;
let airbaseCellController = null;
let airbaseRegistry = null;
let airbaseRenderer = null;
let lastTime = 0;
let debugElement = null;
let currentTerrainZ = 0;

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
    }

    if (updated) {
      console.log(`Light: AZ=${LightingConfig.azimuth}° EL=${LightingConfig.elevation}° INT=${LightingConfig.intensity.toFixed(2)} AMB=${LightingConfig.ambient.toFixed(2)}`);
    }
  });
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

  // Update terrain Z position based on altitude (returns current terrain Z)
  // Higher altitude = more negative Z = terrain further from camera = appears smaller
  currentTerrainZ = renderer.updateAltitudeZoom(player.altitude, deltaTime);

  // Update shadow Z to match terrain position
  player.updateShadowZ(currentTerrainZ);

  // Update terrain transform with perspective-correct positioning
  const aircraftScreenY = player.getScreenY();
  const aircraftZ = player.screenZ;
  const cameraZ = renderer.getCameraZ();
  terrainRenderer.updateTransform(player.x, player.y, player.heading, currentTerrainZ, aircraftScreenY, aircraftZ, cameraZ);

  // Update terrain blur based on altitude (currently disabled)
  renderer.updateBlur(player.altitude);

  // Update airbase cell behavior (detection, merge transitions)
  // DISABLED for debugging Voronoi split screen
  // if (airbaseCellController) {
  //   airbaseCellController.update(player.x, player.y, player.altitude, deltaTime);
  // }

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

    debugElement.innerHTML = [
      `FPS: ${fps}`,
      `X: ${Math.round(player.x)}`,
      `Y: ${Math.round(player.y)}`,
      `HDG: ${Math.round(player.heading * 180 / Math.PI)}°`,
      `ALT: ${Math.round(player.altitude)}ft`,
      `THR: ${Math.round(player.throttle * 100)}%`,
      `SPD: ${Math.round(player.speed)}`,
      `TZ: ${currentTerrainZ.toFixed(0)}`,
      `CHUNK: ${chunkX},${chunkY}`,
      `ACTIVE: ${chunkManager.getActiveChunkCount()}`,
      `QUEUE: ${chunkManager.getQueuedChunkCount()}`,
      `--- VORONOI CELLS ---`,
      `CELLS: ${voronoiCellManager ? voronoiCellManager.cells.length : 0}`,
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
