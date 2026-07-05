# Player-history feature contract v0: validation/replay (Forecast #129)

_Generated 2026-07-04 • player-history-contract-v0-replay-v1_

**Decision: `player_history_contract_v0_non_production_implementation_ready_for_review`**

Source identity was re-verified and locked, the committed promoted mirrors verified against that locked identity, the generated non-production contract instance passed structural validation, run_id recomputed deterministically, and the replay reproduced the pinned #122 joined-population smoke metrics exactly. This does not authorize seasonalPprModel.ts wiring, production feature use, or any Fantasy/product consumer change.

Non-production, non-binding: not_production_bound, not_consumed_by_seasonalPprModel, not_fantasy_product_output.

## 1. Source identity re-verification (#117 gate, re-run against local bytes)

- Gate status: `passed` • decision: `may_open_promoted_mirror_refresh_issue`
- Locked `source_dataset_refs`: `{"repo":"Prometheus-Frameworks/TIBER-Data","artifact_path":"exports/promoted/nfl/player_season_coverage_v0.json","artifact_sha256":"29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035","promotion_review":"TIBER-Data#192"}`
- Committed promoted mirrors verified against the locked identity: **true**

## 2. run_id determinism

- Instance A run_id: `9a773e1c520d842f9d01766034220bf2d51377c3e592b5703b11067b8023695f`
- Instance B run_id: `9a773e1c520d842f9d01766034220bf2d51377c3e592b5703b11067b8023695f`
- Deterministic: **true**

## 3. Structural schema validation

- Status: `passed` (29/29 checks passed)

## 4. Missing-history subgroup report

- Count: 125 / 610 (share 0.2049)
- By position: {"QB":15,"RB":36,"TE":23,"WR":51}
- Every no-history row entirely null: **true**

## 5. Replay smoke test (reused #121 full-design rerun, plumbing check only)

| Arm | Observed | Pinned (#122) |
|---|---|---|
| baseline_only | MAE 68.926 / RMSE 88.553 | MAE 68.926 / RMSE 88.553 |
| real_player_history_features | MAE 40.034 / RMSE 57.287 | MAE 40.034 / RMSE 57.287 |
| shuffled_player_history_control | MAE 72.031 / RMSE 90.409 | MAE 72.031 / RMSE 90.409 |

Matches pinned #122 numbers exactly: **true**

## 6. Future gates still not satisfied

- production acceptance threshold proposal
- production-path leakage audit execution against a concrete wiring proposal
- human sign-off on a specific wiring PR
- seasonalPprModel.ts integration issue
- Fantasy/product consumer issue, if ever proposed

## Reproduce

```bash
npm run replay:player-history-contract-v0 -- --artifact=/path/to/player_season_coverage_v0.json --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build && npm test
```
