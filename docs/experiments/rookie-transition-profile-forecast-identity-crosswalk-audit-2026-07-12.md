# Lane A audit: governed Forecast identity crosswalk for rookie_transition_profile_v0.2.0 (#158)

**Status:** implementation + audit of Lane A only (design §1–§7). This work creates the governed,
inert identity-crosswalk artifact and its fail-closed validator. It performs no Lane B
source-availability audit, declares no field temporally eligible, populates no readiness matrix,
opens no experiment, creates no adapter or feature table, and authorizes no downstream consumption,
production binding, UI activation, or model use. It does not modify TIBER-Rookies, TIBER-Data, or
any of the four committed Forecast mirror files.

## 1. Governing contract and locks

| | Value |
| --- | --- |
| Implementing issue | `TIBER-Forecast#158` (Lane A) |
| Governing design | `docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md` / `.json` |
| Design pinned at merge commit | `73834c2a30743c2587b32742c4e5c98320e33dfe` (#155 / PR #156) |
| Forecast mirror wrapper | `data/fixtures/tiberRookies/ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json` (`kind: rookie_transition_profile_v0_forecast_mirror_provenance`, `schema_version: 1.0.0`, SHA-256 `2639d5acb11e8d77400700e814ad9c50dba9bf0a46f3f80413e4f0d51860aaa6`) |
| Upstream source lock (preserved exactly) | `Prometheus-Frameworks/TIBER-Rookies` @ `2ef92faf9a9c91a393f53e9140428451529a1c48`, schema `rookie-transition-profile-v0.2.0`, season `2026`, 48 rows |

The source population was not refreshed or reinterpreted; the 48 locked `player_id` values were
read from the committed mirror JSON (which the existing committed-artifact tests already hash-lock
against the upstream promotion).

## 2. What was created

| Deliverable | Path |
| --- | --- |
| Governed 48-row identity-crosswalk artifact (`kind: rookie_transition_profile_v0_forecast_identity_crosswalk`, `schema_version: 1.0.0`) | `data/experiments/rookieTransitionProfile/rookie_transition_profile_v0_forecast_identity_crosswalk.json` |
| Pure fail-closed validator (deterministic; no I/O) | `src/rehearsal/rookieTransitionProfileIdentityCrosswalk.ts` |
| Read-only audit CLI (`npm run audit:rookie-transition-profile-identity-crosswalk`) | `scripts/runRookieTransitionProfileIdentityCrosswalkAudit.ts` |
| Positive + negative validation tests (72 tests) | `tests/rookieTransitionProfileIdentityCrosswalk.test.ts` |
| This audit report | `docs/experiments/rookie-transition-profile-forecast-identity-crosswalk-audit-2026-07-12.md` / `.json` |

Every row carries all fourteen contract fields (`source_repository`, `source_schema`,
`source_player_id`, `source_season`, `forecast_canonical_player_id`, `resolution_status`,
`resolution_evidence_class`, `independent_resolution_evidence_class`,
`identity_coverage_dependency`, `identity_coverage_mechanism`, `resolution_evidence`, `reviewer`,
`reviewed_at`, `notes`), rows are deterministically ordered by `(source_season, source_player_id)`,
the full four-field governed key is duplicate-checked (never `source_player_id` alone), and the
artifact fails validation on any missing, extra, or duplicated locked identity.

The validator enforces, fail-closed: exact source-lock agreement; exactly 48 distinct governed
source keys; deterministic ordering; the four-status-count invariant (declared counts recomputed
from rows and required to sum to exactly 48); closed status/evidence/dependency enums; GSIS format
(`NN-NNNNNNN`) for any canonical ID; that a `resolved` row carries a named human sign-off and a
structurally complete evidence entry of its declared class whose **archived content is verified to
contain the exact claimed `gsis_id`** (via an injectable archive resolver that recomputes SHA-256 —
non-reproducible archives fail closed); that conflicting candidates force `conflicting_evidence`;
that any `3.1_overall_pick_chain` entry is rejected outright while the class remains
`blocked_pending_second_leg_evidence`; that a prohibited-method marker inside evidence fails the row
(design §4 tripwire, defense-in-depth alongside the structural requirements and mandatory human
review); that `independent_resolution_evidence_class` is backed by a complete, §3.1-free matching
entry resolving to the same `gsis_id`; that an `independent_of_post_draft_outcome` claim requires a
non-null, citable `identity_coverage_mechanism`; and that a 3.3 citation attributed to
TIBER-Forecast itself is rejected (Forecast may consume, never originate, a canonical-identity
artifact).

**Strengthened after independent review, round 1 (2026-07-12), before this PR merged:** every
`3.2_reviewed_mapping` corroborating fact's archived citation is independently resolved and
hash-verified (previously only its shape was checked), and corroborating facts must be materially
distinct from one another — sharing an archive hash, archive location, fact text, or `original_url`
between two "independent" facts now fails validation. A `blocked` row requires a bare-minimum
disposition (non-null `reviewer`/`reviewed_at`, non-empty `notes`, at least one `resolution_evidence`
entry). The validator also checks the artifact's `issue` and `governing_design` fields
(readiness-design issue/PR/merge-commit/document paths) against the pinned constants, not just
`source_lock`.

**Strengthened after independent review, round 2 (2026-07-12), before this PR merged:**

- **3.3 exact-mapping verification, not substring co-occurrence.** A `3.3_governed_artifact` citation's
  archived content is now deterministically JSON-parsed (a top-level array, or a `rows` array; no
  substring-search fallback if it cannot be parsed) and required to contain **exactly one** row whose
  full four-field governed key (`source_repository`/`source_schema`/`source_player_id`/`source_season`)
  matches this row, with that row's own `gsis_id` equal to the claimed value. Zero matches, multiple
  matches, or a target mismatch all fail closed — including the specific cross-row co-occurrence case
  where one row names the right player with the wrong id and a different row carries the right id for
  someone else (a naive whole-document substring check would have wrongly accepted this).
- **3.3/CLI resolver compatibility.** The committed CLI's production resolver previously could only
  read Forecast's own repo, while the validator requires 3.3 citations to name an *external* governed
  repo — meaning no real 3.3 evidence could ever pass through the actual CLI, only through unit tests
  using a synthetic resolver. The resolver now reads the exact pinned commit via `git show
  <commit>:<path>` against each of this multi-repo project's locally available sibling checkouts
  (TIBER-Data, TIBER-Rookies, TIBER-Teamstate, in addition to Forecast itself), recomputing SHA-256
  before trusting the content. This is honestly a same-environment fix, not a CI-portable one: a
  single-repo GitHub Actions checkout of TIBER-Forecast alone would not have these sibling checkouts
  present, and a real cross-repo 3.3 citation would still fail closed there until CI provisions them
  (or a different fetch mechanism is added) — correctly inert, never a false pass.
- **3.2 corroborating facts now carry a verified `expected_literal`.** Archive existence and hash
  verification alone proved only that a distinct file exists, not that its content substantiates the
  claimed fact. Each corroborating fact now requires an `expected_literal` string, and the validator
  requires the archived content to actually contain it — the free-text `fact` field remains for human
  audit readability but is no longer the thing being verified.
- **Blocked rows now require a mechanically-verified `disqualification_reason`, not a bare recognized
  `evidence_class` token.** The prior round's fix still let `{ evidence_class: "3.2_reviewed_mapping" }`
  alone, combined with a fabricated reviewer/date/notes, pass as a "verified" block — every unresolved
  row could have been relabeled this way, reaching `..._complete` with zero real investigation. Each
  disqualified-evidence entry must now declare one of three closed, mechanically-checked reasons:
  `prohibited_method` (a real prohibited-method marker must be present in the entry),
  `non_reproducible_or_fabricated_evidence` (the cited evidence must genuinely fail to reproduce), or
  `governed_blocker_citation` (a real, reproducible citation naming the authoritative reason). A new
  `verifiedBlockedCount` result field, and an explicit decision-rule check, additionally require every
  blocked row to have a verified disposition before `blocked > 0` can ever contribute to `..._complete`.

**Strengthened after independent review, round 3 (2026-07-12), before this PR merged:** round 2's
three blocked-disposition reasons were each still self-manufacturable in a different way, plus two
other load-bearing citations were checked for shape only, never resolved:

- **`prohibited_method` was scanning the self-authored disposition prose, not real evidence.**
  `disqualification_detail` is free text an author writes; finding a marker word there (e.g. writing
  "relied on fuzzy matching") proved nothing actually happened. `DisqualifiedEvidenceEntry` now
  requires a separate, non-empty `attempted_evidence` payload — the real substantive content of what
  was tried — and the marker scan runs **only** over that payload, never over
  `disqualification_reason`, `disqualification_detail`, `notes`, or `reviewer`.
- **`non_reproducible_or_fabricated_evidence` treated any resolver `null` as proof of fabrication.**
  A `null` is equally consistent with an unknown repo, an unfetched commit, a path typo, or a CI
  environment missing a sibling checkout — none of which mean the evidence was fabricated, only that
  availability is unresolved. The reason now requires the opposite: the citation **must** actually
  reproduce, plus a `claimed_value` the entry asserts was bound, with the verifier confirming the
  reproduced content does **not** actually contain it — positive proof of a contradiction, never
  absence of proof.
- **`governed_blocker_citation` only proved some reproducible bytes existed.** It now requires the
  same exact-key-match discipline as 3.3: the cited archive is deterministically parsed for a `rows`
  array, filtered to the row matching this identity's full four-field governed key (zero/multiple
  matches fail closed), and that matched row must itself carry non-empty `blocker_reason`/
  `blocker_detail` fields — an unrelated-but-reproducible file can no longer pass.
