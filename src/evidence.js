// Evidence: the claim queue and a step workspace (claim, recommendation, request or outcome, resolution).
// Rules output comes from v2.js; a person records each decision here.
import {R, CLAIMS, OPEN_CLAIMS, A, NODES, LINKS, OPTIONS, REUSE, CHOICES, SENS, REC, KIND, AGENT_REC, SIM_EVIDENCE, REUSE_UNTIL, REQ_DATES, REMINDERS, APPROVERS, approve, COST_REVIEW_GBP,
  flow, decide, reqActions, claimState, candPcf, restsOn, CANDS, name, cand, fmtVal, r2, daysLeft, fallback} from './v2.js';
import {$, $$, esc, tag, toast, mountNav, mountContext, BASE_CRUMBS} from './ui.js';

const ui = {id: null, step: {}, choice: {}, reason: {}, approver: {}};
const VERIFIED = A.claims.filter(c => c.recommendation === 'no_action').map(c => c.claim_id);
const isReq = id => CLAIMS[id].recommendation === 'verification_candidate' && (flow.get().decisions[id]?.choice ?? 'request') === 'request';
const STEPS = id => CLAIMS[id].recommendation === 'no_action' ? ['Claim'] : isReq(id) ? ['Claim', 'Recommendation', 'Request', 'Resolution'] : ['Claim', 'Recommendation', 'Outcome'];
function reach(id) {
  const s = flow.get(), d = s.decisions[id];
  if (CLAIMS[id].recommendation === 'no_action') return 1;
  if (!d) return 2;
  if (!isReq(id)) return 3;
  return s.req && ['responded', 'accepted'].includes(s.req.status) ? 4 : 3;
}
const money = v => (v == null ? 'Unknown' : v === 0 ? 'No cost' : `£${v.toLocaleString('en-GB')}`);
const supplies = c => {
  const down = LINKS.filter(l => l.from_id === c.supplier).map(l => name(l.to_id));
  return down.length ? down.join(', ') : LINKS.filter(l => l.from_id === c.supplier || l.to_id === c.supplier).map(l => name(l.to_id)).join(', ') || '–';
};
const relying = id => A.candidates.filter(x => x.rests_on_unverified.includes(id)).map(x => cand(x.id));

function queue() {
  const item = (id, vf) => { const c = CLAIMS[id], st = claimState(id);
    return `<a class="qi${vf ? ' vf' : ''}${id === ui.id ? ' on' : ''}" href="#${id}"><span class="t1"><span>${esc(name(c.supplier))}</span>${vf ? `<span class="qv">${fmtVal(c)}</span>` : ''}</span>
      ${vf ? '' : `<span class="t2">${KIND[c.kind]} <b class="qv">${fmtVal(c)}</b></span><span class="t3">${st.col === 'ready' ? '' : tag(SENS[c.decision_sensitivity])}<span class="sub" style="font-size:12px">${esc(st.text)}</span></span>`}</a>`; };
  // groups follow the claim's state: open (needs a decision or approval), waiting on a supplier, decided for this round, verified
  const grp = id => { const st = claimState(id); return st.basis === 'verified' ? 'ver' : st.col === 'ready' ? 'dec' : st.col === 'waiting' ? 'wait' : 'open'; };
  const G = {open: [], wait: [], dec: [], ver: []}; OPEN_CLAIMS.forEach(id => G[grp(id)].push(id)); G.ver.push(...VERIFIED);
  $('#queue').innerHTML = [['open', 'Open'], ['wait', 'Waiting on supplier'], ['dec', 'Decided'], ['ver', 'Verified']].filter(([k]) => k === 'open' || G[k].length)
    .map(([k, t]) => `<div class="gl"><span>${t}</span><span>${G[k].length}</span></div>${G[k].map(id => item(id, k === 'ver')).join('')}`).join('');
}

function stepper(id, step) {
  const max = reach(id);
  return `<nav class="stp" aria-label="Steps">${STEPS(id).map((t, i) => { const n = i + 1;
    const done = n < step;
    return `${i ? '<b></b>' : ''}<button data-step="${n}" class="${n === step ? 'on' : done ? 'done' : ''}"${n > max ? ' disabled' : ''}><i>${done ? '✓' : n}</i>${t}</button>`; }).join('')}</nav>`;
}
const bar = (left, buttons) => `<div class="ab"><span class="sub">${left}</span><div class="bs">${buttons}</div></div>`;
const head = (c, right = '') => `<div class="hd"><div><div class="k code">${c.claim_id}</div><h1>${esc(name(c.supplier))} · ${KIND[c.kind]}</h1></div><div>${right}</div></div>`;

