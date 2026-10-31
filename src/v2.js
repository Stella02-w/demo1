// Main demo case on the v2 rules: one bracket round, the claims the backend screened, and the human steps that follow.
// The rules output comes from v2data.js; this file only adds the demo flow (decisions, REQ-1, resolution) and recomputes PCF.
// PCF model (same as screening.py): supplier = (1 - r) * smelter primary + r * 0.26; candidate = sum(share * supplier).
import {V2} from './v2data.js';

export const A = V2.analysis;
export const R = A.round;
export const NOTE = V2.note;
export const CLAIMS = Object.fromEntries(A.claims.map(c => [c.claim_id, c]));
export const NODES = Object.fromEntries(V2.nodes.map(n => [n.id, n]));
export const LINKS = V2.links;
export const RECYCLED_PCF = 0.26; // [Assumption] recycled aluminium factor, source still to confirm
export const COST_REVIEW_GBP = 2000; // [Assumption] internal cost review line

// [Assumption] from seed.py: who sources from whom, and each supplier's metal.
export const SOURCES = {
  Bracket_T1A: [['Supplier_C', 0.5], ['Supplier_E', 0.5]],
  Bracket_T1B: [['Supplier_B', 0.7], ['Supplier_A', 0.3]],
  Bracket_T1C: [['Supplier_K', 0.6], ['Supplier_J', 0.4]]
};
const METAL = {
  Supplier_A: {smelter: 'CL-IMP-PCF', rec: 'CL-A-REC'}, Supplier_B: {smelter: 'CL-X-PCF', rec: 'CL-B-REC'},
  Supplier_C: {smelter: 'CL-EU-PCF', rec: 'CL-C-REC'}, Supplier_E: {smelter: 'CL-MIX-PCF', rec: 'CL-E-REC'},
  Supplier_K: {smelter: 'CL-EU-PCF', rec: 'CL-K-REC'}, Supplier_J: {product: 'CL-J-PCF'}
};
// [Assumption] from seed.py: placeholder costs and lead times, to be replaced with verifier quotes.
export const OPTIONS = {
  'CL-B-REC': {method: 'Third-party verification', cost: 5000, days: 45},
  'CL-X-PCF': {method: 'Request existing statement', cost: 300, days: 20},
  'CL-K-REC': {method: 'Request existing certificate', cost: 200, days: 10},
  'CL-J-PCF': {method: 'Measurement support', cost: null, days: null},
  'CL-C-REC': {method: 'Link certificate on file', cost: 0, days: 5}
};
export const REUSE = {'CL-C-REC': 'EV-C-RCC'};

export const name = id => NODES[id]?.name || id.replace(/_/g, ' ');
export const cand = id => `Tier 1 ${id.slice(-1)}`;
export const KIND = {recycled_share: 'Recycled share', primary_pcf: 'Primary aluminium PCF', product_pcf: 'Product PCF'};
export const fmtVal = c => (c.unit === 'share' ? `${Math.round(c.reported * 100)}%` : `${c.reported} kgCO₂e/kg`);
export const SENS = {material: ['Could change decision', 't-rev'], not_material: ['No effect', 't-mut'], indeterminate: ["Can't test yet", 't-info'], verified: ['Verified', 't-ok']};
export const REC = {
  manual_value_review: ['Needs a judgement call', 't-rev'], verification_candidate: ['Worth verifying', 't-info'],
  reuse_available: ['Evidence on file', 't-ok'], mandatory_verification: ['Required by contract', 't-pause'],
  clarification_first: ['Help supplier measure', 't-info'], no_action: ['Verified', 't-mut']
};
export const OPEN_CLAIMS = A.claims.filter(c => c.recommendation !== 'no_action').map(c => c.claim_id);
// the order the demo walks: the two material claims first
OPEN_CLAIMS.sort((a, b) => ['CL-X-PCF', 'CL-B-REC', 'CL-K-REC', 'CL-C-REC', 'CL-J-PCF'].indexOf(a) - ['CL-X-PCF', 'CL-B-REC', 'CL-K-REC', 'CL-C-REC', 'CL-J-PCF'].indexOf(b));

// The conservative value a claim falls back to when it is not evidenced (the source-supported scenario).
export const fallback = id => CLAIMS[id].tested.find(t => t.basis === 'source_supported');

