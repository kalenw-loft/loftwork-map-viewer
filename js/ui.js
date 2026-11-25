// Side panel, views, timeline, glowing nodes, Walk, the card and bases.
import * as THREE from 'three';
import { S, $, el, yOf, Y0, calm, TYPE_LABEL, GLOW_COUNT, GLOW_FABCAFE, LANGS, langOf, colorOf, urlOf, shown, shownHere, at, langCodes, metaOf,
  typeOn, pos, fpos, neighbours, groupLabels, cityLabels, baseLabels, glowing, byPerson, byClient } from './state.js';
import { scene, camera, renderer, controls, U, Segments, fit, flyTo, setOffset } from './scene.js';
import { applyFilter } from './search.js';
import { fog, refreshForest, recolorForest, entranceView, groveView, treeView, treeRadius } from './forest.js';

let hiLines = null, baseLines = null;

// ---------- side panel ----------
export function buildPanel() {
  const { D, items, FAB } = S;
  D.groups.forEach((g, i) => {
    if (i === FAB) return;
    const b = el('button', 'row'); b.setAttribute('aria-pressed', 'false'); b.dataset.g = i;
    const dot = el('span', 'dot'); dot.style.background = g.color;
    const name = el('span', null, g.en + ' '); name.append(el('small', null, g.jp));
    b.append(dot, name, el('span', 'n', g.count.toLocaleString()));
    b.addEventListener('click', () => setFocus(S.focus === i ? -1 : i));
    $('domains').append(b);
  });
  const f = D.groups[FAB], dot = el('span', 'dot'); dot.style.background = 'var(--fab)';
  $('fabRow').append(dot, el('span', null, 'FabCafe'), el('span', 'n', f.count.toLocaleString()));
  $('fabRow').dataset.g = FAB;
  $('fabRow').addEventListener('click', () => setFocus(S.focus === FAB ? -1 : FAB));
  D.cities.forEach((c, b) => {
    const btn = el('button', null, c.en); btn.append(el('span', null, c.count));
    btn.addEventListener('click', () => {
      setMode('map'); setFocus(FAB, false);
      const [x, z, t] = f.tips[b], tip = new THREE.Vector3(x, yOf(t) - 8, z);
      const out = new THREE.Vector3(x - f.x, 0, z - f.z).normalize();
      flyTo(tip, tip.clone().addScaledVector(out, 34).add(new THREE.Vector3(0, 14, 0)));
    });
    $('cities').append(btn);
  });
  D.bases.forEach((b, k) => {
    const btn = el('button', null, b.en); btn.append(el('span', null, Math.floor(items[b.start].f)));
    btn.setAttribute('aria-pressed', 'false'); btn.title = `${b.members.length} pieces, since ${Math.floor(items[b.start].f)}`;
    btn.addEventListener('click', () => setBase(S.baseOn === k ? -1 : k));
    $('bases').append(btn);
  });
  const jp = items.filter((it) => (it.lg ?? 1) & 1).length;
  $('jpOnlyN').textContent = jp.toLocaleString();
  LANGS.forEach((l) => {
    const row = el('div', 'row'), dot = el('span', 'dot'); dot.style.background = l.color;
    row.append(dot, el('span', null, l.en), el('span', 'n', items.filter((it) => LANGS[langOf(it)] === l).length.toLocaleString()));
    $('langs').append(row);
  });
  TYPE_LABEL.forEach((name, t) => {
    const row = el('label', 'type'), box = el('input'); box.type = 'checkbox'; box.checked = true;
    row.append(box, el('span', null, name), el('span', 'n', items.filter((i) => i.t === t).length.toLocaleString()));
    box.addEventListener('change', () => { typeOn[t] = box.checked ? 1 : 0; U.uTypes.value.setComponent(t, typeOn[t]); refreshGlow(); });
    $('types').append(row);
  });
}
$('weighted').addEventListener('change', (e) => { U.uWeight.value = e.target.checked ? 1 : 0; });

// ---------- menu and presentation mode ----------
// One floating button opens the menu (side panel + views). Open by default on a desktop, closed on a phone.
const phone = () => innerWidth <= 760;
export function setSide(open) {
  document.body.classList.toggle('side-open', open);
  $('menuBtn').setAttribute('aria-expanded', String(open));
  setOffset();
}
$('menuBtn').addEventListener('click', () => setSide(!document.body.classList.contains('side-open')));
setSide(!phone());
// On a phone the menu covers the map, so picking something in it, or touching the map, closes it.
$('side').addEventListener('click', (e) => {
  if (phone() && e.target.closest('#views button[data-view], #domains button, #fabRow, #cities button, #bases button')) setSide(false);
});
renderer.domElement.addEventListener('pointerdown', () => { if (phone()) setSide(false); });

