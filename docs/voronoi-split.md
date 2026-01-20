# Spec: Multi-Vertex Voronoi Split-Screen

** DEPRECATED: This approach has been superseded by the better 'spec-voronoi-viewport-implementation.md' **

**Goal:** A general-purpose split-screen system where one cell follows the player and zero or more cells show remote points of interest. Cell vertices encode bearing; cell boundaries encode distance.

---

## 1. Core Concepts

### 1.1 The Screen as a Voronoi Diagram

The screen is tessellated by a Voronoi diagram computed from vertices:

- **Player vertex:** Always at screen center (or near-center with threat offset)
- **Target vertices:** Placed at screen edge, positioned by bearing to target

The player always has a cell. Targets only get cells when off-screen.

### 1.2 Visibility Rule

```
For each target:
  Project target world position → screen space (using player camera)
  
  If inside screen bounds:
    Target is VISIBLE → no cell needed, render in main view
  
  If outside screen bounds:
    Target is OFF-SCREEN → create vertex at screen edge
```

This means split-screen is a fallback. Direct visibility is preferred.

### 1.3 Edge Vertex Positioning

When a target is off-screen, place its vertex where a ray from screen center to the target intersects the screen boundary:

```
Screen center: C = (screenW/2, screenH/2)
Target projected position: T = (tx, ty)  // may be far outside screen

Ray direction: D = normalize(T - C)

Intersect ray with screen rectangle [0, 0, screenW, screenH]
→ Edge point E

Inset slightly: E' = E - D * insetDistance  // e.g., 20 pixels

Place vertex at E'
```

**Result:** Vertex position on screen edge encodes bearing to target.

---

## 2. Coordinate Systems

### 2.1 World Space

- Origin: arbitrary (e.g., player start position)
- Units: feet (1 unit = 1 foot)
- Axes: X = east, Y = altitude, Z = north (or your existing convention)

### 2.2 Screen Space

- Origin: top-left corner
- Units: pixels
- Axes: X = right, Y = down

### 2.3 Player-Relative World Space (2D)

For edge intersection, we work in a 2D top-down view:

- Player at origin
- Player heading rotated to point "up" (+Y in screen terms)
- Target positions transformed relative to player

```javascript
function worldToPlayerRelative(targetPos, playerPos, playerHeading) {
  // Translate
  const dx = targetPos.x - playerPos.x;
  const dz = targetPos.z - playerPos.z;
  
  // Rotate so player heading = up
  const cos = Math.cos(-playerHeading);
  const sin = Math.sin(-playerHeading);
  
  return {
    x: dx * cos - dz * sin,   // right/left
    y: dx * sin + dz * cos    // ahead/behind
  };
}
```

---

## 3. Vertex Placement Algorithm

### 3.1 Player Vertex

```javascript
function getPlayerVertex(screenW, screenH) {
  return {
    id: 'player',
    type: 'player',
    x: screenW / 2,
    y: screenH / 2,
    worldPos: player.position  // for camera
  };
}
```

### 3.2 Target Vertex (Off-Screen)

```javascript
function getTargetVertex(target, player, screenW, screenH, inset = 20) {
  // Get target position relative to player (2D top-down)
  const rel = worldToPlayerRelative(target.position, player.position, player.heading);
  
  // Scale to screen-ish coordinates
  // This scale factor determines how "close" off-screen things appear
  // Use a large value so targets are always outside screen initially
  const scale = 0.1;  // world units to screen units (tune this)
  const tx = screenW / 2 + rel.x * scale;
  const ty = screenH / 2 - rel.y * scale;  // Y inverted (screen Y down, world Y up)
  
  // Check if on screen
  if (tx >= 0 && tx <= screenW && ty >= 0 && ty <= screenH) {
    return null;  // Visible in main view, no cell needed
  }
  
  // Find edge intersection
  const cx = screenW / 2;
  const cy = screenH / 2;
  const edge = rayRectIntersection(cx, cy, tx, ty, 0, 0, screenW, screenH);
  
  if (!edge) return null;  // Shouldn't happen, but safety
  
  // Inset from edge
  const dx = edge.x - cx;
  const dy = edge.y - cy;
  const len = Math.hypot(dx, dy);
  const insetX = edge.x - (dx / len) * inset;
  const insetY = edge.y - (dy / len) * inset;
  
  return {
    id: target.id,
    type: 'target',
    x: insetX,
    y: insetY,
    worldPos: target.position,
    range: Math.hypot(rel.x, rel.y)  // for distance display
  };
}
```

### 3.3 Ray-Rectangle Intersection

