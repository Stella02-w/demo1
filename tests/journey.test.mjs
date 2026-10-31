// End-to-end journeys through the reducer, one per business path.
// Run: node tests/journey.test.mjs
import assert from 'node:assert/strict';
import {reduce, initialState, view, inbox, todos, overview} from '../src/store.js';
import {DEMO_OUTCOMES, demoStatement} from '../src/data.js';
import * as T from '../src/domain.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const buyer = {role: 'buyer', org: 'JLR'}, analyst = {role: 'analyst', org: 'JLR'}, committee = {role: 'committee', org: 'JLR'};
const t1 = org => ({role: 'tier1', org}), sup = org => ({role: 'supplier', org});
// scripted evidence carries the demo's complete statement (data.js demoStatement) unless a test submits it raw
const withDemo = (s, a) => a.type !== 'submit_evidence' || a.raw || a.per_kg_value != null ? a
  : {...a, statement: {...demoStatement(a.actor.org, Object.keys(a.values || {}), a.verified_on || s.today), ...a.statement}};
const run = (s, ...actions) => actions.reduce((st, a) => reduce(st, withDemo(st, a)), s);
const reqFor = (s, to) => s.requests.filter(r => r.to === to && r.status !== 'withdrawn').at(-1);

// request -> approve -> forward -> option -> evidence
function sendBracket(s) {
  s = run(s, {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'request'});
  const id = reqFor(s, 'Supplier_B').id;
  return [run(s, {type: 'approve_request', actor: buyer, id}, {type: 'forward', actor: t1('Tier1_B'), id}), id];
}
const disclose = (id, claims = ['recycled_share'], note = 'the 75% share was an estimate, not a certified figure') => ({type: 'disclose', actor: sup('Supplier_B'), id, claims, note});
const evidence = (id, name, extra = {}) => ({type: 'submit_evidence', actor: sup('Supplier_B'), id, values: DEMO_OUTCOMES[name],
  verified_by: 'third_party_verification', assurance_level: 'limited', provider_name: 'Verifier X', ...extra});

test('round opens: two comparisons need review, one paused', () => {
  const s = initialState();
  assert.deepEqual(['bracket', 'cover', 'housing'].map(k => [view(s, k).verdict.decision, view(s, k).stage]),
    [['needs_human_review', 'needs_action'], ['needs_human_review', 'needs_action'], ['suggest_pause', 'paused']]);
  assert.equal(todos(s, 'buyer').length, 3);
});

test('bracket, verified lower on time: decision updates, pack ready, committee nominates', () => {
  let [s, id] = sendBracket(initialState());
  assert.equal(reqFor(s, 'Supplier_B').deadline, '2026-11-27');
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-11-20'}, evidence(id, 'lower'));
  const r = reqFor(s, 'Supplier_B');
  assert.equal(r.status, 'verified'); assert.equal(r.assessment.on_time, true); assert.equal(r.assessment.verified_pcf, 2.48);
  const v = view(s, 'bracket');
  assert.equal(v.verdict.decision, 'continue_analysis'); assert.equal(v.basis.Bracket_T1B.pcf, 36.26); assert.equal(v.stage, 'ready');
  assert.equal(v.recommendation, 'Lower-carbon choice: Bracket_T1B (meets target)');
  s = run(s, {type: 'nominate', actor: committee, comparison: 'bracket', part: 'Bracket_T1B'});
  assert.equal(view(s, 'bracket').stage, 'nominated');
});

