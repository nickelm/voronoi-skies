# Voronoi Split-Screen Implementation Specification

**Version:** 1.2  
**Purpose:** Comprehensive implementation guide capturing key design decisions, rationale, and critical implementation details for the Voronoi viewport system.

---

## 1. System Overview

The Voronoi split-screen dynamically subdivides the display into cells based on tracked entities (player aircraft, radar contacts, navigation aids). Each cell shows a different perspective of the 3D world, representing **radar awareness rather than visual line-of-sight**. Distant targets that would be invisible in a traditional view get their own screen cells, magnified according to lock quality.

### 1.1 Core Abstraction

```
ViewportManager
├── VoronoiLayout          # Computes cell polygons from seeds
├── Viewport[]             # Renderable screen regions
│   ├── camera             # THREE.PerspectiveCamera or OrthographicCamera
│   ├── stencilRef         # Unique stencil reference value
│   ├── target             # What this viewport tracks
│   └── type               # 'player' | 'target' | 'ui'
└── renderSequence()       # Orchestrates multi-pass rendering
```

### 1.2 Design Principles

1. **Native resolution everywhere:** All cells render at screen resolution, masked by stencil buffer
2. **Stencil masking, not render targets:** Avoids texture scaling artifacts
3. **Fullscreen fast path:** Single cell = no stencil overhead
4. **Separation of concerns:** Layout algorithm ≠ rendering abstraction ≠ semantic content
5. **On-screen merges, off-screen isolates:** Visible targets share the player's view; distant targets get independent cells
6. **Mixed 2D/3D cells:** UI instrument cells use orthographic cameras; world cells use perspective cameras

### 1.3 Cell Types

| Type | Camera | Viewport Technique | Use Case |
|------|--------|-------------------|----------|
| `player` | Perspective | Standard (no offset) | Main player view |
| `target` | Perspective | Viewport offset | Off-screen radar contacts |
| `ui` | Orthographic | Frustum adjustment | Instruments (altimeter, compass) |

---

## 2. Rendering Architecture

### 2.1 Why Stencil Masking (Not Render Targets)

Early prototypes considered rendering each cell to a texture, then compositing. This fails because:

- **Resolution mismatch:** A 200×150 pixel cell rendered to 512×512 texture then downscaled looks terrible
- **Variable cell sizes:** Player cell might be 1400×900 while target cell is 200×150
- **Not intentionally pixelated:** The 8-bit aesthetic is pixel art at native resolution, not undersampled 3D

Stencil masking renders everything at native screen resolution. The GPU's fragment shader runs for every pixel; the stencil buffer determines which cell "owns" that pixel.

### 2.2 Critical Render Sequence

**The key insight:** Write ALL stencil masks first, THEN render ALL scenes.

The naive approach fails:

```javascript
// WRONG: Interleaved mask/render
for (cell of cells) {
  clearStencil();      // ← Destroys previous masks!
  writeMask(cell);
  renderScene(cell);
}
```

Correct approach:

```javascript
// CORRECT: Two-phase rendering
// Phase 0: Clear all buffers with raw GL
gl.clearColor(0.067, 0.133, 0.2, 1);  // Background color
gl.clearStencil(0);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

// Phase 1: Write all masks
for (const cell of onScreenCells) {
  writeMask(cell.polygon, 1);  // On-screen cells share ref=1
}
for (let i = 0; i < exclusiveCells.length; i++) {
  writeMask(exclusiveCells[i].polygon, i + 2);  // ref values: 2, 3, 4...
}

// Phase 2: Render all scenes
renderCell(playerCamera, 1, playerCell, scene);           // 3D player view
for (let i = 0; i < exclusiveCells.length; i++) {
  const cell = exclusiveCells[i];
  if (cell.type === 'target') {
    renderCell(targetCameras[cell.id], i + 2, cell, scene);  // 3D target view
  } else if (cell.type === 'ui') {
    renderUiCell(uiCameras[cell.id], i + 2, cell, uiScenes[cell.id]);  // 2D UI
  }
}
```

### 2.3 WebGL State Management

**Use raw WebGL calls, not Three.js material properties.** Three.js material stencil properties (`material.stencilWrite`, etc.) proved unreliable—the renderer's internal state management interferes.

