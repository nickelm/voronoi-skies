# Voronoi Skies

## Game Design Document

**Version:** 0.1  
**Genre:** Roguelite air combat simulation  
**Platform:** Browser (Canvas/WebGL)  
**Aesthetic:** 8-bit pixel art with simulation depth

---

## Core Concept

A top-down air combat game that combines deep systems modeling with retro visual abstraction. The signature mechanic is a dynamic Voronoi split-screen that shows distant targets in magnified cells, representing radar awareness rather than visual line-of-sight. The game plays like a simulation but looks like it runs on a NES.

**Design philosophy:** Simulation depth, visual humility. Complex systems (radar, missiles, flight dynamics) run under the hood; 8-bit rendering keeps scope manageable and aesthetic distinctive.

---

## Visual Design

### Aesthetic Principles

- 8-bit pixel art sprites for aircraft (single sprite, rotated programmatically)
- **Voronoi aesthetic everywhere:** Terrain, clouds, and radar cells all use Voronoi tessellation
- Procedural effects (afterburner, contrails, explosions) via code
- Optional pixel shader lighting for subtle depth
- No anti-aliasing; preserve hard pixel edges

### Unified Voronoi World

The entire visual field is Voronoi-based, creating a coherent style:

- **Terrain layer:** Voronoi cells define biomes (ocean, forest, plains, mountains, urban)
  - Flat-shaded polygons with 8-bit color palettes per biome
  - Cell edges become natural features: rivers, ridgelines, coastlines
  - Procedurally generated from seed-based point distribution
- **Cloud layer:** Second Voronoi tessellation floating above terrain
  - Semi-transparent cells, drifting slowly
  - Different point density and drift rate than terrain
  - Aircraft below clouds: partially obscured
  - Aircraft above clouds: cast shadows on cloud layer
- **Radar/sensor cells:** Dynamic Voronoi overlay for tracked entities
  - Subdivides screen based on tactical situation
  - Same visual language as world geometry

### The Voronoi Radar Screen

The screen dynamically subdivides into cells based on tracked entities:

- **Player aircraft:** Always has a cell (home cell), positioned at bottom of screen facing up
- **Radar contacts:** Each locked or tracked target gets a cell
- **Player missiles:** Active missiles can claim cells (player choice or automatic)
- **Cell zoom:** Magnification corresponds to lock quality
  - Search mode: zoomed out, fuzzy
  - TWS track: medium zoom
  - STT lock: close zoom, crisp
- **Cell boundaries:** Encode distance between entities; boundaries shrink as range closes
- **The merge:** When aircraft close to visual range, cells collapse into unified 2D view

### Sensor Cell Tinting

Different sensors render their cells with distinct visual treatment:

- **Radar cells:** Default appearance, no tint
- **Targeting pod (TGP):** Green or amber tint, optional CRT scanlines
- **IRST (if implemented):** Cool blue-white tint
- Tinting immediately communicates which sensor is providing the track

### Player Aircraft Screen Position

- Own aircraft rendered facing up (north); world rotates around player as they turn
- **Threat-reactive positioning:** Aircraft screen position shifts dynamically based on threat geometry

**Positioning logic:**

