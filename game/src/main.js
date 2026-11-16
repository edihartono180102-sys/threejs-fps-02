// DUSTLINE: the entry point. A fixed 60 Hz simulation, a renderer that reads
// it, and the glue between the modules: firing and grenades, the buy menu,
// the charge, the round clock, the kill feed, the camera, and the deterministic
// capture mode (?shot=start|buy|play|end&seed=N) the screenshots are taken in.
import * as THREE from 'three';
import { createMap, SPAWNS, SITES } from './map.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createEffects, damage, shootPellet, partMultiplier } from './combat.js';
import { createBomb, BLAST_RADIUS } from './bomb.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { mulberry32 } from './rng.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1);
const random = SHOT ? mulberry32(SEED) : Math.random;

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe3c188);
scene.fog = new THREE.Fog(0xe3c188, 45, 120);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && started && !SHOT) hud.showOverlay('paused');
  if (locked) hud.hideOverlay();
});
const playerCtl = createPlayer(world.colliders, scene);
const player = playerCtl.state;
player.kills = 0;
player.deaths = 0;
const bots = createBots(scene, world.colliders, random);
for (const bot of bots.bots) {
  bot.fighter.kills = 0;
  bot.fighter.deaths = 0;
}
const weapons = createWeapons(camera);
const bomb = createBomb();
const rounds = createRounds();

const fighters = [player, ...bots.bots.map((b) => b.fighter)];
const hitMeshes = [...world.shootables, ...playerCtl.hitMeshes, ...bots.hitMeshes];

let started = false;
let time = 0;
let lastShot = null;
let lastDryAt = -1;
let spectate = null;
let carrierTimer = -1;

// Ammo lives per weapon, so switching back to a gun keeps its mag. The weapons
// module resets ammo on equip, so main.js saves and restores it around the call.
const ammoStore = {};
function freshAmmo(key) {
  const def = WEAPONS[key];
  return { mag: def.mag, reserve: def.reserve };
}
function saveAmmo() {
  const s = weapons.state;
  ammoStore[s.def.key] = { mag: s.mag, reserve: s.reserve };
}
function loadAmmo(key) {
  weapons.equip(key);
  const entry = ammoStore[key];
  if (entry) {
    weapons.state.mag = entry.mag;
    weapons.state.reserve = entry.reserve;
  }
}
function resetAmmo() {
  for (const key of Object.keys(ammoStore)) delete ammoStore[key];
  loadAmmo('vk47');
}
loadAmmo('vk47');

let primaryKey = 'vk47';

const BUY_ITEMS = [
  { id: 'vk47', key: '1', name: 'VK-47', desc: 'Rifle · 30 rd · the workhorse', price: 2700 },
  { id: 'hornet', key: '2', name: 'Hornet-9', desc: 'SMG · 32 rd · fast and close', price: 1500 },
  { id: 'breacher', key: '3', name: 'Breacher-12', desc: 'Shotgun · 6 shells · one room', price: 1700 },
  { id: 'longbow', key: '4', name: 'Longbow-7', desc: 'Sniper · 5 rd · one tap', price: 4750 },
  { id: 'grenade', key: '5', name: 'Spark-1 frag', desc: 'Grenade · 1.6 s fuse · 9 m', price: 300 },
  { id: 'armor', key: '6', name: 'Kevlar', desc: 'Armor · absorbs half', price: 650 },
];
hud.buildBuy(BUY_ITEMS, (id) => buy(id));
function buy(id) {
  if (!rounds.canBuy() || !player.alive) return;
  const item = BUY_ITEMS.find((i) => i.id === id);
  if (!item || rounds.state.money < item.price) return;
  if (item.id === 'grenade') {
    if (weapons.state.grenades >= 2) return;
    weapons.state.grenades += 1;
  } else if (item.id === 'armor') {
    if (player.armor > 0) return;
    player.armor = 50;
  } else {
    if (primaryKey === item.id) return;
    saveAmmo();
    primaryKey = item.id;
    ammoStore[item.id] = freshAmmo(item.id);
    loadAmmo(item.id);
  }
  rounds.addMoney(-item.price);
  audio.buy();
  hud.setMoney(rounds.state.money);
}

