// The Loftwork forest. Each society domain is a grove and each piece a tree: trunk height grows
// with the piece's age (so bases, the oldest work, are the tallest), crown size follows its weight,
// crown shape its type (round: projects and events; pointed: findings and news). Inside a grove the
// oldest trees stand in the middle and newer ones ring outward, like growth rings.
// Groves sit in a ring around a clearing, joined by a ring path and a spoke to each grove.
// The forest stands far from the overview (x = FX); the camera's far plane keeps the two apart,
// so the overview needs no changes. Trunks and crowns are instanced: three draw calls in all.
import * as THREE from 'three';
import { S, fpos, inForest, colorOf } from './state.js';
import { scene, label } from './scene.js';

export const FX = 4000;
export const fog = new THREE.Fog(0x07080c, 70, 460);
const SPACING = 2.2, GAP = 30;
const CROWN_TYPE = [1, 0.9, 0.62, 0.62];   // projects, findings, events, news
const isCone = (it) => it.t === 1 || it.t === 3;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
export const groves = [];    // by domain: { x, z, r, ux, uz, top }; u points from the clearing out to the grove
const trees = [], treeR = [], baseLabels = [];
let trunks, crowns, built = false, R = 0;

export function buildForest() {
  const { D, items, FAB, maxYear } = S;
  const age = (f) => Math.max(0, maxYear - f);
  const baseAt = new Map(D.bases.map((b) => [b.start, b]));
  const doms = D.groups.map((_, d) => d).filter((d) => d !== FAB);
  const members = doms.map((d) => items.map((it, i) => (it.d === d ? i : -1)).filter((i) => i >= 0).sort((a, b) => items[a].f - items[b].f));
  const radii = members.map((m) => SPACING * Math.sqrt(m.length) + 4);
  const maxR = Math.max(...radii), total = radii.reduce((s, r) => s + 2 * r + GAP, 0);
  R = Math.max(total / (2 * Math.PI), maxR + 46);
  const rIn = R - maxR - 12;   // the ring path, inside every grove

  let a = Math.PI / 2;   // first grove straight ahead of the entrance
  doms.forEach((d, k) => {
    const share = (2 * radii[k] + GAP) / total * Math.PI * 2, ang = a + share / 2; a += share;
    const ux = Math.cos(ang), uz = Math.sin(ang);
    groves[d] = { x: FX + ux * R, z: uz * R, r: radii[k], ux, uz, ang, top: 0 };
  });

  // Trees.
  const all = members.flat(), nCone = all.filter((i) => isCone(items[i])).length;
  const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.28, 1, 6).translate(0, 0.5, 0), lambert(0x6b5848), all.length);
  crowns = [new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), lambert(0xffffff), all.length - nCone),
    new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 7), lambert(0xffffff), nCone)];
  const q = new THREE.Quaternion(), n = [0, 0];
  doms.forEach((d, k) => {
    const gr = groves[d];
    members[k].forEach((i, j) => {
      const it = items[i], base = baseAt.get(i), cone = isCone(it) ? 1 : 0;
      const rad = SPACING * Math.sqrt(j + 0.5), ang = j * 2.399963 + k * 1.3;   // golden-angle spiral
      const x = gr.x + Math.cos(ang) * rad, z = gr.z + Math.sin(ang) * rad;
      const h = (2 + age(it.f) * 0.55) * (base ? 1.3 : 1);
      const r = (0.6 + 2 * Math.pow(it.w ?? 0.5, 1.4)) * CROWN_TYPE[it.t] * (base ? 1.6 : 1);
      const tw = 0.7 + r * 0.3, cy = h + r * (cone ? 0.9 : 0.6);
      trees.push({ i, ti: trees.length, mesh: crowns[cone], ci: n[cone]++,
        mT: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(tw, h, tw)),
        mC: new THREE.Matrix4().compose(new THREE.Vector3(x, cy, z), q, new THREE.Vector3(r, r, r)) });
      fpos[i] = new THREE.Vector3(x, cy, z); treeR[i] = r; gr.top = Math.max(gr.top, cy + r);
      if (base) {
        const s = label(base.en, `since ${Math.floor(it.f)}`, { size: 50, world: 12 });
        s.position.set(x, cy + r + 2.4, z); baseLabels.push({ s, i });
      }
    });
  });
  for (const m of [trunks, ...crowns]) { m.frustumCulled = false; scene.add(m); }

  // Ground, grove floors, paths, labels and light.
  const flat = (geo, mat, x, z, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m; };
  flat(new THREE.CircleGeometry(R + maxR + 90, 96), new THREE.MeshLambertMaterial({ color: 0x141a22 }), FX, 0, 0);
  const pathMat = new THREE.MeshLambertMaterial({ color: 0x3b4354 });
  flat(new THREE.RingGeometry(rIn - 1.4, rIn + 1.4, 180), pathMat, FX, 0, 0.03);
  flat(new THREE.CircleGeometry(9, 48), pathMat, FX, 0, 0.03);   // the clearing in the middle
  doms.forEach((d) => {
    const g = groves[d], col = new THREE.Color(D.groups[d].color);
    flat(new THREE.CircleGeometry(g.r + 2, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false }), g.x, g.z, 0.02);
    for (const [from, to] of [[9, rIn], [rIn, R - g.r - 1]]) {   // spoke: clearing → ring path → grove edge
      const len = to - from, mid = (from + to) / 2;
      const spoke = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.4).rotateX(-Math.PI / 2), pathMat);
      spoke.rotation.y = -g.ang; spoke.position.set(FX + g.ux * mid, 0.03, g.uz * mid); scene.add(spoke);
    }
    label(D.groups[d].en, D.groups[d].jp, { color: D.groups[d].color, size: 52, world: 40 }).position.set(g.x, g.top + 10, g.z);
  });
  label('Loftwork', `${all.length.toLocaleString()} pieces · ${doms.length} groves`, { size: 56, world: 26 }).position.set(FX, 16, 0);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.position.set(FX + 140, 220, 160); sun.target.position.set(FX, 0, 0);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2018, 1.6), sun, sun.target);

  built = true; recolorForest(); refreshForest();
}

