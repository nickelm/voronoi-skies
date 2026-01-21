/**
 * Manages terrain chunk lifecycle: loading, unloading, and generation queue
 * Uses Web Worker exclusively for terrain generation
 */
import { Chunk } from './Chunk.js';
import { ChunkRenderer, BoundaryMode } from './ChunkRenderer.js';
import { updateLightingConfig, getLightingConfig, AOConfig } from './lighting.js';

export class ChunkManager {
  /**
   * @param {Object} config
   * @param {number} config.worldSeed - Seed for deterministic generation
   * @param {number} config.chunkSize - Size of each chunk in world units (default: 2000)
   * @param {number} config.loadRadius - Chunks to load in each direction (default: 2)
   * @param {number} config.gridSpacing - Grid spacing for jittered point placement (default: 115)
   * @param {string} config.boundaryMode - Boundary rendering mode: 'none', 'darker', 'biome' (default: 'none')
   * @param {THREE.Group} config.terrainGroup - Parent group for chunk meshes
   * @param {function} config.onLoadProgress - Callback for loading progress (loaded, total)
   * @param {Object} [config.airbaseRegistry] - AirbaseRegistry for terrain flattening
   */
  constructor(config) {
    this.worldSeed = config.worldSeed || 42;
    this.chunkSize = config.chunkSize || 2000;
    this.loadRadius = config.loadRadius || 2;
    this.gridSpacing = config.gridSpacing || 25; // ~6400 cells per 2000x2000 chunk
    this.boundaryMode = config.boundaryMode || BoundaryMode.NONE;
    this.terrainGroup = config.terrainGroup;
    this.onLoadProgress = config.onLoadProgress || null;

    // Airbase registry for terrain flattening
    this.airbaseRegistry = config.airbaseRegistry || null;

    // Active chunks: Map<string, Chunk>
    this.chunks = new Map();

    // Generation queue: [{chunkX, chunkY, priority}]
    this.generationQueue = [];

    // Set to track what's already queued
    this.queuedKeys = new Set();

    // Chunk renderer instance
    this.chunkRenderer = new ChunkRenderer();

    // Worker state
    this.worker = null;
    this.workerReady = false;
    this.pendingRequests = new Map(); // requestId -> { chunkX, chunkY }
    this.inFlightChunks = new Set();  // chunk keys being generated
    this.nextRequestId = 0;

    // Initial loading state
    this.initialLoadTotal = 0;
    this.initialLoadComplete = 0;
    this.isInitialLoading = false;

    // Initialize worker
    this.initWorker();
  }

