# Review: candidate player-history signal from the controlled run (#113)

_2026-07-03 • record `player-history-controlled-run-review-2026-07-03` • status: **review/decision only — no binding, no new run, no production change**_

This document reviews the experimental candidate result recorded by #111/PR #112 (`docs/reports/player-history-controlled-run-2026-07-02.{json,md}`) and answers the six #113 review questions. It authorizes nothing: the result remains `experimental_candidate_result_not_production_signal`, the source artifact remains `candidate_evidence_artifact_not_promoted`, and no production Forecast behavior changes here.

JSON companion: `player-history-controlled-run-review-2026-07-03.json`.

## 0. What is under review

PR #112 executed the isolated three-arm experiment designed in #101/PR #102 over the #109 mirrors (real 610-player 2025 REG population; 485 joined to real 2022–2024 history; 125 no-history players):

| Joined population (n=485) | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|
| `baseline_only` (train-fold position mean) | 68.93 | 88.55 | 0.180 | −0.158 |
| `real_player_history_features` | **40.03** | **57.29** | **0.771** | **0.751** |
| `shuffled_player_history_control` | 72.03 | 90.41 | 0.117 | 0.068 |

Recorded decision: `candidate_player_history_signal_observed_requires_followup`.

## 1. Was the run valid under the registered boundary? — **Yes; no blocking concerns**

