/**
 * Rivers - Drainage graph computation for island terrain
 *
 * Rivers flow along edges from high corners to low corners.
 * Rivers are traced as continuous paths from coast to highlands.
 * Per spec section 2.6.
 */

/**
 * Build corner adjacency map from edges
 * @param {Object[]} edges - Array of Edge objects
 * @returns {Map<number, Set<number>>} - Corner ID to adjacent corner IDs
 */
function buildCornerAdjacency(edges) {
  const adjacency = new Map();

  for (const edge of edges) {
    const [c1, c2] = edge.corners;

    if (!adjacency.has(c1)) adjacency.set(c1, new Set());
    if (!adjacency.has(c2)) adjacency.set(c2, new Set());

    adjacency.get(c1).add(c2);
    adjacency.get(c2).add(c1);
  }

  return adjacency;
}

/**
 * Fill sinks (local minima) to ensure all land corners can drain to ocean.
 * Optionally creates lakes in significant depressions.
 * Uses priority flood algorithm - water rises from ocean until all land drains
 * @param {Object[]} corners - All corners
 * @param {Map<number, Set<number>>} adjacency - Corner adjacency map
 * @param {Object} config - Lake generation config
 * @param {number} [config.minLakeDepth=0.05] - Minimum depression depth to become lake
 * @param {number} [config.minLakeCorners=5] - Minimum corners in depression for lake
 * @param {number} [config.maxLakes=8] - Maximum number of lakes to create
 * @returns {Set<number>} Set of corner IDs that are lake surfaces
 */
function fillSinks(corners, adjacency, config = {}) {
  const {
    minLakeDepth = 0.05,
    minLakeCorners = 5,
    maxLakes = 8
  } = config;

  const n = corners.length;
  const filled = new Float32Array(n);
  const visited = new Uint8Array(n);
  const originalElev = new Float32Array(n);

  // Save original elevations and initialize
  for (let i = 0; i < n; i++) {
    originalElev[i] = corners[i].elevation;
    if (corners[i].elevation < 0) {
      filled[i] = corners[i].elevation;
    } else {
      filled[i] = Infinity;
    }
  }

  // Priority queue: [elevation, cornerIndex]
  const queue = [];

  // Seed with ocean corners
  for (let i = 0; i < n; i++) {
    if (corners[i].elevation < 0) {
      queue.push([filled[i], i]);
      visited[i] = 1;
    }
  }

  queue.sort((a, b) => a[0] - b[0]);

  // Track filled corners grouped by their fill level (pour point)
  // Map: pourPointElev -> array of {cornerIdx, originalElev, fillElev}
  const filledByPourPoint = new Map();

  // Process corners from lowest to highest
  while (queue.length > 0) {
    const [elev, idx] = queue.shift();

    const neighbors = adjacency.get(idx);
    if (!neighbors) continue;

    for (const neighborIdx of neighbors) {
      if (visited[neighborIdx]) continue;
      visited[neighborIdx] = 1;

      const neighborElev = corners[neighborIdx].elevation;

      if (neighborElev < elev) {
        // This corner is in a depression - track it
        filled[neighborIdx] = elev + 0.0001;
        const pourKey = elev.toFixed(4);
        if (!filledByPourPoint.has(pourKey)) {
          filledByPourPoint.set(pourKey, []);
        }
        filledByPourPoint.get(pourKey).push({
          cornerIdx: neighborIdx,
          originalElev: neighborElev,
          fillElev: elev
        });
      } else {
        filled[neighborIdx] = neighborElev;
      }

      const insertElev = filled[neighborIdx];
      let insertIdx = queue.findIndex(([e]) => e > insertElev);
      if (insertIdx === -1) insertIdx = queue.length;
      queue.splice(insertIdx, 0, [insertElev, neighborIdx]);
    }
  }

  // Identify significant depressions that could become lakes
  const depressions = [];
  console.log('[Rivers] Analyzing', filledByPourPoint.size, 'potential depression groups');

  for (const [pourKey, filledCorners] of filledByPourPoint) {
    // Calculate depression depth (how much we'd have to fill)
    const pourElev = parseFloat(pourKey);
    const depths = filledCorners.map(f => pourElev - f.originalElev);
    const maxDepth = Math.max(...depths);
    const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;

    if (filledCorners.length >= minLakeCorners && maxDepth >= minLakeDepth) {
      depressions.push({
        pourElev,
        corners: filledCorners,
        maxDepth,
        avgDepth
      });
      console.log('[Rivers] Depression found: corners=' + filledCorners.length +
        ', maxDepth=' + maxDepth.toFixed(4) + ', pourElev=' + pourElev.toFixed(4));
    }
  }

  // Sort by depth (deepest first) and select lakes
  depressions.sort((a, b) => b.maxDepth - a.maxDepth);
  const lakesToCreate = depressions.slice(0, maxLakes);

  // Create lakes - set their corners to lake elevation (slightly negative)
  const lakeCorners = new Set();
  for (const lake of lakesToCreate) {
    // Lake surface is just below the pour point
    const lakeSurfaceElev = -0.02; // Shallow water

    for (const { cornerIdx, originalElev } of lake.corners) {
      // Only make it a lake if original elevation was below pour point
      if (originalElev < lake.pourElev) {
        corners[cornerIdx].elevation = lakeSurfaceElev;
        corners[cornerIdx].isLake = true;
        lakeCorners.add(cornerIdx);
      }
    }
  }

  // Apply filled elevations to remaining corners (not lakes)
  let sinksFilledCount = 0;
  for (let i = 0; i < n; i++) {
    if (lakeCorners.has(i)) continue; // Skip lake corners
    if (filled[i] !== Infinity && filled[i] !== originalElev[i]) {
      corners[i].elevation = filled[i];
      sinksFilledCount++;
    }
  }

  console.log('[Rivers] Filled', sinksFilledCount, 'sink corners');
  console.log('[Rivers] Created', lakesToCreate.length, 'lakes with', lakeCorners.size, 'lake corners');

  return lakeCorners;
}

