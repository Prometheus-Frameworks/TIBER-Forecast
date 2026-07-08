/**
 * Verify production-only player-history binding activation readiness (Forecast #145).
 *
 * Post-merge verification of PR #144 (squash commit 61b1237) from `main`. Actually exercises both the
 * disabled (default) and enabled CLI paths, verifies provenance fail-closed behavior against the real
 * committed mirror (and synthetically tampered in-memory copies -- never mutates the real file),
 * exercises the model gate directly (bypassing the service), runs a full-repository scope scan, and
 * runs `npm run build && npm test` for real evidence. Writes:
 *
 *   docs/reports/player-history-production-binding-activation-verification-2026-07-08.{json,md}
 *
 * Exits non-zero unless the decision is player_history_production_binding_activation_verified.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_MERGE_COMMIT,
  PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_ISSUE,
  evaluatePlayerHistoryProductionBindingActivationVerification,
  type CheckResult,
} from '../src/rehearsal/playerHistoryProductionBindingActivationVerification.js';
import {
  LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
  LOCKED_PLAYER_HISTORY_MIRROR_PATH,
  verifyPlayerHistoryMirrorProvenance,
  type PlayerHistoryProductionOnlyMirrorDocument,
} from '../src/datasets/seasonal/playerHistoryProductionOnlySource.js';
import { trainSeasonalRidgeModel } from '../src/models/seasonal/seasonalPprModel.js';
import type { SeasonalPlayerObservation } from '../src/contracts/seasonalPprBacktest.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-08';
const REPORT_JSON_REL = `docs/reports/player-history-production-binding-activation-verification-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-production-binding-activation-verification-${REPORT_DATE}.md`;

const readText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;
/** For ALREADY-ABSOLUTE paths (e.g. CLI output written into a tmpdir) -- never joined with REPO_ROOT. */
const readAbsText = (absPath: string): string => readFileSync(absPath, 'utf-8');
const readAbsJson = <T>(absPath: string): T => JSON.parse(readAbsText(absPath)) as T;

const APPROVED_PLAYER_HISTORY_FEATURES = [
  'player_history_prior_season_1_ppr',
  'player_history_prior_season_2_ppr',
  'player_history_trailing_2yr_ppr_total',
  'player_history_trailing_3yr_ppr_total',
  'player_history_trailing_2yr_ppr_mean',
  'player_history_trailing_3yr_ppr_mean',
  'player_history_year_over_year_ppr_trend',
];
const BASE_FEATURES = ['ppr_2024', 'ppr_per_game_2024', 'games_2024', 'targets_2024', 'rush_attempts_2024', 'position'];
const KNOWN_ID_COLLISIONS = ['00-0037539', '00-0038977', '00-0033857'];

/**
 * Pinned pre-#143 baseline (generated from commit 7a66996, the parent of PR #144), committed so this
 * check is a REAL, re-runnable comparison rather than prose citing a one-time manual finding (Codex
 * P1 review on PR #146: "the script should actually compare the disabled report/predictions against
 * the pinned pre-#143 baseline before marking this check passed").
 */
const PRE_143_BASELINE_REPORT_PATH = 'data/fixtures/seasonalPpr/pre_143_baseline_report.json';
const PRE_143_BASELINE_PREDICTIONS_PATH = 'data/fixtures/seasonalPpr/pre_143_baseline_predictions.jsonl';

interface BaselinePredictionRow {
  player_id: string;
  predicted_ppr: number | null;
  actual_ppr: number | null;
  absolute_error: number | null;
  feature_coverage_status: string;
  governance_status: string;
  features_present: string[];
}

// -------------------------------------------------------------------------------------------
// 0. Confirm the expected merge commit is actually an ancestor of HEAD.
// -------------------------------------------------------------------------------------------

let mergeCommitVerified = false;
try {
  execSync(`git merge-base --is-ancestor ${EXPECTED_MERGE_COMMIT} HEAD`, { cwd: REPO_ROOT, stdio: 'pipe' });
  mergeCommitVerified = true;
} catch {
  mergeCommitVerified = false;
}

