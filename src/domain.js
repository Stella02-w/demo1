// Business rules. A line-by-line port of carbontrace-code/round6/twin.py and round4/incentive.py,
// so the browser recomputes the same numbers. Pure functions: no DOM, no storage.
// Python names are kept in snake_case on returned objects so outputs can be diffed against twin.py.
import {PRIMARY_PCF, RECYCLED_PCF, SMELTERS, PCF_RECORDS, PARTS, DISPLAY} from './data.js';
export const displayName = n => DISPLAY[n] || n;

// ---------- constants (see twin.py for sources) ----------
export const PRIMARY_TEST_VALUES = {eu_used: [PRIMARY_PCF.imported], global: [PRIMARY_PCF.global]};
export const RECYCLED_TEST_VALUES = [0.0];
export const HIGH_IMPACT_KG = 25.0;
export const CARBON_PRICE_SEK_PER_T = 1000;
export const REVIEW_BUFFER_WORKDAYS = 5;
export const EVIDENCE_WINDOW_DAYS = 30;
export const EVIDENCE_OPTIONS = [
  {option: 'A', action: 'send existing certificate or verified PCF', lead_days: 5},
  {option: 'B', action: 'third-party verification; JLR may share the fee (50% large / 75% SME, capped)', lead_days: 30},
  {option: 'C', action: 'send partial evidence for the key claim', lead_days: 10},
  {option: 'D', action: 'state that evidence cannot be provided', lead_days: 0}
];
export const EVIDENCE_VALID_YEARS = 3;
export const CORRECTION_WINDOW_DAYS = 30;
export const ASSURANCE_LEVELS = ['none', 'limited', 'reasonable', 'certification'];
export const MIN_ASSURANCE = 'limited';
export const ACCEPTED_EVIDENCE = {
  third_party_verification: ['primary_pcf', 'recycled_share', 'origin_link'],
  chain_of_custody_certificate: ['recycled_share'],
  // [Assumption] purchase records or mill certificates, checked by procurement: prove the origin link only
  origin_document_check: ['origin_link']
};
export const EVIDENCE_NEEDED = {
  recycled_share: 'recycled-content certificate (chain of custody)',
  primary_pcf: "smelter origin and the smelter's PCF",
  origin_link: 'purchase records showing your metal came from the verified smelter (same product, period and boundary as its PCF)'
};

