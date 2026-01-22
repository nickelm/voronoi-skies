# Voronoi Skies: Terrain Erosion and River Systems Specification

**Version:** 1.0  
**Purpose:** Define the procedural erosion system that produces geologically plausible terrain with coherent drainage, river networks, and erosion-shaped landforms.

---

## 1. Problem Statement

### 1.1 Current Limitations

The existing terrain generation produces continental shapes via noise functions, but water bodies are simply "wherever elevation < 0". This creates:

- Lakes that are arbitrary low spots in noise fields
- No river valleys connecting highlands to ocean
- Coastlines that don't reflect erosion patterns
- Mountain ranges without drainage structure
- Terrain that looks procedural rather than geological

### 1.2 Desired Outcome

Terrain that appears shaped by water over geological time:

- **V-shaped valleys** radiating from peaks toward lowlands
- **River networks** with tributaries joining into larger streams
- **Sediment deposits** in valleys and deltas
- **Erosion-carved coastlines** with bays where rivers meet ocean
- **Alluvial fans** where mountain streams reach plains
- **Ridgelines** between drainage basins

---

## 2. Design Constraints

### 2.1 Chunk-Local Generation

The system must work within the existing chunk architecture:

- Each chunk generates independently (no inter-chunk communication during generation)
- Results must be deterministic from world seed + chunk coordinates
- Generation happens in web workers (no DOM access)
- Must maintain 60fps with smooth chunk loading

### 2.2 Scale Considerations

Voronoi Skies operates at aircraft scale:

- Chunk size: 2000 world units (feet)
- View distance: 5+ chunks in each direction (22,000+ feet visible)
- Player altitude: 100 to 40,000 feet
- Rivers must be visible from cruise altitude (~10,000 feet)

### 2.3 Performance Budget

- Regional erosion computation: acceptable to take 100-500ms on first access (cached)
- Per-chunk sampling of erosion data: < 5ms
- Memory: regions can be cached but must be evictable

---

## 3. Architecture Overview

### 3.1 Two-Tier Approach

```
+-------------------------------------------------------------+
|                    REGIONAL LAYER                           |
|  Coarse grid (500 unit spacing), covers 64,000x64,000 units |
|  - Hydraulic erosion simulation                             |
|  - Flow accumulation (river intensity)                      |
|  - Drainage directions                                      |
|  - Sediment deposition                                      |
|  Generated once per region, cached                          |
+-------------------------------------------------------------+
                              |
                     bilinear sampling
                              v
+-------------------------------------------------------------+
|                     CHUNK LAYER                             |
|  Fine grid (25 unit spacing), 2000x2000 units per chunk     |
|  - Sample regional erosion data                             |
|  - Add high-frequency detail noise                          |
|  - Carve river channels where flow > threshold              |
|  - Existing biome/color logic                               |
+-------------------------------------------------------------+
```

### 3.2 Data Flow

```
World Seed
    |
    v
Regional Erosion Generator
    |
    v
+-----------------------------+
| RegionData                  |
|  - elevation: Float32Array  |  (eroded heightfield)
|  - flow: Float32Array       |  (accumulated water flow)
|  - sediment: Float32Array   |  (deposited material)
|  - drainage: Float32Array   |  (direction to outflow)
+-----------------------------+
    |
    v
Chunk Generator (existing, modified)
    |
    v
Chunk mesh with rivers carved in
```

---

## 4. Regional Erosion System

### 4.1 Region Definition

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Cell size | 500 world units | Coarse enough for fast simulation, fine enough for visible rivers |
| Region size | 128x128 cells | 64,000x64,000 world units, covers ~32x32 chunks |
| Overlap/halo | 8 cells | Ensures boundary continuity |

Region coordinates derived from world position:
```javascript
regionX = Math.floor(worldX / (cellSize * regionSize))
regionY = Math.floor(worldY / (cellSize * regionSize))
```

### 4.2 Hydraulic Erosion Algorithm

The droplet-based erosion simulation:

```
For each iteration (many thousands):
  1. Spawn droplet at random position (seeded RNG)
  2. Droplet carries: position, velocity, water, sediment
  3. While droplet has water and is moving:
     a. Compute gradient at current position
     b. Update velocity (blend old direction + gradient)
     c. Move droplet by velocity
     d. Compute carrying capacity = velocity * water * capacityFactor
     e. If sediment > capacity: deposit (sediment - capacity) * depositRate
     f. If sediment < capacity: erode (capacity - sediment) * erosionRate
     g. Evaporate water: water *= (1 - evaporationRate)
  4. When droplet stops: deposit remaining sediment
```

### 4.3 Erosion Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| iterations | 200,000 | Total droplets per region |
| erosionRate | 0.3 | How fast droplets pick up sediment |
| depositionRate | 0.3 | How fast droplets drop sediment |
| evaporationRate | 0.02 | Water loss per step |
| gravity | 4.0 | Acceleration down slope |
| inertia | 0.05 | How much droplet resists direction change |
| capacityFactor | 4.0 | Base carrying capacity multiplier |
| minSlope | 0.01 | Minimum slope for erosion |
| maxDropletLifetime | 100 | Steps before forced termination |
| erosionRadius | 3 | Cells affected by each erosion event |

### 4.4 Flow Accumulation

After erosion, compute cumulative flow for river detection:

```
1. Sort all cells by elevation (high to low)
2. For each cell in sorted order:
   a. Add rainfall (constant or from moisture field)
   b. Find lowest neighbor
   c. Add this cell's flow to that neighbor
   d. Record drainage direction
3. River exists where flow > riverThreshold
```

### 4.5 Output Data Structure

```javascript
{
  // Grid dimensions
  width: 128,
  height: 128,
  cellSize: 500,
  
  // World-space bounds
  bounds: { minX, minY, maxX, maxY },
  
  // Per-cell data (Float32Array, row-major)
  elevation: Float32Array,    // Post-erosion height [-1, 1] normalized
  flow: Float32Array,         // Accumulated flow (0 to very large)
  sediment: Float32Array,     // Deposited sediment (modifies soil/biome)
  drainageAngle: Float32Array // Direction to outflow (radians)
}
```

---

## 5. Chunk Integration

### 5.1 Sampling Regional Data

Each chunk samples the regional erosion data via bilinear interpolation:

```javascript
function sampleRegion(region, worldX, worldY) {
  // Convert world coords to region-local cell coords
  const localX = (worldX - region.bounds.minX) / region.cellSize;
  const localY = (worldY - region.bounds.minY) / region.cellSize;
  
  // Bilinear interpolation
  return {
    elevation: bilinearSample(region.elevation, localX, localY, region.width),
    flow: bilinearSample(region.flow, localX, localY, region.width),
    sediment: bilinearSample(region.sediment, localX, localY, region.width),
    drainageAngle: bilinearSample(region.drainageAngle, localX, localY, region.width)
  };
}
```

### 5.2 Modified Elevation Computation

Replace current `computeElevation()` with erosion-aware version:

```javascript
function computeElevationWithErosion(x, y, regionalData) {
  // Sample eroded base elevation from region
  const regional = sampleRegion(regionalData, x, y);
  
  // Add high-frequency detail (existing local noise, reduced amplitude)
  const detail = local(x, y) * 0.05;  // Reduced from current amplitude
  
  // Combine: regional shape + local texture
  let elevation = regional.elevation + detail;
  
  // Carve river channels where flow is significant
  if (regional.flow > RIVER_THRESHOLD) {
    const riverDepth = computeRiverDepth(regional.flow);
    const riverWidth = computeRiverWidth(regional.flow);
    // V-shaped channel profile
    elevation -= riverDepth * riverProfile(distanceToRiverCenter, riverWidth);
  }
  
  return elevation;
}
```

### 5.3 River Channel Geometry

Rivers are carved into the terrain mesh, not rendered as separate geometry:

```javascript
// River depth scales with log of flow (diminishing returns for huge rivers)
function computeRiverDepth(flow) {
  const normalizedFlow = Math.log10(flow / RIVER_THRESHOLD + 1);
  return Math.min(MAX_RIVER_DEPTH, normalizedFlow * RIVER_DEPTH_SCALE);
}

// River width also scales with log of flow
function computeRiverWidth(flow) {
  const normalizedFlow = Math.log10(flow / RIVER_THRESHOLD + 1);
  return Math.min(MAX_RIVER_WIDTH, normalizedFlow * RIVER_WIDTH_SCALE);
}

// V-shaped profile: deepest at center, slopes up to banks
function riverProfile(distanceFromCenter, width) {
  const t = Math.abs(distanceFromCenter) / (width / 2);
  if (t >= 1) return 0;  // Outside river
  return 1 - t;  // Linear V profile (could use smoothstep for U-shape)
}
```

### 5.4 River Water Plane

Rivers need water surface rendering:

- Water plane elevation = terrain elevation at river center + small offset
- Follow river path (not flat like ocean)
- Width matches carved channel
- Rendered as elongated quads along river path, or as part of existing water system

---

## 6. Biome Modifications

### 6.1 Sediment Influence

Deposited sediment affects biome selection:

| Sediment Level | Effect |
|----------------|--------|
| Low | No change (bedrock/normal soil) |
| Medium | Richer soil -> more vegetation (forest bias) |
| High | Alluvial plains -> grassland/farmland bias |
| River delta | Wetland/marsh biome |

### 6.2 Flow Influence

High flow areas (even below river threshold) indicate:

- Valley floors -> different vegetation
- Higher moisture -> forest over shrubland
- Potential wetlands in flat high-flow areas

---

## 7. Implementation Phases

### Phase 1: Regional Erosion Infrastructure

**Goal:** Create the regional erosion system that generates and caches eroded heightfields.

**Files to create:**
```
src/terrain/erosion/
  RegionalErosion.js      # Main class, manages region cache
  HydraulicErosion.js     # Droplet simulation algorithm
  FlowAccumulation.js     # Compute drainage network
  RegionCache.js          # LRU cache for computed regions
```

**Tasks:**
1. Create `HydraulicErosion.js` with droplet simulation
2. Create `FlowAccumulation.js` for drainage computation
3. Create `RegionalErosion.js` that orchestrates generation
4. Create `RegionCache.js` with LRU eviction
5. Add unit tests for erosion on small test heightfield

**Acceptance criteria:**
- Given a flat heightfield with one peak, erosion creates radial valleys
- Flow accumulation correctly identifies drainage to edges
- Deterministic: same seed produces identical results

### Phase 2: Worker Integration

**Goal:** Run regional erosion in web worker, integrate with chunk generation.

**Files to modify:**
```
src/terrain/worker/TerrainWorker.js  # Add regional erosion
src/terrain/noise.js                  # Add erosion sampling to elevation
```

**Tasks:**
1. Initialize `RegionalErosion` in worker on `init` message
2. Before generating chunk, ensure region is computed/cached
3. Modify `getElevation()` to sample regional erosion data
4. Pass flow data through to chunk for river detection

**Acceptance criteria:**
- Chunks near region boundaries stitch seamlessly
- No visible discontinuities at region edges
- Performance: region generation < 500ms, chunk generation unchanged

### Phase 3: River Channels

**Goal:** Carve visible river channels into terrain geometry.

**Files to modify:**
```
src/terrain/worker/TerrainWorker.js  # River carving in mesh
src/terrain/ChunkRenderer.js         # River water rendering
```

**Tasks:**
1. Detect river cells (flow > threshold) during chunk generation
2. Compute river centerline from drainage directions
3. Carve V-channel into vertex elevations
4. Generate river water plane geometry (or extend existing water system)
5. Handle river entry/exit at chunk boundaries

**Acceptance criteria:**
- Rivers visible from 10,000 feet altitude
- Rivers flow continuously across chunk boundaries
- River width increases downstream (visible tributary joining)

### Phase 4: Biome and Visual Polish

**Goal:** Integrate erosion data into biome selection and visual quality.

**Files to modify:**
```
src/terrain/biomes.js        # Sediment/flow influence
src/terrain/noise.js         # Moisture from drainage
```

**Tasks:**
1. Add sediment factor to biome selection
2. Modify moisture field to account for drainage proximity
3. Add valley floor biome variants
4. Tune river depth/width parameters for visual quality
5. Add optional thermal erosion pass for talus slopes

