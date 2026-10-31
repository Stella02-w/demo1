// Network intelligence: what each relationship is (material, volume, evidence, status) and what the network as a whole shows.
// Line style carries only the relationship status; node colour carries only the current analysis focus.
import {LINKS, claimState} from './v2.js';
import {PCF_RECORDS} from './data.js';
import {CPARTS, graph, claimOf} from './chain.js';
import {link, linkOn} from './links.js';

// [Assumption] Roles and materials are demo values; production reads them from contracts, BOMs and supplier declarations.
export const ORG = {
  EU_mix: ['EU consumption mix', 'Market average, not a single facility', 'Primary aluminium'],
  Smelter_EU: ['Smelter EU', 'Primary aluminium smelter, EU', 'Primary aluminium ingot'],
  Smelter_IMP: ['Smelter Import', 'Primary aluminium smelter, outside EU', 'Primary aluminium ingot'],
  Smelter_X: ['Smelter X', 'Primary aluminium smelter, site not yet verified', 'Primary aluminium ingot'],
  Supplier_A: ['Supplier A', 'Aluminium processor · billet', '6082 forging billet'],
  Supplier_B: ['Supplier B', 'Aluminium processor · billet', '6082 forging billet'],
  Supplier_C: ['Supplier C', 'Aluminium processor · billet and casting alloy', '6082 billet and A356 ingot'],
  Supplier_E: ['Supplier E', 'Aluminium processor · billet', '6082 forging billet'],
  Supplier_F: ['Supplier F', 'Aluminium processor · casting alloy', 'A356 casting alloy'],
  Supplier_H: ['Supplier H', 'Aluminium processor · casting alloy', 'A356 casting alloy'],
  Supplier_I: ['Supplier I', 'Aluminium processor · casting alloy', 'A356 casting alloy'],
  Supplier_J: ['Supplier J', 'Aluminium processor · SME', '6082 forging billet'],
  Supplier_K: ['Supplier K', 'Aluminium processor · billet and casting alloy', '6082 billet and A356 ingot'],
  Supplier_L: ['Supplier L', 'Aluminium processor · casting alloy', 'A356 casting alloy'],
  Tier1_A: ['Tier 1 A', 'Part maker · forging', 'Forged bracket'], Tier1_B: ['Tier 1 B', 'Part maker · forging', 'Forged bracket'],
  Tier1_C: ['Tier 1 C', 'Part maker · forging', 'Forged bracket'], Tier1_D: ['Tier 1 D', 'Part maker · casting', 'Cast rear cover'],
  Tier1_E: ['Tier 1 E', 'Part maker · casting', 'Cast rear cover'],
  'part:bracket': ['Front suspension bracket', 'JLR part · 8 kg aluminium', ''], 'part:cover': ['Rear cover', 'JLR part · 6 kg aluminium', '']
};
export const nm = id => ORG[id]?.[0] || id;
export const tierOf = id => id.startsWith('part:') ? 'Part' : id.startsWith('Tier1_') ? 'Tier 1' : id.startsWith('Supplier') ? 'Tier 2' : 'Tier 3';
const T2_ORDER = ['Supplier_E', 'Supplier_C', 'Supplier_A', 'Supplier_B', 'Supplier_K', 'Supplier_J', 'Supplier_H', 'Supplier_I', 'Supplier_F'];
const REC = s => PCF_RECORDS.find(r => r.supplier === s);
const xVerified = () => claimState('CL-X-PCF').basis === 'verified';

