# Terrain Generation Specification: Island Geography

**Version:** 2.0  
**Purpose:** Define a discrete polygon-based island generation system. Game-agnostic—usable by Voronoi Skies, GolemCraft, or other projects.

---

## 1. Core Abstraction

An island is a **graph of geographic regions** derived from Voronoi tessellation. The graph captures topology (adjacency, drainage, coastlines) while remaining agnostic to rendering approach.

### 1.1 Data Model

```
IslandGraph
├── regions: Region[]       # Voronoi polygons
├── edges: Edge[]           # Boundaries between regions
├── corners: Corner[]       # Vertices where regions meet
├── bounds: AABB            # World-space extent
└── spatialIndex: R-tree    # Fast point-in-polygon lookup
```

**Region** (polygon):
| Field | Type | Description |
|-------|------|-------------|
| id | int | Unique identifier |
| centroid | vec2 | Center point |
| vertices | vec2[] | Polygon boundary (CCW order) |
| elevation | float | Mean elevation [-1, 1] |
| moisture | float | [0, 1] |
| biome | enum | Derived from elevation × moisture |
| isOcean | bool | elevation < SEA_LEVEL |
| neighbors | int[] | Adjacent region IDs |

**Edge** (boundary):
| Field | Type | Description |
|-------|------|-------------|
| id | int | Unique identifier |
| regions | [int, int] | Adjacent region IDs (or -1 for border) |
| corners | [int, int] | Endpoint corner IDs |
| isCoastline | bool | Land on one side, ocean on other |
| isRiver | bool | River flows along this edge |
| riverFlow | float | Accumulated flow volume |

**Corner** (vertex):
| Field | Type | Description |
|-------|------|-------------|
| id | int | Unique identifier |
| position | vec2 | World-space location |
| elevation | float | Point elevation |
| downslope | int | Corner ID of steepest descent (-1 if none) |
| watershed | int | Region ID this drains to |

### 1.2 Design Principles

1. **Separation of geography and rendering**: The graph describes *what* the terrain is, not *how* to draw it
2. **Deterministic from seed**: Same seed + parameters = identical island
3. **Serializable**: Full graph can be saved/loaded as JSON
4. **Queryable**: Fast point-in-region and region-in-bounds lookups
5. **Game-agnostic**: No strategic or gameplay properties in base model

---

## 2. Generation Pipeline

### 2.1 Overview

```
Input: seed, radius, regionCount, template
                    │
                    ▼
        ┌─────────────────────┐
        │  Point Distribution │
        │  (scatter + Lloyd)  │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  Voronoi Construction│
        │  (regions, edges,   │
        │   corners)          │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  Elevation Assignment│
        │  (noise + island    │
        │   mask)             │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  Ocean/Land         │
        │  Classification     │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  River Generation   │
        │  (drainage graph)   │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  Moisture           │
        │  Propagation        │
        └──────────┬──────────┘
                   ▼
        ┌─────────────────────┐
        │  Biome Assignment   │
        └──────────┬──────────┘
                   ▼
Output: IslandGraph
```

### 2.2 Point Distribution

Scatter points, then relax for organic spacing.

**Input**: bounds, count, seed  
**Output**: vec2[] points

```
1. Generate `count` random points within circular bounds
2. Add `boundaryCount` points along perimeter (forced ocean)
3. Lloyd relaxation ×2:
   a. Build Voronoi from current points
   b. Move each point to its cell's centroid
   c. Clamp boundary points to perimeter
```

Lloyd iterations trade regularity for organic feel:

| Iterations | Character |
|------------|-----------|
| 0 | Chaotic, uneven cell sizes |
| 1 | Somewhat regular, still organic |
| 2 | Even spacing, natural appearance |
| 3+ | Too uniform, looks artificial |

### 2.3 Voronoi Construction

Build the dual graph structure from points.

**Input**: vec2[] points, bounds  
**Output**: regions[], edges[], corners[]

Using d3-delaunay:
```
1. Delaunay triangulation of points
2. Voronoi diagram (dual of Delaunay)
3. Extract:
   - Regions: one per input point
   - Edges: Voronoi cell boundaries
   - Corners: Voronoi vertices (Delaunay circumcenters)
4. Build adjacency lists
5. Construct spatial index (R-tree on region centroids + bounding boxes)
```

### 2.4 Elevation Assignment

Assign elevation to corners first, then derive region elevation.

**Input**: corners[], regions[], seed, islandMask  
**Output**: corners and regions with elevation

```
For each corner:
  noise = fractalNoise(position, seed)
  mask = islandMask(position)  // Forces ocean at boundary
  corner.elevation = noise * amplitude + mask

For each region:
  region.elevation = average(corner.elevation for corner in region)
```

**Island Mask Function**:
```
islandMask(x, y, center, radius):
  d = distance(x, y, center) / radius
  if d > 1.0: return -1.0  // Deep ocean beyond boundary
  if d < 0.6: return 0.0   // No penalty in interior
  // Smooth falloff from 60% to 100% of radius
  t = (d - 0.6) / 0.4
  return -smoothstep(t) * 0.8
```

