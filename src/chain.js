// Impact chain for the Sourcing panel: smelter → Tier 2 → Tier 1 quote → part, and a fixed-shape statement per node
// (where it reaches, how much metal, what it changes, next step). Breadth and effect are kept apart, never scored.
import {R, CLAIMS, LINKS, OPTIONS, AGENT_REC, KIND, claimState, CANDS, cand, r2, name as nm} from './v2.js';
import {esc} from './ui.js';
import {PCF_RECORDS} from './data.js';
import {LINK, SHARE, PRIVATE, COMMIT, LINK_DOC, ROUTES, link, linkOn, linkText, paths, gates} from './links.js';

// [Assumption] Rear cover quotes come from the round data (data.js PARTS); the claim analysis covers the bracket only.
export const CPARTS = [
  {k: 'bracket', name: 'Front suspension bracket', kg: 8, vehicles: ['Range Rover Sport', 'Range Rover Velar'], live: true,
    quotes: {Tier1_A: [['Supplier_C', .5], ['Supplier_E', .5]], Tier1_B: [['Supplier_B', .7], ['Supplier_A', .3]], Tier1_C: [['Supplier_K', .6], ['Supplier_J', .4]]}},
  {k: 'cover', name: 'Rear cover', kg: 6, vehicles: ['Range Rover Sport'],
    quotes: {Tier1_D: [['Supplier_H', .5], ['Supplier_I', .5]], Tier1_E: [['Supplier_F', .25], ['Supplier_C', .65], ['Supplier_K', .1]]}}
];
const T2_ORDER = ['Supplier_E', 'Supplier_C', 'Supplier_A', 'Supplier_B', 'Supplier_K', 'Supplier_J', 'Supplier_H', 'Supplier_I', 'Supplier_F'];
const SHORT = {EU_mix: 'EU mix', Smelter_EU: 'Smelter EU', Smelter_IMP: 'Smelter Imp.', Smelter_X: 'Smelter X'};
export const SCENE_ID = {Smelter_X: 'Unknown_B', EU_mix: 'EU_market_mix'};
const label = id => SHORT[id] || (id.startsWith('Tier1_') ? `Tier 1 ${id.slice(-1)}` : id.startsWith('part:') ? CPARTS.find(p => 'part:' + p.k === id).name.replace('Front suspension b', 'B') : nm(id));
const REC_SM = {Smelter_EU: 'Smelter_EU', Smelter_IMP: 'Smelter_IMP', EU_market_mix: 'EU_mix', Unknown_B: 'Smelter_X'};
const smelterOf = s => LINKS.find(l => l.to_id === s && !l.to_id.startsWith('Tier1'))?.from_id || REC_SM[PCF_RECORDS.find(r => r.supplier === s)?.smelter];
// claim that decides a node: its own, or the shared smelter claim for suppliers whose origin is unproven
export const claimOf = id => Object.values(CLAIMS).find(c => c.supplier === id)?.claim_id || Object.values(CLAIMS).find(c => c.shared_with.includes(id) && claimState(c.claim_id).basis !== 'verified')?.claim_id;
export function status(id) {
  const cid = claimOf(id); if (!cid) return id.startsWith('Supplier') && !smelterOf(id) ? 'none' : 'plain';
  const c = CLAIMS[cid], st = claimState(cid);
  if (c.recommendation === 'no_action' || st.basis === 'verified') return 'ok';
  if (st.col === 'ready') return 'dec'; // decided for this round: no longer open
  return {material: 'chg', not_material: 'noeff', indeterminate: 'unk'}[c.decision_sensitivity];
}
export const EFFECT = {chg: ['Could change decision', 't-rev'], noeff: ['No effect', 't-mut'], unk: ["Can't test yet", 't-info'], ok: ['Verified', 't-ok'], dec: ['Decided', 't-mut']};

