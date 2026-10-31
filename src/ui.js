// Shared page helpers: the product navigation, the demo menu (date + reset), formatting, toasts, click-away.
import {createStore, todos} from './store.js';
import {ROUND} from './data.js';
import {flow, R as ROUND2} from './v2.js';

// The product's four centres. Each page is one of them; nobody signs in as a person in this demo.
export const CENTERS = [
  {k: 'sourcing', name: 'Sourcing', href: 'workbench.html'},
  {k: 'parts', name: 'Parts', href: 'parts.html'},
  {k: 'suppliers', name: 'Suppliers', href: 'suppliers.html'},
  {k: 'evidence', name: 'Evidence', href: 'review.html'},
  {k: 'decision', name: 'Decision', href: 'decision.html'},
  // the second group works across rounds: who is connected, and what they could change together
  {k: 'network', name: 'Network', href: 'network.html', g2: true},
  {k: 'collaborate', name: 'Collaborate', href: 'collaborate.html', g2: true}
];
// a page opened inside the evidence drawer drops its own navigation
if (/[?&]embed/.test(location.search)) document.documentElement.classList.add('embed');
// Who acts on each page. The store checks every action against these; production gets them from SSO.
// Supplier Portal accounts are organisations: the portal's own account switcher picks one with `?as=`.
export const SESSIONS = [
  {id: 'buyer', role: 'buyer', org: 'JLR', label: 'Procurement', page: 'workbench.html'},
  {id: 'analyst', role: 'analyst', org: 'JLR', label: 'Carbon analysis', page: 'review.html'},
  {id: 'committee', role: 'committee', org: 'JLR', label: 'Sourcing committee', page: 'manage.html'},
  {id: 'manager', role: 'manager', org: 'JLR', label: 'Procurement management', page: 'manage.html'},
  {id: 'Tier1_B', role: 'tier1', org: 'Tier1_B', label: 'Tier1_B', tier: 'Tier 1', page: 'supplier.html'},
  {id: 'Tier1_C', role: 'tier1', org: 'Tier1_C', label: 'Tier1_C', tier: 'Tier 1', page: 'supplier.html'},
  {id: 'Tier1_D', role: 'tier1', org: 'Tier1_D', label: 'Tier1_D', tier: 'Tier 1', page: 'supplier.html'},
  {id: 'Supplier_B', role: 'supplier', org: 'Supplier_B', label: 'Supplier_B', tier: 'Tier 2', page: 'supplier.html'},
  {id: 'Supplier_D', role: 'supplier', org: 'Supplier_D', label: 'Supplier_D', tier: 'Tier 2', page: 'supplier.html'},
  {id: 'Supplier_H', role: 'supplier', org: 'Supplier_H', label: 'Supplier_H', tier: 'Tier 2', page: 'supplier.html'},
  {id: 'Supplier_I', role: 'supplier', org: 'Supplier_I', label: 'Supplier_I', tier: 'Tier 2', page: 'supplier.html'}
];
// [Assumption] Demo dates worth jumping to: opening, on-time evidence, deadline, after deadline, committee, late evidence.
export const CLOCK = ['2026-10-28', '2026-11-02', '2026-11-20', '2026-11-27', '2026-12-01', '2026-12-15', '2027-01-10'];

export const store = createStore();
export const session = (fallback = 'buyer') => {
  const id = new URLSearchParams(location.search).get('as') || fallback;
  return SESSIONS.find(s => s.id === id) || SESSIONS.find(s => s.id === fallback);
};
export const as = id => SESSIONS.find(s => s.id === id);
export const actor = s => ({role: s.role, org: s.org});

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const f2 = v => (v == null ? '–' : Number(v).toFixed(2));
export const pct = v => `${Math.round(v * 100)}%`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const day = iso => { if (!iso) return '–'; const [y, m, d] = iso.split('-'); return `${+d} ${MON[m - 1]}${y !== '2026' ? ' ' + y.slice(2) : ''}`; };

