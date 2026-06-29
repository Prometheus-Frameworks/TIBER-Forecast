# Run 2 TTS feature contract (planning spec)

> **Status:** planning/spec only. This document defines **what the Forecast lane
> would want from Teamstate/TTS before a Run 2 experiment**, and the governance,
> provenance, and temporal-cutoff gates that must hold before any TTS field is
> used as model input. **No TTS ingestion, training, or evaluation happens in this
> PR.** It is the contract that must be explicit *before* that work is authorized.

## Background

Run 1 (the current [seasonal PPR backtest](seasonal-ppr-backtest.md)) forecasts
full-season **2025** PPR from **2024** box-score features only. It does **not**
use Teamstate/TTS.

TIBER-Teamstate has built a safe candidate ladder for the real 2024
`team_week_raw_v0` source:

- **bye-aware coverage validation** — 32 teams, Weeks 1–18, 17 game rows/team,
  544 rows, no synthetic bye rows;
- a **dry-run candidate coverage lane** — echoes `partial_real_data` /
  `ungoverned`, pins `promoted` / `governed` false, holds pressure at
  `insufficient_data`;
- a **null-aware candidate-only rehearsal/readiness report** — per-field
  `available` / `partial_nulls` / `deferred_insufficient_data` classification,
  `rehearsalOnly`, fail-closed on invalid coverage.

That proves Teamstate can **inspect** candidate shape/readiness honestly. It does
**not** mean Forecast may train on or ingest a governed Teamstate artifact yet.
TTS is a **candidate future input family** for Run 2 only.

## TTS feature groups Forecast may want

These map to `team_week_raw_v0` team-week fields. Each is a **team-environment**
context feature (not a player stat); Run 2 would join team context to players via
team membership at the input-season cutoff.

| Group | Example TTS fields | Why plausibly useful for fantasy point forecasts |
| --- | --- | --- |
| Pace / plays / volume | `offensivePlays`, `neutralPlays`, `secondsPerPlay`, `drives` | More plays/drives → more opportunity → more fantasy points to distribute. |
| Pass-rate environment | `passRate`, `neutralPassRate`, `rushRate` | Splits the opportunity pie between pass- and rush-dependent positions. |
| Rush/pass efficiency | `epaPerPlay`, `passEpaPerPlay`, `rushEpaPerPlay`, `successRate`, `explosivePlayRate` | Efficient offenses sustain drives and reach scoring range more often. |
| Scoring environment | `pointsFor`, `pointsPerDrive` | Team scoring rate caps the fantasy points available to its skill players. |
| Red-zone opportunity context | `redZoneTrips`, `redZoneTdRate` | Red-zone volume/finish drives TD-dependent fantasy scoring. |
| Sack/pressure environment | `sacksAllowed`, `pressureRateAllowed` | Affects QB/pass-game viability — **but see deferral below**. |
| Team stability / confidence / coverage metadata | coverage validity, team-week completeness, confidence/stability tags where available | Gates how much weight a team's context deserves; metadata, not a raw stat. |

> Fantasy-point fields on the candidate artifact
> (`fantasyPointsFor*` / `fantasyPointsAllowed*`) are **deferred-null** upstream
> and are **out of scope** as Forecast inputs — Forecast must not pull a
> fantasy-points source from Teamstate (no fantasy-source pollution).

## Required / optional / deferred

| Tier | Fields | Rule |
| --- | --- | --- |
| **Required** (a TTS-enabled run must have these, finite, full coverage) | pace/volume (`offensivePlays`, `drives`, `secondsPerPlay`), pass-rate (`passRate`, `neutralPassRate`), efficiency (`epaPerPlay`, `successRate`), scoring (`pointsFor`, `pointsPerDrive`) | If any required group is missing/`partial_nulls` for a team, that team's TTS context is **withheld** for the run (the player still forecasts from non-TTS features; the TTS join is null for that team). Never zero-filled. |
| **Optional** (used if `available`, skipped honestly if not) | `explosivePlayRate`, `rushEpaPerPlay`, `passEpaPerPlay`, `redZoneTrips`, `redZoneTdRate`, stability/confidence tags | Missing → feature absent for that team, recorded in the run manifest as a skipped/optional-null, never imputed. |
| **Deferred** (must NOT be used as input until sourced/governed upstream) | `pressureRateAllowed` and any pressure-derived feature | Held at `null` / `insufficient_data` per the Teamstate #55 posture. A pressure/stability ablation arm is allowed **only** when those fields are actually governed/sourced — until then the ablation is documented but not run. |

