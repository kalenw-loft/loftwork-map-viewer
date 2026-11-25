// Pointer, trackpad and mouse input: hover tips, picking, zoom toward the cursor.
import * as THREE from 'three';
import { S, $, el, yOf, Y0, TYPE_SIZE, shownHere, at, metaOf } from './state.js';
import { treeRadius } from './forest.js';
import { camera, renderer, controls, U } from './scene.js';
import { select, closeCard, stopWalk } from './ui.js';

const v = new THREE.Vector3();
function pick(x, y, minReach = 12) {
  let best = -1, bestD = Infinity;
  const h = innerHeight, w = innerWidth, px = U.uScale.value / renderer.getPixelRatio(), pos = at(), forest = S.mode === 'forest';
  for (let i = 0; i < S.N; i++) {
    if (!shownHere(i)) continue;
    v.copy(pos[i]).project(camera); if (v.z > 1 || v.z < -1) continue;
    const dx = (v.x + 1) * w / 2 - x, dy = (1 - v.y) * h / 2 - y, d = dx * dx + dy * dy;
    const size = forest ? 1.4 * treeRadius(i) : 0.7 * TYPE_SIZE[S.items[i].t];   // a tree's crown, or a dot
    const reach = Math.max(minReach, size * px / camera.position.distanceTo(pos[i]));   // forgiving on a trackpad
    if (d < reach * reach && d < bestD) { best = i; bestD = d; }
  }
  return best;
}
let moveQueued = null, downAt = null;
const dom = renderer.domElement;
dom.addEventListener('pointermove', (ev) => {
  if (moveQueued) { moveQueued = ev; return; }
  moveQueued = ev;
  requestAnimationFrame(() => {
    const e = moveQueued; moveQueued = null; const tip = $('tip'), i = e.pointerType === 'touch' ? -1 : pick(e.clientX, e.clientY);
    if (i < 0) { tip.style.display = 'none'; dom.style.cursor = ''; return; }
    tip.replaceChildren(el('b', null, S.items[i].n || S.items[i].s), el('span', null, metaOf(S.items[i])));
    tip.style.display = 'block'; dom.style.cursor = 'pointer';
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 316) + 'px'; tip.style.top = Math.min(e.clientY + 14, innerHeight - 70) + 'px';
  });
});
dom.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; controls.autoRotate = false; S.tween = null; stopWalk(); });
// Trackpad: two fingers sideways orbit, up/down travel through the years, pinch zooms toward
// the cursor, Shift + two fingers pans. A mouse wheel (coarse steps) zooms.
const spherical = new THREE.Spherical(), off = new THREE.Vector3(), ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
function zoomAt(factor, x, y) {
  const dist = camera.position.distanceTo(controls.target);
  if (!innerWidth || !innerHeight || !isFinite(factor)) return;   // hidden tab: no size to aim at
  factor = THREE.MathUtils.clamp(dist * factor, controls.minDistance, controls.maxDistance) / dist;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const p = ray.ray.at(dist, new THREE.Vector3());          // the point under the cursor, at the target's depth
  controls.target.lerp(p, 1 - factor);
  camera.position.sub(p).multiplyScalar(factor).add(p);
}
dom.addEventListener('wheel', (e) => {
  e.preventDefault(); controls.autoRotate = false; S.tween = null; stopWalk();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1, dx = e.deltaX * unit, dy = e.deltaY * unit;
  // Trackpads report wheelDeltaY exactly -3 × deltaY; mouse wheels report steps of 120 that don't match.
  // Where wheelDeltaY is missing (Firefox), line/page delta modes mean a mouse.
  const trackpad = e.wheelDeltaY ? e.wheelDeltaY === -3 * e.deltaY : e.deltaMode === 0 && (dx !== 0 || !Number.isInteger(dy));
  const mouseWheel = !trackpad && dx === 0;
  if (e.ctrlKey || e.metaKey || e.altKey || mouseWheel)
    return zoomAt(Math.exp(THREE.MathUtils.clamp(dy, -120, 120) * (e.ctrlKey ? 0.012 : 0.002)), e.clientX, e.clientY);
  const dist = camera.position.distanceTo(controls.target);
  if (e.shiftKey) {   // pan in the screen plane
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const move = right.multiplyScalar(dx * dist * 0.0012).add(up.multiplyScalar(-dy * dist * 0.0012));
    controls.target.add(move); camera.position.add(move); return;
  }
  off.copy(camera.position).sub(controls.target); spherical.setFromVector3(off);
  spherical.theta -= dx * 0.0035; off.setFromSpherical(spherical);
  if (S.mode === 'forest') {   // in the forest, sideways turns and up/down walks forward and back
    camera.position.copy(controls.target).add(off); return walk(0, -dy * 0.6);
  }
  const lift = THREE.MathUtils.clamp(controls.target.y - dy * dist * 0.0011, yOf(Y0) - 10, yOf(S.maxYear ?? 2027) + 20) - controls.target.y;
  controls.target.y += lift; camera.position.copy(controls.target).add(off);
}, { passive: false });
dom.addEventListener('pointerup', (ev) => {
  if (multi || !downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 8) return;   // it was a drag or a two-finger gesture
  const i = pick(ev.clientX, ev.clientY, ev.pointerType === 'touch' ? 24 : 12);   // a fingertip needs a bigger target
  if (i >= 0) select(i, false); else closeCard();
});

// ---------- touch ----------
// One finger looks around (OrbitControls rotate), two fingers walk: swipe up to go forward,
// down to go back, sideways to step sideways. Pinch zooms toward the fingers. The canvas has
// touch-action: none, so none of this fights the browser's own scrolling or zooming.
controls.touches.TWO = -1;   // anything but DOLLY_PAN / DOLLY_ROTATE: OrbitControls leaves two fingers to us
const touches = new Map(), fwd = new THREE.Vector3(), side = new THREE.Vector3();
let gesture = null, multi = false;
const pair = () => {
  const [a, b] = [...touches.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
};
function walk(dx, dy) {
  const dist = camera.position.distanceTo(controls.target);
  camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) return; fwd.normalize();
  side.crossVectors(fwd, camera.up).normalize();
  const k = Math.max(dist, S.mode === 'forest' ? 40 : 0) * 0.003;   // in the forest the target is close, so keep a walking pace
  const move = fwd.multiplyScalar(-dy * k).addScaledVector(side, dx * k);
  controls.target.add(move); camera.position.add(move);
}
dom.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { multi = true; gesture = pair(); }
});
dom.addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size !== 2 || !gesture) return;
  const now = pair();
  if (gesture.d > 10 && now.d > 10) zoomAt(gesture.d / now.d, now.x, now.y);
  walk(now.x - gesture.x, now.y - gesture.y);
  gesture = now;
});
const endTouch = (e) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) gesture = null;
  if (touches.size === 0) multi = false;
};
dom.addEventListener('pointerup', endTouch);
dom.addEventListener('pointercancel', endTouch);
