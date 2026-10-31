// Supplier portal for Tier 1 (relays requests) and Tier 2 (answers them).
// Reads only store.inbox(), which strips targets, break-evens and other suppliers.
import * as T from './domain.js';
import {inbox} from './store.js';
import {DEMO_OUTCOMES} from './data.js';
import {store, session, SESSIONS, actor, $, $$, esc, f2, pct, day, STATUS, tag, toast, act, mountNav, cursorLight} from './ui.js';

// The portal is used by supplier organisations; `?as=` picks which organisation's portal this is.
const ORGS = SESSIONS.filter(s => s.role === 'tier1' || s.role === 'supplier');
const me = ORGS.find(s => s.id === session('Supplier_B').id) || ORGS.find(s => s.id === 'Supplier_B');
$('#acct').innerHTML = ORGS.map(s => `<option value="${s.id}"${s.id === me.id ? ' selected' : ''}>${esc(s.label)} · ${s.tier}</option>`).join('');
$('#acct').onchange = e => { location.href = `supplier.html?as=${encodeURIComponent(e.target.value)}`; };
let open = null;
const form = {};

const letterText = l => (l.claims[0]?.claim === 'declared_unit'
  ? [`To: ${l.to} (via ${l.via.join(', ')})`, `Please send by ${l.deadline}:`, ...l.claims.map(c => `  - ${c.evidence_needed}`), ...l.claims.map(c => `  If not provided: ${c.if_no_evidence_by_deadline}`)].join('\n')
  : T.renderLetter(l));

function render() {
  const s = store.get(), items = inbox(s, me.role, me.org);
  if (!open && items.length) open = items[0].id;
  $('#list').innerHTML = items.length ? items.map(r => `<button class="item${r.id === open ? ' on' : ''}" data-id="${r.id}">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>${me.role === 'tier1' ? `For ${esc(r.to)}` : 'From JLR'}</b>${tag(STATUS[r.status])}</div>
      <div class="sub">${esc(r.id)} · reply by ${day(r.deadline)}</div></button>`).join('')
    : '<div class="empty">No requests. JLR only asks when a claim could change a sourcing decision.</div>';
  $$('#list .item').forEach(b => (b.onclick = () => { open = b.dataset.id; render(); }));
  const r = items.find(x => x.id === open);
  $('#detail').innerHTML = r ? (me.role === 'tier1' ? tier1View(r, s) : supplierView(r, s)) : '';
  bind(r);
}

// Tier 1 computes its own part's footprint: it sees its part's target, the values its supplier had verified and the result.
function tier1View(r) {
  const q = r.requirements, x = r.result;
  return `<div class="card"><div class="k">Request from JLR · for ${esc(r.to)}</div><div class="h">${r.status === 'approved' ? 'Forward to your supplier' : STATUS[r.status][0]}</div>
    <div class="sub">JLR has no contract with ${esc(r.to)}. The request reaches them through you; you cannot change its content.</div>
    ${q ? `<div class="k" style="margin-top:16px">Your part · ${esc(q.part.replace('_', ' '))}</div>
      <div class="row"><span>Carbon target, aluminium</span><b class="mono">${f2(q.part_target)} kgCO₂e <span class="sub">${esc(q.basis)}</span></b></div>
      ${x ? `${x.values.map(v => `<div class="row"><span>${esc(r.to)} ${esc(v.claim.replace('_', ' '))}</span><b class="mono">${v.claim === 'recycled_share' ? pct(v.verified_value) : v.verified_value} <span class="${v.status === 'verified' ? 'teal' : 'amber'}">${esc(v.status.replace('_', ' '))}</span></b></div>`).join('')}
        <div class="row"><span>Your part, aluminium CO₂e</span><b class="mono ${x.meets_target ? 'teal' : 'red'}">${f2(x.part_aluminium_co2e)}</b></div>
        ${x.used_this_round ? '' : '<div class="sub">Arrived late: recorded, and assessed by JLR for this or the next round.</div>'}` : '<div class="sub">Verified values and your part result appear here when your supplier replies.</div>'}` : ''}
    <div class="letter">${esc(letterText(r.letter))}</div>
    ${r.status === 'approved' ? `<button class="btn" id="forward">Forward to ${esc(r.to)}</button>` : ''}
    <div class="k" style="margin-top:16px">Activity</div>${r.history.map(h => `<div class="row"><span class="mono">${day(h.on)}</span><b>${esc(h.actor)} · ${esc(h.event)}</b></div>`).join('')}</div>`;
}

