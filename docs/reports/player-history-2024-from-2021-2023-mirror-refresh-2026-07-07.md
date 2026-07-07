# Player-history mirror refresh: 2024-from-2021-2023 (Forecast #135)

_Generated 2026-07-07 • player-history-2024-from-2021-2023-mirror-refresh-v1 • decision: **`may_open_player_history_2024_from_2021_2023_additional_validation_issue`**_

Refreshes Forecast-side, non-production player-history mirrors for the 2024-from-2021-2023 additional-validation path
from the PROMOTED TIBER-Data artifact (`Prometheus-Frameworks/TIBER-Data:exports/promoted/nfl/player_season_coverage_v0.json`, TIBER-Data #202 review,
merge `711d6ee158d4e3bd116d1df4d76dea282200454d`), as authorized by the TIBER-Data #207 decision
`may_open_forecast_player_history_2021_2023_mirror_refresh_issue`. **Mirror refresh only: no validation run, no
threshold acceptance, no leakage-audit or production-readiness claim, no model run, no new metrics, no production
binding, no `seasonalPprModel.ts` change, no product/advice output, no TIBER-Data change.**

## 1. Existing Forecast player-history mirror inputs (located and documented)

| Mirror set | Paths | What it contains |
|---|---|---|
| Archived candidate (#110) | `data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json`, `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json`, `data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json` | Built from the CANDIDATE (not-promoted) 2022-2025 evidence artifact for the original #109 controlled-run design; preserved as the archived record of the #112/#116 experiment. Not touched by this refresh. |
| Promoted-source (#119/#120) | `data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json`, `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json`, `data/fixtures/tiberData/player_season_coverage_v0_promoted_mirror_provenance.json` | Refreshed from the TIBER-Data #192/#193 promotion (2022-2025 scope, sha 29f8e378...): 2025 outcome / 2022-2024 input. Superseded in scope by the #202/#207 (2021-2025) promotion this issue consumes, but NOT overwritten -- they remain valid as the refreshed record of that prior promotion event. Not touched by this refresh. |

A DIFFERENT window (2024-from-2021-2023) from the same #202/#207 (2021-2025) promoted artifact, needed for a possible future additional-validation issue. Does not replace or invalidate the 2025-from-2022-2024 mirrors above.

## 2. Upstream identity verified before use

- Artifact id: `player_season_coverage_v0`
- Promoted sha256 (pin = actual local bytes): `d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac`
- Promotion review: `TIBER-Data#202`
- Promotion decision: `promote_player_season_coverage_v0_2021_2025`
- Seasons: 2021-2025 (633/609/576/588/610 records); this refresh's window: target season 2024, input seasons 2021-2023
- Source-identity gate: 51/51 checks passed; source_identity_passed=**true**, mirror_integrity_passed=**true**, overlap_floors_passed=**true**

## 3. Refreshed mirrors

| Mirror | Path | Rows | Notes |
|---|---|---|---|
| Outcome (2024 REG) | `data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json` | 588 (QB 78, RB 148, TE 128, WR 234) | outcome layer only; never 2024 input features |
| Input (2021-2023 REG) | `data/fixtures/tiberData/player_history_2021_2023_input_mirror.json` | 1090 (2021: 287, 2022: 365, 2023: 438) | 470 players with history; 118 documented no-history players |
| Provenance | `data/fixtures/tiberData/PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_PROVENANCE.json` | — | ties both mirrors to the promoted artifact/manifest, merge commit, and this gate |

The archived candidate mirrors (#110) and the prior promoted-source mirrors (#119/#120) are preserved unchanged at:
- `data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json`
- `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json`
- `data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json`
- `data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json`
- `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json`
- `data/fixtures/tiberData/player_season_coverage_v0_promoted_mirror_provenance.json`

## 4. Population/overlap evidence (counting only -- no metrics, no model)

- 2024 outcome population: 588 players
- Joined with 2021-2023 history: **470** (share: **79.9%**)
- Joined by position: QB 67, RB 116, TE 103, WR 184
- Thresholds (pre-registered #107/PR#108 floors, reused as-is): overall >= 200, per position >= 30, share >= 0.6

## Result

- **Refresh gate decision:** `may_open_player_history_2024_from_2021_2023_additional_validation_issue` (51/51 checks passed)
- **Next step:** a SEPARATE issue may be opened to consider running additional validation against these mirrors. Opening that issue authorizes nothing by itself; the validation run would need its own review, and would not itself accept or amend any threshold or make a production/leakage claim.

## Non-goals confirmed

- No player-history model was run; no arm was executed.
- No MAE/RMSE/Pearson/Spearman or any other player-history metric was computed.
- No additional validation was run; no threshold was accepted, rejected, or amended.
- No leakage-audit or production-readiness claim is made by this refresh.
- `seasonalPprModel.ts` and the production baseline are untouched; no feature was bound into production Forecast.
- No product route/UI surface, fantasy advice, rankings, start/sit, trade, or draft output was created.
- No TIBER-Data file was modified; nothing was promoted or demoted.
- No active-roster, availability, injury, depth-chart, or ownership status was inferred or consumed.
- The #110 archived candidate mirrors and the #119/#120 promoted-source mirrors were preserved unchanged.

## Reproduce

```bash
npm run refresh:player-history-2024-from-2021-2023-mirrors -- \
  --artifact=/path/to/player_season_coverage_v0.json \
  --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build   # tsc --noEmit
npm test        # incl. tests/playerHistory2024From2021_2023MirrorRefresh.test.ts
```