- **No threats:** Aircraft settles to bottom-center, maximizing forward view (default cruise position)
- **Threat behind (six o'clock):** Aircraft drifts up, opening rear-hemisphere space
- **Threat to right (three o'clock):** Aircraft drifts left, opening right-side space
- **Threat to left (nine o'clock):** Aircraft drifts right, opening left-side space
- **Threat ahead (twelve o'clock):** Aircraft stays low or drifts slightly down
- **Multiple threats:** Aircraft moves toward the "safest" screen regionâ€”opposite the threat centroid
- **Surrounded:** Aircraft centers; Voronoi cells crowd in from all sides (claustrophobic, intentional)

**Behavior:**

- Position changes are smooth, interpolating over 1-2 seconds to prevent disorientation
- Maximum displacement boundedâ€”aircraft never drifts so far that it becomes hard to track
- Threat weighting: closer threats and locked threats have stronger "push" effect
- Missiles (especially inbound) may have higher weight than aircraft

**Why this works:**

- Screen position *is* the threat summary; no need to check a separate radar display
- Creates space for Voronoi cells where awareness is most needed
- Intuitive: players feel "pushed" by danger without explicit tutorial
- Surrounded = centered = in trouble; the geometry communicates the situation

### Altitude Representation

Altitude is modeled numerically, not visually in aircraft attitude:

- Aircraft always rendered flat top-down (no pitch indication)
- **Shadow offset:** Higher altitude = shadow further from sprite
- **Numeric display:** Altitude shown in cell HUD (in thousands of feet or flight level)
- Climb/descend commands change altitude; sprite remains flat
- Rationale: Top-down view is a tactical plot, not a camera

### Terrain Altitude and Low-Level Flight

Communicating terrain height in a 2D top-down view:

- **Color intensity:** Higher terrain rendered lighter/brighter within biome palette
- **Contour lines:** Subtle 8-bit topographic lines at altitude intervals (optional)
- **Collision warning:** Cell border flashes red when terrain meets or exceeds aircraft altitude
- **Terrain elevation display:** Each Voronoi terrain cell can show its elevation value
- Primary method: collision warning. Player doesn't need to parse height visually; the game warns them.

### Airbases and Runways

- Runways generated procedurally within suitable terrain cells
- Runway orientation follows terrain cell geometry or wind direction
- 8-bit runway markings, threshold, and centerline
- Glideslope/approach indicators rendered in world space when approaching

---

## World Design

### Procedural Voronoi Terrain

Deterministic procedural generation using seeded point distribution:

- **Generation method:** 
  - Seed determines point placement for Voronoi tessellation
  - Same seed always produces same map (shareable runs)
  - Point density varies by region (sparser over ocean, denser over complex terrain)
- **Biome assignment:**
  - Each cell assigned a biome based on noise layers and position
  - Biomes: Ocean, coastline, plains, forests, mountains, urban areas
  - Cell color follows 8-bit palette for that biome
- **Terrain elevation:**
  - Each cell has an elevation value (0 = sea level)
  - Mountains: high elevation cells, lighter shading
  - Valleys and passes: low elevation cells between mountains
- **Natural features from cell edges:**
  - Rivers flow along cell boundaries toward ocean
  - Ridgelines follow boundaries between elevation changes
  - Coastlines are boundaries between ocean and land cells

### Procedural Clouds

- Cloud layer is a second Voronoi tessellation at configurable altitude
- **Generation:**
  - Separate seed (or offset from terrain seed)
  - Lower point density than terrain (larger, softer cells)
  - Points drift slowly, causing clouds to move
- **Visual treatment:**
  - Semi-transparent white/gray cells
  - Rendered above terrain, below high-altitude aircraft
- **Gameplay effects:**
  - Clouds provide concealment (break radar lock, hide from visual)
  - Aircraft in clouds: sprite partially obscured
  - Aircraft above clouds: shadow cast on cloud layer

### Airbases

- **Placement:** Procedurally placed based on terrain (flat cells, not mountains or ocean)
- **Runway generation:**
  - Orientation based on cell geometry or prevailing wind (seed-determined)
  - Length appropriate for aircraft type
  - 8-bit markings: threshold, centerline, touchdown zone
- **Functions:**
  - Takeoff (mission start)
  - Landing (repair, rearm, end sortie)
  - Captured vs. friendly status in campaign mode

### Takeoff Procedure

1. Aircraft spawns on runway, stationary
2. Player increases throttle (afterburner optional)
3. Speed builds; at rotation speed, player commands climb
4. Gear auto-retracts above safe altitude, or player retracts manually
5. Departure cleared; mission begins

**Simplified option:** Auto-takeoff cutscene, player takes control airborne

### Landing Procedure

1. Approach airbase; approach aids appear in world (glideslope, centerline)
2. Player must:
   - Align with runway heading
   - Descend to pattern altitude
   - Reduce speed to approach speed
   - Lower landing gear (via radial menu)
   - Set flaps to landing position
3. On touchdown:
   - Speed below threshold: successful landing
   - Speed too high or gear up: crash/damage
   - Off-centerline: runway excursion, possible damage
4. Rollout and stop; mission ends or rearm/repair menu appears

**Landing aids:**
- Runway cell highlighted when selected as destination
- Glideslope indicator: world-space line showing correct descent path
- Speed/altitude callouts in HUD or voice

**Simplified option:** Auto-land when within parameters, skill check based on approach quality

---

## Controls

### Flight (Keyboard)

| Key | Function |
|-----|----------|
| W / S | Throttle up / down |
| A / D | Turn left / right |
| Q / E | Altitude up / down (climb/descend) |
| Space | Weapon release |
| Tab | Cycle targets |
| Shift | Afterburner |

### Systems (Mouse + On-Demand UI)

No persistent cockpit. Controls appear contextually in the world or as minimal overlays:

- **Click on Voronoi cell:** Select that target for STT lock
- **Right-click drag:** Slew radar cursor
- **Scroll wheel:** Adjust radar range
- **Hover near aircraft:** Radial menu appears for:
  - Landing gear toggle
  - Flaps (up / takeoff / landing)
  - Speedbrake
  - Countermeasures (chaff/flare)
  - Weapon select

### World-Embedded UI

- **Waypoints:** Rendered as icons in the world with distance/bearing
- **Airbase pattern:** Visual glideslope indicator when approaching
- **Threat rings:** Enemy SAM/AAA range shown as dashed circles on terrain
- **Bullseye:** Optional reference point for coordinate calls

---

## Systems Modeling

### Flight Model

Simplified but consequential:

- **Energy:** Speed + altitude, conserved and traded
- **Turn rate:** Decreases at low speed, increases with flaps
- **Climb/descent:** Trades speed for altitude and vice versa
- **Stall:** Below minimum speed, loss of control
- **Structural limit:** Exceeding G causes damage

### Radar System

- **Scan modes:**
  - RWS (Range While Search): Wide scan, multiple contacts, no lock
  - TWS (Track While Scan): Maintains soft tracks, can launch Fox-3
  - STT (Single Target Track): Hard lock, best data, but loses other contacts
- **Scan volume:** Azimuth and elevation bars, adjustable
- **Gimbal limits:** Radar cannot track targets outside cone
- **Notching:** Targets perpendicular to radar (low closure) fade from track
- **Ground clutter:** Low-altitude targets harder to detect over land

### Missiles

**Types:**

| Designation | Type | Guidance | Range |
|-------------|------|----------|-------|
| Fox-1 | SARH | Semi-active radar | Medium |
| Fox-2 | IR | Heat-seeking | Short |
| Fox-3 | ARH | Active radar | Long |

**Missile behavior:**

- Fox-1: Requires continuous STT lock until impact
- Fox-2: Fire and forget, can be flared, best in rear aspect
- Fox-3: Requires support until pitbull (active seeker), then autonomous

**Countermeasures:**

- Chaff: Defeats radar missiles (timing matters)
- Flares: Defeats IR missiles
- Notching: Defeats doppler radar
- Terrain masking: Break line-of-sight

### Damage Model

- Component-based: Engine, radar, weapons, flight controls
- Degraded performance when damaged (reduced thrust, radar range, etc.)
- Critical damage forces RTB or eject

---

## Roguelite Structure

### Campaign Flow

1. **Sortie briefing:** Procedural mission with objectives
2. **Takeoff:** From home airbase
3. **Mission:** Complete objectives, survive threats
4. **RTB:** Land to complete sortie
5. **Debrief:** XP, unlocks, repairs

### Permadeath Lite

- Pilot ejects: Loses aircraft and loadout, pilot survives with XP
- Pilot killed: Campaign ends, start new pilot
- Successful landing: Full credit, repairs available

### Progression

- **Pilot XP:** Unlocks skills (better G tolerance, radar interpretation, etc.)
- **Squadron reputation:** Unlocks aircraft, weapons, allies
- **Map control:** Captured airbases expand operating range

### Procedural Missions

- **Sweep:** Clear airspace of enemies
- **Escort:** Protect strike package
- **Intercept:** Stop incoming raid
- **SEAD:** Destroy enemy radar/SAM
- **Strike:** Hit ground target and RTB
- **Reconnaissance:** Photograph target, avoid engagement

---

## Enemy AI

### Behavior Levels

- **Rookie:** Predictable, slow reactions, poor BVR
- **Regular:** Competent, uses terrain, employs countermeasures
- **Veteran:** Aggressive, coordinates with wingmen, exploits mistakes
- **Ace:** Named pilots with unique tactics, boss-like encounters

### AI Capabilities

- Autonomous radar management
- Missile defense (notching, countermeasures, terrain)
- Energy management
- Formation tactics (2v1, pincer, drag-and-bag)

---

## Audio

- 8-bit sound effects (engine drone, missile launch, lock tones)
- Chip-tune music (tense during combat, calm during cruise)
- RWR audio cues (spike, launch, etc.)

---

## Technical Architecture

### Stack

- **Rendering:** HTML5 Canvas (primary), WebGL (shaders if needed)
- **Language:** JavaScript/TypeScript
- **Voronoi:** d3-delaunay or similar lightweight library
- **State:** Simple ECS (Entity-Component-System) pattern
- **Persistence:** LocalStorage for campaign, shareable seeds

### Performance Targets

- 60 FPS with 10+ entities and full Voronoi subdivision
- Mobile-playable (touch controls as stretch goal)

---

## Development Phases

### Tech Demo: BVR Combat

Minimal viable demonstration of the core Voronoi mechanic:

- Single player aircraft, one or two enemy aircraft
- Flat terrain (ocean or simple land, Voronoi cells)
- Flight model: throttle, turn, basic energy
- Radar: search mode, lock mode (STT)
- One missile type (Fox-3, fire-and-forget after pitbull)
- Voronoi split-screen showing player cell and target cell(s)
- Cell zoom reflects lock quality
- Cell boundaries shrink as range closes
- No merge (BVR onlyâ€”combat ends at kill or miss)
- No altitude, no clouds, no landing
- Keyboard flight, mouse for target selection

**Success criteria:** The Voronoi mechanic feels good. Locking a target and watching cells behave is satisfying. The 1942 aesthetic reads clearly.

### Phase 1: Core Loop

- Multiple enemies
- Full radar modes (RWS, TWS, STT)
- Fox-1, Fox-2, Fox-3 missiles
- Countermeasures (chaff, flares)
- Basic damage model
- The merge (cells collapse to unified 2D view)

### Phase 2: World

- Procedural Voronoi terrain with biomes
- Terrain elevation and collision
- Procedural clouds
- Altitude model (climb/descend, energy trade)
- Airbase with takeoff and landing

### Phase 3: Roguelite Shell

- Procedural missions
- Pilot progression
- Campaign map
- Permadeath

### Phase 4: Polish

- Audio (8-bit engine sounds, chip-tune music, RWR tones)
- More aircraft types
- Advanced AI
- Targeting pod, IRST
- Leaderboards / seed sharing
- Multiplayer (same-screen coop first)

---

## Open Questions

1. **Enemy missile cells:** Should enemy missiles get Voronoi cells? (Gameplay vs. realism tension. Current lean: RWR-triggered only.)
2. **Altitude complexity:** How much does altitude matter?
   - Minimum: Just a number, affects missile/radar performance
   - Medium: Terrain collision, cloud layers, energy trade
   - Maximum: Full 3D with vertical maneuvering
   - Current lean: Mediumâ€”altitude matters for terrain and clouds, but combat flattens to 2D at merge
3. **Terrain avoidance gameplay:** Is flying low and masking fun, or just frustrating? Needs playtesting.
4. **Multiplayer scope:** Same-screen coop is trivial; networked PvP is significant work. Phase 4 or never?
5. **Mobile controls:** Feasible? Touch for radar/systems, tilt for flight? Stretch goal at best.
6. **Auto-takeoff/landing:** Should these be skill tests or skippable cutscenes? Probably player preference toggle.

---

## References

### Visual North Star: 1942 (Capcom, 1984)

The 1942 arcade series defines the target aesthetic:

- **Vertical orientation:** Aircraft faces up, world scrolls/rotates beneath
- **Flat illustrative terrain:** Painterly but simpleâ€”water, islands, coastlines
- **Limited palette:** Bold colors, no gradients, NES-era constraints
- **Chunky explosions:** Big, satisfying pixel bursts
- **Minimal UI:** Score and status tucked to screen edges
- **Readable at speed:** Everything clear despite fast action

**Adaptation for Voronoi Skies:**

- Replace tile-based terrain with Voronoi cells, keeping flat illustrative shading
- Cell borders get subtle dark stroke (like 1942 tile edges)
- Water cells: deep blue with simple wave patterns
- Land cells: earthy greens, browns, grays per biome
- Same immediate, readable feelâ€”but with simulation depth underneath

### Gameplay References

- DCS World (systems depth)
- Into the Breach (information-dense minimalist UI)
- Luftrausers (feel and flow)
- F-15 Strike Eagle II (retro air combat)
- Ace Combat (mission structure)

---

*Document started: January 2025*