```javascript
const gl = renderer.getContext();

// Mask writing phase
function writeMask(polygon, refValue) {
  const mask = createMaskMesh(polygon);
  if (!mask) return;
  
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.ALWAYS, refValue, 0xFF);
  gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
  gl.stencilMask(0xFF);
  
  maskScene.add(mask);
  renderer.render(maskScene, maskCamera);
  maskScene.remove(mask);
  
  gl.disable(gl.STENCIL_TEST);
  
  mask.geometry.dispose();
  mask.material.dispose();
}
```

### 2.4 Mask Mesh Configuration

The mask mesh material must have specific properties to write stencil without affecting color/depth:

```javascript
function createMaskMesh(polygon) {
  if (!polygon || polygon.length < 3) return null;
  
  // Convert screen coords to NDC
  const ndc = polygon.map(([x, y]) => [
    (x / screenW) * 2 - 1,
    1 - (y / screenH) * 2  // Y flipped
  ]);
  
  // Fan triangulation from first vertex
  const positions = [];
  for (let i = 1; i < ndc.length - 1; i++) {
    positions.push(ndc[0][0], ndc[0][1], 0);
    positions.push(ndc[i][0], ndc[i][1], 0);
    positions.push(ndc[i + 1][0], ndc[i + 1][1], 0);
  }
  
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  
  const mat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide  // Required for reliable stencil writes
  });
  
  return new THREE.Mesh(geo, mat);
}
```

### 2.5 NDC Coordinates for Mask Geometry

Use Normalized Device Coordinates `[-1, +1]` for mask polygons. This eliminates pixel-to-screen coordinate conversion and Y-flip bugs.

```javascript
// Mask camera: fixed NDC orthographic
const maskCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
```

### 2.6 Renderer Configuration

```javascript
const renderer = new THREE.WebGLRenderer({
  antialias: false,    // Preserve pixel edges
  stencil: true        // MUST be explicit—not enabled by default
});
renderer.autoClear = false;  // We control clearing manually

// CRITICAL: Do NOT set scene.background
// Let raw GL clearColor handle background
```

---

## 3. Rendering 3D World Cells

### 3.1 The Viewport Offset Technique

**Key insight:** Each cell's camera renders its subject at NDC (0,0)—the center of the rendered image. To make this appear at the Voronoi seed position instead of screen center, we offset the viewport.

```javascript
function renderCell(camera, refValue, cell, targetScene) {
  if (!cell || !cell.polygon) return;
  
  // Offset viewport so camera center aligns with seed position
  const vpX = cell.x - screenW / 2;
  const vpY = (screenH - cell.y) - screenH / 2;  // Flip Y for WebGL
  
  renderer.setViewport(vpX, vpY, screenW, screenH);
  
  camera.aspect = screenW / screenH;
  camera.updateProjectionMatrix();
  
  gl.clear(gl.DEPTH_BUFFER_BIT);  // Clear depth between cells
  
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.EQUAL, refValue, 0xFF);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  gl.stencilMask(0x00);  // Don't modify stencil during scene render
  
  renderer.render(targetScene, camera);
  
  gl.disable(gl.STENCIL_TEST);
  
  renderer.setViewport(0, 0, screenW, screenH);  // Reset viewport
}
```

The viewport is always `screenW × screenH`; only its position changes. The stencil mask clips everything outside the Voronoi polygon. **No scissor test needed.**

### 3.2 Why Not AABB Viewports

**Original plan:** Use scissor rect (AABB of polygon) plus stencil for each cell.

**Problem discovered:** When the player cell's AABB becomes non-square (e.g., a horizontal strip when split line goes left-to-right), setting viewport to AABB and adjusting camera aspect ratio causes visible distortion.

**Solution:** All cameras use full screen aspect ratio. The viewport is always `screenW × screenH`; only its position changes. Stencil clipping handles the irregular Voronoi boundaries.

### 3.3 Camera Positioning and Orientation

Each cell has its own `THREE.PerspectiveCamera`. The scene rotates by player heading, so all cameras need consistent orientation.

**Player camera:**
- Position: Above player at fixed height
- Rotation: `up` vector set to (0, 0, -1) so heading "up" on screen

**Target camera:**
- Position: Above the target's world position (rotated by player heading)
- Rotation: Same `up` vector as player camera
- Zoom: Based on lock quality or distance, with altitude blending near screen edge

