/**
 * Review player-history production-binding prerequisites (Forecast #141).
 *
 * Deterministic and network-free: reads the committed #140 threshold-review report --
 *
 *   docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.json
 *
 * -- confirms its decision and boundary statements, scans the current committed production Forecast
 * source files for any player-history reference (a leakage audit proving this review did not wire
 * anything), records the exact production wiring points and artifact/mirror/report inputs a future
 * implementation issue would need, and records the outstanding production-binding-prerequisite gates
 * from `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md` section 6
 * against current, evidence-cited repo state. Writes:
 *
 *   docs/reports/player-history-production-binding-review-2026-07-08.{json,md}
 *
 * Exits non-zero unless the decision is may_open_player_history_production_binding_implementation_issue.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_ISSUE,
  evaluatePlayerHistoryProductionBindingReview,
  type LeakageAuditFinding,
  type PrerequisiteGate,
  type PriorReviewEvidence,
  type ProductionWiringPoint,
  type RequiredArtifactInput,
} from '../src/rehearsal/playerHistoryProductionBindingReview.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-08';
const PRIOR_REVIEW_REL = 'docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.json';
const REPORT_JSON_REL = `docs/reports/player-history-production-binding-review-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-production-binding-review-${REPORT_DATE}.md`;

const readText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;

// -------------------------------------------------------------------------------------------
// 1. Cite the #140 threshold-review report.
// -------------------------------------------------------------------------------------------

const priorReviewReport = readJson<{
  review: {
    decision: string;
    boundary_statements: Record<string, boolean>;
    feature_composition_gate: { bar_cleared: boolean; observed_gap_pct: number; threshold_pct: number } | null;
  };
}>(PRIOR_REVIEW_REL);

const priorReview: PriorReviewEvidence = {
  decision: priorReviewReport.review.decision,
  boundary_statements: priorReviewReport.review.boundary_statements,
  feature_composition_gate: priorReviewReport.review.feature_composition_gate,
};

// -------------------------------------------------------------------------------------------
// 2. Production Forecast paths a future binding issue would touch.
// -------------------------------------------------------------------------------------------

const productionWiringPoints: ProductionWiringPoint[] = [
  {
    path: 'src/models/seasonal/seasonalPprModel.ts',
    role: 'Ridge model design matrix (NUMERIC_FEATURES). A future binding would add player-history feature columns here. Named off-limits for THIS issue by the #141 hard boundary.',
  },
  {
    path: 'src/models/seasonal/seasonalPprBaselines.ts',
    role: 'Baseline comparison models the backtest report evaluates the ridge model against; a production_only-vs-full-feature-set comparison arm would need parallel handling here.',
  },
  {
    path: 'src/contracts/seasonalPprBacktest.ts',
    role: 'Declares SeasonalPlayerObservation. A future binding would add nullable player-history fields here, following the null_missing_history_rules design in the #123 prerequisites doc.',
  },
  {
    path: 'src/datasets/seasonal/loadSeasonalPprDataset.ts',
    role: 'Dataset assembly entrypoint for the seasonal backtest; a future binding would join the player-history mirror/artifact onto the seasonal observation set here.',
  },
  {
    path: 'src/datasets/seasonal/parseTiberDataWeeklyArtifact.ts',
    role: 'Parses the raw TIBER-Data weekly PPR artifact; a future binding would need an analogous parser (or a shared one) for the promoted player-history artifact.',
  },
  {
    path: 'src/datasets/seasonal/tiberDataSeasonalPprDataset.ts',
    role: 'Builds the seasonal PPR dataset from TIBER-Data inputs; the join point where a specific promoted player-history artifact identity would be pinned and fail-closed re-verified.',
  },
  {
    path: 'src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts',
    role: 'Deterministic fixture snapshot used by tests/dev; would need a player-history-augmented fixture variant so tests can cover the augmented feature set without network access.',
  },
  {
    path: 'src/datasets/seasonal/fixtures/tiberDataWeeklyPprScaffold.ts',
    role: 'Bundled scaffold fixture; same fixture-augmentation concern as the seed snapshot above.',
  },
  {
    path: 'src/services/runSeasonalPprBacktestService.ts',
    role: 'Orchestrates train/eval of the seasonal ridge model; the exact call site that would pass an augmented feature set into trainSeasonalRidgeModel.',
  },
  {
    path: 'src/studio/loadSeasonalPprArtifacts.ts',
    role: 'Loads backtest artifacts for PPM Studio; would need to reflect the augmented feature list in whatever it surfaces.',
  },
  {
    path: 'src/studio/buildModelContextExport.ts',
    role: 'Builds the model-context export payload served at /api/studio/seasonal-ppr/export/model-context; would need to disclose player-history feature usage in the export.',
  },
  {
    path: 'src/studio/renderStudioPage.ts',
    role: 'Renders the PPM Studio HTML page -- the closest thing this repo has to a served UI surface for the seasonal model, though it is explicitly not a Fantasy product surface.',
  },
  {
    path: 'src/api/routes/studio.ts',
    role: 'Serves /api/studio/seasonal-ppr/{report,predictions,export/model-context}; the actual network-served production path an inference-time leakage review must cover end-to-end.',
  },
  {
    path: 'src/api/app.ts',
    role: 'Registers and documents the studio routes in the served API surface manifest (route map at app.ts:50-87).',
  },
  {
    path: 'src/server.ts',
    role: 'HTTP server bootstrap that mounts app.ts -- the literal production process entrypoint.',
  },
  {
    path: 'src/index.ts',
    role: 'Public library entrypoint; re-exports may surface the model/contract to library consumers outside the HTTP server.',
  },
];

// -------------------------------------------------------------------------------------------
// 3. Exact artifact/mirror/report inputs a future binding issue would need to pin.
// -------------------------------------------------------------------------------------------

const requiredArtifactInputs: RequiredArtifactInput[] = [
  {
    path: 'exports/promoted/nfl/player_season_coverage_v0.json (TIBER-Data)',
    description:
      'The promoted source artifact, sha256 d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac (TIBER-Data#202/#207, 2021-2025 promotion). A binding proposal must pin this exact sha256 and fail closed on mismatch.',
  },
  {
    path: 'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json (TIBER-Data)',
    description: 'The promotion manifest for the above artifact; must be re-verified alongside the artifact sha256.',
  },
  {
    path: 'data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json',
    description: 'Newest validated Forecast outcome mirror (2024 target, from the 2021-2025 promotion), produced by #135/#136.',
  },
  {
    path: 'data/fixtures/tiberData/player_history_2021_2023_input_mirror.json',
    description: 'Newest validated Forecast input mirror (2021-2023 window, from the 2021-2025 promotion), produced by #135/#136.',
  },
  {
    path: 'data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json',
    description: 'Prior validated outcome mirror (2025-from-2022-2024 window, #119/#120), still valid evidence for the replicated signal.',
  },
  {
    path: 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json',
    description: 'Prior validated input mirror (2022-2024 window, #119/#120), paired with the outcome mirror above.',
  },
  {
    path: 'docs/experiments/player-history-production-binding-prerequisites-2026-07-04.json',
    description: 'The #123 design doc: proposed feature-contract shape (contract_id player_history_production_feature_v0), prerequisites, and validation gates a binding proposal must satisfy.',
  },
  {
    path: 'docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json',
    description: 'The #132 threshold framework: the six quantitative acceptance components, including the uncleared production_only-vs-full-feature-set added-value bar.',
  },
  {
    path: 'docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.json',
    description: 'The #140 threshold-review decision this review (#141) cites as its own prerequisite.',
  },
  {
    path: 'docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.json',
    description: 'The #137/#138 additional-validation metrics underlying the #140 decision.',
  },
];

// -------------------------------------------------------------------------------------------
// 4. Production-path leakage audit: scan the actual committed production files for any
//    player-history reference. This is a REAL scan of REAL file contents, not a design exercise.
// -------------------------------------------------------------------------------------------

const FORBIDDEN_TERMS = ['player_history', 'player-history', 'playerHistory', 'PlayerHistory'];

const scanForLeakage = (relPath: string): LeakageAuditFinding | null => {
  const content = readText(relPath);
  const matched = FORBIDDEN_TERMS.filter((term) => content.includes(term));
  return matched.length > 0 ? { path: relPath, matched_terms: matched } : null;
};

const scannedPaths = productionWiringPoints.map((p) => p.path);
const leakageFindings = scannedPaths.map(scanForLeakage).filter((f): f is LeakageAuditFinding => f !== null);

// -------------------------------------------------------------------------------------------
// 5. Production-binding prerequisite gates (#123 design doc section 6), evaluated honestly
//    against current, evidence-cited repo state. Most remain open -- that is expected and does
//    not block this review's own decision, which only authorizes opening a future issue.
// -------------------------------------------------------------------------------------------

const prerequisites: PrerequisiteGate[] = [
  {
    id: 'feature_contract_reviewed_and_accepted',
    description: 'The proposed feature-contract shape (docs/experiments/player-history-production-binding-prerequisites-2026-07-04.json section 7) has been reviewed and explicitly accepted, not just drafted.',
    satisfied: false,
    evidence:
      'The contract carries provenance_state="experimental_replicated_not_production_bound" and validation_status="design_proposed_not_reviewed" (also see docs/reports/player-history-feature-contract-v0-validation-2026-07-04.json, decision contract_instance_conforms_non_production). No document records explicit contract acceptance.',
  },
  {
    id: 'source_artifact_identity_locked_and_fail_closed',
    description: 'The FEATURE CONTRACT pins its source_dataset_refs.artifact_sha256 to a specific promoted TIBER-Data artifact identity (path + sha256 + promotion review) and fails closed on mismatch.',
    satisfied: false,
    evidence:
      'docs/reports/player-history-2024-from-2021-2023-mirror-refresh-2026-07-07.json shows the MIRROR-REFRESH pipeline pins and fail-closed-verifies a sha256 (promotedArtifactSha256Pinned === promotedArtifactSha256Actual, d45f612b...), but that is evidence for the mirror-refresh process, not the feature contract itself. The proposed contract (docs/experiments/player-history-production-binding-prerequisites-2026-07-04.json section 7) explicitly leaves source_dataset_refs.artifact_sha256 as "<locked at contract-acceptance time>", and contract acceptance (see feature_contract_reviewed_and_accepted above) has not occurred. This gate is not satisfied until the contract itself locks its artifact identity.',
  },
  {
    id: 'production_leakage_review_for_a_named_inference_path',
    description: 'A leakage review broader than the experimental discipline -- covering real-time data availability at inference time and look-ahead in derived features -- has been performed for the SPECIFIC production inference path a binding proposal targets.',
    satisfied: false,
    evidence:
      'This issue performed a static reference-leakage audit (zero player-history references in any current production path) but no production inference path has been proposed yet, so the deeper inference-time leakage review from the #123 design doc prerequisite 4 has nothing concrete to review against.',
  },
  {
    id: 'deterministic_rerun_exercised_by_reviewer',
    description: 'The deterministic replay sequence for the cited evidence (#123 design doc section 8: controlled run, robustness checks, promoted-source gate, mirror refresh, promoted rerun, then build/test) has been exercised end-to-end by the reviewer, not just read.',
    satisfied: false,
    evidence:
      'This review ran only `npm run build` and `npm test` against the already-committed tree (75 test files, 975 tests passing after this review\'s own additions) -- it did NOT rerun the evidence-producing commands themselves (experiment:player-history-controlled-run, experiment:player-history-robustness, gate:player-history-promoted-source, refresh:player-history-promoted-mirrors, experiment:player-history-promoted-controlled-rerun), several of which require a locally available promoted TIBER-Data artifact/manifest not present in this repo checkout. Re-running build/test only confirms the committed reports are internally consistent with current code; it does not confirm the underlying evidence would reproduce from source. This gate remains open for a reviewer with access to the promoted artifact.',
  },
  {
    id: 'real_vs_baseline_vs_shuffled_framing_carried_forward',
    description: 'Any production acceptance criterion is expressed as beating both a baseline and a deterministic shuffled control, not just "beats baseline."',
    satisfied: true,
    evidence: 'Confirmed present in the #140 report component_checks (relative_mae_improvement_over_baseline and _over_shuffled_control, both origins).',
  },
  {
    id: 'missing_history_behavior_specified_for_a_named_consumer',
    description: 'What a production consumer does for a player with no prior-season history is specified for the SPECIFIC production consumer being proposed.',
    satisfied: false,
    evidence:
      'The #123 design doc specifies null_missing_history_rules for the proposed contract shape in the abstract, but no production consumer has been named or proposed yet, so no consumer-specific behavior has been specified.',
  },
  {
    id: 'no_fantasy_consumer_change_bundled_with_contract_wiring',
    description: 'Any future proposing issue/PR must not bundle a Fantasy/product consumer change with contract wiring in the same slice.',
    satisfied: false,
    evidence: 'Not yet applicable: no contract-wiring PR has been proposed. Recorded here as a constraint the future implementation issue must satisfy.',
  },
  {
    id: 'human_sign_off_on_seasonal_ppr_model_change',
    description: 'A human reviewer with authority over seasonalPprModel.ts has explicitly signed off on the specific wiring proposal.',
    satisfied: false,
    evidence: 'No human sign-off has been recorded for any player-history production-binding proposal. This review is an automated review issue, not a human sign-off, and does not substitute for one.',
  },
];

// -------------------------------------------------------------------------------------------
// 6. Evaluate.
// -------------------------------------------------------------------------------------------

const review = evaluatePlayerHistoryProductionBindingReview({
  priorReview,
  productionWiringPoints,
  requiredArtifactInputs,
  leakageAudit: { scanned_paths: scannedPaths, forbidden_terms: FORBIDDEN_TERMS, findings: leakageFindings },
  prerequisites,
});

// -------------------------------------------------------------------------------------------
// 7. Write reports.
// -------------------------------------------------------------------------------------------

const fullReport = {
  report_version: 'player-history-production-binding-review-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  cited_documents: {
    prior_review: { path: PRIOR_REVIEW_REL, source_issue: 'TIBER-Forecast#139/#140', decision: priorReview.decision },
    prerequisites_design_doc: {
      path: 'docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md',
      source_issue: 'TIBER-Forecast#123',
    },
  },
  review,
  human_sign_off_requirements: [
    'A named human reviewer with authority over src/models/seasonal/seasonalPprModel.ts must explicitly sign off, in writing, on the specific wiring proposal before any future implementation PR merges.',
    'This review, and the positive decision it may emit, does not constitute that sign-off and must not be cited as satisfying it.',
    'Every unsatisfied prerequisite gate recorded in this report is a blocker for that future sign-off, not merely a suggestion.',
  ],
  next_allowed_step:
    review.decision === 'may_open_player_history_production_binding_implementation_issue'
      ? 'A SEPARATE issue may be opened to propose a bounded, production_only-scoped player-history production-binding implementation. That issue must close every open prerequisite gate recorded above (see prerequisite_gates), obtain the human sign-off recorded above, and must not bundle a Fantasy/product consumer change with contract wiring.'
      : review.decision === 'player_history_production_binding_review_requires_followup'
        ? 'Do not open a production-binding implementation issue yet. Resolve the leakage-audit finding(s) or complete this review\'s inventories, then re-run this review.'
        : 'Do not rely on this review. See identity_checks for the specific mismatch; the #140 evidence cited is not what this review expects.',
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const wiringTable = productionWiringPoints.map((p) => `| \`${p.path}\` | ${p.role} |`).join('\n');
const artifactTable = requiredArtifactInputs.map((a) => `| \`${a.path}\` | ${a.description} |`).join('\n');
const prereqTable = prerequisites.map((p) => `| \`${p.id}\` | ${p.description} | ${p.satisfied ? '✅' : '⬜ open'} | ${p.evidence} |`).join('\n');

const md = `# Player-history production-binding prerequisites review (#141)

_Generated ${REPORT_DATE} • ${review.version}_

**Decision: \`${review.decision}\`**

Reviews the #139/PR #140 threshold-review decision (\`${priorReview.decision}\`), confirms it authorized only this review issue, confirms \`production_only\` remains the v0 default, locates the exact production Forecast paths a future binding issue would touch, identifies the exact artifact/mirror/report inputs that issue would need to pin, runs a production-path leakage audit, and records human sign-off requirements and outstanding prerequisites. No production behavior was changed by this issue.

## 1. Cited documents

- Prior review: \`${PRIOR_REVIEW_REL}\` (#139/#140) -- decision \`${priorReview.decision}\`
- Prerequisites design doc: \`docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md\` (#123)

## 2. Identity checks against #140 (${review.identity_checks.filter((c) => c.passed).length}/${review.identity_checks.length} passed)

| Dimension | Expected | Observed | Passed |
|---|---|---|---|
${review.identity_checks.map((c) => `| ${c.dimension} | ${c.expected} | ${c.observed} | ${c.passed ? '✅' : '❌'} |`).join('\n')}

## 3. Review-inventory checks (${review.inventory_checks.filter((c) => c.passed).length}/${review.inventory_checks.length} passed)

| Dimension | Expected | Observed | Passed |
|---|---|---|---|
${review.inventory_checks.map((c) => `| ${c.dimension} | ${c.expected} | ${c.observed} | ${c.passed ? '✅' : '❌'} |`).join('\n')}

## 4. Production Forecast wiring points a future binding issue would touch

| Path | Role |
|---|---|
${wiringTable}

## 5. Required artifact/mirror/report inputs a future binding issue would need to pin

| Path | Description |
|---|---|
${artifactTable}

## 6. Production-path leakage audit

- Scanned paths: ${review.leakage_audit_findings.length === 0 ? `${scannedPaths.length} (all clean)` : `${scannedPaths.length}`}
- Forbidden terms: \`${FORBIDDEN_TERMS.join('`, `')}\`
- Findings: ${review.leakage_audit_findings.length === 0 ? '**none** -- no production Forecast path currently references player-history in any form.' : review.leakage_audit_findings.map((f) => `\`${f.path}\`: ${f.matched_terms.join(', ')}`).join('; ')}
- **Leakage audit clean: ${review.leakage_audit_clean}**

## 7. Production-binding prerequisite gates (from the #123 design doc, section 6)

| Gate | Description | Status | Evidence |
|---|---|---|---|
${prereqTable}

**${review.prerequisites_satisfied_count}/${review.prerequisites_total} prerequisite gates currently satisfied.** The remaining gates are recorded as open blockers for a future implementation issue -- this review does not claim they are met, and a positive decision here does not require them all to be met.

## 8. Human sign-off requirements

${fullReport.human_sign_off_requirements.map((s) => `- ${s}`).join('\n')}

## 9. Decision

- **\`${review.decision}\`**
- ${review.decision_rationale}

## 10. Non-goals confirmed

- No production Forecast behavior was changed by this issue.
- \`seasonalPprModel.ts\` was not modified.
- No player-history feature was wired into production.
- \`production_only\` remains the only eligible v0 feature-family scope; full-feature-set production wiring is NOT authorized.
- No product/UI/rankings/advice/Fantasy behavior was authorized.
- No TIBER-Data change.
- No new validation was run.
- No production-readiness claim is made (see prerequisite gates: ${review.prerequisites_total - review.prerequisites_satisfied_count} remain open).
- ${review.decision === 'may_open_player_history_production_binding_implementation_issue' ? 'The positive decision authorizes only a separate future implementation issue; it does not itself decide production readiness or approve any code.' : 'No production-binding implementation issue is authorized by this result as recorded.'}

## Reproduce

\`\`\`bash
npm run review:player-history-production-binding   # deterministic, network-free
npm run build && npm test
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `production-binding review complete: identity_passed=${review.identity_passed}, inventories_passed=${review.inventories_passed}, leakage_audit_clean=${review.leakage_audit_clean}\n` +
    `decision: ${review.decision}\n` +
    `  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
if (review.decision !== 'may_open_player_history_production_binding_implementation_issue') {
  process.exit(1);
}
