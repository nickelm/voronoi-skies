## Infrastructure Generation Specification

**Version:** 1.0  
**Purpose:** Define placement algorithms for settlements, transportation networks, and military installations. Core systems are game-agnostic; military infrastructure is Voronoi Skies specific.

---

### 1. Overview

Infrastructure generation runs after island geography is complete. It uses the region graph for pathfinding and placement decisions.

```
IslandGraph (complete)
       │
       ▼
┌──────────────────┐
│ Place Settlements │
│ (capital, towns,  │
│  villages)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Generate Roads   │
│ (A* on region    │
│  adjacency)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Place Airbases   │  ◄── VS only
│ (settlement +    │
│  forward)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Place Military   │  ◄── VS only
│ (SAM, radar)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Generate Rail    │  ◄── VS only
└────────┬─────────┘
         │
         ▼
   InfrastructureGraph
```

---

### 2. Settlements

#### 2.1 Types

| Type | Count | Min Population | Airbase | Port Possible |
|------|-------|----------------|---------|---------------|
| Capital | 1 | 50,000 | Major airport | Yes (naval base) |
| Town | 3–6 | 5,000 | Regional/military | If coastal |
| Village | 10–25 | 500 | No | No |

#### 2.2 Placement Criteria

**Region suitability score:**

```
score = baseScore
      + coastalBonus * (isCoastal ? 1 : 0)
      + riverBonus * (hasRiver ? 1 : 0)
      + flatBonus * (1 - elevationVariance)
      - elevationPenalty * elevation
      - slopePenalty * avgSlopeToNeighbors
```

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Coastal | +30 | Trade, port access |
| River | +20 | Water, agriculture |
| Flat terrain | +25 | Building space |
| High elevation | -20 | Difficult access |
| Steep slopes | -15 | Hard to build |

**Minimum spacing:**

| Between | Distance |
|---------|----------|
| Capital ↔ Town | 15,000 ft |
| Town ↔ Town | 12,000 ft |
| Town ↔ Village | 5,000 ft |
| Village ↔ Village | 3,000 ft |

#### 2.3 Algorithm

```
1. Score all land regions

2. Place capital
   - Filter: coastal, has river, flat
   - Select highest scoring region
   
3. Place towns
   - Filter: meets spacing from capital
   - Iterate: select highest scoring, mark spacing exclusion zone
   - Repeat until count reached or no valid regions
   
4. Generate primary road network (see section 3)

5. Place villages
   - Prefer regions along roads
   - Prefer regions near but not in towns
   - Fill gaps in settled area
```

---

### 3. Road Network

#### 3.1 Types

| Type | Connects | Visual Width | Speed |
|------|----------|--------------|-------|
| Highway | Capital ↔ Towns | 4 lanes | Fast |
| Road | Towns ↔ Villages | 2 lanes | Medium |
| Track | Villages ↔ nearby | 1 lane | Slow |

#### 3.2 Pathfinding

Use A* on region adjacency graph (Delaunay edges).

**Edge cost function:**

```
cost(r1, r2) = distance(r1.centroid, r2.centroid)
             × (1 + steepnessPenalty × abs(r1.elevation - r2.elevation) / distance)
             × (1 + waterPenalty × (crossesRiver ? 0.3 : 0))
             × biomeFactor[r1.biome]
             × biomeFactor[r2.biome]
```

**Biome factors:**

| Biome | Factor | Rationale |
|-------|--------|-----------|
| Beach, Grassland | 1.0 | Easy terrain |
| Forest | 1.3 | Clearing needed |
| Dense Forest | 1.6 | Significant clearing |
| Marsh | 2.0 | Drainage needed |
| Mountain | 2.5 | Difficult construction |
| Ocean | ∞ | Impassable |

#### 3.3 Network Generation

```
1. Highway network
   - A* from capital to each town
   - Mark traversed edges as highway
   
2. Road network
   - For each town, A* to nearest 2–3 villages
   - Skip if path already exists via highway
   - Mark edges as road
   
3. Track network
   - For unconnected villages, A* to nearest road/village
   - Mark edges as track
   
4. Bridge detection
   - Any road edge crossing a river edge → bridge
```

---

### 4. Airbases (VS Only)

#### 4.1 Types