// Presentation mode keeps only the search bar, the Loftwork / FabCafe switch and the card.
// Open it straight away with #present in the address.
export function setPresent(on) {
  if (S.maxYear == null) return;   // not loaded yet
  document.body.classList.toggle('present', on);
  $('presentBtn').setAttribute('aria-pressed', String(on));
  $('presentBtn').textContent = on ? 'Leave presentation mode' : 'Presentation mode';
  if (on) {
    S.playing = null; $('play').textContent = '▶'; $('year').value = S.maxYear; setYear(S.maxYear);   // show every year
    stopWalk(); setSide(false); setView('loftwork');   // presenting starts in the Loftwork forest
  }
  history.replaceState(null, '', on ? '#present' : location.pathname + location.search);
}
$('presentBtn').addEventListener('click', () => setPresent(!document.body.classList.contains('present')));
addEventListener('hashchange', () => setPresent(location.hash === '#present'));

$('langView').addEventListener('click', () => {
  S.langView = !S.langView; $('langView').setAttribute('aria-pressed', String(S.langView)); $('langs').hidden = !S.langView;
  S.geo.attributes.aColor.array.set(S.langView ? S.langColors : S.domainColors); S.geo.attributes.aColor.needsUpdate = true; recolorForest();
  if (S.selected >= 0) select(S.selected, false);   // redraw its lines and dots in the new colours
});

export function setFocus(g, fly = true) {
  const { D, FAB } = S;
  S.focus = g; U.uFocus.value = g;
  document.querySelectorAll('[data-g]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.g === g)));
  refreshGlow();
  if (g < 0) { if (fly) setView(S.mode === 'forest' ? 'loftwork' : 'all'); return; }
  if (!fly) return;
  if (g === FAB) return setView('fabcafe');
  if (S.mode === 'forest') { const [t, e] = groveView(g, fit()); flyTo(t, e); return markView('loftwork'); }
  const gr = D.groups[g], mid = (yOf(gr.t0) + yOf(gr.top)) / 2, target = new THREE.Vector3(gr.x, mid, gr.z);
  const out = target.clone().setY(0).lengthSq() > 1 ? target.clone().setY(0).normalize() : new THREE.Vector3(0.6, 0, 0.8);
  flyTo(target, target.clone().addScaledVector(out, 62 * fit()).add(new THREE.Vector3(0, 22, 0)));
  markView(null);
}

// ---------- views ----------
function markView(name) { document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name))); }
// Switching between the 3D overview and the forest. They live in the same scene, far apart.
export function setMode(mode) {
  if (S.mode === mode) return;
  if (S.baseOn >= 0) setBase(-1);
  closeCard(); S.mode = mode;
  const forest = mode === 'forest';
  scene.fog = forest ? fog : null;
  controls.minDistance = forest ? 1.5 : 6; controls.maxDistance = forest ? 260 : 420;
  controls.maxPolarAngle = forest ? Math.PI * 0.49 : Math.PI;   // never look up from under the ground
  if (forest) controls.autoRotate = false;
  refreshGlow();
}
export function setView(name, ms) {
  if (name === 'loftwork') {   // the Loftwork forest
    setMode('forest'); const [t, e] = entranceView(fit()); flyTo(t, e, ms); return markView(name);
  }
  setMode('map');
  const fx = S.D.groups[S.FAB].x, k = fit();
  const v = {
    all: [new THREE.Vector3(fx * 0.36, 25, 0), new THREE.Vector3(fx * 0.36 - 24 * k, 25 + 40 * k, 190 * k)],
    fabcafe: [new THREE.Vector3(fx, 32, 0), new THREE.Vector3(fx + 30 * k, 32 + 24 * k, 80 * k)],
  }[name];
  flyTo(v[0], v[1], ms); markView(name);
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  stopWalk(); if (S.focus >= 0) setFocus(-1, false); setView(b.dataset.view);
}));

