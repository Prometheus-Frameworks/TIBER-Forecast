# Forecast Tracker GPTsite — operator specification

Status: **presentation / comprehension layer only**. GitHub and frozen Forecast evidence remain authoritative. The Site must never create admission, merge, deployment, model-run, or football-data authority.

## Goal

Give the operator a phone-first visual answer to three questions:

1. **Where is Forecast right now?**
2. **What is blocking the next meaningful step?**
3. **How far are we from the first governed 2026 Run 1 candidate?**

The tracker should make the Year-1 Week-2 bootstrap understandable without requiring the operator to reconstruct state from Codex transcripts, hashes, or repository archaeology.

## Source of truth

Primary restart record:

- `docs/reports/year1-week2-bootstrap-restart-2026-09-22.md`

The GPTsite is a read-only visual narrative over that record and subsequently reviewed GitHub state. It must label its own last-verified timestamp and source commit/ref.

Never silently infer progress from conversation text. If a gate cannot be verified from GitHub/reviewed evidence, render it as `UNKNOWN` or `STALE`.

## Primary screen: Forecast Run 1

### Header

Display:

- **TIBER Forecast — 2026 Run 1**
- target: **2026 Week 2**
- mode: **offline bootstrap / not live**
- last verified timestamp
- authoritative Forecast ref / restart-document ref
- overall state badge: one of `BUILDING`, `BLOCKED`, `READY_FOR_NEXT_GATE`, `RUN_CANDIDATE_READY`, `UNAVAILABLE`

Never show `LIVE` unless a separately governed live-run contract later authorizes it.

### Gate-based progress bar

The operator wants a progress bar, but it must not invent subjective completion percentages.

Render progress from explicit gates only.

Each gate is one of:

- `CLEARED`
- `IN_PROGRESS`
- `BLOCKED`
- `NOT_STARTED`
- `NOT_APPLICABLE`
- `UNKNOWN`

Show:

`cleared required gates / total required gates`

A visual percentage may be derived only as:

`CLEARED / REQUIRED_GATES * 100`

Label it **gate completion**, not probability, time remaining, confidence, or model quality.

A blocked gate counts as not cleared. Do not award partial credit.

### Run-1 gate registry

Use this initial registry. The Site may update statuses only from reviewed evidence.

1. **Offline bootstrap implementation**
   - current: `CLEARED`
   - accepted snapshot: `dd884ce6b72801451984d9f99a7e9062e1b706d50c32252b7b227b3de6cae0d4`
   - independent implementation review clean

2. **Target-2022 candidate arithmetic**
   - current: `CLEARED`
   - P: 633 source identities
   - W: 341 source identities
   - overlap diagnostic: 299
   - arithmetic candidates remain unadmitted

3. **Target-2023 candidate arithmetic**
   - current: `CLEARED`
   - P: 608
   - W: 339
   - overlap: 288
   - unadmitted

4. **Target-2024 candidate arithmetic**
   - current: `CLEARED`
   - P: 577
   - W: 339
   - overlap: 291
   - unadmitted

5. **Target-2025 prior denominator reconstruction**
   - current: `BLOCKED`
   - disposition: `TARGET2025_DENOMINATOR_RECONSTRUCTION_NOT_READY`
   - blocker: revision provenance for known 10/10 -> later 11/11 source-state change
   - no denominator selected

6. **Target-2025 P candidate**
   - current: `NOT_STARTED`
   - depends on gate 5

7. **Target-2025 W candidate**
   - current: `NOT_STARTED`

8. **Historical completion/finality evidence**
   - current: `BLOCKED`
   - external clarification/permission path pending
   - keep distinct from denominator reconstruction

9. **Historical cutoff population / roster-effective-state evidence**
   - current: `BLOCKED`
   - clarification pending
   - do not infer cutoff validity from current roster data

10. **Canonical mapping / position-context readiness**
    - current: `NOT_STARTED` unless a newer reviewed record explicitly changes it
    - show partial evidence separately; do not upgrade the gate by inference

11. **Qualified historical input worlds + purpose admission**
    - current: `NOT_STARTED`

12. **Fit alpha on target 2022–2023 training worlds**
    - current: `NOT_STARTED`

13. **Validate / select on target 2024**
    - current: `NOT_STARTED`
    - 2024 Week-2 raw-stat exposure for target-2025 prior work must be visibly noted; no validation evaluation has occurred

14. **Seal selected rule after validation**
    - current: `NOT_STARTED`

15. **Evaluate sealed rule on target 2025**
    - current: `NOT_STARTED`

16. **Prepare/admit 2026 Week-1 world for target Week 2**
    - current: `NOT_STARTED`

17. **Generate first governed 2026 Run-1 candidate**
    - current: `NOT_STARTED`
    - this is the progress-bar destination
    - do not equate candidate generation with publication, consumer activation, or advice

Initial gate completion is therefore derived mechanically from the verified registry, not manually typed as a percentage.

## Pipeline visualization

Render a horizontal/vertical flow suitable for phone screens:

`Historical evidence`
→ `P / W candidate arithmetic`
→ `qualified historical worlds`
→ `train alpha (2022–23)`
→ `validate 2024`
→ `seal rule`
→ `evaluate 2025`
→ `admit 2026 Week 1`
→ `2026 Week 2 Run-1 candidate`

Color/state treatment should be semantic but accessible:

- cleared: check
- current work: pulse/outline
- blocked: stop marker
- not started: muted
- unavailable/unknown: explicit question mark

Do not imply that later gates are partially complete merely because code exists.

## Current blocker card

The most prominent card should explain the current blocker in plain language.

