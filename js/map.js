// Builds the map from items.json: points, twigs, skeleton, links, bridges and labels.
import * as THREE from 'three';
import { S, $, yOf, Y0, TYPE_SIZE, FAB_WHITE, LANGS, langOf, colorOf,
  pos, neighbours, groupLabels, cityLabels, baseLabels, byPerson, byClient } from './state.js';
import { scene, pointMat, Segments, label } from './scene.js';
import { buildPanel, pickGlow, setView, setYear, setPresent } from './ui.js';
import { applyFilter } from './search.js';

export function build(data) {
  S.D = data; S.items = data.items; S.N = S.items.length; S.FAB = data.groups.length - 1;
  const { items, N, FAB } = S;
  const maxYear = S.maxYear = Math.ceil(Math.max(...items.map((i) => i.f)));
  const A = (n) => new Float32Array(N * n);
  const P = A(3), C = A(3), Sz = A(1), Y = A(1), T = A(1), G = A(1), R = A(1), GL = A(1), DM = A(1).fill(1), W = A(1);
  items.forEach((it, i) => {
    W[i] = it.w ?? 0.5;
    if (it.p) for (const p of it.p) (byPerson[p] ||= []).push(i);
    if (it.ci != null) (byClient[it.ci] ||= []).push(i);
  });
  const gc = data.groups.map((g) => new THREE.Color(g.color)), white = new THREE.Color(FAB_WHITE);
  const twigs = new Segments();
  items.forEach((it, i) => {
    const p = new THREE.Vector3(it.x, yOf(it.f), it.z); pos.push(p); neighbours.push([]);
    const c = new THREE.Color(colorOf(it));
    P.set([p.x, p.y, p.z], i * 3); C.set([c.r, c.g, c.b], i * 3);
    Sz[i] = TYPE_SIZE[it.t] * (it.d === FAB ? 1.15 : 1); Y[i] = it.f; T[i] = it.t; G[i] = it.d; R[i] = (i * 0.618034) % 1;
    twigs.add(new THREE.Vector3(it.ax, p.y, it.az), p, gc[it.d], c, it.f, it.d);
  });
  const geo = S.geo = new THREE.BufferGeometry();
  for (const [name, arr, n] of [['position', P, 3], ['aColor', C, 3], ['aSize', Sz, 1], ['aYear', Y, 1], ['aType', T, 1],
    ['aGroup', G, 1], ['aSeed', R, 1], ['aGlow', GL, 1], ['aDim', DM, 1], ['aWeight', W, 1]]) geo.setAttribute(name, new THREE.BufferAttribute(arr, n));
  S.domainColors = C.slice();
  S.langColors = new Float32Array(N * 3);
  items.forEach((it, i) => { const c = new THREE.Color(LANGS[langOf(it)].color); S.langColors.set([c.r, c.g, c.b], i * 3); });
  const points = new THREE.Points(geo, pointMat); points.frustumCulled = false; points.renderOrder = 2; scene.add(points);
  twigs.mesh(0.1);

  // Skeleton: the trunk and branches each organism grows along.
  const bones = new Segments();
  for (const b of data.skeleton) {
    for (let k = 0; k + 3 < b.p.length; k += 2) {
      const t1 = b.t0 + (k / 2) * data.sample, t2 = t1 + data.sample;
      bones.add(new THREE.Vector3(b.p[k], yOf(t1), b.p[k + 1]), new THREE.Vector3(b.p[k + 2], yOf(t2), b.p[k + 3]), gc[b.g], gc[b.g], t2, b.g);
    }
  }
  bones.mesh(0.38);

  // Connections between items: links on the page, and sub-pages to their parent.
  const links = new Segments();
  for (let k = 0; k < data.edges.length; k += 2) {
    const a = data.edges[k], b = data.edges[k + 1];
    neighbours[a].push(b); neighbours[b].push(a);
    const far = pos[a].distanceTo(pos[b]);
    links.curve(pos[a], pos[b], gc[items[a].d], gc[items[b].d], Math.max(items[a].f, items[b].f), items[a].d === items[b].d ? items[a].d : -2, far * 0.12, far > 12 ? 10 : 4);
  }
  links.mesh(0.14);

  // Bridges: strands between organisms that share work. More shared work, more strands.
  const bridges = new Segments();
  const trunk = (g, t) => new THREE.Vector3(data.groups[g].x, yOf(t), data.groups[g].z);
  const strands = (a, b, n, weight) => {
    const from = Math.max(data.groups[a].t0, data.groups[b].t0) + 2;
    for (let k = 0; k < n; k++) {
      const t = from + (k + 0.5) * (maxYear - 1 - from) / n;
      bridges.curve(trunk(a, t), trunk(b, t + 0.6), gc[a], gc[b], t + 0.6, -2, 3 + 2.5 * ((k * 7) % 3) + weight, 28);
    }
  };
  for (const [g, n] of data.bridges.fab) strands(FAB, g, Math.max(1, Math.min(6, Math.round(n / 14))), 6);
  for (const [a, b, n] of data.bridges.domains) strands(a, b, Math.max(1, Math.min(3, Math.round(n / 30))), 0);
  bridges.mesh(0.22);

  // Bases: a label where each one started, always shown once the timeline reaches it.
  data.bases.forEach((b) => {
    const st = items[b.start], s = label(b.en, `since ${Math.floor(st.f)} · ${b.members.length} pieces`, { size: 50, world: 24 });
    s.position.copy(pos[b.start]).add(new THREE.Vector3(0, 4.2, 0)); s.userData.t0 = st.f; baseLabels.push(s);
  });

  // Labels.
  data.groups.forEach((g, i) => {
    const s = i === FAB ? label('FabCafe', `${g.count} nodes · ${data.cities.length - 1} cities and the network`, { size: 58, world: 42 })
      : label(g.en, g.jp, { color: g.color });
    s.position.set(g.x, yOf(g.top) + (i === FAB ? 10 : 6), g.z); s.userData.t0 = g.t0; s.userData.top = g.top; s.userData.lift = i === FAB ? 10 : 6; groupLabels.push(s);
  });
  data.groups[FAB].tips.forEach(([x, z, t], b) => {
    const s = label(data.cities[b].en, null, { size: 40, world: 15 });
    const out = new THREE.Vector2(x - data.groups[FAB].x, z - data.groups[FAB].z).normalize().multiplyScalar(5);
    s.position.set(x + out.x, yOf(t) + 2.5, z + out.y); s.userData.t0 = data.groups[FAB].t0 + 3; cityLabels.push(s);
  });
  // Year axis, standing between the Loftwork ring and FabCafe.
  const ax = data.groups[FAB].x * 0.62, az = -40, axis = new Segments(), grey = new THREE.Color('#3a4154');
  axis.add(new THREE.Vector3(ax, yOf(Y0), az), new THREE.Vector3(ax, yOf(maxYear), az), grey, grey, 0, -2);
  for (let y = Y0; y <= maxYear; y++) {
    axis.add(new THREE.Vector3(ax - (y % 5 ? 0.6 : 1.6), yOf(y), az), new THREE.Vector3(ax, yOf(y), az), grey, grey, 0, -2);
    if (y % 5 === 0 || y === maxYear) { const s = label(String(y), null, { color: '#8b93a7', size: 46, world: 13 }); s.position.set(ax - 7, yOf(y), az); }
  }
  axis.mesh(1);
  const ring = S.ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.72, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, side: THREE.DoubleSide }));
  ring.visible = false; ring.renderOrder = 6; scene.add(ring);

  buildPanel(); pickGlow(); setView('all', 0); applyFilter();
  const yr = $('year'); yr.min = Y0; yr.max = maxYear; yr.value = maxYear; setYear(maxYear);
  $('sub').textContent = `${N.toLocaleString()} pieces of work · ${Y0}–${maxYear - 1} · updated ${data.generated}`;
  if (location.hash === '#present') setPresent(true);
}
