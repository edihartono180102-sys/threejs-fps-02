// DUSTLINE YARD, an original map. A walled desert compound, 56 x 40 m, read at a
// glance: sand floor, rust containers, slate walls, one amber accent. Three lanes
// cross a mid wall to two bomb sites; the north half is the defenders' ground.
// All collision is axis-aligned boxes, so the player, the bots and the bullets
// share one collider list. Heights are chosen so a 1.1 m crate is cover when
// crouched, a 2.6 m container blocks sight standing, and the 4.6 m walls never do.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, yCentre, z, material]
const BOXES = [
  // Floor and the four outer walls.
  [57, 0.4, 41, 0, -0.2, 0, 'sand'],
  [0.4, 4.6, 41, -28.2, 2.3, 0, 'concrete'],
  [0.4, 4.6, 41, 28.2, 2.3, 0, 'concrete'],
  [57, 4.6, 0.4, 0, 2.3, -20.2, 'concrete'],
  [57, 4.6, 0.4, 0, 2.3, 20.2, 'concrete'],
  // Mid wall (z = 0) with three gaps: A connector, mid doors, B connector.
  [3, 4.6, 0.6, -26.5, 2.3, 0, 'slate'],
  [18.5, 4.6, 0.6, -11.75, 2.3, 0, 'slate'],
  [18.5, 4.6, 0.6, 11.75, 2.3, 0, 'slate'],
  [3, 4.6, 0.6, 26.5, 2.3, 0, 'slate'],
  // Site A (west) and site B (east): low walls, pillars, containers.
  [8, 2.6, 0.6, -22, 1.3, -8, 'slate'],
  [0.6, 2.6, 6, -26, 1.3, -12, 'slate'],
  [1.2, 3.2, 1.2, -24, 1.6, -14.5, 'concrete'],
  [1.2, 3.2, 1.2, -18, 1.6, -14.5, 'concrete'],
  [6, 2.6, 2.4, -12, 1.3, -12, 'rust'],
  [8, 2.6, 0.6, 22, 1.3, -8, 'slate'],
  [0.6, 2.6, 6, 26, 1.3, -12, 'slate'],
  [1.2, 3.2, 1.2, 24, 1.6, -14.5, 'concrete'],
  [1.2, 3.2, 1.2, 18, 1.6, -14.5, 'concrete'],
  [6, 2.6, 2.4, 12, 1.3, -12, 'rust'],
  // Mid-north container blocks the long sightline through the doors.
  [4, 2.6, 2.4, 0, 1.3, -8, 'teal'],
  // Pillars and crates down the three lanes.
  [1.2, 3.2, 1.2, -8, 1.6, -4, 'concrete'],
  [1.2, 3.2, 1.2, 8, 1.6, -4, 'concrete'],
  [1.2, 3.2, 1.2, -8, 1.6, 12, 'concrete'],
  [1.2, 3.2, 1.2, 8, 1.6, 12, 'concrete'],
  [1.6, 1.1, 1.6, -6, 0.55, 6, 'rust'],
  [1.6, 1.1, 1.6, 6, 0.55, 6, 'rust'],
  [2.4, 1.1, 1.2, -6, 0.55, 10, 'slate'],
  [1.6, 1.1, 1.6, -16, 0.55, 4, 'slate'],
  [1.6, 1.1, 1.6, 16, 0.55, 4, 'slate'],
  [1.2, 1.1, 3.6, -22, 0.55, -2, 'slate'],
  [1.2, 1.1, 3.6, 22, 0.55, -2, 'slate'],
  [3.6, 1.1, 1.2, -14, 0.55, -8, 'slate'],
  [3.6, 1.1, 1.2, 14, 0.55, -8, 'slate'],
  // Attacker-side cover and the spawn shelter.
  [6, 2.6, 2.4, -14, 1.3, 14, 'teal'],
  [6, 2.6, 2.4, 14, 1.3, 14, 'teal'],
];

// Bomb sites: name, centre, half-size of the plant zone.
export const SITES = [
  { name: 'A', x: -21, z: -12, half: 4.5, color: PALETTE.rust },
  { name: 'B', x: 21, z: -12, half: 4.5, color: PALETTE.teal },
];

// Spawn points: [x, z, yaw]. Attackers face north (-z), defenders south.
export const SPAWNS = {
  vanguard: [[0, 17.5, 0], [-3, 17, 0], [3, 17, 0], [-6, 16, 0], [6, 16, 0]],
  ember: [[-20, -17, Math.PI], [-14, -17, Math.PI], [0, -17.5, Math.PI], [14, -17, Math.PI], [20, -17, Math.PI]],
};

// Waypoint graph for the bots. Nodes are open ground; edges are clear walks.
export const NODES = [
  [0, 17], [-6, 12], [6, 12], [0, 8], [-14, 6], [14, 6],
  [-23, 4], [23, 4], [0, 0], [-23, -4], [23, -4],
  [-14, -6], [14, -6], [0, -4], [-21, -12], [21, -12],
  [-26, -16], [26, -16], [-8, -16], [8, -16], [0, -17.5],
  [-17, -8], [17, -8],
];
export const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [1, 4], [2, 5], [3, 8],
  [4, 6], [5, 7], [4, 8], [5, 8], [6, 9], [7, 10],
  [9, 11], [10, 12], [11, 13], [12, 13],
  [11, 21], [21, 14], [12, 22], [22, 15], [14, 16], [15, 17], [14, 18],
  [15, 19], [16, 18], [17, 19], [18, 20], [19, 20], [16, 20], [17, 20],
  [3, 4], [3, 5],
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    if (name === 'sky' || name === 'ink' || name === 'dark' || name === 'muted' || name === 'accent' || name === 'vanguard' || name === 'ember') continue;
    materials[name] = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[name]), roughness: 0.92, metalness: 0.03 });
  }
  materials.accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.55, metalness: 0.1 });
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }
  for (const b of BOXES) box(b[0], b[1], b[2], b[3], b[4], b[5], b[6]);

  // Site decals: flat tinted ground planes, and a tall site pole to spot at range.
  for (const site of SITES) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(site.half * 2, site.half * 2),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(site.color), roughness: 1, transparent: true, opacity: 0.35 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.x, 0.02, site.z);
    decal.receiveShadow = true;
    group.add(decal);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), materials.accent);
    pole.position.set(site.x, 2.5, site.z);
    group.add(pole);
  }

  // Distant skyline silhouettes outside the walls, for depth. Not colliders.
  const skyline = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 1 });
  for (let i = 0; i < 10; i += 1) {
    const w = 8 + (i % 3) * 5;
    const h = 7 + (i % 4) * 4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skyline);
    const a = (i / 10) * Math.PI * 2;
    m.position.set(Math.cos(a) * 62, h / 2 - 0.5, Math.sin(a) * 62);
    group.add(m);
  }

  // Light: low desert sun from the south-west, cool sky fill, warm bounce.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#ffe8c0'), new THREE.Color(PALETTE.sandDark), 1.0));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.4);
  sun.position.set(-18, 26, 22);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#9fb4c8'), 0.5);
  fill.position.set(14, 12, -18);
  scene.add(fill);

  return { colliders, shootables, group };
}
