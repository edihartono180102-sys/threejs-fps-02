# DUSTLINE — threejs-fps-02 entry

A five-on-five tactical FPS in a walled desert yard, built on three.js 0.187.0
(vendored byte-for-byte, no network at runtime). You are Vanguard: buy your
gear, push a lane with four bot teammates, plant the charge at Site A or Site B
— or drop all five Ember defenders before the clock runs out. First to 5 rounds
wins, at most 9.

## How to play

Serve it locally and open it in desktop Chrome:

```
node serve.ts
# http://localhost:8080
```

| Key | Action |
| --- | ------ |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| Right click | Aim down sights |
| R | Reload |
| E (hold) | Plant / defuse the charge |
| B | Buy menu (buy phase only) |
| 1–6 | Buy from the menu |
| Q | Switch primary / pistol |
| G | Throw a Spark-1 frag grenade |
| Ctrl / C | Crouch |
| Space | Jump |

## The game

- **Map — DUSTLINE YARD, 56×40 m.** Three lanes cross a mid wall to two bomb
  sites. Crates are crouch cover, containers block sight standing, the long
  sightline through mid doors is broken by a teal container.
- **Economy.** Start $800; kill +$300, round win +$3,250 (plus a small win-
  streak bonus), round loss +$1,900 (+$500 per consecutive loss, max three),
  plant +$300. A loss streak deepens the payout, so comebacks stay possible.
- **Arsenal.** P9 pistol, VK-47 rifle, Hornet-9 SMG, Breacher-12 shotgun,
  Longbow-7 sniper, Spark-1 frag grenade, Kevlar. Headshots ×3 (shotgun ×2),
  legs ×0.75, damage falloff past each weapon's range, spread that grows
  with sustained fire and shrinks when aimed, recoil and kick, view-model
  bob and sway.
- **Bots.** Nine of them with skill tiers (reaction, accuracy, burst),
  magazines and reloads, lane assignments, A* waypoint paths, vision cones
  with line-of-sight tests, hearing, strafing, burst fire, site holds,
  a 1.5 s peek when they lose their target, rotations on a plant, and a
  carrier who plants when you fall.
- **The charge.** Plant by holding E for 3 s in a site; 35 s timer with
  quickening beeps; detonation wins the round for Vanguard. Defenders hold
  E for 5 s to defuse. Blast damage falls off quadratically, so standing
  on the charge is fatal and the far corner is merely painful.
- **Movement.** Acceleration and friction, crouch, jump with coyote time
  and a buffered press, and step-up onto knee-high ledges instead of
  bumping into them.
- **Presentation.** Desert dusk palette, shadows, fog, a full HUD (health
  and armor, ammo with a low-magazine warning, money, timer, round score,
  alive pips, kill feed, hit marker, damage direction, buy menu, round
  banner, match scoreboard), and synthesized Web Audio sound — no audio
  files ship with the game.

## Architecture

Fixed 60 Hz simulation in `game/src/main.js`, one state per module, rendering
reads state, no per-frame allocations in the hot loops:

- `map.js` — the yard, colliders, sites, spawns, waypoint graph
- `nav.js` — A* paths with a binary heap, exact 2D line-of-sight test
- `player.js` — movement, step-up, coyote time, hitboxes (shared mover for bots)
- `bots.js` — the AI state machine
- `weapons.js` — the armoury, view models, grenade flight
- `combat.js` — fighters, hitscan, damage, pooled tracers and sparks
- `bomb.js` — plant / timer / defuse / blast
- `rounds.js` — phases, score, streak economy, round history
- `hud.js` — the DOM HUD and buy menu
- `input.js` — keyboard, mouse, pointer lock, sensitivity
- `audio.js` — synthesized sound as step lists
- `rng.js` — seeded random (mulberry32) plus int, range, bell draws

## Screenshots

Deterministic captures, `?shot=<name>&seed=1`:

1. `1-start.png` — the yard from the attacker spawn
2. `2-buy.png` — the buy menu at round start
3. `3-play.png` — mid-round, bots fighting down the A connector
4. `4-end.png` — round won at Site A

## Entry

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to `/output`
and writes `/output/dossier.json` via the vendored `vendor/makefun-threejs.ts`.

## Tests

Headless, no browser needed — real three.js in Node, the simulation modules
only (the renderer needs a browser):

- `~/workspace/makefun-kits/fps-02-tests/test.mjs` — 40 checks: seeded RNG,
  nav graph and line-of-sight, round economy, bomb plant/timer/blast, player
  movement and wall collision, hitscan and armor, the weapons state machine,
  a full bot match, and a carrier bot planting on its own. All pass.
- `~/workspace/makefun-kits/fps-02-tests/gate-check.mjs` — mirrors the kit's
  six gate rows (files, three.js bytes, references, screenshots, dossier
  match, JS parses). All rows pass with screenshots present; without them the
  screenshots row (and the dossier build, which needs a cover) fail.
- `~/workspace/makefun-kits/fps-02-tests/import-graph.mjs` — every import in
  every module resolves, and every named import is exported.
