# Lane B audit: source-availability evidence for rookie_transition_profile_v0.2.0 (#160)

**Status:** implementation + audit of Lane B only (design §8–§13 of the merged pre-experiment
readiness design), scoped down to what schema 1.0.0 can honestly support. This work creates the
governed, inert availability-evidence artifact and its fail-closed validator for the 5 field
families × 48 locked identities the committed `rookie_transition_profile_v0.2.0` mirror carries. It
performs no Lane A identity resolution, never reads or imports the Lane A crosswalk (#158/#159),
declares no field temporally eligible (see §2), opens no experiment, creates no adapter or feature
table, and authorizes no downstream consumption, production binding, UI activation, or model use.
It does not modify TIBER-Rookies, TIBER-Data, or any of the four committed Forecast mirror files.

## 1. Governing contract and locks

| | Value |
| --- | --- |
| Implementing issue | `TIBER-Forecast#160` (Lane B) |
| Governing design | `docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md` / `.json` |
| Design pinned at merge commit | `73834c2a30743c2587b32742c4e5c98320e33dfe` (#155 / PR #156) |
| Forecast mirror wrapper | `data/fixtures/tiberRookies/ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json` (`kind: rookie_transition_profile_v0_forecast_mirror_provenance`, `schema_version: 1.0.0`) |
| Forecast mirror commit pinned in this artifact | `Prometheus-Frameworks/TIBER-Forecast` @ `53731cbfa4701aa9861ead4b2fb73c2c29afe89b` (`MIRROR_SOURCE_COMMIT_PIN`; the commit that merged PR #159 / Lane A) |
| Upstream source lock (preserved exactly, dereferenced through the wrapper) | `Prometheus-Frameworks/TIBER-Rookies`, schema `rookie-transition-profile-v0.2.0`, season `2026`, 48 rows |

The locked population was not refreshed or reinterpreted: the 48 `source_player_id` values, and the
per-`(player, field_family)` presence facts checked against every row, are read directly from the
committed mirror JSON, dereferenced at the pinned commit via `git show`/`git ls-tree` (never the
current worktree, and never from this artifact's own claims).

Lane B is independent of Lane A: `src/rehearsal/rookieTransitionProfileAvailabilityEvidence.ts`
never imports or reads the identity-crosswalk module or artifact, and no availability decision here
is conditioned on any identity-resolution status.

## 2. What was created, and what schema 1.0.0 hard-rejects

| Deliverable | Path |
| --- | --- |
| Governed 240-row availability-evidence artifact (`kind: rookie_transition_profile_v0_forecast_availability_evidence`, `schema_version: 1.0.0`) | `data/experiments/rookieTransitionProfile/rookie_transition_profile_v0_forecast_availability_evidence.json` |
| Pure fail-closed validator (deterministic; no I/O) | `src/rehearsal/rookieTransitionProfileAvailabilityEvidence.ts` |
| Read-only audit CLI (`npm run audit:rookie-transition-profile-availability-evidence`) | `scripts/runRookieTransitionProfileAvailabilityAudit.ts` |
| Positive + negative validation tests (59 tests) | `tests/rookieTransitionProfileAvailabilityEvidence.test.ts` |
| This audit report | `docs/experiments/rookie-transition-profile-forecast-availability-evidence-audit-2026-07-13.md` / `.json` |

Every row carries all eight contract fields (`field_family`, `source_identity`, `availability_status`,
`available_at`, `source_snapshot_as_of`, `evidence_source`, `notes`, `review_decision`), rows are
deterministically ordered by `(source_season, source_repository, source_schema, source_player_id,
field_family)`, the full five-field governed key is duplicate-checked, and the artifact fails
validation on any missing, extra, or duplicated `(identity, family)` pair — exactly 48 × 5 = 240 keys
are required, no more, no fewer.

### `eligible_at_cutoff` / `ineligible_after_cutoff` are hard-rejected outright in schema 1.0.0

This is the central design decision of this report, reached after two independent review rounds on
PR #161. `AVAILABILITY_STATUSES` still lists both tokens (the full domain vocabulary), but the
validator rejects any row that claims either one, unconditionally — the same disposition Lane A
ultimately gave its own unverifiable `3.3_governed_artifact` evidence class (#159) rather than
continuing to layer narrower mechanical proxies for genuine proof.

**Why:** proving either status honestly requires two things no design exists for yet:

1. **Record-level binding.** A row's claimed value and timestamp must be shown to come from the
   *same* source record, for *this* player and field family specifically — not merely found as two
   independent substrings somewhere in a reproduced archive (which a multi-record archive could
   satisfy from two unrelated rows). Closing this requires per-`field_family` structured evidence
   contracts, and for derived families (`age_at_entry` from DOB + a reference-date formula;
   `college_production` from raw per-game stats) deterministic recomputation, none of which exists as
   a design yet.
2. **A typed semantic role for the matched timestamp.** A string match proves a timestamp appears in
   the archive, not that it specifically means "this fact became publicly knowable" as opposed to an
   event time, a retrieval time, or an unrelated timestamp elsewhere in the same document — and the
   cutoff side has the analogous gap for "this is the 2026 NFL Draft's Day 1/Round 1 start."

Earlier drafts of this artifact's validator implemented successively more careful *mechanical*
approximations of both properties (archive-and-value hash verification, then binding the claimed
`available_at` into the same archive-content check, then chronology ordering across
retrieval/review/availability timestamps) across two review rounds. Each round's fix was real and is
preserved in the module's git history, but each was also shown to still be a mechanical proxy, not
genuine record-level or semantic proof. Rather than continue that pattern indefinitely, `cutoff_at`
and `cutoff_evidence_source` — which exist solely to support these two statuses — are also
hard-required to stay `null` in schema 1.0.0; keeping that machinery "technically settable but never
consumed" would itself be exactly the kind of unused speculative schema this decision means to avoid.
A future schema version may lift this once a real per-`field_family` evidence contract is designed
and pinned as separate follow-up work under issue #160.

**Practical consequence:** every row's `available_at`, `evidence_source`, `review_decision`, and
`source_snapshot_as_of` must be `null` in schema 1.0.0 (the last because no reproducible
snapshot-evidence contract exists either), and the artifact's `cutoff_at`/`cutoff_evidence_source`
must be `null`. Only `unavailable` (the pinned mirror value is null) and
`unresolved_no_availability_proof` are usable statuses. Because every row with a present mirror value
is therefore permanently `unresolved_no_availability_proof` until that future schema version exists,
`..._complete` is not reachable for this population under schema 1.0.0 (see §7).

### What the validator still enforces, fail-closed

- **Contract pins** — `kind`/`schema_version`/`issue`/`governing_design` (readiness-design
  issue/PR/merge-commit/document paths) and `season` match the pinned constants exactly; the
  artifact's top-level fields, and every nested object (`source_identity`, `mirror_source`,
  `governing_design`, `status_counts`, `status_counts_by_family`), must match an exact, closed field
  set — no undeclared claim may be added silently anywhere in the document.
- **Mirror dereferencing, never a self-report** — `mirror_source` names the exact Forecast repo, the
  single pinned commit (`MIRROR_SOURCE_COMMIT_PIN`), the exact wrapper path/kind/schema_version, and
  a `sha256` that must equal the *recomputed* hash of the wrapper file's actual bytes at that pinned
  commit (never the wrapper's own declared hash, and never the current worktree state). The
  dereferenced wrapper itself is then checked: its `source_lock` (including `commit`) must match the
  locked starting point exactly, its declared `forecast_mirror.paths` must match the four authorized
  paths exactly (no missing, extra, or substituted keys), the mirror directory's contents at the
  pinned commit (via `git ls-tree`, not a live-worktree listing) must be exactly the four authorized
  files, and the wrapper's declared `mirrored_hashes` must equal the recomputed hashes of the actual
  mirror files' bytes at that commit.
- **Value-presence agreement (§11/§15)** — a row's `availability_status` must be `unavailable` if
  and only if the real pinned mirror value for that `(player, field_family)` is actually `null`,
  checked against the mirror JSON directly, never against anything the row itself claims.
- **Population accounting** — exactly 240 distinct governed keys; every one of the 48 locked
  identities has a row for all 5 families; no extra identity or family; declared `status_counts` and
  `status_counts_by_family` are recomputed from the rows and must match exactly, and must each sum to
  240 / 48 respectively.

### Design history (preserved for context; superseded by the hard-block above)

Before arriving at the hard-block, this artifact's validator went through several rounds of
proactive and reviewer-driven hardening, each closing a real self-certification or mechanical gap:
cross-checking `mirrored_value_literal` against the real pinned mirror value rather than trusting the
row's own cited archive (closed proactively before any review, applying the lesson Lane A's five
review rounds taught); binding a claimed `available_at` into the same archive-content check rather
than only comparing it to `cutoff_at`; dereferencing `mirror_source.commit` via `git show` rather
than only checking its shape; checking the wrapper's declared `forecast_mirror.paths`, not just its
hashes; requiring `published_draft_start_at` to itself be a parseable instant and agree with the
declared timezone offset; closing the top-level and nested schemas exactly; enforcing chronology
between retrieval, review, and availability timestamps; and deriving the mirror directory listing
from the pinned commit via `git ls-tree` rather than the live worktree. All of this work remains
visible in the module's git history. It was superseded, not wasted: it directly informed the
conclusion that a fundamentally different (per-`field_family`, record-bound, semantically-typed)
evidence contract — not a further-hardened generic one — is what closing `eligible_at_cutoff`/
`ineligible_after_cutoff` honestly requires.

## 3. Evidence paths attempted, per the merged design

### §8 pre-draft cutoff — not pinned, and not currently possible in schema 1.0.0

No archived, dated NFL draft-schedule evidence was assembled, and no human review of a cutoff
candidate occurred during this implementation. `cutoff_at` and `cutoff_evidence_source` are hard-
required to be `null` in schema 1.0.0 regardless (see §2), so this is not merely an unattempted path
but a currently-unusable one pending a future schema version.

### §10/§12 per-row exact-value availability evidence — not attempted, and hard-rejected if claimed

No archived, dated snapshot proving any exact mirrored value was or was not publicly knowable at a
point in time was assembled for any of the 240 `(player, field_family)` pairs. Even if it had been,
`eligible_at_cutoff`/`ineligible_after_cutoff` are hard-rejected outright in schema 1.0.0 (see §2).

### §11 missingness vs. timing — 17 rows are honestly `unavailable`

17 `(player, field_family)` pairs carry a `null` value in the committed mirror itself — a
missingness fact, independent of and unconditioned on any timing question. These are recorded
`unavailable`, per design §11's distinction that missingness is not itself a timing claim. The
remaining 223 pairs have a non-null pinned mirror value but no availability-timing evidence (and, per
§2, no timing status is currently usable regardless), recorded honestly
`unresolved_no_availability_proof`.

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
- **No human review was claimed, and none is claimable in schema 1.0.0.** `review_decision`,
  `available_at`, `evidence_source`, and `source_snapshot_as_of` are hard-required `null` on every
  row; `cutoff_at`/`cutoff_evidence_source` are hard-required `null` on the artifact. No reviewer name
  or review date appears anywhere in the committed artifact or is even structurally permitted.
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
- `npm test` — full suite passes (1260 tests across the repo), including the 59 tests in
  `tests/rookieTransitionProfileAvailabilityEvidence.test.ts` covering:
  - the committed artifact passing validation against the real, pinned-commit-dereferenced mirror;
    kind/schema/design pins; the exact 240-row population; every timing/evidence field null; the
    eight-field row contract; the `requires_followup` decision and full accounting;
  - population accounting: a missing identity (all five rows for a locked player removed), a missing
    single family for an otherwise-present identity, an extra row for an unlocked identity, a
    duplicate governed key, invalid `field_family`/`availability_status` tokens, extra/missing row
    fields, out-of-order rows, tampered `status_counts`/`status_counts_by_family`, and tampered
    issue/governing-design pins;
  - **`eligible_at_cutoff`/`ineligible_after_cutoff` hard-rejected outright**: for a row with a
    present real mirror value even with every other field properly null, for both statuses, for
    `official_postdraft_outcome` specifically (proving the family-level carve-out is now subsumed by
    the blanket rule), and confirming `..._complete` is never reachable if every row is relabeled
    eligible;
  - **non-null timing/evidence fields hard-rejected for every row**: `available_at`,
    `evidence_source`, `review_decision` (on any row, not only unavailable/unresolved ones),
    `cutoff_at`, `cutoff_evidence_source`, and any non-null `source_snapshot_as_of` (even a
    well-formed instant);
  - value-presence agreement in both directions (a present real value marked `unavailable`, a null
    real value marked otherwise), with a real-null-value control case;
  - nested schema closure: an extra key on `governing_design`, `mirror_source`, `source_identity`,
    `status_counts` (outer map and a per-family entry), and a `notes` value that is neither null nor
    a string;
  - top-level schema closure: an extra or missing top-level field, an unparseable `generated_at`, and
    a `generated_at_is_operational_timestamp_only_not_fact_availability` that isn't exactly `true`,
    with a control case;
  - mirror-wrapper dereferencing: tampered `sha256`, a wrong/substituted (but well-formed) commit,
    wrong repo, mismatched recomputed hashes, an unauthorized extra file in the mirror directory
    (via the pinned-commit `git ls-tree` listing), a tampered `source_lock` (including a moved
    `source_lock.commit` while every other wrapper field and mirror hash still agrees), and
    substituted or missing `forecast_mirror.paths` entries, with a control case proving the real
    dereferenced wrapper's paths match exactly;
  - a malformed locked-population size; and the two inertness scans.
- `npm run audit:rookie-transition-profile-availability-evidence` — `valid: true` with the accounting
  in §4, built by dereferencing the wrapper, mirror files, and mirror directory listing at the exact
  pinned Forecast commit via `git show`/`git ls-tree` rather than trusting the current worktree.

## 7. Decision (exactly one)

```text
rookie_transition_profile_forecast_source_availability_audit_requires_followup
```

The governed Lane B artifact, fail-closed validator, tests, and full 240-row accounting are in place
and passing. 223 of 240 `(player, field_family)` pairs are honestly `unresolved_no_availability_proof`
and the remaining 17 are honestly `unavailable`; no row claims `eligible_at_cutoff` or
`ineligible_after_cutoff`, both of which are now hard-rejected outright in schema 1.0.0 pending a
per-`field_family` structured evidence contract (design follow-up under issue #160). Because every
row with a present mirror value is therefore permanently `unresolved_no_availability_proof` under
this schema version, `..._complete` is not reachable for this population until that follow-up design
exists and a future schema version lifts the hard-rejection.

This decision marks Lane B as still open. It does not authorize the integrated readiness review,
experiment design or implementation, feature use, predictive evaluation, downstream consumption,
production binding, UI activation, or model use.