// Confidence in the reported value, from the data-quality rating and the evidence behind it. Not a probability.
const EV = {self_declaration: 'self-declared', verification_statement: 'verified statement'};
export function confidence(id) {
  const c = CLAIMS[claimOf(id)]; if (!c) return null;
  if (status(id) === 'ok') return ['High', 'verified evidence on file'];
  const rec = PCF_RECORDS.find(r => r.supplier === c.supplier);
  if (!rec) return ['Low', c.supplier === 'Smelter_X' ? 'smelter not named in any statement' : 'self-declared · no measurement method'];
  const lvl = rec.dqr <= 2 ? 'High' : rec.dqr === 3 ? 'Medium' : 'Low';
  return [lvl, [rec.evidence.length ? EV[rec.evidence[0]] || rec.evidence[0].replace(/_/g, ' ') : 'no evidence', `${rec.reference_year} data`, `data quality ${rec.dqr}/5`].join(' · ')];
}
// what each bracket quote does if the claim does not hold (rules scenario test)
function outcomes(cid) {
  const c = CLAIMS[cid], out = {}; if (!c || !c.tested.length) return out;
  const rep = c.tested.find(t => t.basis === 'reported'), alt = c.tested.find(t => t.basis !== 'reported');
  const low = t => CANDS.reduce((a, k) => (t.pcf[k] < t.pcf[a] ? k : a));
  for (const k of CANDS) { const t1 = 'Tier1_' + k.slice(-1), a = rep.pcf[k], b = alt.pcf[k];
    if (Math.abs(a - b) > .005) out[t1] = {txt: `${r2(a)} → ${r2(b)}`, flip: a <= R.target && b > R.target}; }
  if (low(rep) !== low(alt)) { const t1 = 'Tier1_' + low(alt).slice(-1); out[t1] = {...(out[t1] || {}), low: true}; }
  return out;
}

export function graph(filter) {
  const parts = CPARTS.filter(p => !filter || p.k === filter), edges = [], kg = {};
  const add = (a, b, w) => { const e = edges.find(x => x.a === a && x.b === b); if (e) e.w += w; else edges.push({a, b, w}); kg[a] = (kg[a] || 0) + w; };
  for (const p of parts) for (const [t1, src] of Object.entries(p.quotes)) {
    add(t1, 'part:' + p.k, p.kg); for (const [s, sh] of src) { add(s, t1, p.kg * sh); const sm = smelterOf(s); if (sm) add(sm, s, p.kg * sh); }
  }
  for (const p of parts) kg['part:' + p.k] = p.kg * Object.keys(p.quotes).length;
  return {parts, edges, kg};
}
const walk = (edges, id, dir) => { const out = new Set(), q = [id]; while (q.length) { const n = q.pop(); for (const e of edges) { const [f, t] = dir > 0 ? [e.a, e.b] : [e.b, e.a]; if (f === n && !out.has(t)) { out.add(t); q.push(t); } } } return out; };

