// Supplier Portal as Supplier B: one request, four ways to answer, one submission. It sees only what the request says.
import {flow, reqActions, SIM_EVIDENCE, REUSE_UNTIL} from './v2.js';
import {link, linkActions, SHARE, PRIVATE, COMMIT, ROUTES as LROUTES, LINK_DOC} from './links.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ui = {step: null, route: 'A', note: '', limits: ''};
const ROUTES = {
  A: ['Submit existing evidence', 'You hold a verification statement or certificate'],
  B: ['Ask for verification support', 'You have data but no verification; cost sharing may apply'],
  C: ['Ask for measurement help', 'You need a method or template'],
  D: ['Cannot provide yet', 'Tell us why; a person at JLR follows up']
};
const STEPS = ['Request', 'Respond', 'Submit', 'Outcome'];
const FILE = '<svg width="22" height="26" viewBox="0 0 28 34" aria-hidden="true"><path d="M3 1h15l7 7v23a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M18 1v7h7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function render() {
  if (location.hash === '#supplier-l') return renderL();
  setOrg('SB', 'Supplier B');
  const r = flow.get().req, live = r && r.status !== 'draft';
  $('#inbox').innerHTML = `<div class="k">Requests</div>${live ? `<div class="ib"><b>${r.id} · Smelter X aluminium</b><span>From JLR via Tier1_B · due ${r.deadline}</span></div>` : '<div class="none">No open requests.</div>'}`;
  if (!live) { $('#m').innerHTML = '<div class="empty"><b style="color:var(--ink)">Nothing to answer</b><span>Requests from your customers appear here.</span></div>'; return; }
  const answered = ['responded', 'support', 'accepted'].includes(r.status);
  const step = answered ? 4 : ui.step || 1;
  const stp = `<div class="stp">${STEPS.map((t, i) => `<span class="${i + 1 === step ? 'on' : i + 1 < step ? 'd' : ''}">${t}</span>`).join('')}</div>`;
  $('#m').innerHTML = stp + [request, respond, submit, outcome][step - 1](r);
  bind(r);
}
const request = r => `<h1>Smelter X primary aluminium</h1>
  <div class="card"><p>Please send a verification statement for Smelter X primary aluminium (2025, cradle-to-gate, per kg) and confirm that the metal you supply to Tier1_B comes from Smelter X.</p>
    <p class="m">A statement or certificate is enough. No raw activity data.</p></div>
  <div class="card"><div class="row"><span>Due</span><b>${r.deadline}</b></div><div class="row"><span>Requested by</span><b>JLR Procurement</b></div><div class="row"><span>Forwarded by</span><b>Tier1_B</b></div>
    <div class="row"><span>If nothing arrives</span><b>13.2 kgCO₂e/kg is used (European Aluminium 2024)</b></div><div class="row"><span>Treatment</span><b>Same whether the verified value is higher or lower</b></div></div>
  <div class="card"><div class="k">What JLR commits to</div>
    <div class="row"><span>Reuse</span><b>Verified evidence is reused for 3 years. We will not ask again.</b></div>
    <div class="row"><span>Fee share</span><b>JLR may share a verification fee (50% large / 75% SME, capped)</b></div>
    <div class="row"><span>Corrections</span><b>Disclosed within 30 days: treated as voluntary, not penalised</b></div>
    <div class="row"><span>Audit rate</span><b>Unchanged by your answer</b></div></div>
  <div class="ab"><button class="btn" data-to="2">Respond</button></div>`;
const respond = () => `<h1>How will you respond?</h1>
  <div class="ops">${Object.entries(ROUTES).map(([k, [t, s]]) => `<label class="${k === ui.route ? 'on' : ''}"><input type="radio" name="rt" value="${k}"${k === ui.route ? ' checked' : ''}><span><b>${k} · ${t}</b><small>${s}</small></span></label>`).join('')}</div>
  <div class="ab"><button class="btn2" data-to="1">Back</button><button class="btn" data-to="3">Continue</button></div>`;
