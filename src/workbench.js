// Procurement workbench. One sourcing round; the buyer works each flagged comparison through five steps.
// All numbers come from store.view() (which calls domain.js). This file only renders and dispatches.
import './drawer.js';
import * as T from './domain.js';
import {view, rounds, todos, reusable, ctxOf, LATE_ISSUES, BENCHMARK_NOTE} from './store.js';
import {nodeImpact, sharedVsSeparate, COMPARISONS} from './network.js';
import {ROUND, PARTS, PCF_RECORDS} from './data.js';
import {createScene, CAR_PARTS, MODEL, SECTORS} from './scene.js';
import {MODELS, chooseModel} from './models.js';
import {recordHTML} from './history.js';
import {diagram, statement, overview as chainOverview, legend as chainLegend, SCENE_ID, aiStatement} from './chain.js';
import {link, linkOn} from './links.js';
import {SCEN, KEYS, cjc, gateOpen, stageText} from './scenarios.js';
import {linkChip, bindLinkActions, findLinks} from './linkui.js';
import {R as R2, A as A2, CLAIMS, OPEN_CLAIMS, SENS, KIND, flow, claimState, candPcf, CANDS, name as v2name, cand, r2, daysLeft, pendingApprovals} from './v2.js';
import {store, as, actor, $, $$, esc, f2, pct, day, STATUS, STAGE, DECISION, tag, toast, act, mountNav, dismissable, cursorLight} from './ui.js';

const me = as('buyer'); // the Sourcing Center acts as procurement
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

// UI-only state. Business state lives in the store.
const ui = {track: 'evidence', chain: null, cpart: '', sel: 'bracket', step: 1, part: null, node: null, whatIf: 'declared', bench: 'P25', action: null, alt: null};
const STEPS = ['Screen the round', 'Trace the claim', 'Choose action', 'Track evidence', 'Committee pack'];

// The free centre area between the panels: the scene centres the twin in it and keeps labels inside it.
function safeArea() {
  const w = innerWidth, h = innerHeight, left = $('#left'), insp = $('#insp').getBoundingClientRect(), agent = $('#agent').getBoundingClientRect(), dock = $('#dock');
  const l = getComputedStyle(left).display === 'none' ? 12 : left.getBoundingClientRect().right + 12;
  const bottomSheet = insp.top > h * .4; // phone layout: the inspector is a sheet at the bottom
  const r = bottomSheet ? w - 12 : insp.left - 12, t = Math.max(agent.bottom, 56) + 10;
  const b = bottomSheet ? insp.top - 8 : dock.style.display !== 'none' && dock.offsetHeight ? dock.getBoundingClientRect().top - 10 : h - 12;
  return {l, t, r, b};
}
// A second press on whatever is open closes it; a press on empty space returns to the round overview.
const scene = createScene($('#stage'), $('#labels'), {
  onPick: (k, p) => (scene.exploded() ? tracePart(k) : p.flag ? (isOpen(k) ? goStep(1) : select(k)) : ui.part === k ? goStep(1) : tracePart(k)),
  onPickNode: n => openCard(n),
  // in the exploded view a blank click first steps back from the picked part to the whole car
  onBlank: () => { if (scene.exploded() && scene.unpick()) { ui.part = null; render(true); } else resetView(); },
  onExplode: on => explodeState(on),
  safe: safeArea});
const isOpen = k => k === ui.sel && ui.step > 1 && !ui.part && !ui.node;
function resetView() { closeCard(); if (ui.part || ui.node || ui.step !== 1) goStep(1); else scene.focus('overview'); }
addEventListener('keydown', e => { if (e.key === 'Escape' && Date.now() - pop.closedAt > 80 && !e.target.closest?.('input,select,textarea')) resetView(); });

// ---------- derived helpers ----------
const S = () => store.get();
const V = (k = ui.sel) => view(S(), k);
const nm = p => p.replace('_', ' ');
const dn = T.displayName; // Smelter X, Smelter Y: unnamed smelters get a display name
const liveReqs = v => v.requests.filter(r => r.status !== 'withdrawn');
// Furthest step the buyer can open for a comparison in its current stage.
const reach = v => Math.max(v.step, {needs_action: 3, paused: 3, approve: 3, awaiting_evidence: 4, ready: 5, nominated: 5}[v.stage]);

// What-if scenarios for a two-part comparison: each unverified claim at its tested value, then each pair.
function whatIfs(v) {
  if (!v.flip) return [];
  const label = c => (c.claim === 'recycled_share' ? `${c.node} recycled ${pct(c.value)}` : c.claim === 'origin_link' ? `${c.node} origin not shown ${c.value}` : `${dn(c.node)} ${c.value}`);
  return [{id: 'declared', label: 'Declared', pcf: {...v.flip.baseline}},
    ...v.flip.single_tests.map((t, i) => ({id: 's' + i, label: label(t.claims[0]), pcf: t, flips: t.decision_flips})),
    ...v.flip.pair_tests.map((t, i) => ({id: 'p' + i, label: 'Joint stress: ' + t.claims.map(label).join(' + '), pcf: t, flips: t.decision_flips, combined: t.combined_risk}))];
}

