# TIBER-Data projection fixture → PPM ingestion: adapter decision

Status: **Decided** (decision-only; no implementation in this change)
Date: 2026-06-15
Tracking: Prometheus-Frameworks/TIBER-Data#152 (mismatches 2, 3, 4, 5 — the TIBER-Data → PPM fixture seam)
Scope guardrail: decision/doc only. This change does **not** alter scoring math, ingestion wiring, or any contract type.

## Question

The TIBER-Data projection-input fixture shape and the Point-prediction-model (PPM)
projection-input ingestion shape do not align. Is the TIBER-Data fixture output meant to be:

1. a **unified canonical projection input contract** shared by both repos, or
2. an **upstream fixture consumed through an explicit, named adapter** into the PPM ingestion shape?

## Decision

**Option 2 — explicit named adapter.**

The TIBER-Data projection-input fixture (`tiber-data.projection-input-fixture.v1.0.0`,
`TIBER-Data/src/contracts/v1/projectionInputFixture.ts`) is an **upstream rehearsal fixture**,
not canonical PPM input. PPM consumes it through a **named, versioned adapter** that translates
the TIBER-Data fixture bundle into PPM's existing ingestion contract
(`TiberDataProjectionInputBundle`, `tiber-data-projection-input-v1`,
`src/contracts/tiberDataProjectionInput.ts`), which then feeds the existing
`toWeeklyScoringRequest` adapter into `WeeklyScoringRequest`.

We are **not** unifying the two contracts into one shared canonical type.

### Resulting pipeline (target)

```
TIBER-Data fixture bundle                 (owned by TIBER-Data)
  projection-input-fixture.v1.0.0
        │
        ▼  NEW named adapter  (PPM owns it)
   src/adapters/tiberData/fromProjectionInputFixture.ts
        │
        ▼
PPM ingestion bundle                       (owned by PPM)
  TiberDataProjectionInputBundle  (tiber-data-projection-input-v1)
        │
        ▼  EXISTING adapter
   src/adapters/tiberData/toWeeklyScoringRequest.ts
        │
        ▼
WeeklyScoringRequest → scoring (unchanged)
```

The first leg is the bridge that Prometheus-Frameworks/TIBER-Data#152 (mismatches 3 + 4) correctly identifies as missing in code.
The second leg already exists. Today `runTiberDataFixtureRehearsal.ts` casts the fixture
straight to `TiberDataProjectionInputBundle` and only strips/warns on unsupported *player*
fields — it does **not** translate the divergent top-level `source_dataset_refs`, `identity_ref`,
`replacement_buffer`, contract version, or `missing_fields` severity. That cast is the gap.

## Why a named adapter, not a unified contract

1. **Ownership boundaries.** `docs/ownership-boundaries.md` states TIBER-Data owns canonical IDs,
   source truth, and provenance governance; PPM must not become an identity/source-truth owner.
   The fixture expresses provenance as governed source artifacts (`name`/`path`/`usage`/`provenance`)
   and identity as `source_paths[] + identity_fields[] + projection_label_policy`. PPM's ingestion
   contract deliberately uses opaque references (`dataset_id`/`uri`, `identity_artifact_id`).
   Unifying would force one repo's vocabulary onto the other and erode that boundary.

2. **Governance envelope vs scoring-ingestion contract.** The fixture is a
   `bounded_rehearsal_fixture` with `production_coverage_claim: false`, and carries `fixture_scope`
   and `projection_context` (projection label vs source-evidence window). That envelope is
   governance metadata PPM's scoring-ingestion contract should *reference and preserve as warnings*,
   not absorb as canonical input fields.

3. **TIBER-Data explicitly mandates downstream mapping of its severity vocabulary.**
   `TIBER-Data/docs/contracts/projection-input-fixture-v1.md` states `missing_fields[].severity`
   is the fixture literal `"warning"` and that "downstream adapters that need `required | optional`
   … must map TIBER-Data fixture warnings explicitly before scoring" and "must not treat the fixture
   warning vocabulary as an implicit scoring contract." That is a direct instruction to adapt, not unify.