// ----- shared combat events -----
function registerKill(killer, victim) {
  victim.deaths += 1;
  if (killer === victim) return; // a suicide pays nobody
  killer.kills += 1;
  if (killer === player) {
    rounds.addMoney(300);
    audio.kill();
    hud.setMoney(rounds.state.money);
  }
}
function onHit(attacker, victim, part, killed) {
  if (attacker === player) hud.hitMarker(killed);
  if (victim === player) {
    audio.hurt();
    const dx = attacker.position.x - player.position.x;
    const dz = attacker.position.z - player.position.z;
    const worldAng = Math.atan2(dx, dz);
    const rel = worldAng - player.yaw;
    hud.damageFrom((rel * 180) / Math.PI);
  }
  if (killed) registerKill(attacker, victim);
}
function onKill(attacker, victim) {
  hud.killfeed(attacker, victim, false);
  if (victim === player) {
    player.alive = false;
    spectate = bots.bots.find((b) => b.team === 'vanguard' && b.fighter.alive) || null;
    hud.banner('YOU ARE DOWN', spectate ? `Spectating ${spectate.name}` : 'Round over');
    if (bomb.state.carriedBy === 'player' && !bomb.state.planted) carrierTimer = 2;
  }
  checkRoundEnd();
}
function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const vAlive = fighters.filter((f) => f.team === 'vanguard' && f.alive).length;
  const eAlive = fighters.filter((f) => f.team === 'ember' && f.alive).length;
  if (bomb.state.planted) {
    if (eAlive === 0) return; // the charge still has to go off
    if (vAlive === 0) return; // defenders still have to defuse
    return;
  }
  if (vAlive === 0) endRound('ember', 'Vanguard eliminated');
  else if (eAlive === 0) endRound('vanguard', 'Ember eliminated');
}
function endRound(team, reason) {
  if (!rounds.winRound(team, reason)) return;
  const won = team === 'vanguard';
  hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason);
  if (won) audio.roundWin();
  else audio.roundLose();
  if (rounds.state.matchWinner) {
    setTimeout(() => showMatchEnd(), 2500);
  }
}
function showMatchEnd() {
  const winner = rounds.state.matchWinner;
  const rows = fighters
    .slice()
    .sort((a, b) => b.kills - a.kills)
    .map((f) => ({ name: f.name, team: f.team, kills: f.kills, deaths: f.deaths }));
  hud.showOverlay('match', {
    title: winner === 'draw' ? 'DRAW' : winner === 'vanguard' ? 'VANGUARD WINS' : 'EMBER WINS',
    copy: `Final score — Vanguard ${rounds.state.score.vanguard} · Ember ${rounds.state.score.ember}`,
    rows,
  });
}

const botCtx = {
  fighters,
  hitMeshes,
  colliders: world.colliders,
  effects,
  random,
  get lastShot() {
    return lastShot;
  },
  get bomb() {
    return bomb.state;
  },
  onShot(bot) {
    audio.shot(bot.def.kind);
  },
  onHit,
  onKill,
  onPlanted(site) {
    bomb.state.planted = true;
    bomb.state.site = site;
    bomb.state.timer = 35;
    bomb.state.beepAt = time;
    hud.banner('CHARGE PLANTED', `Site ${site} — 35 seconds`);
    audio.plantBeep(true);
    if (bomb.state.carriedBy === 'player') rounds.addMoney(300);
  },
  onDefused() {
    bomb.state.planted = false;
    endRound('ember', 'Charge defused');
  },
};

function startRound() {
  // Everyone back to spawn, fresh health, the charge back on your back.
  const spawn = SPAWNS.vanguard[0];
  player.position.set(spawn[0], 0, spawn[1]);
  player.velocity.set(0, 0, 0);
  player.yaw = spawn[2];
  player.pitch = 0;
  player.health = 100;
  player.alive = true;
  player.armor = player.armor > 0 ? 50 : 0;
  spectate = null;
  carrierTimer = -1;
  bots.resetRound(rounds.state.round, null);
  bomb.resetRound();
  rounds.beginRound();
  camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
  camera.rotation.set(0, player.yaw, 0);
  hud.setHealth(player.health, player.armor);
  hud.setScore(rounds.state.score.vanguard, rounds.state.score.ember);
  hud.setAlive(5, 5);
  hud.setMoney(rounds.state.money);
  hud.setBomb(false, 0, '');
  hud.setPlant(0, '');
  hud.banner(`ROUND ${rounds.state.round}`, 'Buy your gear — press B');
  hud.showBuy(false);
}

function startMatch() {
  rounds.beginMatch();
  resetAmmo();
  primaryKey = 'vk47';
  weapons.state.grenades = 0;
  player.kills = 0;
  player.deaths = 0;
  for (const f of fighters) {
    f.kills = 0;
    f.deaths = 0;
  }
  startRound();
}

