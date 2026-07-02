# Player-history target-population gate (#109)

_Generated 2026-07-02 • player-history-target-population-gate-v1 • status: **player_history_target_population_gate_passed** • decision: **may_continue_to_overlap_gate**_

Evaluates the generated 2025 outcome mirror (`data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json`, source sha256 `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`, status `candidate_evidence_artifact_not_promoted`). Ceiling: `may_continue_to_overlap_gate` — never `may_run`.

| Check | Expected | Observed | Result |
|---|---|---|---|
| mirror_kind | `player_history_run_population_outcome_mirror` | `player_history_run_population_outcome_mirror` | pass |
| source_sha256_pin | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` | pass |
| candidate_status_acknowledged | `candidate_evidence_artifact_not_promoted` | `candidate_evidence_artifact_not_promoted` | pass |
| outcome_layer_only_boundary_stated | `boundary.outcome_layer_only === true && boundary.rows_carry_no_input_features === true` | `outcome_layer_only=true, rows_carry_no_input_features=true` | pass |
| population_nonempty | `> 0 rows` | `610 rows` | pass |
| season_scope | `all rows season === 2025` | `0 rows outside` | pass |
| season_type_scope | `all rows season_type === REG` | `0 rows outside` | pass |
| position_scope | `all rows in QB/RB/WR/TE` | `0 rows outside` | pass |
| row_grain_unique | `one row per player_id + season + season_type` | `0 duplicates` | pass |
| target_outcome_present_and_numeric_or_null | `season_ppr present on every row, number where observed, null only for genuinely unobserved` | `0 rows with missing/non-numeric outcome field` | pass |
| at_least_one_numeric_outcome | `>= 1 numeric outcome value` | `610 numeric` | pass |
| row_level_source_refs_present | `every row carries >= 1 source_ref` | `0 rows without` | pass |
| identity_confidence_source_backed | `every row in [source_verified]` | `0 rows outside` | pass |
| no_fixture_source_markers | `no source_name containing offline_fixture/scaffold/fixture` | `0 rows with fixture-like markers` | pass |
| unapproved_source_refs_absent | `all source_refs on every row match the approved allow-list (nflreadpy.load_player_stats, nflreadpy.load_players); no unapproved extra sources` | `0 rows carrying >= 1 unapproved source ref` | pass |
| no_forbidden_availability_fields | `no row carries active_status/ownership_status/roster_status/active_roster_status` | `0 rows with forbidden fields` | pass |
| no_input_feature_payloads_on_outcome_rows | `outcome rows carry outcome + identity + provenance only` | `0 rows carrying input-feature payload keys` | pass |

- Population: 610 rows / 610 players (QB 81, TE 138, WR 240, RB 151); null-outcome rows: 0

## Non-goals confirmed

- No Forecast run occurred; no Run 3 was created.
- No model was trained, tuned, evaluated, or compared; no MAE/RMSE/Pearson/rank-correlation was computed.
- No production feature binding occurred; nothing was wired into `seasonalPprModel.ts`; the baseline is unchanged.
- No Data artifact was promoted; no TIBER-Data/Teamstate change was made.
- No player-history signal is claimed.