function supplierView(r, s) {
  const left = T.daysBetween(s.today, r.deadline), l = r.letter, dataFix = r.kind === 'data_fix';
  const head = `<div class="k">Request ${esc(r.id)} · from JLR via ${esc(r.via.join(', '))}</div>
    <div class="h">${dataFix ? 'Restate your PCF per kg' : `Evidence for ${l.claims.length} declared value${l.claims.length > 1 ? 's' : ''}`}</div>
    <div class="sub">Reply by ${day(r.deadline)}${left >= 0 ? ` · ${left} days left` : ' · deadline passed'}</div>`;
  const asked = `<div class="k" style="margin-top:16px">What is asked</div>${l.claims.map(c => `<div class="card" style="margin-top:8px;padding:12px">
      <b>${esc(c.you_declared)}</b><div class="row"><span>Evidence</span><b>${esc(c.evidence_needed)}</b></div><div class="row"><span>If none by the deadline</span><b>${esc(c.if_no_evidence_by_deadline)}</b></div></div>`).join('')}`;
  const promises = `<div class="k" style="margin-top:16px">JLR commits to</div>${l.commitments.map(c => `<div class="row"><span>${esc(c)}</span></div>`).join('')}<div class="sub" style="margin-top:8px">${esc(l.data_minimisation)}</div>`;
  let body = '';
  // Disclosure is separate from choosing a route: it says what was wrong or limited, and only it starts correction protection.
  const canDisclose = !dataFix && ['forwarded', 'responded', 'expired'].includes(r.status) && r.option !== 'D';
  const disclosure = canDisclose ? `<details class="card" style="margin-top:16px;padding:12px"><summary><b>Tell JLR what was wrong or limited</b> <span class="sub">optional · starts correction protection</span></summary>
    ${r.disclosure ? `<div class="ok">● Disclosed ${day(r.disclosure.on)}: ${esc(r.disclosure.claims.join(', '))} · ${esc(r.disclosure.note)}</div>` : ''}
    <div class="sub" style="margin-top:8px">Choosing a route is not a disclosure. Corrections disclosed within ${T.CORRECTION_WINDOW_DAYS} days of the request are not penalised, however long verification takes.</div>
    ${l.claims.map(c => `<label style="display:block;margin-top:8px"><input type="checkbox" data-disc="${c.claim}"> ${esc(c.you_declared)}</label>`).join('')}
    <label class="f">What was wrong or limited<textarea class="i" id="discNote" rows="2" placeholder="e.g. the 75% share was an estimate for 2022, not a certified figure"></textarea></label>
    <button class="btn2" id="disclose">Send disclosure</button></details>` : '';
  if (r.status === 'forwarded' || (r.status === 'expired' && !r.option)) {
    body = `<div class="k" style="margin-top:16px">How will you respond?</div>
      ${r.status === 'expired' ? '<div class="bad">The deadline has passed. Evidence is still accepted. If it arrives before the sourcing decision, JLR assesses whether it changes the outcome; after it, it is recorded and reviewed.</div>' : ''}
      <div class="sub">Any route may send only part of the evidence; each value is assessed on its own. The route sets the support JLR offers.</div>
      ${l.options.map(o => { const fits = o.lead_days <= Math.max(0, left);
        return `<label class="opt${form.option === o.option ? ' on' : ''}"><input type="radio" name="opt" value="${o.option}"${form.option === o.option ? ' checked' : ''}>
        <span><b>${o.option}</b> · ${esc(o.action)}<br><span class="sub">${o.lead_days ? `about ${o.lead_days} days · ${fits ? 'fits before the deadline' : '<span class="amber">may not fit before the deadline</span>'}` : 'the fallback rule above applies'}</span></span></label>`; }).join('')}
      <button class="btn" id="choose"${form.option ? '' : ' disabled'}>Confirm</button>`;
  } else if (r.status === 'responded' || (r.status === 'expired' && r.option && r.option !== 'D')) {
    body = r.status === 'expired' && !dataFix ? '<div class="bad" style="margin-top:16px">Deadline passed while you were preparing evidence. You can still submit it.</div>' : '';
    body += dataFix ? `<div class="k" style="margin-top:16px">Your value</div><label class="f">PCF per kg of aluminium (kgCO₂e/kg)<input class="i mono" id="perkg" type="number" step="0.01" min="0"></label><button class="btn" id="submit">Submit</button>`
      : evidenceForm(r);
  } else if (['verified', 'partially_verified'].includes(r.status)) body = resultView(r);
  else if (r.status === 'declined') body = '<div class="card" style="margin-top:16px">You told JLR evidence cannot be provided. The fallback values above apply to this round. You can send evidence for the next quote at any time.</div>';
  else if (r.status === 'restated') body = '<div class="card" style="margin-top:16px">Thank you. JLR will re-run the assessment with your per-kg value.</div>';
  return `<div class="card">${head}${asked}${body}${disclosure}${promises}</div>`;
}

