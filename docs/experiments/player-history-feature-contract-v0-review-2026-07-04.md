# Player-history feature contract v0 — review and acceptance decision

> **Status: contract review only.** This document reviews the `player_history_production_feature_v0`
> contract shape proposed in PR #124 (`docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md`,
> §7), decides whether to accept it, and — where the shape needed tightening — amends it in place. It
> performs **no Forecast run, no feature binding, no `seasonalPprModel.ts` change, no production
> feature-generation code, no Fantasy/product consumer, no ranking/scoring/advice/route/UI/export
> change, and no TIBER-Data promotion/demotion**, and makes **no production-readiness claim**. This is
> a governance/contract-review checkpoint, not a production-binding issue.

## 0. Source of truth

This review reads the merged PR #124 artifacts directly rather than relying on issue text or prior PR
summaries:

- `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md` (merge `b2edd63`, closing #123)
- `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.json`

Both documents are unchanged by this review. This artifact is additive: a new file that records the
contract-acceptance decision for the shape those documents proposed.

## 1. Contract acceptance decision

Two separate decisions are recorded, because "is the shape good" and "what happens next" are
different questions:

| | Value |
| --- | --- |
| **Contract acceptance status** | `accepted_with_amendments_for_future_implementation_design` |
| **Next-step decision** | `may_open_player_history_contract_implementation_design_issue` |

**Why "accepted with amendments" rather than "accepted as-is":** the core shape from PR #124 §7 is
structurally sound — the temporal-cutoff, null/missing-history, and non-advice statements are correct
and non-negotiable as originally written. But four fields were underspecified enough that a future
implementation issue could reasonably diverge in ways that would be hard to catch in review:
`contract_version`'s bump semantics were undefined, `provenance_state` and `validation_status` were
free-text rather than closed enums (inviting silent drift), and `run_id` described *what* it should
tie together without specifying *how*. See §3 for the amendments themselves.

**Why "may_open_..._implementation_design_issue" rather than "requires_amendment_before...":** the
amendments below are incorporated directly into this artifact — there is no further amendment pass
required before a future issue can be opened. The unresolved items in §5 are not contract defects;
they are decisions that legitimately belong to an implementation-design issue (exact sha lock, exact
feature-family scope, rolling-window length, acceptance threshold, and so on) and enumerating them
here is what makes that future issue's scope bounded rather than open-ended.

Neither decision authorizes production binding, `seasonalPprModel.ts` changes, or a Fantasy/product
consumer. Both decisions are scoped to design review only.

## 2. Field classification

Every field the issue asked to classify, evaluated against the PR #124 §7 proposal:

| Field | Classification | Notes |
| --- | --- | --- |
| `contract_id` | **Required** | Accepted as-is: `player_history_production_feature_v0`. Fixed for the lifetime of this contract family; a genuinely new feature would get a new `contract_id`, not a version bump. |
| `contract_version` | **Required, amended** | Original value was a bare string with no bump policy. Amended to a strict semver policy (§3.1): any field removal, type change, or semantic change to an existing field is a MAJOR bump; adding an optional field is a MINOR bump; documentation/description changes are a PATCH bump. Pre-1.0 (`0.x.y`) means "not yet accepted for implementation"; a future implementation-design issue is what would propose `1.0.0`. |
| `source_dataset_refs` | **Required, partially deferred** | The field's *shape* (repo/path/sha256/promotion_review) is accepted as-is. The *value* of `artifact_sha256` stays a placeholder in this abstract contract review — locking it is explicitly deferred to whichever specific implementation-design issue proposes using a specific promoted artifact snapshot (§5, unresolved item 1). A contract review is not the place to pin a sha that would go stale the next time TIBER-Data promotes a refresh. |
| `player_identity_join_keys` | **Required** | Accepted as-is: `player_id`, `season`, `season_type`, `position`. These are the same grain every gate in the #99→#122 chain has used; changing them would be a MAJOR version bump per §3.1. |
| `temporal_cutoff_semantics` | **Required, non-negotiable** | Accepted as-is and locked (§4). This is the single most important field in the contract: target season `S` may only use seasons `< S`, with no partial-season substitution. |
| `feature_availability_rules` | **Required, partially deferred** | The `requires` and `no_partial_season_substitution` sub-fields are accepted as-is and non-negotiable. The `family_scope` sub-field (production-only vs. full feature set) is explicitly **deferred** to implementation design (§5, unresolved item 2) — the #116 attribution note makes a narrower production-only contract *plausible*, but choosing it is a scope decision for the implementation issue, not this review. |
| `null_missing_history_rules` | **Required, non-negotiable** | Accepted as-is and locked (§4): no-history players get an entirely null feature block; unavailable usage fields stay null even when history exists. Never zero-coerced. |
| `provenance_state` | **Required, amended** | Original value was a free-text string (`"experimental_replicated_not_production_bound"`). Amended to a closed enum (§3.2) so a future implementation cannot invent an ad hoc provenance label that silently means something different. |
| `generated_at` | **Required** | Accepted as-is: ISO-8601 timestamp of generation, not of consumption. |
| `run_id` | **Required, amended** | Original description said *what* it should tie together but not *how*. Amended to a specified composition rule (§3.3): a deterministic hash of `(source_dataset_refs.artifact_sha256, contract_version, generator_script_version, generated_at)`. |
| `validation_status` | **Required, amended** | Original value was a free-text string. Amended to a closed enum (§3.2) mirroring the two-decision structure in §1, so a contract instance's validation state is always one of a fixed, reviewable set of values. |
| `non_advice_non_ranking_statement` | **Required, non-negotiable, verbatim** | Accepted as-is and locked (§4). Every consumer of this contract must preserve this statement verbatim; it is not a field a future implementation may shorten, paraphrase, or drop. |

**Forbidden fields (must not appear in any implementation of this contract):**

- any active-roster, availability, injury, depth-chart, or ownership-status field (matches the
  forbidden-field set enforced by every gate in the #117→#122 chain),
- any advice, ranking, score, recommendation, start/sit, trade, or draft-output field,
- any Fantasy consumer/route/UI/export identifier or reference,
- a production acceptance threshold value embedded in the contract schema itself — thresholds belong
  to the separate acceptance-threshold process (PR #124 §5, prerequisite 7), never hard-coded into a
  versioned data contract,
- a literal `0` (or any other sentinel value) standing in for "missing" in any numeric field — missing
  is `null`, always.

**Optional fields:** none. Every field in the v0 shape is required; there is no optional field in
this proposal. A future implementation-design issue may propose additive optional fields under the
MINOR-version-bump rule in §3.1, but none exist in v0 itself.

## 3. Amendments

### 3.1 `contract_version` bump policy (new)

| Change type | Bump |
| --- | --- |
| Remove a field, change a field's type, or change a field's semantic meaning | MAJOR |
| Add a new optional field | MINOR |
| Documentation/description change only, no behavioral change | PATCH |
| Pre-acceptance (this contract is still `0.x.y`) | Any bump stays pre-1.0 until a future implementation-design issue proposes `1.0.0` acceptance |

A production consumer must pin to an exact `contract_version`, never a range or `"latest"`.

### 3.2 Closed enums for `provenance_state` and `validation_status` (amended from free text)

```text
provenance_state ∈ {
  "experimental_replicated_not_production_bound",   // where this signal is today
  "contract_reviewed_not_production_bound",         // after this review (#125)
  "implementation_designed_not_production_bound",   // after a future implementation-design issue
  "production_bound"                                // requires a separate, explicit, human-approved binding decision this document does not grant
}

validation_status ∈ {
  "design_proposed_not_reviewed",                   // PR #124 state
  "accepted_with_amendments_for_future_implementation_design",  // this review's state (#125)
  "implementation_design_in_progress",
  "implementation_design_accepted",
  "rejected_requires_redesign"
}
```

A contract instance's `provenance_state` must never read `"production_bound"` as a result of this
review or the future implementation-design issue alone — reaching that state requires the separate,
explicit, human-approved production-binding decision that every document in this chain has withheld.

### 3.3 `run_id` composition rule (amended from a vague description)

```text
run_id = deterministic_hash(
  source_dataset_refs.artifact_sha256,
  contract_version,
  generator_script_version,
  generated_at
)
```

This mirrors the `*_PROVENANCE.json` pattern already used throughout `data/fixtures/tiberData/` in
this repo (e.g. `player_season_coverage_v0_promoted_mirror_provenance.json`): a generated artifact
must be traceable back to the exact source bytes, contract version, generator code, and generation
time that produced it — never just a source bytes hash alone, since the same source could be
regenerated by two different contract versions or generator revisions.

### 3.4 Amended contract shape (reference only — not implemented as code)

```jsonc
{
  "contract_id": "player_history_production_feature_v0",
  "contract_version": "0.2.0-reviewed",  // bumped from 0.1.0-proposed: provenance_state and
                                          // validation_status became closed enums (MAJOR-eligible
                                          // semantic tightening, held at pre-1.0 since this is still
                                          // not implementation-accepted)

  "source_dataset_refs": {
    "repo": "Prometheus-Frameworks/TIBER-Data",
    "artifact_path": "exports/promoted/nfl/player_season_coverage_v0.json",
    "artifact_sha256": "<locked by the implementation-design issue that instantiates this contract>",
    "promotion_review": "<TIBER-Data promotion PR reference, locked at the same time>"
  },

  "player_identity_join_keys": {
    "player_id": "string (gsis_id-equivalent, source-verified identity only)",
    "season": "number (the season being predicted FOR, i.e. the target season)",
    "season_type": "'REG'",
    "position": "'QB' | 'RB' | 'WR' | 'TE'"
  },

  "temporal_cutoff_semantics": {
    "rule": "feature values for target season S are built ONLY from seasons < S",
    "input_window": "rolling N prior seasons (N deferred to the implementation-design issue; 3 in the #112/#122 experiments)",
    "excluded": "target season S in any form, including partial-season in-progress data"
  },

  "feature_availability_rules": {
    "requires": "at least one prior-season REG record for this player_id in the input window",
    "family_scope": "DEFERRED to the implementation-design issue: production-only vs. full feature set (see #5 unresolved item 2)",
    "no_partial_season_substitution": true
  },

  "null_missing_history_rules": {
    "no_history_player": "entire feature block is null, never zero-filled, never imputed at serve time using population statistics computed after the fact",
    "unavailable_usage_fields": "remain null even when history exists, exactly as in the source artifact"
  },

  "provenance_state": "contract_reviewed_not_production_bound",  // enum, see §3.2

  "generated_at": "ISO-8601 timestamp of generation, not of consumption",
  "run_id": "deterministic_hash(artifact_sha256, contract_version, generator_script_version, generated_at)",  // see §3.3

  "validation_status": "accepted_with_amendments_for_future_implementation_design",  // enum, see §3.2

  "non_advice_non_ranking_statement":
    "This contract describes a candidate MODEL FEATURE only. It is not fantasy advice, not a ranking, not a start/sit recommendation, and not a product-facing claim. No consumer of this contract may present its values, or any derivative of them, as advice or ranking output without a separate, explicitly-approved product-integration review."
}
```

This is still a **shape reference**, not a schema committed to code — identical in that respect to
the PR #124 proposal. No file in this PR defines this as a TypeScript type or a runtime-validated
schema; that is implementation work reserved for a future, separately-approved issue.

## 4. Non-negotiables locked by this review

Carried forward unchanged from PR #124 and restated here as binding on any future implementation
proposal, not just a discussion point:

- target season `S` may only use seasons `< S` — no exceptions,
- no target-season or partial-target-season substitution, under any feature-availability fallback,
- missing-history players must not be silently zero-filled — the entire feature block stays `null`,
- source artifact identity must be path + sha256 + promotion review, never sha256 alone,
- a source-identity mismatch at generation time must fail closed, not degrade silently,
- the real-vs-baseline-vs-shuffled validation framing (PR #124 §3, §5 prerequisite 6) remains
  required for any future acceptance-threshold proposal,
- this review does not authorize `seasonalPprModel.ts` wiring, in whole or in part,
- any Fantasy/product consumer requires its own separate, explicitly-approved review — contract
  acceptance and consumer approval are never the same decision.

## 5. Unresolved items (explicitly deferred, not silently skipped)

The following remain open after this review and must be resolved by a future implementation-design
issue before any production-wiring proposal is possible:

1. **Exact artifact sha lock** for the specific promoted-artifact snapshot an implementation would
   use — this review deliberately leaves `source_dataset_refs.artifact_sha256` as a placeholder.
2. **Exact feature-family scope**: production-only (per the #116 attribution: joined MAE 40.173 vs.
   the full set's 40.034 — a 0.138 difference) vs. the full five-family set. This is a real
   simplicity/governance trade-off, not a formality.
3. **Final rolling-window length** (`N` prior seasons) — 3 in the #112/#122 experiments, not yet
   fixed as a production default.
4. **Production acceptance threshold** — this review does not set one; PR #124 §5 prerequisite 7
   already deferred this, and it remains deferred here.
5. **Leakage audit for the specific production inference path** — broader than the experimental
   leakage discipline; must cover real-time data availability at inference time and look-ahead risk
   in any derived feature, scoped to whatever production path is eventually proposed.
6. **Deterministic implementation replay command** — PR #124 §8 documents the *experimental* replay
   commands; a production implementation would need its own equivalent, not yet written.
7. **Missing-history subgroup reporting requirement** — whether/how a production consumer must
   surface the size or composition of the no-history subgroup at serve time is not yet specified.
8. **Human sign-off authority for future model wiring** — PR #124 §5 prerequisite 11 requires "a
   human reviewer with authority over `seasonalPprModel.ts`"; this review does not name who that is
   or how that authority is established/verified.

## 6. Non-goals

- This review does not accept the contract for production implementation — only for a future
  **implementation-design** issue to be opened against it.
- This review does not lock `source_dataset_refs.artifact_sha256` or `promotion_review` to concrete
  values.
- This review does not resolve the production-only-vs-full-feature-family-scope question.
- This review does not set a production acceptance threshold.
- This review does not create, modify, or reference any TypeScript type, runtime schema, or
  validation code — the amended shape in §3.4 is documentation, not an implementation.
- This review does not approve a Fantasy consumer, UI surface, ranking, or advice behavior.
- This review does not promote or demote any TIBER-Data artifact.
- This review does not modify `seasonalPprModel.ts` or any other production Forecast file.

## 7. Failure modes this review exists to prevent

| Failure mode | How this review prevents it |
| --- | --- |
| A future implementation issue invents its own `provenance_state`/`validation_status` values ad hoc | §3.2 closes both fields to fixed enums; a value outside the enum is not a valid contract instance. |
| A future implementation issue bumps `contract_version` inconsistently (e.g. a MAJOR change ships as a PATCH) | §3.1 defines the bump policy explicitly; any future PR proposing a version bump must justify it against this table. |
| A future implementation issue treats `run_id` as "any unique string" | §3.3 specifies the exact composition rule; a `run_id` that doesn't derive from all four inputs is non-conforming. |
| A future implementation issue silently decides the feature-family scope without review | §5 unresolved item 2 keeps this an open, named decision that any implementation-design issue must address explicitly rather than pick by default. |
| A future implementation issue treats this review as production-bound authorization | §1 and §3.2's `provenance_state` enum make `"production_bound"` unreachable by this review or the next issue alone — it requires a separate, explicit, human-approved decision neither grants. |
| A future implementation issue bundles a Fantasy consumer with contract implementation | §4 restates that consumer approval is never the same decision as contract acceptance. |

## 8. Next step

The decision in §1 (`may_open_player_history_contract_implementation_design_issue`) permits opening a
**separate** implementation-design issue scoped to the unresolved items in §5. That issue must still
clear every gate in PR #124 §6 (contract reviewed and accepted — satisfied by this document for the
amended shape; artifact identity locked; leakage audit passed; deterministic rerun exercised;
real-vs-baseline-vs-shuffled framing preserved; missing-history failure mode documented for the
specific consumer; no bundled Fantasy/product consumer change; explicit human sign-off from someone
with authority over `seasonalPprModel.ts`) before any code touching a production feature path may be
written. This document does not open that issue and does not itself satisfy any of those gates beyond
the contract-shape review captured here.
