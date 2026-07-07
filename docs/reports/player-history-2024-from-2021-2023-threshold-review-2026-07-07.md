# Player-history 2024-from-2021-2023 threshold review (#139)

_Generated 2026-07-07 • player-history-2024-from-2021-2023-threshold-review-v1_

**Decision: `may_open_player_history_production_binding_review_issue`**

Reviews the #137/PR #138 additional-validation metrics (squash commit `86f5097`) against the PR #132 acceptance framework and the prior #121/#122 promoted-source (2025-from-2022-2024) evidence. This is a review only: no validation was rerun, no threshold was amended, and no production behavior was bound.

## 1. Cited documents

- Threshold framework: `docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json` (PR #132) -- status `threshold_proposal_only_no_production_binding_no_leakage_audit_no_feature_wiring`, decision `player_history_threshold_proposed_requires_additional_validation`
- Prior origin: `docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json` (#121/#122) -- decision `promoted_player_history_signal_replicated_requires_followup`
- New origin: `docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.json` (#137/PR #138) -- decision `may_open_player_history_2024_from_2021_2023_threshold_review_issue`

## 2. Identity and boundary checks (5/5 passed)

| Dimension | Origin | Expected | Observed | Passed |
|---|---|---|---|---|
| framework_is_expected_deferred_threshold_proposal | framework | status threshold_proposal_only_no_production_binding_no_leakage_audit_no_feature_wiring, decision player_history_threshold_proposed_requires_additional_validation | status=threshold_proposal_only_no_production_binding_no_leakage_audit_no_feature_wiring, decision=player_history_threshold_proposed_requires_additional_validation | ✅ |
| prior_origin_is_expected_replicated_evidence | 2025-from-2022-2024 (#121/#122 promoted-source rerun) | decision promoted_player_history_signal_replicated_requires_followup | decision=promoted_player_history_signal_replicated_requires_followup | ✅ |
| new_origin_carries_required_ceiling_decision | 2024-from-2021-2023 (#137/#138 additional validation) | decision may_open_player_history_2024_from_2021_2023_threshold_review_issue | decision=may_open_player_history_2024_from_2021_2023_threshold_review_issue | ✅ |
| new_origin_preconditions_passed | 2024-from-2021-2023 (#137/#138 additional validation) | integrity_passed=true, floors_passed=true | integrity_passed=true, floors_passed=true | ✅ |
| new_origin_confirms_no_threshold_decision_and_no_production_binding | 2024-from-2021-2023 (#137/#138 additional validation) | every #137 boundary_statement is true (including no_threshold_accepted_rejected_or_amended, no_production_binding_authorized) | 0 non-true of 10 | ✅ |

## 3. Quantitative threshold components, evaluated per-origin (no averaging)

| Dimension | Origin | Expected | Observed | Passed |
|---|---|---|---|---|
| relative_mae_improvement_over_baseline | 2025-from-2022-2024 (#121/#122 promoted-source rerun) | >= 25.00% | 41.92% | ✅ |
| relative_mae_improvement_over_shuffled_control | 2025-from-2022-2024 (#121/#122 promoted-source rerun) | >= 25.00% | 44.42% | ✅ |
| absolute_joined_mae_ceiling | 2025-from-2022-2024 (#121/#122 promoted-source rerun) | <= 48.0 | 40.0342 | ✅ |
| absolute_joined_rmse_ceiling | 2025-from-2022-2024 (#121/#122 promoted-source rerun) | <= 68.0 | 57.2871 | ✅ |
| relative_rmse_improvement_over_shuffled_control | 2025-from-2022-2024 (#121/#122 promoted-source rerun) | >= 20.00% | 36.64% | ✅ |
| no_history_subgroup_reporting_ceiling | 2025-from-2022-2024 (#121/#122 promoted-source rerun) | reported, soft ceiling <= 35.00% | 20.49% (125/610) | ✅ |
| relative_mae_improvement_over_baseline | 2024-from-2021-2023 (#137/#138 additional validation) | >= 25.00% | 37.67% | ✅ |
| relative_mae_improvement_over_shuffled_control | 2024-from-2021-2023 (#137/#138 additional validation) | >= 25.00% | 38.99% | ✅ |
| absolute_joined_mae_ceiling | 2024-from-2021-2023 (#137/#138 additional validation) | <= 48.0 | 44.8178 | ✅ |
| absolute_joined_rmse_ceiling | 2024-from-2021-2023 (#137/#138 additional validation) | <= 68.0 | 60.6490 | ✅ |
| relative_rmse_improvement_over_shuffled_control | 2024-from-2021-2023 (#137/#138 additional validation) | >= 20.00% | 33.07% | ✅ |
| no_history_subgroup_reporting_ceiling | 2024-from-2021-2023 (#137/#138 additional validation) | reported, soft ceiling <= 35.00% | 20.07% (118/588) | ✅ |

## 4. Per-origin summary

- **2025-from-2022-2024 (#121/#122 promoted-source rerun)**: all components passed = **true**
- **2024-from-2021-2023 (#137/#138 additional validation)**: all components passed = **true**

## 5. Decision

- **`may_open_player_history_production_binding_review_issue`**
- Every PR #132 quantitative threshold component passes independently for both the prior (2025-from-2022-2024, #121/#122) and new (2024-from-2021-2023, #137) origins, satisfying the additional-season-of-validation bar PR #132 deferred on. #137 itself never decided a threshold or bound production. A SEPARATE issue may be opened to consider production-binding prerequisites, including the qualitative governance conditions (production-path leakage audit, human sign-off) PR #132 explicitly deferred to that stage. This decision does not itself bind production, claim production readiness, or make a product claim.

## 6. Non-goals confirmed

- No validation was rerun; every metric cited above is read directly from the committed #121/#122 and #137 reports.
- No threshold was accepted, rejected, or amended.
- No production Forecast behavior was bound; nothing was wired into `seasonalPprModel.ts`.
- No production-path leakage audit was run; no human sign-off was recorded.
- No product/UI/rankings/advice/Fantasy behavior was authorized.
- No TIBER-Data change.
- The positive decision authorizes only a separate production-binding review issue; it does not itself decide production readiness.

## 7. Next allowed step

A SEPARATE issue may be opened to review production-binding prerequisites (including the PR #132 qualitative governance conditions: a production-path leakage audit and dated human sign-off on the specific wiring proposal). This decision does not itself bind production, run a leakage audit, amend any threshold, or make a product claim.

## Reproduce

```bash
npm run review:player-history-2024-from-2021-2023-threshold   # deterministic, network-free
npm run build && npm test
```