The required/optional split is intentionally aligned with the Teamstate rehearsal
report's `available` / `partial_nulls` / `deferred_insufficient_data` field
classes, so Forecast can read readiness directly from that report rather than
re-deriving it.

## Temporal cutoff — no future leakage

- A run targeting season **Y** may use only TTS information available **before the
  season-Y forecast cutoff**. For the current Run 1/Run 2 shape (forecast 2025
  from 2024), TTS features must come from the **2024** season (the input season),
  which precedes the 2025 cutoff.
- TTS team context must be taken from the **input season** (2024), exactly as Run
  1 already takes the model-facing `position`/`team` from the input-season
  aggregate. A team's 2025 in-season TTS data must never enter a 2025-target
  forecast.
- Every TTS artifact admitted to a run must carry a cutoff/as-of marker, and the
  run manifest must record it. Any field whose validity date is at or after the
  forecast cutoff is rejected for that run.
- Coverage must be validated as of the cutoff (bye-aware coverage over the
  input-season weeks), so a partially-complete in-season pull cannot masquerade as
  a full-season context.

## Governance / provenance required for ingestion

| Artifact status | Allowed for production training/evaluation? | Allowed for rehearsal-only experiment? |
| --- | --- | --- |
| `governed_real_data` + explicit governed marker | **Yes** (once the explicit marker is present and verified) | Yes |
| `partial_real_data` / `ungoverned` | **No** | Yes — clearly labeled non-production rehearsal |
| `rehearsalOnly` rehearsal report | **No** | Yes — as readiness input only, never as a feature source of truth |
| Invalid / withheld coverage (`rehearsalStatus: withheld_invalid_coverage`) | **No** | **No** — refused; the run records the refusal reason |

Rules:

- **Governance is never inferred** from path, filename, coverage success, or
  "Forecast needs it." Only an **explicit governed marker** from TIBER-Data (the
  same `{ status: 'governed', source: 'explicit_marker' }` rule the seasonal
  loader already enforces) permits production use.
- **Coverage success is a validation result, not a governance signal.** A valid
  544-row bye-aware candidate is still `ungoverned` and still barred from
  production training.
- Until a governed TTS artifact exists, **all** TTS consumption is **rehearsal
  only** and must be labeled non-production.

## How Forecast behaves with each candidate status

- `partial_real_data` / `ungoverned`: accept for **rehearsal** runs only; mark the
  run `productionReady: false`; never include in a governed metrics comparison.
- `rehearsalOnly`: treat as a **readiness signal** (which fields are
  `available`/`deferred`), not as a feature source; do not train on it.
- Invalid/withheld coverage: **refuse**; emit a run manifest that records the
  coverage errors and the refusal, rather than a fabricated forecast.
- Pressure/`insufficient_data`: leave the corresponding feature **null**; never
  backfill, estimate, or zero-fill; exclude pressure-derived arms from reported
  metrics until governed.

## Run 2 experiment shape (document only — do not execute here)

Same target, same split, same evaluation as Run 1, adding TTS inputs:

- **Run 1 / baseline:** existing setup — 2024 box-score features forecast 2025
  full-season PPR; LOOCV; beats-baseline check.
- **Run 2:** identical target / split / evaluation method, **plus** TTS
  team-environment features joined at the 2024 input-season cutoff.
- **Compare Run 1 vs Run 2** on identical players/folds and report whether TTS
  improved: overall MAE/RMSE, position-level metrics, rank/tier usefulness, and
  calibration. A no-improvement (or degradation) result is an acceptable, honest
  outcome and must be reported as such.

### Ablation guidance