export const STATUS = {
  draft: ['Draft', 't-info'], approved: ['Sent via Tier 1', 't-info'], forwarded: ['Awaiting reply', 't-rev'], responded: ['Reply received', 't-rev'],
  verified: ['Verified', 't-ok'], partially_verified: ['Under review', 't-rev'], declined: ['No evidence', 't-pause'], expired: ['Deadline passed', 't-pause'],
  withdrawn: ['Withdrawn', 't-mut'], restated: ['Restated', 't-ok']
};
export const STAGE = {
  needs_action: ['Review', 't-rev'], paused: ['Paused', 't-pause'], approve: ['Approve', 't-info'], awaiting_evidence: ['Awaiting evidence', 't-rev'],
  ready: ['Pack ready', 't-ok'], nominated: ['Nominated', 't-mut']
};
export const DECISION = {continue_analysis: ['Continue', 't-ok'], needs_human_review: ['Review', 't-rev'], suggest_pause: ['Pause suggested', 't-pause']};
export const tag = ([text, cls]) => `<span class="tag ${cls}">${esc(text)}</span>`;

let tt;
export function toast(m, isErr) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'glass'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = m; t.classList.toggle('err', !!isErr); t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800);
}
// Dispatch and surface the reducer's reason when an action is not allowed.
export function act(action) { try { store.dispatch(action); return true; } catch (e) { toast(e.message, true); return false; } }

// ---------- click-away ----------
// Anything that opens (a menu, a card, a <details>) closes when its trigger is pressed again, on a click elsewhere, or on Esc.
const openers = new Set();
export function dismissable(el, close, trigger = null) { const o = {el, close, trigger}; openers.add(o); return () => openers.delete(o); }
function closeOutside(target) {
  for (const o of [...openers]) if (!o.el.contains(target) && !o.trigger?.contains(target)) { openers.delete(o); o.close(); }
  for (const d of document.querySelectorAll('details[open]')) if (!d.contains(target)) d.open = false;
}
document.addEventListener('pointerdown', e => closeOutside(e.target), true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOutside(document.documentElement); });