// ---------- timeline ----------
export function setYear(v) {
  const { maxYear } = S;
  S.yearNow = v >= maxYear ? 2030 : v; U.uYear.value = S.yearNow;
  $('yearLabel').textContent = v >= maxYear ? 'All' : Math.floor(v);
  for (const s of groupLabels.concat(cityLabels)) s.visible = s.userData.t0 <= S.yearNow;
  baseLabels.forEach((s, k) => { s.visible = s.userData.t0 <= S.yearNow && (S.baseOn < 0 || S.baseOn === k); });
  for (const s of groupLabels) s.position.y = yOf(Math.min(s.userData.top, S.yearNow)) + s.userData.lift;   // labels ride the growing tip
  refreshGlow();
}
$('year').addEventListener('input', (e) => { S.playing = null; $('play').textContent = '▶'; setYear(+e.target.value); });
$('play').addEventListener('click', () => {
  if (S.playing) { S.playing = null; $('play').textContent = '▶'; return; }
  const from = +$('year').value >= S.maxYear ? Y0 : +$('year').value;
  S.playing = { t0: performance.now(), from }; $('play').textContent = '❚❚';
});

// ---------- glowing nodes with key visuals ----------
export function pickGlow() {
  const { D, items, FAB } = S;
  for (const g of glowing) { scene.remove(g.sprite); g.sprite.material.map?.dispose(); g.sprite.material.dispose(); }
  glowing.length = 0;
  const glow = S.geo.attributes.aGlow.array.fill(0);
  // Weighted shuffle: heavier pieces are more likely to show their picture, but any can.
  const key = (i) => Math.random() ** (1 / (0.15 + (items[i].w ?? 0.5)));
  const pool = items.map((it, i) => (it.k ? [i, key(i)] : null)).filter(Boolean).sort((a, b) => b[1] - a[1]).map(([i]) => i);
  const fab = pool.filter((i) => items[i].d === FAB).slice(0, GLOW_FABCAFE);
  const rest = pool.filter((i) => items[i].d !== FAB).slice(0, GLOW_COUNT - fab.length);
  for (const i of [...fab, ...rest].sort(() => Math.random() - 0.5)) {
    glow[i] = 1;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
    sprite.center.set(0.5, 0); sprite.position.copy(pos[i]).add(new THREE.Vector3(0, 2.6, 0)); sprite.renderOrder = 4; sprite.userData.i = i;
    scene.add(sprite); glowing.push({ i, sprite, requested: false });
  }
  S.geo.attributes.aGlow.needsUpdate = true; refreshGlow(); loadThumbsInView();
}
export function refreshGlow() { for (const g of glowing) g.sprite.visible = shown(g.i); refreshForest(); }

// Pictures load lazily: only once their piece is shown (year, filters) and on screen within reach.
const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4();
export function loadThumbsInView() {
  camera.updateMatrixWorld(); viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(viewProj);
  for (const g of glowing) {
    if (g.requested || !g.sprite.visible || !frustum.containsPoint(g.sprite.position) || camera.position.distanceTo(g.sprite.position) > 440) continue;
    g.requested = true; loadThumb(g);
  }
}
function loadThumb({ i, sprite }) {
  const { D, items, FAB } = S, img = new Image();
  img.onload = () => {   // rounded card with a border in the organism's colour
    if (!sprite.parent) return;   // a new set was picked meanwhile
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 18); g.clip(); g.drawImage(img, 0, 0, w, h);
    g.lineWidth = 4; g.strokeStyle = items[i].d === FAB ? '#D81C19' : D.groups[items[i].d].color; g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const size = 7 + 5 * (items[i].w ?? 0.5);   // heavier pieces get a bigger picture
    sprite.material.map = tex; sprite.material.opacity = 0.95; sprite.material.needsUpdate = true; sprite.scale.set(size, size * h / w, 1);
  };
  img.src = `thumbs/${items[i].k}.jpg`;
}

// ---------- Walk ----------
// One autoplay, replacing Surf and Shuffle. When a search, base or domain narrows the map it
// walks through those pieces, heaviest first; otherwise through the glowing pictures, and picks
// a fresh set of pictures after each round.
let walking = null, walkAt = 0;
const narrowed = () => !!$('search').value.trim() || S.baseOn >= 0 || S.focus >= 0;
function walkList() {
  if (!narrowed()) return glowing.filter((g) => shownHere(g.i)).map((g) => g.i);
  const out = []; for (let i = 0; i < S.N; i++) if (shownHere(i) && (S.focus < 0 || S.items[i].d === S.focus)) out.push(i);
  return out.sort((a, b) => (S.items[b].w ?? 0) - (S.items[a].w ?? 0)).slice(0, 40);
}
export function syncWalk() {
  document.querySelectorAll('.walkBtn').forEach((b) => { b.setAttribute('aria-pressed', String(!!walking)); b.textContent = walking ? 'Walking ❚❚' : 'Walk ▸'; });
}
export function stopWalk() { if (walking) { clearInterval(walking); walking = null; syncWalk(); } }
function walkNext() {
  let list = walkList();
  if (walkAt >= list.length) {
    walkAt = 0;
    if (!narrowed()) { pickGlow(); list = walkList(); }
  }
  if (!list.length) return stopWalk();
  select(list[walkAt++], true);
}
function startWalk() {
  if (!S.items || !walkList().length) return;
  walkAt = 0; controls.autoRotate = !calm && S.mode === 'map'; walkNext();
  walking = setInterval(walkNext, 6500); syncWalk();
}
document.addEventListener('click', (e) => { if (e.target.closest('.walkBtn')) walking ? stopWalk() : startWalk(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCard(); stopWalk(); } });

