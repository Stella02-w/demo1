// Supplier roster for the Supplier Center: the twin's named organisations (real demo values) plus an illustrative
// long tail so the list behaves like a real supply base of several hundred. Illustrative rows are marked `sample`.
import {PCF_RECORDS, PARTS, SMELTERS, DISPLAY} from './data.js';

export const MATERIALS = [
  {k: 'al', name: 'Aluminium', share: .34, t3: 'Smelter', words: ['Castings', 'Extrusions', 'Alloys', 'Die Cast', 'Metals']},
  {k: 'steel', name: 'Steel', share: .24, t3: 'Mill', words: ['Stampings', 'Steel', 'Forge', 'Pressings', 'Tube']},
  {k: 'poly', name: 'Polymers', share: .18, t3: 'Resin plant', words: ['Polymers', 'Moulding', 'Plastics', 'Compounds', 'Resins']},
  {k: 'elec', name: 'Electronics', share: .13, t3: 'Fab', words: ['Electronics', 'Circuits', 'Harness', 'Sensors', 'Semis']},
  {k: 'glass', name: 'Glass and other', share: .11, t3: 'Plant', words: ['Glass', 'Glazing', 'Seals', 'Rubber', 'Textiles']}
];
export const REGIONS = ['UK', 'Germany', 'Spain', 'Poland', 'Czechia', 'Slovakia', 'Turkey', 'Morocco', 'China', 'India', 'Mexico', 'USA', 'Japan', 'Korea'];

const A = ['Nor', 'Vel', 'Kas', 'Bram', 'Ost', 'Lum', 'Tor', 'Cal', 'Ard', 'Mer', 'Sil', 'Fen', 'Hal', 'Rov', 'Dun', 'Ves', 'Gal', 'Kel', 'Mar', 'Tre'];
const B = ['vik', 'ton', 'dal', 'berg', 'mont', 'ford', 'ica', 'well', 'stad', 'ora'];

function build() {
  const out = [];
  // twin organisations: values come from data.js
  for (const p of PARTS) out.push({id: p.tier1, name: p.tier1, mat: 'al', tier: 1, region: '–', feeds: [p.part], data: 'declared', dqr: null, recycled: null, twin: true});
  for (const r of PCF_RECORDS) out.push({id: r.supplier, name: r.supplier, mat: 'al', tier: 2, region: '–', feeds: PARTS.filter(p => p.sources.some(s => s.supplier === r.supplier)).map(p => p.tier1),
    data: r.verified ? 'verified' : 'declared', dqr: r.dqr, recycled: r.recycled_share, smelter: DISPLAY[r.smelter] || r.smelter, year: r.reference_year, twin: true});
  for (const s of SMELTERS.filter(s => s.smelter !== 'EU_market_mix')) out.push({id: s.smelter, name: DISPLAY[s.smelter] || s.smelter, mat: 'al', tier: 3, region: '–',
    feeds: PCF_RECORDS.filter(r => r.smelter === s.smelter).map(r => r.supplier), data: s.verified ? 'verified' : 'none', dqr: null, recycled: null, twin: true});
  // [Assumption] Illustrative long tail: names, regions and statuses are generated, not real suppliers.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646), pick = a => a[Math.floor(rnd() * a.length)];
  const N = 420, used = new Set(out.map(o => o.name));
  for (const m of MATERIALS) for (let i = 0, n = Math.round(N * m.share); i < n; i++) {
    const u = rnd(), tier = u < .2 ? 1 : u < .65 ? 2 : 3;
    let name; do name = `${pick(A)}${pick(B)} ${tier === 3 ? m.t3 : pick(m.words)}`; while (used.has(name)); used.add(name);
    const d = rnd(), data = d < .26 ? 'verified' : d < .72 ? 'declared' : 'none';
    const q = rnd(), req = q < .06 ? 'forwarded' : q < .09 ? 'expired' : q < .14 ? 'verified' : null;
    out.push({id: `${m.k.toUpperCase()}-${String(out.length + 1).padStart(4, '0')}`, name, mat: m.k, tier, region: pick(REGIONS), feeds: [],
      data, dqr: data === 'none' ? null : 1 + Math.floor(rnd() * 4), recycled: ['al', 'steel'].includes(m.k) && data !== 'none' ? Math.round(rnd() * 18) / 20 : null,
      req, last: `2026-${String(4 + Math.floor(rnd() * 6)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`, sample: true});
  }
  return out;
}
export const ROSTER = build();
export const matName = k => MATERIALS.find(m => m.k === k)?.name || k;