// ---------- top bar, queue, rail ----------
// vehicle switcher: each model brings its own body, parts and supply network; the live round sits on the Range Rover Sport
// [Assumption] The wider line-up: only three vehicles have a 3D twin; the rest open as lists in the Parts Center.
const LINEUP = [['Range Rover', ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque']], ['Defender', ['Defender 90', 'Defender 110', 'Defender 130']],
  ['Discovery', ['Discovery', 'Discovery Sport']]];
const vdd = {open: false, q: ''};
function renderVehicle() {
  const twin = n => MODELS.find(m => m.name === n);
  const list = LINEUP.map(([brand, ns]) => [brand, ns.filter(n => !vdd.q || n.toLowerCase().includes(vdd.q))]).filter(([, ns]) => ns.length);
  $('#veh').innerHTML = `<button class="vbtn" id="vbtn" aria-haspopup="listbox" aria-expanded="${vdd.open}"><span><b>${esc(MODEL.name)}</b><i>${esc(MODEL.plant)} · ${MODEL.live ? 'live round' : 'sample network'}</i></span><svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
    ${vdd.open ? `<div class="vdd" role="listbox"><input class="vq" id="vq" placeholder="Search vehicles" value="${esc(vdd.q)}" autocomplete="off">
      ${list.map(([brand, ns]) => `<div class="vg">${brand}</div>${ns.map(n => { const m = twin(n);
        return m ? `<button class="vi${m === MODEL ? ' on' : ''}" data-model="${m.k}"><span>${esc(n)}</span><em class="tw">Twin</em></button>` : `<a class="vi" href="parts.html"><span>${esc(n)}</span><em>List only</em></a>`; }).join('')}`).join('') || '<div class="vg">No match</div>'}</div>` : ''}`;
  $('#vbtn').onclick = e => { e.stopPropagation(); vdd.open = !vdd.open; vdd.q = ''; renderVehicle(); if (vdd.open) $('#vq').focus(); };
  const q = $('#vq'); if (q) { q.oninput = () => { vdd.q = q.value.trim().toLowerCase(); const pos = q.selectionStart; renderVehicle(); const n = $('#vq'); n.focus(); n.setSelectionRange(pos, pos); }; q.onclick = e => e.stopPropagation(); }
  $$('#veh [data-model]').forEach(b => (b.onclick = () => { vdd.open = false; if (b.dataset.model !== MODEL.k) chooseModel(b.dataset.model); else renderVehicle(); }));
}
document.addEventListener('click', e => { if (vdd.open && !e.target.closest('#veh')) { vdd.open = false; renderVehicle(); } });
// Vehicle | Parts: the whole car with its supply network, or the car taken apart into its parts
function renderViewSeg(on = scene.exploded()) {
  $('#vseg').innerHTML = `<button class="${on ? '' : 'on'}" data-vw="car" aria-pressed="${!on}">Vehicle</button><button class="${on ? 'on' : ''}" data-vw="parts" aria-pressed="${on}">Parts</button>`;
  $$('#vseg [data-vw]').forEach(b => (b.onclick = () => { const want = b.dataset.vw === 'parts'; closeCard(); if (want !== scene.exploded()) { if (ui.step !== 1) goStep(1); scene.explode(want); } }));
}
renderVehicle();
const explodeState = on => renderViewSeg(on);
renderViewSeg(false);
function renderChrome() {
  const s = S(), list = rounds(s), td = todos(s, 'buyer');
  const open = openClaims().length;
  $('#qList').innerHTML = list.map(v => `<div class="q${v.key === ui.sel ? ' on' : ''}" data-k="${v.key}"><span>${esc(v.def.name)}</span>${v.key === 'bracket' ? tag(open ? [`${open} open`, 't-rev'] : ['Ready', 't-ok']) : tag(['Sample', 't-mut'])}</div>`).join('');
  $$('#qList .q').forEach(q => (q.onclick = () => (isOpen(q.dataset.k) ? goStep(1) : select(q.dataset.k, true))));
  // agent summary from the twin, not a canned line
  const claims = list.flatMap(v => v.verdict.claims), matter = claims.filter(c => c.decision !== 'continue_analysis').length;
  const problems = list.reduce((n, v) => n + v.problems.length, 0);
  // counts the analysed scope only: the background network in the 3D view is illustrative and never counted
  const parts = list.flatMap(v => v.def.parts), sups = new Set(parts.flatMap(p => T.buildGraph().parts[p].sources.map(x => x.supplier)));
  const unv = A2.claims.filter(c => c.recommendation !== 'no_action'), mat = unv.filter(c => c.decision_sensitivity === 'material').length;

  renderRail();
}

function railNote(v, n) {
  const live = liveReqs(v);
  switch (n) {
    case 1: return `${ROUND.comparisons.length} comparisons in this round. ${rounds(S()).filter(x => x.verdict.decision !== 'continue_analysis').length} need you before the committee.`;
    case 2: return v.dataProblem ? v.problems.join('. ') : v.verdict.reasons[0] || 'No claim here changes the decision.';
    case 3: return v.state.action ? `Chosen: ${actionLabel(v)}` : 'Request evidence, switch sourcing, or proceed on conservative values.';
    case 4: return live.length ? live.map(r => `${r.to}: ${STATUS[r.status][0]}`).join(' · ') : 'No requests out.';
    case 5: return v.recommendation;
  }
}
const actionLabel = v => ({request: 'request evidence', alternative: `switch sourcing (${v.state.alternative?.change})`, fallback: 'proceed on conservative values', data_fix: 'ask for per-kg data', exclude: 'keep out of this round'}[v.state.action]);

const openClaims = () => OPEN_CLAIMS.filter(id => ['review', 'action'].includes(claimState(id).col));
// This round: what procurement has to act on, most urgent first. Each item opens where the work happens.
function renderRail() {
  const fs = flow.get(), r = fs.req, left = d => daysLeft(R2.today, d), items = [];
  if (r?.status === 'draft') items.push({t: 'Approve REQ-1 draft', s: 'Smelter X statement · today', u: 0, href: 'review.html#CL-X-PCF', hot: true});
  if (r && ['forwarded', 'support'].includes(r.status)) items.push({t: r.status === 'support' ? 'Smelter X request · support asked' : 'Smelter X statement due', s: `${day(r.deadline)} · ${left(r.deadline)} d`, u: left(r.deadline), node: 'Smelter_X', hot: left(r.deadline) <= 7});
  if (r?.status === 'responded') items.push({t: 'Review Smelter X evidence', s: 'Submitted · needs a decision', u: 1, href: 'review.html#CL-X-PCF', hot: true});
  for (const id of pendingApprovals()) items.push({t: `Approval waiting · ${v2name(CLAIMS[id].supplier)}`, s: fs.decisions[id].approval.by, u: 2, href: 'decision.html', hot: true});
  for (const id of OPEN_CLAIMS.filter(id => !fs.decisions[id])) { const c = CLAIMS[id];
    items.push({t: `Decide · ${v2name(c.supplier)}`, s: `${KIND[c.kind]} · ${SENS[c.decision_sensitivity][0]}`, u: c.decision_sensitivity === 'material' ? 3 : 4, node: c.supplier, hot: c.decision_sensitivity === 'material'}); }
  { const L = link(), lt = {draft: ['Approve link request · Supplier L', 0], responded: ['Review Supplier L document', 1], sent: ['Supplier L link · waiting', 5]}[L.status];
    if (lt) items.push({t: lt[0], s: 'AI-suggested link · Smelter X', u: lt[1], node: 'Supplier_L', hot: lt[1] < 2}); }
  // Transition track: decarbonisation projects with suppliers, kept apart from evidence work
  const tr = [];
  for (const k of KEYS) { const c = cjc(k); if (c.stage || c.asked.length || gateOpen(k)) tr.push({t: SCEN[k].short, s: stageText(k), u: 3 - c.stage, href: `collaborate.html#plan-${k}`, hot: c.asked.length && c.yes.length === c.asked.length}); }
  tr.push({t: 'Upstream collaboration · Smelter X', s: 'Paused at the feasibility gate', u: 6, href: 'collaborate.html#upstream'});
  tr.push({t: 'Supplier proposal · Supplier H', s: 'Furnace upgrade · at the gate', u: 5, href: 'collaborate.html#plan-h-furnace'});
  items.push({t: 'Committee brief', s: fs.brief ? 'Ready' : `Due ${day(R2.evidence_deadline)} · ${left(R2.evidence_deadline)} d`, u: fs.brief ? 99 : 50, href: 'decision.html', done: !!fs.brief});
  items.sort((a, b) => a.u - b.u); tr.sort((a, b) => a.u - b.u);
  const T = ui.track === 'transition', list = T ? tr : items;
  $('#rail').innerHTML = `<div class="rh"><b>This round</b><span>Q4-26 Aluminium · committee in ${left(ROUND.sourcing_date)} d</span>
      <div class="seg trk"><button class="chip${T ? '' : ' on'}" data-track="evidence">Evidence <em>${items.filter(x => !x.done).length}</em></button><button class="chip${T ? ' on' : ''}" data-track="transition">Transition <em>${tr.length}</em></button></div></div>
    ${list.slice(0, 3).map((x, i) => `<${x.href ? `a href="${x.href}"` : 'button'} class="td${x.hot ? ' hot' : ''}${x.done ? ' done' : ''}" ${x.node ? `data-todo="${x.node}"` : ''}><i></i><span><b>${esc(x.t)}</b><em>${esc(x.s)}</em></span></${x.href ? 'a' : 'button'}>`).join('')}${list.length > 3 ? `<a class="td more" href="${T ? 'collaborate.html' : 'decision.html'}"><i></i><span><b>${list.length - 3} more in ${T ? 'Collaborate' : 'Decision'}</b></span></a>` : ''}`;
  $$('#rail [data-track]').forEach(b => (b.onclick = () => { ui.track = b.dataset.track; renderRail(); }));
  $$('#rail [data-todo]').forEach(b => (b.onclick = () => { if (ui.step !== 1 || ui.part) goStep(1); pickChain(b.dataset.todo); }));
}

// ---------- navigation ----------
function select(k, jump) {
  if (k === 'bracket') { keepPart(k); ui.sel = k; ui.part = null; ui.node = null; scene.clearTrace(); goStep(1); scene.focus('bracket'); return; }
  ui.sel = k; ui.part = null; ui.node = null; ui.whatIf = 'declared'; ui.action = null; ui.alt = null; ui.rechoose = false;
  scene.clearTrace(); scene.focus(k);
  goStep(jump ? Math.min(reach(V(k)), Math.max(2, V(k).step)) : 2);
}
function goStep(n) {
  const v = V();
  if (n > reach(v)) return toast(n === 4 ? 'Approve a request first' : n === 5 ? 'Finish the open steps first: ' + v.blockers.join(', ') : 'Trace the claim first', true);
  ui.step = n; ui.part = null; ui.node = null;
  if (n === 1) scene.focus('overview'); else if (!ui.part) scene.focus(ui.sel);
  if (n === 2 && ui.sel === 'bracket' && !RM) scene.pulse('claim');
  render(true);
}
function showNode(name) {
  ui.node = name; ui.part = null;
  scene.impact(name); render(true);
}

// ---------- supplier card: a profile and this round's tracking, beside the picked node ----------
const REC = Object.fromEntries(PCF_RECORDS.map(r => [r.supplier, r]));
const TIER_NAME = {1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3'};
const pop = {id: null, info: null, closedId: null, closedAt: 0, off: null};
function openCard(n) {
  if (pop.closedId === n.id && Date.now() - pop.closedAt < 500) return; // this press is the one that just closed it
  if (pop.id === n.id) return closeCard();
  pop.id = n.id; pop.info = n; scene.select(n.id);
  const el = $('#pop'); el.innerHTML = cardHTML(n); el.hidden = false; bindCard(el);
  pop.off?.(); pop.off = dismissable(el, () => closeCard(true));
  placeCard(false);
  if (!RM) gsap.fromTo(el, {opacity: 0}, {opacity: 1, duration: .22});
}
function closeCard(outside) {
  if (!pop.id) return;
  Object.assign(pop, {closedId: pop.id, closedAt: Date.now(), id: null, info: null});
  scene.select(null); $('#pop').hidden = true; if (!outside) pop.off?.(); pop.off = null;
}
function refreshCard() { if (pop.id) { const el = $('#pop'); el.innerHTML = cardHTML(scene.info(pop.id)); bindCard(el); } }
// beside the node: to its right when there is room in the free area, otherwise to its left; follows the camera
function placeCard(loop = true) {
  if (pop.id) {
    const el = $('#pop'), at = scene.screenOf(pop.id), b = safeArea(), w = el.offsetWidth, h = el.offsetHeight;
    if (at) {
      let x = at.x + 24; if (x + w > b.r) x = at.x - 24 - w;
      x = Math.max(8, Math.min(x, innerWidth - w - 8));
      const y = Math.max(b.t, Math.min(at.y - 36, innerHeight - h - 16));
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; el.style.visibility = '';
    } else el.style.visibility = 'hidden';
  }
  if (loop) requestAnimationFrame(placeCard);
}
function bindCard(el) {
  el.querySelector('.x').onclick = () => closeCard();
  el.querySelectorAll('[data-node]').forEach(b => (b.onclick = () => showNode(b.dataset.node)));
}
// request progress for one supplier: flagged, sent, forwarded, responded, verified
const TRACK = ['Flagged', 'Sent', 'Forwarded', 'Responded', 'Verified'];
function track(r, flagged) {
  const st = r?.status, at = r ? {draft: 0, approved: 1, forwarded: 2, responded: 3, partially_verified: 3, declined: 3, expired: 3, verified: 4, restated: 4}[st] ?? 0 : flagged ? 0 : -1;
  const end = st === 'verified' || st === 'restated' ? 'ok' : st === 'declined' || st === 'expired' ? 'bad' : 'now';
  const line = !r ? (flagged ? 'A claim here could change a decision. No request yet.' : 'Nothing requested: no claim here can change a decision.')
    : `${esc(r.id)} · ${STATUS[st][0]}${['approved', 'forwarded', 'responded'].includes(st) ? ` · due ${day(r.deadline)}` : ''}`;
  return `<div class="steps">${TRACK.map((_, i) => `<i class="${i < at ? 'done' : i === at ? end : ''}"></i>`).join('')}</div>
    <div class="stepl">${TRACK.map((t, i) => `<span${i === at ? ' style="color:var(--ink)"' : ''}>${t}</span>`).join('')}</div>
    <div class="sub" style="margin-top:8px;font-size:12px">${line}</div>`;
}
// suppliers with a claim in the bracket round open it in Evidence
const CLAIM_OF = {Supplier_B: 'CL-B-REC', Unknown_B: 'CL-X-PCF', Supplier_A: 'CL-A-REC', Supplier_H: 'CL-X-PCF', Supplier_I: 'CL-X-PCF'};
const claimBtn = id => CLAIM_OF[id] ? `<a class="btn" href="review.html#${CLAIM_OF[id]}">${CLAIMS[CLAIM_OF[id]].recommendation === 'no_action' ? 'View claim' : 'Investigate claim'}</a>` : '';
function cardHTML(n) {
  const head = (line, st) => `<button class="x" aria-label="Close">×</button><div class="k">${esc(line)}</div><div class="nm">${esc(n.name)}</div>${st ? `<div style="margin-top:6px">${st}</div>` : ''}`;
  if (!n.twin) return head(`${TIER_NAME[n.tier]} · ${n.sectorName}`, '<span class="tag t-mut">Illustrative</span>') + `<div class="sec">
      <div class="row"><span>Relationship</span><b>${n.tier === 1 ? 'Direct contract' : n.tier === 2 ? `Indirect · via ${esc(n.up || 'a Tier 1')}` : `Upstream of ${esc(n.ups.join(', ') || 'Tier 2')}`}</b></div>
      ${n.part ? `<div class="row"><span>Supplies</span><b>${esc(n.part)}</b></div>` : ''}
      <div class="row"><span>Material</span><b>${esc(n.sectorName)}</b></div></div>
    <div class="sec"><div class="k">Tracking</div>${track(null, false)}
      <div class="sub" style="font-size:12px">${n.sector === 'al' ? 'Not part of this round\'s comparisons.' : 'Out of scope: this round screens aluminium only.'}</div></div>
    <div class="ill">Simulated node, drawn for the scale of the supply base. Not screened and not counted.</div>`;
  const s = S(), g = T.buildGraph(ctxOf(s)), id = n.id;
  const keyOf = part => ROUND.comparisons.find(c => c.parts.includes(part))?.key;
  const lastReq = pred => s.requests.filter(r => r.status !== 'withdrawn' && pred(r)).at(-1);
  if (n.tier === 1) {
    const p = PARTS.find(x => x.tier1 === id), v = view(s, keyOf(p.part)), b = v.basis[p.part];
    const relayed = liveReqs(v).filter(r => r.via.includes(id) && r.status !== 'draft');
    return head(`Tier 1 · Aluminium`, tag(STAGE[v.stage])) + `<div class="sec">
      <div class="row"><span>Relationship</span><b>Direct contract with JLR</b></div>
      <div class="row"><span>Supplies</span><b>${esc(nm(p.part))} · ${p.aluminium_kg} kg Al</b></div>
      <div class="row"><span>Sources</span><b>${p.sources.map(x => `${esc(x.supplier)} ${pct(x.share)}`).join('<br>')}</b></div>
      <div class="row"><span>Part footprint</span><b class="${b.meets_target ? 'teal' : 'red'}">${f2(b.pcf)} <span class="sub">/ target ${f2(b.target)}</span></b></div></div>
    <div class="sec"><div class="k">Tracking · ${esc(v.def.name)}</div>
      ${relayed.length ? relayed.map(r => `<div class="row"><span>Relays ${esc(r.id)} to ${esc(r.to)}</span><b>${tag(STATUS[r.status])}</b></div>`).join('') : `<div class="sub" style="margin-top:6px;font-size:12px">No requests to relay.</div>`}</div>
    <a class="btn2" href="supplier.html?as=${encodeURIComponent(id)}">Open in Supplier Portal</a>`;
  }
  if (n.tier === 2) {
    const rec = REC[id], sup = g.suppliers[id], feeds = PARTS.filter(p => p.sources.some(x => x.supplier === id)), sm = g.smelters[rec.smelter];
    const keys = [...new Set(feeds.map(p => keyOf(p.part)))], vs = keys.map(k => view(s, k));
    const flagged = vs.some(v => v.verdict.claims.some(c => (c.node === id || c.node === rec.smelter) && c.decision !== 'continue_analysis'));
    const r = lastReq(x => x.to === id);
    const portal = SESSION_IDS.has(id) ? `<a class="btn2" href="supplier.html?as=${encodeURIComponent(id)}">Open in Supplier Portal</a>` : '';
    return head('Tier 2 · Aluminium', `<span class="tag ${sup.evidence_status === 'verified' ? 't-ok' : 't-rev'}">${sup.evidence_status === 'verified' ? 'Verified' : sup.evidence_status === 'under_review' ? 'Under review' : 'Unverified'}</span>`) + `<div class="sec">
      <div class="row"><span>Relationship</span><b>Indirect · via ${esc([...new Set(feeds.map(p => p.tier1))].join(', ') || '–')}</b></div>
      ${feeds.length ? `<div class="row"><span>Supplies</span><b>${feeds.map(p => `${esc(nm(p.part))} · ${pct(p.sources.find(x => x.supplier === id).share)}`).join('<br>')}</b></div>` : '<div class="row"><span>Supplies</span><b>Benchmark group only</b></div>'}
      <div class="row"><span>Smelter</span><b>${esc(dn(rec.smelter))} · <span class="${sm.verified ? 'teal' : 'amber'}">${sm.verified ? 'verified' : 'unverified'}</span></b></div>
      <div class="row"><span>Declared</span><b>${pct(sup.recycled_share)} recycled${sup.recycled_claim_verified ? '' : ' <span class="amber">unverified</span>'} · ${f2(T.nodePcf(g, id))} kgCO₂e/kg</b></div>
      <div class="row"><span>Data quality</span><b>PDS ${rec.pds} · DQR ${rec.dqr} · ${rec.reference_year} data${rec.declared_unit !== 'kg' ? ` · <span class="red">per ${esc(rec.declared_unit)}</span>` : ''}</b></div></div>
    <div class="sec"><div class="k">Tracking · ${esc(vs.map(v => v.def.name).join(', ') || 'this round')}</div>${track(r, flagged)}</div>${claimBtn(id)}${portal}`;
  }
  const sm = g.smelters[id], customers = T.customersOf(g, id), r = lastReq(x => x.letter?.claims?.some(c => c.node === id));
  const flagged = rounds(s).some(v => v.verdict.claims.some(c => c.node === id && c.decision !== 'continue_analysis'));
  return head('Smelter · Aluminium', `<span class="tag ${sm.verified ? 't-ok' : 't-rev'}">${sm.verified ? 'Verified PCF' : 'Unverified PCF'}</span>`) + `<div class="sec">
      <div class="row"><span>Relationship</span><b>Upstream · no contract with JLR</b></div>
      <div class="row"><span>Customers here</span><b>${esc(customers.join(', '))}</b></div>
      <div class="row"><span>Primary aluminium</span><b>${f2(sm.primary_pcf)} kgCO₂e/kg <span class="sub">${esc(sm.primary_basis.replace(/_/g, ' '))}</span></b></div></div>
    <div class="sec"><div class="k">Tracking · smelter footprint</div>${track(r, flagged)}</div>
    ${claimBtn(id)}${customers.length > 1 || flagged ? `<button class="btn2" data-node="${esc(id)}">Show cross-tier impact</button>` : ''}`;
}
const SESSION_IDS = new Set(['Tier1_B', 'Tier1_C', 'Tier1_D', 'Supplier_B', 'Supplier_D', 'Supplier_H', 'Supplier_I']);
// the part last chosen here carries over to Network
const keepPart = k => { if (['bracket', 'cover'].includes(k)) try { localStorage.setItem('ct.part', k); } catch {} };
function tracePart(k) {
  ui.part = k; ui.node = null; ui.step = 1; keepPart(k);
  const stats = scene.trace(k); render(true, stats);
}

// ---------- inspector views ----------
const views = {
  1() {
    const sel = ui.chain;
    const aiSel = sel === 'Supplier_L';
    return `<div class="chh"><div class="k">Q4-26 Aluminium · Impact chain</div>${linkChip(aiScan)}</div>
      <div class="chw">${diagram(sel, {fresh: aiFresh})}</div>
      <div class="clg">${aiSel ? '' : chainLegend(sel)}${linkOn() && !aiSel && link().status !== 'confirmed' ? '<span><i class="ai"></i>Suggested by AI</span>' : ''}</div>
      ${aiSel ? aiStatement() : sel ? statement(sel) : chainOverview()}`;
  },
  // the part record: how this part has been sourced, its carbon over time, and where it stands now
  part(stats) {
    const p = CAR_PARTS.find(x => x.k === ui.part), sec = SECTORS.find(s => s.k === p.mat);
    return `${recordHTML(MODEL, p, sec.name)}
      <div class="row"><span>Supply base traced</span><b>${stats.t1.length} Tier 1 · ${stats.t2} Tier 2 · ${stats.sm} ${esc(sec.t3.toLowerCase())}s</b></div>
      ${p.flag ? `<button class="btn" data-go="${p.k}">Open this round's decision</button>` : ''}
      <a class="btn2" href="parts.html?model=${MODEL.k}#${MODEL.k.toUpperCase()}-${p.k.toUpperCase()}">Open in Parts Center</a>
      <button class="btn2" data-step="1">Back to round</button>`;
  },
  2() {
    const v = V();
    const cells = v.def.parts.map(p => `<div><div class="k">${esc(nm(p))}</div><div class="v mono">${f2(T.partPcf(T.buildGraph({restated: ctxOf(S()).restated}), p))}</div><div class="sub">target ${f2(v.targets[p])}</div></div>`).join('');
    if (v.dataProblem) return `<div class="k">Data problem · ranking blocked</div><div class="h">${esc(v.def.name)}</div>
      <div class="sub">${v.problems.map(esc).join('<br>')}</div><div class="cells two">${cells}</div>
      <div class="sub">A per-piece value cannot be compared with per-kg values without the piece mass. The twin will not rank this part.</div>
      <button class="btn" data-step="3">Choose action</button>`;
    const kind = {recycled_share: 'recycled share', primary_pcf: 'smelter footprint', origin_link: 'origin link to verified smelter'};
    const rows = v.brief.claims.map(c => `<tr class="hd"><td><b>${esc(dn(c.node))}</b><br><span class="sub">${kind[c.claim_type]}</span></td>
      <td class="n">${c.claim_type === 'recycled_share' ? pct(c.declared) : c.declared}</td><td class="n">${c.claim_type === 'recycled_share' ? pct(c.tested_at) : c.tested_at}</td>
      <td class="n">${c.ranking_break_even == null ? '–' : c.claim_type === 'recycled_share' ? pct(c.ranking_break_even) : c.ranking_break_even}</td>
      </tr><tr class="imp"><td colspan="4">${tag(DECISION[c.label])} ${esc(c.would_change.length ? 'would change ' + c.would_change.join('; ') : 'cannot change this decision · logged, not chased')}</td></tr>`).join('');
    return `<div class="k">Unverified claims · ${esc(v.def.name)}</div><div class="h">${v.verdict.claims.filter(c => c.decision !== 'continue_analysis').length} claim(s) could change this decision</div>
      <div class="sub">kgCO₂e from aluminium per part (other materials and processes are out of scope). Each claim is tested at a published conservative value; break-even is where the lower-carbon choice flips. Target: P25 of fully verified suppliers, a modelling assumption.</div>
      <div class="cells${v.def.parts.length === 2 ? ' two' : ''}">${cells}</div>
      <table class="t"><tr><th>Claim</th><th class="n">Declared</th><th class="n">Tested</th><th class="n">Flips at</th></tr>${rows}</table>
      ${sharedNote(v)}
      <button class="btn" data-step="3">Choose action</button><button class="btn2" data-step="1">Back to round</button>`;
  },
  3() {
    const v = V(), drafts = liveReqs(v).filter(r => r.status === 'draft');
    const out = liveReqs(v).filter(r => ['approved', 'forwarded', 'responded'].includes(r.status));
    if (ui.rechoose && !drafts.length) return chooseView(v, out.length ? ['alternative', 'fallback'] : null);
    if (v.state.action && !drafts.length && v.state.action !== 'request') return `<div class="k">Action · ${esc(v.def.name)}</div><div class="h">${esc(actionLabel(v))}</div>
      ${v.def.parts.map(p => `<div class="row"><span>${esc(nm(p))}</span><b class="mono">${f2(v.basis[p].pcf)} <span class="sub">${esc(v.basis[p].source)}</span></b></div>`).join('')}
      ${v.state.action === 'alternative' && !v.state.alternative.qualification ? `<div class="bad">Candidate only: not yet qualified, so it cannot be nominated.</div>
        <label class="f">Who approved the qualification<input class="i" id="qualNote" placeholder="e.g. engineering and supplier quality, date"></label><button class="btn" id="qualify">Record qualification</button>`
        : v.state.action === 'alternative' ? `<div class="ok">● Qualified: ${esc(v.state.alternative.qualification.note)}</div>` : ''}
      ${out.length ? `<div class="sub" style="margin-top:8px">${out.length} request(s) still open. Evidence is still welcome: it is recorded for reuse and assessed if it arrives before nomination.</div>` : ''}
      <button class="btn" data-step="5">Go to committee pack</button><button class="btn2" id="change">Change action</button>`;
    if (drafts.length) return draftsView(v, drafts);
    if (out.length) return `<div class="k">Action · ${esc(v.def.name)}</div><div class="h">Requests are out</div>
      <div class="sub">You can wait, withdraw them, or proceed now on an alternative or conservative values. Requests stay open either way.</div>
      <button class="btn" data-step="4">Track evidence</button><button class="btn2" id="change">Proceed without waiting</button><button class="btn2" id="withdraw">Withdraw requests</button>`;
    return chooseView(v);
  },
  4() {
    const v = V(), reqs = liveReqs(v).filter(r => r.status !== 'draft');
    return `<div class="k">Evidence · ${esc(v.def.name)}</div><div class="h">${reqs.length ? `${reqs.filter(r => ['verified', 'restated'].includes(r.status)).length} of ${reqs.length} closed` : 'No requests out'}</div>
      ${reqs.map(reqView).join('')}
      ${v.ready ? '<button class="btn" data-step="5">Build committee pack</button>' : `<div class="sub" style="margin-top:12px">Waiting on: ${esc(v.blockers.join(', '))}</div>`}`;
  },
  5() {
    const v = V(), s = S();
    const reuse = [...new Set(liveReqs(v).map(r => r.to))].flatMap(sup => reusable(s, sup, '2027-06-01').map(e => `${sup} ${e.claim.replace('_', ' ')} until ${day(T.addYears(e.verified_on, T.EVIDENCE_VALID_YEARS))}`));
    return `<div class="k">Committee pack · ${day(ROUND.sourcing_date)}</div><div class="h">${esc(v.def.name)}</div>
      <div class="sub">${esc(v.recommendation)}</div>
      <table class="t" style="margin-top:12px"><tr><th>Part</th><th>Al kgCO₂e</th><th>Target</th><th>Basis</th></tr>
      ${v.def.parts.map(p => { const b = v.basis[p]; return `<tr><td>${esc(nm(p))}</td><td class="n ${b.meets_target ? 'teal' : 'red'}">${f2(b.pcf)}</td><td class="n">${f2(b.target)}</td><td class="sub">${esc(b.source)}</td></tr>`; }).join('')}</table>
      ${v.state.nomination ? `<div class="row"><span>Nominated ${day(v.state.nomination.on)}</span><b>${esc(v.state.nomination.part ? nm(v.state.nomination.part) : 'No nomination')}</b></div>` : ''}
      ${v.state.nomination ? '<div class="sub">Values as nominated. Later evidence goes to an impact review, not into this record.</div>' : ''}
      ${v.late.map(l => `<div class="row"><span>Late evidence · ${esc(l.to)}</span><b>${l.material ? '<span class="amber">Would change the outcome</span>: ' : ''}${esc(l.next_steps.join(' · '))}</b></div>`).join('')}
      ${v.late.filter(l => l.record).map(l => `<div class="row"><span>Not used · ${esc(l.to)}</span><b>${esc(l.values.map(x => `${x.claim.replace('_', ' ')} ${x.verified_value}`).join(', '))}<br><span class="sub">${esc(LATE_ISSUES[l.record.issue])} · ${esc(l.record.reason)} · approved by ${esc(l.record.approved_by)}</span></b></div>`).join('')}
      <div class="sub" style="margin-top:8px">${v.caveats.map(esc).join('<br>')}</div>
      ${reuse.length ? `<div class="row"><span>Next quote reuses</span><b>${esc(reuse.join(' · '))}</b></div>` : ''}
      ${v.ready ? '' : `<div class="bad">Not ready: ${esc(v.blockers.join(', '))}</div>`}
      <a class="btn" href="manage.html#${v.key}">Open in Decision Center</a>
      <button class="btn2" data-step="1">Back to round</button>`;
  }
};

// A smelter claim that feeds more than one supplier: the same evidence can move other comparisons too.
function sharedNote(v) {
  const g = T.buildGraph(ctxOf(S()));
  return [...new Set(v.verdict.claims.filter(c => g.smelters[c.node] && T.customersOf(g, c.node).length > 1).map(c => c.node))].map(n => {
    const r = nodeImpact(n, COMPARISONS, ctxOf(S()));
    return `<div class="card note" style="margin-top:14px"><div class="k">Shared upstream</div>
      <div class="lead" style="margin-top:4px"><b>${esc(dn(n))}</b> feeds ${r.suppliers.length} suppliers and can change ${r.breadth} of ${ROUND.comparisons.length} comparisons.</div>
      <button class="btn2" data-node="${n}">Show cross-tier impact</button></div>`; }).join('');
}

// Cross-tier impact of one node: breadth (how many comparisons) and significance (what kind of change), kept apart and not scored.
const viewsNode = () => {
  const ctx = ctxOf(S()), r = nodeImpact(ui.node, COMPARISONS, ctx), name = dn(ui.node);
  const cname = k => ROUND.comparisons.find(c => c.key === k).name;
  const comps = r.comparisons.map(c => `<div class="row"><span><b style="color:var(--ink)">${esc(cname(c.key))}</b><br><span class="sub">${esc(c.parts_below_node.map(nm).join(', '))} below this node</span></span>
    <b>${c.blocked_by.length ? `<span class="red">blocked: ${esc(c.blocked_by.join('; '))}</span>` : c.significance.length ? c.significance.map(x => `<span class="amber">${esc(x.replace(/_/g, ' '))}</span>`).join('<br>') : '<span class="sub">no change</span>'}</b></div>`).join('');
  let routes = '';
  if (r.layer === 'smelter' && !r.verified && r.breadth) {
    const sv = sharedVsSeparate(ui.node, ROUND.sourcing_date, S().today, {ctx}), R = sv.routes;
    const name2 = {separate: 'Verify each supplier', shared_A: 'Shared · smelter already verified', shared_B: 'Shared · new smelter verification'};
    const row = k => { const x = R[k], st = !x.feasible ? `<span class="red">${-x.slack_days}d late</span>` : x.at_risk ? `<span class="amber">${x.slack_days}d slack · at risk</span>` : `<span class="teal">${x.slack_days}d slack</span>`;
      return `<tr><td>${name2[k]}${x.still_open?.length ? `<br><span class="sub">still open: ${esc(x.still_open.join(', '))}</span>` : ''}</td><td class="n">${x.cost.toFixed(1)}</td><td class="n">${x.lead_days}d</td><td>${st}</td></tr>`; };
    const rec = sv.recommended;
    routes = `<div class="k" style="margin-top:18px">Verify once upstream, or each supplier?</div>
      <div class="sub">${sv.suppliers.length} suppliers · ${sv.days_left} days to the evidence deadline (${day(sv.deadline)}). Cost in relative units: 1 = one third-party PCF verification.</div>
      <table class="t" style="margin-top:8px"><tr><th>Route</th><th>Cost</th><th>Lead</th><th>Fits?</th></tr>${['separate', 'shared_A', 'shared_B'].map(row).join('')}</table>
      <div class="row"><span>If ${esc(name)} already holds a verified PCF</span><b class="teal">${esc(name2[rec.smelter_has_verified_pcf] || 'none fits')}</b></div>
      <div class="row"><span>If it needs a new verification</span><b>${esc(name2[rec.smelter_needs_new_verification] || 'none fits')}</b></div>
      ${sv.next_round ? `<div class="sub" style="margin-top:6px">A new smelter verification does not fit this round; it is worth starting for the next one.</div>` : ''}
      <div class="sub" style="margin-top:8px">Ask first whether the smelter already holds a verified PCF. ${esc(sv.note)}</div>`;
  }
  return `<div class="k">Cross-tier impact · ${esc(r.layer)}</div><div class="h">${esc(name)}</div>
    <div class="sub">${r.layer === 'smelter' ? (r.verified ? 'Smelter footprint verified.' : 'Smelter footprint unverified.') : ''} Paths below this node are lit in the twin.</div>
    <div class="cells"><div><div class="k">Suppliers</div><div class="v mono">${r.suppliers.length}</div></div><div><div class="k">Parts</div><div class="v mono">${r.parts.length}</div></div><div><div class="k">Breadth</div><div class="v mono">${r.breadth}<small class="sub" style="font-size:12px"> / ${ROUND.comparisons.length}</small></div></div></div>
    <div class="k">Paths</div>${r.paths.map(p => `<div class="sub mono" style="font-size:11.5px;margin-top:4px">${esc(dn(p[0]))} → ${esc(p[1])} → ${esc(nm(p[2]))}</div>`).join('')}
    <div class="k" style="margin-top:16px">What it can change</div>${comps}
    <div class="sub" style="margin-top:6px">Breadth counts comparisons; significance says what kind of change. They are not combined into one score. Sourcing value per comparison is not available yet.</div>
    ${routes}
    <button class="btn2" data-step="${ui.step}">Back</button>`;
};

function conservative(v) {
  const g = T.buildGraph(ctxOf(S()));
  const ov = Object.fromEntries(v.verdict.claims.filter(c => c.decision !== 'continue_analysis').map(c => [`${c.node}|${c.claim}`, c.values.scenario]));
  return Object.fromEntries(v.def.parts.map(p => [p, T.partPcf(g, p, ov)]));
}
function chooseView(v, only = null) {
  let opts = v.dataProblem
    ? [['data_fix', 'Ask for the value per kg', `Request via ${v.plan.verdict.parts.map(p => T.buildGraph().parts[p].tier1).join(', ')}. The part stays out of the ranking until it arrives.`, true],
       ['exclude', 'Keep out of this round', 'Rank the other comparisons; revisit this part at the next quote.']]
    : [['request', 'Request evidence', `${[...new Set(v.plan.plans.map(p => p.request.to))].join(', ')} via ${[...new Set(v.plan.plans.flatMap(p => p.request.via))].join(', ')} · deadline ${day(T.evidenceDeadline(ROUND.sourcing_date, S().today))}`, true],
       ['alternative', 'Switch sourcing', 'Candidates with verified carbon data. Each still needs technical and commercial qualification before it can be nominated.'],
       ['fallback', 'Proceed on conservative values', `Count every decisive claim at its tested value: ${v.def.parts.map(p => `${nm(p)} ${f2(conservative(v)[p])}`).join(' · ')}`]];
  if (only) opts = opts.filter(o => only.includes(o[0])).map((o, i) => [o[0], o[1], o[2], i === 0]);
  const sel = (only && !only.includes(ui.action) ? null : ui.action) || opts.find(o => o[3])[0];
  const alts = sel === 'alternative' ? `<div style="margin-top:6px">${v.alternatives.map(o => `<label class="opt${ui.alt === o.id ? ' on' : ''}"><input type="radio" name="alt" value="${esc(o.id)}"${ui.alt === o.id ? ' checked' : ''}>
      <span>${esc(o.change)}<br><span class="sub mono">${esc(nm(o.part))} ${f2(o.pcf)} · ${o.meets_target ? '<span class="teal">meets target</span>' : '<span class="red">misses target</span>'} · ${o.relationships_changed} change(s)</span></span></label>`).join('')}</div>` : '';
  const qual = sel === 'alternative' ? '<label class="f" style="flex-direction:row;gap:8px"><input type="checkbox" id="qualified"> Qualification already approved (material, process, quality, capacity, delivery) · simulated premise</label>' : '';
  return `<div class="k">Choose action · ${esc(v.def.name)}</div><div class="h">How should this be resolved before ${day(ROUND.sourcing_date)}?</div>
    ${opts.map(([k, t, d, rec]) => `<label class="opt${sel === k ? ' on' : ''}"><input type="radio" name="act" value="${k}"${sel === k ? ' checked' : ''}><span><b>${t}</b>${rec ? ' <span class="tag t-ok">Recommended</span>' : ''}<br><span class="sub">${esc(d)}</span></span></label>`).join('')}
    ${alts}${qual}${internal(v)}
    <button class="btn" id="choose">${sel === 'request' ? 'Draft requests' : sel === 'data_fix' ? 'Draft request' : 'Confirm'}</button><button class="btn2" data-step="2">Back</button>`;
}

// Procurement-only numbers. Never leave JLR.
function internal(v) {
  if (v.dataProblem) return '';
  return `<details class="int"><summary>Internal brief · procurement only</summary>
    ${v.def.parts.map(p => `<div class="row"><span>Target ${esc(nm(p))}</span><b class="mono">${f2(v.brief.targets[p])}</b></div>`).join('')}
    ${v.brief.claims.filter(c => c.label !== 'continue_analysis').map(c => `<div class="row"><span>${esc(c.claim)}</span><b class="mono">flips ${c.ranking_break_even ?? '–'} · target ${Object.values(c.target_break_even || {}).map(x => x ?? '–').join('/')}</b></div>`).join('')}</details>`;
}

function draftsView(v, drafts) {
  return `<div class="k">Draft · procurement must approve</div><div class="h">${drafts.length} request${drafts.length > 1 ? 's' : ''} to approve</div>
    ${drafts.map(r => `<div style="margin-top:14px"><div class="row" style="border:0"><span>${esc(r.id)} · to ${esc(r.to)} via ${esc(r.via.join(', '))}</span>${r.follow_up_of ? tag(['Follow-up', 't-info']) : ''}</div>
      <div class="letter">${esc(r.kind === 'evidence' ? T.renderLetter(r.letter) : dataFixText(r.letter))}</div>
      ${r.letter.leaks?.length ? `<div class="bad">● Leak check failed: ${esc(r.letter.leaks.join(', '))}</div>` : '<div class="ok">● Leak check passed · no targets, break-evens or other suppliers</div>'}
      <button class="btn" data-approve="${r.id}"${r.letter.leaks?.length ? ' disabled' : ''}>Approve and send</button></div>`).join('')}
    ${internal(v)}<button class="btn2" id="withdraw">Discard drafts</button>`;
}
const dataFixText = l => [`To: ${l.to} (via ${l.via.join(', ')})`, `Please send by ${l.deadline}:`, ...l.claims.map(c => `  - ${c.evidence_needed} (${c.you_declared})`, ...l.claims.map(c => `    If not provided: ${c.if_no_evidence_by_deadline}`)),
  'Ways to respond:', ...l.options.map(o => `  ${o.option}: ${o.action}`), ...l.commitments.map(c => `  - ${c}`)].join('\n');

function reqView(r) {
  const a = r.assessment, today = S().today;
  const steps = [['Approved and sent', r.requested_on, true], [`Forwarded by ${r.via[0]}`, r.history.find(h => h.event === 'forwarded')?.on, !!r.history.find(h => h.event === 'forwarded')],
    [r.option ? `${r.to} chose option ${r.option}` : `${r.to} to choose a route`, r.history.find(h => /chose option|cannot be provided/.test(h.event))?.on, !!r.option],
    [a ? 'Evidence received' : 'Standard evidence deadline', a ? r.closed_on : r.deadline, !!a || ['declined', 'expired', 'restated'].includes(r.status)]];
  const now = steps.findIndex(x => !x[2]);
  return `<div class="card" style="margin-top:12px;padding:12px"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(r.to)}</b>${tag(STATUS[r.status])}</div>
    <div class="tl2">${steps.map(([t, d, done], i) => `<div class="ev ${done ? 'done' : i === now ? 'now' : ''}"><i></i><span>${esc(t)}</span><b class="mono">${d ? day(d) : '–'}</b></div>`).join('')}</div>
    ${a ? `<div class="row"><span>${esc(r.to)} kgCO₂e/kg</span><b class="mono">${f2(a.declared_pcf)} → <span class="${a.direction.startsWith('lower') ? 'teal' : 'red'}">${f2(a.verified_pcf)}</span></b></div>
      ${Object.entries(a.carbon_assessment).map(([p, c]) => `<div class="row"><span>${esc(nm(p))}</span><b class="mono ${c.meets_target ? 'teal' : 'red'}">${f2(c.pcf)}</b></div>`).join('')}
      <div class="row"><span>Timing</span><b>${{on_time: 'On time · updates this decision', before_nomination: 'Late, before nomination', after_nomination: 'Late, after nomination · decision snapshot stands'}[r.window]}</b></div>
      ${lateBlock(r)}
      <div class="row"><span>Evidence</span><b>${a.entries.map((e, i) => `${esc(e.claim.replace('_', ' '))}: <span class="${e.status === 'verified' ? 'teal' : 'amber'}">${esc(e.status.replace('_', ' '))}</span>${[...e.checks_failed, ...(e.scope_limits || [])].length ? `<br><span class="sub">${esc([...e.checks_failed, ...(e.scope_limits || [])].join('; '))}</span>` : ''}`).join('<br>')}</b></div>
      <div class="row"><span>Responded · disclosed</span><b>${day(r.responded_on)} · ${r.disclosure ? `${day(r.disclosure.on)} (${esc(r.disclosure.claims.join(', '))})` : 'no disclosure'}</b></div>
      <div class="row"><span>Correction protection</span><b>${a.entries.map((e, i) => `${esc(e.claim.replace('_', ' '))}: ${esc(a.treatment[i].correction_protection.replace('_', ' '))}`).join('<br>')}</b></div>
      ${r.fee_share !== 'not_applicable' ? `<div class="row"><span>Fee share</span><b>${esc(r.fee_share)}</b></div>` : ''}` : ''}
    ${r.status === 'partially_verified' ? `<div class="sub" style="margin-top:8px">${r.superseded_by ? `Closed. Verified claims are kept; ${esc(r.superseded_by)} asks for the rest.` : 'Not every claim is proven. A carbon analyst reviews and drafts a follow-up for what is left.'}</div>` : ''}
    ${['approved', 'forwarded', 'responded'].includes(r.status) ? `<div class="row"><span>Deadline</span><b class="mono">${day(r.deadline)} · ${T.daysBetween(today, r.deadline)} days</b></div><button class="btn2" data-remind="${r.id}">Send reminder</button>` : ''}
    ${['declined', 'expired'].includes(r.status) ? '<div class="sub" style="margin-top:8px">Fallback values apply to this round, as stated in the request.</div>' : ''}</div>`;
}

// Late evidence: before nomination the buyer decides whether the pack uses it; after nomination an impact review records what follows.
function lateBlock(r) {
  if (!r.late || !r.late_impact) return '';
  const why = r.late_impact.reasons.length ? `<div class="sub">${esc(r.late_impact.reasons.join('; '))}</div>` : '';
  if (r.window === 'before_nomination' && !r.late_decision) return `<div class="bad">Arrived after the deadline but before nomination, and it would change the outcome.</div>${why}
    <button class="btn" data-late="${r.id}|use">Use it in the pack</button>
    <details class="int"><summary>Keep fallback values instead · needs a recorded reason</summary>
      <div class="sub">Lateness alone is not a reason: the pack would present a value known to be outdated as current.</div>
      <label class="f">Issue<select class="i" id="lk_issue_${r.id}">${Object.entries(LATE_ISSUES).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></label>
      <label class="f">Why the evidence is not used<input class="i" id="lk_reason_${r.id}"></label>
      <label class="f">Approved by<input class="i" id="lk_by_${r.id}" placeholder="name and role"></label>
      <label class="f">Follow-up<input class="i" id="lk_next_${r.id}" placeholder="what happens next, by when"></label>
      <button class="btn2" data-late="${r.id}|keep_fallback">Keep fallback values</button></details>`;
  if (r.window === 'before_nomination') return r.late_decision === 'use' ? '<div class="row"><span>Pack</span><b>uses this evidence</b></div>'
    : `<div class="row"><span>Pack</span><b>kept on fallback values · ${esc(LATE_ISSUES[r.late_record.issue])}</b></div><div class="sub">${esc(r.late_record.reason)} · approved by ${esc(r.late_record.approved_by)} · next: ${esc(r.late_record.follow_up)}</div>`;
  if (r.impact_review?.status === 'open') return `<div class="bad">Would have changed the outcome. The nomination is not revoked automatically.</div>${why}
    <button class="btn" data-impact="${r.id}|monitor">Monitor the part</button><button class="btn2" data-impact="${r.id}|refer_to_committee">Refer to the committee</button><button class="btn2" data-impact="${r.id}|no_change">No change</button>`;
  return `<div class="row"><span>Impact review</span><b>${esc(r.impact_review.outcome.replace(/_/g, ' '))}</b></div>`;
}

// ---------- dock: what-if (step 2) and result (steps 3-5) ----------
function renderDock() {
  const v = V(), dock = $('#dock');
  if (ui.part || ui.node || ui.step === 1) { dock.style.display = 'none'; return; }
  dock.style.display = '';
  const parts = v.def.parts, max = Math.max(100, ...parts.map(p => v.basis[p].pcf + 5));
  let pcf, title, chips = '', verdict;
  // Two independent What-if controls. PCF scenario changes supplier values; Benchmark scenario changes the target line only.
  const bv = ui.step === 2 && ui.bench !== 'P25' ? view(S(), ui.sel, {benchmark: ui.bench}) : v, targets = bv.targets;
  const benchRow = ui.step === 2 && !v.dataProblem ? `<div class="wi"><span class="k">Benchmark scenario</span><div class="seg">${[['P10', 'Strict'], ['P25', 'Default'], ['P50', 'Relaxed']].map(([k, t]) =>
    `<button class="chip${ui.bench === k ? ' on' : ''}" data-bench="${k}">${k} ${t}</button>`).join('')}</div><span class="sub note">${esc(BENCHMARK_NOTE)}</span></div>` : '';
  if (ui.step === 2 && v.flip) {
    const sc = whatIfs(v), cur = sc.find(x => x.id === ui.whatIf) || sc[0];
    pcf = Object.fromEntries(parts.map(p => [p, cur.pcf[p]]));
    title = 'What if';
    chips = `<div class="wi"><span class="k">PCF scenario</span><div class="seg">${sc.map(x => `<button class="chip${x.id === cur.id ? ' on' : ''}" data-wi="${x.id}">${esc(x.label)}</button>`).join('')}</div></div>${benchRow}`;
    const lower = T.lowerCarbon(pcf), meets = parts.filter(p => pcf[p] <= targets[p]);
    verdict = `${cur.id[0] === 'p' ? '<span class="sub">Joint stress scenario: both settings applied together in this model; no probability assigned.</span> ' : ''}${!lower ? 'Tie: no lower-carbon choice.' : cur.flips ? `<span class="red">Lower-carbon choice flips to ${esc(nm(lower))}${cur.combined ? ' (only when both are wrong)' : ''}.</span>` : `Lower-carbon choice: ${esc(nm(lower))}.`} ${meets.length ? `Meets target: ${meets.map(nm).join(', ')}.` : '<span class="red">No part meets its target.</span>'}${ui.bench !== 'P25' ? ` <span class="sub">Targets at ${ui.bench}; the ranking does not move with the benchmark.</span>` : ''}`;
  } else if (ui.step === 2 && !v.dataProblem) {
    pcf = Object.fromEntries(parts.map(p => [p, v.basis[p].pcf]));
    title = 'What if'; chips = benchRow;
    const meets = parts.filter(p => pcf[p] <= targets[p]);
    verdict = meets.length ? `Meets target: ${meets.map(nm).join(', ')}.` : '<span class="red">No part meets its target.</span>';
  } else {
    pcf = Object.fromEntries(parts.map(p => [p, v.basis[p].pcf]));
    title = ui.step === 2 ? 'Declared values' : 'Assessment basis';
    verdict = esc(v.recommendation);
  }
  const base = T.buildGraph();
  dock.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px"><span class="k">${title}</span><span class="sub mono" style="font-size:11px">kgCO₂e from aluminium per part</span></div>${chips}
    ${parts.map(p => { const d = T.partPcf(base, p), x = pcf[p], col = x <= targets[p] ? 'var(--teal)' : 'var(--red)';
      return `<div class="bar"><span>${esc(nm(p))}</span><div class="tr"><div class="fill" style="width:${Math.min(100, x / max * 100)}%;background:${col}"></div><div class="tl" style="left:${targets[p] / max * 100}%" title="target ${f2(targets[p])}"></div></div>
        <span class="mono">${x !== d ? `<span class="sub">${f2(d)} →</span> ` : ''}<span style="color:${col}">${f2(x)}</span></span></div>`; }).join('')}
    <div id="verdict">${verdict}</div>`;
  // pressing the selected scenario again goes back to the default
  $$('#dock [data-bench]').forEach(b => (b.onclick = () => { ui.bench = ui.bench === b.dataset.bench ? 'P25' : b.dataset.bench; renderDock(); }));
  $$('#dock [data-wi]').forEach(b => (b.onclick = () => { ui.whatIf = ui.whatIf === b.dataset.wi ? 'declared' : b.dataset.wi; renderDock(); syncScene(); if (ui.whatIf !== 'declared' && ui.sel === 'bracket') scene.pulse('claim'); }));
}

// ---------- scene sync (bracket carries the named suppliers) ----------
function syncScene() {
  const v = view(S(), 'bracket');
  const r = liveReqs(v).filter(x => x.to === 'Supplier_B').at(-1);
  let t1b = v.basis.Bracket_T1B.pcf, sbTone = 'amber', boost = 0;
  if (ui.sel === 'bracket' && ui.step === 2 && ui.whatIf !== 'declared') {
    const cur = whatIfs(v).find(x => x.id === ui.whatIf); t1b = cur.pcf.Bracket_T1B;
    boost = cur.pcf.claims.some(c => c.claim === 'recycled_share') ? .9 : 0;
  }
  if (r) sbTone = r.status === 'verified' && !r.late ? 'teal' : ['declined', 'expired'].includes(r.status) || r.late ? 'red' : 'amber';
  const meets = t1b <= v.targets.Bracket_T1B, tone = !meets ? 'red' : sbTone === 'teal' ? 'teal' : 'amber';
  scene.set({t1bValue: t1b, t1b: tone, sb: sbTone, path: tone, sbBoost: boost});
  const d = T.partPcf(T.buildGraph(), 'Bracket_T1B');
  scene.label('t1b', t1b === d ? f2(t1b) : `${f2(d)} → ${f2(t1b)}`);
  scene.label('sb', r?.assessment ? `2.72 → ${f2(r.assessment.verified_pcf)} · ${r.late ? 'late' : 'verified'}` : r ? `75% recycled · ${STATUS[r.status][0].toLowerCase()}` : '75% recycled · unverified');
  scene.label('br', STAGE[v.stage][0].toLowerCase());
}

// ---------- render + events ----------
let seenAssessments = 0;
const assessed = s => s.requests.filter(r => r.to === 'Supplier_B' && r.assessment).length;
function render(animate, partStats) {
  renderChrome();
  const insp = $('#insp');
  insp.innerHTML = ui.node ? viewsNode() : ui.part ? views.part(partStats || scene.partStats(ui.part)) : views[ui.step]();
  if (animate && !RM) gsap.from(insp.children, {y: 10, opacity: 0, duration: .45, stagger: .04, ease: 'power2.out'});
  bind(insp); renderDock(); syncScene();
}
// AI link discovery: a suggested link the agent found in documents. Kept apart from the claim data.
let aiScan = false, aiFresh = false;
const sceneLink = () => scene.suggest(linkOn() ? (link().status === 'confirmed' ? 'ok' : 'on') : 'off');
function aiFind() {
  findLinks(v => { aiScan = v; if (v) render(); }, () => { aiFresh = true; sceneLink(); scene.select('Supplier_L'); ui.chain = 'Supplier_L'; render(true); setTimeout(() => (aiFresh = false), 1500); }, RM);
}
function pickChain(id) {
  if (ui.chain === 'Supplier_L' && id !== 'Supplier_L') scene.select(null);
  ui.chain = id;
  if (id === 'Supplier_L') { scene.clearImpact?.(); sceneLink(); scene.select('Supplier_L'); render(true); return; }
  if (id) { const sid = SCENE_ID[id] || id; try { scene.impact(sid); } catch { /* node not in the 3D network */ } } else scene.clearImpact?.();
  render(true);
}
function bind(el) {
  el.querySelectorAll('[data-cn]').forEach(b => { b.onclick = () => pickChain(b.dataset.cn); b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickChain(b.dataset.cn); } }; });
  // any click on empty space in the panel returns to the whole network
  el.onclick = e => { if (ui.chain && !ui.node && !ui.part && ui.step === 1 && !e.target.closest('[data-cn],button,a,select,input,.tg')) pickChain(null); };
  el.querySelector('#aiFind')?.addEventListener('click', aiFind);
  bindLinkActions(el, k => { sceneLink(); if (k === 'dismiss') { scene.select(null); ui.chain = null; } render(); });
  el.querySelectorAll('[data-go]').forEach(b => (b.onclick = () => select(b.dataset.go, true)));
  el.querySelectorAll('[data-node]').forEach(b => (b.onclick = () => showNode(b.dataset.node)));
  el.querySelectorAll('[data-step]').forEach(b => (b.onclick = () => goStep(+b.dataset.step)));
  el.querySelectorAll('input[name=act]').forEach(i => (i.onchange = () => { ui.action = i.value; render(); }));
  el.querySelectorAll('input[name=alt]').forEach(i => (i.onchange = () => { ui.alt = i.value; render(); }));
  el.querySelectorAll('[data-approve]').forEach(b => (b.onclick = () => {
    const r = S().requests.find(x => x.id === b.dataset.approve);
    if (!act({type: 'approve_request', actor: actor(me), id: r.id})) return;
    toast(`Sent to ${r.to} via ${r.via.join(', ')}`);
    if (r.to === 'Supplier_B') scene.envelope();
    if (!liveReqs(V()).some(x => x.status === 'draft')) goStep(4); else render();
  }));
  el.querySelectorAll('[data-late]').forEach(b => (b.onclick = () => { const [id, use] = b.dataset.late.split('|'), f = k => el.querySelector(`#lk_${k}_${id}`)?.value;
    act({type: 'late_decision', actor: actor(me), id, use, issue: f('issue'), reason: f('reason'), approved_by: f('by'), follow_up: f('next')}) && toast(use === 'use' ? 'Pack updated with late evidence' : 'Pack kept on fallback values'); }));
  const q = el.querySelector('#qualify'); if (q) q.onclick = () => act({type: 'qualify_alternative', actor: actor(me), comparison: ui.sel, note: el.querySelector('#qualNote').value}) && toast('Qualification recorded');
  el.querySelectorAll('[data-impact]').forEach(b => (b.onclick = () => { const [id, outcome] = b.dataset.impact.split('|'); act({type: 'close_impact_review', actor: actor(me), id, outcome}) && toast('Impact review closed'); }));
  el.querySelectorAll('[data-remind]').forEach(b => (b.onclick = () => act({type: 'remind', actor: actor(me), id: b.dataset.remind}) && toast('Reminder sent')));
  const ch = el.querySelector('#choose');
  if (ch) ch.onclick = () => {
    const a = el.querySelector('input[name=act]:checked')?.value;
    if (a === 'alternative' && !ui.alt) return toast('Pick an alternative', true);
    if (act({type: 'choose_action', actor: actor(me), comparison: ui.sel, action: a, alternative: ui.alt, qualified: !!el.querySelector('#qualified')?.checked})) { ui.action = null; ui.rechoose = false; render(true); }
  };
  const w = el.querySelector('#withdraw'); if (w) w.onclick = () => act({type: 'withdraw_requests', actor: actor(me), comparison: ui.sel}) && render(true);
  // changing action keeps open requests open; only "Withdraw requests" withdraws them
  const c = el.querySelector('#change'); if (c) c.onclick = () => { ui.rechoose = true; ui.action = null; render(true); };
}

// Re-render when another tab (supplier, committee) changes the shared state.
store.subscribe(s => {
  const n = assessed(s); render(); refreshCard();
  if (n > seenAssessments) scene.pulse('evidence');
  seenAssessments = n;
});

// ---------- intro ----------
const chrome = ['#top', '#veh', '#vseg', '#rail', '#agent', '#queue', '#insp', '#dock'];
const reveal = () => gsap.set(chrome, {opacity: 1, y: 0});
let seen = false; try { seen = sessionStorage.getItem('ct.intro') === '1'; sessionStorage.setItem('ct.intro', '1'); } catch { /* storage blocked: play intro */ }
flow.subscribe(() => render());
render();
seenAssessments = assessed(S());
mountNav('sourcing');
cursorLight();
requestAnimationFrame(placeCard);
sceneLink(); flow.subscribe(() => sceneLink());
const skip = () => { scene.finishIntro(); reveal(); $('#skip').style.display = 'none'; };
// arriving from the Decision Center with #bracket etc. opens that comparison directly
const startKey = location.hash.slice(1), linked = ROUND.comparisons.some(c => c.key === startKey);
if (seen || RM || linked) { skip(); if (linked) select(startKey, true); }
else {
  gsap.set(chrome, {opacity: 0});
  $('#skip').onclick = skip;
  scene.intro(cue => {
    if (cue === 'top') gsap.fromTo('#top', {opacity: 0, y: -14}, {opacity: 1, y: 0, duration: .6});
    if (cue === 'screening') gsap.fromTo('#agent', {opacity: 0, y: -8}, {opacity: 1, y: 0, duration: .5});
    if (cue === 'flagged') { gsap.fromTo(['#veh', '#vseg', '#rail'], {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: .55}); gsap.fromTo(['#insp', '#dock', '#queue'], {opacity: 0, y: 60}, {opacity: 1, y: 0, duration: .9, stagger: .1, ease: 'power3.out'}); }
    if (cue === 'done') { $('#skip').style.display = 'none'; reveal(); }
  });
}
window.__ct = {ui, select, goStep, store, scene};
