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
