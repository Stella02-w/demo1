# CarbonTrace web

Pre-sourcing carbon evidence check for automotive procurement: find the supplier claims that would change a sourcing decision if wrong, ask only for those, and re-assess on the same twin when evidence arrives.

No build step. Static files, works on GitHub Pages.

## Run

```
python3 -m http.server 8000
# open http://localhost:8000 and pick who to sign in as
```

State is shared between tabs through `localStorage`, so you can play the buyer in one tab and the supplier in another. The demo bar in the header switches role, moves the clock, and resets.

## Test

```
node tests/handcalc.test.mjs  # independent hand calculations from the raw records
node tests/domain.test.mjs    # JS port reproduces twin.py / incentive.py output
node tests/journey.test.mjs   # every business path through the state machine
node tests/parity.test.mjs    # same decisions as the backend Python oracle on 409 random supply chains (shared smelters included)
node tests/percentile.test.mjs  # percentile and target: 500 cases identical to Python
node tests/round7.test.mjs    # cross-tier impact, routes, cost scenarios, benchmark sensitivity: every field equals round7 Python
node tests/contract.test.mjs  # fields, enums and units the pages rely on (store.CONTRACT)
```

## Structure

| Path | What it is |
|---|---|
| `index.html` | Sign in as one of the demo roles |
| `pages/workbench.html` | Sourcing: 3D twin; the bracket round's candidates and claims |
| `pages/review.html` | Evidence: claim queue and the five steps (claim, sensitivity, verification, request, resolution) |
| `pages/portal.html` | Supplier Portal as Supplier B: answer REQ-1 |
| `pages/decision.html` | Decision: board by status and the committee brief |
| `pages/registry.html` | Evidence registry (earlier rule set) |
| `pages/supplier.html` | Tier 1 forwards requests; Tier 2 answers them |
| `pages/committee.html` | Sourcing committee pack and nomination |
| `pages/manage.html` | Other rounds (earlier rule set, sample) |
| `src/v2data.js`, `src/v2.js` | Bracket round from `carbontrace-code/v2` (export_web.py) and the demo flow state |
| `src/data.js` | Demo data, mirror of `carbontrace-code/round7/data` |
| `src/domain.js` | Business rules, port of `twin.py` and `incentive.py` |
| `src/network.js` | Cross-tier impact of a node; verify a shared smelter once or each supplier (port of `network.py`) |
| `src/cost.js` | Cost scenarios, break-even, losing conditions (port of `cost_model.py`) |
| `src/benchmark.js` | Benchmark sensitivity P10/P25/P50 and leave-one-out (port of `benchmark.py`) |
| `src/store.js` | Journey state machine, permissions, read model |
| `src/scene.js` | three.js scene, visual only |
| `src/ui.js`, `src/ui.css` | Shared helpers and styles |
| `docs/LOGIC.md` | Business logic for review (Chinese) |