| Type | Runway | Capacity | Repair | Location |
|------|--------|----------|--------|----------|
| Major Airport | 10,000 ft | 20+ | Full | Capital |
| Regional Airport | 7,000 ft | 12–15 | Standard | Coastal towns |
| Military Airbase | 6,000 ft | 8–12 | Standard | Inland towns |
| Forward Airbase | 4,000 ft | 4–6 | Limited | Strategic points |
| Emergency Strip | 2,500 ft | 2 | None | Flat regions |

#### 4.2 Settlement Airbase Assignment

```
1. Capital → Major Airport (always)

2. For each town, score airbase suitability:
   score = flatness
         + coastalBonus * 0.3
         + distanceFromCapital * 0.2  // Spread coverage
         - mountainProximity * 0.4     // Approach obstacles
   
3. Assign airbases:
   - Top 70% of coastal towns → Regional Airport
   - Top 50% of inland towns → Military Airbase
   - Remaining towns → No airbase
```

#### 4.3 Forward Airbase Placement

Fill coverage gaps:

```
1. Compute coverage
   - For each airbase, mark regions within patrol radius
   - Patrol radius: 50,000 ft (Major), 35,000 ft (Regional), 25,000 ft (Forward)
   
2. Find gaps
   - Identify uncovered land regions
   - Cluster into gap zones
   
3. Place forward bases
   - For each gap zone:
     - Find candidate regions: flat, road-accessible
     - Score by strategic value (covers most uncovered area)
     - Place forward airbase at best candidate
   - Limit: 2–4 forward bases total
```

#### 4.4 Runway Heading

Derive from terrain:

```
1. Find flat axis
   - Principal component analysis of region polygon
   - Or: longest axis that stays within region
   
2. Check approaches
   - Extend runway heading both directions
   - Check elevation of regions along approach path
   - Penalize headings with rising terrain on approach
   
3. Wind consideration
   - Template defines prevailing wind direction
   - Prefer runway aligned within 30° of wind
   
4. Select best heading
   - Balance flat axis, clear approaches, wind alignment
```

---

### 5. Military Infrastructure (VS Only)

#### 5.1 Radar Stations

**Purpose:** Early warning, extends detection range.

**Placement:**

```
1. Find high ground
   - Sort land regions by elevation (descending)
   - Filter: not ocean, not settlement
   
2. Coverage requirement
   - Each radar covers 40,000 ft radius
   - Goal: overlap coverage across entire island
   
3. Place stations
   - Greedy: place at highest uncovered point
   - Repeat until 90% land coverage
   - Typically 3–5 stations
```

#### 5.2 SAM Sites

**Purpose:** Area denial, protect key assets.

**Placement:**

```
1. Identify protection priorities
   - Capital (highest priority)
   - Major airbases
   - Ports
   
2. Identify threat approaches
   - Coastal regions facing open ocean
   - Low-altitude corridors (valleys)
   
3. Place SAM sites
   - Each SAM covers 25,000 ft radius
   - Place to overlap coverage on priority assets
   - Place to cover threat approaches
   - Typically 4–8 sites
   
4. Constraints
   - Road access required
   - Not in settlement (adjacent OK)
   - Prefer elevated positions (better radar horizon)
```

#### 5.3 Ports and Naval Bases

```
1. Capital port → Naval base (if coastal capital)

2. Additional ports
   - Coastal towns with high suitability score
   - Consider: bay/inlet shape, water depth (elevation just offshore)
   - 1–3 additional ports typical
```

---

### 6. Railroads (VS Only)

#### 6.1 Constraints

Stricter than roads:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Maximum grade | 3% | Locomotive limits |
| Minimum curve radius | 2,000 ft | Train dynamics |
| Bridge cost | 5× road | Engineering |
| Tunnel cost | 10× road | Excavation |

#### 6.2 Pathfinding

Modified A* cost:

```
cost(r1, r2) = distance
             × (1 + tunnelFactor × requiresTunnel(r1, r2))
             × (1 + bridgeFactor × crossesRiver)
             + gradePenalty × max(0, grade - maxGrade)²
```

**Tunnel detection:**

```
requiresTunnel(r1, r2) = 
  any intermediate elevation > max(r1.elevation, r2.elevation) + threshold
```

#### 6.3 Network

```
1. Connect capital to major towns only
   - A* with rail constraints
   - Mark edges as railroad
   - Note tunnel/bridge locations
   
2. Typically 2–4 rail lines radiating from capital
```

---

### 7. Data Structures

#### 7.1 Settlement

```javascript
{
  regionId: number,
  type: 'capital' | 'town' | 'village',
  name: string,
  population: number,
  hasPort: boolean
}
```

