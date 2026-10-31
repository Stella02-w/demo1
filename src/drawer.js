// Evidence drawer: links to a claim (review.html#...) open in a side panel, so the page you came from stays in place.
const KEY = 'Escape';
export function openDrawer(href, title = 'Evidence') {
  closeDrawer();
  const url = href.replace('review.html', 'review.html?embed=1');
  const d = document.createElement('div'); d.className = 'drw';
  d.innerHTML = `<div class="pane" role="dialog" aria-label="${title}"><div class="bar"><b>${title}</b><span><a href="${href}">Open full page</a><button type="button" data-x>Close</button></span></div><iframe src="${url}" title="${title}"></iframe></div>`;
  document.body.appendChild(d); requestAnimationFrame(() => d.classList.add('on'));
  d.onclick = e => { if (e.target === d || e.target.closest('[data-x]')) closeDrawer(); };
}
export function closeDrawer() { document.querySelectorAll('.drw').forEach(d => d.remove()); }
addEventListener('keydown', e => { if (e.key === KEY) closeDrawer(); });
// one delegated listener: every evidence link on the page opens the drawer
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href^="review.html"]'); if (!a || e.metaKey || e.ctrlKey || a.closest('.drw')) return;
  e.preventDefault(); e.stopPropagation(); openDrawer(a.getAttribute('href'));
}, true);
