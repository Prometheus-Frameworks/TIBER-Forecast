# Design: record-bound availability-evidence schema v2 for rookie_transition_profile_v0.2.0 (#163)

**Status: design-only. No implementation, no evidence population, no validator, no CLI change.**
This PR adds two documents (this Markdown and its JSON companion) and nothing else. It does not
modify the immutable schema `1.0.0` artifact, validator, or CLI merged at PR #161
(`478489b565a97a1179d6010ebf9b1b4326a50c04`); does not pin a real cutoff; does not archive real
player evidence; does not populate any row; performs no human sign-off; does not touch
TIBER-Rookies or TIBER-Data; does not run an experiment, build a feature adapter, or authorize any
runtime/production/downstream/UI use; and **does not close issue #160**, which remains open as the
parent Lane B tracking issue.

## 1. Governing contract and locks

| | Value |
| --- | --- |
| Implementing issue | `TIBER-Forecast#163` (design-only) |
| Parent issue (stays open) | `TIBER-Forecast#160` (Lane B) |
| Prior merged design | `TIBER-Forecast#155` / PR `#156`, merge commit `73834c2a30743c2587b32742c4e5c98320e33dfe` |
| Prior merged implementation (immutable, schema `1.0.0`) | PR `#161`, merge commit `478489b565a97a1179d6010ebf9b1b4326a50c04` |
| Real source repo inventoried | `Prometheus-Frameworks/TIBER-Rookies` @ `2ef92faf9a9c91a393f53e9140428451529a1c48` (the commit already pinned as `SOURCE_COMMIT` in the merged mirror) |
| Real cross-repo source checked for draft-schedule data | `Prometheus-Frameworks/TIBER-Data` (current `main`) |

## 2. Mission recap

Design the next schema version of Forecast's rookie-transition source-availability evidence system
so that, when implemented, one accepted row can prove: **one exact archived source record binds one
locked source identity to one field family to the exact mirrored value and to a typed
public-availability timestamp.** The design must not rely on document-wide substring co-occurrence,
reviewer prose, self-declared timestamps, event/retrieval/generation/ingestion timestamps, generic
archive existence, or name-only/fuzzy subject matching. This issue authorizes design only.

## 3. Required first step: real source and derivation inventory

This section documents the *actual* TIBER-Rookies pipeline behind `rookie_transition_profile_v0.2.0`
as it exists today at the pinned source commit — not an assumed generic shape. It is the empirical
basis for every family-specific contract in §11. Every claim below was verified by reading the real
generator (`scripts/compute_rookie_transition_profile.py`), its upstream inputs, and (for
`athletic_testing`/`college_production`) the further-upstream `scripts/compute_rookie_alpha.py`
pipeline and supporting docs, all in the `TIBER-Rookies` checkout. Uncertainties are marked
**UNCERTAIN** rather than resolved by assumption.

### 3.0 A finding that shapes the whole design: the six upstream files are internal pipeline artifacts, not public records

`compute_rookie_transition_profile.py` joins six files, all already inside `TIBER-Rookies`:
`exports/promoted/rookie-alpha/{season}_rookie_alpha_predraft_v0.json`,
`data/processed/{season}_draft_capital_proxy.json`, `data/processed/{season}_college_production.json`,
`data/processed/{season}_prospect_context.json`, `data/processed/{season}_draft_results.json`, and
`data/processed/{season}_day3_udfa_draft_result_profiles.json`. None of these six files carries a
structured "this fact was publicly knowable as of X" timestamp for most fields (see §3.6). They are
TIBER-Rookies' own internal processing outputs — reproducible and hash-pinnable as *inputs to
recomputation*, but **not themselves the original public record** a v2 evidence package can cite as
proof of public availability. Where a real public source exists at all (e.g., a news article's
publish date embedded as free text in `official_postdraft_outcome.provenance.source_name`), it is
unstructured prose, not a machine-checkable field. **Consequence for this design:** v2 evidence
packages generally need to reach past these six files to the actual original public source (a
combine record, a league draft tracker, a team press release) wherever the claim being proven is a
publicly-timed fact; the six files remain useful only as pointers to *what* to look for and as
pinned inputs for deterministic recomputation of derived values.

### 3.1 `draft_capital`

| | |
| --- | --- |
| Mirror value shape | `{ "big_board_rank": 2, "draft_capital_proxy_0_100": 95.0 }` |
| Direct vs. derived | `draft_capital_proxy_0_100` is copied verbatim from the promoted Rookie Alpha export's `scores.draft_capital_proxy_0_100` (confirmed byte-identical across all 48 rows against `data/processed/{season}_draft_capital_proxy.json`'s own value). `big_board_rank` is a direct lookup by `player_id`. |
| Actual upstream source file(s) | `exports/promoted/rookie-alpha/{season}_rookie_alpha_predraft_v0.json` (the score) + `data/processed/{season}_draft_capital_proxy.json` (`big_board_rank`) |
| Source-record grain/key | `data/processed/{season}_draft_capital_proxy.json`: one row per `player_id`, 101 rows, all unique — a flat 2026 pre-draft seed-pool snapshot, broader than the 48-player modeled population |
| `source_player_id` present in source record? | Yes — directly, as `player_id`, no crosswalk |
| Derivation code path | `build_draft_capital_field()`, `scripts/compute_rookie_transition_profile.py:123-172`. The *value* is a pass-through; what the generator computes is only the human-readable `provenance.source_name` string, via a documented rank→score banding table (`DRAFT_CAPITAL_RANK_BANDS`, lines 101-110): `(1,10)→95, (11,20)→85, (21,32)→75, (33,50)→65, (51,75)→55, (76,100)→45, (101,150)→35, (151,∞)→25`. |
| Rounding/normalization | The score itself is a rank-band conversion (documented in `docs/export-contract.md:152-168` through the `76-100→45` band); the extra `101-150→35`/`151+→25` bands exist only in the Python source, **UNCERTAIN**: not found documented anywhere outside `compute_rookie_transition_profile.py` itself. |
| Cohort/context dependency | None — purely a per-player rank-to-score lookup. |
| Current timestamp fields | `provenance.last_verified_at` = the generator run date (`as_of_date`), always. No other timestamp. |
| Which timestamps are operational only | All of them — see §3.6. |
| Missing evidence for historical availability | A real, archived, *original* big-board publication (the actual scouting big-board snapshot naming this player at this rank, dated) — `data/processed/{season}_draft_capital_proxy.json` is not that snapshot, only TIBER-Rookies' seeded copy of it. |

### 3.2 `age_at_entry`

