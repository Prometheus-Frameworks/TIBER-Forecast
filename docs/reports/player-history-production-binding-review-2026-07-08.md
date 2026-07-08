# Player-history production-binding prerequisites review (#141)

_Generated 2026-07-08 • player-history-production-binding-review-v1_

**Decision: `may_open_player_history_production_binding_implementation_issue`**

Reviews the #139/PR #140 threshold-review decision (`may_open_player_history_production_binding_review_issue`), confirms it authorized only this review issue, confirms `production_only` remains the v0 default, locates the exact production Forecast paths a future binding issue would touch, identifies the exact artifact/mirror/report inputs that issue would need to pin, runs a production-path leakage audit, and records human sign-off requirements and outstanding prerequisites. No production behavior was changed by this issue.

## 1. Cited documents

- Prior review: `docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.json` (#139/#140) -- decision `may_open_player_history_production_binding_review_issue`
- Prerequisites design doc: `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md` (#123)

## 2. Identity checks against #140 (3/3 passed)

| Dimension | Expected | Observed | Passed |
|---|---|---|---|
| prior_review_decision_is_expected_ceiling | decision may_open_player_history_production_binding_review_issue | decision=may_open_player_history_production_binding_review_issue | ✅ |
| prior_review_confirms_required_boundary_statements | keys (no_production_binding_authorized, no_production_readiness_claim, no_leakage_audit_run, does_not_authorize_full_feature_set_production_wiring) explicitly present and true | all present and true | ✅ |
| prior_review_declares_feature_composition_gate | feature_composition_gate present with a boolean bar_cleared and finite observed_gap_pct/threshold_pct | bar_cleared=false, observed_gap_pct=0.35, threshold_pct=2 | ✅ |

## 3. Review-inventory checks (3/3 passed)

| Dimension | Expected | Observed | Passed |
|---|---|---|---|
| production_wiring_points_identified | a non-empty list of {path, role} entries | 16 entries, well_formed=true | ✅ |
| required_artifact_inputs_identified | a non-empty list of {path, description} entries | 10 entries, well_formed=true | ✅ |
| prerequisite_gates_recorded | a non-empty list of {id, description, satisfied, evidence} entries | 8 entries, well_formed=true | ✅ |

## 4. Production Forecast wiring points a future binding issue would touch

| Path | Role |
|---|---|
| `src/models/seasonal/seasonalPprModel.ts` | Ridge model design matrix (NUMERIC_FEATURES). A future binding would add player-history feature columns here. Named off-limits for THIS issue by the #141 hard boundary. |
| `src/models/seasonal/seasonalPprBaselines.ts` | Baseline comparison models the backtest report evaluates the ridge model against; a production_only-vs-full-feature-set comparison arm would need parallel handling here. |
| `src/contracts/seasonalPprBacktest.ts` | Declares SeasonalPlayerObservation. A future binding would add nullable player-history fields here, following the null_missing_history_rules design in the #123 prerequisites doc. |
| `src/datasets/seasonal/loadSeasonalPprDataset.ts` | Dataset assembly entrypoint for the seasonal backtest; a future binding would join the player-history mirror/artifact onto the seasonal observation set here. |
| `src/datasets/seasonal/parseTiberDataWeeklyArtifact.ts` | Parses the raw TIBER-Data weekly PPR artifact; a future binding would need an analogous parser (or a shared one) for the promoted player-history artifact. |
| `src/datasets/seasonal/tiberDataSeasonalPprDataset.ts` | Builds the seasonal PPR dataset from TIBER-Data inputs; the join point where a specific promoted player-history artifact identity would be pinned and fail-closed re-verified. |
| `src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts` | Deterministic fixture snapshot used by tests/dev; would need a player-history-augmented fixture variant so tests can cover the augmented feature set without network access. |
| `src/datasets/seasonal/fixtures/tiberDataWeeklyPprScaffold.ts` | Bundled scaffold fixture; same fixture-augmentation concern as the seed snapshot above. |
| `src/services/runSeasonalPprBacktestService.ts` | Orchestrates train/eval of the seasonal ridge model; the exact call site that would pass an augmented feature set into trainSeasonalRidgeModel. |
| `src/studio/loadSeasonalPprArtifacts.ts` | Loads backtest artifacts for PPM Studio; would need to reflect the augmented feature list in whatever it surfaces. |
| `src/studio/buildModelContextExport.ts` | Builds the model-context export payload served at /api/studio/seasonal-ppr/export/model-context; would need to disclose player-history feature usage in the export. |
| `src/studio/renderStudioPage.ts` | Renders the PPM Studio HTML page -- the closest thing this repo has to a served UI surface for the seasonal model, though it is explicitly not a Fantasy product surface. |
| `src/api/routes/studio.ts` | Serves /api/studio/seasonal-ppr/{report,predictions,export/model-context}; the actual network-served production path an inference-time leakage review must cover end-to-end. |
| `src/api/app.ts` | Registers and documents the studio routes in the served API surface manifest (route map at app.ts:50-87). |
| `src/server.ts` | HTTP server bootstrap that mounts app.ts -- the literal production process entrypoint. |
| `src/index.ts` | Public library entrypoint; re-exports may surface the model/contract to library consumers outside the HTTP server. |

## 5. Required artifact/mirror/report inputs a future binding issue would need to pin

| Path | Description |
|---|---|
| `exports/promoted/nfl/player_season_coverage_v0.json (TIBER-Data)` | The promoted source artifact, sha256 d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac (TIBER-Data#202/#207, 2021-2025 promotion). A binding proposal must pin this exact sha256 and fail closed on mismatch. |
| `exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json (TIBER-Data)` | The promotion manifest for the above artifact; must be re-verified alongside the artifact sha256. |
| `data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json` | Newest validated Forecast outcome mirror (2024 target, from the 2021-2025 promotion), produced by #135/#136. |
| `data/fixtures/tiberData/player_history_2021_2023_input_mirror.json` | Newest validated Forecast input mirror (2021-2023 window, from the 2021-2025 promotion), produced by #135/#136. |
| `data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json` | Prior validated outcome mirror (2025-from-2022-2024 window, #119/#120), still valid evidence for the replicated signal. |
| `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json` | Prior validated input mirror (2022-2024 window, #119/#120), paired with the outcome mirror above. |
| `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.json` | The #123 design doc: proposed feature-contract shape (contract_id player_history_production_feature_v0), prerequisites, and validation gates a binding proposal must satisfy. |
| `docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json` | The #132 threshold framework: the six quantitative acceptance components, including the uncleared production_only-vs-full-feature-set added-value bar. |
| `docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.json` | The #140 threshold-review decision this review (#141) cites as its own prerequisite. |
| `docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.json` | The #137/#138 additional-validation metrics underlying the #140 decision. |

## 6. Production-path leakage audit

- Scanned paths: 16 (all clean)
- Forbidden terms: `player_history`, `player-history`, `playerHistory`, `PlayerHistory`
- Findings: **none** -- no production Forecast path currently references player-history in any form.
- **Leakage audit clean: true**

## 7. Production-binding prerequisite gates (from the #123 design doc, section 6)

| Gate | Description | Status | Evidence |
|---|---|---|---|
| `feature_contract_reviewed_and_accepted` | The proposed feature-contract shape (docs/experiments/player-history-production-binding-prerequisites-2026-07-04.json section 7) has been reviewed and explicitly accepted, not just drafted. | ⬜ open | The contract carries provenance_state="experimental_replicated_not_production_bound" and validation_status="design_proposed_not_reviewed" (also see docs/reports/player-history-feature-contract-v0-validation-2026-07-04.json, decision contract_instance_conforms_non_production). No document records explicit contract acceptance. |
| `source_artifact_identity_locked_and_fail_closed` | The production feature pins to a specific promoted TIBER-Data artifact identity (path + sha256 + promotion review) and fails closed on mismatch. | ✅ | docs/reports/player-history-2024-from-2021-2023-mirror-refresh-2026-07-07.json records promotedArtifactSha256Pinned === promotedArtifactSha256Actual (d45f612b...) with sha256_verified_fail_closed_by_generator=true, promotion TIBER-Data#202/#207. |
| `production_leakage_review_for_a_named_inference_path` | A leakage review broader than the experimental discipline -- covering real-time data availability at inference time and look-ahead in derived features -- has been performed for the SPECIFIC production inference path a binding proposal targets. | ⬜ open | This issue performed a static reference-leakage audit (zero player-history references in any current production path) but no production inference path has been proposed yet, so the deeper inference-time leakage review from the #123 design doc prerequisite 4 has nothing concrete to review against. |
| `deterministic_rerun_exercised_by_reviewer` | The deterministic replay commands for the cited evidence have been exercised by the reviewer, not just read. | ✅ | This review ran `npm run build` and `npm test` against the committed tree (74 test files, 927 tests passing) before writing this report. |
| `real_vs_baseline_vs_shuffled_framing_carried_forward` | Any production acceptance criterion is expressed as beating both a baseline and a deterministic shuffled control, not just "beats baseline." | ✅ | Confirmed present in the #140 report component_checks (relative_mae_improvement_over_baseline and _over_shuffled_control, both origins). |
| `missing_history_behavior_specified_for_a_named_consumer` | What a production consumer does for a player with no prior-season history is specified for the SPECIFIC production consumer being proposed. | ⬜ open | The #123 design doc specifies null_missing_history_rules for the proposed contract shape in the abstract, but no production consumer has been named or proposed yet, so no consumer-specific behavior has been specified. |
| `no_fantasy_consumer_change_bundled_with_contract_wiring` | Any future proposing issue/PR must not bundle a Fantasy/product consumer change with contract wiring in the same slice. | ⬜ open | Not yet applicable: no contract-wiring PR has been proposed. Recorded here as a constraint the future implementation issue must satisfy. |
| `human_sign_off_on_seasonal_ppr_model_change` | A human reviewer with authority over seasonalPprModel.ts has explicitly signed off on the specific wiring proposal. | ⬜ open | No human sign-off has been recorded for any player-history production-binding proposal. This review is an automated review issue, not a human sign-off, and does not substitute for one. |

**3/8 prerequisite gates currently satisfied.** The remaining gates are recorded as open blockers for a future implementation issue -- this review does not claim they are met, and a positive decision here does not require them all to be met.

## 8. Human sign-off requirements

- A named human reviewer with authority over src/models/seasonal/seasonalPprModel.ts must explicitly sign off, in writing, on the specific wiring proposal before any future implementation PR merges.
- This review, and the positive decision it may emit, does not constitute that sign-off and must not be cited as satisfying it.
- Every unsatisfied prerequisite gate recorded in this report is a blocker for that future sign-off, not merely a suggestion.

## 9. Decision

- **`may_open_player_history_production_binding_implementation_issue`**
- The #140 decision and required boundary statements are confirmed, production_only is confirmed carried forward as the v0 default (feature-composition bar_cleared=false), the production-path leakage audit scanned 16 production paths and found zero player-history references, and this review recorded 16 production wiring point(s), 10 required artifact input(s), and 8 prerequisite gate(s) (3/8 currently satisfied). A SEPARATE future issue may be opened to propose a bounded production-binding implementation. This decision does not itself wire any feature, change seasonalPprModel.ts, authorize full-feature-set wiring, make a product/advice/ranking claim, or claim production readiness -- 5 prerequisite gate(s) remain unsatisfied and are recorded as open blockers for that future issue.

## 10. Non-goals confirmed

- No production Forecast behavior was changed by this issue.
- `seasonalPprModel.ts` was not modified.
- No player-history feature was wired into production.
- `production_only` remains the only eligible v0 feature-family scope; full-feature-set production wiring is NOT authorized.
- No product/UI/rankings/advice/Fantasy behavior was authorized.
- No TIBER-Data change.
- No new validation was run.
- No production-readiness claim is made (see prerequisite gates: 5 remain open).
- The positive decision authorizes only a separate future implementation issue; it does not itself decide production readiness or approve any code.

## Reproduce

```bash
npm run review:player-history-production-binding   # deterministic, network-free
npm run build && npm test
```