// opt: {fresh: the suggested link was just revealed, part: 'bracket' | 'cover' to show one part's paths}
export function diagram(sel, opt = {}) {
  const aiF = sel === 'Supplier_L', aiLit = new Set(['Smelter_X', 'Tier1_D', 'Tier1_E', 'part:cover']); if (aiF) sel = null;
  const {edges} = graph(opt.part), nodes = new Set(edges.flatMap(e => [e.a, e.b]));
  const col = id => id.startsWith('part:') ? 3 : id.startsWith('Tier1_') ? 2 : id.startsWith('Supplier') ? 1 : 0;
  const X = [10, 98, 186, 268], ROW = 26, y = {};
  T2_ORDER.filter(s => nodes.has(s)).forEach((s, i) => (y[s] = 16 + i * ROW));
  const mean = ids => ids.reduce((a, i) => a + y[i], 0) / ids.length;
  for (const sm of [...nodes].filter(n => col(n) === 0)) y[sm] = mean(edges.filter(e => e.a === sm).map(e => e.b));
  for (const t of [...nodes].filter(n => col(n) === 2)) y[t] = mean(edges.filter(e => e.b === t).map(e => e.a));
  for (const p of [...nodes].filter(n => col(n) === 3)) y[p] = mean(edges.filter(e => e.b === p).map(e => e.a));
  for (const k of [0, 2, 3]) { const cs = [...nodes].filter(n => col(n) === k).sort((a, b) => y[a] - y[b]); for (let i = 1; i < cs.length; i++) y[cs[i]] = Math.max(y[cs[i]], y[cs[i - 1]] + (k === 2 ? 30 : 22)); }
  // the AI-suggested link sits under the known network; it never enters the claim graph or any calculation
  const AI = nodes.has('Tier1_E') && nodes.has('Smelter_X') ? {y: Math.max(...T2_ORDER.filter(s => nodes.has(s)).map(s => y[s])) + ROW + 4} : null;
  const H = Math.max(...Object.values(y), AI ? AI.y : 0) + 22;
  // the impact zone: what lies downstream of a claim node, and which end points could change
  const claimNode = sel && !sel.startsWith('Tier1_') && !sel.startsWith('part:'), cleared = sel && status(sel) === 'ok';
  const down = sel ? walk(edges, sel, 1) : new Set(), up = sel ? walk(edges, sel, -1) : new Set();
  const cid = claimNode && claimOf(sel), open = cid && !['ok', 'dec', 'none', 'plain'].includes(status(sel));
  const out = open ? outcomes(cid) : {};
  const risk = new Set(Object.keys(out).filter(k => out[k].flip || out[k].low));
  if (open && Object.values(out).some(o => o.flip || o.low)) risk.add('part:bracket');
  const na = new Set(open ? [...down].filter(n => n.startsWith('part:') && !CPARTS.find(p => 'part:' + p.k === n).live) : []);
  const lit = sel ? new Set([sel, ...down, ...up, ...(open ? Object.keys(out) : [])]) : null;
  const on = id => !lit || lit.has(id);
  const state = id => !sel ? '' : id === sel ? 'src' + (cleared ? ' okd' : '') : risk.has(id) ? 'risk' : na.has(id) ? 'na' : down.has(id) ? (cleared ? 'okd' : 'reach') : up.has(id) ? 'up' : '';
  const path = e => { const x1 = X[col(e.a)] + 4, x2 = X[col(e.b)] - 4, y1 = y[e.a], y2 = y[e.b], m = (x1 + x2) / 2; return `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`; };
  // overview: an open claim warms the path from its node down to the part, never the supplier upstream of it
  const warm = sel ? null : new Set([...nodes].filter(n => status(n) === 'chg').flatMap(n => [n, ...walk(edges, n, 1)]));
  const edgeCls = e => { if (!sel) return warm.has(e.a) && warm.has(e.b) ? 'warm' : '';
    if ((e.a === sel || down.has(e.a)) && down.has(e.b)) return claimNode ? (cleared ? 'ok' : 'reach') : 'lit';
    if (up.has(e.a) && (up.has(e.b) || e.b === sel)) return 'lit';
    return 'dim'; };
  let zone = '';
  if (claimNode && down.size && !cleared) { const ids = [sel, ...down, ...risk]; const ys = ids.map(i => y[i]);
    zone = `<rect class="zone" x="${X[col(sel)] - 10}" y="${Math.min(...ys) - 14}" width="${352 - X[col(sel)] + 8}" height="${Math.max(...ys) - Math.min(...ys) + 34}" rx="12"/>`; }
  const note = id => { const o = out[id]; if (o) return `<text class="nt ${o.flip ? 'red' : ''}" x="${X[2] + 9}" y="${y[id] + 15}">${o.txt ? o.txt.replace(' → ', '→') : ''}${o.low ? (o.txt ? ' · ' : '') + 'lowest' : ''}</text>`;
    if (risk.has(id) && id.startsWith('part:')) return `<text class="nt red" x="${X[3] + 10}" y="${y[id] + 16}">could change</text>`;
    if (na.has(id)) return `<text class="nt" x="${X[3] + 10}" y="${y[id] + 16}">not assessed</text>`; return ''; };
  return `<svg class="chain${sel ? ' focus' : ''}" viewBox="0 0 352 ${H}" role="img" aria-label="Supply chain from smelters to parts">
    <g class="hd">${['Tier 3', 'Tier 2', 'Tier 1', 'Part'].map((t, i) => `<text x="${X[i] - 4}" y="${opt.roles ? -14 : -4}">${t}</text>`).join('')}${opt.roles ? ['Smelter', 'Processor', 'Part maker', 'JLR vehicle'].map((t, i) => `<text class="rl" x="${X[i] - 4}" y="-4">${t}</text>`).join('') : ''}</g>${zone}
    ${edges.map(e => `<path d="${path(e)}" class="ed ${aiF ? (e.a === 'Tier1_E' && e.b === 'part:cover' ? 'lit' : 'dim') : edgeCls(e)}" style="stroke-width:${Math.min(6, .8 + e.w * .45).toFixed(2)}"/>`).join('')}
    ${[...nodes].map(id => `<g class="nd ${sel ? state(id) : status(id)}${aiF ? (aiLit.has(id) ? ' hl' : ' dim') : on(id) || risk.has(id) ? '' : ' dim'}" data-cn="${id}" tabindex="0" role="button" aria-label="${esc(label(id))}">
      ${risk.has(id) || na.has(id) ? `<circle class="ring" cx="${X[col(id)]}" cy="${y[id]}" r="${col(id) === 3 ? 10 : 8.5}"/>` : ''}
      <circle cx="${X[col(id)]}" cy="${y[id]}" r="${col(id) === 3 ? 6 : 4.5}"/><text x="${X[col(id)] + 9}" y="${y[id] + 3.5}">${esc(label(id))}</text>${sel ? note(id) : ''}</g>`).join('')}
    ${AI ? aiLayer(X, y, AI.y, aiF ? 'Supplier_L' : sel, opt.fresh) : ''}</svg>`;
}
export const legend = sel => sel && status(sel) === 'ok' && !sel.startsWith('Tier1_') && !sel.startsWith('part:')
  ? '<span><i class="ok"></i>Verified · open claim cleared</span>'
  : sel && !sel.startsWith('Tier1_') && !sel.startsWith('part:')
  ? '<span><i class="src"></i>Source</span><span><i class="reach"></i>Reach</span><span><i class="risk"></i>Could change outcome</span><span><i class="na"></i>Not assessed</span>'
  : `<span><i class="chg"></i>Could change decision</span><span><i class="noeff"></i>No effect</span><span><i class="unk"></i>Can't test yet</span><span><i class="ok"></i>Verified</span><span><i class="dec"></i>Decided</span>`;

