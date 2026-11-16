// The bots of Emberworks: seven teammates and opponents with one job — play
// the round. Each bot runs a small state machine (hold, advance, engage,
// plant, defuse, investigate) over the map's waypoint graph, sees through the
// same sight-line test the player does, and fires in bursts with an aim error
// that shrinks the longer it holds a target. Nothing here touches the DOM.
import * as THREE from 'three';
import { createLoadout, currentWeapon, currentAmmo, damageAt } from './weapons.js';

const EMBER_NAMES = ['Ash', 'Cinder', 'Slag'];
const WARDEN_NAMES = ['Rook', 'Vise', 'Anvil', 'Gage'];
const TEAM_COLOR = { ember: 0xe86a1f, warden: 0x2fa8a0 };
const BOT_RADIUS = 0.42;
const EYE = 1.45;

function buildBody(scene, team) {
  const color = TEAM_COLOR[team];
  const suit = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.85, metalness: 0.2 });
  const trim = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, emissive: color, emissiveIntensity: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.9 });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  torso.castShadow = true;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.34), trim);
  vest.position.y = 1.22;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.05), trim);
  visor.position.set(0, 1.64, 0.17);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), suit);
  legL.position.set(-0.14, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.72), new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5, metalness: 0.7 }));
  gun.position.set(0.28, 1.18, 0.3);
  group.add(torso, vest, head, visor, legL, legR, gun);
  scene.add(group);
  return { group, torso, head, legL, legR, gun, suit };
}

function collideCircle(colliders, pos, radius) {
  for (const box of colliders) {
    const nx = Math.max(box.x0, Math.min(pos.x, box.x1));
    const nz = Math.max(box.z0, Math.min(pos.z, box.z1));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 < 1e-9) {
      const pl = pos.x - box.x0 + radius;
      const pr = box.x1 - pos.x + radius;
      const pb = pos.z - box.z0 + radius;
      const pf = box.z1 - pos.z + radius;
      const m = Math.min(pl, pr, pb, pf);
      if (m === pl) pos.x = box.x0 - radius;
      else if (m === pr) pos.x = box.x1 + radius;
      else if (m === pb) pos.z = box.z0 - radius;
      else pos.z = box.z1 + radius;
      continue;
    }
    const d = Math.sqrt(d2);
    const push = (radius - d) / d;
    pos.x += dx * push;
    pos.z += dz * push;
  }
  pos.x = Math.max(-29.4, Math.min(29.4, pos.x));
  pos.z = Math.max(-21.4, Math.min(21.4, pos.z));
}

