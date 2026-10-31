// Round 7: cost scenarios. A port of carbontrace-code/round7/cost_model.py.
// Baseline (verify every untrusted record) vs CarbonTrace (verify only decision-relevant gaps, reuse evidence, rules approve
// routine cases). A sensitivity analysis, not a measurement: every number is a relative unit and an [Assumption].
// Results are EXPECTED values. The point is to find where CarbonTrace costs MORE, not to show that it always wins.
import {buildGraph, decide} from './domain.js';
import {COMPARISONS} from './network.js';

// Relative units: 1.0 = one third-party PCF verification (fee + supplier effort). [Assumption] all defaults; calibrate in the pilot.
export const DEFAULTS = {
  N: 40,      // untrusted supplier records in one sourcing round
  d: 0.3,     // share that can change a sourcing decision
  V: 1.0,     // one verification: fee + supplier effort
  h: 0.1,     // one full human review of a verification result
  h_t: 0.02,  // per record, CarbonTrace only: agent triage + rule check (also a rule approving a routine result)
  r: 0.2,     // share of relevant gaps covered by evidence already held (PACT V3 p.71)
  a: 0.2,     // applicability check of reused evidence; same value as network.LINK_COST
  m: 0.3,     // share of CarbonTrace verifications that still need full human review
  F: 2.0,     // fixed cost per round: running the agent, maintaining rules and data
  K: 15,      // verifications that can finish before the deadline (mode "cap")
  B: 16.5     // total budget in units (mode "budget"); = what the baseline spends at K=15
};
// Not modelled, on purpose: a higher supplier response rate from matching options A-D. Leaving it out works against CarbonTrace.

const rnd = (x, n) => Number(x.toFixed(n));
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const roundItems = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rnd(v, 3)]));

// Ask every untrusted record, in no particular order, until the cap or budget runs out. Each: verification + full review.
export function baseline(p, mode = 'cap') {
  const unit = p.V + p.h, done = mode === 'cap' ? Math.min(p.N, p.K) : Math.min(p.N, p.B / unit);
  const items = {verifications: done * p.V, human_review: done * p.h};
  return {cost_items: roundItems(items), cost: rnd(sum(items), 3), requests_to_suppliers: rnd(done, 2), expected_relevant_resolved: rnd(done * p.d, 2)};
}

// Triage every record, reuse what is verified, verify the rest of the relevant gaps.
export function carbontrace(p, mode = 'cap') {
  const relevant = p.d * p.N, reused = relevant * p.r, review = p.m * p.h + (1 - p.m) * p.h_t;
  const fixed = p.F + p.N * p.h_t + reused * p.a, left = relevant - reused;
  const done = mode === 'cap' ? Math.min(left, p.K) : Math.max(0.0, Math.min(left, (p.B - fixed) / (p.V + review)));
  const items = {fixed_F: p.F, triage_all_records: p.N * p.h_t, reuse_applicability_checks: reused * p.a,
    verifications: done * p.V, full_human_review: done * p.m * p.h, rule_approval: done * (1 - p.m) * p.h_t};
  return {cost_items: roundItems(items), cost: rnd(sum(items), 3), requests_to_suppliers: rnd(done, 2), expected_relevant_resolved: rnd(reused + done, 2)};
}

export function compare(mode = 'cap', overrides = {}) {
  const p = {...DEFAULTS, ...overrides}, relevant = p.d * p.N, out = {mode, params: p};
  for (const [name, fn] of [['baseline', baseline], ['carbontrace', carbontrace]]) {
    const x = fn(p, mode);
    x.cost_per_relevant_gap = x.expected_relevant_resolved ? rnd(x.cost / x.expected_relevant_resolved, 2) : null;
    x.share_of_relevant_resolved = relevant ? rnd(x.expected_relevant_resolved / relevant, 2) : null;
    out[name] = x;
  }
  const b = out.baseline, c = out.carbontrace;
  out.carbontrace_costs_more = c.cost > b.cost;
  out.carbontrace_worse_per_gap = (c.cost_per_relevant_gap || Infinity) > (b.cost_per_relevant_gap || Infinity);
  out.carbontrace_resolves_fewer = c.expected_relevant_resolved < b.expected_relevant_resolved;
  return out;
}

