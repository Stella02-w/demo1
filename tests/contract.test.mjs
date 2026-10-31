// Contract test: real outputs of view(), inbox() and overview() against store.CONTRACT, over states from every journey.
// A backend or rule change that renames a field, adds a stage or status, or changes a unit must bump CONTRACT.version
// and update the pages. Run: node tests/contract.test.mjs
import assert from 'node:assert/strict';
import {reduce, initialState, view, inbox, overview, CONTRACT} from '../src/store.js';
import {DEMO_OUTCOMES, ROUND, demoStatement} from '../src/data.js';
import {nodeImpact, sharedVsSeparate} from '../src/network.js';
import {compare} from '../src/cost.js';
import {benchmarkSensitivity} from '../src/benchmark.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const buyer = {role: 'buyer', org: 'JLR'}, sb = {role: 'supplier', org: 'Supplier_B'};
// scripted evidence carries the demo's complete statement (data.js demoStatement) unless a test submits it raw
const withDemo = (s, a) => a.type !== 'submit_evidence' || a.raw || a.per_kg_value != null ? a
  : {...a, statement: {...demoStatement(a.actor.org, Object.keys(a.values || {}), a.verified_on || s.today), ...a.statement}};
const run = (s, ...a) => a.reduce((st, x) => reduce(st, withDemo(st, x)), s);

// a spread of states: opening, drafts, out, verified, late before nomination, nominated, alternative, data fix
function states() {
  const out = [initialState()];
  let s = run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'request'}, {type: 'choose_action', actor: buyer, comparison: 'housing', action: 'data_fix'});
  out.push(s);
  const id = s.requests[0].id;
  s = run(s, {type: 'approve_request', actor: buyer, id}, {type: 'forward', actor: {role: 'tier1', org: 'Tier1_B'}, id}, {type: 'choose_option', actor: sb, id, option: 'B'});
  out.push(s);
  out.push(run(s, {type: 'advance_clock', to: '2026-11-20'}, {type: 'submit_evidence', actor: sb, id, values: DEMO_OUTCOMES.lower, verified_by: 'third_party_verification', assurance_level: 'limited'}));
  out.push(run(s, {type: 'advance_clock', to: '2026-12-01'}, {type: 'submit_evidence', actor: sb, id, values: DEMO_OUTCOMES.lower, verified_by: 'third_party_verification', assurance_level: 'limited'}));
  out.push(run(s, {type: 'advance_clock', to: '2026-12-15'}, {type: 'nominate', actor: {role: 'committee', org: 'JLR'}, comparison: 'bracket', part: 'Bracket_T1A'}));
  const alt = view(initialState(), 'cover').alternatives[0];
  out.push(run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'cover', action: 'alternative', alternative: alt.id}));
  return out;
}
const keys = (o, want, where) => assert.deepEqual(Object.keys(o).sort(), [...want].sort(), where);

test('view() fields, enums and units', () => {
  for (const s of states()) for (const k of ['bracket', 'cover', 'housing']) {
    const v = view(s, k);
    keys(v, CONTRACT.view, `view ${k}`);
    assert.ok(CONTRACT.stages.includes(v.stage), v.stage);
    for (const b of Object.values(v.basis)) { assert.equal(typeof b.pcf, 'number'); assert.ok(CONTRACT.basis_sources.includes(b.source), b.source); }
    for (const r of v.requests) { assert.ok(CONTRACT.statuses.includes(r.status), r.status); assert.ok(CONTRACT.windows.includes(r.window ?? null)); }
    for (const r of v.requests.filter(r => r.assessment)) for (const t of r.assessment.treatment) assert.ok(CONTRACT.correction_protection.includes(t.correction_protection));
  }
});

test('inbox() fields per role', () => {
  for (const s of states()) {
    for (const r of inbox(s, 'tier1', 'Tier1_B')) keys(r, CONTRACT.inbox_tier1, 'tier1');
    for (const r of inbox(s, 'supplier', 'Supplier_B')) keys(r, CONTRACT.inbox_supplier, 'supplier');
  }
});

test('overview() fields and every to-do owner is a known role', () => {
  for (const s of states()) {
    const o = overview(s);
    keys(o, CONTRACT.overview, 'overview');
    for (const c of o.comparisons) for (const w of c.waiting_on) assert.ok(CONTRACT.roles.includes(w.role), w.role);
    for (const st of Object.keys(o.stage_counts)) assert.ok(CONTRACT.stages.includes(st));
  }
});

test('round 7 analysis fields and benchmark What-if (v3)', () => {
  for (const n of ['Unknown_B', 'Unknown_D', 'Supplier_K']) {
    const r = nodeImpact(n); keys(r, CONTRACT.node_impact, n);
    for (const c of r.comparisons) keys(c, CONTRACT.impact_comparison, `${n} ${c.key}`);
  }
  const svs = sharedVsSeparate('Unknown_B', ROUND.sourcing_date, ROUND.opened_on);
  keys(svs, CONTRACT.shared_vs_separate, 'shared_vs_separate'); keys(svs.routes, CONTRACT.routes, 'routes');
  for (const m of ['cap', 'budget']) keys(compare(m), CONTRACT.cost_compare, m);
  const b = benchmarkSensitivity(); keys(b, CONTRACT.benchmark_sensitivity, 'benchmark'); keys(b.scenarios, CONTRACT.benchmark_scenarios, 'scenarios');
  for (const s of states()) for (const k of ['bracket', 'cover', 'housing']) for (const sc of CONTRACT.benchmark_scenarios) {
    const v = view(s, k, {benchmark: sc}), d = view(s, k);
    assert.equal(v.benchmark.scenario, sc); assert.match(v.benchmark.note, /not publicly specified/);
    for (const p of Object.keys(v.current)) assert.equal(v.current[p].pcf, d.current[p].pcf, 'benchmark never changes pcf');
    for (const r of v.requests) for (const c of r.letter.claims) if (r.kind === 'evidence') assert.ok(CONTRACT.claims.includes(c.claim), c.claim);
  }
});

console.log(`\n${n} tests passed (contract v${CONTRACT.version})`);
