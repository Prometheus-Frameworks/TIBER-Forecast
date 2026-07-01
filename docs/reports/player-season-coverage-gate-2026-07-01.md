# player_season_coverage_v0 candidate coverage/provenance gate evaluation

_Generated 2026-07-01 • record player-season-coverage-gate-v1 • status: **player_season_coverage_gate_passed**_

Gate-evaluation only: this evaluates whether the TIBER-Data `player_season_coverage_v0` candidate artifact is structurally serviceable enough to justify DESIGNING a future controlled Forecast player-history experiment. It performs **no** Forecast run, no Run 3, no feature binding, no baseline change, no model tuning, and no TIBER-Data/Teamstate change. The strongest decision this gate can return is `may_design_experiment`; it never authorizes a run.

## 1. Artifact inspected

- TIBER-Data repo: `Prometheus-Frameworks/TIBER-Data`
- Source artifact: `data/processed/evidence/player_season_coverage_2022_2025.source_backed.json`
- sha256: `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`
- Schema: `schemas/player_season_coverage_v0.schema.json`
- Validator: `scripts/validate_player_season_coverage_v0.py`
- Coverage report: `docs/reports/player-season-coverage-v0-2022-2025.md`
- Refs: `TIBER-Data#184`, `TIBER-Data#185`, `TIBER-Data#186`, `TIBER-Data#187`, `TIBER-Data#188`, `TIBER-Data#189`, `TIBER-Data#190`, `TIBER-Data#191`

## 2. Status statements

- Candidate / not promoted: **true**
- Forecast did not run: **true**
- No Forecast feature binding occurred: **true**
- No model signal is claimed: **true**

## 3. Identity / status

- artifact_id=player_season_coverage_2022_2025.source_backed, status=candidate_evidence_artifact_not_promoted, row_grain=player_id + season + season_type → **pass**
- Expected: status="candidate_evidence_artifact_not_promoted", row_grain="player_id + season + season_type", non-empty artifact_id and generated_at

## 4. Source / provenance

- source_refs_present=true, sources=[nflreadpy.load_player_stats(summary_level='reg'), nflreadpy.load_player_stats(summary_level='week'), nflreadpy.load_players()], unapproved_sources=[], fixture_hits=0, 2024_rows=588, 2024_source_backed=true → **pass**
- Expected: source_refs present, every reported source name on the approved allow-list (no unapproved sources), 0 fixture/scaffold markers, 2024 rows > 0 and source-backed

## 5. Scope / window

- seasons=[2022, 2023, 2024, 2025], season_type_values=[REG], positions=[QB, RB, TE, WR], full_career_claimed=false → **pass**
- Expected: seasons include all of [2022, 2023, 2024, 2025], season_type_values subset of [REG], positions subset of [QB, RB, WR, TE], no full-career claim

## 6. Grain / shape

- duplicate_grain_count=0, reg_post_overlap_violations=0, required_row_fields_missing_count=0, sample_duplicates=false, sample_missing_required_fields=0 → **pass**
- Expected: zero duplicate grain rows, zero REG+POST overlap violations, zero missing required fields, one logical row per player_id + season + season_type

## 7. Semantic boundary

- aggregate(forbidden=0, zero_instead_of_null=0, fabricated_age=0, fabricated_career_year=0, multi_team_missing_rule=0) sample(forbidden_fields=0, zero_instead_of_null_rows=0, fabricated_age_rows=0, fabricated_career_year_rows=0, multi_team_missing_rule_rows=0) → **pass**
- Expected: no active/ownership/roster status fields present; unavailable usage fields stay null; age/career fields never fabricated; every multi-team row carries an explicit primary_team_rule

## 8. Cutoff-risk notes

- no experiment design proposed yet → **pass**
- Expected: no proposed design leaks target-season summaries into the input row for a prior season, and target_season must not appear in input_seasons
- No proposed input/target cutoff design exists yet in this evidence; a future design is a **separate, later issue**.

## 9. Aggregate evidence summary

- Rows by season: 2022=609, 2023=576, 2024=588, 2025=610
- Rows by position: QB=323, RB=606, TE=519, WR=935
- Multi-team rows: 84
- `draft_year` null count: 653 (genuine — undrafted players)
- `season_age` null count: 0
- Row sample size evaluated: 4

## 10. Result

- **Final gate status:** `player_season_coverage_gate_passed` (PASSED)
- **Final decision:** `may_design_experiment`
- Warnings: No Forecast run is authorized by this gate. A separate experiment-design issue is required before any model/feature work, and that design must explicitly separate input seasons from the target season with a defensible cutoff.
- **Next step:** Open a SEPARATE experiment-design issue for a future controlled player-history Forecast experiment. That issue must define input seasons vs. the target season, the cutoff, and pass its own review before any run. Do not run or bind features here.

## Reproduce

```bash
npm run evaluate:player-season-coverage-gate   # regenerate this report (network-free)
npm run build                                  # tsc --noEmit
npm test                                       # incl. tests/playerSeasonCoverageGate.test.ts
```
