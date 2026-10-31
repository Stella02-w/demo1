// Network: one joint parts + supplier network drawn as rings around the vehicle.
// Centre = vehicle, then parts, Tier 1 part makers, Tier 2 processors, Tier 3 smelters.
// The side panel lists the nodes worth watching; clicking a node shows how its impact travels downstream.
// Line style = relationship status. Amber = the impact path of the selected node.
import './drawer.js';
import {$, esc, mountNav, mountContext} from './ui.js';
import {flow, claimState, CLAIMS} from './v2.js';
import {PCF_RECORDS} from './data.js';
import {aiStatement, claimOf, status} from './chain.js';
import {link, linkOn, linkText} from './links.js';
import {linkChip, bindLinkActions, findLinks} from './linkui.js';
import {net, nm, tierOf, ORG, ST} from './netdata.js';
import {SOURCES} from './scenarios.js';

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ui = {tab: 'decision', sel: location.hash.slice(1) || null, scan: false, fresh: false, run: 0};

// ---------- graph ----------
// the whole aluminium round plus part → vehicle edges, so impact can travel all the way to the car
function G() {
  const {edges, nodes} = net(null), E = [...edges];
  for (const p of nodes.filter(n => n.startsWith('part:'))) E.push({a: p, b: 'car', w: 1, st: 'confirmed'});
  return {edges: E, nodes: [...nodes, 'car']};
}
const ring = id => id === 'car' ? 0 : id.startsWith('part:') ? 1 : id.startsWith('Tier1_') ? 2 : id.startsWith('Supplier') ? 3 : 4;
const R = [0, 86, 170, 262, 352], CX = 480, CY = 396, VW = 960, VH = 792;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const cmean = as => deg(Math.atan2(as.reduce((s, a) => s + Math.sin(rad(a)), 0), as.reduce((s, a) => s + Math.cos(rad(a)), 0)));
const norm = a => ((a % 360) + 360) % 360;

function layout(edges, nodes) {
  const ang = {car: 0}, of = r => nodes.filter(n => ring(n) === r);
  // Tier 1 order keeps shared suppliers close: B next to D (Smelter X), E next to A and C (Smelter EU), D next to E (Supplier L)
  const T1 = ['Tier1_B', 'Tier1_D', 'Tier1_E', 'Tier1_A', 'Tier1_C'], t1 = of(2).sort((a, b) => T1.indexOf(a) - T1.indexOf(b));
  t1.forEach((t, i) => (ang[t] = 0 + i * 360 / t1.length));
  for (const p of of(1)) ang[p] = cmean(edges.filter(e => e.b === p).map(e => ang[e.a]));
  // processors: ordered by where they deliver, then spread evenly round the ring
  const t2 = of(3).map(s => [s, cmean(edges.filter(e => e.a === s && ring(e.b) === 2).map(e => ang[e.b]))]).sort((a, b) => norm(a[1]) - norm(b[1]));
  const step = 360 / t2.length, off = cmean(t2.map(([, a], i) => a - i * step));
  t2.forEach(([s], i) => (ang[s] = off + i * step));
  // smelters: at the mean of their processors, kept at least 44° apart
  const sm = of(4).map(s => [s, cmean(edges.filter(e => e.a === s).map(e => ang[e.b]))]).sort((a, b) => norm(a[1]) - norm(b[1]));
  for (let k = 0; k < 4; k++) for (let i = 0; i < sm.length; i++) { const a = sm[i], b = sm[(i + 1) % sm.length], gap = norm(b[1] - a[1]);
    if (gap < 44) { const push = (44 - gap) / 2; a[1] -= push; b[1] += push; } }
  sm.forEach(([s, a]) => (ang[s] = a));
  // ring labels go in the widest empty sector of the outer rings
  const outer = nodes.filter(n => ring(n) >= 2).map(n => norm(ang[n])).sort((a, b) => a - b);
  let gap = 0, la = -90; outer.forEach((a, i) => { const b = i + 1 < outer.length ? outer[i + 1] : outer[0] + 360; if (b - a > gap) { gap = b - a; la = (a + b) / 2; } });
  const pos = {la}; for (const n of nodes) { const r = R[ring(n)], a = rad(ang[n]); pos[n] = [CX + r * Math.cos(a), CY + r * Math.sin(a), ang[n]]; }
  return pos;
}
const pt = (r, a) => [CX + r * Math.cos(rad(a)), CY + r * Math.sin(rad(a))];
// curves bend at the mid radius, so links follow the rings instead of cutting across them
function curve(pos, a, b) {
  // the AI candidate arcs outside the smelter ring, so it never runs over other processors
  const [x1, y1, a1] = pos[a], [x2, y2, a2] = pos[b], rm = a === 'Smelter_X' && b === 'Supplier_L' ? R[4] + 40 : (R[ring(a)] + R[ring(b)]) / 2;
  const [c1x, c1y] = pt(rm, a1), [c2x, c2y] = pt(rm, a2);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}
