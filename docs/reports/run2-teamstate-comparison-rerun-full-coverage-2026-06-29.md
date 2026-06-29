# Run 2 Teamstate comparison rerun — full coverage

_Generated 2026-06-29 • record run2-teamstate-comparison-rerun-full-coverage-v1 • status: **completed** • signal: **failed_sanity_control**_

This is the **authorized unchanged rerun** of the #86 three-arm comparison after the Teamstate coverage gate passed (#94/#95, `may_rerun_unchanged_comparison`). The only change from the prior run is the **source binding**: the team-week values are the full 32-team gate-passed governed set instead of the original 3-team fixture. No model, population, target, folds, hyperparameters, features, null handling, shuffled-control, metrics, or interpretation labels changed. The goal was to measure what the same experiment says once the coverage defect is removed — not to obtain a better result. This is one controlled experiment and makes **no** claim that Teamstate is predictive in general; it is not product/advice output.

## 1. Experiment identity

- Issue: `TIBER-Forecast#96` • rerun date 2026-06-29
- Relation: #86 (harness) → #88 (first outcome) → #90 (failed-sanity audit) → #92 (gate) → #94 (gate **passed**)
- Source team-week values: `data/fixtures/teamstate/teamstate_team_week_values_2024.json`
- Governed source sha256: `2aed00e68c1620af10d2ea4350104f7e183ff6ee050f5d385a503ef027281de9`
- Refs: `TIBER-Data#181`, `TIBER-Data#182`, `TIBER-Teamstate#72`, `TIBER-Forecast#94`
- Gate status (#94): `teamstate_coverage_gate_passed` → `may_rerun_unchanged_comparison`
- Authorized unchanged rerun after gate pass: yes

## 2. Invariant confirmation (unchanged)

- Population, target, folds, model class, ridge lambda (1), train-fold standardization, train-fold mean imputation, prediction clipping: **unchanged** (all from the frozen harness).
- Run 1 feature columns: `ppr_2024, ppr_per_game_2024, games_2024, targets_2024, rush_attempts_2024`
- Teamstate feature columns: `epaPerPlay, successRate, redZoneTdRate`
- Null handling: `train_fold_mean_imputation`; shuffled-control intact: yes
- **Source-binding update only:** team-week values replaced by the full 32-team gate-passed governed set.

## 3. Coverage summary

- Candidate observations: 39 • scored rows: 38
- Teamstate matched rows: 39 • unmatched: 0
- Imputed (null) Teamstate cells — real arm: 0, shuffled arm: 0 (vs ~93/114 in the original sparse run)
- Teamstate feature columns: `epaPerPlay, successRate, redZoneTdRate`; pressure excluded/deferred; fantasy splits absent/excluded.

## 4. Metrics by arm

| Arm | n | MAE | RMSE | Pearson | Rank corr |
| --- | --- | --- | --- | --- | --- |
| run1_baseline | 38 | 35.1477 | 43.6404 | 0.7286 | 0.7057 |
| real_teamstate_run2 | 38 | 36.4087 | 43.8178 | 0.7267 | 0.6973 |
| shuffled_teamstate_control | 38 | 34.3619 | 43.4655 | 0.7324 | 0.6855 |

Directionality: lower MAE / RMSE is better; higher correlations are better.

## 5. Deltas

| Comparison | ΔMAE | ΔRMSE | ΔPearson | ΔRank | MAE improved |
| --- | --- | --- | --- | --- | --- |
| real_teamstate_run2_minus_run1_baseline | 1.261064 | 0.177413 | -0.001934 | -0.008316 | no |
| shuffled_teamstate_control_minus_run1_baseline | -0.785765 | -0.174937 | 0.003783 | -0.020133 | yes |
| real_teamstate_run2_minus_shuffled_teamstate_control | 2.04683 | 0.35235 | -0.005717 | 0.011817 | no |

## 6. Interpretation

- Real Teamstate improved vs Run 1: **false**
- Shuffled improved vs Run 1: **true**
- Real improved vs shuffled: **false**
- Signal interpretation: `failed_sanity_control`
- Harness recommendation: The shuffled control beat the real arm: do NOT attribute any improvement to Teamstate. Investigate join/leakage/variance before any further Run 2 work.

## 7. Decision / next step

- **Next step:** `audit_failed_sanity_control_again`
- Even with full 32-team coverage and zero imputed Teamstate cells, the shuffled control beat the real arm and real Teamstate did not improve Run 1 — the sanity control fails again. The coverage defect is removed, so sparse coverage is no longer an available explanation for this setup. This is **not** evidence that Teamstate works; do not attribute any movement to Teamstate signal. Audit the failed sanity control (join/leakage/variance/feature-shape) — or pause the Teamstate Run 2 path — before any further Run 2 work. No signal claim is made.

## Reproduce

```bash
npm run rerun:run2-comparison-full-coverage   # regenerate this report (network-free)
npm run build                                  # tsc --noEmit
npm test                                       # incl. tests/run2ComparisonRerunFullCoverage.test.ts
```
