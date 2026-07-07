# Player-history 2024-from-2021-2023 additional validation (#137)

_Generated 2026-07-07 • player-history-2024-from-2021-2023-additional-validation-v1 • **experimental_2024_from_2021_2023_result_not_production_signal**_

**Decision: `may_open_player_history_2024_from_2021_2023_threshold_review_issue`**

Runs the bounded additional-validation pass authorized by #136's decision `may_open_player_history_2024_from_2021_2023_additional_validation_issue` against the #136 refreshed mirrors ONLY. Computes and reports validation metrics for the 2024 target window; does not decide a threshold, does not bind anything into production Forecast, and makes no production-readiness or leakage-audit-complete claim. No TIBER-Data change.

## 1. Preconditions (re-verified directly against the mirrors this run consumes)

- #136 mirror-refresh gate (re-verified): status `passed` • decision `may_open_player_history_2024_from_2021_2023_additional_validation_issue`
- Outcome mirror: `data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json` (sha256 `d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac`, promotion review `TIBER-Data#202`)
- Input mirror: `data/fixtures/tiberData/player_history_2021_2023_input_mirror.json` (2021-2023 REG only; 0 rows at or beyond target season 2024)
- Preconditions: 17/17 checks passed — integrity_passed=**true**, floors_passed=**true**
- Observed overlap: joined 470 of 588 scored (share 0.7993), by position {"QB":67,"TE":103,"WR":184,"RB":116}

## 2. Design (same #111/#121 design; feature window re-keyed to 2023/2022/2021)

- Arms: `baseline_only`, `real_player_history_features`, `shuffled_player_history_control`
- Validation: leave-one-out cross-validation, 588 folds (fold order = sorted player_id; fully deterministic)
- Baseline: train-fold position mean; consumes no player-history payloads
- Feature arms: ridge (lambda=1, intercept unpenalized) on position dummies + has_history indicator + player-history columns across the 5 #104 families; train-fold-only imputation and z-scoring
- Shuffled control: `seeded_derangement_within_position_pre_outcome_independent`, seed 20260707
- Population: 588 evaluated rows (470 joined, 118 no-history); by position: QB 78, RB 148, TE 128, WR 234
- Shuffled-control integrity: 470 donors assigned, 0 self-donations, 0 cross-position donations

## 3. Metrics by arm (experimental 2024-from-2021-2023 results, NOT production signal)

### Overall (n=588)

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 588 | 71.230 | 88.338 | 0.174 | -0.164 |
| real_player_history | 588 | 46.667 | 64.111 | 0.700 | 0.615 |
| shuffled_control | 588 | 69.310 | 87.652 | 0.240 | 0.237 |

### Joined only (primary comparison population, n=470)

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 470 | 71.908 | 90.325 | 0.158 | -0.163 |
| real_player_history | 470 | 44.818 | 60.649 | 0.747 | 0.714 |
| shuffled_control | 470 | 73.457 | 90.612 | 0.179 | 0.148 |

### No-history subgroup (n=118)

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 118 | 68.526 | 79.936 | 0.246 | -0.147 |
| real_player_history | 118 | 54.032 | 76.358 | 0.089 | -0.350 |
| shuffled_control | 118 | 52.790 | 74.705 | 0.225 | -0.054 |

### Position QB

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 78 | 103.381 | 122.245 | -1.000 | -1.000 |
| real_player_history | 78 | 71.872 | 94.610 | 0.621 | 0.559 |
| shuffled_control | 78 | 100.623 | 120.715 | 0.123 | 0.145 |

### Position RB

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 148 | 75.433 | 93.287 | -1.000 | -1.000 |
| real_player_history | 148 | 46.866 | 64.535 | 0.719 | 0.622 |
| shuffled_control | 148 | 71.522 | 91.222 | 0.208 | 0.262 |

### Position TE

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 128 | 49.168 | 61.404 | -1.000 | -1.000 |
| real_player_history | 128 | 32.285 | 44.416 | 0.684 | 0.548 |
| shuffled_control | 128 | 49.735 | 62.957 | 0.097 | 0.105 |