| Arm | TTS inputs | Runnable now? |
| --- | --- | --- |
| No TTS (= Run 1) | none | Yes |
| All available TTS | required + optional `available` groups | Yes, rehearsal-only, once a TTS artifact is mounted |
| Pace/volume only | pace/plays/volume group | Yes, rehearsal-only |
| Efficiency only | efficiency group | Yes, rehearsal-only |
| Pressure/stability only | pressure + stability | **Only** when those fields are governed/sourced; otherwise documented, not run |
| Shuffled-TTS sanity check | TTS columns permuted across teams | Yes — expected to **not** help; if it "improves" metrics, the join/leakage is wrong |

The shuffled-TTS arm is a required guardrail: it detects accidental leakage or a
broken team→player join before any real-signal claim is made.

## Acceptance gates before Run 2 is authorized

1. A governed (or explicitly rehearsal-labeled) TTS artifact with a recorded
   forecast cutoff exists.
2. Bye-aware coverage is valid as of the cutoff for the input season.
3. Required feature groups are `available`; optional handled as honest nulls;
   pressure stays deferred.
4. The run manifest ([spec](run-manifest-spec.md)) records artifact status,
   cutoff, feature set version, and the Run 1↔Run 2 diff.
5. Production metrics comparison is gated on `governed_real_data`; everything else
   is rehearsal-only and labeled non-production.

## Run 2 dry-run manifest rehearsal (implemented)

Forecast can assemble a Run 2 rehearsal manifest from a governed Teamstate
readiness report **without** running a model. This proves the governed
input boundary end-to-end (governance, refs, field readiness, deferred
pressure) before any training or evaluation occurs.

- Helper: `buildRun2ManifestRehearsal(teamstateReadinessReport, options?)`
  (`src/rehearsal/runRun2ManifestRehearsal.ts`), exported from the public API.
- Input: a governed `team_week_raw_v0_governed_readiness` report, validated
  through the PR #68 boundary (`readGovernedTeamstateInput`). A representative
  fixture is exported as `fixtureGovernedTeamstateReadinessReport`.
- It is a **pure manifest assembly** step: it does not call the scorer and
  shares nothing with `runProjectionRehearsal` (which does score).

The rehearsal result records:

- `rehearsal_status: "dry_run_manifest_only"`, `model_execution: "not_run"`,
  and `run_2_executed: false`.
- `teamstate_input`: the normalized governed Teamstate metadata — governance
  posture, source / validation / lineage refs, upstream + Teamstate field
  readiness, and the omitted/deferred field reasons.
- `field_disposition`: fields **included** from Teamstate (`available` /
  preserved `partial_nulls`, e.g. `redZoneTdRate`) versus **omitted/deferred**
  (`pressureRateAllowed`, insufficient data).
- `pressureRateAllowed` as `unavailable` / `insufficient_data` / `deferred`;
  red-zone partial-null posture preserved.
- `run_comparison` scaffold kept metadata-only with
  `metric_comparison_status: "not_run"`.

The emitted manifest carries **no outputs and no model refs**, and a
`RUN2_DRY_RUN_MANIFEST_ONLY` warning, so it cannot be mistaken for a completed
model run. Numeric pressure is never introduced: a fabricated pressure value
(e.g. top-level `pressureRateAllowed: 0`) is rejected by the boundary and the
rehearsal fails closed rather than assembling a manifest.

What it explicitly does **not** do: no model training, no evaluation, no Run 2
execution, no Run 1↔Run 2 metric comparison, and no pressure construction,
imputation, backfill, estimation, inference, or zero-fill.

## Run 2 feature inclusion preflight (implemented)

Before any real feature table is built, Forecast can answer: *what governed
Teamstate fields would be allowed into a future Run 2 feature table, what must
be blocked, and why?* This is a pure field-eligibility classification — no
feature matrix, no model-ready rows, no training or evaluation.

- Helper: `buildRun2FeatureInclusionPreflight(input, options?)`
  (`src/rehearsal/runRun2FeatureInclusionPreflight.ts`), exported from the
  public API.
- It is grounded in the governed boundary chain: pass a governed
  `team_week_raw_v0_governed_readiness` report (run through
  `buildRun2ManifestRehearsal`, failing closed on ungoverned input) **or** an
  already-built Run 2 manifest rehearsal result. It does not bypass
  `readGovernedTeamstateInput`.

