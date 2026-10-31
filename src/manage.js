// Decision Center: the round's board, and one detail page per comparison (like an order page).
// Live: built from store.overview() and store.view(), the same read model as every other page, so a supplier's submission
// or a buyer's approval shows up here at once. The committee records nominations on the detail page; the system only recommends.
import * as T from './domain.js';
import {mountContext, BASE_CRUMBS} from './ui.js';
import {overview, view, todos} from './store.js';
import {ROUND, PARTS, PCF_RECORDS} from './data.js';
import {flow, reqEvidence, REMINDERS} from './v2.js';
import {store, as, actor, $, $$, esc, f2, day, STATUS, STAGE, DECISION, tag, act, toast, mountNav, cursorLight} from './ui.js';

const committee = as('committee');
const nm = p => p.replace('_', ' ');
const CENTER = {buyer: 'workbench.html', analyst: 'review.html', committee: 'manage.html'};
const href = (w, key) => w.role === 'committee' ? `#${key || ''}` : CENTER[w.role] || `supplier.html?as=${encodeURIComponent(w.org)}`;
const TEAM = {buyer: 'Procurement', analyst: 'Carbon analysis', committee: 'Sourcing committee', manager: 'Procurement management'};
const whoText = w => (w.org === 'JLR' ? TEAM[w.role] : `${w.org} · ${w.role === 'tier1' ? 'Tier 1' : 'Tier 2'}`);
const owner = (w, key) => `<a class="own" href="${href(w, key)}">${esc(whoText(w))}</a>`;
const STAGES = ['needs_action', 'paused', 'approve', 'awaiting_evidence', 'ready', 'nominated'];

// The order-page tracker: where a comparison is between screening and nomination.
function milestones(s, v) {
  const live = v.requests.filter(r => !['withdrawn'].includes(r.status)), ev = live.filter(r => r.status !== 'draft');
  const sent = ev.map(r => r.requested_on).filter(Boolean).sort()[0];
  const closed = ev.length && ev.every(r => r.closed_on) ? ev.map(r => r.closed_on).sort().at(-1) : null;
  const acted = !!v.state.action, wait = v.state.action === 'request' || v.state.action === 'data_fix';
  const needs = v.verdict.decision !== 'continue_analysis' || v.dataProblem;
  const noReq = (acted && !wait) || (!acted && !needs); // nothing had to be requested
  return [
    {t: 'Screened', d: ROUND.opened_on, done: true},
    {t: 'Action chosen', d: v.state.decided_on, done: acted || !needs, skip: !acted && !needs},
    {t: 'Requests sent', d: sent, done: !!sent || noReq, skip: !sent && noReq},
    {t: 'Evidence closed', d: closed, done: !!closed || noReq, skip: !closed && noReq},
    {t: 'Pack ready', d: null, done: v.ready || !!v.state.nomination},
    {t: 'Nominated', d: v.state.nomination?.on, done: !!v.state.nomination}];
}
const progress = ms => `<div class="prog">${ms.map(m => `<i class="${m.done ? 'done' : ''}"></i>`).join('')}</div>`;

// ---------- views of the round: board, timeline, table, by owner (like a Notion database) ----------
const VIEWS = [['board', 'Board'], ['timeline', 'Timeline'], ['table', 'Table'], ['owner', 'By owner']];
let mode = 'board'; try { mode = localStorage.getItem('ct.dc.view') || 'board'; } catch { /* storage blocked: default view */ }
const ocard = (s, c) => `<a class="ocard" href="#${c.key}"><div class="oh"><b>${esc(c.name)}</b>${tag(STAGE[c.stage])}</div>
  <div class="sub">${esc(c.parts.map(nm).join(' vs '))}</div>${progress(milestones(s, view(s, c.key)))}
  <div class="nx">${esc(c.nominated ? 'Nominated: ' + nm(c.nominated) : c.blockers[0] || c.recommendation)}</div></a>`;
