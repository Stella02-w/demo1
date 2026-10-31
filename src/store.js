// Journey state. Every user action is an event; `reduce` checks who may do it and when.
// Numbers are never stored here: they are derived from domain.js on read.
// Shared by all pages through localStorage, so a supplier's reply shows up in the buyer's workbench.
import * as T from './domain.js';
import {ROUND, PCF_RECORDS} from './data.js';

export const ROLES = {
  buyer: {label: 'Procurement buyer', org: 'JLR'},
  analyst: {label: 'Carbon analyst', org: 'JLR'},
  committee: {label: 'Sourcing committee', org: 'JLR'},
  manager: {label: 'Procurement manager', org: 'JLR'}, // reads the round overview; takes no actions in it
  tier1: {label: 'Tier 1 supplier', org: null},
  supplier: {label: 'Tier 2 supplier', org: null}
};

export const initialState = () => ({
  v: 1,
  today: ROUND.opened_on,
  seq: 0,
  registry: [],
  comparisons: Object.fromEntries(ROUND.comparisons.map(c => [c.key, {action: null, alternative: null, decided_on: null, nomination: null}])),
  requests: [],
  log: []
});

// ---------- helpers ----------
const cmpDef = k => ROUND.comparisons.find(c => c.key === k);
// Per-kg restatements from data-fix requests feed back into the twin.
// Restated per-kg values in use: a late restatement counts only once the buyer decides to use it, like late evidence.
export const restatedOf = (s, use = new Set(), drop = new Set()) => Object.fromEntries(s.requests
  .filter(r => r.kind === 'data_fix' && r.status === 'restated' && !drop.has(r.id) && (usedThisRound(r) || use.has(r.id))).map(r => [r.to, r.submission.per_kg_value]));
export const ctxOf = s => ({registry: s.registry, asOf: s.today, restated: restatedOf(s)});
// The Tier 1 part a request is about (the Tier 1 owns it and the supplier feeds it).
const partOf = (r) => { const g = T.buildGraph(); return cmpDef(r.comparison).parts.find(p => g.parts[p].tier1 === r.via[0] && T.isUpstream(g, r.to, p)); };
// Request chain: a follow-up and the request it follows. Fee share is granted once per chain.
const chainOf = (s, r) => { const out = []; for (let x = r; x; x = s.requests.find(y => y.id === x.follow_up_of)) out.push(x); return out; };
const OPEN = ['approved', 'forwarded', 'responded'];
const CLOSED = ['verified', 'partially_verified', 'declined', 'expired', 'withdrawn', 'restated'];
const err = m => { throw new Error(m); };
// Reasons a buyer may keep fallback values despite material late evidence. "It was late" is deliberately not one.
export const LATE_ISSUES = {applicability: 'evidence may not apply (product, site, period or scope)', review_incomplete: 'analyst review not finished', procedural: 'procedural issue with the submission'};
const linkedTo = (e, id) => (e.request_ids || [e.request_id]).includes(id);
const note = (s, actor, action, target, detail = '') => s.log.push({on: s.today, actor, action, target, detail});
const hist = (r, s, actor, event, detail = '') => r.history.push({on: s.today, actor, event, detail});

