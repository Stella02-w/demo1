// The vehicle as a line drawing: profile, glasshouse, shut lines, lamps and wheels, built from the model's real dimensions (metres).
// Returns points [x, y, z, colour, group]: x along the car (front positive), y up from the ground, z across.
// The group says which panel a point belongs to, so the exploded view can move panels apart.
import * as THREE from 'three';
import {geometry} from './models.js';

const TAU = Math.PI * 2;
export function carLines(model) {
  const b = geometry(model), out = [], STEP = .011;
  const cMain = new THREE.Color(0xe8f0f5), cSoft = new THREE.Color(0x8aa2b0), cLamp = new THREE.Color(0xffd7a8), cTail = new THREE.Color(0xff6a4a);
  const lerp = (a, c, t) => a + (c - a) * t, clamp = (x, a, c) => Math.min(c, Math.max(a, x));
  const beltAt = x => lerp(b.belt0, b.belt1, clamp((b.xc - x) / (b.xc - b.xb0), 0, 1));
  // half width at a point of the side: tumblehome above the belt, rounded corners in plan
  const W = (x, y) => { let w = b.hw - Math.max(0, y - beltAt(x)) * .42; const e = Math.abs(x) - (b.L / 2 - .5);
    if (e > 0) w *= .74 + .26 * Math.sqrt(Math.max(0, 1 - (e / .5) ** 2)); return w; };
  const V2 = (x, y) => new THREE.Vector3(x, y, 0);
  // sample a 2D path (side view) evenly by length; smooth paths go through a centripetal spline
  const path = (pts, smooth) => { const c = smooth ? new THREE.CatmullRomCurve3(pts.map(p => V2(...p)), false, 'centripetal')
    : new THREE.CurvePath(); if (!smooth) for (let i = 0; i < pts.length - 1; i++) c.add(new THREE.LineCurve3(V2(...pts[i]), V2(...pts[i + 1])));
    return c.getSpacedPoints(Math.max(2, Math.round(c.getLength() / STEP))); };
  let G = null; // set for wheels and mirrors; every other point is grouped by where it sits on the body
  const put = (x, y, z, c) => { out.push([x, y, z, c, G || groupAt(x, y, z)]); };
  // a side line, drawn on both flanks at the body's width (inset lets lamps and shut lines sit just inside the outline)
  const side = (pts, c, smooth = true, inset = 0) => { for (const p of path(pts, smooth)) for (const s of [-1, 1]) put(p.x, p.y, s * (W(p.x, p.y) - inset), c); };
  // a line across the car at one station, crowned upward in the middle
  const across = (x, y, c, crown = .03, frac = 1) => { const w = W(x, y) * frac, n = Math.round(2 * w / STEP);
    for (let i = 0; i <= n; i++) { const z = -w + 2 * w * i / n; put(x, y + crown * (1 - (z / W(x, y)) ** 2), z, c); } };
  // a closed shape on the front or rear face, given as [z, y] corners, mirrored left and right
  const face = (x, quad, c, mirror = true) => { for (const s of mirror ? [-1, 1] : [1]) for (const p of path([...quad, quad[0]].map(([z, y]) => [z * s, y]), false)) put(x, p.y, p.x, c); };
  const arc = (cx, cy, r, a0, a1) => { const n = Math.max(8, Math.round(Math.abs(a1 - a0) * r / STEP)), o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };

  const {xf, xr, wf, wr, r, gc, hb0, hb1, xc, xa0, xm0, xb0, hr0, hm, hr1, ht, rake} = b, ra = r + .09;
  const LR = z => (z > 0 ? 'R' : 'L');
  function groupAt(x, y, z) {
    if (y > beltAt(x) + .02 && x < xc + .05) return 'upper';
    if (x > xc - .05 && y > hb0 - .32) return x > xf - .1 && y < hb0 - .02 ? 'front' : 'bonnet';
    if (x > xf - .35) return 'front';
    if (x < xr + .35) return 'rear';
    if (x > wr + ra && x < wf - ra - .04 && y > gc + .04) return 'door' + LR(z);
    return 'side' + LR(z);
  }
  // profile: bumper, bonnet, windscreen, roof, spoiler, tailgate
  const tailTop = [xr + .1 + rake * .3, ht + .05];
  const upper = [[xf - .12, gc + .02], [xf - .02, gc + .3], [xf, hb0 - .28], [xf - .07, hb0 - .05], [xf - .22, hb0], [xc + .4, hb1 - .03], [xc, hb1],
    [lerp(xc, xa0, .5), lerp(hb1, hr0, .55)], [xa0, hr0], [xm0, hm], [xb0 + .1, hr1 + .01], [xb0, hr1], [xb0 - .1, hr1 - .04], tailTop,
    [xr + .02, ht - .15], [xr, gc + .45], [xr + .1, gc + .02]];
  side(upper, cMain);
  // wheel arches and sill
  const aOff = Math.asin((gc - r) / ra);
  side([[xr + .1, gc + .02], ...arc(wr, r, ra, Math.PI - aOff, aOff), ...arc(wf, r, ra, Math.PI - aOff, aOff), [xf - .12, gc + .02]], cMain, false);
  // glasshouse: belt below, roof line above, B and C pillars
  const xd = xb0 + .02, dloTop = [[xc - .02, b.belt0 + .03], [xa0 - .08, hr0 - .09], [xm0, hm - .1], [xb0 + .2, hr1 - .1], [xd, beltAt(xd) + .1]];
  side([...dloTop, [xd, beltAt(xd) + .02]], cMain);
  side([[xd, beltAt(xd) + .02], [xc - .02, b.belt0 + .03]], cMain, false);
  const roofY = x => x > xm0 ? lerp(hm, hr0, (x - xm0) / (xa0 - xm0)) : lerp(hr1, hm, (x - xb0) / (xm0 - xb0));
  for (const xp of [b.xB0, b.xC0]) side([[xp + .02, beltAt(xp) + .02], [xp + .06, roofY(xp + .06) - .1]], cMain, false);
  // shoulder line, lower body line, shut lines and handles
  side([[xf - .25, hb0 - .03], [xc, b.belt0 - .05], [xb0, b.belt1 - .04], [xr + .05, ht - .06]], cSoft);
  side([[wf - ra - .12, b.crease[0]], [wr + ra + .12, b.crease[1]]], cSoft, false);
  side([[wf - ra - .06, gc + .08], [wf - ra - .1, (gc + b.belt0) / 2], [xc - .08, b.belt0 - .01]], cSoft, true, .01);
  side([[b.xB0, gc + .06], [b.xB0 + .02, beltAt(b.xB0)]], cSoft, false, .01);
  side([[wr + ra + .04, gc + .1], [wr + ra + .02, (gc + b.belt1) / 2], [b.xC0 - .02, beltAt(b.xC0)]], cSoft, true, .01);
  for (const hx of [b.xB0 + .35, b.xC0 + .3]) side([[hx, beltAt(hx) - .14], [hx - .22, beltAt(hx - .22) - .14]], cSoft, false, -.005);
  // lamps on the flanks: slim headlamp wrapping the corner, tail lamp under the spoiler
  side([[xf - .08, hb0 - .09], [xf - .62, hb0 - .03], [xf - .66, hb0 - .1], [xf - .1, hb0 - .17], [xf - .08, hb0 - .09]], cLamp, false, .01);
  side([[xr + .03, ht - .03], [xr + .42, ht - .01], [xr + .45, ht - .09], [xr + .03, ht - .11], [xr + .03, ht - .03]], cTail, false, .01);
  // stations across the car: bonnet edge, cowl, screen header, roof end, tailgate, bumpers
  across(xf - .22, hb0, cMain, .04); across(xc, hb1, cMain, .05); across(xa0, hr0, cMain, .03); across(xb0, hr1, cMain, .03);
  across(...tailTop, cMain, .03); across(xf, hb0 - .28, cSoft, .01); across(xf - .12, gc + .02, cSoft, 0); across(xr + .1, gc + .02, cSoft, 0); across(xr, gc + .45, cSoft, .01);
  // the front: grille between slim headlamps, lower intake
  const fw = W(xf, hb0 - .15);
  face(xf + .005, [[-.42, hb0 - .27], [.42, hb0 - .27], [.42, hb0 - .08], [-.42, hb0 - .08]], cMain, false);
  for (const y of [hb0 - .21, hb0 - .15]) face(xf + .005, [[-.42, y], [.42, y]], cSoft, false);
  face(xf + .005, [[.5, hb0 - .2], [fw - .06, hb0 - .17], [fw - .1, hb0 - .08], [.5, hb0 - .09]], cLamp);
  face(xf + .005, [[-.62, gc + .14], [.62, gc + .14], [.66, gc + .36], [-.66, gc + .36]], cSoft, false);
  // the rear: tail lamps joined by a light bar, number plate, rear screen
  const bw = W(xr, ht - .07);
  face(xr - .005, [[bw - .42, ht - .11], [bw - .05, ht - .11], [bw - .05, ht - .02], [bw - .42, ht - .02]], cTail);
  face(xr - .005, [[-(bw - .42), ht - .065], [bw - .42, ht - .065]], cTail, false);
  face(xr - .005, [[-.26, gc + .42], [.26, gc + .42], [.26, gc + .56], [-.26, gc + .56]], cSoft, false);
  { const top = [xb0 - .1, hr1 - .06], bot = [tailTop[0] + .02, tailTop[1] + .05], wt = W(...top) - .16, wb = W(...bot) - .14;
    for (const [p, w] of [[top, wt], [bot, wb]]) for (let z = -w; z <= w; z += STEP) put(p[0], p[1], z, cMain);
    for (const s of [-1, 1]) for (const p of path([[top[0], top[1]], [bot[0], bot[1]]], false)) { const t = (top[0] - p.x) / (top[0] - bot[0]); put(p.x, p.y, s * lerp(wt, wb, t), cMain); } }
  // mirrors
  for (const s of [-1, 1]) { const mx = xc - .12, my = b.belt0 + .06, z0 = W(mx, my) - .02; G = 'door' + LR(s);
    for (const p of path([[0, 0], [.22, .02], [.2, .14], [.02, .12], [0, 0]], false)) put(mx - p.x * .5, my + p.y, s * (z0 + p.x), cMain); }
  // wheels: tyre, rim, hub and five split spokes
  for (const wx of [wf, wr]) for (const s of [-1, 1]) {
    G = 'wheel' + (wx === wf ? 'F' : 'B') + LR(s);
    const z = s * (b.hw - .05), ring = (rr, c, zz = z) => { const n = Math.round(TAU * rr / STEP); for (let i = 0; i < n; i++) { const a = i / n * TAU; put(wx + Math.cos(a) * rr, r + Math.sin(a) * rr, zz, c); } };
    ring(r, cMain); ring(r * .72, cMain); ring(r * .14, cSoft);
    for (let k = 0; k < 5; k++) for (const d of [-.09, .09]) { const a = k / 5 * TAU + d;
      for (let t = r * .16; t < r * .7; t += STEP) put(wx + Math.cos(a) * t, r + Math.sin(a) * t, z, cSoft); }
  }
  G = null;
  return out;
}

// How far each panel moves in the exploded view (metres, car frame).
export const EXPLODE = {upper: [0, .85, 0], bonnet: [.45, .5, 0], front: [.95, 0, 0], rear: [-.9, 0, 0],
  doorR: [0, 0, .8], doorL: [0, 0, -.8], sideR: [0, 0, .4], sideL: [0, 0, -.4],
  wheelFR: [.15, 0, 1.05], wheelFL: [.15, 0, -1.05], wheelBR: [-.15, 0, 1.05], wheelBL: [-.15, 0, -1.05], core: [0, 0, 0]};
