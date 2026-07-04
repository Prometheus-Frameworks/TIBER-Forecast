# Promoted-source controlled rerun (#121)

_Generated 2026-07-04 • player-history-promoted-controlled-rerun-v1 • **experimental_promoted_source_result_not_production_signal**_

**Decision: `promoted_player_history_signal_replicated_requires_followup`**

This is an ISOLATED controlled rerun against the PROMOTED-governed mirrors from #119/PR #120. No production Forecast behavior changed; no feature binding occurred; no product-facing player-history signal is claimed; no fantasy advice/rankings/start-sit/trade/draft output was produced; no TIBER-Data change or artifact promotion/demotion occurred. Metrics below exist only inside this report. The archived #110 candidate mirrors remain untouched.

## 1. Inputs and preflight (all verified fail-closed before execution)

- Outcome mirror: `data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json` (sha256 `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035`, status `promoted_governed_artifact`)
- Input mirror: `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json` (2022-2024 REG only; no 2025 rows)
- #119 mirror-refresh gate (re-verified): status `passed` • decision `may_open_promoted_controlled_rerun_issue`
- Candidate-source reference: #112 decision `candidate_player_history_signal_observed_requires_followup`, #116 robustness decision `candidate_signal_survives_initial_robustness_checks`

## 2. Design (verbatim #112 design; only the source mirrors changed)

- Arms: `baseline_only`, `real_player_history_features`, `shuffled_player_history_control`
- Validation: leave-one-out cross-validation, 610 folds (fold order = sorted player_id; fully deterministic)
- Baseline: train-fold position mean; consumes no player-history payloads
- Feature arms: ridge (lambda=1, intercept unpenalized) on position dummies + has_history indicator + player-history columns across the 5 #104 families; train-fold-only imputation and z-scoring
- Shuffled control: `seeded_derangement_within_position_pre_outcome_independent`, seed 20260702
- Population: 610 evaluated rows (485 joined, 125 no-history); by position: QB 81, RB 151, TE 138, WR 240
- Shuffled-control integrity: 485 donors assigned, 0 self-donations, 0 cross-position donations

## 3. Metrics by arm (experimental promoted-source results, NOT production signal)

### Overall (n=610)

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 610 | 67.020 | 84.764 | 0.161 | -0.174 |
| real_player_history | 610 | 42.182 | 58.603 | 0.731 | 0.648 |
| shuffled_control | 610 | 67.720 | 85.718 | 0.162 | 0.110 |

### Joined only (primary comparison population, n=485)

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 485 | 68.926 | 88.553 | 0.180 | -0.158 |
| real_player_history | 485 | 40.034 | 57.287 | 0.771 | 0.751 |
| shuffled_control | 485 | 72.031 | 90.409 | 0.117 | 0.068 |

### No-history subgroup (n=125)

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 125 | 59.624 | 68.096 | 0.086 | -0.185 |
| real_player_history | 125 | 50.515 | 63.452 | -0.092 | -0.276 |
| shuffled_control | 125 | 50.993 | 64.361 | 0.058 | -0.185 |

### Position QB

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 81 | 99.814 | 115.049 | -1.000 | -1.000 |
| real_player_history | 81 | 65.468 | 83.806 | 0.678 | 0.579 |
| shuffled_control | 81 | 102.679 | 118.133 | -0.076 | -0.116 |

### Position RB

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 151 | 75.881 | 94.987 | -1.000 | -1.000 |
| real_player_history | 151 | 49.638 | 67.022 | 0.704 | 0.539 |
| shuffled_control | 151 | 76.580 | 95.625 | 0.071 | 0.042 |

### Position TE

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 138 | 48.753 | 61.304 | -1.000 | -1.000 |
| real_player_history | 138 | 30.431 | 42.508 | 0.716 | 0.617 |
| shuffled_control | 138 | 52.135 | 65.573 | -0.107 | -0.115 |

### Position WR

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 240 | 60.881 | 77.182 | -1.000 | -1.000 |
| real_player_history | 240 | 36.389 | 49.933 | 0.761 | 0.689 |
| shuffled_control | 240 | 59.307 | 75.761 | 0.183 | 0.126 |

## 4. Pairwise comparisons (MAE delta = second arm minus first; positive favors the first arm)