test('bracket, verified higher on time: same treatment, escalation', () => {
  let [lo, id] = sendBracket(initialState());
  lo = run(lo, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-11-20'});
  const hi = run(lo, evidence(id, 'higher')); lo = run(lo, evidence(id, 'lower'));
  assert.deepEqual(reqFor(lo, 'Supplier_B').assessment.treatment, reqFor(hi, 'Supplier_B').assessment.treatment);
  const v = view(hi, 'bracket');
  assert.equal(v.verdict.decision, 'suggest_pause'); assert.equal(v.basis.Bracket_T1B.pcf, 72.38);
  assert.equal(v.recommendation, 'Escalate: no part meets its CO2e target'); assert.equal(v.ready, true);
});

test('no evidence by the deadline: request expires, fallback values apply', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-12-01'});
  assert.equal(reqFor(s, 'Supplier_B').status, 'expired');
  const v = view(s, 'bracket');
  assert.deepEqual([v.basis.Bracket_T1A.pcf, v.basis.Bracket_T1B.pcf], [42.04, 96.29], 'both claims at their tested values');
  assert.equal(v.recommendation, 'Escalate: no part meets its CO2e target'); assert.equal(v.ready, true);
});

test('evidence on the deadline day is on time', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-11-27'}, evidence(id, 'higher'));
  assert.equal(reqFor(s, 'Supplier_B').assessment.on_time, true);
});

test('late evidence after nomination: snapshot stands, impact review opened and closed by the buyer', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, disclose(id), {type: 'advance_clock', to: '2026-12-15'},
    {type: 'nominate', actor: committee, comparison: 'bracket', part: 'Bracket_T1A'}, {type: 'advance_clock', to: '2027-01-10'}, evidence(id, 'lower'));
  const r = reqFor(s, 'Supplier_B');
  assert.deepEqual([r.late, r.window, r.late_impact.material], [true, 'after_nomination', true]);
  assert.equal(r.assessment.treatment[0].correction_protection, 'eligible', 'disclosed on 28 Oct; only the verifier was slow');
  let v = view(s, 'bracket');
  assert.equal(v.state.nomination.part, 'Bracket_T1A'); assert.equal(v.basis.Bracket_T1B.pcf, 96.29, 'pack shows the decision snapshot');
  assert.equal(v.late[0].after_nomination, true); assert.deepEqual(v.open_impact_reviews, [id]);
  assert.ok(todos(s, 'buyer').some(t => t.text === 'Impact review: late evidence from Supplier_B'));
  assert.throws(() => run(s, {type: 'close_impact_review', actor: sup('Supplier_B'), id, outcome: 'monitor'}), /Only Procurement buyer/);
  s = run(s, {type: 'close_impact_review', actor: buyer, id, outcome: 'refer_to_committee'});
  assert.equal(reqFor(s, 'Supplier_B').impact_review.outcome, 'refer_to_committee'); assert.equal(view(s, 'bracket').state.nomination.part, 'Bracket_T1A', 'not revoked automatically');
});

test('late evidence before nomination that changes the outcome: buyer decides whether the pack uses it', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-12-01'});
  assert.equal(reqFor(s, 'Supplier_B').status, 'expired'); assert.equal(view(s, 'bracket').ready, true, 'fallback pack was ready');
  s = run(s, evidence(id, 'lower'));
  const r = reqFor(s, 'Supplier_B');
  assert.deepEqual([r.window, r.late_impact.material, r.late_decision], ['before_nomination', true, null]);
  let v = view(s, 'bracket');
  assert.equal(v.ready, false); assert.match(v.blockers.join(), /late evidence would change the outcome/); assert.equal(v.basis.Bracket_T1B.pcf, 96.29);
  assert.throws(() => run(s, {type: 'nominate', actor: committee, comparison: 'bracket', part: 'Bracket_T1A'}), /not ready/);
  const used = run(s, {type: 'late_decision', actor: buyer, id, use: 'use'});
  assert.equal(view(used, 'bracket').basis.Bracket_T1B.pcf, 36.26); assert.equal(view(used, 'bracket').ready, true);
  // not using it needs a named issue, a reason, an approver and a follow-up; "late" is not an accepted issue
  const keep = {type: 'late_decision', actor: buyer, id, use: 'keep_fallback'};
  assert.throws(() => run(s, keep), /Name the issue/);
  assert.throws(() => run(s, {...keep, issue: 'late', reason: 'arrived late'}), /Name the issue/);
  assert.throws(() => run(s, {...keep, issue: 'review_incomplete', reason: 'analyst has not checked the smelter link'}), /Record approved by/);
  const kept = run(s, {...keep, issue: 'review_incomplete', reason: 'analyst has not checked the smelter link', approved_by: 'Category lead', follow_up: 'analyst review by 10 Dec, re-run pack'});
  const kv = view(kept, 'bracket');
  assert.equal(kv.basis.Bracket_T1B.pcf, 96.29); assert.equal(kv.ready, true);
  assert.equal(kv.late[0].record.approved_by, 'Category lead');
  assert.deepEqual(kv.late[0].values.map(v => v.verified_value), [0.65, 6.6], 'pack shows the new evidence next to the open issue');
});

