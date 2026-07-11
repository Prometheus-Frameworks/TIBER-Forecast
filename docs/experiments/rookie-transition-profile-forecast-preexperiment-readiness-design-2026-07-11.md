# Pre-experiment readiness gate design: rookie_transition_profile_v0.2.0 (Forecast #155)

> **Status: documentation/schema design only.** This document does not create a real identity
> crosswalk, does not resolve any of the 48 mirrored identities, does not perform the
> source-availability audit, does not declare any field temporally eligible, does not populate a
> readiness matrix, and authorizes no experiment, model use, or production activation. It defines
> the contracts two future, separate prerequisite issues must satisfy, and the integrated review gate
> that must pass before any controlled-experiment design may even be proposed.

## 0. Relationship to prior work

- Chain: `#149/PR#150` (consumption contract) → `#151/PR#152` (inert mirror implementation) →
  `#153/PR#154` (independent rehearsal, merge `b89152d78d8fc6dc71107c6d94747db1f234cbc5`). The
  rehearsal's decision, `may_open_rookie_transition_profile_forecast_preexperiment_readiness_design_issue`,
  is what authorizes this document.
- **Locked and preserved, not reinterpreted:**
  - Forecast mirror lineage: rehearsal merge `b89152d78...`, mirror-implementation merge
    `6f67c3ee8...`, consumption-design merge `6c68b1691...`.
  - Upstream source lock: `Prometheus-Frameworks/TIBER-Rookies` at commit
    `2ef92faf9a9c91a393f53e9140428451529a1c48`, schema `rookie-transition-profile-v0.2.0`, season
    `2026`, `48` rows.
  - Current state: 48 source identities, 0 resolved to any Forecast canonical identity; all field
    families audit-only; pre-draft temporal eligibility unresolved for every family; no phase
    projection; no experiment/model/production/downstream/UI authorization.

## 1. Select the Forecast canonical identity

**Selected: the NFL GSIS player identifier** (format `NN-NNNNNNN`, e.g. `00-0033873`), as ingested
and passed through — never invented — by TIBER-Data.

**Evidence this is already the de facto standard, not a new invention:**

- TIBER-Data's own column-mapping policy for its 2025 roster artifact states
  `player_id <- gsis_id (fallback player_id only if present)`
  (`Prometheus-Frameworks/TIBER-Data:docs/data/roster-player-team-map-source-backed-2025.md`).
  Its promoted `player_season_coverage_v0.json` (the artifact Forecast's own `player_history` capability
  already consumes) carries `player_id` values in exactly this format (verified directly:
  `00-0019596`, `00-0022924`, ...).
- Forecast's own existing `player_history` contract already documents its `player_id` as
  `"gsis_id-equivalent, source-verified identity only"`
  (`docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md`).
- `docs/ownership-boundaries.md` assigns "canonical IDs, source truth, and provenance governance" to
  TIBER-Data, never to Forecast — consuming an externally-assigned, already-governed identifier is
  consistent with that boundary; Forecast inventing its own identity scheme would not be.

**Specification:**

| | Value |
| --- | --- |
| Field name | `gsis_id` (nflverse's own name; TIBER-Data's promoted artifacts expose it as `player_id`) |
| Owning repository | External: nflverse (the assigning authority). Passed through, not owned, by TIBER-Data. |
| Owning artifact class | TIBER-Data's promoted roster/production/outcome artifacts (e.g. `exports/promoted/nfl/player_season_coverage_v0.json`) that already carry this field per their own documented column-mapping policy |
| Schema/version | No uniform `schema_version` envelope convention exists across TIBER-Data today (`docs/governance/cross-repo-governance-v0.md` itself names a `promoted_artifact_envelope_v0` contract as future, not-yet-built work). Where a promoted artifact self-declares one, it must be cited exactly: e.g. `player_season_coverage_v0.json` currently pins `artifact_id: "player_season_coverage_v0"`, `spec_version: "player_season_coverage_v0_promoted_v1"`, `promoted_artifact_sha256: "d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac"`, `promotion_review: "TIBER-Data#202"`. Where no self-declared version exists (e.g. the 2026 rookies draft-result identity reference, `nfl_draft_results_2026.json`), the exact git commit SHA plus file path is the only durable citation — "whatever the artifact declares at consumption time" is not itself a citation and must never be treated as one; a consuming implementation must always pin an exact commit SHA together with any self-declared schema/spec_version string, never one without the other |
| Grain / uniqueness | One `gsis_id` per real player, for their entire career — TIBER-Data's own fail-closed rules already reject rows with missing/blank `player_id` and reject duplicate `(season, week, player_id)` grain within a single roster snapshot |
| Season-independent or season-scoped | **Season-independent.** A player keeps the same `gsis_id` across every season of their career. |
| Aliases / historical identity changes | Not owned by this design. If a player's assigning authority (nflverse) ever changes or corrects a `gsis_id`, that correction is TIBER-Data's/nflverse's to publish; Forecast consumes whatever TIBER-Data's governed artifact declares as of the artifact's own commit, never reinterprets it locally |
| External IDs: authoritative or supporting-only? | **Authoritative.** `gsis_id` is not merely corroborating evidence for some other Forecast-owned identity — it *is* the canonical identity this design selects. |

**Explicitly rejected candidates, with reasons:**

- **TIBER-Rookies' own `player_id`** (e.g. `te-daequan-wright`) — confirmed in the #149 design and
  reconfirmed here to be a locally-scoped, position-prefixed name slug with no known crosswalk to
  `gsis_id`. Not canonical.