// ---------- reducer ----------
// action = {type, actor: {role, org}, ...payload}. Returns a new state or throws with a reason the UI can show.
export function reduce(prev, a) {
  const s = structuredClone(prev);
  const who = a.actor || {};
  const need = (role, org) => { if (who.role !== role) err(`Only ${ROLES[role].label} can do this`); if (org && who.org !== org) err(`Only ${org} can do this`); };
  const req = id => s.requests.find(r => r.id === id) || err('Request not found');

  switch (a.type) {
    case 'choose_action': { // buyer picks how to resolve a flagged comparison
      need('buyer');
      const c = s.comparisons[a.comparison] || err('Unknown comparison');
      if (c.nomination) err('Already nominated');
      const v = view(prev, a.comparison);
      if (v.verdict.decision === 'continue_analysis' && !v.verdict.reasons.length) err('Nothing to resolve: the comparison can be ranked as it is');
      const allowed = v.dataProblem ? ['data_fix', 'exclude'] : ['request', 'alternative', 'fallback'];
      if (!allowed.includes(a.action)) err(`Not available here: ${a.action}`);
      // Requests already out stay open when the buyer proceeds on an alternative or conservative values:
      // evidence is still welcome, is recorded for reuse, and is assessed if it arrives before nomination.
      if (['request', 'data_fix'].includes(a.action) && s.requests.some(r => r.comparison === a.comparison && OPEN.includes(r.status))) err('Requests are already out; withdraw them first');
      // replace any unsent drafts from an earlier choice
      s.requests.filter(r => r.comparison === a.comparison && r.status === 'draft').forEach(r => { r.status = 'withdrawn'; hist(r, s, 'buyer', 'withdrawn', 'buyer changed action'); });
      c.action = a.action; c.decided_on = s.today; c.alternative = null;
      if (a.action === 'request') {
        const out = T.draftRequests(cmpDef(a.comparison).parts, ROUND.sourcing_date, s.today, ctxOf(prev));
        for (const letter of out.supplier_requests) s.requests.push(newRequest(s, a.comparison, 'evidence', letter));
      } else if (a.action === 'alternative') {
        const opt = v.alternatives.find(o => o.id === a.alternative) || err('Pick one of the listed alternatives');
        // A verified carbon record does not make a source buyable: material, process, quality, capacity and delivery need sign-off.
        c.alternative = {...opt, qualification: a.qualified ? {on: s.today, note: a.qualification_note || 'technical and commercial qualification approved (simulated premise)'} : null};
      } else if (a.action === 'data_fix') {
        for (const p of v.problems) s.requests.push(newRequest(s, a.comparison, 'data_fix', dataFixLetter(p, s)));
      }
      note(s, 'buyer', 'chose action', a.comparison, a.action + (c.alternative ? `: ${c.alternative.change}` : ''));
      return s;
    }
    case 'qualify_alternative': { // buyer records that the candidate source passed technical and commercial qualification
      need('buyer');
      const c = s.comparisons[a.comparison] || err('Unknown comparison');
      if (c.action !== 'alternative' || !c.alternative) err('No alternative chosen');
      if (c.alternative.qualification) err('Already qualified');
      if (!(a.note || '').trim()) err('Record who approved the qualification');
      c.alternative.qualification = {on: s.today, note: a.note.trim()};
      note(s, 'buyer', 'qualified alternative', a.comparison, a.note.trim());
      return s;
    }
    case 'withdraw_requests': {
      need('buyer');
      for (const r of s.requests.filter(r => r.comparison === a.comparison && ['draft', ...OPEN].includes(r.status))) { r.status = 'withdrawn'; hist(r, s, 'buyer', 'withdrawn'); }
      s.comparisons[a.comparison].action = null;
      note(s, 'buyer', 'withdrew requests', a.comparison);
      return s;
    }
    case 'approve_request': { // nothing leaves JLR without a buyer's approval and a clean leak check
      need('buyer');
      const r = req(a.id);
      if (r.status !== 'draft') err('Only drafts can be approved');
      if (r.letter.leaks && r.letter.leaks.length) err(`Letter leaks internal data: ${r.letter.leaks.join(', ')}`);
      r.status = 'approved'; r.requested_on = s.today;
      r.letter.deadline = r.deadline = T.evidenceDeadline(ROUND.sourcing_date, s.today);
      r.letter.status = 'approved by procurement';
      hist(r, s, 'buyer', 'approved and sent', `to ${r.via.join(', ')}`);
      note(s, 'buyer', 'approved request', r.id, `${r.to} via ${r.via.join(', ')}`);
      return s;
    }
    case 'remind': {
      need('buyer');
      const r = req(a.id);
      if (!OPEN.includes(r.status)) err('Nothing to remind');
      hist(r, s, 'buyer', 'reminder sent', r.status === 'approved' ? `to ${r.via.join(', ')}` : `to ${r.to}`);
      return s;
    }
    case 'forward': { // Tier 2 has no contract with JLR: the request goes through Tier 1
      const r = req(a.id);
      need('tier1', r.via[0]);
      if (r.status !== 'approved') err('Nothing to forward');
      r.status = 'forwarded'; hist(r, s, r.via[0], 'forwarded', `to ${r.to}`);
      return s;
    }
    case 'choose_option': {
      const r = req(a.id);
      need('supplier', r.to);
      // a reply after the deadline is still accepted; it is assessed as late evidence
      if (!(r.status === 'forwarded' || (r.status === 'expired' && !r.option))) err('This request is not open for a reply');
      if (!r.letter.options.some(o => o.option === a.option)) err('Option not offered');
      r.option = a.option;
      r.responded_on = s.today; // answered the request (participation); this is not a disclosure
      if (a.option === 'D') { r.status = 'declined'; r.closed_on = s.today; hist(r, s, r.to, 'stated evidence cannot be provided', 'fallback values apply'); }
      else { if (r.status !== 'expired') r.status = 'responded'; hist(r, s, r.to, `chose option ${a.option}`); }
      return s;
    }
    case 'disclose': { // the supplier states what was wrong or limited in its declared values; this, not a response click, starts correction protection
      const r = req(a.id);
      need('supplier', r.to);
      if (!['forwarded', 'responded', 'expired'].includes(r.status) || r.option === 'D') err('This request is not open');
      const claims = (a.claims || []).filter(c => r.letter.claims.some(lc => lc.claim === c));
      if (!claims.length) err('Say which declared value the disclosure is about');
      if (!(a.note || '').trim()) err('Describe what was wrong or limited');
      // each claim keeps the date it was first disclosed; a claim added later does not inherit an earlier date
      const dates = {...(r.disclosure?.dates || {})}; for (const c of claims) dates[c] ??= s.today;
      r.disclosure = {on: r.disclosure?.on || s.today, claims: Object.keys(dates), dates, note: a.note.trim()};
      hist(r, s, r.to, 'disclosed', `${claims.join(', ')}: ${a.note.trim()}`);
      note(s, r.to, 'disclosed a correction', r.id, claims.join(', '));
      return s;
    }
    case 'submit_evidence': {
      const r = req(a.id);
      need('supplier', r.to);
      // open after any option but D, including after the deadline (assessed as late evidence)
      if (!(r.status === 'responded' || (r.status === 'expired' && r.option && r.option !== 'D'))) err('Choose how you will respond first');
      if (r.kind === 'data_fix') {
        if (!(a.per_kg_value > 0)) err('Enter the PCF per kg');
        r.status = 'restated'; r.closed_on = s.today; r.submission = {per_kg_value: +a.per_kg_value};
        hist(r, s, r.to, 'restated per kg', String(a.per_kg_value));
        // same timing rule as evidence: after the standard deadline it is late, and the same late paths apply
        const cmp = s.comparisons[r.comparison];
        r.late = s.today > T.evidenceDeadline(ROUND.sourcing_date, r.requested_on);
        r.window = !r.late ? 'on_time' : cmp.nomination ? 'after_nomination' : 'before_nomination';
        if (r.late) {
          const without = cmp.nomination ? cmp.nomination.basis : view(s, r.comparison, {drop: [r.id]}).current;
          r.late_impact = outcomeChange(without, view(s, r.comparison, {use: [r.id]}).current);
          if (r.window === 'before_nomination') r.late_decision = r.late_impact.material ? null : 'use';
          if (r.window === 'after_nomination') r.impact_review = r.late_impact.material ? {status: 'open', opened_on: s.today} : {status: 'closed', outcome: 'record_only', closed_on: s.today};
        }
        // used this round: the unit problem is cleared, the comparison is re-assessed and the buyer chooses again
        if (usedThisRound(r)) cmp.action = null;
        note(s, 'system', usedThisRound(r) ? 're-assessed after restatement' : 'late restatement recorded', r.comparison, `${r.to} ${a.per_kg_value} kgCO2e/kg`);
        return s;
      }
      // Any option may send part of the evidence. Each claim is then assessed on its own; the option only sets the support offered.
      const claims = r.letter.claims.filter(c => a.values?.[c.claim] != null && a.values[c.claim] !== '');
      if (!claims.length) err('Enter at least one value');
      const verifiedOn = a.verified_on || s.today; // date the verifier completed the statement
      if (verifiedOn > s.today) err('Verification date cannot be in the future');
      const statement = a.statement || {};
      // Registry de-duplication: a certificate already on file for this claim is linked to this request, not stored again.
      // One entry may serve several claims' requests and several rounds; reuse is never blocked.
      const dup = c => a.reference && s.registry.find(e => e.supplier === r.to && e.claim === c.claim && e.reference === a.reference);
      const fresh = claims.filter(c => !dup(c)), linked = claims.filter(dup).map(dup);
      linked.forEach(e => { if (!e.request_ids.includes(r.id)) e.request_ids.push(r.id); });
      const before = [...s.registry];
      const disclosedOn = c => r.disclosure?.dates?.[c.claim] ?? null;
      const evidence = {verified_by: a.verified_by, assurance_level: a.assurance_level, provider_name: a.provider_name || null, reference: a.reference || null,
        statement, source: 'request', responded_on: r.responded_on || s.today, submitted_on: s.today};
      const value = c => (c.claim === 'origin_link' ? null : +a.values[c.claim]); // an origin link confirms a source, it has no number
      const entries = fresh.map(c => T.submitEvidence({supplier: r.to, claim: c.claim, verified_value: value(c), verified_on: verifiedOn,
        product: 'aluminium', requested_on: r.requested_on, ...evidence, disclosed_on: disclosedOn(c)}));
      entries.forEach(e => { e.id = `EV-${++s.seq}`; e.request_id = r.id; e.request_ids = [r.id]; });
      s.registry.push(...entries);
      const cmp = s.comparisons[r.comparison];
      // Snapshot of the re-assessment on the day the evidence arrived (audit trail). Timing is by arrival, not by verifier date.
      r.assessment = T.assessImprovement({parts: cmpDef(r.comparison).parts, supplier: r.to, claims: Object.fromEntries(claims.map(c => [c.claim, value(c)])),
        verified_on: s.today, requested_on: r.requested_on, sourcing_date: ROUND.sourcing_date,
        evidence: {...evidence, statement},
        registry: before, restated: restatedOf(s)});
      // treatment comes from the stored entries (verifier date, disclosure date), not from the arrival-day snapshot
      r.assessment.entries = [...entries, ...linked]; r.assessment.treatment = r.assessment.entries.map(T.treatment);
      r.late = !r.assessment.on_time;
      // on_time | before_nomination | after_nomination. Late is a process flag; it does not decide the evidence's value.
      r.window = !r.late ? 'on_time' : cmp.nomination ? 'after_nomination' : 'before_nomination';
      if (r.late) {
        // Material = would change what the pack says (target status or lower-carbon part), compared with what the pack uses now:
        // before nomination, the current basis (fallback values); after nomination, the committee's snapshot.
        const without = cmp.nomination ? cmp.nomination.basis : view(s, r.comparison, {drop: [r.id]}).current;
        const withIt = view(s, r.comparison, {use: [r.id]}).current;
        r.late_impact = outcomeChange(without, withIt);
      }
      if (r.window === 'before_nomination') r.late_decision = r.late_impact.material ? null : 'use'; // material -> the buyer decides
      if (r.window === 'after_nomination') {
        r.assessment.after_nomination = true;
        r.impact_review = r.late_impact.material ? {status: 'open', opened_on: s.today} : {status: 'closed', outcome: 'record_only', closed_on: s.today};
      }
      // Fee share: offered with option B, granted once per request chain.
      const earlierB = chainOf(s, r).slice(1).find(x => x.fee_share === 'granted');
      r.fee_share = r.option !== 'B' ? 'not_applicable' : earlierB ? `already granted under ${earlierB.id}` : 'granted';
      const ok = c => (dup(c) || entries.find(e => e.claim === c.claim)).status === 'verified'; // dup(c) is the linked entry
      const allVerified = claims.length === r.letter.claims.length && claims.every(ok);
      r.status = allVerified ? 'verified' : 'partially_verified'; r.closed_on = s.today;
      r.submission = {values: a.values, verified_by: a.verified_by, assurance_level: a.assurance_level, provider_name: a.provider_name, reference: a.reference || null,
        verified_on: verifiedOn, statement, entries: entries.map(e => e.id), linked: linked.map(e => e.id)};
      hist(r, s, r.to, 'evidence submitted', entries.map(e => `${e.claim}: ${e.status}`).join(' · '));
      for (const e of entries.filter(e => e.claim === 'primary_pcf' && e.status === 'verified')) narrowShared(s, r, T.buildGraph().suppliers[r.to].smelter);
      note(s, r.to, 'submitted evidence', r.id, r.status + (r.late ? ` · late (${r.window.replace('_', ' ')})` : ''));
      return s;
    }
    case 'late_decision': { // late but before nomination, and it would change the outcome: the buyer decides whether the pack uses it
      need('buyer');
      const r = req(a.id);
      if (r.window !== 'before_nomination' || r.late_decision) err('No decision needed');
      if (!['use', 'keep_fallback'].includes(a.use)) err('Choose use or keep_fallback');
      // Not using material evidence needs a recorded reason. Lateness alone is not one: the pack would present a known-outdated value as fact.
      if (a.use === 'keep_fallback') {
        if (!LATE_ISSUES[a.issue]) err(`Name the issue: ${Object.keys(LATE_ISSUES).join(', ')}`);
        for (const f of ['reason', 'approved_by', 'follow_up']) if (!(a[f] || '').trim()) err(`Record ${f.replace('_', ' ')}`);
      }
      r.late_decision = a.use;
      if (a.use === 'keep_fallback') r.late_record = {issue: a.issue, reason: a.reason.trim(), approved_by: a.approved_by.trim(), follow_up: a.follow_up.trim(), on: s.today};
      hist(r, s, 'buyer', a.use === 'use' ? 'late evidence used in the pack' : 'pack kept on fallback values', a.use === 'use' ? '' : `${LATE_ISSUES[a.issue]}: ${a.reason} · approved by ${a.approved_by}`);
      note(s, 'buyer', 'late evidence decision', r.id, a.use);
      return s;
    }
    case 'close_impact_review': { // late evidence after nomination: the decision snapshot stands; this records what follows
      need('buyer');
      const r = req(a.id);
      if (r.impact_review?.status !== 'open') err('No open impact review');
      if (!['no_change', 'monitor', 'refer_to_committee'].includes(a.outcome)) err('Unknown outcome');
      r.impact_review = {...r.impact_review, status: 'closed', outcome: a.outcome, closed_on: s.today, reason: a.reason || ''};
      hist(r, s, 'buyer', 'impact review closed', a.outcome);
      note(s, 'buyer', 'closed impact review', r.id, a.outcome);
      return s;
    }
    case 'follow_up': { // analyst: evidence could not prove every claim -> new request for what is left
      need('analyst');
      const r = req(a.id);
      if (r.status !== 'partially_verified') err('Only partially verified requests need a follow-up');
      if (r.superseded_by) err(`Already followed up by ${r.superseded_by}`);
      // verified claims stay in the registry; only what is left is asked again
      const proven = new Set(s.registry.filter(e => linkedTo(e, r.id) && e.status === 'verified').map(e => e.claim));
      const left = r.letter.claims.filter(c => !proven.has(c.claim));
      if (!left.length) err('Every claim is verified');
      const letter = {...structuredClone(r.letter), claims: left, status: 'draft - procurement must approve before sending'};
      const granted = chainOf(s, r).find(x => x.fee_share === 'granted');
      if (granted) letter.options = letter.options.map(o => o.option === 'B' ? {...o, action: `third-party verification (fee share already granted under ${granted.id})`} : o);
      const f = newRequest(s, r.comparison, 'evidence', letter, r.id);
      s.requests.push(f);
      r.superseded_by = f.id; // the original is closed; its verified claims are kept
      hist(r, s, 'analyst', 'closed with follow-up', `${f.id} asks for ${left.map(c => c.claim).join(', ')}; kept ${[...proven].join(', ') || 'none'}`);
      note(s, 'analyst', 'drafted follow-up', r.id);
      return s;
    }
    case 'advance_clock': { // demo only: move "today" forward; overdue requests expire and fallback values apply
      if (!(a.to > s.today)) err('Time only moves forward');
      s.today = a.to;
      for (const r of s.requests) if (OPEN.includes(r.status) && r.deadline < s.today) { r.status = 'expired'; r.closed_on = r.deadline; hist(r, s, 'system', 'deadline passed', 'fallback values apply'); }
      note(s, 'system', 'clock', '', a.to);
      return s;
    }
    case 'nominate': { // committee records the decision; the system only recommends
      need('committee');
      const c = s.comparisons[a.comparison];
      if (c.nomination) err('Already nominated');
      const v = view(prev, a.comparison);
      if (!v.ready) err('Pack is not ready: ' + v.blockers.join('; '));
      if (a.part && !cmpDef(a.comparison).parts.includes(a.part)) err('Unknown part');
      c.nomination = {on: s.today, part: a.part || null, basis: v.basis, recommendation: v.recommendation};
      note(s, 'committee', 'nominated', a.comparison, a.part || 'no nomination this round');
      return s;
    }
    case 'reset': return initialState();
    default: err(`Unknown action ${a.type}`);
  }
}

