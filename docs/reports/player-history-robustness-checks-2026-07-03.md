# Player-history robustness checks (#115)

_Generated 2026-07-03 • player-history-robustness-checks-v1 • **experimental_candidate_result_not_production_signal**_

**Classification: `candidate_signal_survives_initial_robustness_checks`**

Review-only robustness diagnostics for the #112 candidate signal, per the #113/#114 prioritization. **#112 remains the primary recorded controlled run** — nothing here replaces or mutates it. Same isolated experiment path, same fail-closed preflight (reused `assertControlledRunPreconditions`), same mirrors (candidate/not-promoted, pinned sha `39b6e71e36d6…`). No production behavior change, no binding, no promotion, no production signal claim, no advice/product output.

Population: 610 evaluated rows (485 joined, 125 no-history). Reference joined-population MAE: baseline 68.926, full real 40.034.

## P1 — Feature-family ablation (real arm, joined population)

| Variant | columns | n | MAE | RMSE | Pearson | Spearman | MAE gain vs baseline | MAE gain vs shuffled |
|---|---|---|---|---|---|---|---|---|
| full_feature_set | 26 | 485 | 40.034 | 57.287 | 0.771 | 0.751 | 28.892 | 31.997 |
| production_only | 9 | 485 | 40.173 | 57.302 | 0.770 | 0.736 | 28.754 | 30.555 |
| usage_only | 8 | 485 | 46.845 | 66.931 | 0.667 | 0.653 | 22.081 | 23.840 |
| coverage_only | 4 | 485 | 55.653 | 73.303 | 0.578 | 0.604 | 13.273 | 15.385 |
| age_career_team_context_only | 5 | 485 | 63.371 | 82.055 | 0.407 | 0.409 | 5.555 | 7.098 |
| ppr_2024_alone | 1 | 485 | 42.997 | 61.100 | 0.733 | 0.683 | 25.929 | 27.352 |

Per-position joined MAE (real arm): full_feature_set: {QB 66.0, RB 46.9, TE 25.8, WR 35.4} • production_only: {QB 62.4, RB 46.4, TE 27.6, WR 36.3} • usage_only: {QB 96.0, RB 47.4, TE 29.0, WR 40.2} • coverage_only: {QB 70.8, RB 68.5, TE 38.2, WR 53.2} • age_career_team_context_only: {QB 96.3, RB 73.8, TE 44.1, WR 57.2} • ppr_2024_alone: {QB 65.9, RB 47.7, TE 30.6, WR 39.7}

No-history subgroup MAE (real arm): full_feature_set 50.5 • production_only 50.3 • usage_only 51.3 • coverage_only 50.8 • age_career_team_context_only 50.5 • ppr_2024_alone 50.3

Overall MAE/RMSE (real arm): full_feature_set 42.2/58.6 • production_only 42.3/58.6 • usage_only 47.8/66.8 • coverage_only 54.6/71.5 • age_career_team_context_only 60.7/78.6 • ppr_2024_alone 44.5/61.5

**Attribution: production_only (joined MAE 40.173) is within 0.138 of the full set (40.034), so the production family (prior-year/trailing PPR totals, means, trend) carries essentially all of the candidate signal; usage, coverage, and age/team-context add ~no marginal joined-population MAE beyond it. ppr_2024 alone reaches 42.997, so the production family's aggregates add the remaining margin over bare prior-year continuity. Any future feature-contract work should weigh the non-production families accordingly.**

## P2 — Stronger simple baseline: per-position train-fold OLS on prior-year PPR

| View | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| joined | 485 | 43.468 | 61.038 | 0.735 | 0.696 |
| overall | 610 | 46.779 | 62.550 | 0.691 | 0.576 |
| no-history | 125 | 59.624 | 68.096 | 0.086 | -0.185 |

- MAE gain vs position-mean baseline: 25.458
- MAE gap vs full real arm (positive = full better): 3.434
- MAE gap vs ppr_2024-alone ridge (positive = ridge better): 0.471

## P3 — Ridge λ sensitivity (full feature set, joined population)

| λ | n | MAE | RMSE | Pearson | Spearman | beats baseline |
|---|---|---|---|---|---|---|
| 0.1 | 485 | 40.114 | 57.400 | 0.770 | 0.751 | true |
| 1 | 485 | 40.034 | 57.287 | 0.771 | 0.751 | true |
| 10 | 485 | 40.046 | 57.096 | 0.772 | 0.750 | true |
| 100 | 485 | 40.947 | 57.687 | 0.766 | 0.739 | true |

