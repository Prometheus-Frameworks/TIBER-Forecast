# Player-history production-only binding implementation (#143)

_Generated 2026-07-08 • player-history-production-binding-implementation-v1_

**Decision: `player_history_production_binding_implemented_pending_human_signoff`**

Implements the reviewed, validated `production_only` player-history trailing-history feature family into the seasonal PPR Forecast path, per #141/#142's authorization. The binding is inert by default (opt-in CLI flag only); this PR does not itself claim production readiness or human sign-off.

## 1. Cited documents

- Prior review: `docs/reports/player-history-production-binding-review-2026-07-08.json` (#141/#142) -- decision `may_open_player_history_production_binding_implementation_issue`

## 2. Identity checks (2/2 passed)

| Dimension | Expected | Observed | Passed |
|---|---|---|---|
| prior_review_decision_is_expected_ceiling | decision may_open_player_history_production_binding_implementation_issue | decision=may_open_player_history_production_binding_implementation_issue | ✅ |
| mirror_provenance_verified_against_locked_identity | verified=true, mismatches=[] | verified=true, mismatches=[] | ✅ |

## 3. Scope/leakage audit (2/2 passed)

| Dimension | Expected | Observed | Passed |
|---|---|---|---|
| scope_audit_covers_a_non_empty_file_set | authorized_consumer_paths and still_clean_paths are both non-empty | authorized=5, still_clean=15 | ✅ |
| wiring_is_confined_to_the_authorized_consumer_scope | 0 scope violations (every authorized path references player-history; every still-clean path does not) | 0 violation(s): none | ✅ |

Authorized consumer files (must reference player-history):
- `src/models/seasonal/seasonalPprModel.ts`
- `src/contracts/seasonalPprBacktest.ts`
- `src/datasets/seasonal/loadSeasonalPprDataset.ts`
- `src/services/runSeasonalPprBacktestService.ts`
- `src/datasets/seasonal/playerHistoryProductionOnlySource.ts`

Files checked and confirmed still clean (must NOT reference player-history):
- `src/models/seasonal/seasonalPprBaselines.ts`
- `src/datasets/seasonal/parseTiberDataWeeklyArtifact.ts`
- `src/datasets/seasonal/tiberDataSeasonalPprDataset.ts`
- `src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts`
- `src/datasets/seasonal/fixtures/tiberDataWeeklyPprScaffold.ts`
- `src/studio/loadSeasonalPprArtifacts.ts`
- `src/studio/buildModelContextExport.ts`
- `src/studio/renderStudioPage.ts`
- `src/api/routes/studio.ts`
- `src/api/app.ts`
- `src/server.ts`
- `src/index.ts`
- `src/board/ranking/rankDecisionBoard.ts`
- `src/services/rankDecisionBoardService.ts`
- `src/market/scoring/scoreRawEdge.ts`

## 4. Deterministic replay (2/2 passed)

| Dimension | Expected | Observed | Passed |
|---|---|---|---|
| build_and_tests_pass | build_passed=true, tests_passed=true | build_passed=true, tests_passed=true (78 files, 1040 tests) | ✅ |
| deterministic_cli_run_confirmed | deterministic_cli_run_confirmed=true | deterministic_cli_run_confirmed=true | ✅ |

## 5. Production-binding prerequisite gates (#143)

| Gate | Description | Status | Evidence |
|---|---|---|---|
| `feature_contract_reviewed_and_accepted` | The player-history production-only feature contract is reviewed and explicitly accepted, not just drafted. | ✅ | src/contracts/seasonalPprBacktest.ts now defines and exports PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID ("player_history_production_only_v0") and PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION ("1.0.0") as an implemented, tested TypeScript contract -- superseding the prior "-proposed"/"design_proposed_not_reviewed" experimental shape doc for this bounded production_only slice. |
| `source_artifact_identity_locked_and_fail_closed_in_the_contract` | The binding module itself (not just the mirror-refresh pipeline) locks the promoted artifact's sha256/path/promotion identity and fails closed on mismatch. | ✅ | src/datasets/seasonal/playerHistoryProductionOnlySource.ts hardcodes the locked identity (sha256 d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac, promotion review TIBER-Data#202, merge commit 711d6ee158d4e3bd116d1df4d76dea282200454d) and verifyPlayerHistoryMirrorProvenance() throws (fail-closed) on ANY mismatch. Verified against the real committed mirror just now: verified=true. |
| `named_production_inference_path_leakage_review` | A leakage review for the SPECIFIC production inference path this binding proposes (the seasonal PPR Forecast path) has been performed. | ✅ | The named inference path never performs a live/real-time fetch: every player-history value is sourced from a static, committed, historical (seasons 2021-2023, strictly before the 2024 input season) mirror file. There is no code path by which same-season or future-season data, or any live external call, can reach a prediction. The scope audit below additionally confirms zero references anywhere outside the 5 authorized consumer files. |
| `deterministic_replay_sequence_exercised_by_reviewer` | `npm run build && npm test` (including the CLI opt-in flag determinism test) were actually executed for this PR, not just read. | ✅ | This script executed `npm run build` (passed=true) and `npm test` (passed=true, 78 files / 1040 tests) against the committed tree, including tests/playerHistoryProductionOnlyBinding.test.ts's CLI determinism check. |
| `missing_history_behavior_specified_for_the_named_consumer` | Exact missing-history behavior is specified for the seasonal PPR Forecast consumer specifically (not just an abstract design doc). | ✅ | SeasonalPlayerObservation.player_history is null (never zero-filled, never imputed) for any player absent from the locked mirror index (attachPlayerHistoryProductionOnly). seasonalPprModel.ts numericValue() defaults each player-history feature to 0 (never a fabricated non-zero value) when player_history is null/absent, decoupling from every other coefficient in the ridge normal equations (see the model inertness tests in tests/playerHistoryProductionOnlyBinding.test.ts). |
| `no_fantasy_product_consumer_change_bundled_with_contract_wiring` | This PR does not bundle a Fantasy/product/UI/ranking/advice consumer change alongside the contract wiring. | ✅ | Scope audit: 5 authorized file(s) reference player-history, 15 other production file(s) (including board/scoring/market ranking and edge-scoring paths) checked and found clean. Violations: none. |
| `human_signoff_on_seasonal_ppr_model_change` | A human reviewer with authority over seasonalPprModel.ts has explicitly signed off on this specific wiring proposal. | ⬜ open | No human sign-off has been recorded. This is an automated implementation PR; it cannot record human sign-off on its own behalf. The binding is inert by default (opt-in CLI flag only) specifically so that no live production behavior changes before that sign-off occurs. |

**6/7 prerequisite gates satisfied.** Every MECHANICALLY-satisfiable gate is satisfied (`all_mechanical_prerequisites_satisfied: true`); human sign-off is intentionally excluded from that aggregate and remains open.

## 6. Activation status

- Default behavior: **inert -- byte-for-byte identical to a pre-#143 run unless the caller explicitly opts in**
- Opt-in mechanism: `--enable-player-history-production-only CLI flag on scripts/runSeasonalPprBacktest.ts`
- Live production activation additionally requires:
  - Human sign-off recorded (see prerequisite_gates: human_signoff_on_seasonal_ppr_model_change).
  - A mounted/governed TIBER-Data artifact for the actual served run (this PR only validates against the bundled scaffold fixture).
  - Every remaining open prerequisite gate closed.

## 7. Decision

- **`player_history_production_binding_implemented_pending_human_signoff`**
- #142's decision and the locked mirror provenance are confirmed. The scope audit found player-history wiring confined to exactly the authorized named-consumer files (5 file(s)) with zero references anywhere else (15 file(s) checked). Build and tests pass (78 files, 1040 tests), and the CLI binding was confirmed deterministic. Every mechanically-satisfiable #143 prerequisite gate is satisfied (6/7 overall). The one gate that can never be satisfied by this automated review -- human_signoff_on_seasonal_ppr_model_change -- remains explicitly open: No human sign-off has been recorded. This is an automated implementation PR; it cannot record human sign-off on its own behalf. The binding is inert by default (opt-in CLI flag only) specifically so that no live production behavior changes before that sign-off occurs. This binding is implemented and inert-by-default (a caller must explicitly opt in); it must not be treated as production-ready, activated against a real mounted artifact, or claimed as signed off until a human reviewer with authority over seasonalPprModel.ts explicitly records sign-off.

## 8. Non-goals confirmed

- No full-feature-set wiring; only the reviewed `production_only` family was wired.
- No Fantasy/product/UI/ranking/advice behavior changed (see scope audit above).
- No TIBER-Data change.
- No threshold amendment.
- No production-readiness claim: 1 gate(s) remain open (human sign-off).

## 9. Next allowed step

A human reviewer with authority over seasonalPprModel.ts must review this PR and record explicit sign-off before the --enable-player-history-production-only flag is used against anything beyond the bundled scaffold fixture. No further automated issue is authorized to claim production readiness.

## Reproduce

```bash
npm run review:player-history-production-binding-implementation
npm run build && npm test
npm run backtest:seasonal-ppr -- /tmp/out --enable-player-history-production-only
```