// breadth-first walk with depth: dir 1 = downstream towards the vehicle, -1 = upstream towards the smelter
function walk(edges, id, dir) {
  const depth = new Map(), q = [[id, 0]];
  while (q.length) { const [n, d] = q.shift(); for (const e of edges) { const [f, t] = dir > 0 ? [e.a, e.b] : [e.b, e.a]; if (f === n && t && !depth.has(t) && t !== id) { depth.set(t, d + 1); q.push([t, d + 1]); } } }
  return depth;
}
const short = id => id === 'car' ? 'Range Rover Sport' : nm(id).replace('Front suspension bracket', 'Bracket');
const list = a => { const s = a.map(short); return s.length < 2 ? s.join('') : s.slice(0, -1).join(', ') + ' and ' + s.at(-1); };
const letters = ids => ids.map(i => i.slice(-1)).join(', ');

// ---------- rules ----------
// which collaboration network a node belongs to (Collaborate page), by its shared smelter
function nets(edges, id) {
  const up = [...walk(edges, id, -1).keys(), id], dn = [...walk(edges, id, 1).keys(), id];
  return Object.keys(SOURCES).filter(s => up.includes(s) || dn.includes(s));
}
const REC = s => PCF_RECORDS.find(r => r.supplier === s);
const xVer = () => claimState('CL-X-PCF').basis === 'verified';
const srcOf = (edges, id) => edges.find(e => e.b === id && (!e.a || ring(e.a) === 4));

// the nodes worth watching, in three tabs
function attention(edges, nodes) {
  const t1s = id => [...walk(edges, id, 1).keys()].filter(n => ring(n) === 2);
  const decision = nodes.filter(n => n !== 'car' && status(n) === 'chg').sort((a, b) => ring(b) - ring(a));
  const unverified = nodes.filter(n => ring(n) === 3 && edges.some(e => e.b === n && e.st !== 'confirmed'));
  const hubs = nodes.filter(n => ring(n) >= 3 && t1s(n).length >= 2).sort((a, b) => ring(b) - ring(a) || t1s(b).length - t1s(a).length);
  return {
    decision: {t: 'Affects a decision', d: 'Its value could change which quote wins.', ids: decision,
      line: n => ring(n) === 4 ? `Self-declared value behind ${t1s(n).length} Tier 1 quotes` : CLAIMS[claimOf(n)]?.supplier === n ? '2022 self-declared share · decides the bracket ranking' : `Rests on the ${nm(CLAIMS[claimOf(n)]?.supplier)} claim`},
    unverified: {t: 'Unverified source', d: 'Its smelter is declared, suggested or missing.', ids: unverified,
      line: n => { const e = srcOf(edges, n); return !e || !e.a ? (n === 'Supplier_L' && link().status === 'hidden' ? 'No smelter named · the agent can look' : 'No smelter named in any record') : `${nm(e.a)} · ${ST[e.st][0].toLowerCase()}`; }},
    hubs: {t: 'Shared hubs', d: 'One company behind several Tier 1 quotes.', ids: hubs,
      line: n => { const s = SOURCES[n]; return `Reaches Tier 1 ${letters(t1s(n))}${s ? ` · ${s.type === 'upstream' ? 'upstream' : 'joint'} network` : ''}`; }}
  };
}