// ---------- 1 Claim ----------
function stepClaim(c) {
  const st = claimState(c.claim_id), s = flow.get(), vf = c.recommendation === 'no_action';
  const shared = c.shared_with.length && !vf ? `<div class="pn"><div class="k">Shared upstream</div>
    ${c.shared_with.map(x => { const ok = x === 'Supplier_B' && s.req?.status === 'accepted';
      return `<div class="row"><span>${esc(name(x))}</span><b>${ok ? tag(['Origin confirmed', 't-ok']) : tag(['Origin unconfirmed', 't-rev'])}</b></div>`; }).join('')}
    <p>One smelter statement covers all ${c.shared_with.length}. Each origin link is proven separately.</p></div>` : '';
  return head(c, tag(SENS[c.decision_sensitivity])) + `<div class="facts">
      <div><span class="k">Reported</span><span class="v">${fmtVal(c)}</span></div>
      <div><span class="k">Evidence</span><span class="v">${vf ? 'Verified' : REUSE[c.claim_id] ? 'On file, not linked' : 'None'}</span></div>
      <div><span class="k">${NODES[c.supplier]?.kind === 'smelter' ? 'Supplies' : 'Sells to'}</span><span class="v" style="font-size:15px">${esc(supplies(c))}</span></div>
      <div><span class="k">Candidates relying on it</span><span class="v">${relying(c.claim_id).join(', ') || '–'}</span></div></div>
    ${c.capability ? `<div class="pn"><div class="row"><span>Supplier capability</span><b>${esc(c.capability)}</b></div><div class="row"><span>Size</span><b>SME</b></div></div>` : ''}${shared}
    ${bar(esc(st.text), vf ? '' : '<button class="btn pri" data-go="2">View recommendation</button>')}`;
}