Each registered guard was verified in code and tests (PR #112, suite 637/637 at merge):

| Guard | Status | Evidence |
|---|---|---|
| Prior-gate preflight (all four #109 decisions) | held | `assertControlledRunPreconditions` fails closed; per-gate block tests |
| Gate evidence vs actual mirrors | held | scored/joined counts recomputed from the mirrors being run, exact-match required; stale/mismatched evidence blocks (review fix `36f044b`) |
| Candidate/not-promoted status, both mirrors + same sha pin | held | status/pin checks (review fix `36f044b`) |
| No 2025 input rows / no outcome-valued input fields | held | structural preflight checks + tests |
| Approved source provenance on the consumed mirrors | held | all-source allow-list revalidation at the run boundary (review fix `55aa27a`) |
| Train-fold-only imputation and standardization | held | per-fold fit on training rows only; direct leakage test: mutating a held-out player's outcome leaves its own three predictions bit-identical |
| Deterministic LOOCV | held | fixed fold order, seeded shuffle; byte-identical reports across reruns |
| Position-stratified shuffled control | held | 485 donors, 0 self-donations, 0 cross-position donations |
| No production behavior change / no production signal claim | held | module isolated to `src/rehearsal/`; import-isolation test; decision enum has no binding value |

**Non-blocking observations** (documented, not defects):

- The within-position baseline Pearson/Spearman of −1 is the known LOOCV group-mean artifact, explained in the #112 report itself.
- The candidate artifact supplies **both** the 2022–2024 input features and the 2025 outcome layer. This is not leakage (the windows are disjoint and structurally enforced), but it is a **shared-source dependency**: a systematic error in the upstream pipeline would touch both sides. Classified follow-up — it is one reason reproduction after upstream promotion/replacement matters (section 4).
- **Follow-up**, not defects: single untested ridge λ (=1.0), a single shuffled-control seed, and 2025 `season_ppr` outcomes that include partial-season players (a real 1-week season is a legitimate but high-variance target). All feed section 3.

## 2. How strong is the experimental result? — **Consistent and value-dependent, but a candidate signal only**

- **Against baseline**: joined-population MAE fell 41.9% (68.93 → 40.03); RMSE fell 35.3%; Pearson rose 0.18 → 0.77 and Spearman −0.16 → 0.75. The rank-correlation movement matters: the real arm orders players usefully, which the baseline structurally cannot do within position.
- **Against the shuffled control**: the control — identical model, schema, feature count, and imputation, with history values deranged within position — landed **at or slightly below baseline** in every view (joined MAE 72.03 vs 68.93; Pearson 0.12). This is the sanity arm behaving exactly as designed: the improvement is attributable to the **actual history values**, not to model structure, added columns, or the has-history indicator.
- **Per position** (MAE, baseline → real, shuffled in parentheses): QB 99.8 → 65.5 (102.7); RB 75.9 → 49.6 (76.6); TE 48.8 → 30.4 (52.1); WR 60.9 → 36.4 (59.3). Every position improved 34–40% while its shuffled arm sat at baseline; real-arm Pearson is 0.68–0.76 across all four. No position carried the result, and none degraded.
- **No-history subgroup** (n=125): real ≈ shuffled (50.5 vs 51.0), both modestly better than raw position mean (59.6). This is the expected null result — for these rows the two feature arms carry identical all-null→imputed blocks, so their agreement is an internal consistency check that passed. The small gain over baseline there is structural (imputation centering), not history signal, and the review notes it as such.
- **Overall population** (n=610) mirrors the joined story: 67.0 → 42.2 (67.7).

**Limits — why this is not production evidence:**

1. The source artifact is candidate evidence; neither the inputs nor the outcomes have passed TIBER-Data promotion governance.
2. One fold design, one λ, one shuffle seed, one baseline definition — robustness unexplored (section 3).
3. **Attribution within the feature set is unknown.** The 26-column block includes prior-year PPR (`ppr_2024`), which plausibly carries much of the lift. "Player history beats position mean" is established; "the full family set earns its complexity" is not — that requires ablation, and matters because a much simpler prior-year baseline could reframe how large the marginal gain really is.
4. Outcomes include partial-season 2025 rows, so a leverage/outlier sensitivity question is open.
5. Single season pair (2022–24 → 2025); no evidence yet about stability across target seasons.

## 3. Required robustness checks (bounded, prioritized) — before any binding path

| Priority | Check | Why it is next |
|---|---|---|
| P1 | **Feature-family ablation** (production-only, usage-only, coverage-only, age/team-only arms; and ppr_2024-alone) | The central open question is attribution: whether the lift survives without prior-year PPR, and what each family adds. Directly reuses the toggleable #104 families. |
| P2 | **Alternate baseline: position + prior-year-PPR** | A stronger, still-simple comparator. If the full feature set barely beats it, the honest claim shrinks accordingly. |
| P3 | **λ sensitivity** (e.g. λ ∈ {0.1, 1, 10, 100}) | Confirms the result is not an artifact of one regularization choice. Cheap and deterministic. |
| P4 | **Repeated shuffled-control seeds** (e.g. 5 deterministic seeds, reported individually) | One derangement is one draw from the null; a small family of seeds bounds its variance. |
| P5 | **Outlier / leverage sensitivity** (e.g. metrics recomputed excluding the top-k absolute-error rows and partial-season outcome rows, reported alongside, never replacing, the primary metrics) | Partial-season outcomes are legitimate but high-variance targets. |

Deferred (documented, not recommended now): deterministic K-fold (LOOCV is already deterministic and exhaustive at n=610), position-specific models (pooled + dummies adequate at current per-position n), bootstrap CIs (optional; only if deterministic and bounded), reproduction on a regenerated artifact (subsumed by section 4's promotion path). All checks stay inside the isolated experiment path with the same fail-closed preflight and marking.

## 4. What must happen upstream in TIBER-Data? — **Promotion (or a governed replacement) is required before any production use**

- Production binding **must not occur** from a source marked `candidate_evidence_artifact_not_promoted`. This review reaffirms the stance carried since #108: using candidate evidence as an experiment layer promotes nothing.
- Any binding path requires TIBER-Data to **promote or replace** `player_season_coverage_v0` with a governed, promoted artifact — with its own gates: schema validation, provenance and approved-source verification, reproducibility (pinned generator + hash), coverage acceptance, and owner review, all inside TIBER-Data.
- Promotion also mitigates the shared-source dependency noted in section 1: the promoted artifact (or a separate promoted outcome export) would give the outcome layer independent governance from the experiment's convenience mirror.
- Until then, Forecast continues treating the #109 mirrors as **experiment inputs only**.

**TIBER-Data issue sketch** (for when the owner chooses to open it): *"TIBER-Data: promote player_season_coverage_v0 after source-backed governance review"* — scope: define promotion criteria for the artifact (schema, provenance allow-list, reproducibility from the committed builder, per-season/position coverage acceptance, explicit non-goals), run the review, and either promote with a promotion record or state precisely what blocks promotion. Blocks: any Forecast change, any signal claim, any product output.

## 5. Production-binding prerequisites — defined, **not authorized**

A future issue proposing to bind player-history features into production Forecast could only be opened after ALL of the following exist. Listing them creates no authorization:

1. **Governed source**: promoted (or equivalently governed) TIBER-Data artifact per section 4 — no candidate inputs in any production path.
2. **Robustness evidence**: the section-3 P1–P5 checks completed and reviewed, with the signal surviving ablation and the stronger baseline.
3. **Explicit feature contract**: named, versioned feature definitions (family, formula, window, null semantics) — not ad-hoc extraction.
4. **Leakage gate in the production path**: structural `season < targetSeason` + input-window enforcement as a runtime gate, not a convention.
5. **Source/provenance gate in the production path**: sha-pinned, allow-listed, fail-closed — the #109/#112 pattern productionized.
6. **Null-handling policy**: the train-fold discipline formalized for production inference, including the documented fallback for fully-null columns; never silent zero-fill.
7. **Monitoring and regression tests**: golden-value tests for the feature pipeline and drift checks against the governed source.
8. **No-history fallback**: a defined, reviewed behavior for players without history (today: imputed-mean + indicator; production needs an explicit decision).
9. **Product separation**: model improvements remain distinct from any advice/ranking/start-sit/trade/draft surface, which stays out of scope entirely.
10. **Owner review of the binding proposal itself** before any `seasonalPprModel.ts` or production-route change.

## 6. Recommended next issue — one, the smallest honest step

**`Forecast: run robustness checks for candidate player-history signal`** — implement the section-3 P1–P5 checks inside the existing isolated experiment path (same preflight, same marking, same decision-enum ceiling), producing one durable comparison report. Rationale for choosing this over the TIBER-Data promotion issue: robustness is cheaper, stays within Forecast, and its outcome determines whether promotion is worth requesting at all — if the signal does not survive ablation and a prior-year baseline, no upstream work should be spent on it. The promotion issue (section 4 sketch) becomes the follow-up only if the signal survives.

## Non-goals confirmed

- No player-history features were bound into production Forecast; `seasonalPprModel.ts` is unchanged; the production baseline is unchanged.
- No product routes or UI surfaces; no fantasy advice, rankings, start/sit, trade, or draft output.
- No TIBER-Data artifact was promoted; no TIBER-Data or Teamstate change was made in this PR.
- No new model run was computed for this review (existing #112 reports were inspected only).
- The candidate/not-promoted status and the `experimental_candidate_result_not_production_signal` marking are preserved.
- No production signal is claimed.
