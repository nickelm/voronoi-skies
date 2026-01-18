# Voronoi Skies - Claude Code Guide

## Project Overview

Voronoi Skies is a roguelite air combat game combining BVR (Beyond Visual Range) simulation depth with 8-bit pixel art aesthetics. The signature mechanic is a dynamic Voronoi split-screen: radar locks and navigation waypoints create screen cells showing different perspectives.

**Core design principle:** Simulation depth, visual humility. Complex systems (radar, missiles, flight dynamics) run under the hood; 2D sprites in 3D space keep the aesthetic distinctive.

## Tech Stack

- **Three.js** with WebGL2 (required)
- **d3-delaunay** for Voronoi tessellation
- **Vite** for build/dev server
- **Vanilla JS** (no React, no heavy frameworks)
- **GitHub Pages** for deployment

## Architecture

```
src/
├── core/           # Renderer, game loop, camera management
├── simulation/     # Flight model, physics, entity state
├── voronoi/        # Cell management, tessellation, seed positioning
├── terrain/        # Voronoi terrain shader, biomes, procedural generation
├── combat/         # Radar modes, missiles, damage model
├── navigation/     # TACAN, waypoints, approach systems
├── ui/             # HUD, CDI overlay, menus
├── audio/          # Engine sounds, RWR tones, radio
├── data/           # Aircraft stats, weapons, scenarios
└── util/           # Math helpers, coordinate transforms
```

## Key Design Decisions

### Rendering

- **Perspective camera:** Top-down view with true 3D depth
- **2D sprites as billboards:** Aircraft are pixel art textures on planes facing camera
- **Voronoi cells via stencil masking:** Each cell renders at native resolution using scissor rect (AABB) + stencil (polygon shape)
- **Fullscreen fast path:** Single cell = no stencil overhead, just render
- **Terrain:** Flat plane at y=0 with fragment shader generating Voronoi biomes

### Coordinate System

- **World units:** 1 unit = 1 foot
- **Y-axis:** Altitude (up)
- **X/Z plane:** Horizontal world space
- **Heading:** Radians, 0 = north (+Z), clockwise positive

### Voronoi Cell System

Cells are screen-space regions rendered via stencil buffer:

```
Fullscreen (default) → Radar lock acquired → Cell appears for target
                     → TACAN selected → Cell appears for airport
                     → Radio transmission → Cell appears for speaker
```

**Seed positioning:**
- Player seed: bottom-center, shifts away from threat centroid
- Target seeds: positioned by bearing from player
- Distance encoded in seed position (closer = seed nearer center = larger cell)

**Rendering pipeline:**
1. Compute Voronoi from seeds (d3-delaunay)
2. For each cell: scissor to AABB, stencil to polygon, render scene with cell's camera
3. Render borders on top
4. Render HUD overlays

### Flight Model

- **Energy model:** Speed + altitude tradeable
- **PID-style smoothing:** No instant snapping; commands interpolate
- **Stall and limits:** Below min speed = loss of control; excessive G = damage

### Camera Per Cell

Each world-view cell has its own PerspectiveCamera:

- **Player cell:** Above player, rotates with heading, altitude-reactive FOV
- **Target cells:** Above target, zoom based on lock quality (STT > TWS > search)
- **TACAN cell:** Above airport, zoom based on distance

## File Structure

- **Classes:** PascalCase (`VoronoiManager.js`, `FlightModel.js`)
- **Data/utils:** camelCase (`aircraft.js`, `mathUtils.js`)
- **Shaders:** lowercase with extension (`terrain.frag`, `terrain.vert`)
- **Specs/docs:** kebab-case markdown (`spec-voronoi-viewports.md`)

## Coding Conventions

- ES6 modules, simple classes
- No TypeScript (vanilla JS)
- JSDoc comments for public methods
- Keep modules focused: one primary class per file
- Minimal dependencies

## Common Tasks

### Adding a Voronoi cell type

1. Define cell type in `voronoi/CellTypes.js`
2. Add seed positioning logic in `voronoi/SeedPositioner.js`
3. Add camera setup in `voronoi/CellCamera.js`
4. Add any overlay content (CDI, portrait) in `ui/`

### Adding an aircraft type

1. Add performance data to `data/aircraft.js`
2. Add sprite to `public/sprites/`
3. Ensure flight model constants are reasonable

### Adding terrain biome

1. Modify fragment shader in `terrain/terrain.frag`
2. Add color palette for biome
3. Update noise thresholds for biome distribution

### Adding a navigation aid

1. Define data structure in `navigation/`
2. Add cell behavior in `voronoi/`
3. Add overlay (CDI, etc.) in `ui/`

## Shader Conventions

Terrain is rendered via fragment shader on a flat plane:

- Uniforms prefixed with `u` (`uTime`, `uSeed`, `uWorldOffset`)
- Varyings prefixed with `v` (`vUv`, `vWorldPos`)
- Keep shaders simple; debug on CPU first if possible
- Target WebGL2 (GLSL ES 3.0)

## Testing Locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/`

## Build for Production

```bash
npm run build
```

Output in `dist/`. Deploy to GitHub Pages.

## Reference Documents

- **Game Design Document:** `docs/voronoi-skies-gdd.md`
- **Voronoi Viewport Spec:** `docs/spec-voronoi-viewports.md`
- **TACAN Approach Spec:** `docs/spec-tacan-approach.md`

## Current Development Phase

**Phase 0: Foundation**
- Three.js scene with perspective camera
- Voronoi terrain shader (biomes, day/night)
- Aircraft billboard sprite
- Basic flight controls
- Shadow beneath aircraft

**Phase 1: Voronoi Split-Screen**
- Stencil + scissor cell rendering
- Player cell + one target cell
- Dynamic seed positioning
- Border rendering

**Next:** TACAN approach as first cell implementation (navigation before combat)

## What NOT to Do

- Don't use React, Vue, or Angular
- Don't fall back to WebGL1 (WebGL2 required for stencil/texture features)
- Don't render cells to textures (use stencil masking at native resolution)
- Don't add networked multiplayer (not in scope)
- Don't model stealth or 5th-gen aircraft (keeps scope manageable)
- Don't anti-alias sprites (preserve 8-bit hard edges)