test('late evidence before nomination that changes nothing is used without a decision', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-12-01'}, evidence(id, 'higher'));
  const r = reqFor(s, 'Supplier_B');
  assert.deepEqual([r.window, r.late_impact.material, r.late_decision], ['before_nomination', false, 'use']);
  assert.equal(view(s, 'bracket').basis.Bracket_T1B.pcf, 72.38, 'verified value replaces the fallback'); assert.equal(view(s, 'bracket').ready, true);
});

test('late evidence after nomination that changes nothing is recorded for the next round', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-12-15'},
    {type: 'nominate', actor: committee, comparison: 'bracket', part: null}, {type: 'advance_clock', to: '2027-01-10'}, evidence(id, 'higher'));
  assert.deepEqual(reqFor(s, 'Supplier_B').impact_review.outcome, 'record_only');
  assert.deepEqual(view(s, 'bracket').late[0].next_steps, ['record only; reuse in the next round']);
});

test('option chosen, then the deadline passes during verification: evidence is still accepted', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'A'}, {type: 'advance_clock', to: '2026-12-01'});
  assert.equal(reqFor(s, 'Supplier_B').status, 'expired');
  s = run(s, evidence(id, 'higher', {verified_on: '2026-11-30'}));
  assert.equal(reqFor(s, 'Supplier_B').status, 'verified'); assert.equal(reqFor(s, 'Supplier_B').late, true);
});

test('supplier declines (option D): fallback values, no evidence', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'D'});
  assert.equal(reqFor(s, 'Supplier_B').status, 'declined');
  assert.equal(view(s, 'bracket').basis.Bracket_T1B.pcf, 96.29); assert.equal(view(s, 'bracket').ready, true);
});

test('certificate proves recycled share only: follow-up closes the original, keeps the verified claim, fee share once', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-11-20'},
    evidence(id, 'lower', {verified_by: 'chain_of_custody_certificate', reference: 'COC-778'}));
  assert.equal(reqFor(s, 'Supplier_B').status, 'partially_verified'); assert.equal(reqFor(s, 'Supplier_B').fee_share, 'granted');
  assert.equal(view(s, 'bracket').ready, false); assert.equal(todos(s, 'analyst').length, 1);
  s = run(s, {type: 'follow_up', actor: analyst, id});
  assert.throws(() => run(s, {type: 'follow_up', actor: analyst, id}), /Already followed up/);
  const f = reqFor(s, 'Supplier_B'), orig = s.requests.find(r => r.id === id);
  assert.equal(orig.superseded_by, f.id); assert.equal(todos(s, 'analyst').length, 0);
  assert.equal(f.status, 'draft'); assert.deepEqual(f.letter.claims.map(c => c.claim), ['primary_pcf']); assert.equal(f.follow_up_of, id);
  assert.match(f.letter.options.find(o => o.option === 'B').action, /already granted under REQ-001/);
  assert.equal(s.registry.find(e => e.claim === 'recycled_share').status, 'verified', 'verified claim kept');
  s = run(s, {type: 'approve_request', actor: buyer, id: f.id}, {type: 'forward', actor: t1('Tier1_B'), id: f.id},
    {type: 'choose_option', actor: sup('Supplier_B'), id: f.id, option: 'B'},
    {type: 'submit_evidence', actor: sup('Supplier_B'), id: f.id, values: {primary_pcf: 6.6}, verified_by: 'third_party_verification', assurance_level: 'limited', reference: 'TPV-901'});
  assert.equal(reqFor(s, 'Supplier_B').fee_share, 'already granted under REQ-001');
  assert.equal(view(s, 'bracket').basis.Bracket_T1B.pcf, 36.26); assert.equal(view(s, 'bracket').ready, true);
});