// ---------- 2 Recommendation ----------
// Reference only: the rules' sensitivity test behind the carbon dimension.
function plot(c) {
  const vals = c.tested.flatMap(t => Object.values(t.pcf)), lo = Math.floor(Math.min(R.target, ...vals) - .5), hi = Math.ceil(Math.max(R.target, ...vals) + .5);
  const x = v => ((v - lo) / (hi - lo)) * 100, rep = c.tested.find(t => t.basis === 'reported'), alt = c.tested.find(t => t.basis !== 'reported');
  const ticks = []; for (let v = lo; v <= hi; v += hi - lo > 8 ? 2 : 1) ticks.push(v);
  return `<div class="plot">${CANDS.map(k => { const a = rep.pcf[k], b = alt.pcf[k];
      return `<div class="pr"><span>${cand(k)}</span><div class="ax"><span class="tg" style="left:${x(R.target)}%"></span>
        <span class="seg" style="left:${x(Math.min(a, b))}%;width:${Math.abs(x(b) - x(a))}%"></span>
        <span class="d alt" style="left:${x(b)}%" title="${r2(b)}"></span><span class="d rep" style="left:${x(a)}%" title="${r2(a)}"></span></div></div>`; }).join('')}
    <div class="pa"><span></span><div class="ax">${ticks.map(v => `<span style="left:${x(v)}%">${v}</span>`).join('')}</div></div>
    <div class="lg"><span><i style="background:var(--ink)"></i>As reported</span><span><i style="background:var(--amber)"></i>${esc(alt.scenario[0].toUpperCase() + alt.scenario.slice(1))}</span><span><i style="background:var(--teal);border-radius:0;width:2px"></i>Target ${R.target}</span></div></div>`;
}
function reference(c) {
  const rules = c.reasons.map(r => r.replace(/^not_resolvable_this_round: /, '')).map(r => r[0].toUpperCase() + r.slice(1));
  const body = !c.tested.length ? '<p class="sub">No published value matches this claim, so its effect cannot be tested.</p>' : (() => {
    const low = t => { const m = Math.min(...Object.values(t.pcf)); return k => t.pcf[k] === m; };
    const rows = [...c.tested].sort((a, b) => (a.basis === 'reported' ? -1 : 1) - (b.basis === 'reported' ? -1 : 1));
    return plot(c) + `<div class="tbl tw"><table class="sc"><tr><th>Scenario</th><th class="n">Value</th>${CANDS.map(k => `<th class="n">${cand(k)}</th>`).join('')}</tr>
      ${rows.map(t => { const isLow = low(t); return `<tr><td>${esc(t.scenario[0].toUpperCase() + t.scenario.slice(1))}${t.source ? `<span class="src">${esc(t.source.replace(/^\[Derived\] /, ''))}</span>` : ''}</td>
        <td class="n mono">${c.unit === 'share' ? Math.round(t.value * 100) + '%' : t.value}</td>
        ${CANDS.map(k => `<td class="n"><span class="pv${t.pcf[k] > R.target ? ' miss' : ''}${isLow(k) ? ' low' : ''}"><i></i>${r2(t.pcf[k])}</span></td>`).join('')}</tr>`; }).join('')}</table></div>`; })();
  return `<details class="ref"><summary>Reference<span>Sensitivity test · rules output</span></summary><div class="refb">${body}
    <div class="pn"><div class="k">Rules · ${REC[c.recommendation][0]}</div>${rules.map(r => `<p>${esc(r)}</p>`).join('')}</div></div></details>`;
}
// The carbon dimension: one line from the rules, never the full test.
function carbon(c) {
  if (!c.tested.length) return {v: 'Not testable', s: 'No sourced scenario value', cls: ''};
  const rep = c.tested.find(t => t.basis === 'reported'), alt = c.tested.find(t => t.basis !== 'reported');
  const k = relying(c.claim_id)[0] ? CANDS.find(x => cand(x) === relying(c.claim_id)[0]) : CANDS[0];
  const line = `${cand(k)} ${r2(rep.pcf[k])} → ${r2(alt.pcf[k])}${alt.pcf[k] > R.target && rep.pcf[k] <= R.target ? ', misses target' : ''}`;
  return c.decision_sensitivity === 'material' ? {v: 'Could change the decision', s: `If unverified: ${line}`, cls: 'amb'} : {v: 'No change', s: `If unverified: ${line}`, cls: ''};
}
function stepRec(c) {
  const id = c.claim_id, o = OPTIONS[id], d = flow.get().decisions[id], left = daysLeft(R.today, R.evidence_deadline), ag = AGENT_REC[id];
  const choices = CHOICES[c.recommendation], pick = ui.choice[id] || d?.choice || ag?.k || choices[0].k, ch = choices.find(x => x.k === pick);
  const over = ag && pick !== ag.k, askWhy = ch.reason || over, needReason = askWhy && !(ui.reason[id] ?? d?.reason ?? '').trim();
  const late = o.days != null && o.days > left, cb = carbon(c), high = o.cost > COST_REVIEW_GBP;
  const dim = (k, v, sub, cls = '') => `<div class="dm ${cls}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${sub}</span></div>`;
  const tip = `<span class="rb" tabindex="0">Why<i>i</i><span class="tip" role="tooltip">${ag.why.map(([k, v]) => `<span class="tr"><b>${k}</b><span>${esc(v)}</span></span>`).join('')}
    ${ag.change ? `<span class="tr ch2"><b>Would change if</b><span>${esc(ag.change)}</span></span>` : ''}</span></span>`;
  return head(c, tag(SENS[c.decision_sensitivity])) + `<div class="agr"><div class="agh"><span class="k">Recommendation</span>${tip}</div>
      <div class="big">${esc(ag.t)}</div><p>${esc(ag.s)}</p>${ag.change ? `<p class="chg">Would change if ${esc(ag.change[0].toLowerCase() + ag.change.slice(1))}</p>` : ''}</div>
    <div class="dims">${dim('Carbon', cb.v, esc(cb.s), cb.cls)}
      ${dim('Time', o.days != null ? `${o.days} days` : 'Open', `${left} days to deadline${late ? ' · too late this round' : ''}`, late ? 'red' : '')}
      ${dim('Cost', money(o.cost), high ? `Above £${COST_REVIEW_GBP.toLocaleString('en-GB')} review line` : esc(o.method), high ? 'amb' : '')}
      ${dim('Contract and evidence', c.recommendation === 'mandatory_verification' ? 'Required' : REUSE[id] ? 'On file' : 'None', c.recommendation === 'mandatory_verification' ? 'Contract clause' : REUSE[id] ? `${REUSE[id]} · verified` : 'No requirement, nothing on file', REUSE[id] ? 'grn' : '')}</div>
    <div class="k" style="margin-top:4px">Decision</div>
    <div class="ch">${choices.map(x => `<label class="${x.k === pick ? 'on' : ''}"><input type="radio" name="ch" value="${x.k}"${x.k === pick ? ' checked' : ''}><span>${esc(x.label)}</span>${ag?.k === x.k ? '<span class="rb st">Recommended</span>' : ''}</label>`).join('')}</div>
    ${askWhy ? `<div class="ovr"><textarea class="i" id="why" placeholder="${over ? 'Reason for not following the recommendation' : 'Reason for proceeding on the reported value'}">${esc(ui.reason[id] ?? d?.reason ?? '')}</textarea>
      <label class="apv"><span>Approver</span><select id="apv">${APPROVERS.map(a => `<option${(ui.approver[id] || d?.approval?.by) === a ? ' selected' : ''}>${a}</option>`).join('')}</select></label></div>` : ''}
    ${d?.approval ? `<div class="apst ${d.approval.status}">${{pending: `Waiting for approval · ${esc(d.approval.by)}`, approved: `Approved by ${esc(d.approval.by)} · ${d.approval.on}`}[d.approval.status] || ''}</div>` : ''}
    ${reference(c)}
    ${bar(d ? `Recorded ${d.on} · ${esc(d.by)}` : 'Procurement decides.', `<button class="btn pri" id="rec"${needReason ? ' disabled' : ''}>${ch.next === 4 ? 'Prepare request' : d?.choice === pick ? 'Continue' : 'Record decision'}</button>`)}`;
}