// what one node touches: computed by rules from the network; the sentence on top explains it in words
function impact(edges, id) {
  const down = walk(edges, id, 1), up = walk(edges, id, -1), r = ring(id);
  const at = (m, k) => [...m.keys()].filter(n => ring(n) === k);
  const t2 = r === 3 ? [id] : r > 3 ? at(down, 3) : at(up, 3), t1 = r === 2 ? [id] : r > 2 ? at(down, 2) : at(up, 2);
  const parts = r === 1 ? [id] : r > 1 ? at(down, 1) : at(up, 1), sm = r === 4 ? [id] : at(up, 4);
  const st = status(id), c = CLAIMS[claimOf(id)], rec = REC(id);
  const partTxt = parts.length > 1 ? 'both parts' : `the ${short(parts[0] || '').toLowerCase()}`;
  // Data: which numbers carry this node's value, and how good that value is
  let data, note;
  if (r === 4) { data = `Its primary aluminium value sits inside ${t2.length} processor footprint${t2.length > 1 ? 's' : ''} and ${t1.length} Tier 1 quote${t1.length > 1 ? 's' : ''} for ${partTxt}.`;
    note = id === 'Smelter_X' ? (xVer() ? 'Verified · 10.1 kgCO₂e/kg' : 'Self-declared · no smelter statement') : 'Verified value on file'; }
  else if (r === 3) { const e = srcOf(edges, id);
    data = `Its footprint feeds the Tier 1 ${letters(t1)} quote${t1.length > 1 ? 's' : ''} for ${partTxt}${e?.a ? `, and carries the ${nm(e.a)} value with it` : ''}.`;
    note = rec ? `${rec.verified ? 'Verified' : 'Self-declared'} · ${rec.reference_year} · quality ${rec.dqr}/5` : e?.st === 'ai' ? 'Source is an AI candidate' : 'No PCF record, no named source'; }
  else if (r === 2) { data = `Its quote combines ${t2.length} processor${t2.length > 1 ? 's' : ''} (${list(t2)}) and ${sm.length} smelter${sm.length > 1 ? 's' : ''}.`; note = 'Q4-26 quote breakdown'; }
  else if (r === 1) { data = `Its footprint is built from ${t1.length} Tier 1 quotes, ${t2.length} processors and ${sm.length} smelters.`; note = ORG[id][1]; }
  else { data = `Two aluminium parts, ${t1.length} Tier 1 quotes, ${t2.length} processors and ${sm.length} smelters.`; note = 'Q4-26 aluminium round'; }
  // Decision: does this node, or anything upstream of it, change a ranking
  const openUp = [...up.keys(), id].filter(n => n !== 'car' && status(n) === 'chg').sort((a, b) => ring(b) - ring(a));
  let dec;
  if (r >= 3) dec = st === 'chg' ? ['Could change decision', 'rev', c?.supplier === id ? 'If its value does not hold, the bracket quotes rank differently.' : `Shares the ${nm(c.supplier)} claim. If that does not hold, the bracket ranking changes.`]
    : st === 'noeff' ? ['No effect', 'mut', 'Even if its value is off, the quote ranking stays the same.']
    : st === 'unk' ? ["Can't test yet", 'info', 'Not enough data to test its effect. Ask for the method first.']
    : st === 'none' ? ['Unknown', 'info', id === 'Supplier_L' && linkOn() ? 'Its source is only suggested, so the effect is tested once the link is confirmed.' : 'No source is named, so its effect cannot be tested yet.']
    : ['Settled', 'ok', 'Verified. It has no open effect on the decision.'];
  else dec = openUp.length ? ['Could change decision', 'rev', `${openUp.length} upstream value${openUp.length > 1 ? 's' : ''} could change this ranking: ${list(openUp)}.`] : ['Settled', 'ok', 'Every value behind it is verified or has no effect.'];
  // Collaboration: which shared network it belongs to
  const ns = nets(edges, id).map(s => ({s, ...SOURCES[s]}));
  // the AI sentence: one line on how the impact crosses relationships
  const cross = t1.length > 1 && parts.length > 1;
  const SAY = {
    Smelter_X: `One ${xVer() ? 'verified' : 'self-declared'} value at Smelter X travels through ${t2.length} processors into ${t1.length} Tier 1 quotes on ${partTxt}. Verifying it once settles all of them.`,
    Smelter_EU: `Smelter EU is verified and reaches ${t1.length} Tier 1 quotes through ${list(t2)}. Low risk, so it is a good base for joint work.`,
    Supplier_B: 'Supplier B carries the Smelter X value into the Tier 1 B quote. It is the one path where that value changes the bracket decision.',
    Supplier_L: linkOn() || link().status === 'confirmed' ? 'Supplier L links one suggested smelter to two Tier 1 quotes. If Smelter X is confirmed, the rear cover inherits its open value.' : 'Supplier L feeds two Tier 1 quotes with metal from an unnamed smelter. Its footprint cannot be checked until the source is known.'
  };
  const say = SAY[id] || (r >= 3 ? `${short(id)} reaches ${t1.length} Tier 1 quote${t1.length > 1 ? 's' : ''}${cross ? ' across both parts' : ''}${st === 'chg' ? ', and its value is still open' : ''}.${cross ? ' A change here moves more than one part at once.' : ''}`
    : r === 2 ? `${short(id)}'s quote is only as good as the ${t2.length} processors behind it${openUp.length ? `; ${list(openUp)} still ${openUp.length > 1 ? 'have' : 'has'} open values` : ''}.`
    : `${short(id)} collects every value upstream. ${openUp.length ? `${openUp.length} of them can still change a ranking.` : 'All of them are settled.'}`);
  return {down, up, t2, t1, parts, sm, data, note, dec, ns, say};
}

