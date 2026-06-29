# Run 1 path audit for Run 2 integration

> **Status:** docs/audit only. This maps the existing **Run 1** training/
> evaluation path so a future **Run 2** (adding governed Teamstate/TTS inputs)
> can attach cleanly. It changes no model behavior, trains nothing, evaluates
> nothing, and generates no model artifacts. Run 2 is **not** implemented here.

Run 1 is the current [seasonal PPR backtest](seasonal-ppr-backtest.md): it
forecasts **2025 full-season PPR** from **2024** box-score features only, with
the 2025 actual outcome layer sourced from TIBER-Data. The Run 2 preparation
chain so far is rehearsal-only: governed Teamstate input boundary (#68) → Run 2
dry-run manifest rehearsal (#71) → feature inclusion preflight (#73) → feature
table rehearsal (#75). This audit is the bridge from "what fields/shape are
allowed" to "where a real Run 2 feature matrix would attach."

## Run 1 pipeline map

```
scripts/runSeasonalPprBacktest.ts            (CLI runner — internal, not build-wired)
  └─ resolveDataset()
       ├─ tiberDataSeasonalPprDataset        (bundled scaffold fixture, default)
       └─ --ppr-artifact=<path>
            ├─ parseTiberDataWeeklyPprArtifact()           (validate raw TIBER-Data shape)
            └─ loadSeasonalPprDatasetFromWeeklyOutcomes()  (weekly rows → player-season observations)
  └─ runSeasonalPprBacktestService(dataset, { generatedAt, lambda })
       ├─ filter usable rows (hasUsableActual)             (fail-closed on missing 2025 actual)
       ├─ LOOCV loop over scored rows (by player_id):
       │     ├─ trainSeasonalRidgeModel(trainRows)         (ridge fit, train-only standardization)
       │     ├─ baselinePrevYearPpr / baselinePositionMean (baselines)
       │     └─ model.predict / model.explain(target)
       ├─ summarizeSeasonalErrors / …ByPosition            (MAE, RMSE, corr, rank corr)
       ├─ beats-baseline check + top misses + coverage
       └─ build SeasonalPprBacktestReport + prediction rows + explanation rows
  └─ writeSeasonalPprBacktestArtifacts({ output_dir, report, predictions, explanations })
       └─ report.json + predictions.jsonl + explanations.jsonl  (default data/backtests/seasonal-ppr/)
```

## Key files / functions

| Concern | File | Symbols |
| --- | --- | --- |
| CLI runner (entry) | `scripts/runSeasonalPprBacktest.ts` | `parseArgs`, `resolveDataset`, `main` |
| Orchestration | `src/services/runSeasonalPprBacktestService.ts` | `runSeasonalPprBacktestService` |
| Dataset loader (inputs+target) | `src/datasets/seasonal/loadSeasonalPprDataset.ts` | `loadSeasonalPprDatasetFromWeeklyOutcomes`, `aggregateSeason`, `resolveGovernance` |
| Raw artifact parse | `src/datasets/seasonal/parseTiberDataWeeklyArtifact.ts` | `parseTiberDataWeeklyPprArtifact` |
| Bundled scaffold dataset | `src/datasets/seasonal/tiberDataSeasonalPprDataset.ts` | `tiberDataSeasonalPprDataset` |
| Model + feature list | `src/models/seasonal/seasonalPprModel.ts` | `trainSeasonalRidgeModel`, `seasonalPprFeatureList`, `seasonalPprNumericFeatureNames` |
| Baselines | `src/models/seasonal/seasonalPprBaselines.ts` | `baselinePrevYearPpr`, `baselinePositionMean` |
| Metrics | `src/datasets/seasonal/evaluateSeasonalPpr.ts` | `summarizeSeasonalErrors`, `summarizeSeasonalErrorsByPosition` |
| Contract / constants | `src/contracts/seasonalPprBacktest.ts` | `SEASONAL_PPR_INPUT_SEASON`, `SEASONAL_PPR_TARGET_SEASON`, `SEASONAL_PPR_TARGET_DEFINITION`, `SEASONAL_PPR_OUTPUT_KIND`, `SeasonalPlayerObservation`, `SeasonalPprBacktestReport` |
| Output writer | `src/artifacts/writeSeasonalPprBacktestArtifacts.ts` | `writeSeasonalPprBacktestArtifacts` |

> A separate weekly **WR/TE baseline ML** path exists (`src/models_ml/**`,
> `src/datasets/splits/**` time-series/rolling backtests, `runModelBacktestService`).
> It is **not** Run 1 for the TTS experiment and is out of scope for Run 2 here;
> Run 1 = the seasonal PPR ridge backtest above.

## Input / target / evaluation flow

- **Input rows / features are built** in `loadSeasonalPprDatasetFromWeeklyOutcomes`
  (weekly TIBER-Data rows → one `SeasonalPlayerObservation` per player at the
  input season) and turned into the numeric design matrix in
  `seasonalPprModel.ts`. Features: `ppr_2024`, `ppr_per_game_2024`, `games_2024`,
  `targets_2024`, `rush_attempts_2024`, plus `position` one-hot (TE reference).
  Numeric columns are standardized using **training statistics only**.
- **Target / label columns are defined** by `ppr_2025_actual` on
  `SeasonalPlayerObservation`, with the plain-language `SEASONAL_PPR_TARGET_DEFINITION`
  ("full-season total PPR … 2025 … predicted from 2024 input features only").
  The target is derived in the loader's `aggregateSeason` (final-week cumulative
  `season_ppr`, else summed weekly `ppr_points`).
- **Forecast / input seasons are handled** by `SEASONAL_PPR_INPUT_SEASON = 2024`
  and `SEASONAL_PPR_TARGET_SEASON = 2025` (overridable via loader options). The
  model-facing **position and team come from the input season only** so a
  2024→2025 change cannot leak target-season info.
- **Train/test splitting** is **leave-one-out cross-validation (LOOCV) by
  `player_id`**, implemented inline in the service loop (the row being predicted
  is never in its own training set). There is no out-of-period holdout season
  (single 2024→2025 pair).
- **Training happens** in `trainSeasonalRidgeModel` (closed-form ridge normal
  equations; deterministic; no external ML deps), refit per LOOCV fold.
- **Evaluation happens** in `evaluateSeasonalPpr.ts`. **Metrics produced:**
  `sample_size`, `mae`, `rmse`, `correlation` (Pearson), `rank_correlation`
  (Spearman) — overall and by position — plus a `beats_baseline` decision vs the
  previous-year-PPR and position-mean baselines, `top_misses`, and
  `missing_feature_coverage`. Rows with a missing/invalid 2025 actual are
  `unavailable` and excluded from all metrics.

## Manifest / output flow

- The runner writes three deterministic, read-only artifacts via
  `writeSeasonalPprBacktestArtifacts`:
  `seasonal_ppr_backtest_report.json`, `seasonal_ppr_predictions.jsonl`,
  `seasonal_ppr_prediction_explanations.jsonl` (default
  `data/backtests/seasonal-ppr/`). Not wired into build/start; not auto-promoted.
- The **`SeasonalPprBacktestReport`** is the self-describing run record for Run 1:
  `report_version`, `model_version`, `generated_at`, `target_definition`,
  input/target seasons, a `dataset` block (`governance_status`, `data_source`,
  `source_dataset_refs`, `provenance`, row counts), `feature_list`,
  `evaluation_method`, `model` + `baselines`, `beats_baseline(_summary)`, and
  `limitations`. Every row/report is stamped `output_kind: "model-inference"`.
- Note there are **two distinct manifest concepts** in the repo: this seasonal
  report, and the `projection_run_manifest` (`src/contracts/projectionArtifacts.ts`)
  used by the projection rehearsal and the Run 2 rehearsal chain
  ([run manifest spec](run-manifest-spec.md)). Run 2 reporting should reconcile
  the two rather than invent a third.

## Public API vs internal runner code

- **Public** (`src/public/index.ts`): the seasonal contract + constants,
  `loadSeasonalPprDatasetFromWeeklyOutcomes`, `parseTiberDataWeeklyPprArtifact`,
  `tiberDataSeasonalPprDataset`, `trainSeasonalRidgeModel`,
  `seasonalPprFeatureList`, `baselinePrevYearPpr`/`baselinePositionMean`,
  `summarizeSeasonalErrors(ByPosition)`, `runSeasonalPprBacktestService`,
  `writeSeasonalPprBacktestArtifacts`, and the whole Run 2 rehearsal chain
  (`buildRun2ManifestRehearsal`, `buildRun2FeatureInclusionPreflight`,
  `buildRun2FeatureTableRehearsal`, `fixtureGovernedTeamstateReadinessReport`).
- **Internal runner**: `scripts/runSeasonalPprBacktest.ts` (CLI wiring, arg
  parsing, stdout summary) is **not** exported and should stay that way.

## Proposed Run 2 integration seam

The rehearsal chain already establishes the row grain and the allowed-column
set; Run 2 attaches there, **not** by forking the model or metrics.

- **Grain alignment.** The feature table rehearsal (#75) uses
  `row_grain: "player_season_forecast_rehearsal"`, which matches Run 1's
  `SeasonalPlayerObservation` (one row per player at the input season). A Run 2
  feature matrix builder joins governed **team-week** Teamstate
  (`team_week_raw_v0`) → **player-season** at the **2024 input-season cutoff**
  (team→player join + team-week → input-season aggregation).
- **Where it attaches.** The cleanest seam is a Run 2 dataset/feature builder
  that takes the existing `SeasonalPprDatasetDescriptor` (Run 1 rows) and the
  **feature inclusion preflight** output, then appends only preflight-`included`
  and `partial_null` Teamstate columns as additional numeric features. The
  builder feeds the **same** `trainSeasonalRidgeModel`, the **same** LOOCV loop,
  and the **same** `evaluateSeasonalPpr`. Concretely: extend the numeric feature
  list consumed by `seasonalPprModel.ts` with the governed TTS columns behind a
  preflight gate — no change to target, split, or metrics.
- **Reuse, do not duplicate.** Run 2 must call
  `readGovernedTeamstateInput` → `buildRun2ManifestRehearsal` →
  `buildRun2FeatureInclusionPreflight` → `buildRun2FeatureTableRehearsal` to
  decide columns, then bind real values; it must not re-derive eligibility.

## Invariants that must stay fixed between Run 1 and Run 2

For a clean Run 1 ↔ Run 2 comparison, only the **feature set** may change. All
of the following must remain identical:

1. **Target** — `ppr_2025_actual`, full-season 2025 PPR (`SEASONAL_PPR_TARGET_DEFINITION`).
2. **Input-season cutoff** — 2024 inputs only; position/team from the input season.
3. **Population & folds** — the same scored players and the same LOOCV-by-`player_id` folds.
4. **Evaluation method & metrics** — `evaluateSeasonalPpr` (MAE/RMSE/corr/rank corr, overall + by position).
5. **Baselines** — previous-year PPR and position-mean, evaluated the same way.
6. **Fail-closed handling** — missing/invalid actual ⇒ `unavailable`, excluded from metrics; `MIN_SCORED_ROWS` gate.
7. **Train-only standardization** and deterministic closed-form fit.
8. **Output framing** — `output_kind: "model-inference"`, non-promotion, governed-only predictive approval.

A **shuffled-TTS sanity arm** (TTS columns permuted across teams) should be part
of Run 2 as a leakage detector, per the
[Run 2 TTS feature contract](run2-tts-feature-contract.md).

## Explicitly excluded from Run 2

- **Pressure** — `pressureRateAllowed` stays `unavailable / insufficient_data /
  deferred`; never constructed, imputed, backfilled, estimated, inferred, or
  zero-filled.
- **Target leakage** — no 2025/target-derived or future-season fields as inputs;
  input-season position/team only.
- **Fantasy split contamination** — fantasy split fields excluded/absent.
- **Ungoverned / deferred Teamstate fields** — only preflight-`included` /
  `partial_null` governed fields are eligible.
- **Advice / ranking / product output** and **predictive claims** — out of scope.

## Non-governed / non-ready areas (today)

- Seasonal dataset governance is **`fixture`** unless TIBER-Data supplies an
  explicit governed marker (`resolveGovernance`); governed is never inferred
  from a path. Committed artifacts are scaffold-only and not approved for
  predictive use.
- No real governed **TTS/Teamstate artifact with a recorded forecast cutoff** is
  mounted yet; the rehearsal chain runs on
  `fixtureGovernedTeamstateReadinessReport`.
- Teamstate **pressure** is deferred upstream (insufficient data); red-zone is
  partial-null.

## Recommended next issue

**Forecast: add Run 2 feature matrix builder (pre-train, gated by preflight).**
Build the real player-season Run 2 feature matrix by joining governed,
preflight-allowed Teamstate columns onto the existing Run 1
`SeasonalPlayerObservation` rows at the 2024 cutoff — preserving partial-null
posture, excluding pressure/leakage/fantasy/ungoverned fields, and including a
shuffled-TTS leakage-sanity scaffold. Still **no training, no evaluation, no Run
2 execution, and no Run 1 ↔ Run 2 metric comparison** — those remain gated on a
mounted governed TTS artifact with a recorded cutoff (per the acceptance gates
in the [Run 2 TTS feature contract](run2-tts-feature-contract.md)).
