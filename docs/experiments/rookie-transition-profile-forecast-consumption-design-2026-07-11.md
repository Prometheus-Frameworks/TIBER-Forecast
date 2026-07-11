# Forecast consumption contract design: `rookie_transition_profile_v0.2.0`

> **Status: design only.** This document defines how, if at all, `rookie_transition_profile_v0.2.0`
> may eventually be mirrored into TIBER-Forecast. It performs **no mirror, no adapter, no feature
> code, no fixture, no experiment, no model wiring, no production import, and no predictive
> evaluation**, and makes **no claim that any field improves MAE, RMSE, calibration, or fantasy-point
> prediction**. It turns TIBER-Rookies' promotion (#269/PR #270) into a reviewed consumption
> boundary; it is not a mirror and does not create one.

## 0. Relationship to the source promotion

- TIBER-Rookies PR #270 squash-merged at `2ef92fa`, promoting `rookie_transition_profile_v0.2.0` to
  `Prometheus-Frameworks/TIBER-Rookies:exports/promoted/rookie-transition-profile/`. That promotion
  (per its own review report, `docs/reports/2026-07-10-rookie-transition-profile-v0-2-promotion-review.md`
  in TIBER-Rookies) authorized only a governed TIBER-Rookies source artifact — explicitly not a
  Forecast mirror, feature use, predictive evaluation, or production binding.
- Per `docs/ownership-boundaries.md` §3/§5, Forecast may consume "Rookie context from TIBER-Rookies
  where relevant" but does **not** own "Rookie model/cards/board" — TIBER-Rookies remains the source
  of truth for this artifact's identity, values, and governance; this design does not re-derive or
  re-govern any of it.
- Per `docs/capabilities/README.md`, every Forecast capability (player-history is the one reference
  instance that has completed the path end-to-end) earns production binding through the same
  sequence of separately-reviewed stages: *capability identified → owned source artifact → mirror /
  rehearsal path → validation → threshold review → binding review → implementation → activation
  verification*. This design sits at the boundary between the first two stages: the source artifact
  is now owned/promoted; this document is what a future mirror-stage issue must conform to. See §10.

## 1. Source identity and lock

