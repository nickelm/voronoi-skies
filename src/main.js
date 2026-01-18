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
    loadRadius: 5,  // 11x11 grid = 121 chunks for high altitude view
    cellsPerChunk: 75,
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

  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
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
    ].join('<br>');
  }
}

// Start the game when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
