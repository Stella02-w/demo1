// Collaborate: joint decarbonisation candidates (mechanism B of the CarbonTrace Aluminium Pilot).
// Plans list → one collaboration (picture, company analysis, plans side by side) → one plan (gate, staged commitment, options, pilot).
// Nothing here is approved by CarbonTrace: each stage moves only when the companies involved agree. Evidence work lives in Evidence.
import './drawer.js';
import {$, esc, toast, mountNav, mountContext} from './ui.js';
import {flow} from './v2.js';
import {link, linkOn, paths} from './links.js';
import {SCEN, KEYS, keysOf, SOURCES, GATE, STAGES, OPTION_T, ROLES, PILOT, cjc, cjcActions, stageText, gateCount, gateOpen, typeOf} from './scenarios.js';
import {CO, MEMBERS, company} from './companies.js';


const TYPE = {upstream: 'Smelter_X', joint: 'Smelter_EU'};
const q = new URLSearchParams(location.search);
// ?focus=Smelter_X from older links opens that network
if (!location.hash && SOURCES[q.get('focus')]) history.replaceState(null, '', location.pathname + '#' + SOURCES[q.get('focus')].type);
const route = () => { const h = location.hash.slice(1);
  if (h.startsWith('plan-') && SCEN[h.slice(5)]) return h;   return ['upstream', 'joint'].includes(h) ? h : 'overview'; };
const tab = () => 'overview';

const readiness = k => [gateCount(k), GATE.length];
const status = k => cjc(k).stage || cjc(k).asked.length ? [stageText(k), 'st-ok'] : null;
const bar = k => { const [m, n] = readiness(k); return `<span class="rd"><span class="bar">${Array.from({length: n}, (_, i) => `<i class="${i < m ? 'on' : ''}"></i>`).join('')}</span>${m}/${n} gate</span>`; };
const RANK = {Low: 0, 'Low to medium': 1, Medium: 2, High: 3};
const rankK = ks => [...ks].sort((a, b) => readiness(b)[0] - readiness(a)[0] || RANK[SCEN[a].cmp.diff] - RANK[SCEN[b].cmp.diff]);
const pill = t => `<span class="ty ${t}">${{upstream: 'Upstream collaboration', joint: 'Joint collaboration', proposal: 'Supplier proposal'}[t]}</span>`;
const short = s => s.replace('Supplier ', '');
const hasL = () => linkOn() || link().status === 'confirmed';