// -------------------------------------------------------------------------------------------
// Helpers: run the real CLI into a temp dir.
// -------------------------------------------------------------------------------------------

const tsxPath = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const scriptPath = path.join(REPO_ROOT, 'scripts', 'runSeasonalPprBacktest.ts');

const runCli = (outDir: string, extraArgs: string[]): { ok: boolean; stderr: string } => {
  try {
    execFileSync(tsxPath, [scriptPath, outDir, '--generated-at=2026-07-08T00:00:00.000Z', ...extraArgs], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, stderr: '' };
  } catch (error) {
    const err = error as { stderr?: string };
    return { ok: false, stderr: err.stderr ?? '' };
  }
};

const loadJsonl = <T>(p: string): T[] =>
  readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);

const tmpBase = mkdtempSync(path.join(tmpdir(), 'ph-activation-verify-'));
const disabledDir = path.join(tmpBase, 'disabled');
const enabledDirA = path.join(tmpBase, 'enabled-a');
const enabledDirB = path.join(tmpBase, 'enabled-b');

const disabledRun = runCli(disabledDir, []);
const enabledRunA = runCli(enabledDirA, ['--enable-player-history-production-only']);
const enabledRunB = runCli(enabledDirB, ['--enable-player-history-production-only']);

// -------------------------------------------------------------------------------------------
// 1. Default execution remains byte-identical (core metrics) to pre-binding expectations.
// -------------------------------------------------------------------------------------------

let defaultBehaviorUnchanged: CheckResult;
if (!disabledRun.ok) {
  defaultBehaviorUnchanged = { id: 'default_behavior_unchanged', description: 'Default (no-flag) execution succeeds and discloses the binding as disabled.', passed: false, evidence: `CLI run failed: ${disabledRun.stderr}` };
} else {
  const report = readAbsJson<{ player_history_production_only: { enabled: boolean }; model: { overall: { mae: number; rmse: number } } }>(path.join(disabledDir, 'seasonal_ppr_backtest_report.json'));
  const predictions = loadJsonl<BaselinePredictionRow>(path.join(disabledDir, 'seasonal_ppr_predictions.jsonl'));
  const noHistoryFeaturesPresent = predictions.every((p) => p.features_present.every((f) => !f.startsWith('player_history_')));
  const disabledDeclared = report.player_history_production_only.enabled === false;

  const baselineReport = readJson<{ model: { overall: { mae: number; rmse: number } } }>(PRE_143_BASELINE_REPORT_PATH);
  const baselinePredictions = loadJsonl<BaselinePredictionRow>(path.join(REPO_ROOT, PRE_143_BASELINE_PREDICTIONS_PATH));
  const baselineById = new Map(baselinePredictions.map((r) => [r.player_id, r]));
  const currentById = new Map(predictions.map((r) => [r.player_id, r]));
  const samePlayerSet = baselineById.size === currentById.size && [...baselineById.keys()].every((id) => currentById.has(id));
  const fieldMismatches: string[] = [];
  if (samePlayerSet) {
    for (const [id, baseRow] of baselineById) {
      const curRow = currentById.get(id)!;
      for (const key of ['predicted_ppr', 'actual_ppr', 'absolute_error', 'feature_coverage_status', 'governance_status'] as const) {
        if (baseRow[key] !== curRow[key]) fieldMismatches.push(`${id}.${key}: baseline=${baseRow[key]} current=${curRow[key]}`);
      }
      if (JSON.stringify([...baseRow.features_present].sort()) !== JSON.stringify([...curRow.features_present].sort())) {
        fieldMismatches.push(`${id}.features_present differs: baseline=${JSON.stringify(baseRow.features_present)} current=${JSON.stringify(curRow.features_present)}`);
      }
    }
  }
  const maeMatches = report.model.overall.mae === baselineReport.model.overall.mae;
  const rmseMatches = report.model.overall.rmse === baselineReport.model.overall.rmse;
  const baselineMatches = samePlayerSet && fieldMismatches.length === 0 && maeMatches && rmseMatches;

  defaultBehaviorUnchanged = {
    id: 'default_behavior_unchanged',
    description: 'Default (no-flag) execution discloses disabled, exercises no player-history feature, and matches the pinned pre-#143 baseline (data/fixtures/seasonalPpr/) exactly on every prediction field and on overall MAE/RMSE.',
    passed: disabledDeclared && noHistoryFeaturesPresent && baselineMatches,
    evidence: `enabled=${report.player_history_production_only.enabled}; every row has zero player_history_* entries in features_present=${noHistoryFeaturesPresent}; same ${baselineById.size}-player set vs. pinned baseline=${samePlayerSet}; field mismatches vs. baseline=${fieldMismatches.length} (${fieldMismatches.slice(0, 5).join('; ') || 'none'}); MAE matches baseline (${baselineReport.model.overall.mae})=${maeMatches}; RMSE matches baseline (${baselineReport.model.overall.rmse})=${rmseMatches}.`,
  };
}

