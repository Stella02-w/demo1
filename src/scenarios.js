// Joint decarbonisation candidates and how they move. Mechanism B of the CarbonTrace Aluminium Pilot.
// A candidate comes from the network (shared upstream) or from a supplier's Transition Proposal.
// It must pass the Collaboration Feasibility Gate, then moves through Conditional Joint Commitment:
// five stages, each one agreed by the companies involved. CarbonTrace records the agreements; it approves nothing.
// [Assumption] Illustrative cases, not real JLR supply relationships. No tonnes, costs or returns until assessed.
import {flow, claimState} from './v2.js';
import {link, linkOn, paths} from './links.js';

const kVer = () => claimState('CL-K-REC').basis === 'verified';
const xVer = () => claimState('CL-X-PCF').basis === 'verified';
const hasL = () => linkOn() || link().status === 'confirmed';
const hil = (and = ' and ') => hasL() ? `H, I${and}L` : 'H and I';
const okPaths = () => paths().filter(p => p.st === 'ok').length;

export const GATE = ['Relationship confirmed', 'Real demand', 'Initial reduction potential', 'Commercial possibility', 'Data and compliance boundary'];
export const STAGES = [
  ['Express interest', 'Willing to take part in a first assessment', 'Participant list'],
  ['Share limited information', 'Authorised data only, inside the data boundary', 'Opportunity confirmed'],
  ['Joint feasibility study', 'Agree the study cost and who does what', 'Business case'],
  ['Conditional sourcing or investment', 'Specific commitments, each approved inside its own company', 'Go or no-go'],
  ['Implementation and verification', 'Deliver under contract, then verify the change', 'Measured result']
];
export const OPTION_T = ['Acts alone', 'Suppliers coordinate', 'JLR limited support'];
// who does what, the same for every candidate
export const ROLES = [['Find possible shared suppliers', 'AI and network analysis'], ['Confirm the supply relationship', 'The suppliers and a human reviewer'],
  ['Screen against the gate', 'Rules, explained by AI'], ['Cost, reduction and funding scenarios', 'Transparent deterministic model'],
  ['Funding, contracts and sourcing', 'JLR and the suppliers involved'], ['Verify the final reduction', 'Carbon accounting and independent verification']];