function views(s, o) {
  const bar = `<div class="sh"><h2>Round</h2><div class="seg vt" role="tablist">${VIEWS.map(([k, t]) => `<button class="chip${mode === k ? ' on' : ''}" data-view="${k}" role="tab" aria-selected="${mode === k}">${t}</button>`).join('')}</div></div>`;
  let body;
  if (mode === 'timeline') body = timeline(s, o);
  else if (mode === 'table') body = `<div class="card tw"><table class="t"><tr><th>Comparison</th><th>Stage</th><th>Progress</th><th>Next step</th><th>Next move</th><th class="n">Requests</th><th>Nominated</th></tr>
    ${o.comparisons.map(c => { const v = view(s, c.key), ms = milestones(s, v);
      return `<tr class="lnkrow" data-href="#${c.key}"><td><b>${esc(c.name)}</b><br><span class="sub">${esc(c.parts.map(nm).join(' vs '))}</span></td><td>${tag(STAGE[c.stage])}</td>
        <td style="min-width:120px">${progress(ms)}<span class="sub">${ms.filter(m => m.done).length} of ${ms.length}</span></td><td class="sub">${esc(c.blockers[0] || c.recommendation)}</td>
        <td>${c.waiting_on.map(w => esc(whoText(w))).join(', ') || '<span class="sub">–</span>'}</td><td class="n">${v.requests.filter(r => r.status !== 'withdrawn').length}</td><td>${c.nominated ? esc(nm(c.nominated)) : '<span class="sub">–</span>'}</td></tr>`; }).join('')}</table></div>`;
  else if (mode === 'owner') { const groups = {}; for (const c of o.comparisons) { const ws = c.waiting_on.length ? c.waiting_on : [null]; for (const w of ws) (groups[w ? whoText(w) : 'Nobody · done'] ||= []).push(c); }
    body = `<div class="pipe owners">${Object.entries(groups).map(([k, cs]) => `<div class="col"><div class="colh"><span>${esc(k)}</span><span class="sub mono">${cs.length}</span></div>${cs.map(c => ocard(s, c)).join('')}</div>`).join('')}</div>`; }
  else body = `<div class="pipe">${STAGES.map(st => { const items = o.comparisons.filter(c => c.stage === st);
    return `<div class="col"><div class="colh"><span>${STAGE[st][0]}</span><span class="sub mono">${items.length}</span></div>${items.map(c => ocard(s, c)).join('')}</div>`; }).join('')}</div>`;
  return `<section>${bar}${body}</section>`;
}
// Timeline: one row per comparison and one per request, on a calendar from the round opening to after the committee.
function timeline(s, o) {
  const d0 = ROUND.opened_on, d1 = T.addDays(ROUND.sourcing_date, 28), span = T.daysBetween(d0, d1);
  const x = d => `${Math.max(0, Math.min(100, T.daysBetween(d0, d) / span * 100)).toFixed(2)}%`;
  const w = (a, b) => `${Math.max(.6, (T.daysBetween(a, b) / span) * 100).toFixed(2)}%`;
  const weeks = []; for (let d = d0; d <= d1; d = T.addDays(d, 7)) weeks.push(d);
  const deadline = T.evidenceDeadline(ROUND.sourcing_date, ROUND.opened_on);
  const col = st => ({verified: 'ok', restated: 'ok', declined: 'bad', expired: 'bad', partially_verified: 'rev', draft: 'mut'}[st] || 'rev');
  const rows = o.comparisons.flatMap(c => { const v = view(s, c.key), end = v.state.nomination?.on || ROUND.sourcing_date;
    return [`<div class="gl"><a href="#${c.key}"><b>${esc(c.name)}</b></a>${tag(STAGE[c.stage])}</div><div class="gt"><span class="gb main ${c.nominated ? 'ok' : c.stage === 'paused' ? 'bad' : ''}" style="left:${x(d0)};width:${w(d0, end)}"></span>${c.nominated ? `<span class="gd" style="left:${x(end)}" title="Nominated ${day(end)}"></span>` : ''}</div>`,
      ...v.requests.filter(r => r.status !== 'withdrawn').map(r => { const a = r.requested_on || r.created_on, done = r.closed_on || s.today;
        return `<div class="gl sub2"><span class="code">${esc(r.id)}</span> ${esc(r.to)}</div><div class="gt"><span class="gb ${col(r.status)}" style="left:${x(a)};width:${w(a, done)}" title="${esc(STATUS[r.status][0])} · ${day(a)} – ${r.closed_on ? day(r.closed_on) : 'open'}"></span>
          ${r.closed_on ? '' : `<span class="gb plan" style="left:${x(done)};width:${w(done, r.deadline)}" title="Deadline ${day(r.deadline)}"></span>`}<span class="glbl" style="left:${x(r.closed_on || r.deadline)}">${esc(STATUS[r.status][0])}</span></div>`; })]; }).join('');
  return `<div class="card gantt"><div class="gl"></div><div class="gt head">${weeks.map(d => `<span style="left:${x(d)}">${day(d)}</span>`).join('')}</div>${rows}
    <div class="gt marks"><i class="today" style="left:${x(s.today)}"><em>Today</em></i><i class="dl" style="left:${x(deadline)}"><em>Standard evidence deadline</em></i><i class="cm" style="left:${x(ROUND.sourcing_date)}"><em>Committee</em></i></div></div>`;
}