### 2.5 Ocean/Land Classification

Simple threshold on elevation.

```
SEA_LEVEL = 0.0

For each region:
  region.isOcean = (region.elevation < SEA_LEVEL)

For each edge:
  r1, r2 = edge.regions
  edge.isCoastline = (r1.isOcean ≠ r2.isOcean)
```

### 2.6 River Generation

Rivers flow along edges from high corners to low corners.

**Input**: corners[], edges[] with elevation  
**Output**: edges with river flags and flow

```
1. Sort corners by elevation (descending)

2. For each corner (high to low):
   Find lowest adjacent corner → set as downslope
   (Skip if corner is ocean or has no lower neighbor)

3. Assign rainfall to each land corner:
   corner.water = RAINFALL_CONSTANT

4. Flow accumulation (high to low):
   For each corner:
     if downslope exists:
       downslope.water += corner.water

5. Mark river edges:
   For each edge:
     flow = max(corner.water for corner in edge.corners)
     if flow > RIVER_THRESHOLD:
       edge.isRiver = true
       edge.riverFlow = flow
```

Rivers naturally:
- Originate in highlands
- Merge into larger streams
- Terminate at ocean (coastline edge)

### 2.7 Moisture Propagation

Moisture spreads inland from water sources.

**Input**: regions[] with ocean flags, edges[] with river flags  
**Output**: regions with moisture

```
1. Initialize:
   Ocean regions: moisture = 1.0
   Regions adjacent to rivers: moisture = 0.8
   All others: moisture = 0.0

2. Breadth-first propagation:
   Queue = all ocean and river-adjacent regions
   While queue not empty:
     region = dequeue
     For each neighbor:
       newMoisture = region.moisture * MOISTURE_DECAY
       if neighbor.elevation > region.elevation:
         newMoisture *= UPHILL_PENALTY  // Rain shadow
       if newMoisture > neighbor.moisture:
         neighbor.moisture = newMoisture
         enqueue(neighbor)
```

### 2.8 Biome Assignment

Biome is a function of elevation and moisture.

**Input**: regions with elevation and moisture  
**Output**: regions with biome

Elevation bands:
| Band | Range | Description |
|------|-------|-------------|
| Ocean | < 0.0 | Underwater |
| Beach | 0.0–0.05 | Coastal strip |
| Low | 0.05–0.3 | Lowlands |
| Mid | 0.3–0.6 | Hills |
| High | 0.6–0.85 | Mountains |
| Peak | > 0.85 | Summits |

Moisture bands:
| Band | Range |
|------|-------|
| Dry | < 0.2 |
| Moderate | 0.2–0.5 |
| Wet | > 0.5 |

**Biome Matrix** (configurable per game):

| | Dry | Moderate | Wet |
|---|---|---|---|
| Peak | Bare rock | Snow | Snow |
| High | Rocky | Alpine meadow | Cloud forest |
| Mid | Shrubland | Forest | Rainforest |
| Low | Grassland | Woodland | Jungle |
| Beach | Sandy beach | Beach | Mangrove |
| Ocean | Deep ocean | Ocean | Shallow/Reef |

---

## 3. Island Templates

Templates provide preset parameters for different island types.

### 3.1 Template Schema

```javascript
{
  name: "Tropical Volcanic",
  regionCount: 2000,
  radius: 30000,
  lloydIterations: 2,
  
  elevation: {
    noiseFrequency: 0.0003,
    noiseOctaves: 4,
    amplitude: 0.6,
    centralPeakBias: 0.3,  // Extra elevation at center
  },
  
  rivers: {
    rainfall: 1.0,
    threshold: 50,
  },
  
  moisture: {
    decay: 0.9,
    uphillPenalty: 0.7,
  },
  
  biomeConfig: "tropical",  // Reference to biome matrix
}
```

### 3.2 Example Templates

**Tropical Volcanic**
- Central mountain peak with radial drainage
- Dense jungle lowlands
- Coral reefs around coastline

**Archipelago**
- Multiple smaller landmasses
- Generated by raising noise threshold
- Shallow seas between islands

**Continental Fragment**
- Mountain range along one edge
- River valleys running perpendicular
- Plains on leeward side

**Arctic**
- Lower overall elevation
- Ice/snow biomes at lower elevations
- Sparse vegetation

**Atoll**
- Ring-shaped (donut elevation mask)
- Central lagoon
- Very low elevation throughout

---

## 4. Spatial Queries

### 4.1 Point-in-Region

Given world coordinates, find containing region.

```javascript
function findRegion(x, y) {
  // R-tree query for candidate regions
  const candidates = spatialIndex.query(x, y);
  
  // Point-in-polygon test for each candidate
  for (const region of candidates) {
    if (pointInPolygon(x, y, region.vertices)) {
      return region;
    }
  }
  return null;  // Outside island bounds
}
```

### 4.2 Regions-in-Bounds