The report records:

- `execution_status: "not_trained"`, `evaluation_status: "not_evaluated"`,
  `run_2_executed: false`.
- `included_features`: governed, `available` Teamstate fields only.
- `partial_null_features`: governed fields with preserved partial-null posture
  (e.g. `redZoneTdRate`) — never zero-filled.
- `excluded_features` + `exclusion_reasons`: explicit per-field reasons.
- `pressureRateAllowed` excluded with disposition
  `pressure_unavailable_insufficient_data_deferred` (carried through from the
  governed boundary's `unavailable` / `insufficient_data` / `deferred` pressure
  posture); pressure is never constructed or imputed.
- Fantasy-split fields and target-derived / future-season field names are
  blocked (`fantasy_split_field`, `target_leakage_risk`); ungoverned, deferred,
  missing, or fabricated fields are excluded.
- `leakage_posture`: `no_future_season_target_leakage`, with an (expected
  empty) `target_derived_fields` list — input-season team-environment fields
  only, no model target read or joined.
- Source Teamstate governance and source / validation / lineage refs preserved.

What it explicitly does **not** do: no feature matrix, no model-ready rows, no
training, no evaluation, no Run 2 execution, no Run 1↔Run 2 comparison, and no
pressure construction/imputation/backfill/estimate/inference/zero-fill.

## Run 2 feature table rehearsal (implemented)

The next step after the feature inclusion preflight: rehearse the *shape* of a
future Run 2 feature table from governed, eligible fields only — without target
leakage, pressure fabrication, or model execution.

- Helper: `buildRun2FeatureTableRehearsal(input, options?)`
  (`src/rehearsal/runRun2FeatureTableRehearsal.ts`), exported from the public API.
- Grounded in the full chain and does not bypass earlier checks:
  `readGovernedTeamstateInput` → `buildRun2ManifestRehearsal` →
  `buildRun2FeatureInclusionPreflight` → feature table rehearsal. Accepts a
  governed readiness report (full chain, fail-closed) or a prebuilt preflight
  report (its embedded rehearsal is re-derived and re-hardened; the supplied
  classification lists are recomputed, never trusted blindly).

The report records:

- `rehearsal_status: "feature_table_shape_only"`,
  `execution_status: "not_trained"`, `evaluation_status: "not_evaluated"`,
  `run_2_executed: false`.
- `row_grain: "player_season_forecast_rehearsal"`.
- `feature_columns`: only fields the preflight admits (governed, available).
- `partial_null_columns`: admitted partial-null fields (e.g. `redZoneTdRate`),
  preserved as `null` in rows — never zero-filled.
- `excluded_columns`: pressure, fantasy-split, target/leakage, and
  deferred/ungoverned fields, with explicit reasons.
- `target_columns`: label-only (`available_during_forecast: false`,
  `joined: false`), kept separate from input features (default
  `fullSeasonPprActual`).
- `target_leakage_status: "no_target_derived_fields_included"` and
  `pressure_status: "unavailable_insufficient_data_deferred_excluded"`.
- `rehearsal_rows`: a couple of explicitly-toy rows
  (`row_kind: "rehearsal_shape_only_not_model_ready"`) with metadata
  placeholders and `null` feature values; pressure and target columns are
  absent.
- Source Teamstate governance and source / validation / lineage refs preserved,
  plus linkage to the preflight and the manifest rehearsal.

Columns are separated into allowed feature, partial-null feature, excluded,
label/target-only, and metadata/provenance groups. Target columns such as
actual future PPR stay out of the input features.

What it explicitly does **not** do: no production feature matrix, no
model-ready training rows, no training, no evaluation, no Run 2 execution, no
Run 1↔Run 2 comparison, and no pressure construction/imputation/backfill/
estimate/inference/zero-fill.

## Run 2 feature matrix candidate (pre-train, implemented)

The first step that touches Run 1-shaped rows: assemble a **pre-train** Run 2
feature matrix candidate by attaching governed, preflight-allowed Teamstate
columns onto the existing Run 1 player-season grain. No training, evaluation, or
Run 2 execution.