## P4 — Repeated shuffled-control seeds (joined population)

| Seed | original | n | MAE | RMSE | Pearson | Spearman | donors | self | cross-pos |
|---|---|---|---|---|---|---|---|---|---|
| 20260702 | true | 485 | 72.031 | 90.409 | 0.117 | 0.068 | 485 | 0 | 0 |
| 20260703 | false | 485 | 70.742 | 90.788 | 0.102 | 0.033 | 485 | 0 | 0 |
| 20260704 | false | 485 | 72.300 | 91.398 | 0.036 | -0.022 | 485 | 0 | 0 |
| 20260705 | false | 485 | 69.116 | 87.376 | 0.253 | 0.155 | 485 | 0 | 0 |
| 20260706 | false | 485 | 71.800 | 90.548 | 0.109 | 0.015 | 485 | 0 | 0 |

Per-position joined shuffled MAE by seed: 20260702: {QB 110.5, RB 81.1, TE 53.0, WR 64.7} • 20260703: {QB 103.8, RB 80.8, TE 48.6, WR 66.5} • 20260704: {QB 109.8, RB 80.5, TE 49.6, WR 68.0} • 20260705: {QB 101.1, RB 76.3, TE 48.9, WR 65.9} • 20260706: {QB 102.0, RB 83.0, TE 49.5, WR 68.0}

## P5 — Outlier / partial-season leverage sensitivity

Top-10 absolute-error rows excluded per arm (joined population; **primary #112 metrics untouched**):

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 475 | 64.421 | 79.416 | 0.183 | -0.171 |
| real_player_history | 475 | 36.825 | 50.436 | 0.806 | 0.759 |
| shuffled_control | 475 | 67.631 | 81.694 | 0.129 | 0.070 |

- Real still beats baseline after trim: **true**
- Partial-season sensitivity: **not computed** — the #109 outcome mirror is deliberately outcome+identity+provenance only and carries no coverage_status/games_for_ppg, so partial-season 2025 outcome rows are not identifiable from the artifacts this run may consume. Minimal source change: a future #109-mirror regeneration may add coverage_status and games_for_ppg to outcome mirror rows (outcome-layer metadata, not input features); the target-population gate would gain matching scope checks.

## Classification

**`candidate_signal_survives_initial_robustness_checks`** (pre-registered weakened margin: 5%)

| Criterion | Result | Detail |
|---|---|---|
| all_required_metrics_defined | pass | all joined-population metrics defined |
| full_real_beats_position_mean_baseline | pass | full 40.034 vs baseline 68.926 |
| full_real_beats_every_shuffled_seed | pass | full 40.034 vs seeds [72.03, 70.74, 72.30, 69.12, 71.80] |
| full_real_beats_baseline_at_every_lambda | pass | λ=0.1: 40.11; λ=1: 40.03; λ=10: 40.05; λ=100: 40.95 |
| real_still_beats_baseline_after_top_k_trim | pass | trimmed real 36.825 vs trimmed baseline 64.421 |
| full_set_beats_stronger_simple_comparators_by_margin | pass | full 40.034 vs min(ppr_2024-alone 42.997, prior-year baseline 43.468) with 5% margin |

The candidate signal remains directionally strong across ablation, the stronger prior-year baseline, the lambda sweep, five shuffled seeds, and the leverage trim. This remains an experimental candidate result -- not production evidence and not a promotion/binding authorization.

## Non-goals confirmed

- These are robustness diagnostics only; #112 remains the primary recorded controlled run.
- No production Forecast behavior changed; nothing was wired into `seasonalPprModel.ts`; the production baseline is unchanged.
- No feature binding occurred; no product routes/UI; no fantasy advice, rankings, start/sit, trade, or draft output.
- No source artifact was promoted; the source remains `candidate_evidence_artifact_not_promoted`; no TIBER-Data/Teamstate change.
- No production signal is claimed.

## Next recommended issue

TIBER-Data: promote player_season_coverage_v0 after source-backed governance review (per the #114 section-4 sketch) -- the signal survived the bounded checks, so upstream governance is now the blocking prerequisite for any binding path.

## Reproduce

```bash
npm run experiment:player-history-robustness   # deterministic, network-free
npm run build && npm test
```
