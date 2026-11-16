// The match: rounds, money, the charge and the score, all in one place. The
// fixed-step simulation calls update() and the events below; the renderer and
// the HUD only read this state. First to 5 rounds takes the match, at most 9
// rounds. Ember attacks, the Wardens defend.
import { createLoadout, buyWeapon, buyGrenade, buyArmor, WEAPONS, GRENADE, ARMOR_PRICE } from './weapons.js';
import { applyDamage } from './player.js';

export const FREEZE_SECONDS = 8;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 40;
export const PLANT_SECONDS = 3.5;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

const KILL_REWARD = 300;
const ROUND_WIN_REWARD = 325;
const ROUND_LOSS_REWARD = 200;
const OBJECTIVE_REWARD = 300;

export function createMatch(map, bots, player, hud, audio) {
  const state = {
    phase: 'freeze', // freeze | live | planted | end | match
    phaseTime: FREEZE_SECONDS,
    round: 1,
    score: { ember: 0, warden: 0 },
    money: 800,
    loadout: createLoadout(),
    bomb: { planted: false, site: null, x: 0, z: 0, fuse: 0 },
    carrierName: 'Ash',
    roundWinner: null,
    matchWinner: null,
    matchReason: '',
    playerChannel: null, // { kind: 'plant'|'defuse', progress }
    spectateBot: null,
    kills: 0,
    deaths: 0,
  };

  function buyItems() {
    const items = [
      { key: '1', name: `${WEAPONS.smg.name} — SMG`, price: WEAPONS.smg.price, owned: !!state.loadout.weapons.smg, affordable: state.money >= WEAPONS.smg.price },
      { key: '2', name: `${WEAPONS.rifle.name} — Rifle`, price: WEAPONS.rifle.price, owned: !!state.loadout.weapons.rifle, affordable: state.money >= WEAPONS.rifle.price },
      { key: '3', name: `${WEAPONS.dmr.name} — DMR, scoped`, price: WEAPONS.dmr.price, owned: !!state.loadout.weapons.dmr, affordable: state.money >= WEAPONS.dmr.price },
      { key: '4', name: `${GRENADE.name} — explosive`, price: GRENADE.price, owned: false, affordable: state.money >= GRENADE.price && state.loadout.grenades < 2 },
      { key: '5', name: 'Kevlar armour', price: ARMOR_PRICE, owned: state.loadout.armor >= 100, affordable: state.money >= ARMOR_PRICE && state.loadout.armor < 100 },
    ];
    return items;
  }

  function refreshBuy() {
    if (state.phase === 'freeze') hud.showBuy(buyItems(), state.money);
  }

  function tryBuy(key) {
    if (state.phase !== 'freeze') return;
    let result = { ok: false, money: state.money };
    if (key === 'Digit1') result = buyWeapon(state.loadout, 'smg', state.money);
    else if (key === 'Digit2') result = buyWeapon(state.loadout, 'rifle', state.money);
    else if (key === 'Digit3') result = buyWeapon(state.loadout, 'dmr', state.money);
    else if (key === 'Digit4') result = buyGrenade(state.loadout, state.money);
    else if (key === 'Digit5') result = buyArmor(state.loadout, state.money);
    else return;
    if (result.ok) {
      state.money = result.money;
      if (key === 'Digit5') player.state.armor = 100;
      audio.buy();
      hud.setMoney(state.money);
      refreshBuy();
    }
  }

  function startRound() {
    const spawn = map.spawns.ember[0];
    player.reset(spawn);
    player.state.armor = state.loadout.armor;
    state.carrierName = state.round % 2 === 1 ? 'Ash' : 'Cinder';
    bots.resetRound(state.round, state.carrierName);
    state.bomb = { planted: false, site: null, x: 0, z: 0, fuse: 0 };
    state.phase = 'freeze';
    state.phaseTime = FREEZE_SECONDS;
    state.roundWinner = null;
    state.playerChannel = null;
    state.spectateBot = null;
    hud.setScore(state.score.ember, state.score.warden, state.round);
    hud.setMoney(state.money);
    hud.setHealth(100, player.state.armor);
    hud.banner(`ROUND ${state.round}`, 'Buy phase — press 1–5 to buy, B to close', 3000);
    refreshBuy();
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.roundWinner = winner;
    state.phase = 'end';
    state.phaseTime = 5;
    state.score[winner] += 1;
    state.money += winner === 'ember' ? ROUND_WIN_REWARD : ROUND_LOSS_REWARD;
    hud.setScore(state.score.ember, state.score.warden, state.round);
    hud.setMoney(state.money);
    hud.hideBuy();
    hud.plantProgress('', null);
    const won = winner === 'ember';
    if (won) audio.roundWin(); else audio.roundLose();
    hud.banner(
      won ? 'ROUND WON' : 'ROUND LOST',
      `${reason} — Ember ${state.score.ember} : ${state.score.warden} Warden`,
      4200,
    );
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'match';
      state.phaseTime = 8;
      state.matchWinner = state.score.ember > state.score.warden ? 'ember'
        : state.score.warden > state.score.ember ? 'warden' : 'draw';
      state.matchReason = state.matchWinner === 'ember'
        ? 'Ember takes Foundry Yard.'
        : state.matchWinner === 'warden'
          ? 'The Wardens hold Foundry Yard.'
          : 'Dead even after nine rounds.';
    }
  }

  function checkElimination() {
    if (state.phase !== 'live' && state.phase !== 'planted') return;
    if (bots.aliveCount('warden') === 0) {
      endRound('ember', state.bomb.planted ? 'Charge detonated the yard' : 'Warden team eliminated');
    } else if (bots.aliveCount('ember') === 0 && !player.state.alive) {
      if (state.bomb.planted) {
        // The charge still decides it: the round plays on until it blows.
      } else {
        endRound('warden', 'Ember team eliminated');
      }
    }
  }

  function update(dt) {
    state.phaseTime -= dt;
    if (state.phase === 'freeze' && state.phaseTime <= 0) {
      state.phase = 'live';
      state.phaseTime = ROUND_SECONDS;
      hud.hideBuy();
      hud.banner('GO', state.bomb.planted ? '' : `Plant the charge at ${map.sites.A.key} or ${map.sites.B.key}`, 1600);
    } else if (state.phase === 'live' && state.phaseTime <= 0) {
      endRound('warden', 'Time expired — the charge was never planted');
    } else if (state.phase === 'planted') {
      state.bomb.fuse -= dt;
      state.phaseTime = state.bomb.fuse;
      if (state.bomb.fuse <= 0) {
        endRound('ember', 'Charge detonated');
      }
    } else if (state.phase === 'end' && state.phaseTime <= 0) {
      state.round += 1;
      // Death loses the bought guns; the sidearm stays.
      state.loadout = createLoadout();
      startRound();
    } else if (state.phase === 'match' && state.phaseTime <= 0) {
      // Match over: stay on the overlay until the player restarts.
    }
    checkElimination();
  }

  function onPlanted(byBot) {
    if (state.bomb.planted) return;
    const site = map.sites[byBot.assignedSite];
    state.bomb = { planted: true, site: byBot.assignedSite, x: site.x, z: site.z, fuse: FUSE_SECONDS };
    state.phase = 'planted';
    state.phaseTime = FUSE_SECONDS;
    state.money += OBJECTIVE_REWARD;
    hud.setMoney(state.money);
    hud.banner('CHARGE PLANTED', `Site ${byBot.assignedSite} — ${FUSE_SECONDS}s to detonation`, 3000);
    audio.plant();
  }

  function onPlayerPlanted() {
    if (state.bomb.planted) return;
    const near = nearestSite(player.state.position);
    if (!near) return;
    state.bomb = { planted: true, site: near.key, x: near.x, z: near.z, fuse: FUSE_SECONDS };
    state.phase = 'planted';
    state.phaseTime = FUSE_SECONDS;
    state.money += OBJECTIVE_REWARD;
    hud.setMoney(state.money);
    hud.banner('CHARGE PLANTED', `Site ${near.key} — ${FUSE_SECONDS}s to detonation`, 3000);
    audio.plant();
  }

  function onDefused(byBot) {
    if (!state.bomb.planted) return;
    state.bomb = { planted: false, site: null, x: 0, z: 0, fuse: 0 };
    endRound('warden', `Charge defused by ${byBot.name}`);
  }

  function nearestSite(position) {
    for (const site of Object.values(map.sites)) {
      if (Math.hypot(site.x - position.x, site.z - position.z) < 4) return site;
    }
    return null;
  }

  function playerChannelUpdate(dt, holdingE) {
    if (state.phase !== 'live' && state.phase !== 'planted') {
      state.playerChannel = null;
      return;
    }
    if (!holdingE || !player.state.alive) {
      state.playerChannel = null;
      hud.plantProgress('', null);
      return;
    }
    const site = nearestSite(player.state.position);
    if (!site) {
      state.playerChannel = null;
      hud.plantProgress('', null);
      return;
    }
    if (!state.bomb.planted) {
      // Only the carrier plants; the player always carries the charge.
      if (!state.playerChannel || state.playerChannel.kind !== 'plant') {
        state.playerChannel = { kind: 'plant', progress: 0 };
      }
      state.playerChannel.progress += dt / PLANT_SECONDS;
      hud.plantProgress(`PLANTING — SITE ${site.key}`, state.playerChannel.progress);
      if (Math.floor(state.playerChannel.progress * 10) !== Math.floor((state.playerChannel.progress - dt / PLANT_SECONDS) * 10)) {
        audio.beep();
      }
      if (state.playerChannel.progress >= 1) {
        state.playerChannel = null;
        hud.plantProgress('', null);
        onPlayerPlanted();
      }
    } else if (state.bomb.site === site.key && player.state.alive) {
      // Player is Ember: cannot defuse their own charge.
      state.playerChannel = null;
      hud.plantProgress('', null);
    }
  }

  function damagePlayer(amount, attacker) {
    if (!player.state.alive || state.phase === 'freeze') return;
    const result = applyDamage(player.state.health, player.state.armor, amount);
    player.state.health = result.health;
    player.state.armor = result.armor;
    hud.setHealth(player.state.health, player.state.armor);
    hud.damageFlash();
    audio.hurt();
    if (player.state.health <= 0) {
      player.state.alive = false;
      state.deaths += 1;
      state.spectateBot = bots.bots.find((b) => b.alive && b.team === 'ember') || null;
      hud.showOverlay('dead', `Ember ${state.score.ember} : ${state.score.warden} Warden`);
      checkElimination();
    }
  }

  function damageBot(bot, amount, attacker, headshot) {
    const killed = bots.damage(bot, amount, attacker, headshot);
    if (killed) {
      const killerName = attacker === 'player' ? 'YOU' : attacker.name;
      const killerTeam = attacker === 'player' ? 'ember' : attacker.team;
      hud.killfeed(killerName, bot.name, headshot, killerTeam);
      if (attacker === 'player') {
        state.kills += 1;
        state.money += KILL_REWARD;
        hud.setMoney(state.money);
        audio.kill();
      }
      // The charge passes to the next living attacker.
      if (bot.isCarrier) {
        bot.isCarrier = false;
        const next = bots.bots.find((b) => b.alive && b.team === 'ember');
        if (next) {
          next.isCarrier = true;
          next.assignedSite = bot.assignedSite;
          state.carrierName = next.name;
        }
      }
      checkElimination();
    } else if (attacker === 'player') {
      audio.hit();
    }
    return killed;
  }

  function restartMatch() {
    state.score = { ember: 0, warden: 0 };
    state.round = 1;
    state.money = 800;
    state.loadout = createLoadout();
    state.matchWinner = null;
    state.kills = 0;
    state.deaths = 0;
    startRound();
  }

  return {
    state,
    startRound,
    update,
    tryBuy,
    refreshBuy,
    onPlanted,
    onPlayerPlanted,
    onDefused,
    playerChannelUpdate,
    damagePlayer,
    damageBot,
    restartMatch,
    nearestSite,
  };
}