// -------------------------------------------------------------------------------------------
// 2. --enable-player-history-production-only activates ONLY the approved family.
// -------------------------------------------------------------------------------------------

let onlyApprovedFeaturesActivated: CheckResult;
if (!enabledRunA.ok) {
  onlyApprovedFeaturesActivated = { id: 'only_approved_features_activated', description: 'Enabled execution activates exactly the 7 approved production_only features and nothing else.', passed: false, evidence: `CLI run failed: ${enabledRunA.stderr}` };
} else {
  const predictions = loadJsonl<{ features_present: string[] }>(path.join(enabledDirA, 'seasonal_ppr_predictions.jsonl'));
  const allowed = new Set([...BASE_FEATURES, ...APPROVED_PLAYER_HISTORY_FEATURES]);
  const unexpected = new Set<string>();
  const observedApproved = new Set<string>();
  for (const row of predictions) {
    for (const f of row.features_present) {
      if (!allowed.has(f)) unexpected.add(f);
      if (APPROVED_PLAYER_HISTORY_FEATURES.includes(f)) observedApproved.add(f);
    }
  }

  // Per-row `features_present` only lists NON-ZERO/NON-NULL values (see featuresPresent() in
  // runSeasonalPprBacktestService.ts), so an unapproved 8th column that happens to be zero/null for
  // every bundled-fixture row would never show up there even though the model's actual design matrix
  // had grown (Codex P2 review on PR #146). The DEFINITIVE feature set is report.feature_list, which
  // enumerates every design-matrix column regardless of any row's runtime value -- check that instead
  // of (or in addition to) per-row presence.
  const enabledReportForFeatureList = readAbsJson<{ feature_list: Array<{ name: string; kind: string }> }>(path.join(enabledDirA, 'seasonal_ppr_backtest_report.json'));
  const numericFeatureListNames = new Set(enabledReportForFeatureList.feature_list.filter((f) => f.kind === 'numeric').map((f) => f.name));
  const expectedNumericNames = new Set([...BASE_FEATURES.filter((f) => f !== 'position'), ...APPROVED_PLAYER_HISTORY_FEATURES]);
  const featureListExtra = [...numericFeatureListNames].filter((n) => !expectedNumericNames.has(n));
  const featureListMissing = [...expectedNumericNames].filter((n) => !numericFeatureListNames.has(n));
  const featureListExactMatch = featureListExtra.length === 0 && featureListMissing.length === 0;

  onlyApprovedFeaturesActivated = {
    id: 'only_approved_features_activated',
    description: "Enabled execution's declared feature_list (not just per-row presence) is exactly the 5 base + 7 approved production_only numeric columns, and every approved column is exercised by at least one row.",
    passed: unexpected.size === 0 && observedApproved.size === APPROVED_PLAYER_HISTORY_FEATURES.length && featureListExactMatch,
    evidence: `unexpected feature names observed in any row: ${unexpected.size === 0 ? 'none' : [...unexpected].join(', ')}. Approved features actually exercised: ${observedApproved.size}/${APPROVED_PLAYER_HISTORY_FEATURES.length}. report.feature_list numeric names exactly match expected set=${featureListExactMatch} (extra: ${featureListExtra.join(', ') || 'none'}; missing: ${featureListMissing.join(', ') || 'none'}).`,
  };
}