// ---------- card ----------
// Three ways two pieces relate, strongest first: one page links to the other (or is its
// sub-page); they were for the same client; the same Loftwork people worked on both.
// Each list is shown up to the current year, heaviest first.
function relationsOf(i) {
  const { items } = S;
  const it = items[i], seen = new Set([i]), live = (j) => !seen.has(j) && items[j].f <= S.yearNow;
  const take = (list) => { const out = list.filter(live); out.forEach((j) => seen.add(j)); return out; };
  const byW = (a, b) => (items[b].w ?? 0) - (items[a].w ?? 0);
  const linked = take([...neighbours[i]].sort(byW));
  const client = it.ci != null ? take([...byClient[it.ci]].sort(byW)) : [];
  const shared = new Map();
  for (const p of it.p || []) for (const j of byPerson[p]) shared.set(j, (shared.get(j) || 0) + 1);
  const people = take([...shared.keys()].sort((a, b) => shared.get(b) - shared.get(a) || byW(a, b))).slice(0, 12);
  return { linked, client, people };
}
const personName = (slug) => slug.split(/[_-]/).map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
function weightText(it) {
  const top = Math.max(1, Math.round((1 - (it.w ?? 0.5)) * 100));
  const [cited, langs, parts, people] = it.h || [0, 1, 0, 0];
  const why = [cited && `cited by ${cited} page${cited > 1 ? 's' : ''}`, langs > 1 && `translated (${langCodes(it)})`,
    parts && `${parts} sub-page${parts > 1 ? 's' : ''}`, people && `${people} people credited`].filter(Boolean);
  return `Weight: top ${top}%` + (why.length ? ' · ' + why.join(' · ') : '');
}