```javascript
function rayRectIntersection(x0, y0, x1, y1, left, top, right, bottom) {
  // Ray from (x0,y0) toward (x1,y1), intersect with rectangle
  const dx = x1 - x0;
  const dy = y1 - y0;
  
  let tMin = 0;
  let tMax = Infinity;
  
  // Check each edge
  const edges = [
    { axis: 'x', bound: left, sign: -1 },
    { axis: 'x', bound: right, sign: 1 },
    { axis: 'y', bound: top, sign: -1 },
    { axis: 'y', bound: bottom, sign: 1 }
  ];
  
  let hitT = Infinity;
  let hitPoint = null;
  
  // Left edge
  if (dx !== 0) {
    const t = (left - x0) / dx;
    const y = y0 + t * dy;
    if (t > 0 && y >= top && y <= bottom && t < hitT) {
      hitT = t;
      hitPoint = { x: left, y };
    }
  }
  
  // Right edge
  if (dx !== 0) {
    const t = (right - x0) / dx;
    const y = y0 + t * dy;
    if (t > 0 && y >= top && y <= bottom && t < hitT) {
      hitT = t;
      hitPoint = { x: right, y };
    }
  }
  
  // Top edge
  if (dy !== 0) {
    const t = (top - y0) / dy;
    const x = x0 + t * dx;
    if (t > 0 && x >= left && x <= right && t < hitT) {
      hitT = t;
      hitPoint = { x, y: top };
    }
  }
  
  // Bottom edge
  if (dy !== 0) {
    const t = (bottom - y0) / dy;
    const x = x0 + t * dx;
    if (t > 0 && x >= left && x <= right && t < hitT) {
      hitT = t;
      hitPoint = { x, y: bottom };
    }
  }
  
  return hitPoint;
}
```

---

## 4. Voronoi Computation

### 4.1 Collecting Vertices

```javascript
function computeVoronoiVertices(player, targets, screenW, screenH) {
  const vertices = [];
  
  // Player always present
  vertices.push(getPlayerVertex(screenW, screenH));
  
  // Add targets that are off-screen
  for (const target of targets) {
    const vertex = getTargetVertex(target, player, screenW, screenH);
    if (vertex) {
      vertices.push(vertex);
    }
  }
  
  return vertices;
}
```

### 4.2 Tessellation

```javascript
import { Delaunay } from 'd3-delaunay';

function computeVoronoiCells(vertices, screenW, screenH) {
  if (vertices.length === 1) {
    // Single cell, fullscreen
    return [{
      ...vertices[0],
      polygon: [[0,0], [screenW,0], [screenW,screenH], [0,screenH], [0,0]],
      aabb: { x: 0, y: 0, w: screenW, h: screenH }
    }];
  }
  
  const points = vertices.map(v => [v.x, v.y]);
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, screenW, screenH]);
  
  return vertices.map((vertex, i) => ({
    ...vertex,
    polygon: voronoi.cellPolygon(i),
    aabb: computeAABB(voronoi.cellPolygon(i))
  }));
}
```

---

## 5. Camera Per Cell

### 5.1 Player Cell Camera

The player camera is the main game camera:

```javascript
class PlayerCellCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(60, 1, 100, 500000);
  }
  
  update(player, terrainZ) {
    // Camera above player, looking down
    // terrainZ controls apparent altitude (perspective scaling)
    this.camera.position.set(0, player.screenY, player.screenZ);
    // Terrain group handles world positioning via transforms
  }
}
```

### 5.2 Target Cell Camera

Each target cell has its own camera looking at the target's world position:

```javascript
class TargetCellCamera {
  constructor(target) {
    this.target = target;
    this.camera = new THREE.PerspectiveCamera(60, 1, 100, 500000);
    this.altitudeOffset = 5000;  // Default view altitude above target
  }
  
  update(player, mergeProgress = 0) {
    // Position camera above target
    const targetAlt = this.target.elevation || 0;
    
    // Base position: above target, offset back along its heading (or player's view angle)
    const viewAlt = targetAlt + this.altitudeOffset;
    
    this.camera.position.set(
      this.target.position.x,
      viewAlt,
      this.target.position.z
    );
    
    this.camera.lookAt(
      this.target.position.x,
      targetAlt,
      this.target.position.z
    );
    
    // Handle merge transition (see Section 6)
    if (mergeProgress > 0) {
      this.blendTowardPlayer(player, mergeProgress);
    }
  }
}
```

---

## 6. Zoom Synchronization (Merge Transition)

### 6.1 The Problem

