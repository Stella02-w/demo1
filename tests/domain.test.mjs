// Parity tests: the JS port must reproduce twin.py / incentive.py output
// (carbontrace-code/round3_1/expected_output.txt and round4/expected_output.txt).
// Run: node tests/domain.test.mjs
import assert from 'node:assert/strict';
import * as T from '../src/domain.js';
import {DEMO_OUTCOMES, DEMO_EVIDENCE, demoStatement} from '../src/data.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const A = 'Bracket_T1A', B = 'Bracket_T1B';
const today = '2026-10-28', sourcing = '2026-12-15';

test('baseline and flip tests', () => {
  const r = T.checkFlip(A, B);
  assert.deepEqual(r.baseline, {[A]: 42.04, [B]: 37.6, lower_carbon: B});
  const [sb, ub] = r.gaps;
  assert.equal(sb.node, 'Supplier_B'); assert.equal(sb.break_even, 0.67); assert.equal(sb.flips_alone, true);
  assert.equal(ub.node, 'Unknown_B'); assert.equal(ub.break_even, 13.28); assert.equal(ub.flips_alone, false);
  assert.deepEqual(r.single_tests.map(t => [t[B], t.decision_flips]), [[78.93, true], [41.91, false]]);
  assert.deepEqual(r.pair_tests.map(t => [t[B], t.decision_flips, t.combined_risk]), [[96.29, true, false]]);
});

test('target check', () => {
  const a = T.checkTarget(A), b = T.checkTarget(B);
  assert.equal(a.target, 41.44); assert.equal(a.baseline.meets_target, false); assert.equal(a.in_scope, true);
  assert.equal(b.baseline.meets_target, true); assert.equal(b.baseline.carbon_cost_sek, 37.6);
  assert.deepEqual(b.gaps.map(g => g.target_break_even), [0.68, 12.85]);
  assert.deepEqual(b.single_tests.map(t => [t.pcf, t.status_changes, t.extra_carbon_cost_sek]), [[78.93, true, 41.33], [41.91, true, 4.31]]);
  assert.deepEqual(b.pair_tests.map(t => [t.pcf, t.extra_carbon_cost_sek]), [[96.29, 58.69]]);
  assert.equal(T.checkTarget('Cover_T1D').target, 31.08); assert.equal(T.checkTarget('Housing_T1C').target, 15.54);
});

test('decide: three comparisons', () => {
  const br = T.decide([A, B]);
  assert.equal(br.decision, 'needs_human_review'); assert.equal(br.auto_ranking, 'allowed');
  assert.deepEqual(br.reasons, ['Supplier_B recycled_share would change: Bracket_T1B target status, lower-carbon choice', 'Unknown_B primary_pcf would change: Bracket_T1B target status']);
  const cv = T.decide(['Cover_T1D', 'Cover_T1E']);
  assert.equal(cv.decision, 'needs_human_review');
  assert.deepEqual(cv.claims.map(c => [c.node, c.decision]), [['Supplier_K', 'continue_analysis'], ['Unknown_B', 'needs_human_review']]);
  assert.deepEqual(cv.reasons, ['Unknown_B primary_pcf would change: lower-carbon choice']);
  // shared smelter: only its in-scope customers count, not Supplier_B from the bracket comparison
  assert.deepEqual(cv.claims[1].suppliers, ['Supplier_H', 'Supplier_I']);
  const hs = T.decide(['Housing_T1C']);
  assert.equal(hs.decision, 'suggest_pause'); assert.equal(hs.auto_ranking, 'blocked');
  assert.deepEqual(hs.reasons, ['Supplier_D: declared per piece, not per kg']);
});