export function statement(id) {
  const {edges} = graph(), down = walk(edges, id, 1), up = walk(edges, id, -1);
  const parts = CPARTS.filter(p => down.has('part:' + p.k) || id === 'part:' + p.k);
  const cid = claimOf(id), st = status(id), c = cid && CLAIMS[cid];
  const isPart = id.startsWith('part:'), isT1 = id.startsWith('Tier1_');
  if (isPart || isT1) {
    const open = [...new Set([...up].map(claimOf).filter(Boolean))].filter(x => !['ok'].includes(status(CLAIMS[x].supplier)));
    const p = isPart ? CPARTS.find(x => 'part:' + x.k === id) : parts[0];
    return `<div class="stm"><div class="sh1">${esc(label(id))}${isT1 ? ' quote' : ''}</div>
      <div class="tags"><span class="tg ${open.length ? 'warn' : 'ok'}">${open.length || 'No'} open claim${open.length === 1 ? '' : 's'} upstream</span>${p.vehicles.map(v => `<span class="tg">${esc(v)}</span>`).join('')}${p.live ? '' : '<span class="tg">Not assessed this round</span>'}</div>
      ${open.map(x => `<button class="sl" data-cn="${CLAIMS[x].supplier}"><span>${esc(nm(CLAIMS[x].supplier))} · ${KIND[CLAIMS[x].kind]}</span><span class="tag ${EFFECT[status(CLAIMS[x].supplier)][1]}">${EFFECT[status(CLAIMS[x].supplier)][0]}</span></button>`).join('')}
      ${p.live ? `<a class="btn2" href="decision.html">Compare quotes in Decision</a>` : ''}</div>`;
  }
  if (st === 'none' || st === 'plain') return `<div class="stm"><div class="sh1">${esc(label(id))}</div><div class="tags"><span class="tg">Not in this round's claim analysis</span></div></div>`;
  const flow = edges.filter(e => e.a === id).reduce((a, e) => a + e.w, 0), smelter = col0(id);
  const conf = confidence(id), ag = cid && AGENT_REC[cid], o = cid && OPTIONS[cid], cs = cid && claimState(cid);
  const tags = [[st === 'ok' ? 'Verified' : st === 'dec' ? 'Decided this round' : st === 'unk' ? "Can't test yet" : 'Unverified', st === 'ok' || st === 'dec' ? 'ok' : 'warn'], conf && [`Confidence: ${conf[0]}`, conf[0] === 'Low' ? 'warn' : conf[0] === 'High' ? 'ok' : ''],
    [`${parts.length} part${parts.length === 1 ? '' : 's'}`, ''], [`${smelter ? '≤ ' : ''}${flow.toFixed(1)} kg Al`, ''],
    st === 'chg' && ['Could change 1 decision', 'risk'], st === 'noeff' && ['No effect on decision', '']].filter(Boolean);
  return `<div class="stm"><div class="sh1">${esc(nm(c.supplier))} · ${KIND[c.kind]}</div>
    <div class="tags">${tags.map(([t, k]) => `<span class="tg ${k}">${t}</span>`).join('')}</div>
    ${conf ? `<div class="sub cf">${esc(conf[1])}${c.supplier !== id ? ` · origin link to ${esc(nm(c.supplier))} unproven` : ''}</div>` : ''}
    ${st !== 'ok' && ag ? `<div class="nx2"><span class="k">Next step</span><b>${esc(ag.t)}</b><span class="sub">${cs.col === 'review' || cs.col === 'action' ? (o.cost != null ? `£${o.cost.toLocaleString('en-GB')}` : 'Cost open') + (o.days != null ? ` · about ${o.days} days` : '') : esc(cs.text)}</span></div>
      <a class="btn" href="review.html#${cid}">Review in Evidence</a>` : ''}${id === 'Smelter_X' ? leverage() : ''}</div>`;
}
// Smelter X as a shared upstream source: what it reaches, and the gates an assessment must pass first. No combined score.
function leverage() {
  const ps = paths(), t1 = new Set(ps.map(p => p.t1)), parts = new Set(ps.map(p => p.part));
  return `<div class="lev"><div class="k">Shared upstream source</div>
    <div class="levn"><div><b>${t1.size}</b><span>Tier 1 quotes</span></div><div><b>${parts.size}</b><span>parts</span></div><div><b>${ps.length}</b><span>Tier 2 paths</span></div></div>
    ${gates().map(g => `<div class="gate ${g.ok ? 'ok' : ''}"><i>${g.ok ? '✓' : ''}</i><span><b>${g.k}</b>${esc(g.t)}</span></div>`).join('')}
    <a class="btn2" href="collaborate.html#upstream">Explore collaboration</a></div>`;
}
const col0 = id => id.startsWith('Smelter') || id === 'EU_mix';
export function overview() {
  // verified claims drop out of this round's list
  const ids = ['Smelter_X', 'Supplier_B', 'Supplier_K', 'Supplier_C', 'Supplier_J'].filter(id => status(id) !== 'ok');
  const chg = ids.filter(id => status(id) === 'chg').length;
  return `<div class="stm"><div class="sh1">${chg ? `${chg} open claim${chg === 1 ? '' : 's'} could change a sourcing decision.` : 'No open claim could change a decision.'}</div>
    ${ids.map(id => { const c = CLAIMS[claimOf(id)], s = status(id); return `<button class="sl" data-cn="${id}"><span><b>${esc(nm(id))}</b> · ${KIND[c.kind]}<br><span class="sub">${esc(claimState(c.claim_id).text)}</span></span><span class="tag ${EFFECT[s][1]}">${EFFECT[s][0]}</span></button>`; }).join('')}
    </div>`;
}