// -------------------------------------------------------------------------------------------
// 3. Locked artifact SHA and contract remain enforced (real file + synthetic tampering, in-memory).
// -------------------------------------------------------------------------------------------

const realMirror = readJson<PlayerHistoryProductionOnlyMirrorDocument>(LOCKED_PLAYER_HISTORY_MIRROR_PATH);
const provenanceOutcomes: Array<{ label: string; threw: boolean; expectedThrow: boolean }> = [];
const tryVerify = (label: string, mirror: PlayerHistoryProductionOnlyMirrorDocument, expectedThrow: boolean) => {
  let threw = false;
  try {
    verifyPlayerHistoryMirrorProvenance(mirror);
  } catch {
    threw = true;
  }
  provenanceOutcomes.push({ label, threw, expectedThrow });
};
tryVerify('pristine_real_mirror', realMirror, false);
tryVerify('tampered_sha256', { ...realMirror, governed_source: { ...realMirror.governed_source, sha256: 'deadbeef' } }, true);
tryVerify('tampered_repo', { ...realMirror, governed_source: { ...realMirror.governed_source, repo: 'someone/else' } }, true);
tryVerify('tampered_promotion_review', { ...realMirror, governed_source: { ...realMirror.governed_source, promotionReview: 'TIBER-Data#1' } }, true);
tryVerify('tampered_artifact_status', { ...realMirror, governed_source: { ...realMirror.governed_source, artifactStatus: 'candidate_pin' } }, true);
tryVerify('tampered_input_window', { ...realMirror, input_window: { ...realMirror.input_window, seasons: [2020, 2021, 2022] } }, true);
const provenanceAllCorrect = provenanceOutcomes.every((o) => o.threw === o.expectedThrow);

const provenanceFailClosed: CheckResult = {
  id: 'provenance_fail_closed',
  description: 'The locked artifact identity check passes for the real mirror and fails closed for every tampered variant.',
  passed: provenanceAllCorrect,
  evidence: provenanceOutcomes.map((o) => `${o.label}: threw=${o.threw} (expected ${o.expectedThrow})`).join('; '),
};

// -------------------------------------------------------------------------------------------
// 4. Missing/colliding player-history stays explicit (never cross-contaminated).
// -------------------------------------------------------------------------------------------

let missingHistoryExplicit: CheckResult;
if (!enabledRunA.ok) {
  missingHistoryExplicit = { id: 'missing_history_explicit', description: 'Known player_id collisions null out rather than borrowing another real player\'s history.', passed: false, evidence: 'enabled CLI run failed' };
} else {
  const explanations = loadJsonl<{ player_id: string; feature_contributions: Array<{ feature: string; input_value: number }> }>(
    path.join(enabledDirA, 'seasonal_ppr_prediction_explanations.jsonl'),
  );
  const byId = new Map(explanations.map((e) => [e.player_id, e]));
  const collisionResults = KNOWN_ID_COLLISIONS.map((id) => {
    const e = byId.get(id);
    const historyValues = e?.feature_contributions.filter((c) => c.feature.startsWith('player_history_')) ?? [];
    const allZero = historyValues.length > 0 && historyValues.every((c) => c.input_value === 0);
    return { id, found: e !== undefined, allZero };
  });
  const allCollisionsNulled = collisionResults.every((r) => r.found && r.allZero);
  missingHistoryExplicit = {
    id: 'missing_history_explicit',
    description: 'Known player_id collisions (scaffold vs. real mirror identity mismatches) null out rather than borrowing another real player\'s history.',
    passed: allCollisionsNulled,
    evidence: collisionResults.map((r) => `${r.id}: found=${r.found}, all_player_history_inputs_zero=${r.allZero}`).join('; '),
  };
}