- **`identity_coverage_mechanism.citation` was never actually resolved.** Only its shape (non-empty
  description + syntactically valid citation) was checked — a fabricated citation could mark a row
  `independent_of_post_draft_outcome` outright. It is now resolved, hash-verified, and exact-key-matched
  against the row's full governed source key (the same shared parser used by 3.3 and
  `governed_blocker_citation`), and the matched row must itself declare
  `independent_of_post_draft_outcome: true` — never accepted from the citing row's own description
  alone.
- **Citation `commit` values now require an immutable full 40-character lowercase-hex git object ID**
  (`GIT_COMMIT_SHA_PATTERN`), applied uniformly everywhere `isValidCitation` is used. A mutable ref
  (`main`, `HEAD`), a branch/tag name, or an abbreviated SHA now fails citation validation outright —
  the merged design's "exact repo/commit/path/hash" discipline can no longer be satisfied by a moving
  target that happens to match today.

## 3. Evidence paths attempted, per the merged design

### §3.1 corroborated overall-pick chain — still `blocked_pending_second_leg_evidence`

Re-verified directly (2026-07-12) against `Prometheus-Frameworks/TIBER-Data` at commit
`d9a5beaacf12e3fbd74becd02db3d2ac39e48905`:

- `exports/promoted/nfl/player_season_coverage_v0.json`: 3,016 records; populated `draft_year`
  values still run only through **2025**; **zero rows with `draft_year: 2026`**; `draft_pick`
  remains an `additionalProperties` passthrough, not a governed/enforced join column.