| | Value |
| --- | --- |
| Source repo | `Prometheus-Frameworks/TIBER-Rookies` |
| Promoted path | `exports/promoted/rookie-transition-profile/` |
| Source commit (`main`) | `2ef92faf9a9c91a393f53e9140428451529a1c48` |
| Promotion review / PR | TIBER-Rookies#269 / PR#270 |
| Schema version | `rookie-transition-profile-v0.2.0` |
| Season | `2026` (the draft class year, not necessarily Forecast's own season-numbering convention — see §5) |
| `generated_at` | `2026-07-10T12:00:00+00:00` |
| `run_id` | `rookie-transition-profile-2026-2026-07-10T12:00:00+00:00` |
| Row count | 48 |
| Coverage summary | `players_total: 48, players_with_draft_capital: 48, players_with_age_at_entry: 47, players_with_athletic_testing: 32, players_with_college_production: 48, players_with_official_postdraft_outcome: 48, players_with_all_families: 32` |

**Artifact hashes (SHA-256, independently recomputed from the committed files at `2ef92fa`, not
copied from the source manifest without verification):**

| File | SHA-256 |
| --- | --- |
| `2026_rookie_transition_profile_v0.json` | `c95b941c7855612daccfc2226fc51e0e34dbb2ebe8a2487596675d2522a22f37` |
| `2026_rookie_transition_profile_v0.csv` | `3005bcd6ad4ffc87a312c6926e20c5e3658747012855aa9d8ccfa33d898545e6` |
| `2026_manifest.json` | `0acf361c6d2d8cc6f684026481a5aa279e9f7fa718256fad78da0366d5804413` |

**Source-manifest input hashes** (the upstream files the promoted artifact itself is hash-locked
against, per TIBER-Rookies' own manifest — recorded here so a future mirror can detect *any* upstream
drift, not only drift in the promoted output itself):

| Path | SHA-256 |
| --- | --- |
| `exports/promoted/rookie-alpha/2026_rookie_alpha_predraft_v0.json` | `5a7c6c945ad477c1a54e61e7337e9f5bd6b5e69455669ca4700d7668fe9816e3` |
| `data/processed/2026_draft_capital_proxy.json` | `5622f5ab86d8db812a3c98fd67b74960943d687fa323f7e9592533f8d058738f` |
| `data/processed/2026_college_production.json` | `c4c15efd609fef982e417817148b1b7bc090f53896791eb2cb85cf1bf665fb0d` |
| `data/processed/2026_prospect_context.json` | `bdf16633076bb5fb28e9451028fc476fadf6ff727dc06bdb106eb026e741de0e` |
| `data/processed/2026_draft_results.json` | `ae6b037845f5b6bcd87e17185d1086a3de1cf6a915571f3da1d5d716965f01bd` |
| `data/processed/2026_day3_udfa_draft_result_profiles.json` | `1f9b3a3c592bbc94f42c3d361461372b104f3f320fa9d11ebc5bcdb6511822ec` |

**Drift handling (fail-closed, mandatory for the future mirror):**

- Any mismatch on repo, path, source commit, schema version, or any hash above must cause the
  mirror-refresh process to **refuse to refresh and exit non-zero** — never silently adopt the new
  bytes. This mirrors the exact pattern already proven in `verifyPlayerHistoryMirrorProvenance`
  (`src/datasets/seasonal/playerHistoryProductionOnlySource.ts`): identity is asserted and checked,
  never assumed from a file path or convention.
- A schema-version change (e.g. `v0.2.0` → `v0.3.0`) is **not** an automatic refresh trigger — it
  requires this design document to be amended (or superseded) and re-reviewed, since a new field
  family or changed field semantics could invalidate the classifications in §4/§5 without changing
  any byte the hash check alone would catch as "the same."
- A row-count or coverage-summary change (e.g. a future season's rookie class, or a corrected
  re-promotion of 2026) requires the same re-review, not just a hash-mismatch check, because §3's row
  grain and §5's temporal rules are validated against the specific 48-row/2026 population described
  here.

## 2. Mirror form

**Selected: B — source-aligned mirror plus Forecast-owned wrapper metadata.**

Rejected alternatives:

- **A (byte-identical mirror only)** is insufficient on its own: Forecast needs a place to record
  identity-resolution status (§3), phase-eligibility tags (§5), and mirror-refresh provenance (§9)
  that TIBER-Rookies has no reason to carry in its own artifact. A bare byte copy with no
  Forecast-owned metadata slot would push that bookkeeping into ad hoc code comments instead of a
  reviewable artifact — precisely what `docs/tiber-data-fixture-adapter-decision.md` and the existing
  `data/fixtures/tiberData/*_PROVENANCE.json` convention already avoid for every other cross-repo
  mirror in this codebase.
- **C (normalized Forecast adapter)** is premature at the mirror stage. Normalizing implies making
  transformation decisions now — e.g. converting `draft_capital.value.big_board_rank` into a
  model-ready numeric feature, or collapsing `official_postdraft_outcome.value.status` into a
  boolean — and those are exactly the feature-design decisions this issue's hard boundaries reserve
  for a future, separate experiment-design issue (mirroring how player-history's own mirror stage
  (#101/#102) stayed at "compact mirror + gate," with feature *extraction* deferred to its own later
  issue, and feature *binding* deferred further still). A model-ready feature table is explicitly out
  of scope per the issue and is not selected here.

**Design:**

- **Forecast-owned path/filename convention** (proposed, not created by this issue):
  ```text
  data/fixtures/tiberRookies/
    rookie_transition_profile_v0_2026.mirror.json      (byte-identical copy of the promoted JSON)
    rookie_transition_profile_v0_2026.mirror.csv       (byte-identical copy of the promoted CSV)
    ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json (Forecast-owned wrapper; see below)
  ```
  This mirrors the exact `data/fixtures/tiberData/<artifact>.mirror.json` +
  `<ARTIFACT>_PROVENANCE.json` pattern already used for every TIBER-Data mirror in this repo (e.g.
  `player_season_coverage_v0_2022_2025.mirror.json` /
  `PLAYER_SEASON_COVERAGE_MIRROR_PROVENANCE.json`).
- **Artifact type / schema ownership:** the mirrored JSON/CSV remain **TIBER-Rookies-owned**
  content, unchanged byte-for-byte; `schema_version: "rookie-transition-profile-v0.2.0"` inside them
  continues to mean exactly what TIBER-Rookies says it means. The wrapper file is
  **Forecast-owned**, with its own `kind`/version (proposed:
  `"kind": "rookie_transition_profile_v0_forecast_mirror_provenance"`, wrapper schema version
  `"1.0.0"`, independent of the upstream artifact's own schema version).
- **Embedded vs. copied vs. transformed:** copied verbatim (byte-for-byte). No value is recomputed,
  renamed, reshaped, or reordered. This artifact is small (48 rows, well under the size that made
  TIBER-Data's `player_season_coverage_v0` mirror a deliberately compact representative sample
  instead of a full copy), so there is no size justification for anything less than a full,
  byte-identical copy of both the JSON and the CSV.
- **All three of JSON, CSV, and manifest are mirrored.** The manifest is mirrored (as a fourth file,
  `rookie_transition_profile_v0_2026.manifest.mirror.json`) specifically so the future mirror's own
  hash-verification step can compare against TIBER-Rookies' own recorded input/output hashes without
  having to reconstruct them from the JSON/CSV alone.
- **What Forecast-owned metadata is added** (in the wrapper file, not the mirrored payload): source
  lock (§1's table, verbatim), mirror-refresh timestamp (`mirror_refreshed_at` — a Forecast-side
  operational timestamp only, see §5's timestamp-conflation warning), identity-resolution status per
  row (§3), and a pointer to this design document's decision as the mirror's governing contract.
- **Permitted differences from source:** none in the mirrored payload bytes. The wrapper file is
  wholly additive (a sibling file, not an edit to the mirrored content).
- **Byte/content parity validation:** SHA-256 of each mirrored file must equal §1's table, checked on
  every refresh before the wrapper is regenerated; a mismatch fails closed per §1.
- **This is the only artifact this design authorizes.** The mirror-implementation issue produces
  exactly the four files above — the full byte-identical JSON/CSV/manifest plus the wrapper — and
  nothing else. It does **not** produce a `pre_draft`-filtered, phase-specific, or otherwise derived
  projection of any kind. A file that physically omits a field the source artifact carries is a
  transformation, not a byte-identical mirror, and transformation of any kind was already rejected
  for this stage in Option C above. §5 defines phase eligibility as a **classification** future
  stages must respect; it does not authorize this stage to build the view that classification implies.
  Any future phase-specific view (§5, §10) is explicitly out-of-scope work for a later,
  separately-reviewed controlled-experiment/adapter design, with its own path, schema, transformation
  rule, provenance, and hash contract — not an implicit extension of this mirror form.

## 3. Row grain and identity

**Row grain:** `(player_id, season, source_run_id, prediction_phase)` —

- `player_id`: TIBER-Rookies' own identity field (e.g. `te-daequan-wright`, `wr-zachariah-branch`) —
  a **position-prefixed name slug**, confirmed by direct inspection of the TIBER-Rookies contract
  (`docs/rookie-transition-profile-contract.md`) and codebase to be locally scoped to that repo, with
  no evidence it is, or is required to be, the same canonical identity Forecast elsewhere expects
  (Forecast's existing player-history contract documents its own `player_id` as
  "gsis_id-equivalent, source-verified identity only" —
  `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md`). **This design
  does not assume the two ID spaces are compatible.**
- `season`: `2026` (the draft class year recorded in the artifact's `season` field / each row's
  `class_year`) — see §5 for why this must not be conflated with Forecast's own target-season
  numbering without an explicit check.
- `source_run_id`: the upstream `run_id` (`rookie-transition-profile-2026-2026-07-10T12:00:00+00:00`),
  so a future rehearsal can prove which exact upstream generation it used, independent of the mirror's
  own refresh timestamp.
- `prediction_phase`: `pre_draft` | `post_draft` (§5) — not a field in the source artifact; a
  Forecast-side tag applied when a row is read for a specific rehearsal/experiment, never persisted
  as if it were upstream provenance.

**Join contract — identity resolution is unresolved and must fail closed, not degrade to name
matching:**

There is currently no known, verified crosswalk mapping TIBER-Rookies' `player_id` slugs to
whatever canonical player identity a future Forecast rookie-related feature would need to join
against (e.g. an existing Forecast/TIBER-Data player population). This is a genuine, unresolved gap
this design surfaces rather than papering over:

- **No name-based or fuzzy join is permitted**, per the issue's explicit prohibition. `player_name` +
  `school` + `class_year` may be used only as an internal **corroboration** check on top of an
  already-asserted identity (see below), never as the join key itself, and never as a substitute when
  a `player_id`-based join is unavailable.
- **Missing Forecast player IDs** (a TIBER-Rookies row that cannot be matched to any Forecast-known
  player): the row is retained in the mirror (for audit purposes only, per §4) but marked
  `identity_status: "unresolved_to_forecast_population"` in the wrapper file, and must be excluded
  from any feature-bearing join until resolved.
- **Duplicate IDs**: TIBER-Rookies' own validator already asserts uniqueness of `player_id` within its
  artifact (confirmed: 48 unique of 48 rows at this snapshot), but the Forecast mirror must
  **independently** re-verify this on every refresh rather than trust the upstream claim, and must
  fail closed (refuse to refresh) if a duplicate is ever found.
- **Season mismatch**: a mirror read for a rehearsal targeting a season other than the row's own
  `season`/`class_year` must be rejected for that row — there is no cross-season carry-forward
  defined for this artifact (unlike player-history's rolling multi-season window).
- **Source rows absent from the Forecast population, and Forecast players absent from the source
  artifact:** both are expected, normal, and must be reported (counts, not silently dropped) — a
  rookie class is a strict subset of any Forecast player population, and not every Forecast-relevant
  rookie will necessarily appear in a specific TIBER-Rookies snapshot (e.g. a player added to a
  Forecast population from a different source before TIBER-Rookies covers them).
- **No join failure may be repaired by fuzzy matching inside the mirror implementation** — an
  unresolved identity is a reportable gap, not an engineering problem to route around with
  approximate matching. Building an actual canonical-ID crosswalk (if one is needed) is explicitly
  future, separate work, not something this design or a mirror-stage issue may invent inline.

## 4. Field-by-field classification

Every classification below assumes identity resolution (§3) has already succeeded for that row; an
unresolved-identity row is `mirrored_for_audit_only` regardless of field, by construction, since no
field can be safely joined to anything without a verified identity.

| Family | Initial classification | Rationale |
| --- | --- | --- |
| `draft_capital` | Mirrored for audit only; temporal eligibility **unresolved** | A market-derived proxy (`source_type: market_derived_proxy`, fixed confidence 0.65) that is conceptually pre-draft in origin, but the artifact records no governed as-of date proving when this specific value was live — a big-board proxy can change throughout the pre-draft cycle. Not classified pre-draft-safe (see §5). |
| `age_at_entry` | Mirrored for audit only; temporal eligibility **unresolved** | A measured identity fact (date of birth → age) that is stable once knowable, but "knowable" itself has no governed as-of proof in this artifact; see §5. |
| `athletic_testing` | Mirrored for audit only; temporal eligibility **unresolved** | Combine-derived, and therefore has a real, specific unavailable-before date (the NFL combine) that this artifact does not record; assuming availability at an arbitrary pre-draft cutoff would be exactly the un-proven assumption §5 forbids. |
| `college_production` | Mirrored for audit only; temporal eligibility **unresolved** | Depends on the college season/stat-refresh being complete, which has its own real cutoff not recorded in this artifact; same reasoning. |
| `official_postdraft_outcome` | Mirrored for audit only; **permanently ineligible for any `pre_draft`-phase feature use** (§5) | Observed post-draft fact (`source_type: official_draft_result`). Unlike the four families above, this one is not merely unresolved — it is definitionally post-draft information, so no future as-of proof could ever make it pre-draft-eligible. |
| Identity fields (`player_id`, `player_name`, `position`, `school`, `class_year`) | Mirrored for audit/join-resolution only | Required for the identity-resolution process in §3; not a feature. |
| All `provenance` sub-objects (`source_type`, `source_name`, `source_url`, `confidence`,
  `confidence_band`, `last_verified_at`, `notes`) | Mirrored losslessly, blocked from direct model use | Retained per §8 for auditability and temporal-eligibility verification (§5); `confidence` in
  particular must never be treated as a predictive weight (§6). |

No field is classified "eligible for later controlled experimentation" by this design, and no field
is classified "pre-draft-safe" either. That would overclaim: being conceptually pre-draft in origin
(draft_capital, age_at_entry, athletic_testing, college_production) is not the same as having a
governed, dated proof that a specific value was actually knowable before a specific simulated
cutoff — this artifact supplies no such proof for any of the four (§5). This design's classifications
are therefore exactly three: "audit only, temporal eligibility unresolved" (the four pre-draft-origin
families), "audit only, permanently post-draft-only" (`official_postdraft_outcome`), and "not a
feature at all" (identity/provenance). Resolving the first category to "pre-draft-eligible at cutoff
X" requires a future, separate source-availability audit (§5, §10) establishing that proof per
family — it is not established here. Being governed and promoted does not, by itself, imply
predictive usefulness or temporal availability — no such claim is made here for any field.

## 5. Temporal eligibility and leakage prevention

**This snapshot was itself generated after the 2026 draft concluded.** `generated_at` is
`2026-07-10T12:00:00+00:00`, well after the 2026 NFL draft (per `official_postdraft_outcome` coverage
being 48/48). This is the central leakage risk this design exists to name: **the promoted artifact,
as a single file, commingles pre-draft-origin facts and post-draft-origin facts into one snapshot
generated post-draft.** A future pre-draft rehearsal must never use the artifact's own `generated_at`
(or the mirror's own refresh timestamp) as a proxy for "this was knowable pre-draft" — that timestamp
describes when TIBER-Rookies *computed the file*, not when any individual fact became known. The only
safe leakage control is the **field-family classification** in §4, applied structurally, never a
file-level or run-level timestamp check.

**Timestamp non-interchangeability (explicit, per the issue's requirement):**

Three distinct timestamp concepts exist in or around this artifact, and none may substitute for
another when deciding whether a fact was knowable at a given as-of time:

1. **`artifact.generated_at`** — a repository/batch-process timestamp for when TIBER-Rookies wrote
   the file. Not an event-availability timestamp for any individual field.
2. **`provenance.last_verified_at`** (per field, per row) — only genuinely an event-adjacent
   verification date for the `official_postdraft_outcome` family's *drafted* rows, which carry the
   source's own `ingested_at` value (e.g. `2026-05-17`). For every other family
   (`draft_capital`, `age_at_entry`, `athletic_testing`, `college_production`) and for
   `official_postdraft_outcome`'s one `udfa_signed` row (`te-daequan-wright`), `last_verified_at` is
   either the artifact's own generation-date fallback or explicitly `null` — **it must not be read as
   a true fact-verification timestamp for those rows.** `te-daequan-wright`'s `last_verified_at` is
   `null`, with a `notes` field explicitly stating no per-row verification timestamp exists and that
   the generation date is not a substitute — **a future mirror must preserve this `null` exactly as
   is and must never backfill it with the mirror-refresh date.**
3. **A future `mirror_refreshed_at`** (Forecast-owned, proposed in §2's wrapper) — purely an
   operational bookkeeping timestamp for when Forecast last pulled the artifact. Never usable to infer
   anything about the underlying facts' real-world knowability.

**Phase definitions (revised — "begins," not "concludes"):**

`pre_draft` must mean a pinned as-of instant **strictly before the 2026 NFL draft begins** (before
Day 1, Round 1, Pick 1) — not "before its conclusion." A conclusion-based boundary is unsafe: it
would include, e.g., the moment after Round 1's picks are already public but before Round 7 ends,
during which `official_postdraft_outcome` is already partly knowable for many players — that is not
a stable no-leakage boundary. The exact real-world instant the 2026 draft began is **not pinned by
this design** and must come from a governed, cited source (e.g. the NFL's own published schedule) at
the time a future rehearsal actually needs it — this document does not invent that timestamp.

`post_draft` means an as-of instant at or after that same pinned draft-start boundary having fully
elapsed through the relevant pick/signing, subject to the per-family and per-row caveats below.

**No family is established as pre-draft-eligible by this design.** Being conceptually pre-draft in
origin is necessary but not sufficient — this design requires, and does not itself supply, a governed
per-family **`available_at` / source-snapshot-as-of proof** before any of the four "unresolved" (§4)
families may be treated as usable at a specific `pre_draft` cutoff:

| Family | What availability proof would need to show | Currently proven by this artifact? |
| --- | --- | --- |
| `draft_capital` | The specific `big_board_rank` / `draft_capital_proxy_0_100` value being used was actually the live value as of the simulated cutoff — a big-board proxy is revised throughout the pre-draft cycle, so "some value existed" does not mean "this value existed then." | **No.** The artifact records no per-value as-of date, only the file's own `generated_at` (§0/this section), which is post-draft. |
| `age_at_entry` | The player's date of birth was knowable as of the cutoff (generally true once public, but not asserted with a source date here). | **No governed as-of date recorded.** |
| `athletic_testing` | The combine (or equivalent testing event) that produced this value had actually occurred by the cutoff — this field has a genuine, real-world unavailable-before date. | **No.** No combine date is recorded per row; assuming availability at an arbitrary pre-draft cutoff would itself be an unproven, potentially leaking assumption. |
| `college_production` | The college season/stat-refresh window this production reflects had actually closed by the cutoff. | **No.** No season-close/stat-freeze date is recorded per row. |

Until a future source-availability audit (§10) establishes this proof per family — and pins the exact
draft-start boundary from a governed source — **all four families remain `audit only` with temporal
eligibility unresolved, not "pre-draft-safe by nature," for any cutoff.** `official_postdraft_outcome`
is the one family for which no such proof could ever apply in a `pre_draft` context, since it is
definitionally post-draft information (§4).

**`te-daequan-wright`'s null `last_verified_at`:** because this UDFA signing has no recorded
verification timestamp, the **conservative, fail-closed assumption** is that its exact knowable-as-of
date is unknown; any `post_draft`-phase rehearsal that needs a specific as-of date for that row must
either obtain an independently-sourced signing date or exclude that row from date-sensitive analysis
— it must never assume the artifact's `generated_at` date as a stand-in.

**Where phase eligibility is represented:** in this design document only, as a documented
classification (§4's table and this section) — **not** in the mirror itself. §2 already establishes
that the mirror-implementation issue produces exactly one artifact form (the full byte-identical
mirror plus wrapper) and authorizes no phase-filtered or otherwise derived projection. A future,
separate controlled-experiment/adapter design (§10) is the stage responsible for both (a) resolving
the availability-proof table above per family, and (b) — only once resolved — constructing whatever
phase-specific consumable view is needed, with its own path, schema, deterministic transformation
rule, provenance, and hash contract. This design does not pre-authorize that view's shape.

**Why this boundary fails closed:** if a future date-sensitive check is ambiguous, a required
timestamp is unavailable (as with `te-daequan-wright`'s null `last_verified_at`), or a family's
availability proof (the table above) has not yet been established, the design's default is
exclusion, not inclusion-with-a-caveat. An omitted or excluded row/field/family can always be added
back once resolved; a leaked one cannot be un-leaked from a training run that already used it.

## 6. Observed versus inferred semantics

Preserved exactly as TIBER-Rookies defines them — this design adds no new interpretation:

- `draft_capital` (`market_derived_proxy`, inferred) is never overwritten by, or merged with,
  `official_postdraft_outcome` (`official_draft_result`, observed). They remain two separate mirrored
  fields under two separate names, exactly as TIBER-Rookies' own #267/#268 chain established.
- No polymorphic "draft capital" feature may be created by collapsing the two.
- `provenance.notes` (free text) must never be parsed or converted into a numeric feature.
- `provenance.confidence` / `confidence_band` must never be treated as a predictive weight — they
  describe governance confidence in the field's provenance, not a model-usable signal.
- No composite evidence score may be derived during mirroring (or at any stage this design
  authorizes) by combining fields across families.
- `official_postdraft_outcome.value.nfl_team` must never be interpreted as a landing-spot-quality
  signal — it is mirrored as an observed fact of the outcome only, per TIBER-Rookies' own boundary
  (repeated here because a Forecast-side team-context feature family already exists elsewhere in this
  repo, e.g. TIBER-Teamstate consumption, and it would be an easy, wrong shortcut to fold this field
  into that existing concept without a separate, explicit review).

## 7. Missingness and unavailable values

Default, matching TIBER-Rookies' own `{value, provenance}` invariant exactly, with **no Forecast-side
enrichment of missing data at the mirror stage**:

- `value: null` / `provenance.source_type: "unavailable"` is mirrored as-is. `unavailable` remains
  `unavailable`.
- No zero-fill, no neutral default, no mean/median imputation, no missingness indicator, and no
  conversion of absent evidence into negative evidence — at the mirror stage. (Player-history's own
  precedent shows a *model*, once wired, may still numerically default a null feature to `0` for
  purely arithmetic reasons at the ridge-regression layer — but that is a model-training-time decision
  made in a separate, later, explicitly-reviewed implementation issue, not something this mirror
  design authorizes or anticipates here.)
- Any future imputation policy belongs to a controlled-experiment design (a later stage in §10), never
  the mirror itself.
- Concretely for this snapshot: `players_with_age_at_entry: 47` (1 of 48 missing),
  `players_with_athletic_testing: 32` (16 of 48 missing, mirroring Rookie Alpha's own
  `NEUTRAL_DEFAULT`-is-unavailable rule), `players_with_all_families: 32`. These gaps are mirrored
  exactly as null, not backfilled.

## 8. Provenance preservation

The future mirror must retain, losslessly:

- Upstream repository, commit, promoted path, and all hashes from §1 (in the wrapper file, not
  mutated into the payload).
- Upstream `schema_version` and `run_id`, exactly as recorded.
- The full per-field `{value, provenance}` structure for every governed family — no flattening, no
  dropping of `source_url`/`notes`/`confidence_band`, even for fields classified "audit only."
- `source_type`, `source_name`, `source_url`, `confidence`, `confidence_band`,
  `last_verified_at` (including `null`, per §5), and `notes` for every field.
- If a future, separate normalization/adapter stage is ever proposed (explicitly not this issue, per
  §2's rejection of option C), it must carry a **transformation lineage** for every Forecast-owned
  derived field, so a value's chain back to the original `{value, provenance}` pair is always
  reconstructable. No transformation may erase whether a value was observed, inferred, or unavailable.

## 9. Validation contract for the later mirror

A future mirror-implementation issue must build and pass, at minimum:

- **Source lock and hash validation**: repo, path, commit, schema version, and every hash in §1,
  checked before every refresh; fail closed on any mismatch (§1).
- **Schema/version allowlist**: only `rookie-transition-profile-v0.2.0` is accepted; any other
  version value halts refresh pending a re-review of this design.
- **Deterministic reproduction**: refreshing twice from the same source commit must produce
  byte-identical mirrored JSON/CSV and an identical wrapper (apart from `mirror_refreshed_at`).
- **48 unique player rows** for the current source snapshot, independently re-verified (§3), not
  trusted from the upstream manifest alone.
- **47 `drafted` + 1 `udfa_signed` outcome parity**, re-verified against the mirrored JSON directly.
- **JSON/CSV agreement**: identical `player_id` population and order across both mirrored files.
- **No duplicate or fuzzy identity resolution** (§3): any duplicate fails closed; any unresolved
  identity is reported, not guessed.
- **Unavailable-value preservation** (§7): every `null`/`unavailable` field in the source remains so
  in the mirror, verified field-by-field, not just spot-checked.
- **Observed/inferred provenance preservation** (§6, §8): `draft_capital.provenance.source_type`
  stays `market_derived_proxy` and `official_postdraft_outcome.provenance.source_type` stays
  `official_draft_result` for every row, with no cross-contamination.
- **Temporal-eligibility assertions** (§5): a test proving `te-daequan-wright`'s `last_verified_at`
  remains `null` (never backfilled with any run/refresh date) in the mirrored representation, and a
  test proving the mirror-implementation issue creates **no** phase-filtered, `pre_draft`-tagged, or
  otherwise derived projection — the mirror is exactly the four files in §2, containing every field
  the source artifact carries, unfiltered. Constructing and validating any phase-specific view is
  explicitly out of scope for this validation contract (§5, §10).
- **Source drift fails closed** (§1): a test simulating a changed upstream hash and asserting the
  refresh process refuses to proceed.
- **No model or production imports reference the mirror**: a repository-wide check (grep or
  equivalent) confirming no file under `src/models/`, `src/services/`, or any production
  Forecast path imports anything from the proposed `data/fixtures/tiberRookies/` path — mirroring the
  same "inert by default" guarantee already proven for player-history's mirror stage.
- **No availability claim asserted**: a check that the wrapper file does not label any field
  `pre_draft_safe`, `experiment_eligible`, or equivalent — this stage classifies fields per §4/§5, it
  does not certify their temporal availability.

## 10. Forecast lifecycle placement

Per `docs/capabilities/README.md`'s governed capability path (the same sequence every capability,
including the completed `player_history_production_only_v0` reference instance, must follow):

```text
promoted TIBER-Rookies source            (done: TIBER-Rookies#269/PR#270, this design's §1 lock)
        ↓
this approved Forecast consumption design   (this issue, #149)
        ↓
inert Forecast mirror / wrapper            (future issue: implements §2/§9 exactly)
        ↓
mirror validation and rehearsal            (future issue: proves §9's checks pass against real data)
        ↓
separate controlled-experiment design      (future issue: FIRST establishes the §5 per-family
                                             availability-proof table and pins the governed draft-start
                                             boundary from a cited source — required before any field
                                             may be proposed for a pre_draft view at all — THEN proposes
                                             which §4 "audit only" fields, if any, become "eligible for
                                             controlled experimentation" at that proven cutoff, and
                                             under what feature-extraction/null-handling rules,
                                             mirroring the player-history precedent's own separate
                                             experiment-design stage)
        ↓
baseline + shuffled comparison             (future issue: a real-vs-baseline-vs-shuffled-control run,
                                             evaluated independently across at least TWO disjoint
                                             populations/seasons, per `docs/capabilities/README.md`'s
                                             own validation-stage requirement — no averaging across
                                             origins, matching the exact discipline player-history's
                                             two-origin validation already established)
        ↓
threshold review                           (future issue: the validated evidence is compared against
                                             a pre-registered acceptance framework; decides only
                                             whether a production-binding *review* may be opened —
                                             binds nothing)
        ↓
binding review                             (future issue: production Forecast paths, required
                                             artifact/report inputs, and outstanding prerequisite
                                             gates are inventoried; a real leakage audit is run;
                                             decides only whether an *implementation* issue may be
                                             opened — still binds nothing)
        ↓
implementation                             (future issue: the feature is actually wired, narrowest
                                             safe scope only, inert by default behind an explicit
                                             opt-in; requires human sign-off before any non-default
                                             activation)
        ↓
activation verification                    (future issue: the merged implementation is independently
                                             re-exercised from the default branch before the
                                             capability is considered ready to activate)
```

**Future issues this design identifies as required** (at minimum, matching the issue's own list, and
aligned exactly with `docs/capabilities/README.md`'s eight-stage path — no stage is compressed or
skipped):

1. Mirror implementation and validation (implements §2's mirror form and §9's validation contract).
2. Controlled experiment / rehearsal design — first establishes the §5 per-family availability-proof
   table and pins the governed draft-start boundary from a cited source (required before any field
   may be proposed for a `pre_draft` view), then proposes feature extraction and null-handling for
   any field whose availability is thereby proven for a specific cutoff. Resolves nothing about
   eligibility by itself until that proof step is done.
3. Experiment execution — a real, shuffled-control, leakage-audited run, evaluated independently
   across at least **two** disjoint populations/seasons (per `docs/capabilities/README.md`'s
   validation-stage requirement; a single disjoint origin is not sufficient evidence to proceed).
4. Threshold review (a pre-registered acceptance framework compared against the experiment's
   evidence; decides only whether a binding-review issue may be opened).
5. Binding review (inventories production Forecast paths and outstanding prerequisite gates, and
   runs a real leakage audit; decides only whether an implementation issue may be opened).
6. Implementation (the feature is actually wired, narrowest safe scope only, inert by default behind
   an explicit opt-in).
7. Activation verification (the merged implementation is independently re-exercised from the default
   branch).
8. Production binding / non-default activation, only with the explicit human sign-off
   `docs/capabilities/README.md` requires for every capability, and only after activation
   verification passes — never immediately after threshold review.

No stage's positive decision authorizes skipping ahead to a later one — each is a ceiling on what the
*next* issue may do, never a running total, exactly as every existing capability in this repo already
requires.

## Decision

```text
may_open_rookie_transition_profile_forecast_mirror_issue
```

This authorizes only a separate, bounded mirror-implementation issue conforming exactly to §2's
selected mirror form and §9's validation contract. It does not authorize experimentation, feature
activation, predictive use, downstream consumption, production binding, or UI activation — every one
of those remains gated behind its own future, separately-authorized issue per §10.

## Non-goals confirmed

No Forecast mirror created. No adapter created. No feature code. No fixture written under
`data/fixtures/tiberRookies/` (the path in §2 is proposed, not created). No phase-filtered or
otherwise derived projection defined or authorized (§2, §5 — the only artifact form this design
authorizes is the full byte-identical mirror). No experiment. No model training/tuning/evaluation. No
production import or configuration. No claim that any field improves MAE, RMSE, calibration, or
fantasy-point prediction. **No claim that any field is available or safe to use at any specific
pre-draft as-of cutoff** — §5 names the four candidate families and the proof each would require,
none of which this artifact currently supplies. No UI or downstream-consumption authorization. No
TIBER-Rookies change of any kind. No canonical player-ID crosswalk built (§3 names the gap; it does
not close it). No draft-start boundary timestamp pinned (§5 names the requirement; a future issue
must cite a governed source for it).

## Reproduce

This document is prose/design only; there is no script to run. The cited hashes can be independently
re-verified against the promoted TIBER-Rookies artifact with:

```bash
# from a checkout of Prometheus-Frameworks/TIBER-Rookies at commit 2ef92fa
sha256sum exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.json
sha256sum exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.csv
sha256sum exports/promoted/rookie-transition-profile/2026_manifest.json
```