test('any option may send part of the evidence; each claim is assessed on its own', () => {
  let [s, id] = sendBracket(initialState());
  const partial = {type: 'submit_evidence', actor: sup('Supplier_B'), id, values: {recycled_share: 0.65}, verified_by: 'third_party_verification', assurance_level: 'limited'};
  for (const option of ['A', 'B', 'C']) {
    const x = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option}, partial);
    assert.equal(reqFor(x, 'Supplier_B').status, 'partially_verified', option);
    assert.equal(x.registry[0].status, 'verified', option);
  }
});

test('a statement that does not match the claim, or is outside demo scope, goes to the analyst with the reason', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'A'}, evidence(id, 'lower', {statement: {chain_of_custody: 'mass_balance', supply_relationship: 'not_confirmed'}}));
  const rs = s.registry.find(x => x.claim === 'recycled_share'), pp = s.registry.find(x => x.claim === 'primary_pcf');
  assert.equal(rs.status, 'under_review'); assert.match(rs.scope_limits[0], /mass balance/); assert.equal(rs.checks_failed.length, 0, 'mass balance is not treated as invalid');
  assert.match(pp.checks_failed[0], /not confirmed/);
  const mine = inbox(s, 'supplier', 'Supplier_B')[0].entries;
  assert.match(mine.find(x => x.claim === 'recycled_share').scope_limits[0], /mass balance/, 'the supplier sees why');
  assert.equal(todos(s, 'analyst').length, 1);
});

test('registry de-duplication: a certificate on file is linked to the new request, not stored twice', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'A'}, evidence(id, 'lower', {verified_by: 'chain_of_custody_certificate', reference: 'COC-778'}),
    {type: 'follow_up', actor: analyst, id});
  const f = reqFor(s, 'Supplier_B');
  s = run(s, {type: 'approve_request', actor: buyer, id: f.id}, {type: 'forward', actor: t1('Tier1_B'), id: f.id}, {type: 'choose_option', actor: sup('Supplier_B'), id: f.id, option: 'A'});
  const n = s.registry.length;
  const again = {type: 'submit_evidence', actor: sup('Supplier_B'), id: f.id, values: {primary_pcf: 6.6}, verified_by: 'third_party_verification', assurance_level: 'limited'};
  // same certificate for the same claim: linked, no new entry
  const linked = run(s, {...again, verified_by: 'chain_of_custody_certificate', reference: 'COC-778'});
  assert.equal(linked.registry.length, n); assert.deepEqual(linked.registry.find(e => e.claim === 'primary_pcf').request_ids, [id, f.id]);
  assert.equal(reqFor(linked, 'Supplier_B').status, 'partially_verified', 'linked entry keeps its own status');
  // a new statement: new entry
  const x = run(s, {...again, reference: 'TPV-901'});
  assert.equal(x.registry.length, n + 1); assert.equal(reqFor(x, 'Supplier_B').status, 'verified');
});

test('choosing a route is not a disclosure; correction protection needs one', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'});
  assert.throws(() => run(s, {type: 'disclose', actor: sup('Supplier_B'), id, claims: ['recycled_share'], note: ' '}), /Describe/);
  assert.throws(() => run(s, {type: 'disclose', actor: sup('Supplier_B'), id, claims: ['other'], note: 'x'}), /Say which/);
  const silent = run(s, {type: 'advance_clock', to: '2026-11-20'}, evidence(id, 'higher'));
  const told = run(s, disclose(id), {type: 'advance_clock', to: '2026-11-20'}, evidence(id, 'higher'));
  const tr = x => Object.fromEntries(reqFor(x, 'Supplier_B').assessment.entries.map((e, i) => [e.claim, reqFor(x, 'Supplier_B').assessment.treatment[i]]));
  assert.equal(tr(silent).recycled_share.correction_protection, 'no_disclosure');
  assert.equal(tr(silent).recycled_share.timely_response, true, 'a timely response still gets participation support');
  assert.equal(tr(told).recycled_share.correction_protection, 'eligible');
  assert.equal(tr(told).primary_pcf.correction_protection, 'no_disclosure', 'protection covers only what was disclosed');
});

