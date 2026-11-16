// Seeded random, so a screenshot seed replays the same match. The core
// is mulberry32 — small, fast, and good enough for bot decisions — kept
// apart so every module shares one stream. On top of it sit the helpers
// the game actually reaches for: bounded integers, ranges, picks,
// shuffles and a bell-shaped draw for aim error, so no module reinvents
// its own dice.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer in [min, max], both ends included.
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

// Float in [min, max).
export function range(random, min, max) {
  return min + random() * (max - min);
}

export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

export function shuffle(random, array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const t = array[i];
    array[i] = array[j];
    array[j] = t;
  }
  return array;
}

// Bell-shaped draw in [-1, 1], peaked at 0: the average of three
// uniforms. Bots use it for aim error, so most shots land near the
// aim point and a few spray wide — never a flat spread.
export function bell(random) {
  return (random() + random() + random() - 1.5) / 1.5;
}

// A small object wrapper for modules that would rather carry state than
// pass a bare function around. Same stream, same seed, same replay.
export function createRandom(seed) {
  const random = mulberry32(seed);
  return {
    next: random,
    int: (min, max) => int(random, min, max),
    range: (min, max) => range(random, min, max),
    pick: (array) => pick(random, array),
    shuffle: (array) => shuffle(random, array),
    bell: () => bell(random),
    chance: (p) => random() < p,
  };
}
