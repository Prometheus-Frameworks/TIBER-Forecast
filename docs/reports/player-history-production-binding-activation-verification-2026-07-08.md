# Player-history production-only binding activation verification (#145)

_Generated 2026-07-08 • player-history-production-binding-activation-verification-v1_

**Decision: `player_history_production_binding_activation_verified`**

Post-merge verification of PR #144 (squash commit `61b1237`) from `main`. This is a verification pass only: no feature expansion, no model redesign, no full-feature-set authorization.

## Verification checks (10/10 passed)

| Check | Description | Passed | Evidence |
|---|---|---|---|
| `merge_commit_verified` | Verification ran against the actual #144 merge commit on main. | ✅ | Confirmed HEAD descends from 61b1237. |
| `default_behavior_unchanged` | Default (no-flag) execution discloses disabled and no prediction row reports a player-history feature as present. | ✅ | enabled=false, model MAE/RMSE=35.1476538355775/43.64041863230445, every prediction row has zero player_history_* entries in features_present=true. This exactly matches the byte-for-byte core-metric comparison performed against the pre-#143 commit (7a66996) during manual verification: 39/39 prediction rows had zero mismatches on predicted_ppr/actual_ppr/absolute_error/feature_coverage_status/governance_status/features_present, and MAE/RMSE were identical (35.15/43.64) in both. |
| `only_approved_features_activated` | Enabled execution activates exactly the 7 approved production_only features and nothing else. | ✅ | unexpected feature names observed: none. Approved features actually exercised: 7/7. |
| `provenance_fail_closed` | The locked artifact identity check passes for the real mirror and fails closed for every tampered variant. | ✅ | pristine_real_mirror: threw=false (expected false); tampered_sha256: threw=true (expected true); tampered_repo: threw=true (expected true); tampered_promotion_review: threw=true (expected true); tampered_artifact_status: threw=true (expected true); tampered_input_window: threw=true (expected true) |
| `missing_history_explicit` | Known player_id collisions (scaffold vs. real mirror identity mismatches) null out rather than borrowing another real player's history. | ✅ | 00-0037539: found=true, all_player_history_inputs_zero=true; 00-0038977: found=true, all_player_history_inputs_zero=true; 00-0033857: found=true, all_player_history_inputs_zero=true |
| `model_gate_cannot_be_bypassed` | trainSeasonalRidgeModel, called directly (bypassing the service), ignores player_history unless the correct gate is supplied. | ✅ | no-gate prediction identical to clean baseline=true (188.38461538461542 vs 188.38461538461542); wrong-sha prediction identical to clean=true (188.38461538461542); correct-gate prediction differs from clean=true (262.24). |
| `report_disclosure_accurate` | The report's enabled/sha256 disclosure matches the actual run type. | ✅ | disabled run discloses {"enabled":false,"source_artifact_sha256":null,"human_signoff_recorded":false} (correct=true); enabled run discloses {"enabled":true,"source_artifact_sha256":"d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac","human_signoff_recorded":false} (correct=true). |
| `deterministic_replay_stable` | Two independent enabled runs produce byte-identical output. | ✅ | report bytes identical=true; predictions bytes identical=true. |
| `no_unrelated_outputs_changed` | A full-repository scan finds player-history references ONLY in already-authorized files. | ✅ | 25 file(s) with a player-history reference scanned; 0 unauthorized: none. Forbidden terms: player_history, player-history, playerHistory, PlayerHistory. |
| `build_and_test_passed` | `npm run build` and `npm test` both pass on main. | ✅ | build_passed=true, tests_passed=true (79 files, 1065 tests). |

## Decision

- **`player_history_production_binding_activation_verified`**
- All 10 verification points passed against the #144 merge commit: default behavior is unchanged (byte-identical predictions/metrics vs. the pre-#143 commit), the opt-in flag activates only the 7 approved production_only features, the locked artifact sha256/contract fail closed on any mismatch (verified against both the real mirror and synthetically tampered copies), missing/colliding player identities null out explicitly rather than cross-contaminating, direct trainSeasonalRidgeModel usage cannot be influenced by forged or pre-enriched player_history data without the exact matching gate, report disclosure (enabled/sha256) matches the actual run type in every case, two independent enabled runs produced byte-identical output, and a full-repository scope scan found no player-history reference outside the already-authorized file set. This confirms activation readiness for the already-implemented, already-signed-off production_only binding. It does not authorize any additional feature family, model redesign, or product-facing change.

## Non-goals confirmed

- No additional feature family authorized.
- No model redesign.
- No Fantasy/product/UI/ranking/advice behavior.
- No TIBER-Data change.
- No threshold change.
- A positive decision confirms activation readiness only -- it is not a new production-readiness claim beyond what #143/#144 already established with human sign-off.

## Reproduce

```bash
npm run verify:player-history-production-binding-activation
npm run build && npm test
```
