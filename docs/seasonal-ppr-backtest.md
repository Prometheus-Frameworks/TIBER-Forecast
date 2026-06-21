# Seasonal PPR Backtest (2024 → 2025)

> **This produces MODEL INFERENCE, not observed reality.** Every output is an
> estimate from a simple model. Nothing here is advice, and nothing downstream
> (TIBER-Fantasy Management, Team Direction, scoring, promotion gates, UI) may
> consume these outputs until a later contract/display PR is approved.

This is the first governed Point-Prediction-Model backtest (Issue #49). It uses
2024-season input features to predict known **2025 full-season PPR** outcomes,
where the 2025 actual PPR layer is sourced from TIBER-Data. Its only purpose is
to prove the backtest → report → artifact loop and to make the model's
limitations obvious — including whether it actually beats a dumb baseline.

## What this is (and is not)

What the PR ships and validates is the **governed loader / evaluation / report /
artifact harness**, not an approved predictive model:

1. This validates the PPM loader → backtest → report → artifact harness.
2. The bundled scaffold is **not** full real 2025 coverage — it is PPM-local
   scaffold/fixture data, never the upstream TIBER-Data artifact.
3. The current MAE/RMSE is **not** approval for 2026 predictive use.
4. Real model-quality approval is **deferred** until the canonical TIBER-Data
   artifact is mounted (via `--ppr-artifact`) and verified.
5. **No** TIBER-Fantasy integration happens here.
6. **No** TIBER-Rookies ML is revived.
7. **No** neural networks and **no** advice language.

PPM does not own or publish TIBER-Data's canonical artifact paths; it consumes
them only when mounted/provided through the CLI seam.

## What it predicts

- **Target**: full-season total PPR fantasy points scored in the 2025 NFL
  regular season.
- **Inputs**: 2024-season features only (no in-season 2025 information).
- **Scope**: skill positions only (QB / RB / WR / TE), per repo scope.

## Run it

```bash
npm run backtest:seasonal-ppr -- [outputDir] [--generated-at=<iso>] [--lambda=<n>] [--ppr-artifact=<path>]
```

With `--ppr-artifact=<path>` the runner reads a real TIBER-Data weekly PPR
artifact and aggregates it through the loader (see **TIBER-Data integration**
below). Without it, a bundled **scaffold-only** weekly fixture is used.

Defaults to `data/backtests/seasonal-ppr/`. Passing a fixed `--generated-at`
makes the run fully deterministic (byte-identical artifacts). Outputs:

- `seasonal_ppr_backtest_report.json` — the evaluation report.
- `seasonal_ppr_predictions.jsonl` — one governed prediction row per player.

The runner is intentionally **not** wired into `build`/`start` and is **not**
auto-promoted.

## Model and baselines

| Name | Kind | Description |
| --- | --- | --- |
| `seasonal-ppr-ridge-v1` | model | Ridge (L2) linear regression over standardized 2024 features + position one-hot (TE reference). No neural networks; closed-form, deterministic. |
| `baseline-prev-year-ppr` | naive baseline | Predicts 2025 PPR = 2024 PPR (persistence). |
| `baseline-position-mean` | naive baseline | Predicts 2025 PPR = mean 2025 PPR at the same position. |

The model must beat the best baseline's MAE to justify itself. The report states
this explicitly via `beats_baseline` / `beats_baseline_summary`. If it does not
beat baseline, that is an acceptable and honest result — the report says so.

### Features

`ppr_2024`, `ppr_per_game_2024`, `games_2024`, `targets_2024`,
`rush_attempts_2024`, and `position` (one-hot). Numeric features are
standardized using **training statistics only**; the intercept is unpenalized.

## Honest evaluation (LOOCV)

With a single 2024→2025 season pair there is no separate holdout season, so
in-sample fitting would overstate quality. The ridge model and the position-mean
baseline are therefore evaluated with **leave-one-out cross-validation**: the row
being predicted is never in its own training set. LOOCV reduces but does not
eliminate optimism — see limitations.

The report includes MAE, RMSE, Pearson correlation, rank correlation, a
by-position breakdown for every model/baseline, and the largest misses.

## TIBER-Data integration (the loader)

> **This is a harness/loader PR, not a model-quality approval.** It proves the
> ingestion → aggregation → backtest loop works against the real TIBER-Data
> artifact shape and compares against baselines. It does **not** approve the
> model for 2026 predictive use until a canonical source-backed/governed
> TIBER-Data artifact is wired and verified.

The dataset is built by aggregating TIBER-Data **weekly** outcome rows into
2024→2025 player rows, rather than from a hand-written table. Integration
targets (consumed only when mounted; never trusted by path name):

| Lane | Path |
| --- | --- |
| Promoted PPR | `exports/promoted/nfl/player_weekly_ppr_outcomes_v1.json` |
| Source-backed PPR | `data/processed/evidence/player_weekly_ppr_outcomes_2025.source_backed.json` |
| Promoted usage | `exports/promoted/nfl/player_weekly_usage_v1.json` |
| Source-backed usage | `data/processed/evidence/player_weekly_usage_2025.source_backed.json` |

The weekly PPR and usage row schemas are mirrored in
`src/contracts/tiberDataWeeklyOutcomes.ts`. The seasonal target is derived from
the **PPR** artifact; the usage schema is supported for completeness but is not
required to build the target.

**Loader rules** (`src/datasets/seasonal/loadSeasonalPprDataset.ts`):

- Group by `player_id`. The **model-facing `position` comes from the
  input-season (2024) aggregate** — never the target season — so a player who
  changes positions between 2024 and 2025 cannot leak target-season information
  into the position feature, the position-mean baseline, or by-position metrics.
  `team_2024` is likewise taken from the input season. The display
  `player_name` may use the latest available season's final week (deterministic)
  because it never feeds model features, baselines, or evaluation.
- **Season actual rule** (explicit + tested): use the final (max-week) row's
  `season_ppr` when finite; otherwise sum weekly `ppr_points`. No synthetic
  missing-week rows are inserted.
- Null numeric source fields are treated as zero when shaping output.
- Drop rows with missing/invalid `ppr_points`, `player_id`, `season`, or `week`.
- A player with 2024 inputs but no usable 2025 outcome → `unavailable`
  (null actual). A player with only 2025 rows (no 2024 inputs, e.g. rookies) is
  skipped — it cannot form a 2024→2025 row.
- **Fail closed** (no dataset) when the same `season|week|player_id` appears with
  conflicting values; identical duplicates are collapsed with a warning.

### Bundled scaffold

Because this session cannot reach TIBER-Data, a clearly-labeled scaffold weekly
artifact (`src/datasets/seasonal/fixtures/tiberDataWeeklyPprScaffold.ts`,
synthesized from `seasonalPprSeedSnapshot.ts`) stands in so the harness runs and
is testable. It is scaffold-only fixture coverage. To run against real data:

```bash
npm run backtest:seasonal-ppr -- --ppr-artifact=/path/to/player_weekly_ppr_outcomes_v1.json
```

## Governance and fail-closed behavior

- Governance status is **`fixture`** by default and is **never** upgraded by path
  name. `governed` is honored only when TIBER-Data supplies an **explicit marker**
  (`{ status: 'governed', source: 'explicit_marker' }`); a `governed` claim with
  any weaker source is downgraded to `fixture`.
- Rows whose 2025 actual outcome is missing/invalid **fail closed**: they are
  emitted with `governance_status: "unavailable"`, `predicted_ppr: null`, and are
  excluded from all error metrics.
- The loader fails closed on conflicting source rows; the service fails (no
  artifact) when there are too few usable rows to fit the model.
- Every report and every prediction row carries
  `output_kind: "model-inference"`. No downstream repo consumes these outputs
  until a later contract/display PR is approved.

## Prediction artifact row shape

Each line in `seasonal_ppr_predictions.jsonl` includes: `player_id`,
`player_name`, `position`, `input_season` (2024), `target_season` (2025),
`predicted_ppr`, `actual_ppr`, `absolute_error`, `model_version`,
`source_dataset_refs`, `dataset_version`, `feature_coverage_status`,
`features_present`, `governance_status`, `output_kind`, and `generated_at`.

## Limitations

These are stamped into the report and worth repeating:

- Output is inference, not fact, and not advice.
- Fixture-sourced dataset; not a live governed pull.
- **Harness/loader validation only — not approved for 2026 predictive use** until
  a canonical source-backed/governed TIBER-Data artifact is wired and verified.
- Single season pair; LOOCV is not an out-of-period holdout.
- Small skill-position sample; does not generalize to all players or rookies
  without 2024 input data.
- Injuries, role/team changes, and rookie breakouts are unmodeled and drive the
  largest misses.
- 2024 box-score volume/efficiency features only; no schedule/age/scheme signals.
- Not integrated with TIBER-Fantasy; no downstream behavior changes.

## Code map (loader additions)

- Weekly artifact contract: `src/contracts/tiberDataWeeklyOutcomes.ts`
- Loader: `src/datasets/seasonal/loadSeasonalPprDataset.ts`
- Artifact parser: `src/datasets/seasonal/parseTiberDataWeeklyArtifact.ts`
- Scaffold fixture + seed: `src/datasets/seasonal/fixtures/`
- Default dataset (built via loader): `src/datasets/seasonal/tiberDataSeasonalPprDataset.ts`
- Loader tests: `tests/loadSeasonalPprDataset.test.ts`

## Code map

- Contract: `src/contracts/seasonalPprBacktest.ts`
- Dataset (TIBER-Data mirror): `src/datasets/seasonal/tiberDataSeasonalPprDataset.ts`
- Model: `src/models/seasonal/seasonalPprModel.ts` (+ `linearAlgebra.ts`)
- Baselines: `src/models/seasonal/seasonalPprBaselines.ts`
- Evaluation: `src/datasets/seasonal/evaluateSeasonalPpr.ts`
- Service: `src/services/runSeasonalPprBacktestService.ts`
- Artifact writer: `src/artifacts/writeSeasonalPprBacktestArtifacts.ts`
- Runner: `scripts/runSeasonalPprBacktest.ts`
- Tests: `tests/seasonalPprBacktest.test.ts`