test('same treatment: change one variable at a time', () => {
  const base = () => { let [s, id] = sendBracket(initialState()); return [run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}), id]; };
  const T0 = (s, id) => reqFor(s, 'Supplier_B').assessment.treatment.find((t, i) => reqFor(s, 'Supplier_B').assessment.entries[i].claim === 'recycled_share');
  let [s0, id] = base(); s0 = run(s0, disclose(id));
  const at = (day, name, extra) => { const x = run(s0, {type: 'advance_clock', to: day}, evidence(id, name, extra)); return T0(x, id); };
  const ref = at('2026-11-20', 'lower', {verified_on: '2026-11-18'});
  assert.deepEqual(at('2026-11-20', 'higher', {verified_on: '2026-11-18'}), ref, 'verified value up or down: identical');
  assert.deepEqual(at('2026-12-01', 'lower', {verified_on: '2026-11-18'}), ref, 'arrived late, same disclosure and verifier date: identical');
  const part = run(s0, {type: 'advance_clock', to: '2026-11-20'}, {type: 'submit_evidence', actor: sup('Supplier_B'), id, values: {recycled_share: 0.65},
    verified_by: 'third_party_verification', assurance_level: 'limited', verified_on: '2026-11-18'});
  assert.deepEqual(reqFor(part, 'Supplier_B').assessment.treatment[0], ref, 'partial vs complete: the claim sent is treated the same');
});

test('proceed on an alternative while requests are out: pack ready, evidence still accepted', () => {
  let [s, id] = sendBracket(initialState());
  const alt = view(s, 'bracket').alternatives.find(o => o.change === 'source all aluminium from Supplier_F');
  s = run(s, {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'alternative', alternative: alt.id, qualified: true});
  assert.equal(reqFor(s, 'Supplier_B').status, 'forwarded'); assert.equal(view(s, 'bracket').ready, true);
  assert.throws(() => run(s, {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'request'}), /withdraw them first/);
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'A'}, evidence(id, 'lower'));
  assert.equal(reqFor(s, 'Supplier_B').status, 'verified');
  assert.ok(todos(s, 'buyer').some(t => t.text === 'New evidence from Supplier_B: check your action'));
});

test('alternative sourcing and conservative values', () => {
  let s = initialState();
  const alt = view(s, 'bracket').alternatives.find(o => o.change === 'source all aluminium from Supplier_F');
  let a = run(s, {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'alternative', alternative: alt.id});
  // a carbon-verified source is a candidate until technical and commercial qualification is recorded
  assert.equal(view(a, 'bracket').basis.Bracket_T1B.source, 'candidate alternative, not qualified'); assert.equal(view(a, 'bracket').ready, false);
  assert.throws(() => run(a, {type: 'qualify_alternative', actor: buyer, comparison: 'bracket', note: ''}), /Record who approved/);
  a = run(a, {type: 'qualify_alternative', actor: buyer, comparison: 'bracket', note: 'Supplier_F approved by engineering and SQA (simulated)'});
  assert.equal(view(a, 'bracket').basis.Bracket_T1B.pcf, 27.44); assert.equal(view(a, 'bracket').ready, true);
  const f = run(s, {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'fallback'});
  assert.equal(view(f, 'bracket').basis.Bracket_T1B.pcf, 96.29);
});

test('cover: one request per smelter supplier, both via Tier1_D', () => {
  const s = run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'cover', action: 'request'});
  assert.deepEqual(s.requests.map(r => [r.to, r.via.join()]), [['Supplier_H', 'Tier1_D'], ['Supplier_I', 'Tier1_D']]);
});

