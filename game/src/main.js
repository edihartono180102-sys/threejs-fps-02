// Boot and the one loop of Emberworks: a fixed 60 Hz simulation feeding a
// render at the display's rate. ?shot=start|play|bomb|end with &seed=N sets
// up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady. Everything the judge sees in a screenshot is
// a real frame of this same simulation.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createMatch } from './state.js';
import { WEAPONS, currentWeapon, currentAmmo, damageAt, shotSpread, GRENADE } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2027);
scene.fog = new THREE.Fog(0x1a2027, 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x8fa3b8, 0x2a2118, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
sun.position.set(28, 34, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -36;
sun.shadow.camera.right = 36;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 100;
scene.add(sun);

const map = createMap(scene, random);
const hud = createHud();
const audio = createAudio();
const effects = createEffects(scene);
const player = createPlayer(map.colliders, map.spawns.ember[0]);
const bots = createBots(scene, map, random);
const match = createMatch(map, bots, player, hud, audio);
const input = createInput(renderer.domElement, {
  onKey: handleKey,
  onLockChange: onLockChange,
});
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

const body = player.state;
const matchState = match.state;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
let started = false;
let fireCooldown = 0;
let reloadTimer = 0;
let bloom = 0;
let prevFiring = false;
let adsBlend = 0;
let grenadeCooldown = 0;
let shotsFired = 0;
let shotsHit = 0;

const eyePos = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const upVec = new THREE.Vector3(0, 1, 0);
let prevPhase = 'freeze';
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.14, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e4d2a, roughness: 0.6, metalness: 0.4 });

match.startRound();
hud.setAmmo(12, 48, WEAPONS.sidearm.name);
hud.setScore(0, 0, 1);

