// Round 7: cross-tier impact. A port of carbontrace-code/round7/network.py.
// One smelter can feed several Tier 2 suppliers, which feed several Tier 1 parts. Click a node -> which sourcing
// comparisons it can change, and is it cheaper to verify it once upstream or each supplier? Python field names kept.
import {ROUND} from './data.js';
import {buildGraph, decide, checkFlip, checkTarget, evidenceDeadline, daysBetween, customersOf, EVIDENCE_OPTIONS, round2} from './domain.js';

// [Assumption] Demo round, same as ROUND.comparisons.
export const COMPARISONS = Object.fromEntries(ROUND.comparisons.map(c => [c.key, c.parts]));
// Relative cost units, not money. 1 unit = one third-party PCF verification. [Assumption] calibrate with verifier quotes.
export const VERIFY_COST = 1.0;
// [Assumption] A Tier 2 confirms which smelter its metal came from (purchase records, mill certificates): 0.2 units.
export const LINK_COST = 0.2;
// [Assumption] Each extra tier a request passes through adds 10 days. [Source] JLR CSR appendix (SMR): cascade Tier 1 -> Tier 2-n.
export const HOP_DAYS = 10;
const LEAD = Object.fromEntries(EVIDENCE_OPTIONS.map(o => [o.option, o.lead_days]));