// ---------- 4 Request ----------
const LETTER = r => `To: Supplier B (via Tier1_B, read-only)
Request: ${r.id} · reply by ${r.deadline}

We need: a verification statement for Smelter X primary aluminium,
2025, cradle-to-gate, per kg, and confirmation that the metal you
supply to Tier1_B comes from Smelter X.

A statement or certificate is enough. No raw activity data.

If nothing arrives by the deadline, this round uses the published
imported-ingot value, 13.2 kgCO₂e/kg (European Aluminium 2024).
Your treatment is the same whether the verified value is higher or lower.`;
function stepRequest(c) {
  const r = flow.get().req;
  if (!r) return head(c) + bar('', '');
  const checks = ['No competitor names', 'No internal target or threshold', 'No ranking or sourcing position', 'Fallback value and source stated', 'Same treatment either way'];
  const btn = {draft: '<button class="btn pri" id="send">Approve and send</button>', forwarded: '<a class="btn2" href="portal.html">Open Supplier Portal</a><button class="btn pri" disabled>Awaiting supplier</button>',
    support: '<a class="btn2" href="portal.html">Open Supplier Portal</a>', responded: '<button class="btn pri" data-go="4">Review evidence</button>', accepted: '<button class="btn pri" data-go="4">Open resolution</button>'}[r.status];
  return head(c, tag(r.status === 'draft' ? ['Draft', 't-info'] : r.status === 'accepted' ? ['Closed', 't-ok'] : ['Sent', 't-rev'])) + `<div class="route"><span>JLR Procurement</span><i>→</i><span>Tier1_B</span><i>→</i><span>Supplier B</span></div>
    <div class="g2"><div class="letter2">${esc(LETTER(r))}</div><div style="display:flex;flex-direction:column;gap:16px">
      <div class="pn"><div class="k">Leak check</div>${checks.map(t => `<div class="chk2"><i>✓</i><span>${t}</span></div>`).join('')}</div>
      ${['forwarded', 'support'].includes(r.status) ? (() => { const left = daysLeft(R.today, r.deadline);
        return `<div class="pn"><div class="k">Follow-up</div>${REMINDERS.map(([d, t]) => `<div class="row"><span>${t}</span><b>${d ? `${d} days before due` : 'On the due date'}</b></div>`).join('')}
          <div class="row"><span>Due in</span><b class="${left <= 7 ? 'amber' : ''}">${left} days${r.reminded ? ` · ${r.reminded} reminder${r.reminded > 1 ? 's' : ''} sent` : ''}</b></div>
          <button class="btn2" id="remind" style="margin-top:10px">Send reminder now</button></div>`; })() : ''}
      ${r.status === 'support' ? `<div class="pn warm"><div class="k">Supplier asked for verification support</div><p>${esc(r.submission?.note || '')}</p>
        <div class="row"><span>Fee share rule</span><b>50% for large suppliers, capped at £2,500</b></div>
        ${r.fee ? `<div class="row"><span>Decision</span><b>${r.fee === 'approved' ? 'Approved' : 'Declined'}</b></div>` : '<div class="bs" style="display:flex;gap:8px;margin-top:10px"><button class="btn2" id="feeNo">Decline</button><button class="btn" id="feeOk">Approve fee share</button></div>'}</div>` : ''}
      <div class="pn"><div class="k">Timeline</div><div class="tl3">${r.events.map((e, i, a) => `<div class="${i === a.length - 1 && r.status !== 'accepted' ? 'now' : ''}"><i></i><em>${e.on}</em><span>${esc(e.text)}</span></div>`).join('')}</div></div></div></div>
    ${bar(`${r.id} · due ${r.deadline}`, btn)}`;
}

