// Round 7 parity: network.js, cost.js and benchmark.js against round7_expected.json (dumped from network.py, cost_model.py, benchmark.py).
// Regenerate: python3 dump7.py tests/round7_expected.json in a copy of carbontrace-code/round7. Run: node tests/round7.test.mjs
import fs from 'node:fs';
const W = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const net = await import(W + '/src/network.js'), cost = await import(W + '/src/cost.js'), bm = await import(W + '/src/benchmark.js');
const exp = JSON.parse(fs.readFileSync(W + '/tests/round7_expected.json'));
const got = {};
got.impact = Object.fromEntries(Object.keys(exp.impact).map(n => [n, net.nodeImpact(n)]));
got.svs = net.sharedVsSeparate('Unknown_B', '2026-12-15', '2026-10-28');
got.svs_late = net.sharedVsSeparate('Unknown_B', '2026-12-15', '2026-11-20');
got.routesens = net.routeSensitivity('Unknown_B', '2026-12-15', '2026-10-28');
got.cap = cost.compare('cap'); got.budget = cost.compare('budget');
got.sweep = {cap: cost.sweep('cap'), budget: cost.sweep('budget')};
got.losing = cost.losingConditions();
got.breakeven = [{}, {d: 0.6}, {d: 1.0, r: 0.0}, {V: 0.2}, {F: 5.0}, {m: 1.0}].map(c => cost.breakEvenN(c));
got.demo = cost.demoRound();
got.bench = bm.benchmarkSensitivity(); got.loo = bm.leaveOneOut();
const norm = x => JSON.parse(JSON.stringify(x, (k, v) => Array.isArray(v) ? v : v));
let bad = 0;
function diff(a, b, p) {
  if (typeof a === 'number' && typeof b === 'number') { if (a !== b) { console.log('DIFF', p, a, b); bad++; } return; }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (a !== b) { console.log('DIFF', p, JSON.stringify(a), JSON.stringify(b)); bad++; } return; }
  const ka = Object.keys(a), kb = Object.keys(b);
  for (const k of new Set([...ka, ...kb])) { if (!(k in a) || !(k in b)) { console.log('KEY', p + '.' + k, k in a ? 'js-only' : 'py-only'); bad++; continue; } diff(a[k], b[k], p + '.' + k); }
}
diff(norm(got), exp, '');
if (bad) { console.log(`${bad} differences`); process.exit(1); } console.log("ok round7 parity: all fields equal");