| | |
| --- | --- |
| Mirror value shape | `21` (a bare integer), or `null` with `source_type: "unavailable"` when no `dob` exists. |
| Direct vs. derived | Derived deterministically from `dob`. `age_from_dob()` (`scripts/compute_rookie_transition_profile.py:68-80`, a verbatim copy of `scripts/compute_breakout_age.py`'s own function): `season_start = date(season, 9, 1)`; `age = season_start.year - born.year - 1 if (season_start.month, season_start.day) < (born.month, born.day) else season_start.year - born.year`. |
| Actual upstream source file | `data/processed/{season}_prospect_context.json`, field `dob` |
| Source-record grain/key | One row per `player_id`, 100 rows, all unique — broader than the 48-player modeled population |
| `source_player_id` present in source record? | Yes — directly, as `player_id`, no crosswalk |
| Derivation code path | `build_age_field()`, lines 175-195; formula pinned in `age_from_dob()`, lines 68-80 |
| Rounding/normalization | None on the age integer itself — exact calendar-date arithmetic, no cohort dependency. |
| Cohort/context dependency | None on the age computation. **But the underlying `dob`'s own real provenance is heterogeneous and largely undocumented per-row**: across the 48 mirrored players, `data/processed/{season}_prospect_context.json`'s `context_source` field shows values including `"manual_seed_2026"` (17 of 48 — the largest bucket, reliability **UNCERTAIN**, not documented), scouting/social-media research batches (the majority of the rest), and exactly 1 player sourced from an actual "2026 NFL Combine results (ESPN/NFL.com), retrieved 2026-04-08." None of this heterogeneity is reflected in the mirror's provenance — every present value gets an identical fixed `confidence: 0.9`. |
| Current timestamp fields | `provenance.last_verified_at` = generator run date, always. `context_source` free text sometimes embeds a research date (e.g. `"retrieved 2026-04-08"`) but this is a *retrieval*, not a public-release, date, and is unstructured. |
| Which timestamps are operational only | All structured ones — see §3.6. |
| Missing evidence for historical availability | A real, archived, original public record actually stating the player's DOB (a combine bio, a verified roster/media-guide record) with its own genuine publish date — not `data/processed/{season}_prospect_context.json`, whose real sourcing is largely `manual_seed_2026`/scouting-batch, not a citable public record for most of the 48. |

### 3.3 `athletic_testing`

| | |
| --- | --- |
| Mirror value shape | `{ "athletic_score_0_100": 45.8929, "athletic_source": "COMBINE_FALLBACK" }`, or `null`/`unavailable` when Rookie Alpha's `athletic_source` is absent or the `NEUTRAL_DEFAULT` placeholder sentinel. Present for 32/48 players. |
| Direct vs. derived | Pass-through from Rookie Alpha's `scores` block, with one deliberate exclusion: `NEUTRAL_DEFAULT` (Rookie Alpha's internal placeholder default of 50.0 for players with no usable combine data) is intentionally converted to `unavailable` rather than copied (`build_athletic_testing_field()`, lines 198-229) — the code comment is explicit that the placeholder "is not a measurement and would misrepresent absence of evidence as evidence." |
| Actual upstream source file | `exports/promoted/rookie-alpha/{season}_rookie_alpha_predraft_v0.json`'s `scores` block only — **not** one of the six files nominally read by `compute_rookie_transition_profile.py`; the real raw combine data (`data/raw/{season}_combine_results.json`) is two pipeline hops upstream and never read directly by the transition-profile generator. |
| Source-record grain/key | Rookie Alpha's `players[]`, one row per `player_id`, matching the 48-player modeled population exactly |
| `source_player_id` present in source record? | Yes — directly, as `player_id` (this is the outer loop's own key, so no separate lookup needed for this family) |
| Derivation code path (formula owner) | **Fully recovered in this design pass** (previously understated as a single global z-score — the real logic is two-stage and position-gated). `scripts/compute_rookie_alpha.py` — outside the six files `compute_rookie_transition_profile.py` reads, so pinned by citation to that script's own commit (see §7.3), with the full logic recorded here since it is now completely verified: (1) `compute_ras_scores()` (lines 504-638) builds the raw RAS composite as a weighted average of per-metric `z_to_score(z) = clamp(0,100, 50 + 16.6667·z)` across up to five components — forty (weight 0.30, inverted), vertical (0.20), broad (0.20), three_cone (0.15, inverted), size (mean of height/weight z-scores, 0.15) — computed against the same-season, same-position `data/raw/{season}_combine_results.json` cohort; at least one explosive/agility metric (vertical/broad/three_cone) is required, else the partial composite routes to a fallback instead of the primary RAS score. (2) `resolve_athletic_input()` (lines 834-897), dispatching to position-specific `resolve_wr_athletic_input()` (696-752) or `resolve_rb_athletic_input()` (755-831) for WR/RB, applies a closed priority order selecting RAS, a `round(0.55·RAS + 0.45·SPORQ, 4)` blend (gated by RAS metric count and, for RB, a ≥20-point SPORQ-over-RAS divergence threshold), SPORQ alone, `RAS_PARTIAL`, or `COMBINE_FALLBACK` — each branch carrying its own fixed confidence constant (`_ras_confidence()`, lines 682-693, plus per-branch literals in the resolve functions) — before falling to `NEUTRAL_DEFAULT` (excluded from the mirror, per the row above). SPORQ is a same-row percentile read from `prospect_context.json`'s `exceptional_metrics` array (`_extract_sporq()`, lines 661-674) — a second, independent evidentiary source whenever a SPORQ-involving branch is selected. |
| Rounding/normalization | **Cohort-relative, not absolute**, at the RAS-composite stage (same-season, same-position combine cohort); the audit doc documents that class means are mechanically pinned near 50 across all years and that scores are **not commensurable across draft classes**. The final mirrored value may additionally be a fixed-weight blend with a SPORQ percentile (a differently-scaled, non-cohort-relative input) — see derivation row above. |
| Cohort/context dependency | The entire same-season, same-position `data/raw/{season}_combine_results.json` population is a required input to reproduce the RAS composite. When a SPORQ-involving branch is selected (`SPORQ`, `RAS_SPORQ_BLEND`), the player's `prospect_context.json` `exceptional_metrics` SPORQ percentile is a second, independently-sourced required input with its own availability time — not part of the combine cohort at all. `confidence`/`confidence_band` is genuinely per-row (copied from Rookie Alpha's own `athletic_confidence`, itself one of the fixed per-branch constants above), not a single fixed constant for the family. **Empirically verified** against `exports/promoted/rookie-alpha/2026_rookie_alpha_predraft_v0.json`: Makai Lemon carries `athletic_source: RAS_PARTIAL`, `athletic_confidence: 0.70` (exact match to the RAS_PARTIAL branch literal); eight TE/WR rows at 3/4/5 RAS metrics carry confidence exactly `0.85`/`0.95`/`1.0` per `_ras_confidence()`. **Data-availability note** (not a formula gap): no `RAS_SPORQ_BLEND` or `SPORQ` row exists anywhere in the current 48-player cohort — those branches are real, pinnable code paths with zero real occurrences to date, the same kind of caveat noted for `college_production`'s `slot_contested_target_rate` (§3.4). |
| Current timestamp fields | `provenance.last_verified_at` = generator run date, always. |
| Which timestamps are operational only | All of them — see §3.6. |
| Missing evidence for historical availability | The actual archived combine testing-event record(s) for this player (with a genuine public-release date, e.g. an NFL Combine results page), the complete pinned same-season, same-position combine-cohort population snapshot, the pinned RAS composite and resolution-priority derivation contract (both now fully recovered, §7.3), and — only when a SPORQ-involving branch applies — a separately archived SPORQ-percentile source record with its own public-release date. |

### 3.4 `college_production`

