// Generated from carbontrace-code/v2/web_data.json (export_web.py). Do not edit by hand: re-export instead.
export const V2 = {
 "note": "Demo data. Every number is [Source], [Derived] or [Assumption]; see seed.py.",
 "analysis": {
  "round": {
   "id": "R1",
   "part": "Front Suspension Bracket",
   "aluminium_kg": 8.0,
   "target": 5.0,
   "target_basis": "demo_assumption",
   "today": "2026-10-30",
   "evidence_deadline": "2026-11-29"
  },
  "policy_version": "v2.0",
  "candidates": [
   {
    "id": "Bracket_T1A",
    "tier1": "Tier1_A",
    "pcf": 5.256,
    "meets_target": false,
    "rests_on_unverified": [
     "CL-C-REC"
    ]
   },
   {
    "id": "Bracket_T1B",
    "tier1": "Tier1_B",
    "pcf": 4.6994,
    "meets_target": true,
    "rests_on_unverified": [
     "CL-B-REC",
     "CL-X-PCF"
    ]
   },
   {
    "id": "Bracket_T1C",
    "tier1": "Tier1_C",
    "pcf": 5.3698,
    "meets_target": false,
    "rests_on_unverified": [
     "CL-J-PCF",
     "CL-K-REC"
    ]
   }
  ],
  "lowest": [
   "Bracket_T1B"
  ],
  "claims": [
   {
    "claim_id": "CL-A-REC",
    "supplier": "Supplier_A",
    "kind": "recycled_share",
    "reported": 0.3,
    "unit": "share",
    "carbon_performance": "Verified 0.3",
    "evidence_gap": null,
    "capability": null,
    "decision_sensitivity": "verified",
    "sensitivity_reason": "Verified evidence on file",
    "tested": [],
    "is_illustrative": false,
    "recommendation": "no_action",
    "reasons": [
     "Verified evidence on file"
    ],
    "needs_human_decision": false,
    "shared_with": [],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-B-REC",
    "supplier": "Supplier_B",
    "kind": "recycled_share",
    "reported": 0.75,
    "unit": "share",
    "carbon_performance": "Unconfirmed",
    "evidence_gap": "recycled_share not evidenced",
    "capability": null,
    "decision_sensitivity": "material",
    "sensitivity_reason": "The carbon judgement differs between tested scenarios",
    "tested": [
     {
      "scenario": "as reported",
      "value": 0.75,
      "basis": "reported",
      "source": null,
      "pcf": {
       "Bracket_T1A": 5.256,
       "Bracket_T1B": 4.6994,
       "Bracket_T1C": 5.3698
      },
      "changes": []
     },
     {
      "scenario": "recycled share not proven",
      "value": 0.0,
      "basis": "source_supported",
      "source": "[Derived] Catena-X PCF Rulebook v4 s.5.2.7.1: recycled-content claims must be verifiable",
      "pcf": {
       "Bracket_T1A": 5.256,
       "Bracket_T1B": 9.8654,
       "Bracket_T1C": 5.3698
      },
      "changes": [
       "Bracket_T1B: meets target -> misses target",
       "Lowest-carbon candidate: ['Bracket_T1B'] -> ['Bracket_T1A']"
      ]
     }
    ],
    "is_illustrative": false,
    "recommendation": "manual_value_review",
    "reasons": [
     "The carbon judgement differs between tested scenarios",
     "not_resolvable_this_round: no route finishes within 30 days; may still be worth it for later rounds"
    ],
    "needs_human_decision": true,
    "shared_with": [],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-C-REC",
    "supplier": "Supplier_C",
    "kind": "recycled_share",
    "reported": 0.2,
    "unit": "share",
    "carbon_performance": "Unconfirmed",
    "evidence_gap": "recycled_share not evidenced",
    "capability": null,
    "decision_sensitivity": "not_material",
    "sensitivity_reason": "Same carbon judgement in every tested scenario",
    "tested": [
     {
      "scenario": "as reported",
      "value": 0.2,
      "basis": "reported",
      "source": null,
      "pcf": {
       "Bracket_T1A": 5.256,
       "Bracket_T1B": 4.6994,
       "Bracket_T1C": 5.3698
      },
      "changes": []
     },
     {
      "scenario": "recycled share not proven",
      "value": 0.0,
      "basis": "source_supported",
      "source": "[Derived] Catena-X PCF Rulebook v4 s.5.2.7.1",
      "pcf": {
       "Bracket_T1A": 5.89,
       "Bracket_T1B": 4.6994,
       "Bracket_T1C": 5.3698
      },
      "changes": []
     }
    ],
    "is_illustrative": false,
    "recommendation": "reuse_available",
    "reasons": [
     "Applicable verified evidence on file: EV-C-RCC"
    ],
    "needs_human_decision": true,
    "shared_with": [],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-E-REC",
    "supplier": "Supplier_E",
    "kind": "recycled_share",
    "reported": 0.5,
    "unit": "share",
    "carbon_performance": "Verified 0.5",
    "evidence_gap": null,
    "capability": null,
    "decision_sensitivity": "verified",
    "sensitivity_reason": "Verified evidence on file",
    "tested": [],
    "is_illustrative": false,
    "recommendation": "no_action",
    "reasons": [
     "Verified evidence on file"
    ],
    "needs_human_decision": false,
    "shared_with": [],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-EU-PCF",
    "supplier": "Smelter_EU",
    "kind": "primary_pcf",
    "reported": 6.6,
    "unit": "kgCO2e/kg",
    "carbon_performance": "Verified 6.6",
    "evidence_gap": null,
    "capability": null,
    "decision_sensitivity": "verified",
    "sensitivity_reason": "Verified evidence on file",
    "tested": [],
    "is_illustrative": false,
    "recommendation": "no_action",
    "reasons": [
     "Verified evidence on file"
    ],
    "needs_human_decision": false,
    "shared_with": [
     "Supplier_C",
     "Supplier_K"
    ],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-IMP-PCF",
    "supplier": "Smelter_IMP",
    "kind": "primary_pcf",
    "reported": 13.2,
    "unit": "kgCO2e/kg",
    "carbon_performance": "Verified 13.2",
    "evidence_gap": null,
    "capability": null,
    "decision_sensitivity": "verified",
    "sensitivity_reason": "Verified evidence on file",
    "tested": [],
    "is_illustrative": false,
    "recommendation": "no_action",
    "reasons": [
     "Verified evidence on file"
    ],
    "needs_human_decision": false,
    "shared_with": [
     "Supplier_A"
    ],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-J-PCF",
    "supplier": "Supplier_J",
    "kind": "product_pcf",
    "reported": 4.0,
    "unit": "kgCO2e/kg",
    "carbon_performance": "Unconfirmed",
    "evidence_gap": "product_pcf not evidenced",
    "capability": "Measurement support requested",
    "decision_sensitivity": "indeterminate",
    "sensitivity_reason": "insufficient_supported_scenarios",
    "tested": [],
    "is_illustrative": false,
    "recommendation": "clarification_first",
    "reasons": [
     "insufficient_supported_scenarios",
     "Supplier asked for measurement support (capability gap, not a carbon finding)"
    ],
    "needs_human_decision": true,
    "shared_with": [],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-K-REC",
    "supplier": "Supplier_K",
    "kind": "recycled_share",
    "reported": 0.05,
    "unit": "share",
    "carbon_performance": "Unconfirmed",
    "evidence_gap": "recycled_share not evidenced",
    "capability": null,
    "decision_sensitivity": "not_material",
    "sensitivity_reason": "Same carbon judgement in every tested scenario",
    "tested": [
     {
      "scenario": "as reported",
      "value": 0.05,
      "basis": "reported",
      "source": null,
      "pcf": {
       "Bracket_T1A": 5.256,
       "Bracket_T1B": 4.6994,
       "Bracket_T1C": 5.3698
      },
      "changes": []
     },
     {
      "scenario": "recycled share not proven",
      "value": 0.0,
      "basis": "source_supported",
      "source": "[Derived] Catena-X PCF Rulebook v4 s.5.2.7.1",
      "pcf": {
       "Bracket_T1A": 5.256,
       "Bracket_T1B": 4.6994,
       "Bracket_T1C": 5.56
      },
      "changes": []
     }
    ],
    "is_illustrative": false,
    "recommendation": "mandatory_verification",
    "reasons": [
     "Demo contract clause: recycled-content claims on new-tooled parts must be evidenced [Assumption]"
    ],
    "needs_human_decision": true,
    "shared_with": [],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-MIX-PCF",
    "supplier": "EU_mix",
    "kind": "primary_pcf",
    "reported": 10.1,
    "unit": "kgCO2e/kg",
    "carbon_performance": "Verified 10.1",
    "evidence_gap": null,
    "capability": null,
    "decision_sensitivity": "verified",
    "sensitivity_reason": "Verified evidence on file",
    "tested": [],
    "is_illustrative": false,
    "recommendation": "no_action",
    "reasons": [
     "Verified evidence on file"
    ],
    "needs_human_decision": false,
    "shared_with": [
     "Supplier_E"
    ],
    "origin_links_open": []
   },
   {
    "claim_id": "CL-X-PCF",
    "supplier": "Smelter_X",
    "kind": "primary_pcf",
    "reported": 10.1,
    "unit": "kgCO2e/kg",
    "carbon_performance": "Unconfirmed",
    "evidence_gap": "primary_pcf not evidenced",
    "capability": null,
    "decision_sensitivity": "material",
    "sensitivity_reason": "The carbon judgement differs between tested scenarios",
    "tested": [
     {
      "scenario": "imported primary ingot",
      "value": 13.2,
      "basis": "source_supported",
      "source": "European Aluminium EPR 2024 p.11",
      "pcf": {
       "Bracket_T1A": 5.256,
       "Bracket_T1B": 5.2419,
       "Bracket_T1C": 5.3698
      },
      "changes": [
       "Bracket_T1B: meets target -> misses target"
      ]
     },
     {
      "scenario": "as reported (EU consumption mix)",
      "value": 10.1,
      "basis": "reported",
      "source": null,
      "pcf": {
       "Bracket_T1A": 5.256,
       "Bracket_T1B": 4.6994,
       "Bracket_T1C": 5.3698
      },
      "changes": []
     }
    ],
    "is_illustrative": false,
    "recommendation": "verification_candidate",
    "reasons": [
     "The carbon judgement differs between tested scenarios",
     "Can be resolved before the deadline at a known cost"
    ],
    "needs_human_decision": true,
    "shared_with": [
     "Supplier_B",
     "Supplier_H",
     "Supplier_I"
    ],
    "origin_links_open": [
     "Supplier_B",
     "Supplier_H",
     "Supplier_I"
    ]
   }
  ],
  "joint_only": []
 },
 "nodes": [
  {
   "id": "EU_mix",
   "name": "EU consumption mix",
   "kind": "smelter",
   "size": "large"
  },
  {
   "id": "Smelter_EU",
   "name": "Smelter EU",
   "kind": "smelter",
   "size": "large"
  },
  {
   "id": "Smelter_IMP",
   "name": "Smelter Import",
   "kind": "smelter",
   "size": "large"
  },
  {
   "id": "Smelter_X",
   "name": "Smelter X",
   "kind": "smelter",
   "size": "large"
  },
  {
   "id": "Supplier_A",
   "name": "Supplier A",
   "kind": "supplier",
   "size": "large"
  },
  {
   "id": "Supplier_B",
   "name": "Supplier B",
   "kind": "supplier",
   "size": "large"
  },
  {
   "id": "Supplier_C",
   "name": "Supplier C",
   "kind": "supplier",
   "size": "large"
  },
  {
   "id": "Supplier_E",
   "name": "Supplier E",
   "kind": "supplier",
   "size": "large"
  },
  {
   "id": "Supplier_H",
   "name": "Supplier H",
   "kind": "supplier",
   "size": "large"
  },
  {
   "id": "Supplier_I",
   "name": "Supplier I",
   "kind": "supplier",
   "size": "large"
  },
  {
   "id": "Supplier_J",
   "name": "Supplier J",
   "kind": "supplier",
   "size": "sme"
  },
  {
   "id": "Supplier_K",
   "name": "Supplier K",
   "kind": "supplier",
   "size": "large"
  },
  {
   "id": "Tier1_A",
   "name": "Tier 1 A",
   "kind": "tier1",
   "size": "large"
  },
  {
   "id": "Tier1_B",
   "name": "Tier 1 B",
   "kind": "tier1",
   "size": "large"
  },
  {
   "id": "Tier1_C",
   "name": "Tier 1 C",
   "kind": "tier1",
   "size": "large"
  }
 ],
 "links": [
  {
   "from_id": "EU_mix",
   "to_id": "Supplier_E",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Smelter_EU",
   "to_id": "Supplier_C",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Smelter_EU",
   "to_id": "Supplier_K",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Smelter_IMP",
   "to_id": "Supplier_A",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Smelter_X",
   "to_id": "Supplier_B",
   "material": "aluminium",
   "origin_verified": 0
  },
  {
   "from_id": "Smelter_X",
   "to_id": "Supplier_H",
   "material": "aluminium",
   "origin_verified": 0
  },
  {
   "from_id": "Smelter_X",
   "to_id": "Supplier_I",
   "material": "aluminium",
   "origin_verified": 0
  },
  {
   "from_id": "Supplier_A",
   "to_id": "Tier1_B",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Supplier_B",
   "to_id": "Tier1_B",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Supplier_C",
   "to_id": "Tier1_A",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Supplier_E",
   "to_id": "Tier1_A",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Supplier_J",
   "to_id": "Tier1_C",
   "material": "aluminium",
   "origin_verified": 1
  },
  {
   "from_id": "Supplier_K",
   "to_id": "Tier1_C",
   "material": "aluminium",
   "origin_verified": 1
  }
 ]
};