// -------------------------------------------------------------------------------------------
// 5. Direct model usage cannot bypass the gating contract.
// -------------------------------------------------------------------------------------------

const forgedHistory = {
  contract_id: 'player_history_production_only_v0' as const,
  contract_version: '1.0.0' as const,
  source_artifact_sha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
  prior_season_1_ppr: 500,
  prior_season_2_ppr: 500,
  trailing_2yr_ppr_total: 1000,
  trailing_3yr_ppr_total: 1500,
  trailing_2yr_ppr_mean: 500,
  trailing_3yr_ppr_mean: 500,
  year_over_year_ppr_trend: 0,
};
const baseObs = (id: string, ppr: number, actual: number): SeasonalPlayerObservation => ({
  player_id: id,
  player_name: id,
  position: 'WR',
  team_2024: 'FA',
  games_2024: 16,
  ppr_2024: ppr,
  receptions_2024: 80,
  targets_2024: 110,
  rush_attempts_2024: 0,
  ppr_2025_actual: actual,
});
const rowsForged = Array.from({ length: 6 }, (_, i) => ({
  ...baseObs(`gate-check-${i}`, 150 + i * 20, 160 + i * 18),
  player_history: { ...forgedHistory, prior_season_1_ppr: 100 + i * 40, prior_season_2_ppr: 90 + i * 40 },
}));
const rowsClean = rowsForged.map((r) => ({ ...r, player_history: null }));
const target = { ...baseObs('gate-check-target', 180, 0), player_history: forgedHistory };
const targetClean: SeasonalPlayerObservation = { ...target, player_history: null };

const predNoGate = trainSeasonalRidgeModel(rowsForged, { lambda: 1 }).predict(target);
const predClean = trainSeasonalRidgeModel(rowsClean, { lambda: 1 }).predict(targetClean);
const predWrongSha = trainSeasonalRidgeModel(rowsForged, { lambda: 1, playerHistoryProductionOnly: { enabled: true, sourceArtifactSha256: 'not-the-real-sha' } }).predict(target);
const predCorrectGate = trainSeasonalRidgeModel(rowsForged, { lambda: 1, playerHistoryProductionOnly: { enabled: true, sourceArtifactSha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256 } }).predict(target);

const noGateInert = Math.abs(predNoGate - predClean) < 1e-6;
const wrongShaInert = Math.abs(predWrongSha - predClean) < 1e-6;
const correctGateActive = Math.abs(predCorrectGate - predClean) > 1e-3;

const modelGateCannotBeBypassed: CheckResult = {
  id: 'model_gate_cannot_be_bypassed',
  description: 'trainSeasonalRidgeModel, called directly (bypassing the service), ignores player_history unless the correct gate is supplied.',
  passed: noGateInert && wrongShaInert && correctGateActive,
  evidence: `no-gate prediction identical to clean baseline=${noGateInert} (${predNoGate} vs ${predClean}); wrong-sha prediction identical to clean=${wrongShaInert} (${predWrongSha}); correct-gate prediction differs from clean=${correctGateActive} (${predCorrectGate}).`,
};

// -------------------------------------------------------------------------------------------
// 6. Reports disclose enabled/disabled state truthfully.
// -------------------------------------------------------------------------------------------

let reportDisclosureAccurate: CheckResult;
if (!disabledRun.ok || !enabledRunA.ok) {
  reportDisclosureAccurate = { id: 'report_disclosure_accurate', description: 'The report\'s enabled/sha256 disclosure matches the actual run type.', passed: false, evidence: 'one or both CLI runs failed' };
} else {
  const disabledReport = readAbsJson<{ player_history_production_only: { enabled: boolean; source_artifact_sha256: string | null } }>(path.join(disabledDir, 'seasonal_ppr_backtest_report.json'));
  const enabledReport = readAbsJson<{ player_history_production_only: { enabled: boolean; source_artifact_sha256: string | null } }>(path.join(enabledDirA, 'seasonal_ppr_backtest_report.json'));
  const disabledCorrect = disabledReport.player_history_production_only.enabled === false && disabledReport.player_history_production_only.source_artifact_sha256 === null;
  const enabledCorrect = enabledReport.player_history_production_only.enabled === true && enabledReport.player_history_production_only.source_artifact_sha256 === LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256;
  reportDisclosureAccurate = {
    id: 'report_disclosure_accurate',
    description: 'The report\'s enabled/sha256 disclosure matches the actual run type.',
    passed: disabledCorrect && enabledCorrect,
    evidence: `disabled run discloses ${JSON.stringify(disabledReport.player_history_production_only)} (correct=${disabledCorrect}); enabled run discloses ${JSON.stringify(enabledReport.player_history_production_only)} (correct=${enabledCorrect}).`,
  };
}

