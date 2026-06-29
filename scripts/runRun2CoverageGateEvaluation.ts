/**
 * Evaluate the Teamstate Run 2 coverage gate against the mirrored full-mode Teamstate evidence and
 * write a durable report (Forecast issue #94). Reproducible, network-free:
 *
 *   npm run evaluate:run2-coverage-gate
 *
 * Writes docs/reports/teamstate-run2-coverage-gate-evaluation-2026-06-29.{json,md}. It performs NO Run 2
 * rerun, no model fit, no comparison, no tuning, no feature/null-handling change.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateRun2CoverageGateFromTeamstate,
  type MirroredTeamstateCoverageEvidence,
  type MirroredTeamstateFullArtifact,
  type TeamSeasonFeatureAvailability,
} from '../src/rehearsal/runRun2CoverageGateEvaluation.js';
import {
  RUN2_GATE_MIN_TEAM_COVERAGE,
  RUN2_GATE_PREFERRED_TEAM_COVERAGE,
  RUN2_GATE_MIN_SCORED_ROW_COVERAGE,
  RUN2_GATE_MIN_NONNULL_CELL_COVERAGE,
} from '../src/reports/run2TeamstateCoverageGate.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-06-29';
const FIXTURE_DIR = 'data/fixtures/teamstate';
const COVERAGE_EVIDENCE_REL = `${FIXTURE_DIR}/team_week_raw_v0_2024_forecast_run2.coverage_evidence.json`;
const FULL_ARTIFACT_REL = `${FIXTURE_DIR}/team_week_raw_v0_2024_forecast_run2.full.json`;
const AVAILABILITY_REL = `${FIXTURE_DIR}/team_season_feature_availability_2024.json`;
const REPORT_JSON_REL = `docs/reports/teamstate-run2-coverage-gate-evaluation-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/teamstate-run2-coverage-gate-evaluation-${REPORT_DATE}.md`;

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const coverageEvidence = readJson<MirroredTeamstateCoverageEvidence>(COVERAGE_EVIDENCE_REL);
const fullArtifact = readJson<MirroredTeamstateFullArtifact>(FULL_ARTIFACT_REL);
const availability = readJson<TeamSeasonFeatureAvailability>(AVAILABILITY_REL);

const { evidence, result, source_identity } = evaluateRun2CoverageGateFromTeamstate({
  coverageEvidence,
  fullArtifact,
  availability,
});

const nextStep =
  result.decision === 'may_rerun_unchanged_comparison'
    ? 'Open a separate issue for an UNCHANGED #86-style three-arm comparison rerun (same population/target/folds/model/null-handling). Do not rerun here.'
    : 'Open a follow-up that fixes only the first blocking evidence/coverage dimension below. Do not rerun.';

const report = {
  report_version: 'teamstate-run2-coverage-gate-evaluation-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#94',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evaluation_kind: 'gate_evaluation_only_no_rerun',
  source_evidence_identity: {
    teamstate_repo: 'Prometheus-Frameworks/TIBER-Teamstate',
    teamstate_coverage_evidence: COVERAGE_EVIDENCE_REL,
    teamstate_full_artifact: FULL_ARTIFACT_REL,
    teamstate_source_artifact_path: source_identity.teamstate_source_artifact_path,
    governed_source_sha256: source_identity.governed_source_sha256,
    upstream_coverage_audit: source_identity.upstream_coverage_audit,
    refs: availability.provenance.refs,
  },
  teamstate_evidence_summary: {
    input_teams: coverageEvidence.input.teamCount,
    input_rows: coverageEvidence.input.rowCount,
    missing_teams: coverageEvidence.input.missingTeams,
    emitted_readiness: coverageEvidence.emitted.readinessStatus,
    emitted_forecast_input_columns: coverageEvidence.emitted.forecastInputColumns.length,
    governance: `${fullArtifact.governance.governanceStatus} / ${fullArtifact.governance.governanceSource} / ${fullArtifact.provenanceStatus}`,
  },
  forecast_gate_thresholds: {
    team_coverage_min: RUN2_GATE_MIN_TEAM_COVERAGE,
    team_coverage_preferred: RUN2_GATE_PREFERRED_TEAM_COVERAGE,
    scored_row_coverage_min: RUN2_GATE_MIN_SCORED_ROW_COVERAGE,
    nonnull_cell_coverage_min: RUN2_GATE_MIN_NONNULL_CELL_COVERAGE,
  },
  forecast_feature_columns: source_identity.forecast_feature_columns,
  gate_input_evidence: evidence,
  join_diagnostics_summary: {
    records: evidence.join_diagnostics?.length ?? 0,
    matched: evidence.matched_row_count,
    scored: evidence.scored_row_count,
    one_record_per_scored_row: (evidence.join_diagnostics?.length ?? 0) === evidence.scored_row_count,
    unmatched: (evidence.join_diagnostics ?? []).filter((row) => !row.matched).map((row) => ({
      player_id: row.player_id,
      player_name: row.player_name,
      team_2024: row.team_2024,
      reason: row.unmatched_reason,
    })),
  },
  gate_result: result,
  final_status: result.status,
  final_decision: result.decision,
  next_step: nextStep,
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

const tc = result.team_coverage;
const sc = result.scored_row_coverage;
const cc = result.nonnull_cell_coverage;
const passEmoji = result.decision === 'may_rerun_unchanged_comparison' ? 'PASSED' : 'NOT PASSED';
const md = `# Teamstate Run 2 coverage gate evaluation

_Generated ${REPORT_DATE} • record ${report.report_version} • status: **${result.status}**_

Gate-evaluation only: this evaluates whether the new full-mode Teamstate coverage evidence satisfies Forecast's Teamstate Run 2 coverage gate. It performs **no** Run 2 rerun, no three-arm comparison, no model fit/tuning, no feature change, and no null-handling change. A pass authorizes only a later **unchanged** rerun issue; it is **not** a claim that Teamstate improves prediction or works as signal.

## 1. Source evidence identity

- Teamstate repo: \`${report.source_evidence_identity.teamstate_repo}\`
- Teamstate coverage evidence: \`${COVERAGE_EVIDENCE_REL}\`
- Teamstate emitted artifact: \`${FULL_ARTIFACT_REL}\`
- Teamstate governed source: \`${source_identity.teamstate_source_artifact_path}\`
- Governed source sha256: \`${source_identity.governed_source_sha256}\`
- Upstream coverage audit: ${source_identity.upstream_coverage_audit}
- Refs: ${availability.provenance.refs.map((r) => `\`${r}\``).join(', ')}

## 2. Teamstate evidence summary

- Input: ${coverageEvidence.input.teamCount} teams / ${coverageEvidence.input.rowCount} team-week rows; missing teams: ${coverageEvidence.input.missingTeams.length === 0 ? 'none' : coverageEvidence.input.missingTeams.join(', ')}
- Emitted readiness: \`${coverageEvidence.emitted.readinessStatus}\`; emitted forecast input columns: ${coverageEvidence.emitted.forecastInputColumns.length}
- Governance: ${report.teamstate_evidence_summary.governance}
- Pressure excluded/deferred; fantasy splits absent/excluded; \`redZoneTdRate\` null-aware (legitimate partial nulls)

## 3. Forecast gate thresholds

- Team coverage ≥ ${RUN2_GATE_MIN_TEAM_COVERAGE}/32 (preferred ${RUN2_GATE_PREFERRED_TEAM_COVERAGE}/32)
- Scored-row coverage ≥ ${pct(RUN2_GATE_MIN_SCORED_ROW_COVERAGE)}
- Non-null Teamstate feature cells ≥ ${pct(RUN2_GATE_MIN_NONNULL_CELL_COVERAGE)}
- Forecast Run 2 Teamstate feature columns: ${source_identity.forecast_feature_columns.map((c) => `\`${c}\``).join(', ')} (subset of the ${coverageEvidence.emitted.forecastInputColumns.length} emitted input columns; pressure + fantasy excluded by contract)

## 4. Row-level join diagnostics

- ${report.join_diagnostics_summary.records} join records for ${evidence.scored_row_count} scored rows (one per scored row: ${report.join_diagnostics_summary.one_record_per_scored_row ? 'yes' : 'no'})
- Matched: ${evidence.matched_row_count}/${evidence.scored_row_count}
- Unmatched: ${report.join_diagnostics_summary.unmatched.length === 0 ? 'none' : report.join_diagnostics_summary.unmatched.map((u) => `${u.player_name} (${u.team_2024}): ${u.reason}`).join('; ')}

## 5. Team coverage

- ${tc.covered_count}/32 covered (threshold ≥ ${tc.minimum}/32) → **${tc.passed ? 'pass' : 'fail'}**
- Missing: ${tc.missing_teams.length === 0 ? 'none' : tc.missing_teams.join(', ')}

## 6. Scored-row coverage

- ${sc.matched}/${sc.scored} matched (${pct(sc.ratio)}; threshold ≥ ${pct(sc.threshold)}) → **${sc.passed ? 'pass' : 'fail'}**

## 7. Non-null-cell coverage

- ${cc.nonnull}/${cc.total} real governed cells (${pct(cc.ratio)}; threshold ≥ ${pct(cc.threshold)}) → **${cc.passed ? 'pass' : 'fail'}**
- Null cells by column: ${Object.entries(cc.null_cells_by_column).map(([k, v]) => `${k}=${v}`).join(', ')}
- Scoped to the Run 2 Teamstate feature columns; pressure and the 8 fantasy split fields are excluded by contract and do not count against coverage; \`redZoneTdRate\` partial nulls counted honestly (no zero-fill).

## 8. Position coverage

| Position | Matched | Scored | Ratio |
| --- | --- | --- | --- |
${result.position_coverage.map((p) => `| ${p.position} | ${p.matched} | ${p.scored} | ${pct(p.ratio)} |`).join('\n')}

## 9. Result

- **Final gate status:** \`${result.status}\` (${passEmoji})
- **Final decision:** \`${result.decision}\`
${result.blocking_reasons.length > 0 ? `- Blocking reasons: ${result.blocking_reasons.join('; ')}\n` : ''}${result.warnings.length > 0 ? `- Warnings: ${result.warnings.join('; ')}\n` : ''}- **Next step:** ${nextStep}

## Reproduce

\`\`\`bash
npm run evaluate:run2-coverage-gate   # regenerate this report (network-free)
npm run build                         # tsc --noEmit
npm test                              # incl. tests/run2CoverageGateEvaluation.test.ts
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(`${result.status} → ${result.decision} | team ${tc.covered_count}/32, scored ${sc.matched}/${sc.scored}, cells ${cc.nonnull}/${cc.total}\n`);
process.stderr.write(`  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`);