- Helper: `buildRun2FeatureMatrixCandidate(input, options?)`
  (`src/rehearsal/runRun2FeatureMatrixCandidate.ts`), exported from the public API.
- Grounded in the full chain and does not bypass earlier checks:
  `readGovernedTeamstateInput` → `buildRun2ManifestRehearsal` →
  `buildRun2FeatureInclusionPreflight` → `buildRun2FeatureTableRehearsal` →
  feature matrix candidate. Accepts a governed readiness report (full chain,
  fail-closed) or a prebuilt feature table rehearsal report (its preflight is
  re-derived and re-hardened). Run 1 rows come from a `SeasonalPprDatasetDescriptor`
  (defaults to the scaffold seasonal dataset).
- Row grain aligns with Run 1 `SeasonalPlayerObservation` (one candidate row per
  observation, keyed by `player_id`), preserving the 2024 input cutoff, the 2025
  target season, the Run 1 `target_definition`, and player population/fold identity.

The candidate report records `candidate_status: "pre_train_feature_matrix_candidate"`,
`execution_status: "not_trained"`, `evaluation_status: "not_evaluated"`,
`run_2_executed: false`, `row_grain: "player_season_forecast"`, `row_count`,
`feature_columns` (Run 1 numeric features + appended Teamstate columns),
`partial_null_columns`, `excluded_columns`, label-only `target_columns`
(`ppr_2025_actual`), `metadata_columns`, `pressure_status`,
`target_leakage_status`, governance + source/validation/lineage refs, and linkage
to the feature table rehearsal.

**Join posture.** Because no governed mounted Teamstate artifact with a recorded
forecast cutoff exists yet, `teamstate_join_posture.join_status` is
`fixture_rehearsal_only`: it records the row grain, the join keys required
(`player_input_season_team`, `input_season`), the cutoff that must be enforced
(2024-input-season Teamstate only — no 2025 values), the columns that would be
appended, and that Teamstate values remain `null` (not yet bound). Partial-null
columns preserve `null` and are never zero-filled.

What it explicitly does **not** do: no model-ready rows, no training, no
evaluation, no Run 2 execution, no Run 1 ↔ Run 2 comparison, no pressure
construction/imputation, and no predictions/metrics/model refs.

## Run 2 Teamstate value-binding readiness gate (implemented)

Before binding real governed Teamstate values into the Run 2 candidate matrix,
Forecast runs a fail-closed readiness gate that answers: *are the conditions
present to bind real values without future leakage, fake pressure, fantasy-split
contamination, ungoverned data, or ambiguous join semantics?* It binds nothing,
trains nothing, evaluates nothing, and runs no Run 2.

- Helper: `assessRun2TeamstateValueBindingReadiness(input, options?)`
  (`src/rehearsal/runRun2TeamstateValueBindingReadiness.ts`), exported from the
  public API.
- Grounded in the candidate chain (`readGovernedTeamstateInput` → … →
  `buildRun2FeatureMatrixCandidate`); it does not bypass earlier checks. A chain
  failure (absent/ungoverned/fabricated-pressure artifact) yields a
  `not_ready_for_value_binding` report, never a permissive pass.

The genuinely new requirement is a **recorded forecast cutoff on the artifact**.
Readiness is granted only when all gates pass:

1. governed Teamstate artifact present (chain succeeds),
2. explicit-marker governance (never inferred from path/name/build/downstream),
3. a forecast cutoff is recorded,
4. the cutoff input season equals Run 1's 2024,
5. the cutoff is not target-season/future (no 2025 leakage),
6. team-week → player-season grain is joinable,
7. explicit deterministic join keys,
8. only preflight-allowed columns are eligible,
9. partial-null columns stay null-aware (never zero-filled),
10. pressure stays excluded,
11. fantasy-split fields excluded,
12. target/leakage fields blocked.

The report records `readiness_status`, `binding_status: not_bound_readiness_only`,
`execution_status` / `evaluation_status` / `run_2_executed: false`,
`expected_teamstate_artifact`, `required_governance`, `required_cutoff` (with the
recorded value found), `required_join_keys`, `row_grain_alignment`,
`allowed_columns`, `partial_null_columns`, `excluded_columns`, `pressure_status`,
`target_leakage_status`, per-gate results, `missing_requirements`,
`blocking_reasons`, governance + source/validation/lineage refs, and linkage to
the candidate chain.