test('action plan: deadline, options, alternatives, fallback', () => {
  const p = T.actionPlan([A, B], sourcing, today);
  assert.equal(p.plans.length, 2);
  const [sb, ub] = p.plans;
  assert.equal(sb.request.deadline, '2026-11-27'); assert.deepEqual(sb.request.via, ['Tier1_B']);
  assert.ok(sb.request.options.every(o => o.feasible));
  assert.deepEqual(sb.alternatives[B].map(o => [o.change, o.pcf, o.meets_target, o.relationships_changed]), [
    ['source all aluminium from Supplier_F', 27.44, true, 3], ['source all aluminium from Supplier_E', 41.44, true, 3], ['replace Supplier_B with Supplier_F', 41.58, false, 2]]);
  assert.deepEqual(sb.fallback.after_deadline, {[A]: 42.04, [B]: 78.93}); assert.equal(sb.fallback.next_step, 'escalate to procurement: no part meets its target');
  assert.deepEqual(ub.fallback.after_deadline, {[A]: 42.04, [B]: 41.91});
  const cv = T.actionPlan(['Cover_T1D', 'Cover_T1E'], sourcing, today);
  assert.equal(cv.plans[0].alternatives.Cover_T1D[0].change, 'replace Supplier_H with Supplier_F'); assert.equal(cv.plans[0].alternatives.Cover_T1D[0].pcf, 21.39);
});

test('internal brief and supplier letters', () => {
  const br = T.draftRequests([A, B], sourcing, today);
  assert.deepEqual(br.internal_brief.targets, {[A]: 41.44, [B]: 41.44});
  assert.deepEqual(br.internal_brief.claims.map(c => [c.ranking_break_even, c.target_break_even]), [[0.67, {[B]: 0.68}], [13.28, {[B]: 12.85}]]);
  assert.equal(br.supplier_requests.length, 1);
  const letter = br.supplier_requests[0];
  assert.deepEqual(letter.leaks, []);
  assert.equal(T.renderLetter(letter), [
    '[draft - procurement must approve before sending]',
    'To: Supplier_B (via Tier1_B)',
    'Please send evidence by 2026-11-27 for:',
    '  - Your declared recycled aluminium share of 75%',
    '    Evidence: recycled-content certificate (chain of custody)',
    '    If no evidence by the deadline: counted as 0% recycled content',
    '  - Your declared primary aluminium footprint of 10.1 kgCO2e/kg (smelter origin)',
    "    Evidence: smelter origin and the smelter's PCF",
    '    If no evidence by the deadline: counted at 13.2 kgCO2e/kg (published value for imported primary ingot)',
    'Ways to respond:',
    '  A: send existing certificate or verified PCF (about 5 days)',
    '  B: third-party verification; JLR may share the fee (50% large / 75% SME, capped) (about 30 days)',
    '  C: send partial evidence for the key claim (about 10 days)',
    '  D: state that evidence cannot be provided',
    'Our commitments:',
    ...T.COMMITMENTS.map(c => '  - ' + c),
    T.DATA_MINIMISATION].join('\n'));
  const cv = T.draftRequests(['Cover_T1D', 'Cover_T1E'], sourcing, today);
  assert.deepEqual(cv.supplier_requests.map(l => [l.to, l.via.join(), l.leaks.length]), [['Supplier_H', 'Tier1_D', 0], ['Supplier_I', 'Tier1_D', 0]]);
  assert.equal(T.draftRequests(['Housing_T1C'], sourcing, today).supplier_requests.length, 0);
});

test('leak check catches a target in a letter', () => {
  const br = T.draftRequests([A, B], sourcing, today);
  const bad = {...br.supplier_requests[0], note: 'your target is 41.44, Supplier_F is cheaper'};
  assert.deepEqual(T.leaks(bad, br.internal_brief), ['41.44', 'Supplier_F']);
});

// Scripted evidence: the demo's complete, passing statement (data.js) unless a test overrides a field
const SE = x => T.submitEvidence({...DEMO_EVIDENCE, ...x, statement: {...demoStatement(x.supplier, x.claim, x.verified_on), product: x.product, ...x.statement}});
// disclosed and responded on the day of evidence unless a test says otherwise
const assess = (name, on, evidence = {}) => T.assessImprovement({parts: [A, B], supplier: 'Supplier_B', claims: DEMO_OUTCOMES[name],
  verified_on: on, requested_on: today, sourcing_date: sourcing, evidence: {disclosed_on: on, responded_on: on, ...DEMO_EVIDENCE, ...evidence,
    statement: {...demoStatement('Supplier_B', Object.keys(DEMO_OUTCOMES[name]), on), ...evidence.statement}}});

