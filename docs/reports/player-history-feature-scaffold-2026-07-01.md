# Player-history feature extraction scaffold (#103)

_Generated 2026-07-01 • record player-history-feature-scaffold-v1 • scaffold player-history-feature-scaffold-v1_

Feature-extraction scaffold only: this extracts candidate player-history features from the mirrored, real, sha256-pinned 2022-2024 TIBER-Data input window for target season 2025. It performs **no** Forecast run, no Run 3, no model training/tuning/evaluation, no baseline change, no wiring into `seasonalPprModel.ts`, no shuffled control, no three-arm comparison, no TIBER-Data/Teamstate change, no Data artifact promotion, and makes **no player-history signal claim**.

## 1. Mirror inspected

- Mirror file: `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.input_mirror.json`
- Governed source: `Prometheus-Frameworks/TIBER-Data:data/processed/evidence/player_season_coverage_2022_2025.source_backed.json`
- sha256: `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`
- Input seasons: 2022, 2023, 2024 (season_type=REG)
- Target season (excluded as input): 2025
- Refs: `TIBER-Data#184`, `TIBER-Data#185`, `TIBER-Data#186`, `TIBER-Data#187`, `TIBER-Data#188`, `TIBER-Data#189`, `TIBER-Data#190`, `TIBER-Data#191`, `TIBER-Forecast#99`, `TIBER-Forecast#100`, `TIBER-Forecast#101`, `TIBER-Forecast#102`

## 2. Status statements

- forecast_did_not_run: **true**
- no_run3_occurred: **true**
- no_model_training_tuning_evaluation_occurred: **true**
- no_baseline_change_occurred: **true**
- no_feature_binding_into_seasonal_ppr_model_occurred: **true**
- no_shuffled_control_or_three_arm_comparison_occurred: **true**
- no_tiber_data_or_teamstate_change_occurred: **true**
- no_data_artifact_promotion_occurred: **true**
- no_2025_summaries_consumed_as_2025_input: **true**
- no_active_or_ownership_status_inferred: **true**
- no_null_to_zero_coercion_performed: **true**
- no_player_history_signal_claimed: **true**

## 3. Feature families implemented (independently toggleable)

- `coverage`
- `production`
- `usage`
- `age_career`
- `team_context`

## 4. Unavailable usage fields (structurally excluded, never zero-filled)

- `snap_share`
- `routes_run`
- `route_participation`
- `red_zone_targets`
- `red_zone_carries`

## 5. Experiment scope enforcement (fail-closed)

- Approved season_type: `REG`
- Approved positions: `QB`, `RB`, `WR`, `TE`
- buildPlayerHistoryFeatures and summarizePlayerHistoryCoverage both throw if any input row has a season_type other than REG or a position outside QB/RB/WR/TE -- the scaffold does not silently exclude out-of-scope rows, since their presence means the mirror/input boundary itself is wrong.

## 6. Null-handling policy (designed here; NOT wired into any model)

Missing prior seasons and missing source fields stay null; a real value of 0 (e.g. a near-zero game) is never confused with an absent observation. A pure, tested train-fold mean imputation helper (computePlayerHistoryTrainFoldMeans / imputePlayerHistoryValue) is provided for later model code to use per LOOCV fold -- this scaffold does not run or fit anything with it.

Adapted from: `src/rehearsal/runRun2TeamstateComparison.ts (Run 2 Teamstate wrapper), not Run 1's seasonalPprModel.ts, which zero-fills missing numeric features by default`.

## 7. Input-window coverage summary

- Target season: 2025
- Input seasons present: 2022, 2023, 2024
- Total players: 4
- Players by seasons-observed count: {"1":1,"2":2,"3":1}
- Rows considered: 8
- Rows rejected for leakage (season >= target): 0

## 8. Feature rows built

Built 4 candidate feature row(s), one per real mirrored player (row_kind: `player_history_feature_candidate_not_model_ready`):

- `00-0023459` (Aaron Rodgers, QB): input_seasons_considered=[2022, 2023, 2024]
- `00-0026625` (Brian Hoyer, QB): input_seasons_considered=[2022, 2023]
- `00-0027688` (Colt McCoy, QB): input_seasons_considered=[2022]
- `00-0033118` (Kenyan Drake, RB): input_seasons_considered=[2022, 2023]

## 9. Non-goals confirmed

- No Forecast run occurred.
- No Run 3 occurred.
- No feature was bound into `seasonalPprModel.ts`'s numeric feature list.
- No model was trained, tuned, or evaluated.
- No shuffled control or three-arm comparison ran.
- No TIBER-Data or Teamstate change was made.
- No Data artifact was promoted.
- No 2025 summary was consumed as a 2025 input.
- No active/inactive/IR/practice-squad/ownership status was inferred.
- No null value was coerced to zero.
- No player-history signal is claimed by this report.

## Reproduce

```bash
npm run scaffold:player-history-features   # regenerate this report (network-free)
npm run build                              # tsc --noEmit
npm test                                   # incl. tests/playerHistoryFeatureScaffold*.test.ts
```
