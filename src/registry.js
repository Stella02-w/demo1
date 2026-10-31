// Evidence Center: every piece of evidence, from arrival to the registry. Built as a review inbox so it holds hundreds of items:
// tabs by state, filters, a paged list, and one open item with its statement checks and the action it needs.
import * as T from './domain.js';
import {mountContext, BASE_CRUMBS} from './ui.js';
import {todos} from './store.js';
import {ROSTER, MATERIALS, matName} from './roster.js';
import {flow, reqEvidence, REUSE_UNTIL, SIM_EVIDENCE} from './v2.js';
import {store, as, actor, $, $$, esc, day, pct, act, toast, mountNav, cursorLight} from './ui.js';

const me = as('analyst'); // actions here are recorded as carbon analysis
const PAGE = 20;
const CLAIM = {recycled_share: 'Recycled share', primary_pcf: 'Primary PCF', origin_link: 'Origin link', declared_unit: 'PCF per kg'};
const TYPE = {third_party_verification: 'Third-party verification', chain_of_custody_certificate: 'Chain-of-custody certificate', origin_document_check: 'Origin documents', self_declaration: 'Self-declaration'};
const ST = {review: ['Needs review', 't-rev'], awaiting: ['Awaiting submission', 't-info'], verified: ['Accepted', 't-ok'], rejected: ['Not accepted', 't-pause']};
const CHECK_NAME = {kind: 'Evidence type can prove this claim', assurance: 'Assurance level limited or higher', product: 'Covers the product', site: 'Covers the supplier site', period: 'Reporting period is recent',
  scope: 'Claim is inside the statement scope', unit: 'Values per kg', boundary: 'Cradle-to-gate boundary', source_identity: 'Smelter is named', supply_relationship: 'Supply from that smelter confirmed',
  content_definition: 'Recycled content definition recognised', batch: 'Certificate covers this product', valid: 'Statement still valid', opinion: 'Verifier opinion unqualified'};
const ui = {view: 'review', q: '', mat: '', claim: '', type: '', sort: 'due', page: 0, open: null};

// [Assumption] Sample evidence from the illustrative suppliers: types, outcomes and dates are generated.
const SAMPLE = (() => {
  let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647, (seed - 1) / 2147483646), pick = a => a[Math.floor(rnd() * a.length)];
  const sups = ROSTER.filter(r => r.sample && r.tier < 3), out = [];
  for (let i = 0; i < 140; i++) {
    const s = pick(sups), claim = s.mat === 'al' || s.mat === 'steel' ? pick(['recycled_share', 'recycled_share', 'primary_pcf', 'origin_link']) : 'primary_pcf';
    const type = claim === 'recycled_share' && rnd() < .4 ? 'chain_of_custody_certificate' : claim === 'origin_link' && rnd() < .5 ? 'origin_document_check' : 'third_party_verification';
    const u = rnd(), status = u < .22 ? 'review' : u < .38 ? 'awaiting' : u < .9 ? 'verified' : 'rejected';
    const sub = T.addDays('2026-10-28', -Math.floor(rnd() * (status === 'verified' ? 1090 : status === 'rejected' ? 200 : 9))), ids = [...T.EVIDENCE_RULES[claim], ...(type === 'third_party_verification' ? ['assurance', 'opinion'] : [])];
    const failed = status === 'review' || status === 'rejected' ? [pick(ids)] : [];
    out.push({id: `EV-S${String(i + 1).padStart(3, '0')}`, supplier: s.name, mat: s.mat, claim, type, status, sample: true,
      value: claim === 'origin_link' ? null : claim === 'recycled_share' ? Math.round(rnd() * 16) / 20 : +(4 + rnd() * 12).toFixed(1),
      assurance: type === 'third_party_verification' ? pick(['limited', 'limited', 'reasonable']) : 'none', received: status === 'awaiting' ? null : sub,
      due: status === 'awaiting' ? T.addDays('2026-10-28', 3 + Math.floor(rnd() * 40)) : T.addDays(sub, 7), valid: status === 'verified' ? T.addYears(sub, 3) : null,
      checks: ids.map(id => ({id, ok: !failed.includes(id)})), request: `REQ-S${String(100 + i)}`});
  }
  return out;
})();