// ---------- map ----------
function map(edges, nodes, pos, I, watch) {
  const sel = ui.sel, cls = {confirmed: 'c', declared: 'dl', ai: 'ai', unknown: 'un'};
  const on = I ? new Set([sel, ...I.down.keys()]) : null, upN = I ? new Set(I.up.keys()) : null;
  const ringT = ['', 'Parts', 'Tier 1 · part makers', 'Tier 2 · processors', 'Tier 3 · smelters'];
  const rings = R.slice(1).map((r, i) => { const [x, y] = pt(r, pos.la); return `<circle class="rg" cx="${CX}" cy="${CY}" r="${r}"/><text class="rl" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${ringT[i + 1]}</text>`; }).join('');
  const es = edges.map(e => {
    if (!e.a) { const [x, y, a] = pos[e.b], [x2, y2] = pt(R[3] + 40, a); return `<path class="ed un${I && !on.has(e.b) && !upN.has(e.b) && e.b !== sel ? ' d' : ''}" d="M${x.toFixed(1)},${y.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}"/><text class="q" x="${(x2 + 8 * Math.cos(rad(a))).toFixed(1)}" y="${(y2 + 8 * Math.sin(rad(a)) + 4).toFixed(1)}" text-anchor="middle">?</text>`; }
    const dn = I && (e.a === sel || on.has(e.a)) && on.has(e.b), u = I && (upN.has(e.a) || e.a === sel) && (upN.has(e.b) || e.b === sel) && !dn;
    const depth = dn ? (e.a === sel ? 0 : I.down.get(e.a)) : 0, d = curve(pos, e.a, e.b), w = e.b === 'car' ? 1.4 : Math.min(3.6, 1.1 + e.w * .22);
    return `<path class="ed ${cls[e.st]}${I && !dn && !u ? ' d' : ''}${dn ? ' fl' : ''}${e.st === 'ai' && ui.fresh ? ' fresh' : ''}" d="${d}" style="stroke-width:${w.toFixed(2)}"/>`
      + (dn && !RM ? `<path class="pl" pathLength="1" d="${d}" style="animation-delay:${(depth * .45).toFixed(2)}s"/>` : '');
  }).join('');
  const ai = edges.find(e => e.st === 'ai'), aiB = ai ? (() => { const n = curve(pos, 'Smelter_X', 'Supplier_L').match(/-?[\d.]+/g).map(Number), x = (n[0] + 3 * n[2] + 3 * n[4] + n[6]) / 8, y = (n[1] + 3 * n[3] + 3 * n[5] + n[7]) / 8; return `<g class="aib" data-n="Supplier_L"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">✦</text></g>`; })() : '';
  const lab = id => { const [x, y, a] = pos[id], c = Math.cos(rad(a)), s = Math.sin(rad(a)), r = ring(id), o = r === 1 ? 15 : 13;
    const anc = c > .35 ? 'start' : c < -.35 ? 'end' : 'middle', lx = x + c * o, ly = y + s * o + (Math.abs(c) <= .35 ? (s > 0 ? 10 : -2) : 4);
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anc}">${esc(short(id))}</text>`; };
  const ns = nodes.filter(n => n !== 'car').map(id => { const [x, y] = pos[id], r = ring(id), depth = on?.has(id) ? I.down.get(id) || 0 : 0;
    const c = I ? (id === sel ? ' sel' : on.has(id) ? ' f' : upN.has(id) ? ' u' : ' d') : watch.has(id) ? ' w' : '';
    const ai = id === 'Supplier_L' && linkOn() && link().status !== 'confirmed' ? ' aiN' : '';
    const halo = (watch.has(id) && !I) || (I && on.has(id) && id !== sel && !RM);
    return `<g class="nd r${r}${c}${ai}" data-n="${id}" tabindex="0" role="button" aria-label="${esc(nm(id))}">
      ${halo ? `<circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r === 1 ? 14 : 11}" style="animation-delay:${(depth * .45).toFixed(2)}s"/>` : ''}
      <circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r === 1 ? 8 : r === 4 ? 7 : 5.5}"/>${lab(id)}</g>`; }).join('');
  const car = `<g class="nd car${I ? (sel === 'car' ? ' sel' : on.has('car') ? ' f' : ' d') : ''}" data-n="car" tabindex="0" role="button" aria-label="Range Rover Sport">
    ${I && on.has('car') && !RM ? `<circle class="halo" cx="${CX}" cy="${CY}" r="40" style="animation-delay:${((I.down.get('car') || 0) * .45).toFixed(2)}s"/>` : ''}<circle class="hub" cx="${CX}" cy="${CY}" r="34"/>
    <text class="c1" x="${CX}" y="${CY - 1}" text-anchor="middle">Range Rover</text><text class="c2" x="${CX}" y="${CY + 13}" text-anchor="middle">Sport</text></g>`;
  return `<svg class="rmap" viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Joint parts and supplier network around the Range Rover Sport" data-run="${ui.run}">${rings}${es}${aiB}${car}${ns}</svg>`;
}