- `exports/promoted/nfl_draft_results/nfl_draft_results_2026.json`: 257 rows; **no GSIS-format
  value anywhere in the artifact** (its `player_id` field carries TIBER-Rookies' own slug format,
  e.g. `qb-fernando-mendoza`, which §1 of the design explicitly rejects as a `gsis_id` source).
- No other governed TIBER-Data artifact joins `(draft_year, overall_pick)` to a `gsis_id`.

The design's exact §3.1 precondition therefore still does not exist in any governed artifact, and
this PR does not manufacture it (modifying TIBER-Data is out of scope and prohibited here). The
validator rejects any 3.1 evidence entry outright. For the one `udfa_signed` row
(`te-daequan-wright`), §3.1 is additionally structurally inapplicable (no `overall_pick` exists).

### §3.3 existing governed alias/identity artifact — unavailable

Re-verified at the same TIBER-Data commit: the only promoted identity crosswalk,
`exports/promoted/identity_crosswalk/tiber_identity_crosswalk_v1.json`, is a **Sleeper-provider
crosswalk only** (`supported_providers: ["sleeper"]`, 25 seeded records, coverage
`seeded_operator_verified_mappings_only_not_full_player_universe`, `tiber_player_id` values in the
`tiber-data-player-2025-*` format). It carries no TIBER-Rookies-slug-to-`gsis_id` mapping for any of
the 48 locked identities. Forecast did not construct a substitute and attribute it elsewhere.

### §3.2 explicit reviewed mapping — not completed; the mandatory human-review checkpoint has not occurred

§3.2 requires, for every resolved row: archived GSIS-bearing evidence (verified to contain the exact
claimed `gsis_id`), at least two independent archived corroborating facts, and an **explicit,
attributable, named-human sign-off**. No such human review occurred during this implementation, and
per issue #158 the implementing agent must not claim one. No candidate `gsis_id` values were
recorded anywhere in the artifact — deliberately, so that no name/team/position-derived candidate
could later be mistaken for evidence (design §4 prohibits every such inference path as proof).

