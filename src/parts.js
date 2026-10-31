// Parts Center: every part on every vehicle with its sourcing record. Saved views + filters + paging keep it usable at a few hundred rows.
import {MODELS} from './models.js';
import {MATERIALS, matName} from './roster.js';
import {catalogue, partRecord, recordHTML} from './history.js';
import {store, $, $$, esc, f2, day, STAGE, tag, toast, mountNav, dismissable, cursorLight} from './ui.js';

const PAGE = 25, SOON = '2027-10-31'; // "due within a year" of the demo date
const BASIS = {verified: ['Verified', 't-ok'], declared: ['Self-reported', 't-rev'], estimated: ['Estimated', 't-mut']};
const ui = {view: 'all', q: '', veh: '', mat: '', sort: 'attn', page: 0, sel: new Set(), open: null};
const CAT = catalogue();

function rows() {
  return CAT.map(p => {
    const r = partRecord(p.model, p);
    return {...p, r, pcf: r.last.pcf, drop: r.drop, tier1: r.current, basis: r.basis, next: r.live ? r.live.row : {round: r.h.next[0], date: r.h.next[1]},
      stage: r.live?.v.stage, soon: !r.live && r.h.next[1] <= SOON, rising: r.drop > 0};
  });
}
const VIEWS = [
  ['all', 'All parts', () => true],
  ['live', 'In this round', r => r.flag],
  ['soon', 'Due within a year', r => r.soon],
  ['unver', 'Not verified', r => r.basis !== 'verified'],
  ['rising', 'Carbon rising', r => r.rising]
];
const attn = r => (r.flag ? 3 : 0) + (r.rising ? 2 : 0) + (r.soon ? 1 : 0);
const SORT = {attn: (a, b) => attn(b) - attn(a) || b.pcf - a.pcf, pcf: (a, b) => b.pcf - a.pcf, trend: (a, b) => b.drop - a.drop,
  next: (a, b) => a.next.date.localeCompare(b.next.date), name: (a, b) => a.name.localeCompare(b.name)};

$('#fVeh').innerHTML = `<option value="">All vehicles</option>${MODELS.map(m => `<option value="${m.k}">${m.name}</option>`).join('')}`;
$('#fMat').innerHTML = `<option value="">All materials</option>${MATERIALS.map(m => `<option value="${m.k}">${m.name}</option>`).join('')}`;
const set = (k, v) => { ui[k] = v; ui.page = 0; render(); };
$('#q').oninput = e => set('q', e.target.value.trim().toLowerCase());
$('#fVeh').onchange = e => set('veh', e.target.value);
$('#fMat').onchange = e => set('mat', e.target.value);
$('#sort').onchange = e => set('sort', e.target.value);

// a tiny trend line of carbon per part across the part's sourcing rounds
const mini = r => { const ys = r.r.rows.filter(x => x.pcf != null).map(x => x.pcf), lo = Math.min(...ys), hi = Math.max(...ys), n = ys.length;
  return `<svg viewBox="0 0 54 18" aria-hidden="true"><polyline points="${ys.map((y, i) => `${(i * 54 / Math.max(1, n - 1)).toFixed(1)},${(16 - (y - lo) / ((hi - lo) || 1) * 14).toFixed(1)}`).join(' ')}"/></svg>`; };
