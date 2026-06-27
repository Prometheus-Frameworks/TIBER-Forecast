# Run manifest & run-to-run visibility spec

> **Status:** reporting-contract spec. Defines the **run manifest** that every
> Forecast run should emit and makes **run-to-run comparison a first-class
> UI/reporting requirement**, not an afterthought. This is a spec for reporting
> structure; it does not train a model or change forecast math.

## Why run-to-run visibility is a core feature

A forecast number on its own is not inspectable. The Forecast Lab UI/report must
make a run **auditable** by prominently answering six questions:

1. **Here is what the model saw.** — inputs, artifacts, versions, governance,
   feature set, row counts, exclusions.
2. **Here is the forecast.** — the forecast value(s) with **range/uncertainty**
   (floor/median/ceiling or confidence band), never a bare deterministic point.
3. **Here is why the forecast moved.** — per-forecast drivers (feature
   contributions / coefficients / signal summary) for the current run.
4. **Here is what changed from the previous run.** — a diff against the prior run:
   inputs, features, governance, and per-player forecast movement.
5. **Here are the new artifacts/features added in this run.** — added / removed /
   changed feature groups and input artifacts vs the prior run.
6. **Here are the metrics that improved or degraded.** — metric deltas
   (overall + position-level + calibration), labeled improved/degraded/unchanged.

These are reporting requirements: the UI must not display only a final number.
Forecast output, input context, uncertainty, and run-to-run movement are all
required surfaces.

## Run manifest fields

Each Forecast run emits a manifest (machine-readable JSON) capturing at minimum:

### Identity & provenance
- `run_id` — stable unique ID for the run.
- `generated_at` — ISO timestamp (a fixed value keeps a run byte-deterministic).
- `git_commit_sha` — commit the run was produced from.
- `lane_name` / `lane_version` — e.g. Fantasy Point Forecast lane + version.
- `forecast_cutoff` — the as-of date; all inputs must be valid before it (no
  future leakage).

### Target & evaluation design
- `target_definition` — e.g. full-season 2025 PPR.
- `input_season` / `target_season`.
- `train_eval_split` — e.g. LOOCV; method and parameters.
- `model_type` and `hyperparameters` — e.g. ridge (L2), lambda.

### Inputs & governance
- `artifact_inputs[]` — each input artifact with `path`/ref, `version`, and
  `data_source` (`bundled-scaffold` | `mounted-artifact`).
- `artifact_governance[]` — per-artifact `provenance_status`
  (`fixture` | `partial_real_data` | `governed_real_data` | …) and
  `governance_status` (`fixture` | `governed` | `ungoverned` | `unavailable`),
  plus whether an explicit governed marker was present.
- `production_ready` — boolean; **false** unless every input is governed.

### Feature set
- `feature_set_version`.
- `feature_groups_included[]` — e.g. pace/volume, pass-rate, efficiency, scoring,
  red-zone, (pressure/stability only when governed).
- `features_added[]` / `features_removed[]` / `features_changed[]` — **vs the
  prior run** (this is what powers "new artifacts/features added in this run").

### Data shape & exclusions
- `row_count_total`, `row_count_used`.
- `excluded_rows[]` — each with an `exclusion_reason` (e.g. no usable target,
  conflicting source rows, withheld TTS coverage, position-changed-leak guard).
  Exclusions are honest and itemized; rows are never silently dropped.

### Results
- `evaluation_metrics` — overall MAE, RMSE, Pearson, rank correlation,
  beats-baseline summary.
- `position_metrics` — by-position breakdown of the above.
- `calibration` — calibration summary where available.
- `signal_summary` — feature importance / coefficients / contribution summary
  where the model exposes it.
- `limitations[]` — known limitations and **leakage-risk notes**.

### Output framing (required stamps)
- `output_kind: "model-inference"` — forecast, not observed reality.
- `forecast_uncertainty` — range/band descriptor; the report must not present a
  bare point estimate as truth.
- No advice/product fields (no start/sit/trade/draft/waiver).

## Run-to-run diff block

To make comparison first-class, a run manifest references a `previous_run_id` and
carries a `diff_vs_previous` block:

```jsonc
{
  "previous_run_id": "<id or null for first run>",
  "diff_vs_previous": {
    "inputs": { "added": [], "removed": [], "changed": [] },     // artifacts + versions
    "features": { "added": [], "removed": [], "changed": [] },   // feature groups/columns
    "governance": { "changed": [] },                              // status transitions
    "metrics": {                                                  // per-metric deltas
      "overall": [{ "metric": "mae", "previous": 0, "current": 0, "delta": 0, "direction": "improved|degraded|unchanged" }],
      "by_position": []
    },
    "forecast_movement": {                                        // per-player movement
      "summary": { "moved_up": 0, "moved_down": 0, "unchanged": 0 },
      "largest_moves": [{ "player_id": "", "previous_forecast": 0, "current_forecast": 0, "delta": 0 }]
    }
  }
}
```

- **Direction is reporting language, not a truth claim.** "improved/degraded"
  describes the evaluation metric vs the prior run; "moved up/down" describes
  forecast movement. Neither asserts the model converged on a known answer.
- The first run has `previous_run_id: null` and an empty diff — the report should
  say "baseline run, no prior run to compare."

## Relationship to current artifacts

The existing seasonal backtest already emits much of this (report +
`seasonal_ppr_predictions.jsonl` + per-player explanations, `data_source`,
governance status, by-position metrics, largest misses, limitations). This spec:

- Names the **manifest** as the place these fields live together for a run.
- Adds the **`diff_vs_previous`** block and the **six prominent questions** as
  explicit UI/reporting requirements.
- Keeps everything **additive**: a future manifest writer can wrap existing report
  fields without changing forecast math or existing artifact schemas.

## Non-goals

- No model training or retraining is implied by this spec.
- No new governed artifact is produced.
- No advice/product output; this is model-evaluation/reporting structure only.

## Related specs

- [Forecast lane naming & framing](forecast-lane.md)
- [Run 2 TTS feature contract](run2-tts-feature-contract.md)
- [Seasonal PPR backtest](seasonal-ppr-backtest.md)
