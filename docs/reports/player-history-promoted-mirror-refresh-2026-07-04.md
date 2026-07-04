# Promoted-source mirror refresh: player_season_coverage_v0 (Forecast #119)

_Generated 2026-07-04 • player-history-promoted-mirror-refresh-v1 • decision: **`may_open_promoted_controlled_rerun_issue`**_

Refreshes the Forecast player-history experiment mirrors from the PROMOTED TIBER-Data artifact
(`Prometheus-Frameworks/TIBER-Data:exports/promoted/nfl/player_season_coverage_v0.json`, merge `65fb498253b5bdb6a7f6d0598d7235c90a78c729`), as authorized by the
#117 gate decision `may_open_promoted_mirror_refresh_issue` (PR #118). **Mirror refresh only: no model run, no new
metrics, no production binding, no `seasonalPprModel.ts` change, no product/advice output, no TIBER-Data change.**

## Preflight (#117 gate, re-run against local bytes -- never the committed report alone)

- Committed evidence: `data/fixtures/tiberData/PLAYER_SEASON_COVERAGE_V0_PROMOTED_SOURCE_GATE_EVIDENCE.json` -> `may_open_promoted_mirror_refresh_issue`
- Re-run result: **passed** -> `may_open_promoted_mirror_refresh_issue` (29/29 checks)
- Promoted sha256 (pin = actual): `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035`
- Candidate lineage sha256: `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`

## Refreshed promoted-source mirrors

| Mirror | Path | Rows | Notes |
|---|---|---|---|
| Outcome (2025 REG) | `data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json` | 610 (QB 81, RB 151, TE 138, WR 240) | outcome layer only; never 2025 input features |
| Input (2022-2024 REG) | `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json` | 1145 (2022: 315, 2023: 378, 2024: 452) | 485 players with history; 125 documented no-history players |
| Provenance | `data/fixtures/tiberData/player_season_coverage_v0_promoted_mirror_provenance.json` | — | ties both mirrors to the promoted artifact/manifest, merge commit, and #117 gate |

The archived candidate mirrors (#110) are preserved unchanged at:
- `data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json`
- `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json`
- `data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json`

## Refreshed dry-run matrix (assembly and counting only — no metrics)

- Target population: 610 (scored: 610, outcome-unavailable: 0)
- Matrix rows: **610** (row_kind: `player_history_experiment_dry_run_matrix_row_not_model_ready`)
- Joined rows: **485** (share: **79.5%**)
- Joined by position: QB 66, RB 115, TE 115, WR 189
- No-history rows by position: QB 15, RB 36, TE 23, WR 51
- Shuffled-control posture: `seeded_derangement_within_position`, seed 20260702, groups: QB 66, RB 115, TE 115, WR 189; metrics computed: **false**
- Outcome values are omitted from matrix rows by construction.

## Result

- **Refresh gate decision:** `may_open_promoted_controlled_rerun_issue` (27/27 checks passed; details in `docs/reports/player-history-promoted-mirror-overlap-gate-2026-07-04.md`)
- **Next step:** a SEPARATE issue may be opened to consider rerunning the controlled experiment against these promoted-source mirrors. Opening that issue authorizes nothing by itself; the rerun would need its own review.

## Non-goals confirmed

- No player-history model was run; no arm was executed.
- No MAE/RMSE/Pearson/Spearman or any other player-history metric was computed.
- `seasonalPprModel.ts` and the production baseline are untouched; no feature was bound into production Forecast.
- No product route/UI surface, fantasy advice, rankings, start/sit, trade, or draft output was created.
- No TIBER-Data file was modified; nothing was promoted or demoted.
- No active-roster, availability, injury, depth-chart, or ownership status was inferred or consumed.
- The archived candidate mirrors (#110) were preserved unchanged.

## Reproduce

```bash
npm run refresh:player-history-promoted-mirrors -- \
  --artifact=/path/to/player_season_coverage_v0.json \
  --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build   # tsc --noEmit
npm test        # incl. tests/playerHistoryPromotedMirrorRefresh.test.ts
```
