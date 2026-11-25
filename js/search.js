// Search and the Japanese-only switch both decide which dots are on (aDim).
import { S, $, el } from './state.js';
import { refreshGlow, closeCard, syncWalk, loadThumbsInView } from './ui.js';

export function applyFilter() {
  const { items, D } = S;
  const q = $('search').value.trim().toLowerCase(), dim = S.geo.attributes.aDim.array; let n = 0;
  items.forEach((it, i) => {
    const hit = (!S.jpOnly || ((it.lg ?? 1) & 1)) && (S.baseOn < 0 || (it.b || []).includes(S.baseOn)) &&
      (!q || [it.n, it.s, it.c, ...(it.g || []).map((s) => D.tags[s])].join(' ').toLowerCase().includes(q));
    dim[i] = hit ? 1 : 0; n += hit;
  });
  S.geo.attributes.aDim.needsUpdate = true; refreshGlow(); loadThumbsInView();
  if (S.selected >= 0 && !dim[S.selected]) closeCard();
  const found = $('found'); found.replaceChildren();
  if (q) {   // the count, and a Walk button that steps through the matches (also in presentation mode)
    found.append(el('span', null, `${n.toLocaleString()} match${n === 1 ? '' : 'es'}`));
    if (n) { const walk = el('button', 'walkBtn'); walk.title = 'Walk through the matches, heaviest first'; found.append(walk); syncWalk(); }
  }
}
$('search').addEventListener('input', applyFilter);
$('jpOnly').addEventListener('change', (e) => { S.jpOnly = e.target.checked; applyFilter(); });