  /**
   * Initialize the terrain generation worker
   */
  initWorker() {
    try {
      this.worker = new Worker(
        new URL('./worker/TerrainWorker.js', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e) => this.handleWorkerMessage(e);
      this.worker.onerror = (e) => this.handleWorkerError(e);

      // Initialize noise in worker with world seed
      this.worker.postMessage({
        type: 'init',
        payload: { worldSeed: this.worldSeed }
      });
    } catch (error) {
      console.warn('Failed to create terrain worker, falling back to main thread:', error);
      this.worker = null;
      this.workerReady = false;
    }
  }

  /**
   * Handle messages from terrain worker
   */
  handleWorkerMessage(e) {
    const { type, payload } = e.data;

    switch (type) {
      case 'init_complete':
        this.workerReady = true;
        break;

      case 'chunk_ready':
        this.handleChunkReady(payload);
        break;

      case 'chunk_error':
        this.handleChunkError(payload);
        break;
    }
  }

  /**
   * Handle completed chunk from worker
   */
  handleChunkReady({ requestId, chunkX, chunkY, positions, normals, colors, bounds }) {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    const key = `${chunkX},${chunkY}`;

    // Track initial loading progress
    if (this.isInitialLoading) {
      this.initialLoadComplete++;
      if (this.onLoadProgress) {
        this.onLoadProgress(this.initialLoadComplete, this.initialLoadTotal);
      }
      // Check if initial loading is complete
      if (this.initialLoadComplete >= this.initialLoadTotal) {
        this.isInitialLoading = false;
      }
    }

    // Skip if chunk is no longer needed (player moved away)
    if (!this.isChunkStillNeeded(chunkX, chunkY)) {
      this.pendingRequests.delete(requestId);
      this.inFlightChunks.delete(key);
      return;
    }

    // Skip if chunk was already loaded (shouldn't happen, but safety check)
    if (this.chunks.has(key)) {
      this.pendingRequests.delete(requestId);
      this.inFlightChunks.delete(key);
      return;
    }

    // Build mesh from worker buffers
    const chunk = new Chunk(chunkX, chunkY, this.chunkSize);
    this.chunkRenderer.buildFromBuffers(chunk, positions, normals, colors, bounds);

    // Add to scene
    this.terrainGroup.add(chunk.group);
    this.chunks.set(key, chunk);

    // Cleanup tracking
    this.pendingRequests.delete(requestId);
    this.inFlightChunks.delete(key);
  }

  /**
   * Handle worker error for a chunk
   */
  handleChunkError({ requestId, chunkX, chunkY, error }) {
    console.error(`Worker chunk error at (${chunkX}, ${chunkY}):`, error);

    const key = `${chunkX},${chunkY}`;
    this.pendingRequests.delete(requestId);
    this.inFlightChunks.delete(key);

    // Track progress even on error during initial load
    if (this.isInitialLoading) {
      this.initialLoadComplete++;
      if (this.onLoadProgress) {
        this.onLoadProgress(this.initialLoadComplete, this.initialLoadTotal);
      }
    }
  }

  /**
   * Handle worker crash/error
   */
  handleWorkerError(e) {
    console.error('Terrain worker error:', e);

    // Terminate broken worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Clear pending state
    this.pendingRequests.clear();
    this.inFlightChunks.clear();
    this.workerReady = false;

    // Attempt to restart worker
    console.log('Attempting to restart terrain worker...');
    this.initWorker();
  }

  /**
   * Check if a chunk is still needed based on all viewport regions
   * Returns true if the chunk is required by ANY viewport.
   * @param {number} chunkX
   * @param {number} chunkY
   * @returns {boolean}
   */
  isChunkStillNeeded(chunkX, chunkY) {
    // Check against all cached viewport regions
    if (this.lastViewportRegions && this.lastViewportRegions.length > 0) {
      const key = `${chunkX},${chunkY}`;

      for (const region of this.lastViewportRegions) {
        const radius = region.radius ?? this.loadRadius;
        const required = this.getRequiredChunkCoordsForRegion(region.x, region.y, radius);
        if (required.some(c => `${c.chunkX},${c.chunkY}` === key)) {
          return true;
        }
      }
      return false;
    }

    // Fallback: check against legacy player position
    if (this.lastPlayerX === undefined) return true;

    const required = this.getRequiredChunkCoords(this.lastPlayerX, this.lastPlayerY);
    const key = `${chunkX},${chunkY}`;
    return required.some(c => `${c.chunkX},${c.chunkY}` === key);
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
    return this.getRequiredChunkCoordsForRegion(playerX, playerY, this.loadRadius);
  }

  /**
   * Get chunk coordinates within a radius of a world position
   * Generalized version that accepts custom radius for multi-viewport support
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @param {number} [radius=this.loadRadius] - Chunk radius to load
   * @returns {Array<{chunkX: number, chunkY: number}>}
   */
  getRequiredChunkCoordsForRegion(worldX, worldY, radius = this.loadRadius) {
    const { chunkX: cx, chunkY: cy } = this.getPlayerChunk(worldX, worldY);
    const required = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        required.push({ chunkX: cx + dx, chunkY: cy + dy });
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
    return this.calculatePriorityForRegion(chunkX, chunkY, playerChunkX, playerChunkY, 1, playerHeading);
  }

  /**
   * Calculate priority for chunk relative to a viewport region
   * Lower priority = load first. Player viewport (priority=1) gets directional bias.
   * @param {number} chunkX - Chunk X coordinate
   * @param {number} chunkY - Chunk Y coordinate
   * @param {number} regionChunkX - Viewport center chunk X
   * @param {number} regionChunkY - Viewport center chunk Y
   * @param {number} regionPriority - Viewport priority (1=highest, higher=lower priority)
   * @param {number} [playerHeading] - Player heading for directional bias (only used for priority=1)
   * @returns {number} Priority score (lower = load first)
   */
  calculatePriorityForRegion(chunkX, chunkY, regionChunkX, regionChunkY, regionPriority, playerHeading) {
    // Vector from region center to chunk
    const dx = chunkX - regionChunkX;
    const dy = chunkY - regionChunkY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Directional bias only for player viewport (priority=1)
    let directionalBonus = 0;
    if (regionPriority === 1 && playerHeading !== undefined) {
      const headingX = Math.sin(playerHeading);
      const headingY = Math.cos(playerHeading);
      const length = distance || 1;
      const dot = (dx * headingX + dy * headingY) / length;
      directionalBonus = -dot * 1.5; // Negative = higher priority for chunks ahead
    }

    // Combine: distance + directional bonus + viewport priority weight
    // regionPriority=1 adds 0, regionPriority=2 adds 5, etc.
    return distance + directionalBonus + (regionPriority - 1) * 5;
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
   * Process the generation queue, dispatching to worker
   * @param {number} maxChunks - Maximum chunks to dispatch this frame
   */
  processGenerationQueue(maxChunks = 4) {
    // Don't process if worker isn't ready
    if (!this.worker || !this.workerReady) return;

    let dispatched = 0;

    while (dispatched < maxChunks && this.generationQueue.length > 0) {
      const { chunkX, chunkY } = this.generationQueue.shift();
      const key = `${chunkX},${chunkY}`;

      // Remove from queued set
      this.queuedKeys.delete(key);

      // Skip if already loaded or in-flight
      if (this.chunks.has(key) || this.inFlightChunks.has(key)) continue;

      // Load the chunk via worker
      this.loadChunk(chunkX, chunkY);
      dispatched++;
    }
  }

  /**
   * Get chunk bounds as [minX, minZ, maxX, maxZ]
   * @param {number} chunkX
   * @param {number} chunkY
   * @returns {Array}
   */
  getChunkBounds(chunkX, chunkY) {
    return [
      chunkX * this.chunkSize,
      chunkY * this.chunkSize,
      (chunkX + 1) * this.chunkSize,
      (chunkY + 1) * this.chunkSize
    ];
  }

  /**
   * Load a specific chunk via worker
   * @param {number} chunkX
   * @param {number} chunkY
   */
  loadChunk(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;

    // Skip if already loaded or being generated
    if (this.chunks.has(key) || this.inFlightChunks.has(key)) {
      return;
    }

    // Skip if worker not ready
    if (!this.worker || !this.workerReady) {
      return;
    }

    // Track in-flight request
    this.inFlightChunks.add(key);

    const requestId = this.nextRequestId++;

    // Get flatten zones from airbase registry if available
    let flattenZones = [];
    if (this.airbaseRegistry) {
      const bounds = this.getChunkBounds(chunkX, chunkY);
      const airbases = this.airbaseRegistry.getAirbasesInBounds(bounds);
      flattenZones = airbases.map(ab => ab.flattenZone.serialize());
    }

    // Dispatch to worker
    this.worker.postMessage({
      type: 'generate',
      payload: {
        requestId,
        chunkX,
        chunkY,
        chunkSize: this.chunkSize,
        gridSpacing: this.gridSpacing,
        aoConfig: { ...AOConfig },
        flattenZones
      }
    });

    this.pendingRequests.set(requestId, { chunkX, chunkY });
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
   * Initialize chunks at a position (async via worker)
   * Queues all required chunks with priority-based ordering (closest first)
   * @param {number} playerX
   * @param {number} playerY
   */
  initializeAtPosition(playerX, playerY) {
    // Cache player position
    this.lastPlayerX = playerX;
    this.lastPlayerY = playerY;

    const required = this.getRequiredChunkCoords(playerX, playerY);
    const { chunkX: pcx, chunkY: pcy } = this.getPlayerChunk(playerX, playerY);

    // Set up initial loading state for progress tracking
    this.initialLoadTotal = required.length;
    this.initialLoadComplete = 0;
    this.isInitialLoading = true;

    // Queue all chunks with priority (closest to player first)
    for (const { chunkX, chunkY } of required) {
      const priority = this.calculatePriority(chunkX, chunkY, pcx, pcy, 0); // heading 0 for initial load
      this.enqueue(chunkX, chunkY, priority);
    }

    // Sort by priority and start dispatching
    this.generationQueue.sort((a, b) => a.priority - b.priority);

    // Dispatch all chunks immediately (worker will process them)
    this.processGenerationQueue(required.length);

    // Fire initial progress callback
    if (this.onLoadProgress) {
      this.onLoadProgress(0, this.initialLoadTotal);
    }
  }

  /**
   * Check if initial loading is still in progress
   * @returns {boolean}
   */
  isLoading() {
    return this.isInitialLoading;
  }

  /**
   * Get loading progress as a fraction [0, 1]
   * @returns {number}
   */
  getLoadProgress() {
    if (this.initialLoadTotal === 0) return 1;
    return this.initialLoadComplete / this.initialLoadTotal;
  }

  /**
   * Update chunk system: load/unload chunks based on viewport regions
   * Supports multiple viewports - chunks visible in any viewport stay loaded.
   *
   * @param {Array<{x: number, y: number, radius?: number, priority?: number, id?: string}>} viewportRegions
   *   Array of viewport regions, each with:
   *   - x, y: World coordinates (center of viewport)
   *   - radius: Chunk radius to load (default: this.loadRadius)
   *   - priority: Load priority, 1=highest (default: 1)
   *   - id: Optional identifier for debugging
   * @param {number} playerHeading - Heading in radians (for directional priority)
   * @param {number} deltaTime - Time since last frame (unused but available)
   */
  update(viewportRegions, playerHeading, deltaTime) {
    // Validate input - require at least one viewport region
    if (!Array.isArray(viewportRegions) || viewportRegions.length === 0) {
      return;
    }

    // Cache all viewport regions for isChunkStillNeeded()
    this.lastViewportRegions = viewportRegions;

    // Legacy compatibility: cache first region as "player" position
    this.lastPlayerX = viewportRegions[0].x;
    this.lastPlayerY = viewportRegions[0].y;

    // Collect all required chunks from all viewports
    const requiredKeys = new Set();
    const chunkPriorities = new Map(); // key -> best (lowest) priority

    for (const region of viewportRegions) {
      const radius = region.radius ?? this.loadRadius;
      const regionPriority = region.priority ?? 1;
      const chunks = this.getRequiredChunkCoordsForRegion(region.x, region.y, radius);
      const { chunkX: rcx, chunkY: rcy } = this.getPlayerChunk(region.x, region.y);

      for (const { chunkX, chunkY } of chunks) {
        const key = `${chunkX},${chunkY}`;
        requiredKeys.add(key);

        // Track best (lowest) priority for this chunk
        const chunkPriority = this.calculatePriorityForRegion(
          chunkX, chunkY, rcx, rcy, regionPriority, playerHeading
        );
        const existing = chunkPriorities.get(key) ?? Infinity;
        chunkPriorities.set(key, Math.min(existing, chunkPriority));
      }
    }

    // Unload chunks no longer needed by ANY viewport
    for (const [key] of this.chunks) {
      if (!requiredKeys.has(key)) {
        this.unloadChunk(key);
      }
    }

    // Cancel in-flight chunks that are no longer needed
    for (const key of this.inFlightChunks) {
      if (!requiredKeys.has(key)) {
        this.inFlightChunks.delete(key);
        // Note: worker will still complete, but result will be discarded in handleChunkReady
      }
    }

    // Queue chunks that need loading (with merged priorities)
    for (const key of requiredKeys) {
      if (!this.chunks.has(key) && !this.isQueued(key) && !this.inFlightChunks.has(key)) {
        const [cx, cy] = key.split(',').map(Number);
        this.enqueue(cx, cy, chunkPriorities.get(key));
      }
    }

    // Sort queue by priority and process
    this.generationQueue.sort((a, b) => a.priority - b.priority);
    this.processGenerationQueue(4);
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
