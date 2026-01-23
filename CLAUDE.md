# Voronoi Skies - Claude Code Guide

## Project Overview

Voronoi Skies is a roguelite air combat game combining BVR (Beyond Visual Range) simulation depth with 8-bit pixel art aesthetics. The signature mechanic is a dynamic Voronoi split-screen: radar locks and navigation waypoints create screen cells showing different perspectives.

**Core design principle:** Simulation depth, visual humility. Complex systems (radar, missiles, flight dynamics) run under the hood; 2D sprites in 3D space keep the aesthetic distinctive.

## Tech Stack

- **Three.js** with WebGL2 (required)
- **d3-delaunay** for Voronoi tessellation
- **simplex-noise** for procedural terrain generation
- **Vite** for build/dev server
- **Vanilla JS** (no React, no heavy frameworks)
- **GitHub Pages** for deployment

## Current State

### Completed Systems

**Terrain Generation**
- Procedural Voronoi terrain with biomes (ocean, coastal, plains, forest, mountain, snow)
- Zone-based elevation: continental noise → regional → local → ridged mountains
- Delaunay triangulation with 3D elevation and smooth vertex normals
- Web worker architecture for chunk generation (zero-copy transfer via Transferable arrays)
- Chunk loading system with priority queue (direction-aware loading)
- GPU lighting via Three.js (directional + hemisphere + ambient)
- Time-of-day presets (dawn, noon, night) with sky/fog color sync
- Ambient occlusion baked into vertex colors

**Voronoi Split-Screen Viewports**
- Two-phase stencil rendering (write all masks, then render all scenes)
- Mixed 2D/3D cells: perspective cameras for world views, orthographic for UI instruments
- Viewport offset technique for 3D cells (camera center → seed position)
- Frustum adjustment technique for 2D UI cells
- On-screen target merging (visible targets share player's view)
- Zoom blending as targets approach screen edge
- Seed deconfliction for overlapping off-screen targets
- Raw WebGL stencil calls (Three.js material properties unreliable)

**Flight & Rendering**
- Perspective camera with altitude-based terrain scaling
- Aircraft sprite with bank/pitch visual tilt
- Shadow with altitude-based offset
- Basic WASD flight controls

### Architecture

```
src/
├── main.js              # Game loop, lighting setup, input handling
├── renderer.js          # Three.js setup, altitude zoom
├── input.js             # Keyboard state management
├── voronoi.js           # d3-delaunay wrapper
├── entities/
│   └── aircraft.js      # Player aircraft state and sprite
├── terrain/
│   ├── ChunkManager.js  # Chunk lifecycle, worker dispatch
│   ├── ChunkGenerator.js # Main-thread generation (backup)
│   ├── ChunkRenderer.js # Three.js mesh building from buffers
│   ├── Chunk.js         # Single chunk data structure
│   ├── TerrainRenderer.js # Pivot/terrain group hierarchy
│   ├── noise.js         # Seeded noise functions (continental, regional, local, ridged)
│   ├── biomes.js        # Biome classification and colors
│   ├── lighting.js      # Hillshade, AO config, time presets
│   └── worker/
│       └── TerrainWorker.js # Off-thread chunk generation
├── shaders/
│   └── blurShader.js    # Altitude blur (currently disabled)
└── utils/
    ├── seededRandom.js  # Mulberry32 RNG, jittered grid points
    └── hash.js          # Deterministic chunk/grid hashing
```

### Key Files

| File | Purpose |
|------|---------|
| `spec-voronoi-viewport-implementation.md` | Comprehensive viewport system spec |
| `spec-control-ui.md` | Input and UI design specification |
| `voronoi-skies-gdd.md` | Game design document |

## Coordinate System

- **World units:** 1 unit = 1 meter
- **Y-axis in Three.js:** Up (altitude for camera positioning)
- **Z-axis in terrain:** Elevation (terrain mesh uses X/Y plane, Z for height)
- **Heading:** Radians, 0 = north (+Y in terrain space), clockwise positive

## Key Implementation Details

### Stencil Rendering (Critical)

The Voronoi viewport system uses raw WebGL for stencil operations:

```javascript
// Phase 1: Write ALL masks first
for (const cell of cells) {
  gl.stencilFunc(gl.ALWAYS, cell.refValue, 0xFF);
  gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
  // render mask geometry
}

// Phase 2: Render ALL scenes
for (const cell of cells) {
  gl.stencilFunc(gl.EQUAL, cell.refValue, 0xFF);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  // render scene with cell's camera
}
```

**Do NOT use** Three.js material stencil properties (`material.stencilWrite`, etc.)—they interfere with WebGL state.

### Camera Techniques

| Cell Type | Technique | How It Works |
|-----------|-----------|--------------|
| 3D world | Viewport offset | Shift viewport position so camera center aligns with seed |
| 2D UI | Frustum adjustment | Adjust ortho camera bounds so origin maps to seed position |

### Chunk Loading

- Chunks are 2000×2000 world units
- Grid spacing: 25 units (~6400 triangles per chunk)
- Load radius: 5 chunks (11×11 grid for high altitude)
- Web worker generates geometry, returns Transferable Float32Arrays
- Priority queue favors chunks in flight direction

## Coding Conventions

- ES6 modules, simple classes
- No TypeScript (vanilla JS)
- JSDoc comments for public methods
- One primary class per file
- Minimal dependencies

### Naming

- **Classes:** PascalCase (`ChunkManager.js`, `Aircraft.js`)
- **Utils/data:** camelCase (`seededRandom.js`, `hash.js`)
- **Specs:** kebab-case (`spec-voronoi-viewport-implementation.md`)

## Development Commands

```bash
npm install
npm run dev      # Dev server at localhost:5173
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Current Controls

| Key | Function |
|-----|----------|
| W/S | Throttle up/down |
| A/D | Turn left/right |
| Q/E | Descend/climb |
| 1/2/3 | Time preset (dawn/noon/night) |
| L/K/I/U | Lighting adjustments (debug) |

## Next Development Phase

**Phase 2: Controls and UI**

Per `spec-control-ui.md`:
- Virtual stick with position hold (A/D deflect, C centers)
- Throttle with afterburner zone (Shift held)
- Control indicators (stick position, throttle bar)
- Radial menus (right-click context)
- Minimap (2D canvas overlay)
- Panel system with fade-on-idle

**Phase 3: Flight Model**

Per GDD:
- Energy model (speed ↔ altitude trade)
- Turn rate based on speed and G
- Stall behavior below minimum speed
- Structural limits (G damage)

## Known Issues / TODOs

1. **Multi-center chunk loading:** Target cells viewing distant positions need their own terrain. `ChunkManager` currently only loads around player.

2. **Visibility hysteresis:** Targets at screen edge may flicker between on-screen/off-screen. Need deadzone.

3. **Cell size limits:** No enforcement of minimum cell size or maximum cell count.

4. **Distance labels:** Cell boundaries should display range to target.

## What NOT to Do

- Don't use React, Vue, or Angular
- Don't fall back to WebGL1 (WebGL2 required for stencil)
- Don't render cells to textures (use stencil masking at native resolution)
- Don't use Three.js material stencil properties (use raw GL)
- Don't add networked multiplayer (not in scope)
- Don't anti-alias sprites (preserve 8-bit hard edges)
- Don't use `scene.background` with stencil rendering (causes corruption)

## Reference

- **GDD:** `docs/voronoi-skies-gdd.md` — Full game design
- **Viewport Spec:** `docs/spec-voronoi-viewport.md` — Stencil rendering details
- **Control Spec:** `docs/spec-control-ui.md` — Input and UI design