hud.onPlay(() => {
  audio.unlock();
  if (rounds.state.phase === 'match' || rounds.state.matchWinner) {
    startMatch();
  }
  if (!SHOT) input.requestLock();
  hud.hideOverlay();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----- the player's own shooting -----
function playerShoot() {
  if (!weapons.ready() || !weapons.takeRound()) return;
  weapons.pullTrigger();
  const def = weapons.state.def;
  const from = camera.position.clone();
  from.x += Math.sin(player.yaw) * -0.25;
  from.z += Math.cos(player.yaw) * -0.25;
  from.y -= 0.12;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const spread = weapons.spread(playerCtl.groundSpeed());
  for (let p = 0; p < def.pellets; p += 1) {
    const d = dir.clone();
    d.x += (random() * 2 - 1) * spread;
    d.y += (random() * 2 - 1) * spread;
    d.z += (random() * 2 - 1) * spread;
    d.normalize();
    const hit = shootPellet(from, d, 80, hitMeshes);
    effects.tracer(from, hit.point);
    if (hit.fighter && hit.fighter.team !== player.team) {
      const falloff = Math.max(0.5, 1 - Math.max(0, hit.distance - def.falloff) / 40);
      const amount = def.damage * partMultiplier(hit.part, def.headMult) * falloff;
      const killed = damage(hit.fighter, amount);
      onHit(player, hit.fighter, hit.part, killed);
      if (killed) onKill(player, hit.fighter);
    } else if (hit.point) {
      effects.sparksAt(hit.point, random, 2);
    }
  }
  lastShot = { x: player.position.x, z: player.position.z, at: time };
  audio.shot(def.kind);
  playerCtl.recoil(def.kick * 0.012, (random() * 2 - 1) * def.kick * 0.004);
}

function throwGrenade() {
  if (weapons.state.grenades <= 0 || !player.alive || rounds.state.phase !== 'live') return;
  const from = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  weapons.throwGrenade(from, dir);
}

// ----- simulation step -----
function simStep() {
  const phase = rounds.state.phase;
  const pressed = input.takePressed();
  const look = input.takeLook();
  if (player.alive && !spectate) playerCtl.look(look.x, look.y);
  if (pressed.has('KeyB') && phase === 'buy' && player.alive) {
    hud.showBuy(document.getElementById('buy').hidden);
  }
  if (phase === 'buy' && player.alive) {
    for (const item of BUY_ITEMS) if (pressed.has(`Digit${item.key}`)) buy(item.id);
  }
  if (pressed.has('KeyG')) throwGrenade();
  if (pressed.has('KeyQ')) {
    saveAmmo();
    loadAmmo(weapons.state.def.key === 'p9' ? primaryKey : 'p9');
  }

  // Movement (never during the match-end overlay).
  const aiming = input.state.aiming && player.alive;
  const speedMult = weapons.movePenalty();
  if (phase !== 'match' && player.alive) {
    if (playerCtl.step(STEP, input.state.keys, speedMult)) audio.footstep();
  }

  // The clock.
  const tick = rounds.tick(STEP);
  if (tick === 'live') {
    hud.banner('GO', 'Plant the charge or clear the site');
  } else if (tick === 'timeout') {
    if (!bomb.state.planted) endRound('ember', 'Time expired');
    else rounds.state.phaseLeft = 0.1; // the charge decides it
  } else if (tick === 'next') {
    startRound();
  }

  // The charge (player plant; bot plant/defuse runs in the bots' step).
  if (phase === 'live' && player.alive) {
    const progress = bomb.stepPlayer(STEP, player, input.state.keys, {
      time,
      audio,
      onPlanted: botCtx.onPlanted,
      onExploded: () => {
        const site = SITES.find((s) => s.name === bomb.state.site);
        effects.explosion(new THREE.Vector3(site.x, 1, site.z));
        audio.explosion();
        for (const { fighter, amount } of bomb.blastDamage(fighters)) {
          const killed = damage(fighter, amount);
          if (killed) {
            registerKill(player, fighter);
            onKill(player, fighter);
          }
        }
        endRound('vanguard', 'Charge detonated');
      },
    });
    hud.setPlant(progress, 'PLANTING');
  } else {
    hud.setPlant(0, '');
  }

  // Firing and reloading.
  if (phase === 'live' && player.alive && input.state.firing) {
    if (weapons.state.mag > 0) {
      if (weapons.ready()) playerShoot();
    } else if (time - lastDryAt > 0.3) {
      lastDryAt = time;
      audio.dryFire();
    }
  }
  if (input.state.keys.has('KeyR')) {
    const s = weapons.state;
    if (s.reloadLeft === 0 && s.mag < s.def.mag && s.reserve > 0) audio.reload();
    weapons.reload();
  }

  // Carrier pickup after the player falls.
  if (carrierTimer > 0) {
    carrierTimer -= STEP;
    if (carrierTimer <= 0) {
      const carrier = bots.bots.find((b) => b.team === 'vanguard' && b.fighter.alive);
      if (carrier) {
        carrier.isCarrier = true;
        bomb.state.carriedBy = carrier;
      }
    }
  }

  // Bots run only once the round is live.
  if (phase === 'live') {
    for (const bot of bots.bots) bots.step(bot, STEP, time, botCtx);
  }

  // A thrown grenade going off.
  const boom = weapons.takeExplosion();
  if (boom) {
    effects.explosion(boom);
    audio.explosion();
    for (const f of fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.position.x - boom.x, f.position.z - boom.z);
      if (d > 9) continue;
      const amount = Math.round(130 - (100 * d) / 9);
      const killed = damage(f, amount);
      if (killed) {
        registerKill(player, f);
        onKill(player, f);
      } else if (f === player) {
        audio.hurt();
      }
    }
    checkRoundEnd();
  }

  // Camera follows the player, or the spectated bot.
  if (player.alive) {
    camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  } else if (spectate) {
    const f = spectate.fighter;
    camera.position.set(f.position.x, f.position.y + 1.55, f.position.z);
    camera.rotation.set(-0.05, spectate.yaw, 0);
  }
  const targetFov = aiming ? 55 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, STEP * 10);
    camera.updateProjectionMatrix();
  }

  // HUD.
  hud.setHealth(player.health, player.armor);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.state.def.name, weapons.state.grenades);
  hud.setMoney(rounds.state.money);
  hud.setTimer(rounds.state.phaseLeft, phase);
  hud.setScore(rounds.state.score.vanguard, rounds.state.score.ember);
  hud.setAlive(
    fighters.filter((f) => f.team === 'vanguard' && f.alive).length,
    fighters.filter((f) => f.team === 'ember' && f.alive).length,
  );
  hud.setBomb(bomb.state.planted, bomb.state.timer, bomb.state.site);
  hud.setSpread(4 + weapons.spread(playerCtl.groundSpeed()) * 900);
  weapons.step(STEP, aiming);
  effects.step(STEP);
  time += STEP;
}

