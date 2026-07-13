# Lane B audit: source-availability evidence for rookie_transition_profile_v0.2.0 (#160)

**Status:** implementation + audit of Lane B only (design §8–§13 of the merged pre-experiment
readiness design). This work creates the governed, inert availability-evidence artifact and its
fail-closed validator for the 5 field families × 48 locked identities the committed
`rookie_transition_profile_v0.2.0` mirror carries. It performs no Lane A identity resolution, never
reads or imports the Lane A crosswalk (#158/#159), declares no field temporally eligible except
where real, reviewed, archived exact-value evidence proves it, opens no experiment, creates no
adapter or feature table, and authorizes no downstream consumption, production binding, UI
activation, or model use. It does not modify TIBER-Rookies, TIBER-Data, or any of the four
committed Forecast mirror files.

## 1. Governing contract and locks

| | Value |
| --- | --- |
| Implementing issue | `TIBER-Forecast#160` (Lane B) |
| Governing design | `docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md` / `.json` |
| Design pinned at merge commit | `73834c2a30743c2587b32742c4e5c98320e33dfe` (#155 / PR #156) |
| Forecast mirror wrapper | `data/fixtures/tiberRookies/ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json` (`kind: rookie_transition_profile_v0_forecast_mirror_provenance`, `schema_version: 1.0.0`) |
| Forecast mirror commit pinned in this artifact | `Prometheus-Frameworks/TIBER-Forecast` @ `53731cbfa4701aa9861ead4b2fb73c2c29afe89b` (the commit that merged PR #159 / Lane A) |
| Upstream source lock (preserved exactly, dereferenced through the wrapper) | `Prometheus-Frameworks/TIBER-Rookies`, schema `rookie-transition-profile-v0.2.0`, season `2026`, 48 rows |

The locked population was not refreshed or reinterpreted: the 48 `source_player_id` values, and the
per-`(player, field_family)` presence/value facts checked against every row, are read directly from
the committed mirror JSON (`data/fixtures/tiberRookies/rookie_transition_profile_v0_2026.mirror.json`),
never from this artifact's own claims.

Lane B is independent of Lane A: `src/rehearsal/rookieTransitionProfileAvailabilityEvidence.ts` never
imports or reads the identity-crosswalk module or artifact, and no availability decision here is
conditioned on any identity-resolution status.

## 2. What was created

| Deliverable | Path |
| --- | --- |
| Governed 240-row availability-evidence artifact (`kind: rookie_transition_profile_v0_forecast_availability_evidence`, `schema_version: 1.0.0`) | `data/experiments/rookieTransitionProfile/rookie_transition_profile_v0_forecast_availability_evidence.json` |
| Pure fail-closed validator (deterministic; no I/O) | `src/rehearsal/rookieTransitionProfileAvailabilityEvidence.ts` |
| Read-only audit CLI (`npm run audit:rookie-transition-profile-availability-evidence`) | `scripts/runRookieTransitionProfileAvailabilityAudit.ts` |
| Positive + negative validation tests (76 tests) | `tests/rookieTransitionProfileAvailabilityEvidence.test.ts` |
| This audit report | `docs/experiments/rookie-transition-profile-forecast-availability-evidence-audit-2026-07-13.md` / `.json` |

Every row carries all eight contract fields (`field_family`, `source_identity`, `availability_status`,
`available_at`, `source_snapshot_as_of`, `evidence_source`, `notes`, `review_decision`), rows are
deterministically ordered by `(source_season, source_repository, source_schema, source_player_id,
field_family)`, the full five-field governed key (the four source-identity fields plus
`field_family`) is duplicate-checked, and the artifact fails validation on any missing, extra, or
duplicated `(identity, family)` pair — exactly 48 × 5 = 240 keys are required, no more, no fewer.

The validator enforces, fail-closed:

- **Contract pins** — `kind`/`schema_version`/`issue`/`governing_design` (readiness-design
  issue/PR/merge-commit/document paths) and `season` match the pinned constants exactly.
- **Mirror dereferencing, never a self-report** — `mirror_source` names the exact Forecast repo, a
  full 40-hex commit SHA, the exact wrapper path/kind/schema_version, and a `sha256` that must equal
  the *recomputed* hash of the actual committed wrapper file (never the wrapper's own declared hash).
  The dereferenced wrapper itself is then checked: its `source_lock` must match the locked starting
  point exactly, the mirror directory must contain exactly the four authorized files (no more, no
  fewer, no substitutes), and the wrapper's declared `mirrored_hashes` must equal the recomputed
  hashes of the actual `mirror_json`/`mirror_csv`/`mirror_manifest` bytes on disk.
- **Cutoff validation (§8)** — `cutoff_at` and `cutoff_evidence_source` are null/non-null together
  (never one without the other); a non-null cutoff requires a named human `reviewer`/`reviewed_at`,
  `source_timezone_or_offset`, and `published_draft_start_at`; the citation must actually reproduce
  from its repo/commit/path/sha256 (fail-closed on hash mismatch); the reproduced archive must
  actually state the locked season and actually contain the claimed `published_draft_start_at`; and
  `cutoff_at` must be strictly earlier than that archived draft start.
- **Value-presence agreement (§11/§15)** — a row's `availability_status` must be `unavailable` if
  and only if the real pinned mirror value for that `(player, field_family)` is actually `null`,
  checked against the mirror JSON directly, never against anything the row itself claims.
- **`official_postdraft_outcome` temporal restriction (§10)** — this family may never be
  `eligible_at_cutoff`; it is definitionally post-draft information.
- **`unavailable`/`unresolved_no_availability_proof` rows must carry null `available_at` and null
  `evidence_source`** — a row cannot claim availability evidence while declaring no availability
  finding.
- **`eligible_at_cutoff`/`ineligible_after_cutoff` rows require real, reproduced, exact-value
  evidence AND an explicit, attributable human review, never self-certified**: a validly pinned
  `cutoff_at`; a parseable, offset-bearing `available_at`; a structurally complete `evidence_source`
  with a non-empty `mirrored_value_literal`; a citation that actually reproduces (hash-verified); the
  reproduced archive must actually contain the claimed literal; **the reproduced archive must also
  actually contain the claimed `available_at` itself** (a dated snapshot must state the date it was
  taken, not just the value — see below); **the claimed literal must also equal the REAL pinned
  mirror value for that `(player, field_family)`, recomputed directly from the committed mirror
  JSON** (closing a self-certification gap — see below); a non-null `review_decision` with a named
  `reviewer`/`reviewed_at`; and `available_at` must actually sit on the correct side of `cutoff_at`
  for the claimed status (`< cutoff_at` for eligible, `>= cutoff_at` for ineligible).
- **Population accounting** — exactly 240 distinct governed keys; every one of the 48 locked
  identities has a row for all 5 families; no extra identity or family; declared `status_counts` and
  `status_counts_by_family` are recomputed from the rows and must match exactly, and must each sum to
  240 / 48 respectively.

**Hardened during implementation, before this PR was reviewed:** the initial draft validated
`mirrored_value_literal` only against the row's own cited archive — the same shape of
self-certification gap Lane A's independent review took five rounds to close (a claim and its
"proof" both authored by the same party, in the same PR, are not independent verification, however
mechanically rigorous the check on top of them is). Before writing tests, the validator was
extended to also cross-check every eligible/ineligible row's `mirrored_value_literal` against the
REAL pinned mirror value for that `(player, field_family)`, recomputed by the CLI directly from the
committed mirror JSON and passed in as `MirrorVerificationContext.mirrorValueLiterals` — never
trusted from the artifact or its cited archive alone. A row can no longer claim eligibility for a
self-declared literal unrelated to what the mirror actually carries.

**Strengthened after independent (automated) review, before this PR was reviewed by the repo owner:**

- **`available_at` is now bound to the archive, not just the value.** The prior draft resolved and
  hash-verified the archive and confirmed it contained the claimed `mirrored_value_literal`, but never
  checked that the archive actually stated the claimed `available_at` date at all. A row could cite
  content that genuinely proves the value existed somewhere while self-declaring an arbitrary,
  favorable `available_at` the archive never states — certifying a timing claim the evidence never
  supports. The reproduced archive must now also contain the exact `available_at` string before it is
  compared against `cutoff_at`.
- **The dereferenced wrapper's `source_lock` comparison now includes `commit`.** The prior check
  compared `repo`/`schema_version`/`season`/`row_count` but omitted `commit`, so a wrapper/artifact
  pair could in principle advance the pinned upstream TIBER-Rookies commit while keeping every other
  field and the mirror hashes consistent, and this check would still report a match. The comparison
  now requires `lock.commit === SOURCE_COMMIT` as well.

**Strengthened after a full independent review by the repo owner, before this PR merged:** the
automated pass above closed the two most mechanically obvious gaps, but the owner's review went
deeper on the same two themes plus two others the automated pass didn't reach:

- **The `available_at`-binding fix above was necessary but not sufficient by itself.** The owner
  requested the specific regression it was intended to prevent: the same real, reproducing archive
  cited for a genuine eligible/ineligible snapshot, paired with a *different* self-declared
  `available_at` that still lands on the same side of the cutoff (so the naive ordering check alone
  would still "pass"). Both an eligible and an ineligible variant of this regression are now tested
  directly, plus a case proving a source that only ever states a bare date (no time-of-day or offset)
  can never be silently treated as midnight in some chosen timezone — the archive-content match
  requires the literal, fully-qualified instant, not a derived approximation.
- **`mirror_source.commit` is now dereferenced, not just shape-checked.** The prior check confirmed
  `mirror_source.commit` merely *looked like* a full 40-hex SHA; any other well-formed 40-hex value
  would still validate, because the CLI read the wrapper/mirror bytes straight off the current
  worktree regardless of what commit the artifact claimed. `mirror_source.commit` is now checked
  against a single pinned exact value (`MIRROR_SOURCE_COMMIT_PIN`, the commit that merged Lane A), and
  the CLI now dereferences the wrapper and all three mirror files at exactly that commit via `git show
  <commit>:<path>` — proving the bytes actually come from that commit, rather than trusting the
  working tree to be at it. (The live mirror-directory listing, a separate hygiene check for stray
  local files, still reads the real worktree directory.)
- **The wrapper's declared `forecast_mirror.paths` are now checked, not just its hashes.** The wrapper
  contract requires declaring exactly the four authorized local paths, but the prior validator only
  checked the real directory's filenames and the three recomputed content hashes — a wrapper could
  declare a substituted or missing path entry and still pass, since the *directory* happened to
  contain the expected files regardless of what the wrapper *said*. The declared path map must now
  match the four authorized paths exactly (no missing, extra, or substituted keys).
- **Cutoff timezone/instant rigor.** `published_draft_start_at` is now hard-required to itself be a
  parseable, offset-bearing instant — previously an unparseable string like `"not-a-timestamp"` simply
  caused the strict cutoff-ordering comparison to silently skip itself (no error at all), rather than
  failing closed. `source_timezone_or_offset` must also now agree with the offset actually embedded in
  `published_draft_start_at`, so the two fields can no longer disagree while each individually looks
  plausible.
- **The top-level artifact schema is now closed.** Rows already had an exact-field check, but the
  top-level artifact did not — the committed JSON already carried
  `generated_at_is_operational_timestamp_only_not_fact_availability`, a field absent from the prior
  TypeScript contract and silently ignored by validation, and any further undeclared top-level claim
  could likewise have been added without rejection. The artifact's top-level fields must now match an
  exact, enumerated set; `generated_at` must be a parseable, offset-bearing instant; the
  operational-timestamp flag must be exactly `true`; and a non-null `source_snapshot_as_of` must be a
  parseable, offset-bearing instant (it remains supplementary bookkeeping metadata, never a substitute
  for `available_at`'s archive-bound proof). `retrieved_at`/`reviewed_at` fields across citations and
  review decisions are now required to be parseable dates, not merely non-empty strings.

## 3. Evidence paths attempted, per the merged design

### §8 pre-draft cutoff — not pinned

No archived, dated NFL draft-schedule evidence was assembled, and no human review of a cutoff
candidate occurred during this implementation. Per issue #160's explicit requirement (mirroring
#158's), the implementing agent must not claim a human reviewed or signed off on a cutoff candidate
without an explicit, attributable review actually occurring. `cutoff_at` and `cutoff_evidence_source`
therefore remain honestly `null` in the committed artifact.

### §10/§12 per-row exact-value availability evidence — not attempted

With no pinned cutoff, no row can honestly claim `eligible_at_cutoff` or `ineligible_after_cutoff`:
both require a validly pinned `cutoff_at` as a hard precondition, checked first. No archived, dated
snapshot proving any exact mirrored value was or was not publicly knowable at a point in time was
assembled for any of the 240 `(player, field_family)` pairs.

### §11 missingness vs. timing — 17 rows are honestly `unavailable`

17 `(player, field_family)` pairs carry a `null` value in the committed mirror itself — a
missingness fact, independent of and unconditioned on any timing question. These are recorded
`unavailable`, per design §11's distinction that missingness is not itself a timing claim. The
remaining 223 pairs have a non-null pinned mirror value but no availability-timing evidence,
recorded honestly `unresolved_no_availability_proof`.

## 4. Audit accounting (reproduce with `npm run audit:rookie-transition-profile-availability-evidence`)

**Status counts (sum = 240):**

| `eligible_at_cutoff` | `ineligible_after_cutoff` | `unresolved_no_availability_proof` | `unavailable` |
| --- | --- | --- | --- |
| 0 | 0 | 223 | 17 |

**Status counts by field family (each sums to 48):**

| Field family | `eligible_at_cutoff` | `ineligible_after_cutoff` | `unresolved_no_availability_proof` | `unavailable` |
| --- | --- | --- | --- | --- |
| `draft_capital` | 0 | 0 | 48 | 0 |
| `age_at_entry` | 0 | 0 | 47 | 1 |
| `athletic_testing` | 0 | 0 | 32 | 16 |
| `college_production` | 0 | 0 | 48 | 0 |
| `official_postdraft_outcome` | 0 | 0 | 48 | 0 |

The 17 `unavailable` rows are exactly the `(player, field_family)` pairs where the committed mirror's
own value is `null` (1 player missing `age_at_entry`; 16 players missing `athletic_testing`) — no
other family has any missing value in the locked population.

## 5. Confirmations

- **No availability claim was guessed, inferred, or defaulted.** Every row is either a real
  missingness fact (`unavailable`, checked against the actual mirror value) or an honest
  `unresolved_no_availability_proof` — never an assumed-eligible or assumed-ineligible claim.
- **No human review was claimed.** `review_decision` is `null` on every row, and `cutoff_at`/
  `cutoff_evidence_source` are `null` — no reviewer name or review date appears anywhere in the
  committed artifact. Validator test fixtures use an explicitly fictional reviewer name.
- **Lane B is independent of Lane A.** The validator module never imports, reads, or references the
  identity-crosswalk module or artifact (#158/#159), and no availability status is conditioned on
  identity-resolution status.
- **No runtime/model/production/downstream/UI import was introduced** — the artifact lives outside
  every runtime path, the audit CLI is read-only, and a dedicated inertness test scans
  `src/models`, `src/services`, `src/api`, `src/adapters`, `src/features`, and `app` for any
  reference to the availability-evidence artifact or its validator.
- TIBER-Rookies, TIBER-Data, the four committed Forecast mirror files, and the mirror
  refresh/verifier/commit implementation are all unmodified; the mirror and source locks are
  preserved exactly.
- No experiment, no adapter/feature table, no predictive evaluation, no readiness-matrix population.

## 6. Validation and tests

- `npm run build` — clean (`tsc --noEmit`).
- `npm test` — full suite passes (1277 tests across the repo), including the 76 tests in
  `tests/rookieTransitionProfileAvailabilityEvidence.test.ts` covering:
  - the committed artifact passing validation against the real, pinned-commit-dereferenced mirror;
    kind/schema/design pins; the exact 240-row population; no claimed human review; the eight-field
    row contract; the `requires_followup` decision and full accounting;
  - population accounting: a missing identity (all five rows for a locked player removed), a missing
    single family for an otherwise-present identity, an extra row for an unlocked identity, a
    duplicate governed key, invalid `field_family`/`availability_status` tokens, extra/missing row
    fields, out-of-order rows, tampered `status_counts`/`status_counts_by_family`, and tampered
    issue/governing-design pins;
  - value-presence agreement in both directions (a present real value marked `unavailable`, a null
    real value marked otherwise), with a real-null-value control case, and `official_postdraft_outcome`
    rejected as `eligible_at_cutoff` even with otherwise-complete evidence;
  - the full cutoff-validation matrix: non-null evidence source while cutoff is null; non-null cutoff
    with a null evidence source; missing reviewer/reviewed_at; missing timezone/published_draft_start_at;
    a non-reproducible citation; an archive that doesn't state the season or the claimed draft start; a
    cutoff not strictly earlier than the archived draft start; **an unparseable
    `published_draft_start_at` that previously would have silently skipped the ordering check
    entirely; a `source_timezone_or_offset` that disagrees with the offset actually embedded in
    `published_draft_start_at`**; and a clean control case;
  - eligible/ineligible row requirements: real-mirror-matched control cases; an eligible claim with no
    cutoff pinned; an unparseable `available_at`; a missing `evidence_source`; an empty
    `mirrored_value_literal`; a non-reproducible row citation; an archive that doesn't actually contain
    the claimed literal; **an archive that contains the claimed value but never states the claimed
    `available_at` at all; a self-declared `available_at` the archive never states even while
    genuinely proving the value; the exact owner-requested regression of the same archive/value paired
    with a *different* self-declared timestamp on the *same side* of the cutoff, for both eligible and
    ineligible variants; and a bare-date-only archive proving `available_at` may never be silently
    treated as midnight in some chosen timezone (the archive-binding regression tests)**; **a
    `mirrored_value_literal` that the archive faithfully contains but that does not match the REAL
    pinned mirror value (the self-certification-gap regression test)**; a missing or incomplete
    `review_decision`; unavailable/unresolved rows carrying a non-null `available_at` or
    `evidence_source`; and timestamp-substitution rejections for both eligible and ineligible claims;
  - a valid eligible row still only reaching `requires_followup` while other rows remain unresolved;
  - mirror-wrapper dereferencing: tampered `sha256`, a wrong/substituted (but well-formed) commit,
    wrong repo, mismatched recomputed hashes, an unauthorized extra file in the mirror directory, a
    tampered `source_lock` (including specifically a moved `source_lock.commit` while every other
    wrapper field and mirror hash still agrees), and **substituted or missing `forecast_mirror.paths`
    entries**, with a control case proving the real dereferenced wrapper's paths match exactly;
  - **top-level schema closure: an extra undeclared top-level field, a missing required top-level
    field, an unparseable `generated_at`, a `generated_at_is_operational_timestamp_only_not_fact_availability`
    that isn't exactly `true`, and a non-null `source_snapshot_as_of` that isn't a parseable instant**,
    with a control case on the committed artifact;
  - a malformed locked-population size; and the two inertness scans.
- `npm run audit:rookie-transition-profile-availability-evidence` — `valid: true` with the accounting
  in §4, now built by dereferencing the wrapper and mirror files at the exact pinned Forecast commit
  via `git show` rather than trusting the current worktree.

## 7. Decision (exactly one)

```text
rookie_transition_profile_forecast_source_availability_audit_requires_followup
```

The governed Lane B artifact, fail-closed validator, tests, and full 240-row accounting are in place
and passing, but 223 of 240 `(player, field_family)` pairs remain
`unresolved_no_availability_proof`: no pre-draft cutoff has been pinned (requires archived NFL
draft-schedule evidence and an explicit, attributable human review, which has not occurred), and no
archived exact-value snapshot evidence has been assembled for any pair. Follow-up required before
Lane B can be `..._complete`: pin a real, reviewed cutoff and assemble archived, dated snapshot
evidence per `(player, field_family)` pair, each with the required human review.

This decision marks Lane B as still open. It does not authorize the integrated readiness review,
experiment design or implementation, feature use, predictive evaluation, downstream consumption,
production binding, UI activation, or model use.