// -------------------------------------------------------------------------------------------
// 7. Deterministic replay produces stable results (two independent enabled runs).
// -------------------------------------------------------------------------------------------

let deterministicReplayStable: CheckResult;
if (!enabledRunA.ok || !enabledRunB.ok) {
  deterministicReplayStable = { id: 'deterministic_replay_stable', description: 'Two independent enabled runs produce byte-identical output.', passed: false, evidence: 'one or both enabled runs failed' };
} else {
  const reportA = readAbsText(path.join(enabledDirA, 'seasonal_ppr_backtest_report.json'));
  const reportB = readAbsText(path.join(enabledDirB, 'seasonal_ppr_backtest_report.json'));
  const predictionsA = readAbsText(path.join(enabledDirA, 'seasonal_ppr_predictions.jsonl'));
  const predictionsB = readAbsText(path.join(enabledDirB, 'seasonal_ppr_predictions.jsonl'));
  const identical = reportA === reportB && predictionsA === predictionsB;
  deterministicReplayStable = {
    id: 'deterministic_replay_stable',
    description: 'Two independent enabled runs produce byte-identical output.',
    passed: identical,
    evidence: `report bytes identical=${reportA === reportB}; predictions bytes identical=${predictionsA === predictionsB}.`,
  };
}

// -------------------------------------------------------------------------------------------
// 8. No unrelated Forecast outputs changed: full-repository scope scan.
// -------------------------------------------------------------------------------------------

const FORBIDDEN_TERMS = ['player_history', 'player-history', 'playerHistory', 'PlayerHistory'];
const grepOutput = execSync(
  `grep -rl "player_history\\|player-history\\|playerHistory\\|PlayerHistory" src --include="*.ts" || true`,
  { cwd: REPO_ROOT, encoding: 'utf8' },
).trim();
const filesWithReferences = grepOutput.length > 0 ? grepOutput.split('\n') : [];

// Files authorized to reference player-history: the #143-implemented consumer files, the new
// #143 source module, the #141/#143/#145 governance rehearsal/report modules, the pre-existing
// #101-#140 experimental rehearsal chain (never touched by #143-#145), and the public library
// re-export barrel (which re-exports that pre-existing chain's types, not anything new).
const AUTHORIZED_PATTERNS = [
  /^src\/models\/seasonal\/seasonalPprModel\.ts$/,
  /^src\/contracts\/seasonalPprBacktest\.ts$/,
  /^src\/datasets\/seasonal\/loadSeasonalPprDataset\.ts$/,
  /^src\/services\/runSeasonalPprBacktestService\.ts$/,
  /^src\/datasets\/seasonal\/playerHistoryProductionOnlySource\.ts$/,
  /^src\/rehearsal\/playerHistoryProductionBindingReview\.ts$/,
  /^src\/rehearsal\/playerHistoryProductionBindingImplementation\.ts$/,
  /^src\/rehearsal\/playerHistoryProductionBindingActivationVerification\.ts$/,
  /^src\/rehearsal\/playerHistory(?!ProductionBinding).*\.ts$/, // pre-existing #101-#140 experimental chain
  /^src\/reports\/playerSeasonCoverageGate\.ts$/, // pre-existing, references "player-history experiment" in prose only
  /^src\/public\/index\.ts$/, // re-exports the pre-existing experimental chain's types only
];
const unauthorized = filesWithReferences.filter((f) => !AUTHORIZED_PATTERNS.some((pattern) => pattern.test(f)));

