// Round 7: benchmark sensitivity. A port of carbontrace-code/round7/benchmark.py.
// The CO2e target uses P25 of fully verified suppliers [Assumption]. This checks whether sourcing conclusions depend on that
// choice. It changes only the target line, never a supplier's pcf. Leave-one-out is a robustness check, not a confidence interval.
import {buildGraph, partPcf, co2eTarget, decide, lowerCarbon, benchmarkGroup, percentileInclusive, BENCHMARK_SCENARIOS, BENCHMARK_PERCENTILE} from './domain.js';
import {COMPARISONS} from './network.js';

export const SCENARIOS = BENCHMARK_SCENARIOS;
export const BENCHMARK_NOTE = 'Current modelling assumption. Actual JLR benchmark methodology is not publicly specified.';
const r4 = x => Number(x.toFixed(4));

// Target, status, ranking and decision for every comparison under one benchmark setting.
export function withBenchmark(q = BENCHMARK_PERCENTILE, exclude = [], ctx = {}) {
  const c = {...ctx, benchmark: {q, exclude}}, g = buildGraph(c), out = {};
  for (const [k, parts] of Object.entries(COMPARISONS)) {
    const pcfs = Object.fromEntries(parts.map(p => [p, partPcf(g, p)])), targets = Object.fromEntries(parts.map(p => [p, co2eTarget(g, p)]));
    out[k] = {target_value: targets, target_status: Object.fromEntries(parts.map(p => [p, pcfs[p] <= targets[p]])),
      lower_carbon: lowerCarbon(pcfs), decision: decide(parts, c).decision};
  }
  return out;
}

export function compareToDefault(result, def) {
  return Object.fromEntries(Object.entries(result).map(([k, r]) => { const d = def[k];
    return [k, {...r, ranking_changed: r.lower_carbon !== d.lower_carbon, // the target line never changes the pcf, so this stays false
      target_status_changed: Object.keys(r.target_status).filter(p => r.target_status[p] !== d.target_status[p]).sort(),
      decision_changed: r.decision !== d.decision}]; }));
}

export function benchmarkSensitivity(ctx = {}) {
  const def = withBenchmark(BENCHMARK_PERCENTILE, [], ctx), group = benchmarkGroup(), out = {group, scenarios: {}};
  for (const [name, q] of Object.entries(SCENARIOS))
    out.scenarios[name] = {per_kg: r4(percentileInclusive(Object.values(group), q)), comparisons: compareToDefault(withBenchmark(q, [], ctx), def)};
  // a comparison is sensitive if any scenario changes a target status or the decision
  out.decision_sensitive_to_benchmark = Object.fromEntries(Object.keys(COMPARISONS).map(k => [k,
    Object.values(out.scenarios).some(s => s.comparisons[k].target_status_changed.length > 0 || s.comparisons[k].decision_changed)]));
  return out;
}

// Drop one verified supplier at a time and recompute P25.
export function leaveOneOut(ctx = {}) {
  const def = withBenchmark(BENCHMARK_PERCENTILE, [], ctx), group = benchmarkGroup(), p25 = percentileInclusive(Object.values(group), 0.25);
  const rows = Object.keys(group).sort().map(s => {
    const rest = Object.entries(group).filter(([k]) => k !== s).map(([, v]) => v), q = percentileInclusive(rest, 0.25);
    const r = compareToDefault(withBenchmark(0.25, [s], ctx), def);
    return {left_out: s, pcf: group[s], p25_per_kg: r4(q), change_per_kg: r4(q - p25),
      status_changes: Object.fromEntries(Object.entries(r).filter(([, v]) => v.target_status_changed.length).map(([k, v]) => [k, v.target_status_changed])),
      decision_changes: Object.fromEntries(Object.entries(r).filter(([, v]) => v.decision_changed).map(([k, v]) => [k, v.decision]))};
  });
  const span = rows.map(r => r.p25_per_kg), maxAbs = Math.max(...rows.map(x => Math.abs(x.change_per_kg)));
  return {p25_per_kg: r4(p25), rows, range_per_kg: [Math.min(...span), Math.max(...span)],
    largest_effect: rows.filter(r => Math.abs(r.change_per_kg) === maxAbs).map(r => r.left_out)};
}
