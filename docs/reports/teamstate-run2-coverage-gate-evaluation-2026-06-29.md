# Teamstate Run 2 coverage gate evaluation

_Generated 2026-06-29 • record teamstate-run2-coverage-gate-evaluation-v1 • status: **teamstate_coverage_gate_passed**_

Gate-evaluation only: this evaluates whether the new full-mode Teamstate coverage evidence satisfies Forecast's Teamstate Run 2 coverage gate. It performs **no** Run 2 rerun, no three-arm comparison, no model fit/tuning, no feature change, and no null-handling change. A pass authorizes only a later **unchanged** rerun issue; it is **not** a claim that Teamstate improves prediction or works as signal.

## 1. Source evidence identity

- Teamstate repo: `Prometheus-Frameworks/TIBER-Teamstate`
- Teamstate coverage evidence: `data/fixtures/teamstate/team_week_raw_v0_2024_forecast_run2.coverage_evidence.json`
- Teamstate emitted artifact: `data/fixtures/teamstate/team_week_raw_v0_2024_forecast_run2.full.json`
- Teamstate governed source: `data/governed/team_week_raw_v0_2024_real_source_candidate.json`
- Governed source sha256: `2aed00e68c1620af10d2ea4350104f7e183ff6ee050f5d385a503ef027281de9`
- Upstream coverage audit: TIBER-Data: exports/candidates/team_week_raw/team_week_raw_v0_2024_teamstate_coverage_audit.json (issue #181 / PR #182)
- Refs: `TIBER-Data#181`, `TIBER-Data#182`, `TIBER-Teamstate#72`, `TIBER-Teamstate#73`, `TIBER-Teamstate#74`

## 2. Teamstate evidence summary

- Input: 32 teams / 544 team-week rows; missing teams: none
- Emitted readiness: `ready_minimal_boundary`; emitted forecast input columns: 19
- Governance: governed / explicit_marker / governed_real_data
- Pressure excluded/deferred; fantasy splits absent/excluded; `redZoneTdRate` null-aware (legitimate partial nulls)

## 3. Forecast gate thresholds

- Team coverage ≥ 28/32 (preferred 32/32)
- Scored-row coverage ≥ 80.0%
- Non-null Teamstate feature cells ≥ 75.0%
- Forecast Run 2 Teamstate feature columns: `epaPerPlay`, `successRate`, `redZoneTdRate` (subset of the 19 emitted input columns; pressure + fantasy excluded by contract)

## 4. Row-level join diagnostics

- 38 join records for 38 scored rows (one per scored row: yes)
- Matched: 38/38
- Unmatched: none

## 5. Team coverage

- 32/32 covered (threshold ≥ 28/32) → **pass**
- Missing: none

## 6. Scored-row coverage

- 38/38 matched (100.0%; threshold ≥ 80.0%) → **pass**

## 7. Non-null-cell coverage

- 114/114 real governed cells (100.0%; threshold ≥ 75.0%) → **pass**
- Null cells by column: epaPerPlay=0, successRate=0, redZoneTdRate=0
- Scoped to the Run 2 Teamstate feature columns; pressure and the 8 fantasy split fields are excluded by contract and do not count against coverage; `redZoneTdRate` partial nulls counted honestly (no zero-fill).

## 8. Position coverage

| Position | Matched | Scored | Ratio |
| --- | --- | --- | --- |
| QB | 8 | 8 | 100.0% |
| RB | 10 | 10 | 100.0% |
| WR | 14 | 14 | 100.0% |
| TE | 6 | 6 | 100.0% |

## 9. Result

- **Final gate status:** `teamstate_coverage_gate_passed` (PASSED)
- **Final decision:** `may_rerun_unchanged_comparison`
- **Next step:** Open a separate issue for an UNCHANGED #86-style three-arm comparison rerun (same population/target/folds/model/null-handling). Do not rerun here.

## Reproduce

```bash
npm run evaluate:run2-coverage-gate   # regenerate this report (network-free)
npm run build                         # tsc --noEmit
npm test                              # incl. tests/run2CoverageGateEvaluation.test.ts
```