// The network in scope: known edges plus the AI layer, each edge with its relationship status.
export function net(part) {
  const {edges} = graph(part || null), E = edges.map(e => ({...e, st: edgeStatus(e.a, e.b)}));
  // Supplier L: a known Tier 2 with contracts to Tier 1 D and E; its source is unknown until the AI suggests Smelter X
  if (E.some(e => e.b === 'Tier1_E')) { const l = link().status;
    E.push({a: 'Supplier_L', b: 'Tier1_D', w: 1.2, st: 'confirmed'}, {a: 'Supplier_L', b: 'Tier1_E', w: 1.8, st: 'confirmed'});
    if (linkOn() || l === 'confirmed') E.push({a: 'Smelter_X', b: 'Supplier_L', w: 3, st: l === 'confirmed' ? 'confirmed' : 'ai'}); }
  // Tier 2s with no named source get a dotted stub: the source is unknown
  const nodes = new Set(E.flatMap(e => [e.a, e.b]));
  for (const s of [...nodes].filter(n => n.startsWith('Supplier') && !E.some(e => e.b === n))) E.push({a: null, b: s, w: 1, st: 'unknown'});
  return {edges: E, nodes: [...nodes]};
}
export function edgeStatus(a, b) {
  if (a === 'Smelter_X' && b === 'Supplier_L') return link().status === 'confirmed' ? 'confirmed' : 'ai';
  if (a === 'Smelter_X') return b === 'Supplier_B' && xVerified() ? 'confirmed' : 'declared';
  if (a && !a.startsWith('Supplier') && !a.startsWith('Tier1')) { const l = LINKS.find(x => x.from_id === a && x.to_id === b); return !l || l.origin_verified ? 'confirmed' : 'declared'; }
  return 'confirmed';
}
export const ST = {confirmed: ['Confirmed', 'Backed by verified evidence or a signed contract'], declared: ['Declared', 'Named in a supplier declaration, not yet checked'],
  ai: ['AI candidate', 'No document states it; the model found the pattern'], unknown: ['Unknown source', 'No source named in any record']};

// What one relationship is: material, volume, evidence and the next step.
export function relation(a, b, w) {
  const st = edgeStatus(a, b), parts = CPARTS.filter(p => Object.entries(p.quotes).some(([t1, src]) => t1 === b || src.some(s => s[0] === b) || 'part:' + p.k === b));
  const vol = w ? `${w.toFixed(1)} kg aluminium per vehicle` : '—';
  if (b.startsWith('part:')) { const p = CPARTS.find(x => 'part:' + x.k === b);
    return {st, kind: 'Supplies the part to JLR', mat: ORG[a][2], vol, ev: [['JLR sourcing quote · Q4-26', `${nm(a)} quotes ${p.name}`]], next: null}; }
  if (b.startsWith('Tier1_')) { const p = CPARTS.find(x => x.quotes[b]), sh = p?.quotes[b]?.find(s => s[0] === a)?.[1];
    return {st, kind: 'Sells material to the part maker', mat: ORG[a][2], vol, share: sh ? `${Math.round(sh * 100)}% of ${nm(b)}'s aluminium for the ${p.name.toLowerCase()}` : 'Supply contract, rear cover',
      ev: [[a === 'Supplier_L' ? `${b}_BOM_rear-cover.xlsx · line ${b === 'Tier1_E' ? 14 : 9}` : `${nm(b)} quote breakdown · Q4-26`, 'Supplier and share stated under contract']], next: null}; }
  const r = REC(b), x = a === 'Smelter_X';
  const ev = x ? (b === 'Supplier_B' && xVerified() ? [['Smelter X verification statement · 2025', 'Names Supplier B as customer']] : [[`${nm(b)} PCF declaration · ${r?.reference_year || 2024}`, 'Names the smelter, no document proves it'], ['Customs data', 'Not checked']])
    : r ? [[`${nm(b)} PCF record · ${r.reference_year}`, `${r.verified ? 'Verified statement' : 'Self-declared'} · data quality ${r.dqr}/5`]] : [['Supplier register', 'Source recorded at onboarding']];
  return {st, kind: 'Supplies primary ingot to the processor', mat: 'Primary aluminium ingot', vol, ev,
    next: st === 'declared' ? (x ? ['Verify the origin through the Smelter X statement request', 'review.html#CL-X-PCF'] : ['Ask for a delivery note', null]) : null, parts: parts.map(p => p.name)};
}