**Acceptance criteria:**
- River valleys have distinct vegetation
- Sediment deposits visible as color variation
- Mountain terrain looks weathered, not blobby

### Phase 5: Performance and Edge Cases

**Goal:** Optimize and handle edge cases.

**Tasks:**
1. Profile regional erosion, optimize hot paths
2. Implement region cache eviction under memory pressure
3. Handle player at region boundaries (preload adjacent regions)
4. Test at extreme coordinates (numerical stability)
5. Add debug visualization for flow/drainage

**Acceptance criteria:**
- Smooth flight across region boundaries
- Memory usage bounded (configurable cache size)
- No hitches during region generation (background loading)

---

## 8. File Structure

Final organization within the project:

```
src/terrain/
  erosion/
    RegionalErosion.js      # Region management and caching
    HydraulicErosion.js     # Droplet erosion simulation
    FlowAccumulation.js     # Drainage network computation
    ThermalErosion.js       # Optional: talus/scree simulation
    ErosionConfig.js        # Tunable parameters
  worker/
    TerrainWorker.js        # Modified to use erosion
  ChunkManager.js           # Unchanged (manages chunk lifecycle)
  ChunkGenerator.js         # Modified to sample erosion
  ChunkRenderer.js          # Modified for river water
  noise.js                  # Modified elevation functions
  biomes.js                 # Modified for sediment influence
```

---

## 9. Algorithm Details

### 9.1 Hydraulic Erosion Pseudocode

```javascript
function simulateHydraulicErosion(heightfield, config, rng) {
  const { width, height } = heightfield;
  const sedimentMap = new Float32Array(width * height);
  
  for (let i = 0; i < config.iterations; i++) {
    // Spawn droplet at random position
    let x = rng() * (width - 1);
    let y = rng() * (height - 1);
    let dx = 0, dy = 0;  // Velocity
    let water = 1;
    let sediment = 0;
    
    for (let step = 0; step < config.maxDropletLifetime; step++) {
      const cellX = Math.floor(x);
      const cellY = Math.floor(y);
      
      // Compute gradient via bilinear interpolation of neighbors
      const gradient = computeGradient(heightfield, x, y);
      
      // Update velocity (inertia blends old direction with gradient)
      dx = dx * config.inertia - gradient.x * (1 - config.inertia);
      dy = dy * config.inertia - gradient.y * (1 - config.inertia);
      
      // Normalize and scale by gravity
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }
      
      // Move droplet
      const newX = x + dx;
      const newY = y + dy;
      
      // Check bounds
      if (newX < 0 || newX >= width - 1 || newY < 0 || newY >= height - 1) {
        break;  // Droplet left the map
      }
      
      // Height difference (positive = downhill)
      const oldHeight = sampleHeight(heightfield, x, y);
      const newHeight = sampleHeight(heightfield, newX, newY);
      const deltaHeight = oldHeight - newHeight;
      
      // Carrying capacity based on slope and water
      const capacity = Math.max(deltaHeight, config.minSlope) 
                       * water * config.capacityFactor;
      
      if (sediment > capacity) {
        // Deposit excess sediment
        const deposit = (sediment - capacity) * config.depositionRate;
        sediment -= deposit;
        depositSediment(heightfield, sedimentMap, x, y, deposit);
      } else {
        // Erode terrain
        const erode = Math.min(
          (capacity - sediment) * config.erosionRate,
          deltaHeight  // Don't erode below destination
        );
        sediment += erode;
        erodeTerrain(heightfield, x, y, erode, config.erosionRadius);
      }
      
      // Move to new position
      x = newX;
      y = newY;
      
      // Evaporate water
      water *= (1 - config.evaporationRate);
      
      if (water < 0.01) break;  // Droplet dried up
    }
    
    // Deposit remaining sediment
    if (sediment > 0) {
      depositSediment(heightfield, sedimentMap, x, y, sediment);
    }
  }
  
  return { heightfield, sedimentMap };
}
```

### 9.2 Flow Accumulation Pseudocode