/**
 * Find downslope corner for a given corner (lowest adjacent neighbor)
 * @param {Object} corner - Source corner
 * @param {Object[]} corners - All corners
 * @param {Map<number, Set<number>>} adjacency - Corner adjacency map
 * @returns {number} - Downslope corner ID or -1 if none
 */
function findDownslope(corner, corners, adjacency) {
  const neighbors = adjacency.get(corner.id);
  if (!neighbors || neighbors.size === 0) return -1;

  let lowestId = -1;
  let lowestElevation = corner.elevation;

  for (const neighborId of neighbors) {
    const neighbor = corners[neighborId];
    if (neighbor && neighbor.elevation < lowestElevation) {
      lowestElevation = neighbor.elevation;
      lowestId = neighborId;
    }
  }

  return lowestId;
}

/**
 * Build upstream map (reverse of downslope)
 * @param {Object[]} corners - All corners with downslope set
 * @returns {Map<number, number[]>} - Corner ID to upstream corner IDs
 */
function buildUpstreamMap(corners) {
  const upstream = new Map();

  for (const corner of corners) {
    if (corner.downslope >= 0) {
      if (!upstream.has(corner.downslope)) {
        upstream.set(corner.downslope, []);
      }
      upstream.get(corner.downslope).push(corner.id);
    }
  }

  return upstream;
}

/**
 * Trace river upstream from a mouth corner, marking all edges
 * @param {number} mouthId - Starting corner ID (river mouth)
 * @param {Object[]} corners - All corners
 * @param {Map<number, number[]>} upstream - Upstream corner map
 * @param {Map<string, Object>} edgeByCorners - Edge lookup by corner pair
 * @param {number} minFlow - Minimum flow to continue tracing
 */