export const SCEN = {
  sourcing: {src: 'Smelter_X', n: '01', title: 'Buy low-carbon ingot from Smelter X together', short: 'Buy low-carbon ingot together', origin: 'Found in the network',
    chips: () => [`${hasL() ? 3 : 2} buyers of A356`, 'Same smelter behind them', 'Volumes still missing'], tag: ['Paused at the gate', 'Relationship not confirmed', 'warn'],
    desc: 'Buyers of the same casting alloy pool their demand, so a low-carbon ingot from Smelter X is worth quoting.',
    who: () => `Smelter X · Suppliers ${hil(', ')} · Tier 1 D${hasL() ? ', E' : ''} · JLR`,
    parties: () => ['Smelter X', 'Supplier H', 'Supplier I', ...(hasL() ? ['Supplier L'] : []), 'Tier 1 D', 'JLR Procurement'],
    get why() { return [[`Suppliers ${hil()} all buy A356 casting alloy`, 'Material declarations'], [hasL() ? 'Their demand reaches the rear cover through two Tier 1s' : 'Their demand reaches the rear cover through Tier 1 D', 'Quote breakdowns'], ['Supplier B buys 6082 billet, so it is left out', 'Material declaration · Supplier B']]; },
    gate: () => [[okPaths() >= 2, `${okPaths()} of ${paths().length} supply paths confirmed${hasL() ? '' : ' · AI can check for more buyers'}`, hasL() ? 'review.html#CL-X-PCF' : 'network.html#Supplier_L'], [true, 'Tier 1 D asked for lower-carbon A356 in its Q4-26 quote'],
      [xVer(), xVer() ? 'Smelter X baseline verified at 10.1 kgCO₂e/kg' : 'Smelter X baseline is self-declared', 'review.html#CL-X-PCF'], [false, 'Volumes per path not collected'], [true, 'Volumes go to JLR only, never between suppliers']],
    options: [['Smelter X sells a low-carbon ingot to whoever asks. Each buyer is too small to justify the premium.', 'Unlikely'],
      ['Buyers pool A356 demand so the volume is worth quoting. No JLR money.', 'Start here'],
      ['JLR adds a conditional buying signal for the rear cover share, only if the premium blocks the pooled offer.', 'If needed']], prefer: 1,
    cost: ['Low-carbon premium, first year', 'Buyers H and I', 'Tier 1 D'],
    stops: ['Supply paths cannot be confirmed at reasonable cost', 'Specifications differ too much to pool', 'The premium cannot be shared and no buyer moves alone'],
    cmp: {aim: 'Pool compatible demand', diff: 'Medium', info: 'Specifications, volumes, supply capacity', next: 'Confirm paths, then collect volumes'}, block: () => 'Supply paths not confirmed'},
  energy: {src: 'Smelter_X', n: '02', title: 'Help Smelter X move to cleaner power', short: 'Help Smelter X use cleaner power', origin: 'Found in the network',
    chips: () => ['Power drives smelter emissions', '3 Tier 1s share the site', 'Energy data missing'], tag: ['Paused at the gate', 'No demand expressed', 'warn'],
    desc: 'Buyers of Smelter X lower its investment risk so it can move to lower-carbon power or process changes.',
    who: () => 'Smelter X · Suppliers B, H, I · JLR · energy partners',
    parties: () => ['Smelter X', 'Supplier B', 'Supplier H', 'Supplier I', 'JLR Procurement'],
    why: [['Electricity for electrolysis drives most primary aluminium emissions', 'Industry reference'], ['Several buyers share one facility', 'Network · 3 Tier 1 quotes reached'], ['Smelter X is studying a renewable power contract', 'Company release · simulated']],
    gate: () => [[okPaths() >= 2, `${okPaths()} of ${paths().length} supply paths confirmed`, 'review.html#CL-X-PCF'], [false, 'No buyer has asked yet'],
      [xVer(), xVer() ? 'Baseline verified' : 'Baseline self-declared', 'review.html#CL-X-PCF'], [false, 'No cost data for the power contract'], [true, 'Energy data stays between Smelter X and JLR']],
    options: [['Smelter X funds the power contract alone. Payback is uncertain.', 'Possible'],
      ['Buyers sign longer supply contracts to lower its risk. No JLR money.', 'Start here'],
      ['JLR co-funds the feasibility study only, not the investment.', 'If needed']], prefer: 1,
    cost: ['Feasibility study', 'Smelter X', 'Buyers B, H, I'],
    stops: ['Smelter X will not share energy data', 'JLR\'s share of its output is too small to matter', 'Acting alone is clearly better for Smelter X'],
    cmp: {aim: 'Cut emissions at the shared facility', diff: 'High', info: 'Energy mix, technology, investment', next: 'Ask buyers for interest'}, block: () => 'No demand expressed'},
  'eu-rec': {src: 'Smelter_EU', n: '01', title: 'Raise recycled content together', short: 'Raise recycled content together', origin: 'Found in the network',
    chips: () => ['All paths confirmed', 'Shares range 5% to 50%', 'F proves 50% works'], tag: ['Gate passed', 'All five conditions met', 'ok'],
    desc: 'Three processors under Smelter EU agree one recycled-share band and move together, starting with the one furthest behind.',
    who: () => 'Suppliers C, K, F · Tier 1 A, C, E · JLR',
    parties: () => ['Supplier C', 'Supplier K', 'Supplier F', 'JLR Procurement'],
    why: [['Recycled share differs from 5% to 50% under the same smelter', 'PCF records · Supplier C, K, F'], ['Supplier F already reaches 50% in A356, so the alloy allows it', 'PCF record · Supplier F 2025 · verified'], ['Recycled input is 0.26 kgCO₂e/kg against 6.6 for Smelter EU primary', 'Emission factors · round data']],
    gate: () => [[true, '3 of 3 supply paths confirmed'], [true, 'C and F expressed interest'], [true, kVer() ? 'Baselines verified' : 'Baselines on file; K self-declared'],
      [true, 'Certificate fees and scrap premium can be discussed'], [true, 'Each share visible to JLR only, never to the other processors']],
    options: [['Each processor raises its share on its own timetable.', 'Slow'],
      ['One target band and a shared method; F explains how it got to 50%.', 'Start here'],
      ['JLR shares certificate fees and recognises a higher share in the next sourcing round.', 'If needed']], prefer: 1,
    cost: ['Certificates and scrap premium, first year', 'Suppliers C, K, F', 'Tier 1 A, C, E'],
    stops: ['Forging specifications cap the share well below F\'s level', 'Scrap supply cannot be secured at a workable price', 'Sharing scrap terms raises competition concerns'],
    cmp: {aim: 'Lift recycled share together', diff: 'Low to medium', info: 'Scrap supply, alloy limits', next: 'Share limited data'}, block: () => kVer() ? 'Scrap supply for the higher share' : 'Supplier K share not verified'},
  'eu-loop': {src: 'Smelter_EU', n: '02', title: 'Send production scrap back for remelting', short: 'Send scrap back for remelting', origin: 'Found in the network',
    chips: () => ['Same 3 processors', 'Clean known-alloy scrap', 'Scrap volumes unknown'], tag: ['Paused at the gate', 'Two conditions missing', 'warn'],
    desc: 'Tier 1s return clean machining and casting scrap to the same processors, so the alloy stays in the loop.',
    who: () => 'Tier 1 A, C, E · Suppliers C, K, F · logistics partner',
    parties: () => ['Tier 1 A', 'Tier 1 C', 'Tier 1 E', 'Supplier C', 'Supplier K', 'Supplier F'],
    why: [['Three Tier 1s buy from the same three processors', 'Network · Smelter EU paths'], ['Machining and casting produce clean, known-alloy scrap', 'Process data · Tier 1 quotes'], ['C and K serve both parts, so one loop covers both', 'Network · cross-part suppliers']],
    gate: () => [[true, '3 of 3 supply paths confirmed'], [false, 'Not discussed with the Tier 1s'], [false, 'Scrap volumes not recorded'],
      [true, 'Credit for returned metal is a known model'], [false, 'Scrap terms between competitors need a legal check']],
    options: [['Each Tier 1 sells its scrap on the open market.', 'Today'],
      ['Tier 1s and processors agree segregation and returns.', 'Start here'],
      ['JLR contracts shared logistics for the first year.', 'If needed']], prefer: 1,
    cost: ['Segregation and logistics set-up', 'Tier 1 A, C, E', 'Suppliers C, K, F'],
    stops: ['Scrap volumes are too small', 'Alloys cannot be kept apart', 'Return cost is above scrap value'],
    cmp: {aim: 'Keep scrap in the supply loop', diff: 'Medium', info: 'Scrap volumes, segregation, logistics', next: 'Measure scrap at Tier 1s'}, block: () => 'Scrap volumes not recorded'},
  // from a supplier's Transition Proposal (Evidence · layer 3), not from the network
  'h-furnace': {src: 'Supplier_H', type: 'proposal', n: '01', title: 'Remelt furnace upgrade at Supplier H', short: 'Furnace upgrade · H', origin: 'Supplier proposal',
    chips: () => ['Submitted by Supplier H', 'Efficiency retrofit', 'Cost cannot be carried alone'], tag: ['Paused at the gate', 'Commercial case open', 'warn'],
    desc: 'Supplier H disclosed a footprint above target and proposed a furnace retrofit it cannot fund alone.',
    who: () => 'Supplier H · Tier 1 D · JLR',
    parties: () => ['Supplier H', 'Tier 1 D', 'JLR Procurement'],
    proposal: [['Current baseline', 'Self-declared PCF, 2024, data quality 3/5'], ['Measure', 'Regenerative burners and scrap preheating on the remelt furnace'], ['First cost estimate', 'Supplier estimate, not yet reviewed'],
      ['Expected reduction', 'Supplier estimate on furnace energy, to be tested'], ['Barrier', 'Payback too long for the supplier alone'], ['What it asks for', 'A longer contract with Tier 1 D, and help with the energy audit']],
    why: [['Supplier H disclosed a footprint above the target instead of hiding it', 'Transition Proposal · Oct 2026'], ['The furnace serves the rear cover through Tier 1 D', 'Network · confirmed contract'], ['A longer contract lowers its risk more than a grant would', 'Proposal · what it asks for']],
    gate: () => [[true, 'Supplier H → Tier 1 D under contract'], [true, 'Supplier H asked; Tier 1 D interested'], [false, 'Energy audit needed for a baseline', 'review.html'],
      [false, 'Cost estimate not yet reviewed'], [true, 'Proposal visible to JLR and Tier 1 D only']],
    options: [['Supplier H waits until the furnace is due for replacement.', 'Slow'],
      ['Tier 1 D offers a longer contract in exchange for the retrofit.', 'Start here'],
      ['JLR shares the energy audit cost.', 'If needed']], prefer: 1,
    cost: ['Energy audit and retrofit', 'Supplier H', 'Tier 1 D'],
    stops: ['The audit shows a small saving', 'Tier 1 D cannot extend the contract', 'Acting alone pays back within the supplier\'s normal horizon'],
    cmp: {aim: 'Fund a supplier\'s own measure', diff: 'Medium', info: 'Energy audit, cost review', next: 'Energy audit'}, block: () => 'Baseline needs an energy audit'}
};
export const KEYS = Object.keys(SCEN);
export const keysOf = src => KEYS.filter(k => SCEN[k].src === src && !SCEN[k].type);
// the shared upstream sources behind the network-found candidates
export const SOURCES = {
  Smelter_X: {name: 'Smelter X', type: 'upstream', label: 'Upstream collaboration', state: 'Partly confirmed', partners: () => paths().map(p => [p.sup.replace('Supplier ', ''), p.st]), reach: 'Tier 1 B, D, E'},
  Smelter_EU: {name: 'Smelter EU', type: 'joint', label: 'Joint collaboration', state: 'All confirmed', partners: () => [['C', 'ok'], ['K', 'ok'], ['F', 'ok']], reach: 'Tier 1 A, C, E'}
};
export const typeOf = k => SCEN[k].type || SOURCES[SCEN[k].src].type;
export const scen = k => SCEN[k];
export const gateCount = k => SCEN[k].gate().filter(g => g[0]).length;
export const gateOpen = k => gateCount(k) === GATE.length;

