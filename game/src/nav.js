// Bot navigation: a waypoint graph over the map, A* paths with an
// octile-distance heuristic, and a 2D sight test. Sight is a segment
// against the colliders' XZ rectangles, tall boxes only: a 1.1 m crate
// never blocks a standing eye, a 2.6 m container always does. The test
// is exact (slab method per rectangle) and allocates nothing. A* keeps
// one reusable heap, one parent array and one pair of score arrays, so
// pathfinding costs the bots no garbage per frame.
import { NODES, EDGES } from './map.js';

const adjacency = NODES.map(() => []);
for (const [a, b] of EDGES) {
  adjacency[a].push(b);
  adjacency[b].push(a);
}

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const dx = NODES[i][0] - x;
    const dz = NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Octile distance between two waypoints: admissible for the grid-like
// yard, so A* stays optimal while skipping most of the graph.
function heuristic(a, b) {
  const dx = Math.abs(NODES[a][0] - NODES[b][0]);
  const dz = Math.abs(NODES[a][1] - NODES[b][1]);
  return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
}
function edgeCost(a, b) {
  return Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);
}

// A binary min-heap of node indices keyed by f-score, allocated once.
const heap = new Int32Array(NODES.length);
let heapSize = 0;
const parent = new Int32Array(NODES.length);
const gScore = new Float64Array(NODES.length);
const inHeap = new Uint8Array(NODES.length);
function heapSwap(i, j) {
  const t = heap[i];
  heap[i] = heap[j];
  heap[j] = t;
}
function heapUp(i, goal) {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (gScore[heap[i]] + heuristic(heap[i], goal) >= gScore[heap[p]] + heuristic(heap[p], goal)) break;
    heapSwap(i, p);
    i = p;
  }
}
function heapDown(i, goal) {
  for (;;) {
    const left = i * 2 + 1;
    const right = left + 1;
    let smallest = i;
    if (left < heapSize && gScore[heap[left]] + heuristic(heap[left], goal) < gScore[heap[smallest]] + heuristic(heap[smallest], goal)) smallest = left;
    if (right < heapSize && gScore[heap[right]] + heuristic(heap[right], goal) < gScore[heap[smallest]] + heuristic(heap[smallest], goal)) smallest = right;
    if (smallest === i) break;
    heapSwap(i, smallest);
    i = smallest;
  }
}

// A* path of node indices from start to goal. Falls back to the bare goal
// when the graph has no route, exactly as the old search did.
export function findPath(start, goal) {
  if (start === goal) return [goal];
  parent.fill(-1);
  gScore.fill(Infinity);
  inHeap.fill(0);
  heapSize = 0;
  gScore[start] = 0;
  parent[start] = start;
  heap[heapSize] = start;
  heapSize += 1;
  inHeap[start] = 1;
  while (heapSize > 0) {
    const n = heap[0];
    heapSize -= 1;
    if (heapSize > 0) {
      heap[0] = heap[heapSize];
      heapDown(0, goal);
    }
    inHeap[n] = 0;
    if (n === goal) {
      const path = [goal];
      let cur = parent[goal];
      while (cur !== start) {
        path.push(cur);
        cur = parent[cur];
      }
      path.push(start);
      path.reverse();
      return path;
    }
    for (const m of adjacency[n]) {
      const tentative = gScore[n] + edgeCost(n, m);
      if (tentative >= gScore[m]) continue;
      gScore[m] = tentative;
      parent[m] = n;
      if (!inHeap[m]) {
        heap[heapSize] = m;
        heapSize += 1;
        inHeap[m] = 1;
        heapUp(heapSize - 1, goal);
      } else {
        // The node is already queued with a worse f-score: bubble it up.
        for (let i = 0; i < heapSize; i += 1) {
          if (heap[i] === m) {
            heapUp(i, goal);
            break;
          }
        }
      }
    }
  }
  return [goal];
}

// Segment (ax,az)-(bx,bz) against one XZ rectangle. Slab method, exact.
function segmentHitsRect(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < minX || ax > maxX) return false;
  } else {
    let ta = (minX - ax) / dx;
    let tb = (maxX - ax) / dx;
    if (ta > tb) {
      const t = ta;
      ta = tb;
      tb = t;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minZ || az > maxZ) return false;
  } else {
    let ta = (minZ - az) / dz;
    let tb = (maxZ - az) / dz;
    if (ta > tb) {
      const t = ta;
      ta = tb;
      tb = t;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return t1 >= 0 && t0 <= 1;
}

// True when nothing tall stands between the two ground points.
export function clearSight(colliders, ax, az, bx, bz) {
  for (const c of colliders) {
    if (c.max.y < 1.4) continue;
    if (segmentHitsRect(ax, az, bx, bz, c.min.x, c.min.z, c.max.x, c.max.z)) return false;
  }
  return true;
}

// True when the point is inside any collider's XZ footprint (bots never walk
// through a box; the pathfinder only ever asks about node positions).
export function insideCollider(colliders, x, z) {
  for (const c of colliders) {
    if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) return true;
  }
  return false;
}