export function select(i, fly) {
  const { D, items, FAB } = S;
  if (S.mode === 'forest' && !fpos[i]) { setMode('map'); markView(null); }   // FabCafe pieces have no tree yet (D2.2)
  S.selected = i; const it = items[i], card = $('card'), pos = at();
  if (hiLines) { scene.remove(hiLines); hiLines.geometry.dispose(); hiLines = null; }
  const rel = relationsOf(i), all = [...rel.linked, ...rel.client, ...rel.people].filter((j) => pos[j]);
  if (all.length) {
    const s = new Segments(), w = new THREE.Color('#ffffff');
    for (const j of all) s.curve(pos[i], pos[j], w, new THREE.Color(colorOf(items[j])), 0, -2, pos[i].distanceTo(pos[j]) * 0.12, 12);
    hiLines = s.mesh(0.8); hiLines.renderOrder = 3;
  }
  S.ring.position.copy(pos[i]); S.ring.visible = true; S.ring.scale.setScalar(S.mode === 'forest' ? treeRadius(i) * 0.8 : 1);

  card.replaceChildren();
  const src = it.k ? `thumbs/${it.k}.jpg` : it.i ? D.img + it.i : null;
  if (src) { const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); img.src = src; card.append(img); }
  const close = el('button', null, '✕'); close.id = 'close'; close.setAttribute('aria-label', 'Close'); close.addEventListener('click', closeCard);
  const body = el('div', 'body'), where = el('div', 'where'), dot = el('span', 'dot');
  dot.style.background = it.d === FAB ? 'var(--fab)' : D.groups[it.d].color; where.append(dot, el('span', null, metaOf(it)));
  body.append(where, el('h3', null, it.n || it.s));
  const tagNames = (it.g || []).map((s) => D.tags[s]).filter(Boolean);
  if (it.d === FAB && it.dd < FAB - 1) tagNames.unshift(D.groups[it.dd].en);
  if (it.d2 != null) tagNames.unshift('also ' + D.groups[it.d2].en);
  if (tagNames.length) { const tags = el('div', 'tags'); tagNames.slice(0, 6).forEach((t) => tags.append(el('span', null, t))); body.append(tags); }
  body.append(el('div', 'weight', weightText(it)));
  for (const k of it.b || []) {
    const b = D.bases[k], row = el('div', 'base'), btn = el('button', null, b.en);
    btn.addEventListener('click', () => setBase(S.baseOn === k ? -1 : k));
    row.append(el('span', null, b.start === i ? 'Where this base started:' : 'Grew from:'), btn, el('span', null, `${b.members.length} pieces`));
    body.append(row);
  }
  if (it.p) body.append(el('div', 'people', 'People · ' + it.p.map((p) => personName(D.people[p])).join(', ')));
  const a = el('a', 'open', 'Open on loftwork.com ↗'); a.href = urlOf(it); a.target = '_blank'; a.rel = 'noopener'; body.append(a);
  const grew = (it.b || []).filter((k) => D.bases[k].start === i).flatMap((k) =>
    [[`Grew from this · ${D.bases[k].en}`, D.bases[k].members.filter((j) => j !== i && items[j].f <= S.yearNow && S.geo.attributes.aDim.array[j])]]);
  for (const [title, list] of [...grew, ['Linked from or to this page', rel.linked], [`Same client · ${it.c || ''}`, rel.client], ['Same people', rel.people]]) {
    if (!list.length) continue;
    const box = el('div', 'links'); box.append(el('h2', null, `${title} · ${list.length}`)); box.firstChild.style.marginTop = '0';
    for (const j of list.slice(0, title.startsWith('Grew') ? 12 : 6)) {
      const b = el('button'), d = el('span', 'dot'); d.style.background = colorOf(items[j]);
      b.append(d, el('span', null, `${items[j].n || items[j].s} `), el('small', null, items[j].y || ''));
      b.addEventListener('click', () => { stopWalk(); select(j, true); }); box.append(b);
    }
    body.append(box);
  }
  card.append(close, body); card.style.display = 'block'; card.scrollTop = 0;
  if (fly && S.mode === 'forest') { const [t, e] = treeView(i, camera.position, fit()); flyTo(t, e, 1800); }
  else if (fly) {
    const dir = camera.position.clone().sub(controls.target).setY(0); if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    flyTo(pos[i].clone(), pos[i].clone().addScaledVector(dir.normalize(), 30 * fit()).add(new THREE.Vector3(0, 9, 0)), 1800);
  }
}

// ---------- bases ----------
// Turning a base on shows only its pieces, draws a line from where it started to each
// piece that grew from it, and opens the starting piece.
export function setBase(k) {
  if (k >= 0 && S.mode === 'forest' && !fpos[S.D.bases[k].start]) { setMode('map'); markView(null); }   // a FabCafe base
  const { D, items } = S, pos = at();
  S.baseOn = k;
  document.querySelectorAll('#bases button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
  if (baseLines) { scene.remove(baseLines); baseLines.geometry.dispose(); baseLines = null; }
  applyFilter(); setYear(+$('year').value);
  if (k < 0) return;
  const b = D.bases[k], a = pos[b.start], s = new Segments(), w = new THREE.Color('#ffffff');
  for (const j of b.members) if (j !== b.start && pos[j] && pos[b.start]) s.curve(a, pos[j], w, new THREE.Color(colorOf(items[j])), items[j].f, -2, a.distanceTo(pos[j]) * 0.15, 14);
  baseLines = s.mesh(0.5); baseLines.renderOrder = 3;
  if (S.focus >= 0) setFocus(-1, false);
  stopWalk(); select(b.start, false);
  // Frame the whole base: from where it started to its latest piece.
  if (!pos[b.start]) return;   // a FabCafe base, while in the forest
  const box = new THREE.Box3().setFromPoints(b.members.map((j) => pos[j]).filter(Boolean)), mid = box.getCenter(new THREE.Vector3());
  const r = Math.max(14, box.getSize(new THREE.Vector3()).length() * 0.75);
  const dir = camera.position.clone().sub(controls.target).setY(0); if (dir.lengthSq() < 1) dir.set(0, 0, 1);
  flyTo(mid, mid.clone().addScaledVector(dir.normalize(), r * 1.6 * fit()).add(new THREE.Vector3(0, r * 0.35, 0)), 1600);
}

export function closeCard() {
  S.selected = -1; $('card').style.display = 'none'; S.ring.visible = false;
  if (hiLines) { scene.remove(hiLines); hiLines.geometry.dispose(); hiLines = null; }
}
