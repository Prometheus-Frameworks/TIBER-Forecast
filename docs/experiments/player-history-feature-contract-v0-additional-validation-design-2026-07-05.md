# Player-history feature contract v0 — additional validation design

> **Status: validation design only.** This document designs the additional validation required before
> the PR #132 production acceptance threshold proposal for `player_history_production_feature_v0` can
> be accepted, amended, or rejected. It performs **no Forecast run, no `seasonalPprModel.ts` change, no
> production feature-generation code, no production-path leakage audit execution, no Fantasy/product
> consumer change, no ranking/scoring/advice/route/UI/export change, and no TIBER-Data
> promotion/demotion**, and makes **no claim that the threshold has been accepted or that production
> readiness has been reached**. This is a validation-design/report checkpoint, not a production-binding
> issue.

## 0. Source of truth

This design reads the merged design-chain artifacts directly:

- `docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.md` / `.json` (PR #132, closing #131)
- `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md` / `.json` (PR #124, closing #123)
- `docs/experiments/player-history-feature-contract-v0-review-2026-07-04.md` / `.json` (PR #126, closing #125)
- `docs/experiments/player-history-feature-contract-v0-implementation-design-2026-07-04.md` / `.json` (PR #128, closing #127)
- `docs/reports/player-history-feature-contract-v0-validation-2026-07-04.md` / `.json` (PR #130, closing #129)
- `data/fixtures/tiberData/player_history_production_feature_v0.experimental_contract_instance.json` (PR #130)
- `docs/reports/player-history-controlled-run-2026-07-02.json` (#112)
- `docs/reports/player-history-robustness-checks-2026-07-03.json` (#116)
- `docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json` (#122)

It also reads the **actual committed TIBER-Data source artifacts** directly (not just Forecast-side
summaries of them), specifically `exports/promoted/nfl/player_season_coverage_v0.json` and
`scripts/build_player_season_coverage_2022_2025.py` in `Prometheus-Frameworks/TIBER-Data`, to answer
the source-feasibility question in §5 with evidence rather than a guess.

All of the above documents are unchanged by this design. This artifact is additive.

## 1. Decision

| | Value |
| --- | --- |
| **Validation-design decision** | `player_history_additional_validation_requires_source_feasibility_issue` |

**Why this decision, not `may_open_..._implementation_issue` or `..._design_rejected_requires_redesign`:**
§5 establishes, from direct inspection of the committed TIBER-Data promoted artifact and its build
script, that **no season earlier than 2022 exists anywhere in TIBER-Data's governed data** for this
contract family. Under the N=3 input-window design every prior experiment in this chain has used
(#112, #122, PR #130), the *only* target season for which a full 3-prior-season trailing window exists
within currently-promoted data is 2025 itself — exactly the season already evaluated. Both validation
shapes this issue was asked to compare (§2) are therefore blocked on the same missing prerequisite:
at least one additional governed prior season (2021) does not yet exist in TIBER-Data. This is not "we
don't know if this is feasible" — it is a specific, evidenced gap with a specific next step, which is
exactly what earns the `requires_source_feasibility_issue` decision rather than a vaguer
`design_rejected_requires_redesign` (the *design* in this document is sound; it is the *source data*
that is insufficient) or a premature `may_open_..._implementation_issue` (there is nothing to implement
yet against data that does not exist).

This decision does not accept the PR #132 threshold, does not authorize a production-path leakage
audit, and does not authorize `seasonalPprModel.ts` wiring or any Fantasy/product consumer.

## 2. Validation options compared

### 2.1 Option A — second target-season replay

Re-run the #112/#122 three-arm design (baseline / real / shuffled) with a **different** target season,
holding the design otherwise identical.

| | Requirement |
| --- | --- |
| Required source seasons | Target season `S2` plus 3 prior seasons `S2-1, S2-2, S2-3` (N=3, per PR #128 §2.3's unchanged default) |
| Example | Target `2024`, input window `2021, 2022, 2023` |
| Input window semantics | Identical to the existing design: `season < S2`, no partial-season substitution, positions QB/RB/WR/TE, season_type REG only |
| Source artifact requirements | TIBER-Data promoted `player_season_coverage_v0` (or a successor promotion) must cover `S2` as an *outcome* season and `S2-1..S2-3` as *input* seasons, under the same governed/promoted status and provenance discipline as the existing 2022-2025 artifact |
| Mirror generation requirements | New outcome mirror (`*_S2.promoted_outcome_mirror.json`) and input mirror (`*_{S2-3}_{S2-1}.promoted_input_mirror.json`), built the same way as PR #120's mirrors but for the new season pair |
| Replay/report requirements | A new controlled-rerun report analogous to `docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json`, and a new contract-instance validation report analogous to PR #130's, both explicitly dated/labeled for `S2`, never overwriting the 2025 reports |
| Missing-history reporting | Same subgroup count/share/by-position requirement, computed independently for the `S2` population (expect a *different* no-history count/share than 2025's 125/610 — must not be assumed identical) |
| Reuse of PR #130 infrastructure | The contract **schema/type** (`playerHistoryFeatureContractV0.ts`) is season-generic already — `player_identity_join_keys.season` is a plain number field, not hardcoded. The **generator/replay scripts** (`playerHistoryContractV0Replay.ts`, `runPlayerHistoryContractV0Replay.ts`) currently hardcode `CONTRACT_V0_TARGET_SEASON = 2025` and `CONTRACT_V0_INPUT_SEASONS = [2022, 2023, 2024]` as module constants and would need parameterization (see §5.4) — this is generator-script work, not a contract schema amendment. |
| Failure modes | (a) `S2-1..S2-3` not available under governed/promoted status — blocks entirely (this is the actual current state, §5); (b) a materially smaller joined population for `S2` than 2025's 485/610, weakening statistical power; (c) accidentally reusing the 2025 shuffle seed/lambda without re-justifying them for a new population, silently changing the experimental design rather than replicating it |
| Estimated governance complexity | Comparable to the #117→#122 chain repeated for one new season: a TIBER-Data-side promotion (or extension of the existing promotion) for the new seasons, a Forecast-side mirror-refresh issue, and a Forecast-side controlled-rerun issue. Not a small change, but a *known* shape — this chain has done it once already. |

### 2.2 Option B — rolling-origin backtest

Evaluate multiple target seasons (e.g., 2023, 2024, 2025 each predicted from their own 3 prior seasons),
treating each as an independent origin point in a rolling-origin design.

| | Requirement |
| --- | --- |
| Required source seasons | For `k` target seasons, the union of each target's own 3-season trailing window — e.g., targets `{2023, 2024, 2025}` need input seasons `{2020, 2021, 2022, 2023, 2024}` (a 5-season span for 3 origins) |
| Example | Targets 2023 (from 2020-2022), 2024 (from 2021-2023), 2025 (from 2022-2024, already done) |
| Input window semantics | Identical per-origin semantics to Option A, repeated for each origin; each origin's evaluation must be fully independent (no origin's model fit or imputation may see another origin's held-out target rows) |
| Source artifact requirements | Same governed/promoted discipline as Option A, but for a *wider* season span — strictly more source seasons than Option A requires for a single additional point |
| Mirror generation requirements | One outcome + input mirror pair per origin (not shared), each independently gated and reported |
| Replay/report requirements | One controlled-rerun report per origin, plus a rollup report that presents per-origin results side by side — explicitly NOT averaged into a single number (§4) |
| Missing-history reporting | Independently per origin; a rollup should also show whether the no-history share trends across origins (informational, not itself a pass/fail gate beyond PR #132 §3.7's per-evaluation ceiling) |
| Reuse of PR #130 infrastructure | Same as Option A, but the generator/replay scripts would need to be parameterized (not just for one alternate season, but genuinely multi-invocation) — somewhat more script work than Option A, though the same underlying change |
| Failure modes | Same as Option A's (a)-(c), compounded across origins; additionally: (d) treating a rolling-origin result as stronger evidence than it is by construction, when origins are close together in time and may share correlated season-level shocks (e.g., a rule change spanning two adjacent seasons) rather than being truly independent draws |
| Estimated governance complexity | Substantially larger than Option A: requires the *widest* source-season span of any option here (5 seasons for 3 origins, vs. 4 for Option A's single additional origin), and multiplies the mirror-refresh/controlled-rerun issue pattern by the number of origins. |

### 2.3 Comparison and recommendation

Option A (second target-season replay) is the smaller, more tractable next step: it requires exactly
one additional governed season (2021) beyond what already exists, reuses the exact experimental design
this chain has already validated once, and produces one clean additional data point before committing
to the larger rolling-origin program. Option B is the *stronger* eventual validation (more origins,
better protection against one anomalous season) but has a strictly larger source-data prerequisite and
should be considered only after Option A succeeds or is shown infeasible for a different reason. This
document recommends **Option A first**, with Option B as a follow-on if Option A's result and the
threshold-acceptance review that would follow it call for more evidence.

Both options are blocked on the same missing prerequisite today (§5): neither can proceed without at
least one additional governed prior season beyond 2022-2025.

## 3. Validation invariants (must hold for either option, at every origin)

Carried forward unchanged from every document in this chain:

- target season `S` uses only seasons `< S` — no exceptions, for whichever `S` is being validated,
- no target-season or partial-target-season substitution, under any feature-availability fallback,
- the real-vs-baseline-vs-shuffled framing is required for every origin's evaluation, not just the
  first,
- `production_only` remains the v0 default feature-family scope for every origin, unless a separate,
  explicitly-reviewed amendment clears the full-set added-value bar (PR #132 §3.6: >2% relative joined-
  MAE improvement, plus the governance test) — an origin's local result clearing that bar would still
  require its own amendment review, not a silent scope change,
- source identity lock and committed-mirror source-identity verification (PR #130) must pass
  independently for whatever artifact snapshot backs each origin,
- missing-history players must not be silently zero-filled — entire feature block stays `null`, for
  every origin,
- no-history subgroup count/share/by-position must be reported per evaluated population, independently
  per origin — never inherited or assumed from a different origin's report,
- deterministic replay/report generation, reproducible from committed inputs, for every origin,
- no Fantasy/product consumer behavior, for any origin's evaluation,
- no production model behavior — this remains rehearsal/non-production infrastructure regardless of
  how many origins are evaluated.

## 4. Tying validation results to the PR #132 threshold components, and the aggregation rule

PR #132's candidate components, restated:

```text
relative joined-MAE improvement over baseline        >= 25%
relative joined-MAE improvement over shuffled control >= 25%
absolute joined-MAE                                   <= 48.0
absolute joined-RMSE                                  <= 68.0
relative joined-RMSE improvement over shuffled control >= 20%
full-set added-value bar (if full-set scope reconsidered) > 2% over production_only, + governance test
no-history subgroup share                             <= 35% (else additional justification required)
```

**Aggregation rule (this document's default, per the issue's stated preference): each evaluated target
season must independently pass every applicable component.** No averaging across origins is proposed.

Rationale: averaging would let one strong origin (e.g., a season where the signal happens to be
unusually clean) mathematically compensate for one weak or failing origin, which is exactly the
"masking" failure mode PR #124 and PR #132 have both warned against in different forms (single-season
risk, the shuffled-control framing existing specifically so a real-looking-but-not-real result cannot
be waved through). A signal that only clears the bar on average, but fails outright on one evaluated
season, has not actually demonstrated the season-to-season robustness the additional validation exists
to test for. If a future validation-implementation issue wants to propose averaging instead, it would
need to make an explicit case for why averaging does not hide a failing origin — this document does not
make that case and does not recommend it.

Under this rule: with only one additional origin (Option A), "pass" or "fail" is a single per-origin
outcome, not yet an aggregation question. The aggregation rule matters starting at 2 or more additional
origins (Option B), where it prevents a rolling-origin backtest from quietly becoming "2 out of 3 ain't
bad."

## 5. Source availability and feasibility (evidenced, not guessed)

### 5.1 What currently exists in TIBER-Data

Direct inspection of `Prometheus-Frameworks/TIBER-Data` at the commit backing the current promotion
(`65fb498`, PR #193):

- The promoted artifact `exports/promoted/nfl/player_season_coverage_v0.json` contains **2,383
  records spanning exactly seasons 2022, 2023, 2024, 2025** (609 / 576 / 588 / 610 records
  respectively). No 2021-or-earlier season row exists in this artifact.
- The candidate artifact it was promoted from, `data/processed/evidence/player_season_coverage_2022_2025.source_backed.json`,
  and its generator, `scripts/build_player_season_coverage_2022_2025.py`, hardcode
  `SEASONS = [2022, 2023, 2024, 2025]` and are explicitly scoped ("Build the bounded
  player_season_coverage_v0 candidate artifact for 2022-2025") to that range by TIBER-Data #190's
  approved scope (PR #189's source boundary).
- A text search across TIBER-Data's committed JSON/Python/Markdown files for `"2021"` returns exactly
  one substantive hit: a player's `rookie_year: 2021` metadata field on an individual record — not a
  season-2021 data row. There is no evidence of any governed or candidate 2021 season data anywhere in
  the repository today.

**Conclusion: TIBER-Data has not promoted, and does not appear to have candidate-built, any season
earlier than 2022 for this artifact family.** This is a concrete, evidenced gap, not an assumption.

### 5.2 Whether 2021 data is likely obtainable at all

TIBER-Data's build script sources from `nflreadpy.load_player_stats()` and `nflreadpy.load_players()`
(the same approved source family used for 2022-2025). The NFL adopted its current 17-game / 18-week
regular-season format starting in the **2021** season — the same format the existing 2022-2025 build
already assumes (`build_player_season_coverage_2022_2025.py`'s `coverage_status` methodology note
explicitly reasons about "the full week span of a 2021+ season"). This means a 2021 promotion would
likely be **methodology-compatible** with the existing artifact's coverage-status thresholds without
requiring a separate season-length carve-out — unlike a pre-2021 season (16-game / 17-week format),
which would need its own methodology consideration this document does not attempt to resolve. This
repository has no direct evidence that `nflreadpy`'s underlying data actually contains complete,
governable 2021 player-stat rows (that determination belongs to TIBER-Data, using its own approved
source-verification process, not to this Forecast-side design) — but there is no evidence of a
methodology obstacle either.

### 5.3 What a rolling-origin backtest (Option B) would additionally require

Option B's minimal useful shape (3 origins: 2023, 2024, 2025) would require governed data back to
**2020**, two seasons earlier than Option A needs. 2020 predates the 17-game format change, so a 2020
promotion would also need TIBER-Data to resolve the coverage-status methodology question §5.2 flags for
pre-2021 seasons. This is a strictly larger and more uncertain source-availability question than
Option A's.

### 5.4 Forecast-side generator/script readiness (independent of TIBER-Data source availability)

Inspected directly in this repository:

- The non-production **contract schema/type** (`src/rehearsal/playerHistoryFeatureContractV0.ts`) is
  already season-generic: `player_identity_join_keys.season` is a plain `number`, and nothing in the
  schema or validator hardcodes `2025`. **No contract amendment is needed** to validate a different
  target season.
- The **generator and mirror-refresh scripts**, by contrast, hardcode the target season and input
  window as module-level constants and, in several places, bake `2025` directly into field names,
  output file paths, and boundary-statement keys rather than treating it as a parameter:
  - `src/rehearsal/playerHistoryRunPopulationMirrors.ts`: `RUN_POPULATION_TARGET_SEASON = 2025`,
    `RUN_POPULATION_INPUT_SEASONS = [2022, 2023, 2024]`.
  - `src/rehearsal/playerHistoryPromotedMirrorRefresh.ts`: output paths literally named
    `..._2025.outcome_mirror.json` / `..._2025.promoted_outcome_mirror.json`, and boundary-statement
    keys literally named `contains_no_2025_outcome_values`, `outcome_values_must_not_become_2025_input_features`.
  - `src/rehearsal/playerHistoryContractV0Replay.ts`: `CONTRACT_V0_TARGET_SEASON = 2025`,
    `CONTRACT_V0_INPUT_SEASONS = [2022, 2023, 2024]`.
  - Validating a second target season therefore requires **generator-script changes** (new constants,
    new file-naming and boundary-statement conventions that do not collide with the existing 2025
    artifacts), not merely flipping a config value, and not a contract schema/type amendment. This is
    real but bounded work: the pattern is already proven once (2025), and would be repeated with
    parameterization rather than invented from scratch.

## 6. Non-negotiables preserved

Carried forward unchanged from every document in this chain, binding on any future additional-validation
implementation:

- target season `S` may only use seasons `< S` — no exceptions, for whichever season is validated,
- no target-season or partial-target-season substitution, under any feature-availability fallback,
- missing-history players must not be silently zero-filled — the entire feature block stays `null`,
- source artifact identity must be path + sha256 + promotion review, never sha256 alone; a mismatch at
  generation time must fail closed,
- the real-vs-baseline-vs-shuffled validation framing remains required for every origin evaluated,
- this document does not authorize `seasonalPprModel.ts` wiring, in whole or in part,
- this document does not accept the PR #132 threshold proposal,
- any Fantasy/product consumer requires its own separate, explicitly-approved review,
- this document does not promote or demote any TIBER-Data artifact.

## 7. Next allowed issue

Because §5 establishes a concrete source-data gap rather than a design defect, the next allowed issue
is scoped to **assessing source availability**, not implementing additional validation directly and not
a production-path leakage audit or model wiring:

> **Assess source availability for player-history additional validation**

That issue's scope, per this document's findings, would need to determine — on the TIBER-Data side,
using TIBER-Data's own approved source-verification process — whether `nflreadpy.load_player_stats()`
and `nflreadpy.load_players()` actually return complete, governable 2021 regular-season rows for the
QB/RB/WR/TE positions this contract family covers, and if so, scope a TIBER-Data candidate-build and
promotion review analogous to #190→#193 for a 2021 extension. It should not itself perform a Forecast
mirror refresh, a controlled rerun, or any of Option A's Forecast-side steps — those remain gated behind
a successful source-availability outcome, per this document's `requires_source_feasibility_issue`
decision. It should also not expand scope to Option B's wider (2020+) requirement unless a future
threshold-review issue decides Option A's result is insufficient and calls for the larger rolling-origin
program.

Still forbidden in that next issue, and in any additional-validation implementation issue that might
follow it, unless separately authorized later:

- `seasonalPprModel.ts` wiring, in whole or in part,
- production-path leakage audit execution,
- production feature use of any kind,
- Fantasy/product consumer behavior,
- treating the PR #132 threshold as accepted.

## 8. Non-goals

- This document does not implement any additional validation.
- This document does not accept, amend, or reject the PR #132 threshold proposal — that remains a
  future decision, pending the validation this document designs.
- This document does not run a production-path leakage audit.
- This document does not modify `seasonalPprModel.ts` or any other production Forecast file.
- This document does not promote or demote any TIBER-Data artifact, and does not perform TIBER-Data's
  own source-verification process on its behalf.
- This document does not claim 2021 (or any other season) data is confirmed available — only that no
  governed data earlier than 2022 currently exists, and that a 2021 extension appears
  methodology-compatible based on the existing build script's own documented assumptions.

## 9. Failure modes this design exists to prevent

| Failure mode | How this design prevents it |
| --- | --- |
| Guessing that 2021 data exists and building mirrors against an artifact that was never actually promoted | §5.1 states directly, from inspection, that no season earlier than 2022 exists in TIBER-Data today. |
| Jumping straight to a rolling-origin backtest without checking whether even one additional season is available | §2.3 recommends Option A first and defers Option B's larger (2020+) requirement. |
| Averaging multi-origin results and letting one strong season mask a failing one | §4 sets a per-origin pass/fail rule as the default and requires an explicit case before averaging would be considered. |
| Treating "the schema didn't need to change" as "the scripts didn't need to change" | §5.4 separates the contract schema (already season-generic) from the generator scripts (currently 2025-hardcoded in naming and constants), which are two different questions. |
| Treating this document's source-feasibility finding as authorization to proceed with mirror-building anyway | §7 states the next allowed issue is source-availability assessment only; Forecast-side steps remain gated behind that outcome. |
| Letting "additional validation design" become a backdoor to leakage-audit or model-wiring scope | §6 and §7 restate the existing boundary explicitly; nothing in this document authorizes either. |

## 10. Next step

The decision in §1 permits opening a **separate** "Assess source availability for player-history
additional validation" issue (§7), scoped to TIBER-Data's own source-verification process for a 2021
extension. It does not permit a Forecast-side mirror-refresh/controlled-rerun issue yet (Option A
remains blocked until that assessment succeeds), a production-path leakage audit design/execution
issue, or a `seasonalPprModel.ts` wiring issue.