What it explicitly does **not** do: bind any values, train, evaluate, run Run 2,
compare Run 1 vs Run 2, construct/impute pressure, or emit predictions/metrics/
model refs. A `not_ready` result must be honored fail-closed — fixtures or nulls
must never be bound as if they were real governed data.

## Value binding (#82): bind governed Teamstate values into the candidate matrix

`bindRun2GovernedTeamstateValues(input, options?)`
(`src/rehearsal/runRun2GovernedTeamstateValueBinding.ts`, exported from the public
API) is the first step that actually **binds real governed Teamstate values** into
the existing Run 2 candidate matrix. It is value binding only — no training, no
evaluation, no Run 2 execution, no Run 1 vs Run 2 comparison, and no shuffled-
Teamstate sanity arm.

It is grounded in (and never bypasses) the full chain:
`readGovernedTeamstateInput` → `buildRun2ManifestRehearsal` →
`buildRun2FeatureInclusionPreflight` → `buildRun2FeatureTableRehearsal` →
`buildRun2FeatureMatrixCandidate` → `assessRun2TeamstateValueBindingReadiness` →
value binding. Binding proceeds **only** when the readiness gate returns
`ready_for_value_binding`; otherwise it emits a not-bound report
(`not_bound_readiness_not_met`) and binds nothing.

### Team-week values channel

The readiness summary carries field-readiness *counts*, not per-row numbers, so the
governed artifact also supplies the team-week **values** to aggregate, under a
`teamWeekValues` array. Values are read **only** from the governed artifact that
passed readiness — there is deliberately no caller-supplied side-channel — so bound
values always carry the same governance / source / validation / lineage / cutoff
provenance as the artifact. Each row is a governed team-week record (`teamCode`,
`season`, `week`, plus numeric/null metric columns). Only the chain's
preflight-allowed columns are read; pressure, fantasy-split, and
target/future/leakage columns are never read even if present.

### Aggregation (team-week → player-season)

- Method: `mean_of_available_input_season_team_week_values` (unweighted mean of the
  finite values across a team's **2024 input-season** team-week rows).
- Non-2024 (e.g. 2025 target-season) team-week rows are skipped and counted as
  `ignored_non_input_season_rows` — never aggregated (no target-season leakage).
- A column with no finite value for a team binds `null` — partial-null columns stay
  null-aware and are **never** zero-filled.
- Aggregates are bound to candidate rows by the explicit join keys
  `team_2024 (player input-season team) = teamstate teamCode` and
  `input_season = teamstate season`.

### What binding preserves

One row per Run 1 `SeasonalPlayerObservation`; the unstandardized
`run1_feature_values`; `ppr_2025_actual` as a label-only target outside every input
group; input season 2024 / target season 2025; player population/fold identity; and
the governance / source / validation / lineage / recorded-cutoff refs (including the
timezone-explicit cutoff `as_of`, kept distinct from the source build time
`sourceGeneratedAt`).

### Report

`Run2BoundFeatureMatrixReport` records `candidate_status:
pre_train_bound_feature_matrix_candidate`, `binding_status`, `execution_status:
not_trained`, `evaluation_status: not_evaluated`, `run_2_executed: false`,
`row_grain: player_season_forecast`, input/target season, `aggregation_method`,
`join_keys_used`, the Run 1 / bound-Teamstate / partial-null column groups,
`excluded_columns`, `pressure_status`, `target_leakage_status`, the recorded cutoff,
governance + refs, a `binding_coverage` summary (matched/unmatched teams, contributing
row counts, ignored non-input-season rows, per-team aggregates), the `bound_rows`,
and linkage to the readiness and candidate reports. Each bound row separates Run 1
input values, bound Teamstate values, partial-null Teamstate values, identity/join
metadata, and the label-only target. It emits no predictions, metrics, model refs,
evaluation refs, or Run 1 ↔ Run 2 comparison.
