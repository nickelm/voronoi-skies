# Voronoi Skies

A roguelite air combat game combining BVR (Beyond Visual Range) simulation depth with 8-bit pixel art aesthetics.

## Concept

The signature mechanic is a dynamic Voronoi split-screen: when you lock a target on radar, they get their own screen cell showing a zoomed view. Cell borders encode distance. As aircraft close to merge, cells collapse into a unified view. The screen layout *is* your situational awareness.

2D pixel art sprites fly through a 3D world viewed from above. Altitude matters—climb and the camera pulls back, terrain blurs, combat becomes abstract. Descend and you're in the weeds, immediate and spatial.

## Tech Stack

- Three.js (WebGL2)
- d3-delaunay for Voronoi tessellation
- Vite for dev/build

## Status

Early development. Current focus: 3D rendering foundation and Voronoi viewport system.

## Running Locally

```bash
npm install
npm run dev
```

## Controls

| Key | Action |
|-----|--------|
| W/S | Throttle |
| A/D | Turn |
| Q/E | Climb/Descend |
| Space | Fire |
| Tab | Cycle targets |

## Docs

- [Game Design Document](docs/voronoi-skies-gdd.md)
- [Voronoi Viewport Spec](docs/spec-voronoi-viewports.md)

## License

MIT License. See [LICENSE](LICENSE) for details.