function outcomeChange(a, b) {
  const parts = Object.keys(a), reasons = [];
  for (const p of parts) if (a[p].meets_target !== b[p].meets_target) reasons.push(`${p}: target status would change (${a[p].pcf} -> ${b[p].pcf}, target ${b[p].target})`);
  const low = x => parts.length === 2 ? T.lowerCarbon(Object.fromEntries(parts.map(p => [p, x[p].pcf]))) : null;
  if (low(a) !== low(b)) reasons.push(`lower-carbon part would change: ${low(a)} -> ${low(b)}`);
  return {material: reasons.length > 0, reasons, pcf_before: Object.fromEntries(parts.map(p => [p, a[p].pcf])), pcf_after: Object.fromEntries(parts.map(p => [p, b[p].pcf]))};
}

// [Round 7] A smelter PCF verified through one customer is reused for the smelter's other customers (PACT V3 p.71).
// Their open requests for the same smelter PCF are narrowed to an origin link: less is asked, never more. The other customer's
// name is not given, because Tier 1s and suppliers must not see who else supplies JLR.
function narrowShared(s, from, smelter) {
  for (const x of s.requests) {
    if (x.id === from.id || x.kind !== 'evidence' || x.to === from.to || !['draft', ...OPEN].includes(x.status)) continue;
    const i = x.letter.claims.findIndex(c => c.node === smelter && c.claim === 'primary_pcf');
    if (i < 0) continue;
    const plan = T.draftRequests(cmpDef(x.comparison).parts, ROUND.sourcing_date, s.today, ctxOf(s));
    const link = plan.supplier_requests.find(l => l.to === x.to)?.claims.find(c => c.node === x.to && c.claim === 'origin_link');
    x.letter.claims.splice(i, 1, ...(link ? [link] : []));
    hist(x, s, 'system', 'request narrowed', `${T.displayName(smelter)} PCF verified through another customer; ${link ? 'only your origin link is needed' : 'nothing left to prove for this claim'}`);
    if (!x.letter.claims.length) { x.status = 'withdrawn'; x.closed_on = s.today; hist(x, s, 'system', 'withdrawn', 'no longer needed'); }
    note(s, 'system', 'narrowed request', x.id, `${smelter} primary_pcf -> ${link ? 'origin_link' : 'none'}`);
  }
}