function submit() {
  if (ui.route !== 'A') return `<h1>${ROUTES[ui.route][0]}</h1>
    <div class="card"><label class="f">Message to JLR<textarea class="i" id="note" placeholder="${ui.route === 'D' ? 'Why it cannot be provided yet' : 'What you have and what you need'}">${esc(ui.note)}</textarea></label></div>
    <div class="ab"><button class="btn2" data-to="2">Back</button><button class="btn" id="go"${ui.note.trim() ? '' : ' disabled'}>Send</button></div>`;
  const e = SIM_EVIDENCE;
  return `<h1>Submit evidence</h1>
    <div class="card"><div class="file">${FILE}<b>${e.file}</b><span>Attached · 1.2 MB</span></div>
      <div class="fl"><label class="f">Reporting period<input class="i" value="${e.period}"></label><label class="f">Declared unit<input class="i" value="per kg · ${e.boundary}"></label><label class="f">Covers<input class="i" value="${esc(e.product)}"></label></div>
      <label class="f">Known limitations (optional)<textarea class="i" id="lim" placeholder="Anything that is incomplete or may be wrong. Disclosed within 30 days, it is treated as a correction, not a breach.">${esc(ui.limits)}</textarea></label></div>
    <div class="ab"><button class="btn2" data-to="2">Back</button><button class="btn" id="go">Submit</button></div>`;
}
function outcome(r) {
  const acc = r.status === 'accepted', sup = r.status === 'support';
  return `<h1>${acc ? 'Accepted' : sup ? 'Sent to JLR' : 'Submitted'}</h1>
    <div class="card"><div class="ok"><i class="${acc ? '' : 'w'}">${acc ? '✓' : '…'}</i><div><p><b>${acc ? 'Your evidence is on file.' : sup ? 'A person at JLR will follow up.' : 'JLR is reviewing your evidence.'}</b></p>
      <p class="m">${acc ? 'It can be reused for future requests that ask for the same smelter value.' : sup ? 'Your request is logged against REQ-1.' : `Submitted ${r.events.at(-1).on}. You will see the result here.`}</p></div></div></div>
    ${acc ? `<div class="card"><div class="k">What you receive</div>
      <div class="row"><span>Responded on time</span><b>✓</b></div>
      <div class="row"><span>Evidence reused, no repeat requests</span><b>Until ${REUSE_UNTIL}</b></div>
      <div class="row"><span>Correction protection</span><b>${r.submission?.limits ? 'Applies to what you disclosed' : 'Available for 30 days'}</b></div>
      <div class="row"><span>Audit rate</span><b>Unchanged</b></div></div>` : ''}
    <div class="card"><div class="k">Activity</div>${r.events.filter(e => !/leak|Approved/i.test(e.text)).map(e => `<div class="row"><span>${e.on}</span><b>${esc(e.text.replace('Supplier B chose A: submitted existing evidence', 'You submitted existing evidence').replace(/^Supplier B /, 'You '))}</b></div>`).join('')}</div>`;
}
function bind(r) {
  document.querySelectorAll('[data-to]').forEach(b => (b.onclick = () => { ui.step = +b.dataset.to; render(); }));
  document.querySelectorAll('input[name=rt]').forEach(i => (i.onchange = () => { ui.route = i.value; render(); }));
  const note = $('#note'); if (note) note.oninput = () => { ui.note = note.value; $('#go').disabled = !note.value.trim(); };
  const lim = $('#lim'); if (lim) lim.oninput = () => { ui.limits = lim.value; };
  const go = $('#go'); if (go) go.onclick = () => reqActions.respond(ui.route, ui.route === 'A' ? {...SIM_EVIDENCE, limits: ui.limits} : {note: ui.note});
}