**Result: every one of the 48 rows honestly remains `unresolved`** — per design §5, the default,
legitimate state ("no permitted evidence class has yet been attempted or completed"), explicitly
preferable to a guessed mapping.

## 4. Audit accounting (issue deliverables 5–8)

Reproduce with `npm run audit:rookie-transition-profile-identity-crosswalk`.

**Resolution status counts (sum = 48):**

| `resolved` | `unresolved` | `conflicting_evidence` | `blocked` |
| --- | --- | --- | --- |
| 0 | 48 | 0 | 0 |

**Evidence-class counts:**

| `3.1_overall_pick_chain` | `3.2_reviewed_mapping` | `3.3_governed_artifact` | `null` |
| --- | --- | --- | --- |
| 0 | 0 | 0 | 48 |

**Identity-coverage-dependency counts:**

| `independent_of_post_draft_outcome` | `contingent_on_post_draft_participation` | `unproven` |
| --- | --- | --- |
| 0 | 0 | 48 |

**Unresolved rows (all 48; none conflicting, none blocked):** `qb-carson-beck`, `qb-drew-allar`,
`qb-fernando-mendoza`, `qb-garrett-nussmeier`, `qb-ty-simpson`, `rb-emmett-johnson`,
`rb-jadarian-price`, `rb-jeremiyah-love`, `rb-jonah-coleman`, `rb-kaelon-black`, `rb-kaytron-allen`,
`rb-mike-washington-jr`, `rb-nick-singleton`, `rb-seth-mcgowan`, `te-daequan-wright`,
`te-eli-raridon`, `te-eli-stowers`, `te-justin-joly`, `te-kenyon-sadiq`, `te-marlin-klein`,
`te-max-klare`, `te-nate-boerkircher`, `te-oscar-delp`, `te-sam-roush`, `te-will-kacmarek`,
`wr-antonio-williams`, `wr-barion-brown`, `wr-brenen-thompson`, `wr-caleb-douglas`,
`wr-carnell-tate`, `wr-chris-bell`, `wr-chris-brazzell-ii`, `wr-deion-burks`, `wr-denzel-boston`,
`wr-dezhaun-stribling`, `wr-elijah-sarratt`, `wr-germie-bernard`, `wr-jakobi-lane`,
`wr-jordyn-tyson`, `wr-kc-concepcion`, `wr-kendrick-law`, `wr-kevin-coleman-jr`, `wr-makai-lemon`,
`wr-malachi-fields`, `wr-omar-cooper-jr`, `wr-ted-hurst`, `wr-zachariah-branch`, `wr-zavion-thomas`.

**Shared reason (recorded per row in `notes`):** §3.1 blocked pending second-leg evidence
(re-verified above; additionally structurally inapplicable for the UDFA row); §3.3 governed artifact
does not exist; §3.2 not completed because the mandatory named-human review has not occurred.

## 5. GSIS discoverability and post-draft participation (issue: "record whether GSIS discoverability depended on later NFL participation")

Every row records `identity_coverage_dependency: "unproven"` — the design's fail-closed default —
because no `gsis_id` was resolved, so no discoverability mechanism can honestly be recorded per row
(`identity_coverage_mechanism` is `null` on every row, and the validator rejects any independence
claim lacking a citable mechanism).

Audit context for the future §3.2/§3.3 follow-up, restating design §16's concrete finding: the only
GSIS-bearing governed source identified to date, TIBER-Data's `player_season_coverage_v0.json`, is
built from `nflreadpy.load_player_stats()` — accrued NFL statistics — so its coverage is
definitionally **contingent on post-draft game participation**. Any future resolution sourced from
it must record `identity_coverage_dependency: "contingent_on_post_draft_participation"`, and a 2026
draftee's `gsis_id` may not be discoverable in any TIBER-Data-ingested source until nflverse first
publishes it (typically first official-roster or game appearance) — an expected `unresolved` state,
not a defect.

## 6. Confirmations (issue deliverables 9–10 and hard boundaries)

- **No prohibited matching method was used** — no name-only, fuzzy/phonetic, normalized-name,
  position+name, school/team/roster-order, first-match/best-effort, or confidence-score method was
  applied anywhere; no candidate mapping derived from any such method was recorded; no row required
  `blocked`. The validator additionally rejects prohibited-method markers inside evidence entries.