// ---------- side panel ----------
function listPanel(A) {
  const T = A[ui.tab], tier = n => ({1: 'Part', 2: 'Tier 1', 3: 'Tier 2', 4: 'Tier 3'})[ring(n)];
  const L = link().status, lc = linkOn() && L !== 'confirmed' ? `<button class="aic" data-n="Supplier_L"><span class="aisym">✦</span><span><b>AI suggests Smelter X → Supplier L</b><em>${esc(linkText())} · confirming it settles the first gate condition of the Smelter X offtake plan</em></span></button>` : '';
  return `${lc}<div class="k">Nodes to watch</div>
    <div class="seg itab">${Object.entries(A).map(([k, v]) => `<button class="chip${ui.tab === k ? ' on' : ''}" data-tab="${k}">${v.t} <em>${v.ids.length}</em></button>`).join('')}</div>
    <p class="td">${T.d}</p>
    <div class="irs">${T.ids.map(n => `<button class="ir" data-n="${n}"><i>${tier(n)}</i><b>${esc(nm(n))}</b><span>${esc(T.line(n))}</span></button>`).join('') || '<p class="td">Nothing here this round.</p>'}</div>
    <p class="hint">Select any company on the map to see where its impact travels.</p>`;
}
function impactPanel(edges, id, I) {
  const role = id === 'car' ? 'JLR vehicle' : ORG[id]?.[1] || '', tier = id === 'car' ? 'Vehicle' : tierOf(id);
  const up = edges.filter(e => e.b === id && e.a), sts = [...new Set([...up, ...edges.filter(e => e.a === id && e.b !== 'car')].map(e => e.st))];
  // the chain: how many companies sit at each level the impact reaches
  const lv = [[I.t2.length, I.t2.length > 1 ? 'processors' : 'processor', 3], [I.t1.length, I.t1.length > 1 ? 'Tier 1 quotes' : 'Tier 1 quote', 2], [I.parts.length, I.parts.length > 1 ? 'parts' : 'part', 1], [1, 'vehicle', 0]].filter(([, , k]) => k < ring(id));
  const chain = lv.length ? `<div class="tr"><span class="me">${esc(short(id))}</span>${lv.map(([n, t], i) => `<i>→</i><span style="--i:${i + 1}"><b>${n}</b> ${t}</span>`).join('')}</div>` : '';
  const col = I.ns.length ? I.ns.map(n => `<div class="cl"><span class="ty ${n.type}">${n.type === 'upstream' ? 'Upstream collaboration' : 'Joint collaboration'} · ${esc(n.name)}</span>
      <p>${n.type === 'upstream' ? `Buyers of ${n.name} could work with the smelter itself.` : `Processors under ${n.name} could move together.`} Reaches ${n.reach}.</p>
      <a class="go" href="collaborate.html#${n.type}">Open in Collaborate →</a></div>`).join('')
    : '<p>Not part of a shared network this round.</p>';
  const cid = id === 'car' ? null : claimOf(id), open = cid && claimState(cid).basis !== 'verified' && status(id) !== 'ok';
  const lFind = id === 'Supplier_L' && link().status === 'hidden';
  const gateL = id === 'Supplier_L' && link().status !== 'confirmed' ? `<div class="gl2"><span class="k">Why it matters</span><p>The Smelter X joint ingot plan is paused at its first gate condition: supply relationships not confirmed. ${linkOn() ? 'If Supplier L confirms this link, it adds a third buyer and Tier 1 E.' : 'The agent can check whether Supplier L also buys from Smelter X.'}</p><a class="go" href="collaborate.html#plan-sourcing">See the gate →</a></div>` : '';
  return `<button class="bk" data-back>← Nodes to watch</button>
    <div class="pf"><div class="k">${tier}${role ? ' · ' + esc(role) : ''}</div><h3>${esc(id === 'car' ? 'Range Rover Sport' : nm(id))}</h3>
    ${sts.length ? `<div class="tags">${sts.map(s => `<span class="tg s-${s}">${ST[s][0]}</span>`).join('')}</div>` : ''}
    <p class="say"><span class="aisym">✦</span><span>${esc(I.say)}</span></p>${gateL}
    ${chain}
    <div class="imp">
      <div class="ib"><div class="il"><b>Data</b><span>${esc(I.note)}</span></div><p>${esc(I.data)}</p></div>
      <div class="ib"><div class="il"><b>Decision</b><span class="dt t-${I.dec[1]}">${I.dec[0]}</span></div><p>${esc(I.dec[2])}</p></div>
      <div class="ib"><div class="il"><b>Collaboration</b></div>${col}</div>
    </div>
    <p class="fine">Computed by rules from the links, claims and quotes in this round. The ✦ sentence is AI-written from the same result.</p>
    ${open || lFind ? `<div class="acts">${open ? `<a class="btn" href="review.html#${cid}">Review in Evidence</a>` : ''}${lFind ? '<button class="btn2" data-ai="find">✦ Find its likely source</button>' : ''}</div>` : ''}</div>
    ${id === 'Supplier_L' && linkOn() ? `<div class="lst">${aiStatement()}</div>` : ''}`;
}