Given AABB, find all overlapping regions.

```javascript
function queryBounds(minX, minY, maxX, maxY) {
  return spatialIndex.queryBounds({ minX, minY, maxX, maxY });
}
```

### 4.3 Nearest River Edge

Given point, find closest river edge and distance.

```javascript
function findNearestRiver(x, y, maxDistance) {
  const region = findRegion(x, y);
  if (!region) return null;
  
  let nearest = null;
  let minDist = maxDistance;
  
  // Check edges of this region and neighbors
  for (const edge of region.edges) {
    if (!edge.isRiver) continue;
    const dist = distanceToLineSegment(x, y, edge.corners);
    if (dist < minDist) {
      minDist = dist;
      nearest = { edge, distance: dist };
    }
  }
  return nearest;
}
```

---

## 5. Serialization

### 5.1 Full Graph Export

For saving modified islands or sharing:

```javascript
{
  version: "2.0",
  seed: 42,
  template: "tropical_volcanic",
  
  regions: [
    {
      id: 0,
      centroid: [15000, 12000],
      vertices: [[14500, 11500], [15500, 11500], ...],
      elevation: 0.35,
      moisture: 0.6,
      biome: "forest",
      neighbors: [1, 2, 5]
    },
    ...
  ],
  
  edges: [
    { id: 0, regions: [0, 1], corners: [0, 1], isRiver: true, riverFlow: 120 },
    ...
  ],
  
  corners: [
    { id: 0, position: [14500, 11500], elevation: 0.32, downslope: 5 },
    ...
  ]
}
```

### 5.2 Regenerable Reference

For save files where island hasn't been modified:

```javascript
{
  regenerable: true,
  seed: 42,
  template: "tropical_volcanic",
  overrides: {}  // Any parameter changes from template
}
```

---

## 6. Chunk Integration API

Interface for rendering systems to consume island data.

```javascript
class IslandGraph {
  // Generation
  static generate(config: IslandConfig): IslandGraph
  static fromJSON(data: object): IslandGraph
  
  // Serialization
  toJSON(): object
  
  // Spatial queries
  findRegion(x: number, y: number): Region | null
  queryBounds(bounds: AABB): Region[]
  findNearestRiver(x: number, y: number, maxDist: number): RiverHit | null
  findNearestCoast(x: number, y: number, maxDist: number): CoastHit | null
  
  // Graph traversal
  getRegion(id: number): Region
  getEdge(id: number): Edge
  getCorner(id: number): Corner
  getNeighbors(regionId: number): Region[]
  
  // Aggregate data
  getBounds(): AABB
  getLandRegions(): Region[]
  getOceanRegions(): Region[]
  getRiverEdges(): Edge[]
  getCoastlineEdges(): Edge[]
}
```

Usage in chunk generation:

```javascript
function generateChunk(chunkX, chunkY, island) {
  const bounds = getChunkBounds(chunkX, chunkY);
  const regions = island.queryBounds(bounds);
  
  for (const vertex of chunkVertices) {
    const region = island.findRegion(vertex.x, vertex.y);
    
    if (!region) {
      // Outside island—deep ocean
      vertex.elevation = -1.0;
      vertex.biome = "deep_ocean";
      continue;
    }
    
    // Inherit region properties
    vertex.elevation = region.elevation;
    vertex.biome = region.biome;
    vertex.moisture = region.moisture;
    
    // Add local detail noise
    vertex.elevation += detailNoise(vertex.x, vertex.y) * 0.02;
    
    // Carve river channels
    const river = island.findNearestRiver(vertex.x, vertex.y, RIVER_WIDTH);
    if (river) {
      const profile = 1 - (river.distance / RIVER_WIDTH);
      vertex.elevation -= RIVER_DEPTH * profile;
    }
  }
}
```

---

## 7. Implementation Files

```
src/terrain/island/
  IslandGenerator.js     # Main orchestration, public API
  PointDistribution.js   # Scatter + Lloyd relaxation  
  VoronoiGraph.js        # Build graph from points (uses d3-delaunay)
  Elevation.js           # Noise + island mask
  Rivers.js              # Drainage computation
  Moisture.js            # BFS moisture propagation
  BiomeClassifier.js     # Elevation × moisture → biome
  SpatialIndex.js        # R-tree wrapper
  IslandTemplates.js     # Preset configurations
  IslandGraph.js         # Data structure + query methods
```

---

## 8. Performance Characteristics

| Operation | Complexity | Typical Time |
|-----------|------------|--------------|
| Generate 2000-region island | O(n log n) | 200–400ms |
| Point-in-region query | O(log n) | <0.1ms |
| Bounds query | O(log n + k) | <1ms |
| Serialize to JSON | O(n) | 10–20ms |
| Deserialize from JSON | O(n) | 10–20ms |

Memory footprint for 2000-region island: ~500KB (including spatial index).

---

*Specification version 2.0*  
*Island Geography Generation System*  
*Reusable across Voronoi Skies, GolemCraft, and future projects*

---