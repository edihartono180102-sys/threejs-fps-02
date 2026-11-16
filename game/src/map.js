// DUSTLINE YARD, an original map. A walled desert compound, 56 x 40 m, read at a
// glance: sand floor, rust containers, slate walls, one amber accent. Three lanes
// cross a mid wall to two bomb sites; the north half is the defenders' ground.
// All collision is axis-aligned boxes, so the player, the bots and the bullets
// share one collider list. Heights are chosen so a 1.1 m crate is cover when
// crouched, a 2.6 m container blocks sight standing, and the 4.6 m walls never do.
//
// The geometry below is built from named helpers — wall, container, crate,
// pillar — instead of one long table, so each piece says what it is and its
// height is fixed by its kind. Every coordinate matches the original layout
// exactly: the waypoint graph, the spawns and the sites were tuned against
// these positions, and moving a single box would break a bot lane.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

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
  [11, 21], [21, 14], [12, 22], [22, 15], [14, 18],
  [15, 19], [16, 18], [17, 19], [18, 20], [19, 20], [16, 20], [17, 20],
  [3, 4], [3, 5],
];

const WALL_HEIGHT = 4.6;
const LOW_HEIGHT = 2.6;
const PILLAR_HEIGHT = 3.2;
const CRATE_HEIGHT = 1.1;

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  const structural = ['sand', 'sandDark', 'concrete', 'slate', 'rust', 'teal'];
  for (const name of structural) {
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
  // One helper per kind: the height is the kind's, the caller only places it.
  const floor = () => box(57, 0.4, 41, 0, -0.2, 0, 'sand');
  const sideWall = (x) => box(0.4, WALL_HEIGHT, 41, x, WALL_HEIGHT / 2, 0, 'concrete');
  const endWall = (z) => box(57, WALL_HEIGHT, 0.4, 0, WALL_HEIGHT / 2, z, 'concrete');
  const midWall = (w, x) => box(w, WALL_HEIGHT, 0.6, x, WALL_HEIGHT / 2, 0, 'slate');
  const lowWall = (w, x, z, material) => box(w, LOW_HEIGHT, 0.6, x, LOW_HEIGHT / 2, z, material);
  const lowWallZ = (d, x, z, material) => box(0.6, LOW_HEIGHT, d, x, LOW_HEIGHT / 2, z, material);
  const pillar = (x, z, material = 'concrete') => box(1.2, PILLAR_HEIGHT, 1.2, x, PILLAR_HEIGHT / 2, z, material);
  const container = (w, d, x, z, material) => box(w, LOW_HEIGHT, d, x, LOW_HEIGHT / 2, z, material);
  const crate = (w, d, x, z, material) => box(w, CRATE_HEIGHT, d, x, CRATE_HEIGHT / 2, z, material);

  // Floor and the four outer walls.
  floor();
  sideWall(-28.2);
  sideWall(28.2);
  endWall(-20.2);
  endWall(20.2);
  // Mid wall (z = 0) with three gaps: A connector, mid doors, B connector.
  midWall(3, -26.5);
  midWall(18.5, -11.75);
  midWall(18.5, 11.75);
  midWall(3, 26.5);
  // Site A (west) and site B (east): low walls, pillars, containers.
  lowWall(8, -22, -8, 'slate');
  lowWallZ(6, -26, -12, 'slate');
  pillar(-24, -14.5);
  pillar(-18, -14.5);
  container(6, 2.4, -12, -12, 'rust');
  lowWall(8, 22, -8, 'slate');
  lowWallZ(6, 26, -12, 'slate');
  pillar(24, -14.5);
  pillar(18, -14.5);
  container(6, 2.4, 12, -12, 'rust');
  // Mid-north container blocks the long sightline through the doors.
  container(4, 2.4, 0, -8, 'teal');
  // Pillars and crates down the three lanes.
  pillar(-8, -4);
  pillar(8, -4);
  pillar(-8, 12);
  pillar(8, 12);
  crate(1.6, 1.6, -6, 6, 'rust');
  crate(1.6, 1.6, 6, 6, 'rust');
  crate(2.4, 1.2, -6, 10, 'slate');
  crate(1.6, 1.6, -16, 4, 'slate');
  crate(1.6, 1.6, 16, 4, 'slate');
  crate(1.2, 3.6, -22, -2, 'slate');
  crate(1.2, 3.6, 22, -2, 'slate');
  crate(3.6, 1.2, -14, -8, 'slate');
  crate(3.6, 1.2, 14, -8, 'slate');
  // Attacker-side cover and the spawn shelter.
  container(6, 2.4, -14, 14, 'teal');
  container(6, 2.4, 14, 14, 'teal');

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