// Live rows from the store: registry entries, open requests (awaiting) and restatements the analyst has to check.
function rows(s) {
  const mk = e => ({id: e.id, supplier: e.supplier, mat: 'al', claim: e.claim, type: e.verified_by, assurance: e.assurance_level, value: e.verified_value,
    status: e.status === 'verified' ? 'verified' : 'review', received: e.submitted_on, due: T.addDays(e.submitted_on, 7), valid: e.status === 'verified' ? e.statement.valid_until : null,
    checks: T.checkList(e),
    limits: e.scope_limits || [], request: e.request_id, provider: e.provider_name, reference: e.reference, period: e.statement.period_end, live: true, entry: e});
  const open = s.requests.filter(r => ['approved', 'forwarded', 'responded'].includes(r.status)).flatMap(r => r.letter.claims.map(c => ({id: `${r.id}·${c.claim}`, supplier: r.to, mat: 'al',
    claim: c.claim, type: null, status: 'awaiting', received: null, due: r.deadline, checks: [], request: r.id, comparison: r.comparison, live: true})));
  const fixes = todos(s, 'analyst').filter(q => s.requests.find(r => r.id === q.id)?.kind === 'data_fix').map(q => { const r = s.requests.find(x => x.id === q.id);
    return {id: `${r.id}·restated`, supplier: r.to, mat: 'al', claim: 'declared_unit', type: 'self_declaration', status: 'review', received: r.closed_on, due: T.addDays(r.closed_on || s.today, 7), checks: [], note: q.text, request: r.id, live: true}; });
  // the bracket request from the Evidence page: awaiting, then under review, then accepted with its file
  const e = reqEvidence(), ids = [...T.EVIDENCE_RULES.primary_pcf, 'assurance', 'opinion'];
  const v2 = e ? [{id: e.id, supplier: 'Smelter X', mat: 'al', claim: 'primary_pcf', type: 'third_party_verification', assurance: 'limited', value: e.status === 'awaiting' || e.status === 'support' ? null : e.value,
    status: e.status === 'verified' ? 'verified' : e.status === 'review' ? 'review' : 'awaiting', received: e.received, due: e.status === 'review' ? T.addDays(e.received, 7) : e.due, valid: e.status === 'verified' ? REUSE_UNTIL : null,
    checks: e.received ? ids.map(id => ({id, ok: true})) : [], request: e.req, provider: SIM_EVIDENCE.issuer, reference: SIM_EVIDENCE.ref, file: e.file, live: true, v2: true}] : [];
  return [...v2, ...fixes, ...s.registry.map(mk), ...open, ...SAMPLE];
}
const VIEWS = [['review', 'Needs review', r => r.status === 'review'], ['awaiting', 'Awaiting submission', r => r.status === 'awaiting'], ['verified', 'Accepted', r => r.status === 'verified'],
  ['expiring', 'Expiring in 90 days', r => r.status === 'verified' && r.valid && T.daysBetween(store.get().today, r.valid) <= 90], ['rejected', 'Not accepted', r => r.status === 'rejected'], ['all', 'All evidence', () => true]];
const SORT = {due: (a, b) => (a.due || '9').localeCompare(b.due || '9'), new: (a, b) => (b.received || '').localeCompare(a.received || ''), sup: (a, b) => a.supplier.localeCompare(b.supplier)};

$('#fMat').innerHTML = `<option value="">All materials</option>${MATERIALS.map(m => `<option value="${m.k}">${m.name}</option>`).join('')}`;
const set = (k, v) => { ui[k] = v; ui.page = 0; render(); };
$('#q').oninput = e => set('q', e.target.value.trim().toLowerCase());
for (const [id, k] of [['#fMat', 'mat'], ['#fClaim', 'claim'], ['#fType', 'type'], ['#sort', 'sort']]) $(id).onchange = e => set(k, e.target.value);

const due = (r, today) => { if (!r.due || r.status === 'verified' || r.status === 'rejected') return '<span class="sub">–</span>'; const n = T.daysBetween(today, r.due);
  return `<span class="sla ${n < 0 ? 'red' : n <= 3 ? 'amber' : 'sub'}">${n < 0 ? `${-n} d over` : n === 0 ? 'today' : `${n} d`}</span>`; };
