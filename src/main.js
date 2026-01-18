/**
 * Voronoi Skies - Entry point and game loop
 */

import * as input from './input.js';
import * as renderer from './renderer.js';
import { Aircraft } from './entities/aircraft.js';
import { TerrainRenderer } from './terrain/TerrainRenderer.js';
import { ChunkManager } from './terrain/ChunkManager.js';

// Game state
let player = null;
let terrainRenderer = null;
let chunkManager = null;
let lastTime = 0;
let debugElement = null;
let currentTerrainZ = 0;

// Lighting control state
let lightingControlsEnabled = true;

function init() {
  // Initialize input handling
  input.init();

  console.log('Voronoi Skies Initialized');

  // Initialize renderer
  const container = document.getElementById('game-container');
  renderer.init(container);

  // Initialize terrain renderer (provides pivot/terrain group hierarchy)
  terrainRenderer = new TerrainRenderer();

  // Add terrain to scene (before player so it renders behind)
  const scene = renderer.getScene();
  scene.add(terrainRenderer.getGroup());

  // Initialize chunk manager for infinite terrain
  chunkManager = new ChunkManager({
    worldSeed: 42,
    chunkSize: 2000,
    loadRadius: 5,         // 11x11 grid = 121 chunks for high altitude view
    gridSpacing: 25,       // ~6400 cells per chunk
    boundaryMode: 'none',  // No visible cell edges (cleanest look)
    terrainGroup: terrainRenderer.getTerrainGroup()
  });

  // Create player aircraft at origin
  player = new Aircraft(0, 0);

  // Generate initial chunks synchronously (centered on player start)
  chunkManager.initializeAtPosition(player.x, player.y);

  // Add shadow mesh to scene (after terrain, before aircraft)
  scene.add(player.getShadowMesh());

  // Add player mesh to scene
  scene.add(player.getMesh());

  // Get debug element for FPS display
  debugElement = document.getElementById('debug');

  // Set up lighting keyboard controls
  initLightingControls();

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

/**
 * Initialize keyboard controls for lighting adjustments
 * L/Shift+L: Rotate light azimuth ±15°
 * K/Shift+K: Adjust elevation ±5°
 * I/Shift+I: Adjust intensity ±0.05
 * U/Shift+U: Adjust ambient ±0.05
 */
function initLightingControls() {
  window.addEventListener('keydown', (e) => {
    if (!lightingControlsEnabled || !chunkManager) return;

    const config = chunkManager.getLightingConfig();
    let updated = false;

    switch (e.code) {
      case 'KeyL':
        // Rotate azimuth: L = +15° (clockwise), Shift+L = -15° (counter-clockwise)
        config.azimuth = e.shiftKey ? config.azimuth - 15 : config.azimuth + 15;
        updated = true;
        break;

      case 'KeyK':
        // Adjust elevation: K = +5°, Shift+K = -5°
        config.elevation = e.shiftKey ? config.elevation - 5 : config.elevation + 5;
        updated = true;
        break;

      case 'KeyI':
        // Adjust intensity: I = +0.05, Shift+I = -0.05
        config.intensity = e.shiftKey ? config.intensity - 0.05 : config.intensity + 0.05;
        updated = true;
        break;

      case 'KeyU':
        // Adjust ambient: U = +0.05, Shift+U = -0.05
        config.ambient = e.shiftKey ? config.ambient - 0.05 : config.ambient + 0.05;
        updated = true;
        break;
    }

    if (updated) {
      chunkManager.setLightingConfig(config);
    }
  });
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
}

function render() {
  renderer.render();
}

function updateDebug(deltaTime) {
  if (debugElement) {
    const fps = Math.round(1 / deltaTime);
    const chunkX = Math.floor(player.x / 2000);
    const chunkY = Math.floor(player.y / 2000);
    const lighting = chunkManager.getLightingConfig();
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
      `--- LIGHT (L/K/I/U) ---`,
      `AZ: ${lighting.azimuth}° EL: ${lighting.elevation}°`,
      `INT: ${lighting.intensity.toFixed(2)} AMB: ${lighting.ambient.toFixed(2)}`,
    ].join('<br>');
  }
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