// What a person can decide at step 3, by recommendation. `to` is where the claim goes on the Decision board.
export const CHOICES = {
  manual_value_review: [
    {k: 'scenario', label: 'Assess this round on the scenario value (0%) and request evidence for the next round', value: 'fallback'},
    {k: 'verify', label: 'Accept the cost and delay: commission third-party verification', value: 'fallback'},
    {k: 'reported', label: 'Proceed on the reported value, with a written reason and an approver', value: 'reported', reason: true}
  ],
  verification_candidate: [
    {k: 'request', label: 'Request the existing verification statement (£300, about 20 days)', value: 'fallback', next: 4},
    {k: 'scenario', label: 'Do not ask: assess on the conservative scenario value', value: 'fallback'}
  ],
  reuse_available: [{k: 'reuse', label: 'Link certificate EV-C-RCC (verified, on file) to this claim', value: 'verified'}],
  mandatory_verification: [{k: 'mandatory', label: 'Send the request the contract requires (certificate, about 10 days)', value: 'fallback'}],
  clarification_first: [{k: 'template', label: 'Send the measurement template and offer measurement support', value: 'reported'}]
};

// ---------- demo flow state (localStorage, shared by every page) ----------
const KEY = 'carbontrace.v2flow.1';
// [Assumption] Simulated dates for the request so the timeline reads like a real one.
export const REQ_DATES = {approved: '2026-10-30', forwarded: '2026-10-31', responded: '2026-11-12', accepted: '2026-11-14', deadline: '2026-11-19'};
const initial = () => ({decisions: {}, req: null, brief: null});
let state; const subs = new Set();
try { state = JSON.parse(localStorage.getItem(KEY)) || initial(); } catch { state = initial(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* memory only */ } };
const emit = () => subs.forEach(f => f(state));
addEventListener('storage', e => { if (e.key === KEY) { try { state = JSON.parse(e.newValue) || initial(); } catch { state = initial(); } emit(); } });
export const flow = {
  get: () => state,
  subscribe: f => (subs.add(f), () => subs.delete(f)),
  set(fn) { fn(state); save(); emit(); },
  reset() { state = initial(); save(); emit(); }
};

