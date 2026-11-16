// The armoury: five guns and one grenade. Each weapon owns its numbers; main.js
// owns the ray and the damage. Spread grows with movement and shrinks when aimed
// down sights, so stopping to aim pays; a shotgun fires pellets, a sniper fires
// one slow, punishing round. The grenade is a thrown projectile with a fuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: { key: 'p9', name: 'P9', kind: 'pistol', price: 0, damage: 34, headMult: 3, pellets: 1, gap: 0.16, auto: false, mag: 12, reserve: 48, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, falloff: 15, kick: 0.006 },
  vk47: { key: 'vk47', name: 'VK-47', kind: 'rifle', price: 2700, damage: 34, headMult: 3, pellets: 1, gap: 0.096, auto: true, mag: 30, reserve: 90, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, falloff: 25, kick: 0.009 },
  hornet: { key: 'hornet', name: 'Hornet-9', kind: 'smg', price: 1500, damage: 26, headMult: 3, pellets: 1, gap: 0.07, auto: true, mag: 32, reserve: 96, reload: 1.7, spreadStill: 0.004, spreadMove: 0.02, falloff: 14, kick: 0.005 },
  breacher: { key: 'breacher', name: 'Breacher-12', kind: 'shotgun', price: 1700, damage: 9, headMult: 2, pellets: 8, gap: 0.85, auto: false, mag: 6, reserve: 24, reload: 2.6, spreadStill: 0.03, spreadMove: 0.045, falloff: 9, kick: 0.02 },
  longbow: { key: 'longbow', name: 'Longbow-7', kind: 'sniper', price: 4750, damage: 110, headMult: 3, pellets: 1, gap: 1.4, auto: false, mag: 5, reserve: 15, reload: 2.8, spreadStill: 0.0006, spreadMove: 0.06, falloff: 60, kick: 0.03 },
};
export const WEAPON_ORDER = ['p9', 'vk47', 'hornet', 'breacher', 'longbow'];
export const GRENADE = { name: 'Spark-1', price: 300, fuse: 1.6, radius: 9, damage: 130 };
export const ARMOR = { name: 'Kevlar', price: 650 };

const GRAVITY = 20;

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.5, metalness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.05 });

  // One view model per weapon, built from boxes; only the equipped one shows.
  const models = {};
  function buildModel(def) {
    const g = new THREE.Group();
    const L = def.kind === 'sniper' ? 0.62 : def.kind === 'shotgun' ? 0.55 : def.kind === 'smg' ? 0.34 : def.kind === 'rifle' ? 0.46 : 0.2;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, L), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, L * 0.8), grip);
    barrel.position.set(0, 0.03, -L * 0.75);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), def.kind === 'rifle' ? wood : grip);
    stock.position.set(0, -0.02, L * 0.55);
    g.add(receiver, barrel, stock);
    if (def.kind === 'sniper') {
      const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), grip);
      scope.position.set(0, 0.09, -0.05);
      g.add(scope);
    }
    if (def.kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), grip);
      mag.position.set(0, -0.11, 0.02);
      g.add(mag);
    }
    if (def.kind === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.22), wood);
      pump.position.set(0, -0.03, -L * 0.5);
      g.add(pump);
    }
    g.position.set(0.24, -0.2, -0.42);
    g.visible = false;
    camera.add(g);
    return g;
  }
  for (const key of WEAPON_ORDER) models[key] = buildModel(WEAPONS[key]);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    def: WEAPONS.vk47,
    mag: WEAPONS.vk47.mag,
    reserve: WEAPONS.vk47.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    ads: 0, // 0 hip, 1 aimed
    grenades: 0,
    armor: false,
  };
  const thrown = []; // {pos, vel, fuse} — one grenade at a time is the rule.
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.5 }),
  );
  grenadeMesh.visible = false;
  camera.parent.add(grenadeMesh);

  function showModel() {
    for (const key of WEAPON_ORDER) models[key].visible = key === state.def.key;
  }
  showModel();

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.ads += ((aiming ? 1 : 0) - state.ads) * Math.min(1, dt * 10);
    const model = models[state.def.key];
    model.position.z = -0.42 + state.kick;
    model.position.x = 0.24 - state.ads * 0.24;
    model.position.y = -0.2 + state.ads * 0.045;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    // Grenade flight: gravity, one damped bounce, then the fuse.
    for (let i = thrown.length - 1; i >= 0; i -= 1) {
      const g = thrown[i];
      g.vel.y -= GRAVITY * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.09) {
        g.pos.y = 0.09;
        if (Math.abs(g.vel.y) > 2) g.vel.y *= -0.35;
        else g.vel.y = 0;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      g.fuse -= dt;
      grenadeMesh.position.copy(g.pos);
      grenadeMesh.visible = true;
      if (g.fuse <= 0) {
        thrown.splice(i, 1);
        grenadeMesh.visible = false;
        state.exploded = g.pos.clone();
      }
    }
  }

  return {
    state,
    step,
    models,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.gap;
      state.flash = 0.06;
      state.kick = 0.04 + state.def.kick;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return;
      state.reloadLeft = state.def.reload;
    },
    spread(speed) {
      const move = state.def.spreadStill + Math.min(1, speed / 5.2) * state.def.spreadMove;
      return move * (1 - state.ads * 0.75);
    },
    movePenalty() {
      return state.ads > 0.5 ? 0.55 : 1;
    },
    equip(key) {
      if (!WEAPONS[key]) return false;
      state.def = WEAPONS[key];
      state.mag = WEAPONS[key].mag;
      state.reserve = WEAPONS[key].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      showModel();
      return true;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    throwGrenade(origin, direction) {
      if (state.grenades <= 0 || thrown.length > 0) return false;
      state.grenades -= 1;
      thrown.push({
        pos: origin.clone(),
        vel: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: GRENADE.fuse,
      });
      return true;
    },
    takeExplosion() {
      const p = state.exploded;
      state.exploded = null;
      return p;
    },
  };
}