### Position WR

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | 234 | 69.922 | 84.031 | -1.000 | -1.000 |
| real_player_history | 234 | 46.007 | 60.260 | 0.696 | 0.596 |
| shuffled_control | 234 | 68.180 | 83.768 | 0.135 | 0.114 |

## 4. Pairwise comparisons (MAE delta = second arm minus first; positive favors the first arm)

| Comparison | Subgroup | MAE delta | RMSE delta | Better on MAE |
|---|---|---|---|---|
| baseline_only_vs_real_player_history_features | overall | -24.563 | -24.227 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | overall | -1.920 | -0.686 | shuffled_player_history_control |
| real_player_history_features_vs_shuffled_player_history_control | overall | 22.643 | 23.541 | real_player_history_features |
| baseline_only_vs_real_player_history_features | joined_only | -27.090 | -29.676 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | joined_only | 1.549 | 0.287 | baseline_only |
| real_player_history_features_vs_shuffled_player_history_control | joined_only | 28.639 | 29.963 | real_player_history_features |
| baseline_only_vs_real_player_history_features | no_history_only | -14.493 | -3.578 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | no_history_only | -15.735 | -5.231 | shuffled_player_history_control |
| real_player_history_features_vs_shuffled_player_history_control | no_history_only | -1.242 | -1.653 | shuffled_player_history_control |
| baseline_only_vs_real_player_history_features | position_QB | -31.509 | -27.635 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_QB | -2.758 | -1.530 | shuffled_player_history_control |
| real_player_history_features_vs_shuffled_player_history_control | position_QB | 28.751 | 26.104 | real_player_history_features |
| baseline_only_vs_real_player_history_features | position_RB | -28.567 | -28.751 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_RB | -3.911 | -2.065 | shuffled_player_history_control |
| real_player_history_features_vs_shuffled_player_history_control | position_RB | 24.656 | 26.686 | real_player_history_features |
| baseline_only_vs_real_player_history_features | position_TE | -16.883 | -16.988 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_TE | 0.568 | 1.553 | baseline_only |
| real_player_history_features_vs_shuffled_player_history_control | position_TE | 17.451 | 18.542 | real_player_history_features |
| baseline_only_vs_real_player_history_features | position_WR | -23.915 | -23.772 | real_player_history_features |
| baseline_only_vs_shuffled_player_history_control | position_WR | -1.742 | -0.264 | shuffled_player_history_control |
| real_player_history_features_vs_shuffled_player_history_control | position_WR | 22.173 | 23.508 | real_player_history_features |

## 5. Decision

- **`may_open_player_history_2024_from_2021_2023_threshold_review_issue`**
- Mirror identity, leakage/provenance integrity, and the #107 population/overlap floors all re-verified directly against the #136 refreshed mirrors, and every required joined-population metric is defined. A SEPARATE issue may be opened to consider a threshold; this decision does not itself accept, reject, or amend any threshold, and does not bind production behavior.

## 6. Non-goals confirmed

- No threshold was accepted, rejected, or amended by this issue.
- No production Forecast behavior was modified; nothing was wired into `seasonalPprModel.ts`; the production baseline is unchanged.
- No product routes or UI surfaces were added; no fantasy advice, rankings, start/sit, trade, or draft output was produced.
- No TIBER-Data change; nothing was promoted or demoted.
- The leakage split is preserved: the input mirror carries zero 2024 rows; the outcome mirror carries only 2024 target values.
- Only the #136 refreshed mirrors were consumed; no prior mirror family (#110 archived candidate, #119/#120 promoted-source) was read or compared against.
- No production-readiness or leakage-audit-complete claim is made.
- The positive decision authorizes only a separate threshold-review issue; it decides nothing about the threshold itself.

## 7. Next allowed step

A SEPARATE issue may be opened to consider a threshold against the metrics recorded above. This decision does not itself accept, reject, or amend any threshold, and does not authorize production binding, feature wiring, or product output.

## Reproduce

```bash
npm run validate:player-history-2024-from-2021-2023-additional   # deterministic, network-free
npm run build && npm test
```
