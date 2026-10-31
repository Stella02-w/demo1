// The 3D twin: a line-drawn car, its parts, and the supplier network behind it.
// Visual layer only. Pages push state in through the returned API; nothing here decides anything.
// The network is drawn at the scale of a real supply base: several hundred suppliers in material sectors.
// Only the aluminium sector's named nodes (the twin's Tier 1s, suppliers and smelters) carry real values; every other node is illustrative.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {PARTS, PCF_RECORDS, ROUND, DISPLAY} from './data.js';
import {currentModel, partsOf} from './models.js';
import {carLines, EXPLODE} from './carlines.js';
import {partShape} from './partshapes.js';

// The vehicle on show and its parts (models.js). The three flagged parts carry this round's decisions; the rest trace back to their own suppliers.
export const MODEL = currentModel();
export const CAR_PARTS = partsOf(MODEL);

// Material sectors around the car (angles in radians on the ground plane). Aluminium keeps its arc so the twin's named nodes stay put;
// the other four share the rest by the model's material mix. [Assumption] Shares are illustrative.
const TAU = Math.PI * 2;
export const SECTORS = (() => {
  const def = [['al', 'AL', 'Aluminium', 'Smelter'], ['steel', 'ST', 'Steel', 'Mill'], ['poly', 'PL', 'Polymers', 'Resin plant'], ['elec', 'EL', 'Electronics', 'Fab'], ['glass', 'GL', 'Glass and other', 'Plant']];
  const sh = MODEL.share, rest = def.slice(1).reduce((t, [k]) => t + sh[k], 0); let a = -1.0;
  return def.map(([k, code, name, t3]) => { if (k === 'al') return {k, code, name, a0: 2.6, a1: TAU - 1.0, share: sh.al, t3};
    const a0 = a; a += 3.6 * sh[k] / rest; return {k, code, name, a0, a1: a, share: sh[k], t3}; });
})();
const SECTOR = Object.fromEntries(SECTORS.map(s => [s.k, s]));

// Where the twin's named organisations sit in the aluminium sector: [angle, radius]. Topology comes from data.js.
const TWIN_AT = {
  Tier1_A: [-1.5, 8.7], Tier1_B: [-2.05, 8.6], Tier1_C: [-1.12, 8.9], Tier1_D: [2.85, 8.6], Tier1_E: [3.14, 9.1],
  Supplier_A: [-1.82, 13.0], Supplier_B: [-2.28, 13.6], Supplier_C: [-1.6, 14.3], Supplier_D: [-1.08, 14.4], Supplier_E: [-1.33, 13.3],
  Supplier_F: [-2.98, 14.7], Supplier_G: [-2.6, 15.7], Supplier_H: [2.7, 13.5], Supplier_I: [3.0, 12.9], Supplier_K: [2.84, 16.0], Supplier_L: [-3.1, 16.8],
  Unknown_B: [-2.75, 20.0], Unknown_D: [-1.02, 20.4], Smelter_EU: [-1.72, 20.7], Smelter_IMP: [-2.2, 21.1], EU_market_mix: [-1.4, 19.5]
};
// Nodes on this round's problem chains: the unverified claims that can change a decision, and the unit mismatch.
const PROBLEM = new Set(['Unknown_B', 'Supplier_B', 'Tier1_B', 'Supplier_H', 'Supplier_I', 'Tier1_D', 'Unknown_D', 'Supplier_D', 'Tier1_C']);