- **TIBER-Data's `nfl_draft_results` artifact's own `player_id` field** — directly verified (reading
  `Prometheus-Frameworks/TIBER-Data:exports/promoted/nfl_draft_results/nfl_draft_results_2026.json`)
  to carry **TIBER-Rookies' own slug format** for confirmed rows (e.g. `qb-fernando-mendoza`), not a
  `gsis_id`. This field must never be mistaken for, or substituted as, the Forecast canonical
  identity — it is TIBER-Rookies' identity carried forward into a different TIBER-Data artifact, not
  a resolution to `gsis_id`.

**Real-world timing constraint this design must name, not paper over:** a 2026 draftee's `gsis_id`
may not yet be discoverable in any TIBER-Data-ingested source until nflverse itself first publishes
it — typically upon that player's first official-roster or game appearance. For UDFA signings and
late roster cuts, this may be well after the draft, or may never happen for players who never make an
active NFL roster. This is an external dependency neither TIBER-Data, TIBER-Rookies, nor Forecast
controls; Lane A (below) must treat "not yet discoverable" as a legitimate, expected `unresolved`
state, not a defect to engineer around.

## 2. Define the future crosswalk grain

**Selected grain:**

```text
(source_repository, source_schema, source_player_id, source_season) -> forecast_canonical_player_id
```

with `resolution_status` and `resolution_evidence` as attributes of that key, not part of it.

**`source_season` belongs in the primary key, not only in evidence context.** TIBER-Rookies'
`player_id` slugs are confirmed unique only *within* one draft-class snapshot (48 unique of 48 for
2026); nothing establishes they are unique *across* seasons — a future draft class could plausibly
produce a slug collision with a past one (e.g. two different players who'd each generate
`wr-john-smith`). Treating `(source_repository, source_schema, source_player_id)` alone as the key
would silently conflate two different real people if that ever happened. Including `source_season`
in the key is the fail-closed choice.

## 3. Define permitted identity evidence

Three permitted classes, ranked strongest to weakest. **None may be used alone if it fails its own
stated corroboration requirement** — an insufficiently corroborated attempt must resolve to
`conflicting_evidence` or remain `unresolved`, never a weakly-supported `resolved`.

### 3.1 Corroborated overall-pick chain (strongest when available; drafted rows only; **currently unavailable — see status below**)

Joins TIBER-Rookies' `official_postdraft_outcome.value.overall_pick` (present only for
`status: "drafted"` rows — 47 of 48 in the current mirror) against a TIBER-Data-governed, promoted
draft-results artifact carrying the same `overall_pick`, whose own confirmed `gsis_id` would be drawn
from a **separate**, governed TIBER-Data roster/production artifact — never from TIBER-Rookies
itself, and never from the draft-results artifact's own `player_id` field (§1 explicitly rejects that
field as a `gsis_id` source).

