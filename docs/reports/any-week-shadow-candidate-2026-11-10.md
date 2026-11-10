# Any-week blend — shadow candidate (2026-11-10)

Status: **SHADOW CANDIDATE / EVIDENCE PRESERVATION ONLY.** This report admits no source, selects no denominator, clears no blocker, selects no model, and activates no consumer. It preserves an unsanctioned experiment run in a Claude session on 2026-11-10 so that it can be independently reproduced and reviewed.

Program context: [#187](https://github.com/Prometheus-Frameworks/TIBER-Forecast/issues/187). [PR #189](https://github.com/Prometheus-Frameworks/TIBER-Forecast/pull/189) and its frozen decisions are untouched; `TARGET2025_DENOMINATOR_RECONSTRUCTION_NOT_READY` stands.

Evidence folder: [`docs/reports/evidence/any-week-shadow-2026-11-10/`](evidence/any-week-shadow-2026-11-10/) · Hodge proposal: [`target-2025-hodge-prior-unavailable-proposal-2026-11-10.md`](target-2025-hodge-prior-unavailable-proposal-2026-11-10.md)

## 1. What this is, relative to the accepted Week 2 experiment

The accepted bootstrap (`year1-week2-bootstrap-v0`, preserved in PR #189) forecasts Week 2 only. This is a **new candidate**, not a run of that experiment.

| | Accepted Week 2 experiment | This shadow candidate |
|---|---|---|
| Target weeks | Week 2 only (origin Week 1) | Any week N+1 from origin weeks 1–17 |
| Update formula | `P + alpha·(W − P)`, one global `alpha` | `(k·P + n·S)/(k + n)`, one global `k`; `n` = current-season recorded games, `S` = current-season points per recorded game |
| Parameter fit | Closed form, clipped to [0, 1], 2022–2023 | Grid argmin over `k`, 2022–2023, all origin weeks pooled |
| Population | Frozen cutoff-time roster ledger; later nonparticipants retained | **Players who have a row in the target-week file** (appeared in the target game) |
| Missing prior | Typed unavailable; never zero or a mean | Falls back to the current-season average `S` |
| Prior but no current games | n/a at Week 2 | Forecast = `P` |
| Labels | Staged: fit, freeze, open 2024, seal, open 2025 | One script read every season at once |
| Inputs | Admitted, cutoff-bound, evidence-classed | Public release assets retrieved on 2026-11-10; one later snapshot |
| Arithmetic | Rational cents, ROUND_HALF_UP | Float64; display rounded to 2 dp |

The Week 2 arithmetic was also run as a by-product. It is reported separately in section 8 and is a diagnostic on this population, not the governed study.

## 2. What ran, and what had been seen when

All times UTC, 2026-11-10. Times come from file modification times in the session workspace; where none survived the time is stated as unknown.

| Time | Event |
|---|---|
| 15:57:25–15:58:07 | Eight input assets retrieved (section 3). |
| 15:57:40 or shortly after | `blocker.py` run (Hodge legacy-vs-current comparison). Its stdout was not saved; it is regenerated in the evidence folder. |
| unknown, 15:58:07–15:59:18 | **r0**: first run of `shadow.py`. It read 2022–2026 in one pass, so fit, 2024, 2025 and 2026 results were all visible together. Its two output files were later overwritten. |
| 15:59:18 | Script edited after reading r0's results: (a) the missing-prior fallback changed from a shrunk estimate to the plain current-season average, because the shrunk version scored worse on 2024, 2025 and 2026 rows; (b) a gate-condition printout was added. |
| 15:59:21 | **r1**: second run. These are the delivered results and the delivered Week 10 file. |
| 16:13 | r1 script, results and Week 10 file copied aside and hashed. |
| 16:14 | r1 re-run from the retained inputs: both outputs byte-identical. r0 script reconstructed from the session record and re-run. |
| 16:16 | Inspection addendum run (section 6 onward). |

Fixed before any result existed: scoring weights, the blend formula, the objective and position weighting, the `k` grid, the training seasons, the blend-row rule, and the "relevant" threshold of 8 points per game. Chosen after results were seen: the missing-prior fallback (above). Nothing was preregistered outside the session, so "fixed before" rests on the session record alone.

Not changed in this PR: objective, search range, weighting, cohorts, fallback rules, `k`. The 2026 TE regression is reported as found.

## 3. Inputs

Provider: nflverse (`nflverse-data` release assets; its `LICENSE.md` begins "Attribution 4.0 International"). Retained gzipped under `inputs/` with raw and gzip SHA-256 in `inputs/RAW.sha256`, `inputs/GZ.sha256` and `manifest.json`. No admission is implied by their presence here.

| Retained file | Source asset | Retrieved (UTC) | Raw bytes | Raw SHA-256 | Provider Last-Modified seen afterwards |
|---|---|---|---:|---|---|
| `inputs/games.csv.gz` | `schedules/games.csv` | 2026-11-10T15:58:07Z | 2188990 | `1d90e60f71253f217ab698236616d367bf93cddfddac545c29b1fcb33cf87d65` | Tue, 10 Nov 2026 16:17:01 GMT |
| `inputs/legacy_player_stats_2024.csv.gz` | `player_stats/player_stats_2024.csv` | 2026-11-10T15:57:29Z | 1674023 | `4f1598c9a6ba396a52e256762a0d9148abd22cdf856f26fc8825fa1d1dc49631` | Tue, 06 May 2025 16:34:56 GMT |
| `inputs/stats_player_week_2021.csv.gz` | `stats_player/stats_player_week_2021.csv` | 2026-11-10T15:57:25Z | 8477784 | `41915fb49238902ad1f129ebf0405b11a1e710454ae0fe8f7b3e4f9145875f48` | Thu, 13 Aug 2026 16:48:00 GMT |
| `inputs/stats_player_week_2022.csv.gz` | `stats_player/stats_player_week_2022.csv` | 2026-11-10T15:57:26Z | 8408729 | `ad426c3fe5bf1cc30c3f137fdfe96d054e19d400879ee4413129da49fa7b54be` | Thu, 13 Aug 2026 16:48:13 GMT |
| `inputs/stats_player_week_2023.csv.gz` | `stats_player/stats_player_week_2023.csv` | 2026-11-10T15:57:27Z | 8332874 | `f19cb71a5de0dce7fd09376026237c9ee9d5a93fe13815a2ea3ec2d37204cb17` | Thu, 13 Aug 2026 16:48:36 GMT |
| `inputs/stats_player_week_2024.csv.gz` | `stats_player/stats_player_week_2024.csv` | 2026-11-10T15:57:28Z | 8470040 | `3ddc45a84f759aa348ce465ae001752c530575455717657cdfe1f8abfcdb4759` | Thu, 13 Aug 2026 16:49:11 GMT |
| `inputs/stats_player_week_2025.csv.gz` | `stats_player/stats_player_week_2025.csv` | 2026-11-10T15:57:28Z | 8656387 | `e5e0615b3d96a3eaebfaee91e55afb4a4e7fe0caf057454177bcd7d6ad4bcfc2` | Thu, 13 Aug 2026 16:51:22 GMT |
| `inputs/stats_player_week_2026.csv.gz` | `stats_player/stats_player_week_2026.csv` | 2026-11-10T15:57:29Z | 4210589 | `edac7bfc5969a8ec553d8b0e3d9e479e924b8492fd048139f83c6e9e306887e6` | Tue, 10 Nov 2026 13:56:05 GMT |

The last column is from HEAD requests made at about 16:17–16:18 UTC, after the run, without re-downloading. Sizes matched the retained bytes for all eight; that is consistent with, but does not prove, version identity. `games.csv` was republished by the provider around 16:17 (an earlier HEAD showed 15:36:28 GMT). Original publication times of the underlying statistics are unknown.

## 4. Method, exactly

- **Scoring**: `tiber-generic-full-ppr-v1` (section 5).
- **Recorded game**: one row in the current-format weekly file for that player, season and REG week. A row whose scoring components are all zero is a game worth 0. A missing row is not a game and is never turned into a zero.
- **Prior `P`**: prior-season REG profile points ÷ prior-season recorded games.
- **Current `S`, `n`**: target-season REG profile points per recorded game, and the game count, over weeks ≤ N.
- **Blend row**: has a target-week row, has `P`, and `n ≥ 1`.
- **Objective**: minimise Σ aᵢ·(Yᵢ − forecastᵢ)², aᵢ = 1/n_p, where n_p is the number of training rows at the player's position (pooled over both seasons and all origin weeks).
- **Search**: exhaustive argmin over `numpy.linspace(0.25, 30, 1191)` (step 0.025).
- **Result**: `k = 2.5500000000000003` (grid value 2.55). Training rows: 8501 (4257 in 2022, 4244 in 2023; QB 975, RB 2203, WR 3538, TE 1785). Objective at `k`: 163.868407. Neighbouring grid values are in `inspection/fit.json`.
- **Per-week alpha** (comparison arm only): for each origin week, the accepted closed form applied to that week's 2022–2023 blend rows. Values in `inspection/fit.json`.
- **Fallbacks**: prior but no current games → `P`. No prior but current games → `S`. Neither → unavailable.
- **"Relevant" rows**: blend rows with max(`P`, `S`) ≥ 8. Both are known at the cutoff.

## 5. Scoring reconciliation

The original run's points match `tiber-generic-full-ppr-v1` on all 32415 scored rows: the largest difference from an integer-cents recomputation with the preserved `COMPONENT_WEIGHTS` is 7.1e-15 points. Interceptions come from `passing_interceptions`. No component cell was null or non-integer. **No scoring-corrected replay was needed, so none was run.**

The provider's own `fantasy_points_ppr` was never used for modelling. It differs from the profile on 1747 rows (5.4%); every difference is accounted for by lost fumbles, two-point conversions and special-teams touchdowns, which the profile excludes. Detail: `inspection/scoring.json`.

## 6. Population and coverage

**Every result below is on players who appeared in the target game.** The accepted protocol instead freezes a roster population at the cutoff and keeps later nonparticipants. No roster source was used here, no historical roster membership was reconstructed, and no missing row was scored as a zero. Players who were rostered but did not play are simply absent, which makes these errors smaller and coverage higher than a roster-population study would show.

| Season | Blend rows: n / MAE | Prior-only rows (no current games): n / MAE | Missing-prior fallback rows: n / MAE | Unavailable rows | Target rows (denominator) | Forecast available |
|---|---:|---:|---:|---:|---:|---:|
| 2022 (fit) | 4257 / 4.725 | 173 / 4.064 | 943 / 3.890 | 94 | 5467 | 5373 (98.3%) |
| 2023 (fit) | 4244 / 4.545 | 151 / 3.649 | 980 / 4.322 | 87 | 5462 | 5375 (98.4%) |
| 2024 | 4352 / 4.682 | 148 / 3.453 | 923 / 3.711 | 102 | 5525 | 5423 (98.2%) |
| 2025 | 4357 / 4.533 | 159 / 4.011 | 1070 / 3.965 | 96 | 5682 | 5586 (98.3%) |
| 2026, targets wk 2–9 | 2122 / 4.586 | 138 / 3.362 | 358 / 3.528 | 64 | 2682 | 2618 (97.6%) |

Denominator: QB/RB/WR/TE player-game rows in the target-week file, summed over origin weeks. MAE in this table is pooled (row-weighted). The fallback rows have no prior-only comparator.

## 7. Any-week results

Per-player rows: `inspection/predictions_and_outcomes.csv.gz` (24,818 rows: every target row 2022–2026 with features, outcome and all four predictions). Per-week: `inspection/week_summary.csv`. Everything else: `inspection/metrics.json`.

### All blend rows

| Season | Rows | Model | Pooled MAE | Pooled RMSE | Macro MAE | Macro RMSE | QB MAE (n) | RB MAE (n) | WR MAE (n) | TE MAE (n) |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2022 (fit) | 4257 | Prior only | 5.080 | 6.783 | 5.189 | 6.825 | 6.337 (488) | 5.501 (1099) | 5.121 (1774) | 3.798 (896) |
| 2022 (fit) | 4257 | Current season only | 4.925 | 6.767 | 5.011 | 6.791 | 6.033 (488) | 5.094 (1099) | 5.049 (1774) | 3.868 (896) |
| 2022 (fit) | 4257 | Per-week alpha | 4.719 | 6.403 | 4.789 | 6.422 | 5.695 (488) | 4.961 (1099) | 4.830 (1774) | 3.670 (896) |
| 2022 (fit) | 4257 | **Blend (k = 2.55)** | 4.725 | 6.414 | 4.800 | 6.436 | 5.723 (488) | 4.966 (1099) | 4.827 (1774) | 3.685 (896) |
| 2023 (fit) | 4244 | Prior only | 5.134 | 6.856 | 5.322 | 6.961 | 6.906 (487) | 5.377 (1104) | 5.121 (1764) | 3.886 (889) |
| 2023 (fit) | 4244 | Current season only | 4.610 | 6.473 | 4.740 | 6.516 | 5.981 (487) | 4.602 (1104) | 4.711 (1764) | 3.667 (889) |
| 2023 (fit) | 4244 | Per-week alpha | 4.530 | 6.181 | 4.659 | 6.224 | 5.885 (487) | 4.557 (1104) | 4.622 (1764) | 3.572 (889) |
| 2023 (fit) | 4244 | **Blend (k = 2.55)** | 4.545 | 6.203 | 4.694 | 6.258 | 6.021 (487) | 4.581 (1104) | 4.609 (1764) | 3.565 (889) |
| 2024 | 4352 | Prior only | 5.205 | 7.109 | 5.442 | 7.257 | 7.442 (497) | 5.029 (1136) | 5.391 (1765) | 3.905 (954) |
| 2024 | 4352 | Current season only | 4.738 | 6.669 | 4.917 | 6.764 | 6.313 (497) | 4.774 (1136) | 4.778 (1765) | 3.801 (954) |
| 2024 | 4352 | Per-week alpha | 4.690 | 6.473 | 4.884 | 6.581 | 6.428 (497) | 4.649 (1136) | 4.766 (1765) | 3.694 (954) |
| 2024 | 4352 | **Blend (k = 2.55)** | 4.682 | 6.447 | 4.883 | 6.557 | 6.453 (497) | 4.665 (1136) | 4.740 (1765) | 3.673 (954) |
| 2025 | 4357 | Prior only | 5.044 | 6.854 | 5.342 | 7.091 | 7.336 (492) | 5.136 (1095) | 4.963 (1795) | 3.932 (975) |
| 2025 | 4357 | Current season only | 4.617 | 6.574 | 4.879 | 6.776 | 6.784 (492) | 4.444 (1095) | 4.670 (1795) | 3.619 (975) |
| 2025 | 4357 | Per-week alpha | 4.558 | 6.333 | 4.809 | 6.527 | 6.578 (492) | 4.547 (1095) | 4.551 (1795) | 3.562 (975) |
| 2025 | 4357 | **Blend (k = 2.55)** | 4.533 | 6.314 | 4.804 | 6.521 | 6.665 (492) | 4.501 (1095) | 4.508 (1795) | 3.541 (975) |
| 2026, targets wk 2–9 | 2122 | Prior only | 4.755 | 6.498 | 5.020 | 6.669 | 6.660 (235) | 4.818 (540) | 4.636 (869) | 3.965 (478) |
| 2026, targets wk 2–9 | 2122 | Current season only | 4.987 | 7.017 | 5.268 | 7.232 | 6.906 (235) | 4.927 (540) | 4.815 (869) | 4.424 (478) |
| 2026, targets wk 2–9 | 2122 | Per-week alpha | 4.579 | 6.287 | 4.834 | 6.462 | 6.343 (235) | 4.554 (540) | 4.433 (869) | 4.004 (478) |
| 2026, targets wk 2–9 | 2122 | **Blend (k = 2.55)** | 4.586 | 6.294 | 4.842 | 6.467 | 6.346 (235) | 4.565 (540) | 4.433 (869) | 4.023 (478) |

### Relevant blend rows (max(P, S) ≥ 8)

| Season | Rows | Model | Pooled MAE | Pooled RMSE | Macro MAE | Macro RMSE | QB MAE (n) | RB MAE (n) | WR MAE (n) | TE MAE (n) |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2022 (fit) | 2521 | Prior only | 6.219 | 7.804 | 6.108 | 7.659 | 6.412 (465) | 6.710 (663) | 6.161 (1062) | 5.149 (331) |
| 2022 (fit) | 2521 | Current season only | 6.106 | 7.854 | 6.018 | 7.733 | 6.138 (465) | 6.328 (663) | 6.160 (1062) | 5.444 (331) |
| 2022 (fit) | 2521 | Per-week alpha | 5.794 | 7.369 | 5.697 | 7.250 | 5.782 (465) | 6.105 (663) | 5.830 (1062) | 5.072 (331) |
| 2022 (fit) | 2521 | **Blend (k = 2.55)** | 5.810 | 7.392 | 5.715 | 7.277 | 5.799 (465) | 6.110 (663) | 5.848 (1062) | 5.105 (331) |
| 2023 (fit) | 2480 | Prior only | 6.408 | 8.123 | 6.333 | 7.994 | 7.022 (448) | 6.599 (720) | 6.307 (1003) | 5.404 (309) |
| 2023 (fit) | 2480 | Current season only | 5.888 | 7.709 | 5.822 | 7.578 | 6.050 (448) | 5.587 (720) | 6.152 (1003) | 5.499 (309) |
| 2023 (fit) | 2480 | Per-week alpha | 5.706 | 7.311 | 5.645 | 7.199 | 5.962 (448) | 5.503 (720) | 5.884 (1003) | 5.231 (309) |
| 2023 (fit) | 2480 | **Blend (k = 2.55)** | 5.746 | 7.355 | 5.686 | 7.243 | 6.097 (448) | 5.540 (720) | 5.904 (1003) | 5.203 (309) |
| 2024 | 2426 | Prior only | 6.659 | 8.431 | 6.540 | 8.263 | 7.462 (458) | 6.391 (647) | 6.801 (1025) | 5.505 (296) |
| 2024 | 2426 | Current season only | 6.077 | 7.890 | 6.024 | 7.791 | 6.309 (458) | 6.014 (647) | 6.141 (1025) | 5.633 (296) |
| 2024 | 2426 | Per-week alpha | 5.977 | 7.615 | 5.907 | 7.506 | 6.430 (458) | 5.825 (647) | 6.062 (1025) | 5.313 (296) |
| 2024 | 2426 | **Blend (k = 2.55)** | 5.973 | 7.590 | 5.904 | 7.481 | 6.447 (458) | 5.865 (647) | 6.033 (1025) | 5.273 (296) |
| 2025 | 2423 | Prior only | 6.626 | 8.271 | 6.609 | 8.258 | 7.389 (466) | 6.798 (606) | 6.490 (972) | 5.758 (379) |
| 2025 | 2423 | Current season only | 6.060 | 7.887 | 6.035 | 7.857 | 6.835 (466) | 5.949 (606) | 6.052 (972) | 5.304 (379) |
| 2025 | 2423 | Per-week alpha | 5.957 | 7.567 | 5.943 | 7.551 | 6.620 (466) | 6.041 (606) | 5.862 (972) | 5.249 (379) |
| 2025 | 2423 | **Blend (k = 2.55)** | 5.924 | 7.551 | 5.921 | 7.543 | 6.696 (466) | 5.961 (606) | 5.804 (972) | 5.221 (379) |
| 2026, targets wk 2–9 | 1160 | Prior only | 6.133 | 7.735 | 6.129 | 7.674 | 6.796 (228) | 6.392 (282) | 6.037 (433) | 5.290 (217) |
| 2026, targets wk 2–9 | 1160 | Current season only | 6.656 | 8.499 | 6.653 | 8.451 | 7.026 (228) | 6.725 (282) | 6.628 (433) | 6.235 (217) |
| 2026, targets wk 2–9 | 1160 | Per-week alpha | 5.946 | 7.478 | 5.950 | 7.425 | 6.466 (228) | 6.046 (282) | 5.876 (433) | 5.410 (217) |
| 2026, targets wk 2–9 | 1160 | **Blend (k = 2.55)** | 5.972 | 7.496 | 5.978 | 7.443 | 6.466 (228) | 6.067 (282) | 5.892 (433) | 5.487 (217) |

### Paired comparisons on identical members

Negative means the blend has lower error. Intervals are a player-cluster bootstrap within position (2,000 resamples, fixed seed). They were computed after the results had been seen and are descriptive.

All blend rows:

| Season | Rows | Blend − prior-only, macro MAE (95% interval) | Blend − current-only, macro MAE (95% interval) | Rows where blend is closer than prior-only |
|---|---:|---:|---:|---:|
| 2022 (fit) | 4257 | -0.389 (-0.534 to -0.253) | -0.211 (-0.268 to -0.153) | 56.6% |
| 2023 (fit) | 4244 | -0.628 (-0.847 to -0.447) | -0.046 (-0.134 to +0.047) | 59.1% |
| 2024 | 4352 | -0.559 (-0.769 to -0.385) | -0.034 (-0.108 to +0.053) | 57.9% |
| 2025 | 4357 | -0.538 (-0.677 to -0.403) | -0.076 (-0.149 to +0.008) | 58.8% |
| 2026, targets wk 2–9 | 2122 | -0.178 (-0.324 to -0.050) | -0.427 (-0.551 to -0.303) | 53.4% |

Relevant blend rows:

| Season | Rows | Blend − prior-only, macro MAE (95% interval) | Blend − current-only, macro MAE (95% interval) | Rows where blend is closer than prior-only |
|---|---:|---:|---:|---:|
| 2022 (fit) | 2521 | -0.393 (-0.565 to -0.227) | -0.302 (-0.387 to -0.226) | 55.4% |
| 2023 (fit) | 2480 | -0.647 (-0.911 to -0.425) | -0.136 (-0.241 to -0.023) | 57.2% |
| 2024 | 2426 | -0.636 (-0.902 to -0.412) | -0.120 (-0.225 to -0.014) | 58.3% |
| 2025 | 2423 | -0.688 (-0.907 to -0.494) | -0.114 (-0.212 to -0.007) | 59.9% |
| 2026, targets wk 2–9 | 1160 | -0.151 (-0.351 to +0.037) | -0.675 (-0.845 to -0.509) | 51.2% |

What these show, on this population:

- The blend has lower error than prior-only in every season. The gap is about half a point in 2024 and 2025 and smaller in 2026 so far; on relevant 2026 rows the interval includes zero.
- Against the current-season average alone, the blend's advantage in 2024 and 2025 is small and its interval includes zero on all blend rows. It is clear in 2026 so far, where only early-season origins exist.
- 2026, TE: the blend's MAE is higher than prior-only (4.023 vs 3.965 on all blend rows). This is preserved, not tuned.

## 8. Week 2 diagnostic (separate from the candidate)

Origin Week 1 → target Week 2, on this population, with `alpha = 0.2043` from 2022–2023 origin-1 blend rows.

| Season | Rows | Model | Macro MAE | Macro RMSE | QB MAE (n) | RB MAE (n) | WR MAE (n) | TE MAE (n) |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| 2022 (fit) | 253 | C0 prior only | 5.807 | 7.327 | 7.879 (32) | 5.173 (65) | 6.326 (106) | 3.849 (50) |
| 2022 (fit) | 253 | C1 Week 1 only | 6.539 | 8.620 | 8.596 (32) | 6.125 (65) | 6.749 (106) | 4.686 (50) |
| 2022 (fit) | 253 | C2 prior + alpha·(W − P) | 5.672 | 7.188 | 7.654 (32) | 5.058 (65) | 6.177 (106) | 3.801 (50) |
| 2023 (fit) | 245 | C0 prior only | 5.103 | 6.560 | 5.801 (30) | 5.910 (62) | 5.252 (103) | 3.450 (50) |
| 2023 (fit) | 245 | C1 Week 1 only | 6.364 | 8.423 | 8.952 (30) | 5.927 (62) | 6.645 (103) | 3.930 (50) |
| 2023 (fit) | 245 | C2 prior + alpha·(W − P) | 5.030 | 6.475 | 5.977 (30) | 5.619 (62) | 5.225 (103) | 3.299 (50) |
| 2024 | 247 | C0 prior only | 4.855 | 6.290 | 6.136 (30) | 3.743 (67) | 5.651 (105) | 3.888 (45) |
| 2024 | 247 | C1 Week 1 only | 5.351 | 7.513 | 6.706 (30) | 4.760 (67) | 5.512 (105) | 4.427 (45) |
| 2024 | 247 | C2 prior + alpha·(W − P) | 4.662 | 6.082 | 5.803 (30) | 3.698 (67) | 5.378 (105) | 3.768 (45) |
| 2025 | 255 | C0 prior only | 5.121 | 6.497 | 6.555 (29) | 5.041 (65) | 4.808 (110) | 4.081 (51) |
| 2025 | 255 | C1 Week 1 only | 6.272 | 8.303 | 10.399 (29) | 4.437 (65) | 6.435 (110) | 3.818 (51) |
| 2025 | 255 | C2 prior + alpha·(W − P) | 5.022 | 6.456 | 6.847 (29) | 4.683 (65) | 4.748 (110) | 3.809 (51) |
| 2026, targets wk 2–9 | 269 | C0 prior only | 5.330 | 6.808 | 7.642 (32) | 4.135 (64) | 5.145 (115) | 4.397 (58) |
| 2026, targets wk 2–9 | 269 | C1 Week 1 only | 6.616 | 9.083 | 8.867 (32) | 5.889 (64) | 5.924 (115) | 5.783 (58) |
| 2026, targets wk 2–9 | 269 | C2 prior + alpha·(W − P) | 5.266 | 6.744 | 7.552 (32) | 4.126 (64) | 4.907 (115) | 4.479 (58) |

This is not the governed study: population, evidence class, label staging and arithmetic all differ from the accepted protocol (section 1).

## 9. Gate assessment

Rule (spec section 8): lower macro MAE, no higher macro RMSE and no position's MAE worse than prior-only, in both 2024 and 2025, **alongside** evidence and sample-sufficiency requirements.

Arithmetic conditions, as computed on this population:

| Candidate | Season | Macro MAE lower | Macro RMSE not higher | Positions worse than prior-only | ≥20 rows every position (min) | Arithmetic conditions met on this population |
|---|---|---|---|---|---|---|
| Any-week blend, all blend rows | 2024 | yes | yes | none | yes (497) | yes |
| Any-week blend, all blend rows | 2025 | yes | yes | none | yes (492) | yes |
| Any-week blend, all blend rows | 2026 so far | yes | yes | TE | yes (235) | no |
| Any-week blend, relevant rows | 2024 | yes | yes | none | yes (296) | yes |
| Any-week blend, relevant rows | 2025 | yes | yes | none | yes (379) | yes |
| Any-week blend, relevant rows | 2026 so far | yes | yes | TE | yes (217) | no |
| Week 2 C2 (separate diagnostic) | 2024 | yes | yes | none | yes (30) | yes |
| Week 2 C2 (separate diagnostic) | 2025 | yes | yes | QB | yes (29) | no |
| Week 2 C2 (separate diagnostic) | 2026 so far | yes | yes | TE | yes (32) | no |

Requirements that were not assessed, or are not comparable:

| Requirement | Status here |
|---|---|
| ≥95% label resolution of the pre-label cohort | **Not comparable.** The population is defined by having a target-week row, so resolution is 100% by construction. |
| Frozen cutoff-time roster population with nonparticipants | **Not met.** No roster source. |
| Source admission / historical-purpose authority | **Not met.** |
| Point-in-time evidence class | **Not met.** One later snapshot; at best unqualified `retrospective_reconstruction`. |
| Labels sealed before fit; staged opening of 2024 then 2025 | **Not met.** All seasons were read together. |
| Completion/finality, canonical identity, cutoff position/team | Not assessed. |

**Disposition: the governed study remains inconclusive.** The arithmetic above is descriptive shadow evidence. It selects nothing: not the blend, not C2, and **not prior-only**. A failed evidence or population requirement does not establish an approved prior-only result.

## 10. Hodge sensitivity

Full detail and the proposed disposition are in the [separate proposal](target-2025-hodge-prior-unavailable-proposal-2026-11-10.md). In short, on this population his 2025 prior changes the any-week 2025 blend macro MAE by 0.000070 between denominators of 10 and 11, and he is not in the Week 2 diagnostic cohort at all. **This PR selects neither 10 nor 11.** The original run used the current-format file as retrieved, which contains 11 rows for him; that was a data default, not a decision.

## 11. Week 10 freeze

- Delivered file: `original/as-run-r1/shadow_week10_forecast.csv`, SHA-256 `b815e1be4e296c4ed1e1317687ff21e1c615297a54caae4749fc7bee7ab6b874`, generated 2026-11-10T15:59:21Z, from inputs whose last retrieval was 15:58:07 UTC. Copied into the evidence folder at 16:13 UTC. First Week 10 kickoff in the retained schedule: 2026-11-12 20:15 ET.
- Rows: 384 blended, 100 current-season-average only, 75 on bye with no forecast (CHI, DEN, PHI, TB); 559 total.
- Earlier version (r0): never delivered; its bytes were overwritten. A reconstruction generated at 16:14 UTC is retained under `original/r0-reconstructed/`. It differs from r1 on the 100 missing-prior rows only.
- **No corrected version exists.** Nothing in this PR changed the delivered file, and the sources were not refreshed.

Limitations of the Week 10 file:

- Shadow candidate; no consumer admission.
- No injury or availability modelling.
- Production-history population with incomplete roster coverage: only players with a 2026 REG row through Week 9. A player with a 2025 prior and no 2026 game has no row.
- Current-season-average fallback for the 100 players without a 2025 prior; that fallback was chosen after seeing historical results.
- Generic scoring `tiber-generic-full-ppr-v1`: receptions + 0.1·receiving yards + 6·receiving TDs + 0.1·rushing yards + 6·rushing TDs + 0.04·passing yards + 4·passing TDs − 2·interceptions. No fumbles, two-point conversions or bonuses.
- Team and opponent come from each player's most recent 2026 row and the retained schedule.

Because it was frozen before kickoff, this file is the only genuinely prospective evidence in the PR. It already carries the two comparators (`prior_ppg_2025`, `ppg_2026_thru_wk9`).

## 12. Claims from the session: confirmed, narrowed, withdrawn

| Claim as first reported | Status |
|---|---|
| Macro MAE table for 2024, 2025 and 2026 weeks 2–9 (prior-only / current-only / blend) | **Confirmed**: byte-identical reproduction. |
| `k` ≈ 2.5 games, fit on 2022–2023 | **Confirmed**: `k = 2.55` exactly; procedure in section 4. |
| Week 10 file: 484 forecasts, 75 byes | **Confirmed**: 384 + 100 + 75. |
| Points are the eight-component generic PPR | **Confirmed** equal to `tiber-generic-full-ppr-v1`. |
| "The blend beats the current-season average" | **Narrowed**: in 2024 and 2025 the paired gap is small and its interval includes zero on all blend rows. |
| "Passes the gate on 2024 and 2025" | **Narrowed**: the three arithmetic conditions hold on this population. The gate's evidence and population requirements are not met, so no gate was passed. |
| "The Week 2 design fails its own gate on 2025, so prior-only would have been selected" | **Withdrawn** as a governed statement. What remains: on this population C2's QB MAE in 2025 is higher than C0's. That selects nothing. |
| "218 of 589 players differ between formats" | **Narrowed**: 218 of the 590 players in the union of the two files (589 current, 559 legacy). |
| "Hodge's extra rows are zero-offense special-teams appearances" | **Confirmed** for the five rows present only in the current-format file (section 2 of the proposal). |
| "That points to row-inclusion rules, not a late stat correction" | **Narrowed and kept as inference.** It concerns legacy-format 6 vs current-format 11. It says nothing established about the frozen June 10 vs later 11. |
| "The blocker is immaterial" / "effect on the evaluation: none" | **Narrowed**: negligible on the appeared-in-game population. Not established for the protocol's roster population. It does not clear the blocker. |
| Recommendation to "record 11 games" | **Withdrawn.** Replaced by the proposal to mark his prior unavailable. |

## 13. Remaining evidence gaps

1. No frozen cutoff-time roster population for any season; nonparticipants are absent.
2. No point-in-time evidence: one snapshot retrieved in November 2026 stands in for every historical cutoff.
3. No source or purpose admission for any input.
4. Labels were not staged; 2024–2026 outcomes were visible throughout, and the fallback rule was chosen after seeing them.
5. Canonical identity, cutoff-effective team/position and completion/finality were not assessed. Position is taken from each row.
6. The June TIBER artifact behind the 10/10 state was not available to this run.
7. Float arithmetic, not the rational-cents policy; no TypeScript implementation; none of the accepted validators were run.
8. The provider's row-inclusion rules for either file format were not established from provider documentation.

## 14. Reproduction

```bash
python3 -m pip install -r docs/reports/evidence/any-week-shadow-2026-11-10/requirements.txt   # pandas 3.0.5, numpy 2.5.3; Python 3.13
bash docs/reports/evidence/any-week-shadow-2026-11-10/reproduce.sh
```

The script verifies input hashes, re-runs r1 and r0 and compares their outputs byte for byte with the retained files, then re-runs the inspection addendum and checks its outputs against `inspection/OUTPUTS.sha256`. It needs no network and writes only to a temp directory. Byte identity was observed with the versions above; other pandas/numpy versions may format floats differently.

## 15. One bounded recommended next step

After Week 10 completes (final game 2026-11-16), authorise **one** scoring pass of the frozen Week 10 file, unchanged, against that week's outcomes: same profile, the three forecasts already in the file, pooled and macro MAE/RMSE per position, with the rule written down before the outcomes exist. That is the first evidence for this candidate that cannot have been shaped by hindsight. It needs no decision on Hodge, no new source class beyond the next weekly file, and no change to anything frozen.
