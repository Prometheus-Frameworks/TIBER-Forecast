# player_season_coverage_v0 candidate coverage/provenance gate

_Benchmark / gate — not an experiment design, not a run. Defines what TIBER-Data's `player_season_coverage_v0` candidate artifact must prove before Forecast may even DESIGN a future player-history experiment. Changes no model/data/feature/null-handling logic._

## 1. Why this gate exists

TIBER-Data completed a player-history audit/spec/build sequence (#184/#185, #186/#187, #188/#189, #190/#191) and produced a real, source-backed `player_season_coverage_v0` **candidate** artifact for 2022–2025 (REG only, QB/RB/WR/TE, 2,383 rows via `nflreadpy`, no fixtures, 2024 now source-backed). This is a genuine improvement — but a new upstream candidate artifact existing is not the same as it being safe to consume. Following the same discipline that parked the Teamstate Run 2 path (`docs/benchmarks/run2-teamstate-coverage-gate.md`), Forecast inspects, gates, and only then decides whether a controlled experiment should even be **designed**.

The gate is implemented as a pure evaluator, `evaluatePlayerSeasonCoverageGate(evidence)` (`src/reports/playerSeasonCoverageGate.ts`), which returns a machine-readable status + decision. It performs no Forecast run, no Run 3, no feature binding, no baseline change, no model tuning, and no TIBER-Data/Teamstate change. **The strongest decision this gate can ever return is `may_design_experiment` — it never authorizes a run.**

## 2. What it checks

In fail-closed precedence order (matching TIBER-Forecast #99's own section order):

1. **Identity / status** — the artifact must explicitly identify itself as `candidate_evidence_artifact_not_promoted` with the documented row grain (`player_id + season + season_type`), a non-empty `artifact_id`, and `generated_at`.
2. **Source / provenance** — source refs present and machine-readable, drawn from an approved `nflreadpy` source, zero fixture/scaffold markers, and 2024 must be source-backed (not the prior fixture-only state).
3. **Scope / window** — seasons must include all of 2022–2025, `season_type` values must be a subset of `REG` (the current accepted slice), positions must be a subset of QB/RB/WR/TE, and no full-career-coverage claim may be made.
4. **Grain / shape** — one logical row per `(player_id, season, season_type)`; zero duplicate-grain rows; a `REG+POST` row may never coexist with a separate `REG`/`POST` row for the same player-season; every required row field must be present.
5. **Semantic boundary** — no `active_status`/`ownership_status`/`roster_status`/`active_roster_status` field may be present or consumed; unavailable usage fields (`snap_share`, `routes_run`, `route_participation`, `red_zone_*`) must stay `null`, never coerced to `0`; age/career fields (`season_age`, `career_year`) must never be fabricated without their source basis (`birth_date`, `rookie_year`); every multi-team row must carry an explicit `primary_team_rule`.
6. **Cutoff discipline** — no proposed design may feed a 2025 target-season summary into a 2024-input row (or equivalent); with no design proposed yet (today's real state), this passes but the result **always** carries an explicit warning that no run is authorized and that a future design is a separate, later issue.

## 3. How it fails closed

- The first failing dimension (in the order above) determines the status; the result also lists every check, the blocking reason(s), and warnings.
- `null` evidence (no mirror supplied) → `player_season_coverage_gate_not_evaluated` / `needs_artifact_mirror`.
- A forbidden availability/ownership field present anywhere in the evidence is the single hardest failure mode: it maps to `must_not_consume`, not a soft "needs fix," because it directly violates the non-goal that this artifact must never assert active/inactive status.

## 4. Decision vocabulary

The six decision values named in TIBER-Forecast #99, plus one equivalent addition (`needs_scope_fix`) to distinguish a scope/window gap from a provenance gap and a grain gap:

- `may_design_experiment` — the only "go" state, and the ceiling for this gate.
- `must_not_consume` — identity/status mismatch or a forbidden availability field present.
- `needs_artifact_mirror` — no evidence supplied.
- `needs_provenance_fix` — source refs, approved-source, fixture/scaffold, or 2024-source-backed problem.
- `needs_scope_fix` — season/season_type/position/full-career-claim problem.
- `needs_grain_fix` — duplicate grain, REG+POST overlap, missing required fields, or a non-forbidden semantic-boundary issue (zero-vs-null, fabricated age/career, missing `primary_team_rule`).
- `needs_cutoff_design` — a proposed design leaks target-season data into an input-season row.

There is no `may_run_model` value anywhere in this type. A passing gate authorizes **designing** an experiment in a separate issue, nothing more.

## 5. Evidence shape

`PlayerSeasonCoverageEvidence`: `identity`, `provenance`, `scope`, `grain`, a `row_sample` (a small set of representative rows, not the full 2,383-row artifact), and an optional `proposed_cutoff_design` (`null` today). The real evidence is mirrored — not vendored in full — at `data/fixtures/tiberData/player_season_coverage_v0_2022_2025.mirror.json`, sha256-pinned to the actual TIBER-Data artifact merged in PR #191 (`39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b`).

## 6. Status values (machine-readable)

- `player_season_coverage_gate_passed`
- `player_season_coverage_gate_failed_identity_status`
- `player_season_coverage_gate_failed_provenance`
- `player_season_coverage_gate_failed_scope_window`
- `player_season_coverage_gate_failed_grain`
- `player_season_coverage_gate_failed_semantic_boundary`
- `player_season_coverage_gate_failed_cutoff_design`
- `player_season_coverage_gate_not_evaluated`

## 7. Null semantics (unchanged)

This gate does not change null handling anywhere. `unavailable` stays `unavailable` in the underlying TIBER-Data artifact; the gate only *checks* that this discipline holds (e.g. `snap_share` must be `null`, never `0`) — it does not itself process or transform any row.

---

**Current verdict for the real mirrored evidence:** `player_season_coverage_gate_passed` → `may_design_experiment`. See `docs/reports/player-season-coverage-gate-2026-07-01.md` for the full evaluation. **No TIBER-Data or Teamstate change is made by this issue, no Forecast run occurs, no feature binding occurs, and no player-history signal claim is made.** The next allowed step is a separate, later experiment-design issue — not a run.