function newRequest(s, comparison, kind, letter, followUpOf = null) {
  const r = {id: `REQ-${String(++s.seq).padStart(3, '0')}`, comparison, kind, to: letter.to, via: letter.via, letter: structuredClone(letter),
    status: 'draft', option: null, created_on: s.today, requested_on: null, deadline: letter.deadline, follow_up_of: followUpOf, history: []};
  hist(r, s, 'system', 'drafted', kind === 'data_fix' ? 'data correction' : `${letter.claims.length} claim(s)`);
  return r;
}

// [Product addition, not in twin.py] A unit problem is fixed by asking for the value per kg, through Tier 1.
function dataFixLetter(problem, s) {
  // per-kg restatement only; the comparison is re-run with the restated unit
  const supplier = problem.split(':')[0];
  const rec = PCF_RECORDS.find(r => r.supplier === supplier);
  const part = ROUND.comparisons.flatMap(c => c.parts).find(p => T.isUpstream(T.buildGraph(), supplier, p));
  const via = [T.buildGraph().parts[part].tier1];
  return {status: 'draft - procurement must approve before sending', to: supplier, via, deadline: T.evidenceDeadline(ROUND.sourcing_date, s.today), leaks: [],
    claims: [{claim: 'declared_unit', you_declared: `PCF declared per ${rec.declared_unit}`, evidence_needed: 'the same PCF restated per kg of aluminium', if_no_evidence_by_deadline: 'the part stays out of this round\'s ranking'}],
    options: [{option: 'A', action: 'restate the existing PCF per kg', lead_days: 5}, {option: 'D', action: 'state that a per-kg value cannot be provided', lead_days: 0}],
    commitments: [T.COMMITMENTS[3]], data_minimisation: T.DATA_MINIMISATION};
}

