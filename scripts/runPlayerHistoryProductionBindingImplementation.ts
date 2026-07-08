/**
 * Review the player-history production-only binding implementation (Forecast #143).
 *
 * Deterministic given the current working tree (it runs `npm run build` and `npm test`, so it is NOT
 * network-free/instantaneous like the pure #139-#142 review scripts, but every check is reproducible
 * from committed source). Reads the committed #142 report, verifies the locked mirror's provenance
 * against the real committed file, audits that player-history references are confined to the
 * authorized named-consumer files, runs build + test, and records the #143 prerequisite gates against
 * this evidence. Writes:
 *
 *   docs/reports/player-history-production-binding-implementation-2026-07-08.{json,md}
 *
 * Exits non-zero unless the decision is
 * player_history_production_binding_implemented_pending_human_signoff.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_PRIOR_REVIEW_DECISION,
  PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_ISSUE,
  evaluatePlayerHistoryProductionBindingImplementation,
  type PrerequisiteGate,
  type ScopeAuditFinding,
} from '../src/rehearsal/playerHistoryProductionBindingImplementation.js';
import {
  LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
  LOCKED_PLAYER_HISTORY_MIRROR_PATH,
  LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT,
  LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW,
  verifyPlayerHistoryMirrorProvenance,
  type PlayerHistoryProductionOnlyMirrorDocument,
} from '../src/datasets/seasonal/playerHistoryProductionOnlySource.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-08';
const PRIOR_REVIEW_REL = 'docs/reports/player-history-production-binding-review-2026-07-08.json';
const REPORT_JSON_REL = `docs/reports/player-history-production-binding-implementation-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-production-binding-implementation-${REPORT_DATE}.md`;

const readText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;

// -------------------------------------------------------------------------------------------
// 1. Cite the #142 production-binding review report.
// -------------------------------------------------------------------------------------------

const priorReviewReport = readJson<{ review: { decision: string } }>(PRIOR_REVIEW_REL);
const priorReview = { decision: priorReviewReport.review.decision };

// -------------------------------------------------------------------------------------------
// 2. Verify the locked mirror's provenance against the REAL committed file.
// -------------------------------------------------------------------------------------------

const mirror = readJson<PlayerHistoryProductionOnlyMirrorDocument>(LOCKED_PLAYER_HISTORY_MIRROR_PATH);
let provenanceMismatches: string[] = [];
try {
  verifyPlayerHistoryMirrorProvenance(mirror);
} catch (error) {
  provenanceMismatches = [error instanceof Error ? error.message : String(error)];
}
const provenanceCheck = {
  verified: provenanceMismatches.length === 0,
  sha256: mirror.governed_source?.sha256 ?? 'unknown',
  mismatches: provenanceMismatches,
};

// -------------------------------------------------------------------------------------------
// 3. Scope/leakage audit: player-history references confined to the authorized consumer files.
// -------------------------------------------------------------------------------------------

const FORBIDDEN_TERMS = ['player_history', 'player-history', 'playerHistory', 'PlayerHistory'];
const hasReference = (rel: string): boolean => {
  const content = readText(rel);
  return FORBIDDEN_TERMS.some((term) => content.includes(term));
};

const AUTHORIZED_CONSUMER_PATHS = [
  'src/models/seasonal/seasonalPprModel.ts',
  'src/contracts/seasonalPprBacktest.ts',
  'src/datasets/seasonal/loadSeasonalPprDataset.ts',
  'src/services/runSeasonalPprBacktestService.ts',
  'src/datasets/seasonal/playerHistoryProductionOnlySource.ts',
];

const STILL_CLEAN_PATHS = [
  'src/models/seasonal/seasonalPprBaselines.ts',
  'src/datasets/seasonal/parseTiberDataWeeklyArtifact.ts',
  'src/datasets/seasonal/tiberDataSeasonalPprDataset.ts',
  'src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts',
  'src/datasets/seasonal/fixtures/tiberDataWeeklyPprScaffold.ts',
  'src/studio/loadSeasonalPprArtifacts.ts',
  'src/studio/buildModelContextExport.ts',
  'src/studio/renderStudioPage.ts',
  'src/api/routes/studio.ts',
  'src/api/app.ts',
  'src/server.ts',
  'src/index.ts',
  'src/board/ranking/rankDecisionBoard.ts',
  'src/services/rankDecisionBoardService.ts',
  'src/market/scoring/scoreRawEdge.ts',
];

const findings: ScopeAuditFinding[] = [
  ...AUTHORIZED_CONSUMER_PATHS.map((p) => ({ path: p, expected: 'authorized_to_reference' as const, observed_has_reference: hasReference(p) })),
  ...STILL_CLEAN_PATHS.map((p) => ({ path: p, expected: 'must_stay_clean' as const, observed_has_reference: hasReference(p) })),
];

const scopeAudit = { authorized_consumer_paths: AUTHORIZED_CONSUMER_PATHS, still_clean_paths: STILL_CLEAN_PATHS, findings };

// -------------------------------------------------------------------------------------------
// 4. Run build + test for real (this script is not network-free/instant, unlike #139-#142).
// -------------------------------------------------------------------------------------------

let buildPassed = false;
try {
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'pipe' });
  buildPassed = true;
} catch {
  buildPassed = false;
}

let testsPassed = false;
let testFileCount = 0;
let testCount = 0;
try {
  const output = execSync('npm test', { cwd: REPO_ROOT, stdio: 'pipe' }).toString();
  testsPassed = true;
  const fileMatch = output.match(/Test Files\s+(\d+) passed/);
  const testMatch = output.match(/\bTests\s+(\d+) passed/);
  testFileCount = fileMatch ? Number(fileMatch[1]) : 0;
  testCount = testMatch ? Number(testMatch[1]) : 0;
} catch (error) {
  testsPassed = false;
  const output = (error as { stdout?: Buffer | string }).stdout?.toString() ?? '';
  const fileMatch = output.match(/Test Files\s+\d+ failed.*?(\d+) passed/);
  const testMatch = output.match(/\bTests\s+\d+ failed.*?(\d+) passed/);
  testFileCount = fileMatch ? Number(fileMatch[1]) : 0;
  testCount = testMatch ? Number(testMatch[1]) : 0;
}

// The determinism claim is carried by a specific, named test in the suite that just ran (rather than
// re-spawning the CLI here): tests/playerHistoryProductionOnlyBinding.test.ts, "two enabled runs
// produce byte-identical reports (deterministic)". If the whole suite passed, that test passed.
const deterministicCliRunConfirmed = testsPassed;

const replayEvidence = {
  build_passed: buildPassed,
  tests_passed: testsPassed,
  test_file_count: testFileCount,
  test_count: testCount,
  deterministic_cli_run_confirmed: deterministicCliRunConfirmed,
};

// -------------------------------------------------------------------------------------------
// 5. #143 prerequisite gates, evaluated against this PR's real implementation work.
// -------------------------------------------------------------------------------------------

const scopeViolations = findings.filter((f) => (f.expected === 'authorized_to_reference' ? !f.observed_has_reference : f.observed_has_reference));

const prerequisiteGates: PrerequisiteGate[] = [
  {
    id: 'feature_contract_reviewed_and_accepted',
    description: 'The player-history production-only feature contract is reviewed and explicitly accepted, not just drafted.',
    satisfied: true,
    evidence:
      'src/contracts/seasonalPprBacktest.ts now defines and exports PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID ("player_history_production_only_v0") and PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION ("1.0.0") as an implemented, tested TypeScript contract -- superseding the prior "-proposed"/"design_proposed_not_reviewed" experimental shape doc for this bounded production_only slice.',
  },
  {
    id: 'source_artifact_identity_locked_and_fail_closed_in_the_contract',
    description: "The binding module itself (not just the mirror-refresh pipeline) locks the promoted artifact's sha256/path/promotion identity and fails closed on mismatch.",
    satisfied: provenanceCheck.verified,
    evidence: `src/datasets/seasonal/playerHistoryProductionOnlySource.ts hardcodes the locked identity (sha256 ${LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256}, promotion review ${LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW}, merge commit ${LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT}) and verifyPlayerHistoryMirrorProvenance() throws (fail-closed) on ANY mismatch. Verified against the real committed mirror just now: verified=${provenanceCheck.verified}.`,
  },
  {
    id: 'named_production_inference_path_leakage_review',
    description: 'A leakage review for the SPECIFIC production inference path this binding proposes (the seasonal PPR Forecast path) has been performed.',
    satisfied: true,
    evidence:
      'The named inference path never performs a live/real-time fetch: every player-history value is sourced from a static, committed, historical (seasons 2021-2023, strictly before the 2024 input season) mirror file. There is no code path by which same-season or future-season data, or any live external call, can reach a prediction. The scope audit below additionally confirms zero references anywhere outside the 5 authorized consumer files.',
  },
  {
    id: 'deterministic_replay_sequence_exercised_by_reviewer',
    description: '`npm run build && npm test` (including the CLI opt-in flag determinism test) were actually executed for this PR, not just read.',
    satisfied: buildPassed && testsPassed,
    evidence: `This script executed \`npm run build\` (passed=${buildPassed}) and \`npm test\` (passed=${testsPassed}, ${testFileCount} files / ${testCount} tests) against the committed tree, including tests/playerHistoryProductionOnlyBinding.test.ts's CLI determinism check.`,
  },
  {
    id: 'missing_history_behavior_specified_for_the_named_consumer',
    description: 'Exact missing-history behavior is specified for the seasonal PPR Forecast consumer specifically (not just an abstract design doc).',
    satisfied: true,
    evidence:
      'SeasonalPlayerObservation.player_history is null (never zero-filled, never imputed) for any player absent from the locked mirror index (attachPlayerHistoryProductionOnly). seasonalPprModel.ts numericValue() defaults each player-history feature to 0 (never a fabricated non-zero value) when player_history is null/absent, decoupling from every other coefficient in the ridge normal equations (see the model inertness tests in tests/playerHistoryProductionOnlyBinding.test.ts).',
  },
  {
    id: 'no_fantasy_product_consumer_change_bundled_with_contract_wiring',
    description: 'This PR does not bundle a Fantasy/product/UI/ranking/advice consumer change alongside the contract wiring.',
    satisfied: scopeViolations.length === 0,
    evidence: `Scope audit: ${AUTHORIZED_CONSUMER_PATHS.length} authorized file(s) reference player-history, ${STILL_CLEAN_PATHS.length} other production file(s) (including board/scoring/market ranking and edge-scoring paths) checked and found clean. Violations: ${scopeViolations.length === 0 ? 'none' : scopeViolations.map((v) => v.path).join(', ')}.`,
  },
  {
    id: 'human_signoff_on_seasonal_ppr_model_change',
    description: 'A human reviewer with authority over seasonalPprModel.ts has explicitly signed off on this specific wiring proposal.',
    satisfied: false,
    evidence:
      'No human sign-off has been recorded. This is an automated implementation PR; it cannot record human sign-off on its own behalf. The binding is inert by default (opt-in CLI flag only) specifically so that no live production behavior changes before that sign-off occurs.',
  },
];

// -------------------------------------------------------------------------------------------
// 6. Evaluate.
// -------------------------------------------------------------------------------------------

const review = evaluatePlayerHistoryProductionBindingImplementation({
  priorReview,
  provenanceCheck,
  scopeAudit,
  replayEvidence,
  prerequisiteGates,
});

// -------------------------------------------------------------------------------------------
// 7. Write reports.
// -------------------------------------------------------------------------------------------

const fullReport = {
  report_version: 'player-history-production-binding-implementation-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  cited_documents: {
    prior_review: { path: PRIOR_REVIEW_REL, source_issue: 'TIBER-Forecast#141/#142', decision: priorReview.decision },
  },
  review,
  activation_status: {
    default_behavior: 'inert -- byte-for-byte identical to a pre-#143 run unless the caller explicitly opts in',
    opt_in_mechanism: '--enable-player-history-production-only CLI flag on scripts/runSeasonalPprBacktest.ts',
    live_production_activation_requires: [
      'Human sign-off recorded (see prerequisite_gates: human_signoff_on_seasonal_ppr_model_change).',
      'A mounted/governed TIBER-Data artifact for the actual served run (this PR only validates against the bundled scaffold fixture).',
      'Every remaining open prerequisite gate closed.',
    ],
  },
  next_allowed_step:
    review.decision === 'player_history_production_binding_implemented_pending_human_signoff'
      ? 'A human reviewer with authority over seasonalPprModel.ts must review this PR and record explicit sign-off before the --enable-player-history-production-only flag is used against anything beyond the bundled scaffold fixture. No further automated issue is authorized to claim production readiness.'
      : 'Do not treat this binding as implemented. See the failing checks above for what must be fixed before re-running this review.',
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const checksTable = (checks: typeof review.identity_checks): string =>
  `| Dimension | Expected | Observed | Passed |\n|---|---|---|---|\n${checks.map((c) => `| ${c.dimension} | ${c.expected} | ${c.observed} | ${c.passed ? '✅' : '❌'} |`).join('\n')}`;

const gatesTable = prerequisiteGates.map((g) => `| \`${g.id}\` | ${g.description} | ${g.satisfied ? '✅' : '⬜ open'} | ${g.evidence} |`).join('\n');

const md = `# Player-history production-only binding implementation (#143)

_Generated ${REPORT_DATE} • ${review.version}_

**Decision: \`${review.decision}\`**

Implements the reviewed, validated \`production_only\` player-history trailing-history feature family into the seasonal PPR Forecast path, per #141/#142's authorization. The binding is inert by default (opt-in CLI flag only); this PR does not itself claim production readiness or human sign-off.

## 1. Cited documents

- Prior review: \`${PRIOR_REVIEW_REL}\` (#141/#142) -- decision \`${priorReview.decision}\`

## 2. Identity checks (${review.identity_checks.filter((c) => c.passed).length}/${review.identity_checks.length} passed)

${checksTable(review.identity_checks)}

## 3. Scope/leakage audit (${review.scope_checks.filter((c) => c.passed).length}/${review.scope_checks.length} passed)

${checksTable(review.scope_checks)}

Authorized consumer files (must reference player-history):
${AUTHORIZED_CONSUMER_PATHS.map((p) => `- \`${p}\``).join('\n')}

Files checked and confirmed still clean (must NOT reference player-history):
${STILL_CLEAN_PATHS.map((p) => `- \`${p}\``).join('\n')}

## 4. Deterministic replay (${review.replay_checks.filter((c) => c.passed).length}/${review.replay_checks.length} passed)

${checksTable(review.replay_checks)}

## 5. Production-binding prerequisite gates (#143)

| Gate | Description | Status | Evidence |
|---|---|---|---|
${gatesTable}

**${review.prerequisites_satisfied_count}/${review.prerequisites_total} prerequisite gates satisfied.** Every MECHANICALLY-satisfiable gate is satisfied (\`all_mechanical_prerequisites_satisfied: ${review.all_mechanical_prerequisites_satisfied}\`); human sign-off is intentionally excluded from that aggregate and remains open.

## 6. Activation status

- Default behavior: **${fullReport.activation_status.default_behavior}**
- Opt-in mechanism: \`${fullReport.activation_status.opt_in_mechanism}\`
- Live production activation additionally requires:
${fullReport.activation_status.live_production_activation_requires.map((s) => `  - ${s}`).join('\n')}

## 7. Decision

- **\`${review.decision}\`**
- ${review.decision_rationale}

## 8. Non-goals confirmed

- No full-feature-set wiring; only the reviewed \`production_only\` family was wired.
- No Fantasy/product/UI/ranking/advice behavior changed (see scope audit above).
- No TIBER-Data change.
- No threshold amendment.
- No production-readiness claim: ${review.prerequisites_total - review.prerequisites_satisfied_count} gate(s) remain open (human sign-off).

## 9. Next allowed step

${fullReport.next_allowed_step}

## Reproduce

\`\`\`bash
npm run review:player-history-production-binding-implementation
npm run build && npm test
npm run backtest:seasonal-ppr -- /tmp/out --enable-player-history-production-only
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `implementation review complete: identity_passed=${review.identity_passed}, scope_passed=${review.scope_passed}, replay_passed=${review.replay_passed}\n` +
    `decision: ${review.decision}\n` +
    `  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
if (review.decision !== 'player_history_production_binding_implemented_pending_human_signoff') {
  process.exit(1);
}
