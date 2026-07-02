# Decision: controlled player-history run population and mirror coverage (#107)

_2026-07-02 • record `player-history-run-population-and-mirror-coverage-decision-2026-07-02` • status: **decision only — no run, no metrics, no feature binding**_

This document decides what target/outcome population a future controlled player-history run should use and what player-history mirror coverage is required before that run can be authorized. It follows the merged dry-run matrix work in #105 / PR #106 and computes **no metrics**, trains **no model**, and claims **no signal**.

JSON companion: `player-history-run-population-and-mirror-coverage-decision-2026-07-02.json`.

## 0. Starting evidence (from #105 / PR #106 and fresh source-artifact analysis)

**Dry-run matrix state.** The dry-run matrix is structurally valid: it assembles baseline-ready, real-feature-ready, and shuffled-control-ready rows with all #104 boundaries inherited, deterministic ordering, exclusion reasons, and outcome values deliberately omitted from rows. Against the real inputs it honestly reported **0 joined rows**: the current target population (n=38 scored fixture) and the compact #104 mirror (4 players, 8 rows, deliberately edge-case-oriented rather than target-population-oriented) share no player. **Zero joins block any meaningful metric computation today.** Widening the mirror or changing the target population is exactly the boundary this document decides — nothing is widened or changed in this PR.

**Fresh facts from the pinned source artifact** (`TIBER-Data: data/processed/evidence/player_season_coverage_2022_2025.source_backed.json`, sha256 `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`, status `candidate_evidence_artifact_not_promoted`, 2,383 records):

| Fact | Value |
|---|---|
| Rows by season | 2022: 609 • 2023: 576 • 2024: 588 • 2025: 610 |
| Real 2025 REG population | **610 players** (QB 81, RB 151, WR 240, TE 138) |
| … with ≥1 real 2022–2024 input row | **485 players (79.5%)** (QB 66, RB 115, WR 189, TE 115) |
| … with no prior history (e.g. rookies) | 125 players |
| Input-window rows belonging to that population | **1,145** (2022: 315, 2023: 378, 2024: 452) |
| Fixture n=39 players found in artifact 2025 rows | 33 (34 have ≥1 input-window row) |

**Promoted-outcomes check.** The promoted TIBER-Data export `exports/promoted/nfl/player_weekly_ppr_outcomes_v1.json` was inspected at TIBER-Data `main` (`7ee4309`): it contains **6 rows, 2025 week 1 only, sourced from an `offline_fixture`**. It is scaffold coverage and **cannot serve as a real 2025 outcome population today**. Consequence: the candidate `player_season_coverage_v0` artifact is currently the only real, source-backed 2025 outcome data committed anywhere in this chain.

## 1. Decision: which target/outcome population?

### Option A — current n=38 Forecast fixture/scaffold population: **rejected for any signal-bearing run**

- Its governance status is `fixture`; the 2025 outcome values are hand-seeded, not source-backed. A result on this population cannot ground any empirical player-history claim.
- n=38 (QB 8, RB 10, WR 15, TE 6) is too small for the per-position breakdowns the #102 design requires as a sanity control.
- It has zero overlap with the current mirror, so a mirror regeneration is required under Option A anyway — the regeneration effort is symmetric across options.
- Its one legitimate use — proving run mechanics — is already spent: the #105/#106 dry-run matrix proved the join, boundary, null, and shuffled-control machinery without running anything. A fixture-population rehearsal run would add no new information.

### Option B — real mounted TIBER-Data 2025 outcome population: **chosen as the required destination, with a prerequisite path**

The first controlled run must use the real 2025 REG population derived from the pinned candidate artifact:

- **Outcome layer**: the artifact's 610 REG 2025 rows, supplying **only** the target outcome (`season_ppr`) plus identity/position. 2025 rows may never supply any input feature — the #104 structural guards already enforce the input side, and the mirror design below makes it structural on the data side too.
- **Candidate-status caveat**: the artifact is `candidate_evidence_artifact_not_promoted`. Using its 2025 rows as an *experiment outcome layer* does **not** promote it, and every derived report must say so. If TIBER-Data later promotes a full real 2025 outcome export (the current one is a 6-row fixture), that export becomes the preferred outcome source and the target-population gate must re-run against it.
- **Feasibility is established, not hoped for**: 485 of 610 players (79.5%) join to real 2022–2024 history, with every position at ≥66 joinable players — comfortably supporting per-position reporting and a position-stratified shuffled control.

**Prerequisite path before any run issue can be opened:**

1. Build a real target-population **outcome mirror** (2025 REG rows; outcome + identity fields only) via a committed, deterministic generator script reading the pinned artifact.
2. Regenerate the **input mirror** as a *generated* subset (not hand-picked): all 2022–2024 REG rows for the target population's players — 1,145 rows, trimmed to scaffold-needed fields (~2.2MB at the #104 mirror's per-row size).
3. Keep the two mirrors as **separate files**, so the input side structurally cannot carry target-season rows.
4. Re-run the #99/#100 gate and the #105 dry-run matrix against the new mirrors before any run authorization.