// ---------- board ----------
// One sourcing round per material. [Assumption] Steel and Polymers are sample rounds to show the switcher; only aluminium is modelled.
const ROUNDS = [{k: 'al', mat: 'Aluminium', live: true}, {k: 'steel', mat: 'Steel', name: 'Q1-27 · Body stampings', committee: '2027-02-09'}, {k: 'poly', mat: 'Polymers', name: 'Q1-27 · Interior trims', committee: '2027-03-02'}];
let rnd = 'al';
const head = o => { const r = ROUNDS.find(x => x.k === rnd);
  return `<header class="ph"><div><h1>Decision Center</h1><div class="sub">${r.live ? `${esc(ROUND.name)} · sourcing committee ${day(o.sourcing_date)}` : `${esc(r.name)} · sourcing committee ${day(r.committee)}`}</div></div>
    <label class="rsel"><span>Material</span><select id="rnd" aria-label="Material">${ROUNDS.map(x => `<option value="${x.k}"${x.k === rnd ? ' selected' : ''}>${x.mat}</option>`).join('')}</select></label></header>`; };
function board() {
  const o = overview(store.get()), s = store.get();
  if (rnd !== 'al') return `${head(o)}<section class="card empty"><h2 style="margin:0 0 6px;font-size:16px">${ROUNDS.find(x => x.k === rnd).mat} round is a sample</h2>
    <div class="sub">This demo models the aluminium round only. A live round for this material would show the same board, timeline and panels with its own suppliers and targets.</div></section>`;
  const ready = o.comparisons.filter(c => c.ready || c.nominated).length;
  const kpi = (k, v, sub = '') => `<div class="card"><div class="k">${k}</div><div class="kpi">${v}</div><div class="sub">${sub}</div></div>`;
  const exc = [['Due in 7 days or overdue', o.open_items.overdue_or_due_7d], ['Evidence under analyst review', o.open_items.evidence_under_review],
    ['Late evidence awaiting a buyer decision', o.open_items.late_decisions], ['Open impact reviews', o.open_items.impact_reviews],
    ['Alternatives awaiting qualification', o.open_items.unqualified_alternatives]];
  const cname = k => o.comparisons.find(c => c.key === k).name;
  return `
    ${head(o)}
    <section class="kpis">
      ${kpi('Committee in', `${o.days_to_committee}<small> days</small>`, day(o.sourcing_date))}
      ${kpi('Packs ready', `${ready}<small> / ${o.comparisons.length}</small>`, 'ready or nominated')}
      ${kpi('Your to-dos', todos(s, 'buyer').length, 'in Procurement')}
      ${kpi('Exceptions', exc.reduce((a, [, n]) => a + n, 0), 'need a decision or review')}
      ${kpi('Evidence cycle', o.avg_cycle_days == null ? '–' : `${o.avg_cycle_days}<small> days</small>`, 'request sent to evidence in')}
    </section>
    ${views(s, o)}
    <section class="card"><div class="sh"><h2>Requests</h2></div>
      <div class="tw"><table class="t"><tr><th>Request</th><th>Comparison</th><th>To</th><th>Status</th><th>Next move</th><th>Deadline</th></tr>
      ${o.requests.map(r => `<tr class="lnkrow" data-href="#${r.comparison}"><td class="code">${esc(r.id)}${r.follow_up_of ? `<br><span class="sub">follows ${esc(r.follow_up_of)}</span>` : ''}</td>
        <td>${esc(cname(r.comparison))}</td><td>${esc(r.to)}<br><span class="sub">via ${esc(r.via.join(', '))}</span></td>
        <td>${tag(STATUS[r.status])}${r.late ? `<br><span class="sub">late · ${esc(r.window.replace('_', ' '))}</span>` : ''}</td>
        <td>${r.waiting_on ? owner(r.waiting_on, r.comparison) : '<span class="sub">none</span>'}</td>
        <td class="mono">${day(r.deadline)}${r.days_left != null ? `<br><span class="${r.days_left < 0 ? 'red' : r.days_left <= 7 ? 'amber' : 'sub'}">${r.days_left < 0 ? `${-r.days_left} days over` : `${r.days_left} days left`}</span>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="6" class="sub">No requests yet.</td></tr>'}</table></div></section>
    <div class="grid2c">${insights(s, o)}</div>
    <section class="card"><div class="sh"><h2>Recent activity</h2></div>
      ${o.log.length ? o.log.map(e => `<div class="row"><span class="mono">${day(e.on)}</span><b>${esc(e.actor)} · ${esc(e.action)} ${esc(e.target)}${e.detail ? ' · ' + esc(e.detail) : ''}</b></div>`).join('') : '<div class="sub">No actions yet.</div>'}
      <div class="sub" style="margin-top:12px">${o.caveats.map(esc).join('<br>')}</div></section>`;
}


// ---------- buyer dashboard panels ----------
// Carbon vs target (filter by vehicle and part), evidence coverage by aluminium mass, the round on one time axis, supplier responses.
// [Assumption] Which vehicle programmes use each part; the round data has no vehicle field.
const VEHICLES = {bracket: ['Range Rover Sport', 'Range Rover Velar'], cover: ['Range Rover Sport'], housing: ['Defender']};
const VLIST = [...new Set(Object.values(VEHICLES).flat())];
const flt = {veh: '', cmp: ''};
const DONE = ['verified', 'restated', 'partially_verified', 'declined', 'responded'];
function insights(s, o) {
  const all = ROUND.comparisons.map(c => view(s, c.key));
  const vs = all.filter(v => (!flt.veh || VEHICLES[v.key].includes(flt.veh)) && (!flt.cmp || v.key === flt.cmp));
  const max = Math.max(...all.flatMap(v => Object.values(v.current).flatMap(x => [x.pcf, x.reported, x.target]))) * 1.35, pc = v => `${Math.min(100, v / max * 100).toFixed(1)}%`;
  const bar = (p, x) => { const risk = x.worst > x.pcf + .005;
    return `<div class="cv"><span>${esc(p.replace(/^\w+_T1/, 'Tier 1 '))}</span><div class="cvb"><i class="${x.meets_target ? 'cy' : 'cn'}" style="width:${pc(x.pcf)}"></i>
      ${risk ? `<i class="rk" style="left:${pc(x.pcf)};width:calc(${pc(x.worst)} - ${pc(x.pcf)})" title="If unverified: ${f2(x.worst)}"></i>` : ''}
      <s style="left:${pc(x.reported)}" title="Reported ${f2(x.reported)}"></s><u style="left:${pc(x.target)}" title="Target ${f2(x.target)}"></u></div>
      <b class="mono ${x.meets_target ? '' : 'red'}">${f2(x.pcf)}${risk ? `<small>≤ ${f2(x.worst)}</small>` : ''}</b></div>`; };
  const rows = vs.flatMap(v => Object.values(v.current)), meet = rows.filter(x => x.meets_target).length, atRisk = rows.filter(x => x.meets_target && x.worst > x.target).length;
  const sel = (id, label, opts, val) => `<select class="fs" id="${id}" aria-label="${label}"><option value="">${label}: All</option>${opts.map(([k, t]) => `<option value="${k}"${k === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const carbon = `<section class="card"><div class="sh"><h2>Carbon vs target</h2><div class="fl">${sel('fVeh', 'Vehicle', VLIST.map(x => [x, x]), flt.veh)}${sel('fCmp', 'Part', ROUND.comparisons.map(c => [c.key, c.name]), flt.cmp)}</div></div>
    <div class="cvs"><span><b>${meet}</b> of ${rows.length} meet target</span>${atRisk ? `<span class="amber">${atRisk} only if claims hold</span>` : ''}</div>
    ${vs.map(v => `<div class="cvg"><a href="#${v.key}" class="k">${esc(v.def.name)}<em>${esc(VEHICLES[v.key].join(' · '))}</em></a>${Object.entries(v.current).map(([p, x]) => bar(p, x)).join('')}</div>`).join('') || '<div class="sub" style="margin-top:12px">No parts match.</div>'}
    <div class="lgd"><span><i class="cy"></i>Assessed</span><span><i class="rk"></i>If unverified</span><span><i class="dt"></i>Reported</span><span><i class="tk"></i>Target</span></div></section>`;
  const ok = sup => PCF_RECORDS.find(r => r.supplier === sup)?.verified || s.registry.some(e => e.supplier === sup && e.status === 'verified');
  const risky = new Set(all.flatMap(v => v.verdict.claims.filter(c => c.decision !== 'continue_analysis').flatMap(c => c.suppliers)));
  let kv = 0, kr = 0, kd = 0;
  for (const p of PARTS) for (const src of p.sources) { const kg = p.aluminium_kg * src.share; if (ok(src.supplier)) kv += kg; else if (risky.has(src.supplier)) kr += kg; else kd += kg; }
  const tot = kv + kr + kd, w = v => `${(v / tot * 100).toFixed(1)}%`;
  const cover = `<section class="card"><div class="sh"><h2>Evidence coverage</h2><span class="sub">${Math.round(tot)} kg aluminium this round</span></div>
    <div class="kpi">${Math.round(kv / tot * 100)}<small>% verified</small></div>
    <div class="stack"><i class="sv" style="width:${w(kv)}"></i><i class="sd" style="width:${w(kd)}"></i><i class="sr" style="width:${w(kr)}"></i></div>
    <div class="row"><span><i class="dot sv"></i>Verified</span><b class="mono">${kv.toFixed(1)} kg</b></div>
    <div class="row"><span><i class="dot sd"></i>Self-reported, cannot change a decision</span><b class="mono">${kd.toFixed(1)} kg</b></div>
    <div class="row"><span><i class="dot sr"></i>Self-reported, could change a decision</span><b class="mono">${kr.toFixed(1)} kg</b></div></section>`;
  // one time axis: round opened → committee, with request due dates and today
  const d0 = ROUND.opened_on, d1 = T.addDays(ROUND.sourcing_date, 5), span = T.daysBetween(d0, d1), x = d => `${(Math.max(0, Math.min(1, T.daysBetween(d0, d) / span)) * 100).toFixed(2)}%`;
  const dl = T.evidenceDeadline(ROUND.sourcing_date, ROUND.opened_on);
  const ev = reqEvidence(), evOpen = ev && ['awaiting', 'support'].includes(ev.status) ? [{deadline: ev.due, to: 'Supplier_B', days_left: T.daysBetween(s.today, ev.due)}] : [];
  const open = [...o.requests.filter(r => r.days_left != null), ...evOpen];
  const marks = [...open.map(r => ({d: r.deadline, t: `${r.to.replace('_', ' ')} due`, cls: r.days_left < 0 ? 'bad' : r.days_left <= 7 ? 'warn' : 'req'})),
    {d: dl, t: 'Evidence deadline', cls: 'ms'}, {d: ROUND.sourcing_date, t: 'Committee', cls: 'ms'}].sort((a, b) => (a.d < b.d ? -1 : 1));
  const months = []; for (let d = d0; d <= d1; d = T.addDays(d, 7)) months.push(d);
  const time = `<section class="card"><div class="sh"><h2>Timeline</h2><span class="sub">${o.days_to_committee} days to committee</span></div>
    <div class="tla"><div class="tlr"><span class="done" style="width:${x(s.today)}"></span>
      ${marks.map((m, i) => `<i class="${m.cls}" style="left:${x(m.d)}" title="${esc(m.t)} · ${day(m.d)}"><em class="${i % 2 ? 'dn' : 'up'}">${esc(m.t)}<small>${day(m.d)}</small></em></i>`).join('')}
      <b class="now" style="left:${x(s.today)}"><em>Today</em></b></div>
      <div class="tlw">${months.map(d => `<span style="left:${x(d)}">${day(d)}</span>`).join('')}</div></div>
    ${open.length ? '' : '<div class="sub">No open requests.</div>'}
    <div class="lgd"><span><i class="ms"></i>Milestone</span><span><i class="req"></i>Request due</span><span><i class="warn"></i>Due in 7 days</span><span><i class="bad"></i>Overdue</span></div></section>`;
  // supplier responses: sent → responded → accepted; rewards as a tally underneath
  // both the bracket claim flow (Evidence page) and the store's requests count here
  const v2 = ev ? [{status: ev.status === 'verified' ? 'verified' : ev.status === 'review' ? 'responded' : ev.status === 'support' ? 'responded' : 'forwarded', responded_on: ev.received, deadline: ev.due, option: ev.route === 'B' && ev.fee === 'approved' ? 'B' : null, v2: true}] : [];
  const live = [...s.requests.filter(r => r.kind === 'evidence' && !['withdrawn', 'draft'].includes(r.status)), ...v2];
  const resp = live.filter(r => DONE.includes(r.status) || r.responded_on), ontime = resp.filter(r => !r.responded_on || r.responded_on <= r.deadline);
  const acc = live.filter(r => ['verified', 'restated'].includes(r.status));
  const steps = [['Sent', live.length, ''], ['Responded', resp.length, `${ontime.length} on time`], ['Accepted', acc.length, 'evidence on file']];
  const top = Math.max(1, live.length);
  const prot = s.registry.filter(e => T.correctionProtection(e) === 'eligible').length + (ev?.limits ? 1 : 0), fee = live.filter(r => r.option === 'B').length;
  const funnel = `<section class="card"><div class="sh"><h2>Supplier response</h2><span class="sub">evidence requests this round</span></div>
    <div class="fn">${steps.map(([t, n, sub], i) => `<div class="fr"><span>${t}</span><div class="fb"><i style="width:${(n / top * 100).toFixed(1)}%;opacity:${1 - i * .22}"></i></div><b class="mono">${n}</b><em>${sub}</em></div>`).join('')}</div>
    <div class="rw"><div><span class="k">Reused evidence</span><b>${acc.length}</b></div><div><span class="k">Fee share</span><b>${fee}</b></div><div><span class="k">Corrections protected</span><b>${prot}</b></div></div></section>`;
  return carbon + cover + time + funnel;
}

// ---------- detail: one comparison, laid out like an order page ----------
const TRACK = ['Sent', 'Forwarded', 'Responded', 'Closed'];
function shipment(r) {
  const at = {draft: -1, approved: 0, forwarded: 1, responded: 2, partially_verified: 3, verified: 3, restated: 3, declined: 3, expired: 3}[r.status] ?? 0;
  const a = r.assessment;
  return `<div class="ship"><div class="oh"><span><b class="code">${esc(r.id)}</b> · ${esc(r.to)} <span class="sub">via ${esc(r.via.join(', '))}</span></span>${tag(STATUS[r.status])}</div>
    <div class="prog four">${TRACK.map((_, i) => `<i class="${i <= at ? (i === 3 && ['declined', 'expired'].includes(r.status) ? 'bad' : 'done') : ''}"></i>`).join('')}</div>
    <div class="stepl">${TRACK.map(t => `<span>${t}</span>`).join('')}</div>
    <div class="row"><span>${r.kind === 'data_fix' ? 'Asks for' : 'Claims'}</span><b>${esc(r.letter.claims.map(c => c.claim.replace(/_/g, ' ')).join(', '))}</b></div>
    <div class="row"><span>Deadline</span><b class="mono">${day(r.deadline)}${r.option ? ` · option ${esc(r.option)}` : ''}</b></div>
    ${a ? `<div class="row"><span>Verified PCF</span><b class="mono">${f2(a.declared_pcf)} → <span class="${a.direction.startsWith('lower') ? 'teal' : 'red'}">${f2(a.verified_pcf)}</span> kgCO₂e/kg</b></div>
      <div class="row"><span>Timing</span><b>${{on_time: 'On time', before_nomination: 'Late, before nomination', after_nomination: 'Late, after nomination'}[r.window]}</b></div>` : ''}</div>`;
}
function detail(key) {
  const s = store.get(), v = view(s, key), o = overview(s), c = o.comparisons.find(x => x.key === key), ms = milestones(s, v);
  const reqs = v.requests.filter(r => !['withdrawn', 'draft'].includes(r.status));
  const ids = new Set(v.requests.map(r => r.id));
  const log = s.log.filter(e => e.target === key || ids.has(e.target)).slice().reverse();
  const now = ms.findIndex(m => !m.done);
  return `
    <nav class="crumb"><a href="#">Decision Center</a><span>/</span><span>${esc(v.def.name)}</span></nav>
    <header class="ph"><div><div class="sub">${esc(ROUND.id)} · ${esc(key.toUpperCase())}</div><h1>${esc(v.def.name)}</h1>
      <div class="sub">${esc(v.def.parts.map(nm).join(' vs '))} · committee ${day(ROUND.sourcing_date)}</div></div>${tag(STAGE[v.stage])}</header>
    <section class="card track"><div class="steps6">${ms.map((m, i) => `<div class="st ${m.done ? 'done' : i === now ? 'now' : ''}${m.skip ? ' skip' : ''}"><i></i><b>${m.t}</b><span>${m.skip ? 'Not needed' : m.d ? day(m.d) : m.done ? 'Done' : i === now ? 'Current' : '–'}</span></div>`).join('')}</div></section>
    <div class="order">
      <div class="main">
        <section class="card"><div class="sh"><h2>Parts</h2><span class="sub">kgCO₂e from aluminium per part</span></div>
          <div class="tw"><table class="t"><tr><th>Part</th><th>Tier 1</th><th class="n">Al kg</th><th class="n">kgCO₂e</th><th class="n">Target</th><th>Status</th><th>Basis</th></tr>
          ${v.def.parts.map(p => { const b = v.basis[p], d = PARTS.find(x => x.part === p);
            return `<tr><td><b>${esc(nm(p))}</b></td><td>${esc(d.tier1)}</td><td class="n">${d.aluminium_kg.toFixed(1)}</td><td class="n ${b.meets_target ? 'teal' : 'red'}">${f2(b.pcf)}</td><td class="n">${f2(b.target)}</td>
              <td>${b.meets_target ? '<span class="tag t-ok">Meets</span>' : '<span class="tag t-pause">Misses</span>'}</td><td class="sub">${esc(b.source)}</td></tr>`; }).join('')}</table></div>
          ${v.state.action === 'alternative' && v.state.alternative ? `<div class="row"><span>Alternative</span><b>${esc(v.state.alternative.change)} · ${v.state.alternative.qualification ? 'qualified: ' + esc(v.state.alternative.qualification.note) : '<span class="amber">candidate, not qualified</span>'}</b></div>` : ''}
        </section>
        <section class="card"><div class="sh"><h2>Evidence</h2><span class="sub">${reqs.length ? `${reqs.length} request${reqs.length > 1 ? 's' : ''}` : ''}</span></div>
          ${reqs.length ? reqs.map(shipment).join('') : `<div class="sub">No requests. ${esc(v.state.action ? 'Action: ' + v.state.action.replace('_', ' ') : v.verdict.decision === 'continue_analysis' ? 'No claim here can change the decision.' : 'Procurement has not chosen an action yet.')}</div>`}
          ${v.late.map(l => `<div class="row"><span>Late evidence · ${esc(l.to)}</span><b>${l.material ? '<span class="amber">Would change the outcome</span> · ' : ''}${esc(l.impact_review?.outcome ? 'impact review: ' + l.impact_review.outcome.replace(/_/g, ' ') : l.next_steps.join(' · '))}</b></div>`).join('')}
          ${v.late.filter(l => l.record).map(l => `<div class="row"><span>Late evidence not used · ${esc(l.to)}</span><b>${esc(l.values.map(x => `${x.claim.replace('_', ' ')} ${x.verified_value} (${x.status.replace('_', ' ')})`).join(', '))}<br><span class="sub">${esc(l.record.reason)} · approved by ${esc(l.record.approved_by)} · next: ${esc(l.record.follow_up)}</span></b></div>`).join('')}
        </section>
        <section class="card"><div class="sh"><h2>Activity</h2></div>
          ${log.length ? log.map(e => `<div class="row"><span class="mono">${day(e.on)}</span><b>${esc(e.actor)} · ${esc(e.action)}${e.detail ? ' · ' + esc(e.detail) : ''}</b></div>`).join('') : '<div class="sub">No actions yet.</div>'}</section>
      </div>
      <aside class="side">
        <section class="card"><div class="k">Recommendation</div><div class="lead" style="margin-top:6px">${esc(v.recommendation)}</div>
          ${v.ready || v.state.nomination ? '' : `<div class="k" style="margin-top:14px">Before the committee</div>${v.blockers.map(b => `<div class="row"><span>${esc(b)}</span></div>`).join('')}`}</section>
        <section class="card"><div class="k">Decision</div>
          ${v.state.nomination ? `<div class="h">${esc(v.state.nomination.part ? 'Nominated ' + nm(v.state.nomination.part) : 'No nomination this round')}</div><div class="sub">Recorded ${day(v.state.nomination.on)}. Values as nominated; later evidence goes to an impact review and does not revoke it.</div>`
            : v.ready ? `<div class="sub" style="margin-top:6px">The pack is ready. The committee records the nomination.</div>${v.def.parts.map((p, i) => `<button class="${i ? 'btn2' : 'btn'}" data-nom="${key}|${p}">Nominate ${esc(nm(p))}</button>`).join('')}<button class="btn2" data-nom="${key}|">No nomination this round</button>`
            : `<div class="sub" style="margin-top:6px">Nomination opens when the pack is ready.</div>`}</section>
        ${c.waiting_on.length ? `<section class="card"><div class="k">Next move</div><div style="margin-top:8px">${c.waiting_on.map(w => owner(w, key)).join('')}</div></section>` : ''}
        <a class="btn2" href="workbench.html#${key}">Open in Sourcing Center</a>
        <div class="sub cav">${v.caveats.map(esc).join('<br>')}</div>
      </aside>
    </div>`;
}

function render() {
  const key = location.hash.slice(1), ok = ROUND.comparisons.some(c => c.key === key);
  $('#main').innerHTML = ok ? detail(key) : board();
  $$('[data-nom]').forEach(b => (b.onclick = () => { const [k, p] = b.dataset.nom.split('|'); if (act({type: 'nominate', actor: actor(committee), comparison: k, part: p || null})) toast('Nomination recorded'); }));
  const rs = $('#rnd'); if (rs) rs.onchange = () => { rnd = rs.value; render(); };
  $$('[data-view]').forEach(b => (b.onclick = () => { mode = b.dataset.view; try { localStorage.setItem('ct.dc.view', mode); } catch { /* not saved */ } render(); }));
  const fv = $('#fVeh'), fc = $('#fCmp');
  if (fv) fv.onchange = () => { flt.veh = fv.value; if (flt.cmp && flt.veh && !VEHICLES[flt.cmp].includes(flt.veh)) flt.cmp = ''; render(); };
  if (fc) fc.onchange = () => { flt.cmp = fc.value; render(); };
  $$('tr[data-href]').forEach(r => (r.onclick = e => { if (!e.target.closest('a')) location.hash = r.dataset.href; }));
}
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
store.subscribe(render);
flow.subscribe(render);
render();
mountNav('decision');
mountContext([BASE_CRUMBS[0], {t: 'Other rounds · sample'}], '<div class="seg"><a href="decision.html">This round</a><a class="on" href="manage.html">Other rounds</a></div>');
cursorLight();
