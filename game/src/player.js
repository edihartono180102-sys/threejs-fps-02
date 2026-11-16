// You: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never
// swallows the player — and a low ledge never stops them either: when a
// horizontal step is blocked, the mover tries stepping up onto it, up to
// knee height, before giving up. Jumps get coyote time (a short grace
// after leaving an edge) and a buffered press, so a jump pressed just
// before landing still fires. The same physics the bots' movement
// reuses through moveBody. Your hitboxes are invisible meshes: three.js
// raycasts them anyway, so the bots can shoot you while you never see
// your own body.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;
const STEP_UP = 0.45; // ledges this high are stepped onto, not bumped into
const COYOTE_SECONDS = 0.1; // jump grace after walking off an edge
const JUMP_BUFFER_SECONDS = 0.12; // a jump pressed just before landing still fires

// Shared axis-separated mover: any body (player or bot) walks the same way.
export function createMover(colliders, radius, height) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + h - lift, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }
  // Slide along one horizontal axis; when blocked, try stepping up onto
  // the obstacle instead of stopping dead.
  function slideAxis(body, dt, axis, speed) {
    const vel = axis === 'x' ? body.velocity.x : body.velocity.z;
    const pos = axis === 'x' ? body.position.x : body.position.z;
    const next = pos + vel * dt;
    const other = axis === 'x' ? body.position.z : body.position.x;
    const blocked = axis === 'x'
      ? overlaps(next, body.position.y, other, body.height, 0.04)
      : overlaps(other, body.position.y, next, body.height, 0.04);
    if (!blocked) {
      if (axis === 'x') body.position.x = next;
      else body.position.z = next;
      return;
    }
    // Step up: lift the body onto the ledge and try again from up there.
    const lifted = overlaps(
      axis === 'x' ? next : other, body.position.y + STEP_UP,
      axis === 'x' ? other : next, body.height, 0.04,
    );
    if (!lifted && !overlaps(body.position.x, body.position.y + STEP_UP, body.position.z, body.height, 0.04)) {
      if (axis === 'x') body.position.x = next;
      else body.position.z = next;
      body.position.y += STEP_UP;
      return;
    }
    if (axis === 'x') body.velocity.x = 0;
    else body.velocity.z = 0;
  }
  return {
    move(body, dt, wishX, wishZ, speed) {
      const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
      body.velocity.x += (wishX * speed - body.velocity.x) * blend;
      body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
      if (body.onGround && wishX === 0 && wishZ === 0) {
        const damp = Math.max(0, 1 - FRICTION * dt);
        body.velocity.x *= damp;
        body.velocity.z *= damp;
      }
      slideAxis(body, dt, 'x', speed);
      slideAxis(body, dt, 'z', speed);
      body.position.y += body.velocity.y * dt;
      body.onGround = false;
      const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
      if (hit && body.velocity.y <= 0) {
        body.position.y = hit.max.y;
        body.velocity.y = 0;
        body.onGround = true;
      } else if (hit) {
        body.position.y = hit.min.y - body.height;
        body.velocity.y = 0;
      }
      if (body.position.y < 0) {
        body.position.y = 0;
        body.velocity.y = 0;
        body.onGround = true;
      }
      body.velocity.y = Math.max(-30, body.velocity.y);
    },
    overlaps,
  };
}

export function createPlayer(colliders, scene) {
  const mover = createMover(colliders, RADIUS, STAND_HEIGHT);
  const player = {
    position: new THREE.Vector3(0, 0, 17.5),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
    team: 'vanguard',
    name: 'You',
    fall: 0,
  };
  const wish = new THREE.Vector3();
  let stepAcc = 0;
  let stepped = false;
  let coyoteLeft = 0;
  let jumpBufferedAt = -99;
  let time = 0;

  // Invisible hitboxes, so bots can shoot you.
  const hitMeshes = [];
  const geoHead = new THREE.SphereGeometry(0.16, 10, 8);
  const geoTorso = new THREE.BoxGeometry(0.55, 0.78, 0.3);
  const geoLegs = new THREE.BoxGeometry(0.5, 0.9, 0.3);
  const mat = new THREE.MeshBasicMaterial();
  const head = new THREE.Mesh(geoHead, mat);
  const torso = new THREE.Mesh(geoTorso, mat);
  const legs = new THREE.Mesh(geoLegs, mat);
  for (const [mesh, part, y] of [[head, 'head', 1.58], [torso, 'torso', 1.06], [legs, 'legs', 0.45]]) {
    mesh.position.y = y;
    mesh.visible = false;
    mesh.userData.fighter = player;
    mesh.userData.part = part;
    scene.add(mesh);
    hitMeshes.push(mesh);
  }
  function syncHitboxes() {
    for (const m of hitMeshes) {
      m.position.x = player.position.x;
      m.position.z = player.position.z;
      m.rotation.y = player.yaw;
    }
  }

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function updateCrouch(keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && player.crouching
      && !mover.overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, 0.016 * 12);
  }

  function wishDirection(keys) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    return wish;
  }

  function step(dt, keys, speedMult = 1) {
    if (!player.alive) return false;
    time += dt;
    updateCrouch(keys);
    const dir = wishDirection(keys);
    // Jump: buffered, with coyote time after leaving an edge.
    if (keys.has('Space')) jumpBufferedAt = time;
    if (player.onGround) coyoteLeft = COYOTE_SECONDS;
    else coyoteLeft = Math.max(0, coyoteLeft - dt);
    if (time - jumpBufferedAt < JUMP_BUFFER_SECONDS && (player.onGround || coyoteLeft > 0)) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
      coyoteLeft = 0;
      jumpBufferedAt = -99;
    }
    player.velocity.y -= GRAVITY * dt;
    mover.move(player, dt, dir.x, dir.z, (player.crouching ? CROUCH_SPEED : WALK_SPEED) * speedMult);
    syncHitboxes();
    // Footstep tick for the sound module.
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    stepped = false;
    if (player.onGround && speed > 1) {
      stepAcc += speed * dt;
      if (stepAcc > 2.2) {
        stepAcc = 0;
        stepped = true;
      }
    }
    return stepped;
  }

  return {
    state: player,
    hitMeshes,
    step,
    look,
    recoil,
    syncHitboxes,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
