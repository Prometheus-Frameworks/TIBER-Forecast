# Real-population dry-run matrix rerun (#109)

_Generated 2026-07-02 • player-history-experiment-dry-run-matrix-v1 • status: **dry_run_only_not_model_ready**_

Dry-run matrix reassembled against the REAL target population (the #109 outcome mirror) and the regenerated input mirror. Assembly and counting only — no metrics, no training, no run.

- Target population: 610 (scored: 610, outcome-unavailable: 0)
- Matrix rows: **610** (row_kind: `player_history_experiment_dry_run_matrix_row_not_model_ready`)
- Joined rows: **485** (share: **79.5%**)
- Joined by position: QB 66, RB 115, TE 115, WR 189
- No-history rows by position: QB 15, RB 36, TE 23, WR 51
- Feature-only exclusions: 0; outcome-unavailable exclusions: 0
- Null/missingness: 9 distinct feature paths carry nulls across 485 joined rows (1140 null cells); 34 paths show real zeros preserved distinct from nulls
- Shuffled-control posture: `seeded_derangement_within_position`, seed 20260702, groups: QB 66 (deranged), RB 115 (deranged), TE 115 (deranged), WR 189 (deranged); metrics computed: **false**
- Outcome values are omitted from matrix rows by construction.
- Fixture warning: none — the target population is the real generated outcome mirror (candidate artifact, outcome-layer-only), not the n=38 fixture.

## Non-goals confirmed

- No Forecast run occurred; no Run 3 was created.
- No model was trained, tuned, evaluated, or compared; no MAE/RMSE/Pearson/rank-correlation was computed.
- No production feature binding occurred; nothing was wired into `seasonalPprModel.ts`; the baseline is unchanged.
- No Data artifact was promoted; no TIBER-Data/Teamstate change was made.
- No player-history signal is claimed.