// ---------- the two collaboration shapes ----------
// Upstream (vertical): buyers go up the chain and work with the smelter itself.
function upSvg(big) {
  const ps = paths(), W = 360, cx = W / 2, xs = ps.map((_, i) => cx + (i - (ps.length - 1) / 2) * (big ? 84 : 74));
  const T1 = {'Supplier B': ['Tier 1 B'], 'Supplier H': ['Tier 1 D'], 'Supplier I': ['Tier 1 D'], 'Supplier L': ['Tier 1 D', 'Tier 1 E']};
  const t1s = ['Tier 1 B', 'Tier 1 D', ...(hasL() ? ['Tier 1 E'] : [])], tx = t1s.map((_, i) => cx + (i - (t1s.length - 1) / 2) * 92);
  const y = [34, 112, 176, 226];
  return `<svg class="viz" viewBox="0 0 ${W} 250" role="img" aria-label="Upstream collaboration: buyers of Smelter X work with the smelter">
    <defs><linearGradient id="ug" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--up)" stop-opacity="0"/><stop offset="1" stop-color="var(--up)" stop-opacity=".35"/></linearGradient></defs>
    <path class="band" d="M${cx - 26},${y[3]} L${cx - 26},${y[0] + 20} L${cx - 40},${y[0] + 20} L${cx},${y[0] - 6} L${cx + 40},${y[0] + 20} L${cx + 26},${y[0] + 20} L${cx + 26},${y[3]} Z" fill="url(#ug)"/>
    ${ps.map((p, i) => `<path class="l ${p.st}" d="M${cx},${y[0]} C${cx},${(y[0] + y[1]) / 2} ${xs[i]},${(y[0] + y[1]) / 2} ${xs[i]},${y[1]}"/>`
      + T1[p.sup].map(t => `<path class="l k" d="M${xs[i]},${y[1]} C${xs[i]},${(y[1] + y[2]) / 2} ${tx[t1s.indexOf(t)]},${(y[1] + y[2]) / 2} ${tx[t1s.indexOf(t)]},${y[2]}"/>`).join('')).join('')}
    ${tx.map(x => `<path class="l k" d="M${x},${y[2]} C${x},${y[3] - 14} ${cx},${y[2] + 20} ${cx},${y[3]}"/>`).join('')}
    <circle class="hubU" cx="${cx}" cy="${y[0]}" r="13"/><text class="nm" x="${cx + 22}" y="${y[0] + 4}">Smelter X</text>
    ${ps.map((p, i) => `<circle class="n ${p.st}" cx="${xs[i]}" cy="${y[1]}" r="5"/><text x="${xs[i]}" y="${y[1] + 18}" text-anchor="middle">${short(p.sup)}${p.st === 'ai' ? ' ✦' : ''}</text>`).join('')}
    ${t1s.map((t, i) => `<circle class="n t1" cx="${tx[i]}" cy="${y[2]}" r="4"/><text x="${tx[i] + 9}" y="${y[2] + 4}">${t}</text>`).join('')}
    <rect class="jlr" x="${cx - 22}" y="${y[3] - 10}" width="44" height="20" rx="6"/><text class="jt" x="${cx}" y="${y[3] + 4}" text-anchor="middle">JLR</text>
    <text class="cap" x="12" y="${y[0] + 4}">SOURCE</text><text class="cap" x="12" y="${y[1] + 4}">BUYERS</text><text class="cap" x="12" y="${y[2] + 4}">TIER 1</text></svg>`;
}
// Joint (horizontal): peers under one source move together; F already shows what is possible.
function jointSvg() {
  const peers = [['Supplier C', .2], ['Supplier K', .05], ['Supplier F', .5]], W = 360, xs = [80, 180, 280], y0 = 30, y1 = 104, base = 220, h = 84;
  return `<svg class="viz" viewBox="0 0 ${W} 250" role="img" aria-label="Joint collaboration: Supplier C, K and F move together under Smelter EU">
    ${xs.map(x => `<path class="l ok f" d="M${W / 2},${y0} C${W / 2},${(y0 + y1) / 2} ${x},${(y0 + y1) / 2} ${x},${y1}"/>`).join('')}
    <circle class="n sm" cx="${W / 2}" cy="${y0}" r="7"/><text class="nm2" x="${W / 2 + 14}" y="${y0 + 4}">Smelter EU · verified</text>
    <rect class="lane" x="${xs[0] - 34}" y="${y1 - 15}" width="${xs[2] - xs[0] + 68}" height="30" rx="15"/>
    <path class="tie" d="M${xs[0]},${y1} L${xs[2]},${y1}"/>
    ${xs.map((x, i) => `<circle class="hubJ" cx="${x}" cy="${y1}" r="9"/><text class="nm" x="${x}" y="${y1 - 22}" text-anchor="middle">${short(peers[i][0])}</text>`).join('')}
    <line class="tgt" x1="${xs[0] - 34}" x2="${xs[2] + 34}" y1="${base - h * .5}" y2="${base - h * .5}"/><text class="cap" x="${xs[2] + 34}" y="${base - h * .5 - 6}" text-anchor="end">F level 50%</text>
    ${xs.map((x, i) => { const v = peers[i][1], hh = Math.max(3, h * v); return `<rect class="bg" x="${x - 14}" y="${base - h}" width="28" height="${h}" rx="5"/><rect class="rb${v >= .5 ? ' top' : ''}" x="${x - 14}" y="${base - hh}" width="28" height="${hh}" rx="5"/><text class="pc" x="${x}" y="${base + 18}" text-anchor="middle">${Math.round(v * 100)}%</text>`; }).join('')}
    <text class="cap" x="12" y="${base - h + 8}">RECYCLED</text><text class="cap" x="12" y="${base - h + 20}">SHARE</text></svg>`;
}
const VIZ = {upstream: upSvg, joint: jointSvg};

