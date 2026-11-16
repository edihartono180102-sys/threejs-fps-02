// The human player: WASD movement with acceleration and friction, crouching,
// jumping, and collision against the map's axis-aligned boxes. The body is a
// circle in the XZ plane; each step resolves it out of every box it touches.
import * as THREE from 'three';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.12;
export const PLAYER_RADIUS = 0.42;

export function createPlayer(colliders, spawn) {
  const state = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    onGround: true,
    health: 100,
    armor: 0,
    alive: true,
    speed: 0,
    recoilPitch: 0,
    recoilYaw: 0,
  };

  function collideCircle(pos, radius) {
    for (const box of colliders) {
      const nearestX = Math.max(box.x0, Math.min(pos.x, box.x1));
      const nearestZ = Math.max(box.z0, Math.min(pos.z, box.z1));
      const dx = pos.x - nearestX;
      const dz = pos.z - nearestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      if (distSq < 1e-9) {
        // Centre inside the box: push out along the smallest penetration.
        const pushLeft = pos.x - box.x0 + radius;
        const pushRight = box.x1 - pos.x + radius;
        const pushBack = pos.z - box.z0 + radius;
        const pushFront = box.z1 - pos.z + radius;
        const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (min === pushLeft) pos.x = box.x0 - radius;
        else if (min === pushRight) pos.x = box.x1 + radius;
        else if (min === pushBack) pos.z = box.z0 - radius;
        else pos.z = box.z1 + radius;
        continue;
      }
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      pos.x += dx * push;
      pos.z += dz * push;
    }
    pos.x = Math.max(-29.4, Math.min(29.4, pos.x));
    pos.z = Math.max(-21.4, Math.min(21.4, pos.z));
  }

  return {
    state,
    look(dx, dy) {
      const sensitivity = 0.0021;
      state.yaw -= dx * sensitivity;
      state.pitch -= dy * sensitivity;
      state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
    },
    addRecoil(pitch, yaw) {
      state.recoilPitch += pitch;
      state.recoilYaw += yaw;
    },
    step(dt, keys) {
      if (!state.alive) return;
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
      state.crouched = wantCrouch;
      state.eye += ((wantCrouch ? EYE_CROUCH : EYE_STAND) - state.eye) * Math.min(1, dt * 12);

      const targetSpeed = wantCrouch ? 2.1 : 4.6;
      const accel = state.onGround ? 34 : 8;
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      let wishX = -sin * forward + cos * strafe;
      let wishZ = -cos * forward - sin * strafe;
      const wishLen = Math.hypot(wishX, wishZ);
      if (wishLen > 0.001) {
        wishX /= wishLen;
        wishZ /= wishLen;
      }
      state.velocity.x += wishX * accel * dt;
      state.velocity.z += wishZ * accel * dt;
      const friction = state.onGround ? Math.max(0, 1 - dt * 9) : Math.max(0, 1 - dt * 0.4);
      state.velocity.x *= friction;
      state.velocity.z *= friction;
      const speed = Math.hypot(state.velocity.x, state.velocity.z);
      if (speed > targetSpeed) {
        state.velocity.x *= targetSpeed / speed;
        state.velocity.z *= targetSpeed / speed;
      }
      state.speed = Math.hypot(state.velocity.x, state.velocity.z);

      state.position.x += state.velocity.x * dt;
      state.position.z += state.velocity.z * dt;
      collideCircle(state.position, PLAYER_RADIUS);

      if (keys.has('Space') && state.onGround) {
        state.velocity.y = 5.2;
        state.onGround = false;
      }
      state.velocity.y -= 14 * dt;
      state.position.y += state.velocity.y * dt;
      if (state.position.y <= 0) {
        state.position.y = 0;
        state.velocity.y = 0;
        state.onGround = true;
      }

      // Recoil settles back toward zero.
      state.recoilPitch *= Math.max(0, 1 - dt * 9);
      state.recoilYaw *= Math.max(0, 1 - dt * 9);
    },
    eyePosition(out) {
      out.set(state.position.x, state.position.y + state.eye, state.position.z);
      return out;
    },
    reset(spawn) {
      state.position.set(spawn.x, 0, spawn.z);
      state.velocity.set(0, 0, 0);
      state.yaw = spawn.yaw;
      state.pitch = 0;
      state.eye = EYE_STAND;
      state.health = 100;
      state.alive = true;
      state.armor = 0;
    },
  };
}

// Damage through armor: armor absorbs ARMOR_ABSORB of each hit until it runs out.
export function applyDamage(health, armor, raw, absorb = 0.5) {
  const toArmor = Math.min(armor, raw * absorb);
  const toHealth = raw - toArmor;
  return { health: Math.max(0, health - toHealth), armor: armor - toArmor };
}