test('housing: data fix, restated per kg feeds back into the twin and the buyer chooses again', () => {
  const s = initialState();
  assert.throws(() => run(s, {type: 'choose_action', actor: buyer, comparison: 'housing', action: 'request'}), /Not available/);
  let d = run(s, {type: 'choose_action', actor: buyer, comparison: 'housing', action: 'data_fix'});
  const r = d.requests[0];
  assert.deepEqual([r.to, r.via.join(), r.kind], ['Supplier_D', 'Tier1_C', 'data_fix']);
  assert.equal(view(d, 'housing').recommendation, 'Fix the data before ranking');
  d = run(d, {type: 'approve_request', actor: buyer, id: r.id}, {type: 'forward', actor: t1('Tier1_C'), id: r.id},
    {type: 'choose_option', actor: sup('Supplier_D'), id: r.id, option: 'A'}, {type: 'submit_evidence', actor: sup('Supplier_D'), id: r.id, per_kg_value: 13.5});
  const v = view(d, 'housing');
  assert.equal(v.dataProblem, false); assert.equal(v.state.action, null); assert.equal(v.restatements[0].consistent, true);
  assert.equal(v.basis.Housing_T1C.pcf, 40.05); assert.equal(v.recommendation, 'Escalate: no part meets its CO2e target');
  assert.ok(['needs_action', 'paused'].includes(v.stage));
  d = run(d, {type: 'choose_action', actor: buyer, comparison: 'housing', action: 'fallback'});
  assert.equal(view(d, 'housing').ready, true);
  const bad = run(run(s, {type: 'choose_action', actor: buyer, comparison: 'housing', action: 'data_fix'}), {type: 'approve_request', actor: buyer, id: r.id},
    {type: 'forward', actor: t1('Tier1_C'), id: r.id}, {type: 'choose_option', actor: sup('Supplier_D'), id: r.id, option: 'A'}, {type: 'submit_evidence', actor: sup('Supplier_D'), id: r.id, per_kg_value: 4});
  assert.ok(todos(bad, 'analyst').some(t => /restated 4 vs model 13.35/.test(t.text)));
});

test('permissions: who can do what', () => {
  let s = run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'request'});
  const id = s.requests[0].id;
  assert.throws(() => run(s, {type: 'approve_request', actor: sup('Supplier_B'), id}), /Only Procurement buyer/);
  s = run(s, {type: 'approve_request', actor: buyer, id});
  assert.throws(() => run(s, {type: 'forward', actor: t1('Tier1_A'), id}), /Only Tier1_B/);
  assert.throws(() => run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}), /not open/, 'supplier waits for Tier 1');
  assert.throws(() => run(s, {type: 'nominate', actor: committee, comparison: 'bracket', part: 'Bracket_T1B'}), /not ready/);
  assert.throws(() => run(s, {type: 'nominate', actor: buyer, comparison: 'bracket'}), /Only Sourcing committee/);
});

test('visibility: Tier 2 sees no internal numbers; Tier 1 sees what it needs for its own part', () => {
  let [s, id] = sendBracket(initialState());
  const t2 = () => JSON.stringify(inbox(s, 'supplier', 'Supplier_B')), t1x = () => JSON.stringify(inbox(s, 'tier1', 'Tier1_B'));
  for (const secret of ['41.44', '0.67', '0.68', '13.28', '12.85', 'Supplier_F', 'Supplier_E', 'Bracket_T1A']) assert.ok(!t2().includes(secret), secret);
  for (const secret of ['0.67', '0.68', '13.28', '12.85', 'Supplier_F', 'Supplier_E', 'Bracket_T1A']) assert.ok(!t1x().includes(secret), secret);
  assert.deepEqual(inbox(s, 'tier1', 'Tier1_B')[0].requirements, {part: 'Bracket_T1B', part_target: 41.44, basis: 'JLR policy for this round (simulated)'});
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'B'}, {type: 'advance_clock', to: '2026-11-20'}, evidence(id, 'lower'));
  const res = inbox(s, 'tier1', 'Tier1_B')[0].result;
  assert.deepEqual([res.part_aluminium_co2e, res.meets_target, res.values.map(v => v.verified_value)], [36.26, true, [0.65, 6.6]]);
  assert.equal(inbox(s, 'tier1', 'Tier1_C').length, 0, 'other Tier 1s see nothing');
});

