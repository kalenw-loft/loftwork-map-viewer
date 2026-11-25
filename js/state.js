// Shared constants, helpers and the map's state. Scalars that change live on S so every
// module sees the same value; the arrays below are filled once and never reassigned.

export const TYPE_LABEL = ['Projects', 'Findings', 'Events', 'News'];
export const TYPE_ONE = ['Project', 'Finding', 'Event', 'News'];
export const TYPE_SIZE = [2.3, 1.9, 1.15, 1.25];
export const Y0 = 2007, Y_STEP = 2.6;                 // height per year
export const GLOW_COUNT = 14, GLOW_FABCAFE = 5;       // how many nodes glow per visit, and FabCafe's share
export const FAB_WHITE = '#F6F3EE';
export const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const $ = (id) => document.getElementById(id);
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const yOf = (t) => (t - Y0) * Y_STEP;

export const S = {
  D: null, items: null, N: 0, FAB: 0, maxYear: undefined, geo: null,   // set once the data loads
  ring: null, domainColors: null, langColors: null,
  baseOn: -1, selected: -1, focus: -1, yearNow: 2030,
  langView: false, jpOnly: true,
  mode: 'map',     // 'map' = the 3D overview, 'forest' = the Loftwork forest (forest.js)
  tween: null,     // camera flight in progress
  playing: null,   // timeline playback in progress
};
export const typeOn = [1, 1, 1, 1];
export const pos = [], fpos = [], neighbours = [], groupLabels = [], cityLabels = [], baseLabels = [], glowing = [], byPerson = [], byClient = [];

// Language classes for the language view. lg is a bit set: 1 Japanese, 2 English, 4 Traditional Chinese.
export const LANGS = [
  { key: 'jp', en: 'Japanese only', color: '#5b6478', test: (lg) => lg === 1 },
  { key: 'jpen', en: 'Also in English', color: '#4DB4FF', test: (lg) => (lg & 1) && (lg & 2) },
  { key: 'jptc', en: 'Also in Traditional Chinese only', color: '#5ED39A', test: (lg) => lg === 5 },
  { key: 'other', en: 'No Japanese version', color: '#FF8A3D', test: (lg) => !(lg & 1) },
];
export const langOf = (it) => LANGS.findIndex((l) => l.test(it.lg ?? 1));
export const colorOf = (it) => S.langView ? LANGS[langOf(it)].color : it.d === S.FAB && it.t !== 2 ? FAB_WHITE : S.D.groups[it.d].color;
export const urlOf = (it) => it.u || `https://loftwork.com/${it.l}/${S.D.types[it.t]}/${it.s}`;
export const shown = (i) => S.items[i].f <= S.yearNow && typeOn[S.items[i].t] && S.geo.attributes.aDim.array[i] > 0 && (S.focus < 0 || S.items[i].d === S.focus);
// In the forest a tree stands for every Loftwork piece (FabCafe gets its own forest later). Focus only
// flies to a grove there, it doesn't hide the others.
export const inForest = (i) => !!fpos[i] && S.items[i].f <= S.yearNow && typeOn[S.items[i].t] && S.geo.attributes.aDim.array[i] > 0;
export const shownHere = (i) => S.mode === 'forest' ? inForest(i) : shown(i);
export const at = () => S.mode === 'forest' ? fpos : pos;   // positions in the current mode
export const langCodes = (it) => ['JP', 'EN', 'TC'].filter((_, k) => (it.lg ?? 1) & (1 << k)).join('/');
export const metaOf = (it) => [it.d === S.FAB ? `FabCafe ${S.D.cities[it.fc].en}` : S.D.groups[it.d].en, TYPE_ONE[it.t], it.y, langCodes(it), it.c].filter(Boolean).join(' · ');