function evidenceForm(r) {
  const l = r.letter, today = store.get().today, has = c => l.claims.some(x => x.claim === c);
  const field = c => c.claim === 'origin_link'
    ? `<label class="f" style="grid-column:1/-1"><span><input type="checkbox" data-claim="origin_link"${form.origin_link ? ' checked' : ''}> Our primary aluminium for this product came from the smelter whose footprint is already verified</span></label>`
    : c.claim === 'recycled_share'
    ? `<label class="f">Verified recycled share (%)<input class="i mono" data-claim="recycled_share" type="number" min="0" max="100" step="1" value="${form.recycled_share ?? ''}"></label>`
    : `<label class="f">Verified primary aluminium footprint (kgCO₂e/kg)<input class="i mono" data-claim="primary_pcf" type="number" min="0" step="0.1" value="${form.primary_pcf ?? ''}"></label>`;
  return `<div class="k" style="margin-top:16px">Option ${r.option} · your evidence</div>
    <div class="sub">Leave a value empty if you cannot evidence it yet.</div>
    <div class="grid2">${l.claims.map(field).join('')}</div>
    <div class="grid2"><label class="f">Who checked it<select class="i" id="by"><option value="third_party_verification">Independent third-party verification</option><option value="chain_of_custody_certificate">Chain-of-custody certificate</option>${has('origin_link') ? `<option value="origin_document_check"${l.claims.length === 1 ? ' selected' : ''}>Purchase records / mill certificates</option>` : ''}</select></label>
      <label class="f">Assurance level<select class="i" id="lvl"><option value="limited">Limited</option><option value="reasonable">Reasonable</option><option value="certification">Certification</option><option value="none">None</option></select></label></div>
    <div class="grid2"><label class="f">Verifier or certificate body<input class="i" id="prov" placeholder="e.g. accredited verifier"></label>
      <label class="f">Statement or certificate number<input class="i mono" id="ref" placeholder="e.g. TPV-2026-118"></label></div>
    <div class="k" style="margin-top:16px">What the statement covers</div>
    <div class="sub">JLR checks these against each value. The checks depend on the value and the kind of evidence. Mismatches go to a carbon analyst, with the reason shown to you.</div>
    <div class="grid2">
      <label class="f">Product or batch<select class="i" id="st_product"><option value="aluminium">Aluminium (as supplied to ${esc(r.via[0])})</option><option value="other">Another product</option></select></label>
      <label class="f">Reporting period ends<input class="i mono" id="st_period" type="date" value="${today}"></label>
      <label class="f">Verification completed<input class="i mono" id="st_verified" type="date" value="${today}" max="${today}"></label>
      <label class="f">Valid until<input class="i mono" id="st_valid" type="date" value="${T.addYears(today, T.EVIDENCE_VALID_YEARS)}"></label>
      <label class="f">Verifier opinion (verification statements)<select class="i" id="st_opinion"><option value="unqualified">Unqualified</option><option value="qualified">Qualified / with reservations</option></select></label></div>
    ${has('primary_pcf') || has('origin_link') ? `<div class="k" style="margin-top:14px">${has('primary_pcf') ? 'Aluminium footprint and smelter origin' : 'Smelter origin'}</div><div class="grid2">
      <label class="f">Smelter<input class="i" id="st_smelter" placeholder="name of the smelter" value="${esc(form.smelter ?? '')}"></label>
      <label class="f">Supply from this smelter<select class="i" id="st_rel"><option value="confirmed">Confirmed for the period</option><option value="not_confirmed">Not confirmed</option></select></label>
      <label class="f">Unit<select class="i" id="st_unit"><option value="kg">per kg</option><option value="piece">per piece</option></select></label>
      <label class="f">Boundary<select class="i" id="st_boundary"><option value="cradle-to-gate">Cradle to gate</option><option value="gate-to-gate">Gate to gate</option></select></label></div>` : ''}
    ${has('recycled_share') ? `<div class="k" style="margin-top:14px">Recycled content</div><div class="grid2">
      <label class="f">Site<select class="i" id="st_site"><option value="${esc(me.org)}">${esc(me.org)} (supplying site)</option><option value="other_site">Another site</option></select></label>
      <label class="f">Content definition<select class="i" id="st_def"><option value="post_consumer_and_pre_consumer">Pre- and post-consumer scrap</option><option value="post_consumer">Post-consumer only</option><option value="unspecified">Not stated</option></select></label>
      <label class="f">Chain of custody<select class="i" id="st_coc"><option value="segregated">Segregated (physical content)</option><option value="mass_balance">Mass balance</option></select></label></div>
      <div class="sub">Mass balance is a recognised model. In this demo it is reviewed by an analyst rather than accepted automatically.</div>` : ''}
    <div class="sub" style="margin-top:6px"><label><input type="checkbox" id="st_scope" checked> The statement's scope covers ${l.claims.map(c => esc(c.claim.replace('_', ' '))).join(' and ')}</label></div>
    ${me.org === 'Supplier_B' ? '<div style="display:flex;gap:8px;margin-top:12px"><span class="sub">Demo values:</span><button class="chip" data-fill="lower">Lower than declared</button><button class="chip" data-fill="higher">Higher than declared</button></div>' : ''}
    <button class="btn" id="submit">Submit evidence</button>`;
}