```javascript
function computeFlowAccumulation(heightfield, rainfall = 1) {
  const { width, height } = heightfield;
  const flow = new Float32Array(width * height).fill(rainfall);
  const drainage = new Float32Array(width * height);
  
  // Create sorted index list (highest to lowest elevation)
  const indices = [];
  for (let i = 0; i < width * height; i++) {
    indices.push(i);
  }
  indices.sort((a, b) => heightfield[b] - heightfield[a]);
  
  // Process cells from highest to lowest
  for (const idx of indices) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    // Find lowest neighbor
    let lowestNeighbor = -1;
    let lowestHeight = heightfield[idx];
    let lowestAngle = 0;
    
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        if (nx === x && ny === y) continue;
        const nidx = ny * width + nx;
        if (heightfield[nidx] < lowestHeight) {
          lowestHeight = heightfield[nidx];
          lowestNeighbor = nidx;
          lowestAngle = Math.atan2(ny - y, nx - x);
        }
      }
    }
    
    // Transfer flow to lowest neighbor
    if (lowestNeighbor >= 0) {
      flow[lowestNeighbor] += flow[idx];
      drainage[idx] = lowestAngle;
    }
  }
  
  return { flow, drainage };
}
```

---

## 10. Tuning Guidelines

### 10.1 Erosion Strength

| Terrain Goal | iterations | erosionRate | depositionRate |
|--------------|------------|-------------|----------------|
| Subtle weathering | 50,000 | 0.2 | 0.3 |
| Moderate valleys | 200,000 | 0.3 | 0.3 |
| Deep canyons | 500,000 | 0.5 | 0.2 |

### 10.2 River Visibility

| Parameter | Small streams | Medium rivers | Large rivers |
|-----------|---------------|---------------|--------------|
| RIVER_THRESHOLD | 100 | 500 | 2000 |
| RIVER_DEPTH_SCALE | 0.01 | 0.02 | 0.03 |
| RIVER_WIDTH_SCALE | 50 | 100 | 200 |
| MAX_RIVER_DEPTH | 0.05 | 0.1 | 0.15 |
| MAX_RIVER_WIDTH | 200 | 500 | 1000 |

### 10.3 Visual Quality Checklist

- [ ] Valleys converge toward lowlands (not random directions)
- [ ] Rivers widen downstream
- [ ] Mountain peaks have radial drainage pattern
- [ ] Flat areas have sediment deposits (subtle color shift)
- [ ] Coastlines have river mouths (bays)
- [ ] No visible grid artifacts in erosion patterns
- [ ] Chunk boundaries invisible

---

## 11. Future Extensions

### 11.1 Thermal Erosion

Simulates rockfall and talus accumulation:

- Material moves from steep slopes to gentler slopes below
- Creates scree fields at cliff bases
- Rounds peaks over time

### 11.2 Coastal Erosion

Simulates wave action:

- Cliffs where rock meets ocean
- Beaches in sheltered bays
- Sea stacks and arches (feature stamps)

### 11.3 Glacial Features

For high-altitude terrain:

- U-shaped valleys (different from V-shaped river valleys)
- Cirques at valley heads
- Moraines as depositional features

### 11.4 Library Extraction

Once working in Voronoi Skies:

1. Identify project-specific vs. generic code
2. Extract generic erosion/flow algorithms to `@niklas/procworld`
3. Create configuration interfaces for different use cases
4. Add heightfield and voxel output adapters

---

## 12. References

### 12.1 Algorithm Sources

- Beyer, Hans Theobald. "Implementation of a method for hydraulic erosion." (2015)
- Stava et al. "Interactive Terrain Modeling Using Hydraulic Erosion." (2008)

### 12.2 Implementation References

- TinyErode: https://github.com/tay10r/TinyErode
- terrain-erosion-3-ways: https://github.com/dandrino/terrain-erosion-3-ways
- Sebastian Lague's erosion tutorials (Unity, but algorithm is portable)

### 12.3 Related Project Specifications

- `spec-flight-model.md` - terrain collision and masking
- `spec-voronoi-viewport-implementation.md` - rendering architecture
- `voronoi-skies-gdd.md` - terrain visual design goals

---

*Specification version 1.0*
*Voronoi Skies Terrain Erosion System*
*Water shapes the land; the land tells the story*