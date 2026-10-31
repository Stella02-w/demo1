// Python and JavaScript use the same percentile definition for the CO2e target.
// Cases come from twin.percentile_inclusive (carbontrace-code/round7/parity).
import {readFileSync} from 'node:fs';
import {percentileInclusive, round2} from '../src/domain.js';

const cases = JSON.parse(readFileSync(new URL('./percentile_cases.json', import.meta.url)));
let same = 0, sameTarget = 0;
const bad = [];
for (const c of cases) {
  const p = percentileInclusive(c.values, c.q);
  if (p === c.percentile) same++; else bad.push({...c, js: p});
  if (round2(c.kg * p) === c.target) sameTarget++; else bad.push({...c, jsTarget: round2(c.kg * p)});
}
console.log(`percentile: ${same}/${cases.length} identical floats; target: ${sameTarget}/${cases.length} identical`);
if (bad.length) { console.log(bad.slice(0, 5)); process.exit(1); }
