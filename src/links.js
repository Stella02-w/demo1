// The AI-suggested supply link (Smelter X -> Supplier L) and the Smelter X collaboration opportunity.
// Both live in the shared demo flow state, so every page sees the same status and Reset demo clears them.
// Neither enters a carbon calculation: a link counts only once it is confirmed, and the opportunity is a candidate for assessment.
import {flow, claimState} from './v2.js';

// [Assumption] Demo dates for the link request, after the Smelter X request.
export const LINK_DATES = {sent: '2026-11-03', responded: '2026-11-10', reviewed: '2026-11-11', due: '2026-11-24'};
export const LINK = {from: 'Smelter_X', to: 'Supplier_L', t1: 'Tier1_E', part: 'Rear cover', score: .82,
  signals: [
    ['Customs record', '3 ingot shipments from Smelter X\'s port, Apr–Jun 2026', 'Customs_extract_Q2-2026.csv · rows 118–120'],
    ['Same pattern', 'A356 alloy, as Supplier H and I buy from Smelter X', 'Supplier_L_material_declaration.pdf · p.2'],
    ['Known contracts', 'Supplier L supplies Tier 1 D and Tier 1 E for the rear cover, source not named', 'Tier1_D/E_BOM_rear-cover.xlsx']]};
// What the supplier is asked to share, and what stays private. Shown on the request letter and in the portal.
export const SHARE = ['Yes or no: does your A356 for Tier 1 D and E come from Smelter X?', 'One document that names Smelter X and your company, Apr–Jun 2026', 'Prices may be blacked out'];
export const PRIVATE = ['Your customers, prices and volumes', 'Your other suppliers', 'That you were asked. Other suppliers never see suggested links'];
export const COMMIT = ['Used only for carbon verification. Never used to buy around you or to renegotiate price.', 'Your document goes to JLR directly. Tier 1 E sees the status only.', 'Confirmed evidence is reused for 3 years. We will not ask again.', 'No penalty if you cannot confirm or the link is wrong.'];
export const ROUTES = {
  A: ['Confirm and upload a document', 'A delivery note or mill certificate naming Smelter X'],
  B: ['Confirm, document to a verifier only', 'An independent verifier checks it; JLR sees the result'],
  C: ['Not our source', 'The suggestion is closed. Naming the real source is optional'],
  D: ['Cannot share yet', 'Tell us why. A person at JLR follows up, no penalty']
};
export const LINK_DOC = {file: 'Delivery_note_SmelterX_2026-05.pdf', note: 'Prices blacked out', checks: ['Names Smelter X as producer', 'Names Supplier L as consignee', 'Dated May 2026, inside Apr–Jun 2026', 'Material A356 ingot']};