## 2. Decision: required mirror coverage

- **Do not vendor** the full 8.8MB Data artifact into Forecast.
- Mirrors must be **generated by a committed, deterministic, network-free script** from the sha256-pinned source — never hand-picked rows. (The #104 four-player mirror was hand-selected for edge cases; that was correct for a feature-extraction scaffold and is wrong for a run.)
- The input mirror must include **all** 2022–2024 REG rows for **every** player in the chosen target population. A player absent from the source for a season is a documented absence, not a mirror gap. Partial coverage is acceptable only as honest absence, never as sampling.
- Players with target outcomes but **no player-history rows** (125 today, e.g. rookies) **stay in the matrix** as feature-less rows with nulls preserved — they are the no-history subgroup, not exclusions. Player-history rows without target outcomes remain excluded with the existing `player_history_features_without_target_row` reason.
- Each mirror ships with a provenance companion: source repo/path, sha256 pin, refs, row counts, per-position counts, target-window scope, trimming rationale, exclusion reasons, and (for the input mirror) an explicit no-2025-rows statement.
- The #99/#100 player-season coverage gate must be **re-run or extended whenever mirror/source scope changes materially**, including any upstream regeneration that changes the artifact sha256.

## 3. Decision: minimum overlap before a run is authorized

| Threshold | Value |
|---|---|
| Minimum joined rows overall | **≥ 200** |
| Minimum joined rows per position (QB/RB/WR/TE) | **≥ 30 each** |
| Minimum joined share of the scored target population | **≥ 60%** |
| Shuffled-control feasibility | every included position group must allow a derangement (≥2 feature-bearing rows; subsumed by the per-position minimum) |
| Zero or tiny overlap | **blocks the run** |

Calibration note: these are conservative floors chosen against observed feasibility (485 joinable, ≥66 per position, 79.5% share) — **not** tuned to the current fixture and **not** tuned post hoc. They exist so per-position breakdowns and the position-stratified shuffled control are meaningful. Lowering any threshold requires explicit review in the run-authorizing issue **before** any metric is computed.

## 4. Decision: required gate/provenance checks before a run

1. **Re-verify the #99/#100 coverage gate** against the current pinned artifact sha256; re-run the gate if the sha changes.
2. **New target-population gate**: outcome rows are source-backed (`source_refs` present, `identity_confidence` checked), season/season_type/position scope and row grain correct, candidate status acknowledged with an explicit not-promoted statement, and outcome values real (not fixture-seeded).
3. **New mirror-overlap gate**: a machine-checkable, fail-closed evaluation of the regenerated dry-run matrix report against the section-3 thresholds, with a decision ceiling of `may_authorize_run_issue` (never `may_run`) — consistent with the #100 gate-ceiling pattern.
4. **No 2025 inputs**: verify no 2025 player-history summaries are consumed as 2025 inputs (structural: the input mirror contains no 2025 rows; the #104 guards enforce it in code).
5. **No outcome leakage into features**: the dry-run matrix already omits outcome values from rows by construction; its test must be kept.
6. **Null semantics intact**: existing #104/#106 tests plus the dry-run missingness report.

## 5. Next issue

**Proposed title:** `Forecast: build real target-population mirror for player-history run`

**Proposed scope:** a committed deterministic generator script producing (a) the 2025 outcome mirror (outcome + identity fields only) and (b) the regenerated 2022–2024 input mirror (all rows for the target population, trimmed), each with a provenance companion; re-run the #99/#100 gate against the pins; re-run the #105 dry-run matrix against the new mirrors and regenerate its report (expected joined rows on the order of 485); implement the mirror-overlap gate evaluating that report against the section-3 thresholds (ceiling: `may_authorize_run_issue`).

**Explicitly not in that issue:** no run, no Run 3, no training/tuning/evaluation/comparison, no metric computation, no baseline change, no production feature binding, no TIBER-Data/Teamstate change, no artifact promotion.

**After that:** a separate issue — `Forecast: authorize controlled player-history run after population gate` — may authorize the three-arm run only once the overlap gate passes.

## 6. Non-goals confirmed

- No Forecast run occurred; no Run 3 was created.
- No model was trained, tuned, evaluated, or compared; no MAE/RMSE/Pearson/rank-correlation was computed.
- No baseline change; nothing wired into `seasonalPprModel.ts`; no production feature binding.
- No TIBER-Data or Teamstate change; no Data artifact promotion; no full-artifact vendoring in this PR.
- No 2025 summaries consumed as 2025 input features; no active/inactive/IR/practice-squad/ownership inference.
- No null/unavailable value coerced to zero.
- No player-history signal is claimed; no fantasy advice, rankings, start/sit, trade, draft, or product output.
