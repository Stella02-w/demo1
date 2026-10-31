import json, sys
from datetime import date
import network, cost_model, benchmark
out = {}
out["impact"] = {n: network.node_impact(n) for n in ("Unknown_B","Unknown_D","Supplier_K","Smelter_EU","Supplier_B","Supplier_H","Supplier_C")}
r = network.shared_vs_separate("Unknown_B", date(2026,12,15), date(2026,10,28))
out["svs"] = r
out["svs_late"] = network.shared_vs_separate("Unknown_B", date(2026,12,15), date(2026,11,20))
out["routesens"] = network.route_sensitivity("Unknown_B", date(2026,12,15), date(2026,10,28))
out["cap"] = cost_model.compare("cap"); out["budget"] = cost_model.compare("budget")
out["sweep"] = {m: cost_model.sweep(m) for m in ("cap","budget")}
out["losing"] = cost_model.losing_conditions()
out["breakeven"] = [cost_model.break_even_N(**c) for c in ({}, {"d":0.6}, {"d":1.0,"r":0.0}, {"V":0.2}, {"F":5.0}, {"m":1.0})]
out["demo"] = cost_model.demo_round()
out["bench"] = benchmark.benchmark_sensitivity()
out["loo"] = benchmark.leave_one_out()
json.dump(out, open(sys.argv[1],"w"), default=str, indent=1)