| Comparison | Subgroup | MAE delta | RMSE delta | Better on MAE |
|---|---|---|---|---|
| baseline_only_vs_real_player_history_features | overall | -24.838 | -26.161 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | overall | 0.700 | 0.954 | baseline_only |
| real_player_history_features_vs_shuffled_player_history_control | overall | 25.538 | 27.115 | real_player_history_features |
| baseline_only_vs_real_player_history_features | joined_only | -28.892 | -31.266 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | joined_only | 3.104 | 1.855 | baseline_only |
| real_player_history_features_vs_shuffled_player_history_control | joined_only | 31.997 | 33.122 | real_player_history_features |
| baseline_only_vs_real_player_history_features | no_history_only | -9.109 | -4.644 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | no_history_only | -8.631 | -3.735 | shuffled_player_history_control |
| real_player_history_features_vs_shuffled_player_history_control | no_history_only | 0.477 | 0.910 | real_player_history_features |
| baseline_only_vs_real_player_history_features | position_QB | -34.347 | -31.243 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_QB | 2.865 | 3.084 | baseline_only |
| real_player_history_features_vs_shuffled_player_history_control | position_QB | 37.211 | 34.326 | real_player_history_features |
| baseline_only_vs_real_player_history_features | position_RB | -26.243 | -27.964 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_RB | 0.698 | 0.638 | baseline_only |
| real_player_history_features_vs_shuffled_player_history_control | position_RB | 26.941 | 28.602 | real_player_history_features |
| baseline_only_vs_real_player_history_features | position_TE | -18.322 | -18.796 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_TE | 3.383 | 4.269 | baseline_only |
| real_player_history_features_vs_shuffled_player_history_control | position_TE | 21.704 | 23.065 | real_player_history_features |
| baseline_only_vs_real_player_history_features | position_WR | -24.492 | -27.249 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_WR | -1.573 | -1.420 | shuffled_player_history_control |
| real_player_history_features_vs_shuffled_player_history_control | position_WR | 22.919 | 25.828 | real_player_history_features |

## 5. Comparison to the #112/#116 candidate-source result

| Metric | Candidate (#112) | Promoted rerun (#121) | Delta |
|---|---|---|---|
| joined MAE (baseline_only) | 68.926 | 68.926 | 0.000 |
| joined MAE (real_player_history_features) | 40.034 | 40.034 | 0.000 |
| joined MAE (shuffled_player_history_control) | 72.031 | 72.031 | 0.000 |
| joined RMSE (real_player_history_features) | 57.287 | 57.287 | 0.000 |

- Candidate (#112) decision: `candidate_player_history_signal_observed_requires_followup` (real beat both comparators: **true**)
- Promoted rerun (#121) real beat both comparators: **true**
- Directionally consistent: **true**
- The promoted-source rerun replicates the #112 candidate-source signal direction: the real player-history arm beats both baseline and shuffled control on joined MAE in both runs.

## 6. Decision

- **`promoted_player_history_signal_replicated_requires_followup`**
- Primary metric: joined_population_mae • real beats baseline: **true** • real beats shuffled: **true** • real beats shuffled on secondary (joined_population_rmse): **true** • directionally consistent with candidate: **true**
- The real player-history arm beat both the baseline and the position-stratified shuffled control on joined-population MAE, beat the shuffled control on RMSE, and this is directionally consistent with the #112 candidate-source result. This is an experimental promoted-source result only -- not a production signal; a follow-up review issue is required before anything further.

## 7. Non-goals confirmed

- No production Forecast behavior was modified; nothing was wired into `seasonalPprModel.ts`; the production baseline is unchanged.
- No product routes or UI surfaces were added; no fantasy advice, rankings, start/sit, trade, or draft output was produced.
- No TIBER-Data or Teamstate change; no Data artifact promotion/demotion.
- No 2025 player-season summary was consumed as a 2025 input feature; no availability/ownership/depth/injury status was inferred.
- No null was coerced to zero outside the documented train-fold imputation policy.
- The archived #110 candidate mirrors were not modified.
- No production signal is claimed. The replicated result requires its own follow-up review issue before anything further.

## 8. Next allowed step

Open a SEPARATE follow-up review/design issue for production-binding prerequisites or feature-contract design. This result does not itself authorize production binding, seasonalPprModel.ts wiring, Data artifact promotion, or product output; a positive replicated result requires its own review before anything further.

## Reproduce

```bash
npm run experiment:player-history-promoted-controlled-rerun   # deterministic, network-free
npm run build && npm test
```