test('management overview follows the item to whoever has the next move', () => {
  const on = (s, k = 'bracket') => overview(s).comparisons.find(c => c.key === k).waiting_on.map(w => w.role === 'buyer' || w.role === 'analyst' || w.role === 'committee' ? w.role : w.org);
  let s = run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'request'});
  const id = reqFor(s, 'Supplier_B').id;
  assert.deepEqual(on(s), ['buyer'], 'draft to approve');
  s = run(s, {type: 'approve_request', actor: buyer, id}); assert.deepEqual(on(s), ['Tier1_B']);
  s = run(s, {type: 'forward', actor: t1('Tier1_B'), id}); assert.deepEqual(on(s), ['Supplier_B']);
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'A'}, evidence(id, 'lower', {verified_by: 'chain_of_custody_certificate'}));
  assert.deepEqual(on(s), ['analyst']);
  const o = overview(s);
  assert.equal(o.open_items.evidence_under_review, 1); assert.equal(o.todo_counts.analyst, 1); assert.equal(o.requests[0].cycle_days, 0);
  s = run(s, {type: 'follow_up', actor: analyst, id}); assert.deepEqual(on(s), ['buyer']);
  let [r, id2] = sendBracket(initialState());
  r = run(r, {type: 'choose_option', actor: sup('Supplier_B'), id: id2, option: 'B'}, {type: 'advance_clock', to: '2026-11-20'}, evidence(id2, 'lower'));
  assert.deepEqual(on(r), ['committee']); assert.equal(overview(r).stage_counts.ready, 1);
});

// ---------- round 7: shared smelter ----------
test('shared smelter: one letter each to H and I; verified via H narrows the others to an origin link', () => {
  let s = run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'cover', action: 'request'}, {type: 'choose_action', actor: buyer, comparison: 'bracket', action: 'request'});
  assert.deepEqual(s.requests.filter(r => r.comparison === 'cover').map(r => [r.to, r.letter.claims.map(c => `${c.node} ${c.claim}`).join()]),
    [['Supplier_H', 'Unknown_B primary_pcf'], ['Supplier_I', 'Unknown_B primary_pcf']]);
  for (const r of s.requests) s = run(s, {type: 'approve_request', actor: buyer, id: r.id}, {type: 'forward', actor: t1(r.via[0]), id: r.id}, {type: 'choose_option', actor: sup(r.to), id: r.id, option: 'A'});
  const h = reqFor(s, 'Supplier_H').id, i = reqFor(s, 'Supplier_I').id, b = reqFor(s, 'Supplier_B').id;
  s = run(s, {type: 'advance_clock', to: '2026-11-05'}, {type: 'submit_evidence', actor: sup('Supplier_H'), id: h, values: {primary_pcf: 10.1}, verified_by: 'third_party_verification', assurance_level: 'limited'});
  // Supplier_I: at the conservative value its origin link no longer changes the cover decision, so its request is closed
  assert.equal(s.requests.find(r => r.id === i).status, 'withdrawn');
  // Supplier_B (bracket) still matters: its smelter claim becomes an origin link, its recycled share stays
  const rb = s.requests.find(r => r.id === b);
  assert.deepEqual(rb.letter.claims.map(c => c.claim), ['recycled_share', 'origin_link']);
  assert.doesNotMatch(JSON.stringify(rb.history), /Supplier_H/, 'other customers are not named');
  assert.equal(view(s, 'cover').stage, 'ready');
  // the origin link counts only with matching product and boundary; a document check is enough
  s = run(s, {type: 'submit_evidence', actor: sup('Supplier_B'), id: b, values: {origin_link: 'confirmed', recycled_share: 0.65}, verified_by: 'third_party_verification', assurance_level: 'limited',
    statement: {scope: ['recycled_share', 'origin_link']}});
  assert.equal(s.requests.find(r => r.id === b).status, 'verified');
  const v = view(s, 'bracket');
  // every claim is now proven: 0.35 x 10.1 + 0.65 x 0.26 = 3.70 per kg -> 5.6 x 3.70 + 2.4 x 9.32 = 43.09, above the 41.44 target
  assert.deepEqual(v.verdict.claims, []); assert.equal(v.current.Bracket_T1B.pcf, 43.09);
  assert.deepEqual(v.verdict.reasons, ['no part meets its CO2e target']);
});

