/**
 * AirbaseRenderer - Manages runway mesh and PAPI light rendering
 *
 * Adds and removes runway visual elements as chunks load/unload.
 * Also handles per-frame PAPI light updates.
 */

import { RunwayMesh } from './RunwayMesh.js';
import { PAPILights } from './PAPILights.js';

export class AirbaseRenderer {
  /**
   * @param {Object} airbaseRegistry - AirbaseRegistry instance
   * @param {THREE.Group} terrainGroup - Parent group for runway meshes
   */
  constructor(airbaseRegistry, terrainGroup) {
    this.airbaseRegistry = airbaseRegistry;
    this.terrainGroup = terrainGroup;

    // Track rendered airbases: Map<airbaseId, {runway: RunwayMesh, papi: PAPILights}>
    this.renderedAirbases = new Map();

    // Track which chunks have been processed
    this.processedChunks = new Set();
  }

  /**
   * Process a newly loaded chunk - add runway meshes for any airbases in bounds
   * @param {number} chunkX
   * @param {number} chunkY
   * @param {number} chunkSize
   */
  onChunkLoaded(chunkX, chunkY, chunkSize = 2000) {
    const chunkKey = `${chunkX},${chunkY}`;

    // Skip if already processed
    if (this.processedChunks.has(chunkKey)) {
      return;
    }

    this.processedChunks.add(chunkKey);

    // Get airbases in this chunk
    const airbases = this.airbaseRegistry.getAirbasesInChunk(chunkX, chunkY, chunkSize);

    for (const airbase of airbases) {
      // Skip if already rendered
      if (this.renderedAirbases.has(airbase.id)) {
        continue;
      }

      // Check if runway center is in this chunk (to avoid duplicate rendering)
      const runwayCenterChunkX = Math.floor(airbase.position.x / chunkSize);
      const runwayCenterChunkY = Math.floor(airbase.position.z / chunkSize);

      if (runwayCenterChunkX === chunkX && runwayCenterChunkY === chunkY) {
        this.addAirbase(airbase);
      }
    }
  }

  /**
   * Process a chunk being unloaded
   * Note: We don't remove airbases on chunk unload because the runway may span
   * multiple chunks. Instead, we track by airbase position.
   * @param {number} chunkX
   * @param {number} chunkY
   */
  onChunkUnloaded(chunkX, chunkY) {
    const chunkKey = `${chunkX},${chunkY}`;
    this.processedChunks.delete(chunkKey);

    // Check if any rendered airbases are centered in this chunk
    const chunkSize = 2000;
    for (const [airbaseId, renderData] of this.renderedAirbases) {
      const airbase = this.airbaseRegistry.getAirbaseById(airbaseId);
      if (!airbase) continue;

      const centerChunkX = Math.floor(airbase.position.x / chunkSize);
      const centerChunkY = Math.floor(airbase.position.z / chunkSize);

      if (centerChunkX === chunkX && centerChunkY === chunkY) {
        this.removeAirbase(airbaseId);
      }
    }
  }

  /**
   * Add runway mesh and PAPI lights for an airbase
   * @param {Object} airbase - Airbase instance
   */
  addAirbase(airbase) {
    if (this.renderedAirbases.has(airbase.id)) {
      return;
    }

    // Create runway mesh
    const runway = new RunwayMesh(airbase);
    this.terrainGroup.add(runway.group);

    // Create PAPI lights
    const papi = new PAPILights(airbase);
    this.terrainGroup.add(papi.group);

    // Store references
    this.renderedAirbases.set(airbase.id, { runway, papi, airbase });

    console.log(`AirbaseRenderer: Added ${airbase.name} (${airbase.getRunwayDesignator()})`);
  }

  /**
   * Remove runway mesh and PAPI lights for an airbase
   * @param {string} airbaseId
   */
  removeAirbase(airbaseId) {
    const renderData = this.renderedAirbases.get(airbaseId);
    if (!renderData) return;

    // Dispose runway
    if (renderData.runway) {
      renderData.runway.dispose();
    }

    // Dispose PAPI
    if (renderData.papi) {
      renderData.papi.dispose();
    }

    this.renderedAirbases.delete(airbaseId);
    console.log(`AirbaseRenderer: Removed airbase ${airbaseId}`);
  }

  /**
   * Update PAPI lights based on aircraft position
   * Call this every frame
   * @param {number} aircraftX
   * @param {number} aircraftZ
   * @param {number} aircraftAltitude
   */
  updatePAPILights(aircraftX, aircraftZ, aircraftAltitude) {
    for (const [, renderData] of this.renderedAirbases) {
      if (renderData.papi) {
        renderData.papi.updateColors(aircraftX, aircraftZ, aircraftAltitude);
      }
    }
  }

  /**
   * Get glideslope status for nearest airbase
   * @param {number} aircraftX
   * @param {number} aircraftZ
   * @param {number} aircraftAltitude
   * @returns {{airbase: Object, status: string, distance: number}|null}
   */
  getNearestGlideslopeStatus(aircraftX, aircraftZ, aircraftAltitude) {
    const nearest = this.airbaseRegistry.getNearestAirbase(aircraftX, aircraftZ);
    if (!nearest) return null;

    const renderData = this.renderedAirbases.get(nearest.airbase.id);
    if (!renderData || !renderData.papi) {
      return {
        airbase: nearest.airbase,
        status: 'NOT RENDERED',
        distance: nearest.distance
      };
    }

    return {
      airbase: nearest.airbase,
      status: renderData.papi.getGlideslopeStatus(aircraftX, aircraftZ, aircraftAltitude),
      distance: nearest.distance
    };
  }

  /**
   * Get count of rendered airbases
   * @returns {number}
   */
  getRenderedCount() {
    return this.renderedAirbases.size;
  }

  /**
   * Dispose all rendered airbases
   */
  dispose() {
    for (const [airbaseId] of this.renderedAirbases) {
      this.removeAirbase(airbaseId);
    }
    this.processedChunks.clear();
  }
}