// ----- main loop -----
let acc = 0;
let last = performance.now();
let frozen = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (frozen) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (started) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      simStep();
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
  }
  renderer.render(scene, camera);
}

// ----- deterministic capture mode -----
function capture(shot) {
  started = true;
  hud.hideOverlay();
  if (shot === 'start') {
    startMatch();
    // A wide view from behind the attacker spawn, over the yard.
    camera.position.set(0, 9, 24);
    camera.lookAt(0, 0.5, -8);
  } else if (shot === 'buy') {
    startMatch();
    hud.showBuy(true);
    camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
    camera.rotation.set(0, player.yaw, 0);
  } else if (shot === 'play') {
    startMatch();
    rounds.state.phase = 'live';
    rounds.state.phaseLeft = 100;
    // Fast-forward 22 s of play so bots are mid-lane and fighting.
    for (let i = 0; i < 22 * 60; i += 1) simStep();
    // The player may have been shot standing at spawn; bring them back.
    player.alive = true;
    player.health = 100;
    spectate = null;
    hud.hideBanner();
    hud.setHealth(100, player.armor);
    hud.setAlive(
      fighters.filter((f) => f.team === 'vanguard' && f.alive).length,
      fighters.filter((f) => f.team === 'ember' && f.alive).length,
    );
    // Put the player at mid, looking down the A connector at the fight.
    player.position.set(-16, 0, 8);
    player.yaw = 0.5;
    player.pitch = 0;
    camera.position.set(-16, 1.6, 8);
    camera.rotation.set(0, 0.5, 0);
  } else if (shot === 'end') {
    startMatch();
    rounds.state.phase = 'live';
    rounds.state.phaseLeft = 100;
    for (let i = 0; i < 30 * 60; i += 1) simStep();
    endRound('vanguard', 'Charge detonated');
    camera.position.set(-14, 1.6, -8);
    camera.rotation.set(0, 0.9, 0);
  }
  // Two renders to settle the frame, then freeze and signal readiness.
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  frozen = true;
  window.__shotReady = true;
}

if (SHOT) {
  capture(SHOT);
} else {
  hud.showOverlay('start');
}
requestAnimationFrame(frame);