function traceRiverUpstream(mouthId, corners, upstream, edgeByCorners, minFlow, debug = false) {
  const stack = [mouthId];
  const visited = new Set();
  let edgesMarked = 0;
  let skippedLowFlow = 0;

  while (stack.length > 0) {
    const cornerId = stack.pop();
    if (visited.has(cornerId)) continue;
    visited.add(cornerId);

    const corner = corners[cornerId];
    if (!corner) continue;

    // Get all upstream corners
    const upstreamCorners = upstream.get(cornerId) || [];

    for (const upId of upstreamCorners) {
      const upCorner = corners[upId];
      if (!upCorner) continue;

      if (upCorner.water < minFlow) {
        skippedLowFlow++;
        continue;
      }

      // Mark the edge between these corners as river
      const key = cornerId < upId ? `${cornerId},${upId}` : `${upId},${cornerId}`;
      const edge = edgeByCorners.get(key);

      if (edge) {
        edge.isRiver = true;
        edge.riverFlow = Math.max(edge.riverFlow || 0, upCorner.water);
        edgesMarked++;
      }

      // Continue upstream
      stack.push(upId);
    }
  }

  if (debug) {
    console.log('[Rivers] Trace from mouth', mouthId, ': marked', edgesMarked, 'edges, skipped', skippedLowFlow, 'low-flow');
  }

  return edgesMarked;
}

/**
 * Generate river drainage network from corner elevations
 *
 * Algorithm:
 * 1. Build corner adjacency from edges
 * 2. Find downslope for each land corner
 * 3. Assign rainfall and accumulate flow high-to-low
 * 4. Find river mouths (high-flow corners draining to ocean)
 * 5. Trace each river upstream, marking continuous paths
 *
 * @param {Object[]} corners - Array of Corner objects with elevation
 * @param {Object[]} edges - Array of Edge objects
 * @param {Object[]} regions - Array of Region objects (for ocean check)
 * @param {Object} config - River generation config
 * @param {number} [config.rainfall=1.0] - Rainfall constant per corner
 * @param {number} [config.threshold=15] - Flow threshold for river mouth
 * @param {number} [config.minTributary=3] - Minimum flow to trace tributaries
 */
