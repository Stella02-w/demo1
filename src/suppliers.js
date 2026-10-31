// Supplier Center: the supply base as a list. Saved views + filters + paging keep it usable at several hundred rows.
import {ROSTER, MATERIALS, REGIONS, matName} from './roster.js';
import {rounds} from './store.js';
import {A as A2, LINKS, CLAIMS, KIND, SENS, flow, claimState, name as v2name, HISTORY, reqEvidence, REUSE_UNTIL} from './v2.js';
import {openDoc, CLIP} from './docview.js';
import {status as chainStatus} from './chain.js';
import {SIM_EVIDENCE} from './v2.js';
import {store, SESSIONS, $, $$, esc, pct, day, STATUS, tag, toast, mountNav, dismissable, cursorLight} from './ui.js';

const PAGE = 25;
const DATA = {verified: ['Verified', 't-ok'], declared: ['Self-reported', 't-rev'], none: ['None', 't-mut']};
const ui = {view: 'all', q: '', mat: '', tier: 0, reg: '', sort: 'risk', page: 0, sel: new Set(), open: null};

// Live state for the twin's organisations: latest request and whether an unverified claim of theirs can change a decision.
const nm = f => f.replace(/^Tier1_/, 'Tier 1 ').replace(/_/g, ' ');
function enrich() {
  const s = store.get(), risky = new Set(rounds(s).flatMap(v => v.verdict.claims.filter(c => c.decision !== 'continue_analysis').flatMap(c => [c.node, ...c.suppliers])));
  return ROSTER.map(r => {
    if (!r.twin) return {...r, risk: r.data === 'none' && r.tier < 3 ? 1 : 0};
    const reqs = s.requests.filter(q => q.status !== 'withdrawn' && (q.to === r.id || q.via.includes(r.id)));
    const last = reqs.at(-1), reqStatus = last ? last.status : null;
    // the bracket round (Evidence page) decides these flags where it covers the organisation
    const vid = V2ID[r.id] || r.id, cs = ['Supplier_B', 'Smelter_X', 'Supplier_H', 'Supplier_I', 'Supplier_C', 'Supplier_K', 'Supplier_A', 'Supplier_E'].includes(vid) ? chainStatus(vid) : null;
    // REQ-1 is about Smelter X's PCF: the request and its file sit with Smelter X; Supplier B only relays it (see its profile)
    const e = reqEvidence(), v2req = e && vid === 'Smelter_X' ? {verified: 'verified', review: 'responded', support: 'responded', awaiting: 'forwarded'}[e.status] : null;
    const decides = cs ? cs === 'chg' : risky.has(r.id);
    return {...r, name: r.name.replace(/_/g, ' '), req: v2req || reqStatus, reqId: v2req ? e.req : last?.id, last: v2req ? (e.accepted || e.received || e.sent) : last ? (last.closed_on || last.requested_on || last.created_on) : null,
      decides, risk: decides ? 2 : 0, reqs, data: cs === 'ok' ? 'verified' : r.data};
  });
}
const OPEN = ['approved', 'forwarded', 'responded', 'partially_verified'];
const VIEWS = [
  ['all', 'All suppliers', () => true],
  ['attn', 'Needs attention', r => r.decides || r.req === 'expired' || r.req === 'declined'],
  ['req', 'In a request', r => OPEN.includes(r.req) || r.req === 'draft'],
  ['nodata', 'No data', r => r.data === 'none'],
  ['ver', 'Verified', r => r.data === 'verified']
];
const SORT = {risk: (a, b) => b.risk - a.risk || (a.twin ? -1 : 0) + (b.twin ? 1 : 0) || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name),
  dqr: (a, b) => (a.dqr ?? 9) - (b.dqr ?? 9), rec: (a, b) => (b.recycled ?? -1) - (a.recycled ?? -1), last: (a, b) => (b.last || '').localeCompare(a.last || '')};