At distance, target cells benefit from independent zoom—a fixed "preview" altitude that shows the target clearly regardless of player altitude.

As player approaches, cells will merge. If zoom levels differ, there's a visual discontinuity.

### 6.2 Solution: Progressive Zoom Blending

Define a merge range where zoom levels begin synchronizing:

```javascript
const MERGE_START_RANGE = 5 * 6076;   // 5nm - begin blending zoom
const MERGE_COMPLETE_RANGE = 1 * 6076; // 1nm - zoom fully synchronized

function computeMergeProgress(range) {
  if (range > MERGE_START_RANGE) return 0;
  if (range < MERGE_COMPLETE_RANGE) return 1;
  
  return 1 - (range - MERGE_COMPLETE_RANGE) / (MERGE_START_RANGE - MERGE_COMPLETE_RANGE);
}
```

### 6.3 Blending Camera Parameters

```javascript
class TargetCellCamera {
  blendTowardPlayer(player, mergeProgress) {
    const t = smoothstep(mergeProgress);
    
    // Target's ideal camera state
    const targetCamPos = this.computeIdealPosition();
    const targetCamLookAt = this.computeIdealLookAt();
    const targetFOV = 60;
    
    // Player's camera state (what the unified view will be)
    const playerCamPos = player.camera.position.clone();
    // Transform player camera position to world space
    // (player camera is in screen space, need to account for terrain transform)
    const playerWorldCamPos = this.screenToWorldCameraPos(player);
    const playerCamLookAt = player.position;
    const playerFOV = player.camera.fov;
    
    // Interpolate
    this.camera.position.lerpVectors(targetCamPos, playerWorldCamPos, t);
    
    const blendedLookAt = new THREE.Vector3().lerpVectors(
      targetCamLookAt, 
      new THREE.Vector3(playerCamLookAt.x, playerCamLookAt.y, playerCamLookAt.z),
      t
    );
    this.camera.lookAt(blendedLookAt);
    
    this.camera.fov = lerp(targetFOV, playerFOV, t);
    this.camera.updateProjectionMatrix();
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
```

### 6.4 Behavior Summary

| Range | Merge Progress | Target Cell Zoom |
|-------|----------------|------------------|
| > 5nm | 0.0 | Independent (preview altitude) |
| 5nm → 1nm | 0.0 → 1.0 | Blending toward player zoom |
| < 1nm | 1.0 | Identical to player zoom |
| ~ 0.5nm | — | Cells merge, single view |

---

## 7. Distance Display on Cell Boundaries

### 7.1 Concept

The boundary between player cell and target cell communicates range. Options:

1. **Numeric label:** "12.4 nm" displayed on the edge
2. **Edge thickness:** Thicker edge = closer (inverse relationship)
3. **Edge color:** Gradient from blue (far) to red (close)
4. **Edge animation:** Pulse rate increases as range decreases

**Recommendation:** Numeric label is most readable. Add color as secondary cue.

### 7.2 Edge Labeling

```javascript
function drawCellBoundaries(cells, ctx) {
  // Find shared edges between player and target cells
  const playerCell = cells.find(c => c.type === 'player');
  
  for (const cell of cells) {
    if (cell.type === 'player') continue;
    
    // Find the shared edge between player cell and this cell
    const sharedEdge = findSharedEdge(playerCell.polygon, cell.polygon);
    
    if (sharedEdge) {
      // Draw the edge
      ctx.strokeStyle = getRangeColor(cell.range);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sharedEdge.p1.x, sharedEdge.p1.y);
      ctx.lineTo(sharedEdge.p2.x, sharedEdge.p2.y);
      ctx.stroke();
      
      // Draw distance label at edge midpoint
      const midX = (sharedEdge.p1.x + sharedEdge.p2.x) / 2;
      const midY = (sharedEdge.p1.y + sharedEdge.p2.y) / 2;
      const rangeNm = cell.range / 6076;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${rangeNm.toFixed(1)} nm`, midX, midY);
    }
  }
}

function findSharedEdge(poly1, poly2) {
  // Find edge that appears in both polygons (with tolerance for floating point)
  const tolerance = 1;  // pixels
  
  for (let i = 0; i < poly1.length - 1; i++) {
    const e1 = { p1: poly1[i], p2: poly1[i + 1] };
    
    for (let j = 0; j < poly2.length - 1; j++) {
      const e2 = { p1: poly2[j], p2: poly2[j + 1] };
      
      // Check if edges match (either direction)
      if (edgesMatch(e1, e2, tolerance)) {
        return e1;
      }
    }
  }
  
  return null;
}

