// The charge: one objective beyond killing. The player carries it every
// round (a friendly bot takes it if the player falls). Plant it in a site
// by holding E for 3 s; it ticks for 35 s with beeps that quicken, then it
// blows the round to the attackers. A defender holds E for 5 s to defuse.
// The bomb's own state lives here; the bots' plant and defuse runs live
// in bots.js. Blast damage falls off quadratically with distance, so
// standing on the charge is fatal and the far corner is merely painful.
import { SITES } from './map.js';

export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const BOMB_SECONDS = 35;
export const BLAST_RADIUS = 10;
const BLAST_MAX = 200; // damage at ground zero
const BLAST_MIN = 30; // damage at the edge of the radius

function siteNamed(name) {
  return SITES.find((s) => s.name === name) || null;
}

export function createBomb() {
  const state = {
    carriedBy: 'player', // 'player' | bot object | null
    site: null, // 'A' | 'B' | null: the site it is planted at
    planted: false,
    timer: 0,
    plantProgress: 0,
    defuseProgress: 0,
    beepAt: 0,
    exploded: false,
  };

  function siteAt(pos) {
    for (const site of SITES) {
      if (Math.abs(pos.x - site.x) <= site.half && Math.abs(pos.z - site.z) <= site.half) return site.name;
    }
    return null;
  }

  // Beeps quicken as the timer runs down: one a second at first, then
  // almost a buzz in the last five seconds.
  function scheduleBeep(ctx) {
    const fraction = Math.max(0, state.timer / BOMB_SECONDS);
    const interval = 0.15 + fraction * 0.85;
    if (ctx.time >= state.beepAt) {
      state.beepAt = ctx.time + interval;
      ctx.audio.plantBeep(state.timer < 5);
    }
  }

  function tickPlanted(dt, player, ctx) {
    state.timer -= dt;
    scheduleBeep(ctx);
    if (state.timer <= 0 && !state.exploded) {
      state.exploded = true;
      ctx.onExploded();
    }
    // Defuse: a defender holding E beside the planted charge. The
    // progress itself is advanced by the bots' module for bots; here
    // the player only ever plants, so a defender player sees the
    // charge's remaining time instead of a defuse bar.
    if (player.team === 'ember') return state.defuseProgress;
    return 0;
  }

  function tickCarried(dt, player, keys, ctx) {
    if (state.carriedBy !== 'player' || !player.alive) {
      state.plantProgress = 0;
      return 0;
    }
    const site = siteAt(player.position);
    if (site && keys.has('KeyE')) {
      state.plantProgress += dt;
      if (state.plantProgress >= PLANT_SECONDS) {
        state.planted = true;
        state.site = site;
        state.timer = BOMB_SECONDS;
        state.plantProgress = 0;
        state.beepAt = ctx.time;
        ctx.onPlanted(site);
      }
    } else {
      state.plantProgress = 0;
    }
    return state.plantProgress / PLANT_SECONDS;
  }

  return {
    state,
    resetRound() {
      state.carriedBy = 'player';
      state.site = null;
      state.planted = false;
      state.timer = 0;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.beepAt = 0;
      state.exploded = false;
    },
    siteAt,
    // The player's own plant/defuse, driven by holding E. Returns the
    // progress to show in the HUD. Bot plant/defuse is handled in bots.js.
    stepPlayer(dt, player, keys, ctx) {
      if (state.planted) return tickPlanted(dt, player, ctx);
      return tickCarried(dt, player, keys, ctx);
    },
    // Explosion damage: quadratic falloff, both teams, through nothing.
    blastDamage(fighters) {
      const site = siteNamed(state.site);
      if (!site) return [];
      const out = [];
      for (const f of fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.position.x - site.x, f.position.z - site.z);
        if (d > BLAST_RADIUS) continue;
        const t = 1 - d / BLAST_RADIUS;
        const amount = Math.round(BLAST_MIN + (BLAST_MAX - BLAST_MIN) * t * t);
        out.push({ fighter: f, amount });
      }
      return out;
    },
  };
}