$('#fMat').innerHTML = `<option value="">All materials</option>${MATERIALS.map(m => `<option value="${m.k}">${m.name}</option>`).join('')}`;
$('#fReg').innerHTML = `<option value="">All regions</option>${REGIONS.map(r => `<option>${r}</option>`).join('')}`;
$('#fTier').innerHTML = ['All', 'T1', 'T2', 'T3'].map((t, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-t="${i}">${t}</button>`).join('');
const set = (k, v) => { ui[k] = v; ui.page = 0; render(); };
$('#q').oninput = e => set('q', e.target.value.trim().toLowerCase());
$('#fMat').onchange = e => set('mat', e.target.value);
$('#fReg').onchange = e => set('reg', e.target.value);
$('#sort').onchange = e => set('sort', e.target.value);
$$('#fTier .chip').forEach(b => (b.onclick = () => { $$('#fTier .chip').forEach(x => x.classList.toggle('on', x === b)); set('tier', +b.dataset.t); }));

// evidence files on record for a supplier
const ISSUER = 'Accredited verifier · ISO 14065';
function files(r) {
  const vid = V2ID[r.id] || r.id, e = reqEvidence(), out = [];
  if (vid === 'Smelter_X' && e?.received) out.push({file: SIM_EVIDENCE.file, title: 'Verification Statement', ref: SIM_EVIDENCE.ref, issuer: SIM_EVIDENCE.issuer, issued: SIM_EVIDENCE.issued, pages: 4,
    intro: 'Verified product carbon footprint of primary aluminium produced at Smelter X, allocated to Supplier B for metal supplied to Tier1_B.',
    fields: [['Smelter', 'Smelter X'], ['Period', SIM_EVIDENCE.period], ['Boundary', 'cradle-to-gate'], ['Verified PCF', `${SIM_EVIDENCE.value} kgCO₂e/kg`]],
    checks: ['Evidence type proves the claim', 'Smelter named', 'Unit and boundary', 'Reporting period', 'Issuer accredited'], status: e.status === 'verified' ? `Accepted · reusable until ${REUSE_UNTIL}` : 'Under review'});
  if (vid === 'Supplier_C') out.push({file: 'EV-C-RCC_recycled_content.pdf', title: 'Recycled Content Certificate', ref: 'EV-C-RCC', issuer: ISSUER, issued: '2026-04-02', pages: 2,
    intro: 'Certifies the recycled aluminium content of ingot supplied by Supplier C under a chain-of-custody scheme.', fields: [['Supplier', 'Supplier C'], ['Recycled share', '20%'], ['Period', '2025'], ['Valid until', '2029-04']],
    checks: ['Evidence type proves the claim', 'Covers the product', 'Content definition recognised', 'Statement still valid'], status: 'On file · reusable'});
  else if (r.data === 'verified' && !out.length) out.push({file: `${r.id.toLowerCase()}_pcf_statement.pdf`, title: 'Verification Statement', ref: `VS-${r.id.replace(/_/g, "-")}`, issuer: ISSUER, issued: `${r.year || 2025}-06-30`, pages: 3,
    intro: `Verified carbon data for ${r.name}.`, fields: [['Supplier', r.name], ['Material', matName(r.mat)], ['Period', String(r.year || 2025)], ['Boundary', 'cradle-to-gate'], ...(r.recycled != null ? [['Recycled share', pct(r.recycled)]] : [])],
    checks: ['Evidence type proves the claim', 'Covers the product', 'Reporting period', 'Issuer accredited'], status: 'On file'});
  return out;
}
const dq = n => n == null ? '' : `<span class="dq" title="Data quality rating ${n} (1 best)">${[1, 2, 3, 4].map(i => `<i class="${i <= 5 - n ? 'on' : ''}"></i>`).join('')}</span>`;
function render() {
  const all = enrich();
  const base = all.filter(r => (!ui.q || `${r.name} ${r.id} ${r.region}`.toLowerCase().includes(ui.q)) && (!ui.mat || r.mat === ui.mat) && (!ui.tier || r.tier === ui.tier) && (!ui.reg || r.region === ui.reg));
  $('#views').innerHTML = VIEWS.map(([k, n, f]) => `<button class="${k === ui.view ? 'on' : ''}" data-v="${k}">${n}<em>${base.filter(f).length}</em></button>`).join('');
  $$('#views button').forEach(b => (b.onclick = () => set('view', b.dataset.v)));
  const rows = base.filter(VIEWS.find(v => v[0] === ui.view)[2]).sort(SORT[ui.sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)); ui.page = Math.min(ui.page, pages - 1);
  const shown = rows.slice(ui.page * PAGE, ui.page * PAGE + PAGE);
  const kp = (k, v, sub) => `<div class="card"><div class="k">${k}</div><div class="kpi">${v}</div><div class="sub">${sub}</div></div>`;
  const ver = all.filter(r => r.data === 'verified').length;
  $('#kp').innerHTML = kp('Suppliers', all.length, `${MATERIALS.length} materials · 3 tiers`) + kp('Verified carbon data', `${Math.round(ver / all.length * 100)}<small>%</small>`, `${ver} suppliers`)
    + kp('Could change a decision', all.filter(r => r.decides).length, 'unverified claims this round') + kp('In a request', all.filter(r => OPEN.includes(r.req)).length, 'waiting on evidence');
  $('#tbl').innerHTML = `<tr><th style="width:28px"><input type="checkbox" id="all" aria-label="Select page"></th><th>Supplier</th><th>Material</th><th>Tier</th><th class="hide-n">Feeds</th><th>Data status</th><th>Request</th><th>Evidence</th><th class="hide-n">Last activity</th></tr>`
    + (shown.map(r => `<tr class="r${r.id === ui.open ? ' on' : ''}" data-id="${r.id}"><td><input type="checkbox" data-c="${r.id}"${ui.sel.has(r.id) ? ' checked' : ''} aria-label="Select ${esc(r.name)}"></td>
      <td class="nm"><b>${esc(r.name)}</b>${r.sample ? '<span class="smp">sample</span>' : ''}${r.decides ? ' <span class="tag t-rev">could change a decision</span>' : ''}<div class="sub">${r.twin ? 'Q4-26 aluminium round' : `${esc(r.id)} · ${esc(r.region)}`}</div></td>
      <td>${matName(r.mat)}</td><td class="tier">T${r.tier}</td><td class="hide-n sub">${r.feeds.length ? esc(r.feeds.slice(0, 2).map(nm).join(', ')) + (r.feeds.length > 2 ? ` +${r.feeds.length - 2}` : '') : '–'}</td>
      <td>${tag(DATA[r.data])}</td>
      <td>${r.req ? tag(STATUS[r.req]) : '<span class="sub">–</span>'}</td><td>${(n => n ? `<button class="att1" data-doc="${r.id}" aria-label="View evidence for ${esc(r.name)}">${CLIP}${n}</button>` : '<span class="sub">–</span>')(files(r).length)}</td><td class="mono sub hide-n">${r.last ? day(r.last) : '–'}</td></tr>`).join('')
      || '<tr><td colspan="9" class="sub">No suppliers match these filters.</td></tr>');
  $('#pg').innerHTML = `<span>${rows.length ? `${ui.page * PAGE + 1}–${ui.page * PAGE + shown.length} of ${rows.length}` : '0 suppliers'}</span>
    <span><button id="prev"${ui.page ? '' : ' disabled'}>Previous</button> <span class="mono">${ui.page + 1} / ${pages}</span> <button id="next"${ui.page < pages - 1 ? '' : ' disabled'}>Next</button></span>`;
  $('#prev').onclick = () => { ui.page--; render(); }; $('#next').onclick = () => { ui.page++; render(); };
  $('#all').checked = shown.length && shown.every(r => ui.sel.has(r.id));
  $('#all').onchange = e => { shown.forEach(r => (e.target.checked ? ui.sel.add(r.id) : ui.sel.delete(r.id))); render(); };
  $$('#tbl [data-c]').forEach(c => (c.onclick = e => { e.stopPropagation(); c.checked ? ui.sel.add(c.dataset.c) : ui.sel.delete(c.dataset.c); bulk(); }));
  $$('#tbl [data-doc]').forEach(b => (b.onclick = e => { e.stopPropagation(); openDoc(files(all.find(x => x.id === b.dataset.doc))[0]); }));
  $$('#tbl tr.r').forEach(tr => (tr.onclick = () => (ui.open === tr.dataset.id ? closeDrawer() : openDrawer(tr.dataset.id))));
  bulk();
  if (ui.open) { const r = all.find(x => x.id === ui.open); $('#drawer').innerHTML = profile(r); $$('#drawer [data-fi]').forEach(b => (b.onclick = () => openDoc(files(r)[+b.dataset.fi]))); }
}
function bulk() {
  const n = ui.sel.size, b = $('#bulk'); b.hidden = !n;
  b.innerHTML = `<b>${n} selected</b><button data-a>Request carbon data</button><button data-a>Export list</button><span class="sp"></span><button id="clr">Clear</button>`;
  b.querySelectorAll('[data-a]').forEach(x => (x.onclick = () => toast('Bulk actions are not wired up in this demo')));
  $('#clr').onclick = () => { ui.sel.clear(); render(); };
}

function profile(r) {
  const portal = SESSIONS.find(s => s.id === r.id);
  return `<button class="x" aria-label="Close">✕</button><div class="k">${matName(r.mat)} · Tier ${r.tier}${r.sample ? ' · sample' : ''}</div>
    <div class="h">${esc(r.name)}</div><div class="sub">${r.twin ? 'Q4-26 aluminium round' : `${esc(r.id)} · ${esc(r.region)}`}</div>
    <div class="cells"><div><div class="k">Data status</div><div style="margin-top:6px">${tag(DATA[r.data])}</div></div></div>
    ${r.smelter ? `<div class="row"><span>Metal from</span><b>${esc(r.smelter)}</b></div>` : ''}${r.year ? `<div class="row"><span>PCF reference year</span><b class="mono">${r.year}</b></div>` : ''}
    ${r.feeds.length ? `<div class="k" style="margin-top:14px">${r.tier === 3 ? 'Supplies' : r.tier === 2 ? 'Sells to' : 'Makes'}</div><div class="chain">${r.feeds.map(f => `<span>${esc(nm(f))}</span>`).join('')}</div>` : ''}
    ${r.decides ? '<div class="bad">An unverified claim from this supplier could change a sourcing decision this round.</div>' : ''}
    <div class="k" style="margin-top:16px">Requests</div>
    ${r.reqs?.length ? r.reqs.map(q => `<div class="row"><span class="code">${esc(q.id)}</span><b>${tag(STATUS[q.status])} <span class="sub mono">due ${day(q.deadline)}</span></b></div>`).join('')
      : r.req ? `<div class="row"><span>Latest</span><b>${tag(STATUS[r.req])}</b></div>` : '<div class="sub">None this round.</div>'}
    ${(fs => fs.length ? `<div class="k" style="margin-top:16px">Evidence files</div>${fs.map((f, i) => `<button class="frow" data-fi="${i}">${CLIP}<span>${esc(f.file)}<em>${esc(f.status)}</em></span><b>View</b></button>`).join('')}` : '')(files(r))}
    ${v2Section(r.id)}${historySection(V2ID[r.id] || r.id)}
    ${r.twin ? `<a class="btn${V2ID[r.id] || A2.claims.some(c => c.supplier === r.id) ? '2' : ''}" href="workbench.html">Show on twin</a>` : ''}
    ${portal ? `<a class="btn2" href="supplier.html?as=${encodeURIComponent(r.id)}">Preview their portal</a>` : ''}`;
}
// Bracket round (v2): relationships with their origin status, and the claims this organisation holds.
const V2ID = {Unknown_B: 'Smelter_X'}, ROSTER_ID = {Smelter_X: 'Unknown_B'};
// Track record across rounds: what was asked, how they answered, and what they receive for it.
function historySection(id) {
  const rows = [...(HISTORY[id] || [])], e = reqEvidence();
  if (id === 'Smelter_X' && e?.received) rows.unshift(['Q4-26', 'Primary PCF statement', e.status === 'verified' ? 'Verified · reusable' : 'Submitted · under review', e.status === 'verified' ? 'ok' : 'rev']);
  if (id === 'Supplier_B' && e) rows.unshift(['Q4-26', 'Relayed Smelter X PCF request', e.status === 'verified' ? `Verified on time · reusable to ${REUSE_UNTIL}` : e.status === 'review' ? 'Submitted · under review' : e.status === 'support' ? 'Asked for verification support' : `Requested · due ${e.due}`, e.status === 'verified' ? 'ok' : 'rev']);
  if (!rows.length) return '';
  const answered = rows.filter(r => r[3] === 'ok').length;
  return `<div class="k" style="margin-top:16px">Track record</div>
    <div class="row"><span>Verified on time</span><b>${answered} of ${rows.length} requests</b></div>
    ${rows.map(([rd, what, out, tone]) => `<div class="row"><span><span class="mono">${rd}</span> · ${esc(what)}</span><b><span class="tag t-${tone}">${esc(out)}</span></b></div>`).join('')}`;
}
function v2Section(rid) {
  const id = V2ID[rid] || rid, fs = flow.get(), linkOk = l => l.origin_verified || (l.from_id === 'Smelter_X' && l.to_id === 'Supplier_B' && fs.req?.status === 'accepted');
  const ups = LINKS.filter(l => l.to_id === id), downs = LINKS.filter(l => l.from_id === id), claims = A2.claims.filter(c => c.supplier === id);
  if (!ups.length && !downs.length && !claims.length) return '';
  const link = (other, l) => `<div class="row"><span>${esc(v2name(other))}</span><b>${linkOk(l) ? '<span class="tag t-ok">Origin confirmed</span>' : '<span class="tag t-rev">Origin unconfirmed</span>'}</b></div>`;
  const xs = id === 'Smelter_X' ? `<div class="row"><span>Smelter PCF 10.1</span><b>${fs.req?.status === 'accepted' ? '<span class="tag t-ok">Verified · reusable</span>' : '<span class="tag t-rev">Unconfirmed</span>'}</b></div>` : '';
  return `${ups.length ? `<div class="k" style="margin-top:16px">Metal from</div>${ups.map(l => link(l.from_id, l)).join('')}` : ''}
    ${downs.length ? `<div class="k" style="margin-top:16px">Origin links</div>${xs}${downs.map(l => link(l.to_id, l)).join('')}` : ''}
    ${id === 'Smelter_X' ? '<div class="sub" style="margin-top:8px;font-size:12px">A verified smelter PCF does not confirm each supplier\'s origin link.</div>' : ''}
    ${claims.length ? `<div class="k" style="margin-top:16px">Claims · bracket round</div>${claims.map(c => `<a class="row" href="review.html#${c.claim_id}" style="text-decoration:none"><span>${KIND[c.kind]}</span><b>${esc(claimState(c.claim_id).text)}</b></a>`).join('')}` : ''}
    ${(oc => oc ? `<a class="btn" href="review.html#${oc.claim_id}">Open claim</a>` : '')(claims.find(c => c.recommendation !== 'no_action' && claimState(c.claim_id).basis !== 'verified'))}`;
}
let off = null;
function openDrawer(id) {
  ui.open = id; render(); const d = $('#drawer'); d.classList.add('open');
  off?.(); off = dismissable(d, closeDrawer, $('#tbl'));
}
function closeDrawer() { ui.open = null; $('#drawer').classList.remove('open'); off?.(); off = null; $$('#tbl tr.r').forEach(t => t.classList.remove('on')); }
$('#drawer').addEventListener('click', e => { if (e.target.closest('.x')) closeDrawer(); });

store.subscribe(render);
flow.subscribe(render);
mountNav('suppliers');
{ const h = location.hash.slice(1), id = ROSTER_ID[h] || h; if (ROSTER.some(r => r.id === id)) setTimeout(() => openDrawer(id), 0); }
cursorLight();
render();