// ---------- Conditional Joint Commitment: where each candidate stands ----------
// stage = stages completed (0..5); asked = parties asked at the current stage; yes = parties who agreed
const SEED = {'eu-rec': {stage: 1, asked: ['Supplier C', 'Supplier K', 'Supplier F', 'JLR Procurement'], yes: ['Supplier C', 'Supplier F', 'JLR Procurement']}};
export const cjc = k => flow.get().cjc?.[k] || SEED[k] || {stage: 0, asked: [], yes: []};
const setC = (k, fn) => flow.set(s => { s.cjc ||= {}; const c = s.cjc[k] ||= JSON.parse(JSON.stringify(cjc(k))); fn(c); });
// [Assumption] Demo responses: every party agrees when responses are recorded.
export const cjcActions = {
  ask: k => setC(k, c => { c.asked = SCEN[k].parties(); c.yes = []; }),
  record: k => setC(k, c => { c.yes = [...c.asked]; }),
  complete: k => setC(k, c => { c.stage = Math.min(5, c.stage + 1); c.asked = []; c.yes = []; })
};
export const stageText = k => { const c = cjc(k); return c.stage >= 5 ? 'Completed' : `Stage ${c.stage + 1} of 5 · ${STAGES[c.stage][0]}${c.asked.length ? ` · ${c.yes.length}/${c.asked.length} agreed` : ''}`; };