```javascript
function updatePlayerCamera() {
  playerCamera.position.set(0, PLAYER_CAM_HEIGHT, 0);
  playerCamera.up.set(0, 0, -1);
  playerCamera.lookAt(0, 0, 0);
  playerCamera.aspect = screenW / screenH;
  playerCamera.updateProjectionMatrix();
}

function updateTargetCamera(targetId, worldX, worldZ, blendedAltitude) {
  const camera = targetCameras[targetId];
  if (!camera) return;
  
  // Apply player heading rotation to world position
  const headingRad = playerHeading * Math.PI / 180;
  const rotX = worldX * Math.cos(headingRad) + worldZ * Math.sin(headingRad);
  const rotZ = -worldX * Math.sin(headingRad) + worldZ * Math.cos(headingRad);
  
  camera.position.set(rotX, blendedAltitude, rotZ);
  camera.up.set(0, 0, -1);
  camera.lookAt(rotX, 0, rotZ);
  camera.aspect = screenW / screenH;
  camera.updateProjectionMatrix();
}
```

---

## 4. Rendering 2D UI Cells

### 4.1 The Problem

2D UI cells (instruments, gauges, HUD elements) require orthographic projection and have no world position. The viewport offset technique used for 3D cells doesn't work because:

1. UI content is defined in screen-space pixels, not world units
2. Orthographic cameras don't have "look at" semantics the same way
3. Viewport offset would distort the pixel-perfect UI rendering

### 4.2 The Frustum Adjustment Technique

**Key insight:** Instead of offsetting the viewport, adjust the orthographic camera's frustum so that the origin (0,0) in the UI scene maps to the cell's seed position on screen.

```javascript
function renderUiCell(camera, refValue, cell, targetScene) {
  if (!cell || !cell.polygon) return;
  
  // Adjust ortho camera frustum so origin maps to seed position
  camera.left = -cell.x;
  camera.right = screenW - cell.x;
  camera.top = cell.y;
  camera.bottom = cell.y - screenH;
  camera.updateProjectionMatrix();
  
  // Standard viewport (no offset)
  renderer.setViewport(0, 0, screenW, screenH);
  
  gl.clear(gl.DEPTH_BUFFER_BIT);
  
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.EQUAL, refValue, 0xFF);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  gl.stencilMask(0x00);
  
  renderer.render(targetScene, camera);
  
  gl.disable(gl.STENCIL_TEST);
}
```

### 4.3 UI Scene Setup

Each UI cell has its own scene with orthographic camera:

```javascript
function setupUiCells() {
  for (const cell of uiCells) {
    // Orthographic camera - frustum adjusted at render time
    const cam = new THREE.OrthographicCamera(
      -screenW/2, screenW/2,
      screenH/2, -screenH/2,
      0.1, 100
    );
    cam.position.z = 10;
    uiCameras[cell.id] = cam;
    
    const uiScene = new THREE.Scene();
    // NO scene.background - causes stencil issues
    
    // Background quad (explicit, not scene.background)
    const bgQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(UI_CELL_SIZE * 3, UI_CELL_SIZE * 3),
      new THREE.MeshBasicMaterial({ color: 0x1a1a2a })
    );
    bgQuad.position.z = -5;
    uiScene.add(bgQuad);
    
    // Add instrument content centered at origin
    createInstrumentContent(uiScene, UI_CELL_SIZE);
    
    uiScenes[cell.id] = uiScene;
  }
}
```

### 4.4 UI Seed Positioning

UI cells have fixed screen positions (corners, edges):

```javascript
const SAFE_RECT_RATIO = 0.80;  // Inset from screen edges

function getUiSeedPosition(position) {
  const safeMarginX = screenW * (1 - SAFE_RECT_RATIO) / 2;
  const safeMarginY = screenH * (1 - SAFE_RECT_RATIO) / 2;
  
  switch (position) {
    case 'top-left':     return { x: safeMarginX, y: safeMarginY };
    case 'top-right':    return { x: screenW - safeMarginX, y: safeMarginY };
    case 'bottom-left':  return { x: safeMarginX, y: screenH - safeMarginY };
    case 'bottom-right': return { x: screenW - safeMarginX, y: screenH - safeMarginY };
  }
}
```

### 4.5 Why This Works

The frustum adjustment technique works because:

1. **Origin alignment:** When `camera.left = -cell.x`, the left edge of the frustum is at `-cell.x` in world units. Since the UI content is centered at origin, this places the center at screen position `cell.x`.