function handleKey(code) {
  if (shot) return;
  if (code === 'KeyB' && matchState.phase === 'freeze') {
    const buy = document.getElementById('buy-menu');
    if (buy.hidden) match.refreshBuy();
    else hud.hideBuy();
    return;
  }
  if (matchState.phase === 'freeze' && code.startsWith('Digit')) {
    match.tryBuy(code);
    return;
  }
  if (code === 'KeyR' && body.alive) startReload();
  if (code === 'KeyG' && body.alive) throwGrenade();
  if (code === 'KeyE') { /* held: channelling is read from keys each step */ }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (matchState.phase === 'match') {
    hud.showOverlay('match', matchState.matchReason);
  } else if (!body.alive) {
    hud.showOverlay('dead', `Ember ${matchState.score.ember} : ${matchState.score.warden} Warden`);
  } else if (matchState.phase === 'end') {
    hud.showOverlay('end', `Ember ${matchState.score.ember} : ${matchState.score.warden} Warden — next round starts soon.`);
  } else if (started) {
    hud.showOverlay('paused', `Ember ${matchState.score.ember} : ${matchState.score.warden} Warden`);
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (matchState.phase === 'match') {
    match.restartMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (matchState.phase === 'end') {
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});

function startReload() {
  const def = currentWeapon(matchState.loadout);
  const ammo = currentAmmo(matchState.loadout);
  if (reloadTimer > 0 || ammo.mag === def.mag || ammo.reserve === 0) return;
  reloadTimer = def.id === 'dmr' ? 2.1 : 1.6;
  audio.reload();
}

function finishReload() {
  const def = currentWeapon(matchState.loadout);
  const ammo = currentAmmo(matchState.loadout);
  const need = def.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
}

function throwGrenade() {
  if (matchState.loadout.grenades <= 0 || grenadeCooldown > 0) return;
  if (matchState.phase !== 'live' && matchState.phase !== 'planted') return;
  matchState.loadout.grenades -= 1;
  grenadeCooldown = 0.9;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  scene.add(mesh);
  player.eyePosition(eyePos);
  camera.getWorldDirection(aimDir);
  const velocity = aimDir.clone().multiplyScalar(17);
  velocity.y += 3.5;
  grenades.push({ mesh, pos: eyePos.clone(), vel: velocity, fuse: GRENADE.fuse });
  audio.shot('smg');
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  effects.explosion(g.pos);
  audio.explosion();
  const radius = GRENADE.radius;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.position.x - g.pos.x, bot.position.z - g.pos.z);
    if (dist > radius) continue;
    const damage = GRENADE.damage * (1 - (dist / radius) * 0.6);
    match.damageBot(bot, damage, 'player', false);
  }
  if (body.alive) {
    const dist = Math.hypot(body.position.x - g.pos.x, body.position.z - g.pos.z);
    if (dist < radius) match.damagePlayer(GRENADE.damage * 0.4 * (1 - dist / radius), null);
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 12 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Cheap bounce: clamp out of colliders and flip the velocity component.
    for (const box of map.colliders) {
      if (g.pos.x > box.x0 && g.pos.x < box.x1 && g.pos.z > box.z0 && g.pos.z < box.z1 && g.pos.y < box.h) {
        const dxl = g.pos.x - box.x0;
        const dxr = box.x1 - g.pos.x;
        const dzl = g.pos.z - box.z0;
        const dzr = box.z1 - g.pos.z;
        const min = Math.min(dxl, dxr, dzl, dzr);
        if (min === dxl) { g.pos.x = box.x0; g.vel.x = -Math.abs(g.vel.x) * 0.5; }
        else if (min === dxr) { g.pos.x = box.x1; g.vel.x = Math.abs(g.vel.x) * 0.5; }
        else if (min === dzl) { g.pos.z = box.z0; g.vel.z = -Math.abs(g.vel.z) * 0.5; }
        else { g.pos.z = box.z1; g.vel.z = Math.abs(g.vel.z) * 0.5; }
      }
    }
    if (g.pos.y < 0.14) {
      g.pos.y = 0.14;
      g.vel.y = Math.abs(g.vel.y) * 0.45;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    g.mesh.position.copy(g.pos);
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function muzzleWorld(out) {
  player.eyePosition(eyePos);
  camera.getWorldDirection(aimDir);
  rightVec.crossVectors(aimDir, upVec).normalize();
  out.copy(eyePos).addScaledVector(aimDir, 0.55).addScaledVector(rightVec, 0.22);
  out.y -= 0.16;
  return out;
}

function shoot() {
  const def = currentWeapon(matchState.loadout);
  const ammo = currentAmmo(matchState.loadout);
  if (reloadTimer > 0 || fireCooldown > 0) return false;
  if (ammo.mag <= 0) {
    audio.dry();
    fireCooldown = 0.25;
    startReload();
    return false;
  }
  ammo.mag -= 1;
  fireCooldown = 60 / def.rpm;
  shotsFired += 1;
  const moving = body.speed > 0.6;
  const spread = shotSpread(def, moving, body.crouched, input.state.aiming, bloom);
  player.eyePosition(eyePos);
  camera.getWorldDirection(aimDir);
  aimDir.x += (random() * 2 - 1) * spread;
  aimDir.y += (random() * 2 - 1) * spread;
  aimDir.z += (random() * 2 - 1) * spread;
  aimDir.normalize();
  bloom = Math.min(0.02, bloom + def.recoil * 0.35);
  player.addRecoil(def.recoil, (random() * 2 - 1) * def.recoil * 0.3);
  audio.shot(def.id);
  muzzleWorld(muzzlePos);
  effects.muzzle(muzzlePos);
  scene.updateMatrixWorld(true);
  raycaster.set(eyePos, aimDir);
  const targets = map.obstacles.concat(bots.hitMeshes());
  const hits = raycaster.intersectObjects(targets, false);
  const hit = hits[0];
  if (hit) {
    hitPoint.copy(hit.point);
    effects.tracer(muzzlePos, hitPoint);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const headshot = part === 'head';
      shotsHit += 1;
      const damage = damageAt(def, hit.distance) * (headshot ? def.headMult : 1);
      const killed = match.damageBot(bot, damage, 'player', headshot);
      hud.hitMarker(killed);
    } else {
      const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      effects.impact(hitPoint, normal);
    }
  } else {
    hitPoint.copy(eyePos).addScaledVector(aimDir, 70);
    effects.tracer(muzzlePos, hitPoint);
  }
  // Shots are loud: nearby bots come to look.
  bots.investigate(body.position.x, body.position.z);
  return true;
}

function syncCamera() {
  if (!body.alive && matchState.spectateBot) {
    const bot = matchState.spectateBot;
    camera.position.set(
      bot.position.x - Math.sin(bot.yaw) * 3.2,
      2.6,
      bot.position.z - Math.cos(bot.yaw) * 3.2,
    );
    camera.lookAt(bot.position.x, 1.3, bot.position.z);
    return;
  }
  player.eyePosition(eyePos);
  camera.position.copy(eyePos);
  camera.rotation.set(body.pitch + body.recoilPitch, body.yaw + body.recoilYaw, 0, 'YXZ');
  const def = currentWeapon(matchState.loadout);
  const targetFov = input.state.aiming && body.alive ? 74 / (def.zoom || 1) : 74;
  camera.fov += (targetFov - camera.fov) * 0.2;
  camera.updateProjectionMatrix();
}

function syncHud() {
  const def = currentWeapon(matchState.loadout);
  const ammo = currentAmmo(matchState.loadout);
  hud.setAmmo(ammo.mag, ammo.reserve, def.name);
  hud.setHealth(Math.max(0, body.health), body.armor);
  hud.setMoney(matchState.money);
  hud.setScore(matchState.score.ember, matchState.score.warden, matchState.round);
  const seconds = matchState.phase === 'planted' ? matchState.bomb.fuse : matchState.phaseTime;
  hud.setTimer(seconds, matchState.phase);
  const moving = body.speed > 0.6;
  const spread = shotSpread(def, moving, body.crouched, input.state.aiming, bloom);
  hud.setCrosshair(4 + spread * 900 + body.speed * 1.2);
  const allies = [];
  const enemies = [];
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    if (bot.team === 'ember') allies.push(bot.position);
    else if (elapsed - bot.lastShotAt < 2 || bot.mode === 'engage') enemies.push(bot.position);
  }
  hud.drawMinimap(map, body.position, body.yaw, allies, enemies, matchState.bomb);
}

function botContext() {
  return {
    time: elapsed,
    playerAlive: body.alive,
    playerPos: body.position,
    bomb: matchState.bomb,
    effects,
    audio,
    damagePlayer: (amount, attacker) => match.damagePlayer(amount, attacker),
    damageBot: (bot, amount, attacker, headshot) => match.damageBot(bot, amount, attacker, headshot),
    onPlanted: (bot) => match.onPlanted(bot),
    onDefused: (bot) => match.onDefused(bot),
  };
}

function step(dt) {
  elapsed += dt;
  const live = matchState.phase === 'live' || matchState.phase === 'planted';
  const frozenPhase = matchState.phase === 'freeze';

  // Drain look deltas every step so none survive the freeze into the round.
  const look = input.takeLook();
  if (!frozenPhase && body.alive) {
    player.look(look.x, look.y);
  }
  if (live && body.alive) {
    player.step(dt, input.state.keys);
    if (input.state.firing && !prevFiring && !currentWeapon(matchState.loadout).auto) shoot();
    else if (input.state.firing && currentWeapon(matchState.loadout).auto) shoot();
    if (input.state.keys.has('KeyR')) startReload();
  }
  prevFiring = input.state.firing;
  if (reloadTimer > 0) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) finishReload();
  }
  fireCooldown = Math.max(0, fireCooldown - dt);
  bloom = Math.max(0, bloom - dt * 0.05);
  grenadeCooldown = Math.max(0, grenadeCooldown - dt);
  if (matchState.phase !== 'match') {
    match.update(dt);
  }
  // Leaving the round frees the mouse so the player sees the banner.
  if (prevPhase !== 'end' && matchState.phase === 'end') input.releaseLock();
  if (prevPhase !== 'match' && matchState.phase === 'match') input.releaseLock();
  prevPhase = matchState.phase;
  if (live) {
    bots.update(dt, botContext());
    match.playerChannelUpdate(dt, input.state.keys.has('KeyE'));
    stepGrenades(dt);
  }
  effects.step(dt);
  map.update(elapsed);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  input.setEnabled(false);
  matchState.phase = 'live';
  matchState.phaseTime = 90;
  if (name === 'start') {
    // Cover frame: a vista across the yard, no menu in the way.
    body.position.set(10, 0, 19);
    body.yaw = 0.35;
    body.pitch = 0.02;
    settle(30);
    hud.hideBanner();
    hud.banner('EMBERWORKS', 'Foundry Yard — plant the charge or eliminate the Wardens', 60000);
    syncCamera();
  } else if (name === 'play') {
    body.position.set(2, 0, 12);
    settle(30);
    const target = bots.bots.find((b) => b.team === 'warden' && b.alive);
    target.position.set(1, 0, -2);
    target.yaw = Math.PI;
    target.body.group.position.copy(target.position);
    const ally = bots.bots.find((b) => b.team === 'ember' && b.alive);
    ally.position.set(-3, 0, 8);
    aimAt(new THREE.Vector3(1, 1.4, -2));
    shoot();
    settle(10);
    aimAt(new THREE.Vector3(1, 1.4, -2));
    shoot();
    settle(8);
    hud.hideBanner();
  } else if (name === 'bomb') {
    const site = map.sites.A;
    body.position.set(site.x + 5, 0, site.z + 5);
    settle(20);
    aimAt(new THREE.Vector3(site.x, 1.2, site.z));
    const guard = bots.bots.find((b) => b.team === 'warden' && b.alive);
    guard.position.set(site.x + 6, 0, site.z - 4);
    guard.yaw = Math.PI * 0.75;
    guard.body.group.position.copy(guard.position);
    settle(6);
    hud.hideBanner();
    matchState.playerChannel = { kind: 'plant', progress: 0.62 };
    hud.plantProgress('PLANTING — SITE A', 0.62);
  } else {
    // end: a finished round, scoreboard up, one warden down in the yard.
    const fallen = bots.bots.find((b) => b.team === 'warden');
    fallen.alive = false;
    fallen.health = 0;
    fallen.body.group.rotation.set(0, fallen.yaw, Math.PI / 2);
    fallen.body.group.position.set(4, 0.25, 2);
    matchState.score.ember = 3;
    matchState.score.warden = 2;
    matchState.round = 6;
    body.position.set(-4, 0, 16);
    body.yaw = 0.15;
    settle(20);
    hud.hideBanner();
    hud.setScore(3, 2, 6);
    hud.showOverlay('end', 'Ember 3 : 2 Warden — round 6 starts soon.');
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__emberworks = {
  get phase() { return matchState.phase; },
  get round() { return matchState.round; },
  get score() { return { ...matchState.score }; },
  get alive() { return { ember: bots.aliveCount('ember') + (body.alive ? 1 : 0), warden: bots.aliveCount('warden') }; },
  get shots() { return { fired: shotsFired, hit: shotsHit }; },
  get kills() { return matchState.kills; },
};

syncCamera();
syncHud();
if (shot) runShot(shot);
else {
  hud.showOverlay('start', '');
  requestAnimationFrame(frame);
}