// ---------- product navigation ----------
// Brand left, the four centres in the middle, the signed-in account on the right (to-do inbox + account menu).
// The JLR side is always seen as Procurement; a Supplier Portal page passes the supplier organisation instead.
const MARK = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="1.5"/>
  <path d="M9 1.75A7.25 7.25 0 0 1 16.25 9" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="9" r="2.1" fill="currentColor"/></svg>`;
const BELL = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8a4.2 4.2 0 0 0-4.2 4.2v2.6L2.6 11h10.8l-1.2-2.4V6A4.2 4.2 0 0 0 8 1.8Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.4 13a1.7 1.7 0 0 0 3.2 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
export function mountNav(active, who = as('buyer')) {
  const top = $('#top');
  top.innerHTML = `<a class="brand" href="workbench.html">${MARK}<span>CarbonTrace</span></a>
    <nav class="tabs" aria-label="Product">${CENTERS.map((c, i) => `${c.g2 && !CENTERS[i - 1].g2 ? '<i class="tsep"></i>' : ''}<a href="${c.href}" class="${[c.k === active ? 'on' : '', c.sec ? 'sec' : ''].join(' ').trim()}"${c.k === active ? ' aria-current="page"' : ''}>${c.name}</a>`).join('')}</nav>
    <div class="acct-r"></div>`;
  const right = top.querySelector('.acct-r');
  if (who.org === 'JLR') inboxMenu(right);
  accountMenu(right, who);
}

// Context bar under the navigation: where the open item sits (vehicle / round / part / supplier / claim).
export function mountContext(crumbs, right = '') {
  let bar = $('#ctx');
  if (!bar) { bar = document.createElement('div'); bar.id = 'ctx'; $('#top').after(bar); }
  bar.innerHTML = `<div class="cx">${crumbs.filter(Boolean).map((c, i, a) => `${c.href ? `<a href="${c.href}"` : '<span'}${i === a.length - 1 ? ' class="on"' : ''}>${esc(c.t)}${c.href ? '</a>' : '</span>'}`).join('<i>/</i>')}</div>${right ? `<div class="cr">${right}</div>` : ''}`;
}
export const BASE_CRUMBS = [{t: 'Range Rover Sport', href: 'workbench.html'}, {t: 'Q4-26 Aluminium'}, {t: ROUND2.part, href: 'parts.html'}];

// A small popover helper: the trigger toggles it, a click elsewhere or Esc closes it.
function popover(box, btn, pop, onOpen) {
  let off = null;
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); off?.(); off = null; };
  btn.onclick = () => { if (!pop.hidden) return close(); onOpen?.(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); off = dismissable(pop, close, btn); };
  return close;
}

// [Assumption] Other material rounds are samples so the inbox shows how several open rounds group; only aluminium is live.
const SAMPLE_ROUNDS = [
  {mat: 'Steel', name: 'Q1-27 · Body stampings', committee: '2027-02-09', items: [{text: 'Approve request to a Tier 2 mill', due: '2026-11-06'}, {text: 'Body side outer: choose an action', due: null}]},
  {mat: 'Polymers', name: 'Q1-27 · Interior trims', committee: '2027-03-02', items: [{text: 'Late evidence from a resin plant: use it or keep fallback?', due: '2026-11-12'}]}
];
function inboxMenu(right) {
  const box = document.createElement('div'); box.className = 'menu';
  box.innerHTML = `<button class="ibtn" aria-label="To-do" aria-expanded="false">${BELL}<span class="badge" hidden></span></button>
    <div class="ipop glass" hidden><div class="ih"><b>To-do</b><div class="seg" id="iSeg"></div></div><div class="il"></div></div>`;
  right.appendChild(box);
  const btn = box.querySelector('.ibtn'), pop = box.querySelector('.ipop');
  let filter = 'All';
  const fill = () => {
    const s = store.get(), mine = todos(s, 'buyer').map(t => ({...t, due: t.id ? s.requests.find(r => r.id === t.id)?.deadline : null}));
    const groups = [{mat: 'Aluminium', name: ROUND.name, committee: ROUND.sourcing_date, items: mine, live: true}, ...SAMPLE_ROUNDS];
    const n = groups.reduce((a, g) => a + g.items.length, 0), badge = box.querySelector('.badge');
    badge.hidden = !n; badge.textContent = n;
    $('#iSeg').innerHTML = ['All', ...groups.map(g => g.mat)].map(k => `<button class="chip${k === filter ? ' on' : ''}" data-f="${k}">${k}</button>`).join('');
    $$('#iSeg .chip').forEach(b => (b.onclick = e => { e.stopPropagation(); filter = b.dataset.f; fill(); }));
    const left = d => { const n = Math.round((new Date(d) - new Date(s.today)) / 864e5); return n < 0 ? `${-n} d over` : n === 0 ? 'today' : `${n} d`; };
    box.querySelector('.il').innerHTML = groups.filter(g => filter === 'All' || g.mat === filter).map(g => `<div class="ig">
        <div class="igh"><span><b>${g.mat}</b> · ${esc(g.name)}</span><span class="sub">${g.live ? '' : '<span class="tag t-mut">Sample</span> '}Committee ${day(g.committee)}</span></div>
        ${g.items.length ? g.items.map((t, i) => `<${g.live ? `a href="workbench.html#${t.key || ''}"` : 'div'} class="it${g.live ? '' : ' smp'}" data-i="${i}">
          <i class="${t.due && left(t.due).includes('over') ? 'bad' : t.due ? 'rev' : ''}"></i><span>${esc(t.text)}</span><em>${t.due ? left(t.due) : ''}</em></${g.live ? 'a' : 'div'}>`).join('')
          : '<div class="sub" style="padding:8px 0">Nothing waiting on you.</div>'}</div>`).join('');
    // same page: a hash change alone does not re-open a comparison, so reload
    box.querySelectorAll('a.it').forEach(a => (a.onclick = () => { if (location.pathname.endsWith('workbench.html')) setTimeout(() => location.reload(), 0); }));
  };
  fill(); store.subscribe(fill);
  popover(box, btn, pop, fill);
}

function accountMenu(right, who) {
  const box = document.createElement('div'); box.className = 'menu';
  const jlr = who.org === 'JLR', initials = (jlr ? who.label : who.org).replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  box.innerHTML = `<button class="abtn" aria-expanded="false" aria-haspopup="true"><span class="av">${initials}</span><span class="an">${esc(jlr ? who.label : who.org)}</span></button>
    <div class="dpop glass" hidden>
      <div class="me"><span class="av lg">${initials}</span><div><b>${esc(jlr ? 'Procurement' : who.org)}</b><div class="sub">${jlr ? 'JLR · Buyer' : `${esc(who.tier)} supplier`}</div></div></div>
      <a class="mi" href="${jlr ? 'workbench.html' : `supplier.html?as=${encodeURIComponent(who.org)}`}">My work</a>
      <button class="mi" data-soon>Profile and settings</button>
      <div class="sep"></div>
      <div class="k">Demo controls</div>
      <label class="f">Date<select class="i" id="dClock"></select></label>
      <button class="btn2" id="dReset">Reset demo</button>
      <p class="sub">All data runs in this browser and is shared by the four centres.</p>
      <div class="sep"></div>
      <button class="mi" data-soon>Sign out</button>
    </div>`;
  right.appendChild(box);
  const btn = box.querySelector('.abtn'), pop = box.querySelector('.dpop');
  const close = popover(box, btn, pop);
  box.querySelectorAll('[data-soon]').forEach(b => (b.onclick = () => toast('Not part of this demo: sign-in comes from JLR SSO')));
  const fillClock = () => { const today = store.get().today;
    $('#dClock').innerHTML = [today, ...CLOCK.filter(d => d > today)].map(d => `<option value="${d}">${d === today ? 'Today · ' : 'Jump to '}${day(d)}</option>`).join(''); };
  fillClock(); store.subscribe(fillClock);
  $('#dClock').onchange = e => { if (e.target.value !== store.get().today) act({type: 'advance_clock', to: e.target.value}); };
  // confirm() is unavailable in an embedded page, so reset asks twice in place
  const reset = $('#dReset'); let armed = 0;
  reset.onclick = () => {
    if (Date.now() - armed < 4000) { armed = 0; reset.textContent = 'Reset demo'; act({type: 'reset'}); flow.reset(); toast('Demo reset'); close(); return; }
    armed = Date.now(); reset.textContent = 'Press again to reset';
    setTimeout(() => { if (Date.now() - armed >= 4000) reset.textContent = 'Reset demo'; }, 4100);
  };
}

// Cursor light: a faint sheen on panel surfaces that follows the pointer (lerp 0.1 per frame). Off for touch and reduced motion.
export const cursor = {x: -999, y: -999, sx: -999, sy: -999, active: false};
export function cursorLight() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(hover: none)').matches) return;
  addEventListener('pointermove', e => { cursor.x = e.clientX; cursor.y = e.clientY; if (!cursor.active) { cursor.sx = cursor.x; cursor.sy = cursor.y; cursor.active = true; } });
  document.addEventListener('pointerleave', () => { cursor.x = cursor.y = -999; cursor.active = false; });
  const loop = () => {
    cursor.sx += (cursor.x - cursor.sx) * 0.1; cursor.sy += (cursor.y - cursor.sy) * 0.1;
    for (const el of document.querySelectorAll('.card,.glass')) { const r = el.getBoundingClientRect();
      el.style.setProperty('--lx', `${cursor.sx - r.left}px`); el.style.setProperty('--ly', `${cursor.sy - r.top}px`); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
