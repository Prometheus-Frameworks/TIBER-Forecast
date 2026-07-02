# Player-history experiment dry-run matrix (#105)

_Generated 2026-07-02 • record player-history-experiment-dry-run-matrix-report-v1 • matrix player-history-experiment-dry-run-matrix-v1_

Dry-run matrix assembly only: this proves Forecast can produce baseline-ready, real-player-history-ready, and shuffled-control-ready rows with the correct target/input boundaries, null semantics, provenance, and audit metadata -- **without** running anything. No Forecast run, no Run 3, no model training/tuning/evaluation, no MAE/RMSE/Pearson/rank-correlation, no baseline change, no production feature binding, no `seasonalPprModel.ts` wiring, no TIBER-Data/Teamstate change, and **no player-history signal claim**.

## 1. Inputs inspected

- Player-history mirror: `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.input_mirror.json` (from #103/PR #104)
- Governed source: `Prometheus-Frameworks/TIBER-Data:data/processed/evidence/player_season_coverage_2022_2025.source_backed.json`
- sha256: `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`
- Baseline/target population: `src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts` (governance: `fixture`, source: `bundled-scaffold`)
- Target season: 2025 • Input seasons: 2022, 2023, 2024 (REG only, QB/RB/WR/TE only)
- Predecessors: `TIBER-Data#184`, `TIBER-Data#185`, `TIBER-Data#186`, `TIBER-Data#187`, `TIBER-Data#188`, `TIBER-Data#189`, `TIBER-Data#190`, `TIBER-Data#191`, `TIBER-Forecast#99`, `TIBER-Forecast#100`, `TIBER-Forecast#101`, `TIBER-Forecast#102`, `TIBER-Forecast#103`, `TIBER-Forecast#104`

## 2. Boundary enforcement (inherited from the #104 scaffold, fail-closed)

- No `season >= 2025` player-history row can enter features (leakage filter).
- No pre-target row outside the approved input window (2022, 2023, 2024) can enter.
- Non-REG rows and positions outside QB/RB/WR/TE fail closed.
- Forbidden active/inactive/IR/practice-squad/ownership fields fail closed.
- No null/unavailable value is converted to zero anywhere in the matrix.
- Baseline outcome values are deliberately NOT copied into matrix rows (presence only), so this artifact cannot be reused as a training/evaluation table.

## 3. Arm structure (labels/shape only -- never evaluated here)

1. `baseline_only`
2. `real_player_history_features`
3. `shuffled_player_history_control`

## 4. Matrix + join/exclusion summary

- Matrix rows built: **38** (row_kind: `player_history_experiment_dry_run_matrix_row_not_model_ready`)
- Target population size: 39 (scored: 38, outcome-unavailable: 1)
- Player-history feature players: 4
- Joined rows (target row + real features): **0**
- Target rows without player-history features: 38
- Feature players without a target row: 4
- Exclusions:
  - `00-0039999` (Marvin Harrison Jr., WR): target_outcome_unavailable
  - `00-0023459` (Aaron Rodgers, QB): player_history_features_without_target_row
  - `00-0026625` (Brian Hoyer, QB): player_history_features_without_target_row
  - `00-0027688` (Colt McCoy, QB): player_history_features_without_target_row
  - `00-0033118` (Kenyan Drake, RB): player_history_features_without_target_row

The zero join count is the honest, expected outcome today: the compact #104 mirror (4 players chosen for edge-case coverage) and the n=38 fixture population share no player. The join machinery itself is proven by tests with synthetic aligned identities; widening the mirror to cover the target population is work for the run-authorizing issue.

## 5. Feature-family coverage

- `coverage`: 0/38 matrix rows
- `production`: 0/38 matrix rows
- `usage`: 0/38 matrix rows
- `age_career`: 0/38 matrix rows
- `team_context`: 0/38 matrix rows

## 6. Null / missingness posture

- Posture: `nulls_preserved_no_zero_coercion_train_fold_mean_imputation_deferred_to_run_issue`
- Joined rows inspected: 0
- Null counts by feature path: none (no joined rows to inspect)
- Real zeros observed (preserved distinct from nulls): none (no joined rows to inspect)
- Later train-fold mean imputation (the #104 primitives) would fit per-column means from TRAINING-fold rows only, per fold; nothing was fitted here.

## 7. Shuffled-control posture

- Method: `seeded_derangement_within_position` • Seed: 20260702 • Stratified by position: true
- Metrics computed: **false**
- Groups:
  - QB: 0 feature-bearing row(s); derangement possible: false; applied: false
  - RB: 0 feature-bearing row(s); derangement possible: false; applied: false
  - TE: 0 feature-bearing row(s); derangement possible: false; applied: false
  - WR: 0 feature-bearing row(s); derangement possible: false; applied: false
- Shuffled-control SHAPE only: deterministic within-position donor assignment over feature-bearing rows. No arm was run, no metric was computed, and no comparison is implied. Groups where a derangement is impossible are reported, not repaired.

## 8. Baseline population warning

The current target population (src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts) is still the fixture/scaffold population (governance_status=fixture, n=38 scored). A later controlled run should prefer a real mounted TIBER-Data 2025 outcome population; the run-authorizing issue must state which population is used.

## 9. Non-goals confirmed

- No Forecast run occurred.
- No Run 3 was created.
- No model was trained, tuned, evaluated, or compared.
- No MAE/RMSE/Pearson/rank-correlation was computed for any arm.
- No baseline was changed.
- No production feature binding occurred; nothing was wired into `seasonalPprModel.ts`.
- No TIBER-Data or Teamstate change was made; no Data artifact was promoted.
- No 2025 player-season summary was consumed as a 2025 input feature.
- No active/inactive/IR/practice-squad/ownership status was inferred.
- No null/unavailable value was coerced to zero.
- No player-history signal is claimed.
- No fantasy advice, rankings, start/sit, trade, draft, or product output was produced.

## 10. Next allowed step

Open a SEPARATE issue to authorize the controlled three-arm run (baseline_only vs real_player_history_features vs shuffled_player_history_control). That issue must state which target population is used (prefer a real mounted TIBER-Data 2025 outcome population over the n=38 fixture scaffold), re-verify the #99/#100 gate if the mirror changes, and pass its own review before any metric is computed.

## Reproduce

```bash
npm run dryrun:player-history-matrix   # regenerate this report (network-free)
npm run build                          # tsc --noEmit
npm test                               # incl. tests/playerHistoryExperimentDryRunMatrix.test.ts
```