#### 7.2 Airbase

```javascript
{
  regionId: number,
  type: 'major_airport' | 'regional_airport' | 'military_airbase' | 'forward_airbase' | 'emergency_strip',
  name: string,
  runway: {
    length: number,        // feet
    heading: number,       // degrees true
    condition: number      // 0–1
  },
  capacity: number,        // max aircraft
  facilities: {
    repair: 'full' | 'standard' | 'limited' | 'none',
    fuelStorage: number,
    ammoStorage: number
  }
}
```

#### 7.3 Military Site

```javascript
{
  regionId: number,
  type: 'radar' | 'sam' | 'naval_base' | 'depot',
  name: string,
  coverageRadius: number,
  status: 'operational' | 'damaged' | 'destroyed'
}
```

#### 7.4 Road Segment

```javascript
// Stored on Edge
{
  type: 'highway' | 'road' | 'track' | null,
  hasBridge: boolean,
  condition: number        // 0–1
}
```

#### 7.5 Railroad Segment

```javascript
// Stored on Edge
{
  exists: boolean,
  hasBridge: boolean,
  hasTunnel: boolean,
  condition: number
}
```

---

### 8. File Structure

```
src/infrastructure/
  # Core (game-agnostic)
  SettlementPlacer.js       # Place capital, towns, villages
  RoadGenerator.js          # A* road network
  InfrastructurePaths.js    # Shared A* implementation
  
  # Voronoi Skies specific
  AirbasePlacer.js          # Settlement + forward airbases
  MilitaryPlacer.js         # Radar, SAM sites
  RailroadGenerator.js      # Rail network with tunnels/bridges
  RunwayCalculator.js       # Compute runway headings
  CoveragAnalyzer.js        # Radar/SAM coverage computation
  
  # Configuration
  InfrastructureConfig.js   # Game-specific parameters
```

---

### 9. Generation Order

```javascript
function generateInfrastructure(island, config) {
  // 1. Settlements (required first)
  const settlements = SettlementPlacer.place(island, config.settlements);
  
  // 2. Primary roads (needed for airbase access check)
  const roads = RoadGenerator.generate(island, settlements, config.roads);
  
  // 3. Airbases (VS only)
  let airbases = [];
  if (config.enableAirbases) {
    airbases = AirbasePlacer.place(island, settlements, roads, config.airbases);
  }
  
  // 4. Military infrastructure (VS only)
  let military = [];
  if (config.enableMilitary) {
    military = MilitaryPlacer.place(island, settlements, airbases, config.military);
  }
  
  // 5. Additional villages along roads
  const villages = SettlementPlacer.fillVillages(island, settlements, roads, config.settlements);
  
  // 6. Secondary roads to new villages
  RoadGenerator.extendToVillages(island, roads, villages, config.roads);
  
  // 7. Railroads (VS only)
  let railroads = [];
  if (config.enableRailroads) {
    railroads = RailroadGenerator.generate(island, settlements, config.railroads);
  }
  
  return {
    settlements: [...settlements, ...villages],
    roads,
    railroads,
    airbases,
    military
  };
}
```

---

### 10. Rendering Notes

**Strategic map (2D):**
- Settlements: Icons at region centroids (size by type)
- Roads: Lines along edges, width by type, noisy subdivision
- Railroads: Dashed or cross-hatched lines
- Airbases: Runway icon showing heading
- SAM/Radar: Military icons with range rings (optional)

**Terrain (3D chunks):**
- Roads: Flatten terrain corridor, apply road color/texture
- Railroads: Similar with track texture
- Settlements: Clear vegetation, place building geometry
- Airbases: Flat rectangular area, runway markings

---

### 11. VS vs GC Configuration

```javascript
// Voronoi Skies
const vsConfig = {
  settlements: {
    townCount: [4, 6],
    villageCount: [15, 25],
    namingStyle: 'modern'
  },
  roads: {
    highwayEnabled: true,
    speedLimits: true
  },
  enableAirbases: true,
  enableMilitary: true,
  enableRailroads: true
};

// GolemCraft
const gcConfig = {
  settlements: {
    townCount: [3, 5],
    villageCount: [10, 20],
    namingStyle: 'fantasy'
  },
  roads: {
    highwayEnabled: false,  // Just roads and tracks
    speedLimits: false
  },
  enableAirbases: false,
  enableMilitary: false,    // Could add magic towers later
  enableRailroads: false
};
```