export function createScene(host, labelHost, opts = {}) {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
  const DPR = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  // Atmosphere after Blade Runner 2049: sodium haze on the horizon, the far network dissolving into it, brutalist silhouettes beyond.
  scene.background = new THREE.Color(0x050405);
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(.05, .022, .01), 0.0042);
  const cam = new THREE.PerspectiveCamera(32, 1, .1, 400);
  const camState = {x: 2, y: 40, z: 40, tx: 0, ty: 0, tz: -2};
  scene.add(new THREE.HemisphereLight(0xcfe2ee, 0x020203, .32));
  const dl = new THREE.DirectionalLight(0xfff1e0, 1.1); dl.position.set(-8, 22, 12); scene.add(dl);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .42, .35, .74);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  // Film pass: anamorphic streaks on highlights, lens fringing at the edges, a teal-shadow / sodium-highlight grade, vignette and grain.
  const film = new ShaderPass({
    uniforms: {tDiffuse: {value: null}, uRes: {value: new THREE.Vector2(1, 1)}, uTime: {value: 0}, uFade: {value: 0}},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime; uniform float uFade; varying vec2 vUv;
      float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv, c = uv - .5; float ca = .0032 * dot(c, c) * 4.0;
        vec3 col = vec3(texture2D(tDiffuse, uv + c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ca).b);
        vec3 s = vec3(0.0);
        for (int i = 1; i <= 7; i++) { float o = float(i) * 18.0 / uRes.x, w = 1.0 - float(i) / 8.0;
          s += (max(texture2D(tDiffuse, uv + vec2(o, 0.0)).rgb - .62, 0.0) + max(texture2D(tDiffuse, uv - vec2(o, 0.0)).rgb - .62, 0.0)) * w; }
        col += s * vec3(1.0, .58, .28) * .16;
        float l = dot(col, vec3(.2126, .7152, .0722));
        col = mix(col * vec3(.84, .98, 1.08), col * vec3(1.07, .97, .86), smoothstep(.08, .7, l));
        col = pow(max(col, 0.0), vec3(1.24)) * 1.14;
        col *= mix(1.0, smoothstep(1.0, .22, length(c * vec2(1.15, 1.0))), .8);
        col += (rand(uv * uRes + fract(uTime) * 91.0) - .5) * .028;
        gl_FragColor = vec4(col * uFade, 1.0);
      }`
  });
  composer.addPass(film);

  // Fixed meaning: amber = unverified claim under review, red = misses target or blocked, mint = verified. White is selection.
  const C = {amber: 0xff9f2e, red: 0xff4f3f, teal: 0x6fd6c6, white: 0xf3f5f7, trace: 0xb9c7d0};
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646);

  // ---------- cursor light: brightens whatever is under the pointer; base colours stay as they are ----------
  const glowU = {uCursor: {value: new THREE.Vector2(-1e5, -1e5)}, uGlow: {value: 0}, uRad: {value: 220 * DPR}};
  function glowify(m, gain = 1, emissiveByColor = false) {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, glowU, {uGain: {value: gain}});
      sh.fragmentShader = 'uniform vec2 uCursor;\nuniform float uGlow;\nuniform float uRad;\nuniform float uGain;\n' + sh.fragmentShader
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n{ vec2 dd = gl_FragCoord.xy - uCursor; gl_FragColor.rgb *= 1.0 + uGain * uGlow * exp(-dot(dd, dd) / (uRad * uRad)); }');
      if (emissiveByColor) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;');
    };
    m.customProgramCacheKey = () => 'glow' + gain + emissiveByColor;
    return m;
  }
  const cursor = {x: -1e5, y: -1e5, sx: -1e5, sy: -1e5, on: 0, want: 0};
  const sweepU = {uSweep: {value: -20}, uSweepK: {value: 1.6}};

  const o3x = new THREE.Object3D();
  // soft round sprite for points
  const sprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

  // ---------- the world around the network: sky glow, megastructures in the haze, a light shaft, dust, a wet floor ----------
  const SUN = new THREE.Vector3(Math.cos(-2.2), .06, Math.sin(-2.2)).normalize(); // behind the aluminium sector
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 48, 24), new THREE.ShaderMaterial({side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {uSun: {value: SUN}, uK: {value: 1}},
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uSun; uniform float uK; varying vec3 vDir;
      void main(){ float h = vDir.y, sd = max(dot(vDir, uSun), 0.0);
        vec3 c = mix(vec3(.17, .06, .016), vec3(.004, .005, .007), smoothstep(-.02, .3, h));
        c = mix(c, vec3(.04, .018, .008), smoothstep(0.0, -.25, h));
        c += vec3(1.0, .5, .16) * (pow(sd, 16.0) * .5 + pow(sd, 3.0) * .16) * smoothstep(-.1, .05, h);
        gl_FragColor = vec4(c * uK, 1.0); }`}));
  scene.add(sky);
  // sparse lit windows on the megastructures, in sodium and cyan, so the skyline reads as a city at night
  function litWindows(m) {
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
        { vec2 cell = vec2((vWP.x + vWP.z) * 1.5, vWP.y * 2.4); vec2 f = fract(cell); float r = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453);
          float w = step(.35, f.x) * step(.55, f.y) * step(.8, r) * step(1.0, vWP.y);
          gl_FragColor.rgb += w * mix(vec3(1.0, .6, .26), vec3(.35, .85, .95), step(.93, r)) * .6; }`);
    };
    m.customProgramCacheKey = () => 'litwin';
    return m;
  }
  const towers = (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0);
    const m = new THREE.InstancedMesh(g, litWindows(new THREE.MeshBasicMaterial({color: 0x020203})), 54); const sa = Math.atan2(SUN.z, SUN.x);
    for (let i = 0; i < 54; i++) { const a = i < 34 ? sa + (rnd() - .5) * 2.6 : rnd() * TAU, r = 95 + rnd() * 120, w = 5 + rnd() * 16;
      o3x.position.set(Math.cos(a) * r, -.1, Math.sin(a) * r); o3x.rotation.y = rnd() * Math.PI; o3x.scale.set(w, 8 + Math.pow(rnd(), 2.2) * 46, w * (.5 + rnd())); o3x.updateMatrix(); m.setMatrixAt(i, o3x.matrix); }
    scene.add(m); return m; })();
  const shaft = (() => { const from = new THREE.Vector3(-9, 36, -14), to = new THREE.Vector3(0, 0, 0), dir = to.clone().sub(from), len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(9, .6, len, 64, 1, true), new THREE.ShaderMaterial({transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {uK: {value: 0}},
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 1.5) * .4 + pow(abs(dot(vN, vV)), 6.0) * .6; float a = pow(1.0 - vUv.y, 1.4) * smoothstep(1.0, .85, 1.0 - vUv.y) * f * .022 * uK; gl_FragColor = vec4(vec3(1.0, .74, .45) * a, a); }'}));
    m.position.copy(from).lerp(to, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize()); scene.add(m); return m; })();
  const dust = (() => { const n = 2600, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 34; p.set([Math.cos(a) * r, .2 + Math.pow(rnd(), 1.5) * 15, Math.sin(a) * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({color: 0xffb27a, size: .07, map: sprite, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending})); scene.add(m); return m; })();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({color: 0x060606, roughness: .42, metalness: .55}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.02; scene.add(floor);
  // a measuring lattice on the floor that only shows under the pointer
  const lattice = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShaderMaterial({transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: glowU,
    vertexShader: 'varying vec2 vW; void main(){ vW = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec2 uCursor; uniform float uGlow; uniform float uRad; varying vec2 vW;
      void main(){ vec2 dd = gl_FragCoord.xy - uCursor; float m = exp(-dot(dd, dd) / (uRad * uRad * .55)) * uGlow;
        vec2 g = abs(fract(vW * 2.0) - .5); float dotp = smoothstep(.09, .03, length(g - .5) ) ;
        vec2 l = abs(fract(vW * .5) - .5); float line = smoothstep(.485, .5, max(l.x, l.y));
        float ring = smoothstep(.04, 0.0, abs(length(dd) / uRad - .62)) * .5;
        float a = (dotp * .9 + line * .6 + ring * .35 + .16) * m;
        gl_FragColor = vec4(vec3(1.0, .78, .55) * a, a); }`}));
  lattice.rotation.x = -Math.PI / 2; lattice.position.y = .02; scene.add(lattice);
  // ---------- ground: a warm haze under the car, faint tier rings, sector dividers ----------
  const haze = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,150,70,.17)'); gr.addColorStop(.4, 'rgba(255,120,50,.05)'); gr.addColorStop(1, 'rgba(255,120,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0}));
    m.rotation.x = -Math.PI / 2; m.position.y = .01; scene.add(m); return m; })();
  const grid = new THREE.GridHelper(140, 140, 0x15181b, 0x101214); grid.material.transparent = true; grid.material.opacity = 0; glowify(grid.material, 7); scene.add(grid);
  const ringMat = glowify(new THREE.MeshBasicMaterial({color: 0x2a2f33, side: 2, transparent: true, opacity: 0, depthWrite: false}), 2);
  [10.5, 18.1, 23.4].forEach(R => { const m = new THREE.Mesh(new THREE.RingGeometry(R - .025, R + .025, 256), ringMat); m.rotation.x = -Math.PI / 2; m.position.y = .03; scene.add(m); });
  const divider = (() => { const s = []; for (const sec of SECTORS) { const a = sec.a0; s.push(Math.cos(a) * 6.8, .03, Math.sin(a) * 6.8, Math.cos(a) * 24.5, .03, Math.sin(a) * 24.5); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(s, 3));
    const l = new THREE.LineSegments(g, glowify(new THREE.LineBasicMaterial({color: 0x30363b, transparent: true, opacity: 0}), 2)); scene.add(l); return l; })();

  // ---------- line-drawn car: profile, glasshouse, shut lines, lamps and wheels, from the model's real dimensions ----------
  // Built in metres (models.js), then scaled into the scene. Lines are dense points so the car can still assemble in the intro.
  const CAR_S = 3.1, CAR_R = -0.35;
  const toDir = ([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(CAR_S).applyAxisAngle(new THREE.Vector3(0, 1, 0), CAR_R), v3x = new THREE.Vector3();
  const toCar = (x, y, z) => new THREE.Vector3(x, y, z).multiplyScalar(CAR_S).applyAxisAngle(new THREE.Vector3(0, 1, 0), CAR_R).add(new THREE.Vector3(0, .1, 0));
  const car = (() => {
    const target = [], col = [], grp = [];
    for (const [x, y, z, c, g] of carLines(MODEL)) { target.push(toCar(x, y, z)); col.push(c); grp.push(g); }
    const n = target.length, pos = new Float32Array(n * 3), start = new Float32Array(n * 3), colors = new Float32Array(n * 3);
    target.forEach((v, i) => { const a = rnd() * TAU, rr = 16 + rnd() * 30;
      start.set([Math.cos(a) * rr, rnd() * 18, Math.sin(a) * rr], i * 3); pos.set(start.slice(i * 3, i * 3 + 3), i * 3); colors.set(col[i].toArray(), i * 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // a light band sweeps along the body (the scan), on top of the cursor light
    const mat = new THREE.PointsMaterial({size: .15, map: sprite, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending});
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, glowU, {uGain: {value: 1.9}}, sweepU);
      sh.vertexShader = 'varying float vSx;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSx = dot(transformed.xz, vec2(.939, .343));');
      sh.fragmentShader = 'uniform vec2 uCursor;\nuniform float uGlow;\nuniform float uRad;\nuniform float uGain;\nuniform float uSweep;\nuniform float uSweepK;\nvarying float vSx;\n' + sh.fragmentShader
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n{ vec2 dd = gl_FragCoord.xy - uCursor; gl_FragColor.rgb *= 1.0 + uGain * uGlow * exp(-dot(dd, dd) / (uRad * uRad)); float sw = vSx - uSweep; gl_FragColor.rgb *= 1.0 + uSweepK * exp(-sw * sw / .5); }');
    };
    mat.customProgramCacheKey = () => 'carpts';
    const pts = new THREE.Points(g, mat); scene.add(pts);
    // its reflection in the wet floor
    const refl = new THREE.Points(g, new THREE.PointsMaterial({size: .06, map: sprite, vertexColors: true, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending}));
    refl.scale.y = -1; scene.add(refl);
    const box = new THREE.Box3().setFromPoints(target);
    // per-point offset for the exploded view, in scene units
    const off = new Float32Array(n * 3); grp.forEach((gk, i) => off.set(toDir(EXPLODE[gk] || EXPLODE.core).toArray(), i * 3));
    const xbox = new THREE.Box3(); target.forEach((v, i) => xbox.expandByPoint(v3x.set(v.x + off[i * 3], v.y + off[i * 3 + 1], v.z + off[i * 3 + 2])));
    return {pts, refl, target, start, off, n, p: 0, done: false, ex: 0, box, xbox};
  })();
  // the exploded view: panels move apart, the parts inside come into view (0 = assembled, 1 = apart)
  // pick: the part brought forward like a character select; f eases it in and dims the rest
  const explode = {v: 0, on: false, pick: null, f: 0};
  function updateCar() {
    const x = explode.v; if (car.done && x === car.ex) return; car.ex = x;
    const a = car.pts.geometry.attributes.position, e = t => 1 - Math.pow(1 - t, 3), o = car.off;
    for (let i = 0; i < car.n; i++) {
      const d = Math.min(1, Math.max(0, car.p * 1.5 - (i % 97) / 97 * .5)), k = e(d), v = car.target[i];
      const sx = car.start[i * 3], sy = car.start[i * 3 + 1], sz = car.start[i * 3 + 2];
      a.array[i * 3] = sx + (v.x - sx) * k + o[i * 3] * x; a.array[i * 3 + 1] = sy + (v.y - sy) * k + o[i * 3 + 1] * x; a.array[i * 3 + 2] = sz + (v.z - sz) * k + o[i * 3 + 2] * x;
    }
    a.needsUpdate = true;
    if (car.p >= 1) car.done = true;
  }
  const anchor = Object.fromEntries(CAR_PARTS.map(p => [p.k, toCar(...p.at)]));
  // which panel each part travels with when the car is exploded; parts inside the body stay where they are
  const PART_GROUP = p => { const [x, , z] = p.at, lr = z > 0 ? 'R' : 'L';
    return {crash: 'front', bumper: x > 0 ? 'front' : 'rear', door: 'door' + lr, wheel: 'wheel' + (x > 0 ? 'F' : 'B') + lr, roof: 'upper', glass: 'upper', tailgate: 'rear', cover: 'rear', lamp: 'front', brake: 'wheel' + (x > 0 ? 'F' : 'B') + lr}[p.k] || 'core'; };
  const anchorBase = Object.fromEntries(CAR_PARTS.map(p => [p.k, anchor[p.k].clone()]));
  const anchorOff = Object.fromEntries(CAR_PARTS.map(p => [p.k, toDir(EXPLODE[PART_GROUP(p)])]));
  // each part as a small line-drawn component, shown when the car is exploded. [Assumption] Sizes are indicative (metres).
  const SIZE = {bracket: [.26, .2, .16], cover: [.12, .45, .7], housing: [.38, .32, .38], crash: [.14, .16, 1.4], door: [.9, .55, .06], seat: [.5, .6, .5], tray: [1.7, .12, 1.2],
    wheel: [.5, .5, .2], roof: [1.2, .05, .06], subframe: [.5, .16, 1.0], bumper: [.2, .35, 1.5], ecu: [.3, .2, .12], screen: [.3, .25, .1], glass: [.06, .5, 1.3], tailgate: [.1, .6, 1.1], harness: [1.4, .05, .7],
    brake: [.34, .34, .05], ccb: [.08, .08, 1.4], ip: [.3, .28, 1.2], lamp: [.22, .16, .36], battery: [.8, .16, .7]};
  const partBoxes = CAR_PARTS.map(p => { const size = SIZE[p.k] || [.3, .3, .3], material = new THREE.LineBasicMaterial({color: 0x8fc8ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false});
    const l = new THREE.Group(); l.material = material; for (const g of partShape(p.k, size)) l.add(new THREE.LineSegments(g, material));
    l.scale.setScalar(CAR_S); l.rotation.y = CAR_R; l.visible = false; scene.add(l); return {k: p.k, l, size}; });
  const partBy = Object.fromEntries(CAR_PARTS.map(p => [p.k, p]));
  const boxCorners = b => { const o = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) o.push(new THREE.Vector3(x, y, z)); return o; };
  const explodedCorners = boxCorners(car.xbox);
  const carCorners = (() => { const b = car.box, o = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) o.push(new THREE.Vector3(x, y, z)); return o; })();

  // ---------- supplier network ----------
  const nodes = [], byId = {};
  const polar = (a, r) => new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  const add = n => { n.i = nodes.length; n.h = 0; nodes.push(n); byId[n.id] = n; return n; };
  const TIER = {1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3'};
  for (const [id, [a, r]] of Object.entries(TWIN_AT)) {
    const tier = id.startsWith('Tier1') ? 1 : id.startsWith('Supplier') ? 2 : 3;
    add({id, name: DISPLAY[id] || id, tier, sector: 'al', p: polar(a, r), twin: true,
      r: tier === 2 ? .16 : .2, hh: tier === 1 ? .6 : tier === 2 ? .3 : .55});
  }
  byId.EU_market_mix.name = 'EU market mix';
  seed = MODEL.seed; const NK = MODEL.count / 840, COUNTS = {1: 80 * NK, 2: 640 * NK, 3: 120 * NK}, BAND = {1: [7.2, 10.2], 2: [11.0, 17.8], 3: [18.7, 23.0]}, GAP = {1: .8, 2: .46, 3: .8};
  const seq = {};
  for (const tier of [1, 2, 3]) for (const s of SECTORS) {
    const want = Math.round(COUNTS[tier] * s.share), [r0, r1] = BAND[tier];
    for (let i = 0; i < want; i++) for (let tries = 0; tries < 40; tries++) {
      const a = s.a0 + .04 + rnd() * (s.a1 - s.a0 - .08), r = Math.sqrt(r0 * r0 + rnd() * (r1 * r1 - r0 * r0)), p = polar(a, r);
      if (nodes.some(q => q.p.distanceToSquared(p) < GAP[tier] * GAP[tier])) continue;
      const nn = seq[s.k + tier] = (seq[s.k + tier] || 0) + 1, code = `${s.code}-${String(nn).padStart(tier === 2 ? 3 : 2, '0')}`;
      add({id: `${tier}-${code}`, name: tier === 1 ? `Tier 1 ${code}` : tier === 2 ? `Supplier ${code}` : `${s.t3} ${code}`, tier, sector: s.k, p, twin: false,
        r: tier === 1 ? .17 : tier === 2 ? .1 + rnd() * .04 : .17, hh: tier === 1 ? .3 + rnd() * .35 : tier === 2 ? .08 + rnd() * .22 : .3 + rnd() * .35});
      break;
    }
  }
  const ang = n => Math.atan2(n.p.z, n.p.x);
  nodes.forEach(n => { n.delay = n.p.length() / 22 + rnd() * .25; n.base = new THREE.Color(n.tier === 1 ? 0x8fa3ad : n.tier === 2 ? 0x6f8590 : 0x7a8b94); });
  // illustrative supply tree: Tier 2 feeds the nearest Tier 1 of its sector, raw-material sites feed one or two Tier 2
  const near = (n, arr) => arr.reduce((b, q) => (!b || q.p.distanceTo(n.p) < b.p.distanceTo(n.p) ? q : b), null);
  const bg = t => nodes.filter(n => !n.twin && n.tier === t);
  const angGap = (a, b) => Math.abs(Math.atan2(Math.sin(ang(a) - ang(b)), Math.cos(ang(a) - ang(b))));
  for (const n of bg(2)) n.up = nodes.filter(q => q.tier === 1 && q.sector === n.sector && !q.twin).reduce((b, q) => (!b || angGap(q, n) < angGap(b, n) ? q : b), null);
  for (const n of bg(3)) { const t2 = nodes.filter(q => q.tier === 2 && q.sector === n.sector && !q.twin).sort((a, b) => a.p.distanceTo(n.p) - b.p.distanceTo(n.p)); n.ups = t2.slice(0, 1 + (rnd() > .5 ? 1 : 0)); }
  // unflagged car parts are fed by illustrative Tier 1s of their material
  for (const mat of new Set(CAR_PARTS.filter(p => !p.flag).map(p => p.mat))) { const ps = CAR_PARTS.filter(p => !p.flag && p.mat === mat), t1 = bg(1).filter(n => n.sector === mat).sort((a, b) => ((ang(a) - SECTOR[mat].a0 + 2 * TAU) % TAU) - ((ang(b) - SECTOR[mat].a0 + 2 * TAU) % TAU));
    t1.forEach((n, i) => (n.part = ps[Math.floor(i * ps.length / t1.length)].k)); }
  const tree = {};
  for (const p of CAR_PARTS.filter(x => !x.flag)) {
    const t1 = nodes.filter(n => n.part === p.k), t2 = nodes.filter(n => t1.includes(n.up)), sm = nodes.filter(n => n.ups?.some(u => t2.includes(u)));
    const s = [], a = anchor[p.k];
    t1.forEach(n => s.push(a.x, a.y, a.z, n.p.x, .06, n.p.z));
    t2.forEach(n => s.push(n.up.p.x, .06, n.up.p.z, n.p.x, .06, n.p.z));
    sm.forEach(n => n.ups.filter(u => t2.includes(u)).forEach(u => s.push(u.p.x, .06, u.p.z, n.p.x, .06, n.p.z)));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(s, 3)); g.setDrawRange(0, 0);
    const line = new THREE.LineSegments(g, glowify(new THREE.LineBasicMaterial({color: C.trace, transparent: true, opacity: .55, depthWrite: false}), 1.5));
    scene.add(line);
    tree[p.k] = {t1, t2, sm, line, n: s.length / 3, members: new Set([...t1, ...t2, ...sm])};
  }

  const prismG = new THREE.CylinderGeometry(1, 1, 1, 6); prismG.translate(0, .5, 0);
  const nodeMat = glowify(new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .28, roughness: .55, metalness: .25, transparent: true, opacity: 1}), 2.8, true);
  // dark bodies with crisp lit floors, so the network reads as towers at night instead of grey blocks in haze
  { const prev = nodeMat.onBeforeCompile;
    nodeMat.onBeforeCompile = sh => { prev(sh);
      sh.vertexShader = 'varying vec2 vWin;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvWin = uv;');
      sh.fragmentShader = 'varying vec2 vWin;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float wl = step(.58, fract(vWin.y * 7.0)) * step(.3, fract(vWin.x * 18.0)); float top = step(.985, vWin.y);
          totalEmissiveRadiance = vColor.rgb * (wl * 1.25 + top * 1.6 + .03); diffuseColor.rgb *= .16; }`);
    };
    nodeMat.customProgramCacheKey = () => 'nodewin'; }
  const inst = new THREE.InstancedMesh(prismG, nodeMat, nodes.length); scene.add(inst);
  const o3 = new THREE.Object3D(), tmpC = new THREE.Color(), toneC = new THREE.Color();
  nodes.forEach(n => inst.setColorAt(n.i, n.base));

  // ---------- the twin's edges, from data.js: smelter -> supplier -> Tier 1 -> part ----------
  const recOf = Object.fromEntries(PCF_RECORDS.map(r => [r.supplier, r]));
  const KEY_OF_PART = Object.fromEntries(ROUND.comparisons.flatMap(c => c.parts.map(p => [p, c.key])));
  const groups = {}; // comparison -> nodes on its tree
  const HI_H = {Tier1_B: 2.6, Supplier_B: 1.6, Unknown_B: 2.2, Tier1_D: 1.5, Supplier_H: 1.2, Supplier_I: 1.2, Tier1_C: 1.5, Supplier_D: 1.1, Unknown_D: 1.4};
  const hiH = n => HI_H[n.id] || (n.tier === 1 ? 1.5 : n.tier === 2 ? 1.0 : 1.3);
  const edges = [];
  const g0 = n => n.p.clone().setY(.08);
  function edge(a, b, group) {
    if (edges.some(e => e.a === a && e.b === b && e.group === group)) return;
    const toPart = typeof b === 'string', from = toPart ? a.p.clone().setY(hiH(a)) : g0(a), to = toPart ? anchor[b] : g0(b);
    const problem = PROBLEM.has(a.id) && (toPart || PROBLEM.has(b.id));
    const m = from.clone().lerp(to, .5); m.y += toPart ? 2.2 : 1 + from.distanceTo(to) * .08;
    const curve = new THREE.QuadraticBezierCurve3(from, m, to), w = problem ? .045 : .022;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, w, 6), glowify(new THREE.MeshBasicMaterial({color: C.amber, transparent: true, opacity: 0, depthWrite: false}), 1.2));
    const cnt = Math.max(4, Math.round(curve.getLength() * (problem ? 1.1 : .6)));
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(w * 2.1, 8, 6), new THREE.MeshBasicMaterial({color: C.amber, transparent: true, opacity: 0, depthWrite: false}), cnt);
    scene.add(tube, dots);
    const e = {a, b, group, problem, curve, tube, dots, cnt, speed: problem ? .12 : .07, v: 0};
    edges.push(e); (groups[group] ||= new Set()).add(a); if (!toPart) groups[group].add(b);
    return e;
  }
  for (const p of PARTS) { const k = KEY_OF_PART[p.part]; if (!k) continue; const t1 = byId[p.tier1];
    edge(t1, k, k);
    for (const s of p.sources) { const sup = byId[s.supplier]; edge(sup, t1, k); edge(byId[recOf[s.supplier].smelter], sup, k); } }
  const edgeOf = (a, b) => edges.find(e => e.a.id === a && (typeof e.b === 'string' ? e.b : e.b.id) === b);
  const nodeGroups = n => Object.keys(groups).filter(k => groups[k].has(n));

  // anchors on the car for the three flagged parts, and small marks for the rest
  const anchorMarks = ['bracket', 'cover', 'housing'].map(k => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.16, 16, 12), new THREE.MeshBasicMaterial({color: C.amber, transparent: true, opacity: 0, depthWrite: false, depthTest: false}));
    const r = new THREE.Mesh(new THREE.RingGeometry(.42, .46, 48), new THREE.MeshBasicMaterial({color: C.amber, side: 2, transparent: true, opacity: 0, depthWrite: false, depthTest: false}));
    // a strong halo in the part's status colour, so the flagged parts read first on the car
    const g = new THREE.Sprite(new THREE.SpriteMaterial({map: sprite, color: C.amber, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending}));
    s.position.copy(anchor[k]); r.position.copy(anchor[k]); g.position.copy(anchor[k]); scene.add(s, r, g); return {k, s, r, g};
  });
  const partMarks = CAR_PARTS.filter(p => !p.flag).map(p => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshBasicMaterial({color: C.white, transparent: true, opacity: 0, depthWrite: false, depthTest: false}));
    // a soft halo so each traced part reads as a lit point on the car
    const g = new THREE.Sprite(new THREE.SpriteMaterial({map: sprite, color: 0x8fc8ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending}));
    s.position.copy(anchor[p.k]); g.position.copy(anchor[p.k]); scene.add(s, g); return {k: p.k, s, g};
  });
  const partVis = {v: 0, lbl: 0};
  // intro scan ring
  const scan = new THREE.Mesh(new THREE.RingGeometry(.985, 1, 256), new THREE.MeshBasicMaterial({color: 0xdfe7ec, side: 2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false}));
  scan.rotation.x = -Math.PI / 2; scan.position.y = .1; scene.add(scan);
  // pulse along a chain, and the request envelope travelling back up it
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(.26, 20, 14), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, depthWrite: false}));
  const env = new THREE.Mesh(new THREE.OctahedronGeometry(.32), new THREE.MeshBasicMaterial({color: C.white, transparent: true, opacity: 0, depthWrite: false}));
  scene.add(pulse, env);
  // selection: a thin ring on the ground around the picked node
  const selRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.07, 64), new THREE.MeshBasicMaterial({color: C.white, side: 2, transparent: true, opacity: 0, depthWrite: false}));
  selRing.rotation.x = -Math.PI / 2; selRing.position.y = .05; scene.add(selRing);

  // ---------- labels ----------
  const labels = [];
  // pri: higher wins when two labels would overlap; the loser fades out instead of covering it
  function label(get, html, pri = 1, cls = '') { const d = document.createElement('div'); d.className = 'lbl ' + cls; d.innerHTML = html; d.style.opacity = 0; labelHost.appendChild(d);
    const l = {get, d, pri, on: 0, a: 0, w: 0, h: 0}; labels.push(l); return l; }
  const PL = Object.fromEntries(CAR_PARTS.map(p => [p.k, label(() => anchor[p.k].clone().add(new THREE.Vector3(0, p.flag ? .9 : .6, 0)),
    `<div class="n">${p.name}</div><div class="s">${p.flag ? '' : `${SECTOR[p.mat].name.toLowerCase()} · ${tree[p.k].t1.length} Tier 1`}</div>`, p.flag ? 4 : 2, p.flag ? 'part' : 'part minor')]));
  const AIL = label(() => aiCurve.getPoint(.4).add(new THREE.Vector3(0, .9, 0)), '<div class="n"><span class="aisym">✦</span> Suggested link</div><div class="s">Smelter X → Supplier L</div>', 6, 'ai');
  const AIN = label(() => aiNode.p.clone().setY(2.6), '<div class="n">Supplier L</div><div class="s">link suggested · not confirmed</div>', 5, 'ai');
  const SL = SECTORS.map(s => { const mid = (s.a0 + s.a1) / 2, count = nodes.filter(n => n.sector === s.k).length;
    return {s, l: label(() => polar(mid, 24.6), `<div class="n">${s.name}</div><div class="s">${count} suppliers</div>`, 1, 'sector')}; });
  // the hover tooltip: names appear only under the pointer
  const tip = document.createElement('div'); tip.className = 'tip'; tip.style.opacity = 0; labelHost.appendChild(tip);
  const sub = {}; // per twin node: a status line the page sets (e.g. '75% recycled · unverified')
  const v3 = new THREE.Vector3();
  const measure = l => { l.w = l.d.offsetWidth; l.h = l.d.offsetHeight; };
  function placeLabels(w, h) {
    const box = opts.safe?.() || {l: 0, t: 0, r: w, b: h}, placed = [];
    for (const l of labels) if (l.on > .01) measure(l); // all reads before any write: one layout per frame
    const order = labels.map(l => { v3.copy(l.get()).project(cam); return {l, x: (v3.x + 1) / 2 * w, y: (1 - v3.y) / 2 * h, front: v3.z < 1}; })
      .sort((a, b) => b.l.pri * (b.l.on > .5 ? 2 : 1) - a.l.pri * (a.l.on > .5 ? 2 : 1));
    for (const {l, x, y, front} of order) {
      const dx = Math.min(Math.max(0, box.l - (x - l.w / 2)), box.r - (x + l.w / 2));
      const r = [x + dx - l.w / 2, y - l.h, x + dx + l.w / 2, y];
      const inside = x >= box.l && x <= box.r && r[1] >= box.t && r[3] <= box.b;
      const free = !placed.some(p => r[0] < p[2] + 6 && r[2] > p[0] - 6 && r[1] < p[3] + 2 && r[3] > p[1] - 2);
      const want = front && l.on > .01 && inside && free ? l.on : 0;
      if (want > .01) placed.push(r);
      l.a += (want - l.a) * .2;
      l.d.style.opacity = l.a.toFixed(3); l.d.style.transform = `translate(${(x + dx).toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    return placed;
  }

  // ---------- state ----------
  const S = {grow: 0, scanR: 0, introDone: false, t1bH: 37.6};
  // Visual state pushed in by the page. The scene holds no business logic.
  const look = {t1b: 'amber', sb: 'amber', path: 'amber', sbBoost: 0};
  const vis = {bracket: 0, cover: 0, housing: 0};  // problem chains
  const full = {bracket: 0, cover: 0, housing: 0}; // the whole tree of a focused comparison, verified branches included
  const amb = {v: 0};                               // ground, rings and haze
  const bgDim = {v: 1};                             // illustrative network brightness
  const trace = {k: null, v: 0};
  const impact = {k: null, nodes: new Set(), edges: new Set(), v: 0};
  const sel = {n: null, v: 0};
  // Supplier L is a known Tier 2 (contracts with Tier 1 D and E) whose source is unknown; the AI suggests Smelter X as that source
  const ai = {v: 0, link: 0, ok: 0}, aiCol = new THREE.Color();
  const aiNode = byId.Supplier_L, AI_C = 0xb59cff;
  const aiCurve = (() => { const a = byId.Unknown_B.p.clone().setY(.1), b = aiNode.p.clone().setY(.1), m = a.clone().lerp(b, .5); m.y += 4.2; return new THREE.QuadraticBezierCurve3(a, m, b); })();
  const aiLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(aiCurve.getPoints(80)), new THREE.LineDashedMaterial({color: AI_C, dashSize: .35, gapSize: .25, transparent: true, opacity: 0, depthWrite: false}));
  aiLine.computeLineDistances(); scene.add(aiLine);
  const aiDot = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 10), new THREE.MeshBasicMaterial({color: AI_C, transparent: true, opacity: 0, depthWrite: false}));
  const aiGlow = new THREE.Sprite(new THREE.SpriteMaterial({map: sprite, color: AI_C, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending}));
  scene.add(aiDot, aiGlow);
  const knownCurve = (() => { const a = aiNode.p.clone().setY(.1), b = byId.Tier1_E.p.clone().setY(.1), m = a.clone().lerp(b, .5); m.y += 1.6; return new THREE.QuadraticBezierCurve3(a, m, b); })();
  const knownLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(knownCurve.getPoints(60)), new THREE.LineBasicMaterial({color: 0xf3f5f7, transparent: true, opacity: 0, depthWrite: false}));
  const knownCurve2 = (() => { const a = aiNode.p.clone().setY(.1), b = byId.Tier1_D.p.clone().setY(.1), m = a.clone().lerp(b, .5); m.y += 1.6; return new THREE.QuadraticBezierCurve3(a, m, b); })();
  const knownLine2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(knownCurve2.getPoints(60)), knownLine.material);
  scene.add(knownLine, knownLine2);
  // region: a clicked supplier's material sector stays, the other sectors fold away so its neighbours are easy to reach
  const region = {k: null, v: 0};
  let hover = null, hoverNode = null;
  let current = {mode: 'overview'};

  // ---------- camera: perspective framing that fits the car and the network in view ----------
  // The camera's view offset puts the scene centre in the middle of the free area (opts.safe), eased as panels change.
  const vo = {x: 0, y: 0};
  const safeBox = () => { const w = innerWidth, h = innerHeight; return opts.safe?.() || {l: 0, t: 0, r: w, b: h}; };
  function viewOffset(snap) { const w = innerWidth, h = innerHeight, b = safeBox();
    const tx = w / 2 - (b.l + b.r) / 2, ty = h / 2 - (b.t + b.b) / 2, k = snap ? 1 : .08;
    if (!snap && Math.abs(tx - vo.x) < .3 && Math.abs(ty - vo.y) < .3) return;
    vo.x += (tx - vo.x) * k; vo.y += (ty - vo.y) * k; cam.setViewOffset(w, h, vo.x, vo.y, w, h); cam.updateProjectionMatrix(); }
  const fitCam = new THREE.PerspectiveCamera(32, 1, .1, 400);
  // Look along a direction (azimuth, elevation) and find the distance at which every point lands inside the free area,
  // then pan so the projected bounds are centred in it. Perspective, not a uniform zoom: near things stay larger.
  function fitPose(pts, az, el, margin = 30) {
    const w = innerWidth, h = innerHeight, b = safeBox(), box = {l: b.l + margin, r: b.r - margin, t: b.t + margin, b: b.b - margin};
    fitCam.fov = cam.fov; fitCam.aspect = w / h; fitCam.setViewOffset(w, h, w / 2 - (b.l + b.r) / 2, h / 2 - (b.t + b.b) / 2, w, h);
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const tgt = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const bounds = d => { fitCam.position.copy(tgt).addScaledVector(dir, d); fitCam.lookAt(tgt); fitCam.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { v3.copy(p).applyMatrix4(fitCam.matrixWorldInverse); if (v3.z > -.5) return null; v3.applyMatrix4(fitCam.projectionMatrix);
        const x = (v3.x + 1) / 2 * w, y = (1 - v3.y) / 2 * h; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return {x0, x1, y0, y1}; };
    const fits = r => r && r.x0 >= box.l && r.x1 <= box.r && r.y0 >= box.t && r.y1 <= box.b;
    const solve = () => { let lo = 3, hi = 320; for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (fits(bounds(m))) hi = m; else lo = m; } return hi; };
    let d = 60;
    for (let it = 0; it < 3; it++) {
      d = solve(); const r = bounds(d); if (!r) break;
      const dx = (r.x0 + r.x1) / 2 - (box.l + box.r) / 2, dy = (r.y0 + r.y1) / 2 - (box.t + box.b) / 2;
      const wpp = 2 * d * Math.tan(THREE.MathUtils.degToRad(fitCam.fov) / 2) / h;
      const right = new THREE.Vector3().setFromMatrixColumn(fitCam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(fitCam.matrixWorld, 1);
      tgt.addScaledVector(right, dx * wpp).addScaledVector(up, -dy * wpp);
    }
    d = solve();
    const pos = tgt.clone().addScaledVector(dir, d);
    return {x: pos.x, y: pos.y, z: pos.z, tx: tgt.x, ty: tgt.y, tz: tgt.z};
  }
  const tops = arr => arr.flatMap(n => [n.p.clone().setY(.05), n.p.clone().setY(Math.max(n.hh, n.twin && PROBLEM.has(n.id) ? hiH(n) : 0))]);
  // circular mean of where the nodes are, seen from the car
  const meanAngle = arr => Math.atan2(arr.reduce((s, n) => s + Math.sin(ang(n)), 0), arr.reduce((s, n) => s + Math.cos(ang(n)), 0));
  // swing to whichever side of the target is nearer the current camera, so a switch turns left or right as needed, never always the same way
  function side(base, v, off = .85) {
    if (v._az != null) return v._az; // decided once per view, so a spring-back or refit returns to the same side
    const az = Math.atan2(camState.z - camState.tz, camState.x - camState.tx), dist = a => Math.abs(Math.atan2(Math.sin(a - az), Math.cos(a - az)));
    return (v._az = [base - off, base + off].sort((a, b) => dist(a) - dist(b))[0]);
  }
  function poseFor(v) {
    // overview: a low three-quarter view across the car toward the problem chains, which recede into the haze
    if (v.mode === 'overview') { const pr = nodes.filter(n => PROBLEM.has(n.id)); return fitPose([...carCorners, ...tops(pr.filter(n => n.tier === 1))], meanAngle(pr) + Math.PI + .3, .27, 10); }
    if (v.mode === 'hero') return fitPose(carCorners, .95, .07, 36);
    if (v.mode === 'explode' && v.k) { // one part brought forward: frame a space around it so it sits large in the middle
      const c = anchorBase[v.k].clone().addScaledVector(anchorOff[v.k], 1), R = Math.max(...(partBoxes.find(b => b.k === v.k).size)) * CAR_S * 1.05 + .3, o = [];
      for (const x of [-R, R]) for (const y of [-R, R]) for (const z of [-R, R]) o.push(c.clone().add(new THREE.Vector3(x, y, z)));
      return fitPose(o, side(.95, v, .3), .32, 40); }
    if (v.mode === 'explode') return fitPose(explodedCorners, side(.95, v, .25), .38, 30);
    // a clicked supplier: stand on its side of the car, behind its region, so the supplier is near and the car beyond it
    if (v.mode === 'region') { const sec = SECTOR[v.k], at = v.at ?? (sec.a0 + sec.a1) / 2, gap = n => Math.abs(Math.atan2(Math.sin(ang(n) - at), Math.cos(ang(n) - at)));
      // frame the car with the supplier's neighbourhood; the camera stands beyond the supplier and looks back across it at the car
      const near = nodes.filter(n => n.sector === v.k && gap(n) < .55);
      return fitPose([...carCorners, ...tops(near)], side(at, v, .22), .5, 16); }
    const set = v.mode === 'cmp' ? [...groups[v.k]] : v.mode === 'trace' ? [...tree[v.k].members] : [...impact.nodes];
    const extra = v.mode === 'cmp' || v.mode === 'trace' ? [anchor[v.k]] : [];
    // stand on the far side of the car from its suppliers and look across it: the car in front, its network behind
    return fitPose([...carCorners, ...tops(set), ...extra], side(meanAngle(set) + Math.PI, v), .4, 16);
  }
  let flight = null, home = null;
  function fly(p, d = 1.5) { flight?.kill(); if (RM) { Object.assign(camState, p); return; } flight = gsap.to(camState, {...p, duration: d, ease: 'power3.inOut'}); }
  // framing waits a frame so the page has laid out its panels first; it is redone when the free area changes size
  let lastBox = null;
  function frame(v, d) { current = v; ctl.user = false;
    // a comparison, a traced part or a clicked supplier shows only its material region; the overview shows them all
    // the exploded view folds the whole network away (no sector is called 'car') so the car stands alone
    const rk = v.mode === 'region' ? v.k : v.mode === 'cmp' ? 'al' : v.mode === 'trace' ? partBy[v.k]?.mat : v.mode === 'explode' ? 'car' : null;
    if (v.mode !== 'explode' && explode.on) setExplode(false);
    if (rk) { if (region.k !== rk) { region.k = rk; region.v = 0; } gsap.to(region, {v: 1, duration: RM ? 0 : .9, ease: 'power2.out'}); }
    else if (region.k) gsap.to(region, {v: 0, duration: RM ? 0 : .9, ease: 'power2.out', onComplete: () => { if (!region.v) region.k = null; }});
    requestAnimationFrame(() => { lastBox = safeBox(); fly(poseFor(v), d); }); }
  // ---------- drag to look around, like a product viewer: rotation is limited and springs back on release ----------
  const ctl = {drag: null, user: false};
  const orbit = () => { const o = new THREE.Vector3(camState.x - camState.tx, camState.y - camState.ty, camState.z - camState.tz), r = o.length();
    return {r, az: Math.atan2(o.z, o.x), el: Math.asin(Math.min(1, Math.max(-1, o.y / r)))}; };
  const setOrbit = ({r, az, el}) => Object.assign(camState, {x: camState.tx + r * Math.cos(el) * Math.cos(az), y: camState.ty + r * Math.sin(el), z: camState.tz + r * Math.cos(el) * Math.sin(az)});
  const soft = (x, lim) => lim * Math.tanh(x / lim); // rubber band: the further you pull, the less it moves
  const el$ = renderer.domElement;
  function springBack() { ctl.user = false; flight?.kill(); flight = gsap.to(camState, {...poseFor(current), duration: RM ? 0 : 1.1, ease: 'power3.out'}); }
  el$.addEventListener('pointerdown', e => { if (!S.introDone || e.button !== 0) return; flight?.kill(); ctl.drag = {x0: e.clientX, y0: e.clientY, base: orbit(), moved: false}; });
  el$.addEventListener('pointermove', e => {
    const d = ctl.drag; if (!d) return;
    if (!e.buttons) return endDrag();
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) { d.moved = true; ctl.user = true; el$.style.cursor = 'grabbing'; }
    setOrbit({r: d.base.r, az: d.base.az + soft(dx * .007, 2.6), el: Math.min(1.35, Math.max(.04, d.base.el + soft(dy * .005, .75)))});
  });
  function endDrag() { const d = ctl.drag; ctl.drag = null; if (d?.moved) { el$.style.cursor = ''; springBack(); } }
  el$.addEventListener('pointerup', endDrag); el$.addEventListener('pointercancel', endDrag); el$.addEventListener('pointerleave', endDrag);
  addEventListener('blur', endDrag); addEventListener('pointerup', endDrag);
  el$.addEventListener('contextmenu', e => e.preventDefault());
  let wheelT = null, wheelBase = null;
  el$.addEventListener('wheel', e => { if (!S.introDone) return; e.preventDefault(); flight?.kill(); ctl.user = true;
    const o = orbit(); wheelBase ??= o.r; o.r = Math.min(wheelBase * 1.35, Math.max(wheelBase * .65, o.r * Math.exp(e.deltaY * .0012))); setOrbit(o);
    clearTimeout(wheelT); wheelT = setTimeout(() => { wheelBase = null; if (!ctl.drag) springBack(); }, 900); }, {passive: false});
  let boxCheck = 0;
  function watchSafe() {
    if (++boxCheck % 20 || !S.introDone || !lastBox || ctl.user) return;
    const b = safeBox(); if (['l', 't', 'r', 'b'].some(k => Math.abs(b[k] - lastBox[k]) > 14)) { lastBox = b; fly(poseFor(current), .8); }
  }
  let sweep = null;
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h); film.uniforms.uRes.value.set(w * DPR, h * DPR); cam.aspect = w / h; viewOffset(true);
    if (S.introDone) { lastBox = safeBox(); Object.assign(camState, poseFor(current)); } }
  addEventListener('resize', resize); resize();

  // ---------- frame ----------
  const tone = k => C[k] ?? C.amber;
  function nodeTone(n) {
    if (n.id === 'Tier1_B') return tone(look.t1b);
    if (n.id === 'Supplier_B') return tone(look.sb);
    if (['Tier1_C', 'Supplier_D', 'Unknown_D'].includes(n.id)) return C.red;
    return PROBLEM.has(n.id) ? C.amber : C.teal;
  }
  function emphasis(n) {
    if (!n.twin) return 0;
    let e = 0; for (const k of nodeGroups(n)) e = Math.max(e, PROBLEM.has(n.id) ? vis[k] : full[k]);
    return e;
  }
  function tick(t) {
    t /= 1000;
    viewOffset(); watchSafe(); updateCar();
    cursor.on += (cursor.want - cursor.on) * .1; cursor.sx += (cursor.x - cursor.sx) * .22; cursor.sy += (cursor.y - cursor.sy) * .22;
    glowU.uGlow.value = cursor.on; glowU.uCursor.value.set(cursor.sx * DPR, (innerHeight - cursor.sy) * DPR);
    // ground
    grid.material.opacity = .9 * amb.v; ringMat.opacity = .9 * amb.v; divider.material.opacity = .8 * amb.v; haze.material.opacity = amb.v;
    scan.scale.setScalar(Math.max(.01, S.scanR)); scan.material.opacity = S.scanR > 0 && S.scanR < 26 ? .5 * (1 - S.scanR / 26) : 0;
    // nodes
    const tr = trace.k ? tree[trace.k]?.members : null;
    for (const n of nodes) {
      const k = Math.min(1, Math.max(0, (S.grow - n.delay) / .45)), grown = k * k * (3 - 2 * k), e = emphasis(n);
      let hh = n.hh;
      if (e > .001) { let hi = hiH(n); if (n.id === 'Tier1_B') hi = S.t1bH / 37.6 * 2.6; if (n.id === 'Supplier_B') hi *= 1 + look.sbBoost; hh += (hi - hh) * e; }
      const keep = !region.k || n.sector === region.k ? 1 : 1 - region.v;
      if (n === aiNode) hh = 1.2 * (.55 + .45 * ai.v);
      n.h = hh * grown * keep;
      o3.position.copy(n.p); const rr = n.h < .01 ? 0 : n.r; o3.scale.set(rr, Math.max(.001, n.h), rr); o3.updateMatrix(); inst.setMatrixAt(n.i, o3.matrix);
      tmpC.copy(n.base).multiplyScalar(n.twin ? .5 + .5 * bgDim.v : bgDim.v);
      if (e > .001) tmpC.lerp(toneC.setHex(nodeTone(n)), e);
      if (tr && tr.has(n)) tmpC.lerp(toneC.setHex(C.trace), trace.v * .85);
      if (impact.k && !impact.nodes.has(n)) tmpC.multiplyScalar(1 - .6 * impact.v);
      if (n === sel.n) tmpC.lerp(toneC.setHex(C.white), .5 * sel.v);
      if (n === aiNode) tmpC.lerp(toneC.copy(aiCol).multiplyScalar(.7 + .3 * Math.sin(t * 3) * (1 - ai.ok)), Math.max(ai.v, ai.ok));
      if (n === hoverNode) tmpC.multiplyScalar(1.7);
      inst.setColorAt(n.i, tmpC);
    }
    inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true;
    // edges: problem chains in the overview; the whole tree of a focused comparison; only the downstream paths in impact mode
    for (const e of edges) {
      let v = e.problem ? vis[e.group] : full[e.group];
      if (impact.k) v = impact.edges.has(e) ? Math.max(v, impact.v) : v * (1 - .85 * impact.v);
      if (region.k && region.k !== 'al') v *= 1 - region.v;
      v *= 1 - explode.v;
      if (sel.n === aiNode) v *= 1 - .8 * sel.v;
      e.v = v;
      const col = e.problem ? (e.group === 'bracket' ? tone(look.path) : e.group === 'housing' ? C.red : C.amber) : C.teal;
      e.tube.material.color.setHex(col); e.dots.material.color.setHex(col);
      e.tube.material.opacity = (e.problem ? .5 : .32) * v; e.dots.material.opacity = (e.problem ? .95 : .6) * v;
      e.tube.visible = e.dots.visible = v > .01;
      if (!e.tube.visible) continue;
      for (let i = 0; i < e.cnt; i++) { const u = ((i / e.cnt) + t * e.speed) % 1; o3.position.copy(e.curve.getPoint(u)); o3.scale.setScalar(.6 + .4 * Math.sin(u * Math.PI)); o3.updateMatrix(); e.dots.setMatrixAt(i, o3.matrix); }
      e.dots.instanceMatrix.needsUpdate = true;
    }
    anchorMarks.forEach(a => { const v = vis[a.k], col = a.k === 'bracket' ? tone(look.path) : a.k === 'housing' ? C.red : C.amber;
      a.s.material.color.setHex(col); a.r.material.color.setHex(col); a.g.material.color.setHex(col);
      a.g.material.opacity = v * (.85 + .15 * Math.sin(t * 2.4)); a.g.scale.setScalar(2.2 * (1 + .15 * Math.sin(t * 2.4)));
      a.s.material.opacity = v; a.r.material.opacity = v * (.4 + .4 * Math.sin(t * 2.4)); a.r.scale.setScalar(1 + .2 * Math.sin(t * 2.4)); a.r.lookAt(cam.position); });
    const ex = explode.v;
    for (const p of CAR_PARTS) anchor[p.k].copy(anchorBase[p.k]).addScaledVector(anchorOff[p.k], ex);
    anchorMarks.forEach(a => { a.s.position.copy(anchor[a.k]); a.r.position.copy(anchor[a.k]); a.g.position.copy(anchor[a.k]); });
    const pk = explode.pick, pf = explode.f, dimOf = k => (pk ? (k === pk ? 1 - pf : 1 - .94 * pf) : 1); // the hero's own glow steps aside so its drawing reads
    partBoxes.forEach(b => { const p = partBy[b.k], on = hover === b.k || trace.k === b.k, hero = b.k === pk;
      b.l.visible = ex > .01; b.l.position.copy(anchor[b.k]);
      // the picked part turns slowly on the spot, like a model on a turntable
      b.l.rotation.y = hero ? CAR_R + (t * .5) % TAU * pf : CAR_R; b.l.scale.setScalar(CAR_S * (hero ? 1 + .35 * pf : 1));
      b.l.material.color.setHex(p.flag ? (b.k === 'bracket' ? tone(look.path) : b.k === 'housing' ? C.red : C.amber) : on || hero ? C.white : 0x8fc8ff);
      b.l.material.opacity = ex * (on || hero ? 1 : .7) * (hero ? 1 : dimOf(b.k)); });
    partMarks.forEach((m, i) => { m.s.position.copy(anchor[m.k]); m.g.position.copy(anchor[m.k]); const on = hover === m.k || trace.k === m.k, o = partVis.v * (on ? 1 : .8) * (current.mode === 'overview' || trace.k === m.k ? 1 : .4) * dimOf(m.k);
      m.s.material.opacity = o; m.g.material.opacity = o * (on ? 1 : .75); m.g.scale.setScalar((on ? 1.5 : 1.05) * (1 + .18 * Math.sin(t * 2.2 + i * 1.3))); });
    // labels: flagged parts; other parts on hover or when traced; sectors in the overview
    anchorMarks.forEach(a => { const d = dimOf(a.k); a.s.material.opacity *= d; a.r.material.opacity *= d; a.g.material.opacity *= d; });
    for (const p of CAR_PARTS) PL[p.k].on = pk ? 0 : Math.max(ex, p.flag ? Math.max(partVis.lbl, vis[p.k] * (current.mode === 'overview' || current.k === p.k ? 1 : 0))
      : Math.max(partVis.lbl, hover === p.k ? 1 : 0, trace.k === p.k ? trace.v : 0));
    SL.forEach(x => (x.l.on = amb.v * (current.mode === 'overview' ? 1 : current.mode === 'region' && x.k === current.k ? 1 : 0)));
    { const lv = ai.link * (1 - explode.v); aiCol.setHex(AI_C).lerp(toneC.setHex(C.teal), ai.ok);
      aiLine.material.color.copy(aiCol); aiLine.material.gapSize = .25 * (1 - ai.ok) + .001; aiDot.material.color.copy(aiCol); aiGlow.material.color.copy(aiCol); aiLine.material.opacity = .9 * lv; aiLine.material.dashOffset = -t * .8; aiLine.visible = lv > .01;
      aiDot.position.copy(aiCurve.getPoint((t * .35) % 1)); aiDot.material.opacity = lv;
      aiGlow.position.copy(aiNode.p).setY(.6); aiGlow.material.opacity = ai.v * (1 - explode.v) * (.6 + .3 * Math.sin(t * 3)); aiGlow.scale.setScalar(3.2 * ai.v);
      knownLine.material.opacity = (.22 + .38 * lv) * (1 - explode.v); knownLine.visible = knownLine2.visible = explode.v < .99;
      AIL.on = lv; AIN.on = ai.v * (1 - explode.v); }
    sel.v += ((sel.n ? 1 : 0) - sel.v) * .15;
    if (sel.n) { selRing.position.set(sel.n.p.x, .05, sel.n.p.z); selRing.scale.setScalar(sel.n.r * 2.6 + .25 * Math.sin(t * 3) * 0); }
    selRing.material.opacity = .9 * sel.v;
    // camera: a slow drift around the target in the overview only
    const drift = RM || current.mode !== 'overview' || !S.introDone || ctl.user ? 0 : Math.sin(t * .1) * .025;
    dust.rotation.y = t * .008; dust.position.y = Math.sin(t * .15) * .3; film.uniforms.uTime.value = t;
    if (!RM && t % 7 < .02 && S.introDone && !sweep?.isActive()) sweep = gsap.fromTo(sweepU.uSweep, {value: -10}, {value: 10, duration: 2.6, ease: 'power1.inOut'});
    const ox = camState.x - camState.tx, oz = camState.z - camState.tz, c = Math.cos(drift), s = Math.sin(drift);
    cam.position.set(camState.tx + ox * c - oz * s, camState.y, camState.tz + ox * s + oz * c); cam.lookAt(camState.tx, camState.ty, camState.tz);
    composer.render();
    placeLabels(innerWidth, innerHeight);
    placeTip();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- pointer: hover names, picking, blank click ----------
  const pv = new THREE.Vector3();
  const screen = v => { pv.copy(v).project(cam); return [(pv.x + 1) / 2 * innerWidth, (1 - pv.y) / 2 * innerHeight, pv.z < 1]; };
  const top = n => n.p.clone().setY(n.h);
  const info = n => ({id: n.id, name: n.name, tier: n.tier, sector: n.sector, sectorName: SECTOR[n.sector].name, twin: n.twin,
    up: n.up?.name || null, ups: n.ups?.map(u => u.name) || [], part: n.part ? partBy[n.part].name : null, problem: PROBLEM.has(n.id),
    groups: nodeGroups(n), sub: sub[n.id] || ''});
  function placeTip() {
    const n = hoverNode;
    if (!n || n === sel.n) { tip.style.opacity = 0; return; }
    const [x, y] = screen(top(n));
    tip.style.opacity = 1; tip.style.transform = `translate(${x.toFixed(1)}px,${(y - 12).toFixed(1)}px) translate(-50%,-100%)`;
  }
  function setTip(n) {
    if (!n) return;
    const s = n.twin ? (sub[n.id] || `${TIER[n.tier]} · aluminium`) : `${TIER[n.tier]} · ${SECTOR[n.sector].name.toLowerCase()}`;
    tip.innerHTML = `<b>${n.name}</b><span>${s}</span>`;
  }
  renderer.domElement.addEventListener('pointermove', e => {
    cursor.x = e.clientX; cursor.y = e.clientY; if (cursor.want === 0) { cursor.sx = cursor.x; cursor.sy = cursor.y; } cursor.want = RM ? 0 : 1;
    if (!S.introDone) return;
    let part = null, pd = 22, node = null, nd = 14;
    for (const n of nodes) { if (n.h < .05) continue; const [x, y, f] = screen(top(n)); if (!f) continue; const [x0, y0] = screen(n.p);
      const d = Math.min(Math.hypot(x - e.clientX, y - e.clientY), Math.hypot(x0 - e.clientX, y0 - e.clientY), Math.hypot((x + x0) / 2 - e.clientX, (y + y0) / 2 - e.clientY)) - (n.twin ? 4 : 0);
      if (d < nd) { nd = d; node = n; } }
    for (const p of CAR_PARTS) { const [x, y] = screen(anchor[p.k]), d = Math.hypot(x - e.clientX, y - e.clientY); if (d < pd) { pd = d; part = p.k; } }
    if (part && node && pd < nd + 6) node = null; else if (node) part = null;
    if (node !== hoverNode) setTip(node);
    hover = part; hoverNode = node; renderer.domElement.style.cursor = part || node ? 'pointer' : '';
  });
  renderer.domElement.addEventListener('pointerleave', () => { cursor.want = 0; hoverNode = null; hover = null; });
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', e => (downAt = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('click', e => {
    if (!S.introDone || (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6)) return;
    if (hoverNode) opts.onPickNode?.(info(hoverNode));
    else if (hover) opts.onPick?.(hover, partBy[hover]);
    else opts.onBlank?.();
  });

  // ---------- modes ----------
  const tw = () => ({duration: RM ? 0 : .9, ease: 'power2.out'});
  function clearImpact() { if (!impact.k) return; impact.k = null; gsap.to(impact, {v: 0, ...tw()}); }
  function clearTrace() { if (!trace.k) return; gsap.killTweensOf(trace); trace.v = 0; tree[trace.k]?.line.geometry.setDrawRange(0, 0); trace.k = null; }
  // Click a node: every smelter -> supplier -> part path below it lights up; the rest of the network steps back.
  function showImpact(id) {
    const n = byId[id]; if (!n) return; clearTrace();
    const down = new Set(), seen = new Set([n]), queue = [n];
    while (queue.length) { const x = queue.shift(); for (const e of edges) if (e.a === x) { down.add(e); if (typeof e.b !== 'string' && !seen.has(e.b)) { seen.add(e.b); queue.push(e.b); } } }
    Object.assign(impact, {k: id, nodes: seen, edges: down});
    gsap.to(impact, {v: 1, ...tw()});
    gsap.to(vis, {bracket: .15, cover: .15, housing: .15, ...tw()}); gsap.to(full, {bracket: 0, cover: 0, housing: 0, ...tw()});
    gsap.to(bgDim, {v: .35, ...tw()}); gsap.to(car.pts.material, {opacity: .55, ...tw()});
    frame({mode: 'impact', k: id});
    if (id === 'Unknown_B') { pulseAlong(['Unknown_B', 'Supplier_B', 'Tier1_B', 'bracket']); setTimeout(() => pulseAlong(['Unknown_B', 'Supplier_H', 'Tier1_D', 'cover']), RM ? 0 : 2400); }
  }
  function tracePart(k) {
    // in the exploded view a part is picked in place: it lights up and the page shows its supply base; the car stays apart
    if (explode.on) { clearTrace(); trace.k = k; trace.v = 1; pickPart(k); return partStats(k); }
    clearTrace(); clearImpact(); const tr = tree[k]; trace.k = k;
    gsap.to(bgDim, {v: .4, ...tw()}); gsap.to(vis, {bracket: .08, cover: .08, housing: .08, ...tw()}); gsap.to(full, {bracket: 0, cover: 0, housing: 0, ...tw()});
    gsap.to(car.pts.material, {opacity: .6, ...tw()});
    const o = {n: 0}; gsap.to(o, {n: tr.n, duration: RM ? 0 : 1.8, ease: 'power1.inOut', onUpdate: () => tr.line.geometry.setDrawRange(0, Math.floor(o.n / 2) * 2)});
    gsap.to(trace, {v: 1, duration: RM ? 0 : .9, delay: RM ? 0 : .4});
    frame({mode: 'trace', k});
    return partStats(k);
  }
  function pickPart(k) {
    explode.pick = k; gsap.to(explode, {f: k ? 1 : 0, duration: RM ? 0 : .9, ease: 'power2.out'}); gsap.to(car.pts.material, {opacity: k ? .22 : 1, ...tw()});
    frame(k ? {mode: 'explode', k} : {mode: 'explode'});
  }
  function setExplode(on) {
    if (explode.on === on) return; explode.on = on; if (!on && explode.pick) { explode.pick = null; gsap.to(explode, {f: 0, duration: .4}); } gsap.to(explode, {v: on ? 1 : 0, duration: RM ? 0 : 1.2, ease: 'power3.inOut'});
    opts.onExplode?.(on);
    if (on) { clearTrace(); clearImpact(); gsap.to(bgDim, {v: .3, ...tw()}); gsap.to(car.pts.material, {opacity: 1, ...tw()}); frame({mode: 'explode'}); }
  }
  function focusOn(k) {
    clearTrace(); clearImpact(); if (region.k) gsap.to(region, {v: 0, ...tw(), onComplete: () => { if (!region.v) region.k = null; }});
    const over = k === 'overview' || !groups[k];
    gsap.to(bgDim, {v: over ? 1 : .42, ...tw()}); gsap.to(car.pts.material, {opacity: over ? .95 : .8, ...tw()});
    gsap.to(vis, Object.fromEntries([...Object.keys(vis).map(x => [x, over || x === k ? 1 : .18]), ...Object.entries(tw())]));
    gsap.to(full, Object.fromEntries([...Object.keys(full).map(x => [x, !over && x === k ? 1 : 0]), ...Object.entries(tw())]));
    frame(over ? {mode: 'overview'} : {mode: 'cmp', k});
  }
  function curves(ids) { const out = []; for (let i = 0; i < ids.length - 1; i++) { const e = edgeOf(ids[i], ids[i + 1]); if (e) out.push(e.curve); } return out; }
  function pulseAlong(ids) { if (RM) return; const cs = curves(ids); if (!cs.length) return; const o = {u: 0}, last = cs.length - 1;
    pulse.material.opacity = 1;
    gsap.to(o, {u: cs.length, duration: .75 * cs.length, ease: 'power1.inOut', onUpdate: () => { const i = Math.min(last, Math.floor(o.u)); pulse.position.copy(cs[i].getPoint(Math.min(1, o.u - i))); },
      onComplete: () => gsap.to(pulse.material, {opacity: 0, duration: .4})}); }
  function partStats(k) {
    const tr = tree[k];
    if (tr) return {t1: tr.t1.map(n => n.name), t2: tr.t2.length, sm: tr.sm.length, members: tr.members.size};
    // a flagged part: its comparison's named twin nodes
    const g = [...(groups[k] || [])]; return {t1: g.filter(n => n.tier === 1).map(n => n.name), t2: g.filter(n => n.tier === 2).length, sm: g.filter(n => n.tier === 3).length, members: g.length};
  }
  // request envelope travelling back up the chain (Tier 1 -> Tier 2)
  function envelope(onDone) {
    const o = {u: 0}, back = curves(['Supplier_B', 'Tier1_B', 'bracket']).reverse(); env.material.opacity = 1;
    gsap.to(o, {u: 2, duration: RM ? 0 : 2, ease: 'power2.inOut', onUpdate: () => { const i = Math.min(1, Math.floor(o.u)); env.position.copy(back[i].getPoint(1 - Math.min(1, o.u - i))); env.rotation.y += .1; },
      onComplete: () => { gsap.to(env.material, {opacity: 0, duration: .4}); onDone?.(); }});
  }

  // Intro: the car assembles, the camera pulls back, several hundred suppliers rise, the scan finds the chains that matter.
  // `cue(name)` lets the page bring its own panels in on the same clock.
  let introTl = null;
  function intro(cue = () => {}) {
    if (RM) return finishIntro(cue);
    labelHost.classList.add('intro');
    Object.assign(camState, poseFor({mode: 'hero'}));
    const over = poseFor({mode: 'overview'});
    introTl = gsap.timeline({onComplete: () => { S.introDone = true; current = {mode: 'overview'}; lastBox = safeBox(); cue('done'); }});
    // a low close shot as the car assembles under the light shaft, a scan along its body, then a slow crane up and out
    const push = {...camState};
    introTl.to(film.uniforms.uFade, {value: 1, duration: 1.6, ease: 'power2.out'}, 0)
      .to(shaft.material.uniforms.uK, {keyframes: [{value: .6, duration: .08}, {value: .1, duration: .1}, {value: 1, duration: .12}, {value: .7, duration: .1}, {value: 1, duration: .3}]}, .3)
      .to(dust.material, {opacity: .45, duration: 2}, .4)
      .to(car, {p: 1, duration: 2.6, ease: 'power2.inOut'}, 0)
      .fromTo(camState, {...push}, {x: push.x * .92 + push.tx * .08, z: push.z * .92 + push.tz * .08, duration: 2.6, ease: 'none'}, 0)
      .fromTo(sweepU.uSweep, {value: -10}, {value: 10, duration: 1.8, ease: 'power1.inOut'}, 1.6)
      .to(camState, {...over, duration: 3.2, ease: 'power3.inOut'}, 2.6)
      .to(partVis, {v: 1, duration: .8}, 2.2)
      .to(partVis, {lbl: 1, duration: .5}, 2.0)
      .to(partVis, {lbl: 0, duration: .5}, 4.4)
      .add(() => labelHost.classList.remove('intro'), 5.0)
      .to(amb, {v: 1, duration: 1.6}, 2.8)
      .to(S, {grow: 2.2, duration: 2.8, ease: 'power1.out'}, 2.9)
      .add(() => cue('top'), 4.0)
      .add(() => cue('screening'), 4.3)
      .to(S, {scanR: 30, duration: 2.2, ease: 'power1.in'}, 4.6)
      .to(vis, {bracket: 1, duration: 1, ease: 'power2.out'}, 5.6)
      .to(vis, {cover: 1, housing: 1, duration: 1}, 6.0)
      .add(() => cue('flagged'), 5.8);
  }
  function finishIntro(cue = () => {}) {
    if (S.introDone) return; S.introDone = true;
    introTl?.kill(); car.p = 1; car.done = false; updateCar();
    labelHost.classList.remove('intro'); partVis.v = 1; partVis.lbl = 0; S.grow = 2.2; S.scanR = 30; amb.v = 1;
    film.uniforms.uFade.value = 1; shaft.material.uniforms.uK.value = 1; dust.material.opacity = .45;
    Object.assign(vis, {bracket: 1, cover: 1, housing: 1}); current = {mode: 'overview'};
    requestAnimationFrame(() => { lastBox = safeBox(); Object.assign(camState, poseFor(current)); });
    cue('top'); cue('flagged'); cue('done');
  }

  const LABEL_NODE = {t1b: 'Tier1_B', sb: 'Supplier_B'};
  return {
    intro, finishIntro,
    focus: focusOn,
    explode: on => setExplode(on ?? !explode.on), exploded: () => explode.on,
    // leave the picked part and go back to the whole exploded car
    unpick: () => { if (explode.pick) { trace.k = null; pickPart(null); return true; } return false; },
    trace: tracePart, clearTrace,
    // look: {t1bValue, t1b, sb, path: 'amber' | 'red' | 'teal', sbBoost: 0..1}
    set(next) { Object.assign(look, next); if (next.t1bValue != null) gsap.to(S, {t1bH: next.t1bValue, duration: RM ? 0 : 1.1, ease: 'power3.out'}); },
    // a status line for a part label (br, cov, hou) or a named node (t1b, sb), shown with its name
    label(k, text) {
      if (LABEL_NODE[k]) { sub[LABEL_NODE[k]] = text; if (hoverNode?.id === LABEL_NODE[k]) setTip(hoverNode); return; }
      const l = PL[{br: 'bracket', cov: 'cover', hou: 'housing'}[k]]; const s = l?.d.querySelector('.s');
      if (s && s.innerHTML !== text) { s.innerHTML = text; l.w = 0; }
    },
    impact: showImpact, clearImpact,
    // reveal (or hide) the AI-suggested link; the node rises first, then the dashed link draws in
    suggest(mode) {
      const on = mode && mode !== 'off'; gsap.killTweensOf(ai);
      gsap.to(ai, {ok: mode === 'ok' ? 1 : 0, duration: RM ? 0 : .8});
      const okd = mode === 'ok'; AIL.d.classList.toggle('ok', okd); AIN.d.classList.toggle('ok', okd);
      AIL.d.innerHTML = okd ? '<div class="n">✓ Confirmed link</div><div class="s">Smelter X → Supplier L</div>' : '<div class="n"><span class="aisym">✦</span> Suggested link</div><div class="s">Smelter X → Supplier L</div>';
      AIN.d.querySelector('.s').textContent = okd ? 'link confirmed' : 'link suggested · not confirmed'; AIL.w = AIN.w = 0;
      if (!on) { gsap.to(ai, {v: 0, link: 0, duration: RM ? 0 : .5}); return; }
      if (ai.v > .99 && ai.link > .99) return;
      gsap.to(ai, {v: 1, duration: RM ? 0 : 1.1, ease: 'back.out(2)'}); gsap.to(ai, {link: 1, duration: RM ? 0 : 1, delay: RM ? 0 : .6, ease: 'power2.out'});
    },
    pulse(route) { pulseAlong(route === 'evidence' ? ['Supplier_B', 'Tier1_B', 'bracket'] : ['Unknown_B', 'Supplier_B', 'Tier1_B', 'bracket']); },
    envelope, partStats,
    // the picked node gets a ring; null clears it
    select(id) {
      sel.n = id ? byId[id] || null : null;
      // a supplier always takes the view to its material region; closing its card leaves the view alone (a blank click resets it)
      if (sel.n) {
        if (current.mode !== 'region') home = current;
        const at = ang(sel.n), far = current.at == null || Math.abs(Math.atan2(Math.sin(at - current.at), Math.cos(at - current.at))) > .35;
        if (current.mode !== 'region' || current.k !== sel.n.sector || far) frame({mode: 'region', k: sel.n.sector, at});
      }
    },
    // where a node is on screen, for anchoring a card next to it
    screenOf(id) { const n = byId[id]; if (!n) return null; const [x, y, f] = screen(top(n)), [x0, y0] = screen(n.p); return f ? {x, y: Math.min(y, y0), y0: Math.max(y, y0)} : null; },
    info(id) { return byId[id] ? info(byId[id]) : null; },
    mode: () => current,
  };
}
