# Player-history feature contract v0 — implementation design plan

> **Status: implementation design only.** This document resolves or explicitly scopes the eight
> unresolved items left open by PR #126 (`docs/experiments/player-history-feature-contract-v0-review-2026-07-04.md`,
> §5), so a **future, separate** implementation issue can be opened without guessing. It performs
> **no Forecast run, no `seasonalPprModel.ts` change, no production feature-generation code, no
> TypeScript runtime schema consumed by production code, no production feature artifact
> instantiation, no player-history feature binding, no ranking/scoring/advice/route/UI/export change,
> and no TIBER-Data promotion/demotion**, and makes **no production-readiness claim**. This is an
> implementation-design checkpoint, not an implementation issue and not a production-binding issue.

## 0. Source of truth

This document reads the merged PR #124 and PR #126 artifacts directly:

- `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md` (merge `b2edd63`, closing #123)
- `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.json`
- `docs/experiments/player-history-feature-contract-v0-review-2026-07-04.md` (merge `e340247`, closing #125)
- `docs/experiments/player-history-feature-contract-v0-review-2026-07-04.json`

All four documents are unchanged by this design. This artifact is additive: a new file that resolves
or explicitly scopes each of PR #126 §5's eight unresolved items.

## 1. Decision

| | Value |
| --- | --- |
| **Next-step decision** | `may_open_player_history_contract_implementation_issue` |

**Why this decision, not `..._requires_followup` or `..._rejected`:** every one of the eight
unresolved items from PR #126 §5 is addressed below — either resolved with a concrete default (§2.1,
§2.3), given an explicit decision rule (§2.2, §2.4), specified as a checklist (§2.5), scoped as a
requirement without being implemented (§2.6, §2.7), or represented as a concrete governance mechanism
(§2.8). Nothing is left as an open question a future implementation issue would have to guess at. That
is what makes opening an implementation issue safe now, rather than requiring another design pass.

This decision does **not** authorize `seasonalPprModel.ts` wiring, production feature generation, or
any Fantasy/product consumer. See §4 for exactly what a future implementation issue may and may not
do.

## 2. Resolution of the eight unresolved items

### 2.1 Exact artifact sha lock

**Decision: defer the lock, but reference the current known identity.**

This document does not lock `source_dataset_refs.artifact_sha256` to a concrete value. The repo does
have a current, stable promoted identity already used throughout the #117→#122 chain:

| | Value |
| --- | --- |
| Promoted artifact | `exports/promoted/nfl/player_season_coverage_v0.json` |
| sha256 | `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035` |
| Promotion review | TIBER-Data#192 / PR #193, merge `65fb498253b5bdb6a7f6d0598d7235c90a78c729` |

This is recorded here as **informative context**, not a lock. The implementation issue must
re-verify this identity is still current (TIBER-Data may have promoted a newer artifact by the time
implementation starts) using the existing fail-closed gate scripts — `npm run
gate:player-history-promoted-source` and `npm run refresh:player-history-promoted-mirrors` — before
locking any `source_dataset_refs` value into a contract instance. Copying the sha above verbatim
without re-running that verification would defeat the entire point of fail-closed identity checking
this chain has enforced at every prior stage.

### 2.2 Feature-family scope

**Decision rule: production-only is the v0 default; the full feature set requires a justified
exception.**

The #116 robustness attribution recorded a joined MAE of `40.173` for the `production_only` variant
against `40.034` for the full five-family set — a `0.138` difference, i.e. the non-production
families (usage, coverage, age/career, team-context) contribute negligible marginal signal on this
population. Per the operator's stated default, the v0 implementation **should** scope
`feature_availability_rules` to the production family only (prior-year/trailing PPR totals, means,
trend) unless a future proposal clears both of the following:

1. **Added-value test**: the full feature set's joined-MAE improvement over the production-only
   scope must exceed whatever minimum relative-improvement bar the acceptance-threshold process
   (§2.4) eventually sets — not simply "any nonzero improvement," since `0.138` on this population
   would not obviously clear a meaningful bar.
2. **Governance test**: adding the non-production families must not expand the forbidden-field
   surface, must not add fields harder to null-audit than the production family already is, and must
   be reviewed as its own explicit amendment to the contract (a MINOR-or-larger version bump per PR
   #126 §3.1), not folded silently into an unrelated implementation PR.

Until both tests are cleared and reviewed, the implementation issue should build the production-only
scope.

### 2.3 Rolling-window length

**Decision: `N = 3` is the v0 default; changing it requires re-running the experimental design, not
just a config edit.**

`N = 3` prior seasons is what every experiment in this chain (#112, #122) actually validated. The
implementation issue may adopt `N = 3` as the v0 default without further evaluation. Changing `N` to
any other value is **not** a parameter tweak: it changes what the input mirrors contain and would
require re-running the same LOOCV / train-fold-only imputation / shuffled-control design used in
#112 and #122 against the new window before that value could be adopted, exactly as if it were a new
candidate signal. This document does not authorize skipping that re-validation for a different `N`.

### 2.4 Production acceptance threshold

**Decision: do not set a number here; define the process a future threshold proposal must follow.**

A future, separate threshold proposal must include, at minimum:

- the real-vs-baseline-vs-shuffled framing preserved (PR #124 §5 prerequisite 6; PR #126 §4) —
  a threshold expressed only as "beats baseline" is not acceptable,
- evaluation using the production split semantics locked by whatever `N` and feature-family scope
  are active at proposal time (§2.2, §2.3), not the original experimental split by default if either
  has changed,
- both a **relative improvement floor** (e.g. minimum % joined-MAE improvement over baseline) and an
  **absolute floor** (a joined-MAE ceiling below which the feature is considered acceptable
  regardless of relative improvement), so a proposal cannot game one dimension at the expense of the
  other,
- explicit acknowledgment of single-season risk: a threshold must not be set from one replicated
  season's result alone (the current evidence is exactly that — one candidate-source season,
  replicated once under promoted governance) without either an additional season of validation or an
  explicit, reviewed risk acceptance stating why one season is considered sufficient,
- the explicit human sign-off defined in §2.8, since setting a production threshold is itself a step
  toward production binding.

This document does not itself propose a number. Any future document, comment, or PR that states a
concrete threshold without following this process should be treated as non-conforming.

### 2.5 Production-path leakage audit requirements

**Decision: the following checklist is required, in full, before any production-wiring proposal.**
This is broader than the experimental leakage discipline already enforced by every prior gate in this
chain (which proved the *experiment* didn't leak); this checklist is about the *production inference
path* specifically, which does not exist yet.

- [ ] **Target-season exclusion**: the production feature-generation path structurally cannot read
      any row from the season being predicted, verified the same way `buildPromotedInputMirror`
      already does (season comparison, not a naming convention).
- [ ] **Partial-season exclusion**: no in-progress/partial data from the target season may
      substitute for a missing prior-season value, even if superficially plausible (e.g. using
      current-season week 1-2 data as a proxy for a rookie with no prior history).
- [ ] **`generated_at` timing**: the promoted artifact's `generated_at` timestamp must be verified
      against what would actually have been available at the production inference time being
      proposed — a batch-generated artifact dated after the proposed inference time is a leak, not a
      feature.
- [ ] **Real inference-time availability**: every field the contract reads must be confirmed
      available at the actual moment production inference would run, not just available in the
      offline promoted artifact used for design/validation.
- [ ] **Train/eval split semantics documented**: whatever split/retraining-cadence policy the
      production path uses must be written down and reviewed, not implicit in code (PR #124 §5
      prerequisite 3).
- [ ] **Source artifact freshness**: a staleness policy must exist — how old may the promoted
      artifact be before the production path refuses to use it (fail closed, per PR #124 §5
      prerequisite 9) rather than serving stale features silently.
- [ ] **Derived-feature look-ahead risk**: any feature computed from the raw contract fields (e.g. a
      trend or rolling aggregate) must be independently checked for look-ahead, since a derived
      computation can reintroduce leakage even when its raw inputs are individually clean.
- [ ] **Missing-history treatment**: verified against §2.7 below — never zero-filled, always
      null, and reported per §2.7's requirements.

A future implementation issue may **draft** this checklist into a concrete audit document, but running
it against a real proposed production path is explicitly a **wiring-issue-time** activity, not
something this design document or the next implementation issue performs.

### 2.6 Deterministic implementation replay command

**Decision: specify what it must prove here; the next implementation issue is where it gets built
(per §4's allowed scope) — this design document itself does not implement it.**

A future deterministic replay command (analogous to `npm run
experiment:player-history-promoted-controlled-rerun`, but for contract-instance generation rather
than the LOOCV experiment) must:

- **take as input**: a locked `source_dataset_refs` (path + sha256 + promotion review) and a
  `contract_version`,
- **produce as output**: a contract instance conforming to the amended v0 shape (PR #126 §3.4),
  including a recomputable `run_id` per the composition rule in PR #126 §3.3,
- **fail closed** on: source-identity mismatch (sha256 doesn't match the pinned value, path doesn't
  match, promotion review doesn't match), any forbidden field present in the underlying source rows,
  and any null-semantics violation (a zero-coerced or populated value in a field this contract
  requires to stay null),
- **reproduce, as a smoke test**: when pointed at the same promoted artifact identity used in #122,
  the joined-population MAE/RMSE the command's own validation step computes (for sanity-checking the
  implementation's data plumbing, not for claiming a production result) must match the committed
  `docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json` values exactly (baseline
  `68.926`, real `40.034`, shuffled `72.031`, joined RMSE `88.553` / `57.287` / `90.409`). A mismatch
  means the implementation diverged from the validated experimental design and must not proceed.

Writing this command is in-scope for the future implementation issue (§4); this document defines its
required contract, not its code.

### 2.7 Missing-history subgroup reporting

**Decision: required in any future validation/replay output; never silent.**

Any future implementation's validation or replay output must report, at minimum:

- the no-history subgroup **count** and **share** (count / total evaluated population),
- a **by-position breakdown** of the no-history subgroup (matching the granularity already used in
  every report in this chain, e.g. `docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json`'s
  `population.no_history_rows` and `by_position`),
- confirmation that every no-history player's feature block is entirely `null` — not partially
  populated, not zero-filled, not imputed from population statistics computed after the fact.

A future implementation that silently passes through missing history with no reporting is
non-conforming, even if the underlying null-handling is technically correct — visibility into the
subgroup is itself a requirement, not an optional nicety.

### 2.8 Human sign-off authority over `seasonalPprModel.ts`

**Decision: an explicit, dated, PR-scoped sign-off from the repository's merge-authority operator —
not an external or unavailable approver.**

This repository's governance to date has every merge in the #99→#126 chain performed by the same
operator account (`Prometheus-Frameworks`) that opens each issue and reviews each PR. This document
does not invent a new external approval body. Concretely, before any future PR proposes
`seasonalPprModel.ts` wiring:

- the sign-off must be a comment or review **on that specific wiring PR**, not a blanket
  pre-approval inherited from this document or any prior issue in the chain,
- the sign-off must explicitly reference: the exact contract `run_id`/`contract_version` being
  wired, confirmation that the §2.5 leakage-audit checklist was run and passed for that specific
  proposal, and the specific acceptance-threshold evidence (§2.4) the proposal is relying on,
- the sign-off must be dated and attributable to the operator account with merge authority over
  `main` in this repository,
- absence of this sign-off means the PR must not be merged, regardless of how many automated checks
  pass.

This is a governance mechanism, not a code mechanism — nothing in this repository enforces it
automatically, and this document does not claim otherwise.

## 3. Non-negotiables preserved

Carried forward unchanged from PR #124 and PR #126, binding on any future implementation or wiring
proposal:

- target season `S` may only use seasons `< S` — no exceptions,
- no target-season or partial-target-season substitution, under any feature-availability fallback,
- missing-history players must not be silently zero-filled — the entire feature block stays `null`,
  and its presence must be reported (§2.7),
- source artifact identity must be path + sha256 + promotion review, never sha256 alone, and a
  mismatch at generation time must fail closed,
- `run_id` must derive from the full source identity plus `contract_version`,
  `generator_script_version`, and `generated_at` (PR #126 §3.3) — never a bare unique string,
- the real-vs-baseline-vs-shuffled validation framing remains required for any acceptance-threshold
  proposal (§2.4),
- this document does not authorize `seasonalPprModel.ts` wiring, in whole or in part,
- any Fantasy/product consumer requires its own separate, explicitly-approved review — contract
  acceptance, implementation design, and consumer approval are three different decisions, never
  collapsed into one.

## 4. Future implementation issue boundary

If this design is accepted, a **future, separate** implementation issue may:

- create a non-production contract schema/type or JSON Schema representing the amended v0 shape
  (PR #126 §3.4), for validation and documentation purposes,
- create validation logic that checks a contract instance against that schema (structural validation
  only — not a production consumer),
- create the deterministic replay/validation script specified in §2.6,
- lock `source_dataset_refs` for a specific implementation artifact, following the re-verification
  requirement in §2.1,
- generate an experimental/non-production contract instance (e.g. written to
  `data/fixtures/tiberData/` or an equivalent experiment-scoped path, mirroring how every prior
  mirror/gate artifact in this chain has been generated),
- add tests for schema conformance, provenance/`run_id` recomputation, fail-closed behavior on
  identity mismatch, and missing-history null-and-reporting behavior.

Still forbidden, even in that next implementation issue, unless separately approved by its own
explicitly-scoped issue:

- `seasonalPprModel.ts` wiring, in whole or in part,
- production model feature use of any kind,
- any Fantasy/product consumer change,
- advice/ranking/scoring behavior,
- UI, routes, or export changes.

## 5. Failure modes this design exists to prevent

| Failure mode | How this design prevents it |
| --- | --- |
| Choosing the full feature scope just because it has a slightly lower MAE | §2.2's decision rule requires clearing an added-value test against a not-yet-set threshold bar, not "any nonzero improvement." |
| Locking a stale artifact sha too early | §2.1 requires re-verification via the existing fail-closed gate scripts at implementation time, not copying the sha recorded here. |
| Treating `N = 3` as permanent without review | §2.3 states any change requires re-running the full experimental design, not a config edit. |
| Setting a production threshold based on one replicated season only | §2.4 requires explicit acknowledgment of single-season risk before a threshold proposal may rely on the current evidence alone. |
| Implementing replay that does not verify source identity | §2.6 requires fail-closed source-identity verification as part of the command's required behavior, not an optional check. |
| Reporting missing history as zeros | §2.7 and §3 both restate null-only handling; §2.7 additionally requires the subgroup be visible in output, not just correctly null internally. |
| Letting contract implementation become model wiring by accident | §4's allowed/forbidden lists are explicit; `seasonalPprModel.ts` wiring is named as forbidden in every section of this document that discusses scope. |

## 6. Non-goals

- This document does not implement any part of the contract in code.
- This document does not create a TypeScript runtime schema or validation logic — that is future
  implementation-issue work per §4.
- This document does not lock `source_dataset_refs.artifact_sha256` to a concrete value.
- This document does not resolve the feature-family scope with a final answer beyond the default
  rule in §2.2 — a future amendment may still justify the full set.
- This document does not set a production acceptance threshold or number.
- This document does not run the leakage-audit checklist in §2.5 against any real proposal — it only
  specifies the checklist.
- This document does not approve a Fantasy consumer, UI surface, ranking, or advice behavior.
- This document does not promote or demote any TIBER-Data artifact.
- This document does not modify `seasonalPprModel.ts` or any other production Forecast file.

## 7. Next step

The decision in §1 permits opening a **separate** implementation issue scoped exactly to §4's allowed
list. That issue must still respect every non-negotiable in §3 and every gate PR #124 §6 and PR #126
already established, and it must not attempt `seasonalPprModel.ts` wiring, production feature
generation consumed by production code, or any Fantasy/product consumer change — those remain gated
behind their own separate, explicitly-scoped, human-approved issues per §2.8.