// ---------- page ----------
function render() {
  const {edges, nodes} = G(), pos = layout(edges, nodes), A = attention(edges, nodes);
  if (ui.sel && !nodes.includes(ui.sel)) ui.sel = null;
  const I = ui.sel ? impact(edges, ui.sel) : null, watch = new Set(ui.sel ? [] : A[ui.tab].ids);
  $('#cv').innerHTML = `<div class="cvh"><div><h2>Range Rover Sport · aluminium supply network</h2><p class="sub">2 parts · ${nodes.filter(n => ring(n) === 2).length} part makers · ${nodes.filter(n => ring(n) === 3).length} processors · ${nodes.filter(n => ring(n) === 4).length} smelters · Q4-26 round</p></div>${linkOn() ? linkChip(ui.scan) : ""}</div>
    <div class="mw">${map(edges, nodes, pos, I, watch)}</div>
    <div class="lgd">${[['c', 'Confirmed'], ['dl', 'Declared'], ['ai', 'AI candidate'], ['un', 'Unknown source']].map(([c, t]) => `<span><svg class="gl" viewBox="0 0 26 8"><line class="${c}" x1="1" y1="4" x2="25" y2="4"/></svg>${t}</span>`).join('')}
      <span><i class="fo"></i>${I ? 'Impact path' : 'To watch'}</span></div>`;
  $('#panel').innerHTML = ui.sel ? impactPanel(edges, ui.sel, I) : listPanel(A);
  bind();
}
const setHash = () => history.replaceState(null, '', location.pathname + location.search + (ui.sel ? '#' + ui.sel : ''));
function pick(id) { ui.sel = id; ui.run++; setHash(); render(); }
function bind() {
  const all = s => document.querySelectorAll(s);
  all('[data-tab]').forEach(b => (b.onclick = () => { ui.tab = b.dataset.tab; render(); }));
  all('[data-n]').forEach(b => { b.onclick = e => { e.stopPropagation(); pick(ui.sel === b.dataset.n ? null : b.dataset.n); };
    b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.onclick(e); } }; });
  $('[data-back]')?.addEventListener('click', () => pick(null));
  $('#aiFind')?.addEventListener('click', () => findLinks(v => { ui.scan = v; if (v) render(); }, () => {
    ui.sel = 'Supplier_L'; ui.fresh = true; render(); setTimeout(() => (ui.fresh = false), 1500); }, RM));
  bindLinkActions($('#panel'), k => { if (k === 'dismiss') ui.sel = null; });
  $('.mw svg').onclick = e => { if (!e.target.closest('[data-n]') && ui.sel) pick(null); };
}
mountNav('network');
mountContext([{t: 'Range Rover Sport', href: 'workbench.html'}, {t: 'Q4-26 Aluminium'}, {t: 'Network'}]);
flow.subscribe(render);
render();