function edgesMatch(e1, e2, tol) {
  const d1 = dist(e1.p1, e2.p1) + dist(e1.p2, e2.p2);
  const d2 = dist(e1.p1, e2.p2) + dist(e1.p2, e2.p1);
  return Math.min(d1, d2) < tol * 2;
}

function getRangeColor(range) {
  const nm = range / 6076;
  if (nm > 20) return '#4488ff';  // Blue - far
  if (nm > 10) return '#44ff88';  // Green - medium
  if (nm > 5) return '#ffff44';   // Yellow - getting close
  return '#ff4444';               // Red - close
}
```

---

## 8. Terrain Chunk Loading for Multiple Cells

### 8.1 The Problem

Currently, terrain chunks load around the player position. But target cells show different world positions—they need their own terrain.

### 8.2 Solution: Multiple Load Centers

The chunk manager accepts multiple "points of interest" for chunk loading:

```javascript
class ChunkManager {
  update(loadCenters, playerHeading, deltaTime) {
    // loadCenters = [{ x, z, priority }, ...]
    // priority affects load order (player = highest)
    
    // Collect all required chunks across all centers
    const requiredChunks = new Set();
    
    for (const center of loadCenters) {
      const chunks = this.getRequiredChunkCoords(center.x, center.z);
      for (const chunk of chunks) {
        requiredChunks.add(`${chunk.chunkX},${chunk.chunkY}`);
      }
    }
    
    // Load/unload based on combined requirements
    this.syncChunks(requiredChunks, playerHeading, deltaTime);
  }
}
```

### 8.3 Reduced Load Radius for Target Cells

Target cells typically show less terrain (smaller viewport, higher altitude). Use a smaller load radius:

```javascript
function getLoadCenters(player, targetCells) {
  const centers = [
    { x: player.x, z: player.z, radius: 5, priority: 1 }  // Full radius for player
  ];
  
  for (const cell of targetCells) {
    centers.push({
      x: cell.worldPos.x,
      z: cell.worldPos.z,
      radius: 2,      // Smaller radius for targets
      priority: 2     // Lower priority
    });
  }
  
  return centers;
}
```

### 8.4 Load Prioritization

When multiple centers need chunks, prioritize:

1. Player cell chunks (always load first)
2. Visible target cell chunks (in view right now)
3. Soon-to-be-visible chunks (based on player movement)

```javascript
calculatePriority(chunkX, chunkY, loadCenters, playerHeading) {
  let bestPriority = Infinity;
  
  for (const center of loadCenters) {
    const dist = this.chunkDistance(chunkX, chunkY, center.x, center.z);
    const priority = dist + center.priority * 10;  // Weight by center priority
    bestPriority = Math.min(bestPriority, priority);
  }
  
  return bestPriority;
}
```

---

## 9. Rendering Pipeline

### 9.1 Per-Frame Flow

```javascript
function renderFrame(player, targets, chunkManager, renderer) {
  // 1. Compute which targets need cells
  const vertices = computeVoronoiVertices(player, targets, screenW, screenH);
  
  // 2. Compute Voronoi tessellation
  const cells = computeVoronoiCells(vertices, screenW, screenH);
  
  // 3. Update chunk loading for all cell world positions
  const loadCenters = getLoadCenters(player, cells.filter(c => c.type === 'target'));
  chunkManager.update(loadCenters, player.heading, deltaTime);
  
  // 4. Update cameras (including merge blending)
  for (const cell of cells) {
    const range = cell.range || 0;
    const mergeProgress = computeMergeProgress(range);
    cell.camera.update(player, mergeProgress);
  }
  
  // 5. Render cells
  if (cells.length === 1) {
    // Fullscreen fast path
    renderFullscreen(cells[0], renderer);
  } else {
    // Multi-cell with stencil
    for (const cell of cells) {
      renderCellWithStencil(cell, renderer);
    }
  }
  
  // 6. Draw boundaries and labels
  drawCellBoundaries(cells, borderCtx);
  
  // 7. Draw HUD (no stencil)
  renderHUD(player);
}
```

### 9.2 Stencil Rendering (Per Cell)

```javascript
function renderCellWithStencil(cell, renderer) {
  const gl = renderer.getContext();
  const aabb = cell.aabb;
  
  // Scissor to AABB
  renderer.setScissorTest(true);
  renderer.setScissor(aabb.x, screenH - aabb.y - aabb.h, aabb.w, aabb.h);
  
  // Write polygon to stencil
  gl.enable(gl.STENCIL_TEST);
  gl.stencilMask(0xff);
  gl.clear(gl.STENCIL_BUFFER_BIT);
  gl.stencilFunc(gl.ALWAYS, 1, 0xff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
  gl.colorMask(false, false, false, false);
  gl.depthMask(false);
  
  renderPolygonToStencil(cell.polygon);
  
  // Render scene through stencil
  gl.stencilFunc(gl.EQUAL, 1, 0xff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  gl.colorMask(true, true, true, true);
  gl.depthMask(true);
  
  // Set camera aspect to match AABB
  cell.camera.aspect = aabb.w / aabb.h;
  cell.camera.updateProjectionMatrix();
  
  // Set viewport to AABB
  renderer.setViewport(aabb.x, screenH - aabb.y - aabb.h, aabb.w, aabb.h);
  
  // Position terrain for this cell's world position
  updateTerrainTransform(cell);
  
  renderer.render(scene, cell.camera);
  
  // Cleanup
  gl.disable(gl.STENCIL_TEST);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, screenW, screenH);
}
```

---

## 10. Implementation Chunks

Implementing the full Voronoi split screen functionality. See docs/voronoi-split.md for details. In the following, we want to reuse the debug target that is dropped and removed using the "V" key. Ib the below, when we say "target", we mean this debug target (a red ring).

### Chunk 1: Visibility Test

**Goal:** Determine if a target is on-screen or off-screen.

**Tasks:**
1. Project target world position to screen using player camera
2. Test if projected point is within screen bounds
3. Display result in debug HUD

**Acceptance:** HUD shows "VISIBLE" or "OFF-SCREEN" for test target.

### Chunk 2: Edge Intersection

**Goal:** Compute screen-edge vertex for off-screen target.

**Tasks:**
1. Implement `worldToPlayerRelative()`
2. Implement `rayRectIntersection()`
3. Visualize the computed edge point (draw a dot)
4. Verify point moves along edge as player rotates

**Acceptance:** Dot on screen edge correctly indicates bearing to off-screen target.

### Chunk 3: Two-Cell Voronoi

**Goal:** Render player cell and one target cell.

**Tasks:**
1. Compute Voronoi with two vertices (player center, target edge)
2. Implement stencil rendering for both cells
3. Player cell uses player camera
4. Target cell uses fixed overhead camera at target position

**Acceptance:** Screen splits into two regions. Each shows different world location.

### Chunk 4: Target Cell Camera

**Goal:** Target cell shows useful view of target location.

**Tasks:**
1. Create `TargetCellCamera` class
2. Position camera above target looking down
3. Test with airbase target—verify runway is visible

**Acceptance:** Target cell shows airbase from above, recognizable.

### Chunk 5: Zoom Blending

**Goal:** Smooth camera transition as range decreases.

**Tasks:**
1. Implement `computeMergeProgress()`
2. Implement `blendTowardPlayer()` 
3. Test by flying toward target—verify smooth zoom transition

**Acceptance:** No visual snap as cells approach merge. Zoom smoothly matches.

### Chunk 6: Distance Labels

**Goal:** Display range on cell boundary.

**Tasks:**
1. Implement `findSharedEdge()`
2. Draw edge with range-dependent color
3. Draw numeric label at edge midpoint

**Acceptance:** Boundary shows "12.4 nm" label, color shifts as range changes.

### Chunk 7: Multi-Center Chunk Loading

**Goal:** Load terrain for both player and target positions.

**Tasks:**
1. Modify `ChunkManager.update()` to accept multiple centers
2. Implement priority-based loading
3. Test with distant target—verify terrain loads around target

**Acceptance:** Target cell shows terrain even when 50nm from player.

### Chunk 8: Multiple Targets

**Goal:** Handle 2+ simultaneous target cells.

**Tasks:**
1. Extend vertex collection to multiple targets
2. Handle multiple shared edges for distance labels
3. Test with two airbases

**Acceptance:** Three-way split (player + two targets) renders correctly.

---

## 11. Open Questions

1. **Maximum cells:** At what point does the screen become unusable? 5 cells? 8? Need playtesting.

2. **Cell minimum size:** Below what size should a cell collapse to an icon? 60×60 pixels?

3. **Anchor vertices:** Still needed to prevent edge-claiming? Or does edge-inset solve this?

4. **Target visibility hysteresis:** When target is exactly at screen edge, it may flicker between visible/cell. Add deadzone?

5. **Performance with multiple chunk centers:** How many simultaneous load centers before frame drops? May need LOD for distant target terrain.

---

*Spec version: 1.0*
*Multi-vertex Voronoi split-screen with visibility-based cell creation*