// Trees follow the year, type filters, search and the Japanese-only switch.
export function refreshForest() {
  if (!built) return;
  for (const t of trees) {
    const on = inForest(t.i);
    trunks.setMatrixAt(t.ti, on ? t.mT : HIDDEN); t.mesh.setMatrixAt(t.ci, on ? t.mC : HIDDEN);
  }
  for (const m of [trunks, ...crowns]) m.instanceMatrix.needsUpdate = true;
  for (const b of baseLabels) b.s.visible = inForest(b.i);
}
export function recolorForest() {
  if (!built) return;
  const c = new THREE.Color();
  for (const t of trees) t.mesh.setColorAt(t.ci, c.set(colorOf(S.items[t.i])));
  for (const m of crowns) m.instanceColor.needsUpdate = true;
}

export const treeRadius = (i) => treeR[i] ?? 1;
// Where the camera stands: on arrival, outside the ring looking in; in front of a grove, on its
// spoke; next to a tree, at crown height, keeping the direction it came from.
export const entranceView = (k = 1) => [new THREE.Vector3(FX, 0, R * 0.2), new THREE.Vector3(FX, 70 + 20 * k, R + 110 * k)];
export function groveView(d, k = 1) {
  const g = groves[d], back = g.r + 14 + 10 * k;
  return [new THREE.Vector3(g.x, 5, g.z), new THREE.Vector3(g.x - g.ux * back, 6.5, g.z - g.uz * back)];
}
export function treeView(i, from, k = 1) {
  const p = fpos[i], dir = from.clone().sub(p).setY(0);
  if (dir.lengthSq() < 1) dir.set(0, 0, 1);
  const eye = p.clone().addScaledVector(dir.normalize(), (14 + treeR[i] * 5) * Math.sqrt(k));
  eye.y = Math.max(4, p.y * 0.7);   // a little below the crown, so the whole tree is in view
  return [p.clone().setY(p.y * 0.8), eye];
}