// ---------- overview: just the collaboration plans ----------
const ui = {co: {}, tip: null};
const PLANS = {upstream: {title: 'Upstream collaboration with Smelter X', line: 'Buyers of one smelter work with the smelter on the source itself.'},
  joint: {title: 'Joint collaboration · Supplier C, K and F', line: 'Three processors under Smelter EU agree one target and move together.'}};
function overview() {
  const row = type => { const src = TYPE[type], S = SOURCES[src], [k0] = rankK(keysOf(src)), st = status(k0);
    return `<a class="card cp2 ${type}" href="#${type}"><div class="cpl">${pill(type)}<h2>${PLANS[type].title}</h2><p class="what">${PLANS[type].line}</p>
      <div class="meta"><span>${MEMBERS[src]().length} companies</span><span>Paths ${S.state.toLowerCase()}</span><span>Reaches ${S.reach}</span></div></div>
      <div class="cpr"><span class="k">Suggested plan</span><b>${SCEN[k0].short}</b>${st ? `<span class="${st[1]}">${st[0]}</span>` : bar(k0)}<span class="vp">Open →</span></div></a>`; };
  const P = SCEN['h-furnace'], ps = status('h-furnace');
  return `<div class="hh"><h2 class="big">Collaboration plans <em>3</em></h2><span class="sub">Found in the network, or proposed by a supplier</span></div>
    ${row('upstream')}${row('joint')}
    <a class="card cp2 proposal" href="#plan-h-furnace"><div class="cpl">${pill('proposal')}<h2>${P.title}</h2><p class="what">${P.desc}</p>
      <div class="meta"><span>Transition Proposal · Oct 2026</span><span>Reaches Tier 1 D</span></div></div>
      <div class="cpr"><span class="k">Where it stands</span><b>${ps ? ps[0] : 'At the gate'}</b>${bar('h-furnace')}<span class="vp">Open →</span></div></a>
    <p class="fine">Candidates from the network, not results. No reduction, cost or return is claimed before an assessment.</p>`;
}

