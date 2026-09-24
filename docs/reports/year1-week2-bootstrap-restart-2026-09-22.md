# Forecast offline bootstrap — restart point (2026-09-22)

Status: **preservation / restart documentation only**. This document does not admit data, select a denominator, run Forecast, or promote the offline implementation.

Visual operator companion spec: [`docs/forecast-tracker-gptsite-spec.md`](../forecast-tracker-gptsite-spec.md)

## 1. Accepted offline implementation

The Year-1 Week-2 offline bootstrap implementation is complete within its independently reviewed implementation scope.

- Repository base: `e295e3de745b676df571348cb8541fb5e35e3a02`
- Accepted eight-file snapshot: `dd884ce6b72801451984d9f99a7e9062e1b706d50c32252b7b227b3de6cae0d4`
- Immutable recovery archive: [`forecast-bootstrap-r1a-recovery.zip`](https://github.com/Prometheus-Frameworks/TIBER-Forecast/blob/481edb647c0d5b5b18b6a8551475613066da4371/docs/reports/evidence/year1-week2-bootstrap-2026-09-22/forecast-bootstrap-r1a-recovery.zip), archive SHA-256 `a52c08aa3537001f340e705f6636bed1c29d97e6dd8a8f0ada95adc7690e1325`. Its `final/` tree contains the eight implementation/test files under their repository-relative paths, the accepted specification and project configuration; `frozen-manifest.json` lists per-file SHA-256 values and `FILES.sha256` verifies archive members. `base-to-final.patch` targets the pinned repository base. The eight-file snapshot value above is a sorted path-to-SHA-256 map digest, not a Git commit or archive digest.
- Accepted frozen manifest: `4917f380f1d25d02437fe7e5c2d03ab8b5b9461bcb5df8da91758cbb241e3ed5`
- Accepted specification: `7247d91ce06761fcdcf62d78f6910369fdedd3c4d7a4d76dfd0e2f427e135844`
- TypeScript: `tsc --noEmit` exit 0
- Focused Vitest: 136 passed, 0 failed
- Independent exact-snapshot review: clean within full offline-bootstrap implementation scope

R1a is resolved. The implementation remains preservation-only and is not a live runner or an admitted Forecast package.

Retained non-exhaustive conformance coverage remains explicit: legitimate prior/current team-change positives, complete roster/bye examples, delayed/resumed games, every season/position minimum-20 and 95% boundary combination, and true multi-game inner ordering.

## 2. Model shape being prepared

The bounded bootstrap remains:

- `C0 = P`
- `C1 = W` (diagnostic)
- `C2 = P + alpha * (W - P)`
- training seasons: target 2022 and target 2023
- validation season: target 2024
- isolated final evaluation: target 2025

No role, opportunity, Teamstate, age-curve, matchup, offensive-line, injury, or other contextual predictor is part of this v0 numerical feature set.

## 3. Historical arithmetic completed so far

All values below are **unadmitted source-identity arithmetic candidates**. Identity overlap is diagnostic only and is not an accepted experiment population.

| Target season | Prior candidate P | Week-1 candidate W | Source-ID overlap |
| --- | ---: | ---: | ---: |
| 2022 training | 633 | 341 | 299 |
| 2023 training | 608 | 339 | 288 |
| 2024 validation | 577 | 339 | 291 |
| 2025 final evaluation | blocked before P | not started | not applicable |

The 2022–2024 P/W arithmetic snapshots were independently reviewed clean within their respective arithmetic scopes. No overlap count defines a cutoff-valid population.

2024 Week-2 raw statistics have been exposed only while investigating 2024 as prior-season evidence for target 2025. They are therefore no longer globally unseen, but they have **not** been used for target-2024 validation, error analysis, alpha fitting, or model selection.

## 4. Exact target-2025 blocker

Current disposition:

`TARGET2025_DENOMINATOR_RECONSTRUCTION_NOT_READY`

Frozen decision evidence:

- [Readiness report](https://github.com/Prometheus-Frameworks/TIBER-Forecast/blob/481edb647c0d5b5b18b6a8551475613066da4371/docs/reports/evidence/year1-week2-bootstrap-2026-09-22/target-2025-denominator-reconstruction-readiness.md): SHA-256 `023536554ad5d81185123b7f8032cc0b830ce84f92c637f4dad8dcc86ff9c55a`
- [Decision JSON](https://github.com/Prometheus-Frameworks/TIBER-Forecast/blob/481edb647c0d5b5b18b6a8551475613066da4371/docs/reports/evidence/year1-week2-bootstrap-2026-09-22/decision.json): SHA-256 `9a9f50934f13ec433083357edc320afc893196623e236f5164a3cda0b34cfe99`
- [Input/evidence manifest](https://github.com/Prometheus-Frameworks/TIBER-Forecast/blob/481edb647c0d5b5b18b6a8551475613066da4371/docs/reports/evidence/year1-week2-bootstrap-2026-09-22/input-evidence-manifest.json): SHA-256 `141df5d8b2c81a70c184eb819600cc8f86e4ef06ad9d65dab167e62b8b3682e4`

All four links above target the evidence-preservation commit `481edb647c0d5b5b18b6a8551475613066da4371`, not a moving branch. These retained bytes are retrieval evidence only; their placement in Forecast grants no source admission, model-run authority, denominator selection or new consumer use.

The blocking identity exposed a historical source-state change:

- June committed TIBER artifact/code evidence: REG games = 10; weekly-derived surviving weeks = 10.
- Later retained/reviewed evidence: REG games = 11; weekly source = 11 distinct REG games/weeks.
- The later 11 weekly records satisfy the structural source-record membership rule, including supported explicit-zero records.
- Independent review confirmed the changed later source state.
- The earlier June artifact is historical comparison evidence; it does not itself force denominator 10.
- Neither 10 nor 11 has been selected as the Forecast denominator.

The accepted reconstruction contract permits later-retained evidence and unknown publication clocks, but its cutoff rules exclude known post-cutoff corrections and unresolved dependencies on later information. The remaining unresolved question is therefore **revision provenance**: whether the later membership change reflects recovery/correction of information already supportable before the relevant cutoff, or depends on post-cutoff/later information.

A narrowly scoped clarification request has been submitted externally. **No recipient name or contact detail is recorded here.** Await a substantive response before reconsidering this denominator decision. An acknowledgment or routing response is not sufficient.

## 5. Other historical-world gates still separate

Even if the target-2025 denominator question is resolved, that does not by itself establish a complete historical Forecast world. Keep these gates separate:

- game completion/finality evidence;
- cutoff-valid population;
- cutoff-effective team/position/roster context;
- canonical identity mapping;
- reconstruction qualification for other required world fields;
- historical-purpose admission;
- label isolation and event ordering.

Relevant clarification/permission inquiries for completion evidence and historical roster effective-state semantics remain pending. Do not infer permission or source semantics while waiting.

## 6. Restart instructions

When work resumes:

1. **Do not rerun the completed offline implementation, arithmetic, overlap, or source-state archaeology merely to recreate state.**
2. Start from the frozen target-2025 decision above.
3. Check whether a substantive response has arrived to the already-submitted revision-provenance clarification request.
4. If no substantive response exists, keep `TARGET2025_DENOMINATOR_RECONSTRUCTION_NOT_READY` unchanged and do not select 10 or 11.
5. If a substantive response exists, preserve the exact response as evidence and evaluate only what it establishes about pre-cutoff recovery versus post-cutoff/later-information dependence.
6. Reopen target-2025 denominator readiness only through an explicit bounded decision/review step.
7. Only after that gate is clean may target-2025 unscored prior-evidence preparation be considered.
8. P calculation, population construction, alpha fitting, 2024 validation, 2025 final evaluation, live Week-2 execution, admission, and deployment remain separate later authorizations.

## 7. Hard stop boundaries

Until explicitly authorized otherwise:

- no denominator selection for target 2025;
- no target-2025 P calculation;
- no target-2024 validation evaluation;
- no alpha fitting or model selection;
- no final 2025 evaluation;
- no live 2026 Week-2 Forecast;
- no source/purpose admission;
- no consumer activation or deployment.

The intended restart point is the **pending revision-provenance clarification**, not another implementation or data-recovery loop.
