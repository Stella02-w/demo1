// Independent hand calculations. Parity tests show JS = Python; these show the numbers follow from the formula,
// written out by hand from the raw records, without calling the twin. Run: node tests/handcalc.test.mjs
// Every number here depends on RECYCLED = 0.26, whose source is not confirmed: treat the results as unvalidated demo values.
import assert from 'node:assert/strict';
import * as T from '../src/domain.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const r2 = x => Math.round(x * 100) / 100;
const RECYCLED = 0.26; // kgCO2e per kg of 100% recycled aluminium (unconfirmed)
// supplier PCF = (1 - recycled share) x primary factor + recycled share x RECYCLED, rounded to 2 dp per supplier
const sup = (share, primary) => r2((1 - share) * primary + share * RECYCLED);

test('supplier and part values from the formula', () => {
  const B = sup(0.75, 10.1);   // 0.25 x 10.1 + 0.75 x 0.26 = 2.525 + 0.195 = 2.72
  const A = sup(0.30, 13.2);   // 0.70 x 13.2 + 0.30 x 0.26 = 9.24 + 0.078 = 9.32
  const C = sup(0.20, 6.6), E = sup(0.50, 10.1);
  assert.deepEqual([B, A, C, E], [2.72, 9.32, 5.33, 5.18]);
  // Bracket_T1B: 8 kg, 70% from B, 30% from A -> 8 x (0.7 x 2.72 + 0.3 x 9.32) = 8 x 4.70 = 37.60
  assert.equal(r2(8 * 0.7 * B + 8 * 0.3 * A), 37.6);
  // Bracket_T1A: 8 kg, 50/50 C and E -> 4 x 5.33 + 4 x 5.18 = 42.04
  assert.equal(r2(4 * C + 4 * E), 42.04);
  const g = T.buildGraph();
  assert.deepEqual([T.partPcf(g, 'Bracket_T1B'), T.partPcf(g, 'Bracket_T1A')], [37.6, 42.04]);
});

test('target: first quartile (inclusive) of verified suppliers x part kg', () => {
  // verified suppliers: A 9.32, C 5.33, E 5.18, F 3.43, G 11.91 -> sorted 3.43, 5.18, 5.33, 9.32, 11.91
  const v = [sup(0.3, 13.2), sup(0.2, 6.6), sup(0.5, 10.1), sup(0.5, 6.6), sup(0.1, 13.2)].sort((a, b) => a - b);
  assert.deepEqual(v, [3.43, 5.18, 5.33, 9.32, 11.91]);
  const q1 = v[(v.length - 1) * 0.25]; // inclusive method, position 1 -> 5.18
  assert.equal(q1, 5.18);
  assert.deepEqual([r2(8 * q1), r2(6 * q1), r2(3 * q1)], [41.44, 31.08, 15.54]);
  const g = T.buildGraph();
  assert.deepEqual(['Bracket_T1B', 'Cover_T1D', 'Housing_T1C'].map(p => T.co2eTarget(g, p)), [41.44, 31.08, 15.54]);
});

test('joint stress: the primary factor applies only to the primary share (no double adjustment)', () => {
  // recycled share tested at 0% and primary at 13.2: B = 1.0 x 13.2 + 0 x 0.26 = 13.2 (not 13.2 on top of a recycled credit)
  const B = sup(0, 13.2);
  assert.equal(B, 13.2);
  assert.equal(r2(8 * 0.7 * B + 8 * 0.3 * sup(0.3, 13.2)), 96.29); // 73.92 + 22.37
  // recycled share alone at 0%, primary as declared: 10.1 -> 8 x (0.7 x 10.1 + 0.3 x 9.32) = 78.93
  assert.equal(r2(8 * 0.7 * sup(0, 10.1) + 8 * 0.3 * 9.32), 78.93);
  // primary alone at 13.2, share as declared: 0.25 x 13.2 + 0.195 = 3.495 -> 3.50 (rounded per supplier) -> 41.91
  assert.equal(r2(8 * 0.7 * sup(0.75, 13.2) + 8 * 0.3 * 9.32), 41.91);
  const f = T.checkFlip('Bracket_T1A', 'Bracket_T1B');
  assert.deepEqual([...f.single_tests.map(t => t.Bracket_T1B), f.pair_tests[0].Bracket_T1B], [78.93, 41.91, 96.29]);
});

test('break-even: recycled share at which T1B equals T1A', () => {
  // 8 x 0.7 x ((1-s) x 10.1 + 0.26 s) + 22.368 = 42.04 -> 5.6 x (10.1 - 9.84 s) = 19.672 -> s = (10.1 - 3.5129) / 9.84 = 0.6694
  const s = (10.1 - (42.04 - 8 * 0.3 * 9.32) / 5.6) / 9.84;
  assert.equal(r2(s), 0.67);
  assert.equal(T.checkFlip('Bracket_T1A', 'Bracket_T1B').gaps[0].break_even, 0.67);
});

test('demo outcomes: verified lower and higher', () => {
  // lower: 65% recycled, EU smelter 6.6 -> 0.35 x 6.6 + 0.65 x 0.26 = 2.31 + 0.169 = 2.48; T1B = 5.6 x 2.48 + 22.368 = 36.26
  assert.equal(sup(0.65, 6.6), 2.48); assert.equal(r2(5.6 * 2.48 + 2.4 * 9.32), 36.26);
  // higher: 33% recycled, imported 13.2 -> 0.67 x 13.2 + 0.33 x 0.26 = 8.844 + 0.0858 = 8.93; T1B = 5.6 x 8.93 + 22.368 = 72.38
  assert.equal(sup(0.33, 13.2), 8.93); assert.equal(r2(5.6 * 8.93 + 2.4 * 9.32), 72.38);
});

console.log(`\n${n} tests passed`);