4. **Independent versioning.** Each repo can rev its contract independently; the adapter pins a
   `from`/`to` version pair and routes on `input_contract_version`. A single shared contract would
   couple release cadence across the cross-repo seam (Prometheus-Frameworks/TIBER-Data#152 mismatch 5).

## Explicit field mapping (fixture v1.0.0 → `TiberDataProjectionInputBundle` v1)

Lossiness legend: **1:1** exact · **rename** field-name remap, value preserved ·
**lossy** value/structure changes or source detail dropped · **synthesize** value not present upstream,
must be derived with a documented rule and a warning · **fail-closed** must error rather than guess.

| Fixture field | PPM target | Mapping | Lossiness |
|---|---|---|---|
| `input_contract_version` = `tiber-data.projection-input-fixture.v1.0.0` | `input_contract_version` = `tiber-data-projection-input-v1` | Adapter routes on the source version and sets the PPM constant; the **source version string must be retained** in provenance/warnings, not dropped. | rename (mismatch 5) |
| `tiber_data_schema_version` | `tiber_data_schema_version` | pass through | 1:1 |
| `fixture_scope` (`kind`, `production_coverage_claim`, `projection_label`, `evidence_window`, `notes[]`) | *(no target field)* | No PPM field. Adapter **must emit an `adapter_warning`** preserving `production_coverage_claim: false` / fixture-only intent so rehearsal data is never treated as production. | **lossy** — document; preserve as warning |
| `projection_context` (`season`, `week`, `league`, `scoring_format`, `fixture_only`, `production_ingestion`, `source_evidence_*`) | `projection_context?: Record<string, unknown>` | Pass through opaquely. PPM scoring ignores it today (existing rehearsal already warns `TIBER_DATA_FIXTURE_PROJECTION_CONTEXT_IGNORED`). Do **not** lift `season`/`week` onto player rows — scoring does not consume them. | non-lossy passthrough (unconsumed) |
| `source_dataset_refs[]` `{name, path, version?, provenance?, source_path?, usage}` | `TiberDataSourceDatasetRef[]` `{dataset_id, version, uri?}` | `dataset_id ← name`; `uri ← source_path ?? path`; `version ← version` — but PPM requires `version` while the fixture makes it optional, so **fail-closed when absent** (do not default). `provenance`, `usage`, and the unused of `path`/`source_path` have no PPM home → **preserve in warnings**, do not silently drop. | **lossy** + **fail-closed** (mismatch 3) |
| `identity_ref` `{source_paths[], identity_fields[], projection_label_policy}` | `TiberDataIdentityRef` `{identity_artifact_id, version, uri?}` | Zero natural overlap. `identity_artifact_id` must be **synthesized** by a single documented, deterministic rule (e.g. stable hash/join of `source_paths`) emitted with a warning. `version` has no upstream source → supply from governed caller config or **fail-closed**; do not invent. `identity_fields` / `projection_label_policy` → **preserve in warnings**. | **synthesize** + **lossy** + **fail-closed** (mismatch 4) |
| `league_context.teams`, `.starters`, `.flex_allocation` | same | 1:1 | 1:1 |
| `league_context.replacement_buffer` `{QB,RB,WR,TE}` (per-position object) | `LeagueContextInput.replacement_buffer?: number` (scalar) | **Do not collapse.** A per-position object cannot become one scalar without inventing a rule. Adapter **omits** `replacement_buffer` (PPM then derives replacement from `comparison_pool`/defaults/`replacement_points_override`) and **emits a warning** recording the dropped per-position values. Routing per-position buffers into `replacement_points_override` is a scoring-input change and is **out of scope** here. | **lossy** — omit + warn (mismatch 2) |
| `player_opportunities[]` PPM-known fields (`player_id`, `player_name`, `team`, `position`, `games_sampled`, and modeled opportunity/efficiency fields) | `PlayerOpportunityInput` | Pass known fields straight through; required fields absent → **fail-closed** (existing `toWeeklyScoringRequest` already enforces this). | 1:1 for known fields |
| `player_opportunities[]` fixture-only fields (`team_pass_rate_environment`, `team_pace`, `offensive_environment`, and any other non-modeled key) | *(dropped)* | Not in `PlayerOpportunityInput`. Strip + warn (existing rehearsal does this via `TIBER_DATA_FIXTURE_PLAYER_FIELDS_IGNORED`). Note: env fields relate to Prometheus-Frameworks/TIBER-Data#152 item B (Teamstate → PPM) and are **out of scope**. | **lossy** — drop + warn |
| `missing_fields[]` `severity: "warning"` (single literal) | `severity: "required" \| "optional"` | Map each fixture `warning` to PPM severity by a **named policy** (e.g. field ∈ PPM required set → `required`, else `optional`). Do **not** blanket-reinterpret. The fixture's "keep this gap visible" intent must survive as `optional` + warning, never be silently upgraded to `required` or dropped. | **lossy** (vocabulary) — documented mapping |
| `adapter_warnings[]` `string[]` | `ServiceWarning[]` `{code, message, details}` | Wrap each string in a `ServiceWarning` with a stable code (e.g. `TIBER_DATA_FIXTURE_WARNING`). Non-lossy if wrapped; lossy only if discarded. | rename/wrap |

## Lossy conversions — required documentation

Every conversion below MUST be surfaced (warning or provenance), never performed silently:

- **`replacement_buffer` per-position → scalar:** omitted, not collapsed; per-position values recorded in a warning.
- **`source_dataset_refs` provenance drop:** `provenance`/`usage` and unused path field preserved in warnings; PPM `version` is required so absence fails closed.
- **`identity_ref` synthesis:** `identity_artifact_id` derived by a documented deterministic rule with a warning; `version` from governed config or fail-closed; `identity_fields`/`projection_label_policy` preserved in warnings.
- **`fixture_scope` drop:** fixture-only / `production_coverage_claim: false` re-emitted as a warning so production status is never implied.
- **`missing_fields` severity remap:** `warning` → `required|optional` via a named policy, defaulting to `optional` + warning, never silently `required`.
- **Player env-field drop:** `team_pass_rate_environment`, `team_pace`, `offensive_environment` stripped with a warning.

## Guardrails honored

- No field is silently coerced — every lossy step emits a warning or fails closed.
- No scoring/model behavior changes; the adapter stops at producing `TiberDataProjectionInputBundle`.
- No invented mappings without documented lossiness (see table + section above).
- No expansion into Teamstate env mapping (mismatch B), FORGE tier taxonomy (mismatch 7), or Phase 4 Strategy.

## Out of scope / open questions (defer to implementation PR)

- Whether per-position `replacement_buffer` should eventually drive `replacement_points_override` (a scoring-input change — separate decision).
- Governed source of `identity_ref.version` and the exact deterministic `identity_artifact_id` derivation rule.
- Teamstate → PPM environment-field adapter (mismatch B), tracked separately.

## Acceptance

- **Resolved:** TIBER-Data fixture output is an upstream rehearsal fixture requiring a **named adapter**; it is **not** canonical PPM input.
- The adapter mapping is explicit (table above).
- Every lossy conversion is documented with its handling (omit/warn, preserve-in-warning, synthesize-with-warning, or fail-closed).
- A clean implementation PR can be cut: add `src/adapters/tiberData/fromProjectionInputFixture.ts` implementing the table, route `runTiberDataFixtureRehearsal` through it instead of casting, add fixture-shape validation + tests. No scoring math, no new shared canonical contract.