// Who a node connects to and what it touches.
export function profile(id, part) {
  const {edges} = net(part), up = edges.filter(e => e.b === id && e.a), down = edges.filter(e => e.a === id);
  const walk = (start, dir) => { const out = new Set(), q = [start]; while (q.length) { const n = q.pop(); for (const e of edges) { const [f, t] = dir > 0 ? [e.a, e.b] : [e.b, e.a]; if (f === n && t && !out.has(t)) { out.add(t); q.push(t); } } } return out; };
  const dn = walk(id, 1), un = walk(id, -1), parts = [...dn, id].filter(n => n.startsWith('part:')).map(nm);
  const smelters = [...un].filter(n => tierOf(n) === 'Tier 3');
  const shared = tierOf(id) === 'Tier 3' ? down.map(e => e.b) : tierOf(id) === 'Tier 2' ? edges.filter(e => smelters.includes(e.a) && e.b !== id).map(e => e.b) : [];
  const cid = claimOf(id), r = REC(id), gaps = [...up, ...down].filter(e => e.st !== 'confirmed');
  const ev = [];
  if (r) ev.push([`PCF record · ${r.reference_year}`, `${r.verified ? 'Verified statement' : 'Self-declared'} · data quality ${r.dqr}/5`]);
  if (id === 'Smelter_X') ev.push(xVerified() ? ['Verification statement · 2025', '10.1 kgCO₂e/kg, verified'] : ['No statement yet', 'Requested through Tier 1 B']);
  if (id.startsWith('Tier1_')) ev.push(['Quote breakdown · Q4-26', 'Supplier shares stated under contract']);
  return {id, org: ORG[id] || [nm(id), '', ''], tier: tierOf(id), up, down, parts, shared: [...new Set(shared)], cid, gaps, ev};
}

// The three insights, computed from the network in scope.
// Counted over the whole aluminium round, so a one-part view still shows what the part shares with the rest.
export function insights(part) {
  const {edges} = net(null), xs = edges.filter(e => e.a === 'Smelter_X'), t2 = xs.map(e => e.b);
  const t1 = [...new Set(edges.filter(e => t2.includes(e.a)).map(e => e.b))];
  const parts = [...new Set(edges.filter(e => t1.includes(e.a)).map(e => nm(e.b)))];
  const gaps = edges.filter(e => e.st !== 'confirmed'), cross = ['Supplier_C', 'Supplier_K'].filter(s => edges.filter(e => e.a === s).length > 1);
  const bOpen = xs.some(e => e.b === 'Supplier_B' && e.st !== 'confirmed');
  const list = (a) => a.map(nm).join(', ').replace(/, ([^,]*)$/, ' and $1');
  if (!xs.length) return {gaps, list: []};
  return {gaps, xs, t1, parts, list: [
    {k: 'shared', n: '01', tag: 'Shared upstream dependency', h: `Smelter X sits behind ${t2.length} Tier 2 paths`,
      p: `${list(t2)} name Smelter X as their source. Together they reach ${list(t1)} and the ${list(parts).toLowerCase()}.${cross.length ? ` ${list(cross)} also serve both parts.` : ''}`,
      why: 'One source behind several quotes: one shared risk, one set of repeated data requests, and one place where joint decarbonisation could start.',
      act: ['Show these paths', 'focus:shared']},
    {k: 'gaps', n: '02', tag: 'Relationship gap', h: `${gaps.length} link${gaps.length === 1 ? '' : 's'} need confirmation`,
      p: bOpen ? 'Smelter X → Supplier B could change the bracket decision. Its origin rests on a 2022 self-declaration.' : `${list(gaps.map(e => e.b))} rest on declarations${gaps.some(e => e.st === 'ai') ? ' or an AI candidate' : ''} only.`,
      why: 'Confirm the links that change a decision first. The rest can wait for the next round.',
      act: ['Show gaps', 'focus:gaps']},
    {k: 'collab', n: '03', tag: 'Collaboration signal', h: `${t2.length} suppliers share one source and one open question`,
      p: `Each Tier 1 team asks its own supplier about Smelter X today. One coordinated request could replace ${t2.length}.`,
      why: 'The same suppliers share material and an upstream barrier. That is where a joint programme is worth exploring.',
      act: ['Explore collaboration', `collaborate.html?focus=Smelter_X${part ? '&part=' + part : ''}`]},
    (() => { const eu = edges.filter(e => e.a === 'Smelter_EU'), et1 = [...new Set(edges.filter(e => eu.some(x => x.b === e.a)).map(e => e.b))], all = eu.every(e => e.st === 'confirmed');
      return {k: 'eu', n: '04', tag: 'Ready to collaborate', h: `Smelter EU sits behind ${eu.length} ${all ? 'confirmed ' : ''}paths`,
        p: `${list(eu.map(e => e.b))} buy from Smelter EU and reach ${list(et1)}. ${all ? 'Every link is confirmed and the smelter value is verified.' : ''}`,
        why: 'No confirmation work is needed first. The open question is what these processors could change together, such as recycled content.',
        act: ['Explore collaboration', `collaborate.html?focus=Smelter_EU${part ? '&part=' + part : ''}`]}; })()
  ]};
}
export {T2_ORDER};
