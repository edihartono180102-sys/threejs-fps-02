// Foundry Yard, the one map of Emberworks. A 60 by 44 metre industrial yard:
// the Furnace Hall (Site A) west, the Silo Yard (Site B) east, a container
// mid, and three lanes between them. Everything the game collides with or
// shoots at is an axis-aligned box in `colliders`; the meshes are only the
// visible side of the same list, so sight lines and bullets agree with walls.
import * as THREE from 'three';
import { makeTextures } from './textures.js';

export const MAP_BOUNDS = { x0: -30, z0: -22, x1: 30, z1: 22 };

export const SITES = {
  A: { name: 'Furnace Hall', key: 'A', x: -24, z: -8, color: 0xff8c2e },
  B: { name: 'Silo Yard', key: 'B', x: 24, z: -8, color: 0xff8c2e },
};

export const SPAWNS = {
  ember: [
    { x: -9, z: 19, yaw: 0 },
    { x: -3, z: 19.5, yaw: 0 },
    { x: 3, z: 19.5, yaw: 0 },
    { x: 9, z: 19, yaw: 0 },
  ],
  warden: [
    { x: -9, z: -19, yaw: Math.PI },
    { x: -3, z: -19.5, yaw: Math.PI },
    { x: 3, z: -19.5, yaw: Math.PI },
    { x: 9, z: -19, yaw: Math.PI },
  ],
};

// Waypoints for bot routes: lanes west, mid and east, plus site pockets.
const WAYPOINTS = [
  [-9, 19], [-3, 19], [3, 19], [9, 19],
  [-16, 12], [-4, 12], [6, 12], [16, 12],
  [-20, 4], [-8, 4], [0, 4], [8, 4], [20, 4],
  [-24, -3], [-14, -4], [-4, -4], [6, -4], [14, -4], [24, -3],
  [-24, -12], [-14, -12], [0, -12], [14, -12], [24, -12],
  [-9, -19], [-3, -19], [3, -19], [9, -19],
];

function segmentHitsBox(x0, z0, x1, z1, box, eyeY) {
  // 2D slab test on the XZ segment, only when the box is tall enough to
  // block a sight line at eye height.
  if (box.h < eyeY) return false;
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < box.x0 || x0 > box.x1) return false;
  } else {
    let a = (box.x0 - x0) / dx;
    let b = (box.x1 - x0) / dx;
    if (a > b) { const t = a; a = b; b = t; }
    tmin = Math.max(tmin, a);
    tmax = Math.min(tmax, b);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < box.z0 || z0 > box.z1) return false;
  } else {
    let a = (box.z0 - z0) / dz;
    let b = (box.z1 - z0) / dz;
    if (a > b) { const t = a; a = b; b = t; }
    tmin = Math.max(tmin, a);
    tmax = Math.min(tmax, b);
    if (tmin > tmax) return false;
  }
  return true;
}

