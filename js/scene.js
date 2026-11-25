// three.js scene, camera, renderer, materials and drawing helpers.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { S, calm } from './state.js';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 1500);
camera.position.set(12, 86, 172);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.14; controls.rotateSpeed = 0.9;
controls.maxDistance = 420; controls.minDistance = 6;
controls.enableZoom = false;   // the wheel is handled in controls.js, so trackpad gestures can each do their own thing
controls.autoRotate = !calm; controls.autoRotateSpeed = 0.35;

export const U = {   // shared by every material, so one slider drives the whole map
  uYear: { value: 2030 }, uTime: { value: 0 }, uScale: { value: 1 }, uFocus: { value: -1 },
  uTypes: { value: new THREE.Vector4(1, 1, 1, 1) }, uPR: { value: renderer.getPixelRatio() }, uWeight: { value: 1 },
};
// Keep the map centred in the space the open menu leaves free (desktop only; on a phone the menu covers the map).
export const setOffset = () => {
  if (innerWidth > 760 && document.body.classList.contains('side-open')) camera.setViewOffset(innerWidth, innerHeight, -158, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
};
setOffset();
const setScale = () => { U.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); };
setScale();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); setOffset(); setScale();
});

// Points are flat discs with a soft edge, blended normally (not additively), so dense
// areas stay readable instead of burning out to white. Size follows weight when uWeight is on.
export const pointMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false,
  vertexShader: `
    attribute vec3 aColor; attribute float aSize, aYear, aType, aGroup, aSeed, aGlow, aDim, aWeight;
    uniform float uYear, uTime, uScale, uFocus, uPR, uWeight; uniform vec4 uTypes;
    varying vec3 vC; varying float vA;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float tm = aType < 0.5 ? uTypes.x : aType < 1.5 ? uTypes.y : aType < 2.5 ? uTypes.z : uTypes.w;
      float on = step(aYear, uYear) * aDim * tm;
      float foc = (uFocus < -0.5 || abs(aGroup - uFocus) < 0.5) ? 1.0 : 0.1;
      float fresh = smoothstep(uYear - 1.0, uYear, aYear);            // the growing tip is a little brighter
      float w = mix(1.0, 0.5 + 1.4 * aWeight * aWeight * aWeight, uWeight);
      float px = 0.6 * aSize * w * (1.0 + fresh * 0.2 + aGlow * 0.4) * uScale / -mv.z;
      gl_PointSize = on * clamp(px, 1.5 * uPR, (6.0 + 10.0 * aWeight * uWeight) * uPR);
      vC = mix(aColor, vec3(1.0), fresh * 0.15 + aGlow * 0.2);
      vA = on * foc * mix(1.0, 0.45 + 0.55 * aWeight, uWeight * 0.8) * (0.96 + 0.04 * sin(uTime * 1.1 + aSeed * 40.0));
    }`,
  fragmentShader: `
    varying vec3 vC; varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      if (d > 1.0) discard;
      gl_FragColor = vec4(vC, smoothstep(1.0, 0.75, d) * 0.85 * vA);
    }`,
});
const lineMat = (opacity) => new THREE.ShaderMaterial({
  uniforms: { ...U, uOpacity: { value: opacity } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute vec3 aColor; attribute float aYear, aGroup;
    uniform float uYear, uFocus, uOpacity; varying vec4 vC;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      float foc = (uFocus < -0.5 || abs(aGroup - uFocus) < 0.5) ? 1.0 : 0.12;
      vC = vec4(aColor, step(aYear, uYear) * uOpacity * foc);
    }`,
  fragmentShader: `varying vec4 vC; void main() { if (vC.a < 0.004) discard; gl_FragColor = vC; }`,
});

export class Segments {   // collects coloured line segments, then becomes one LineSegments
  constructor() { this.p = []; this.c = []; this.y = []; this.g = []; }
  add(a, b, ca, cb, year, group) {
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z); this.c.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    this.y.push(year, year); this.g.push(group, group);
  }
  curve(a, b, ca, cb, year, group, lift, steps = 10) {
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += lift;
    const q = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(steps);
    for (let k = 0; k < steps; k++) {
      this.add(q[k], q[k + 1], ca.clone().lerp(cb, k / steps), ca.clone().lerp(cb, (k + 1) / steps), year, group);
    }
  }
  mesh(opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.c, 3));
    geo.setAttribute('aYear', new THREE.Float32BufferAttribute(this.y, 1));
    geo.setAttribute('aGroup', new THREE.Float32BufferAttribute(this.g, 1));
    const m = new THREE.LineSegments(geo, lineMat(opacity)); m.frustumCulled = false; scene.add(m); return m;
  }
}

export function label(text, sub, { color = '#eceef3', size = 44, world = 30 } = {}) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 160;
  const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 10;
  g.font = `600 ${size}px -apple-system, "Helvetica Neue", "Hiragino Sans", sans-serif`; g.fillStyle = color;
  g.fillText(text, 320, sub ? 62 : 80);
  if (sub) { g.font = '400 26px -apple-system, "Hiragino Sans", sans-serif'; g.fillStyle = 'rgba(236,238,243,.62)'; g.fillText(sub, 320, 112); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(world, world / 4, 1); s.renderOrder = 5; scene.add(s); return s;
}

// ---------- camera flights ----------
export const fit = () => Math.max(1, 1.35 / camera.aspect || 1);   // || 1: a hidden tab can report a 0×0 window
export function flyTo(target, eye, ms = 1500) {
  if (calm || ms === 0) { controls.target.copy(target); camera.position.copy(eye); S.tween = null; return; }
  S.tween = { t0: performance.now(), ms, fromT: controls.target.clone(), fromE: camera.position.clone(), toT: target, toE: eye };
}
export const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