test('benchmark What-if moves targets and status only', () => {
  const s = initialState(), d = view(s, 'bracket'), p10 = view(s, 'bracket', {benchmark: 'P10'});
  assert.deepEqual([d.targets.Bracket_T1B, p10.targets.Bracket_T1B], [41.44, 33.04]);
  assert.deepEqual([d.current.Bracket_T1B.meets_target, p10.current.Bracket_T1B.meets_target], [true, false]);
  assert.equal(p10.current.Bracket_T1B.pcf, d.current.Bracket_T1B.pcf);
  assert.equal(p10.verdict.decision, 'suggest_pause');
});

// ---------- acceptance review regressions ----------
test('regression: each disclosed claim keeps its own disclosure date', () => {
  let [s, id] = sendBracket(initialState());
  s = run(s, {type: 'choose_option', actor: sup('Supplier_B'), id, option: 'A'}, disclose(id, ['recycled_share']),
    {type: 'advance_clock', to: '2026-12-10'}, disclose(id, ['primary_pcf'], 'smelter origin was assumed'));
  const r = s.requests.find(x => x.id === id);
  assert.deepEqual(r.disclosure.dates, {recycled_share: '2026-10-28', primary_pcf: '2026-12-10'});
  s = run(s, evidence(id, 'lower'));
  const prot = Object.fromEntries(s.registry.filter(e => e.request_id === id).map(e => [e.claim, [e.disclosed_on, T.treatment(e).correction_protection]]));
  assert.deepEqual(prot.recycled_share, ['2026-10-28', 'eligible']);
  assert.deepEqual(prot.primary_pcf, ['2026-12-10', 'not_eligible'], 'a later disclosure does not inherit the first date');
});

test('regression: a late unit restatement gets the same late handling as evidence', () => {
  let s = run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'housing', action: 'data_fix'});
  const id = s.requests[0].id;
  s = run(s, {type: 'approve_request', actor: buyer, id}, {type: 'forward', actor: t1('Tier1_C'), id}, {type: 'choose_option', actor: sup('Supplier_D'), id, option: 'A'},
    {type: 'advance_clock', to: '2026-12-01'}, {type: 'submit_evidence', actor: sup('Supplier_D'), id, per_kg_value: 13.5});
  const r = s.requests.find(x => x.id === id);
  assert.equal(r.late, true); assert.equal(r.window, 'before_nomination');
  const v = view(s, 'housing');
  assert.ok(v.late.some(l => l.id === id), 'listed with the late items');
  if (r.late_decision === null) {
    assert.equal(v.dataProblem, true, 'not used until the buyer decides');
    assert.ok(todos(s, 'buyer').some(t => t.id === id && /Late evidence/.test(t.text)));
    s = run(s, {type: 'late_decision', actor: buyer, id, use: 'use'});
  }
  assert.equal(view(s, 'housing').dataProblem, false, 'used once decided (or when it changes no outcome)');
  const onTime = run(initialState(), {type: 'choose_action', actor: buyer, comparison: 'housing', action: 'data_fix'});
  const id2 = onTime.requests[0].id;
  const t = run(onTime, {type: 'approve_request', actor: buyer, id: id2}, {type: 'forward', actor: t1('Tier1_C'), id: id2}, {type: 'choose_option', actor: sup('Supplier_D'), id: id2, option: 'A'},
    {type: 'submit_evidence', actor: sup('Supplier_D'), id: id2, per_kg_value: 13.5});
  assert.equal(t.requests[0].late, false); assert.equal(t.requests[0].window, 'on_time');
});

console.log(`\n${n} tests passed`);
