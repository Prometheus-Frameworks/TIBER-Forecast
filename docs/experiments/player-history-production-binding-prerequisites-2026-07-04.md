# Player-history production-binding prerequisites

> **Status: design only.** This document defines what must be true before the replicated
> player-history signal (#112 → #120 → #122) may ever be proposed for production binding. It
> performs **no Forecast run, no feature binding, no `seasonalPprModel.ts` change, no production
> baseline change, no product/UI output, no fantasy advice/rankings/start-sit/trade/draft output,
> and no TIBER-Data change**, and makes **no production-readiness claim**. It turns a replicated
> experimental result into a reviewable gate; it is not an implementation.

## 1. Why this document exists

PR #122 (`5a6bf22`) squash-merged a promoted-source controlled rerun that **replicated** the
candidate-source result from PR #112 exactly, and emitted the decision:

```text
promoted_player_history_signal_replicated_requires_followup
```

That decision's ceiling is explicit: it authorizes **only** opening this follow-up review/design
issue (#123). It does not authorize production binding, feature wiring, product output, or any
change to `seasonalPprModel.ts` or the production baseline. This document is that follow-up: it
inventories the evidence chain, states the boundary in one place, and defines the prerequisites,
proposed contract shape, and validation gates that a **future, separate** implementation issue
would have to satisfy before any wiring work could even be proposed — let alone performed.

Nothing in this document is itself a gate that unblocks anything. Passing every item on the
checklists below still requires a **new issue, new review, and new human approval** before code
that touches production Forecast may be written.

## 2. Evidence chain (#112 → #116 → #117/#118 → #119/#120 → #121/#122)

| Stage | Issue / PR | Decision emitted | Meaning |
| --- | --- | --- | --- |
| Candidate-source controlled run | #111 / PR #112 | `candidate_player_history_signal_observed_requires_followup` | Isolated three-arm experiment against candidate-evidence mirrors; real arm beat baseline and shuffled control on joined MAE/RMSE. Experimental only. |
| Candidate-source robustness checks | #115 / PR #116 | `candidate_signal_survives_initial_robustness_checks` | Feature-family ablation, prior-year baseline, lambda sweep, 5 shuffled seeds, leverage trim — signal held up. Attribution: the production family (prior-year/trailing PPR) carries essentially all of the lift. Still experimental. |
| Promoted-source gate | #117 / PR #118 | `may_open_promoted_mirror_refresh_issue` | Verified the newly-promoted TIBER-Data `player_season_coverage_v0` artifact (29/29 checks) as a governed source Forecast may refresh mirrors from. No mirror refresh occurred here. |
| Promoted-source mirror refresh | #119 / PR #120 | `may_open_promoted_controlled_rerun_issue` | Regenerated promoted-source outcome/input mirrors, re-ran population/overlap gates (27/27 checks: 485/610 joined, 79.5%, floors met, derangement feasible). No rerun occurred here. |
| Promoted-source controlled rerun | #121 / PR #122 | `promoted_player_history_signal_replicated_requires_followup` | Reran the **identical** #112 three-arm design against the promoted-source mirrors. Result replicated exactly (see §3). This document (#123) is the only thing that decision authorizes. |

Each stage's decision enum has a strictly bounded ceiling; none of them contains a value that
authorizes a production run, feature binding, or product output. The chain is a sequence of
narrowing permissions, not an escalating one.

### Upstream identity carried through the chain

| | Value |
| --- | --- |
| Candidate source artifact | `data/processed/evidence/player_season_coverage_2022_2025.source_backed.json` (TIBER-Data), sha256 `39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b` |
| Promoted artifact | `exports/promoted/nfl/player_season_coverage_v0.json` (TIBER-Data #192/PR #193, merge `65fb498253b5bdb6a7f6d0598d7235c90a78c729`), sha256 `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035` |
| Forecast promoted mirrors | `data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json`, `data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json` (PR #120, merge `2a4b9d56851306ab8aef0ad198887648545975cd`) |
| Rerun merge commit | PR #122, merge `5a6bf22f733d40da0f69fd46f1463c875c9d8c87` |

## 3. The replicated result, exactly

Joined-population metrics (n=485 of 610 evaluated rows), read directly from the committed reports —
**identical** between the #112 candidate-source run and the #122 promoted-source rerun:

| Arm | Joined MAE | Joined RMSE |
| --- | --- | --- |
| `baseline_only` | **68.926** | 88.553 |
| `real_player_history_features` | **40.034** | 57.287 |
| `shuffled_player_history_control` | **72.031** | 90.409 |

- Real beats baseline on joined MAE (40.034 < 68.926) and beats the shuffled control on joined MAE
  (40.034 < 72.031) and joined RMSE (57.287 < 90.409).
- The #122 rerun's candidate-source comparison recorded `directionally_consistent: true` and a
  joined-MAE delta of exactly `0` against #112 on every arm — the promoted mirrors are behaviorally
  verbatim to the candidate mirrors, confirmed by direct comparison rather than assumed.
- The #116 robustness attribution note: `production_only` (joined MAE 40.173) is within 0.138 of the
  full feature set (40.034), so the production family (prior-year/trailing PPR totals, means, trend)
  carries essentially all of the signal; usage, coverage, and age/team-context add ~no marginal
  joined-population MAE beyond it. Any future feature-contract work must weigh this — a narrower
  contract limited to the production family may be nearly as strong as the full one and simpler to
  govern.

**This result is experimental.** It was produced under an isolated three-arm LOOCV design with
train-fold-only imputation/standardization and a deterministic position-stratified shuffled control.
It is evidence that the signal is real and reproducible under two different source-governance
regimes — it is not evidence that the signal is safe, stable, or appropriately scoped for a
production model that ships weekly projections.

## 4. Boundary preserved by this document

This document, and any PR that implements it, must not:

- modify `seasonalPprModel.ts`,
- add player-history features to a production model,
- produce fantasy product output (routes, UI, exports),
- change ranking/scoring/advice behavior in any way,
- treat the replicated MAE result as production-ready by itself,
- promote or demote any TIBER-Data artifact,
- infer active roster, availability, injury, depth chart, or ownership status,
- authorize a future issue to skip any gate defined in §6 by citing this document alone.

No code in this PR creates a production consumer. If any code accompanies this document, it exists
only to validate or reproduce the documentation's claims (e.g., a script that re-checks the numbers
in §3 against the committed reports) — never to wire a feature into a production path.

## 5. Production-binding prerequisites

Before any future issue may even **propose** production binding of this signal, all of the
following must exist and be reviewed:

| # | Prerequisite | Why |
| --- | --- | --- |
| 1 | **Stable feature-contract name and version** (see §7) | Production consumers need a versioned, non-breaking contract; ad hoc field names invite silent drift. |
| 2 | **Explicit source artifact identity and hash/version expectations** | The production feature must pin to a specific promoted TIBER-Data artifact identity (path + sha256 + promotion review), fail closed on mismatch, exactly like every gate in this chain has. |
| 3 | **Train/eval split semantics documented and reviewed** | The 2022-2024 → 2025 REG split used in the experiment is not necessarily the right split for a rolling production model; a production split policy (e.g., rolling N-season windows, retraining cadence) must be defined and reviewed separately. |
| 4 | **Leakage review** (separate from the experimental leakage discipline already enforced) | The experimental leakage guards (no 2025 input rows, no outcome values on input rows, train-fold-only imputation) prove the *experiment* didn't leak. A *production* leakage review must additionally cover: real-time data availability at inference time, look-ahead in any derived feature, and whether the promoted artifact's `generated_at` timing matches what would actually be available in-season. |
| 5 | **Deterministic replay instructions** | Anyone reviewing a future wiring PR must be able to reproduce the exact reported numbers from a documented command sequence (see §8) without relying on tribal knowledge. |
| 6 | **Real-vs-baseline-vs-shuffled validation framing carried forward** | Any production acceptance criterion must be expressed the same way this chain has: beats baseline AND beats a deterministic shuffled control on the primary metric, not just "beats baseline." |
| 7 | **Acceptance threshold / threshold-setting process** | This document does **not** set a production acceptance threshold. A future issue must propose one (e.g., minimum MAE improvement over baseline, minimum joined-population coverage) and have it reviewed before any binding decision. |
| 8 | **Missing/invalid player-history behavior specified** | What a production consumer does for a player with no 2022-2024 history (the "no-history subgroup," 125/610 in this population) must be specified — never silently zero-filled, per every gate in this chain. |
| 9 | **Rollback / fail-closed behavior** | If the production feature's source artifact becomes unavailable, stale, or fails its own re-verification, the production path must fail closed to the current baseline behavior, not silently degrade. |
| 10 | **Future Fantasy consumer boundary** | Any consumer of this feature (ranking, projection, advice surface) must be named, scoped, and separately approved — this chain has never authorized a specific consumer, only the feature signal's existence. |
| 11 | **Human-approved, issue-gated binding preserved** | No decision in this chain, nor this document, authorizes automatic or unsupervised binding. Every step so far has required a new issue and a human-reviewed PR; production binding must not become the first step that skips that pattern. |

## 6. Validation gates for a future implementation issue

A later issue may **propose** wiring this signal into a production path only after ALL of the
following are true. None of these gates exists yet; this document defines them, it does not satisfy
them.

- [ ] The feature contract in §7 has been reviewed and explicitly accepted (not just drafted).
- [ ] The source artifact identity for the contract is locked (specific promoted artifact path +
      sha256 + promotion review reference), with a documented fail-closed re-verification step.
- [ ] A leakage audit — distinct from and broader than the experimental leakage discipline in §5.4 —
      has been performed and passed for the specific production inference path being proposed.
- [ ] The deterministic rerun command (§8) has been exercised by the reviewer, not just read.
- [ ] The validation approach for the production proposal still uses the real-vs-baseline-vs-shuffled
      framing from §3, evaluated on whatever population the production proposal actually targets.
- [ ] The failure mode for missing/invalid player history is documented for the specific production
      consumer being proposed (not just inherited from the experiment).
- [ ] The proposing issue/PR contains **no** Fantasy/product consumer change in the same slice —
      contract review and consumer wiring are separate approvals, never bundled.
- [ ] A human reviewer with authority over `seasonalPprModel.ts` has explicitly signed off; passing
      every automated check above is necessary but not sufficient.

If any gate is unmet, the correct next step is to fix the gate and reopen review — not to proceed
with a partial binding "to see how it goes."

## 7. Proposed feature-contract shape (design only — not implemented)

This is a **shape proposal**, not a schema committed to code. No file in this PR defines this as a
TypeScript type consumed anywhere; it exists so a future implementation issue has a concrete starting
point to review, amend, or reject.

```jsonc
{
  // Stable identifier + semantic version. Any breaking change to field meaning bumps the major
  // version; a production consumer pins to a specific version, never "latest."
  "contract_id": "player_history_production_feature_v0",
  "contract_version": "0.1.0-proposed",

  // Where the values are sourced from. Must resolve to a specific promoted TIBER-Data artifact,
  // never a candidate/unpromoted one, and must carry the promotion review reference.
  "source_dataset_refs": {
    "repo": "Prometheus-Frameworks/TIBER-Data",
    "artifact_path": "exports/promoted/nfl/player_season_coverage_v0.json",
    "artifact_sha256": "<locked at contract-acceptance time>",
    "promotion_review": "<TIBER-Data promotion PR reference>"
  },

  // Join keys back to the player/season grain the production model actually scores.
  "player_identity_join_keys": {
    "player_id": "string (gsis_id-equivalent, source-verified identity only)",
    "season": "number (the season being predicted FOR, i.e. the target season)",
    "season_type": "'REG'",
    "position": "'QB' | 'RB' | 'WR' | 'TE'"
  },

  // The non-negotiable temporal rule: every feature value must be computable using data that would
  // have existed strictly before the target season begins. No same-season or future-season value
  // may ever populate this contract for a given target season.
  "temporal_cutoff_semantics": {
    "rule": "feature values for target season S are built ONLY from seasons < S",
    "input_window": "rolling N prior seasons (N to be fixed by the future implementation issue; 3 in this experiment)",
    "excluded": "target season S in any form, including partial-season in-progress data"
  },

  // What must be true for a feature value to exist at all, vs. fall back to the missing-history path.
  "feature_availability_rules": {
    "requires": "at least one prior-season REG record for this player_id in the input window",
    "family_scope": "production-family aggregates carry ~all of the observed signal (#116 attribution); a minimal contract MAY be scoped to production-only fields, subject to future review",
    "no_partial_season_substitution": true
  },

  // Never silently coerced; every consumer must handle null explicitly.
  "null_missing_history_rules": {
    "no_history_player": "entire feature block is null, never zero-filled, never imputed at serve time using population statistics computed after the fact",
    "unavailable_usage_fields": "remain null even when history exists, exactly as in the source artifact (never zero-coerced)"
  },

  // Where this sits on the promotion/governance ladder -- explicitly NOT promoted to production use.
  "provenance_state": "experimental_replicated_not_production_bound",

  // Every generated instance of this contract must be traceable to the run that produced it.
  "generated_at": "ISO-8601 timestamp of generation, not of consumption",
  "run_id": "deterministic identifier tying a generated feature set back to a specific source artifact sha256 + contract_version + generator script version",

  // Contract-level validation status, distinct from any one run's experimental decision.
  "validation_status": "design_proposed_not_reviewed",

  // Explicit, load-bearing statement every consumer of this contract must preserve verbatim.
  "non_advice_non_ranking_statement":
    "This contract describes a candidate MODEL FEATURE only. It is not fantasy advice, not a ranking, not a start/sit recommendation, and not a product-facing claim. No consumer of this contract may present its values, or any derivative of them, as advice or ranking output without a separate, explicitly-approved product-integration review."
}
```

Notes on the shape above:

- `contract_version` starts pre-1.0 and explicitly `-proposed` to signal it has not been reviewed.
- `source_dataset_refs.artifact_sha256` is deliberately left unlocked here (`<locked at
  contract-acceptance time>`) — locking it now would imply this document is doing contract
  acceptance, which is out of scope for a design-only issue.
- `run_id` and `generated_at` mirror the pattern already used by every generator script in this
  repo (see the `*_PROVENANCE.json` companions under `data/fixtures/tiberData/`); a production
  version would need the same discipline, not a weaker one.

## 8. Deterministic replay instructions (for reviewing the evidence in §3, not for production use)

The numbers in §3 are reproducible today, network-free, from the committed mirrors and reports:

```bash
# Candidate-source controlled run (#112)
npm run experiment:player-history-controlled-run
npm run experiment:player-history-robustness      # (#116 robustness checks)

# Promoted-source gate + mirror refresh + controlled rerun (#118 / #120 / #122)
npm run gate:player-history-promoted-source -- --artifact=<local promoted artifact> --manifest=<local promotion manifest>
npm run refresh:player-history-promoted-mirrors -- --artifact=<local promoted artifact> --manifest=<local promotion manifest>
npm run experiment:player-history-promoted-controlled-rerun

npm run build && npm test
```

Each script fails closed on any sha/decision/provenance mismatch; none of them requires network
access once a local copy of the promoted TIBER-Data artifact is available. A future implementation
issue's "deterministic rerun documented" gate (§6) means exactly this: a reviewer can run the
sequence above (or its production equivalent) and get the same numbers this document cites.

## 9. Non-goals

- This document does not bind any feature into `seasonalPprModel.ts` or any other production path.
- This document does not set a production acceptance threshold — that is explicitly deferred to a
  future, separate issue (§5, prerequisite 7).
- This document does not lock the feature-contract's source artifact sha256 — that happens at
  contract-acceptance time, which has not occurred.
- This document does not approve a Fantasy consumer, UI surface, ranking, or advice behavior of any
  kind.
- This document does not promote or demote any TIBER-Data artifact.
- This document does not claim the replicated result is stable across future seasons, future
  promoted-artifact refreshes, or a production-scale rolling retraining cadence — only that it
  replicated once, under governance, exactly as observed under candidate evidence.

## 10. Failure modes this design exists to prevent

| Failure mode | How this document prevents it |
| --- | --- |
| A future PR wires the feature directly into `seasonalPprModel.ts` citing "the signal replicated" | §4 and §6 make explicit that replication alone satisfies none of the production-binding gates. |
| A future PR locks a "final" contract without review | §7 is marked `design_proposed_not_reviewed`; §6 requires explicit contract acceptance as its own gate. |
| A future PR silently zero-fills missing player history in production | §7's `null_missing_history_rules` and §5 prerequisite 8 require explicit, reviewed missing-history behavior. |
| A future PR bundles contract implementation with a Fantasy-facing consumer change | §6's gate list explicitly forbids bundling; consumer approval is separate (§5 prerequisite 10). |
| A future PR treats the promoted artifact as permanently trustworthy without re-verification | §5 prerequisite 2 and §7's `source_dataset_refs` require fail-closed re-verification, matching every gate in the chain (#117/#118, #119/#120). |
| A future PR skips the shuffled-control framing once the signal "looks obviously real" | §5 prerequisite 6 and §6 require the real-vs-baseline-vs-shuffled framing to carry forward into any production proposal. |
| A future PR treats this document itself as authorization to proceed | §1 and §4 state plainly that this document authorizes nothing beyond its own existence; every gate in §6 remains to be satisfied by a **later**, separately-reviewed issue. |

## 11. Next step

The only next step this document recommends is: **wait for a separate, explicitly-scoped
implementation-design issue** that addresses every gate in §6, one at a time, before any code
touching `seasonalPprModel.ts` or a production feature path is written. This document is that
issue's prerequisite checklist — it is not that issue.