// ---------- one plan: the picture, the companies, the proposal ----------
const FIT = {High: 'ok', Medium: 'warn', Low: ''};
const SENT = {pos: ['Positive', 'ok'], neu: ['Neutral', ''], neg: ['Risk', 'rev']};
function analysis(id, ks) {
  const c = company(id), m = c.mat, fit = Object.entries(c.fit).filter(([k]) => ks.includes(k)).sort((a, b) => RANK[b[1][0]] - RANK[a[1][0]])[0];
  const fact = (k, v, e) => `<div><span>${k}</span><b>${v}</b><em>${e}</em></div>`;
  return `<div class="an"><p class="say"><span class="aisym">✦</span><span>${esc(c.say)}</span></p>
    <div class="facts">${fact('With JLR', c.years ? `${c.years} years` : 'New', `since ${c.since} · ${esc(c.how.split(' · ')[0].toLowerCase())}`)}
      ${fact('Share of round', `${c.share}%`, 'aluminium by kg')}
      ${fact(c.smelter ? 'Primary footprint' : 'Recycled share', c.smelter ? esc(m.pcf || '—') : m.recycled != null ? Math.round(m.recycled * 100) + '%' : '—', `${m.basis} · ${m.year}`)}
      ${fact('Plan fit', fit ? fit[1][0] : '—', fit ? esc(fit[1][1]) : '')}</div>
    <details class="fold"><summary>Relationship history and recent signals</summary><div class="an2"><div><div class="k">Relationship history</div>
      <div class="ctr"><div><b>Through ${esc(c.via)}</b><span>since ${c.since}</span></div>${c.contracts.map(([a, b]) => `<div><b>${esc(a)}</b><span>${b}</span></div>`).join('')}
        <div><b>Last data request</b><span>${esc(c.data.replace(/^Q2-26 request · /, ''))}</span></div></div></div>
      <div><div class="k">Recent signals <span class="tg">Simulated</span></div><div class="nws">${c.news.map(([d, s, t, w]) => `<div><i class="sd ${SENT[s][1]}"></i><span><b>${esc(t)}</b><em>${d} · ${esc(w)}</em></span></div>`).join('')}</div></div></div></details></div>`;
}
function detail(type) {
  const src = TYPE[type], ks = rankK(keysOf(src)), mem = MEMBERS[src](), sel = mem.includes(ui.co[type]) ? ui.co[type] : mem[1];
  const [k0, ...rest] = ks, P = SCEN[k0], st = status(k0);
  return `<a class="bk" href="#overview">← Collaboration plans</a>
    <section class="card nhd ${type}"><div class="nl">${pill(type)}<h1>${PLANS[type].title}</h1><p class="what">${PLANS[type].line}</p>
      <a class="lnk2" href="network.html#${src}">See it in Network →</a></div><div class="vz">${VIZ[type](true)}</div></section>
    <section class="card"><div class="hh"><h2>Company analysis</h2><span class="sub">${mem.length} companies</span></div>
      <div class="seg cot">${mem.map(id => `<button class="chip${id === sel ? ' on' : ''}" data-co="${id}">${esc(company(id).name)}</button>`).join('')}</div>
      ${analysis(sel, ks)}</section>
    ${compareIn(ks)}`;
}
// the plans of one collaboration side by side; the first is the recommended one
// one picture of the plans in this collaboration: the five gate conditions, the commitment stage, difficulty
function cmpChart(ks) {
  const DIFF = {Low: 1, 'Low to medium': 2, Medium: 3, High: 4};
  const head = `<div class="cc-h"><span></span>${ks.map((k, i) => `<b>${i === 0 ? '<i class="aisym">✦</i> ' : ''}${SCEN[k].short}</b>`).join('')}</div>`;
  const row = (t, f) => `<div class="cc-r"><span>${t}</span>${ks.map(k => `<div>${f(k)}</div>`).join('')}</div>`;
  const gateRows = GATE.map((g, gi) => row(g, k => { const [ok, note] = SCEN[k].gate()[gi]; return `<i class="dt ${ok ? 'ok' : ''}" title="${esc(note)}"></i><em>${esc(note)}</em>`; })).join('');
  const stage = row('Commitment stage', k => `<span class="trk5">${STAGES.map((_, i) => `<i class="${i < cjc(k).stage ? 'on' : i === cjc(k).stage ? 'now' : ''}"></i>`).join('')}</span><em>${esc(STAGES[Math.min(4, cjc(k).stage)][0])}</em>`);
  const diff = row('Difficulty', k => `<span class="trk5 df">${[1, 2, 3, 4].map(i => `<i class="${i <= DIFF[SCEN[k].cmp.diff] ? 'on' : ''}"></i>`).join('')}</span><em>${SCEN[k].cmp.diff}</em>`);
  const way = row('Preferred way', k => `<em class="pw2">${OPTION_T[SCEN[k].prefer]}</em>`);
  return `<div class="cc" style="--n:${ks.length}">${head}<div class="cc-g">Feasibility gate</div>${gateRows}${stage}${diff}${way}</div>`;
}
function compareIn(ks) {
  return `<section class="card"><div class="hh"><h2>Plans for this collaboration</h2><span class="sub">Ranked by feasibility gate, then difficulty</span></div>
    ${cmpChart(ks)}
    <div class="pcmp">${ks.map((k, i) => { const P = SCEN[k]; return `<a class="pcc${i === 0 ? ' rec1' : ''}" href="#plan-${k}">
      <div class="sct">${i === 0 ? '<span class="tg ai">✦ Recommended</span>' : '<span class="tg">Alternative</span>'}<span class="sub">${stageText(k)}</span></div>
      <h3>${P.title}</h3><p class="what">${P.desc}</p><span class="vp">View full plan →</span></a>`; }).join('')}</div></section>`;
}