// ---------- Supplier L: confirm one supply link. It shares only what proves the link. ----------
function setOrg(av, n) { const o = document.querySelector('header .org'); o.querySelector('.av').textContent = av; o.lastChild.textContent = n; o.querySelector('.pill').href = av === 'SL' ? 'network.html#Supplier_L' : 'review.html#CL-X-PCF'; }
const ul = a => `<ul class="lst">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const lui = {step: 1, route: 'A', note: ''};
function renderL() {
  setOrg('SL', 'Supplier L');
  const L = link(), live = ['sent', 'responded', 'confirmed', 'rejected'].includes(L.status);
  $('#inbox').innerHTML = `<div class="k">Requests</div>${live ? `<div class="ib"><b>Confirm a supply link</b><span>From JLR via Tier 1 E · due ${L.due}</span></div>` : '<div class="none">No open requests.</div>'}`;
  if (!live) { $('#m').innerHTML = '<div class="empty"><b style="color:var(--ink)">Nothing to answer</b><span>Requests from your customers appear here.</span></div>'; return; }
  const done = ['responded', 'confirmed', 'rejected'].includes(L.status) || L.wait, step = done ? 4 : lui.step;
  const stp = `<div class="stp">${STEPS.map((s, i) => `<span class="${i + 1 === step ? 'on' : i + 1 < step ? 'd' : ''}">${s}</span>`).join('')}</div>`;
  $('#m').innerHTML = stp + [lRequest, lRespond, lSubmit, lOutcome][step - 1](L);
  document.querySelectorAll('[data-to]').forEach(b => (b.onclick = () => { lui.step = +b.dataset.to; renderL(); }));
  document.querySelectorAll('input[name=rt]').forEach(i => (i.onchange = () => { lui.route = i.value; renderL(); }));
  const note = $('#note'); if (note) note.oninput = () => { lui.note = note.value; const g = $('#go'); if (lui.route === 'D') g.disabled = !note.value.trim(); };
  const go = $('#go'); if (go) go.onclick = () => linkActions.respond(lui.route, lui.note);
}
const lRequest = L => `<h1>Confirm one supply link</h1>
  <div class="card"><p>Does the A356 aluminium you supply to Tier 1 D and Tier 1 E for the rear cover come from Smelter X?</p><p class="m">One delivery note or mill certificate is enough. You may black out prices.</p></div>
  <div class="two"><div class="card"><div class="k">What you share</div>${ul(SHARE)}</div><div class="card"><div class="k">What stays private</div>${ul(PRIVATE)}</div></div>
  <div class="card"><div class="k">What JLR commits to</div>${ul(COMMIT)}</div>
  <div class="card"><div class="row"><span>Due</span><b>${L.due}</b></div><div class="row"><span>Requested by</span><b>JLR Procurement</b></div><div class="row"><span>Forwarded by</span><b>Tier 1 E · sees status only</b></div></div>
  <div class="ab"><button class="btn" data-to="2">Respond</button></div>`;
const lRespond = () => `<h1>How will you respond?</h1>
  <div class="ops">${Object.entries(LROUTES).map(([k, [tt, s]]) => `<label class="${k === lui.route ? 'on' : ''}"><input type="radio" name="rt" value="${k}"${k === lui.route ? ' checked' : ''}><span><b>${k} · ${tt}</b><small>${s}</small></span></label>`).join('')}</div>
  <div class="ab"><button class="btn2" data-to="1">Back</button><button class="btn" data-to="3">Continue</button></div>`;
function lSubmit() {
  const r = lui.route;
  if (r === 'C' || r === 'D') return `<h1>${LROUTES[r][0]}</h1>
    <div class="card"><label class="f">${r === 'C' ? 'Actual source (optional)' : 'Why it cannot be shared yet'}<textarea class="i" id="note" placeholder="${r === 'C' ? 'Leave empty if you prefer not to say' : 'For example: needs approval from our customer'}">${esc(lui.note)}</textarea></label></div>
    <div class="ab"><button class="btn2" data-to="2">Back</button><button class="btn" id="go"${r === 'D' && !lui.note.trim() ? ' disabled' : ''}>Send</button></div>`;
  return `<h1>${r === 'A' ? 'Upload one document' : 'Send to an independent verifier'}</h1>
    <div class="card"><div class="file">${FILE}<b>${LINK_DOC.file}</b><span>${LINK_DOC.note} · 0.4 MB</span></div>
      <p class="m">${r === 'A' ? 'Goes to JLR directly. Tier 1 E sees only that you responded.' : 'Only the verifier opens the document. JLR receives the verifier\'s result.'}</p></div>
    <div class="ab"><button class="btn2" data-to="2">Back</button><button class="btn" id="go">Submit</button></div>`;
}
function lOutcome(L) {
  const ok = L.status === 'confirmed', no = L.status === 'rejected';
  const h = ok ? 'Link confirmed' : no ? (L.route === 'C' ? 'Recorded: not your source' : 'Not confirmed') : L.wait ? 'Sent to JLR' : 'Submitted';
  const p = ok ? 'Your document is on file. You will not be asked for this link again.' : no ? (L.route === 'C' ? 'The suggestion is closed. Nothing else changes for you.' : 'JLR could not confirm the link from the document. No penalty applies.') : L.wait ? 'A person at JLR will follow up. No penalty applies.' : 'JLR is reviewing your document.';
  return `<h1>${h}</h1><div class="card"><div class="ok"><i class="${ok ? '' : 'w'}">${ok ? '✓' : '…'}</i><div><p><b>${p}</b></p></div></div></div>
    ${ok ? `<div class="card"><div class="k">What you receive</div>
      <div class="row"><span>Evidence reused, no repeat requests</span><b>Until ${REUSE_UNTIL}</b></div>
      <div class="row"><span>Responded on time</span><b>✓ Track record</b></div>
      <div class="row"><span>Eligible for joint assessment</span><b>Smelter X low-carbon aluminium</b></div>
      <div class="row"><span>Your customers, prices, other suppliers</span><b>Not shared</b></div></div>` : ''}
    <div class="card"><div class="k">Activity</div>${L.events.filter(e => !/agent|procurement|Dismiss/i.test(e.text)).map(e => `<div class="row"><span>${e.on}</span><b>${esc(e.text.replace(/^Supplier L:? /, 'You: '))}</b></div>`).join('')}</div>`;
}
addEventListener('hashchange', render);
flow.subscribe(render);
render();
