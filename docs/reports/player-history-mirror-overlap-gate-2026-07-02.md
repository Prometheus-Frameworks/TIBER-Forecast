# Player-history mirror-overlap gate (#109)

_Generated 2026-07-02 • player-history-mirror-overlap-gate-v1 • status: **player_history_mirror_overlap_gate_passed** • decision: **may_authorize_run_issue**_

Evaluates the regenerated real-population dry-run matrix against the pre-registered #107/PR #108 overlap floors. Ceiling: `may_authorize_run_issue` — the gate's decision type has no `may_run` value; passing authorizes only opening a separate run-authorizing issue.

## Thresholds vs observed

| Check | Expected | Observed | Result |
|---|---|---|---|
| source_gate_reverified | `may_continue_mirror_build` | `may_continue_mirror_build` | pass |
| target_population_gate_passed | `may_continue_to_overlap_gate` | `may_continue_to_overlap_gate` | pass |
| evidence_counts_sane | `0 <= joined_rows <= scored_target_rows, both finite` | `scored=610, joined=485` | pass |
| nonzero_overlap | `> 0 joined rows` | `485` | pass |
| min_joined_rows_overall | `>= 200` | `485` | pass |
| min_joined_rows_position_QB | `>= 30` | `66` | pass |
| min_joined_rows_position_RB | `>= 30` | `115` | pass |
| min_joined_rows_position_WR | `>= 30` | `189` | pass |
| min_joined_rows_position_TE | `>= 30` | `115` | pass |
| min_joined_share | `>= 0.6` | `0.7951` | pass |
| derangement_feasible_for_included_groups | `every position group with feature-bearing rows supports a derangement` | `QB:66, RB:115, TE:115, WR:189` | pass |

- Decision: **`may_authorize_run_issue`**
- Next allowed step: open a SEPARATE run-authorizing issue (which must pass its own review before any metric is computed). Nothing else is authorized.

## Non-goals confirmed

- No Forecast run occurred; no Run 3 was created.
- No model was trained, tuned, evaluated, or compared; no MAE/RMSE/Pearson/rank-correlation was computed.
- No production feature binding occurred; nothing was wired into `seasonalPprModel.ts`; the baseline is unchanged.
- No Data artifact was promoted; no TIBER-Data/Teamstate change was made.
- No player-history signal is claimed.

## Reproduce

```bash
npm run gate:player-history-population   # regenerate all three reports (network-free)
npm run build && npm test
```