// ---------- plan, pipeline ----------
// Upstream plans move up the chain: each level has one job, and the smelter makes the change.
const LADDER = {
  sourcing: [['Tier 3', 'Smelter X', 'Quotes a low-carbon ingot and proves its footprint'], ['Tier 2', () => `Suppliers ${hasL() ? 'H, I and L' : 'H and I'}`, 'Pool their A356 demand into one request'],
    ['Tier 1', () => `Tier 1 D${hasL() ? ' and E' : ''}`, 'Share volumes and confirm the alloy still fits the part'], ['JLR', 'Procurement', 'Signals it will buy volume and convenes the buyers']],
  energy: [['Tier 3', 'Smelter X', 'Shares its energy mix and owns the power or process change'], ['Tier 2', 'Suppliers B, H and I', 'Back the change as buyers of the smelter'],
    ['Tier 1', 'Tier 1 B, D and E', 'Pass the lower value into their quotes'], ['JLR', 'Procurement and Sustainability', 'Offers a long-term buying signal and checks the claim']]
};
const ladder = k => `<section class="card"><div class="hh"><h2>Up the chain</h2><span class="sub">Vertical: each level has one job; the change happens at the source</span></div>
  <div class="lad">${LADDER[k].map(([lv, who, job], i) => `<div class="${i === 0 ? 'src' : ''}"><span class="lv">${lv}</span><b>${typeof who === 'function' ? who() : who}</b><em>${job}</em></div>`).join('<i class="ar">↑</i>')}</div></section>`;
// Joint plans move side by side: each peer, where it stands today and what it would do.
const PEERS = {
  'eu-rec': {h: 'Recycled share today', peers: [['Supplier C', .2, 'Raise from 20% toward the shared band'], ['Supplier K', .05, 'Verify 5%, then the biggest step up'], ['Supplier F', .5, 'Already at 50%; shares how it got there']], target: '35–50%'},
  'eu-loop': {h: 'Parts served', peers: [['Supplier C', .66, 'Bracket and rear cover · takes back both alloys'], ['Supplier K', .66, 'Bracket and rear cover · takes back both alloys'], ['Supplier F', .33, 'Rear cover only · A356 returns']], target: null}
};
const sideBySide = k => { const P = PEERS[k]; return `<section class="card"><div class="hh"><h2>Side by side</h2><span class="sub">Joint: the same step, taken together${P.target ? ` · shared target ${P.target}` : ''}</span></div>
  <div class="sbs">${P.peers.map(([n, v, t]) => `<div><b>${n}</b><span class="rbar"><i style="width:${v * 100}%"></i></span><em>${k === 'eu-rec' ? Math.round(v * 100) + '% recycled · ' : ''}${t}</em></div>`).join('')}</div></section>`; };
