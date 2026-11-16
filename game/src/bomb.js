// The charge: one objective beyond killing. The player carries it every round
// (a friendly bot takes it if the player falls). Plant it in a site by holding
// E for 3 s; it ticks for 35 s with beeps that quicken, then it blows the
// round to the attackers. A defender holds E for 5 s to defuse. The bomb's
// own state lives here; the bots' plant and defuse runs live in bots.js.
import { SITES } from './map.js';

export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const BOMB_SECONDS = 35;
export const BLAST_RADIUS = 10;

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

  function inSite(pos, name) {
    const site = SITES.find((s) => s.name === name);
    return Math.abs(pos.x - site.x) <= site.half && Math.abs(pos.z - site.z) <= site.half;
  }

  function siteAt(pos) {
    for (const site of SITES) {
      if (Math.abs(pos.x - site.x) <= site.half && Math.abs(pos.z - site.z) <= site.half) return site.name;
    }
    return null;
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
    // The player's own plant/defuse, driven by holding E. Returns the progress
    // to show in the HUD. Bot plant/defuse is handled in bots.js.
    stepPlayer(dt, player, keys, ctx) {
      if (state.planted) {
        state.timer -= dt;
        // Beeps quicken as the timer runs down: every 1 s, then every 0.15 s.
        const interval = 0.15 + (state.timer / BOMB_SECONDS) * 0.85;
        if (ctx.time >= state.beepAt) {
          state.beepAt = ctx.time + interval;
          ctx.audio.plantBeep(state.timer < 5);
        }
        if (state.timer <= 0 && !state.exploded) {
          state.exploded = true;
          ctx.onExploded();
        }
        // Defuse: a defender holding E beside the planted charge.
        if (player.team === 'ember') return state.defuseProgress;
        return 0;
      }
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
    },
    // Explosion damage: linear falloff, both teams, through nothing.
    blastDamage(fighters) {
      const site = SITES.find((s) => s.name === state.site);
      if (!site) return [];
      const out = [];
      for (const f of fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.position.x - site.x, f.position.z - site.z);
        if (d > BLAST_RADIUS) continue;
        out.push({ fighter: f, amount: Math.round(200 - (170 * d) / BLAST_RADIUS) });
      }
      return out;
    },
  };
}