| | |
| --- | --- |
| Mirror value shape | `{ "production_score_0_100": 90.0 }` |
| Direct vs. derived | **Not a simple pass-through of the file the `source_name` implies.** The generator copies Rookie Alpha's own `scores.production_0_100` (`build_college_production_field()`, lines 232-258) and uses `data/processed/{season}_college_production.json`'s `production_score_source` only for the descriptive label text. Diffing all 48 rows found **47 of 48 differ** from `data/processed/{season}_college_production.json`'s own raw `production_score_0_100` — often substantially (examples found: 90.0 vs. 75.0; 87.6 vs. 69.0; 55.94 vs. 81.2). |
| Actual upstream source file(s) — layered | The mirrored number ultimately comes from a multi-stage `compute_rookie_alpha.py` pipeline: a raw same-season, same-position CFBD z-score (`scripts/compute_production_scores.py`) blended `0.60/0.40` with a separate "age-adjusted" score, then further adjusted by WR "translation penalties" (screen-yard-share, deep-yard-share, slot-contested-rate; up to −8.0 combined) or an RB missed-tackle-forced/YAC-consistency penalty (−2.5 to −5). The files `compute_rookie_transition_profile.py` itself reads (`{season}_college_production.json`) supply only the label text, not the final number. |
| Source-record grain/key | `data/processed/{season}_college_production.json`: one row per `player_id`, 48 rows, matching the modeled population exactly. |
| `source_player_id` present in source record? | Yes, directly, in this file. **However**, a fuzzy name+school join with an explicit alias table (`PLAYER_NAME_ALIASES`, e.g. `"nick singleton": ["nicholas singleton"]`) is used one hop further upstream, inside `compute_production_scores.py`, to originally match CFBD's raw stats to a player — by the time `player_id` exists in the file this design inventoried, that join is already resolved, but the fuzzy step exists earlier in the real pipeline. |
| Derivation code path (formula owner) | **Fully recovered in this design pass** (dedicated follow-up research resolved the two items previously left open). Raw stage: `scripts/compute_production_scores.py` — `build_population()` (211-291, per-position eligibility floors `POSITION_LIMITS`: QB ≥100 attempts, RB ≥50 carries, WR ≥20 receptions, TE ≥10 receptions), `population_metric_stats()`/`z_score()` (294-308, same-season/same-position mean+population-stdev), `composite_z()` (315-333, position-weighted: QB `0.30·completion_pct_z + 0.35·YPA_z + 0.25·TD-rate_z − 0.10·INT-rate_z`; RB `0.45·YPC_z + 0.35·TD-rate_z + 0.20·receiving-yds_z`; WR/TE `0.40·YPR_z + 0.35·total-yards_z + 0.25·TD-rate_z`), `z_to_score()` (311-312, `clamp(0,100, round(50+15z,1))`). Blend stage: `scripts/compute_rookie_alpha.py`, `blend_production_rows()` (904-945): `round(0.60·age_adjusted_production + 0.40·existing_production, 4)`. Penalty stage: same file, `apply_context_production_adjustments()` (989-1170): WR translation penalties at 1059-1113 (screen-yard-share `>0.50`→−5.0 else `>0.40`→−3.0; deep-yard-share `<0.18`→−4.0 else `<0.245`→−2.0; slot-contested-rate `>0.40`→−3.0 else `>0.30`→−1.5; summed then capped at 8.0); RB penalties at 1116-1167 (MTF `career_mtf_per_touch <0.18`→−5.0 else `<0.20`→−2.5; YAC `yac_plus_catch_2nd_best_season <40.0`→−4.0 else `<48.0`→−2.0; applied independently and sequentially, **uncapped**, unlike the WR combination rule). |
| Rounding/normalization | Population/cohort-relative (same-season, same-position, eligibility-floor-filtered CFBD population) at the raw-score stage; the raw score is then blended 0.60/0.40 with a separately-sourced age-adjusted score (see next row) and adjusted by position-specific penalties, each `clamp(0,100)`-ed after every step. |
| Cohort/context dependency | The full same-season, same-position, eligibility-filtered population snapshot is required to reproduce the raw z-score stage. **The cross-family dependency flagged in the prior pass is now resolved: `college_production` does NOT depend on `age_at_entry`.** The blend's `age_adjusted_production` input is computed entirely in a separate upstream file, `scripts/compute_age_adjusted_production.py` (`compute()`, 313-427; `age_multiplier()`, 145-157: `max(0.85, 1.0 + 0.5·(21 − effective_breakout_age))`; `weighted_volume()`, 263-293: `0.70·best_season_volume + 0.30·most_recent_season_volume`), consumed only via the pre-computed artifact `data/processed/{season}_age_adjusted_production.json`. The age input, `effective_breakout_age`, is a **materially different fact** than `age_at_entry`: it is `breakout_age` (from `data/processed/{season}_prospect_context.json`, itself computed by `scripts/compute_breakout_age.py::compute_breakout_for_player()`, 264-363, using the player's **breakout season**, not the draft-entry season) plus school-competition and teammate adjustments (`school_boa_adjustment()`, 127-139: +0.5 non-P4 FBS, +1.0 non-FBS; −0.5 WR Rounds-1-3 teammate flag). Both `age_at_entry` and `effective_breakout_age` share the same underlying `age_from_dob()` arithmetic but are invoked with different `season` arguments and are never the same computed value — `college_production`'s `computed_available_at` must include `effective_breakout_age`'s own upstream availability, not `age_at_entry`'s (see §13). **Empirically verified** against real committed data (Mike Washington Jr., Makai Lemon) — the blend and both penalty formulas reproduce the promoted export's `production_0_100` to the exact decimal. **Data-availability note** (not a formula gap): `slot_contested_target_rate` has never appeared in any committed `prospect_context.json` across 2022-2026 — the penalty branch is real and pinnable but has never fired on real data. |
| Current timestamp fields | `provenance.last_verified_at` = generator run date, always; `provenance.notes` is `null`. |
| Which timestamps are operational only | All of them — see §3.6. |
| Missing evidence for historical availability | The archived raw per-player CFBD season-stat record(s), the archived same-season/same-position population snapshot, the pinned raw z-score formula, the archived per-player-season volume record(s) (`wr_route_profiles/`/`qb_play_profiles/`/`rb_play_profiles/`) and breakout-season DOB record underlying `effective_breakout_age`, the pinned age-multiplier/weighted-volume/school-adjustment formulas, and the pinned WR/RB penalty formulas (all now fully recovered, §7.3) — all by citation to a specific `compute_rookie_alpha.py`/`compute_production_scores.py`/`compute_age_adjusted_production.py`/`compute_breakout_age.py` commit. |

### 3.5 `athletic_testing` cohort file / `college_production` note on route-level data

`docs/rookie-transition-profile-v0-design.md:312` documents that a more granular college-production
sub-family (route-level receiving data) was explicitly excluded from v0 because "only 12 of 66 files
are genuinely CFBD-observed (`source_url` present) while 54 are `source_url: null` estimated/manual
rows with no structural flag distinguishing them" — direct evidence that this pipeline already
self-identifies exactly the kind of unverifiable-provenance problem this v2 design exists to close.

### 3.6 `official_postdraft_outcome`

