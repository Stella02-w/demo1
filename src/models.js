// Vehicles in the twin. Body dimensions are public specifications (metres); the line drawing is built from them in scene.js.
// The live sourcing round (data.js) is on the Range Rover Sport. Its three aluminium parts are shared platform parts,
// so they appear on every model. [Assumption] Every other part, sector share and supplier count here is illustrative.
const SHARED = [
  {k: 'bracket', name: 'Front suspension bracket', at: b => [b.wf - .2, b.r + .3, .82], flag: true, mat: 'al'},
  {k: 'cover', name: 'Rear cover', at: b => [b.xr + .35, b.ht + .2, .72], flag: true, mat: 'al'},
  {k: 'housing', name: 'Motor housing', at: b => [b.xf - .55, b.gc + .3, -.45], flag: true, mat: 'al'}
];
const P = (k, name, mat, at) => ({k, name, mat, at});
// [Assumption] Further carbon-relevant parts with illustrative data, so each vehicle covers every material group.
const BRAKE = P('brake', 'Brake disc', 'steel', b => [b.wr, b.r, .62]), CCB = P('ccb', 'Cross-car beam', 'steel', b => [b.xf - 1.75, b.belt0 + .05, -.3]),
  IP = P('ip', 'Instrument panel', 'poly', b => [b.xf - 1.9, .85, .5]), LAMP = P('lamp', 'Headlamp', 'poly', b => [b.xf - .12, b.gc + .62, .7]),
  BATT = P('battery', 'High-voltage battery module', 'elec', b => [.7, b.gc + .25, -.2]);

