# Capability: `player_history_production_only_v0`

**Status:** implemented, activated behind an explicit opt-in, activation-verified.
**This is the reference instance of the [Forecast governed capability path](./README.md).** Future
capabilities (Rookies, TeamState, FORGE, or otherwise) are expected to earn production binding through
the same sequence of separately-reviewed, separately-decided stages documented below.

## Capability identity

| | |
| --- | --- |
| Capability / contract ID | `player_history_production_only_v0` |
| Contract version | `1.0.0` (accepted; see `PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID`/`_VERSION` in `src/contracts/seasonalPprBacktest.ts`) |
| Feature family | `production` only (prior-year/trailing PPR aggregates) -- NOT the full player-history feature set (coverage/usage/age-career/team-context families remain unbound; see [Full-feature-set bar](#full-feature-set-bar-not-cleared)) |
| Production consumer | The seasonal PPR Forecast path (`src/models/seasonal/seasonalPprModel.ts`, `src/contracts/seasonalPprBacktest.ts`, `src/datasets/seasonal/loadSeasonalPprDataset.ts`, `src/services/runSeasonalPprBacktestService.ts`) |
| Default behavior | **Inert.** Every existing caller's output is unchanged unless it explicitly opts in (see [Activation](#activation)) |

## Source of truth

| | |
| --- | --- |
| Source-of-truth repo | `Prometheus-Frameworks/TIBER-Data` |
| Promoted artifact | `exports/promoted/nfl/player_season_coverage_v0.json` |
| Promoted artifact sha256 | `d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac` |
| Promotion review | `TIBER-Data#202` (merge `711d6ee158d4e3bd116d1df4d76dea282200454d`) |
| Promotion manifest | `exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json` |

This identity is hardcoded and fail-closed verified in `src/datasets/seasonal/playerHistoryProductionOnlySource.ts`
(`verifyPlayerHistoryMirrorProvenance`) -- any mismatch on repo, artifact path, sha256, promotion
review, promotion merge commit, artifact status, or the approved input-season window throws rather
than proceeding with a "close enough" source.

## Forecast mirrors and reports used

| Stage | Mirror / report |
| --- | --- |
| Forecast input mirror (locked, currently consumed) | `data/fixtures/tiberData/player_history_2021_2023_input_mirror.json` (seasons 2021-2023, REG, QB/RB/WR/TE) |
| Forecast outcome mirror | `data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json` |
| Pre-#143 default-behavior baseline (pinned regression fixture) | `data/fixtures/seasonalPpr/pre_143_baseline_report.json`, `pre_143_baseline_predictions.jsonl` |
| Mirror refresh report | `docs/reports/player-history-2024-from-2021-2023-mirror-refresh-2026-07-07.{json,md}` (#135/#136) |
| Additional validation report | `docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.{json,md}` (#137/#138) |
| Threshold review report | `docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.{json,md}` (#139/#140) |
| Production-binding prerequisite review report | `docs/reports/player-history-production-binding-review-2026-07-08.{json,md}` (#141/#142) |
| Production-binding implementation report | `docs/reports/player-history-production-binding-implementation-2026-07-08.{json,md}` (#143/#144) |
| Activation verification report | `docs/reports/player-history-production-binding-activation-verification-2026-07-08.{json,md}` (#145/#146) |

## Validation shape

Real-vs-baseline-vs-shuffled-control comparison (joined-population LOOCV ridge regression), evaluated
**independently across two disjoint origins** with no averaging across them, per the #134 aggregation
rule:

- **2025-from-2022-2024** (promoted-source rerun, #121/#122): joined MAE 40.03 (real) vs. 68.93
  (baseline) vs. 72.03 (shuffled) -- real beats both.
- **2024-from-2021-2023** (#137/#138 additional validation, a second, disjoint target season/input
  window): joined MAE 44.82 (real) vs. 71.91 (baseline) vs. 73.46 (shuffled) -- real beats both.

Five of the six pre-registered PR #132 quantitative threshold components passed independently for
**both** origins (relative MAE/RMSE improvement over baseline and shuffled control, absolute MAE/RMSE
ceilings, no-history subgroup reporting).

### Full-feature-set bar: not cleared

The sixth component -- `production_only_vs_full_feature_set_added_value_bar` -- requires the full
feature set (coverage + usage + age-career + team-context, in addition to `production`) to beat
`production_only` by more than 2% relative joined-MAE. The observed gap (carried forward from #116's
ablation) is **0.35%**, well under the bar. This means `production_only` remains the only eligible v0
scope; the full feature set has never been, and is not now, authorized for production binding.

## Decisions emitted at each stage

| Stage | Issue / PR | Decision |
| --- | --- | --- |
| Mirror refresh | #135 / #136 | `may_open_player_history_2024_from_2021_2023_additional_validation_issue` |
| Additional validation | #137 / #138 | `may_open_player_history_2024_from_2021_2023_threshold_review_issue` |
| Threshold review | #139 / #140 | `may_open_player_history_production_binding_review_issue` |
| Production-binding prerequisite review | #141 / #142 | `may_open_player_history_production_binding_implementation_issue` |
| Production-only implementation | #143 / #144 | `player_history_production_binding_implemented_pending_human_signoff` (PR #144 was reviewed and approved by a human maintainer before merge -- see the PR's review history) |
| Activation verification | #145 / #146 | `player_history_production_binding_activation_verified` (10/10 independent checks passed against the merged `main` implementation) |

**On "human sign-off":** the `human_signoff_recorded` field emitted by every committed report and every
runtime disclosure (`src/services/runSeasonalPprBacktestService.ts`) is **always `false`**, by design --
an automated report can never self-certify a human decision, so this field is not something that
"becomes true" once a human has looked at the code. A human maintainer reviewing and approving the
PR #144 diff is a real, separate fact (visible in that PR's GitHub review history), but it is not the
same thing as the codebase's sign-off gate being satisfied, and it does not carry forward to authorize
any *future*, differently-scoped activation proposal. Any activation beyond the bundled scaffold
fixture requires its own explicit, separately-recorded human review of that specific proposal.

## Default / off behavior

Every existing caller of the seasonal PPR model and service -- and every run of
`npm run backtest:seasonal-ppr` / `forecast:seasonal-ppr` / `verify:seasonal-ppr` without an explicit
flag -- is **byte-for-byte unaffected** by this capability's existence. Verified in #145/#146 against
the pinned pre-#143 baseline (`data/fixtures/seasonalPpr/`): identical `predicted_ppr`, `actual_ppr`,
`absolute_error`, `feature_coverage_status`, `governance_status`, `features_present`, and overall
MAE/RMSE. The only difference in a disabled run's output is additive report metadata (the longer
`feature_list`, the corresponding all-missing `missing_feature_coverage` entries, and the
`player_history_production_only: { enabled: false, source_artifact_sha256: null }` disclosure block).

## Activation

Activation is opt-in and layered, never automatic:

1. **CLI**: `scripts/runSeasonalPprBacktest.ts --enable-player-history-production-only` (default off).
   Loads the locked mirror, verifies its provenance, and attaches player-history to the dataset before
   training.
2. **Service**: `RunSeasonalPprBacktestOptions.playerHistoryProductionOnly` must be set to
   `{ enabled: true, sourceArtifactSha256: <the locked sha256> }`, or the service reports
   `enabled: false` and no player-history feature is used, regardless of what the dataset carries.
3. **Model**: `TrainSeasonalRidgeOptions.playerHistoryProductionOnly` -- the **same** gate must be
   passed to `trainSeasonalRidgeModel` itself. A direct caller of the model (bypassing the service
   entirely, e.g. via the public library export) cannot influence predictions with attached or forged
   `player_history` data unless it supplies this exact gate.

## Fail-closed provenance / model-gate principles

- **Artifact identity is locked and verified, never assumed.** `verifyPlayerHistoryMirrorProvenance`
  checks repo, artifact path, sha256, promotion review, promotion merge commit, artifact status, and
  the approved input-season window; any mismatch throws.
- **Identity, not just presence, gates a join.** `player_id` values are not guaranteed unique across
  every fixture in this repo (confirmed real collisions exist between the bundled scaffold and the
  real mirror); `attachPlayerHistoryProductionOnly` additionally requires a `position` match before
  trusting a join, and nulls out on any mismatch rather than borrowing a different real player's
  history.
- **Missing history is explicit, never zero-filled at the observation level.** A player absent from
  the mirror (or failing the identity check) gets `player_history: null`. Individual model features
  still default numerically to `0` when history is null -- exactly like every pre-existing numeric
  feature already did for a missing value -- and a constant-zero column is provably decoupled from
  every other coefficient in the ridge normal equations.
- **The gate is enforced at every layer that can produce a prediction**, not only the "front door"
  service. `resolveGatedPlayerHistory` (`src/contracts/seasonalPprBacktest.ts`) is the single,
  shared implementation both the model and the service call; there is exactly one gate, not two that
  could drift.

## What this capability does NOT authorize

- Full-feature-set wiring (coverage/usage/age-career/team-context families). The added-value bar for
  those remains uncleared (0.35% observed vs. a 2% bar).
- Any Fantasy/product/UI/rankings/advice/start-sit/trade/draft behavior. Nothing downstream of the
  seasonal PPR backtest consumes this capability's output as advice.
- Any TIBER-Data change, artifact promotion/demotion, or threshold amendment.
- Activation against anything beyond the bundled scaffold fixture without a human reviewer with
  authority over `seasonalPprModel.ts` explicitly signing off on that specific proposal -- activation
  verification confirms the mechanism works, it does not substitute for that sign-off.
- Treating this capability's validated/activated status as precedent that a *future* capability's
  narrower feature subset, weaker evidence, or unreviewed source artifact should be waved through
  faster. Every capability earns its own path.