2. **No viewport distortion:** The viewport remains at standard position `(0, 0, screenW, screenH)`, preserving pixel-perfect rendering.

3. **Stencil compatibility:** The stencil mask was already written in screen coordinates, so the standard viewport aligns correctly.

4. **Scene isolation:** Each UI cell has its own scene and camera, so different instruments don't interfere.

---

## 5. Complete Render Loop

```javascript
function renderFrame() {
  const vertices = computeVoronoiVertices();
  const cells = computeVoronoiCells(vertices);
  
  const onScreenCells = cells.filter(c => c.onScreen);
  const offScreenTargetCells = cells.filter(c => !c.onScreen && c.type === 'target');
  const uiCellsList = cells.filter(c => c.type === 'ui');
  const allExclusiveCells = [...offScreenTargetCells, ...uiCellsList];
  
  // Update target cameras
  for (const cell of offScreenTargetCells) {
    const worldPos = getTargetWorldPosition(cell.target);
    const projected = projectToScreen(worldPos.x, worldPos.z);
    const blendedAlt = getBlendedAltitude(cell.target, projected.x, projected.y);
    updateTargetCamera(cell.id, cell.worldX, cell.worldZ, blendedAlt);
  }
  
  // === RENDER ===
  
  // 1. Clear all buffers with raw GL
  gl.clearColor(0.067, 0.133, 0.2, 1);
  gl.clearStencil(0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  
  if (allExclusiveCells.length === 0) {
    // Fast path: no exclusive cells, simple render
    renderer.render(scene, playerCamera);
  } else {
    // 2. Write ALL stencil masks
    for (const cell of onScreenCells) {
      if (cell.polygon) writeMask(cell.polygon, 1);
    }
    for (let i = 0; i < allExclusiveCells.length; i++) {
      const cell = allExclusiveCells[i];
      if (cell.polygon) writeMask(cell.polygon, i + 2);
    }
    
    // 3. Render player/merged cell (3D, ref=1)
    const playerCell = onScreenCells.find(c => c.type === 'player');
    if (playerCell) {
      renderCell(playerCamera, 1, playerCell, scene);
    }
    
    // 4. Render each exclusive cell
    for (let i = 0; i < allExclusiveCells.length; i++) {
      const cell = allExclusiveCells[i];
      const refValue = i + 2;
      
      if (cell.type === 'target') {
        // 3D world cell - viewport offset technique
        renderCell(targetCameras[cell.id], refValue, cell, scene);
      } else if (cell.type === 'ui') {
        // 2D UI cell - frustum adjustment technique
        const uiScene = uiScenes[cell.id];
        const uiCamera = uiCameras[cell.id];
        if (uiScene && uiCamera) {
          renderUiCell(uiCamera, refValue, cell, uiScene);
        }
      }
    }
  }
  
  // 5. Draw overlay (borders, labels) via 2D canvas
  drawOverlay(cells, offScreenTargetCells, uiCellsList);
}
```

---

## 6. Voronoi Layout and Seed Placement

### 6.1 Seed Placement Strategy

Seeds determine cell shapes. The Voronoi diagram is computed in screen space.

**Player seed:** Always at screen center.

**On-screen target seeds:** Placed at their projected screen position. These targets are visible in the player's view, so their seeds "defend" their screen territory but render with the player's camera.

**Off-screen target seeds:** Placed at the screen edge along the bearing from player to target, inset slightly (30px) to keep the Voronoi cell visible.

**UI cell seeds:** Fixed positions at screen corners, inset by `SAFE_RECT_RATIO`.