// ---------- read model ----------
// Shown on every pack until resolved. The numbers depend on an unconfirmed factor, so they are demo results, not validated ones.
export const CAVEATS = ['Demo numbers, not validated: the 100% recycled aluminium factor (0.26 kgCO2e/kg) has no confirmed source or boundary yet.',
  'CO2e target is a modelling assumption (P25 of fully verified suppliers by default). Actual JLR benchmark methodology is not publicly specified.',
  'Aluminium-related emissions only, not a full part PCF.'];
// Whether a request's evidence counts in this round's basis.
// On time: yes. Late, before nomination: yes if it changes nothing, otherwise only if the buyer chose to use it.
// After nomination: no; the nomination's snapshot stands and an impact review records what follows.
export const usedThisRound = r => !r.late || (r.window === 'before_nomination' && r.late_decision === 'use');

// Everything a page needs about one comparison, recomputed from events and the twin.
// `opts.use` / `opts.drop`: request ids to treat as used / not used (to measure what a late submission would change).
export function view(s, key, opts = {}) {
  const def = cmpDef(key), c = s.comparisons[key], parts = def.parts;
  const use = new Set(opts.use || []), drop = new Set(opts.drop || []);
  const unused = new Set(s.requests.filter(r => r.assessment && (drop.has(r.id) || (!usedThisRound(r) && !use.has(r.id)))).map(r => r.id));
  // `opts.benchmark` (P10 | P25 | P50): What-if on the target line only; pcf values never change with it.
  const bench = opts.benchmark || 'P25', q = T.BENCHMARK_SCENARIOS[bench] ?? err(`Unknown benchmark ${bench}`);
  const ctx = {registry: s.registry.filter(e => !unused.has(e.request_id)), asOf: s.today, restated: restatedOf(s, use, drop), benchmark: {q}};
  const g = T.buildGraph(ctx);
  const verdict = T.decide(parts, ctx);
  const plan = T.actionPlan(parts, ROUND.sourcing_date, s.today, ctx);
  const brief = T.internalBrief(parts, plan, ctx);
  const problems = T.dataProblems(g, parts);
  const restatements = parts.flatMap(p => g.parts[p].sources.map(x => T.restatementCheck(g, x.supplier))).filter(Boolean);
  const requests = s.requests.filter(r => r.comparison === key);
  const live = requests.filter(r => r.status !== 'withdrawn');
  const targets = Object.fromEntries(parts.map(p => [p, T.co2eTarget(g, p)]));
  const flip = parts.length === 2 ? T.checkFlip(parts[0], parts[1], ctx) : null;
  const alternatives = brief.claims.flatMap(cl => Object.entries(cl.alternatives || {}).flatMap(([part, opts]) =>
    opts.map(o => ({id: `${part}|${o.change}`, part, ...o})))).filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i);

  // Basis: verified evidence is already in ctx. Claims with no usable evidence (declined, expired, late and not used)
  // fall back to the tested value; "proceed on conservative values" applies it to every claim that matters.
  const override = {};
  const noEvidence = r => r.kind === 'evidence' && (r.status === 'declined' || (r.status === 'expired' && !r.assessment) || unused.has(r.id));
  const fallbackClaims = c.action === 'fallback' ? verdict.claims.filter(x => x.decision !== 'continue_analysis')
    : live.filter(noEvidence).flatMap(r => r.letter.claims.map(lc => verdict.claims.find(x => x.node === lc.node && x.claim === lc.claim)).filter(Boolean));
  for (const x of fallbackClaims) override[`${x.node}|${x.claim}`] = x.values.scenario;
  const pcf = Object.fromEntries(parts.map(p => [p, T.partPcf(g, p, override)]));
  if (c.action === 'alternative' && c.alternative) pcf[c.alternative.part] = c.alternative.pcf;
  // every claim that can still change the decision, at its scenario value: the 'if unverified' end of each bar
  const allScenario = Object.fromEntries(verdict.claims.filter(x => x.decision !== 'continue_analysis').map(x => [`${x.node}|${x.claim}`, x.values.scenario]));
  const current = Object.fromEntries(parts.map(p => {
    const src = c.action === 'alternative' && c.alternative?.part === p ? (c.alternative.qualification ? 'alternative sourcing (qualified)' : 'candidate alternative, not qualified') : fallbackClaims.length && T.partPcf(g, p, override) !== T.partPcf(g, p) ? 'fallback values' : 'declared + verified';
    return [p, {pcf: pcf[p], target: targets[p], meets_target: pcf[p] <= targets[p], source: src, reported: T.partPcf(g, p), worst: Math.max(pcf[p], T.partPcf(g, p, allScenario))}];
  }));
  // After nomination the pack shows what the committee decided on; later evidence goes to the impact review, not into the snapshot.
  const basis = c.nomination ? c.nomination.basis : current;

  // Where the comparison is in the journey
  const waiting = c.action === 'request' || c.action === 'data_fix'; // other actions do not wait for open requests
  const drafts = live.filter(r => r.status === 'draft'), open = live.filter(r => OPEN.includes(r.status));
  const partial = live.filter(r => r.status === 'partially_verified' && usedThisRound(r) && !r.superseded_by);
  const lateUndecided = live.filter(r => r.window === 'before_nomination' && !r.late_decision);
  const reviews = live.filter(r => r.impact_review?.status === 'open');
  const blockers = [];
  if (!c.nomination) {
    if (verdict.decision !== 'continue_analysis' && !c.action) blockers.push('choose an action');
    if (drafts.length) blockers.push(`${drafts.length} draft(s) awaiting approval`);
    if (waiting && open.length) blockers.push(`${open.length} request(s) awaiting evidence`);
    if (c.action === 'request' && partial.length) blockers.push('evidence under review');
    if (lateUndecided.length) blockers.push('late evidence would change the outcome: decide whether the pack uses it');
    if (c.action === 'alternative' && c.alternative && !c.alternative.qualification) blockers.push('confirm the alternative passed technical and commercial qualification');
  }
  const ready = !c.nomination && blockers.length === 0;
  let stage;
  if (c.nomination) stage = 'nominated';
  else if (ready) stage = 'ready';
  else if (lateUndecided.length) stage = 'needs_action';
  else if (waiting && (open.length || partial.length)) stage = 'awaiting_evidence';
  else if (drafts.length) stage = 'approve';
  else stage = verdict.decision === 'suggest_pause' ? 'paused' : 'needs_action';
  // a late-evidence decision is taken where the evidence is shown (step 4)
  const step = lateUndecided.length ? 4 : {needs_action: 2, paused: 2, approve: 3, awaiting_evidence: 4, ready: 5, nominated: 5}[stage];

  // Recommendation for the pack. Procurement and the committee decide.
  const meeting = parts.filter(p => current[p].meets_target);
  const lower = parts.length === 2 ? T.lowerCarbon(Object.fromEntries(parts.map(p => [p, current[p].pcf]))) : parts[0];
  let recommendation;
  if (c.action === 'exclude') recommendation = 'Keep out of this round\'s carbon ranking';
  else if (problems.length) recommendation = 'Fix the data before ranking';
  else if (!meeting.length) recommendation = 'Escalate: no part meets its CO2e target';
  else recommendation = `Lower-carbon choice: ${lower}${current[lower].meets_target ? ' (meets target)' : ''}`;

  const late = live.filter(r => r.late && r.late_impact).map(r => ({id: r.id, to: r.to, window: r.window, ...r.late_impact,
    next_steps: r.window === 'before_nomination'
      ? (r.late_impact.material ? ['buyer decides: use it in the pack or keep fallback values'] : ['used in the pack; it changes no outcome'])
      : (r.late_impact.material ? ['impact review: no change, monitor, or refer to the committee'] : ['record only; reuse in the next round']),
    used: usedThisRound(r), decision: r.late_decision ?? null, record: r.late_record ?? null,
    values: r.kind === 'data_fix' ? [{claim: 'per_kg_restated', verified_value: r.submission.per_kg_value, status: 'restated'}]
      : s.registry.filter(e => linkedTo(e, r.id)).map(({claim, verified_value, status}) => ({claim, verified_value, status})), impact_review: r.impact_review ?? null, after_nomination: r.window === 'after_nomination',
    decision_if_used: r.assessment?.decision_if_used ?? null}));
  return {key, def, state: c, late, verdict, plan, brief, problems, dataProblem: problems.length > 0, restatements, requests, targets, flip, alternatives,
    basis, current, stage, step, ready, blockers, recommendation, today: s.today, open_impact_reviews: reviews.map(r => r.id), caveats: CAVEATS,
    benchmark: {scenario: bench, q, per_kg: Number(T.percentileInclusive(Object.values(T.benchmarkGroup()), q).toFixed(4)), note: BENCHMARK_NOTE}};
}
export const BENCHMARK_NOTE = 'Current modelling assumption. Actual JLR benchmark methodology is not publicly specified.';