export function createBots(scene, map, random) {
  const bots = [];
  let idCounter = 0;

  function makeBot(team, name, spawn) {
    const body = buildBody(scene, team);
    const bot = {
      id: idCounter,
      name,
      team,
      body,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw,
      health: 100,
      armor: 0,
      alive: true,
      loadout: createLoadout(),
      mode: team === 'warden' ? 'hold' : 'advance',
      path: [],
      pathIndex: 0,
      holdPos: { x: spawn.x, z: spawn.z },
      target: null,
      aimTime: 0,
      burstLeft: 0,
      fireCooldown: 0,
      thinkTimer: Math.random() * 0.2,
      channel: 0,
      channelKind: null,
      isCarrier: false,
      assignedSite: null,
      strafeDir: 1,
      strafeTimer: 0,
      walkPhase: Math.random() * 6,
      lastShotAt: 0,
      flashTimer: 0,
    };
    // Bots start with a rifle from round two on; round one they carry the SMG.
    bot.loadout.weapons.smg = { mag: 30, reserve: 120 };
    bot.loadout.primary = 'smg';
    body.head.userData.bot = bot;
    body.head.userData.part = 'head';
    body.torso.userData.bot = bot;
    body.torso.userData.part = 'body';
    idCounter += 1;
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 3; i += 1) {
    makeBot('ember', EMBER_NAMES[i], map.spawns.ember[i + 1]);
  }
  for (let i = 0; i < 4; i += 1) {
    makeBot('warden', WARDEN_NAMES[i], map.spawns.warden[i]);
  }

  function resetRound(roundNumber, carrierName) {
    for (const bot of bots) {
      const spawnList = bot.team === 'ember' ? map.spawns.ember : map.spawns.warden;
      const index = bot.team === 'ember'
        ? EMBER_NAMES.indexOf(bot.name) + 1
        : WARDEN_NAMES.indexOf(bot.name);
      const spawn = spawnList[index];
      bot.position.set(spawn.x, 0, spawn.z);
      bot.yaw = spawn.yaw;
      bot.health = 100;
      bot.armor = roundNumber > 1 ? 50 : 0;
      bot.alive = true;
      bot.mode = bot.team === 'warden' ? 'hold' : 'advance';
      bot.path = [];
      bot.pathIndex = 0;
      bot.channel = 0;
      bot.channelKind = null;
      bot.isCarrier = bot.name === carrierName;
      bot.assignedSite = bot.team === 'ember' ? (random() < 0.5 ? 'A' : 'B') : null;
      bot.target = null;
      bot.aimTime = 0;
      bot.burstLeft = 0;
      bot.fireCooldown = 0.5 + random() * 0.5;
      bot.body.group.visible = true;
      bot.body.group.rotation.set(0, bot.yaw, 0);
      bot.body.group.position.copy(bot.position);
      // Better guns as the match goes on: rifles from round two.
      if (roundNumber > 1 && !bot.loadout.weapons.rifle) {
        bot.loadout.weapons.rifle = { mag: 25, reserve: 75 };
        bot.loadout.primary = 'rifle';
      }
    }
    // Defenders spread across the two sites.
    const wardens = bots.filter((b) => b.team === 'warden');
    const siteA = map.sites.A;
    const siteB = map.sites.B;
    wardens[0].holdPos = { x: siteA.x - 3, z: siteA.z + 5 };
    wardens[1].holdPos = { x: siteA.x + 4, z: siteA.z + 3 };
    wardens[2].holdPos = { x: siteB.x - 4, z: siteB.z + 4 };
    wardens[3].holdPos = { x: siteB.x + 3, z: siteB.z + 5 };
  }

  function visibleEnemy(bot, ctx) {
    const candidates = [];
    if (ctx.playerAlive) {
      candidates.push({ kind: 'player', x: ctx.playerPos.x, z: ctx.playerPos.z, y: ctx.playerPos.y + 1.4, ref: null });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      candidates.push({ kind: 'bot', x: other.position.x, z: other.position.z, y: 1.3, ref: other });
    }
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const dx = c.x - bot.position.x;
      const dz = c.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 40) continue;
      const angle = Math.atan2(-dx, -dz) - bot.yaw;
      const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(wrapped) > 1.25 && dist > 4) continue;
      if (map.blocked(bot.position.x, bot.position.z, c.x, c.z)) continue;
      const score = dist + Math.abs(wrapped) * 6;
      if (score < bestScore) { bestScore = score; best = { ...c, dist }; }
    }
    return best;
  }

  function moveAlongPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const target = bot.path[bot.pathIndex];
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const step = Math.min(dist, speed * dt);
    bot.position.x += (dx / dist) * step;
    bot.position.z += (dz / dist) * step;
    const wantYaw = Math.atan2(-dx, -dz);
    let diff = wantYaw - bot.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    bot.yaw += diff * Math.min(1, dt * 8);
    collideCircle(map.colliders, bot.position, BOT_RADIUS);
    return false;
  }

  function fireAt(bot, ctx, target, dt) {
    const def = currentWeapon(bot.loadout);
    const ammo = currentAmmo(bot.loadout);
    bot.fireCooldown -= dt;
    if (bot.fireCooldown > 0) return;
    if (bot.burstLeft <= 0) {
      if (ammo.mag === 0) {
        ammo.mag = def.mag;
        ammo.reserve = Math.max(0, ammo.reserve - def.mag);
        bot.fireCooldown = 1.1;
        return;
      }
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.fireCooldown = 0.5 + random() * 0.5;
      return;
    }
    bot.burstLeft -= 1;
    bot.fireCooldown = 60 / def.rpm;
    bot.lastShotAt = ctx.time;
    ammo.mag -= 1;
    const muzzle = new THREE.Vector3(
      bot.position.x + Math.sin(bot.yaw) * 0.4,
      1.35,
      bot.position.z + Math.cos(bot.yaw) * 0.4,
    );
    // Aim error shrinks the longer the bot has held the target, grows with
    // distance and with the target's speed; crouched targets are harder.
    const errorBase = 0.16 - Math.min(0.1, bot.aimTime * 0.03);
    const error = errorBase + target.dist * 0.0035;
    const roll = random();
    const hitChance = Math.max(0.08, Math.min(0.62, 0.55 - error * 1.4));
    const hit = roll < hitChance;
    const headshot = hit && random() < 0.14;
    const aimPoint = new THREE.Vector3(target.x, target.y, target.z);
    if (!hit) {
      aimPoint.x += (random() * 2 - 1) * 1.6;
      aimPoint.y += (random() * 2 - 1) * 0.9;
      aimPoint.z += (random() * 2 - 1) * 1.6;
    }
    ctx.effects.tracer(muzzle, aimPoint);
    ctx.effects.muzzle(muzzle);
    ctx.audio.enemyShot(target.dist);
    if (hit) {
      const damage = damageAt(def, target.dist) * (headshot ? def.headMult : 1);
      if (target.kind === 'player') ctx.damagePlayer(damage, bot);
      else ctx.damageBot(target.ref, damage, bot, headshot);
    }
  }

  function update(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.flashTimer > 0) {
        bot.flashTimer -= dt;
        if (bot.flashTimer <= 0) bot.body.suit.emissiveIntensity = 0;
      }
      bot.thinkTimer -= dt;
      const enemy = visibleEnemy(bot, ctx);
      if (enemy) {
        bot.target = enemy;
        bot.aimTime += dt;
        const dx = enemy.x - bot.position.x;
        const dz = enemy.z - bot.position.z;
        const wantYaw = Math.atan2(-dx, -dz);
        let diff = wantYaw - bot.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        bot.yaw += diff * Math.min(1, dt * 10);
        bot.mode = 'engage';
      } else {
        bot.aimTime = Math.max(0, bot.aimTime - dt * 2);
        if (bot.mode === 'engage') bot.mode = bot.team === 'warden' ? 'hold' : 'advance';
        bot.target = null;
      }

      if (bot.mode === 'engage' && bot.target) {
        // Strafe sideways while firing, changing direction every couple of seconds.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir *= -1;
          bot.strafeTimer = 1.2 + random() * 1.4;
        }
        const strafeX = Math.cos(bot.yaw) * bot.strafeDir * 1.6 * dt;
        const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir * 1.6 * dt;
        bot.position.x += strafeX;
        bot.position.z += strafeZ;
        collideCircle(map.colliders, bot.position, BOT_RADIUS);
        fireAt(bot, ctx, bot.target, dt);
      } else if (bot.thinkTimer <= 0) {
        bot.thinkTimer = 0.25;
        decide(bot, ctx);
      }

      // Movement for non-engage modes.
      if (bot.mode === 'advance' || bot.mode === 'investigate' || bot.mode === 'retreat') {
        moveAlongPath(bot, dt, bot.mode === 'retreat' ? 4.4 : 3.4);
        bot.walkPhase += dt * 7;
      } else if (bot.mode === 'hold') {
        const dx = bot.holdPos.x - bot.position.x;
        const dz = bot.holdPos.z - bot.position.z;
        if (Math.hypot(dx, dz) > 0.8) {
          if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
            bot.path = map.findPath(bot.position.x, bot.position.z, bot.holdPos.x, bot.holdPos.z);
            bot.pathIndex = 0;
          }
          moveAlongPath(bot, dt, 3.0);
          bot.walkPhase += dt * 7;
        } else {
          bot.yaw += Math.sin(ctx.time * 0.4 + bot.id) * dt * 0.12;
        }
      } else if (bot.mode === 'plant' || bot.mode === 'defuse') {
        // Channelling: stand still at the site.
        const site = map.sites[bot.channelKind === 'plant' ? bot.assignedSite : ctx.bomb.site];
        if (site) {
          const wantYaw = Math.atan2(-(site.x - bot.position.x), -(site.z - bot.position.z));
          let diff = wantYaw - bot.yaw;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          bot.yaw += diff * Math.min(1, dt * 6);
        }
      }

      // Channel progress for plant / defuse.
      if (bot.mode === 'plant' || bot.mode === 'defuse') {
        bot.channel += dt / (bot.mode === 'plant' ? 3.5 : 5);
        if (bot.channel >= 1) {
          if (bot.mode === 'plant') ctx.onPlanted(bot);
          else ctx.onDefused(bot);
          bot.channel = 0;
          bot.channelKind = null;
          bot.mode = bot.team === 'warden' ? 'hold' : 'advance';
        }
      }

      // Walk animation and group transform.
      const bob = Math.sin(bot.walkPhase) * 0.06;
      bot.body.group.position.set(bot.position.x, bob * 0.4, bot.position.z);
      bot.body.group.rotation.y = bot.yaw;
      bot.body.legL.rotation.x = Math.sin(bot.walkPhase) * 0.5;
      bot.body.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.5;
    }
  }

  function decide(bot, ctx) {
    const bomb = ctx.bomb;
    if (bot.team === 'warden') {
      if (bomb.planted) {
        const site = map.sites[bomb.site];
        const dist = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
        if (dist < 3.5) {
          bot.mode = 'defuse';
          bot.channelKind = 'defuse';
          bot.channel = Math.max(bot.channel, 0);
        } else {
          bot.mode = 'retreat';
          bot.path = map.findPath(bot.position.x, bot.position.z, site.x, site.z);
          bot.pathIndex = 0;
        }
        return;
      }
      // Hold near the assigned site; wander between two pockets.
      if (Math.hypot(bot.holdPos.x - bot.position.x, bot.holdPos.z - bot.position.z) < 1) {
        const site = Math.hypot(map.sites.A.x - bot.holdPos.x, map.sites.A.z - bot.holdPos.z)
          < Math.hypot(map.sites.B.x - bot.holdPos.x, map.sites.B.z - bot.holdPos.z)
          ? map.sites.A : map.sites.B;
        bot.holdPos = {
          x: site.x + (random() * 10 - 5),
          z: site.z + (random() * 8 - 2),
        };
      }
      bot.mode = 'hold';
      return;
    }
    // Ember attackers.
    if (bomb.planted) {
      const site = map.sites[bomb.site];
      bot.holdPos = { x: site.x + (random() * 8 - 4), z: site.z + (random() * 8 - 4) };
      bot.mode = 'hold';
      return;
    }
    if (bot.isCarrier) {
      const site = map.sites[bot.assignedSite];
      const dist = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
      if (dist < 3.5) {
        bot.mode = 'plant';
        bot.channelKind = 'plant';
        return;
      }
      if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
        bot.path = map.findPath(bot.position.x, bot.position.z, site.x, site.z);
        bot.pathIndex = 0;
      }
      bot.mode = 'advance';
      return;
    }
    // Non-carriers push up with the carrier or toward mid.
    const carrier = bots.find((b) => b.isCarrier && b.alive);
    const goal = carrier
      ? { x: carrier.position.x + (random() * 4 - 2), z: carrier.position.z + (random() * 4 - 2) }
      : { x: 0, z: 0 };
    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      bot.path = map.findPath(bot.position.x, bot.position.z, goal.x, goal.z);
      bot.pathIndex = 0;
    }
    bot.mode = 'advance';
  }

  function damage(bot, amount, attacker, headshot) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.flashTimer = 0.12;
    bot.body.suit.emissive.setHex(0xff2a1a);
    bot.body.suit.emissiveIntensity = 0.9;
    bot.channel = 0;
    if (bot.mode === 'plant' || bot.mode === 'defuse') {
      bot.mode = bot.team === 'warden' ? 'hold' : 'advance';
      bot.channelKind = null;
    }
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.body.group.rotation.set(0, bot.yaw, Math.PI / 2);
      bot.body.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  function hitMeshes() {
    const meshes = [];
    for (const bot of bots) {
      if (!bot.alive) continue;
      meshes.push(bot.body.head, bot.body.torso);
    }
    return meshes;
  }

  function investigate(x, z) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const dist = Math.hypot(x - bot.position.x, z - bot.position.z);
      if (dist < 25 && bot.mode !== 'engage' && bot.mode !== 'plant' && bot.mode !== 'defuse') {
        bot.mode = 'investigate';
        bot.path = map.findPath(bot.position.x, bot.position.z, x, z);
        bot.pathIndex = 0;
      }
    }
  }

  return {
    bots, resetRound, update, damage, aliveCount, hitMeshes, investigate,
    carrier() {
      return bots.find((b) => b.isCarrier) || null;
    },
  };
}
