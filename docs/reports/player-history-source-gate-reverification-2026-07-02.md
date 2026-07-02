# Source-gate re-verification for the player-history run mirrors (#109)

_Generated 2026-07-02 • player-history-source-gate-reverification-v1 • decision: **may_continue_mirror_build**_

Short re-verification of the #99/#100 player-season coverage gate against the unchanged sha256 pin. The full gate (PR #100) already returned may_design_experiment for this exact artifact identity; this report re-verifies identity, status, scope, and source-backing rather than duplicating the whole gate.

| Check | Expected | Observed | Result |
|---|---|---|---|
| sha256_pin | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` | `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` | pass |
| artifact_status | `candidate_evidence_artifact_not_promoted` | `candidate_evidence_artifact_not_promoted` | pass |
| seasons_scope | `2022,2023,2024,2025` | `2022,2023,2024,2025` | pass |
| season_type_scope | `REG` | `REG` | pass |
| included_positions | `QB,RB,TE,WR` | `QB,RB,TE,WR` | pass |
| row_grain | `player_id + season + season_type` | `player_id + season + season_type` | pass |
| source_refs_approved | `every record carries >= 1 source_ref with an approved 'nflreadpy' source and no fixture markers` | `0 non-conforming records` | pass |

- Decision: `may_continue_mirror_build` (ceiling: never `may_run`; authorizes only continuing the mirror build)
- The artifact remains `candidate_evidence_artifact_not_promoted`; generating mirrors from it promotes nothing.
- No Forecast run occurred; no model was trained/tuned/evaluated; no metric was computed; no signal is claimed.

## Reproduce

```bash
npm run generate:player-history-run-mirrors -- --artifact=/path/to/local/copy.json
```
