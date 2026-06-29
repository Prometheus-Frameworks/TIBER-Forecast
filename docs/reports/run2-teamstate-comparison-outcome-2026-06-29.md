# Run 2 Teamstate comparison outcome

_Generated 2026-06-29 • record run2-teamstate-comparison-outcome-v1 • status: **completed**_

This is a durable checkpoint of one controlled experiment: how the governed TTS / Teamstate artifact changed the existing Run 1 baseline, with a shuffled-Teamstate control. It records an outcome and a next-step decision — it does **not** tune the model, add features, or change the data/folds/target/evaluation/null-handling. It is **not** proof of general predictive value and contains no fantasy advice or product claims.

## 1. Experiment identity

- Repo: `Prometheus-Frameworks/TIBER-Forecast`
- Comparison version: `run2-teamstate-comparison-v1`
- Input season: 2024 → target season: 2025
- Target definition: Full-season total PPR fantasy points scored in the 2025 NFL regular season, predicted from 2024-season input features only.
- Evaluation method: Leave-one-out cross-validation (LOOCV) over scored rows; ridge (lambda=1.0) over standardized features + position one-hot, identical across all three arms (same population, target, folds, model family).
- Model family: `seasonal-ppr-ridge` (ridge λ=1)
- Null handling: `train_fold_mean_imputation`
- Recorded forecast cutoff: input season `2024`, as-of `2025-03-01T00:00:00.000Z` (target-season start `2025-09-01T00:00:00.000Z`; source generated-at `2026-06-25T19:20:51+00:00`)
- Source artifact refs: `exports/governed/team_week_raw_v0/2024/team_week_raw_v0.jsonl`
- Validation refs: `exports/governed/team_week_raw_v0/2024/validation-report.json`
- Lineage refs: `exports/governed/team_week_raw_v0/2024/lineage-manifest.json`
- Linked issues/PRs: #82, #84, #86

## 2. Three-arm metrics

| Arm | Sample size | MAE | RMSE | Pearson | Rank corr |
| --- | --- | --- | --- | --- | --- |
| run1_baseline | 38 | 35.1477 | 43.6404 | 0.7286 | 0.7057 |
| real_teamstate_run2 | 38 | 38.5329 | 47.3157 | 0.6780 | 0.6790 |
| shuffled_teamstate_control | 38 | 38.5035 | 47.3062 | 0.6783 | 0.6790 |

Per-position MAE (where the Run 1 evaluation produces it):

| Arm | QB | RB | WR | TE |
| --- | --- | --- | --- | --- |
| run1_baseline | 26.69 | 39.79 | 43.88 | 18.30 |
| real_teamstate_run2 | 34.24 | 45.18 | 44.90 | 18.32 |
| shuffled_teamstate_control | 34.08 | 45.22 | 44.89 | 18.33 |

## 3. Deltas (directionality: negative MAE delta = lower error / improvement; positive = worse)

| Comparison | MAE Δ | RMSE Δ | Pearson Δ | Rank corr Δ | MAE direction |
| --- | --- | --- | --- | --- | --- |
| real_teamstate_run2_minus_run1_baseline | 3.385228 | 3.675288 | -0.050578 | -0.026699 | worse |
| shuffled_teamstate_control_minus_run1_baseline | 3.355853 | 3.665742 | -0.050287 | -0.026699 | worse |
| real_teamstate_run2_minus_shuffled_teamstate_control | 0.029375 | 0.009546 | -0.000291 | 0.000000 | worse |

## 4. How the TTS artifact changed Run 1

- Added Teamstate/TTS feature columns: epaPerPlay, successRate, redZoneTdRate.
- 8 of 38 scored rows had matched governed Teamstate values; 31 rows were unmatched and kept null (null-preserved).
- Null/partial-null Teamstate values were handled by train_fold_mean_imputation (non-leaky; never silent raw zero-fill).
- Under the primary MAE metric, real governed Teamstate raised error (worsened) vs Run 1; the shuffled control raised error (worsened) vs Run 1.
- Conservative reading: failed_sanity_control. This is one controlled experiment on the current (fixture/scaffold-scale) coverage and is NOT evidence of general predictive value.

## 5. Interpretation and decision

Machine-readable interpretation (copied from the #86 comparison):

- `real_teamstate_improved_vs_run1`: false
- `shuffled_improved_vs_run1`: false
- `real_improved_vs_shuffled`: false
- `signal_interpretation`: **failed_sanity_control**
- `failure_reason_if_any`: null
- `recommendation_for_next_step`: The shuffled control beat the real arm: do NOT attribute any improvement to Teamstate. Investigate join/leakage/variance before any further Run 2 work.

### Operator decision

- Status: **inspect_join_or_leakage_before_next_run**
- No metric claim: false
- Rationale: The shuffled control beat the real arm: the sanity control failed. Do not attribute anything to Teamstate; investigate join/leakage/variance before any follow-up.

Caveats:
- One controlled experiment on a small fixture-scale population; NOT proof of general predictive value.
- MAE is the primary metric; correlation/rank-correlation are secondary and reported for transparency.
- Real and shuffled arms differ only in Teamstate values; identical population, target, folds, model family, and Run 1 features.

---
- Durable checkpoint/decision record for the Run 2 three-arm comparison (#86); it records an outcome and does NOT tune the model, add features, or change data/folds/target/eval/null-handling.
- No fantasy advice, player rankings, start/sit, trade, draft, or product claims; no claim that Teamstate is proven predictive in general.
- If comparison_status is fail_closed, no metric claim can be made.
