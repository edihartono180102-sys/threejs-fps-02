// DUSTLINE — a threejs-fps-02 entry (Node 22, standard library only).
//
// The game itself is the plain static files in game/ beside this file:
// ES modules the browser loads with three.js from an import map. This
// program hands the entry in: it copies game/ and screenshots/ into the
// output directory and writes /output/dossier.json — the summary the
// judge reads — with the vendored make.fun library.
//
// A five-on-five tactical FPS in a desert yard: buy gear between rounds,
// plant the charge or defuse it, and win the round.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// Where this file lives, and where the entry goes.
const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (from the kit's reference/gate.json). Only
// text_max_bytes shapes the dossier's bytes; the rest refuse an entry
// the scorer would refuse — more than 4 screenshots or one over 256 KiB,
// more than 993 files in game/ or 48 MiB of game files in all. game/
// counts beside /output's own 1000-entry cap, together with its
// screenshots/ and dossier.json, so the caps leave them room.
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyTree(join(root, 'game'), join(outDir, 'game'));

// screenshots/ is made by the entry's maker; the copy runs only when
// it exists, so a bare checkout still hands in.
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_OPTIONS));
