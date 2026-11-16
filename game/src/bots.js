// The bots: nine of them, four on your side, five against. Each one has a
// skill (reaction, accuracy, burst), an assignment (a lane and a job), and a
// small state machine: move along the waypoint graph, hold an angle, engage
// what it sees, plant or defuse the charge. They see through a vision cone
// with a line-of-sight test, they hear gunfire, and they strafe and burst
// their fire like a player would — they never snap-aim through a wall.
import * as THREE from 'three';
import { createFighter, damage, shootPellet, partMultiplier } from './combat.js';
import { createMover } from './player.js';
import { nearestNode, findPath, clearSight } from './nav.js';
import { SPAWNS, SITES, NODES } from './map.js';
import { WEAPONS } from './weapons.js';
import { pick } from './rng.js';

const VANGUARD_NAMES = ['Rook', 'Sable', 'Ivy', 'Dune'];
const EMBER_NAMES = ['Ash', 'Cinder', 'Flint', 'Slate', 'Onyx'];
const WALK_SPEED = 4.4;
const EYE_HEIGHT = 1.55;
const VISION_RANGE = 42;
const VISION_HALF_ANGLE = 1.05; // ~60 degrees each side
const HEAR_RANGE = 26;

function angleTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function turnToward(current, target, maxStep) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function createBots(scene, colliders, random) {
  const mover = createMover(colliders, 0.34, 1.72);
  const bots = [];
  const hitMeshes = [];

  function spawnBot(team, name, index, skill) {
    const fighter = createFighter(scene, team, name);
    const spawn = SPAWNS[team][index % SPAWNS[team].length];
    fighter.position.set(spawn[0], 0, spawn[1]);
    fighter.group.position.copy(fighter.position);
    const defKey = team === 'ember' && index === 2 ? 'longbow' : index % 3 === 0 ? 'hornet' : 'vk47';
    const bot = {
      fighter,
      team,
      name,
      skill, // 0..1: higher is faster and more accurate
      def: WEAPONS[defKey],
      yaw: spawn[2],
      state: 'move',
      path: [],
      pathIndex: 0,
      holdNode: -1,
      holdYaw: 0,
      lane: 'mid',
      role: 'entry',
      enemy: null,
      lastSeen: null,
      lastSeenAt: -99,
      lastHeard: null,
      lastHeardAt: -99,
      reactAt: 0,
      burstLeft: 0,
      burstAt: 0,
      shotAt: 0,
      strafeDir: 1,
      strafeAt: 0,
      plantProgress: 0,
      defuseProgress: 0,
      isCarrier: false,
      speed: WALK_SPEED * (0.9 + skill * 0.2),
      body: {
        position: fighter.position,
        velocity: new THREE.Vector3(),
        yaw: spawn[2],
        onGround: true,
        height: 1.72,
      },
    };
    fighter.group.rotation.y = spawn[2];
    hitMeshes.push(fighter.head, fighter.torso, fighter.legs);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) spawnBot('vanguard', VANGUARD_NAMES[i], i, 0.55 + random() * 0.35);
  for (let i = 0; i < 5; i += 1) spawnBot('ember', EMBER_NAMES[i], i, 0.35 + random() * 0.35);

  function assignRound(round, carrier) {
    // Attackers split across lanes; defenders hold the sites and mid.
    const lanes = ['A', 'A', 'mid', 'B'];
    const vanguards = bots.filter((b) => b.team === 'vanguard');
    vanguards.forEach((b, i) => {
      b.lane = lanes[i % lanes.length];
      b.role = 'entry';
      b.isCarrier = false;
    });
    if (carrier) carrier.isCarrier = true;
    const embers = bots.filter((b) => b.team === 'ember');
    const holds = [11, 14, 13, 12, 15]; // nodes: A lane, site A, mid, B lane, site B
    embers.forEach((b, i) => {
      b.holdNode = holds[i % holds.length];
      b.role = 'hold';
      b.lane = i < 2 ? 'A' : i === 2 ? 'mid' : 'B';
    });
  }

  function resetRound(round, carrier) {
    for (const bot of bots) {
      const spawn = SPAWNS[bot.team][bots.filter((x) => x.team === bot.team).indexOf(bot) % SPAWNS[bot.team].length];
      bot.fighter.position.set(spawn[0], 0, spawn[1]);
      bot.fighter.group.position.copy(bot.fighter.position);
      bot.fighter.group.rotation.set(0, 0, 0);
      bot.fighter.group.rotation.y = spawn[2];
      bot.yaw = spawn[2];
      bot.body.yaw = spawn[2];
      bot.body.velocity.set(0, 0, 0);
      bot.fighter.health = 100;
      bot.fighter.armor = 0;
      bot.fighter.alive = true;
      bot.fighter.fall = 0;
      bot.state = 'move';
      bot.path = [];
      bot.pathIndex = 0;
      bot.enemy = null;
      bot.lastSeen = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.isCarrier = false;
    }
    assignRound(round, carrier);
  }

  // Where this bot wants to be when it has nothing to shoot at.
  function objectiveNode(bot, bomb) {
    if (bot.team === 'vanguard') {
      if (bomb.planted) return nearestSiteNode(bomb.site);
      if (bot.isCarrier) return bot.lane === 'B' ? 15 : 14; // the charge goes to a site, never to mid
      return bot.lane === 'A' ? 11 : bot.lane === 'B' ? 12 : 8;
    }
    if (bomb.planted) return nearestSiteNode(bomb.site);
    return bot.holdNode >= 0 ? bot.holdNode : 13;
  }
  function nearestSiteNode(site) {
    return site === 'A' ? 14 : 15;
  }

  function setPath(bot, goalNode) {
    const from = nearestNode(bot.fighter.position.x, bot.fighter.position.z);
    bot.path = findPath(from, goalNode);
    bot.pathIndex = 0;
  }

  // The nearest living enemy this bot can actually see.
  function visibleEnemy(bot, fighters, colliders, time) {
    let best = null;
    let bestD = Infinity;
    for (const f of fighters) {
      if (!f.alive || f.team === bot.team) continue;
      const dx = f.position.x - bot.fighter.position.x;
      const dz = f.position.z - bot.fighter.position.z;
      const d = Math.hypot(dx, dz);
      if (d > VISION_RANGE || d >= bestD) continue;
      const ang = Math.atan2(-dx, -dz);
      let diff = ang - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > VISION_HALF_ANGLE && d > 6) continue;
      if (!clearSight(colliders, bot.fighter.position.x, bot.fighter.position.z, f.position.x, f.position.z)) continue;
      best = f;
      bestD = d;
    }
    return best ? { fighter: best, distance: bestD } : null;
  }

  function fireAt(bot, target, ctx, time) {
    const def = bot.def;
    if (time < bot.shotAt) return false;
    bot.shotAt = time + def.gap;
    const from = bot.fighter.position.clone();
    from.y += 1.35;
    from.x += Math.sin(bot.yaw) * -0.3;
    from.z += Math.cos(bot.yaw) * -0.3;
    // Aim at the chest, sometimes the head; spread by skill and distance.
    const aimY = 1.05 + (bot.skill > 0.7 && ctx.random() < 0.3 ? 0.5 : 0);
    const to = target.position.clone();
    to.y += aimY;
    const dir = to.sub(from).normalize();
    const spread = (0.028 - bot.skill * 0.018) * (1 + target.position.distanceTo(bot.fighter.position) / 30);
    for (let p = 0; p < def.pellets; p += 1) {
      const d = dir.clone();
      d.x += (ctx.random() * 2 - 1) * spread;
      d.y += (ctx.random() * 2 - 1) * spread;
      d.z += (ctx.random() * 2 - 1) * spread;
      d.normalize();
      const hit = shootPellet(from, d, 80, ctx.hitMeshes);
      ctx.effects.tracer(from, hit.point);
      if (hit.fighter && hit.fighter.team !== bot.team) {
        const falloff = Math.max(0.5, 1 - Math.max(0, hit.distance - def.falloff) / 40);
        const amount = def.damage * partMultiplier(hit.part, def.headMult) * falloff;
        const killed = damage(hit.fighter, amount);
        ctx.onHit(bot, hit.fighter, hit.part, killed);
        if (killed) ctx.onKill(bot, hit.fighter);
      } else if (hit.point) {
        ctx.effects.sparksAt(hit.point, ctx.random, 3);
      }
    }
    ctx.onShot(bot);
    return true;
  }

  function step(bot, dt, time, ctx) {
    const f = bot.fighter;
    if (!f.alive) {
      if (f.fall < 1) {
        f.fall = Math.min(1, f.fall + dt / 0.4);
        f.group.rotation.x = -f.fall * 1.45;
      }
      return;
    }
    f.group.rotation.x = 0;
    // Senses.
    const seen = visibleEnemy(bot, ctx.fighters, ctx.colliders, time);
    if (seen) {
      bot.enemy = seen.fighter;
      bot.lastSeen = seen.fighter.position.clone();
      bot.lastSeenAt = time;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactAt = time + 0.55 - bot.skill * 0.3 + ctx.random() * 0.15;
        bot.burstLeft = 0;
      }
    } else if (bot.enemy && time - bot.lastSeenAt > 1.2) {
      bot.enemy = null;
      bot.state = 'move';
      bot.path = [];
    }
    // Hearing: a shot nearby pulls the bot toward it.
    if (ctx.lastShot && time - ctx.lastShot.at < 0.8) {
      const d = Math.hypot(ctx.lastShot.x - f.position.x, ctx.lastShot.z - f.position.z);
      if (d < HEAR_RANGE && d > 4 && !bot.enemy) {
        bot.lastHeard = { x: ctx.lastShot.x, z: ctx.lastShot.z };
        bot.lastHeardAt = time;
      }
    }

    if (bot.state === 'engage' && bot.enemy && bot.enemy.alive) {
      // Face the enemy, strafe, and fire in bursts after reacting.
      const targetYaw = angleTo(f.position, bot.enemy.position);
      bot.yaw = turnToward(bot.yaw, targetYaw, dt * 9);
      if (time > bot.strafeAt) {
        bot.strafeAt = time + 0.7 + ctx.random() * 0.8;
        bot.strafeDir = ctx.random() < 0.5 ? -1 : 1;
      }
      const strafe = bot.strafeDir;
      const sin = Math.sin(bot.yaw);
      const cos = Math.cos(bot.yaw);
      const wx = cos * strafe;
      const wz = -sin * strafe;
      mover.move(bot.body, dt, wx, wz, bot.speed * 0.55);
      f.group.position.copy(f.position);
      f.group.rotation.y = bot.yaw;
      if (time >= bot.reactAt) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(ctx.random() * 3);
          bot.burstAt = time + 0.6 + ctx.random() * 0.6;
        } else if (time >= bot.burstAt) {
          if (fireAt(bot, bot.enemy, ctx, time)) {
            bot.burstLeft -= 1;
            if (bot.burstLeft <= 0) bot.burstAt = time + 0.6 + ctx.random() * 0.6;
          }
        }
      }
      return;
    }

    // Objective behaviour.
    const bomb = ctx.bomb;
    if (bot.team === 'vanguard' && bot.isCarrier && !bomb.planted) {
      const site = SITES.find((s) => Math.abs(f.position.x - s.x) <= s.half && Math.abs(f.position.z - s.z) <= s.half);
      if (site) {
        bot.state = 'plant';
        bot.plantProgress += dt;
        if (bot.plantProgress >= 3) {
          ctx.onPlanted(site.name);
          bot.plantProgress = 0;
          bot.state = 'move';
        }
        return;
      }
    }
    if (bot.team === 'ember' && bomb.planted) {
      const site = SITES.find((s) => s.name === bomb.site);
      const d = Math.hypot(site.x - f.position.x, site.z - f.position.z);
      if (d < site.half - 1) {
        bot.state = 'defuse';
        bot.defuseProgress += dt;
        if (bot.defuseProgress >= 5) {
          ctx.onDefused();
          bot.defuseProgress = 0;
          bot.state = 'move';
        }
        return;
      }
    }
    bot.plantProgress = 0;
    bot.defuseProgress = 0;

    // Move toward the objective node, or hold.
    const goal = objectiveNode(bot, bomb);
    if (goal === -1) {
      bot.state = 'hold';
      return;
    } else if (bot.team === 'ember' && bot.role === 'hold' && !bomb.planted && bot.path.length === 0) {
      // Defenders walk to their hold, then face their lane. The check is a
      // real distance, not nearest-node: a site hold's nearest node from
      // spawn is the hold itself, 5 m away, and a bot must actually walk it.
      const hx = NODES[bot.holdNode][0];
      const hz = NODES[bot.holdNode][1];
      if (Math.hypot(hx - f.position.x, hz - f.position.z) < 1.2) {
        bot.state = 'hold';
        const holdYaw = bot.lane === 'A' ? Math.PI * 0.75 : bot.lane === 'B' ? Math.PI * 1.25 : Math.PI;
        bot.yaw = turnToward(bot.yaw, holdYaw, dt * 3);
        return;
      }
    }
    if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) setPath(bot, goal);
    const node = NODES[bot.path[bot.pathIndex]];
    const dx = node[0] - f.position.x;
    const dz = node[1] - f.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      bot.pathIndex += 1;
      if (bot.pathIndex >= bot.path.length) {
        bot.path = [];
        if (bot.team === 'ember' && bot.role === 'hold' && !bomb.planted) {
          bot.state = 'hold';
        }
        return;
      }
    } else {
      const targetYaw = Math.atan2(-dx, -dz);
      bot.yaw = turnToward(bot.yaw, targetYaw, dt * 7);
      const sin = Math.sin(bot.yaw);
      const cos = Math.cos(bot.yaw);
      mover.move(bot.body, dt, -sin, -cos, bot.speed);
      f.group.position.copy(f.position);
      f.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    hitMeshes,
    resetRound,
    step,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.fighter.alive).length;
    },
  };
}