```javascript
function computeVoronoiVertices() {
  const vertices = [];
  
  // Player seed at center
  vertices.push({
    id: 'player',
    x: screenW / 2,
    y: screenH / 2,
    type: 'player',
    onScreen: true
  });
  
  // Target seeds
  for (const target of targets) {
    const worldPos = getTargetWorldPosition(target);
    const projected = projectToScreen(worldPos.x, worldPos.z);
    const onScreen = projected.visible;
    
    let seedX, seedY;
    if (onScreen) {
      seedX = projected.x;
      seedY = projected.y;
    } else {
      const edge = rayToScreenEdge(projected.x, projected.y);
      const dx = edge.x - screenW / 2;
      const dy = edge.y - screenH / 2;
      const len = Math.hypot(dx, dy);
      seedX = edge.x - (dx / len) * SCREEN_INSET;
      seedY = edge.y - (dy / len) * SCREEN_INSET;
    }
    
    vertices.push({
      id: target.id,
      x: seedX,
      y: seedY,
      type: 'target',
      worldX: worldPos.x,
      worldZ: worldPos.z,
      target: target,
      onScreen: onScreen
    });
  }
  
  // UI cell seeds
  for (const uiCell of uiCells) {
    if (!uiCell.enabled) continue;
    const pos = getUiSeedPosition(uiCell.position);
    vertices.push({
      id: uiCell.id,
      x: pos.x,
      y: pos.y,
      type: 'ui',
      uiCell: uiCell,
      onScreen: false  // UI cells always render independently
    });
  }
  
  return deconflictSeeds(vertices);
}
```

### 6.2 Seed Deconfliction

When multiple off-screen targets share similar bearings, their seeds would overlap, causing cell flickering.

**Solution:** Offset seeds tangentially along the screen edge using deterministic displacement based on target index (not position).

```javascript
function deconflictSeeds(vertices) {
  const MIN_SEED_DISTANCE = 40;
  const cx = screenW / 2;
  const cy = screenH / 2;
  
  const offScreenSeeds = vertices.filter(v => v.type === 'target' && !v.onScreen);
  
  for (const seed of offScreenSeeds) {
    for (const other of offScreenSeeds) {
      if (seed === other) continue;
      
      const dist = Math.hypot(seed.x - other.x, seed.y - other.y);
      if (dist < MIN_SEED_DISTANCE) {
        const edgeDx = seed.x - cx;
        const edgeDy = seed.y - cy;
        const edgeLen = Math.hypot(edgeDx, edgeDy);
        const tangentX = -edgeDy / edgeLen;
        const tangentY = edgeDx / edgeLen;
        
        const offset = (MIN_SEED_DISTANCE - dist) / 2 + 5;
        const sign = seed.targetIndex < other.targetIndex ? 1 : -1;
        seed.x += tangentX * offset * sign;
        seed.y += tangentY * offset * sign;
      }
    }
  }
  
  return vertices;
}
```

### 6.3 Cell Merging Logic

**The critical insight: on-screen cells merge, off-screen cells and UI cells never merge.**

- All on-screen cells (player + visible targets) write to stencil ref=1 and render once with the player camera
- Each off-screen target gets its own stencil ref (2, 3, 4…) and renders with its own camera
- Each UI cell gets its own stencil ref and renders with its orthographic camera

---

## 7. Zoom Synchronization for Merge

### 7.1 The Merge Problem

When an off-screen target transitions to on-screen, its cell merges with the player's view. If the target cell had a different zoom level (camera altitude), there's a visual discontinuity at the boundary.

### 7.2 Progressive Blending

As target approaches the screen edge from off-screen:

| Distance from Edge | Zoom Behavior |
|-------------------|---------------|
| > VISIBILITY_MARGIN | On-screen, merged with player zoom |
| VISIBILITY_MARGIN → -BLEND_MARGIN | Progressive blend |
| < -BLEND_MARGIN | Independent zoom (target's preferred altitude) |

```javascript
const VISIBILITY_MARGIN = 50;
const BLEND_MARGIN = 100;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function getBlendedAltitude(target, projectedX, projectedY) {
  const distToLeft = projectedX;
  const distToRight = screenW - projectedX;
  const distToTop = projectedY;
  const distToBottom = screenH - projectedY;
  const minDistToEdge = Math.min(distToLeft, distToRight, distToTop, distToBottom);
  
  if (minDistToEdge > VISIBILITY_MARGIN) {
    return PLAYER_CAM_HEIGHT;  // On-screen, use player zoom
  }
  
  if (minDistToEdge < -BLEND_MARGIN) {
    return target.camAltitude;  // Well off-screen, use target zoom
  }
  
  // Blend zone
  const t = smoothstep(-BLEND_MARGIN, VISIBILITY_MARGIN, minDistToEdge);
  return target.camAltitude + t * (PLAYER_CAM_HEIGHT - target.camAltitude);
}
```

---

## 8. Implementation Checklist

### 8.1 Prerequisites
- [ ] WebGLRenderer with `stencil: true`
- [ ] `renderer.autoClear = false`
- [ ] NO `scene.background` (use raw GL clearColor)
- [ ] d3-delaunay available

### 8.2 Phase 1: Basic Stencil
- [ ] Raw GL buffer clearing
- [ ] Stencil mask writing with raw GL
- [ ] Two cameras rendering different views
- [ ] Depth buffer clearing between cells

### 8.3 Phase 2: 3D World Cells
- [ ] VoronoiLayout computing from seeds
- [ ] NDC conversion for mask geometry
- [ ] Viewport offset technique for 3D cells
- [ ] Player + target cells working

### 8.4 Phase 3: 2D UI Cells
- [ ] Orthographic cameras for UI
- [ ] Frustum adjustment technique
- [ ] UI scenes with explicit backgrounds (no scene.background)
- [ ] Instrument content rendering

### 8.5 Phase 4: Mixed Rendering
- [ ] Cell type detection (player/target/ui)
- [ ] Correct render function dispatch
- [ ] All cell types coexisting

### 8.6 Phase 5: Polish
- [ ] Zoom blending at screen edges
- [ ] Seed deconfliction
- [ ] Border rendering (skip screen edges)
- [ ] Labels and overlays

---

## 9. Known Gotchas

### Renderer Configuration
1. **`renderer.autoClear` must be false** — otherwise Three.js clears stencil between mask write and scene render.
2. **NO `scene.background`** — causes stencil buffer corruption. Use raw `gl.clearColor()` instead.
3. **`stencil: true` in WebGLRenderer** — not enabled by default; stencil ops silently fail without it.

### Stencil Operations
4. **Write ALL masks first, THEN render ALL scenes** — interleaving breaks because `render()` disturbs GL state.
5. **Clear depth between cell renders** — each camera has different depth values; without depth clear, cells depth-reject each other.
6. **`side: THREE.DoubleSide` on mask material** — required for reliable stencil writes.
7. **Stencil ref values start at 1** — ref 0 means "no cell"; use 1, 2, 3... for actual cells.
8. **Max 255 cells** — stencil buffer is 8-bit. Practically, 6-8 cells before visual clutter.

### 2D UI Cells
9. **Use frustum adjustment, not viewport offset** — orthographic cameras require different technique than perspective.
10. **Explicit background quads** — don't use `scene.background` for UI scenes; it breaks stencil.
11. **UI cells always exclusive** — never merge with player cell (they're not world views).

### Coordinate Systems
12. **Y-flip everywhere** — Screen coords (0=top), WebGL (0=bottom), NDC (0=center). Convert carefully.
13. **Apply scene rotation when projecting** — world positions must be rotated by player heading before screen projection.

### Viewport Management
14. **3D cells: viewport offset technique** — offset viewport position, keep aspect ratio fixed.
15. **2D cells: frustum adjustment technique** — standard viewport position, adjust camera frustum.
16. **No scissor test needed** — stencil masking alone handles the irregular Voronoi boundaries.

### Cell Logic
17. **On-screen cells share stencil ref=1** — they render with player camera.
18. **Off-screen targets and UI cells get unique refs** — they render independently.
19. **Seed deconfliction uses index, not position** — prevents flickering when targets at similar bearings swap order.

---

## 10. File Organization

```
src/
├── viewport/
│   ├── ViewportManager.js    # Orchestration, render sequence
│   ├── Viewport.js           # Single viewport: camera, stencil, target
│   ├── ViewportTarget.js     # Abstract target interface
│   ├── PlayerTarget.js       # Player-specific: threat-reactive position
│   ├── EntityTarget.js       # Generic: radar contact, TACAN, missile
│   ├── UiCell.js             # 2D UI cell: instruments, gauges
│   └── VoronoiLayout.js      # Tessellation computation
├── ui/
│   ├── Altimeter.js          # Altimeter instrument
│   ├── Compass.js            # Compass instrument
│   └── UiSceneFactory.js     # Creates UI scenes with content
├── terrain/
│   └── ChunkManager.js       # Extended for multiple load centers
└── main.js                   # Game loop, delegates to ViewportManager
```

---

## 11. References

- **GDD Section:** "The Voronoi Radar Screen" — original design intent
- **Test:** `voronoi-split-test-final.html` — working prototype with 3D world cells + 2D UI cells

---

*Specification version 1.2*  
*Captures implementation decisions from January 2026 development*  
*Key techniques: two-phase stencil render, viewport offset (3D), frustum adjustment (2D)*