// Evidence Fast Track: what a later quote can reuse instead of asking again.
export const reusable = (s, supplier, on) => T.validEvidence(s.registry, on).filter(e => e.supplier === supplier);

export const rounds = s => ROUND.comparisons.map(c => view(s, c.key));

// What each organisation is allowed to see.
// Tier 1 computes its own part's footprint, so it sees its part's target (set by JLR policy for this round), the values its
// supplier had verified and the resulting part value. Neither tier sees break-evens, other suppliers, costs or competing parts.
// [Demo] This filter only separates views in the browser. All state lives client-side, so it is not access control;
// in production the same rules are enforced on the server for each signed-in organisation.
export function inbox(s, role, org) {
  const g = T.buildGraph(ctxOf(s));
  if (role === 'tier1') return s.requests.filter(r => r.via.includes(org) && r.status !== 'draft' && r.status !== 'withdrawn').map(r => {
    const part = partOf(r), a = r.assessment;
    return {id: r.id, to: r.to, part, status: r.status, deadline: r.deadline, letter: r.letter, history: r.history.filter(h => h.actor !== 'analyst'),
      requirements: part ? {part, part_target: T.co2eTarget(g, part), basis: 'JLR policy for this round (simulated)'} : null,
      result: a && part ? {values: s.registry.filter(e => linkedTo(e, r.id)).map(({claim, verified_value, status}) => ({claim, verified_value, status})),
        part_aluminium_co2e: a.carbon_assessment[part].pcf, meets_target: a.carbon_assessment[part].meets_target, used_this_round: usedThisRound(r)} : null};
  });
  if (role === 'supplier') return s.requests.filter(r => r.to === org && !['draft', 'approved', 'withdrawn'].includes(r.status))
    .map(r => ({id: r.id, kind: r.kind, via: r.via, status: r.status, option: r.option, deadline: r.deadline, letter: r.letter, late: !!r.late,
      fee_share: r.fee_share ?? null, treatment: r.assessment ? r.assessment.treatment : null, superseded_by: r.superseded_by ?? null,
      entries: s.registry.filter(e => linkedTo(e, r.id)).map(({status, claim, verified_on, checks_failed, scope_limits}) => ({status, claim, verified_on, checks_failed, scope_limits}))}));
  return s.requests;
}

