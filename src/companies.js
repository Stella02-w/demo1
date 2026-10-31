// Company analysis for Collaborate: relationship history, recent signals, material position and fit for each plan.
// [Assumption] Relationship years, contracts and news are demo values. News is simulated and labelled so on the page.
// Material values come from the round data (PCF records, claims); shares of round aluminium are computed from the network.
import {CLAIMS, claimState} from './v2.js';
import {PCF_RECORDS} from './data.js';
import {net, nm, ORG} from './netdata.js';
import {link, linkOn} from './links.js';

const T = 2026;
export const CO = {
  Smelter_X: {since: 2022, via: 'Supplier B, H and I', how: 'Indirect · named in processor declarations',
    contracts: [], data: 'No direct request yet · statement requested through Tier 1 B',
    news: [['2026-09', 'neg', 'Regional grid reports a higher coal share for 2026', 'Energy trade press'],
      ['2026-07', 'pos', 'Smelter X studies a renewable power contract for its potlines', 'Company release'],
      ['2026-03', 'neu', 'Plans a 40 kt capacity expansion', 'Industry news']],
    say: 'The one place where a change reaches every buyer at once. Its value is still self-declared, so start with data, then talk energy.',
    fit: {sourcing: ['High', 'Would supply the low-carbon ingot'], energy: ['High', 'Owns the change at the source']}},
  Smelter_EU: {since: 2014, via: 'Supplier C, K and F', how: 'Indirect · verified supplier of three processors',
    contracts: [], data: 'Verification statement on file · 2025',
    news: [['2026-08', 'pos', 'Signs a 10-year hydro power agreement', 'Company release'],
      ['2026-05', 'pos', 'Certified to the ASI Performance Standard', 'Certification body'],
      ['2026-02', 'neu', 'Reviews a remelt line for post-consumer scrap', 'Industry news']],
    say: 'Verified and low-risk. It supports joint work by its processors more than it needs to change itself.',
    fit: {'eu-rec': ['Medium', 'Supplies primary; recycled content rises at the processors'], 'eu-loop': ['Low', 'Scrap returns to processors, not the smelter']}},
  Supplier_B: {since: 2016, via: 'Tier 1 B', how: 'Indirect · through Tier 1 B',
    contracts: [['Tier 1 B · 6082 forging billet', '2024–2027']], data: 'Q2-26 request · answered in 21 days',
    news: [['2026-06', 'neg', 'Late deliveries to Tier 1 B noted in supplier scorecard', 'JLR scorecard'],
      ['2026-02', 'neu', 'Appoints a new chief financial officer', 'Business press']],
    say: 'Its 2022 recycled share decides the bracket ranking, and it buys 6082 billet, so it fits the cleaner-power plan rather than the joint ingot purchase.',
    fit: {sourcing: ['Low', 'Buys 6082 billet, not A356'], energy: ['Medium', 'Largest Smelter X buyer in the round']}},
  Supplier_H: {since: 2019, via: 'Tier 1 D', how: 'Indirect · through Tier 1 D',
    contracts: [['Tier 1 D · A356 casting alloy', '2025–2028']], data: 'Q2-26 request · answered in 9 days',
    news: [['2026-08', 'pos', 'Opens a casting-alloy remelt furnace', 'Company release'],
      ['2026-04', 'neu', 'Joins a regional aluminium recycling group', 'Industry news']],
    say: 'Responsive and buys A356 from Smelter X. A natural first partner for the joint ingot purchase.',
    fit: {sourcing: ['High', 'Buys A356 from Smelter X'], energy: ['Medium', 'Buyer of the smelter']}},
  Supplier_I: {since: 2021, via: 'Tier 1 D', how: 'Indirect · through Tier 1 D',
    contracts: [['Tier 1 D · A356 casting alloy', '2025–2027']], data: 'Q2-26 request · answered in 14 days',
    news: [['2026-07', 'neu', 'Acquired by a European metals group', 'Business press'],
      ['2026-03', 'neg', 'Passes an energy surcharge to customers', 'Trade press']],
    say: 'Same alloy and same smelter as H. New owners may change its sourcing policy, so confirm before planning volumes.',
    fit: {sourcing: ['High', 'Buys A356 from Smelter X'], energy: ['Medium', 'Buyer of the smelter']}},
  Supplier_L: {since: 2023, via: 'Tier 1 D and Tier 1 E', how: 'Indirect · through Tier 1 D and E',
    contracts: [['Tier 1 D · A356 casting alloy', '2024–2026'], ['Tier 1 E · A356 casting alloy', '2025–2028']], data: 'No PCF record on file',
    news: [['2026-05', 'neu', 'Wins a rear cover casting-alloy contract with Tier 1 E', 'Trade press'],
      ['2026-01', 'neu', 'Not yet on the JLR supplier register', 'JLR register']],
    say: 'Links two Tier 1s on the rear cover. If Smelter X is its source, it brings a second part maker into the joint purchase.',
    fit: {sourcing: ['High', 'A356 into two Tier 1s, if the source is confirmed'], energy: ['Medium', 'Buyer of the smelter, if confirmed']}},
  Supplier_C: {since: 2014, via: 'Tier 1 A and Tier 1 E', how: 'Indirect · through Tier 1 A and E',
    contracts: [['Tier 1 A · 6082 billet', '2023–2027'], ['Tier 1 E · A356 ingot', '2025–2028']], data: 'Q2-26 request · answered in 6 days',
    news: [['2026-09', 'pos', 'Renews its recycled-content certificate', 'Certification body'],
      ['2026-04', 'pos', 'Invests in a scrap sorting line', 'Company release']],
    say: 'Serves both parts and already sorts scrap. The natural hub for sending scrap back.',
    fit: {'eu-rec': ['Medium', 'At 20%, room to rise'], 'eu-loop': ['High', 'Serves both parts and sorts scrap']}},
  Supplier_K: {since: 2018, via: 'Tier 1 C and Tier 1 E', how: 'Indirect · through Tier 1 C and E',
    contracts: [['Tier 1 C · 6082 billet', '2024–2027'], ['Tier 1 E · A356 ingot', '2025–2026']], data: 'Q2-26 request · answered in 18 days',
    news: [['2026-08', 'neg', 'Customer audit questions its recycled-share claim', 'Trade press'],
      ['2026-02', 'neu', 'Expands billet capacity', 'Industry news']],
    say: 'Furthest behind at 5% and its share is not verified. The biggest gain if everyone raises recycled content, once the baseline is checked.',
    fit: {'eu-rec': ['High', 'Furthest behind at 5%'], 'eu-loop': ['High', 'Serves both parts']}},
  Supplier_F: {since: 2020, via: 'Tier 1 E', how: 'Indirect · through Tier 1 E',
    contracts: [['Tier 1 E · A356 casting alloy', '2025–2029']], data: 'Q2-26 request · answered in 4 days',
    news: [['2026-06', 'pos', 'Launches a 50% recycled A356 alloy', 'Company release'],
      ['2026-01', 'pos', 'Wins a supplier sustainability award', 'Industry news']],
    say: 'Already at 50% recycled in A356. The benchmark the others are measured against.',
    fit: {'eu-rec': ['Medium', 'Benchmark: already at 50%'], 'eu-loop': ['Medium', 'Smaller volume, one part']}}
};
// members of each collaboration network, in display order
export const MEMBERS = {
  Smelter_X: () => ['Smelter_X', 'Supplier_B', 'Supplier_H', 'Supplier_I', ...(linkOn() || link().status === 'confirmed' ? ['Supplier_L'] : [])],
  Smelter_EU: () => ['Smelter_EU', 'Supplier_C', 'Supplier_K', 'Supplier_F']
};
const REC = s => PCF_RECORDS.find(r => r.supplier === s);
// everything the page shows about one company
export function company(id) {
  const C = CO[id], {edges} = net(null), smelter = id.startsWith('Smelter');
  const total = edges.filter(e => e.b?.startsWith('part:')).reduce((a, e) => a + e.w, 0);
  const kg = edges.filter(e => e.a === id).reduce((a, e) => a + e.w, 0);
  const t1 = smelter ? [...new Set(edges.filter(e => edges.some(x => x.a === id && x.b === e.a)).map(e => e.b))] : edges.filter(e => e.a === id).map(e => e.b);
  const src = edges.find(e => e.b === id && e.a), r = REC(id), cl = Object.values(CLAIMS).find(c => c.supplier === id);
  const ver = cl ? claimState(cl.claim_id).basis === 'verified' : r?.verified;
  const mat = {alloy: ORG[id][2], recycled: smelter ? null : r?.recycled_share ?? null, pcf: smelter && cl ? `${cl.reported} kgCO₂e/kg` : null,
    quality: r ? `${r.dqr}/5` : smelter ? (ver ? 'Verified statement' : 'Self-declared') : '—', basis: ver ? 'Verified' : r || cl ? 'Self-declared' : 'No record',
    year: r?.reference_year || (id === 'Smelter_X' ? 2022 : 2025), source: smelter ? null : src ? `${nm(src.a)} · ${src.st === 'confirmed' ? 'confirmed' : src.st === 'ai' ? 'AI candidate' : 'declared'}` : 'Not named'};
  return {id, ...C, name: nm(id), role: ORG[id][1], years: T - C.since, share: total ? Math.round(kg / total * 100) : 0, t1: t1.map(nm), mat, smelter};
}