export const MODELS = [
  {k: 'rrs', name: 'Range Rover Sport', plant: 'Solihull', live: true, seed: 11,
    body: {L: 4.946, WB: 2.997, fo: .93, hw: 1.0, r: .40, gc: .27, hb0: .95, hb1: 1.08, cowl: 1.55, xa: 2.35, hr0: 1.74, xm: 2.95, hm: 1.8, xb: .62, hr1: 1.68, ht: 1.15, rake: .28,
      belt0: 1.08, belt1: 1.2, xB: 2.95, xC: 3.95, crease: [.62, .66], tail: 'suv'},
    share: {al: .34, steel: .24, poly: .18, elec: .13, glass: .11}, count: 840,
    parts: [P('crash', 'Front crash beam', 'steel', b => [b.xf - .15, b.gc + .35, .3]), P('door', 'Door inner panel', 'steel', b => [b.xf - 2.4, b.belt0 - .3, .95]),
      P('seat', 'Seat frame', 'steel', b => [b.xf - 3.0, .75, -.25]), P('tray', 'Battery tray', 'al', b => [0, b.gc + .05, 0]),
      P('wheel', 'Wheel rim', 'al', b => [b.wf, b.r, .95]), P('roof', 'Roof rail', 'al', b => [b.xf - 3.4, b.hm, -.6]),
      P('subframe', 'Rear subframe', 'steel', b => [b.wr + .2, b.r + .1, .2]), P('bumper', 'Front bumper fascia', 'poly', b => [b.xf, b.gc + .5, -.6]),
      P('ecu', 'Infotainment unit', 'elec', b => [b.xf - 2.0, 1.0, 0]), P('glass', 'Windscreen', 'glass', b => [b.xf - 1.95, (b.hb1 + b.hr0) / 2, -.2]),
      BRAKE, CCB, IP, LAMP, BATT]},
  {k: 'velar', name: 'Range Rover Velar', plant: 'Solihull', seed: 29,
    body: {L: 4.797, WB: 2.874, fo: .9, hw: .99, r: .39, gc: .25, hb0: .86, hb1: 1.0, cowl: 1.5, xa: 2.3, hr0: 1.6, xm: 2.9, hm: 1.68, xb: .5, hr1: 1.52, ht: 1.08, rake: .3,
      belt0: 1.02, belt1: 1.16, xB: 2.85, xC: 3.85, crease: [.58, .6], tail: 'suv'},
    share: {al: .42, steel: .2, poly: .17, elec: .13, glass: .08}, count: 760,
    parts: [P('crash', 'Front crash beam', 'al', b => [b.xf - .15, b.gc + .35, .3]), P('door', 'Flush door handle module', 'elec', b => [b.xf - 2.4, b.belt0 - .15, .97]),
      P('tray', 'Battery tray', 'al', b => [0, b.gc + .05, 0]), P('wheel', 'Wheel rim', 'al', b => [b.wf, b.r, .95]),
      P('screen', 'Touch Pro Duo screens', 'elec', b => [b.xf - 2.0, 1.0, 0]), P('seat', 'Seat frame', 'steel', b => [b.xf - 3.0, .75, -.25]),
      P('tailgate', 'Tailgate inner', 'poly', b => [b.xr + .1, b.ht - .2, -.3]), P('glass', 'Panoramic roof glass', 'glass', b => [b.xf - 3.0, b.hm, .2]),
      BRAKE, IP, LAMP, BATT, P('subframe', 'Rear subframe', 'al', b => [b.wr + .2, b.r + .1, .2])]},
  {k: 'ds', name: 'Discovery Sport', plant: 'Halewood', seed: 47,
    body: {L: 4.597, WB: 2.741, fo: .87, hw: .96, r: .37, gc: .27, hb0: .93, hb1: 1.06, cowl: 1.42, xa: 2.15, hr0: 1.67, xm: 2.7, hm: 1.73, xb: .24, hr1: 1.71, ht: 1.16, rake: .06,
      belt0: 1.05, belt1: 1.14, xB: 2.8, xC: 3.65, crease: [.6, .62], tail: 'suv'},
    share: {al: .24, steel: .36, poly: .18, elec: .12, glass: .1}, count: 700,
    parts: [P('crash', 'Front crash beam', 'steel', b => [b.xf - .15, b.gc + .35, .3]), P('door', 'Door inner panel', 'steel', b => [b.xf - 2.4, b.belt0 - .3, .95]),
      P('seat', 'Third-row seat frame', 'steel', b => [b.xr + 1.1, .75, -.25]), P('wheel', 'Wheel rim', 'al', b => [b.wf, b.r, .95]),
      P('subframe', 'Rear subframe', 'steel', b => [b.wr + .2, b.r + .1, .2]), P('bumper', 'Rear bumper fascia', 'poly', b => [b.xr, b.gc + .5, .5]),
      P('harness', 'Body wiring harness', 'elec', b => [b.xf - 2.6, .55, 0]), P('glass', 'Windscreen', 'glass', b => [b.xf - 1.85, (b.hb1 + b.hr0) / 2, -.2]),
      BRAKE, CCB, IP, LAMP, P('roof', 'Roof rail', 'al', b => [b.xf - 3.2, b.hm, -.6])]}
];

const KEY = 'carbontrace.model';
export function currentModel() {
  let k = new URLSearchParams(location.search).get('model');
  try { if (k) localStorage.setItem(KEY, k); else k = localStorage.getItem(KEY); } catch {}
  return MODELS.find(m => m.k === k) || MODELS[0];
}
export function chooseModel(k) {
  try { localStorage.setItem(KEY, k); } catch {}
  const u = new URL(location.href); u.searchParams.set('model', k); location.href = u.href;
}

// Derived body geometry: x along the car (front positive), centred; heights from the ground.
export function geometry(m) {
  const b = {...m.body}; b.xf = b.L / 2; b.xr = -b.L / 2; b.wf = b.xf - b.fo; b.wr = b.wf - b.WB;
  b.xc = b.xf - b.cowl; b.xa0 = b.xf - b.xa; b.xm0 = b.xf - b.xm; b.xb0 = b.xr + b.xb; b.xB0 = b.xf - b.xB; b.xC0 = b.xf - b.xC;
  return b;
}
export const partsOf = m => { const b = geometry(m); return [...SHARED, ...m.parts].map(p => ({...p, at: p.at(b)})); };