export function createMap(scene, random) {
  const textures = makeTextures(random);
  const colliders = [];
  const obstacles = [];
  const group = new THREE.Group();
  group.name = 'foundry-yard';
  scene.add(group);

  const matFloor = new THREE.MeshStandardMaterial({ map: textures.floorYard, roughness: 0.95, metalness: 0.05 });
  const matWall = new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.9, metalness: 0.08 });
  const matCrate = new THREE.MeshStandardMaterial({ map: textures.plate, roughness: 0.85, metalness: 0.25 });
  const matCrateDark = new THREE.MeshStandardMaterial({ map: textures.darkMetal, roughness: 0.8, metalness: 0.4 });
  const matHazard = new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.8, metalness: 0.1 });
  const matContainerA = new THREE.MeshStandardMaterial({ map: textures.plate, color: 0xff8a4a, roughness: 0.7, metalness: 0.35 });
  const matContainerB = new THREE.MeshStandardMaterial({ map: textures.plate, color: 0x7fd8c8, roughness: 0.7, metalness: 0.35 });
  const matFurnace = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.6, metalness: 0.6, emissive: 0xff5a00, emissiveIntensity: 0.55 });
  const matSilo = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.7 });

  function box(x, z, w, d, h, material, y = 0, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = h > 1;
    mesh.receiveShadow = true;
    mesh.userData.obstacle = true;
    group.add(mesh);
    if (collide) {
      colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h });
      obstacles.push(mesh);
    }
    return mesh;
  }

  function cylinder(x, z, radius, height, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), material);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.obstacle = true;
    group.add(mesh);
    if (collide) {
      colliders.push({ x0: x - radius, z0: z - radius, x1: x + radius, z1: z + radius, h: height });
      obstacles.push(mesh);
    }
    return mesh;
  }

  // Ground and perimeter.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), matFloor);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  box(0, -23, 64, 2, 4.5, matWall, 0); // north wall
  box(0, 23, 64, 2, 4.5, matWall, 0); // south wall
  box(-31, 0, 2, 48, 4.5, matWall, 0); // west wall
  box(31, 0, 2, 48, 4.5, matWall, 0); // east wall
  // Hazard skirt along the walls so the edge reads.
  box(0, -21.6, 60, 0.8, 0.12, matHazard, 0, false);
  box(0, 21.6, 60, 0.8, 0.12, matHazard, 0, false);

  // Furnace Hall (Site A): three walls, open to the east, furnace inside.
  box(-28.5, -8, 2, 14, 5, matWall, 0);
  box(-23.5, -14.5, 12, 2, 5, matWall, 0);
  box(-23.5, -1.5, 12, 2, 5, matWall, 0);
  box(-23.5, -14.5, 12, 0.6, 0.15, matHazard, 5, false);
  const furnace = box(-26.5, -8, 3, 4, 3.4, matFurnace, 0);
  furnace.name = 'furnace';
  cylinder(-26.5, -11.5, 0.9, 7, matFurnace, true);
  box(-21, -12.5, 2.5, 2.5, 1.2, matCrate, 0);
  box(-21, -4, 2, 2, 1.1, matCrateDark, 0);

  // Silo Yard (Site B): two silos, pipe rack and crates.
  cylinder(26, -13, 2.6, 7.5, matSilo, true);
  cylinder(26, -3, 2.6, 7.5, matSilo, true);
  box(20.5, -8, 1.2, 9, 2.6, matCrateDark, 0);
  box(21, -14.5, 3, 2, 1.2, matCrate, 0);
  box(21, -1.5, 2.5, 2, 1.1, matCrate, 0);

  // Mid: stacked containers make the crossfire lane.
  box(-2, 4, 6, 2.4, 2.6, matContainerA, 0);
  box(-2, 4, 6, 2.4, 2.6, matContainerB, 2.6);
  box(6, -2, 2.4, 5, 2.6, matContainerB, 0);
  box(-8, -2, 2.4, 5, 2.6, matContainerA, 0);

  // Lane cover: crates and barrels scattered so no lane is a straight shot.
  box(-14, 8, 2.5, 2.5, 1.3, matCrate, 0);
  box(-16, 0, 3, 2, 1.2, matCrateDark, 0);
  box(-6, 12, 3, 2, 1.1, matCrate, 0);
  box(4, 8, 2, 2, 1.2, matCrateDark, 0);
  box(12, 10, 2.5, 2.5, 1.3, matCrate, 0);
  box(16, 2, 3, 2, 1.2, matCrate, 0);
  box(10, -10, 2, 2, 1.1, matCrateDark, 0);
  box(-10, -10, 2.5, 2, 1.2, matCrate, 0);
  box(0, -16, 4, 2, 1.1, matCrate, 0);
  cylinder(-12, -16, 0.9, 1.4, matCrateDark, true);
  cylinder(14, 16, 0.9, 1.4, matCrateDark, true);
  cylinder(-18, 16, 0.9, 1.4, matCrate, true);
  box(-26, 8, 3, 2, 1.2, matCrateDark, 0);
  box(26, 8, 3, 2, 1.2, matCrate, 0);

  // Floodlight poles with warm lamps.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc06a, emissiveIntensity: 1.6 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.6 });
  const lamps = [];
  for (const [x, z] of [[-14, 14], [14, 14], [-14, -16], [14, -16], [0, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), poleMat);
    pole.position.set(x, 2.6, z);
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4), lampMat);
    head.position.set(x, 5.3, z);
    group.add(head);
    const light = new THREE.PointLight(0xffc06a, 18, 22, 1.8);
    light.position.set(x, 5.1, z);
    group.add(light);
    lamps.push(light);
  }
  const furnaceLight = new THREE.PointLight(0xff6a00, 30, 20, 1.6);
  furnaceLight.position.set(-25, 3, -8);
  group.add(furnaceLight);

  // Site markers: a pulsing ring on the ground plus a thin light pillar.
  const siteRings = {};
  for (const site of Object.values(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 4, 40),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.06, site.z);
    group.add(ring);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 7, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.set(site.x, 3.5, site.z);
    group.add(pillar);
    siteRings[site.key] = { ring, pillar };
  }

  // Waypoint graph: neighbours are close nodes with a clear sight line.
  const nodes = WAYPOINTS.map(([x, z]) => ({ x, z, neighbours: [] }));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist > 13) continue;
      if (blocked(a.x, a.z, b.x, b.z)) continue;
      a.neighbours.push(j);
      b.neighbours.push(i);
    }
  }

  function blocked(x0, z0, x1, z1) {
    for (const boxCollider of colliders) {
      if (segmentHitsBox(x0, z0, x1, z1, boxCollider, 1.4)) return true;
    }
    return false;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function findPath(fromX, fromZ, toX, toZ) {
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    if (start === goal) return [{ x: toX, z: toZ }];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === goal) break;
      for (const next of nodes[current].neighbours) {
        if (prev[next] === -1) {
          prev[next] = current;
          queue.push(next);
        }
      }
    }
    if (prev[goal] === -1) return [{ x: toX, z: toZ }];
    const path = [];
    let node = goal;
    while (node !== start) {
      path.unshift({ x: nodes[node].x, z: nodes[node].z });
      node = prev[node];
    }
    path.push({ x: toX, z: toZ });
    return path;
  }

  function update(time) {
    const pulse = 0.45 + 0.2 * Math.sin(time * 2.2);
    for (const site of Object.values(SITES)) {
      siteRings[site.key].ring.material.opacity = pulse;
      siteRings[site.key].pillar.material.opacity = 0.12 + 0.06 * Math.sin(time * 2.2);
    }
    furnaceLight.intensity = 28 + 4 * Math.sin(time * 3.1);
  }

  return { group, colliders, obstacles, nodes, sites: SITES, spawns: SPAWNS, blocked, findPath, nearestNode, update };
}
