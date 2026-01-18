/**
 * Manages terrain chunk lifecycle: loading, unloading, and generation queue
 */
import { Chunk } from './Chunk.js';
import { ChunkGenerator } from './ChunkGenerator.js';
import { ChunkRenderer, BoundaryMode } from './ChunkRenderer.js';
import { hashChunkSeed } from '../utils/hash.js';
import { updateLightingConfig, getLightingConfig } from './lighting.js';

export class ChunkManager {
  /**
   * @param {Object} config
   * @param {number} config.worldSeed - Seed for deterministic generation
   * @param {number} config.chunkSize - Size of each chunk in world units (default: 2000)
   * @param {number} config.loadRadius - Chunks to load in each direction (default: 2)
   * @param {number} config.gridSpacing - Grid spacing for jittered point placement (default: 115)
   * @param {string} config.boundaryMode - Boundary rendering mode: 'none', 'darker', 'biome' (default: 'none')
   * @param {THREE.Group} config.terrainGroup - Parent group for chunk meshes
   */
  constructor(config) {
    this.worldSeed = config.worldSeed || 42;
    this.chunkSize = config.chunkSize || 2000;
    this.loadRadius = config.loadRadius || 2;
    this.gridSpacing = config.gridSpacing || 25; // ~6400 cells per 2000x2000 chunk
    this.boundaryMode = config.boundaryMode || BoundaryMode.NONE;
    this.terrainGroup = config.terrainGroup;

    // Active chunks: Map<string, Chunk>
    this.chunks = new Map();

    // Generation queue: [{chunkX, chunkY, priority}]
    this.generationQueue = [];

    // Set to track what's already queued
    this.queuedKeys = new Set();

    // Chunk generator and renderer instances
    this.chunkGenerator = new ChunkGenerator(this.worldSeed);
    this.chunkRenderer = new ChunkRenderer();
  }

  /**
   * Convert world coordinate to chunk coordinate
   * @param {number} worldCoord - World coordinate
   * @returns {number} - Chunk coordinate (integer)
   */
  getChunkCoord(worldCoord) {
    return Math.floor(worldCoord / this.chunkSize);
  }

  /**
   * Get the chunk coordinates for a world position
   * @param {number} worldX
   * @param {number} worldY
   * @returns {{chunkX: number, chunkY: number}}
   */
  getPlayerChunk(worldX, worldY) {
    return {
      chunkX: this.getChunkCoord(worldX),
      chunkY: this.getChunkCoord(worldY)
    };
  }

