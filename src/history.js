// Part records for the exploded view: how each part has been sourced before.
// [Assumption] Every past round here is illustrative (seeded per model and part), so the record reads like a real one in a demo.
// Only the live round (data.js) carries real analysed values.
import * as T from './domain.js';
import {PARTS, ROUND} from './data.js';
import {view, ctxOf} from './store.js';
import {ROSTER} from './roster.js';
import {MODELS, partsOf} from './models.js';
import {store, esc, f2, day, tag, STAGE} from './ui.js';
const BASE = {bracket: 47, cover: 33, housing: 61, crash: 26, door: 19, seat: 28, tray: 98, wheel: 86, roof: 12, subframe: 43, bumper: 15, ecu: 36, screen: 42,
  glass: 23, tailgate: 18, harness: 39, brake: 17, ccb: 14, ip: 21, lamp: 9, battery: 118};
const ROUNDS = [['Q2-22', '2022-05-19'], ['Q4-22', '2022-11-17'], ['Q2-23', '2023-05-18'], ['Q4-23', '2023-11-16'], ['Q2-24', '2024-05-16'], ['Q4-24', '2024-11-14'],
  ['Q2-25', '2025-05-15'], ['Q4-25', '2025-11-13']];
const NEXT = [['Q2-27', '2027-05-13'], ['Q4-27', '2027-11-11'], ['Q2-28', '2028-05-18']];

function seeded(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); let s = (h >>> 0) % 2147483646 + 1;
  return () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646); }

// rows oldest first: {round, date, tier1, pcf (kgCO2e per part), basis, outcome, note}
export function partHistory(model, part) {
  const rnd = seeded(model.k + ':' + part.k), pick = a => a[Math.floor(rnd() * a.length)];
  const pool = tier1Pool(model, part);
  let pcf = (BASE[part.k] || 6 + rnd() * 60) * (.92 + rnd() * .16), tier1 = pick(pool), at = Math.floor(rnd() * 2);
  const rows = [], basis = ['estimated', 'declared', 'declared', 'verified'];
  for (let i = 0; at < ROUNDS.length; i++) {
    const switched = i > 0 && rnd() < .35, next = switched ? pick(pool.filter(t => t !== tier1)) || tier1 : tier1;
    if (i) pcf *= .83 + rnd() * .22;
    const b = basis[Math.min(basis.length - 1, i + (rnd() < .3 ? 1 : 0))];
    rows.push({round: ROUNDS[at][0], date: ROUNDS[at][1], tier1: next, pcf: Math.round(pcf * 100) / 100, basis: b,
      outcome: i === 0 ? 'awarded' : switched ? 'switched' : 'renewed', note: switched ? `lower carbon than ${tier1}` : i === 0 ? 'first sourced' : 'contract extended'});
    tier1 = next; at += 2 + (rnd() < .4 ? 1 : 0);
  }
  return {rows, next: NEXT[Math.floor(rnd() * NEXT.length)], target: Math.round(rows.at(-1).pcf * .9 * 100) / 100};
}

