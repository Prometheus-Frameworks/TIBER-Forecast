# Controlled player-history Forecast experiment design

> **Status: design only.** This document defines a controlled experiment that MAY use TIBER-Data's
> `player_season_coverage_v0` candidate evidence, following the Forecast-side gate in
> [#99](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/99) /
> [PR #100](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/100), which returned
> `player_season_coverage_gate_passed` → **`may_design_experiment`** — nothing stronger. This PR
> performs **no Forecast run, no Run 3, no feature binding, no baseline change, no model
> training/tuning, and no TIBER-Data/Teamstate change**, and makes **no signal claim**. It turns the
> gate's permission into a careful plan; it is not a run.

## 1. Relationship to the gate (#99 / PR #100)

- #99/PR #100 authorized **experiment design only**. The gate's decision type has no `may_run_model`
  value at all — `may_design_experiment` is its ceiling.
- This issue does **not** bypass the gate. Nothing here re-derives or overrides the gate's checks.
- **If the TIBER-Data mirror or the underlying artifact changes** (new rows, a schema change, a
  different sha256), the gate (`npm run evaluate:player-season-coverage-gate`) **must be re-run**
  before any implementation work proceeds, since this design is only valid against the evidence the
  gate already evaluated (artifact sha256 `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`,
  per `data/fixtures/tiberData/player_season_coverage_v0_2022_2025.mirror.json`).
- **Passing the gate is not a signal claim.** The gate only established that the artifact is
  structurally serviceable (real, source-backed, correctly grained, semantically bounded, and honest
  about its 2022–2025/REG/QB-RB-WR-TE scope). Whether player history actually improves prediction is
  an empirical question this design sets up but does not answer.

## 2. The experiment question

> Does pre-target player-season history from `player_season_coverage_v0` improve Forecast's ability
> to predict the target season, without target-season leakage?

This design distinguishes four separate claims, and this document only supports the first:

| Claim | Established by | Status here |
| --- | --- | --- |
| **Structural readiness** — the artifact is real, bounded, and semantically honest | TIBER-Data #184–#191 audit/spec/build sequence | ✅ established |
| **Controlled experiment eligibility** — Forecast may design (not run) an experiment against it | Forecast #99/PR #100 gate | ✅ established (`may_design_experiment`) |
| **Empirical model signal** — player history actually reduces error vs. baseline and beats a shuffled control | A future controlled run | ❌ not established; this design does not claim it |
| **Production readiness** — the model may be shipped/consumed downstream | A future, separate promotion decision | ❌ not established; out of scope entirely |

A design can say the experiment is worth attempting. **It cannot say the signal works until a later,
separate run proves it** — and Teamstate Run 2 is the standing proof that an upstream artifact can be
structurally serviceable while still failing empirical sanity control (three-arm MAE: real Teamstate
38.53 and its shuffled control 38.50, both *worse* than the 35.15 Run 1 baseline — see
`docs/reports/run2-teamstate-comparison-outcome-2026-06-29.md`). This design exists specifically so
player-history does not repeat that path without the same controls in place from the start.

## 3. Target / input split

Strict, and non-negotiable for the first controlled setup:

| | Value |
| --- | --- |
| Target season | **2025** |
| Input seasons | **2022, 2023, 2024** |
| Excluded as input | **2025** player-season summaries |
| `season_type` | **REG only** |
| Positions | **QB / RB / WR / TE only** |

Explicit rules:

- **2025 summaries are target/outcome context, not input features for predicting 2025.** The 2025
  actual PPR outcome (already sourced into Run 1 from TIBER-Data's weekly outcomes) is the label being
  predicted, never a feature.
- **Any row with `season = 2025` in `player_season_coverage_v0` must be excluded from feature
  construction for a 2025-target run.** A future feature builder must filter input rows to
  `season < target_season` before ever touching the artifact, not rely on the caller to remember.
- **Future rolling-window designs must enforce the same rule for any target season** — e.g. a
  2023-target run may use 2022 input only (2020–2021 do not exist in the artifact), and a hypothetical
  2026-target run may use 2022–2025 input, never 2026.
- This mirrors Run 1's own existing invariant (`SEASONAL_PPR_INPUT_SEASON = 2024`,
  `SEASONAL_PPR_TARGET_SEASON = 2025`, "position/team from the input season only" —
  `docs/run1-path-audit-for-run2.md`), extended from a single input season to a 3-season window.

## 4. Candidate feature families (candidates only — not implemented here)

Every family below is a **candidate**, gated behind a later, separate implementation-authorization
issue. None of these are built, wired, or bound in this PR.

### 4.1 Availability / coverage proxies

- prior-seasons-observed count (how many of 2022–2024 the player has a row for),
- prior games/weeks observed (`weeks_observed` from prior-season rows),
- `coverage_status` counts across prior seasons (`full_season` / `partial_season` / `single_week`),
- missingness/null-rate indicators (e.g. how many `missing_fields` entries a prior-season row carries).

**Boundary:** these are coverage proxies, **not** active/inactive status. `player_season_coverage_v0`
never asserts availability (see TIBER-Data #190/#191 and the Forecast gate's semantic-boundary check);
a feature built from these fields must not be interpreted or labeled as "was active," only as "was
observed producing stats."

### 4.2 Production history

- prior-season PPR totals (`production_summary.season_ppr`, passthrough from nflverse, per season),
- prior-season PPG (`production_summary.season_ppg`),
- trailing 2-year / 3-year production summaries (sum/mean across available prior seasons — must
  tolerate a player having only 1 or 2 of the 3 input seasons; never treat a missing season as zero),
- production trend features (e.g. year-over-year delta, only computable when both seasons are present),
- position-specific production aggregates (kept separate per position; no cross-position averaging).

### 4.3 Usage history

Only fields already source-backed in `player_season_coverage_v0.usage_summary` may be considered:

- `targets`, `receptions`, `rushing_attempts` (source-backed counts),
- `receiving_air_yards` if populated,
- `target_share`, `air_yards_share`, `wopr`, `racr` if populated and source-backed (nflverse's own
  season-level ratios, not recomputed).

**Hard boundary:** `snap_share`, `routes_run`, `route_participation`, `red_zone_targets`,
`red_zone_carries` are **unavailable** in the source artifact (100% null by design, per the TIBER-Data
coverage report) and **must remain excluded or explicitly null/unavailable** in any feature built from
them. **Do not coerce to zero** — a null usage feature must propagate as a genuine missing value into
whatever null-handling policy Run 1 already uses (train-fold mean imputation, never silent zero-fill),
exactly as the existing Teamstate feature contract already requires for its own deferred fields.

### 4.4 Age / career context

- `season_age` as of each pre-target season,
- `career_year` as of each pre-target season,
- `draft_year` / `rookie_year` only where source-backed/derivable (per-row, from `player_season_coverage_v0`),
- an "undrafted" indicator, only if built from a genuinely null `draft_year` (never inferred from
  absence of a row) and clearly documented as such.

**Do not fabricate age/career fields.** If `birth_date` is null for a player-season row,
`season_age` must stay null for that row — a feature builder must not backfill or estimate it. This
mirrors the TIBER-Data gate's own `fabricated_age_violation_count` / `fabricated_career_year_violation_count`
checks (Forecast PR #100), which must remain zero for any evidence this design would consume.

### 4.5 Team context

`player_season_coverage_v0`'s team context (`teams[]`, `primary_team`, `team_weeks`) is **team-of-record
in weekly production rows**, not full roster membership and not availability (see TIBER-Data #191's
`methodology.team_context_source_note`). Any feature using these fields must preserve that limitation
explicitly — e.g. a "team change" or "multi-team season" indicator is a production-record fact
(`teams.length > 1`), not a roster-membership or active-status claim. **Do not interpret team context
as active roster status.**

## 5. Baseline comparison

The baseline is the **existing Run 1 seasonal PPR ridge backtest** — the only currently accepted,
non-parked Forecast baseline:

- Model: `seasonal-ppr-ridge-v1` (closed-form ridge, standardized 2024 features + position one-hot,
  evaluated LOOCV by `player_id`) — `src/models/seasonal/seasonalPprModel.ts`.
- Committed reference metrics (bundled scaffold population, `n=38`, `governance_status: fixture`,
  from `data/backtests/seasonal-ppr/seasonal_ppr_backtest_report.json`):

  | Arm | n | MAE | RMSE | Pearson | Rank corr |
  | --- | --- | --- | --- | --- | --- |
  | `seasonal-ppr-ridge-v1` (Run 1 model) | 38 | 35.15 | 43.64 | 0.729 | 0.706 |
  | `baseline-position-mean` (best baseline) | 38 | 41.73 | — | — | — |
  | `baseline-prev-year-ppr` | 38 | 43.59 | 59.68 | 0.654 | 0.688 |

  Run 1's model beats its best simple baseline by 6.59 MAE on this scaffold population.

- **Teamstate Run 2 is explicitly NOT used as a positive baseline** — it failed sanity control
  (real and shuffled Teamstate arms both worsened MAE vs. Run 1; see
  `docs/reports/run2-teamstate-comparison-outcome-2026-06-29.md`). Using a failed experiment's
  numbers as a target to beat would set a meaninglessly low bar.
- **Open item for the implementation issue, not resolved here:** Run 1's committed report runs on the
  bundled **scaffold** population (`n=38`). A player-history run should prefer evaluating against the
  **real, mounted TIBER-Data 2025 outcome population** (`--ppr-artifact=<real path>`, per
  `docs/seasonal-ppr-backtest.md`) if available, both for the baseline arm and the player-history arms,
  so all three arms share the same real population rather than repeating Run 1's small-`n` fixture
  limitation. The implementation issue must state which population it actually used and why.

## 6. Required sanity controls

Before any run's result may be accepted (not before the run happens — before its *result* is
accepted), all of the following are required. This list is deliberately modeled on the exact controls
Teamstate Run 2 lacked structurally clean logic for but whose *result* still failed once evaluated —
the point is to run the same discipline from the start, not retrofit it after a bad result:

1. **Shuffled player-history control.** A control arm where player-history feature values are permuted
   across players (row-shuffled) before joining to the target population — analogous to the existing
   shuffled-Teamstate control (`docs/run2-tts-feature-contract.md`). If the shuffled arm performs
   comparably to the real arm, the real arm's apparent improvement is not trustworthy signal.
2. **Target-season leakage guard.** An explicit, automated check (not just a code-review note) that no
   row with `season = 2025` (or the active target season) ever enters the input feature matrix. This
   should be a boundary the feature builder enforces structurally (filter before load), with a test
   proving a 2025 row is rejected/excluded if accidentally present.
3. **Missing-feature / null-handling control.** Document and test how each candidate family behaves
   when a player has 0, 1, 2, or 3 of the input seasons present. Null propagation must match Run 1's
   existing policy (train-fold mean imputation at model-fit time; never silent zero-fill at the
   feature-construction stage).
4. **Feature-family ablation plan.** Each family in §4 (availability/coverage, production, usage,
   age/career, team context) must be independently toggleable, so a later run can attribute any
   observed change to a specific family rather than an undifferentiated bundle — this is what would let
   a future run diagnose *why* a result did or didn't hold, the way the Teamstate audit could not fully
   separate coverage-sparsity effects from a genuine null result.
5. **Baseline-vs-player-history comparison.** Three arms minimum, evaluated on the identical population/
   folds/model family/metrics: `run1_baseline`, `real_player_history`, `shuffled_player_history_control`
   — the same three-arm shape as the Teamstate comparison (`docs/reports/run2-teamstate-comparison-outcome-2026-06-29.md`).
6. **Per-position breakdown.** QB/RB/WR/TE reported separately (as Run 1 and the Teamstate comparison
   already do), since an aggregate improvement can mask a position-level regression.
7. **Minimum sample-size reporting.** The run must report `n` for every arm and every position
   breakdown, and must flag (not silently proceed past) any position with too few scored rows to be
   informative — Teamstate's TE arm (0/6 matched) is the standing example of why this matters.
8. **Deterministic seed / reproducibility notes.** The shuffle in control #1 must use a fixed,
   documented seed (or an explicit seed sweep if variance is a concern) so the run is byte-reproducible,
   consistent with Run 1's existing determinism discipline (`--generated-at`, closed-form ridge fit).

## 7. Metrics and interpretation

**Metrics** (identical to Run 1's existing `evaluateSeasonalPpr`, no new metric family introduced):

- MAE, RMSE, Pearson correlation, Spearman/rank correlation — overall and per position,
- overall `n` and per-position `n`,
- coverage/missingness counts per candidate feature family (how many scored rows had each family
  populated vs. null).

**How to interpret improvement** (conservative; not to be tuned after seeing results):

- the real player-history arm must improve over the Run 1 baseline on the primary error metric (MAE),
- the real arm must beat the shuffled-control arm on the primary metric **and** at least one secondary
  metric (RMSE, Pearson, or rank correlation) — mirroring the Teamstate decision rule
  (`real_improved_vs_shuffled`),
- no major position group (QB/RB/WR/TE) may degrade catastrophically without an explicit, documented
  explanation tied to a specific feature family (via the ablation plan in §6.4),
- the result must be repeatable with the deterministic seed from §6.8.

Any one of these failing is sufficient to reach the same conclusion Teamstate Run 2 reached:
*structurally serviceable, not empirically supported* — and the correct response is to park the
approach and report why, not to relax the thresholds. These thresholds are intentionally left
conservative rather than tuned in this design PR, per the issue's own instruction not to overfit them
here.

## 8. Next implementation issue sketch (not started here)

**Proposed title:** `Forecast: implement player-history feature experiment scaffold`

**Proposed scope (scaffold-only or feature-extraction-only — NOT a full run):**

- Build a compact local mirror/fixture of `player_season_coverage_v0` rows for the 2022–2024 input
  window (mirroring the pattern already used for the gate's evidence mirror — sha256-pinned, not the
  full artifact), following the same "compact mirror, not full vendor" discipline as PR #100.
- Implement a feature-extraction function per candidate family in §4, each independently toggleable
  (§6.4), operating **only** on `season < target_season` rows (§3), with unit tests proving:
  - a 2025 input row is rejected/excluded (leakage guard, §6.2),
  - missing prior seasons produce null features, never zero-filled (§6.3),
  - age/career fabrication guards hold (mirrors the TIBER-Data/Forecast gate's own checks),
  - the team-context limitation (§4.5) is preserved in the extracted feature's documentation/typing.
- **Do not** wire these features into `seasonalPprModel.ts`'s numeric feature list yet.
- **Do not** train, evaluate, or compare against baseline yet.
- **Do not** run the shuffled control yet (that belongs to the controlled-run issue after this one).
- Re-run the Forecast gate (`npm run evaluate:player-season-coverage-gate`) if the TIBER-Data mirror
  needs updating for this slice, before any of the above.

**Preferred next step after design:** scaffold-only or feature-extraction-only, **not** a full
controlled run. A full run (three-arm comparison, §5–§7) should be its own subsequent issue once the
feature-extraction scaffold exists and has its own review.

## 9. Non-goals confirmed

No Forecast run. No Run 3. No player-season coverage bound into production features. No model
training/tuning/evaluation. No change to the Forecast baseline. No Teamstate/TTS change. No TIBER-Data
change. No promotion of the Data artifact. No 2025 player-season summaries consumed as 2025 input
features. No inference of active/inactive/IR/practice-squad/ownership status. No inference of games
missed beyond what is source-backed. No coercion of null/unavailable to zero. No player-history signal
claim. No fantasy advice, rankings, start/sit, trade, draft, or product output.

## Reproduce

This document is prose/design only; there is no script to run. The referenced Run 1 baseline numbers
can be reproduced with:

```bash
npm run backtest:seasonal-ppr   # regenerates data/backtests/seasonal-ppr/seasonal_ppr_backtest_report.json (scaffold population)
npm run evaluate:player-season-coverage-gate   # re-confirms the #99/#100 gate still passes before any implementation work
```