// ---------- the AI-suggested link: Smelter X -> Supplier L (a contracted Tier 2 of Tier 1 E with no named smelter) ----------
function aiLayer(X, y, yL, sel, fresh) {
  const L = link(), ok = L.status === 'confirmed', live = linkOn() || ok;
  const x0 = X[0] + 4, x1 = X[1] - 4, ys = y.Smelter_X, m = (x0 + x1) / 2, x2 = X[1] + 4, x3 = X[2] - 4, yt = y.Tier1_E, yd = y.Tier1_D, m2 = (x2 + x3) / 2;
  const d = `M${x0},${ys} C${m},${ys} ${m},${yL} ${x1},${yL}`;
  const known = `<path class="aik" d="M${x2},${yL} C${m2},${yL} ${m2},${yt} ${x3},${yt}"/>${yd != null ? `<path class="aik" d="M${x2},${yL} C${m2},${yL} ${m2},${yd} ${x3},${yd}"/>` : ''}`;
  // before the suggestion: Supplier L is a known Tier 2 of Tier 1 D and E with no named source
  if (!live) return `<g class="ai off">${known}<path class="aiu" d="M${X[0] + 30},${yL} L${x1},${yL}"/>
    <g class="nd ain" data-cn="Supplier_L" tabindex="0" role="button" aria-label="Supplier L, source unknown"><circle cx="${X[1]}" cy="${yL}" r="4.5"/>
      <text x="${X[1] + 9}" y="${yL + 3.5}">Supplier L</text><text class="nt" x="${X[1] + 9}" y="${yL + 15}">source unknown</text></g></g>`;
  const bx = (x0 + x1) / 2, by = (ys + yL) / 2, focus = sel === 'Supplier_L', dim = sel && !focus && sel !== 'Smelter_X' ? ' dim' : '';
  const sub = ok ? 'link confirmed' : L.status === 'suggested' ? 'suggested · ' + LINK.score.toFixed(2) : linkText().toLowerCase();
  return `<g class="ai${ok ? ' cf' : ''}${fresh ? ' fresh' : ''}${dim}${focus ? ' on' : ''}">
    ${known}
    <path class="aip" d="${d}"/>
    ${fresh ? `<circle class="aid" r="3"><animateMotion dur="1.1s" fill="freeze" path="${d}"/></circle>` : ''}
    <g class="nd ain" data-cn="Supplier_L" tabindex="0" role="button" aria-label="Supplier L, ${ok ? 'confirmed' : 'suggested'} link"><circle class="halo" cx="${X[1]}" cy="${yL}" r="9"/><circle cx="${X[1]}" cy="${yL}" r="4.5"/>
      <text x="${X[1] + 9}" y="${yL + 3.5}">Supplier L</text><text class="nt" x="${X[1] + 9}" y="${yL + 15}">${esc(sub)}</text></g>
    ${ok ? '' : `<g class="aib" data-cn="Supplier_L" role="button" aria-label="Why this link"><circle cx="${bx}" cy="${by}" r="7.5"/><text x="${bx}" y="${by + 3.6}">✦</text></g>`}</g>`;
}
const li = a => `<ul class="lst">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const sigs = () => `<div class="sigs">${LINK.signals.map(([k, v, s]) => `<div class="sig"><b>${k}</b><span>${v}</span><em>${s}</em></div>`).join('')}</div>`;
export function aiStatement() {
  const L = link(), st = L.status, head = `<div class="sh1">Smelter X → Supplier L</div>`;
  const tags = (...t) => `<div class="tags">${t.map(([x, k]) => `<span class="tg ${k || ''}">${x}</span>`).join('')}</div>`;
  if (st === 'suggested') return `<div class="stm">${head}${tags(['✦ AI suggested', 'aitg'], ['Not confirmed'], [`Match ${LINK.score.toFixed(2)}`])}${sigs()}
    <div class="sub cf">Supplier L already supplies Tier 1 D and Tier 1 E. If confirmed, Smelter X reaches both through it. Until then it stays out of every calculation.</div>
    <a class="ailink" href="ai.html">How the AI reads documents →</a>
    <div class="aiact"><button class="btn" data-ai="draft">Ask Supplier L to confirm</button><button class="btn2" data-ai="dismiss">Dismiss</button></div></div>`;
  if (st === 'draft') return `<div class="stm">${head}${tags(['Request draft', 'warn'], ['To Supplier L via Tier 1 E'])}
    <div class="ltr"><div class="k">We ask for</div>${li(SHARE)}<div class="k">Stays private</div>${li(PRIVATE)}<div class="k">JLR commits</div>${li(COMMIT)}</div>
    <div class="aiact"><button class="btn" data-ai="send">Approve and send</button><button class="btn2" data-ai="back">Cancel</button></div></div>`;
  if (st === 'sent') return `<div class="stm">${head}${tags([L.wait ? 'Cannot share yet' : 'Waiting on Supplier L', 'warn'], [`Due ${L.due}`], ['Via Tier 1 E'])}
    <div class="sub cf">${L.wait ? `Supplier L wrote: “${esc(L.note || 'Needs approval from our customer first.')}” A person at JLR follows up. No penalty.` : 'Tier 1 E forwarded the request. Supplier L answers in its portal; Tier 1 E sees the status only.'}</div>
    <div class="aiact"><a class="btn2" href="portal.html#supplier-l">Open Supplier L's portal</a></div></div>`;
  if (st === 'responded') return `<div class="stm">${head}${tags(['Document in', 'warn'], [ROUTES[L.route][0]])}
    <div class="doc1"><b>${LINK_DOC.file}</b><span>${L.route === 'B' ? 'Checked by an independent verifier · JLR sees the result' : LINK_DOC.note}</span></div>
    <div class="chks">${LINK_DOC.checks.map(c => `<div><i>✓</i>${c}</div>`).join('')}</div>
    <div class="aiact"><button class="btn" data-ai="accept">Accept link</button><button class="btn2" data-ai="reject">Reject</button></div></div>`;
  if (st === 'confirmed') return `<div class="stm">${head}${tags(['Confirmed', 'ok'], ['Evidence on file to 2029-11-14'])}
    <div class="sub cf">Smelter X now reaches three Tier 1 quotes. The smelter statement already requested covers Supplier L too, so no second request.</div>
    <div class="aiact"><a class="btn" href="collaborate.html#upstream">Explore collaboration</a></div></div>`;
  const known = `<div class="sub cf">Supplier L supplies A356 casting alloy to Tier 1 D and Tier 1 E for the rear cover. No record names its smelter.</div>`;
  if (st === 'hidden') return `<div class="stm"><div class="sh1">Supplier L · Tier 2 processor</div>${tags(['Source unknown'])}${known}
    <div class="aiact"><button class="btn2" data-ai="find"><span class="aisym">✦</span> Find its likely source</button></div></div>`;
  if (st === 'dismissed') return `<div class="stm"><div class="sh1">Supplier L · Tier 2 processor</div>${tags(['Source unknown'], ['Suggestion dismissed'])}${known}</div>`;
  return `<div class="stm">${head}${tags(['Closed'])}<div class="sub cf">${L.route === 'C' ? 'Supplier L says Smelter X is not its source. The suggestion is closed and nothing changes.' : 'The document did not support the link. It stays out of every calculation.'}</div></div>`;
}