// who could have made this part before: the round's named Tier 1s for a flagged part, otherwise Tier 1s of its material from the roster
const nm = x => x.replace('_', ' ');
function tier1Pool(model, part) {
  const c = ROUND.comparisons.find(c => c.key === part.k);
  if (c) return c.parts.map(x => nm(PARTS.find(q => q.part === x).tier1));
  const t1 = ROSTER.filter(r => r.mat === part.mat && r.tier === 1 && r.sample), rnd = seeded('pool:' + model.k + part.k);
  return [0, 1, 2].map(() => t1[Math.floor(rnd() * t1.length)].name);
}
// this round's comparison for a flagged part, from the analysed twin
export function liveOf(part) {
  if (!part.flag) return null;
  const v = view(store.get(), part.k), g = T.buildGraph({restated: ctxOf(store.get()).restated});
  const c = v.def.parts.map(x => ({t1: nm(PARTS.find(q => q.part === x).tier1), pcf: T.partPcf(g, x)})).filter(x => Number.isFinite(x.pcf));
  const best = c.length ? c.reduce((a, b) => (b.pcf < a.pcf ? b : a)) : null;
  return {v, c, row: {round: ROUND.name.split(' ')[0], date: ROUND.sourcing_date, tier1: v.def.parts.map(x => nm(PARTS.find(q => q.part === x).tier1)).join(' vs '),
    pcf: best ? best.pcf : null, basis: 'under review', outcome: 'live', live: true}};
}
const OUT = {awarded: ['Awarded', 't-mut'], renewed: ['Renewed', 't-mut'], switched: ['Switched', 't-ok']};
// one part's record: carbon by round, the sourcing history and where it stands now (shared by the Sourcing Center and the Parts Center)
export function partRecord(model, part) {
  const h = partHistory(model, part), live = liveOf(part);
  // a flagged part's past rounds are scaled to sit just above this round's analysed value, so the record and the round agree
  if (live?.row.pcf != null) { const k = live.row.pcf * 1.07 / h.rows.at(-1).pcf; h.rows.forEach(r => (r.pcf = Math.round(r.pcf * k * 100) / 100)); h.target = Math.round(h.target * k * 100) / 100; }
  const rows = live ? [...h.rows, live.row] : h.rows;
  const pts = rows.filter(r => r.pcf != null), last = pts.at(-1), first = pts[0], drop = (last.pcf - first.pcf) / first.pcf;
  return {h, live, rows, last, first, drop, current: h.rows.at(-1).tier1, basis: h.rows.at(-1).basis};
}
export function recordHTML(model, part, sec) {
  const {h, live, rows, last, first, drop, current} = partRecord(model, part);
  const W = 300, H = 64, pts = rows.filter(r => r.pcf != null), ys = pts.map(r => r.pcf), lo = Math.min(...ys, h.target) * .92, hi = Math.max(...ys) * 1.04;
  const X = i => 8 + i * (W - 16) / Math.max(1, pts.length - 1), Y = y => H - 8 - (y - lo) / (hi - lo) * (H - 16);
  const spark = `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="kgCO2e per part by sourcing round">
    <line x1="0" x2="${W}" y1="${Y(h.target).toFixed(1)}" y2="${Y(h.target).toFixed(1)}" class="tg"/>
    <polyline points="${pts.map((r, i) => `${X(i).toFixed(1)},${Y(r.pcf).toFixed(1)}`).join(' ')}"/>
    ${pts.map((r, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(r.pcf).toFixed(1)}" r="${r.live ? 4 : 3}" class="${r.live ? 'lv' : r.outcome === 'switched' ? 'sw' : ''}"><title>${esc(r.round)} · ${f2(r.pcf)}</title></circle>`).join('')}</svg>`;
  return `<div class="k">Part record · ${esc(model.name)}${part.flag ? '' : ' · sample history'}</div><div class="h">${esc(part.name)}</div>
    <div class="sub">${esc(sec)} · current Tier 1 <b>${esc(current)}</b></div>
    <div class="cells"><div><div class="k">kgCO₂e / part</div><div class="v mono">${f2(last.pcf)}</div></div>
      <div><div class="k">Since ${esc(first.round)}</div><div class="v mono" style="color:var(--${drop < 0 ? 'teal' : 'red'})">${drop < 0 ? '−' : '+'}${Math.abs(drop * 100).toFixed(0)}%</div></div>
      <div><div class="k">Next sourcing</div><div class="v mono" style="font-size:18px;margin-top:6px">${live ? esc(live.row.round) : esc(h.next[0])}</div></div></div>
    <div class="k">Carbon by sourcing round <span style="float:right">target ${f2(h.target)}</span></div>${spark}
    <table class="t hist"><thead><tr><th>Round</th><th>Tier 1</th><th class="n">kgCO₂e</th><th>Basis</th><th></th></tr></thead><tbody>
    ${rows.slice().reverse().map(r => `<tr${r.live ? ' class="lv"' : ''}><td><b>${esc(r.round)}</b><div class="sub">${day(r.date)}</div></td><td>${esc(r.tier1)}</td><td class="n mono">${f2(r.pcf)}</td>
      <td><span class="basis ${r.basis.replace(' ', '-')}">${esc(r.basis)}</span></td><td>${r.live ? tag(STAGE[live.v.stage]) : tag(OUT[r.outcome])}</td></tr>`).join('')}
    </tbody></table>
    ${live ? `<div class="sub" style="margin-top:10px">This round: ${live.c.map(x => `${esc(x.t1)} ${f2(x.pcf)}`).join(' · ') || 'not ranked (data problem)'}.</div>` : ''}
    <div class="sub" style="margin-top:8px">${part.flag ? 'Earlier rounds are illustrative; this round is analysed.' : `Illustrative history: this part is not in the ${ROUND.comparisons.length} comparisons analysed this round.`}</div>`;
}

// The parts catalogue for the Parts Center: each model's named parts plus a generated long tail. [Assumption] Long-tail rows are samples.
const FAMILY = {
  al: ['Steering knuckle', 'Lower control arm', 'Shock tower', 'Cross-car beam', 'Bonnet inner', 'Door frame', 'Heat shield', 'Wheel hub carrier', 'Caliper bracket', 'Subframe node'],
  steel: ['B-pillar reinforcement', 'Sill reinforcement', 'Seat rail', 'Door hinge', 'Coil spring', 'Rear bumper beam', 'Floor cross member', 'Exhaust hanger'],
  poly: ['Door trim panel', 'Instrument panel carrier', 'Wheel arch liner', 'Headlamp housing', 'Air intake duct', 'Centre console', 'Grille insert', 'Fuel filler housing'],
  elec: ['Body control module', 'Front camera module', 'Corner radar', 'Battery management unit', 'LED lamp driver', 'Seat motor', 'Charging inlet'],
  glass: ['Side door glass', 'Rear screen', 'Door seal', 'Roof seal', 'Floor carpet', 'Acoustic insulation']
};
const SIDE = ['front left', 'front right', 'rear left', 'rear right', 'front', 'rear', ''];
export function catalogue() {
  const out = [];
  for (const m of MODELS) {
    const named = partsOf(m), rnd = seeded('cat:' + m.k), used = new Set(named.map(p => p.name));
    named.forEach(p => out.push({...p, id: `${m.k.toUpperCase()}-${p.k.toUpperCase()}`, model: m, sample: !p.flag}));
    for (const [mat, fam] of Object.entries(FAMILY)) for (const base of fam) {
      if (rnd() < .25) continue;
      const sd = SIDE[Math.floor(rnd() * SIDE.length)], name = sd ? `${base}, ${sd}` : base; if (used.has(name)) continue; used.add(name);
      const k = (base.split(' ').map(w => w[0]).join('') + (sd ? sd.split(' ').map(w => w[0]).join('') : '')).toLowerCase() + out.length;
      out.push({k, name, mat, model: m, id: `${m.k.toUpperCase()}-${String(out.length).padStart(4, '0')}`, sample: true});
    }
  }
  return out;
}