test('evidence outcomes on time and late', () => {
  const lo = assess('lower', '2026-11-20'), hi = assess('higher', '2026-11-20');
  assert.deepEqual([lo.declared_pcf, lo.verified_pcf, lo.direction], [2.72, 2.48, 'lower than declared']);
  assert.deepEqual([lo.carbon_assessment[B].pcf, lo.carbon_assessment[B].meets_target, lo.decision], [36.26, true, 'continue_analysis']);
  assert.deepEqual([hi.verified_pcf, hi.carbon_assessment[B].pcf, hi.decision], [8.93, 72.38, 'suggest_pause']);
  assert.deepEqual(lo.treatment, hi.treatment, 'same treatment whatever the verified value');
  assert.deepEqual(lo.treatment[0], {evidence_status: 'verified', fast_track_reuse_until: '2029-11-20',
    fee_share: 'per pre-approved rule (50% large / 75% SME, capped)', timely_response: true, correction_protection: 'eligible', audit_rate_unchanged: true});
  const lol = assess('lower', '2027-01-10'), hil = assess('higher', '2027-01-10');
  assert.equal(lol.decision, 'unchanged'); assert.equal(lol.late_evidence.material, false);
  assert.deepEqual(lol.late_evidence.next_steps, ['record only; reuse in the next round']);
  assert.equal(hil.late_evidence.material, true);
  assert.deepEqual(hil.late_evidence.reasons, ['Bracket_T1B: target status would change (37.6 -> 72.38, target 41.44)', 'lower-carbon part would change: Bracket_T1B -> Bracket_T1A']);
  assert.equal(lol.treatment[0].correction_protection, 'not_eligible', 'disclosed outside the 30-day correction window');
  assert.equal(hil.decision_if_used, 'suggest_pause', 'late evidence is still assessed: the store decides whether it is used');
});

test('chain-of-custody certificate proves recycled share only', () => {
  const r = assess('lower', '2026-11-20', {verified_by: 'chain_of_custody_certificate', provider_name: 'ASI-accredited auditor'});
  assert.deepEqual(r.treatment.map(t => t.evidence_status), ['verified', 'under_review']);
  assert.equal(r.verified_pcf, 3.7); assert.equal(r.decision, 'suggest_pause');
});

test('evidence fast track reuse', () => {
  const reg = [SE({supplier: 'Supplier_B', claim: 'recycled_share', verified_value: 0.33, verified_on: '2026-11-20', product: 'aluminium'})];
  assert.equal(T.findReusable(reg, 'Supplier_B', 'recycled_share', 'aluminium', '2027-06-01').length, 1);
  assert.equal(T.findReusable(reg, 'Supplier_B', 'recycled_share', 'aluminium', '2030-01-01').length, 0);
});

// ---------- review round: evidence conditions, protection, restatement ----------
const ev = (claim, extra = {}) => SE({supplier: 'Supplier_B', claim, verified_value: claim === 'recycled_share' ? 0.65 : 6.6,
  verified_on: '2026-11-20', product: 'aluminium', ...extra});