// ---------- 5 Resolution / Outcome ----------
const FILE = '<svg width="26" height="32" viewBox="0 0 28 34" aria-hidden="true"><path d="M3 1h15l7 7v23a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M18 1v7h7" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="5" y="26" font-size="7" font-weight="700" fill="currentColor">PDF</text></svg>';
const CHECKS = e => [['Evidence type proves the claim', e.type], ['Smelter named', e.smelter], ['Unit and boundary', `per kg · ${e.boundary}`], ['Reporting period', `${e.period} · valid`], ['Issuer accredited', e.issuer], ['Origin link', 'Supplier B ← Smelter X']];
function treatment(r) {
  const done = r.status === 'accepted', lim = (r.submission?.limits || '').trim();
  const row = (k, v, ok = true) => `<div class="chk2"><i class="${ok ? '' : 'o'}">${ok ? '✓' : ''}</i><span style="flex:1">${k}</span><span class="sub">${v}</span></div>`;
  return `<div class="pn"><div class="k">Supplier treatment</div>
    ${row('Responded on time', `${REQ_DATES.responded} · due ${r.deadline}`)}
    ${row('Evidence reused, no repeat request', done ? `Until ${REUSE_UNTIL}` : 'On acceptance', done)}
    ${row('Correction protection', lim ? 'Eligible · disclosed within 30 days' : 'Nothing disclosed', !!lim)}
    ${row('Verification fee share', r.route === 'B' ? (r.fee === 'approved' ? 'Approved · 50%, capped' : 'Needs approval') : 'Not needed · existing statement', r.route !== 'B' || r.fee === 'approved')}
    ${row('Audit rate', 'Unchanged')}
    <p>Same treatment whatever the verified value.</p></div>`;
}
function stepResolve(c) {
  const r = flow.get().req, done = r.status === 'accepted', e = {...SIM_EVIDENCE, ...(r.submission || {})};
  const before = Object.fromEntries(CANDS.map(k => [k, candPcf(k, 'reported', {'CL-X-PCF': 13.2})])), after = Object.fromEntries(CANDS.map(k => [k, candPcf(k, 'reported', {'CL-X-PCF': SIM_EVIDENCE.value})]));
  const cell = v => `<td class="n"><span class="pv${v > R.target ? ' miss' : ''}"><i></i>${r2(v)}</span></td>`;
  const rest = restsOn('Bracket_T1B').filter(x => x !== 'CL-X-PCF');
  return head(c, tag(done ? ['Accepted', 't-ok'] : ['Needs review', 't-rev'])) + `<button class="att" id="att">${FILE}<span><b>${esc(e.file)}</b><span class="sub">${e.type} · ${e.pages} pages · submitted ${REQ_DATES.responded}</span></span><em>View</em></button>
    <div class="g2"><div class="pn"><div class="k">Checks</div>
      ${CHECKS(e).map(([a, b]) => `<div class="chk2"><i>✓</i><span style="flex:1">${a}</span><span class="sub">${esc(b)}</span></div>`).join('')}
      <div class="chk2"><i class="o"></i><span style="flex:1">Origin links for Supplier H and I</span><span class="sub">Not in this request</span></div></div>
    <div style="display:flex;flex-direction:column;gap:16px"><div class="vals"><div><span class="k">Reported</span><span class="v">10.1</span></div><div class="amb"><span class="k">Scenario</span><span class="v">13.2</span></div><div class="grn"><span class="k">Verified</span><span class="v">${SIM_EVIDENCE.value}</span></div></div>
      <div class="tbl tw"><table class="sc"><tr><th>Smelter X value</th>${CANDS.map(k => `<th class="n">${cand(k)}</th>`).join('')}</tr>
        <tr><td>Scenario 13.2</td>${CANDS.map(k => cell(before[k])).join('')}</tr><tr><td>Verified ${SIM_EVIDENCE.value}</td>${CANDS.map(k => cell(after[k])).join('')}</tr></table></div>
      ${rest.length ? `<div class="sub">Tier 1 B still rests on ${rest.map(x => esc(name(CLAIMS[x].supplier)) + ' ' + KIND[CLAIMS[x].kind].toLowerCase()).join(', ')}.</div>` : ''}</div></div>
    ${treatment(r)}
    ${bar(done ? `Accepted ${REQ_DATES.accepted} · on file for reuse` : 'Verified value is simulated for the demo.', done ? '<a class="btn pri" href="decision.html">Prepare committee brief</a>' : '<button class="btn2" id="more">Request correction</button><button class="btn pri" id="acc">Accept evidence</button>')}`;
}
// Attachment viewer: the document on the left, what the system read from it on the right.
function viewer(e, done) {
  const f = (k, v) => `<div class="row"><span>${k}</span><b>${esc(v)}</b></div>`;
  return `<div class="dw" id="dw" role="dialog" aria-modal="true" aria-label="${esc(e.file)}"><div class="dwp">
    <header><span>${FILE}<b>${esc(e.file)}</b></span><button class="btn2" id="dwx" aria-label="Close">Close</button></header>
    <div class="dwb"><div class="doc"><div class="pg">
        <div class="dh"><b>Verification Statement</b><span>${e.ref}</span></div>
        <p>This statement confirms that the product carbon footprint of primary aluminium produced at <b>${e.smelter}</b> has been verified in accordance with ${e.standard}.</p>
        <table><tr><td>Product</td><td>Primary aluminium ingot</td></tr><tr><td>Reporting period</td><td>${e.period}</td></tr><tr><td>System boundary</td><td>${e.boundary}</td></tr>
          <tr><td>Declared unit</td><td>1 kg</td></tr><tr><td>Verified PCF</td><td><b>${e.value} kgCO₂e/kg</b></td></tr><tr><td>Level of assurance</td><td>Limited</td></tr></table>
        <p>Customer allocation: Supplier B, for metal supplied to Tier1_B.</p>
        <div class="sig"><span>${e.issuer}</span><span>Issued ${e.issued}</span></div></div>
      <div class="pgn">Page 1 of ${e.pages}</div></div>
      <aside><div class="k">Extracted</div>${f('Issuer', e.issuer)}${f('Standard', e.standard)}${f('Smelter', e.smelter)}${f('Period', e.period)}${f('Boundary', e.boundary)}${f('Value', `${e.value} kgCO₂e/kg`)}${f('Issued', e.issued)}
        <div class="k" style="margin-top:16px">Checks</div>${CHECKS(e).map(([a]) => `<div class="chk2"><i>✓</i><span>${a}</span></div>`).join('')}
        ${e.limits ? `<div class="k" style="margin-top:16px">Disclosed by supplier</div><p class="sub">${esc(e.limits)}</p>` : ''}
        <div class="sub" style="margin-top:auto;padding-top:16px">${done ? `On file · reusable until ${REUSE_UNTIL}` : 'Not yet accepted'}</div></aside></div></div></div>`;
}
function stepOutcome(c) {
  const d = flow.get().decisions[c.claim_id], st = claimState(c.claim_id);
  return head(c, tag(st.basis === 'verified' ? ['Verified', 't-ok'] : st.col === 'ready' ? ['Decided', 't-ok'] : st.col === 'waiting' ? ['Waiting on supplier', 't-info'] : st.col === 'review' && d?.approval?.status === 'pending' ? ['Waiting for approval', 't-rev'] : ['Open', 't-rev'])) + `<div class="pn"><div class="big">${esc(st.text)}</div>
      <div class="row"><span>Decision</span><b>${esc(d.label)}</b></div>${d.reason ? `<div class="row"><span>Reason</span><b>${esc(d.reason)}</b></div>` : ''}
      <div class="row"><span>Recorded</span><b>${d.on} · ${esc(d.by)}</b></div>
      ${d.approval ? `<div class="row"><span>Approval</span><b>${d.approval.status === 'approved' ? `Approved by ${esc(d.approval.by)}${d.approval.on ? ' · ' + d.approval.on : ''}` : `Waiting for ${esc(d.approval.by)}`}</b></div>` : ''}
      <div class="row"><span>Value used this round</span><b>${st.basis === 'fallback' && fallback(c.claim_id) ? `${c.unit === 'share' ? Math.round(fallback(c.claim_id).value * 100) + '%' : fallback(c.claim_id).value} · scenario` : `${fmtVal(c)} · ${st.basis}`}</b></div></div>
    ${bar('', '<button class="btn2" id="undo">Change decision</button><a class="btn pri" href="decision.html">Open Decision</a>')}`;
}

