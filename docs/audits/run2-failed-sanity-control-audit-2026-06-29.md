# Run 2 failed-sanity-control audit

_Audit date: 2026-06-29 • Investigation only — no fix, no tuning, no rerun, no feature/data/null-handling change._

This audit investigates **why the controlled Run 2 experiment failed its sanity control**: why adding governed Teamstate values worsened the Run 1 baseline, and why the shuffled-Teamstate control marginally beat real Teamstate. It uses the committed outcome record
[`docs/reports/run2-teamstate-comparison-outcome-2026-06-29.md`](../reports/run2-teamstate-comparison-outcome-2026-06-29.md) (from #88) and read-only inspection of the live #86 `runRun2TeamstateComparison(...)` / `bindRun2GovernedTeamstateValues(...)` outputs on the same committed governed binding fixture. It changes no code.

**Bottom line up front:** `failed_sanity_control` stands. **No Teamstate signal claim is supported by this result** (and none is made). The result is best explained by *sparse coverage and imputation dominance at fixture scale* (only 18% of the added Teamstate cells were real governed values; only 3 of 32 NFL teams were covered), compounded by team-level features applied bluntly at player-season grain. There is **no evidence of a join/team-code bug**. The recommended next step is **`expand_coverage_before_rerun`** — a fuller governed Teamstate source (more teams) is a prerequisite before any rerun or any signal claim.

---

## 1. Outcome recap (from #88)

Directionality: **positive MAE delta = worse** (higher error); negative = improvement.

| Arm | MAE | RMSE | Pearson | Rank corr | n |
| --- | --- | --- | --- | --- | --- |
| Run 1 baseline | 35.1477 | 43.6404 | 0.7286 | 0.7057 | 38 |
| Real governed Teamstate Run 2 | 38.5329 | 47.3157 | 0.6780 | 0.6790 | 38 |
| Shuffled-Teamstate control | 38.5035 | 47.3062 | 0.6783 | 0.6790 | 38 |

| Delta | MAE Δ | Direction |
| --- | --- | --- |
| Real − Run 1 | +3.385228 | worse |
| Shuffled − Run 1 | +3.355853 | worse |
| Real − Shuffled | +0.029375 | real slightly worse than shuffled |

- `signal_interpretation`: **`failed_sanity_control`**
- Operator decision (from #88): `inspect_join_or_leakage_before_next_run`

Both arms that added Teamstate columns (real and shuffled) **worsened** every headline metric vs Run 1 (MAE and RMSE up; Pearson and rank correlation down). The shuffled control was marginally *better* than real, which is what trips the sanity control.

## 2. Coverage audit (scored-row grain)

| Quantity | Value |
| --- | --- |
| Total observations | 39 |
| Scored rows (usable 2025 actual) | 38 |
| Unscored rows | 1 |
| Scored rows with matched governed Teamstate values | 8 |
| Scored rows unmatched / null-preserved | 30 |
| Matched share of scored rows | 8 / 38 ≈ **21.1%** |
| Unmatched share of scored rows | 30 / 38 ≈ **78.9%** |

(Observation-scoped, the report's coverage counts are 8 matched / 31 unmatched of 39; the one extra unmatched row is the single unscored observation.)

Row-level coverage **is** available via the bound report's `bound_rows` (each carries `team_2024` and `teamstate_binding_matched`). The 8 matched scored players are:

| Team | Player | Position |
| --- | --- | --- |
| BAL | Lamar Jackson | QB |
| BAL | Derrick Henry | RB |
| PHI | Jalen Hurts | QB |
| PHI | Saquon Barkley | RB |
| PHI | A.J. Brown | WR |
| CIN | Joe Burrow | QB |
| CIN | Chase Brown | RB |
| CIN | Ja'Marr Chase | WR |

Every other scored player is unmatched. **Coverage is extremely sparse: only 3 of 32 NFL teams** (BAL, CIN, PHI) carry governed Teamstate values in the committed fixture, so ~79% of scored rows contributed no real Teamstate information.

## 3. Position impact audit (by-position MAE)

| Position | Run 1 | Real Run 2 | Shuffled | Real − Run 1 | n |
| --- | --- | --- | --- | --- | --- |
| QB | 26.69 | 34.24 | 34.08 | **+7.55 (worst)** | 8 |
| RB | 39.79 | 45.18 | 45.22 | +5.39 | 10 |
| WR | 43.88 | 44.90 | 44.89 | +1.02 | 14 |
| TE | 18.30 | 18.32 | 18.33 | +0.02 | 6 |

Confirmed from the report (not assumed): **QB worsened most** (+7.55 MAE), then **RB** (+5.39); WR moved a little; TE was essentially unchanged. This tracks the matched set — the matched players are 3 QBs, 3 RBs, 2 WRs, and **0 TEs**, so the position with no matched players (TE) barely moved while QB/RB (where matches concentrated and where the added columns most perturbed the fit) worsened most. Note that *every* position drifts slightly even with few/no matches, because adding three columns re-fits the whole ridge across all 38 rows.

## 4. Team / join audit

Join path: Forecast player `team_2024` → Teamstate `teamCode`, at input season 2024, against the governed team-season aggregate (`bindRun2GovernedTeamstateValues` matched 8 rows; the shuffled arm permuted the same 3 team groups).

- **Teams with governed Teamstate values attached:** BAL, CIN, PHI (3 teams).
- **Scored players on those teams:** the 8 listed in §2 — all matched correctly.
- **Team-code normalization:** correct. BAL/CIN/PHI matched exactly; there is no evidence of a casing/alias mismatch, and no scored player on a covered team failed to match.
- **Why the rest didn't match:** not a bug — the fixture's `teamWeekValues` simply only covers 3 teams. Unmatched players belong to the other 29 teams, which have no governed values in this fixture. No retired/FA/trade edge case was needed to explain any miss at this scale.

Row-level join detail was sufficient here (via `bound_rows`), so no additional join diagnostic is required to reach this conclusion. The **"broken join" hypothesis is not supported** — the failure is coverage sparsity, not join logic.

## 5. Null / imputation impact audit

Added Teamstate columns: `epaPerPlay`, `successRate`, `redZoneTdRate` (3 columns × 38 scored rows = **114 Teamstate cells**).

| Cell type | Count | Share |
| --- | --- | --- |
| Real governed (non-null) values | 21 | **18.4%** |
| Null → imputed (train-fold mean) | 93 | **81.6%** |

(The shuffled arm imputed 92 cells — one fewer, because permuting the team groups moves PHI's all-null `redZoneTdRate` group onto a different team.)

- **Null/imputed cells dominate the added feature matrix (≈82%).** Only the 8 matched rows carried any real values, and even among those, PHI's `redZoneTdRate` is null (all-null partial column for that team), so real coverage is thinner still.
- With ~82% of each Teamstate column set to the training-fold mean, **those columns behaved largely like near-constant, low-information inputs** — they add coefficients/variance for the ridge to fit in LOOCV without supplying signal for most rows, which plausibly explains the across-the-board worsening.
- The documented fully-null-column neutral fallback did **not** materially drive this: in LOOCV the training fold for the matched teams always retains other matched rows, so per-column means exist and the `0` fully-null fallback was not the operative path. (Null handling is **not** changed here; this is audit only.)

## 6. Shuffled-control audit

- Shuffled worsened vs Run 1 (+3.356 MAE); real worsened vs Run 1 (+3.385 MAE); **shuffled marginally beat real** (real − shuffled = +0.029375 MAE, ≈0.08% of the ~38 MAE scale).
- **Is the real-vs-shuffled gap fixture-scale variance?** Almost certainly yes. The shuffle only permutes 8 matched rows' values among 3 teams, so real and shuffled differ on a handful of rows; by-position the two arms are nearly identical (QB 34.24 vs 34.08, RB 45.18 vs 45.22, WR 44.90 vs 44.89, TE 18.32 vs 18.33). A gap this small on 38 rows is comfortably within noise.
- **Does shuffled beating real indicate a problem?** It indicates the experiment carries **no detectable Teamstate signal** above a destroyed-signal control at this coverage/scale — exactly what the sanity control exists to catch. It does not, by itself, prove a join/model bug (and §4 found none); it correctly flags that any "improvement" attribution would be spurious.
- **Does this block a Teamstate signal claim? Yes.** `failed_sanity_control` blocks any claim that Teamstate helped. It is treated here as a warning, not a harmless result.
- **What would need to be true before another signal claim?** Real Teamstate would need to (a) cover materially more of the population (more teams/rows), and (b) beat both Run 1 **and** the shuffled control by a margin that exceeds fixture-scale variance, under the same unchanged setup.

## 7. Feature-shape audit

The three added columns are **team-level offensive-environment** features (`epaPerPlay`, `successRate`, `redZoneTdRate`) applied at **player-season grain**. Direct evidence of bluntness from the matched rows: every player on a team receives the **identical** Teamstate vector — e.g. BAL's Lamar Jackson (QB) and Derrick Henry (RB) both get `epaPerPlay=0.15, successRate=0.45, redZoneTdRate=0.6`; all CIN matched players get `0.20 / 0.50 / 0.50`.

- These are **team aggregates broadcast equally to every player on the team**, so they cannot distinguish players within a team and add the same shift to a QB, RB, and WR alike.
- They likely **affect positions differently** only via the model's position one-hot interaction with the shared column — not via any player-specific Teamstate information, of which there is none here.
- Plausibly such team-environment features would only help **in combination with role/usage interaction features** (e.g. team pass rate × player target share) that localize the team signal to a player — which this experiment intentionally does **not** add.

(No new features are proposed or added — assessment only.)

## 8. Hypothesis ranking

1. **Null/imputation dominates the added columns.** Evidence: 93/114 (82%) of Teamstate cells imputed; columns act as near-constant low-information inputs that add variance in LOOCV. **Confidence: high.** Follow-up: only meaningful to re-evaluate once real coverage is high.
2. **Coverage too sparse.** Evidence: only 3/32 teams and 8/38 scored rows matched. **Confidence: high.** Follow-up: expand governed Teamstate coverage (more teams) before any rerun.
3. **Team-level features too blunt at player grain.** Evidence: identical Teamstate vectors for all players on a team (Lamar/Henry; CIN trio). **Confidence: medium.** Follow-up: consider role/usage interaction shaping — but only after coverage is real; premature now.
4. **Fixture-scale variance (real vs shuffled).** Evidence: real−shuffled MAE gap = 0.029 on 38 rows; near-identical by-position. **Confidence: high** that the real-vs-shuffled ordering is noise. Follow-up: larger population/more seasons would shrink variance.
5. **Join/coverage bug.** Evidence: row-level join inspected; BAL/CIN/PHI matched correctly, no team-code mismatch. **Confidence: low** that a bug exists. Follow-up: none needed beyond this audit unless coverage expansion later exposes mismatches.
6. **True no-signal result in this setup.** Evidence: both added arms worsened all metrics; control not beaten by real. **Confidence: medium**, but **cannot be separated from sparse-coverage/imputation at this scale** — so it must not be read as "Teamstate has no signal in general."

## 9. Next-step recommendation

**`expand_coverage_before_rerun`.**

Rationale: the dominant, well-evidenced causes are sparse coverage (3/32 teams, 8/38 rows) and imputation dominance (≈82% of Teamstate cells imputed), not a join or model bug (row-level join was inspected and is clean). More seasons would not fix within-season 3-team coverage, and feature-shape redesign is premature until the added columns are actually populated for most of the population. The narrow prerequisite before any rerun or any signal claim is a **fuller governed Teamstate source covering materially more teams/rows** (an upstream concern; **no TIBER-Teamstate or TIBER-Data change is made here**). Once coverage is real, the **unchanged** #86 three-arm comparison can be rerun and re-audited; only if real then beats both Run 1 and the shuffled control beyond fixture-scale variance should a cautious `possible_teamstate_signal` reading even be considered.

Until then: **no Teamstate signal claim is supported**, `failed_sanity_control` stands as a blocking warning, and the Teamstate Run 2 path should not advance to features/tuning/promotion.

---

_Guardrails honored: no model tuning, no hyperparameter search, no Run 1/Run 2 feature-set change, no rerun with altered setup, no new Teamstate features, no null-handling change, no TIBER-Data/TIBER-Teamstate changes, no production promotion, and no fantasy/product/ranking/advice output. This audit makes no claim that Teamstate works, and no claim that it does not work in general._
