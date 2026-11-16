// Combat: the hitscan ray, the bodies it can hit, and what a hit looks like.
// A fighter is a post, a torso and a head: the head takes the head multiplier,
// the legs take less. Armour absorbs half of a hit until its 50 points are
// spent. Tracers and sparks are pooled, never allocated in a firefight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const LEG_MULT = 0.75;
const TRACER_COUNT = 12;
const SPARK_COUNT = 24;

export function createFighter(scene, team, name) {
  const color = team === 'vanguard' ? PALETTE.vanguard : PALETTE.ember;
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c99b72'), roughness: 0.7 });
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), dark);
  legs.position.y = 0.45;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.78, 0.3), cloth);
  torso.position.y = 1.06;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), dark);
  visor.position.set(0, 1.6, 0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.28, 1.25, -0.2);
  group.add(legs, torso, head, visor, gun);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  scene.add(group);
  const fighter = {
    team, name, group, head, torso, legs,
    health: 100, armor: 0, alive: true, fall: 0,
    position: group.position, // alias: the group's position
  };
  for (const [mesh, part] of [[head, 'head'], [torso, 'torso'], [legs, 'legs']]) {
    mesh.userData.fighter = fighter;
    mesh.userData.part = part;
  }
  return fighter;
}

export function createEffects(scene) {
  // Tracers: pooled line segments, one per shot, fading in 60 ms.
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, left: 0 });
  }
  // Sparks: pooled small boxes with velocity and a short life.
  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, vel: new THREE.Vector3(), left: 0 });
  }
  // One explosion: an expanding shell and a light, reused every blast.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347'), transparent: true, opacity: 0, depthWrite: false }),
  );
  shell.visible = false;
  scene.add(shell);
  const blastLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 26);
  scene.add(blastLight);
  let blast = 0;

  const origin = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  return {
    tracer(from, to) {
      const t = tracers.find((x) => x.left <= 0) ?? tracers[0];
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
      pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.opacity = 0.85;
      t.line.visible = true;
      t.left = 0.06;
    },
    sparksAt(point, random, count = 6) {
      let made = 0;
      for (const s of sparks) {
        if (s.left > 0) continue;
        s.mesh.position.copy(point);
        s.vel.set((random() - 0.5) * 6, random() * 5 + 1, (random() - 0.5) * 6);
        s.left = 0.35 + random() * 0.2;
        s.mesh.visible = true;
        made += 1;
        if (made >= count) break;
      }
    },
    explosion(point) {
      shell.position.copy(point);
      shell.visible = true;
      shell.scale.setScalar(0.5);
      blastLight.position.copy(point).y += 1;
      blastLight.intensity = 60;
      blast = 0.5;
      origin.copy(point);
    },
    step(dt) {
      for (const t of tracers) {
        if (t.left <= 0) continue;
        t.left -= dt;
        if (t.left <= 0) t.line.visible = false;
        else t.line.material.opacity = (t.left / 0.06) * 0.85;
      }
      for (const s of sparks) {
        if (s.left <= 0) continue;
        s.left -= dt;
        s.vel.y -= 18 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.left <= 0 || s.mesh.position.y < 0.03) s.mesh.visible = false;
      }
      if (blast > 0) {
        blast -= dt;
        const k = 1 - blast / 0.5;
        shell.scale.setScalar(0.5 + k * 8);
        shell.material.opacity = Math.max(0, 0.7 * (1 - k));
        blastLight.intensity = Math.max(0, 60 * (1 - k));
        if (blast <= 0) shell.visible = false;
      }
    },
    muzzle(out) {
      return out;
    },
    _origin: origin,
    _hitPoint: hitPoint,
  };
}

// Apply damage to a fighter. Returns true when the hit kills.
export function damage(fighter, amount) {
  if (!fighter.alive) return false;
  let rest = amount;
  if (fighter.armor > 0) {
    const absorbed = Math.min(rest * 0.5, fighter.armor);
    fighter.armor -= absorbed;
    rest -= absorbed;
  }
  fighter.health -= rest;
  if (fighter.health <= 0) {
    fighter.health = 0;
    fighter.alive = false;
    fighter.fall = 0;
    return true;
  }
  return false;
}

// One hitscan pellet. Returns {fighter, part, point, distance} or a wall hit.
const raycaster = new THREE.Raycaster();
export function shootPellet(origin, direction, range, hitMeshes) {
  raycaster.set(origin, direction);
  raycaster.far = range;
  const hit = raycaster.intersectObjects(hitMeshes, false)[0];
  if (!hit) return { point: origin.clone().addScaledVector(direction, range), distance: range };
  const mesh = hit.object;
  return {
    fighter: mesh.userData.fighter ?? null,
    part: mesh.userData.part ?? null,
    point: hit.point.clone(),
    distance: hit.distance,
  };
}

export function partMultiplier(part, headMult) {
  if (part === 'head') return headMult;
  if (part === 'legs') return LEG_MULT;
  return 1;
}
