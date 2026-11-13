# Week 10 scoring protocol for the frozen shadow forecast (2026-11-10)

Status: **RULES ONLY. Nothing is scored here.** This protocol fixes, before any 2026 Week 10 game is played, how the frozen shadow forecast will be compared with outcomes. Running it needs its own operator authorisation, including authorisation to retrieve the outcome file. It is a descriptive prospective shadow evaluation: it selects no model, admits no source, promotes nothing and activates no consumer.

Companion report: [`any-week-shadow-candidate-2026-11-10.md`](any-week-shadow-candidate-2026-11-10.md). Program context: [#187](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/187).

## 0. Timing

- First Week 10 kickoff in the retained schedule: WAS @ NYG, Thursday 2026-11-12 20:15 Toronto time = **2026-11-13T01:15:00Z**.
- This file was written on 2026-11-10 (Toronto), after the forecast was frozen and before any Week 10 game.
- Whether it was *published* before kickoff is established by GitHub's record of the push that added it to PR #191, not by this sentence. If that record shows a time at or after kickoff, this protocol was not fixed before outcomes and every result produced under it must say so.
- Any later edit to this file is an amendment. Amendments made after kickoff must be listed in the scoring report with their commit and reason, and the results must be labelled accordingly.

What the author had already seen when writing this: the candidate's historical results for 2022–2025 and 2026 targets through Week 9 (all in the companion report). No Week 10 outcome existed.

## 1. Frozen forecast

| | |
|---|---|
| File | `docs/reports/evidence/any-week-shadow-2026-11-10/original/as-run-r1/shadow_week10_forecast.csv` |
| SHA-256 | `b815e1be4e296c4ed1e1317687ff21e1c615297a54caae4749fc7bee7ab6b874` |
| Generated | 2026-11-10T15:59:21Z, from inputs retrieved by 15:58:07Z (evidence through 2026 REG Week 9) |
| Rows | 559, one per `gsis_id`, no duplicates |

Scoring must begin by verifying that hash. If it does not match, stop.

Frozen membership, by the file's `status` and `position` columns:

| `status` | QB | RB | WR | TE | Total | Meaning |
|---|---:|---:|---:|---:|---:|---|
| `prior_plus_2026` | 48 | 97 | 153 | 86 | **384** | Blended forecast issued |
| `no_prior_season_to_date_only` | 8 | 27 | 42 | 23 | **100** | Current-season-average fallback issued |
| `bye_no_forecast` | 10 | 21 | 27 | 17 | **75** | Null forecast (classified as bye: CHI, DEN, PHI, TB) |
| All | 66 | 145 | 222 | 126 | **559** | |

Rules:

1. **All 559 rows stay in the ledger.** No row is added, dropped, merged or reclassified.
2. **The issued numbers are evaluated exactly as stored**, rounded to two decimals: `forecast`, `prior_ppg_2025`, `ppg_2026_thru_wk9`. They are not recomputed from scripts, not replaced by unrounded values, and not updated.
3. **Position is the stored `position`.** Team and opponent as stored are context only.
4. **Later discoveries change nothing.** A trade, release, signing, injury designation, position change, identity correction or schedule change learned after the freeze must not alter membership, forecasts, comparator values or position. Such facts may be noted beside a row.
5. **Null forecasts stay unavailable.** The 75 null rows are never scored, even if later evidence shows the player took part in a Week 10 game. Any such cases are counted and listed.

## 2. Arms

On the 384 `prior_plus_2026` rows, three numbers per player, all already in the frozen file:

| Arm | Column | |
|---|---|---|
| Issued blend | `forecast` | the shadow candidate |
| Prior only | `prior_ppg_2025` | comparator |
| Current season only | `ppg_2026_thru_wk9` | comparator |

On the 100 `no_prior_season_to_date_only` rows the issued `forecast` equals `ppg_2026_thru_wk9` on every row and `prior_ppg_2025` is empty. There is no comparator, so **these rows are reported separately and never pooled into the three-arm comparison.**

## 3. Outcomes

### 3.1 Scoring profile

`tiber-generic-full-ppr-v1`, eight components, nothing else:

`receptions + 0.1×receiving_yards + 6×receiving_tds + 0.1×rushing_yards + 6×rushing_tds + 0.04×passing_yards + 4×passing_tds − 2×interceptions`

No fumbles, two-point conversions, bonuses or return touchdowns. Interceptions are interceptions thrown (`passing_interceptions` in the intended source). A provider's own fantasy total is never used. Arithmetic is done in integer cents: each stored forecast × 100 rounded to the nearest cent, each outcome computed exactly from integer components.

### 3.2 Intended outcome source

The nflverse release asset `stats_player/stats_player_week_2026.csv` (the same asset family the forecast was built from), together with the `schedules/games.csv` asset from the same retrieval. Retrieving them is a new acquisition and needs the authorisation mentioned above. Both files must be retained unchanged with retrieval time and SHA-256, under the same attribution terms as the existing inputs. This does not admit the source.

A player's outcome row is the row with his `gsis_id`, season 2026, `season_type` REG, week 10, whatever team it shows.

### 3.3 Finality

The primary scoring uses the **first snapshot retrieved at or after 2026-11-18T12:00:00Z** that satisfies both:

- the retained schedule file shows a final score for each of the 14 Week 10 games listed below; and
- the outcome file contains at least one REG Week 10 row for each of those 14 `game_id`s.

`2026_10_WAS_NYG`, `2026_10_NE_DET`, `2026_10_KC_ATL`, `2026_10_HOU_CLE`, `2026_10_MIN_GB`, `2026_10_MIA_IND`, `2026_10_CAR_NO`, `2026_10_BUF_NYJ`, `2026_10_JAX_TEN`, `2026_10_LA_ARI`, `2026_10_SEA_LV`, `2026_10_SF_DAL`, `2026_10_PIT_CIN`, `2026_10_LAC_BAL`.

This is a practical finality rule, not official completion evidence. The report must say so.

### 3.4 Per-game finality, and postponed, moved or cancelled games

Finality is decided **per outcome row, by that row's own `game_id`**. The frozen forecast `team` and `wk10_opp` are context only and never decide finality or status.

An outcome row's game **passes finality** in the scoring snapshot only if all of these hold:

1. the row's `game_id` is one of the 14 Week 10 games listed in section 3.3 (a missing `game_id`, or any other game, does not pass);
2. the retained schedule file from the same retrieval shows a final score for that game; and
3. the outcome file contains at least one REG Week 10 row for that `game_id`.

These are the same per-game conditions as section 3.3, applied to the single game the row belongs to. A complete statistics row from a game that has not satisfied them stays unresolved.

If a listed game has no final score or no rows in the snapshot, the snapshot still qualifies for the other games once 2026-11-25T12:00:00Z has passed. Rows belonging to the affected game then fail finality under the rule above. A game played later is not scored in the primary results. It may appear only in a labelled revision (3.6).

### 3.5 Resolution of each issued forecast

All 484 issued forecasts stay in the evaluation ledger with exactly one status. **Apply the rules in this order; the first rule that matches determines the status.**

| Order | Condition | Status | Outcome |
|---:|---|---|---|
| 1 | No matching target-week outcome row exists (section 3.2) | `unresolved_no_target_week_row` | none |
| 2 | An outcome row exists, but its own game does not satisfy the finality conditions of section 3.4 | `unresolved_game_not_final_at_snapshot` | none |
| 3 | The game passes finality, but a scoring component is null | `unresolved_incomplete_components` | none |
| 4 | The game passes finality and all eight scoring components are present | `resolved` | Profile points from that row |

- **An absent row stays unresolved.** It is never turned into a zero, whatever the reason for absence and whatever the state of the game the frozen `team` was expected to play. No DNP zeros.
- **An explicit all-zero row can resolve to 0.00 only after its own game passes finality** (rule 4). Before that it is `unresolved_game_not_final_at_snapshot` (rule 2).
- That explicit row is the only evidence this protocol accepts as establishing zero production. No other evidence class is defined here.
- A player whose outcome row belongs to a different listed game than his frozen `team` implied (for example after a trade) is resolved or not by that row's game alone; his forecast, cohort and position do not change (section 1).
- Unresolved rows are counted and listed by status and position. They are not errors of zero and they are not excluded from the denominators in section 5.

### 3.6 Corrections and revisions

- The frozen forecast file is never edited. Outcomes live in a separate ledger keyed by `gsis_id`.
- The primary results are those from the first qualifying snapshot and are never overwritten.
- If the provider later revises Week 10 statistics, at most a separately labelled **revision** may be produced from a later retained snapshot, shown beside the primary results with the rows that changed. It replaces nothing.

## 4. Metrics

Error for a row = outcome − stored number, in points.

For each cohort and arm: **pooled** MAE and RMSE (row-weighted), **per-position** MAE and RMSE with row counts for QB, RB, WR, TE, and **macro** MAE and RMSE (the arithmetic mean of the four position values). If a position has no resolved row in a cohort, its value and the macro value are reported as undefined, not computed from fewer positions.

Cohorts, fixed now:

| | Cohort | Frozen rows | Arms |
|---|---|---:|---|
| A | Three-arm comparison | 384 | issued blend, prior only, current season only |
| B | Fallback rows | 100 | issued forecast only |
| C | All issued forecasts | 484 | issued forecast only |
| D | Subset of A with max(`prior_ppg_2025`, `ppg_2026_thru_wk9`) ≥ 8.00 as stored | 176 (QB 41, RB 44, WR 65, TE 26) | as A |

Paired comparisons (cohorts A and D only): blend minus prior-only and blend minus current-only, as differences in absolute error, **on identical label-resolved members**. Because all three numbers exist for every row in A, the resolved set is the same for all three arms; it must still be stated explicitly with its count.

The three arithmetic conditions from the accepted specification (lower macro MAE, no higher macro RMSE, no position worse than prior-only) may be shown for cohort A as description. One week on this population satisfies none of the specification's evidence, population or sufficiency requirements, so no gate is passed or failed by it.

No interval or significance test is required. If one is shown it must be labelled descriptive, and a player-resampling interval must carry the note that it does not preserve dependence between players who share a game.

## 5. Coverage, against the original frozen denominators

Report every one of these, as counts and shares:

- resolved and unresolved (by status) out of **484** issued forecasts, and separately out of **384** and **100**;
- issued forecasts out of **559** frozen rows (484, fixed);
- null-forecast rows out of 559 (75, fixed), and how many of those 75 have a Week 10 outcome row (listed, not scored);
- for cohort D, resolved out of 176.

Shares are never recomputed against a smaller, outcome-defined denominator without also showing the frozen one.

## 6. What the scoring report must contain

1. The verified forecast hash and the commit of this protocol it followed.
2. Outcome and schedule snapshot hashes, retrieval times, and the finality check result per game.
3. The per-player ledger: all 559 rows, stored numbers untouched, status, outcome, and errors per arm.
4. The tables of sections 4 and 5.
5. Any deviation from this protocol, stated as a deviation, with the reason.
6. The limitations below.

## 7. Limitations that stay attached to any result

- Shadow candidate; no consumer admission. No automatic model selection, admission or promotion follows from any outcome.
- One week. A single week cannot establish that a method is better.
- No injury or availability modelling; unresolved rows will include players who were inactive.
- Production-history population with incomplete roster coverage: only players with a 2026 REG row through Week 9 are in the file.
- Current-season-average fallback for missing priors, a rule chosen after seeing historical results.
- Generic scoring as defined in 3.1; not any league's scoring.
- Outcomes come from one public provider snapshot, not from admitted, completion-evidenced sources.

## 8. Amendment record

| Amendment | Sections | Change | When |
|---|---|---|---|
| A1 | 3.4, 3.5 | Finality is decided by each outcome row's own `game_id`, not by the frozen forecast team; status precedence made explicit (absent row → game not final → incomplete components → resolved). An all-zero row resolves only after its game passes finality. Dates, cohort membership, coverage denominators, scoring profile, stored forecasts and revision policy are unchanged. | Written 2026-11-10 (Toronto), before any Week 10 game. The publication time is GitHub's record of the push that carries this amendment. |