// What the supplier sees after submitting: status and treatment. Never the carbon ranking or targets.
function resultView(r) {
  const t = r.treatment?.[0];
  const prot = {eligible: 'Yes · you disclosed within the 30-day window', not_eligible: 'No · disclosed after the 30-day window', no_disclosure: 'Not applicable · no disclosure made', fact_finding: 'Fact-finding first'}[t?.correction_protection];
  return `<div class="k" style="margin-top:16px">Your evidence</div>
    ${r.entries.map(e => `<div class="row"><span>${esc(e.claim.replace('_', ' '))}${[...(e.checks_failed || []), ...(e.scope_limits || [])].length ? `<br><span class="sub">${esc([...(e.checks_failed || []), ...(e.scope_limits || [])].join('; '))}</span>` : ''}</span><b class="${e.status === 'verified' ? 'teal' : 'amber'}">${esc(e.status.replace('_', ' '))}</b></div>`).join('')}
    ${r.late ? '<div class="sub" style="margin-top:8px">Received after the deadline. JLR records it and assesses whether it changes this round.</div>' : ''}
    ${r.status === 'partially_verified' ? `<div class="sub" style="margin-top:8px">${r.superseded_by ? `Closed. Verified values are kept; ${esc(r.superseded_by)} asks only for the rest.` : 'Not every value could be accepted yet. A JLR carbon analyst reviews the reasons above.'}</div>` : ''}
    ${t ? `<div class="k" style="margin-top:16px">How you are treated</div>
      <div class="row"><span>Reuse for later quotes</span><b>${t.fast_track_reuse_until ? 'until ' + day(t.fast_track_reuse_until) : 'after verification'}</b></div>
      <div class="row"><span>Verification fee share</span><b>${r.fee_share === 'granted' ? esc(t.fee_share) : r.fee_share === 'not_applicable' ? 'Option B only' : esc(r.fee_share)}</b></div>
      <div class="row"><span>Timely response</span><b>${t.timely_response ? 'Yes · participation support applies' : 'No'}</b></div>
      <div class="row"><span>Correction protection</span><b>${prot}</b></div>
      <div class="row"><span>Audit rate</span><b>Unchanged</b></div>
      <div class="sub" style="margin-top:8px">The same whether your verified value is higher or lower than declared. Protection depends on when you disclosed, not on when the verifier finished.</div>` : ''}`;
}