| | |
| --- | --- |
| Mirror value shape (drafted) | `{ "status": "drafted", "nfl_team": "ARI", "draft_round": 1, "overall_pick": 3, "is_udfa": false, "source_status": "external_verified", "upstream_provenance_status": "source_verified" }` |
| Mirror value shape (UDFA) | `{ "status": "udfa_signed", "nfl_team": "PHI", "draft_round": null, "overall_pick": null, "is_udfa": true, "source_status": "external_verified", "upstream_provenance_status": null }` |
| Direct vs. derived | Priority-ordered lookup, not a score: checks `data/processed/{season}_draft_results.json` first (row must have `source_status == "external_verified"`), then falls back to `data/processed/{season}_day3_udfa_draft_result_profiles.json` (same gate). `status`/`is_udfa` are read from the row's own fields, never hard-coded — a `udfa_signed` outcome recorded inside `draft_results.json` is preserved, not overwritten. |
| Actual upstream source file(s) | `data/processed/{season}_draft_results.json` (81 rows, one per `player_id`, broader than the 48-player population; ultimately traces to TIBER-Data's `nfl_draft_results` v1 contract) and `data/processed/{season}_day3_udfa_draft_result_profiles.json` (8 rows, an explicitly narrow "Day 1/Day 2-only gap-filler" subset). |
| Source-record grain/key | Both files: one row per `player_id`. |
| `source_player_id` present in source record? | Yes in both, directly — **with one confirmed data-quality wrinkle**: `draft_results.json`'s own `player_name` for one player is spelled differently ("Jeremiah Love") than every other upstream file ("Jeremiyah Love"); the join still works because it's keyed on `player_id`, not name, but a name-based join would silently fail here — direct evidence for why subject binding must never be name-only (see §9). |
| Derivation code path | `build_official_postdraft_outcome_field()`/`_postdraft_outcome_from_row()`, lines 261-329. No scoring — a fact carry-through. `confidence` is a fixed constant (`0.95`) for the whole family, "a deliberate simplification for v0, not a discovered fact" per `docs/rookie-transition-profile-contract.md:157-164`. |
| Rounding/normalization | None. |
| Cohort/context dependency | None. |
| Current timestamp fields | Drafted path: `last_verified_at` = the source row's own `ingested_at` (traced to TIBER-Data's `nfl_draft_results` contract's `generated_at`, e.g. `"2026-05-17T00:00:00Z"` — an ingestion/pipeline stamp), falling back to the generator run date. UDFA path: `last_verified_at` is explicitly `null`, with a `notes` field stating plainly that no per-row timestamp of any kind exists in `data/processed/{season}_day3_udfa_draft_result_profiles.json` (confirmed by inspecting its real field list: no date/timestamp field at all). |
| Which timestamps are operational only | Both paths' structured timestamps are operational/ingestion stamps, not public-release dates. The one place a genuine public date exists at all is **unstructured free text** inside `provenance.source_name` for the drafted path only — e.g. `"NBC Sports ProFootballTalk 2026 NFL Draft picks full tracker, published 2026-04-25"`, three weeks before the `2026-05-17` ingestion stamp. This substring is not machine-parseable and is not present for the UDFA path at all. |
| Missing evidence for historical availability | An actual archived copy of the cited public source (the draft tracker page, the team's press release) with a machine-extractable publish date and a deterministic record locator naming this specific player — not the free-text `source_name` description alone. |

### 3.7 Timestamps — cross-cutting finding

Every `last_verified_at` value in the current (schema `1.0.0`-relevant) pipeline is either the
generator's own run date (`draft_capital`, `age_at_entry`, `athletic_testing`, `college_production`,
always) or an ingestion/pipeline timestamp one hop upstream (`official_postdraft_outcome`, drafted
path). `docs/rookie-transition-profile-contract.md` in TIBER-Rookies already self-documents this as
an honest "as-of-this-run" convention, not a per-field verification claim. **No field, anywhere in
the six upstream files or the mirror itself, is a genuine, structured "this fact was publicly
released/knowable as of X" timestamp**, for any family. This is the concrete, empirical confirmation
of the gap PR #161's hard-rejection decision was based on, and it is why every family's evidence
contract below requires reaching to an *original* public source, not the pipeline's internal files.

### 3.8 Explicit proxy/placeholder/"not real historical data" callouts found

- `draft_capital` is documented as a temporary pre-draft proxy, "explicitly not equivalent to
  realized NFL draft capital" (`docs/export-contract.md:152-154`), echoed in the mirror's own
  `notes` field on every row.
- `NEUTRAL_DEFAULT` (a fixed 50.0 athletic-score placeholder) is explicitly called out in code as
  "not a measurement" and deliberately excluded rather than surfaced.
- `athletic_score_0_100` is documented as potentially misleadingly named — "not the Kent Lee Platte
  RAS percentile most readers would assume" (`docs/athletic-score-normalization-audit.md:7-9`).
- The upstream `draft_capital_proxy_source` free-text field is explicitly distrusted in code:
  "has been found to drift from the actual data (leaked post-draft text, stale narrative estimates)."
- Fixed (non-per-row) confidence constants for `draft_capital` (0.65), `college_production` (0.85),
  and `official_postdraft_outcome` (0.95) are documented as "a deliberate simplification for v0, not
  a discovered fact" (`docs/rookie-transition-profile-contract.md:157-164`).
- A route-level college-production sub-family was excluded from v0 specifically because most of its
  backing files could not be verified as genuinely CFBD-observed versus manually estimated
  (`docs/rookie-transition-profile-v0-design.md:312`).

### 3.9 NFL draft-schedule data check

**Confirmed: no NFL draft-schedule/broadcast-timing data (a "Day 1/Round 1 start time" fact) exists
in either `TIBER-Rookies` or `TIBER-Data`.** Both repos were searched for schedule/start-time/
broadcast-time patterns; all hits were unrelated false positives (scouting "round" language, an
unrelated `delayed_start_insulation` role-opportunity tag, a cron-schedule code comment). TIBER-Data's
`nfl_draft_results` v1 contract (`src/contracts/v1/nflDraftResults.ts`) has fields `draft_year,
player_id, player_name, position, team, round, pick_in_round, overall_pick, source, source_url,
generated_at, provenance_status` — no time-of-day, schedule, or broadcast field; confirmed directly
against the live promoted export (`generated_at: "2026-05-17T00:00:00Z"`, a midnight-UTC ingestion
stamp, not a pick time). **The cutoff contract (§10) must therefore be evidenced entirely from an
external, independently archived source (e.g. the league's own draft-day schedule announcement),
not from anything in either repo.**

## 4. Core architecture — proposed schema `2.0.0` artifact shape

```json
{
  "kind": "rookie_transition_profile_v0_forecast_availability_evidence",
  "schema_version": "2.0.0",
  "issue": "TIBER-Forecast#160",
  "governing_design": {
    "readiness_design_issue": "TIBER-Forecast#155",
    "readiness_design_pr": "TIBER-Forecast#156",
    "readiness_design_merge_commit": "73834c2a30743c2587b32742c4e5c98320e33dfe",
    "v1_implementation_pr": "TIBER-Forecast#161",
    "v1_implementation_merge_commit": "478489b565a97a1179d6010ebf9b1b4326a50c04",
    "v2_design_issue": "TIBER-Forecast#163",
    "v2_design_pr": "<filled in when this design PR itself merges>",
    "design_documents": [
      "docs/experiments/rookie-transition-profile-forecast-availability-evidence-schema-v2-design-2026-07-13.md",
      "docs/experiments/rookie-transition-profile-forecast-availability-evidence-schema-v2-design-2026-07-13.json"
    ]
  },
  "generated_at": "<offset-bearing instant>",
  "generated_at_is_operational_timestamp_only_not_fact_availability": true,
  "season": 2026,
  "mirror_source": { "...": "same pinned-commit dereferencing contract as schema 1.0.0 (§8)" },
  "cutoff_contract": { "...": "see §10" },
  "derivation_contracts": [ { "...": "see §7.3" } ],
  "evidence_packages": [ { "...": "see §7" } ],
  "rows": [ { "...": "see §5-6" } ],
  "status_counts": { "eligible_at_cutoff": 0, "ineligible_after_cutoff": 0, "unresolved_no_availability_proof": 0, "unavailable": 0 },
  "status_counts_by_family": { "draft_capital": {}, "age_at_entry": {}, "athletic_testing": {}, "college_production": {}, "official_postdraft_outcome": {} },
  "decision": "<exactly one of the three §14 decision tokens>"
}
```

Every top-level and nested field set is exact and closed (no undeclared key anywhere), matching the
discipline already established in schema `1.0.0`. `evidence_packages` and `derivation_contracts` are
top-level, deduplicated, immutable arrays referenced by id from `rows[]`, since a single evidence
package or derivation contract may be the required input for more than one row (e.g. the same
population-snapshot evidence package underlies every `college_production` row for one season).

## 5. Full governed row key (unchanged from schema `1.0.0`)

```text
source_repository
source_schema
source_player_id
source_season
field_family
```

Every one of the 48 locked identities must have exactly one decision row for every family: `48 × 5 =
240` rows. Zero, multiple, missing, or extra matches fail closed — identical discipline to schema
`1.0.0`.

## 6. Row shape (schema `2.0.0`)

```json
{
  "source_identity": {
    "source_repository": "Prometheus-Frameworks/TIBER-Rookies",
    "source_schema": "rookie-transition-profile-v0.2.0",
    "source_player_id": "rb-jeremiyah-love",
    "source_season": 2026
  },
  "field_family": "draft_capital",
  "mirror_value_literal": "{\"big_board_rank\":2,\"draft_capital_proxy_0_100\":95.0}",
  "availability_status": "unresolved_no_availability_proof",
  "evidence_package_ids": [],
  "blocking_reason": null,
  "computed_available_at": null,
  "review_decision": null,
  "notes": null
}
```

`mirror_value_literal` preserves schema `1.0.0`'s self-certification fix (cross-checked by the
validator against the real pinned mirror value, never trusted from the row alone — the gap closed
proactively before any `1.0.0` review). `availability_status` and `computed_available_at` are
**validator-computed outputs**, never author-declared inputs (§9); a candidate row may propose
`evidence_package_ids` and let the validator derive everything else.

**`evidence_package_ids`/`blocking_reason` reconciliation** (fixed after review: the original draft
required `evidence_package_ids` to be empty for every `unresolved_no_availability_proof` row, which
made it impossible to record *why* an attempted evidence package was rejected — exactly the
diagnostic §12 requires for contradictory/incomplete/competing evidence. The corrected rule:

- `unavailable`: `evidence_package_ids` must be empty and `blocking_reason` must be `null` — the
  mirror value itself is null, so no evidence attempt is meaningful here at all.
- `unresolved_no_availability_proof`: `evidence_package_ids` **may** be non-empty, referencing one or
  more attempted-but-rejected packages (zero or more attempts are both honest states — schema
  `1.0.0`'s baseline, where no attempt was ever made, remains a valid special case with an empty
  list). Whenever `evidence_package_ids` is non-empty, `blocking_reason` must be one of the closed
  reasons in §12.1, explaining why the cited attempt did not resolve the row; whenever
  `evidence_package_ids` is empty, `blocking_reason` must be `null` (nothing was attempted, so there
  is nothing to explain).
- `eligible_at_cutoff`/`ineligible_after_cutoff`: `evidence_package_ids` must be non-empty (the
  accepted evidence) and `blocking_reason` must be `null` (nothing blocked it).

## 7. Common evidence-package contract

Every evidence package is one **immutable, reproducible, record-bound, subject-bound** unit of proof.

### 7.1 Archive citation (required on every package)

```text
repo
commit           # full 40-character lowercase hex SHA; never a mutable ref
path
sha256
media_type       # e.g. application/json, text/csv, text/html
schema_version   # non-null only where a schema applies; else null + schema_not_applicable_reason
original_url
retrieved_at
```

Identical discipline to schema `1.0.0`'s `EvidenceCitation`, extended with `media_type` (needed once
unstructured HTML/text sources are permitted, §7.2). The archive must be independently reproducible
from these coordinates (`git show <commit>:<path>`, hash-verified) — a live URL alone is never
evidence, exactly as schema `1.0.0` already established for the mirror wrapper.

### 7.2 Closed record-locator types

Document-wide substring matching is prohibited. Every package must instead name a **deterministic
record locator with exactly one result**, using exactly one of this closed set:

| Locator | Use case (from the real inventory) | Required fields | Cardinality / failure behavior |
| --- | --- | --- | --- |
| `json_array_exact_match` | Locating one row in a JSON array of objects by exact field equality — the shape of all six current TIBER-Rookies processed files (e.g. one `data/processed/{season}_draft_capital_proxy.json` row where `player_id == "rb-jeremiyah-love"`) | `array_path` (JSON Pointer to the array); `match_fields` (ordered list of `{field, expected_value}`, exact equality, no normalization) | Exactly 1 match required; 0 or ≥2 fails closed |
| `json_object_key` | Locating one value by an exact string key within a JSON object (not an array) | `object_path` (JSON Pointer to the object); `key` (exact string) | Key must exist exactly once; absent key fails closed |
| `json_pointer` | A fixed, unambiguous RFC 6901 pointer directly to one value, usable only when the cited document is a frozen, exact-commit archive (never a live/regenerable file where array indices could shift) | `pointer` | Must resolve to exactly one value; any resolution failure fails closed |
| `csv_primary_key_match` | Locating one row in a CSV file by an exact column match | `key_column`; `expected_value` (exact string, no normalization) | Exactly 1 matching row required; 0 or ≥2 fails closed |
| `governed_text_record_range` | Unstructured HTML/text (e.g. a press release or draft-tracker page) — the only locator usable for `official_postdraft_outcome`'s real evidence today | `extraction_selector` (a deterministic CSS selector, XPath, or fixed byte range, captured against the archived snapshot, never the live page); `extracted_text`; `extracted_text_sha256` | The selector must resolve to exactly the archived `extracted_text`, hash-verified; reviewer transcription alone is never sufficient — extraction must be mechanically reproducible from the archived bytes |

Every locator additionally requires: **record canonicalization** (a deterministic, documented rule
for turning the located record into a fixed byte sequence — e.g. `json.dumps` with sorted keys for
JSON locators, the exact extracted substring for text) and a **record hash** (SHA-256 of the
canonicalized record), so that "this exact record" is itself an immutable, independently verifiable
fact, not just "some bytes matched a rule at validation time." OCR-derived evidence is not authorized
under any locator in schema `2.0.0`.

### 7.3 Derivation contracts — pinned by citation, not transcribed

For families whose value is deterministically computed (§11), the formula itself is a
**derivation contract**: a citation (§7.1 shape, using `path`/commit within `TIBER-Rookies`, not an
external archive) to the exact function(s) that compute the value, plus — for the two formulas fully
recovered and verified in this inventory pass — the literal formula inlined for convenience:

- **`age_at_entry`**: fully recovered and pinnable now. `age_from_dob(dob, season)`:
  `season_start = date(season, 9, 1)`; age = `season_start.year - born.year`, minus 1 if
  `(season_start.month, season_start.day) < (born.month, born.day)`. Cited to
  `scripts/compute_rookie_transition_profile.py::age_from_dob` (equivalently
  `scripts/compute_breakout_age.py::age_from_dob`) at a pinned `TIBER-Rookies` commit.
- **`draft_capital`**: fully recovered and pinnable now. Band table `DRAFT_CAPITAL_RANK_BANDS`:
  `(1,10)→95, (11,20)→85, (21,32)→75, (33,50)→65, (51,75)→55, (76,100)→45, (101,150)→35, (151,∞)→25`.
  Cited to `scripts/compute_rookie_transition_profile.py::expected_band_score` at a pinned commit.
  **Open item for the implementation issue**: the two highest-rank bands (`101-150`, `151+`) are not
  documented in `docs/export-contract.md` alongside the rest of the table; this should be resolved
  (either documented there or explicitly superseded by this design's own pin) before implementation.
- **`athletic_testing`**: **fully recovered and pinnable now** (upgraded from "not fully pinnable" by
  dedicated follow-up research in this design pass, including a direct re-read of
  `scripts/compute_rookie_alpha.py` and empirical cross-checks against real promoted-export rows).
  A two-stage, position-gated resolution, not a single global z-score: (1) `compute_ras_scores()`
  (lines 504-638) builds a raw RAS composite — weighted average of per-metric
  `z_to_score(z) = clamp(0,100, 50 + 16.6667·z)` across forty (0.30, inverted), vertical (0.20),
  broad (0.20), three_cone (0.15, inverted), and size (mean height/weight z-score, 0.15), requiring
  at least one explosive/agility metric; (2) `resolve_athletic_input()` (834-897), dispatching to
  `resolve_wr_athletic_input()` (696-752) or `resolve_rb_athletic_input()` (755-831) for WR/RB,
  selects RAS, a `round(0.55·RAS + 0.45·SPORQ, 4)` blend (RB-gated by a ≥20-point SPORQ-over-RAS
  divergence), SPORQ alone, `RAS_PARTIAL`, or `COMBINE_FALLBACK`, each with its own fixed confidence
  constant (`_ras_confidence()`, 682-693, plus per-branch literals), before `NEUTRAL_DEFAULT`
  (excluded from the mirror). Full detail in §3.3. Cited to `scripts/compute_rookie_alpha.py` at a
  pinned commit.
- **`college_production`**: **fully recovered and pinnable now** (upgraded from "not fully pinnable"
  by dedicated follow-up research, including empirical re-derivation matching real promoted-export
  rows for two real players to the exact decimal). Raw stage: `scripts/compute_production_scores.py`
  — same-season/same-position CFBD population (`build_population()`, 211-291, eligibility floors
  `POSITION_LIMITS`), per-metric z-scoring, position-weighted composite (`composite_z()`, 315-333,
  e.g. RB `0.45·YPC_z + 0.35·TD-rate_z + 0.20·receiving-yards_z`), `z_to_score(z) = clamp(0,100,
  round(50+15z,1))`. Blend stage: `scripts/compute_rookie_alpha.py::blend_production_rows()`
  (904-945): `round(0.60·age_adjusted_production + 0.40·existing_production, 4)`. Penalty stage:
  `apply_context_production_adjustments()` (989-1170) — WR translation penalties (screen/deep/slot
  thresholds, summed and capped at 8.0) and RB penalties (MTF, YAC-consistency, applied
  independently and uncapped), both fully specified in §3.4. **The previously-open cross-family
  dependency question is resolved: `college_production` does not depend on `age_at_entry`.** Its
  age-adjustment input, `effective_breakout_age`, is a separately-computed fact (breakout season, not
  draft-entry season, plus school/teammate adjustments) from `scripts/compute_age_adjusted_production.py`
  and `scripts/compute_breakout_age.py` — see §3.4 for the full formula chain and citation. Cited to
  `scripts/compute_rookie_alpha.py`/`scripts/compute_production_scores.py`/
  `scripts/compute_age_adjusted_production.py`/`scripts/compute_breakout_age.py` at a pinned commit.

## 8. Mirror-wrapper dereferencing (unchanged in kind from schema `1.0.0`)

`mirror_source` keeps the exact discipline already proven in schema `1.0.0`: a pinned Forecast
commit (`MIRROR_SOURCE_COMMIT_PIN`-equivalent for whatever commit is current when v2 is implemented),
dereferenced via `git show`/`git ls-tree` rather than trusted off the live worktree; the wrapper's
`source_lock` (including `commit`), declared `forecast_mirror.paths`, and `mirrored_hashes` all
independently recomputed from the actual bytes at that commit. This design does not change that
contract; it is reused as-is.

## 9. Subject binding — closed methods

Every evidence package must prove its selected record belongs to the locked `source_player_id`,
using exactly one of a closed set. A concrete finding from the inventory (§3.6: one player's `player_name`
is spelled two different ways across two of TIBER-Rookies' own upstream files, joined correctly only
because the join is `player_id`-based, not name-based) is direct evidence for why name-only binding
is prohibited outright, not merely discouraged.

| Method | When usable | What it proves |
| --- | --- | --- |
| `exact_source_player_id` | The archived record itself carries a `player_id`/equivalent field, byte-for-byte, case-sensitive equal to `source_identity.source_player_id`. Directly usable for TIBER-Rookies' own six processed files (all confirmed keyed this way), though per §3.0 those files are rarely themselves sufficient *evidence* — this method may still be used when the archived record IS the original public source and happens to carry the exact slug (uncommon in practice for external sources). | Exact identity match, no inference. |
| `exact_governed_source_record_id` | The archived record carries a different stable identifier (e.g. a CFBD athlete ID) that a **separately governed, TIBER-Rookies-owned** crosswalk artifact (not Lane A's Forecast-side GSIS crosswalk, which Lane B must remain independent of) proves equals `source_player_id`. **No such governed source-side crosswalk was found to exist today** for any of the six inventoried files — flagged as a real, currently-unfilled gap, not assumed to exist. | Identity via an independently governed alias mapping. |
| `pinned_governed_alias_artifact` | The archived record identifies its subject only by name/team/position/school (the common case for real external evidence — e.g. a press release naming "Wright" or a draft tracker naming "Jeremiyah Love") — binding is proven via a **separately pinned, human-reviewed, hash-cited alias decision** stating "archived record (hash X) refers to `source_player_id` Y," never a fuzzy/normalized/best-effort match computed at validation time. | A governed, attributable, one-time human identity decision, cited immutably — not re-derived or re-guessed per validation run. |

**Explicitly prohibited, unconditionally, regardless of confidence:** name-only matching,
normalized-name equality, fuzzy matching, position+name, school+name, first-match/best-effort,
confidence-score-alone, and reviewer assertion alone (i.e., a human simply asserting "this is the
right player" without one of the three methods above backing it). If a record cannot be bound
without a prohibited method, the row remains `unresolved_no_availability_proof` — full stop.

## 10. Typed availability-time semantics

### 10.1 Closed `availability_time_kind` enum

```text
source_record_published_at
governed_snapshot_public_release_at
official_release_manifest_at
```

### 10.2 Explicitly prohibited substitutes for `available_at`

```text
event_time
retrieved_at
archive_capture_at
generated_at
ingested_at
last_verified_at
mirror_refreshed_at
file modification time
git author date
reviewed_at
```

This list is not abstract: §3.7 found that every structured timestamp in the *current* pipeline is
exactly one of these prohibited kinds (`last_verified_at`, `ingested_at`) — confirming that no
existing field in today's data could ever satisfy `available_at` under this contract, by design.

### 10.3 Required assertion shape

Every accepted availability assertion must carry: `availability_time_kind`; the record locator or
source-field selector it was extracted from (reusing §7.2's locator contract — the timestamp must
resolve from the *same* selected/hashed record as the subject-bound value, not a different part of
the document); the exact extracted timestamp string; `source_timezone_or_offset` (numeric offset
only — `Z` or `±HH:MM`; schema `2.0.0` does not define a deterministic named-timezone conversion, so
named zones such as `ET` remain unsupported, identical to the numeric-offset-only rule already
enforced in schema `1.0.0`); a normalization rule (how the raw extracted string maps to a
fully-qualified ISO-8601 instant); and machine-verifiable proof the timestamp belongs to the *same*
record as the bound value and subject (not merely present somewhere in the same document — this is
the specific record-level binding gap schema `1.0.0`'s reviewers identified).

`available_at` on a row is **computed by the validator from the evidence assertion(s)**; it is never
accepted as an independent author-supplied claim (§9/§11 of the parent issue's framing, carried
through here).

### 10.4 Bare dates

If a source supplies only a bare date (no time-of-day), the contract does not manufacture midnight
in an assumed timezone. Schema `2.0.0` does not fully design interval semantics for this case;
**prefer leaving such a claim `unresolved_no_availability_proof`** until interval handling is
designed as separate follow-up, per the parent issue's explicit preference.

## 11. Cutoff contract

One reproducible cutoff package for the 2026 pre-draft simulation. Per §3.9, **no NFL draft-schedule
data exists in either TIBER-Rookies or TIBER-Data** — this evidence must come from an independent
external archive (e.g. the league's own draft-day schedule announcement), using the same §7.1/§7.2
citation and locator contract as any other evidence package. The selected schedule record must prove,
bound together in the *same* record (not merely co-occurring on the same page):

```text
season = 2026
event = NFL Draft Day 1 / Round 1 start
published_draft_start_at
source timezone or offset (numeric only)
```

**Cutoff policy:**

```text
cutoff_policy: one_second_before_published_round1_start
cutoff_at = published_draft_start_at - PT1S
```

The artifact may store the computed `cutoff_at`, but the validator must independently recompute it
from the pinned `published_draft_start_at` and reject any disagreement — the same
never-trust-the-self-report discipline already used throughout schema `1.0.0`'s mirror
dereferencing. The cutoff additionally requires attributable human review after machine validation
(§12); human review can never substitute for the archive-and-record proof itself.

## 12. Status computation — validator-computed, never self-declared

```text
mirror value is null
    -> unavailable

mirror value is present
and no complete accepted evidence package exists
    -> unresolved_no_availability_proof

mirror value is present
and complete accepted evidence exists
and computed_available_at < computed_cutoff_at
    -> eligible_at_cutoff

mirror value is present
and complete accepted evidence exists
and computed_available_at >= computed_cutoff_at
    -> ineligible_after_cutoff
```

`official_postdraft_outcome` may never resolve to `eligible_at_cutoff` — complete evidence yields
only `ineligible_after_cutoff` or (incomplete proof) `unresolved_no_availability_proof`. Contradictory,
incomplete, or multiple competing evidence packages for one row fail closed to
`unresolved_no_availability_proof` with an explicit blocking reason recorded — the validator never
selects a "best" timestamp among disagreeing candidates.

### 12.1 Closed `blocking_reason` enum

Recorded on a row (§6) whenever `evidence_package_ids` is non-empty but the row still resolves to
`unresolved_no_availability_proof` — i.e., evidence was attempted and mechanically rejected, and the
reason is itself part of the governed, auditable record, not narrative prose:

```text
zero_record_matches
multiple_record_matches
cross_record_mismatch                          # value/timestamp/subject bound to different records
prohibited_subject_binding_method
availability_time_kind_missing_or_prohibited
contradictory_evidence
incomplete_evidence
cohort_or_population_mismatch
derivation_contract_mismatch
archive_or_record_hash_mismatch
other_explicit_reason                          # requires a non-null `notes` explanation
pending_human_review                           # mechanically complete; no reviewer has rendered a decision yet (§15.4)
human_review_rejected                          # a reviewer explicitly rejected mechanically complete evidence (§15.4)
human_review_needs_followup                    # a reviewer marked mechanically complete evidence needs_followup (§15.4)
```

`null` whenever `evidence_package_ids` is empty (nothing attempted) or the row is `unavailable`
(nothing to evidence) or `eligible_at_cutoff`/`ineligible_after_cutoff` (nothing blocked it).

## 13. Derived-value availability rule

```text
computed_available_at =
    max(all required source-record public-availability timestamps,
        all required derivation-contract availability timestamps,
        all required cohort/context snapshot availability timestamps)
```

A row may not choose one favorable component while ignoring a later required dependency. Every input
actually used to reproduce the exact mirrored value must be included in the maximum. Concretely, per
family (§14): `draft_capital` = max(big-board snapshot, band-table derivation contract);
`age_at_entry` = max(DOB record, reference-date contract, age-formula contract); `athletic_testing` =
max(combine testing record, same-season/same-position cohort-population snapshot, RAS-composite
derivation contract, resolution-priority derivation contract, and — only when a SPORQ-involving
branch is selected — the separately-archived SPORQ-percentile source record); `college_production` =
max(raw stat record(s), population/cohort snapshot, raw-formula contract, the archived per-player-
season volume record(s) underlying `effective_breakout_age`, the breakout-season DOB record and
school/teammate-adjustment inputs feeding `effective_breakout_age` (**resolved: this is a genuinely
separate fact from `age_at_entry`, per §3.4/§7.3 — `age_at_entry`'s own `computed_available_at` is
never a required input here**), blend-weight contract, applicable penalty-formula contract);
`official_postdraft_outcome` = the single bound outcome record's public-release time (no derivation
contract, since this family is a fact carry-through, not a computed score).

## 14. Family-specific evidence contracts

Each contract below states exactly what an accepted evidence package must contain, grounded in §3's
real findings, plus one hypothetical valid and one hypothetical invalid (cross-record) example.
**All examples below are documentation illustrations only — no real evidence has been assembled or
archived, and none of these examples describes an actual finding about a real player.**

### 14.1 `draft_capital`

Requires: one exact player-specific big-board snapshot record (via `governed_text_record_range` for
a scouting big-board publication, or `json_array_exact_match` if a structured big-board export ever
exists), naming the exact `big_board_rank`, with a `source_record_published_at` assertion; plus the
pinned proxy-band derivation contract (§7.3). The validator recomputes `draft_capital_proxy_0_100`
from the archived `big_board_rank` and the pinned band table — the mirrored proxy number is never
accepted merely because an archive contains the final number. Family availability =
`max(big-board snapshot availability, band-table derivation-contract availability)`.

- *Hypothetical valid package*: a `governed_text_record_range` locator over an archived big-board
  publication page, extracting the exact substring `"#2 RB — Jeremiyah Love, Notre Dame"` (hash-pinned),
  bound to `source_player_id: rb-jeremiyah-love` via `pinned_governed_alias_artifact`, with
  `availability_time_kind: source_record_published_at` extracted from the same page's dateline.
- *Hypothetical invalid (cross-record) example*: a package citing the correct `big_board_rank` from
  one big-board archive page, but sourcing `published_draft_start_at`-style dating from a *different*,
  later page about a different player's ranking — fails closed because the value and its timing
  assertion were not extracted from the same located, hashed record.

### 14.2 `age_at_entry`

Requires: an exact DOB source record (e.g. a combine biographical listing, `json_array_exact_match`
or `governed_text_record_range` depending on the real source format), exact subject binding, a
`source_record_published_at` (or equivalent) assertion for that record; plus the pinned reference-date
(September 1 of season) and `age_from_dob` derivation contracts (§7.3, both fully recovered). The
validator recomputes the mirrored age from the archived DOB and pinned formula. Leap-day DOBs are
handled by ordinary calendar-date arithmetic (no special-case needed, since the comparison is on
`(month, day)` tuples). A final age literal with no DOB-record and derivation evidence is invalid.
Family availability = `max(DOB record, reference-date contract, age-formula contract)`.

- *Hypothetical valid package*: a `governed_text_record_range` locator over an archived, official
  combine bio page stating `"Born: 03/15/2005"` for the exact bound player, `availability_time_kind:
  source_record_published_at` from the same page's publish date.
- *Hypothetical invalid (cross-record) example*: a DOB correctly extracted from one player's combine
  bio, but the claimed `available_at` timestamp copied from a *different* player's bio page release
  date — fails closed, since the timestamp doesn't belong to the same bound record.

### 14.3 `athletic_testing`

Requires: the exact player-specific testing record and all raw measurements needed to reproduce the
mirrored RAS composite (measurement names, units, unit normalization, the event/source record, a
`source_record_published_at` assertion), plus — since the RAS composite is cohort-relative (§3.3) —
the complete same-season, same-position combine-cohort population snapshot, plus the pinned
RAS-composite and resolution-priority derivation contracts (§7.3, **now fully recovered**). Because
resolution is position-gated and branches (RAS / RAS_SPORQ_BLEND / SPORQ / RAS_PARTIAL /
COMBINE_FALLBACK — §3.3), the evidence contract must additionally record **which branch applies** and
supply that branch's specific required inputs: a SPORQ-involving branch requires a separately archived
SPORQ-percentile source record (from `prospect_context.json`'s `exceptional_metrics`) with its own
`source_record_published_at`, distinct from the combine record. A `NEUTRAL_DEFAULT` outcome carries no
evidence contract at all — it mirrors to `unavailable`, not a scored value (§3.3). A testing-event date
alone (with no measurement values, or no cohort snapshot) is not availability proof. Family
availability = `max(testing record, cohort-population snapshot, RAS-composite and resolution-priority
derivation-contract availability, and — only when selected — the SPORQ-record availability)`.

- *Hypothetical valid package*: a `json_array_exact_match` locator over an archived, official combine
  results export, naming the exact measurements (40-yard time, vertical, etc.) for the bound player,
  plus a second evidence package for the archived same-season, same-position full combine-cohort
  snapshot, with the row recording `athletic_source: RAS` (no SPORQ package needed for this branch).
- *Hypothetical invalid (cross-record) example*: a package citing this player's real combine
  measurements, but reusing a *different* season's cohort-population snapshot to justify the z-score
  — fails closed, since the population used to compute the score must be the same season's.
- *Hypothetical invalid (missing-branch-input) example*: a row recording `athletic_source:
  RAS_SPORQ_BLEND` with an archived combine record and cohort snapshot but no archived SPORQ-percentile
  source record — fails closed, since the blend branch's second required input was never supplied.

### 14.4 `college_production`

Requires: the exact player-specific raw stat record(s) (season, stat window, games/sample definition,
position-specific inputs), a `source_record_published_at` assertion for each required source record,
the pinned raw z-score formula and eligibility-floor contract, the pinned same-season/same-position
population/cohort snapshot, and — **now that the cross-family dependency question is resolved
(§3.4/§7.3: `college_production` depends on `effective_breakout_age`, a genuinely separate fact from
`age_at_entry`, never on `age_at_entry`'s own row)** — the archived per-player-season volume record(s)
(`wr_route_profiles/`/`qb_play_profiles/`/`rb_play_profiles/`, newly identified in this pass as
required upstream evidence beyond the original six files), the breakout-season DOB record and
school/teammate-adjustment inputs underlying `effective_breakout_age`, and the pinned age-multiplier/
weighted-volume/blend-weight and applicable WR/RB penalty derivation contracts (all fully recovered,
§7.3). A final `production_score_0_100` literal alone is insufficient. If the score depends on a full
population distribution, the entire pinned population snapshot is part of the evidence contract, not
an assumed constant. Family availability = `max(all required raw records, population/cohort snapshot,
the volume and breakout-age records feeding `effective_breakout_age`, all required derivation-contract
availabilities)`.

- *Hypothetical valid package*: a `json_array_exact_match` locator over an archived, official CFBD
  season-stats export for the bound player, plus a separate evidence package for the archived
  same-season/same-position eligible population snapshot, plus a separate evidence package for the
  archived per-player-season volume record(s) and breakout-season DOB record underlying
  `effective_breakout_age`, plus citations to the pinned raw-formula, age-adjustment, and
  blend/penalty derivation contracts.
- *Hypothetical invalid (cross-record) example*: correct raw per-player stats, but a population
  snapshot drawn from a different position group (e.g. using the WR population to z-score an RB) —
  fails closed on cohort mismatch.
- *Hypothetical invalid (wrong-age-fact) example*: a package that substitutes the row's own
  `age_at_entry` evidence for the required `effective_breakout_age` evidence — fails closed, since
  they are different facts computed via different paths (§3.4) and one is never a substitute for the
  other.

### 14.5 `official_postdraft_outcome`

Two structured evidence variants, matching the two real mirror sub-shapes (§3.6):

- **Drafted**: must bind the player to draft year, team, round, overall pick, and an official
  release timestamp — via `governed_text_record_range` over an archived official draft-tracker or
  league announcement page (the real, current best source, per the inventory, is exactly this kind
  of page — e.g. the free-text-only "NBC Sports … published 2026-04-25" reference already present in
  today's `source_name`, which under v2 must become an actual archived, hash-pinned, locator-bound
  record rather than unstructured prose).
- **UDFA**: must bind the player to signing team, the transaction/announcement record, and an
  official public-release timestamp — via the same locator contract over an archived team
  announcement (e.g. the real "Eagles announced Wright…" reference already present in today's data).

This family is always post-cutoff under the pre-draft simulation and can therefore only become
`ineligible_after_cutoff` (complete evidence) or `unresolved_no_availability_proof` (incomplete) —
never `eligible_at_cutoff`. `ingested_at`, `last_verified_at`, or any later mirror-generation
timestamp is never the official outcome's availability time (§10.2) — this directly closes the gap
found in §3.6, where the only currently-recorded timestamp for this family is an ingestion stamp, not
a public-release date.

- *Hypothetical valid package*: a `governed_text_record_range` locator over an archived team
  press-release page naming the bound player as a signed UDFA, with `availability_time_kind:
  source_record_published_at` extracted from the same page.
- *Hypothetical invalid (cross-record) example*: the correct outcome record for one player, but an
  availability timestamp extracted from a *different* team's unrelated announcement page — fails
  closed for the same same-record-binding reason as every other family above.

## 15. Human-review contract

Machine validation occurs first. A terminal `eligible_at_cutoff`/`ineligible_after_cutoff` decision
additionally requires one attributable human sign-off covering: the selected record, the subject
binding, the value reconstruction, the availability-time semantic role, and the computed status.
Reviewing this one object is defined to attest to all five dimensions together — schema `2.0.0` does
not support a partial/scoped review that covers only some of them.

### 15.1 Canonical `review_decision` object (fixed after review: the original draft named this
object but never specified its fields)

```json
{
  "outcome": "accepted",
  "reviewer": "Jane Reviewer",
  "reviewed_at": "2026-07-13T18:00:00-04:00"
}
```

| Field | Type | Requirement |
| --- | --- | --- |
| `outcome` | closed enum `accepted \| rejected \| needs_followup` | required, non-null whenever the object itself is present |
| `reviewer` | string | required, non-empty, an attributable named human identity — never a bot/system account, never blank |
| `reviewed_at` | string | required, a parseable date or offset-bearing instant |

Exactly these three fields — no undeclared extra key, matching the exact-field-closure discipline
already used everywhere else in this contract. `retrieved_at` stays on each evidence-package citation
(§7.1) and is never duplicated onto `review_decision` — the two dates answer different questions
(when was this specific archive retrieved, versus when did a human sign off on the row as a whole).

### 15.2 Nullability by status (fixed after review: this was previously unstated)

| `availability_status` | `evidence_package_ids` | `review_decision` |
| --- | --- | --- |
| `unavailable` | must be empty | must be `null` — nothing was ever attempted or reviewable |
| `unresolved_no_availability_proof` | empty | must be `null` — nothing attempted, nothing to review |
| `unresolved_no_availability_proof` | non-empty | **may** be `null` (mechanically incomplete, or mechanically complete but not yet reviewed) or non-null with `outcome: "rejected"` or `outcome: "needs_followup"`. `outcome: "accepted"` is never valid here — an accepted review of mechanically complete evidence must produce `eligible_at_cutoff`/`ineligible_after_cutoff` instead; a row that is simultaneously `unresolved_no_availability_proof` and carries an `accepted` review is itself invalid and fails closed. |
| `eligible_at_cutoff` / `ineligible_after_cutoff` | must be non-empty | must be non-null with `outcome: "accepted"` |

### 15.3 Chronology across multiple evidence packages (fixed after review: the original draft said
only `reviewed_at >= retrieved_at` without stating which `retrieved_at` when a row cites more than
one package)

```text
reviewed_at >= max(retrieved_at across every evidence package in this row's evidence_package_ids)
```

Review cannot precede the retrieval of any package it is attesting to — carried forward from schema
`1.0.0`'s already-proven chronology discipline, generalized to the multi-package case. Review
approval alone can never overcome failed machine validation — a human cannot mark a row `accepted`
if the mechanical record-binding, subject-binding, or timestamp checks failed; the row stays
`unresolved_no_availability_proof` regardless of what a reviewer asserts.

### 15.4 `blocking_reason` values for human-review outcomes

§12.1's closed `blocking_reason` enum includes three values specific to this stage —
`pending_human_review`, `human_review_rejected`, `human_review_needs_followup` — recorded when
`evidence_package_ids` is non-empty and mechanical validation passed, but the row is still
`unresolved_no_availability_proof` because of the human-review stage specifically (no reviewer has
acted yet, or a reviewer explicitly declined to accept).

## 16. Migration rules from schema `1.0.0`

- Schema `1.0.0` remains immutable and valid as the missingness-only historical baseline; it is not
  modified by this design or by any future schema `2.0.0` implementation.
- No `1.0.0` row is automatically upgraded to `2.0.0`. A future `2.0.0` artifact is a separately
  generated document.
- The 17 existing `1.0.0` `unavailable` decisions may be reproduced from the same pinned mirror, but
  must still be regenerated under the new `2.0.0` validator, not copied forward.
- The 223 `1.0.0` `unresolved_no_availability_proof` rows remain unresolved under `2.0.0` until real
  v2 evidence actually passes the new validator — no row is assumed resolved by virtue of having
  existed in `1.0.0`.
- No evidence or review is inherited merely because it appeared in a prior PR description, this
  design document's hypothetical examples (§14), or any audit narrative. Every hypothetical example
  above is explicitly a documentation illustration, not evidence toward any real row.

## 17. Required future validator tests (negative-test matrix for the implementation issue)

```text
value and timestamp in different records
timestamp from a different player
value from a different player
correct player but wrong field family
primitive incidental-value match
zero record matches
multiple record matches
name-only subject binding
wrong source season
archive hash mismatch
record hash mismatch
typed timestamp role missing
event_time substituted for available_at
retrieved_at substituted for available_at
bare date coerced to midnight
cutoff record is not Day 1 / Round 1 start
cutoff timezone mismatch
derived field missing one input
derived field formula mismatch
derived field rounding mismatch
normalization cohort mismatch
computed_available_at omits a later dependency
row status disagrees with recomputed status
official_postdraft_outcome marked eligible
review accepted before machine validation
review timestamp before retrieval
missing/extra/duplicate 240-row key
runtime/model/UI import
```

## 18. Lifecycle and authorization boundaries

```text
v2 evidence-contract design (this issue/PR)
        v
separate v2 implementation issue
        v
empty/migrated v2 scaffold and validator
        v
cutoff evidence population and review
        v
small row-family evidence batches
        v
full 240-row Lane B audit
        v
Lane B terminal review
```

This design PR does not jump ahead of step 1. It does not authorize any of steps 2-7.

## 19. Hard boundaries — this PR does not

```text
modify the schema 1.0.0 artifact
modify the current 1.0.0 validator or CLI
pin a real cutoff
archive real player evidence
populate any eligible or ineligible row
perform human sign-off
modify TIBER-Rookies or TIBER-Data
populate the integrated readiness matrix
run an experiment
create a feature adapter
evaluate MAE, RMSE, calibration, or predictive usefulness
authorize runtime, production, downstream, or UI use
close Issue #160
```

## 20. Decision (exactly one)

```text
may_open_rookie_transition_profile_forecast_availability_evidence_v2_implementation_issue
```

**Rationale:** the required source-and-derivation inventory is now complete for all five families.
`draft_capital` and `age_at_entry` were fully pinnable from the outset. `official_postdraft_outcome`
is fully understood structurally, with an evidence-source-only gap remaining (an archived record vs.
free-text `source_name`, not a formula gap). `athletic_testing` and `college_production` — flagged in
an earlier review as under-specified (exact formula coefficients and a possible cross-family
dependency deferred) — were resolved by dedicated follow-up research in this same design pass:
`athletic_testing`'s real two-stage, position-gated resolution (RAS composite, SPORQ blend/priority
logic) is now fully recovered and empirically verified against real promoted-export rows;
`college_production`'s age-adjustment and WR/RB penalty formulas are now fully recovered and
empirically verified against real committed data for two players; and the cross-family dependency
question is resolved as **no dependency exists** — `college_production` depends on a separately-
computed `effective_breakout_age`, never on `age_at_entry`'s own row. Every family now has a fully
pinnable derivation contract (§7.3) and a proposed record-bound, subject-bound, semantically-typed
evidence contract (§14); the cutoff contract, common archive/locator/subject-binding/availability-time
contracts, status-computation rules, human-review contract, migration rules, and negative-test matrix
are all specified. This decision authorizes only a separate implementation issue for schema `2.0.0`
and its validator — it does not authorize evidence population, Lane B completion, the integrated
readiness review, experiment design, feature use, production binding, or activation, and it does not
close issue #160.

## 21. Acceptance criteria

- [x] The source inventory reflects the real implementation (verified against actual TIBER-Rookies
      code and data at commit `2ef92fa`, with `athletic_testing`'s and `college_production`'s formulas
      additionally empirically cross-checked against real promoted-export rows), not assumptions —
      the athletic/production exact-formula recovery and age↔production cross-family dependency
      questions were fully resolved during this pass; the draft-capital band documentation gap and
      DOB-sourcing heterogeneity (§3.2) remain genuinely open and are recorded explicitly, not
      smoothed over — neither was in scope for this pass's follow-up research.
- [x] Every accepted timing claim design is record-bound and semantically typed (§7.2, §10).
- [x] Every family has its own exact, fully-recovered evidence and derivation contract (§14), pinned
      by citation to the exact function(s) and line ranges (§7.3).
- [x] All derived mirror values are designed to be reproducible from pinned inputs (§13); all five
      families' derivation formulas are now fully recovered, not merely shaped/approximated.
- [x] `available_at` and `availability_status` are validator-computed, never self-declared (§10.3, §12).
- [x] The cutoff is derived from one exact Day 1/Round 1 schedule record (§11), sourced externally
      since no such data exists in either repo (§3.9).
- [x] The design prevents cross-record string co-occurrence (§7.2, §14 invalid examples) and
      name-only subject binding (§9).
- [x] Schema `1.0.0` remains untouched (§19).
- [x] This Markdown and its JSON companion agree exactly.
- [x] This PR is docs and contract only.
- [x] The terminal decision (§20) is correctly bounded.