// A decision that departs from the agent's recommendation, or proceeds on an unverified value, waits for an approver.
export const APPROVERS = ['Head of Procurement', 'Category Manager · Castings'];
export function decide(id, choice, reason = '', approver = null) {
  const c = CHOICES[CLAIMS[id].recommendation].find(x => x.k === choice);
  flow.set(s => { s.decisions[id] = {choice, label: c.label, reason, by: 'Procurement', on: R.today, ...(approver ? {approval: {by: approver, status: 'pending'}} : {})}; });
}
export function approve(id, ok = true) { flow.set(s => { const a = s.decisions[id]?.approval; if (a) { a.status = ok ? 'approved' : 'rejected'; a.on = R.today; } if (!ok) delete s.decisions[id]; }); }
export const pendingApprovals = () => Object.entries(flow.get().decisions).filter(([, d]) => d.approval?.status === 'pending').map(([id]) => id);
const ev = (s, on, text) => s.req.events.push({on, text});
export const reqActions = {
  draft() { flow.set(s => { s.req = {id: 'REQ-1', claim: 'CL-X-PCF', to: 'Supplier_B', via: 'Tier1_B', deadline: REQ_DATES.deadline, status: 'draft', route: null, events: [{on: R.today, text: 'Draft generated · leak check passed'}]}; }); },
  approve() { flow.set(s => { s.req.status = 'forwarded'; ev(s, REQ_DATES.approved, `Approved by procurement · due ${REQ_DATES.deadline}`); ev(s, REQ_DATES.forwarded, 'Tier1_B forwarded it (read-only)'); }); },
  respond(route, sub) { flow.set(s => { s.req.status = route === 'A' ? 'responded' : 'support'; s.req.route = route; s.req.submission = sub;
    ev(s, REQ_DATES.responded, {A: 'Supplier B chose A: submitted existing evidence', B: 'Supplier B asked for verification support', C: 'Supplier B asked for measurement help', D: 'Supplier B cannot provide it yet'}[route]); }); },
  accept() { flow.set(s => { s.req.status = 'accepted'; ev(s, REQ_DATES.accepted, 'Analyst accepted · evidence on file for reuse'); }); },
  remind() { flow.set(s => { s.req.reminded = (s.req.reminded || 0) + 1; ev(s, R.today, 'Reminder sent to Supplier B via Tier1_B'); }); },
  fee(ok) { flow.set(s => { s.req.fee = ok ? 'approved' : 'declined'; ev(s, R.today, ok ? 'Fee share approved: 50%, capped at £2,500' : 'Fee share declined'); }); },
  more() { flow.set(s => { s.req.status = 'forwarded'; s.req.route = null; s.req.submission = null; ev(s, REQ_DATES.accepted, 'Analyst asked for a corrected statement'); }); }
};
// [Assumption] The evidence Supplier B uploads in the demo: a verification statement for Smelter X, reported value confirmed.
export const SIM_EVIDENCE = {file: 'smelterX_verification_2025.pdf', type: 'Verification statement', period: '2025', unit: 'kgCO₂e/kg primary aluminium', boundary: 'cradle-to-gate', product: 'Aluminium ingot → Tier1_B', value: 10.1, smelter: 'Smelter X', issuer: 'Accredited verifier · ISO 14065', standard: 'ISO 14067', issued: '2026-03-18', pages: 4, ref: 'VS-2025-0412'}
export const REUSE_UNTIL = '2029-11-14';
// Reminder policy for open requests: automatic, then escalation through the Tier 1 contact.
export const REMINDERS = [[7, 'Automatic reminder'], [2, 'Second reminder'], [0, 'Escalate to Tier 1 contact']];
// [Assumption] Track record from earlier rounds, to show how evidence and rewards build up over time.
export const HISTORY = {
  Supplier_B: [['Q2-26', 'Recycled share', 'Responded late · self-declaration only', 'rev'], ['Q4-25', 'Product PCF', 'No response', 'pause']],
  Smelter_X: [['Q2-26', 'Primary PCF', 'Not requested', 'mut']],
  Supplier_C: [['Q2-26', 'Recycled share', 'Verified · EV-C-RCC on file to 2029-04', 'ok'], ['Q4-25', 'Product PCF', 'Verified on time', 'ok']],
  Supplier_K: [['Q2-26', 'Recycled share', 'Certificate on time', 'ok']],
  Supplier_J: [['Q2-26', 'Product PCF', 'Asked for measurement help', 'info']],
  Supplier_A: [['Q2-26', 'Recycled share', 'Verified on time', 'ok']],
  Supplier_E: [['Q2-26', 'Recycled share', 'Verified on time', 'ok']]
};
// One evidence item for other pages (registry, dashboard), derived from the live request.
export function reqEvidence() {
  const r = flow.get().req; if (!r || r.status === 'draft') return null;
  const st = r.status === 'accepted' ? 'verified' : r.status === 'responded' ? 'review' : r.status === 'support' ? 'support' : 'awaiting';
  return {id: 'EV-X-001', req: r.id, supplier: 'Supplier B', smelter: 'Smelter X', status: st, due: r.deadline, received: ['responded', 'accepted'].includes(r.status) ? REQ_DATES.responded : null,
    accepted: r.status === 'accepted' ? REQ_DATES.accepted : null, sent: REQ_DATES.approved, value: SIM_EVIDENCE.value, file: SIM_EVIDENCE.file, limits: r.submission?.limits || '', fee: r.fee || null, route: r.route};
}

// ---------- claim state and PCF ----------
// Where each open claim stands now. col = Decision board column.
export function claimState(id, s = state) {
  const c = CLAIMS[id], d = s.decisions[id];
  if (c.recommendation === 'no_action') return {col: 'ready', basis: 'verified', text: c.carbon_performance};
  if (id === 'CL-X-PCF' && s.req && d?.choice === 'request') {
    const st = s.req.status;
    if (st === 'accepted') return {col: 'ready', basis: 'verified', text: 'Verified 10.1 · on file for reuse'};
    if (st === 'responded') return {col: 'review', basis: 'fallback', text: 'Evidence arrived · analyst to review'};
    if (st === 'draft') return {col: 'action', basis: 'fallback', text: 'REQ-1 draft · approve to send'};
    if (st === 'support') return {col: 'waiting', basis: 'fallback', text: 'Supplier asked for support'};
    return {col: 'waiting', basis: 'fallback', text: `REQ-1 sent via Supplier B · due ${s.req.deadline}`};
  }
  if (!d) return {col: c.recommendation === 'mandatory_verification' ? 'action' : 'review', basis: 'fallback', text: REC[c.recommendation][0]};
  if (d.approval?.status === 'pending') return {col: 'review', basis: 'fallback', text: `Waiting for approval · ${d.approval.by}`};
  const ch = CHOICES[c.recommendation].find(x => x.k === d.choice);
  const text = {scenario: 'This round on scenario value · request next round', verify: 'Third-party verification commissioned', reported: 'Proceeding on reported value · approved',
    request: 'Request to prepare', reuse: 'EV-C-RCC linked', mandatory: 'Required request sent', template: 'Measurement template sent'}[d.choice];
  // a recorded (and, where needed, approved) choice that settles this round's value is decided; the rest wait on a supplier or verifier
  const col = ['reuse', 'scenario', 'reported'].includes(d.choice) ? 'ready' : d.choice === 'request' ? 'action' : 'waiting';
  return {col, basis: ch.value, text};
}
// value used for a claim in a given mode: 'reported' | 'assessed' | an override map {id: value}
function claimValue(id, mode, over) {
  const c = CLAIMS[id];
  if (over && id in over) return over[id];
  if (mode === 'reported' || c.recommendation === 'no_action') return c.reported;
  const st = claimState(id);
  if (st.basis === 'verified') return id === 'CL-X-PCF' ? SIM_EVIDENCE.value : c.reported;
  if (st.basis === 'reported') return c.reported;
  return fallback(id)?.value ?? c.reported; // J has no supported scenario: kept at reported, flagged
}
export function supplierPcf(sup, mode = 'assessed', over) {
  const m = METAL[sup];
  if (m.product) return claimValue(m.product, mode, over);
  const r = claimValue(m.rec, mode, over), p = claimValue(m.smelter, mode, over);
  return (1 - r) * p + r * RECYCLED_PCF;
}
export const candPcf = (cid, mode = 'assessed', over) => SOURCES[cid].reduce((a, [s, w]) => a + w * supplierPcf(s, mode, over), 0);
export const CANDS = A.candidates.map(c => c.id);
// unverified claims each candidate still rests on, given the current state
export const restsOn = cid => A.candidates.find(c => c.id === cid).rests_on_unverified.filter(id => claimState(id).basis !== 'verified');
export const r2 = v => (Math.round(v * 100) / 100).toFixed(2);
export const daysLeft = (from, to) => Math.round((new Date(to) - new Date(from)) / 864e5);

