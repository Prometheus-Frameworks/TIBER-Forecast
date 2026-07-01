/**
 * Evaluate the player_season_coverage_v0 candidate gate against the mirrored TIBER-Data evidence and
 * write a durable report (Forecast issue #99). Reproducible, network-free:
 *
 *   npm run evaluate:player-season-coverage-gate
 *
 * Writes docs/reports/player-season-coverage-gate-2026-07-01.{json,md}. It performs NO Forecast run,
 * no Run 3, no feature binding, no baseline change, no model tuning, and no TIBER-Data/Teamstate change.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluatePlayerSeasonCoverageGateFromMirror,
  type MirroredPlayerSeasonCoverageEvidence,
} from '../src/rehearsal/runPlayerSeasonCoverageGateEvaluation.js';
import {
  EXPECTED_ARTIFACT_STATUS,
  EXPECTED_POSITIONS,
  EXPECTED_ROW_GRAIN,
  EXPECTED_SEASONS,
  EXPECTED_SEASON_TYPE_SCOPE,
} from '../src/reports/playerSeasonCoverageGate.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-01';
const MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2025.mirror.json';
const REPORT_JSON_REL = `docs/reports/player-season-coverage-gate-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-season-coverage-gate-${REPORT_DATE}.md`;

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const mirror = readJson<MirroredPlayerSeasonCoverageEvidence>(MIRROR_REL);
const { evidence, result, source_identity } = evaluatePlayerSeasonCoverageGateFromMirror(mirror);

const nextStep =
  result.decision === 'may_design_experiment'
    ? 'Open a SEPARATE experiment-design issue for a future controlled player-history Forecast experiment. That issue must define input seasons vs. the target season, the cutoff, and pass its own review before any run. Do not run or bind features here.'
    : 'Open a follow-up that fixes only the first blocking dimension below (see blocking_reasons). Do not design an experiment or run Forecast until it is resolved.';

const checkByDimension = (dimension: string) => result.checks.find((c) => c.dimension === dimension);

const report = {
  report_version: 'player-season-coverage-gate-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#99',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evaluation_kind: 'gate_evaluation_only_no_run_no_feature_binding',
  artifact_inspected: {
    repo: mirror.governed_source.repo,
    path: mirror.governed_source.sourceArtifactPath,
    sha256: mirror.governed_source.sha256,
    schema_path: mirror.governed_source.schemaPath,
    validator_path: mirror.governed_source.validatorPath,
    coverage_report_path_md: mirror.governed_source.coverageReportPathMd,
    coverage_report_path_json: mirror.governed_source.coverageReportPathJson,
    refs: source_identity.refs,
  },
  status_statements: {
    is_candidate_not_promoted: mirror.identity.status === EXPECTED_ARTIFACT_STATUS,
    forecast_did_not_run: true,
    no_forecast_feature_binding_occurred: true,
    no_model_signal_claimed: true,
  },
  expected_scope: {
    seasons: EXPECTED_SEASONS,
    season_type_scope: EXPECTED_SEASON_TYPE_SCOPE,
    positions: EXPECTED_POSITIONS,
    row_grain: EXPECTED_ROW_GRAIN,
    artifact_status: EXPECTED_ARTIFACT_STATUS,
  },
  evidence_summary: {
    identity: evidence.identity,
    provenance: evidence.provenance,
    scope: evidence.scope,
    grain: evidence.grain,
    aggregate_stats: mirror.aggregate_stats,
    row_sample_count: evidence.row_sample.length,
    proposed_cutoff_design: evidence.proposed_cutoff_design,
  },
  gate_result: result,
  final_status: result.status,
  final_decision: result.decision,
  next_step: nextStep,
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

const passEmoji = result.decision === 'may_design_experiment' ? 'PASSED' : 'NOT PASSED';
const identityCheck = checkByDimension('identity_status');
const provenanceCheck = checkByDimension('provenance');
const scopeCheck = checkByDimension('scope_window');
const grainCheck = checkByDimension('grain_shape');
const semanticCheck = checkByDimension('semantic_boundary');
const cutoffCheck = checkByDimension('cutoff_discipline');

const md = `# player_season_coverage_v0 candidate coverage/provenance gate evaluation

_Generated ${REPORT_DATE} • record ${report.report_version} • status: **${result.status}**_

Gate-evaluation only: this evaluates whether the TIBER-Data \`player_season_coverage_v0\` candidate artifact is structurally serviceable enough to justify DESIGNING a future controlled Forecast player-history experiment. It performs **no** Forecast run, no Run 3, no feature binding, no baseline change, no model tuning, and no TIBER-Data/Teamstate change. The strongest decision this gate can return is \`may_design_experiment\`; it never authorizes a run.

## 1. Artifact inspected

- TIBER-Data repo: \`${report.artifact_inspected.repo}\`
- Source artifact: \`${report.artifact_inspected.path}\`
- sha256: \`${report.artifact_inspected.sha256}\`
- Schema: \`${report.artifact_inspected.schema_path}\`
- Validator: \`${report.artifact_inspected.validator_path}\`
- Coverage report: \`${report.artifact_inspected.coverage_report_path_md}\`
- Refs: ${report.artifact_inspected.refs.map((r) => `\`${r}\``).join(', ')}

## 2. Status statements

- Candidate / not promoted: **${report.status_statements.is_candidate_not_promoted}**
- Forecast did not run: **${report.status_statements.forecast_did_not_run}**
- No Forecast feature binding occurred: **${report.status_statements.no_forecast_feature_binding_occurred}**
- No model signal is claimed: **${report.status_statements.no_model_signal_claimed}**

## 3. Identity / status

- ${identityCheck?.observed} → **${identityCheck?.passed ? 'pass' : 'fail'}**
- Expected: ${identityCheck?.expected}

## 4. Source / provenance

- ${provenanceCheck?.observed} → **${provenanceCheck?.passed ? 'pass' : 'fail'}**
- Expected: ${provenanceCheck?.expected}

## 5. Scope / window

- ${scopeCheck?.observed} → **${scopeCheck?.passed ? 'pass' : 'fail'}**
- Expected: ${scopeCheck?.expected}

## 6. Grain / shape

- ${grainCheck?.observed} → **${grainCheck?.passed ? 'pass' : 'fail'}**
- Expected: ${grainCheck?.expected}

## 7. Semantic boundary

- ${semanticCheck?.observed} → **${semanticCheck?.passed ? 'pass' : 'fail'}**
- Expected: ${semanticCheck?.expected}

## 8. Cutoff-risk notes

- ${cutoffCheck?.observed} → **${cutoffCheck?.passed ? 'pass' : 'fail'}**
- Expected: ${cutoffCheck?.expected}
- No proposed input/target cutoff design exists yet in this evidence; a future design is a **separate, later issue**.

## 9. Aggregate evidence summary

- Rows by season: ${Object.entries(report.evidence_summary.aggregate_stats.rows_by_season).map(([s, c]) => `${s}=${c}`).join(', ')}
- Rows by position: ${Object.entries(report.evidence_summary.aggregate_stats.rows_by_position).map(([p, c]) => `${p}=${c}`).join(', ')}
- Multi-team rows: ${report.evidence_summary.aggregate_stats.multi_team_row_count}
- \`draft_year\` null count: ${report.evidence_summary.aggregate_stats.draft_year_null_count} (genuine — undrafted players)
- \`season_age\` null count: ${report.evidence_summary.aggregate_stats.season_age_null_count}
- Row sample size evaluated: ${report.evidence_summary.row_sample_count}

## 10. Result

- **Final gate status:** \`${result.status}\` (${passEmoji})
- **Final decision:** \`${result.decision}\`
${result.blocking_reasons.length > 0 ? `- Blocking reasons: ${result.blocking_reasons.join('; ')}\n` : ''}- Warnings: ${result.warnings.join('; ')}
- **Next step:** ${nextStep}

## Reproduce

\`\`\`bash
npm run evaluate:player-season-coverage-gate   # regenerate this report (network-free)
npm run build                                  # tsc --noEmit
npm test                                       # incl. tests/playerSeasonCoverageGate.test.ts
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(`${result.status} -> ${result.decision}\n`);
process.stderr.write(`  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`);