  /**
   * Get all chunk coordinates within load radius of player
   * @param {number} playerX
   * @param {number} playerY
   * @returns {Array<{chunkX: number, chunkY: number}>}
   */
  getRequiredChunkCoords(playerX, playerY) {
    const { chunkX: pcx, chunkY: pcy } = this.getPlayerChunk(playerX, playerY);
    const required = [];

    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
        required.push({ chunkX: pcx + dx, chunkY: pcy + dy });
      }
    }

    return required;
  }

  /**
   * Calculate priority for chunk generation (lower = generate first)
   * Prioritizes chunks in front of the aircraft
   * @param {number} chunkX
   * @param {number} chunkY
   * @param {number} playerChunkX
   * @param {number} playerChunkY
   * @param {number} playerHeading - Heading in radians (0 = north/+Y)
   * @returns {number}
   */
  calculatePriority(chunkX, chunkY, playerChunkX, playerChunkY, playerHeading) {
    // Vector from player chunk to target chunk
    const dx = chunkX - playerChunkX;
    const dy = chunkY - playerChunkY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Direction vector from player heading (0 = north/+Y)
    const headingX = Math.sin(playerHeading);
    const headingY = Math.cos(playerHeading);

    // Dot product: how much chunk is in front of player
    const length = distance || 1;
    const dot = (dx * headingX + dy * headingY) / length;

    // Priority: lower = generate first
    // Chunks in front (positive dot) get lower priority numbers
    return distance - dot * 1.5;
  }

  /**
   * Check if a chunk key is already in the generation queue
   * @param {string} key
   * @returns {boolean}
   */
  isQueued(key) {
    return this.queuedKeys.has(key);
  }

  /**
   * Add a chunk to the generation queue
   * @param {number} chunkX
   * @param {number} chunkY
   * @param {number} priority
   */
  enqueue(chunkX, chunkY, priority) {
    const key = `${chunkX},${chunkY}`;
    if (!this.isQueued(key)) {
      this.generationQueue.push({ chunkX, chunkY, priority });
      this.queuedKeys.add(key);
    }
  }

  /**
   * Process the generation queue, loading up to maxChunks
   * @param {number} maxChunks - Maximum chunks to generate this frame
   */
  processGenerationQueue(maxChunks = 2) {
    let processed = 0;

    while (processed < maxChunks && this.generationQueue.length > 0) {
      const { chunkX, chunkY } = this.generationQueue.shift();
      const key = `${chunkX},${chunkY}`;

      // Remove from queued set
      this.queuedKeys.delete(key);

      // Skip if already loaded (may have been loaded synchronously)
      if (this.chunks.has(key)) continue;

      // Generate and load the chunk
      this.loadChunk(chunkX, chunkY);
      processed++;
    }
  }

  /**
   * Load a specific chunk: generate cells, build meshes, add to scene
   * @param {number} chunkX
   * @param {number} chunkY
   */
  loadChunk(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;

    // Create chunk
    const chunk = new Chunk(chunkX, chunkY, this.chunkSize);

    // Get deterministic seed for this chunk (kept for API compatibility)
    const chunkSeed = hashChunkSeed(this.worldSeed, chunkX, chunkY);

    // Generate cells with jittered grid configuration
    this.chunkGenerator.generateChunk(chunk, chunkSeed, {
      gridSpacing: this.gridSpacing
    });

    // Build meshes with boundary mode
    this.chunkRenderer.buildChunkMeshes(chunk, this.boundaryMode);

    // Add to scene
    this.terrainGroup.add(chunk.group);

    // Track
    this.chunks.set(key, chunk);
  }

  /**
   * Unload a chunk: remove from scene, dispose resources
   * @param {string} key - Chunk key in format "chunkX,chunkY"
   */
  unloadChunk(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    // Remove from scene
    this.terrainGroup.remove(chunk.group);

    // Dispose resources
    chunk.dispose();

    // Remove from tracking
    this.chunks.delete(key);
  }

  /**
   * Initialize chunks at a position (synchronous, for game start)
   * @param {number} playerX
   * @param {number} playerY
   */
  initializeAtPosition(playerX, playerY) {
    const required = this.getRequiredChunkCoords(playerX, playerY);

    // Load all initial chunks synchronously
    for (const { chunkX, chunkY } of required) {
      this.loadChunk(chunkX, chunkY);
    }
  }

  /**
   * Update chunk system: load/unload chunks based on player position
   * @param {number} playerX
   * @param {number} playerY
   * @param {number} playerHeading - Heading in radians
   * @param {number} deltaTime - Time since last frame (unused but available)
   */
  update(playerX, playerY, playerHeading, deltaTime) {
    const required = this.getRequiredChunkCoords(playerX, playerY);
    const requiredKeys = new Set(required.map(c => `${c.chunkX},${c.chunkY}`));

    // Unload chunks no longer needed
    for (const [key, chunk] of this.chunks) {
      if (!requiredKeys.has(key)) {
        this.unloadChunk(key);
      }
    }

    // Queue chunks that need loading
    const { chunkX: pcx, chunkY: pcy } = this.getPlayerChunk(playerX, playerY);

    for (const { chunkX, chunkY } of required) {
      const key = `${chunkX},${chunkY}`;
      if (!this.chunks.has(key) && !this.isQueued(key)) {
        const priority = this.calculatePriority(chunkX, chunkY, pcx, pcy, playerHeading);
        this.enqueue(chunkX, chunkY, priority);
      }
    }

    // Sort queue by priority and process
    this.generationQueue.sort((a, b) => a.priority - b.priority);
    this.processGenerationQueue(2);
  }

  /**
   * Get the number of active chunks (for debug display)
   * @returns {number}
   */
  getActiveChunkCount() {
    return this.chunks.size;
  }

  /**
   * Get the number of queued chunks (for debug display)
   * @returns {number}
   */
  getQueuedChunkCount() {
    return this.generationQueue.length;
  }

  /**
   * Update lighting configuration
   * Note: With GPU lighting, this only updates the config values.
   * Three.js lights should be updated separately in main.js.
   * @param {Object} updates - Partial lighting config updates
   */
  setLightingConfig(updates) {
    updateLightingConfig(updates);
    // No regeneration needed - GPU handles lighting in real-time
  }

  /**
   * Get current lighting configuration
   * @returns {Object} - Current lighting config
   */
  getLightingConfig() {
    return getLightingConfig();
  }

  /**
   * Regenerate all loaded chunks (e.g., after lighting change)
   * Preserves chunk positions but recalculates colors
   */
  regenerateAllChunks() {
    // Get all chunk coordinates before clearing
    const chunkCoords = [];
    for (const [key] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      chunkCoords.push({ chunkX: cx, chunkY: cy });
    }

    // Unload all current chunks
    for (const [key] of this.chunks) {
      this.unloadChunk(key);
    }

    // Reload all chunks with new lighting
    for (const { chunkX, chunkY } of chunkCoords) {
      this.loadChunk(chunkX, chunkY);
    }
  }
}