// To-dos per role, newest first. Used for the top bar and the queue.
export function todos(s, role, org) {
  const out = [];
  if (role === 'buyer') for (const v of rounds(s)) {
    if (v.stage === 'needs_action' || v.stage === 'paused') out.push({key: v.key, text: `${v.def.name}: choose an action`});
    for (const r of v.requests) {
      if (r.status === 'draft') out.push({key: v.key, id: r.id, text: `Approve request to ${r.to}`});
      if (OPEN.includes(r.status) && T.daysBetween(s.today, r.deadline) <= 7) out.push({key: v.key, id: r.id, text: `${r.to}: deadline ${r.deadline}`});
      if (r.window === 'before_nomination' && !r.late_decision) out.push({key: v.key, id: r.id, text: `Late evidence from ${r.to}: use it or keep fallback?`});
      if (r.impact_review?.status === 'open') out.push({key: v.key, id: r.id, text: `Impact review: late evidence from ${r.to}`});
      if (r.window === 'on_time' && !['request', 'data_fix'].includes(v.state.action) && v.state.action && !v.state.nomination) out.push({key: v.key, id: r.id, text: `New evidence from ${r.to}: check your action`});
    }
  }
  if (role === 'analyst') for (const r of s.requests) if (r.status === 'partially_verified' && !r.superseded_by) out.push({id: r.id, text: `Review evidence from ${r.to}`});
  if (role === 'analyst') for (const r of s.requests) if (r.kind === 'data_fix' && r.status === 'restated') {
    const chk = T.restatementCheck(T.buildGraph(ctxOf(s)), r.to); if (chk && !chk.consistent) out.push({id: r.id, text: `${r.to}: restated ${chk.restated} vs model ${chk.model}`}); }
  if (role === 'tier1') for (const r of inbox(s, role, org)) if (r.status === 'approved') out.push({id: r.id, text: `Forward request to ${r.to}`});
  if (role === 'supplier') for (const r of inbox(s, role, org)) if (['forwarded', 'responded'].includes(r.status)) out.push({id: r.id, text: `Reply by ${r.deadline}`});
  if (role === 'committee') for (const v of rounds(s)) if (v.ready) out.push({key: v.key, text: `${v.def.name}: pack ready`});
  return out;
}

// ---------- contract with the pages ----------
// What pages may rely on. Bump `version` whenever a field's meaning, unit or allowed values change, even if its name does not;
// tests/contract.test.mjs checks real outputs against this declaration.
export const CONTRACT = {
  version: 3, // v3 (round 7): view.benchmark; origin_link claim; one request per supplier of a shared smelter; ties have no lower-carbon part
  units: {pcf: 'kgCO2e from aluminium per part', target: 'kgCO2e from aluminium per part', supplier_pcf: 'kgCO2e per kg aluminium', recycled_share: 'fraction 0-1', dates: 'ISO yyyy-mm-dd', cost: 'relative units, 1 = one third-party PCF verification', benchmark_per_kg: 'kgCO2e per kg aluminium'},
  view: ['key', 'def', 'state', 'late', 'verdict', 'plan', 'brief', 'problems', 'dataProblem', 'restatements', 'requests', 'targets', 'flip', 'alternatives',
    'basis', 'current', 'stage', 'step', 'ready', 'blockers', 'recommendation', 'today', 'open_impact_reviews', 'caveats', 'benchmark'],
  claims: ['primary_pcf', 'recycled_share', 'origin_link'],
  benchmark_scenarios: ['P10', 'P25', 'P50'],
  // round 7 analysis, read-only (src/network.js, src/cost.js, src/benchmark.js); field names as in the Python reference
  node_impact: ['node', 'layer', 'verified', 'suppliers', 'parts', 'paths', 'comparisons', 'comparisons_changed', 'breadth'],
  impact_comparison: ['key', 'parts', 'parts_below_node', 'flips_alone', 'flips_with', 'target_changes', 'labels', 'changes_decision', 'significance', 'blocked_by', 'spend'],
  shared_vs_separate: ['smelter', 'suppliers', 'comparisons_changed', 'deadline', 'days_left', 'params', 'routes', 'recommended', 'next_round', 'note'],
  routes: ['separate', 'shared_A', 'shared_B'],
  cost_compare: ['mode', 'params', 'baseline', 'carbontrace', 'carbontrace_costs_more', 'carbontrace_worse_per_gap', 'carbontrace_resolves_fewer'],
  benchmark_sensitivity: ['group', 'scenarios', 'decision_sensitive_to_benchmark'],
  stages: ['needs_action', 'paused', 'approve', 'awaiting_evidence', 'ready', 'nominated'],
  statuses: ['draft', 'approved', 'forwarded', 'responded', 'verified', 'partially_verified', 'declined', 'expired', 'withdrawn', 'restated'],
  windows: [null, 'on_time', 'before_nomination', 'after_nomination'],
  basis_sources: ['declared + verified', 'fallback values', 'alternative sourcing (qualified)', 'candidate alternative, not qualified'],
  correction_protection: ['eligible', 'not_eligible', 'no_disclosure', 'fact_finding'],
  inbox_tier1: ['id', 'to', 'part', 'status', 'deadline', 'letter', 'history', 'requirements', 'result'],
  inbox_supplier: ['id', 'kind', 'via', 'status', 'option', 'deadline', 'letter', 'late', 'fee_share', 'treatment', 'superseded_by', 'entries'],
  overview: ['today', 'sourcing_date', 'days_to_committee', 'comparisons', 'requests', 'todo_counts', 'stage_counts', 'status_counts', 'open_items', 'avg_cycle_days', 'log', 'caveats'],
  roles: ['buyer', 'analyst', 'committee', 'manager', 'tier1', 'supplier']
};