const kindOf = (g, n) => g.smelters[n] ? 'smelter' : g.suppliers[n] ? 'supplier' : g.parts[n] ? 'part' : null;
// smelter -> supplier -> part edges, as in twin.build_graph
const partsOf = (g, supplier) => Object.keys(g.parts).filter(p => g.parts[p].sources.some(s => s.supplier === supplier));
const predecessors = (g, part) => g.parts[part].sources.map(s => s.supplier);
function descendants(g, node) {
  const kind = kindOf(g, node), out = new Set();
  const sups = kind === 'smelter' ? customersOf(g, node) : kind === 'supplier' ? [node] : [];
  for (const s of sups) { if (s !== node) out.add(s); for (const p of partsOf(g, s)) out.add(p); }
  return out;
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortPaths = rows => rows.sort((x, y) => { for (let i = 0; i < x.length; i++) { const c = cmp(x[i], y[i]); if (c) return c; } return 0; });

// Every smelter -> supplier -> part -> Tier 1 path through this node.
export function paths(g, node) {
  const out = [];
  for (const [s, d] of Object.entries(g.suppliers)) for (const p of partsOf(g, s))
    if ([d.smelter, s, p].includes(node)) out.push([d.smelter, s, p, g.parts[p].tier1]);
  return sortPaths(out);
}

// Which comparisons this node's unverified claims can change. Same tests as decide(): conservative value alone, and in pairs.
export function nodeImpact(node, comparisons = COMPARISONS, ctx = {}) {
  const g = buildGraph(ctx), below = descendants(g, node);
  const partsBelow = new Set([...below].filter(p => g.parts[p]));
  const result = [];
  for (const [k, parts] of Object.entries(comparisons)) {
    if (!parts.some(p => partsBelow.has(p))) continue;
    const verdict = decide(parts, ctx);
    const claims = verdict.claims.filter(c => c.node === node);
    // a data problem (e.g. per-piece unit) blocks the comparison before any claim test
    const blocked = verdict.decision === 'suggest_pause' && !verdict.claims.length ? verdict.reasons : [];
    let flipsAlone = false, flipsWith = [];
    const targetChanges = [];
    if (parts.length === 2) {
      const f = checkFlip(parts[0], parts[1], ctx);
      flipsAlone = f.single_tests.some(t => t.decision_flips && t.claims.some(c => c.node === node));
      flipsWith = [...new Set(f.pair_tests.filter(t => t.combined_risk && t.claims.some(c => c.node === node))
        .flatMap(t => t.claims.filter(o => o.node !== node).map(o => `${o.node} ${o.claim}`)))].sort();
    }
    for (const p of parts) if (checkTarget(p, ctx).single_tests.some(t => t.status_changes && t.claims.some(c => c.node === node))) targetChanges.push(p);
    result.push({
      key: k, parts,
      parts_below_node: parts.filter(p => partsBelow.has(p)).sort(),
      flips_alone: flipsAlone,         // lower-carbon choice changes
      flips_with: flipsWith,           // only together with these claims
      target_changes: targetChanges,   // parts that would miss their target
      labels: Object.fromEntries(claims.map(c => [`${c.node} ${c.claim}`, c.decision])),
      changes_decision: Boolean(flipsAlone || flipsWith.length || targetChanges.length),
      // Decision significance, kept apart from breadth and not scored: what kind of change it is.
      significance: [...(flipsAlone ? ['ranking flips'] : []), ...(flipsWith.length ? ['ranking flips together with other claims'] : []),
        ...targetChanges.map(p => `${p} would miss its target`)],
      blocked_by: blocked,
      spend: null // [Source needed] sourcing value per comparison, from procurement
    });
  }
  const kind = kindOf(g, node);
  return {
    node, layer: kind,
    verified: kind === 'smelter' ? g.smelters[node].verified : null,
    suppliers: [...below, node].filter(s => g.suppliers[s]).sort(),
    parts: [...partsBelow].sort(),
    paths: paths(g, node),
    comparisons: result,
    comparisons_changed: result.filter(c => c.changes_decision).map(c => c.key),
    breadth: result.filter(c => c.changes_decision).length // impact breadth: how many comparisons this node can change
  };
}

// [Assumption] Origin-link documents take as long as partial evidence (option C), gathered in parallel with the smelter verification.
export const LINK_DAYS = LEAD.C;
// [Assumption] Another claim on the same supplier still needs its own evidence: a full verification by default (conservative).
export const RESIDUAL_COST = VERIFY_COST;
export const RESIDUAL_DAYS = LEAD.B;
// [Assumption] Under 5 days of slack before the evidence deadline counts as at risk.
export const SLACK_WARN_DAYS = 5;
export const ROUTE_PARAMS = {link_cost: LINK_COST, hop_days: HOP_DAYS, link_days: LINK_DAYS, residual_cost: RESIDUAL_COST, residual_days: RESIDUAL_DAYS};

// Steps in one list run one after another; separate lists run in parallel.
export function routeTiming(steps, daysLeft) {
  const lead = Math.max(...steps.map(chain => chain.reduce((s, [, d]) => s + d, 0))), slack = daysLeft - lead;
  return {steps: steps.map(chain => chain.map(([name, d]) => `${name} ${d}d`)), lead_days: lead, slack_days: slack,
    feasible: slack >= 0, at_risk: slack >= 0 && slack < SLACK_WARN_DAYS};
}

// Verify the shared smelter once, or each Tier 2 supplier separately?
// Shared: 1 smelter PCF (counted once) + one origin-link check per supplier + the other claims that still matter on those suppliers.
// Separate: one full PCF verification per supplier. Only suppliers in comparisons the smelter can change are counted.
export function sharedVsSeparate(smelter, sourcingDate, today, {comparisons = COMPARISONS, ctx = {}, ...params} = {}) {
  const p = {...ROUTE_PARAMS, ...params};
  const impact = nodeImpact(smelter, comparisons, ctx), changed = impact.comparisons.filter(c => c.changes_decision);
  const g = buildGraph(ctx);
  const suppliers = [...new Set(changed.flatMap(c => c.parts_below_node.flatMap(part => predecessors(g, part).filter(s => g.suppliers[s].smelter === smelter))))].sort();
  // other claims on these suppliers that also change a decision
  const residual = [...new Set(changed.flatMap(comp => decide(comp.parts, ctx).claims
    .filter(c => suppliers.includes(c.node) && c.decision !== 'continue_analysis').map(c => `${c.node} ${c.claim}`)))].sort();
  const deadline = evidenceDeadline(sourcingDate, today), daysLeft = daysBetween(today, deadline), n = suppliers.length;
  const routes = {separate: {cost: round2(n * VERIFY_COST), requests: n, covers: 'all claims, per supplier',
    ...routeTiming([[['supplier verification (B)', LEAD.B]]], daysLeft)}};
  for (const [opt, label] of [['A', 'existing smelter PCF (A)'], ['B', 'new smelter verification (B)']]) {
    const items = {smelter_pcf: opt === 'A' ? 0.0 : VERIFY_COST, origin_links: round2(n * p.link_cost), other_claims: round2(residual.length * p.residual_cost)};
    const steps = [[['request via Tier 1 and Tier 2', p.hop_days], [label, LEAD[opt]]], [['origin-link documents', p.link_days]]];
    if (residual.length) steps.push([['other claims', p.residual_days]]);
    routes[`shared_${opt}`] = {cost: round2(Object.values(items).reduce((a, b) => a + b, 0)), cost_items: items, requests: n,
      covers: 'smelter PCF once; origin link per supplier', still_open: residual,
      reusable_for: customersOf(g, smelter), // PACT V3 p.71, after each link check
      ...routeTiming(steps, daysLeft)};
  }
  const best = names => { const ok = names.filter(k => routes[k].feasible);
    return ok.length ? ok.reduce((a, b) => (routes[b].cost < routes[a].cost || (routes[b].cost === routes[a].cost && routes[b].lead_days < routes[a].lead_days) ? b : a)) : null; };
  return {
    smelter, suppliers, comparisons_changed: changed.map(c => c.key), deadline, days_left: daysLeft, params: p, routes,
    // we do not know yet whether the smelter holds a verified PCF: ask first
    recommended: {smelter_has_verified_pcf: best(['separate', 'shared_A']), smelter_needs_new_verification: best(['separate', 'shared_B'])},
    next_round: routes.shared_B.feasible ? null : 'shared_B',
    note: 'JLR has no contract with the smelter; requests go through Tier 1 and Tier 2. Savings in later rounds are not counted in this round.'
  };
}

export const SENSITIVITY = {link_cost: [0.1, 0.2, 0.5], hop_days: [5, 10, 20], residual_cost: [0.5, 1.0, 1.5], residual_days: [5, 30]};

// Change one route assumption at a time; does the recommendation change?
export function routeSensitivity(smelter, sourcingDate, today, ctx = {}) {
  const rows = [];
  for (const [name, values] of Object.entries(SENSITIVITY)) for (const v of values) {
    const r = sharedVsSeparate(smelter, sourcingDate, today, {ctx, [name]: v});
    rows.push({param: name, value: v, ...Object.fromEntries(Object.entries(r.routes).map(([k, x]) => [k, [x.cost, x.lead_days, x.slack_days]])), recommended: r.recommended});
  }
  return rows;
}
