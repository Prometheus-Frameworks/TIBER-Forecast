# Player-history feature contract v0 — production acceptance threshold proposal

> **Status: threshold proposal only.** This document proposes a production acceptance threshold
> framework for `player_history_production_feature_v0`, as required by PR #124 §5 prerequisite 7 and
> deferred by every document in the design chain since. It performs **no Forecast run, no
> `seasonalPprModel.ts` change, no production feature-generation code, no production-path leakage
> audit execution, no Fantasy/product consumer change, no ranking/scoring/advice/route/UI/export
> change, and no TIBER-Data promotion/demotion**, and makes **no production-readiness claim**. This is
> a threshold-design/report checkpoint, not a production-binding issue.

## 0. Source of truth

This proposal reads the merged design-chain artifacts and evidence reports directly:

- `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md` / `.json` (PR #124, closing #123)
- `docs/experiments/player-history-feature-contract-v0-review-2026-07-04.md` / `.json` (PR #126, closing #125)
- `docs/experiments/player-history-feature-contract-v0-implementation-design-2026-07-04.md` / `.json` (PR #128, closing #127)
- `docs/reports/player-history-feature-contract-v0-validation-2026-07-04.md` / `.json` (PR #130, closing #129)
- `data/fixtures/tiberData/player_history_production_feature_v0.experimental_contract_instance.json` (PR #130)
- `docs/reports/player-history-controlled-run-2026-07-02.json` (#112)
- `docs/reports/player-history-robustness-checks-2026-07-03.json` (#116)
- `docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json` (#122)

All of these documents are unchanged by this proposal. This artifact is additive.

## 1. Decision

| | Value |
| --- | --- |
| **Threshold decision** | `player_history_threshold_proposed_requires_additional_validation` |

**Why this decision, not `..._accepted_for_leakage_audit_design` or `..._rejected_requires_redesign`:**
the quantitative components below (§3) are well-supported by the replicated evidence and are proposed
as concrete candidates, not left as an open question. But every one of PR #124 §5 prerequisite 7's own
conditions for accepting a threshold from current evidence alone is *not* yet met: the evidence is one
target season (2025), observed under two different source-governance regimes (candidate, then promoted)
that produced an **identical** result rather than two independent seasons of validation (§4). PR #124
§5 prerequisite 7 explicitly requires "explicit acknowledgment of single-season risk... without either
an additional season of validation or an explicit, reviewed risk acceptance stating why one season is
considered sufficient." This document does not make that risk-acceptance case strongly enough to accept
the threshold now — see §4. The quantitative components are therefore a reviewable **candidate**
framework, accepted in shape, pending additional validation before the threshold itself is treated as
binding on a future leakage-audit or wiring proposal.

This decision does not authorize `seasonalPprModel.ts` wiring, a production-path leakage audit
execution, or any Fantasy/product consumer. See §7 for the narrowly-scoped next allowed issue.

## 2. Evidence summary

Read directly from the committed reports, not re-derived:

### 2.1 Replicated joined-population metrics (#112 → #122)

| Arm | Joined MAE | Joined RMSE |
| --- | --- | --- |
| `baseline_only` | 68.926 | 88.553 |
| `real_player_history_features` | 40.034 | 57.287 |
| `shuffled_player_history_control` | 72.031 | 90.409 |

- Real beats baseline on joined MAE by **41.9%** relative improvement ((68.926 − 40.034) / 68.926).
- Real beats the shuffled control on joined MAE by **44.4%** relative improvement.
- Real beats baseline on joined RMSE by **35.3%** relative improvement; beats shuffled control on
  joined RMSE by **36.6%** relative improvement.
- These numbers are **identical** between the #112 candidate-source run and the #122 promoted-source
  rerun (`joined_mae_delta_vs_candidate` = 0 on every arm, per #122's own candidate-source comparison)
  — the promoted mirrors are behaviorally verbatim to the candidate mirrors. This is strong replication
  under two different source-governance regimes, but it is **not** two independent seasons of signal
  (§4): both runs evaluate the identical 2025-target population from the identical underlying rows.

### 2.2 Production-only vs. full feature-family attribution (#116)

| Variant | Joined MAE | Joined RMSE |
| --- | --- | --- |
| `production_only` | 40.173 | 57.302 |
| `full_feature_set` | 40.034 | 57.287 |

- Gap: **0.139** joined MAE (0.35% relative to `production_only`), essentially the same joined RMSE.
- Per PR #128 §2.2's decision rule, `production_only` remains the v0 default unless the full set clears
  both an added-value test and a governance test. §3.6 below operationalizes the added-value test with
  a concrete bar for the first time; the 0.35% gap does not clear it.

### 2.3 Missing-history subgroup (PR #130 contract instance, `docs/reports/player-history-feature-contract-v0-validation-2026-07-04.json`)

| | Value |
| --- | --- |
| No-history count | 125 |
| Total evaluated population | 610 |
| Share | 20.5% |
| By position | QB 15, RB 36, TE 23, WR 51 |
| Every no-history feature block entirely null | `true` |

### 2.4 Contract implementation state (PR #130)

- Source identity re-verified and locked (`TIBER-Data#192`, artifact sha256
  `29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035`), with committed-mirror
  source-identity verification passing.
- Contract instance passed structural validation (`contract_instance_conforms_non_production`).
- Deterministic replay reproduced the #122 joined-population smoke metrics exactly.
- Final PR #130 decision: `player_history_contract_v0_non_production_implementation_ready_for_review`.

## 3. Candidate quantitative threshold components

These are **proposed candidates**, reviewable and amendable, not a final production-binding number.
Each is set with headroom below the currently observed values, so a threshold that merely holds up
under normal season-to-season variance passes, while a materially weaker signal does not.

| # | Component | Candidate threshold | Currently observed | Margin |
| --- | --- | --- | --- | --- |
| 3.1 | Relative joined-MAE improvement over baseline | **≥ 25%** | 41.9% | comfortable |
| 3.2 | Relative joined-MAE improvement over shuffled control | **≥ 25%** | 44.4% | comfortable |
| 3.3 | Absolute joined-MAE ceiling | **≤ 48.0** | 40.034 | ~20% headroom |
| 3.4 | Absolute joined-RMSE ceiling | **≤ 68.0** | 57.287 | ~19% headroom |
| 3.5 | Relative joined-RMSE improvement over shuffled control | **≥ 20%** | 36.6% | comfortable |
| 3.6 | Production-only vs. full-set added-value bar | full set adopted only if its relative joined-MAE improvement over `production_only` **exceeds 2%**, AND the governance test in PR #128 §2.2 passes (no expanded forbidden-field surface; reviewed as its own MINOR-or-larger contract amendment) | 0.35% | full set does **not** clear this bar; `production_only` remains the default scope |
| 3.7 | No-history subgroup reporting | must be reported (count/share/by-position) on every evaluation; if share exceeds **35%** of the evaluated population, the joined-subset evidence is considered too thin to evaluate a threshold against without additional justification | 20.5% | well under the soft ceiling |

Notes:

- 3.1–3.5 are all comfortably cleared by current evidence, by design: the point of headroom is to avoid
  a threshold that only current-season numbers can pass, since a threshold intended to gate *future*
  seasons must tolerate normal variance without silently becoming a rubber stamp.
- 3.3/3.4's absolute ceilings are set well below both `baseline_only` (68.926 / 88.553) and
  `shuffled_player_history_control` (72.031 / 90.409), so a future season where the real arm still beats
  both comparators but drifts somewhat worse than today would still fail these ceilings if the drift
  were large enough to approach the baseline's own performance.
- 3.6 gives PR #128 §2.2's previously-undefined "meaningful bar" a concrete number for the first time.
  This is the correct venue for that number per PR #128 §2.4's requirement that a threshold proposal
  define the acceptance-threshold process, not the contract review or implementation-design documents.
- None of 3.1–3.7 is itself a claim that the current evidence is sufficient to accept production
  binding — that is exactly the question §4 addresses, and where this proposal declines to say yes yet.

## 4. Single-season risk (PR #124 §5 prerequisite 7; the decisive question in this proposal)

The current evidence is **strong but centered on one target season**: 2025. The #122 promoted-source
rerun did not add a second season of validation — it re-ran the **identical** #112 three-arm design
against a governance-refreshed but behaviorally-identical population (delta = 0 on every arm vs. #112).
That is real information (it proves the signal is not an artifact of one specific source-governance
path), but it is not the same as observing whether the signal holds for a 2024-target or 2023-target
population built the same way, or whether it holds in a true forward-looking backtest.

This document does **not** make the case that one replicated target season is sufficient to accept a
production threshold. Per the operator's stated default preference and PR #124 §5 prerequisite 7's own
bar ("must not be set from one replicated season's result alone... without either an additional season
of validation or an explicit, reviewed risk acceptance stating why one season is considered
sufficient"), no such explicit risk-acceptance case is made here. Doing so would require, at minimum,
an argument for why the specific 2025 target season is not idiosyncratic (e.g., no unusual injury/rule/
scheduling shock that season, or comparable variance to prior seasons) — that argument is not made in
this document, and manufacturing it without a second season of actual evidence would be exactly the
failure mode PR #124 §5 warns against.

**Conclusion: single-season risk is not accepted here.** The threshold components in §3 are proposed
as a candidate framework, but full acceptance is deferred pending additional validation (§7).

## 5. Qualitative / governance conditions (non-numeric, must ALL hold regardless of §3)

A threshold is necessary but never sufficient. Before any future **production wiring or binding
proposal** (i.e., a proposal that would actually touch `seasonalPprModel.ts` or a production feature
path) may even be opened against this signal, all of the following must independently hold:

- [ ] Source identity lock and committed-mirror source-identity verification (PR #130) must pass for
      whatever artifact snapshot the proposal uses — re-verified at proposal time, never inherited from
      a stale prior run.
- [ ] The contract instance must pass structural validation (schema, closed enums, verbatim
      non-advice/non-ranking statement, null semantics, forbidden-field scan) per PR #130's validator.
- [ ] The deterministic replay/validation command must reproduce its own pinned smoke metrics exactly;
      a mismatch invalidates the evidence regardless of what the metrics show.
- [ ] The missing-history subgroup must be reported (count/share/by-position) for the specific
      population the proposal evaluates — never silently passed through.
- [ ] A production-path leakage audit (PR #124 §5 prerequisite 4; PR #128 §2.5's checklist), broader
      than the experimental leakage discipline already enforced, must have been **separately designed
      and executed** against the specific production inference path being proposed, with a passing
      result. Clearing the quantitative threshold in §3 does not substitute for this audit in any way.

This gate applies to a *wiring/binding* proposal, not to the leakage-audit design/execution issue
itself (§7's next allowed issue is scoped to additional validation, and a later leakage-audit design
issue would follow it) — that issue is exactly where the audit above gets designed and run, so it
cannot be a precondition for its own existence. It is a precondition only for the wiring proposal that
would come *after* the audit passes.
- [ ] Human sign-off (PR #128 §2.8) must be a comment or review on the *specific* wiring PR, dated,
      attributable to the repository's merge-authority operator, and must reference the exact
      `run_id`/`contract_version` being wired, confirmation the leakage audit passed for that specific
      proposal, and the specific threshold evidence relied on. A blanket pre-approval inherited from
      this document does not satisfy this condition.
- [ ] No Fantasy/product consumer, ranking, or advice behavior is authorized by threshold acceptance
      alone — consumer approval remains its own separate, explicitly-approved review (PR #124 §4;
      PR #126 §4; PR #128 §3), never collapsed into a threshold decision.

## 6. Non-negotiables preserved

Carried forward unchanged from every document in this chain, binding on any future threshold
acceptance, leakage-audit, or wiring proposal:

- target season `S` may only use seasons `< S` — no exceptions,
- no target-season or partial-target-season substitution, under any feature-availability fallback,
- missing-history players must not be silently zero-filled — the entire feature block stays `null`,
  and its presence must be reported,
- source artifact identity must be path + sha256 + promotion review, never sha256 alone; a mismatch
  at generation time must fail closed,
- the real-vs-baseline-vs-shuffled validation framing remains required for any future evaluation of
  this signal, on whatever population that evaluation actually targets,
- this document does not authorize `seasonalPprModel.ts` wiring, in whole or in part,
- any Fantasy/product consumer requires its own separate, explicitly-approved review,
- this document does not promote or demote any TIBER-Data artifact.

## 7. Next allowed issue

Because §4 declines to accept single-season risk, the next allowed issue is scoped to **additional
validation**, not a production-path leakage audit design and not model wiring:

> **Design additional validation for player-history threshold acceptance**

That issue may design (not necessarily execute in the same PR) a second-season or backtest validation
approach — e.g., re-running the #112/#122 three-arm design with a different target season (2024
predicted from 2021-2023, subject to TIBER-Data source availability) or a rolling-origin backtest across
multiple seasons — using the same real-vs-baseline-vs-shuffled framing, the same governed-source
discipline, and the same non-production contract infrastructure from PR #130. It must not skip straight
to a production-path leakage audit or `seasonalPprModel.ts` wiring; those remain gated behind an
accepted threshold (this document does not accept one) and their own separate approvals per §5 and §6.

If a future additional-validation issue produces a second season's (or backtest's) result that also
clears §3's candidate components, a follow-up threshold-acceptance issue may revisit this document's
decision and consider `player_history_threshold_candidate_accepted_for_leakage_audit_design`. That
decision remains this proposal's to make later, not this document's to grant now.

## 8. Non-goals

- This document does not accept a production acceptance threshold as binding.
- This document does not run a production-path leakage audit.
- This document does not modify `seasonalPprModel.ts` or any other production Forecast file.
- This document does not add player-history features to any production model.
- This document does not approve a Fantasy consumer, UI surface, ranking, or advice behavior.
- This document does not promote or demote any TIBER-Data artifact.
- This document does not claim the replicated result is stable across future seasons or a
  production-scale rolling retraining cadence.

## 9. Failure modes this proposal exists to prevent

| Failure mode | How this proposal prevents it |
| --- | --- |
| Setting a threshold that only today's exact numbers can pass | §3's candidate components are set with deliberate headroom below observed values (§3 notes). |
| Treating "beats baseline" alone as sufficient | §3.1/§3.2 require beating BOTH baseline and shuffled control by a relative margin, preserving the real-vs-baseline-vs-shuffled framing from every prior gate in this chain. |
| Accepting a threshold from one replicated season without acknowledgment | §4 explicitly declines to accept single-season risk and states what a future risk-acceptance case would require. |
| Letting the full feature-family set in "because it's marginally better" | §3.6 gives PR #128 §2.2's added-value test a concrete 2% bar; the observed 0.35% gap does not clear it. |
| Treating threshold acceptance as authorization for a leakage audit or wiring | §5 and §7 state plainly that the leakage audit remains separate and that this document does not accept the threshold at all. |
| Silently passing through a shrinking or growing no-history subgroup | §3.7 sets a soft ceiling and requires the subgroup be reported for whatever population any future evaluation targets. |

## 10. Next step

The decision in §1 permits opening a **separate** "Design additional validation for player-history
threshold acceptance" issue (§7). It does not permit a production-path leakage audit design/execution
issue or a `seasonalPprModel.ts` wiring issue; those remain gated behind an accepted threshold, which
this document does not grant.
