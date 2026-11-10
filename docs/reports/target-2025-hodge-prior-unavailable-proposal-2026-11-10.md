# Proposed disposition — mark the affected target-2025 prior unavailable (2026-11-10)

Status: **PROPOSAL ONLY. No decision is made here.** This document does not select 10 or 11, does not change `TARGET2025_DENOMINATOR_RECONSTRUCTION_NOT_READY`, and does not reopen the frozen decision. Reopening remains an explicit bounded decision/review step under the restart record (PR #189).

Frozen reference: [target-2025 denominator readiness report](https://github.com/Prometheus-Frameworks/TIBER-Forecast/blob/d93d24681c629a20895b0bde70d9ca2899cecbb8/docs/reports/evidence/year1-week2-bootstrap-2026-09-22/target-2025-denominator-reconstruction-readiness.md).

Companion report: [`any-week-shadow-candidate-2026-11-10.md`](any-week-shadow-candidate-2026-11-10.md). Data: `evidence/any-week-shadow-2026-11-10/inspection/hodge.json`, `format_comparison_2024.json`, `format_week_count_differences_2024.csv`.

## 1. Two different discrepancies

They must not be merged.

| | Frozen blocker | Shadow observation |
|---|---|---|
| What differs | June committed TIBER artifact: 10 games / 10 weeks. Later retained evidence: 11 / 11. | Legacy-format release asset: 6 weeks. Current-format release asset: 11 weeks. |
| Same source format? | As recorded, a change in source state over time | No: two differently built provider files, both retrieved on 2026-11-10 |
| Seen by this run? | **No.** The June artifact and its source bytes were not available. | Yes; both files are retained and hashed |
| Open question | Revision provenance: pre-cutoff recovery, or post-cutoff / later-information dependency | None of governance weight; it is context |

The shadow observation does **not** show what the June artifact contained, which game changed, or why. It does not answer the revision-provenance question.

## 2. What the retained files show for 00-0034854 (2024 REG)

| 2024 week | In legacy-format file | Profile points | Non-zero columns in the current-format row |
|---:|---|---:|---|
| 1 | no | 0.0 | def_tackles_solo=1, penalties=1 |
| 2 | no | 0.0 | def_tackles_solo=1 |
| 3 | no | 0.0 | def_tackle_assists=1 |
| 4 | yes | 0.0 | def_tackles_with_assist=1, fumble_recovery_opp=1, fumble_recovery_tds=1 |
| 5 | yes | 14.7 | def_tackle_assists=1, penalties=1, receiving_tds=1, receiving_yards=67, receptions=2, targets=2 |
| 8 | no | 0.0 | def_tackle_assists=1, def_tackles_for_loss=1, def_tackles_solo=1 |
| 9 | yes | 1.9 | receiving_yards=9, receptions=1, targets=2 |
| 11 | yes | 4.2 | receiving_yards=22, receptions=2, targets=2 |
| 15 | no | 0.0 | def_punt_blocks=1 |
| 17 | yes | 1.9 | receiving_yards=9, receptions=1, targets=4 |
| 18 | yes | 3.4 | receiving_yards=24, receptions=1, targets=2 |

Profile total: 26.1 points (the provider's PPR total is the same; he has no fumbles or two-point conversions). Prior if 10 games: 2.6100. Prior if 11: 2.3727.

Every one of the 11 current-format rows has at least one non-zero stat column. Six of them carry no offensive stat and score 0 (weeks 1, 2, 3, 4, 8, 15); five of those six are absent from the legacy-format file, and week 4 is present in both. Nothing here identifies which row, if any, was missing from the June state. Header observations (HEAD requests, 2026-11-10 ~16:18 UTC): the legacy asset reports Last-Modified 2025-05-06; the current-format 2024 asset reports 2026-08-13. Those are asset timestamps, not evidence of what any TIBER artifact read in June.

## 3. The 218-of-590 comparison

Both files, 2024 REG, positions QB/RB/WR/TE by each file's own position column:

| | Current format | Legacy format |
|---|---:|---:|
| Players | 589 | 559 |
| Player-week rows | 5864 | 5227 |
| Rows only in this file | 642 | 5 |

- Players in the union: 590. Players whose week count differs: **218** (217 with more weeks in the current format, 1 with more in the legacy format; 31 appear only in the current format, 1 only in the legacy format).
- Of the 642 rows found only in the current format, 621 have zero attempts, carries, targets and scoring components; 21 have some offensive stat.
- Per-player list: `format_week_count_differences_2024.csv`.

What "game" means in each, as observed:

- **Current format**: a row exists whenever the file lists the player for that game, including rows with no offensive production (tackles, penalties, returns, blocks).
- **Legacy format**: most such rows are absent. The exact inclusion rule was not established from provider documentation.
- **The shadow run's "recorded game"**: one current-format row.

**Cause: inference, not established.** The two assets appear to apply different row-inclusion rules. No provider statement or changelog was retrieved, and this run did no outreach.

A consequence worth stating plainly: "recorded production games" depends on which provider file format supplies the rows, for roughly a third of players. That is a property of the denominator definition and is separate from the Hodge provenance question.

## 4. Sensitivity

Population and inputs: appeared-in-target-game rows, target season 2025, origin weeks 1–17, current-format files as retained, `k` and `alpha` unchanged.

| Arm | Hodge prior (pts/game) | Week 2 diagnostic 2025: C0 / C2 macro MAE (n) | Hodge in that cohort | Any-week 2025 blend rows: n | Prior-only macro MAE | Blend macro MAE | Served forecasts available / target rows |
|---|---:|---|---|---:|---:|---:|---:|
| `denominator_10` | 2.6100 | 5.121229 / 5.021648 (255) | no | 4357 | 5.341897 | 4.803677 | 5586 / 5682 |
| `denominator_11_as_in_current_file` | 2.3727 | 5.121229 / 5.021648 (255) | no | 4357 | 5.341732 | 4.803607 | 5586 / 5682 |
| `prior_unavailable_row_retained` | unavailable | 5.121229 / 5.021648 (255) | no | 4350 | 5.344078 | 4.806033 | 5586 / 5682 |

His 2025 target rows, and the forecast each arm gives him:

| 2025 target week | His outcome | 2025 games before it | Forecast if 10 | Forecast if 11 | Forecast if prior unavailable (current average) |
|---:|---:|---:|---:|---:|---:|
| 6 | 0.0 | 1 | 1.875 | 1.704 | 0.000 |
| 7 | 0.0 | 2 | 1.463 | 1.330 | 0.000 |
| 8 | 6.1 | 3 | 1.199 | 1.090 | 0.000 |
| 9 | 0.0 | 4 | 1.947 | 1.855 | 1.525 |
| 10 | 0.0 | 5 | 1.689 | 1.609 | 1.220 |
| 11 | 0.0 | 6 | 1.492 | 1.421 | 1.017 |
| 15 | 0.0 | 7 | 1.336 | 1.272 | 0.871 |

- He has no row in 2025 Week 2, so the Week 2 diagnostic is identical in all three arms on this population.
- Between 10 and 11 the any-week 2025 blend macro MAE moves by 0.000070.
- In the unavailable arm his seven rows leave the blend cohort (4357 → 4350) and are served by the current-season fallback; total forecast coverage is unchanged at 5586 of 5682. The blend macro MAE on the remaining rows is not a paired comparison with the other arms.
- If he were added to the Week 2 diagnostic's WR cohort at its present size (110 rows), the largest possible change in macro MAE would be 0.0005. Under the protocol's roster population the cohort differs, so this is illustrative only.

**None of this is a governed result.** It bounds the arithmetic on one population; it does not resolve provenance.

## 5. Proposal

For target 2025 only:

1. Keep his population row.
2. Set his prior `P` to **unavailable**, with a typed reason such as `prior_denominator_revision_provenance_unresolved`, citing the frozen readiness report. Do not substitute 10, 11, zero, or a mean.
3. Consequence under the accepted Week 2 contract: C0 and C2 are unavailable for him; he counts against coverage under each named denominator; C1 stays in its separate diagnostic cohort as already specified.
4. Record the coverage impact wherever coverage is reported: one identity.
5. Leave the denominator question, the external clarification and the frozen decision exactly as they are. If a substantive answer arrives, it is evaluated under restart steps 5–6, and his prior can become available through that step.

This uses the route the readiness report itself leaves open: section 7.3 of the specification "permits per-player unavailability while preserving population rows", and the report says the decision "does not require every otherwise unaffected identity to be discarded". The report also says it "does not authorize a partial cohort or select exclusions here", so adopting this needs its own explicit operator decision.

## 6. Can the issue be isolated to this one input?

Partly established, partly not.

- **As an input, yes.** `P` is computed per identity. Making one identity's prior unavailable changes no other row's features. Alpha is fit on 2022–2023 targets only, so a target-2025 prior cannot affect the fit.
- **As a finding, on the frozen evidence, it is one identity.** The frozen report records 587 season-count matches and 1 difference, and names 00-0034854 as the sole difference.
- **Not established here**: that no other identity's membership changed between the June state and the later state. This run could not see the June artifact. The frozen independent review of the 10/10 vs 11/11 change is described as identity-specific.
- **Not addressed by this proposal**: the two blocking rows in the frozen matrix are worded for "this affected reconstructed denominator". Whether per-player unavailability is enough to let the remaining identities proceed under `retrospective_reconstruction_for_method_selection`, or whether the reconstruction class as a whole stays blocked, is a contract reading for the operator and reviewer, not something this document can settle.

## 7. How unaffected work could proceed meanwhile

Unchanged by this proposal, and still needing their own authorisations: completion/finality, cutoff population, cutoff team/position, canonical identity, historical-purpose admission, label isolation.

If the operator adopts the disposition, target-2025 unscored prior-evidence preparation could be considered for the other identities, with his row carried as unavailable. If not adopted, nothing changes and the restart record governs.

Either way, shadow work that makes no governed claim, such as scoring the frozen Week 10 file after the games, does not depend on this question.
