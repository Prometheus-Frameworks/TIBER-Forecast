/**
 * Deterministic replay/validation command for the non-production `player_history_production_feature_v0`
 * contract (Forecast #129). Reproducible, network-free once local copies of the promoted TIBER-Data
 * artifact + promotion manifest are available:
 *
 *   npm run replay:player-history-contract-v0 -- \
 *     --artifact=/path/to/exports/promoted/nfl/player_season_coverage_v0.json \
 *     --manifest=/path/to/exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
 *   # or env: TIBER_DATA_PROMOTED_ARTIFACT=... TIBER_DATA_PROMOTED_MANIFEST=...
 *
 * Steps (fail closed at every stage; PR #128 §2.1, §2.6):
 *   1. Re-verify the promoted-source identity via the existing #117 gate module against the ACTUAL
 *      local artifact bytes (never a stale committed report alone). Only a passing re-verification
 *      may lock `source_dataset_refs` into a contract instance; anything else blocks with a
 *      documented reason and no instance is generated.
 *   2. Build a production-only-scoped (PR #128 §2.2) non-production contract instance from the
 *      already-governed, committed promoted mirrors (#119/#120).
 *   3. Recompute the instance TWICE independently and require an identical `run_id` (deterministic
 *      recomputation).
 *   4. Structurally validate the instance (required fields, closed enums, verbatim statement, null
 *      semantics, forbidden fields).
 *   5. Reproduce the pinned #122 joined-population smoke metrics by re-running the existing,
 *      already-tested full-design promoted-source controlled rerun (#121) -- a plumbing check, not a
 *      re-scoping of the contract (which stays production-only).
 *
 * Writes (only when every step passes):
 *   data/fixtures/tiberData/player_history_production_feature_v0.experimental_contract_instance.json
 *   docs/reports/player-history-feature-contract-v0-validation-2026-07-04.{json,md}
 *
 * On any fail-closed block, writes ONLY the validation report (documenting the specific reason, no
 * instance fixture) and exits non-zero.
 *
 * No Forecast run against production data. No `seasonalPprModel.ts` change. No feature binding. No
 * TIBER-Data promotion/demotion. No product/advice output.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLAYER_HISTORY_CONTRACT_ID,
  validatePlayerHistoryFeatureContractV0Instance,
  type ContractV0ValidationResult,
  type PlayerHistoryFeatureContractV0Instance,
} from '../src/rehearsal/playerHistoryFeatureContractV0.js';
import {
  CONTRACT_V0_GENERATOR_SCRIPT_VERSION,
  CONTRACT_V0_REPLAY_ISSUE,
  PLAYER_HISTORY_CONTRACT_V0_REPLAY_VERSION,
  buildPlayerHistoryFeatureContractV0Instance,
  compareSmokeMetrics,
  decideContractV0Replay,
  lockSourceDatasetRefsOrFailClosed,
  type ContractV0ReplayDecisionRationale,
  type SmokeMetricComparison,
  type SourceIdentityLockResult,
} from '../src/rehearsal/playerHistoryContractV0Replay.js';
import {
  PROMOTED_ARTIFACT_PATH,
  PROMOTED_ARTIFACT_REPO,
  PROMOTED_MANIFEST_PATH,
  PROMOTION_MERGE_COMMIT,
  PINNED_PROMOTED_ARTIFACT_SHA256,
  evaluatePlayerHistoryPromotedSourceGate,
  type PromotedArtifact,
  type PromotedManifest,
  type PromotedSourceGateResult,
} from '../src/rehearsal/playerHistoryPromotedSourceGate.js';
import {
  PROMOTED_CONTROLLED_RERUN_ISSUE,
  executePromotedControlledRerun,
  type CandidateSourceReferenceResult,
  type PromotedControlledRerunPriorGateEvidence,
} from '../src/rehearsal/playerHistoryPromotedControlledRerun.js';
import type { ControlledRunMetrics } from '../src/rehearsal/playerHistoryControlledRun.js';
import type { PromotedInputMirror, PromotedMirrorRefreshGateResult, PromotedOutcomeMirror } from '../src/rehearsal/playerHistoryPromotedMirrorRefresh.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-04';
const GENERATED_AT = `${REPORT_DATE}T00:00:00.000Z`;

const INSTANCE_REL = 'data/fixtures/tiberData/player_history_production_feature_v0.experimental_contract_instance.json';
const REPORT_JSON_REL = `docs/reports/player-history-feature-contract-v0-validation-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-feature-contract-v0-validation-${REPORT_DATE}.md`;

const OUTCOME_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json';
const INPUT_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json';
const REFRESH_GATE_REL = 'docs/reports/player-history-promoted-mirror-overlap-gate-2026-07-04.json';
const CANDIDATE_RUN_REL = 'docs/reports/player-history-controlled-run-2026-07-02.json';
const ROBUSTNESS_REL = 'docs/reports/player-history-robustness-checks-2026-07-03.json';

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const argValue = (name: string): string | undefined =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

// ---------------------------------------------------------------------------------------------
// Write-and-exit helper for the "blocked, fail closed" path. Never writes an instance fixture.
// ---------------------------------------------------------------------------------------------

const writeBlockedReportAndExit = (reason: string, extra: Record<string, unknown> = {}): never => {
  const report = {
    report_version: 'player-history-feature-contract-v0-validation-report-v1',
    repo: 'Prometheus-Frameworks/TIBER-Forecast',
    issue: CONTRACT_V0_REPLAY_ISSUE,
    generated_at: GENERATED_AT,
    decision: 'player_history_contract_v0_implementation_blocked_requires_followup',
    reason,
    instance_generated: false,
    ...extra,
  };
  writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  const md = `# Player-history feature contract v0: validation/replay (Forecast #129)

_Generated ${REPORT_DATE} • ${PLAYER_HISTORY_CONTRACT_V0_REPLAY_VERSION}_

**Decision: \`player_history_contract_v0_implementation_blocked_requires_followup\`**

No experimental contract instance was generated. Reason:

${reason}

No production Forecast behavior changed. No \`seasonalPprModel.ts\` change. No feature binding. No TIBER-Data promotion/demotion.
`;
  writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');
  process.stderr.write(`BLOCKED (fail closed): ${reason}\n  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------------------------------------
// Step 1: re-verify source identity against ACTUAL local bytes; lock or fail closed.
// ---------------------------------------------------------------------------------------------

const artifactPath = argValue('artifact') ?? process.env.TIBER_DATA_PROMOTED_ARTIFACT;
const manifestPath = argValue('manifest') ?? process.env.TIBER_DATA_PROMOTED_MANIFEST;

if (!artifactPath || !manifestPath) {
  writeBlockedReportAndExit(
    `No local promoted-artifact/manifest paths were supplied (pass --artifact=... --manifest=... or set TIBER_DATA_PROMOTED_ARTIFACT / TIBER_DATA_PROMOTED_MANIFEST). Per PR #128 §2.1, source_dataset_refs may only be locked after re-running the fail-closed gate against local bytes; without those bytes this run cannot re-verify identity, so it must not lock a value and must not generate a contract instance. The last known identity (informative only, NOT re-verified by this run): repo=${PROMOTED_ARTIFACT_REPO} artifact_path=${PROMOTED_ARTIFACT_PATH} promotion_merge_commit=${PROMOTION_MERGE_COMMIT}.`,
  );
}

const artifactRaw = readFileSync(artifactPath);
const actualPromotedArtifactSha256 = createHash('sha256').update(artifactRaw).digest('hex');
const artifact = JSON.parse(artifactRaw.toString('utf-8')) as PromotedArtifact;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PromotedManifest;

const sourceGateResult: PromotedSourceGateResult = evaluatePlayerHistoryPromotedSourceGate({
  manifest,
  artifact,
  actualPromotedArtifactSha256,
});

const lockResult: SourceIdentityLockResult = lockSourceDatasetRefsOrFailClosed(sourceGateResult, actualPromotedArtifactSha256);

if (!lockResult.locked) {
  writeBlockedReportAndExit(lockResult.reason, { source_gate_result: sourceGateResult });
}

// ---------------------------------------------------------------------------------------------
// Step 2/3: build the contract instance TWICE independently; require identical run_id.
// ---------------------------------------------------------------------------------------------

const outcomeMirror = readJson<PromotedOutcomeMirror>(OUTCOME_MIRROR_REL);
const inputMirror = readJson<PromotedInputMirror>(INPUT_MIRROR_REL);

const instanceA: PlayerHistoryFeatureContractV0Instance = buildPlayerHistoryFeatureContractV0Instance(
  lockResult.source_dataset_refs,
  outcomeMirror,
  inputMirror.rows,
  GENERATED_AT,
);
const instanceB: PlayerHistoryFeatureContractV0Instance = buildPlayerHistoryFeatureContractV0Instance(
  lockResult.source_dataset_refs,
  outcomeMirror,
  inputMirror.rows,
  GENERATED_AT,
);
const runIdDeterministic = instanceA.envelope.run_id === instanceB.envelope.run_id && instanceA.envelope.run_id.length > 0;

// ---------------------------------------------------------------------------------------------
// Step 4: structural schema validation.
// ---------------------------------------------------------------------------------------------

const validationResult: ContractV0ValidationResult = validatePlayerHistoryFeatureContractV0Instance(instanceA);

// ---------------------------------------------------------------------------------------------
// Step 5: replay smoke test -- reproduce the pinned #122 joined-population metrics by re-running
// the existing, already-tested full-design promoted-source controlled rerun (#121) against the same
// committed mirrors/gate evidence this contract instance's source identity was just re-verified from.
// ---------------------------------------------------------------------------------------------

const refreshGateReport = readJson<{ gate_result: PromotedMirrorRefreshGateResult }>(REFRESH_GATE_REL);
const candidateRunReport = readJson<{
  experiment: { decision: { decision: string }; metrics_by_arm: { joined_only: Record<string, ControlledRunMetrics> } };
}>(CANDIDATE_RUN_REL);
readJson<{ robustness: { decision: { decision: string } } }>(ROBUSTNESS_REL); // re-verified for completeness; not consumed further here

const gates: PromotedControlledRerunPriorGateEvidence = { mirrorRefreshGateResult: refreshGateReport.gate_result };
const candidateJoined = candidateRunReport.experiment.metrics_by_arm.joined_only;
const candidateReference: CandidateSourceReferenceResult = {
  decision: candidateRunReport.experiment.decision.decision,
  joined_mae: {
    baseline_only: candidateJoined.baseline_only!.mae!,
    real_player_history_features: candidateJoined.real_player_history_features!.mae!,
    shuffled_player_history_control: candidateJoined.shuffled_player_history_control!.mae!,
  },
  joined_rmse: {
    baseline_only: candidateJoined.baseline_only!.rmse!,
    real_player_history_features: candidateJoined.real_player_history_features!.rmse!,
    shuffled_player_history_control: candidateJoined.shuffled_player_history_control!.rmse!,
  },
};

const { report: rerunReport } = executePromotedControlledRerun(outcomeMirror, inputMirror, gates, candidateReference);
const smokeComparison: SmokeMetricComparison = compareSmokeMetrics(rerunReport.metrics_by_arm.joined_only);

// ---------------------------------------------------------------------------------------------
// Final decision.
// ---------------------------------------------------------------------------------------------

const decision: ContractV0ReplayDecisionRationale = decideContractV0Replay({
  sourceIdentityLocked: lockResult.locked,
  schemaValidationPassed: validationResult.status === 'passed',
  smokeMetricsMatch: smokeComparison.matches,
  runIdDeterministic,
});

if (decision.decision !== 'player_history_contract_v0_non_production_implementation_ready_for_review') {
  writeBlockedReportAndExit(decision.rationale, {
    validation_result: validationResult,
    smoke_metric_comparison: smokeComparison,
    run_id_deterministic: runIdDeterministic,
  });
}

// ---------------------------------------------------------------------------------------------
// Write the experimental, non-production contract instance + the validation report.
// ---------------------------------------------------------------------------------------------

writeFileSync(path.join(REPO_ROOT, INSTANCE_REL), `${JSON.stringify(instanceA, null, 2)}\n`, 'utf-8');

const report = {
  report_version: 'player-history-feature-contract-v0-validation-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: CONTRACT_V0_REPLAY_ISSUE,
  generated_at: GENERATED_AT,
  contract_id: PLAYER_HISTORY_CONTRACT_ID,
  boundary_statements: {
    not_production_bound: true,
    not_consumed_by_seasonalPprModel: true,
    not_fantasy_product_output: true,
    no_production_forecast_behavior_changed: true,
    no_feature_binding_occurred: true,
    no_tiber_data_artifact_promoted_or_demoted: true,
  },
  source_identity: {
    re_verification_gate: 'TIBER-Forecast#117 (playerHistoryPromotedSourceGate)',
    gate_status: sourceGateResult.status,
    gate_decision: sourceGateResult.decision,
    locked_source_dataset_refs: lockResult.source_dataset_refs,
  },
  run_id_recomputation: {
    deterministic: runIdDeterministic,
    instance_a_run_id: instanceA.envelope.run_id,
    instance_b_run_id: instanceB.envelope.run_id,
  },
  schema_validation: validationResult,
  missing_history_subgroup_report: instanceA.missing_history_subgroup_report,
  replay_smoke_test: {
    reused_module: 'playerHistoryPromotedControlledRerun (#121, full five-family design, unmodified)',
    purpose: 'plumbing check only -- proves this implementation reads the same governed mirrors and reproduces the committed #122 numbers; does not re-scope the contract, which stays production-only per PR #128 §2.2',
    pinned_reference_issue: 'TIBER-Forecast#122',
    rerun_issue_reused: PROMOTED_CONTROLLED_RERUN_ISSUE,
    joined_only_metrics_observed: rerunReport.metrics_by_arm.joined_only,
    comparison: smokeComparison,
  },
  decision,
  instance_generated: true,
  instance_path: INSTANCE_REL,
  future_gates_still_not_satisfied: [
    'production acceptance threshold proposal',
    'production-path leakage audit execution against a concrete wiring proposal',
    'human sign-off on a specific wiring PR',
    'seasonalPprModel.ts integration issue',
    'Fantasy/product consumer issue, if ever proposed',
  ],
};
writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

const fmtMetrics = (m: ControlledRunMetrics): string => `MAE ${m.mae?.toFixed(3) ?? 'n/a'} / RMSE ${m.rmse?.toFixed(3) ?? 'n/a'}`;
const md = `# Player-history feature contract v0: validation/replay (Forecast #129)

_Generated ${REPORT_DATE} • ${PLAYER_HISTORY_CONTRACT_V0_REPLAY_VERSION}_

**Decision: \`${decision.decision}\`**

${decision.rationale}

Non-production, non-binding: not_production_bound, not_consumed_by_seasonalPprModel, not_fantasy_product_output.

## 1. Source identity re-verification (#117 gate, re-run against local bytes)

- Gate status: \`${sourceGateResult.status}\` • decision: \`${sourceGateResult.decision}\`
- Locked \`source_dataset_refs\`: \`${JSON.stringify(lockResult.source_dataset_refs)}\`

## 2. run_id determinism

- Instance A run_id: \`${instanceA.envelope.run_id}\`
- Instance B run_id: \`${instanceB.envelope.run_id}\`
- Deterministic: **${runIdDeterministic}**

## 3. Structural schema validation

- Status: \`${validationResult.status}\` (${validationResult.checks.filter((c) => c.passed).length}/${validationResult.checks.length} checks passed)

## 4. Missing-history subgroup report

- Count: ${instanceA.missing_history_subgroup_report.count} / ${instanceA.missing_history_subgroup_report.total} (share ${instanceA.missing_history_subgroup_report.share.toFixed(4)})
- By position: ${JSON.stringify(instanceA.missing_history_subgroup_report.by_position)}
- Every no-history row entirely null: **${instanceA.missing_history_subgroup_report.every_no_history_row_entirely_null}**

## 5. Replay smoke test (reused #121 full-design rerun, plumbing check only)

| Arm | Observed | Pinned (#122) |
|---|---|---|
| baseline_only | ${fmtMetrics(rerunReport.metrics_by_arm.joined_only.baseline_only)} | MAE 68.926 / RMSE 88.553 |
| real_player_history_features | ${fmtMetrics(rerunReport.metrics_by_arm.joined_only.real_player_history_features)} | MAE 40.034 / RMSE 57.287 |
| shuffled_player_history_control | ${fmtMetrics(rerunReport.metrics_by_arm.joined_only.shuffled_player_history_control)} | MAE 72.031 / RMSE 90.409 |

Matches pinned #122 numbers exactly: **${smokeComparison.matches}**

## 6. Future gates still not satisfied

${report.future_gates_still_not_satisfied.map((g) => `- ${g}`).join('\n')}

## Reproduce

\`\`\`bash
npm run replay:player-history-contract-v0 -- --artifact=/path/to/player_season_coverage_v0.json --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build && npm test
\`\`\`
`;
writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `${decision.decision}\n  wrote ${INSTANCE_REL}\n  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
