// Entry point: loads the data, builds the map and runs the render loop.
import { S, $, calm } from './state.js';
import { scene, camera, renderer, controls, U, ease } from './scene.js';
import { select, setView, setFocus, setYear, loadThumbsInView } from './ui.js';
import './search.js';
import './controls.js';
import { build } from './map.js';
import { glowing } from './state.js';

let frame = 0;
renderer.setAnimationLoop((now) => {
  if (!calm) U.uTime.value = now / 1000;
  if (S.playing) {
    const yv = S.playing.from + (now - S.playing.t0) / 1000 * 1.1;     // about 18 seconds for the full span
    if (yv >= S.maxYear) { S.playing = null; $('play').textContent = '▶'; }
    $('year').value = Math.min(yv, S.maxYear); setYear(Math.min(yv, S.maxYear));
  }
  const tween = S.tween;
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.ms), e = ease(k);
    controls.target.lerpVectors(tween.fromT, tween.toT, e); camera.position.lerpVectors(tween.fromE, tween.toE, e);
    if (k >= 1) S.tween = null;
  }
  controls.update();
  if (S.mode === 'forest' && camera.position.y < 1.2) camera.position.y = 1.2;   // stay above the ground
  if (S.items && ++frame % 30 === 0) loadThumbsInView();   // about twice a second
  if (S.ring?.visible) S.ring.quaternion.copy(camera.quaternion);
  renderer.render(scene, camera);
});

fetch('data/items.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(build)
  .catch((e) => {
    console.error(e);
    $('sub').textContent = 'no data'; $('err').style.display = 'block';
    $('err').textContent = `Could not load the map (${e.message}). Run "python3 scripts/build_viewer.py" and open this page through a local server, not as a file.`;
  });

window.__map = { S, scene, camera, controls, U, select, setView, setFocus, get items() { return S.items; }, glowing };   // for the console
