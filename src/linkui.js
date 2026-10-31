// Shared controls for the AI-suggested link: the "Find new links" chip and the card's buttons. Used by Sourcing and Network.
import {link, linkOn, linkActions} from './links.js';
import {toast} from './ui.js';

export const linkChip = scanning => linkOn()
  ? `<button class="aichip on" data-cn="Supplier_L"><span class="aisym">✦</span> ${link().status === 'confirmed' ? '1 link confirmed' : '1 suggested link'}</button>`
  : `<button class="aichip${scanning ? ' scan' : ''}" id="aiFind"${scanning ? ' disabled' : ''}><span class="aisym">✦</span> ${scanning ? 'Reading 214 documents' : 'Find new links'}</button>`;

const MSG = {find: 'Agent suggests Smelter X as the source', send: 'Sent to Supplier L via Tier 1 E', accept: 'Link confirmed · written back to the network', reject: 'Link rejected · stays out of every calculation', dismiss: 'Suggestion dismissed'};
export function bindLinkActions(el, after) {
  el.querySelectorAll('[data-ai]').forEach(b => (b.onclick = e => { e.stopPropagation(); const k = b.dataset.ai;
    ({find: linkActions.reveal, draft: linkActions.draft, back: linkActions.undraft, send: linkActions.send, dismiss: linkActions.dismiss, accept: () => linkActions.review(true), reject: () => linkActions.review(false)})[k]();
    if (MSG[k]) toast(MSG[k]); after?.(k); }));
}
// run the discovery animation once, then reveal the suggestion
export function findLinks(setScan, done, RM) {
  setScan(true);
  setTimeout(() => { setScan(false); linkActions.reveal(); done(); }, RM ? 0 : 1600);
}