// ---------- helpers ----------
// Same as twin.round2: half away from zero on the exact binary value (Python round() would round exact ties to even).
export const round2 = x => Number(x.toFixed(2));
const D = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
export const addYears = (s, n) => { const d = D(s); d.setUTCFullYear(d.getUTCFullYear() + n); return iso(d); };
export function minusWorkdays(s, n) {
  const d = D(s);
  while (n > 0) { d.setUTCDate(d.getUTCDate() - 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return iso(d);
}
const minDate = (a, b) => (a < b ? a : b);
const key = (node, claim) => `${node}|${claim}`;
const pyStr = v => (Number.isInteger(v) ? v.toFixed(1) : String(v)); // Python str() of a float

// ---------- graph ----------
export function supplierPcf(primary, recycledShare, rounded = true) {
  const pcf = (1 - recycledShare) * primary + recycledShare * RECYCLED_PCF;
  return rounded ? round2(pcf) : pcf;
}

export function validEvidence(registry, on) {
  return registry.filter(e => {
    // usable until the earlier of the statement's own expiry and the reuse limit; an expired certificate stops counting
    const end = addYears(e.verified_on, EVIDENCE_VALID_YEARS), own = e.statement?.valid_until;
    return e.status === 'verified' && e.verified_on <= on && on < end && (!own || on <= own);
  });
}

// Smelter -> supplier -> part. `registry` replaces claims with verified values valid on `asOf`.
// `restated` maps a supplier to its PCF restated per kg (data fix): the unit problem is cleared and the value is kept for a consistency check.
export function buildGraph({registry = [], asOf = null, useRegistry = true, restated = {}, benchmark = null} = {}) {
  const g = {smelters: {}, suppliers: {}, parts: {}, benchmark};
  for (const s of SMELTERS) g.smelters[s.smelter] = {primary_basis: s.primary_basis, primary_pcf: PRIMARY_PCF[s.primary_basis], verified: s.verified};
  for (const r of PCF_RECORDS) g.suppliers[r.supplier] = {
    smelter: r.smelter, recycled_share: r.recycled_share, recycled_claim_verified: r.recycled_claim_verified,
    declared_unit: r.declared_unit, evidence_status: r.evidence_status || (r.verified ? 'verified' : 'unverified')
  };
  for (const [supplier, perKg] of Object.entries(restated)) Object.assign(g.suppliers[supplier], {declared_unit: 'kg', restated_per_kg: perKg});
  if (useRegistry && asOf) applyEvidence(g, registry, asOf);
  for (const p of PARTS) g.parts[p.part] = {tier1: p.tier1, sources: p.sources.map(s => ({supplier: s.supplier, kg: p.aluminium_kg * s.share}))};
  return g;
}

// A verified smelter PCF is reusable by the smelter's other customers (PACT V3 p.71), but only for the smelter's product:
// each other supplier still has to show its metal came from that smelter (origin_link).
const CLAIM_ORDER = {recycled_share: 0, primary_pcf: 0, origin_link: 1};
function applyEvidence(g, registry, on) {
  const touched = new Set();
  const list = validEvidence(registry, on).map((e, i) => [e, i]).sort(([a, i], [b, j]) => CLAIM_ORDER[a.claim] - CLAIM_ORDER[b.claim] || i - j).map(([e]) => e);
  for (const e of list) {
    const s = g.suppliers[e.supplier], smelter = s.smelter, sm = g.smelters[smelter];
    if (e.claim === 'recycled_share') {
      s.reported_recycled_share = s.recycled_share; s.recycled_share = e.verified_value; s.recycled_claim_verified = true;
    } else if (e.claim === 'primary_pcf') {
      sm.reported_primary_pcf = sm.primary_pcf; sm.primary_pcf = e.verified_value; sm.verified = true;
      sm.pcf_evidence = {supplier: e.supplier, product: e.product, boundary: e.boundary, verified_on: e.verified_on};
      s.origin_link_verified = true; // the submitting supplier's own verification covers its input
      for (const [name, other] of Object.entries(g.suppliers)) if (other.smelter === smelter && name !== e.supplier && !other.origin_link_checked) {
        other.origin_link_verified = false;
        other.upstream_evidence = {smelter, smelter_pcf: 'verified', origin_link: 'pending'};
      }
    } else if (e.claim === 'origin_link') {
      // the link only counts against a verified smelter PCF for the same product and boundary
      const pcf = sm.pcf_evidence;
      if (!pcf || pcf.product !== e.product || pcf.boundary !== e.boundary) continue;
      Object.assign(s, {origin_link_verified: true, origin_link_checked: true, upstream_evidence: {smelter, smelter_pcf: 'verified', origin_link: 'verified'}});
    }
    touched.add(e.supplier);
  }
  for (const name of touched) g.suppliers[name].evidence_status = isVerifiedSupplier(g, name) ? 'verified' : 'under_review';
}

// Ancestors of a set of parts: their suppliers and those suppliers' smelters.
function upstream(g, parts) {
  const set = new Set();
  for (const p of parts) for (const {supplier} of g.parts[p].sources) { set.add(supplier); set.add(g.suppliers[supplier].smelter); }
  return set;
}
export const isUpstream = (g, supplier, part) => g.parts[part].sources.some(s => s.supplier === supplier);
// node is a supplier or a smelter
export const isAncestor = (g, node, part) => g.parts[part].sources.some(s => s.supplier === node || g.suppliers[s.supplier].smelter === node);
export const customersOf = (g, smelter) => Object.keys(g.suppliers).filter(s => g.suppliers[s].smelter === smelter).sort();

export function nodePcf(g, supplier, override = {}, rounded = true) {
  const s = g.suppliers[supplier];
  let primary = override[key(s.smelter, 'primary_pcf')] ?? g.smelters[s.smelter].primary_pcf;
  // link not shown yet: tested as if the metal came from somewhere else
  if (s.origin_link_verified === false) primary = override[key(supplier, 'origin_link')] ?? primary;
  const share = override[key(supplier, 'recycled_share')] ?? s.recycled_share;
  return supplierPcf(primary, share, rounded);
}

export function partPcf(g, part, override = {}, rounded = true) {
  let total = 0;
  for (const {supplier, kg} of g.parts[part].sources) total += kg * nodePcf(g, supplier, override, rounded);
  return rounded ? round2(total) : total;
}

export function listGaps(g, parts) {
  const gaps = [];
  for (const n of [...upstream(g, parts)].sort()) {
    const sm = g.smelters[n], su = g.suppliers[n];
    if (sm && !sm.verified) gaps.push({node: n, layer: 'smelter', claim: 'primary_pcf', reported: sm.primary_pcf,
      test_values: (PRIMARY_TEST_VALUES[sm.primary_basis] || []).filter(v => v > sm.primary_pcf)});
    if (su && su.origin_link_verified === false) { const m = g.smelters[su.smelter];
      gaps.push({node: n, layer: 'supplier', claim: 'origin_link', reported: m.primary_pcf,
        test_values: (PRIMARY_TEST_VALUES[m.primary_basis] || []).filter(v => v > m.primary_pcf)}); }
    if (su && !su.recycled_claim_verified && su.recycled_share > 0) gaps.push({node: n, layer: 'supplier', claim: 'recycled_share',
      reported: su.recycled_share, test_values: RECYCLED_TEST_VALUES});
  }
  return gaps.filter(gap => gap.test_values.length);
}

function lineCross(f, gap) {
  const v0 = gap.reported, v1 = gap.test_values[0], d0 = f(v0), d1 = f(v1);
  if (d0 === d1) return null;
  return v0 - d0 * (v1 - v0) / (d1 - d0);
}

export function breakEven(g, a, b, gap) {
  const value = lineCross(v => { const o = {[key(gap.node, gap.claim)]: v}; return partPcf(g, a, o, false) - partPcf(g, b, o, false); }, gap);
  if (value === null) return null;
  if (gap.claim === 'recycled_share' && !(value >= 0 && value <= 1)) return null;
  return round2(value);
}

const pairs = arr => arr.flatMap((x, i) => arr.slice(i + 1).map(y => [x, y]));
const claimOptions = gaps => gaps.map(gap => gap.test_values.map(v => ({node: gap.node, claim: gap.claim, value: v})));
const toOverride = claims => Object.fromEntries(claims.map(c => [key(c.node, c.claim), c.value]));

export function checkFlip(a, b, ctx = {}) {
  const g = buildGraph(ctx);
  // a tie has no lower-carbon choice and counts as a change, so the result does not depend on which part is named first
  const pa = partPcf(g, a), pb = partPcf(g, b), baseWinner = pa < pb ? a : pb < pa ? b : null;
  const gaps = listGaps(g, [a, b]);
  const run = claims => { const o = toOverride(claims), ra = partPcf(g, a, o), rb = partPcf(g, b, o), w = ra < rb ? a : rb < ra ? b : null;
    return {claims, [a]: ra, [b]: rb, lower_carbon: w, decision_flips: w !== baseWinner}; };
  const options = claimOptions(gaps);
  const singles = options.flatMap(opts => opts.map(c => run([c])));
  const pairTests = pairs(options).flatMap(([o1, o2]) => o1.flatMap(c1 => o2.map(c2 => run([c1, c2]))));
  const singleFlips = new Set(singles.filter(t => t.decision_flips).flatMap(t => t.claims.map(c => key(c.node, c.claim))));
  for (const t of pairTests) t.combined_risk = t.decision_flips && !t.claims.some(c => singleFlips.has(key(c.node, c.claim)));
  for (const gap of gaps) { gap.break_even = breakEven(g, a, b, gap); gap.flips_alone = singleFlips.has(key(gap.node, gap.claim)); }
  return {baseline: {[a]: pa, [b]: pb, lower_carbon: baseWinner}, gaps, single_tests: singles, pair_tests: pairTests};
}

export function isVerifiedSupplier(g, supplier) {
  const s = g.suppliers[supplier];
  return g.smelters[s.smelter].verified && s.recycled_claim_verified && s.origin_link_verified !== false;
}

// [Assumption] JLR AR FY25/26 p.64-65: targets come from best-in-class benchmarks across the supply base, not which statistic.
// P25 of fully verified suppliers is our configurable approximation; best-in-class does not have to mean the top quartile.
export const BENCHMARK_PERCENTILE = 0.25;
export const BENCHMARK_SCENARIOS = {P10: 0.10, P25: 0.25, P50: 0.50}; // strict / default / relaxed

// Linear interpolation at position (n-1) x q: Excel PERCENTILE.INC, R type 7, Python statistics.quantiles(method="inclusive").
export function percentileInclusive(data, q) {
  const x = [...data].sort((a, b) => a - b), pos = (x.length - 1) * q, j = Math.floor(pos), delta = pos - j;
  return j + 1 < x.length ? x[j] + (x[j + 1] - x[j]) * delta : x[j];
}
// Fully verified suppliers at the start of the round and their pcf. `exclude` is for leave-one-out checks only.
export function benchmarkGroup(exclude = []) {
  const base = buildGraph({useRegistry: false});
  return Object.fromEntries(Object.keys(base.suppliers).filter(s => isVerifiedSupplier(base, s) && !exclude.includes(s)).map(s => [s, nodePcf(base, s)]));
}
// Target = aluminium kg in the part x the benchmark percentile pcf, fixed at round start.
// g.benchmark ({q, exclude}) changes the target line only, never a supplier's pcf.
export function co2eTarget(g, part) {
  const kg = g.parts[part].sources.reduce((s, x) => s + x.kg, 0), b = g.benchmark || {};
  return round2(kg * percentileInclusive(Object.values(benchmarkGroup(b.exclude || [])), b.q ?? BENCHMARK_PERCENTILE));
}

export const carbonCostSek = pcf => round2(pcf / 1000 * CARBON_PRICE_SEK_PER_T);

export function checkTarget(part, ctx = {}) {
  const g = buildGraph(ctx);
  const target = co2eTarget(g, part), base = partPcf(g, part), baseMeets = base <= target;
  const gaps = listGaps(g, [part]);
  const run = claims => { const pcf = partPcf(g, part, toOverride(claims)), meets = pcf <= target;
    return {claims, pcf, meets_target: meets, status_changes: meets !== baseMeets, extra_carbon_cost_sek: carbonCostSek(pcf - base)}; };
  const options = claimOptions(gaps);
  const singles = options.flatMap(opts => opts.map(c => run([c])));
  const pairTests = pairs(options).flatMap(([o1, o2]) => o1.flatMap(c1 => o2.map(c2 => run([c1, c2]))));
  for (const gap of gaps) {
    const v = lineCross(x => partPcf(g, part, {[key(gap.node, gap.claim)]: x}, false) - target, gap);
    gap.target_break_even = v === null ? null : round2(v);
  }
  return {part, in_scope: base > HIGH_IMPACT_KG, target, baseline: {pcf: base, meets_target: baseMeets, carbon_cost_sek: carbonCostSek(base)},
    gaps, single_tests: singles, pair_tests: pairTests};
}

export function dataProblems(g, parts) {
  const problems = new Set();
  for (const p of parts) for (const {supplier} of g.parts[p].sources) {
    const d = g.suppliers[supplier];
    if (d.declared_unit !== 'kg') problems.add(`${supplier}: declared per ${d.declared_unit}, not per kg`);
    if (d.recycled_share == null || !d.smelter) problems.add(`${supplier}: missing recycled share or primary source`);
  }
  return [...problems].sort();
}

// [Product addition] A per-kg restatement is checked against what the twin computes from the supplier's own record.
export const RESTATEMENT_TOLERANCE = 0.1; // [Assumption] more than 10% apart -> flag for the analyst, do not block
export function restatementCheck(g, supplier) {
  const s = g.suppliers[supplier];
  if (s.restated_per_kg == null) return null;
  const model = nodePcf(g, supplier), diff = Math.abs(s.restated_per_kg - model) / model;
  return {supplier, restated: s.restated_per_kg, model, consistent: diff <= RESTATEMENT_TOLERANCE};
}

// continue_analysis | needs_human_review | suggest_pause. The system only suggests a pause.
export function decide(parts, ctx = {}) {
  const g = buildGraph(ctx);
  const problems = dataProblems(g, parts);
  if (problems.length) return {parts, decision: 'suggest_pause', auto_ranking: 'blocked', reasons: problems, claims: []};
  const impact = {};
  const add = (k, why) => (impact[k] = impact[k] || []).push(why);
  for (const part of parts) for (const t of checkTarget(part, ctx).single_tests)
    if (t.status_changes) for (const c of t.claims) add(key(c.node, c.claim), `${part} target status`);
  if (parts.length === 2) {
    const f = checkFlip(parts[0], parts[1], ctx);
    for (const t of f.single_tests) if (t.decision_flips) for (const c of t.claims) add(key(c.node, c.claim), 'lower-carbon choice');
    for (const t of f.pair_tests) if (t.combined_risk) for (const c of t.claims) {
      const other = t.claims.filter(o => o !== c).map(o => `${o.node} ${o.claim}`);
      add(key(c.node, c.claim), `lower-carbon choice, together with ${other[0]}`);
    }
  }
  const inScope = upstream(g, parts);
  const claims = listGaps(g, parts).map(gap => {
    const k = key(gap.node, gap.claim);
    // a smelter can feed several suppliers; only those in this comparison count
    const suppliers = gap.layer === 'supplier' ? [gap.node] : customersOf(g, gap.node).filter(s => inScope.has(s));
    const supplier = suppliers[0], statuses = suppliers.map(x => g.suppliers[x].evidence_status);
    const status = statuses.includes('under_review') ? 'under_review' : statuses[0];
    const label = !impact[k] ? 'continue_analysis' : status === 'under_review' ? 'suggest_pause' : 'needs_human_review';
    return {node: gap.node, claim: gap.claim, supplier, suppliers, values: {declared: gap.reported, scenario: gap.test_values[0], verified: null},
      evidence_status: status, would_change: impact[k] || [], decision: label};
  });
  let reasons = [];
  const meets = parts.map(p => checkTarget(p, ctx).baseline.meets_target);
  if (!meets.some(Boolean)) reasons.push('no part meets its CO2e target');
  reasons.push(...claims.filter(c => c.decision === 'suggest_pause').map(c => `${c.node} ${c.claim}: evidence under review`));
  let decision;
  if (reasons.length) decision = 'suggest_pause';
  else if (claims.some(c => c.decision === 'needs_human_review')) {
    decision = 'needs_human_review';
    reasons = claims.filter(c => c.decision === 'needs_human_review').map(c => `${c.node} ${c.claim} would change: ${c.would_change.join(', ')}`);
  } else decision = 'continue_analysis';
  return {parts, decision, auto_ranking: decision === 'suggest_pause' ? 'blocked' : 'allowed', reasons, claims};
}

export function alternatives(g, part, target) {
  const verified = Object.keys(g.suppliers).filter(s => isVerifiedSupplier(g, s));
  const current = Object.fromEntries(g.parts[part].sources.map(s => [s.supplier, s.kg]));
  const totalKg = Object.values(current).reduce((a, b) => a + b, 0);
  const options = [];
  for (const bad of Object.keys(current).filter(s => !isVerifiedSupplier(g, s))) for (const v of verified) {
    const mix = {...current}; const kg = mix[bad]; delete mix[bad]; mix[v] = (mix[v] || 0) + kg;
    options.push({change: `replace ${bad} with ${v}`, mix});
  }
  for (const v of verified) options.push({change: `source all aluminium from ${v}`, mix: {[v]: totalKg}});
  for (const o of options) {
    o.pcf = round2(Object.entries(o.mix).reduce((s, [sup, kg]) => s + kg * nodePcf(g, sup), 0));
    o.meets_target = o.pcf <= target;
    const a = new Set(Object.keys(o.mix)), b = new Set(Object.keys(current));
    const sym = [...a].filter(x => !b.has(x)).length + [...b].filter(x => !a.has(x)).length;
    o.relationships_changed = sym + Object.keys(o.mix).filter(s => s in current && o.mix[s] !== current[s]).length;
    o.mix = Object.fromEntries(Object.entries(o.mix).map(([s, kg]) => [s, round2(kg)]));
  }
  // stable sort, same key as Python: meets target first, then fewest changes, then lowest pcf
  return options.map((o, i) => [o, i]).sort(([x, i], [y, j]) =>
    (x.meets_target === y.meets_target ? 0 : x.meets_target ? -1 : 1) || x.relationships_changed - y.relationships_changed || x.pcf - y.pcf || i - j).map(([o]) => o);
}

export const evidenceDeadline = (sourcingDate, requestedOn) =>
  minDate(addDays(requestedOn, EVIDENCE_WINDOW_DAYS), minusWorkdays(sourcingDate, REVIEW_BUFFER_WORKDAYS));

export function actionPlan(parts, sourcingDate, today, ctx = {}) {
  const g = buildGraph(ctx), verdict = decide(parts, ctx);
  if (verdict.decision === 'continue_analysis') return {verdict, plans: []};
  const deadline = evidenceDeadline(sourcingDate, today), daysLeft = daysBetween(today, deadline);
  const plans = [];
  for (const c of verdict.claims) {
    if (c.decision === 'continue_analysis') continue;
    const affected = parts.filter(p => isAncestor(g, c.node, p));
    // to_all: every supplier in this comparison that buys from a shared smelter
    const request = {to: c.supplier, to_all: c.suppliers, via: affected.map(p => g.parts[p].tier1), evidence_needed: EVIDENCE_NEEDED[c.claim], deadline,
      options: EVIDENCE_OPTIONS.map(o => ({...o, feasible: o.lead_days <= daysLeft}))};
    const what_if = Object.fromEntries(affected.map(p => [p, alternatives(g, p, co2eTarget(g, p)).slice(0, 3)]));
    const o = {[key(c.node, c.claim)]: c.values.scenario};
    const after = Object.fromEntries(parts.map(p => [p, partPcf(g, p, o)]));
    const meets = Object.fromEntries(parts.map(p => [p, after[p] <= co2eTarget(g, p)]));
    plans.push({claim: `${c.node} ${c.claim}`, request, alternatives: what_if, fallback: {after_deadline: after, meets_target: meets,
      next_step: Object.values(meets).some(Boolean) ? 'continue with parts that meet their target' : 'escalate to procurement: no part meets its target'}});
  }
  return {verdict, today, sourcing_date: sourcingDate, plans};
}

// What a statement must match before its value is used. Checks are configured per claim and per evidence type:
// a recycled-content certificate is not judged by per-kg units or an assurance level it does not use.
// [Scope] The system checks that the statement's stated scope matches the claim. It does not authenticate documents:
// in the demo, statements are pre-labelled mock evidence; in production an analyst confirms the document itself.
export const STATEMENT_PERIOD_YEARS = 2; // [Assumption] the reporting period must end within 2 years of the check
export const CHECK = {
  kind: e => (ACCEPTED_EVIDENCE[e.verified_by] || []).includes(e.claim) || `${e.verified_by.replace(/_/g, ' ')} cannot prove ${e.claim.replace('_', ' ')}`,
  assurance: e => ASSURANCE_LEVELS.indexOf(e.assurance_level) >= ASSURANCE_LEVELS.indexOf(MIN_ASSURANCE) || `assurance "${e.assurance_level}" below "${MIN_ASSURANCE}"`,
  product: e => e.statement.product === e.product || `statement covers ${e.statement.product}, not ${e.product}`,
  site: e => e.statement.site === e.supplier || `statement covers site ${e.statement.site}, not ${e.supplier}`,
  period: e => (e.statement.period_end <= e.verified_on && daysBetween(e.statement.period_end, e.verified_on) <= STATEMENT_PERIOD_YEARS * 366) || `reporting period ending ${e.statement.period_end} is not current`,
  scope: e => e.statement.scope.includes(e.claim) || `${e.claim.replace('_', ' ')} is outside the statement's scope`,
  unit: e => e.statement.unit === 'kg' || `values stated per ${e.statement.unit}, not per kg`,
  boundary: e => e.statement.boundary === e.boundary || `boundary ${e.statement.boundary}, not ${e.boundary}`,
  source_identity: e => !!e.statement.smelter || 'smelter not named',
  supply_relationship: e => e.statement.supply_relationship === 'confirmed' || `supply from ${e.statement.smelter || 'the smelter'} to ${e.supplier} not confirmed`,
  content_definition: e => ['post_consumer_and_pre_consumer', 'post_consumer'].includes(e.statement.content_definition) || `recycled content definition "${e.statement.content_definition}" not recognised`,
  batch: e => e.statement.product === e.product || `certificate covers ${e.statement.product}, not ${e.product}`,
  valid: e => e.statement.valid_until >= e.verified_on || `statement expired ${e.statement.valid_until}`,
  opinion: e => e.statement.opinion === 'unqualified' || 'verifier opinion is qualified'
};
// Which checks apply, by claim. `assurance` and `opinion` only apply to evidence types that give one (verification statements).
export const EVIDENCE_RULES = {
  primary_pcf: ['kind', 'source_identity', 'supply_relationship', 'product', 'period', 'scope', 'unit', 'boundary', 'valid'],
  recycled_share: ['kind', 'content_definition', 'batch', 'site', 'period', 'scope', 'valid'],
  // product and boundary must also match the smelter's verified PCF; that is checked when the evidence is applied
  origin_link: ['kind', 'source_identity', 'supply_relationship', 'product', 'period', 'scope', 'valid']
};
export const ASSURED_TYPES = ['third_party_verification'];
// [Demo scope limit] Only physical (segregated) recycled content is accepted automatically. A mass-balance claim is not invalid:
// it goes to the carbon analyst, because the twin's recycled-share maths assumes physical content.
export const AUTO_CHAIN_OF_CUSTODY = ['segregated'];
// Statement fields each check reads. A field the statement does not state fails that check: nothing is assumed in the supplier's favour.
const NEEDS = {kind: ['verified_by'], assurance: ['assurance_level'], product: ['statement.product'], site: ['statement.site'], period: ['statement.period_end'],
  scope: ['statement.scope'], unit: ['statement.unit'], boundary: ['statement.boundary'], source_identity: ['statement.smelter'], supply_relationship: ['statement.supply_relationship'],
  content_definition: ['statement.content_definition'], batch: ['statement.product'], valid: ['statement.valid_until'], opinion: ['statement.opinion']};
const missing = v => v == null || v === '' || (Array.isArray(v) && !v.length);
const field = (e, path) => path.split('.').reduce((o, k) => o?.[k], e);
// Every check that applies to this entry, passed or not, with the reason when it fails (the Evidence Center lists them).
export function checkList(e) {
  const ids = [...EVIDENCE_RULES[e.claim], ...(ASSURED_TYPES.includes(e.verified_by) || !e.verified_by ? ['assurance', 'opinion'] : [])];
  return ids.map(id => { const gap = NEEDS[id].find(f => missing(field(e, f)));
    const r = gap ? (gap === 'statement.smelter' ? 'smelter not named' : `${gap.replace('statement.', '').replace(/_/g, ' ')} not stated`) : CHECK[id](e);
    return {id, ok: r === true, why: r === true ? null : r}; });
}
export function evidenceChecks(e) {
  const fails = checkList(e).filter(c => !c.ok).map(c => c.why);
  const coc = e.statement?.chain_of_custody;
  const limits = e.claim !== 'recycled_share' || AUTO_CHAIN_OF_CUSTODY.includes(coc) ? []
    : [missing(coc) ? 'chain of custody not stated: analyst decides' : `${coc.replace('_', ' ')} claim: outside the demo's automatic scope, analyst decides`];
  return {fails, limits};
}

// One piece of evidence. Verified only if every applicable check passes; otherwise it goes to the carbon analyst with the reasons.
// Four dates kept apart: responded_on (answered the request), disclosed_on (stated what was wrong or limited, if anything),
// submitted_on (sent the evidence) and verified_on (verifier completed).
// source: 'request' (answer to a JLR request), 'voluntary' (supplier came forward) or 'audit' (found by a JLR spot check).
export function checkValue(claim, v) {
  if (!EVIDENCE_RULES[claim]) throw new RangeError(`Unknown claim ${claim}`);
  if (claim === 'origin_link') { if (v != null) throw new RangeError('An origin link confirms a source; it has no value'); return; }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${claim.replace('_', ' ')} must be a number`);
  if (claim === 'recycled_share' && (v < 0 || v > 1)) throw new RangeError('Recycled share must be between 0 and 1 (0% to 100%)');
  if (claim === 'primary_pcf' && !(v > 0)) throw new RangeError('Primary PCF must be above 0 kgCO2e/kg');
}
export function submitEvidence({supplier, claim, verified_value, verified_on, product, verified_by = null,
  assurance_level = null, provider_name = null, boundary = 'cradle-to-gate', source = 'request', requested_on = null,
  responded_on = null, disclosed_on = null, submitted_on = null, reference = null, statement = {}}) {
  checkValue(claim, verified_value);
  // boundary and product are what JLR requires; the statement must state what it covers, or the matching check fails
  const e = {supplier, claim, verified_value, verified_on, product, boundary, verified_by, assurance_level, provider_name, source, requested_on,
    responded_on, disclosed_on, submitted_on: submitted_on || verified_on, reference, statement: {...statement}};
  const {fails, limits} = evidenceChecks(e);
  e.checks_failed = fails; e.scope_limits = limits;
  e.status = fails.length || limits.length ? 'under_review' : 'verified';
  return e;
}

export const findReusable = (registry, supplier, claim, product, on, boundary = 'cradle-to-gate') =>
  validEvidence(registry, on).filter(e => e.supplier === supplier && e.claim === claim && e.product === product && e.boundary === boundary);

// [Assumption] Mechanism doc 03 Reward: depends only on the evidence and on timing, never on the verified number.
// Two separate things:
// - timely response (answered within the window): participation support such as the fee share and fast-track reuse;
// - correction protection: only for an actual disclosure of what was wrong or limited, judged by the disclosure date,
//   not the verifier's completion date. Clicking a response route is not a disclosure.
// A value found by a JLR spot check is not presumed deliberate: it goes to fact-finding.
export function correctionProtection(entry) {
  if (entry.source === 'audit') return 'fact_finding';
  if (!entry.disclosed_on) return 'no_disclosure';
  if (entry.source === 'voluntary' || !entry.requested_on) return 'eligible';
  return daysBetween(entry.requested_on, entry.disclosed_on) <= CORRECTION_WINDOW_DAYS ? 'eligible' : 'not_eligible';
}
export function treatment(entry) {
  const verified = entry.status === 'verified';
  return {evidence_status: entry.status, fast_track_reuse_until: verified ? addYears(entry.verified_on, EVIDENCE_VALID_YEARS) : null,
    fee_share: 'per pre-approved rule (50% large / 75% SME, capped)',
    timely_response: !entry.requested_on || (!!entry.responded_on && daysBetween(entry.requested_on, entry.responded_on) <= CORRECTION_WINDOW_DAYS),
    correction_protection: correctionProtection(entry), audit_rate_unchanged: true};
}

// a tie has no lower-carbon part
export const lowerCarbon = pcfs => { const k = Object.keys(pcfs); return k.length !== 2 || pcfs[k[0]] === pcfs[k[1]] ? null : pcfs[k[0]] < pcfs[k[1]] ? k[0] : k[1]; };

// Evidence by the deadline updates this sourcing decision. Late evidence never reverses an issued nomination.
export function assessImprovement({parts, supplier, claims, verified_on, requested_on, sourcing_date, evidence = {}, registry = [], restated = {}}) {
  const reg = [...registry];
  const g0 = buildGraph({registry: reg, asOf: verified_on, restated});
  const declared = nodePcf(g0, supplier);
  const before = Object.fromEntries(parts.map(p => [p, partPcf(g0, p)]));
  const entries = Object.entries(claims).map(([claim, value]) =>
    submitEvidence({supplier, claim, verified_value: value, verified_on, product: 'aluminium', requested_on, ...evidence}));
  reg.push(...entries);
  const ctx = {registry: reg, asOf: verified_on, restated};
  const g = buildGraph(ctx);
  const verified = nodePcf(g, supplier);
  const after = Object.fromEntries(parts.map(p => [p, partPcf(g, p)]));
  const target = Object.fromEntries(parts.map(p => [p, co2eTarget(g, p)]));
  const result = {supplier, declared_pcf: declared, verified_pcf: verified,
    direction: verified < declared ? 'lower than declared' : 'higher than declared',
    entries, treatment: entries.map(treatment),
    carbon_assessment: Object.fromEntries(parts.map(p => [p, {pcf: after[p], target: target[p], meets_target: after[p] <= target[p]}]))};
  const deadline = evidenceDeadline(sourcing_date, requested_on);
  result.deadline = deadline;
  if (verified_on <= deadline) { result.timing = 'on time: updates this sourcing decision'; result.on_time = true; result.decision = decide(parts, ctx).decision; return result; }
  const reasons = parts.filter(p => (before[p] <= target[p]) !== (after[p] <= target[p]))
    .map(p => `${p}: target status would change (${before[p]} -> ${after[p]}, target ${target[p]})`);
  if (lowerCarbon(before) !== lowerCarbon(after)) reasons.push(`lower-carbon part would change: ${lowerCarbon(before)} -> ${lowerCarbon(after)}`);
  // Late is a process flag, not a verdict on the evidence: the store decides by when it arrived (before or after nomination).
  result.timing = 'late: after the evidence deadline'; result.on_time = false; result.decision = 'unchanged';
  result.decision_if_used = decide(parts, ctx).decision;
  result.late_evidence = {material: reasons.length > 0, reasons, next_steps: reasons.length
    ? ['supplier improvement plan with a deadline', 're-assess at the next quote or model change', 'add the part to carbon monitoring']
    : ['record only; reuse in the next round']};
  return result;
}

// ---------- incentive.py: two documents for two readers ----------
const pct = v => `${Math.round(v * 100)}%`;
const CLAIM_TEXT = {recycled_share: v => `recycled aluminium share of ${pct(v)}`, primary_pcf: v => `primary aluminium footprint of ${pyStr(v)} kgCO2e/kg (smelter origin)`,
  origin_link: v => `primary aluminium from a smelter with a verified footprint of ${pyStr(v)} kgCO2e/kg`};
const IF_NO_EVIDENCE = {recycled_share: v => `counted as ${pct(v)} recycled content`, primary_pcf: v => `counted at ${pyStr(v)} kgCO2e/kg (published value for imported primary ingot)`,
  origin_link: v => `counted at ${pyStr(v)} kgCO2e/kg (published value for imported primary ingot)`};
export const COMMITMENTS = [
  'Same treatment whatever the verified value: fee share, reuse and audit rate do not depend on whether the number goes up or down.',
  `Verified evidence is reused for ${EVIDENCE_VALID_YEARS} years for the same product; we will not ask again (PACT V3 p.17).`,
  'Option B: JLR may share the verification fee (50% large / 75% SME, capped), subject to procurement approval.',
  `Corrections you make within ${CORRECTION_WINDOW_DAYS} days of this request are treated as voluntary and are not penalised.`
];
export const DATA_MINIMISATION = 'Please send a verification statement or certificate. Raw activity data is not needed.';

export function plausibilityFlags(r) {
  const flags = [];
  if (r.pcf != null && r.pcf < RECYCLED_PCF) flags.push(`PCF ${r.pcf} is below the 100% recycled value ${RECYCLED_PCF}.`);
  if (r.recycled_share != null && !(r.recycled_share >= 0 && r.recycled_share <= 1)) flags.push(`Recycled share ${r.recycled_share} is outside 0-1.`);
  return flags;
}

export function internalBrief(parts, plan, ctx = {}) {
  const k = (n, c) => `${n} ${c}`;
  const be = {};
  if (parts.length === 2) for (const gap of checkFlip(parts[0], parts[1], ctx).gaps) be[k(gap.node, gap.claim)] = gap.break_even;
  const targets = {}, tbe = {};
  for (const p of parts) {
    const t = checkTarget(p, ctx); targets[p] = t.target;
    for (const gap of t.gaps) {
      let v = gap.target_break_even;
      if (gap.claim === 'recycled_share' && v !== null && !(v >= 0 && v <= 1)) v = null;
      (tbe[k(gap.node, gap.claim)] = tbe[k(gap.node, gap.claim)] || {})[p] = v;
    }
  }
  const records = Object.fromEntries(PCF_RECORDS.map(r => [r.supplier, r]));
  const plans = Object.fromEntries(plan.plans.map(p => [p.claim, p]));
  const claims = plan.verdict.claims.map(c => {
    const id = k(c.node, c.claim), p = plans[id];
    return {claim: id, node: c.node, claim_type: c.claim, supplier: c.supplier, label: c.decision, declared: c.values.declared, tested_at: c.values.scenario,
      would_change: c.would_change, ranking_break_even: be[id] ?? null, target_break_even: tbe[id] ?? null,
      plausibility_flags: plausibilityFlags(records[c.supplier] || {}), alternatives: p ? p.alternatives : null, fallback: p ? p.fallback : null};
  });
  return {for: 'procurement only', parts, decision: plan.verdict.decision, reasons: plan.verdict.reasons, targets, claims};
}

export function supplierRequests(plan) {
  const claims = Object.fromEntries(plan.verdict.claims.map(c => [`${c.node} ${c.claim}`, c]));
  const letters = {};
  for (const p of plan.plans) {
    const c = claims[p.claim], r = p.request;
    for (const to of r.to_all || [r.to]) { // a shared smelter claim goes to every in-scope customer
      const letter = letters[to] = letters[to] || {status: 'draft - procurement must approve before sending', to, via: r.via, deadline: r.deadline,
        claims: [], options: r.options.filter(o => o.feasible).map(({option, action, lead_days}) => ({option, action, lead_days})),
        commitments: COMMITMENTS, data_minimisation: DATA_MINIMISATION};
      letter.claims.push({node: c.node, claim: c.claim, you_declared: CLAIM_TEXT[c.claim](c.values.declared), evidence_needed: r.evidence_needed,
        if_no_evidence_by_deadline: IF_NO_EVIDENCE[c.claim](c.values.scenario), fallback_value: c.values.scenario});
    }
  }
  return Object.values(letters);
}

// Guardrail: internal numbers and other suppliers' names must not appear in a supplier letter.
export function leaks(letter, brief) {
  const text = JSON.stringify(letter);
  const secret = new Set(Object.values(brief.targets).map(pyStr));
  for (const c of brief.claims) {
    if (c.ranking_break_even != null) secret.add(pyStr(c.ranking_break_even));
    for (const v of Object.values(c.target_break_even || {})) if (v != null) secret.add(pyStr(v));
    for (const opts of Object.values(c.alternatives || {})) for (const o of opts) for (const s of Object.keys(o.mix)) if (s !== letter.to) secret.add(s);
  }
  return [...secret].filter(s => text.includes(s)).sort();
}

export function draftRequests(parts, sourcingDate, today, ctx = {}) {
  const plan = actionPlan(parts, sourcingDate, today, ctx);
  const brief = internalBrief(parts, plan, ctx);
  const letters = supplierRequests(plan).map(l => ({...l, leaks: leaks(l, brief)}));
  return {plan, internal_brief: brief, supplier_requests: letters};
}

export function renderLetter(letter) {
  const lines = [`[${letter.status}]`, `To: ${letter.to} (via ${letter.via.join(', ')})`, `Please send evidence by ${letter.deadline} for:`];
  for (const c of letter.claims) lines.push(`  - Your declared ${c.you_declared}`, `    Evidence: ${c.evidence_needed}`, `    If no evidence by the deadline: ${c.if_no_evidence_by_deadline}`);
  lines.push('Ways to respond:', ...letter.options.map(o => `  ${o.option}: ${o.action}` + (o.lead_days ? ` (about ${o.lead_days} days)` : '')));
  lines.push('Our commitments:', ...letter.commitments.map(c => `  - ${c}`), letter.data_minimisation);
  return lines.join('\n');
}