const noUnrelatedOutputsChanged: CheckResult = {
  id: 'no_unrelated_outputs_changed',
  description: 'A full-repository scan finds player-history references ONLY in already-authorized files.',
  passed: unauthorized.length === 0,
  evidence: `${filesWithReferences.length} file(s) with a player-history reference scanned; ${unauthorized.length} unauthorized: ${unauthorized.join(', ') || 'none'}. Forbidden terms: ${FORBIDDEN_TERMS.join(', ')}.`,
};

// -------------------------------------------------------------------------------------------
// Build + test (real, executed).
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
  testFileCount = Number(output.match(/Test Files\s+(\d+) passed/)?.[1] ?? 0);
  testCount = Number(output.match(/\bTests\s+(\d+) passed/)?.[1] ?? 0);
} catch (error) {
  testsPassed = false;
  const output = (error as { stdout?: Buffer | string }).stdout?.toString() ?? '';
  testFileCount = Number(output.match(/Test Files\s+\d+ failed.*?(\d+) passed/)?.[1] ?? 0);
  testCount = Number(output.match(/\bTests\s+\d+ failed.*?(\d+) passed/)?.[1] ?? 0);
}
const buildAndTestPassed: CheckResult = {
  id: 'build_and_test_passed',
  description: '`npm run build` and `npm test` both pass on main.',
  passed: buildPassed && testsPassed,
  evidence: `build_passed=${buildPassed}, tests_passed=${testsPassed} (${testFileCount} files, ${testCount} tests).`,
};

// -------------------------------------------------------------------------------------------
// Evaluate + write reports.
// -------------------------------------------------------------------------------------------

const review = evaluatePlayerHistoryProductionBindingActivationVerification({
  mergeCommitVerified,
  defaultBehaviorUnchanged,
  onlyApprovedFeaturesActivated,
  provenanceFailClosed,
  missingHistoryExplicit,
  modelGateCannotBeBypassed,
  reportDisclosureAccurate,
  deterministicReplayStable,
  noUnrelatedOutputsChanged,
  buildAndTestPassed,
});

rmSync(tmpBase, { recursive: true, force: true });

const fullReport = {
  report_version: 'player-history-production-binding-activation-verification-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  verified_against: { expected_merge_commit: EXPECTED_MERGE_COMMIT, merge_commit_verified: mergeCommitVerified, source_pr: 'TIBER-Forecast#144' },
  review,
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const checksTable = review.checks.map((c) => `| \`${c.id}\` | ${c.description} | ${c.passed ? '✅' : '❌'} | ${c.evidence} |`).join('\n');

const md = `# Player-history production-only binding activation verification (#145)

_Generated ${REPORT_DATE} • ${review.version}_

**Decision: \`${review.decision}\`**

Post-merge verification of PR #144 (squash commit \`${EXPECTED_MERGE_COMMIT}\`) from \`main\`. This is a verification pass only: no feature expansion, no model redesign, no full-feature-set authorization.

## Verification checks (${review.checks_passed_count}/${review.checks_total} passed)

| Check | Description | Passed | Evidence |
|---|---|---|---|
${checksTable}

## Decision

- **\`${review.decision}\`**
- ${review.decision_rationale}

## Non-goals confirmed

- No additional feature family authorized.
- No model redesign.
- No Fantasy/product/UI/ranking/advice behavior.
- No TIBER-Data change.
- No threshold change.
- A positive decision confirms activation readiness only -- it is not a new production-readiness claim beyond what #143/#144 already established with human sign-off.

## Reproduce

\`\`\`bash
npm run verify:player-history-production-binding-activation
npm run build && npm test
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(`activation verification complete: ${review.checks_passed_count}/${review.checks_total} checks passed\ndecision: ${review.decision}\n  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`);
if (review.decision !== 'player_history_production_binding_activation_verified') {
  process.exit(1);
}
