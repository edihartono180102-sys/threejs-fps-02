// Bot navigation: a waypoint graph over the map, BFS paths, and a 2D sight test.
// Sight is a segment against the colliders' XZ rectangles, tall boxes only: a
// 1.1 m crate never blocks a standing eye, a 2.6 m container always does. The
// test is exact (slab method per rectangle) and allocates nothing.
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

// Breadth-first path of node indices from start to goal. Reuses one queue and
// one parent array; the caller keeps the returned array (fresh each call).
const queue = new Int32Array(NODES.length);
const parent = new Int32Array(NODES.length);
export function findPath(start, goal) {
  if (start === goal) return [goal];
  parent.fill(-1);
  let head = 0;
  let tail = 0;
  queue[tail] = start;
  tail += 1;
  parent[start] = start;
  while (head < tail) {
    const n = queue[head];
    head += 1;
    for (const m of adjacency[n]) {
      if (parent[m] !== -1) continue;
      parent[m] = n;
      if (m === goal) {
        const path = [goal];
        let cur = n;
        while (cur !== start) {
          path.push(cur);
          cur = parent[cur];
        }
        path.push(start);
        path.reverse();
        return path;
      }
      queue[tail] = m;
      tail += 1;
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
