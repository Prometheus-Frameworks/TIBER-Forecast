# Controlled player-history experiment (#111)

_Generated 2026-07-02 • player-history-controlled-run-v1 • **experimental_candidate_result_not_production_signal**_

**Decision: `candidate_player_history_signal_observed_requires_followup`**

This is an ISOLATED controlled experiment. The source artifact remains candidate evidence (not promoted); no production Forecast behavior changed; no feature binding occurred; no product-facing player-history signal is claimed; no fantasy advice/rankings/start-sit/trade/draft output was produced. Metrics below exist only inside this report.

## 1. Inputs and prior gates (all verified fail-closed before execution)

- Outcome mirror: `data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json` (sha256 `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`, status `candidate_evidence_artifact_not_promoted`)
- Input mirror: `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json` (2022-2024 REG only; no 2025 rows)
- Source-gate re-verification: `may_continue_mirror_build` • Target-population gate: `may_continue_to_overlap_gate` • Dry-run matrix: `dry_run_only_not_model_ready` • Mirror-overlap gate: `may_authorize_run_issue`

## 2. Design

- Arms: `baseline_only`, `real_player_history_features`, `shuffled_player_history_control`
- Validation: leave-one-out cross-validation, 610 folds (fold order = sorted player_id; fully deterministic)
- Baseline: train-fold position mean (see JSON `baseline_choice_rationale`); consumes no player-history payloads
- Feature arms: ridge (lambda=1, intercept unpenalized) on position dummies + has_history indicator + 26 player-history columns across the 5 #104 families; train-fold-only imputation (the #104 primitives) and z-scoring
- Shuffled control: `seeded_derangement_within_position_pre_outcome_independent`, seed 20260702
- Population: 610 evaluated rows (485 joined, 125 no-history); by position: QB 81, RB 151, TE 138, WR 240
- Shuffled-control integrity: 485 donors assigned, 0 self-donations, 0 cross-position donations

## 3. Metrics by arm (experimental candidate results, NOT production signal)

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

Note on the per-position baseline correlations: within a single position, the leave-one-out position-mean prediction is a deterministic decreasing function of the held-out player's own outcome (a higher own outcome lowers the everyone-else mean), so its within-position Pearson/Spearman is exactly -1. This is a well-known LOOCV artifact of a group-mean baseline evaluated inside its own group, not a bug; MAE/RMSE are the primary comparison metrics, and the pooled (overall/joined) correlations are unaffected because they span positions.

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

## 5. Decision

- **`candidate_player_history_signal_observed_requires_followup`**
- Primary metric: joined_population_mae • real beats baseline: **true** • real beats shuffled: **true** • real beats shuffled on secondary (joined_population_rmse): **true**
- The real player-history arm beat both the baseline and the position-stratified shuffled control on joined-population MAE, and beat the shuffled control on RMSE. This is an experimental candidate result only -- not a production signal; a follow-up review issue is required before anything further.

## 6. Non-goals confirmed

- No production Forecast behavior was modified; nothing was wired into `seasonalPprModel.ts`; the production baseline is unchanged.
- No product routes or UI surfaces were added; no fantasy advice, rankings, start/sit, trade, or draft output was produced.
- No TIBER-Data or Teamstate change; no Data artifact promotion (the source remains `candidate_evidence_artifact_not_promoted`).
- No 2025 player-season summary was consumed as a 2025 input feature; no availability/ownership status was inferred.
- No null was coerced to zero outside the documented train-fold imputation policy.
- No production signal is claimed. The candidate result requires its own follow-up review issue before anything further.

## 7. Next allowed step

Open a follow-up review issue for this experimental result. No decision from this run authorizes production binding, seasonalPprModel.ts wiring, Data artifact promotion, or product output -- a positive candidate result requires its own review; a negative or inconclusive result stands as recorded.

## Reproduce

```bash
npm run experiment:player-history-controlled-run   # deterministic, network-free (~4.2s)
npm run build && npm test
```
