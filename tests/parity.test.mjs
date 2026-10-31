// Parity: the JS port (src/domain.js) must give the same decisions as the
// Python oracle on the same random supply chains (tests/parity_cases.json,
// exported from evals/gen_cases.py). Run: node tests/parity.test.mjs
import fs from 'node:fs';
import {SMELTERS, PCF_RECORDS, PARTS} from '../src/data.js';
import {decide} from '../src/domain.js';

const cases = JSON.parse(fs.readFileSync(new URL('./parity_cases.json', import.meta.url)));
const swap = (arr, rows) => { arr.length = 0; arr.push(...structuredClone(rows)); };
const saved = [structuredClone(SMELTERS), structuredClone(PCF_RECORDS), structuredClone(PARTS)];
let ok = 0, claimOk = 0, claimTotal = 0; const fails = [];
for (const c of cases) {
  swap(SMELTERS, c.data.smelters); swap(PCF_RECORDS, c.data.pcf_records); swap(PARTS, c.data.parts);
  const got = decide(c.parts);
  const labels = Object.fromEntries(got.claims.map(x => [`${x.node} ${x.claim}`, x.decision]));
  const same = got.decision === c.decision;
  ok += same;
  for (const [k, v] of Object.entries(c.claims)) { claimTotal++; claimOk += labels[k] === v; }
  if (!same || Object.entries(c.claims).some(([k, v]) => labels[k] !== v)) fails.push({id: c.id, expected: c.decision, got: got.decision});
}
swap(SMELTERS, saved[0]); swap(PCF_RECORDS, saved[1]); swap(PARTS, saved[2]);
console.log(`parity: decisions ${ok}/${cases.length}, claim labels ${claimOk}/${claimTotal}`);
fails.slice(0, 5).forEach(f => console.log('FAIL', JSON.stringify(f)));
process.exit(fails.length ? 1 : 0);