function render() {
  const all = rows();
  const base = all.filter(r => (!ui.q || `${r.name} ${r.id} ${r.tier1}`.toLowerCase().includes(ui.q)) && (!ui.veh || r.model.k === ui.veh) && (!ui.mat || r.mat === ui.mat));
  $('#views').innerHTML = VIEWS.map(([k, n, f]) => `<button class="${k === ui.view ? 'on' : ''}" data-v="${k}">${n}<em>${base.filter(f).length}</em></button>`).join('');
  $$('#views button').forEach(b => (b.onclick = () => set('view', b.dataset.v)));
  const list = base.filter(VIEWS.find(v => v[0] === ui.view)[2]).sort(SORT[ui.sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); ui.page = Math.min(ui.page, pages - 1);
  const shown = list.slice(ui.page * PAGE, ui.page * PAGE + PAGE);
  const kp = (k, v, sub) => `<div class="card"><div class="k">${k}</div><div class="kpi">${v}</div><div class="sub">${sub}</div></div>`;
  const ver = all.filter(r => r.basis === 'verified').length, drops = all.map(r => r.drop).sort((a, b) => a - b), med = drops[Math.floor(drops.length / 2)];
  $('#kp').innerHTML = kp('Parts tracked', all.length, `${MODELS.length} vehicles · ${MATERIALS.length} materials`)
    + kp('In this round', all.filter(r => r.flag).length, '3 shared aluminium parts')
    + kp('Due within a year', all.filter(r => r.soon).length, 'next sourcing by Oct 2027')
    + kp('Verified carbon data', `${Math.round(ver / all.length * 100)}<small>%</small>`, `${ver} parts at last award`)
    + kp('Median change', `${med < 0 ? '−' : '+'}${Math.abs(med * 100).toFixed(0)}<small>%</small>`, 'kgCO₂e per part since first sourced');
  $('#tbl').innerHTML = `<tr><th style="width:28px"><input type="checkbox" id="all" aria-label="Select page"></th><th>Part</th><th>Vehicle</th><th class="hide-n">Material</th><th class="hide-n">Current Tier 1</th>
    <th class="n">kgCO₂e / part</th><th>Trend</th><th>Basis</th><th class="hide-n">Next sourcing</th><th>Status</th></tr>`
    + (shown.map(r => `<tr class="r${r.id === ui.open ? ' on' : ''}" data-id="${r.id}"><td><input type="checkbox" data-c="${r.id}"${ui.sel.has(r.id) ? ' checked' : ''} aria-label="Select ${esc(r.name)}"></td>
      <td class="nm"><b>${esc(r.name)}</b>${r.sample ? '<span class="smp">sample</span>' : ''}<div class="sub">${esc(r.id)}</div></td>
      <td class="veh">${esc(r.model.name)}</td><td class="hide-n">${matName(r.mat)}</td><td class="hide-n">${esc(r.tier1)}</td>
      <td class="n mono">${f2(r.pcf)}</td><td><span class="trend">${mini(r)}<span class="mono" style="color:var(--${r.drop < 0 ? 'teal' : 'red'})">${r.drop < 0 ? '−' : '+'}${Math.abs(r.drop * 100).toFixed(0)}%</span></span></td>
      <td>${tag(BASIS[r.basis] || ['Under review', 't-rev'])}</td><td class="hide-n mono sub">${esc(r.next.round)} · ${day(r.next.date)}</td>
      <td>${r.flag ? tag(STAGE[r.stage]) : r.soon ? '<span class="tag t-rev">Due soon</span>' : '<span class="sub">–</span>'}</td></tr>`).join('')
      || '<tr><td colspan="10" class="sub">No parts match these filters.</td></tr>');
  $('#pg').innerHTML = `<span>${list.length ? `${ui.page * PAGE + 1}–${ui.page * PAGE + shown.length} of ${list.length}` : '0 parts'}</span>
    <span><button id="prev"${ui.page ? '' : ' disabled'}>Previous</button> <span class="mono">${ui.page + 1} / ${pages}</span> <button id="next"${ui.page < pages - 1 ? '' : ' disabled'}>Next</button></span>`;
  $('#prev').onclick = () => { ui.page--; render(); }; $('#next').onclick = () => { ui.page++; render(); };
  $('#all').checked = shown.length && shown.every(r => ui.sel.has(r.id));
  $('#all').onchange = e => { shown.forEach(r => (e.target.checked ? ui.sel.add(r.id) : ui.sel.delete(r.id))); render(); };
  $$('#tbl [data-c]').forEach(c => (c.onclick = e => { e.stopPropagation(); c.checked ? ui.sel.add(c.dataset.c) : ui.sel.delete(c.dataset.c); bulk(); }));
  $$('#tbl tr.r').forEach(tr => (tr.onclick = () => (ui.open === tr.dataset.id ? closeDrawer() : openDrawer(tr.dataset.id))));
  bulk();
  if (ui.open) { const r = all.find(x => x.id === ui.open); if (r) $('#drawer').innerHTML = record(r); }
}
function bulk() {
  const n = ui.sel.size, b = $('#bulk'); b.hidden = !n;
  b.innerHTML = `<b>${n} selected</b><button data-a>Add to next sourcing round</button><button data-a>Request carbon data</button><button data-a>Export list</button><span class="sp"></span><button id="clr">Clear</button>`;
  b.querySelectorAll('[data-a]').forEach(x => (x.onclick = () => toast('Bulk actions are not wired up in this demo')));
  $('#clr').onclick = () => { ui.sel.clear(); render(); };
}
function record(r) {
  return `<button class="x" aria-label="Close">✕</button>${recordHTML(r.model, r, matName(r.mat))}
    <a class="btn" href="workbench.html?model=${r.model.k}${r.flag ? '#' + r.k : ''}">${r.flag ? "Open this round's decision" : `See it on the ${esc(r.model.name)}`}</a>`;
}
let off = null;
function openDrawer(id) {
  ui.open = id; render(); const d = $('#drawer'); d.classList.add('open');
  off?.(); off = dismissable(d, closeDrawer, $('#tbl'));
}
function closeDrawer() { ui.open = null; $('#drawer').classList.remove('open'); off?.(); off = null; $$('#tbl tr.r').forEach(t => t.classList.remove('on')); }
$('#drawer').addEventListener('click', e => { if (e.target.closest('.x')) closeDrawer(); });

store.subscribe(render);
mountNav('parts');
cursorLight();
render();
// deep link from the Sourcing Center: parts.html#RRS-BRACKET opens that part's record
const deep = decodeURIComponent(location.hash.slice(1));
if (CAT.some(p => p.id === deep)) openDrawer(deep);