// Agent recommendation within the options the rules allow. Pre-generated snapshot, not a live call.
export const AGENT_REC = {
  'CL-B-REC': {k: 'scenario', t: 'Assess at 0% this round, request evidence for next round', s: 'The 75% claim decides Tier 1 B, but it cannot be verified before the deadline at a reasonable cost.', why: [
    ['Carbon', 'Tier 1 B meets target only if 75% holds. At 0% it is 9.87 and Tier 1 A becomes lowest.'],
    ['Time', 'Verification takes about 45 days. 30 are left.'],
    ['Cost', '£5,000, above the £2,000 review line, for a claim this round cannot resolve.']],
    change: 'A verifier can report within 30 days.'},
  'CL-X-PCF': {k: 'request', t: 'Request the Smelter X verification statement', s: 'Cheap, fast enough, and it decides whether Tier 1 B meets target.', why: [
    ['Carbon', 'At 13.2 kgCO₂e/kg, Tier 1 B is 5.24 and misses the 5.0 target.'],
    ['Time', 'About 20 days. Fits before the deadline.'],
    ['Cost', '£300. One statement also covers Supplier H and I.']],
    change: 'Supplier B cannot name its smelter.'},
  'CL-K-REC': {k: 'mandatory', t: 'Send the contract-required certificate request', s: 'Not decision-changing, but the contract requires it.', why: [
    ['Carbon', 'Does not change any judgement. Tier 1 C misses either way.'],
    ['Time', 'About 10 days.'],
    ['Cost', '£200. Required by contract.']]},
  'CL-C-REC': {k: 'reuse', t: 'Link certificate EV-C-RCC', s: 'Verified evidence is already on file. No new request needed.', why: [
    ['Carbon', 'Does not change the judgement.'],
    ['Time', 'Immediate. EV-C-RCC is verified and on file.'],
    ['Cost', 'No cost.']]},
  'CL-J-PCF': {k: 'template', t: 'Send the measurement template', s: 'Impact cannot be tested yet. Help Supplier J measure first.', why: [
    ['Carbon', 'No sourced scenario value, so impact is unknown.'],
    ['Time', 'J is an SME with no method of its own. Measurement comes first.'],
    ['Cost', 'Cheapest next step.']]}
};
export const ROUND_PLAN = [
  {id: 'CL-X-PCF', t: 'Request Smelter X statement', m: '£300 · 20 d · covers B, H, I', cost: 300},
  {id: 'CL-C-REC', t: 'Link EV-C-RCC to Supplier C', m: 'No cost', cost: 0},
  {id: 'CL-K-REC', t: 'Contract request to Supplier K', m: '£200 · 10 d', cost: 200},
  {id: 'CL-B-REC', t: 'Assess Supplier B at 0%, request for next round', m: 'No cost this round', cost: 0},
  {id: 'CL-J-PCF', t: 'Send measurement template to Supplier J', m: 'No cost', cost: 0}
];
