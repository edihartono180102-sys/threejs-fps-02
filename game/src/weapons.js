// Weapons of Emberworks. Four guns and one grenade, each with its own damage,
// spread, recoil and price, so stopping to aim pays and spraying on the move
// does not. All numbers are per-shot; the match owns money, this file owns
// the feel of firing.
export const WEAPONS = {
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', short: 'P9', price: 0,
    damage: 26, headMult: 2.5, rpm: 320, mag: 12, reserve: 48,
    spread: 0.011, moveSpread: 0.02, adsSpread: 0.004,
    recoil: 0.011, range: 45, auto: false, zoom: 1,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', short: 'HRN', price: 1200,
    damage: 22, headMult: 2.2, rpm: 780, mag: 30, reserve: 120,
    spread: 0.02, moveSpread: 0.032, adsSpread: 0.009,
    recoil: 0.008, range: 35, auto: true, zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Rifle', short: 'VK-7', price: 2500,
    damage: 33, headMult: 2.5, rpm: 600, mag: 25, reserve: 75,
    spread: 0.008, moveSpread: 0.024, adsSpread: 0.0025,
    recoil: 0.016, range: 60, auto: true, zoom: 1,
  },
  dmr: {
    id: 'dmr', name: 'Longshot DMR', short: 'LNG', price: 4000,
    damage: 82, headMult: 2.8, rpm: 75, mag: 8, reserve: 32,
    spread: 0.004, moveSpread: 0.03, adsSpread: 0.0008,
    recoil: 0.05, range: 80, auto: false, zoom: 2.2,
  },
};

export const GRENADE = {
  id: 'grenade', name: 'Spark Grenade', short: 'GRN', price: 300,
  damage: 110, radius: 6.5, fuse: 1.9,
};

export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5;

export function createLoadout() {
  return {
    primary: 'sidearm',
    weapons: {
      sidearm: { mag: 12, reserve: 48 },
      smg: null, rifle: null, dmr: null,
    },
    grenades: 0,
    armor: 0,
  };
}

export function buyWeapon(loadout, id, money) {
  const def = WEAPONS[id];
  if (!def || def.price > money) return { ok: false, money };
  if (id === 'sidearm') return { ok: false, money };
  if (loadout.weapons[id]) return { ok: false, money };
  loadout.weapons[id] = { mag: def.mag, reserve: def.reserve };
  loadout.primary = id;
  return { ok: true, money: money - def.price };
}

export function buyGrenade(loadout, money) {
  if (loadout.grenades >= 2 || GRENADE.price > money) return { ok: false, money };
  loadout.grenades += 1;
  return { ok: true, money: money - GRENADE.price };
}

export function buyArmor(loadout, money) {
  if (loadout.armor >= 100 || ARMOR_PRICE > money) return { ok: false, money };
  loadout.armor = 100;
  return { ok: true, money: money - ARMOR_PRICE };
}

export function currentWeapon(loadout) {
  return WEAPONS[loadout.primary];
}

export function currentAmmo(loadout) {
  return loadout.weapons[loadout.primary];
}

// Damage after range falloff: full out to half range, then down to 60%.
export function damageAt(def, distance) {
  const falloff = Math.max(0.6, 1 - Math.max(0, distance - def.range / 2) / def.range);
  return def.damage * falloff;
}

// Spread in radians for one shot, from stance and aim.
export function shotSpread(def, moving, crouched, aiming, bloom) {
  let spread = aiming ? def.adsSpread : def.spread;
  if (moving) spread += def.moveSpread;
  if (crouched) spread *= 0.6;
  return spread + bloom;
}
