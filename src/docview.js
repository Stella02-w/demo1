// Evidence file viewer shared by list pages: the document on the left, what the system read from it on the right.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const CLIP = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 4.5 5.4 9.6a1.5 1.5 0 0 0 2.1 2.1l5.6-5.6a3 3 0 0 0-4.2-4.2L3.2 7.6a4.5 4.5 0 0 0 6.4 6.4l4.4-4.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const FILE = '<svg width="22" height="26" viewBox="0 0 28 34" aria-hidden="true"><path d="M3 1h15l7 7v23a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M18 1v7h7" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="5" y="26" font-size="7" font-weight="700" fill="currentColor">PDF</text></svg>';
const CSS = `.dv{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);display:flex;justify-content:flex-end}
.dv .p{width:min(980px,100%);height:100%;background:var(--bg,#0a0a0b);border-left:1px solid var(--line2);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
.dv header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px max(16px,env(safe-area-inset-right,0px)) 14px 20px;border-bottom:1px solid var(--line)}
.dv header>span{display:flex;align-items:center;gap:10px;min-width:0;color:var(--accent)}.dv header b{color:var(--ink);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dv header button{border:1px solid var(--line2);background:rgba(255,255,255,.06);color:var(--ink);font:inherit;font-size:13px;padding:7px 14px;border-radius:9px;cursor:pointer}
.dv .b{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 300px}
.dv .doc{overflow:auto;background:#1c1c1f;padding:28px;display:flex;flex-direction:column;align-items:center;gap:10px}
.dv .dpg{width:100%;max-width:500px;aspect-ratio:1/1.414;background:#fafaf7;color:#1d1d1f;border-radius:4px;padding:40px 36px;display:flex;flex-direction:column;gap:14px;font-size:12px;line-height:1.6;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.dv .dh{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1d1d1f;padding-bottom:10px}.dv .dh b{font-size:16px}.dv .dh span{font-family:var(--m,monospace);font-size:10.5px;color:#6b6b70}
.dv .dpg p{margin:0}.dv .dpg table{border-collapse:collapse;width:100%}.dv .dpg td{padding:6px 0;border-bottom:1px solid #e3e3df}.dv .dpg td:first-child{color:#6b6b70;width:42%}
.dv .sig{margin-top:auto;display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #d5d5d0;font-size:11px;color:#6b6b70}
.dv aside{overflow:auto;border-left:1px solid var(--line);padding:20px max(16px,env(safe-area-inset-right,0px)) 20px 20px;display:flex;flex-direction:column;gap:2px}
.dv aside .k{margin:10px 0 4px}.dv aside .k:first-child{margin-top:0}
.dv .ck{display:flex;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--line);font-size:12.5px}.dv .ck i{width:15px;height:15px;border-radius:50%;background:var(--teal);color:#0a0a0b;font-style:normal;font-size:9px;font-weight:700;display:grid;place-items:center}
@media (max-width:760px){.dv .b{grid-template-columns:1fr;overflow:auto}.dv .doc,.dv aside{overflow:visible}.dv aside{border-left:0;border-top:1px solid var(--line)}.dv .doc{padding:16px}.dv .dpg{padding:26px 20px;aspect-ratio:auto}}`;
// doc: {file, title, ref, intro, fields: [[k, v]], issuer, issued, pages, checks: [..], status}
export function openDoc(d) {
  if (!document.getElementById('dvcss')) document.head.insertAdjacentHTML('beforeend', `<style id="dvcss">${CSS}</style>`);
  const row = (k, v) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  document.body.insertAdjacentHTML('beforeend', `<div class="dv" id="dv" role="dialog" aria-modal="true" aria-label="${esc(d.file)}"><div class="p">
    <header><span>${FILE}<b>${esc(d.file)}</b></span><button id="dvx">Close</button></header>
    <div class="b"><div class="doc"><div class="dpg"><div class="dh"><b>${esc(d.title)}</b><span>${esc(d.ref)}</span></div><p>${esc(d.intro)}</p>
      <table>${d.fields.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="sig"><span>${esc(d.issuer)}</span><span>Issued ${esc(d.issued)}</span></div></div><div class="sub" style="font-size:11.5px">Page 1 of ${d.pages || 3}</div></div>
      <aside><div class="k">Extracted</div>${d.fields.map(([k, v]) => row(k, v)).join('')}${row('Issuer', d.issuer)}
        <div class="k">Checks</div>${d.checks.map(c => `<div class="ck"><i>✓</i><span>${esc(c)}</span></div>`).join('')}
        <div class="sub" style="margin-top:auto;padding-top:16px">${esc(d.status || '')}</div></aside></div></div></div>`);
  const close = () => { document.getElementById('dv')?.remove(); removeEventListener('keydown', key); }, key = e => e.key === 'Escape' && close();
  document.getElementById('dvx').onclick = close; document.getElementById('dv').onclick = e => { if (e.target.id === 'dv') close(); };
  addEventListener('keydown', key); document.getElementById('dvx').focus();
}
