# Promoted-mirror population/overlap gate (Forecast #119)

_Generated 2026-07-04 • player-history-promoted-mirror-refresh-v1 • status: **passed** • decision: **`may_open_promoted_controlled_rerun_issue`**_

Re-runs the population/overlap gate stack against the REFRESHED promoted-source mirrors, using the pre-registered
#107/PR #108 floors as the minimum baseline (joined >= 200 overall, >= 30 per position, share >= 0.6, derangement feasible per position). may_open_promoted_controlled_rerun_issue is the strongest decision this refresh can emit. It authorizes only OPENING a separate, later issue to consider rerunning the controlled experiment against the promoted-source mirrors. It does not itself authorize the rerun, runs no model here, computes no MAE/RMSE/Pearson/Spearman or other metric, binds nothing into production Forecast, and makes no product or signal claim.

## Checks (26/26 passed)

| Check | Expected | Observed | Result |
|---|---|---|---|
| preflight_gate_status_passed | `passed` | `passed` | pass |
| preflight_gate_decision | `may_open_promoted_mirror_refresh_issue` | `may_open_promoted_mirror_refresh_issue` | pass |
| preflight_promoted_sha_matches_pin | `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035` | `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035` | pass |
| preflight_candidate_lineage_sha_matches_pin | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` | pass |
| preflight_leakage_discipline_recorded_true | `all 5 leakage-discipline fields present and true` | `target_season_2025_remains_outcome_only_for_prior_experiment_shape=true, input_seasons_for_2025_prediction_remain_2022_2024_only=true, no_2025_production_summaries_may_become_2025_input_features=true, no_active_availability_ownership_fields_may_be_consumed=true, unavailable_usage_fields_remain_null_never_zero_coerced=true` | pass |
| outcome_mirror_kind_and_source | `kind player_history_promoted_outcome_mirror tied to promoted sha 29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035 (status promoted_governed_artifact)` | `kind=player_history_promoted_outcome_mirror sha=29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035 status=promoted_governed_artifact` | pass |
| outcome_rows_2025_reg_approved_positions_only | `every row season=2025, season_type=REG, position in QB/RB/WR/TE` | `0 off-scope rows of 610` | pass |
| outcome_population_count_consistent | `rows > 0, one row per player, counts.rows/players match the rows array` | `rows=610 players=610 counts={"rows":610,"players":610}` | pass |
| input_mirror_kind_and_source | `kind player_history_promoted_input_mirror tied to promoted sha 29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035 (status promoted_governed_artifact)` | `kind=player_history_promoted_input_mirror sha=29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035 status=promoted_governed_artifact` | pass |
| input_no_2025_rows | `0 rows with season 2025; every row in 2022/2023/2024 REG` | `0 target-season rows, 0 off-window rows of 1145` | pass |
| input_positions_in_scope | `every row position in QB/RB/WR/TE` | `0 off-scope rows` | pass |
| input_players_subset_of_outcome_population | `every input row belongs to an outcome-mirror player` | `0 rows outside the population` | pass |
| input_no_target_outcome_values | `no input row carries ppr_2025_actual/season_ppr_2025/target_outcome/target_season_ppr (2025 outcomes live in the outcome layer only)` | `0 rows carrying a target-outcome key` | pass |
| mirror_source_refs_present | `every mirror row carries >= 1 source_ref` | `0 rows missing refs (of 1755)` | pass |
| mirror_source_refs_prefix_approved | `ALL refs start with an approved prefix (nflreadpy.load_player_stats( \| nflreadpy.load_players(); mixed and embedded-token provenance fail closed` | `0 unapproved of 5265 refs` | pass |
| mirror_no_fixture_scaffold_markers | `no ref contains offline_fixture/fixture_/scaffold/fixture_demonstration_only` | `0 fixture-marked refs` | pass |
| mirror_no_forbidden_availability_fields | `no mirror row carries active_status/ownership_status/roster_status/active_roster_status` | `0 forbidden-field hits` | pass |
| mirror_unavailable_usage_fields_remain_null | `snap_share/routes_run/route_participation/red_zone_targets/red_zone_carries stay null in every input row: any non-null (zero-coerced OR populated) fails` | `0 zero-coerced, 0 populated non-null values` | pass |
| overlap_counts_sane | `0 <= joined_rows <= scored_target_rows, both finite` | `scored=610, joined=485` | pass |
| overlap_min_joined_rows_overall | `>= 200` | `485` | pass |
| overlap_min_joined_rows_position_QB | `>= 30` | `66` | pass |
| overlap_min_joined_rows_position_RB | `>= 30` | `115` | pass |
| overlap_min_joined_rows_position_WR | `>= 30` | `189` | pass |
| overlap_min_joined_rows_position_TE | `>= 30` | `115` | pass |
| overlap_min_joined_share | `>= 0.6` | `0.7951` | pass |
| overlap_derangement_feasible_by_position | `every position group with feature-bearing rows supports a derangement (required if later control runs are considered)` | `QB:66, RB:115, TE:115, WR:189` | pass |

## Decision rule

malformed gate input -> promoted_mirror_refresh_invalid_must_not_use; #117 preflight failed OR any mirror integrity/leakage/provenance check failed OR the overlap evidence is internally contradictory -> blocked_promoted_mirror_refresh_gate_failed; integrity passed but a population/overlap floor or derangement feasibility failed -> may_use_promoted_mirrors_for_design_only; everything passed -> may_open_promoted_controlled_rerun_issue. No decision authorizes a model run, metric computation, production binding, product output, or advice/rankings.

## Leakage discipline enforced on the refreshed mirrors

- `target_season_2025_remains_outcome_only_for_prior_experiment_shape`: **true**
- `input_seasons_for_2025_prediction_remain_2022_2024_only`: **true**
- `no_2025_production_summaries_may_become_2025_input_features`: **true**
- `no_active_availability_ownership_fields_may_be_consumed`: **true**
- `unavailable_usage_fields_remain_null_never_zero_coerced`: **true**

## Archived candidate mirrors

The archived candidate mirrors (#110) at data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json, data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json, data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json are preserved unchanged as the archived record of the #112/#116 candidate experiment. The promoted-source mirrors are written to new *.promoted_*_mirror.json paths and carry an explicit source_lineage block; nothing overwrites the archived mirrors silently.

## Result

- **Final gate status:** `passed`
- **Final decision:** `may_open_promoted_controlled_rerun_issue`
- **Next allowed step:** Open a SEPARATE issue to consider rerunning the controlled experiment against the promoted-source mirrors; that issue must pass its own review before any arm is run or any metric is computed. This gate result authorizes opening that issue and nothing else.

## Non-goals confirmed

- No player-history model was run; no arm was executed.
- No MAE/RMSE/Pearson/Spearman or any other player-history metric was computed.
- `seasonalPprModel.ts` and the production baseline are untouched; no feature was bound into production Forecast.
- No product route/UI surface, fantasy advice, rankings, start/sit, trade, or draft output was created.
- No TIBER-Data file was modified; nothing was promoted or demoted.
- No active-roster, availability, injury, depth-chart, or ownership status was inferred or consumed.
- The archived candidate mirrors (#110) were preserved unchanged.
