# CLAUDE.md - Voronoi Skies

## Project Overview

Voronoi Skies is a roguelite air combat simulation with 8-bit pixel art aesthetics and deep systems modeling. The signature mechanic is a dynamic Voronoi split-screen representing radar awareness.

**Design philosophy:** Simulation depth, visual humility. Complex systems (radar, missiles, flight dynamics) run under the hood; 8-bit rendering keeps scope manageable and aesthetic distinctive.

## Tech Stack

- **Renderer:** Three.js with OrthographicCamera (2D gameplay)
- **Voronoi:** d3-delaunay for cell computation
- **Shaders:** THREE.ShaderMaterial with inline GLSL strings (no vite-plugin-glsl)
- **Build:** Vite
- **Deploy:** GitHub Pages via Actions

## Project Structure

```
voronoi-skies/
├── src/
│   ├── main.js              # Entry point, game loop
│   ├── input.js             # Keyboard state management
│   ├── renderer.js          # Three.js setup, scene management
│   ├── voronoi.js           # d3-delaunay wrapper for radar cells
│   └── entities/
│       └── aircraft.js      # Player aircraft state and update logic
├── public/
│   └── sprites/             # Aircraft and missile PNGs (f-16, f-14, mig-29, aim-120)
├── index.html
├── package.json
├── vite.config.js
└── .github/workflows/deploy.yml
```

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

## Current State

**Working:**
- Three.js orthographic rendering with WebGLRenderer
- Basic flight controls (WASD for throttle/turn, Q/E for altitude)
- Game loop with delta time
- Debug display (FPS, position, heading, altitude, throttle, speed)
- d3-delaunay voronoi utilities

**Not yet implemented:**
- Sprite rendering for aircraft/missiles
- Voronoi cell content rendering (zoomed views per cell)
- Terrain shader with biomes
- Day/night cycle
- Enemy spawning and AI
- Radar lock system
- Missiles with guidance
- Cloud layer
- Landing/takeoff
- Sound

## Controls

| Key | Action |
|-----|--------|
| W/S | Throttle up/down |
| A/D | Turn left/right |
| Q/E | Climb/descend |
| SPACE | Lock nearest target |
| F | Fire missile |
| T | Advance time +1 hour |
| Y | Advance season |
| Click | Lock clicked cell's entity |

## Key Concepts

### Two Types of Voronoi Cells

1. **World cells** (player, enemies, missiles): Show the game world at different zoom levels. These are windows into the same continuous space.

2. **Overlay cells** (map, MFDs): Show abstracted information, not the game world. The map shows player position as a dot on a simplified terrain view.

### Coordinate System

- World coordinates: Large scale (1 unit ≈ 1 foot)
- Player always faces up on screen; world rotates around player
- Screen position of player shifts based on threat geometry (enemies push player away on screen)

### Shader Architecture (planned)

Custom shaders will use THREE.ShaderMaterial with inline GLSL:
```js
const material = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `...`,
  fragmentShader: `...`
});
```

## Immediate TODOs

1. Load sprite textures for aircraft using THREE.Sprite
2. Render player aircraft on screen
3. Implement Voronoi cell rendering for radar display
4. Add terrain visualization

## Code Conventions

- ES modules throughout
- Classes for major systems (GameRenderer, GameState, RadarVoronoi)
- Uniforms prefixed with `u` in shaders
- Keep shaders simple; move complexity to CPU where debugging is easier
- 8-bit aesthetic: quantize colors, avoid anti-aliasing, preserve hard edges

## Performance Notes

- Voronoi computed on GPU in fragment shader (fast)
- d3-delaunay used for radar cells only (few points, trivial)
- Target 60 FPS with 10+ entities
- Avoid per-frame allocations in game loop