// status: hidden → suggested → draft → sent → responded → confirmed | rejected; D keeps it 'sent' with a note; dismissed closes it
export const link = () => flow.get().link || {status: 'hidden', events: []};
const setLink = fn => flow.set(s => { s.link ||= {status: 'hidden', events: []}; fn(s.link); });
const ev = (l, on, text) => l.events.push({on, text});
export const linkActions = {
  reveal: () => setLink(l => { if (['hidden', 'dismissed'].includes(l.status)) { l.status = 'suggested'; l.events = [{on: '2026-10-31', text: 'Suggested by the agent from 3 records'}]; } }),
  dismiss: () => setLink(l => { l.status = 'dismissed'; ev(l, '2026-10-31', 'Dismissed by procurement'); }),
  draft: () => setLink(l => { l.status = 'draft'; ev(l, '2026-10-31', 'Confirmation request drafted'); }),
  undraft: () => setLink(l => { l.status = 'suggested'; l.events.pop(); }),
  send: () => setLink(l => { l.status = 'sent'; l.due = LINK_DATES.due; ev(l, LINK_DATES.sent, 'Approved by procurement · forwarded by Tier 1 E'); }),
  respond: (route, note = '') => setLink(l => { l.route = route; l.note = note;
    if (route === 'C') { l.status = 'rejected'; ev(l, LINK_DATES.responded, 'Supplier L: not our source · suggestion closed'); }
    else if (route === 'D') { l.status = 'sent'; l.wait = true; ev(l, LINK_DATES.responded, 'Supplier L cannot share yet · JLR to follow up'); }
    else { l.status = 'responded'; l.wait = false; ev(l, LINK_DATES.responded, route === 'A' ? 'Supplier L confirmed and sent a delivery note' : 'Supplier L confirmed · document sent to verifier'); } }),
  review: ok => setLink(l => { l.status = ok ? 'confirmed' : 'rejected'; ev(l, LINK_DATES.reviewed, ok ? 'Analyst accepted · link confirmed' : 'Analyst rejected the document'); })
};
export const linkOn = () => !['hidden', 'dismissed', 'rejected'].includes(link().status);
export const linkConfirmed = () => link().status === 'confirmed';
export const LINK_TEXT = {suggested: 'Suggested · not confirmed', draft: 'Request drafted · approve to send', sent: 'Waiting on Supplier L', responded: 'Document in · analyst to review', confirmed: 'Confirmed', rejected: 'Closed · not confirmed', dismissed: 'Dismissed'};
export const linkText = () => link().status === 'sent' && link().wait ? 'Supplier L cannot share yet · follow up' : LINK_TEXT[link().status] || '';

// ---------- the collaboration opportunity ----------
export const opp = () => flow.get().opp || {outreach: null, assess: null};
const setOpp = fn => flow.set(s => { s.opp ||= {outreach: null, assess: null}; fn(s.opp); });
export const oppActions = {
  outreach: () => setOpp(o => { o.outreach = 'sent'; }),
  request: () => setOpp(o => { o.assess = 'pending'; }),
  decide: ok => setOpp(o => { o.assess = ok ? 'approved' : 'declined'; })
};
// Paths through Smelter X and how sure each one is. B is confirmed by the verified statement; H and I are stated only.
export function paths() {
  const ver = claimState('CL-X-PCF').basis === 'verified', l = link().status;
  return [
    {sup: 'Supplier B', t1: 'Tier 1 B', part: 'Front suspension bracket', st: ver ? 'ok' : 'stated'},
    {sup: 'Supplier H', t1: 'Tier 1 D', part: 'Rear cover', st: 'stated'},
    {sup: 'Supplier I', t1: 'Tier 1 D', part: 'Rear cover', st: 'stated'},
    ...(linkOn() || l === 'confirmed' ? [{sup: 'Supplier L', t1: 'Tier 1 E', t1s: ['Tier 1 D', 'Tier 1 E'], part: 'Rear cover', st: l === 'confirmed' ? 'ok' : 'ai'}] : [])
  ];
}
// Conditions an opportunity must meet before it is compared. They are gates, not scores.
export function gates() {
  const ps = paths(), ver = claimState('CL-X-PCF').basis === 'verified', o = opp();
  return [
    {k: 'Baseline verified', ok: ver, t: ver ? 'Smelter X 10.1 kgCO₂e/kg, verified' : 'Smelter X value is self-declared', href: 'review.html#CL-X-PCF'},
    {k: 'Two paths confirmed', ok: ps.filter(p => p.st === 'ok').length >= 2, t: `${ps.filter(p => p.st === 'ok').length} of ${ps.length} paths confirmed`, href: 'network.html#Supplier_L'},
    {k: 'Compatible alloy', ok: true, t: 'H and I declare A356 casting alloy'}
  ];
}
export function needs() {
  const open = paths().filter(p => p.st !== 'ok').map(p => p.sup.replace('Supplier ', ''));
  return [open.length ? `Origin confirmation from Supplier ${open.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : null, 'Annual volumes through each path', 'Smelter X energy mix and technical limits', 'Consent from Smelter X and the Tier 2s'].filter(Boolean);
}
export const OPTIONS = ['Renewable power contract for electrolysis', 'Higher recycled input in the casting alloy', 'Low-carbon aluminium supply for the JLR share'];
