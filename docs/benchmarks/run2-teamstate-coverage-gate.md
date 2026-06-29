# Teamstate Run 2 coverage gate

_Benchmark / gate — not a rerun. Defines the governed-Teamstate coverage that must be proven before any further Forecast Run 2 Teamstate rerun. Changes no model/data/feature/null-handling logic._

## 1. Why this gate exists

The first controlled Run 2 (#86) **failed its sanity control** (#88 outcome, #90 audit): adding governed Teamstate values worsened the Run 1 baseline, the shuffled control marginally beat real Teamstate, and `signal_interpretation = failed_sanity_control`. The #90 audit traced this to **coverage**, not a join or model bug:

- only **3 / 32** NFL teams covered (BAL, CIN, PHI),
- only **8 / 38** scored rows matched governed Teamstate values (~21.1%),
- only **21 / 114** Teamstate cells were real governed values (~18.4%); ~82% were null → imputed.

At that coverage the experiment mostly measured "add three near-constant imputed columns to a small ridge," which cannot support any Teamstate signal claim. This gate parks further Teamstate Run 2 experiments until coverage is rich enough that a rerun would be informative. **The goal is confidence before movement.**

The gate is implemented as a pure evaluator, `evaluateRun2TeamstateCoverageGate(evidence)` (`src/reports/run2TeamstateCoverageGate.ts`), which returns a machine-readable status + decision. It performs no rerun, no model fit, no tuning, and no null-handling change.

## 2. What it checks

In fail-closed precedence order:

1. **Governance prerequisites** — explicit governance marker, artifact version, row grain, `generated_at`, and non-empty source / validation / lineage refs.
2. **Cutoff prerequisites** — recorded cutoff as-of, cutoff before the target-season start, no target-season leakage, no fantasy-result leakage.
3. **Join diagnostics complete** — row-level join evidence (player_id, name, position, `team_2024`, Teamstate `teamCode`, matched/unmatched, reason, source ref). Must be *present* to trust coverage at all, and *complete* (one record per scored row, with the diagnostics' matched count equal to `matched_row_count`) before the gate may pass — a single placeholder row cannot authorize a rerun.
4. **Team coverage** — covered teams vs the 32 NFL teams.
5. **Scored-row coverage** — fraction of scored Forecast rows that match governed Teamstate values.
6. **Non-null cell coverage** — fraction of Teamstate feature cells that are real governed (non-null) values.
7. **Position distribution** — matched / scored per position (warning dimension).

## 3. How it fails closed

- Governance or cutoff incomplete → fail **before any coverage math is trusted**.
- Join diagnostics missing/empty → **incomplete evidence**: fail closed and request row-level join evidence (so a true coverage gap is never confused with a join bug). Join diagnostics that are present but **incomplete** (fewer than one record per scored row, or a matched count that disagrees with `matched_row_count`) also fail closed before any pass, even when the coverage thresholds are met.
- `null` evidence → `teamstate_coverage_gate_not_evaluated` (fail closed).
- The first failing dimension determines the status; the result also lists every check, the blocking reason(s), and warnings.

## 4. Required evidence

`Run2TeamstateCoverageEvidence`: governance block, cutoff block, `covered_teams`, `scored_row_count`, `matched_row_count`, `teamstate_feature_columns`, `teamstate_cell_total`, `teamstate_cell_nonnull`, `null_cells_by_column`, per-position `{matched, scored}`, and `join_diagnostics` rows. The previous failed state is committed verbatim as `RUN2_PREVIOUS_RECORDED_COVERAGE_EVIDENCE` so the doc and tests share one source of truth.

## 5. Thresholds

| Dimension | Threshold | Previous state | Result |
| --- | --- | --- | --- |
| Team coverage | **≥ 28 / 32** (preferred 32 / 32) | 3 / 32 | ❌ fail |
| Scored-row coverage | **≥ 80%** of scored rows matched | 8 / 38 ≈ 21.1% | ❌ fail |
| Non-null cell coverage | **≥ 75%** real governed cells | 21 / 114 ≈ 18.4% | ❌ fail |
| Position distribution | every scored position has matched coverage | TE 0 / 6 matched | ⚠️ warn |

Why 3/32 was not enough: with 29 teams (and ~79% of scored rows) carrying no governed values, the added columns were dominated by imputed training-fold means — near-constant, low-information inputs that added variance without signal. No coverage of that shape can distinguish real Teamstate signal from noise.

## 6. Status values (machine-readable)

- `teamstate_coverage_gate_passed`
- `teamstate_coverage_gate_failed_missing_governance`
- `teamstate_coverage_gate_failed_cutoff`
- `teamstate_coverage_gate_failed_team_coverage`
- `teamstate_coverage_gate_failed_scored_row_coverage`
- `teamstate_coverage_gate_failed_null_dominance`
- `teamstate_coverage_gate_failed_join_diagnostics_missing`
- `teamstate_coverage_gate_not_evaluated`

## 7. Decision rule

- **Pass** (`teamstate_coverage_gate_passed`) → `may_rerun_unchanged_comparison`: Forecast may proceed to an **unchanged** rerun of the #86 three-arm comparison (no model/feature/null changes). A pass authorizes a rerun only; it makes **no** claim that Teamstate works.
- **Fail** (governance / cutoff / team / scored-row / null-dominance) → `must_not_rerun`: do not rerun; report the blocking reason.
- **Incomplete evidence** (join diagnostics missing, or `not_evaluated`) → `fail_closed_incomplete_evidence`: do not rerun; request the missing coverage / join evidence.

## 8. Null semantics (unchanged)

This gate does not change null handling. `unavailable` stays `unavailable`; there is no silent zero-fill; train-fold mean imputation remains **comparison-time only** (it is not applied here). The gate only *measures how much imputation a rerun would require* (via non-null cell coverage) and blocks when imputation would dominate.

## 9. Position coverage

The gate reports matched / scored per position and **warns** when a scored position has no matched coverage (e.g. TE 0/6 in the previous state), because by-position metrics for an uncovered position would be uninformative. Position coverage is a warning dimension; it does not by itself change the pass/fail status.

---

**Current verdict for the recorded state:** `teamstate_coverage_gate_failed_team_coverage` → `must_not_rerun`. Further Teamstate Run 2 experiments are parked until a governed Teamstate source proves ≥ 28/32 team coverage, ≥ 80% scored-row coverage, and ≥ 75% non-null cells (with governance, cutoff, and row-level join evidence present). Reaching the gate is an upstream coverage concern; **no TIBER-Teamstate or TIBER-Data change is made by this issue**, and no claim is made that Teamstate does or does not work in general.
