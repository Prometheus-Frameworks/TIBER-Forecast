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

## What it predicts

- **Target**: full-season total PPR fantasy points scored in the 2025 NFL
  regular season.
- **Inputs**: 2024-season features only (no in-season 2025 information).
- **Scope**: skill positions only (QB / RB / WR / TE), per repo scope.

## Run it

```bash
npm run backtest:seasonal-ppr -- [outputDir] [--generated-at=<iso>] [--lambda=<n>]
```

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

## Governance and fail-closed behavior

- The dataset (`tiber-data-seasonal-ppr-2024-2025`) is a curated, versioned
  **mirror snapshot** of the TIBER-Data seasonal skill-position PPR table. PPM
  does not pull live from TIBER-Data (see
  `tiber-data-fixture-adapter-decision.md`). Its governance status is `fixture`,
  never `governed`, and it must never masquerade as governed to a promotion gate.
- Rows whose 2025 actual outcome is missing/invalid **fail closed**: they are
  emitted with `governance_status: "unavailable"`, `predicted_ppr: null`, and are
  excluded from all error metrics.
- The service fails (no artifact) when there are too few usable rows to fit the
  model, rather than emitting a degenerate report.
- Every report and every prediction row carries
  `output_kind: "model-inference"`.

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
- Single season pair; LOOCV is not an out-of-period holdout.
- Small skill-position sample; does not generalize to all players or rookies
  without 2024 input data.
- Injuries, role/team changes, and rookie breakouts are unmodeled and drive the
  largest misses.
- 2024 box-score volume/efficiency features only; no schedule/age/scheme signals.
- Not integrated with TIBER-Fantasy; no downstream behavior changes.

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