export function generateRivers(corners, edges, regions, config = {}) {
  const {
    rainfall = 1.0,
    threshold = 15,
    minTributary = 3,
    lakes = {}
  } = config;

  const {
    minLakeDepth = 0.05,
    minLakeCorners = 5,
    maxLakes = 8
  } = lakes;

  console.log('[Rivers] Config:', { rainfall, threshold, minTributary });
  console.log('[Rivers] Lake config:', { minLakeDepth, minLakeCorners, maxLakes });

  // Initialize all edges
  for (const edge of edges) {
    edge.isRiver = false;
    edge.riverFlow = 0;
  }

  // 1. Build corner adjacency from edges
  const adjacency = buildCornerAdjacency(edges);

  // 1.5. Fill sinks to ensure all land corners can drain to ocean
  // This also creates lakes in significant depressions
  const lakeCorners = fillSinks(corners, adjacency, {
    minLakeDepth,
    minLakeCorners,
    maxLakes
  });

  // Mark regions that touch lake corners as lakes
  if (lakeCorners.size > 0) {
    for (const region of regions) {
      if (region.isOcean) continue;

      // Check if any of the region's corners are lake corners
      // We need to find corners that belong to this region
      const regionCornerIds = new Set();
      for (const edge of edges) {
        if (edge.regions.includes(region.id)) {
          regionCornerIds.add(edge.corners[0]);
          regionCornerIds.add(edge.corners[1]);
        }
      }

      let lakeCornerCount = 0;
      for (const cid of regionCornerIds) {
        if (lakeCorners.has(cid)) lakeCornerCount++;
      }

      // If majority of corners are lake corners, mark region as lake
      if (lakeCornerCount > 0 && lakeCornerCount >= regionCornerIds.size / 2) {
        region.isLake = true;
        region.elevation = -0.02; // Lake surface elevation
      }
    }
  }

  // Find connected components of ocean regions and convert inland ones to lakes
  // Using flood-fill to identify ocean bodies that don't touch the outer boundary

  // First, compute the bounds to determine what "outer edge" means
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const region of regions) {
    const [cx, cy] = region.centroid;
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  }
  const boundaryThreshold = 0.9; // Regions within 90% of max distance are considered "outer"
  const maxDist = Math.max(maxX - minX, maxY - minY) / 2;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const visited = new Set();
  let inlandOceanConverted = 0;

  for (const region of regions) {
    if (!region.isOcean || region.isLake || visited.has(region.id)) continue;

    // Flood-fill to find this connected ocean component
    const component = [];
    const queue = [region.id];
    let isOuterOcean = false;

    while (queue.length > 0) {
      const rid = queue.shift();
      if (visited.has(rid)) continue;
      visited.add(rid);

      const r = regions[rid];
      if (!r || !r.isOcean || r.isLake) continue;

      component.push(rid);

      // Check if this region is near the outer boundary
      // (its centroid is far from the island center)
      const [cx, cy] = r.centroid;
      const distFromCenter = Math.sqrt((cx - centerX) ** 2 + (cy - centerY) ** 2);
      if (distFromCenter > maxDist * boundaryThreshold) {
        isOuterOcean = true;
      }

      // Add ocean neighbors to queue
      for (const nid of r.neighbors) {
        if (nid < 0 || visited.has(nid)) continue;
        const neighbor = regions[nid];
        if (neighbor && neighbor.isOcean && !neighbor.isLake) {
          queue.push(nid);
        }
      }
    }

    // If this ocean component is NOT near the outer boundary, it's an inland lake
    if (!isOuterOcean && component.length > 0) {
      for (const rid of component) {
        const r = regions[rid];
        r.isOcean = false;
        r.isLake = true;
        r.elevation = -0.02;
        inlandOceanConverted++;
      }
      console.log('[Rivers] Found inland water body with', component.length, 'regions');
    }
  }

  const lakeRegionCount = regions.filter(r => r.isLake).length;
  console.log('[Rivers] Total lake regions:', lakeRegionCount);
  if (inlandOceanConverted > 0) {
    console.log('[Rivers] Converted', inlandOceanConverted, 'inland ocean regions to lakes');
  }

  // 2. Find downslope for each corner and assign initial water
  let landCornerCount = 0;
  let withDownslopeCount = 0;
  let localMinimaCount = 0;

  for (const corner of corners) {
    // Skip corners below sea level
    if (corner.elevation < 0) {
      corner.downslope = -1;
      corner.water = 0;
      continue;
    }

    landCornerCount++;
    corner.downslope = findDownslope(corner, corners, adjacency);
    corner.water = rainfall;

    if (corner.downslope >= 0) {
      withDownslopeCount++;
    } else {
      localMinimaCount++;
    }
  }

  // Check elevation range
  const landElevations = corners.filter(c => c.elevation >= 0).map(c => c.elevation);
  const minLandElev = Math.min(...landElevations);
  const maxLandElev = Math.max(...landElevations);

  console.log('[Rivers] Land corners:', landCornerCount,
    'with downslope:', withDownslopeCount,
    'local minima:', localMinimaCount);
  console.log('[Rivers] Land elevation range:', minLandElev.toFixed(4), 'to', maxLandElev.toFixed(4));

  // Verify drainage - trace each land corner to see if it reaches ocean
  let reachesOcean = 0;
  for (const corner of corners) {
    if (corner.elevation < 0) continue;
    let current = corner;
    let steps = 0;
    const maxSteps = corners.length;
    while (current.downslope >= 0 && steps < maxSteps) {
      current = corners[current.downslope];
      steps++;
    }
    if (current.elevation < 0) {
      reachesOcean++;
    }
  }
  console.log('[Rivers] Land corners that can drain to ocean:', reachesOcean, '/', landCornerCount);

  // 3. Sort corners by elevation (descending) for flow accumulation
  const sortedCorners = [...corners].sort((a, b) => b.elevation - a.elevation);

  // 4. Accumulate flow (high-to-low order)
  for (const corner of sortedCorners) {
    if (corner.downslope >= 0 && corner.water > 0) {
      const downstream = corners[corner.downslope];
      if (downstream) {
        downstream.water = (downstream.water || 0) + corner.water;
      }
    }
  }

  // 5. Build upstream map for river tracing
  const upstream = buildUpstreamMap(corners);
  console.log('[Rivers] Upstream map size:', upstream.size, '(corners with upstream tributaries)');

  // 6. Create edge lookup by corner pair
  const edgeByCorners = new Map();
  for (const edge of edges) {
    const [c1, c2] = edge.corners;
    const key = c1 < c2 ? `${c1},${c2}` : `${c2},${c1}`;
    edgeByCorners.set(key, edge);
  }

  // 7. Find river mouths and trace upstream
  // A river mouth is a land corner with high flow that drains to an ocean corner
  let riverMouthCount = 0;
  const waterValues = corners.map(c => c.water || 0).filter(w => w > 0);
  const maxWater = Math.max(...waterValues);
  const avgWater = waterValues.reduce((a, b) => a + b, 0) / waterValues.length;
  const highFlowCorners = corners.filter(c => c.water >= threshold).length;

  console.log('[Rivers] Water stats - max:', maxWater.toFixed(1),
    'avg:', avgWater.toFixed(2),
    'corners with flow >= threshold:', highFlowCorners);

  // Debug: check how many land corners drain to ocean
  let drainsToOcean = 0;
  for (const corner of corners) {
    if (corner.downslope >= 0) {
      const downstream = corners[corner.downslope];
      if (downstream && downstream.elevation < 0) {
        drainsToOcean++;
      }
    }
  }
  console.log('[Rivers] Land corners directly draining to ocean:', drainsToOcean);

  for (const corner of corners) {
    if (corner.downslope < 0) continue;
    if (corner.water < threshold) continue;

    const downstream = corners[corner.downslope];
    if (!downstream) continue;

    // Check if downstream is ocean (or very low elevation)
    const isRiverMouth = downstream.elevation < 0;

    if (isRiverMouth) {
      riverMouthCount++;

      // Mark the edge to ocean
      const key = corner.id < corner.downslope
        ? `${corner.id},${corner.downslope}`
        : `${corner.downslope},${corner.id}`;
      const mouthEdge = edgeByCorners.get(key);
      if (mouthEdge) {
        mouthEdge.isRiver = true;
        mouthEdge.riverFlow = corner.water;
      }

      // Trace upstream from this mouth
      traceRiverUpstream(corner.id, corners, upstream, edgeByCorners, minTributary, true);
    }
  }

  const riverEdgeCount = edges.filter(e => e.isRiver).length;
  console.log('[Rivers] Found', riverMouthCount, 'river mouths,', riverEdgeCount, 'river edges');
}

/**
 * Find regions adjacent to river edges
 * @param {Object[]} regions - All regions
 * @param {Object[]} edges - All edges (with isRiver flag)
 * @returns {Set<number>} - Set of region IDs adjacent to rivers
 */
export function findRiverAdjacentRegions(regions, edges) {
  const riverAdjacent = new Set();

  for (const edge of edges) {
    if (!edge.isRiver) continue;

    for (const regionId of edge.regions) {
      if (regionId >= 0 && regions[regionId] && !regions[regionId].isOcean) {
        riverAdjacent.add(regionId);
      }
    }
  }

  return riverAdjacent;
}