function render() {
  const s = store.get(), all = rows(s);
  const base = all.filter(r => (!ui.q || `${r.supplier} ${r.id} ${r.request}`.toLowerCase().includes(ui.q)) && (!ui.mat || r.mat === ui.mat) && (!ui.claim || r.claim === ui.claim) && (!ui.type || r.type === ui.type));
  $('#views').innerHTML = VIEWS.map(([k, n, f]) => `<button class="${k === ui.view ? 'on' : ''}" data-v="${k}">${n}<em>${base.filter(f).length}</em></button>`).join('');
  $$('#views button').forEach(b => (b.onclick = () => { ui.open = null; set('view', b.dataset.v); }));
  const list = base.filter(VIEWS.find(v => v[0] === ui.view)[2]).sort(SORT[ui.sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); ui.page = Math.min(ui.page, pages - 1);
  const shown = list.slice(ui.page * PAGE, ui.page * PAGE + PAGE);
  if (!ui.open || !list.some(r => r.id === ui.open)) ui.open = shown[0]?.id || null;
  const kp = (k, v, sub) => `<div class="card"><div class="k">${k}</div><div class="kpi">${v}</div><div class="sub">${sub}</div></div>`;
  const rev = all.filter(r => r.status === 'review'), ver = all.filter(r => r.status === 'verified');
  const turn = SAMPLE.filter(r => r.status === 'verified').length ? 4 : null;
  $('#kp').innerHTML = kp('Needs review', rev.length, `${rev.filter(r => T.daysBetween(s.today, r.due) <= 3).length} due in 3 days`) + kp('Awaiting submission', all.filter(r => r.status === 'awaiting').length, 'requests still open')
    + kp('Accepted on file', ver.length, 'reusable across rounds') + kp('Expiring in 90 days', all.filter(VIEWS[3][2]).length, 'ask for renewal early')
    + kp('Acceptance rate', pct(ver.length / Math.max(1, ver.length + all.filter(r => r.status === 'rejected').length)), turn ? `review takes about ${turn} days` : '');
  $('#tbl').innerHTML = `<tr><th>Evidence</th><th>Claim</th><th class="hide-n">Type</th><th class="hide-n">Received</th><th>Status</th><th class="n">Due</th></tr>`
    + (shown.map(r => `<tr class="r${r.id === ui.open ? ' on' : ''}" data-id="${esc(r.id)}"><td class="nm"><b>${esc(r.supplier)}</b>${r.sample ? '<span class="smp">sample</span>' : ''}<div class="sub">${esc(r.id)} · ${matName(r.mat)}</div></td>
      <td>${CLAIM[r.claim]}${r.value != null ? `<div class="sub mono">${r.claim === 'recycled_share' ? pct(r.value) : r.value}</div>` : ''}</td><td class="hide-n sub">${r.type ? TYPE[r.type] : '–'}</td>
      <td class="hide-n mono sub">${r.received ? day(r.received) : '–'}</td><td><span class="tag ${ST[r.status][1]}">${ST[r.status][0]}</span></td><td class="n">${due(r, s.today)}</td></tr>`).join('')
      || `<tr><td colspan="6" class="sub">${ui.view === 'review' ? 'Nothing to review. New evidence lands here when a check fails or needs a judgement.' : 'No evidence matches these filters.'}</td></tr>`);
  $('#pg').innerHTML = `<span>${list.length ? `${ui.page * PAGE + 1}–${ui.page * PAGE + shown.length} of ${list.length}` : '0 items'}</span>
    <span><button id="prev"${ui.page ? '' : ' disabled'}>Previous</button> <span class="mono">${ui.page + 1} / ${pages}</span> <button id="next"${ui.page < pages - 1 ? '' : ' disabled'}>Next</button></span>`;
  $('#prev').onclick = () => { ui.page--; ui.open = null; render(); }; $('#next').onclick = () => { ui.page++; ui.open = null; render(); };
  $$('#tbl tr.r').forEach(tr => (tr.onclick = () => { ui.open = tr.dataset.id; render(); }));
  const r = all.find(x => x.id === ui.open);
  $('#detail').innerHTML = r ? detail(r, s) : '<div class="sub">Select an item to see its checks.</div>';
  $$('[data-follow]').forEach(b => (b.onclick = () => act({type: 'follow_up', actor: actor(me), id: b.dataset.follow}) && toast('Follow-up drafted for procurement to approve')));
  $$('[data-sample]').forEach(b => (b.onclick = () => toast('Sample item: decisions are recorded only for the aluminium round')));
}

const DOC = '<svg width="28" height="34" viewBox="0 0 28 34" aria-hidden="true"><path d="M3 1h15l7 7v23a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M18 1v7h7M6 15h14M6 20h14M6 25h9" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
function detail(r, s) {
  const req = r.request && s.requests.find(x => x.id === r.request);
  const passed = r.checks.filter(c => c.ok).length;
  const head = `<div class="k">${esc(r.id)} · ${matName(r.mat)}${r.sample ? ' · sample' : ''}</div><div class="h">${esc(r.supplier)}</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${ST[r.status][1]}">${ST[r.status][0]}</span><span class="sub">${CLAIM[r.claim]}${r.value != null ? ` · <span class="mono">${r.claim === 'recycled_share' ? pct(r.value) : r.value + ' kgCO₂e/kg'}</span>` : ''}</span></div>`;
  if (r.status === 'awaiting' && r.v2) return `${head}<div class="row" style="margin-top:12px"><span>Request</span><b class="code">${esc(r.request)}</b></div><div class="row"><span>Reply due</span><b class="mono">${day(r.due)}</b></div><a class="btn2" href="review.html#CL-X-PCF">Open the claim</a>`;
  if (r.status === 'awaiting') return `${head}<div class="row" style="margin-top:12px"><span>Request</span><b class="code">${esc(r.request)}</b></div><div class="row"><span>Reply due</span><b class="mono">${day(r.due)}</b></div>
    <div class="sub" style="margin-top:12px">Nothing received yet. When the supplier submits, the statement checks run automatically and the item moves to Accepted or Needs review.</div>
    ${r.comparison ? `<a class="btn2" href="manage.html#${r.comparison}">Open the comparison</a>` : ''}`;
  if (r.claim === 'declared_unit') return `${head}<div class="sub" style="margin-top:12px">${esc(r.note)}</div><div class="sub" style="margin-top:8px">The restated value is already used. Check why it differs from the model before the committee.</div>`;
  const doc = `<div class="doc">${DOC}<div><b>${TYPE[r.type] || '–'}</b><div class="sub">${r.provider ? esc(r.provider) + ' · ' : ''}assurance ${esc(r.assurance || 'none')}${r.reference ? ' · ' + esc(r.reference) : ''}</div>
    <div class="sub">${r.received ? `received ${day(r.received)}` : ''}${r.valid ? ` · valid until ${day(r.valid)}` : ''}</div></div></div>`;
  const checks = `<div class="k" style="margin-top:16px">Statement checks · ${passed} of ${r.checks.length} pass</div>
    ${r.checks.map(c => `<div class="chk"><i class="${c.ok ? 'y' : 'n'}">${c.ok ? '✓' : '!'}</i><div>${CHECK_NAME[c.id]}${!c.ok && c.why ? `<div class="sub red">${esc(c.why)}</div>` : ''}</div></div>`).join('')}
    ${(r.limits || []).map(l => `<div class="chk"><i class="m">?</i><div>${esc(l)}</div></div>`).join('')}`;
  if (r.v2) return head + doc.replace('</b>', `</b><div class="sub">${esc(r.file)}</div>`) + checks + `<div class="row" style="margin-top:12px"><span>Answers</span><b><span class="code">${esc(r.request)}</span> · Smelter X PCF</b></div>
    <a class="btn${r.status === 'review' ? '' : '2'}" href="review.html#CL-X-PCF">${r.status === 'review' ? 'Review in Evidence' : 'Open the claim'}</a>`;
  const link = req ? `<div class="row" style="margin-top:12px"><span>Answers</span><b><span class="code">${esc(req.id)}</span> · <a class="lnk" href="manage.html#${req.comparison}">${esc(req.comparison)}</a></b></div>` : '';
  const actions = r.status !== 'review' ? '' : r.live
    ? (req && !req.superseded_by ? `<button class="btn" data-follow="${esc(req.id)}">Draft follow-up for the rest</button>` : '')
    : `<div class="acts"><button class="btn" data-sample>Accept</button><button class="btn2" data-sample>Ask for a corrected statement</button></div>`;
  return head + doc + checks + link + actions;
}

store.subscribe(render);
flow.subscribe(render);
mountNav('evidence');
mountContext([BASE_CRUMBS[0], {t: 'Evidence registry'}], '<div class="seg"><a href="review.html">Claims</a><a class="on" href="registry.html">Registry</a></div>');
cursorLight();
render();
