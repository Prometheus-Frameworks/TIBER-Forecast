# Promoted-source gate: player_season_coverage_v0 (Forecast #117)

_Generated 2026-07-03 • player-history-promoted-source-gate-v1 • status: **passed** • decision: **`may_open_promoted_mirror_refresh_issue`**_

Forecast-side gate over the TIBER-Data PROMOTED artifact (`Prometheus-Frameworks/TIBER-Data:exports/promoted/nfl/player_season_coverage_v0.json`, promoted by TIBER-Data #192 / PR #193, merge `65fb498253b5bdb6a7f6d0598d7235c90a78c729`). Gate only: **no model run, no new metrics, no feature binding, no mirror refresh, no production change, no product/advice output.** may_open_promoted_mirror_refresh_issue is the strongest decision this gate can emit. It authorizes only OPENING a separate, later mirror-refresh issue that would update the experiment source reference from the candidate pin to the promoted artifact. It does not refresh mirrors here, does not run a model, computes no metrics, binds nothing into production Forecast, and makes no product or signal claim.

## Upstream identity

- Promoted artifact: `exports/promoted/nfl/player_season_coverage_v0.json`
- Promotion manifest: `exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json`
- Promoted sha256 (pin): `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035`
- Promoted sha256 (actual local bytes): `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035`
- Candidate lineage intact: **true**

## Checks (29/29 passed)

| Check | Expected | Observed | Result |
|---|---|---|---|
| manifest_artifact_id | `player_season_coverage_v0` | `player_season_coverage_v0` | pass |
| manifest_promoted_status | `promoted_governed_artifact` | `promoted_governed_artifact` | pass |
| manifest_promotion_review | `TIBER-Data#192` | `TIBER-Data#192` | pass |
| manifest_promotion_decision | `promote_player_season_coverage_v0` | `promote_player_season_coverage_v0` | pass |
| manifest_promoted_artifact_path | `exports/promoted/nfl/player_season_coverage_v0.json` | `exports/promoted/nfl/player_season_coverage_v0.json` | pass |
| promoted_sha256_matches_actual_bytes | `manifest.promoted_artifact_sha256 === sha256(actual local promoted artifact bytes)` | `manifest=29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035 actual=29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035` | pass |
| promoted_sha256_matches_forecast_pin | `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035` | `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035` | pass |
| candidate_lineage_path | `data/processed/evidence/player_season_coverage_2022_2025.source_backed.json` | `data/processed/evidence/player_season_coverage_2022_2025.source_backed.json` | pass |
| candidate_lineage_sha256 | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b (the prior Forecast candidate pin: promoted artifact must descend from exactly the candidate the archived experiment mirrors used)` | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` | pass |
| candidate_lineage_status_at_promotion | `candidate_evidence_artifact_not_promoted` | `candidate_evidence_artifact_not_promoted` | pass |
| manifest_allowlist_is_pinned_prefix_set | `["nflreadpy.load_player_stats(","nflreadpy.load_players("]` | `["nflreadpy.load_player_stats(","nflreadpy.load_players("]` | pass |
| artifact_promoted_status | `promoted_governed_artifact` | `promoted_governed_artifact` | pass |
| artifact_source_candidate_matches_manifest | `artifact.source_candidate identical to manifest.source_candidate (path, sha256, status_at_promotion)` | `identical` | pass |
| record_count | `2383 records, matching envelope counts.records` | `2383 records, envelope counts.records=2383` | pass |
| seasons_scope_and_counts | `seasons 2022,2023,2024,2025; per-season counts {"2022":609,"2023":576,"2024":588,"2025":610} recomputed from records` | `seasons 2022,2023,2024,2025; recomputed {"2022":609,"2023":576,"2024":588,"2025":610}` | pass |
| season_type_reg_only | `every record season_type=REG; envelope scope [REG]` | `0 non-REG records; envelope scope [REG]` | pass |
| positions_scope_and_counts | `positions QB/RB/TE/WR only; per-position counts {"QB":323,"RB":606,"TE":519,"WR":935} recomputed from records` | `0 out-of-scope position records; recomputed {"QB":323,"RB":606,"TE":519,"WR":935}` | pass |
| row_grain_declared | `player_id + season + season_type` | `player_id + season + season_type` | pass |
| duplicate_grain | `0 duplicate (player_id, season, season_type) grains across all records` | `0 duplicates` | pass |
| deterministic_ordering | `records sorted by (season, player_id) as the #192 promotion review recorded` | `0 ordering violations` | pass |
| records_present | `records array present and non-empty` | `2383 records` | pass |
| source_refs_present | `every record carries >= 1 source_ref` | `0 records missing refs (of 2383)` | pass |
| source_refs_prefix_approved | `ALL refs start with an approved prefix (nflreadpy.load_player_stats( \| nflreadpy.load_players(); mixed and embedded-token provenance fail closed` | `0 unapproved of 7149 refs` | pass |
| no_fixture_scaffold_markers | `no ref contains offline_fixture/fixture_/scaffold/fixture_demonstration_only` | `0 fixture-marked refs` | pass |
| observed_at_present | `every ref carries observed_at` | `0 refs missing observed_at` | pass |
| consumer_safety_not_allowed_boundary | `consumer_safety.not_allowed present and includes all 6 required boundaries (roster status, availability/injury, depth chart, ownership, advice/rankings, Forecast binding w/o separate gate)` | `all required boundaries present` | pass |
| forecast_compatibility_note_boundary | `note present and requires: separate Forecast-side gate • re-verifies sha/provenance • leakage splits • production-only feature contract • No product-facing claim is authorized until a Forecast production-binding review passes` | `all required elements present` | pass |
| no_forbidden_availability_fields | `no record carries active_status/ownership_status/roster_status/active_roster_status` | `0 forbidden-field hits` | pass |
| unavailable_usage_fields_remain_null | `snap_share/routes_run/route_participation/red_zone_targets/red_zone_carries are not source-backed in this artifact and must stay null: any non-null value (zero-coerced OR populated) fails` | `0 zero-coerced, 0 populated non-null values` | pass |

## Decision rule

all checks pass -> may_open_promoted_mirror_refresh_issue; any check fails with candidate lineage intact -> may_continue_using_candidate_mirrors_for_archived_experiment_only (promoted artifact must NOT be consumed); any check fails with candidate lineage broken -> blocked_promoted_artifact_gate_failed; malformed gate input -> promoted_source_gate_invalid_must_not_use. No decision authorizes a model run, metric computation, production binding, Data promotion, product output, or advice/rankings.

## Leakage discipline recorded for any future mirror refresh/use

- `target_season_2025_remains_outcome_only_for_prior_experiment_shape`: **true**
- `input_seasons_for_2025_prediction_remain_2022_2024_only`: **true**
- `no_2025_production_summaries_may_become_2025_input_features`: **true**
- `no_active_availability_ownership_fields_may_be_consumed`: **true**
- `unavailable_usage_fields_remain_null_never_zero_coerced`: **true**

## Relationship to existing candidate mirrors

Existing Forecast experiment mirrors (#110) were generated from the candidate pin 39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b and remain valid ONLY as the archived record of the #112/#116 experiment. They are not refreshed, re-blessed, or invalidated by this gate; if a future issue refreshes mirrors from the promoted artifact, it must re-run the population/overlap gates on the refreshed mirrors before any further use.

## Result

- **Final gate status:** `passed`
- **Final decision:** `may_open_promoted_mirror_refresh_issue`
- **Next step:** A SEPARATE later issue may refresh the experiment source reference/mirrors from the candidate pin to the promoted artifact; that issue must re-run population/overlap gates on the refreshed mirrors and re-state the leakage discipline before any further use. Nothing runs or binds here.

## Reproduce

```bash
npm run gate:player-history-promoted-source -- --artifact=/path/to/player_season_coverage_v0.json --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build   # tsc --noEmit
npm test        # incl. tests/playerHistoryPromotedSourceGate.test.ts
```