Title:

**Target 2025 prior denominator — revision provenance**

Show:

- June retained state: `10 / 10`
- later independently reviewed state: `11 / 11`
- structural status: all 11 later weekly records satisfy the reported source-record membership rule
- unresolved question: whether the later membership reflects pre-cutoff information recovered later or a post-cutoff/later-information correction
- current decision: `TARGET2025_DENOMINATOR_RECONSTRUCTION_NOT_READY`
- action: **await substantive clarification / inspect authoritative public provenance if available**
- explicit: **neither 10 nor 11 selected**

Do not show the identity/name/contact information of any external clarification recipient.

## Season cards

Provide four compact cards:

### 2022 — TRAIN
P 633 · W 341 · overlap 299
Status: arithmetic clean / population not admitted

### 2023 — TRAIN
P 608 · W 339 · overlap 288
Status: arithmetic clean / population not admitted

### 2024 — VALIDATE
P 577 · W 339 · overlap 291
Status: arithmetic clean / validation not run

### 2025 — FINAL TEST
P blocked · W not started
Status: denominator reconstruction blocked

A tooltip/info sheet must explain:

`overlap != accepted population`

## Model explainer card

Show the bounded v0 model:

`C0 = P`

`C1 = W` (diagnostic)

`C2 = P + alpha(W - P)`

Then plain-language definitions:

- `P`: prior-season generic fantasy points per recorded game
- `W`: Week-1 generic fantasy points
- `alpha`: weight learned from historical training
- `Y`: actual Week-2 result used only in the appropriate evaluation channel

Make this a teaching surface, not a calculator that invents live forecasts.

## “What happens next?” panel

Always show exactly one primary next pickup point derived from the current authoritative state.

Current next pickup:

**Revision-provenance feasibility / clarification for the target-2025 denominator.**

If authoritative public provenance resolves it, the next governed action is a bounded denominator-readiness reconsideration.

If it remains unresolved, the tracker should say `WAITING_ON_EVIDENCE`, not invent a workaround.

Also show independent parallel work that does not cross the blocker, such as synthetic conformance coverage or documentation, under **Safe parallel work**. Do not confuse that with the primary run path.

## Evidence drawer

Every gate/card should be expandable to show:

- disposition name
- repository/ref
- reviewed artifact/report hashes where available
- independent-review status
- last verified timestamp
- limitations

Keep hashes out of the default visual path; make them available on demand.

## Timeline / change log

Show a short chronological list of meaningful state transitions, not every Codex action.

Examples:

- offline implementation independently reviewed clean
- target-2022 P/W arithmetic prepared
- target-2023 P/W arithmetic prepared
- target-2024 P/W arithmetic prepared
- 2024 source-state discrepancy discovered
- June 10/10 versus later 11/11 changed state independently reviewed
- target-2025 denominator reconstruction held not ready
- clarification/provenance path opened

No external recipient identity.

## Phone-first interaction

Optimize for iPhone portrait:

- first screen should answer status/progress/blocker without scrolling deeply
- tap a gate to expand evidence
- sticky **Next pickup** control
- no dense tables as the primary representation
- use cards, pipeline nodes, short labels, and expandable detail
- dark/light mode safe
- readable at normal mobile text size

## Authority and safety boundaries

The GPTsite is presentation only.

It must NOT:

- merge or approve PRs
- run Forecast
- acquire football data
- admit sources or purposes
- select 10 versus 11
- mark a gate cleared from an unreviewed Codex author report when independent review is required
- infer email replies or permissions
- expose recipient names/contact details
- present model output as start/sit/trade advice
- change GitHub authoritative state

When Site state and GitHub/reviewed evidence disagree, show **STALE / VERIFY SOURCE**, never silently reconcile.

## Update contract

Codex should make the tracker easy to refresh from a small structured state object rather than hard-coded UI prose.

Preferred shape:

```ts
type GateState =
  | "CLEARED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "NOT_STARTED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

type ForecastGate = {
  id: string;
  label: string;
  state: GateState;
  summary: string;
  dependsOn: string[];
  disposition?: string;
  evidenceRefs: string[];
  independentlyReviewed: boolean;
  lastVerifiedAt: string;
};

type ForecastTrackerState = {
  target: "2026_WEEK_2_RUN_1";
  mode: "OFFLINE_BOOTSTRAP";
  authoritativeRef: string;
  gates: ForecastGate[];
  primaryNextPickup: string;
  blockers: string[];
  notes: string[];
};
```

Derived gate completion must be calculated from this state object.

## Acceptance checks

Before calling the tracker complete:

1. Initial rendered state matches the restart document.
2. Gate-completion math is deterministic and tested.
3. Blocked gates cannot visually count as cleared.
4. 2022/2023/2024 arithmetic counts render correctly.
5. 2025 denominator is visibly blocked.
6. Neither 10 nor 11 is presented as selected.
7. No external recipient identity appears.
8. 2024 validation is visibly **not run**.
9. Alpha is visibly **not fitted**.
10. 2026 Run 1 is visibly **not generated**.
11. Evidence details are expandable but not required to understand the first screen.
12. Mobile portrait acceptance is completed.
13. Site contains no action that can mutate authoritative TIBER state.

## Delivery boundary

Build/update the existing private TIBER GPTsite as the visual operator layer if that Site is available to the Codex environment. Preserve its existing useful operator-board conventions rather than creating a competing authority surface.

If direct GPTsite editing is unavailable, produce the complete tracker implementation/spec/state payload in the environment Codex can hand back for Site application. Do not substitute a production TIBER-Fantasy feature without separate authorization.