// ---------- management overview ----------
// Live, from the same state and read model as every other page: where each item is, and whose move it is.
const who = (role, org = 'JLR') => ({role, org});
export function waitingOn(s, r) {
  if (r.status === 'draft') return who('buyer');
  if (r.status === 'approved') return who('tier1', r.via[0]);
  if (r.status === 'forwarded' || r.status === 'responded') return who('supplier', r.to);
  if (r.status === 'partially_verified' && !r.superseded_by && usedThisRound(r)) return who('analyst');
  if (r.window === 'before_nomination' && !r.late_decision) return who('buyer');
  if (r.impact_review?.status === 'open') return who('buyer');
  return null;
}
export function overview(s) {
  const views = rounds(s), live = s.requests.filter(r => r.status !== 'withdrawn');
  const comparisons = views.map(v => {
    const owners = [];
    if (v.ready) owners.push(who('committee'));
    else if (!v.state.nomination) {
      if (v.blockers.some(b => /choose an action|qualification|late evidence|approval/.test(b))) owners.push(who('buyer'));
      for (const r of v.requests) { const w = waitingOn(s, r); if (w && !owners.some(o => o.role === w.role && o.org === w.org)) owners.push(w); }
    }
    return {key: v.key, name: v.def.name, parts: v.def.parts, stage: v.stage, ready: v.ready, blockers: v.blockers, waiting_on: owners,
      recommendation: v.recommendation, nominated: v.state.nomination ? (v.state.nomination.part || 'no nomination') : null};
  });
  const requests = live.map(r => ({id: r.id, comparison: r.comparison, kind: r.kind, to: r.to, via: r.via, status: r.status, waiting_on: waitingOn(s, r),
    deadline: r.deadline, days_left: OPEN.includes(r.status) ? T.daysBetween(s.today, r.deadline) : null,
    late: !!r.late, window: r.window ?? null, follow_up_of: r.follow_up_of,
    cycle_days: r.requested_on && r.closed_on && r.assessment ? T.daysBetween(r.requested_on, r.closed_on) : null}));
  const orgs = role => [...new Set(SESSION_ORGS[role](s))];
  const todo_counts = {buyer: todos(s, 'buyer').length, analyst: todos(s, 'analyst').length, committee: todos(s, 'committee').length,
    tier1: Object.fromEntries(orgs('tier1').map(o => [o, todos(s, 'tier1', o).length])),
    supplier: Object.fromEntries(orgs('supplier').map(o => [o, todos(s, 'supplier', o).length]))};
  const count = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
  const cycles = requests.map(r => r.cycle_days).filter(d => d != null);
  return {today: s.today, sourcing_date: ROUND.sourcing_date, days_to_committee: T.daysBetween(s.today, ROUND.sourcing_date),
    comparisons, requests, todo_counts, stage_counts: count(comparisons, c => c.stage), status_counts: count(requests, r => r.status),
    open_items: {
      overdue_or_due_7d: requests.filter(r => r.days_left != null && r.days_left <= 7).length,
      evidence_under_review: live.filter(r => r.status === 'partially_verified' && !r.superseded_by && usedThisRound(r)).length,
      late_decisions: live.filter(r => r.window === 'before_nomination' && !r.late_decision).length,
      impact_reviews: live.filter(r => r.impact_review?.status === 'open').length,
      unqualified_alternatives: views.filter(v => v.state.action === 'alternative' && !v.state.alternative?.qualification).length},
    avg_cycle_days: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
    log: s.log.slice(-15).reverse(), caveats: CAVEATS};
}
// Organisations that hold or held a request this round (from the requests, not from the demo sign-in list).
const SESSION_ORGS = {tier1: s => [...new Set(s.requests.filter(r => r.status !== 'withdrawn').map(r => r.via[0]))],
  supplier: s => [...new Set(s.requests.map(r => r.to))]};

// ---------- browser store ----------
const KEY = 'carbontrace.demo.v2'; // v2: late-evidence windows, statement checks, restatement feedback
export function createStore(storage = globalThis.localStorage) {
  let state;
  try { state = JSON.parse(storage.getItem(KEY)) || initialState(); } catch { state = initialState(); }
  const subs = new Set();
  const emit = () => subs.forEach(f => f(state));
  const save = () => { try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: state lives in memory only */ } };
  globalThis.addEventListener?.('storage', e => { if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); emit(); } });
  return {
    get: () => state,
    dispatch(action) { state = reduce(state, action); save(); emit(); return state; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); }
  };
}
