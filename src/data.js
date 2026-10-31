// Demo data. Mirror of carbontrace-code/round2/data (smelters.json, pcf_records.json, parts.json).
// If the Python data changes, update this file and run `node tests/domain.test.mjs`.

// [Source] European Aluminium EPR 2024 p.5 / p.11; IAI 2023. Same values as pcf_cal.PRIMARY_PCF.
export const PRIMARY_PCF = {eu_produced: 6.6, eu_used: 10.1, imported: 13.2, global: 14.8};
// [Derived] Back-solved from twin output (Supplier_B 0.75 recycled, 10.1 primary -> 2.72).
// Confirm against pcf_cal.RECYCLED_PCF before release.
export const RECYCLED_PCF = 0.26;

export const SMELTERS = [
  {smelter: 'Smelter_EU', primary_basis: 'eu_produced', verified: true},
  {smelter: 'Smelter_IMP', primary_basis: 'imported', verified: true},
  {smelter: 'EU_market_mix', primary_basis: 'eu_used', verified: true},
  {smelter: 'Unknown_B', primary_basis: 'eu_used', verified: false},
  {smelter: 'Unknown_D', primary_basis: 'global', verified: false}
];
// [Assumption] Round 7 demo topology: Unknown_B is one smelter shared by Supplier_B, Supplier_H and Supplier_I,
// so one upstream claim reaches both the bracket and the cover. No pcf value changed.
// Internal ids stay; the UI shows display names.
export const DISPLAY = {Unknown_B: 'Smelter X', Unknown_D: 'Smelter Y'};

export const PCF_RECORDS = [
  {id: 'R001', supplier: 'Supplier_A', tier: 2, smelter: 'Smelter_IMP', primary_basis: 'imported', recycled_share: 0.3, recycled_claim_verified: true, pds: 0.6, dqr: 2, verified: true, reference_year: 2025, declared_unit: 'kg', evidence: ['verification_statement']},
  {id: 'R002', supplier: 'Supplier_B', tier: 2, smelter: 'Unknown_B', primary_basis: 'eu_used', recycled_share: 0.75, recycled_claim_verified: false, pds: 0.1, dqr: 4, verified: false, reference_year: 2022, declared_unit: 'kg', evidence: ['self_declaration']},
  {id: 'R003', supplier: 'Supplier_C', tier: 2, smelter: 'Smelter_EU', primary_basis: 'eu_produced', recycled_share: 0.2, recycled_claim_verified: true, pds: 0.8, dqr: 1, verified: true, reference_year: 2025, declared_unit: 'kg', evidence: ['verification_statement', 'recycled_content_certificate']},
  {id: 'R004', supplier: 'Supplier_D', tier: 2, smelter: 'Unknown_D', primary_basis: 'global', recycled_share: 0.1, recycled_claim_verified: false, pds: 0.3, dqr: 3, verified: false, reference_year: 2024, declared_unit: 'piece', evidence: []},
  {id: 'R005', supplier: 'Supplier_E', tier: 2, smelter: 'EU_market_mix', primary_basis: 'eu_used', recycled_share: 0.5, recycled_claim_verified: true, pds: 0.5, dqr: 2, verified: true, reference_year: 2024, declared_unit: 'kg', evidence: []},
  {id: 'R006', supplier: 'Supplier_F', tier: 2, smelter: 'Smelter_EU', primary_basis: 'eu_produced', recycled_share: 0.5, recycled_claim_verified: true, pds: 0.9, dqr: 1, verified: true, reference_year: 2025, declared_unit: 'kg', evidence: []},
  {id: 'R007', supplier: 'Supplier_G', tier: 2, smelter: 'Smelter_IMP', primary_basis: 'imported', recycled_share: 0.1, recycled_claim_verified: true, pds: 0.7, dqr: 2, verified: true, reference_year: 2025, declared_unit: 'kg', evidence: []},
  {id: 'R008', supplier: 'Supplier_H', tier: 2, smelter: 'Unknown_B', primary_basis: 'eu_used', recycled_share: 0.6, recycled_claim_verified: true, pds: 0.4, dqr: 3, verified: false, reference_year: 2024, declared_unit: 'kg', evidence: []},
  {id: 'R009', supplier: 'Supplier_I', tier: 2, smelter: 'Unknown_B', primary_basis: 'eu_used', recycled_share: 0.65, recycled_claim_verified: true, pds: 0.4, dqr: 3, verified: false, reference_year: 2024, declared_unit: 'kg', evidence: []},
  {id: 'R010', supplier: 'Supplier_K', tier: 2, smelter: 'Smelter_EU', primary_basis: 'eu_produced', recycled_share: 0.05, recycled_claim_verified: false, pds: 0.5, dqr: 3, verified: false, reference_year: 2024, declared_unit: 'kg', evidence: []}
];

export const PARTS = [
  {part: 'Bracket_T1A', tier1: 'Tier1_A', aluminium_kg: 8.0, sources: [{supplier: 'Supplier_C', share: 0.5}, {supplier: 'Supplier_E', share: 0.5}]},
  {part: 'Bracket_T1B', tier1: 'Tier1_B', aluminium_kg: 8.0, sources: [{supplier: 'Supplier_B', share: 0.7}, {supplier: 'Supplier_A', share: 0.3}]},
  {part: 'Housing_T1C', tier1: 'Tier1_C', aluminium_kg: 3.0, sources: [{supplier: 'Supplier_D', share: 1.0}]},
  {part: 'Cover_T1D', tier1: 'Tier1_D', aluminium_kg: 6.0, sources: [{supplier: 'Supplier_H', share: 0.5}, {supplier: 'Supplier_I', share: 0.5}]},
  {part: 'Cover_T1E', tier1: 'Tier1_E', aluminium_kg: 6.0, sources: [{supplier: 'Supplier_F', share: 0.25}, {supplier: 'Supplier_C', share: 0.65}, {supplier: 'Supplier_K', share: 0.1}]}
];

// The sourcing round. [Assumption] Demo dates, same as twin.py __main__.
export const ROUND = {
  id: 'Q4-26-ALU',
  name: 'Q4-26 · Aluminium castings',
  opened_on: '2026-10-28',
  sourcing_date: '2026-12-15',
  comparisons: [
    {key: 'bracket', name: 'Front suspension bracket', parts: ['Bracket_T1A', 'Bracket_T1B']},
    {key: 'cover', name: 'Rear cover', parts: ['Cover_T1D', 'Cover_T1E']},
    {key: 'housing', name: 'Motor housing', parts: ['Housing_T1C']}
  ]
};

// [Assumption] Two simulated outcomes for Supplier_B, same as twin.py __main__.
export const DEMO_OUTCOMES = {
  lower: {recycled_share: 0.65, primary_pcf: PRIMARY_PCF.eu_produced},
  higher: {recycled_share: 0.33, primary_pcf: PRIMARY_PCF.imported}
};

// [Demo data] A complete, passing verification statement, used where the demo needs evidence that clears every check
// (the scripted journeys and tests). The product never fills these in on a supplier's behalf.
export const demoStatement = (supplier, claims, on) => ({product: 'aluminium', site: supplier, period_end: on, scope: [].concat(claims), unit: 'kg',
  boundary: 'cradle-to-gate', smelter: 'named smelter', supply_relationship: 'confirmed', content_definition: 'post_consumer_and_pre_consumer',
  chain_of_custody: 'segregated', valid_until: `${+on.slice(0, 4) + 3}${on.slice(4)}`, opinion: 'unqualified'});
export const DEMO_EVIDENCE = {verified_by: 'third_party_verification', assurance_level: 'limited'};