function plan(k) {
  const S = SCEN[k], type = typeOf(k), C = cjc(k), G = S.gate(), open = gateOpen(k), Pl = PILOT[k];
  const back = type === 'proposal' ? ['#overview', 'Collaboration plans'] : [`#${type}`, PLANS[type].title];
  // the current stage: who was asked, who agreed, what the next action is. Stage 3 onwards needs the gate.
  const blocked = C.stage >= 2 && !open, done = C.stage >= 5, all = C.asked.length && C.yes.length === C.asked.length;
  const act = done ? '' : blocked ? `<span class="hint">Paused: the feasibility gate must be met before a joint study.</span>`
    : !C.asked.length ? `<button class="btn" data-cj="ask" data-k="${k}">${C.stage === 0 ? 'Invite partners to express interest' : `Ask partners: ${STAGES[C.stage][0].toLowerCase()}`}</button>`
    : all ? `<button class="btn" data-cj="complete" data-k="${k}">Record stage ${C.stage + 1} as agreed</button>` : `<button class="btn2" data-cj="record" data-k="${k}">Record responses</button>`;
  // one timeline: the 12-week pilot, with the commitment stages placed where they happen
  const who = C.asked.length ? `<span class="who2">${C.asked.map(p => `<span class="${C.yes.includes(p) ? 'y' : ''}">${C.yes.includes(p) ? '✓ ' : ''}${esc(p)}</span>`).join('')}</span>` : '';
  const cur = C.stage >= 3 ? 4 : C.stage === 2 ? 3 : open || C.stage ? 2 : 1;
  const NODES = [
    {w: 'Weeks 1–2', t: 'Baseline', d: Pl.weeks[0], tips: [['metrics', 'How we measure']]},
    {w: 'Weeks 3–5', t: 'Evidence track', d: Pl.weeks[1], tips: [['gate', `Gate ${gateCount(k)}/5`]], warn: !open},
    {w: 'Weeks 6–8', t: 'Confirm the opportunity', d: Pl.weeks[2], st: [0, 1]},
    {w: 'Weeks 9–11', t: 'Joint feasibility', d: Pl.weeks[3], st: [2], tips: [['ways', 'Three ways'], ['cost', 'Cost split']]},
    {w: 'Week 12', t: 'Go / no-go review', d: 'Widen, gather more data, start an engineering study, or stop', st: [3], tips: [['stop', 'Stop if']]}];
  const tipBody = {
    metrics: () => `<div class="tw"><table class="t pm"><tr><th>Level</th><th>Metric</th><th>Without CarbonTrace</th><th>Pilot hypothesis</th></tr>${Pl.metrics.map(([l, m, a, b]) => `<tr><td><span class="tg">${l}</span></td><td>${m}</td><td class="sub">${a}</td><td>${b}</td></tr>`).join('')}</table></div>`,
    gate: () => G.map(([ok, t, href], i) => `<div class="gt ${ok ? 'ok' : ''}"><i>${ok ? '✓' : ''}</i><span><b>${GATE[i]}</b>${esc(t)}${!ok && href ? ` · <a href="${href}">Resolve →</a>` : ''}</span></div>`).join(''),
    ways: () => `<div class="opts">${S.options.map(([t, v], i) => `<div class="${i === S.prefer ? 'pref' : ''}"><span class="on">${i + 1}</span><span><b>${OPTION_T[i]}</b><em>${t}</em></span><span class="tg ${i === S.prefer ? 'ai' : ''}">${v}</span></div>`).join('')}</div>`,
    cost: () => `<div class="fsr"><label>${S.cost[0]}<b id="fsI">£100,000</b><input type="range" min="20000" max="500000" step="10000" value="100000" data-fs="inv"></label>
        <label>JLR conditional support<b id="fsJ">20%</b><input type="range" min="0" max="40" step="5" value="20" data-fs="jlr"></label>
        <label>${S.cost[1]}'s share of the rest<b id="fsA">60%</b><input type="range" min="0" max="100" step="5" value="60" data-fs="a"></label></div>
      <div class="fsb" id="fsB"></div><p class="fine">Illustrative arithmetic, not a quote or a recommended split.</p>`,
    stop: () => `<ul class="lst2 un">${S.stops.map(x => `<li>${x}</li>`).join('')}</ul>`};
  const tip = ui.tip && tipBody[ui.tip] ? ui.tip : null;
  const node = (n, i) => `<div class="tn ${i < cur ? 'done' : i === cur ? 'now' : ''}${n.warn ? ' warn' : ''}"><i></i><span class="k">${n.w}</span><b>${n.t}</b><p>${n.d}</p>
    ${n.st ? `<div class="cs">${n.st.map(j => `<span class="${j < C.stage ? 'y' : j === C.stage ? 'now' : ''}">${j < C.stage ? '✓ ' : ''}${STAGES[j][0]}</span>`).join('')}</div>` : ''}
    ${i === (C.stage <= 1 ? 2 : Math.min(4, C.stage + 1)) ? `${who}<div class="na">${act}</div>` : ''}
    ${n.tips ? `<div class="tips">${n.tips.map(([key, l]) => `<button class="tipb${tip === key ? ' on' : ''}" data-tip="${key}">${l}</button>`).join('')}</div>` : ''}</div>`;
  const info = `<span class="ib2" tabindex="0" aria-label="More about this plan">i<span class="pop"><b>Why this plan</b>${S.why.map(([a]) => `<em>${a}</em>`).join('')}
      <b>Who decides</b>${ROLES.map(([a, b]) => `<em>${a}: ${b}</em>`).join('')}<b>Stop if</b>${S.stops.map(x => `<em>${x}</em>`).join('')}</span></span>`;
  return `<a class="bk" href="${back[0]}">← ${back[1]}</a>
    <section class="card ph2"><div class="sct">${pill(type)}<span class="tg ${S.tag[2]}">${S.tag[0]}</span><span class="sub">${S.origin}</span></div>
      <h1>${S.title} ${info}</h1><p class="what">${S.desc}</p></section>
    ${type === 'upstream' ? ladder(k) : type === 'joint' ? sideBySide(k) : proposalBlock(k)}
    <section class="card"><div class="hh"><h2>Pilot timeline · 12 weeks</h2><span class="sub">Each step moves only when the companies involved agree. CarbonTrace records it; nothing goes to the sourcing decision.</span></div>
      <div class="tl">${NODES.map(node).join('')}</div>
      ${tip ? `<div class="tpan"><div class="hh"><b>${NODES.flatMap(n => n.tips || []).find(t => t[0] === tip)[1]}</b><button class="bk" data-tip="${tip}">Close</button></div>${tipBody[tip]()}</div>` : ''}
      <p class="fine" style="margin-top:12px">After a go: implementation and verification under contract, measured beyond the pilot.</p></section>`;
}
function proposalBlock(k) {
  return `<section class="card"><div class="hh"><h2>Transition Proposal as submitted</h2><span class="sub">Evidence eligibility is judged apart from the emission level; contract reduction requirements still apply</span></div>
    <div class="prg">${SCEN[k].proposal.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div></section>`;
}
function fundSplit() {
  const v = n => +($(`[data-fs="${n}"]`)?.value || 0); if (!$('#fsB')) return;
  const S = SCEN[route().slice(5)], inv = v('inv'), j = inv * v('jlr') / 100, a = (inv - j) * v('a') / 100, b = inv - j - a, f = x => '£' + Math.round(x).toLocaleString('en-GB');
  $('#fsI').textContent = f(inv); $('#fsJ').textContent = v('jlr') + '%'; $('#fsA').textContent = v('a') + '%';
  $('#fsB').innerHTML = [['JLR conditional support', j, 'j'], [S.cost[1], a, 'a'], [S.cost[2], b, 'b']].map(([t, x, c]) => `<div class="${c}" style="flex:${Math.max(x, 1)}"><span>${esc(t)}</span><b>${f(x)}</b></div>`).join('');
}
function compare() {
  const rows = [['Purpose', 'aim'], ['Difficulty', 'diff'], ['Information needed', 'info'], ['Most direct value', 'direct'], ['Next step', 'next']];
  return `<section class="card"><div class="tw"><table class="t cmp"><tr><th></th>${KEYS.map(k => `<th>${pill(SOURCES[SCEN[k].src].type)}<br>${SCEN[k].short}</th>`).join('')}</tr>
      ${rows.map(([t, f]) => `<tr><td class="sub">${t}</td>${KEYS.map(k => `<td>${SCEN[k].cmp[f]}</td>`).join('')}</tr>`).join('')}
      <tr><td class="sub">Main blocker</td>${KEYS.map(k => `<td>${SCEN[k].block()}</td>`).join('')}</tr>
      <tr><td class="sub">Readiness</td>${KEYS.map(k => `<td>${bar(k)}</td>`).join('')}</tr>
      <tr><td></td>${KEYS.map(k => `<td><a class="btn2" href="#plan-${k}">View plan</a></td>`).join('')}</tr></table></div>
    <p class="fine" style="margin-top:10px">Qualitative, from the network and the data on file. Reductions and returns come only from an assessment.</p></section>`;
}
function render() {
  const t = tab(), r = route();
  mountContext([{t: 'Range Rover Sport', href: 'workbench.html'}, {t: 'Q4-26 Aluminium'}, {t: 'Collaborate'}]);
  $('#m').innerHTML = r.startsWith('plan-') ? plan(r.slice(5)) : TYPE[r] ? detail(r) : overview();
  document.querySelectorAll('[data-co]').forEach(b => (b.onclick = () => { ui.co[r] = b.dataset.co; render(); }));
  document.querySelectorAll('[data-cj]').forEach(b => (b.onclick = () => { cjcActions[b.dataset.cj](b.dataset.k); toast({ask: 'Partners asked', record: 'Responses recorded', complete: 'Stage recorded as agreed'}[b.dataset.cj]); }));
  document.querySelectorAll('[data-fs]').forEach(i => (i.oninput = fundSplit)); fundSplit();
  document.querySelectorAll('[data-tip]').forEach(b => (b.onclick = () => { ui.tip = ui.tip === b.dataset.tip ? null : b.dataset.tip; render(); }));
}
addEventListener('hashchange', () => { ui.tip = null; render(); scrollTo(0, 0); });
mountNav('collaborate');
flow.subscribe(render);
render();