This mirrors a real, existing TIBER-Data precedent for the *first* leg only: its own
`data/raw/rookies/2026/2026_tiber_rookies_draft_result_id_reference_v0.json` already resolves
draft-result rows to TIBER-Rookies identity using `overall_pick` as the sole join key — explicitly
**not** name-based (`docs/data/nfl-draft-results-v1.md`: *"Player names in that reference are audit
context only and must not be used as the sole mapping key because known name variants can exist"*).

**Current status: `blocked_pending_second_leg_evidence`.** Directly checked (2026-07-11) against
`Prometheus-Frameworks/TIBER-Data`: no governed TIBER-Data artifact today defines the **second** leg
— a join from a draft-results row (or the 2026 rookies reference row) to a `gsis_id`-bearing row.
Specifically:

- `exports/promoted/nfl/player_season_coverage_v0.json` (`artifact_id: "player_season_coverage_v0"`,
  `spec_version: "player_season_coverage_v0_promoted_v1"`) is the only artifact in the repository
  whose rows carry both a GSIS-format `player_id` (100% conformant, e.g. `00-0019596`) and a
  `draft_pick`/`draft_round`/`draft_team`/`draft_year` set of fields — structurally the right shape.
  But (a) it has **zero rows for `draft_year: 2026`** (its populated `draft_year` values run only
  through 2025, since it is built from completed-season stats), and (b) `draft_pick` is not declared
  in either `schemas/player_season_coverage_v0.schema.json` or
  `schemas/player_season_coverage_v0_promoted.schema.json` — it passes through only via
  `additionalProperties: true` and is independently audited at just ~67% population even for
  historical seasons (`docs/reports/player-season-coverage-v0-2021-source-availability.md`:
  424/633 for the 2021 cohort). It is an unaudited passthrough field, not a governed, enforced join
  column.
- No other checked artifact combines the two: `nfl_draft_results_2026.json` has no GSIS-shaped field
  at all; `exports/promoted/identity_crosswalk/tiber_identity_crosswalk_v1.json` is a Sleeper-provider
  crosswalk only (no draft-pick field, `supported_providers: ["sleeper"]`); the one promoted artifact
  that does declare both a `draft_pick` and a `player_id` field
  (`exports/promoted/rookie-replay/historical_rookie_replay_v0.json`) contains only fixture rows
  (`player_id: "fixture_ashton_jeanty"`, `source: "offline_fixture:..."`) — not real data.

**Therefore class 3.1 must not be used by any future Lane A implementation until one of the following
is satisfied and pinned by exact repository, commit, path, schema/spec_version, and hash:**

1. A single governed TIBER-Data artifact whose row directly contains
   `(draft_year, overall_pick, gsis_id)` together, with `gsis_id` declared as a governed/enforced
   column in that artifact's own schema (not an unaudited `additionalProperties` passthrough); or
2. A fully governed, documented second-leg join key — asserted as a contractual join key by
   TIBER-Data's own docs, never name/team/position inference — linking a draft-results row to a
   `gsis_id`-bearing row.

Until either precondition is met and cited, **all 47 currently-drafted rows in the current mirror
must be resolved (if at all) via §3.2, or remain `unresolved`.** Class 3.1 is retained in this design
only as the target contract a future, separate TIBER-Data-side or Forecast-side artifact could
satisfy — it is not an available evidence path today.

Requirements (apply only once the precondition above is satisfied and class 3.1 becomes available):

- Exact repository, commit, path, schema, and hash citation for **both** TIBER-Data artifacts used
  (the draft-results artifact and the roster/production artifact supplying the `gsis_id`), or for the
  single combined artifact if precondition 1 is what was satisfied.
- The join key is `overall_pick` alone — an exact, unambiguous positive integer. No secondary
  matching field (name, position, team) may be required for this class to apply, but if the
  drafting team recorded in both artifacts disagrees for the same `overall_pick`, that is itself a
  `conflicting_evidence` signal, not something to resolve by picking one source.
- Does not apply to `udfa_signed` rows (no `overall_pick` exists for an undrafted signing) — those
  rows must use §3.2.
- Single-source corroboration is sufficient for this class specifically, because the join key itself
  (`overall_pick`) is exact and the precedent has no known failure mode when both source artifacts
  are genuinely present and agree.
- **Evidence-class disclosure is mandatory, not optional:** every row resolved via this class must
  record `resolution_evidence_class: "3.1_overall_pick_chain"` in the future crosswalk artifact
  (§7) — a distinct, structured field, never merged into free-text evidence — because this class
  is structurally available only for `drafted` rows (no `overall_pick` exists for `udfa_signed`
  rows). §16 defines the resulting leakage-control obligation this disclosure exists to satisfy.

### 3.2 Explicit reviewed mapping with documentary evidence (required for UDFA rows; fallback for unresolved drafted rows)

A named human reviewer records a one-off mapping, citing a specific, dated, external, official
source (e.g. an NFL team's own roster/transactions page explicitly naming the player) **plus at
least one independent corroborating fact** (e.g. jersey number, a directly-stated `gsis_id`-linked
profile URL, or a second independent official source) — never the player's name alone.

Requirements:

- Named, attributable human reviewer.
- Dated sign-off, separate from any automated process.
- At least **two** independent corroborating facts, never name-only.
- Full citation: source URL(s) and retrieval date(s) for every corroborating fact.
- **Team + position + season matching, on its own, is never sufficient** — it may serve as *one* of
  the two required corroborating facts, never as the entire basis, because the current 48-row
  population already contains multiple players sharing both position and (in some cases) similar
  draft timing, making position/team alone genuinely ambiguous.

### 3.3 Existing governed alias/identity artifact (conditional; not created by this design)

If TIBER-Data (or another governed repository) ever publishes its **own** reviewed, promoted
TIBER-Rookies-to-`gsis_id` crosswalk artifact, Forecast may consume it as evidence under the same
repo/commit/path/schema/hash citation discipline as §3.1. Forecast must not construct such an
artifact itself and call it TIBER-Data-governed — per ownership boundaries, Forecast may only
*consume* a canonical-identity artifact, never originate one and attribute it elsewhere.

## 4. Define prohibited identity methods

The future identity-resolution implementation must never use, under any circumstance:

- Name-only joins.
- Fuzzy-name matching (edit distance, phonetic matching, or any approximate string comparison).
- Normalized-name equality (case-folding, whitespace/punctuation stripping, nickname expansion)
  treated as proof.
- Position + name inference.
- School/team/roster-order inference (e.g. "the only WR from this school taken in this range").
- Silent alias creation (inventing a mapping without a recorded reviewer and citation).
- First-match or best-effort matching (accepting the first plausible candidate rather than
  requiring the specific evidence class's full requirements).
- Resolving conflicts by confidence score alone (a numeric score is not a substitute for the
  corroboration §3.2 requires).

Any implementation found to rely on one of these methods, even incidentally, must report the
affected rows as `blocked`, not `resolved` — see §5.

## 5. Define identity status enum

```text
resolved              -- a permitted evidence class (§3) was satisfied, including all of that
                          class's corroboration/sign-off requirements, with no conflicting evidence
unresolved            -- no permitted evidence class has yet been attempted or completed for this
                          row; the default starting state for all 48 mirrored identities today
conflicting_evidence   -- two or more permitted-evidence attempts disagree on the target gsis_id, or
                          a single class's own internal check (e.g. §3.1's team-disagreement signal)
                          fired
blocked                -- evidence was found to rely on a prohibited method (§4), was fabricated, or
                          was otherwise disqualified; requires human intervention before any further
                          automated re-evaluation is attempted
```

**Transition rules:**

- `unresolved -> resolved`: only when a permitted class (§3) is fully satisfied end-to-end, with no
  conflicting evidence present.
- `unresolved -> conflicting_evidence`: when two permitted-evidence attempts (from the same or
  different classes) disagree.
- `conflicting_evidence -> resolved`: only via an explicit, separately reviewed tie-break decision
  with its own documented rationale — never automatic, never by discarding one source silently.
- `any status -> blocked`: whenever prohibited-method reliance or evidence fabrication is discovered,
  regardless of the row's current status.
- `blocked` is terminal until an explicit human review clears it back to `unresolved`; it never
  auto-transitions to `resolved`.
- **Only `resolved` may enter the integrated readiness review (§17) as identity-eligible.**
  `unresolved`, `conflicting_evidence`, and `blocked` are all excluded from any feature-bearing use,
  retained for audit.

## 6. Define conflict and duplicate handling

| Case | Rule |
| --- | --- |
| Multiple Forecast (`gsis_id`) candidates for one source identity | `conflicting_evidence`; never auto-resolved by score or recency |
| Multiple source identities mapping to one Forecast identity | Investigate as a likely data-entry or join error before accepting either; both rows `conflicting_evidence` until explicitly reviewed |
| Duplicate names within the mirrored population | Name is never a resolution signal (§4); duplicates create no special handling because names were never load-bearing |
| Renamed or aliased players | Aliasing is nflverse's/TIBER-Data's to publish (§1); Forecast records whatever `gsis_id` the governed source states as of its own commit, and re-evaluates only when a newer governed source commit is cited |
| Conflicting external IDs across sources | `conflicting_evidence`, same as the first row above |
| Stale mappings | A prior `resolved` status is only as good as the source commit(s) cited; if a cited source is superseded, the mapping must be re-verified against the new source before being trusted again — it does not silently continue to be treated as current |
| Mapping revocation or supersession | Recorded explicitly (new row/version), never a silent overwrite — the prior mapping and its evidence remain in the audit trail |
| Partial population coverage | Expected and required to be reported as counts (resolved / unresolved / conflicting / blocked), never silently treated as "effectively resolved" |

**Invariant:** at every point in time, the four status counts for the 48 mirrored identities must
sum to exactly 48. A future crosswalk artifact failing this invariant is itself invalid and must
fail validation.

## 7. Define the future identity artifact contract

Not populated by this design. Future shape:

```json
{
  "kind": "rookie_transition_profile_v0_forecast_identity_crosswalk",
  "schema_version": "1.0.0",
  "generated_at": "<ISO-8601, operational timestamp only>",
  "source_lock": { "repo": "Prometheus-Frameworks/TIBER-Rookies", "commit": "2ef92fa...", "schema_version": "rookie-transition-profile-v0.2.0", "season": 2026 },
  "rows": [
    {
      "source_repository": "Prometheus-Frameworks/TIBER-Rookies",
      "source_schema": "rookie-transition-profile-v0.2.0",
      "source_player_id": "te-daequan-wright",
      "source_season": 2026,
      "forecast_canonical_player_id": null,
      "resolution_status": "unresolved",
      "resolution_evidence_class": null,
      "resolution_evidence": [],
      "reviewer": null,
      "reviewed_at": null,
      "notes": "no permitted evidence class attempted yet"
    }
  ]
}
```

- **Ownership:** Forecast (this is Forecast's own consumption-side crosswalk; the canonical
  identity concept itself remains nflverse/TIBER-Data-owned per §1).
- **Required fields:** all eight row fields above, always present (nullable where unresolved).
- **Evidence-class field:** `resolution_evidence_class` is one of
  `3.1_overall_pick_chain | 3.2_reviewed_mapping | 3.3_governed_artifact | null`, always present and
  distinct from the free-text `resolution_evidence` citations — required so any future experiment
  can detect and control for §16's overall-pick-chain leakage-control rule without re-deriving it
  from citation text.
- **Source and evidence hashes:** every non-empty `resolution_evidence` entry must cite its own
  repo/commit/path/schema/hash per the evidence class's requirements in §3.
- **Row-level status:** `resolution_status` uses exactly the §5 enum.
- **Reviewer decision:** required (non-null `reviewer`/`reviewed_at`) for every row whose status is
  `resolved` or `conflicting_evidence`-resolved-via-tiebreak; may be null while `unresolved`.
- **Deterministic ordering:** rows sorted by `(source_season, source_player_id)` ascending.
- **Duplicate prevention:** fail closed on any repeated `(source_repository, source_schema,
  source_player_id, source_season)` key.
- **Unresolved-row retention:** every one of the 48 rows must always be present, even if
  `unresolved` — no row may be omitted for lacking a resolution.
- **Fail-closed validation:** a validator must reject the artifact if the four-status-count
  invariant (§6) fails, if any `resolved` row lacks evidence citations, or if any evidence entry
  relies on a method listed in §4.
- **Explicit prohibition:** this artifact must not be imported by any model or production path until
  a separate, future authorization does so explicitly — the same "inert until authorized" discipline
  the mirror itself already follows.

## 8. Pin the simulated pre-draft cutoff contract

Reaffirms and sharpens the #149 design's temporal-eligibility section: `pre_draft` means a pinned
as-of instant **strictly before Day 1, Round 1, Pick 1 begins** — never "before the draft concludes."

- **Authoritative source for the draft-start timestamp:** the NFL's own officially published draft
  schedule (external to both TIBER-Rookies and TIBER-Forecast). Checked: no governed, promoted
  TIBER-Data artifact currently records this schedule (no `draft_schedule`-class artifact exists in
  TIBER-Data's `docs/`, `schemas/`, or `exports/` as of this design). Until one exists, the cutoff
  timestamp for a given season must be attached to a directly cited, dated, external source (e.g. an
  nfl.com schedule page), retrieved and cited by a **named human reviewer** with URL and retrieval
  date — the same discipline §3.2 requires for identity evidence, applied here to a temporal fact.
- **Timezone / representation:** the cutoff must be recorded as a fully-qualified, offset-bearing
  ISO-8601 instant (never a bare date or a locally-assumed timezone).
- **Per-season pinning:** each season's cutoff is cited and pinned independently; a 2026 cutoff
  citation never applies to any other season.
- **Fail-closed treatment:** if no such citation exists for the season in question, that season's
  `pre_draft` eligibility is `unresolved_no_availability_proof` (§11) for every family — never
  assumed from the artifact's own `generated_at` or any other convenience timestamp.

## 9. Separate timestamp meanings

| Timestamp | Owner | What it proves | What it does NOT prove | Can establish historical eligibility? | Sourced or inferred? |
| --- | --- | --- | --- | --- | --- |
| `available_at` | Whichever future artifact defines it (Lane B's availability-evidence artifact, §13) | The specific instant a specific fact became publicly knowable | Nothing about any *other* fact's availability | **Yes** — this is the one timestamp concept availability proof is built on | Must be directly sourced from a governed citation; never inferred |
| `source_snapshot_as_of` | The upstream source artifact | The instant the *snapshot* (not necessarily every fact in it) reflects | That every field in the snapshot was knowable at that instant | Only in combination with `available_at` for the specific field | Sourced, when the upstream artifact declares it |
| `event_time` | The real-world event itself (e.g. the combine date, the college season's end) | When the underlying real-world event actually occurred | Whether that event's *result* had propagated into any given artifact yet | Only when explicitly tied to a specific field's `available_at` | Sourced from external, citable fact (e.g. an official combine schedule) |
| `generated_at` | The artifact producer (e.g. TIBER-Rookies' promotion pipeline) | When the artifact *file* was computed/written | Anything about any individual field's real-world knowability — confirmed in #149's design: this artifact's own `generated_at` (2026-07-10) is *after* the 2026 draft, commingling pre- and post-draft facts | **No** | N/A — a batch/process timestamp |
| `ingested_at` | The ingesting repository (e.g. TIBER-Data reading an nflverse feed) | When a downstream repo *read* an upstream feed | When the underlying fact became true or public | **No** | N/A — an operational timestamp |
| `last_verified_at` | The per-field `provenance` object (already part of the rookie_transition_profile schema) | For `official_postdraft_outcome`'s *drafted* rows only, a genuine per-row verification date (the source's own `ingested_at`, per TIBER-Rookies' #267 design) | For every other family, and for the one `udfa_signed` row, this is a generation-date fallback or explicitly `null` — **not** a verification event | Only for the one case just named; otherwise no | Sourced when genuine (drafted outcomes); otherwise explicitly absent, never backfilled |
| `mirror_refreshed_at` | Forecast's own mirror wrapper (already part of the #151 implementation) | When Forecast last pulled the mirror | Anything about any underlying fact's real-world knowability | **No** | N/A — purely Forecast-side operational bookkeeping |

**These seven timestamp concepts must never be treated as interchangeable.** Any future
availability-proof implementation that substitutes one for another (most dangerously,
`generated_at` or `mirror_refreshed_at` standing in for `available_at`) is a leakage defect, not an
acceptable shortcut.

## 10. Define per-family availability proof

| Family | Required evidence before "available at cutoff X" may be claimed | Proof granularity | Season generalizes? |
| --- | --- | --- | --- |
| `draft_capital` | A cited, dated snapshot of the specific big-board/proxy value in question, proving *that exact value* (not just "a" proxy value) was published before cutoff X — e.g. an archived, dated big-board publication. Big-board values are revised throughout the pre-draft cycle, so "some proxy existed" is not proof for the *specific* value the mirror carries. | Row-level (per player, per value) | No — must be re-proven every season |
| `age_at_entry` | Archived, dated evidence of **both** (a) the player's exact source date of birth, **and** (b) the governed reference date/formula used to compute the mirrored `age_at_entry` value itself (e.g. "age as of the pinned pre-draft cutoff," per §8) — with both the DOB source and the reference-date/formula definition shown available before cutoff X. Proof that a DOB exists somewhere is necessary but not sufficient; the derivation basis for *the specific mirrored value* must also be provable pre-cutoff, not merely the underlying birth fact. | Row-level | No |
| `athletic_testing` | Archived, dated evidence of **the exact measurement/result value the mirror carries** — not merely that the testing event occurred — showing that specific value was publicly available/published before cutoff X (e.g. an archived combine-results page or table containing the literal recorded number). Proof of the testing event's occurrence alone is necessary but not sufficient; the numeric result itself must be shown published pre-cutoff. | Row-level (the specific measured value) | No — testing calendars shift every year |
| `college_production` | An archived, dated snapshot containing **the exact stat value(s)/window the mirror carries**, shown publicly available before cutoff X — not merely evidence that the season/stat-window had closed. A season closing does not by itself prove the specific total was published, finalized, or free of later correction; the archived snapshot must directly contain the mirrored value. | Row-level (the specific value, not just the closed window) | No — season-close dates shift every year |
| `official_postdraft_outcome` | **No proof could ever apply in a `pre_draft` context** — this family is definitionally post-draft information. Only `post_draft`-phase availability is meaningful for it, and even then, per-row evidence (e.g. `ingested_at`) still applies (§9) | N/A for `pre_draft`; row-level for `post_draft` | N/A |

For every family, updates discovered *after* the pinned cutoff (e.g. a big-board value later
revised) must be detectable by comparing the cited `available_at`/event date against the cutoff —
never inferred from the mirror's own `generated_at`. Missing or ambiguous timing for any row/family
defaults to `unresolved_no_availability_proof` (§11), never to an assumed-available default.

## 11. Define temporal status enum

```text
eligible_at_cutoff             -- an archived available_at citation directly containing the exact
                                   mirrored value for this specific row+family is proven to precede
                                   the pinned cutoff
ineligible_after_cutoff        -- the cited available_at is proven to be at or after the cutoff (or
                                   the family is official_postdraft_outcome in a pre_draft context,
                                   which is always this status)
unresolved_no_availability_proof -- no citation has yet been attempted or completed for this
                                   row+family; the default starting state today, for every family
unavailable                    -- the underlying value itself is null/unavailable in the source
                                   mirror (a missingness fact, distinct from a timing fact)
```

**`event_time` is supporting context only, never sufficient alone.** A testing date, a season-close
date, or any other `event_time` establishes only that some fact *could* exist after that point — per
§9, it does not by itself prove the specific mirrored value was published, stable, or reproducible.
`eligible_at_cutoff` requires an exact-value `available_at` citation (an archived snapshot that
directly contains the literal mirrored value) — `event_time` may corroborate such a citation but can
never substitute for it. This applies to every family in §10's table, including `athletic_testing`
and `college_production`, whose evidence requirements were tightened for exactly this reason.

**Transition rules:** identical discipline to §5 — `unresolved_no_availability_proof -> eligible_at_cutoff`
only via a completed exact-value citation per §8/§10; any status may move to `ineligible_after_cutoff` if
new evidence proves the fact postdates the cutoff; `unavailable` is independent of the other three and
checked first (a null value has no timing question to answer). **An origin label such as
`market_derived_proxy` or `official_draft_result` is not itself availability proof, and neither is
proof that the underlying event/window merely occurred or closed** — restated and extended verbatim
from the issue because these are the shortcuts a future implementation is most likely to be tempted
to take.

## 12. Define historical snapshot integrity

Current repository knowledge must never be projected backward into a historical run. The contract
requires:

- **Immutable source snapshots:** any artifact cited as `available_at`/event-time evidence must be
  identified by exact repository + commit + path + hash — never "the current state of X."
- **Mutable API/file treatment:** if evidence would otherwise come from a live, mutable source
  (a website that can change, an API without versioning), it must be archived (e.g. a dated,
  retrieved copy with its own hash) before being cited — a live URL alone is not sufficient evidence
  of what it said at a past instant.
- **Archived-evidence requirement:** every availability-proof citation must be independently
  reproducible from the archived evidence, not solely from a reviewer's written claim about it.
- **Late corrections:** represented as new, separately dated evidence entries — never as a silent
  edit to a prior entry.
- **Superseded snapshots remain auditable:** a corrected or superseded evidence entry is retained in
  the record, marked superseded, not deleted.
- **Fail-closed on non-reproducibility:** if historical bytes supporting a claimed `available_at`
  cannot be reproduced from the cited archive, the row/family reverts to
  `unresolved_no_availability_proof`, regardless of any prior claim.

## 13. Define the future availability-evidence artifact

Not populated by this design. Future shape:

```json
{
  "kind": "rookie_transition_profile_v0_forecast_availability_evidence",
  "schema_version": "1.0.0",
  "season": 2026,
  "cutoff_at": "<pinned, cited ISO-8601 instant per §8 -- null until cited>",
  "rows": [
    {
      "field_family": "draft_capital",
      "source_identity": { "source_repository": "Prometheus-Frameworks/TIBER-Rookies", "source_player_id": "te-daequan-wright", "source_season": 2026 },
      "availability_status": "unresolved_no_availability_proof",
      "available_at": null,
      "source_snapshot_as_of": null,
      "evidence_source": null,
      "notes": "no citation attempted yet",
      "review_decision": null
    }
  ]
}
```

- **Ownership:** Forecast (consumption-side; per §1/§3, the underlying facts remain externally
  sourced and cited, never Forecast-invented).
- **Required fields:** `season`, `cutoff_at`, `field_family`, `source_identity` (or row identity),
  `availability_status` (§11 enum), `available_at`, `source_snapshot_as_of`, evidence
  repository/commit/path/hash, notes, and `review_decision`.
- **Validation:** fail closed if `cutoff_at` is null but any row claims `eligible_at_cutoff`; fail
  closed if any `eligible_at_cutoff` row lacks a full evidence citation; deterministic ordering by
  `(field_family, source_player_id)`; duplicate prevention on the same key.

## 14. Define the row-and-field readiness rule

A mirrored value may become eligible for a future experiment only when **every** condition holds:

```text
identity resolved
AND availability proven for the pinned cutoff
AND value is present
AND provenance is intact
AND field is permitted for the requested phase
AND no leakage rule is violated
```

Failure or ambiguity on **any** condition results in exclusion — never inference, imputation,
substitution, or best-effort inclusion.

Readiness is strictly **row-and-field** specific, restated as binding rules:

- Resolving one player's identity does not make any of their fields eligible — each field still
  needs its own availability proof.
- Proving one family available at the cutoff does not resolve identity for any row.
- One eligible row never promotes the full population — every other row is evaluated independently.
- One season's readiness never automatically promotes another season — §8 and §10 both require
  independent, per-season proof.

## 15. Define the future integrated readiness matrix

Not populated by this design. **One matrix artifact instance represents exactly one
`(season, requested_phase, cutoff_at)` tuple** — a comparison across two phases (e.g. `pre_draft` vs
`post_draft`) or two cutoffs is always two separate artifact instances, never two rows sharing one
row-grain key. Future shape — one top-level execution context, and one row per `(source_player_id,
source_season, field_family)` within that context:

```json
{
  "kind": "rookie_transition_profile_v0_forecast_integrated_readiness_matrix",
  "schema_version": "1.0.0",
  "execution_context": {
    "requested_phase": "pre_draft",
    "season": 2026,
    "cutoff_at": "<pinned, cited ISO-8601 instant per §8 -- null until cited>",
    "identity_crosswalk_source": { "repo": "Prometheus-Frameworks/TIBER-Forecast", "commit": "<exact sha>", "path": "<crosswalk artifact path, §7>", "schema_version": "1.0.0", "sha256": "<exact hash>" },
    "availability_evidence_source": { "repo": "Prometheus-Frameworks/TIBER-Forecast", "commit": "<exact sha>", "path": "<availability-evidence artifact path, §13>", "schema_version": "1.0.0", "sha256": "<exact hash>" }
  },
  "rows": [
    {
      "source_player_id": "te-daequan-wright",
      "forecast_canonical_player_id": null,
      "identity_status": "unresolved",
      "resolution_evidence_class": null,
      "field_family": "draft_capital",
      "temporal_status": "unresolved_no_availability_proof",
      "value_presence": "present",
      "provenance_status": "intact",
      "phase_permission": "pre_draft_candidate",
      "leakage_status": "not_evaluated",
      "final_readiness_status": "excluded",
      "blocking_reasons": ["identity_status=unresolved", "temporal_status=unresolved_no_availability_proof"]
    }
  ]
}
```

- **Execution context is required, not optional:** `requested_phase`, `season`, `cutoff_at`,
  `identity_crosswalk_source`, and `availability_evidence_source` must all be present at the top
  level of every matrix artifact instance. A validator must reject any matrix lacking one of these —
  a readiness decision that cannot say which phase/cutoff/crosswalk/evidence it was computed against
  is not reproducible and not valid.
- **Deterministic dereferencing, not self-consistency alone:** every row's `identity_status` and
  `resolution_evidence_class` must match what is found by dereferencing
  `identity_crosswalk_source` at its exact cited commit — a matrix that is merely internally
  consistent, without matching its cited source artifacts byte-for-byte, must fail validation. The
  same applies to `temporal_status` against `availability_evidence_source`.
- **`resolution_evidence_class` is included directly in every row** (mirroring §7's crosswalk field)
  so that §16's default-exclusion rule for `3.1_overall_pick_chain`-resolved rows can be evaluated
  row by row from the matrix alone, without re-dereferencing the crosswalk artifact for every check.
- **Closed enums** for every status field: `identity_status` (§5), `resolution_evidence_class`
  (`3.1_overall_pick_chain | 3.2_reviewed_mapping | 3.3_governed_artifact | null`), `temporal_status`
  (§11), `value_presence` (`present` | `unavailable`), `provenance_status` (`intact` | `broken`),
  `phase_permission` (`pre_draft_candidate` | `post_draft_candidate` | `never_eligible` — the last
  reserved for `official_postdraft_outcome` in a pre-draft context per §10), `leakage_status`
  (`clear` | `violation` | `not_evaluated`), `final_readiness_status`
  (`eligible` | `excluded`).
- **Deterministic ordering:** `(source_season, source_player_id, field_family)` ascending.
- **Duplicate prevention:** fail closed on any repeated `(source_player_id, source_season,
  field_family)` key **within one execution-context artifact instance**.
- **Fail-closed aggregation:** `final_readiness_status: eligible` requires every one of the six §14
  conditions to independently hold; any single failing condition forces `excluded`, and
  `blocking_reasons` must enumerate every failing condition, not just the first one found — partial
  credit is never given.

## 16. Define leakage controls

Explicitly prevented, in every future implementation this design authorizes designing for:

- Post-draft outcomes appearing in any pre-draft-phase feature.
- Current/revised values being treated as historically known at an earlier cutoff.
- Refresh or generation timestamps (`mirror_refreshed_at`, `generated_at`) standing in for
  `available_at`.
- Identity resolution silently derived from target/outcome information without disclosure. The one
  explicitly permitted exception is §3.1's bounded, fully-disclosed use of
  `official_postdraft_outcome.value.overall_pick` for drafted-row identity linkage; that exception
  does not itself authorize using its result as an outcome-blind population or feature signal (see
  the next rule) — undisclosed uses of outcome information for identity resolution remain
  prohibited outright.
- **Default exclusion of §3.1-resolved identities from every pre-draft experiment, not only
  outcome-targeting ones.** Any row carrying `resolution_evidence_class: "3.1_overall_pick_chain"`
  defaults to `leakage_status: violation` (and `final_readiness_status: excluded`) in any
  `pre_draft`-phase readiness matrix, **regardless of the experiment's specific target** — because
  §3.1 evidence is structurally available only for `drafted` rows (no `overall_pick` exists for
  `udfa_signed` rows), filtering *any* pre-draft population to identity-resolved rows systematically
  biases it toward drafted players. This is a selection-bias leak even for targets that never
  literally reference `official_postdraft_outcome` (e.g. a fantasy-performance target), because the
  resulting population itself already encodes drafted-vs-UDFA status.
- **The only permitted exception, and its concrete, checkable proof requirement:** a `pre_draft`
  experiment may treat §3.1-resolved rows as `leakage_status: clear` only if **all** of the following
  are satisfied and recorded in the integrated readiness review (§17), not merely asserted in prose:
  1. The population-definition criterion is documented **before** any identity resolution is
     attempted (e.g. "all 48 rows in the locked TIBER-Rookies mirror for season 2026"), and that
     criterion references nothing derived from `official_postdraft_outcome`, `identity_status`, or
     `resolution_evidence_class`.
  2. A reproducible comparison is performed and recorded: re-evaluating the documented population
     criterion against a hypothetical crosswalk in which every row's `resolution_evidence_class` is
     forced to `null` (i.e. as if §3.1 evidence did not exist) yields the **exact same row set** —
     same count, same `source_player_id` membership — as the real crosswalk. Any difference means
     resolution availability did determine inclusion, and the exception does not apply.
  3. The comparison's inputs (both crosswalk states used) and its result are recorded as an explicit,
     checked item in the integrated readiness review (§17), citeable and re-verifiable, not a
     one-line assertion.
  An experiment failing any of the three must build its own population using only §3.2-resolved
  identities for the affected rows, or exclude them.
- Availability proof sourced from later downstream artifacts (e.g. citing a post-draft summary
  article as proof a pre-draft value was known pre-draft).
- Exclusions being silently converted to neutral/default values anywhere in the pipeline.
- Unresolved rows being dropped without audit accounting — every excluded row/field must remain
  visible in the readiness matrix with its `blocking_reasons`, never quietly disappear.

## 17. Define the integrated readiness review gate

Even if both prerequisite lanes (identity resolution, source-availability audit) succeed
independently, a **separate, later** integrated readiness review is required before any
controlled-experiment design issue may open. That review must independently re-verify:

1. Crosswalk contract compliance (§2–§7) — not just that a crosswalk exists, but that it was built
   the way this design requires.
2. Full 48-row accounting — every mirrored identity present in the crosswalk output with a
   real status, none silently dropped.
3. Temporal proof at the exact pinned cutoff (§8–§13) — not a looser or later cutoff.
4. Row-and-field matrix correctness (§14–§15) — spot-checked against the underlying evidence, not
   merely schema-valid.
5. Leakage exclusions (§16) actually enforced, not merely documented — including the
   §3.1-overall-pick-chain default-exclusion rule and, for any experiment claiming the population-
   selection-independence exception, independent re-verification of the required reproducible
   crosswalk comparison (§16), not acceptance of the experiment's own claim.
6. Unresolved and ineligible population counts — reported explicitly, not implied.
7. The matrix's execution context (`requested_phase`/`season`/`cutoff_at`/`identity_crosswalk_source`/
   `availability_evidence_source`, §15) matches the actual crosswalk and availability-evidence
   artifacts used at their exact cited commits — not merely internally self-consistent.
8. Confirmation that no experiment or production activation occurred during either prerequisite
   lane's own work (both lanes are themselves documentation/implementation-only until this review
   passes).

This review is itself a future, separate issue — not performed here, and not a rubber stamp on
either lane's own self-report.

## Required lifecycle

```text
pre-experiment readiness design            (this issue, #155)
        ↓
identity-resolution implementation/audit   (future issue, Lane A: §1-§7)
        +
source-availability proof audit            (future issue, Lane B: §8-§13; may proceed independently
                                             of Lane A -- neither authorizes the other)
        ↓
integrated readiness review                (future issue, §17 -- requires BOTH lanes complete)
        ↓
controlled-experiment design                (future issue -- mirrors the docs/capabilities/README.md
                                             capability path's own "controlled-experiment design"
                                             stage)
        ↓
controlled implementation and validation
        ↓
baseline + shuffled comparison              (per docs/capabilities/README.md: at least two disjoint
                                             origins, independently evaluated, no averaging)
        ↓
threshold review
```

This slots into the existing `docs/capabilities/README.md` governed capability path between "mirror
validation and rehearsal" (already complete, #153/PR#154) and "controlled experiment design" — the
two prerequisite lanes and the integrated review are the concrete content of what that capability
path already calls the gate before a controlled-experiment design may be proposed.

## Decision

```text
may_open_rookie_transition_profile_forecast_readiness_prerequisite_issues
```

This authorizes **exactly two** separate future issues:

1. Implement and verify the governed Forecast identity-resolution contract (§1–§7).
2. Audit and prove field-family availability at pinned historical cutoffs (§8–§13).

It does **not** authorize either lane to silently satisfy the other, an integrated readiness review,
experiment design, experiment implementation, feature use, predictive evaluation, downstream
consumption, production binding, or activation.

## Validation checklist (self-check for this design)

- [x] Markdown and the JSON companion agree (mirrored 1:1 by section).
- [x] Every status enum (§5, §11, §15's field-level enums) is closed and fully documented.
- [x] All 48 source identities remain represented as `unresolved` starting state — no resolution
      performed by this design.
- [x] No field family is declared temporally eligible — every §10 entry states what proof is
      required, none claims it is already satisfied.
- [x] `official_postdraft_outcome` is always pre-draft ineligible (§10, §15's `never_eligible`
      value).
- [x] Identity and temporal evidence requirements (§3, §8/§10) are independently testable — each
      specifies exact repo/commit/path/hash citation requirements a future validator can check.
- [x] Integrated readiness (§14/§15) cannot pass with unresolved identity or unresolved timing — the
      AND-rule and fail-closed aggregation both enforce this structurally.
- [x] No design path permits fuzzy/name-only resolution (§4 is exhaustive and binding).
- [x] No timestamp substitution permits leakage (§9's table and §16 both name this explicitly).
- [x] §3.1's use of `official_postdraft_outcome`-derived evidence for identity resolution is
      explicitly bounded and disclosed (`resolution_evidence_class`, §7), with a corresponding §16
      rule defaulting it to excluded in every pre-draft experiment (not only outcome-targeting ones)
      unless a concrete, reproducible population-selection-independence proof is recorded.
- [x] §3.1 is honestly marked `blocked_pending_second_leg_evidence` — directly verified against
      TIBER-Data that no governed artifact today joins `overall_pick` to `gsis_id`, and the class may
      not be used until that gap is closed and cited by exact repo/commit/path/schema/hash.
- [x] Availability proof for `athletic_testing`, `college_production`, and `age_at_entry` requires the
      exact mirrored value to be shown published pre-cutoff, not merely that the underlying event or
      window occurred/closed (§10, §11).
- [x] The future integrated readiness matrix (§15) records its execution context
      (`requested_phase`/`season`/`cutoff_at`/crosswalk and availability-evidence source citations)
      so a readiness decision is reproducible and distinguishable across phases/cutoffs.
- [x] The positive decision opens only the two prerequisite issues (Decision section above).

## Non-goals confirmed

No TIBER-Rookies change. No change to the four committed Forecast mirror files. No change to the
mirror refresh/verifier/commit/source-identity implementation code. No real identity crosswalk
created. No player identity resolved. No source-availability audit performed. No field declared
temporally eligible. No populated readiness matrix. No pre-draft or post-draft projection created.
No adapter or model-ready feature table. No predictive experiment. No MAE/RMSE/calibration/
fantasy-point evaluation. No model or production import. No downstream consumption, production
binding, UI activation, or model-use authorization. No claim of predictive usefulness for any field.

## Reproduce

This document is prose/schema design only; there is no script to run. The TIBER-Data evidence cited
in §1/§3 can be independently re-verified against a checkout of `Prometheus-Frameworks/TIBER-Data`:

```bash
grep -n "player_id.*gsis_id" docs/data/roster-player-team-map-source-backed-2025.md
python3 -c "import json; d=json.load(open('exports/promoted/nfl/player_season_coverage_v0.json')); print([r['player_id'] for r in d['records'][:5]])"
python3 -c "import json; rows=json.load(open('exports/promoted/nfl_draft_results/nfl_draft_results_2026.json')); print([r for r in rows if r.get('player_id')][0])"
cat data/raw/rookies/2026/2026_tiber_rookies_draft_result_id_reference_v0.json
```