- **No runtime/model/production/downstream/UI import was introduced** — the artifact lives outside
  every runtime path, the audit CLI is read-only, and a dedicated inertness test scans
  `src/models`, `src/services`, `src/api`, `src/adapters`, `src/features`, and `app` for any
  reference to the crosswalk or its validator.
- TIBER-Rookies, TIBER-Data, the four committed Forecast mirror files, and the mirror
  refresh/verifier/commit implementation are all unmodified; the mirror and source locks are
  preserved exactly.
- No Lane B work, no temporal-eligibility declaration, no readiness matrix, no experiment, no
  adapter/feature table, no predictive evaluation.
- No human review was claimed: `reviewer`/`reviewed_at` are `null` on all 48 rows, and validator
  test fixtures use an explicitly fictional reviewer name.

## 7. Validation and tests

- `npm run build` — clean (`tsc --noEmit`).
- `npm test` — full suite passes, including the 72 tests in `tests/rookieTransitionProfileIdentityCrosswalk.test.ts`
  covering: the committed artifact passing validation; missing locked row; extra row; duplicate
  governed key; invalid status token; invalid evidence-class token; resolved row without GSIS-bearing
  evidence; claimed GSIS ID absent from archived content; non-reproducible archive (hash mismatch);
  fewer than two corroborating facts; missing human sign-off; independent evidence resolving to a
  different GSIS ID; unbacked independent-evidence claim; unsupported 3.1 usage; prohibited-method
  contamination; self-attributed 3.3 artifact; unsupported independence claim; tampered status counts;
  out-of-order rows; tampered source lock; tampered issue/governing-design pins; a passing 3.2 control
  case; a passing, exact-key-matched 3.3 control case; 3.3 evidence with a non-reproducible citation,
  an unparseable archive, a missing rows array, zero/multiple/mismatched key matches, the specific
  cross-row string-co-occurrence regression, and a schema_version disagreement; a corroborating fact
  missing `expected_literal`, one whose archive doesn't actually contain it, and facts sharing an
  archive hash/location/text/URL (not independent); a well-formed blocked row verified via each of the
  three disqualification reasons (`prohibited_method`, `non_reproducible_or_fabricated_evidence`,
  `governed_blocker_citation`); a bare blocked row with no disposition/notes/evidence; the exact
  still-valid spoof the review identified (a recognized `evidence_class` with fabricated
  reviewer/notes but no real `disqualification_reason`) now rejected, both for one row and for all 48
  relabeled that way; a `prohibited_method` claim with no `attempted_evidence` at all, and one where
  the marker appears only in `disqualification_detail` (both rejected, including the all-48 variant);
  a `non_reproducible_or_fabricated_evidence` claim missing `claimed_value`, one whose citation cannot
  reproduce at all (proving only unresolved availability, never fabrication), and one whose citation
  reproduces and actually contains the claimed value (all three rejected); an `identity_coverage_mechanism`
  citation that is fabricated/unreproducible, one with zero matching rows, and one whose matched row
  does not itself record independence (all rejected, plus a passing exact-match control case); a
  mutable ref (`main`), `HEAD`, and an abbreviated SHA all rejected as citation commits, with a full
  40-hex SHA accepted; a blocked row missing only its human disposition; a prohibited-method marker
  inside a properly-disposed blocked row correctly *not* tripping the resolved-row rejection; and the
  two inertness scans.
- `npm run audit:rookie-transition-profile-identity-crosswalk` — `valid: true` with the accounting
  in §4.

## 8. Decision (exactly one)

```text
rookie_transition_profile_forecast_identity_resolution_audit_requires_followup
```

The governed Lane A artifact, fail-closed validator, tests, and full 48-row accounting are in place
and passing, but all 48 identities remain `unresolved`: the expected primary path (§3.2) cannot
produce a single `resolved` row without archived GSIS-bearing evidence **and** an explicit,
attributable named-human sign-off, which has not occurred, and no governed §3.1/§3.3 evidence exists
yet. Follow-up required before Lane A can be `..._complete`: assemble archived §3.2 candidate
evidence per row and obtain the row-level human review the design's checkpoint requires (and/or a
future governed §3.1 second leg or §3.3 artifact, cited by exact repo/commit/path/schema/hash).

This decision marks Lane A as still open. It does not authorize Lane B, the integrated readiness
review, experiment design or implementation, feature use, predictive evaluation, downstream
consumption, production binding, UI activation, or model use.