function render() {
  const id = ui.id = CLAIMS[location.hash.slice(1)] ? location.hash.slice(1) : OPEN_CLAIMS[0], c = CLAIMS[id];
  const max = reach(id), step = Math.min(ui.step[id] || (flow.get().decisions[id] ? max : 1), max);
  queue();
  mountContext([...BASE_CRUMBS, {t: name(c.supplier), href: `suppliers.html#${c.supplier}`}, {t: id}],
    '<div class="seg"><a class="on" href="review.html">Claims</a><a href="registry.html">Registry</a></div>');
  const views = [stepClaim, stepRec, isReq(id) ? stepRequest : stepOutcome, stepResolve];
  $('#work').innerHTML = (STEPS(id).length > 1 ? stepper(id, step) : '') + views[step - 1](c);
  bind(id);
}
const go = (id, n) => { ui.step[id] = n; render(); scrollTo({top: 0}); };
function bind(id) {
  $$('#work [data-step],#work [data-go]').forEach(b => (b.onclick = () => go(id, +(b.dataset.step || b.dataset.go))));
  $$('#work input[name=ch]').forEach(i => (i.onchange = () => { ui.choice[id] = i.value; render(); }));
  const apv = $('#apv'); if (apv) apv.onchange = () => { ui.approver[id] = apv.value; };
  const why = $('#why'); if (why) why.oninput = () => { ui.reason[id] = why.value; $('#rec').disabled = !why.value.trim(); };
  $$('#work .rb:not(.st)').forEach(b => (b.onclick = e => { e.preventDefault(); e.stopPropagation(); b.classList.toggle('open'); }));
  document.onclick = e => { if (!e.target.closest('.rb')) $$('.rb.open').forEach(x => x.classList.remove('open')); };
  const rec = $('#rec'); if (rec) rec.onclick = () => {
    const choices = CHOICES[CLAIMS[id].recommendation], ag = AGENT_REC[id], pick = ui.choice[id] || flow.get().decisions[id]?.choice || ag?.k || choices[0].k, ch = choices.find(x => x.k === pick);
    const needApproval = ch.reason || (ag && ag.k !== pick);
    if (flow.get().decisions[id]?.choice !== pick || needApproval) decide(id, pick, (ui.reason[id] || '').trim(), needApproval ? (ui.approver[id] || APPROVERS[0]) : null);
    if (needApproval) toast(`Sent to ${ui.approver[id] || APPROVERS[0]} for approval`);
    if (ch.next === 4 && !flow.get().req) reqActions.draft();
    else if (!ch.next) toast('Decision recorded');
    go(id, 3);
  };
  const on = (sel, f) => { const el = $(sel); if (el) el.onclick = f; };
  on('#send', () => { reqActions.approve(); toast('REQ-1 sent to Tier1_B'); });
  on('#remind', () => { reqActions.remind(); toast('Reminder sent via Tier1_B'); });
  on('#feeOk', () => { reqActions.fee(true); toast('Fee share approved'); });
  on('#feeNo', () => { reqActions.fee(false); toast('Fee share declined'); });
  on('#acc', () => { reqActions.accept(); toast('Evidence accepted'); });
  on('#more', () => { reqActions.more(); go(id, 3); });
  on('#undo', () => { flow.set(s => { delete s.decisions[id]; }); go(id, 2); });
  on('#att', () => { const r = flow.get().req; document.body.insertAdjacentHTML('beforeend', viewer({...SIM_EVIDENCE, ...(r.submission || {})}, r.status === 'accepted'));
    const close = () => { $('#dw')?.remove(); removeEventListener('keydown', esc_); }, esc_ = e => e.key === 'Escape' && close();
    $('#dwx').onclick = close; $('#dw').onclick = e => { if (e.target.id === 'dw') close(); }; addEventListener('keydown', esc_); $('#dwx').focus(); });
}

addEventListener('hashchange', render);
flow.subscribe(render);
mountNav('evidence');
render();