// ---------- the 12-week pilot inside each plan ----------
// Phases follow the pilot: baseline, evidence track, confirm the opportunity, joint feasibility, go / no-go review.
// Metrics compare against a no-CarbonTrace baseline; target values are pilot hypotheses, not results.
export const PILOT = {
  sourcing: {weeks: ['Count today\'s A356 data requests and hours at Tier 1 D, H and I', 'Confirm the Smelter X paths; reuse one statement for all buyers', 'Ask H, I and Tier 1 D for interest and volume ranges', 'Compare acting alone, pooled demand, and a JLR offtake signal', 'Go, gather more data, or stop'],
    metrics: [['Participation', 'Paths confirmed', '0 of 3', '3 of 3'], ['Participation', 'Repeat data requests to H and I', '4 per round', '1'], ['Collaboration', 'Weeks to pass the gate', 'Not tracked', '≤ 6'], ['Reduction', 'Verified change in ingot footprint', 'Self-declared', 'Measured only if implemented']]},
  energy: {weeks: ['Record how often buyers ask Smelter X for energy data', 'Verify the Smelter X baseline once for all buyers', 'Ask buyers whether longer contracts are possible', 'Feasibility study scope and who pays for it', 'Go, gather more data, or stop'],
    metrics: [['Participation', 'Buyers expressing interest', '0', '≥ 2'], ['Collaboration', 'Energy data shared under the boundary', 'None', 'Energy mix disclosed'], ['Collaboration', 'Coordination hours', 'Not tracked', 'Recorded'], ['Reduction', 'Verified change at the smelter', '—', 'Beyond 12 weeks']]},
  'eu-rec': {weeks: ['Record each processor\'s recycled share and how it was proven', 'Verify K once; reuse C and F certificates', 'Agree what each processor shares, and with whom', 'Compare each acting alone with a joint target band', 'Go, gather more data, or stop'],
    metrics: [['Participation', 'Shares verified', '2 of 3', '3 of 3'], ['Participation', 'Supplier hours per evidence request', 'Baseline in week 1', 'Lower than baseline'], ['Collaboration', 'Processors agreeing a band', '0', '3'], ['Reduction', 'Verified recycled share change', '5–50%', 'Measured after the pilot']]},
  'eu-loop': {weeks: ['Measure scrap volumes by alloy at Tier 1 A, C and E', 'Reuse existing alloy certificates for the scrap', 'Legal check on scrap terms; ask Tier 1s for interest', 'Compare market sale with a closed loop', 'Go, gather more data, or stop'],
    metrics: [['Participation', 'Tier 1s measuring scrap', '0 of 3', '3 of 3'], ['Collaboration', 'Legal check on terms', 'Open', 'Cleared'], ['Collaboration', 'Weeks to pass the gate', 'Not tracked', '≤ 8'], ['Reduction', 'Scrap kept in the loop', 'Not recorded', 'Measured only if implemented']]},
  'h-furnace': {weeks: ['Record how the proposal was submitted and reviewed', 'Energy audit with guidance and a template', 'Ask Tier 1 D about a longer contract', 'Compare waiting, a longer contract, and audit cost support', 'Go, gather more data, or stop'],
    metrics: [['Participation', 'Proposal reviewed within', 'No channel today', '2 weeks'], ['Participation', 'Energy audit completed', 'No', 'Yes'], ['Collaboration', 'Contract terms discussed', 'No', 'Yes'], ['Reduction', 'Verified furnace energy change', '—', 'Beyond 12 weeks']]}
};
