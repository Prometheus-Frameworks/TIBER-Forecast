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
| `draft_capital` | Mirrored for audit only; **not yet** eligible for controlled experimentation | A pre-draft market-derived proxy (`source_type: market_derived_proxy`, fixed confidence 0.65). Structurally pre-draft-safe in principle (see §5), but this issue does not authorize experiment design — that is separate, later work per §10. |
| `age_at_entry` | Mirrored for audit only; **not yet** eligible for controlled experimentation | A measured identity fact (date of birth → age), pre-draft-safe in principle, same reasoning as above. |
| `athletic_testing` | Mirrored for audit only; **not yet** eligible for controlled experimentation | Combine-derived; pre-draft-safe in principle (combine predates the draft), same reasoning. |
| `college_production` | Mirrored for audit only; **not yet** eligible for controlled experimentation | College production stats predate the draft; same reasoning. |
| `official_postdraft_outcome` | Mirrored for audit only; **blocked from any pre-draft-phase view** (§5) | Observed post-draft fact (`source_type: official_draft_result`). Genuinely useful only in a `post_draft`-phase context, and even there, eligibility for experimentation is separate future work, not authorized here. |
| Identity fields (`player_id`, `player_name`, `position`, `school`, `class_year`) | Mirrored for audit/join-resolution only | Required for the identity-resolution process in §3; not a feature. |
| All `provenance` sub-objects (`source_type`, `source_name`, `source_url`, `confidence`,
  `confidence_band`, `last_verified_at`, `notes`) | Mirrored losslessly, blocked from direct model use | Retained per §8 for auditability and temporal-eligibility verification (§5); `confidence` in
  particular must never be treated as a predictive weight (§6). |

No field is classified "eligible for later controlled experimentation" by this design. That
classification requires its own future, separate experiment-design issue (per the capability path in
§10) — this design intentionally stops at "structurally could be eligible in principle" (draft_capital,
age_at_entry, athletic_testing, college_production, all pre-draft-safe by nature) vs. "must never be"
(official_postdraft_outcome, in any pre-draft view) vs. "not a feature at all" (identity/provenance).
Being governed and promoted does not, by itself, imply predictive usefulness — no such claim is made
here for any field.

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

**Explicit prediction phases:**

| Phase | Definition | `draft_capital` | `age_at_entry` / `athletic_testing` / `college_production` | `official_postdraft_outcome` |
| --- | --- | --- | --- | --- |
| `pre_draft` | As-of time strictly before the 2026 NFL draft's conclusion | Structurally eligible in principle (a genuine pre-draft-origin fact) | Structurally eligible in principle (all predate the draft) | **Must be excluded entirely** — not nulled, not flagged, physically absent from any `pre_draft`-tagged view (§2/§9) |
| `post_draft` | As-of time at or after the 2026 NFL draft's conclusion, and — for `te-daequan-wright` specifically — no earlier than a documented, independently-sourced UDFA-signing date, since the artifact's own `last_verified_at` for that row is `null` and cannot supply one | Eligible (subject to §4's "audit only, not yet experiment-eligible" ceiling) | Eligible (subject to the same ceiling) | Eligible (subject to the same ceiling) |

Because `te-daequan-wright`'s UDFA signing has no recorded verification timestamp, the **conservative,
fail-closed assumption** is that its exact knowable-as-of date is unknown; any `post_draft`-phase
rehearsal that needs a specific as-of date for that row (rather than "at or after the full draft class
is known") must either obtain an independently-sourced signing date or exclude that row from
date-sensitive analysis — it must never assume the artifact's `generated_at` date as a stand-in.

**Where phase eligibility is represented:** both in the mirror schema and in a separate eligibility
contract, deliberately redundant rather than relying on either alone:

- **Structurally, in the mirror**: the future mirror-implementation issue must produce a
  `pre_draft`-tagged view that **physically omits** `official_postdraft_outcome` (not merely nulls it)
  — an omitted field cannot be leaked by a careless read; a null-but-present field one line of code
  away from being misread is a weaker control. The full byte-identical mirror (§2) remains available
  only under the `post_draft` tag.
- **Documented, in this design** (§4's table and this section): so a future consumer understands *why*
  a field is absent, not just that it is — a schema-level omission with no rationale invites someone
  to "fix" it by adding the field back.

**Why this boundary fails closed:** if a future date-sensitive check is ambiguous or a required
timestamp is unavailable (as with `te-daequan-wright`'s null `last_verified_at`), the design's default
is exclusion, not inclusion-with-a-caveat. An omitted or excluded row/field can always be added back
once resolved; a leaked one cannot be un-leaked from a training run that already used it.

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
- **Temporal-eligibility assertions** (§5): a test proving the `pre_draft`-tagged view structurally
  omits `official_postdraft_outcome`, and that `te-daequan-wright`'s `last_verified_at` remains `null`
  (never backfilled with any run/refresh date) in every mirrored representation.
- **Source drift fails closed** (§1): a test simulating a changed upstream hash and asserting the
  refresh process refuses to proceed.
- **No model or production imports reference the mirror**: a repository-wide check (grep or
  equivalent) confirming no file under `src/models/`, `src/services/`, or any production
  Forecast path imports anything from the proposed `data/fixtures/tiberRookies/` path — mirroring the
  same "inert by default" guarantee already proven for player-history's mirror stage.

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
separate controlled-experiment design      (future issue: proposes which §4 "audit only" fields, if
                                             any, become "eligible for controlled experimentation",
                                             and under what feature-extraction/null-handling rules —
                                             mirroring the player-history precedent's own separate
                                             experiment-design stage)
        ↓
baseline + shuffled comparison             (future issue: a real-vs-baseline-vs-shuffled-control run,
                                             evaluated independently across at least one disjoint
                                             population/season per the existing aggregation
                                             discipline — not averaged)
        ↓
threshold review                           (future issue: pre-registered acceptance framework, per the
                                             existing player-history precedent)
        ↓
production binding, only if separately authorized (future issue, requiring explicit human sign-off
                                             per `docs/capabilities/README.md`'s non-automatable gate)
```

**Future issues this design identifies as required** (at minimum, matching the issue's own list):

1. Mirror implementation and validation (implements §2's mirror form and §9's validation contract).
2. Controlled experiment / rehearsal design (proposes feature extraction and null-handling for any
   field classified "structurally could be eligible" in §4 — resolves nothing about eligibility by
   itself).
3. Experiment execution (a real, shuffled-control, leakage-audited run).
4. Threshold review (a pre-registered acceptance framework compared against the experiment's
   evidence).
5. Production binding, only if the threshold review's evidence supports it, and only with the
   explicit human sign-off `docs/capabilities/README.md` requires for every capability.

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
`data/fixtures/tiberRookies/` (the path in §2 is proposed, not created). No experiment. No model
training/tuning/evaluation. No production import or configuration. No claim that any field improves
MAE, RMSE, calibration, or fantasy-point prediction. No UI or downstream-consumption authorization. No
TIBER-Rookies change of any kind. No canonical player-ID crosswalk built (§3 names the gap; it does
not close it).

## Reproduce

This document is prose/design only; there is no script to run. The cited hashes can be independently
re-verified against the promoted TIBER-Rookies artifact with:

```bash
# from a checkout of Prometheus-Frameworks/TIBER-Rookies at commit 2ef92fa
sha256sum exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.json
sha256sum exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.csv
sha256sum exports/promoted/rookie-transition-profile/2026_manifest.json
```
