// DUSTLINE look plan, in one place. A desert dusk yard: warm sand, rusted steel,
// slate concrete, one amber accent. Team colours are the only other hues:
// Vanguard blue, Ember orange. The same names are the CSS custom properties.
// The table below is the single source: PALETTE is built from it, so a hue
// changes in one place and reaches the map, the HUD and the site decals.
const ENTRIES = [
  ['sky', '#e3c188'],
  ['sand', '#b98d5f'],
  ['sandDark', '#9a744a'],
  ['concrete', '#8a7f70'],
  ['slate', '#4a4640'],
  ['rust', '#a85b32'],
  ['teal', '#2f6f6a'],
  ['ink', '#f2ede3'],
  ['dark', '#1e1a16'],
  ['muted', '#a89a86'],
  ['accent', '#f0a830'],
  ['vanguard', '#3f7fbf'],
  ['ember', '#d2542e'],
];

export const PALETTE = Object.fromEntries(ENTRIES);

export function mat(color, roughness = 0.9, metalness = 0.02) {
  return { color, roughness, metalness };
}

// The team's colour, by team name — the one place that maps 'vanguard' and
// 'ember' to their hex, so the HUD and the scoreboard never hard-code them.
export function teamColor(team) {
  return team === 'vanguard' ? PALETTE.vanguard : PALETTE.ember;
}