// [Derived] Below this many records CarbonTrace costs more than the baseline, when neither cap nor budget binds.
export function breakEvenN(overrides = {}) {
  const p = {...DEFAULTS, ...overrides}, review = p.m * p.h + (1 - p.m) * p.h_t;
  const saving = (p.V + p.h) - p.h_t - p.d * p.r * p.a - p.d * (1 - p.r) * (p.V + review);
  return saving > 0 ? rnd(p.F / saving, 1) : null; // null: never cheaper
}

export const SWEEPS = {N: [3, 5, 10, 20, 40, 80, 160], d: [0.1, 0.3, 0.5, 0.7, 1.0], V: [0.2, 0.5, 1.0, 2.0], r: [0.0, 0.2, 0.5, 0.8],
  a: [0.05, 0.2, 0.5], m: [0.0, 0.3, 0.6, 1.0], F: [0.5, 2.0, 5.0, 10.0]};
const pick = (x, ks) => Object.fromEntries(ks.map(k => [k, x[k]]));
const SHOW = ['cost', 'expected_relevant_resolved', 'cost_per_relevant_gap'];

// Change one parameter at a time.
export function sweep(mode) {
  const rows = [];
  for (const [name, values] of Object.entries(SWEEPS)) for (const v of values) {
    const r = compare(mode, {[name]: v});
    rows.push({param: name, value: v, baseline: pick(r.baseline, SHOW), carbontrace: pick(r.carbontrace, SHOW),
      carbontrace_worse_per_gap: r.carbontrace_worse_per_gap, carbontrace_resolves_fewer: r.carbontrace_resolves_fewer});
  }
  return rows;
}

// Conditions we expect to hurt CarbonTrace. [Assumption] chosen by hand to probe its limits.
export const LOSING_SCENARIOS = {
  'very small round': {N: 2},
  'small round, cheap verification': {N: 8, V: 0.2},
  'everything relevant, nothing reusable': {N: 20, d: 1.0, r: 0.0},
  'everything relevant, nothing reusable, large': {N: 40, d: 1.0, r: 0.0},
  'high fixed cost, small round': {N: 5, F: 5.0},
  'all cases need full review, small round': {N: 5, m: 1.0},
  'reuse checks as costly as a verification': {a: 1.0, r: 0.5}
};

export function losingConditions() {
  const rows = [];
  for (const [name, c] of Object.entries(LOSING_SCENARIOS)) for (const mode of ['cap', 'budget']) {
    const r = compare(mode, c);
    rows.push({scenario: name, params: c, mode, baseline_cost: r.baseline.cost, carbontrace_cost: r.carbontrace.cost,
      baseline_resolved: r.baseline.expected_relevant_resolved, carbontrace_resolved: r.carbontrace.expected_relevant_resolved,
      costs_more: r.carbontrace_costs_more, worse_per_gap: r.carbontrace_worse_per_gap, resolves_fewer: r.carbontrace_resolves_fewer});
  }
  return rows;
}

// The demo data as one discrete round. [Derived] untrusted: suppliers not verified. [Derived] relevant: a claim changes a comparison.
// [Assumption] No evidence is held at the start of the round, so r = 0.
export function demoRound(ctx = {}) {
  const g = buildGraph(ctx);
  const untrusted = Object.keys(g.suppliers).filter(s => g.suppliers[s].evidence_status !== 'verified').sort();
  const relevant = new Set();
  for (const parts of Object.values(COMPARISONS)) for (const c of decide(parts, ctx).claims) if (c.decision !== 'continue_analysis') c.suppliers.forEach(s => relevant.add(s));
  const N = untrusted.length;
  return {untrusted, relevant: [...relevant].sort(), result: compare('cap', {N, d: relevant.size / N, r: 0.0})};
}