test('evidence checks depend on the claim and the evidence type', () => {
  assert.equal(ev('recycled_share').status, 'verified'); assert.equal(ev('primary_pcf').status, 'verified');
  const fails = (claim, extra, why) => { const e = ev(claim, extra); assert.equal(e.status, 'under_review', JSON.stringify(extra)); assert.match([...e.checks_failed, ...e.scope_limits].join(), why); };
  // aluminium PCF / smelter origin: unit, boundary, product, period, scope, source identity, supply relationship
  fails('primary_pcf', {statement: {unit: 'piece'}}, /per piece/);
  fails('primary_pcf', {statement: {boundary: 'gate-to-gate'}}, /boundary/);
  fails('primary_pcf', {statement: {product: 'steel'}}, /covers steel/);
  fails('primary_pcf', {statement: {period_end: '2023-12-31'}}, /not current/);
  fails('primary_pcf', {statement: {scope: ['recycled_share']}}, /outside the statement's scope/);
  fails('primary_pcf', {statement: {smelter: ''}}, /smelter not named/);
  fails('primary_pcf', {statement: {supply_relationship: 'not_confirmed'}}, /not confirmed/);
  // recycled content: definition, chain-of-custody model, product/batch, validity
  fails('recycled_share', {statement: {content_definition: 'unspecified'}}, /definition/);
  fails('recycled_share', {statement: {product: 'steel'}}, /certificate covers steel/);
  fails('recycled_share', {statement: {valid_until: '2026-06-30'}}, /expired/);
  fails('recycled_share', {statement: {site: 'Supplier_B_plant2'}}, /site/);
  // unit and boundary are not recycled-content checks; a percentage certificate is not judged per kg
  assert.equal(ev('recycled_share', {statement: {unit: '%', boundary: 'n/a'}}).status, 'verified');
  // assurance level and opinion apply to verification statements, not to chain-of-custody certificates
  fails('recycled_share', {assurance_level: 'none'}, /assurance/);
  fails('recycled_share', {statement: {opinion: 'qualified'}}, /qualified/);
  assert.equal(ev('recycled_share', {verified_by: 'chain_of_custody_certificate', assurance_level: 'none', statement: {opinion: 'n/a'}}).status, 'verified');
  fails('primary_pcf', {verified_by: 'chain_of_custody_certificate'}, /cannot prove/);
  // mass balance is a demo scope limit, not a failure: it goes to the analyst with no check failed
  const mb = ev('recycled_share', {statement: {chain_of_custody: 'mass_balance'}});
  assert.deepEqual([mb.status, mb.checks_failed.length], ['under_review', 0]); assert.match(mb.scope_limits[0], /demo's automatic scope/);
});

test('correction protection needs an actual disclosure, judged by its date; responding is separate', () => {
  const on = {requested_on: '2026-10-28', responded_on: '2026-10-30'};
  assert.equal(T.treatment(ev('recycled_share', on)).correction_protection, 'no_disclosure', 'choosing a route is not a disclosure');
  assert.equal(T.treatment(ev('recycled_share', on)).timely_response, true);
  const slow = ev('recycled_share', {...on, disclosed_on: '2026-11-05', verified_on: '2026-12-20'});
  assert.equal(T.treatment(slow).correction_protection, 'eligible', 'disclosed in 8 days, verifier took longer');
  assert.equal(T.treatment(ev('recycled_share', {...on, disclosed_on: '2026-12-10'})).correction_protection, 'not_eligible');
  assert.equal(T.treatment(ev('recycled_share', {source: 'audit'})).correction_protection, 'fact_finding');
  assert.equal(T.treatment(ev('recycled_share', {source: 'voluntary', disclosed_on: '2026-11-20'})).correction_protection, 'eligible');
});

test('restated per-kg value clears the unit problem and is checked against the model', () => {
  const g = T.buildGraph({restated: {Supplier_D: 13.5}});
  assert.deepEqual(T.dataProblems(g, ['Housing_T1C']), []);
  assert.deepEqual(T.restatementCheck(g, 'Supplier_D'), {supplier: 'Supplier_D', restated: 13.5, model: 13.35, consistent: true});
  assert.equal(T.restatementCheck(T.buildGraph({restated: {Supplier_D: 4}}), 'Supplier_D').consistent, false);
  assert.notEqual(T.decide(['Housing_T1C'], {restated: {Supplier_D: 13.5}}).reasons[0], 'Supplier_D: declared per piece, not per kg');
});

// ---------- round 7: shared smelter, origin link, ties ----------
test('shared smelter verified through Supplier_B: H and I still owe an origin link', () => {
  const pcf = SE({supplier: 'Supplier_B', claim: 'primary_pcf', verified_value: 10.1, verified_on: '2026-11-10', product: 'aluminium'});
  const ctx = {registry: [pcf], asOf: '2026-11-10'}, g = T.buildGraph(ctx);
  assert.equal(g.suppliers.Supplier_B.origin_link_verified, true);
  assert.deepEqual(g.suppliers.Supplier_H.upstream_evidence, {smelter: 'Unknown_B', smelter_pcf: 'verified', origin_link: 'pending'});
  const cv = T.decide(['Cover_T1D', 'Cover_T1E'], ctx);
  assert.deepEqual(cv.claims.map(c => `${c.node} ${c.claim}`), ['Supplier_H origin_link', 'Supplier_I origin_link', 'Supplier_K recycled_share']);
  // gap tested at the conservative primary value, as if the metal came from somewhere else
  assert.equal(T.listGaps(g, ['Cover_T1D']).find(x => x.node === 'Supplier_H').test_values[0], 13.2);
  const link = (product, on = '2026-11-12') => SE({supplier: 'Supplier_H', claim: 'origin_link', verified_value: null, verified_on: on, product, verified_by: 'origin_document_check'});
  const ok = T.buildGraph({registry: [pcf, link('aluminium')], asOf: '2026-11-12'});
  assert.equal(ok.suppliers.Supplier_H.origin_link_verified, true); assert.equal(ok.suppliers.Supplier_I.origin_link_verified, false);
  // a link for another product does not count against this smelter PCF
  const bad = T.buildGraph({registry: [pcf, link('steel')], asOf: '2026-11-12'});
  assert.equal(bad.suppliers.Supplier_H.origin_link_verified, false);
  assert.equal(SE({supplier: 'Supplier_H', claim: 'origin_link', verified_value: null, verified_on: '2026-11-12', product: 'aluminium', verified_by: 'chain_of_custody_certificate'}).status, 'under_review');
});

test('one letter per supplier of a shared smelter; ties have no winner', () => {
  const plan = T.actionPlan(['Cover_T1D', 'Cover_T1E'], sourcing, today);
  assert.deepEqual(plan.plans.map(p => [p.claim, p.request.to_all.join(), p.request.via.join()]), [['Unknown_B primary_pcf', 'Supplier_H,Supplier_I', 'Tier1_D']]);
  assert.equal(T.lowerCarbon({X: 30, Y: 30}), null); assert.equal(T.lowerCarbon({X: 30, Y: 31}), 'X');
});

test('benchmark scenarios change targets only, never pcf', () => {
  const at = q => T.buildGraph({benchmark: {q}});
  assert.deepEqual(['P10', 'P25', 'P50'].map(k => T.co2eTarget(at(T.BENCHMARK_SCENARIOS[k]), B)), [33.04, 41.44, 42.64]);
  assert.deepEqual(['P10', 'P50'].map(k => T.partPcf(at(T.BENCHMARK_SCENARIOS[k]), B)), [37.6, 37.6]);
});

// ---------- acceptance review regressions ----------
test('regression: a submission without a statement is not verified; missing fields go to review', () => {
  const e = T.submitEvidence({supplier: 'Supplier_B', claim: 'recycled_share', verified_value: 0.65, verified_on: '2026-11-20', product: 'aluminium'});
  assert.equal(e.status, 'under_review');
  assert.ok(e.checks_failed.some(f => /not stated/.test(f)), e.checks_failed.join('; '));
  assert.ok(e.checks_failed.includes('assurance level not stated') || e.checks_failed.includes('verified by not stated'));
});

test('regression: evidence stops counting at the earlier of its own expiry and the reuse limit', () => {
  const e = SE({supplier: 'Supplier_B', claim: 'recycled_share', verified_value: 0.65, verified_on: '2026-11-20', product: 'aluminium', statement: {valid_until: '2027-03-31'}});
  assert.equal(e.status, 'verified');
  assert.equal(T.findReusable([e], 'Supplier_B', 'recycled_share', 'aluminium', '2027-03-31').length, 1);
  assert.equal(T.findReusable([e], 'Supplier_B', 'recycled_share', 'aluminium', '2027-04-01').length, 0, 'expired certificate is not reused');
  const g = d => T.nodePcf(T.buildGraph({registry: [e], asOf: d}), 'Supplier_B');
  assert.notEqual(g('2027-03-01'), g('2027-04-01'), 'expired certificate no longer changes the footprint');
  assert.equal(g('2027-04-01'), T.nodePcf(T.buildGraph({registry: [], asOf: '2027-04-01'}), 'Supplier_B'));
});

test('regression: values are range-checked in the domain', () => {
  const at = (claim, v) => () => SE({supplier: 'Supplier_B', claim, verified_value: v, verified_on: '2026-11-20', product: 'aluminium'});
  assert.throws(at('recycled_share', 2), /between 0 and 1/);
  assert.throws(at('recycled_share', -0.1), /between 0 and 1/);
  assert.throws(at('recycled_share', NaN), /must be a number/);
  assert.throws(at('primary_pcf', 0), /above 0/);
  assert.throws(at('origin_link', 1), /no value/);
  assert.equal(at('recycled_share', 1)().status, 'verified');
});

console.log(`\n${n} tests passed`);