function bind(r) {
  if (!r) return;
  const a = actor(me);
  $('#forward') && ($('#forward').onclick = () => act({type: 'forward', actor: a, id: r.id}) && toast(`Forwarded to ${r.to}`));
  $$('input[name=opt]').forEach(i => (i.onchange = () => { form.option = i.value; render(); }));
  $('#choose') && ($('#choose').onclick = () => act({type: 'choose_option', actor: a, id: r.id, option: form.option}) && (delete form.option, toast('Response recorded')));
  $$('[data-fill]').forEach(b => (b.onclick = () => { const o = DEMO_OUTCOMES[b.dataset.fill]; form.recycled_share = Math.round(o.recycled_share * 100); form.primary_pcf = o.primary_pcf; form.origin_link = true;
    form.smelter = o.primary_pcf === 6.6 ? 'EU smelter (Smelter_EU)' : 'imported ingot (Smelter_IMP)'; render(); }));
  $('#st_smelter') && ($('#st_smelter').oninput = e => (form.smelter = e.target.value));
  $$('input[data-claim]').forEach(i => (i.oninput = () => (form[i.dataset.claim] = i.type === 'checkbox' ? i.checked : i.value)));
  $('#disclose') && ($('#disclose').onclick = () => act({type: 'disclose', actor: a, id: r.id, claims: $$('[data-disc]:checked').map(x => x.dataset.disc), note: $('#discNote').value}) && toast('Disclosure recorded'));
  $('#submit') && ($('#submit').onclick = () => {
    if (r.kind === 'data_fix') return act({type: 'submit_evidence', actor: a, id: r.id, per_kg_value: +$('#perkg').value}) && toast('Sent to JLR');
    const values = {};
    $$('input[data-claim]').forEach(i => { if (i.type === 'checkbox') { if (i.checked) values[i.dataset.claim] = 'confirmed'; return; } if (i.value !== '') values[i.dataset.claim] = i.dataset.claim === 'recycled_share' ? +i.value / 100 : +i.value; });
    const val = id => $(id)?.value;
    const statement = Object.fromEntries(Object.entries({product: val('#st_product'), period_end: val('#st_period'), opinion: val('#st_opinion'), valid_until: val('#st_valid'),
      smelter: val('#st_smelter'), supply_relationship: val('#st_rel'), unit: val('#st_unit'), boundary: val('#st_boundary'),
      site: val('#st_site'), content_definition: val('#st_def'), chain_of_custody: val('#st_coc')}).filter(([, v]) => v !== undefined));
    statement.scope = $('#st_scope').checked ? r.letter.claims.map(c => c.claim) : [];
    if (act({type: 'submit_evidence', actor: a, id: r.id, values, verified_by: $('#by').value, assurance_level: $('#lvl').value, provider_name: $('#prov').value,
      reference: $('#ref').value.trim() || null, verified_on: val('#st_verified'), statement})) toast('Evidence sent to JLR');
  });
}

store.subscribe(render);
render();
mountNav('suppliers', me);
cursorLight();
