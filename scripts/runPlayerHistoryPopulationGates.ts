/**
 * Run the player-history population gate stack against the generated #109 mirrors (Forecast #109).
 * Reproducible, network-free:
 *
 *   npm run gate:player-history-population
 *
 * Sequence (fail-closed at each step):
 *   1. target-population gate over the 2025 outcome mirror       -> may_continue_to_overlap_gate ceiling
 *   2. dry-run matrix rerun against the REAL population           -> counts only, no metrics
 *   3. mirror-overlap gate over the regenerated matrix evidence   -> may_authorize_run_issue ceiling
 *
 * Writes docs/reports/player-history-target-population-gate-2026-07-02.{json,md},
 *        docs/reports/player-history-real-population-dry-run-matrix-2026-07-02.{json,md},
 *        docs/reports/player-history-mirror-overlap-gate-2026-07-02.{json,md}.
 *
 * No Forecast run, no Run 3, no model training/tuning/evaluation, no MAE/RMSE/Pearson/rank
 * correlation, no baseline change, no feature binding, no promotion, no signal claim.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPlayerHistoryExperimentDryRunMatrix } from '../src/rehearsal/playerHistoryExperimentDryRunMatrix.js';
import { evaluatePlayerHistoryMirrorOverlapGate } from '../src/rehearsal/playerHistoryMirrorOverlapGate.js';
import { evaluatePlayerHistoryTargetPopulationGate } from '../src/rehearsal/playerHistoryTargetPopulationGate.js';
import type {
  PlayerHistoryOutcomeMirror,
  PlayerHistoryRunPopulationInputMirror,
} from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-02';
const OUTCOME_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json';
const INPUT_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json';
const REVERIFY_JSON_REL = `docs/reports/player-history-source-gate-reverification-${REPORT_DATE}.json`;
const TP_GATE_JSON_REL = `docs/reports/player-history-target-population-gate-${REPORT_DATE}.json`;
const TP_GATE_MD_REL = `docs/reports/player-history-target-population-gate-${REPORT_DATE}.md`;
const MATRIX_JSON_REL = `docs/reports/player-history-real-population-dry-run-matrix-${REPORT_DATE}.json`;
const MATRIX_MD_REL = `docs/reports/player-history-real-population-dry-run-matrix-${REPORT_DATE}.md`;
const OVERLAP_JSON_REL = `docs/reports/player-history-mirror-overlap-gate-${REPORT_DATE}.json`;
const OVERLAP_MD_REL = `docs/reports/player-history-mirror-overlap-gate-${REPORT_DATE}.md`;

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;
const writeJson = (rel: string, value: unknown): void =>
  writeFileSync(path.join(REPO_ROOT, rel), `${JSON.stringify(value, null, 2)}\n`, 'utf-8');

const NON_GOALS_MD = `- No Forecast run occurred; no Run 3 was created.
- No model was trained, tuned, evaluated, or compared; no MAE/RMSE/Pearson/rank-correlation was computed.
- No production feature binding occurred; nothing was wired into \`seasonalPprModel.ts\`; the baseline is unchanged.
- No Data artifact was promoted; no TIBER-Data/Teamstate change was made.
- No player-history signal is claimed.`;

const outcomeMirror = readJson<PlayerHistoryOutcomeMirror>(OUTCOME_MIRROR_REL);
const inputMirror = readJson<PlayerHistoryRunPopulationInputMirror>(INPUT_MIRROR_REL);
const reverify = readJson<{ decision: string }>(REVERIFY_JSON_REL);

// ---- 1. Target-population gate ----------------------------------------------------------------------
const tpGate = evaluatePlayerHistoryTargetPopulationGate(outcomeMirror);
writeJson(TP_GATE_JSON_REL, {
  report_version: 'player-history-target-population-gate-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#109',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  outcome_mirror_inspected: { path: OUTCOME_MIRROR_REL, governed_source: outcomeMirror.governed_source },
  gate_result: tpGate,
});
writeFileSync(
  path.join(REPO_ROOT, TP_GATE_MD_REL),
  `# Player-history target-population gate (#109)

_Generated ${REPORT_DATE} • ${tpGate.gate_version} • status: **${tpGate.status}** • decision: **${tpGate.decision}**_

Evaluates the generated 2025 outcome mirror (\`${OUTCOME_MIRROR_REL}\`, source sha256 \`${outcomeMirror.governed_source.sha256}\`, status \`${outcomeMirror.governed_source.artifactStatus}\`). Ceiling: \`may_continue_to_overlap_gate\` — never \`may_run\`.

| Check | Expected | Observed | Result |
|---|---|---|---|
${tpGate.checks.map((c) => `| ${c.dimension} | \`${c.expected}\` | \`${c.observed}\` | ${c.passed ? 'pass' : 'FAIL'} |`).join('\n')}

- Population: ${tpGate.population_counts.rows} rows / ${tpGate.population_counts.players} players (${Object.entries(tpGate.population_counts.by_position).map(([p, n]) => `${p} ${n}`).join(', ')}); null-outcome rows: ${tpGate.population_counts.null_outcome_rows}
${tpGate.blocking_reasons.length > 0 ? `- Blocking reasons: ${tpGate.blocking_reasons.join('; ')}\n` : ''}
## Non-goals confirmed

${NON_GOALS_MD}
`,
  'utf-8',
);

// ---- 2. Dry-run matrix rerun against the REAL population --------------------------------------------
const targetRows = outcomeMirror.rows.map((row) => ({
  player_id: row.player_id,
  player_name: row.player_name,
  position: row.position,
  ppr_2025_actual: row.season_ppr,
}));
const matrix = buildPlayerHistoryExperimentDryRunMatrix({
  targetPopulation: targetRows,
  playerHistoryRows: inputMirror.rows,
  targetSeason: outcomeMirror.target_season,
  inputSeasons: inputMirror.input_window.seasons,
  baselineSource: {
    path: OUTCOME_MIRROR_REL,
    governance_status: `${outcomeMirror.governed_source.artifactStatus}_outcome_layer_only`,
    data_source: 'generated-mirror-from-pinned-tiber-data-artifact',
  },
  playerHistorySourceRefs: [
    INPUT_MIRROR_REL,
    `${inputMirror.governed_source.repo}:${inputMirror.governed_source.sourceArtifactPath} (sha256 ${inputMirror.governed_source.sha256})`,
  ],
});

const joinedByPosition: Record<string, number> = {};
const noHistoryByPosition: Record<string, number> = {};
for (const row of matrix.matrix_rows) {
  if (row.real_player_history !== null) joinedByPosition[row.position] = (joinedByPosition[row.position] ?? 0) + 1;
  else noHistoryByPosition[row.position] = (noHistoryByPosition[row.position] ?? 0) + 1;
}
const js = matrix.join_summary;
const joinedShare = js.scored_target_rows > 0 ? js.joined_rows / js.scored_target_rows : null;

// The full matrix (610 rows with feature + donor payloads) is deterministic and reproducible via this
// script; the durable JSON report carries the summaries plus a small row sample rather than ~2MB of rows.
writeJson(MATRIX_JSON_REL, {
  report_version: 'player-history-real-population-dry-run-matrix-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#109',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evaluation_kind: 'dry_run_matrix_assembly_only_no_run_no_training_no_metrics',
  mirrors_inspected: {
    outcome_mirror: { path: OUTCOME_MIRROR_REL, governed_source: outcomeMirror.governed_source },
    input_mirror: { path: INPUT_MIRROR_REL, governed_source: inputMirror.governed_source },
  },
  matrix_summary: {
    version: matrix.version,
    row_kind: matrix.row_kind,
    status: matrix.status,
    target_season: matrix.target_season,
    input_seasons: matrix.input_seasons,
    arms: matrix.arms,
    matrix_row_count: matrix.matrix_rows.length,
    join_summary: matrix.join_summary,
    joined_share: joinedShare,
    joined_rows_by_position: joinedByPosition,
    no_history_rows_by_position: noHistoryByPosition,
    family_coverage: matrix.family_coverage,
    missingness_summary: {
      joined_rows_inspected: matrix.missingness.joined_rows_inspected,
      distinct_feature_paths_with_nulls: Object.keys(matrix.missingness.null_counts_by_feature_path).length,
      total_null_cells: Object.values(matrix.missingness.null_counts_by_feature_path).reduce((a, b) => a + b, 0),
      zero_value_paths_observed_count: matrix.missingness.zero_value_paths_observed.length,
    },
    shuffled_control: matrix.shuffled_control,
    outcome_values_omitted_from_matrix_rows: true,
    baseline_population_is_fixture_scaffold_warning: matrix.baseline_population_is_fixture_scaffold_warning,
  },
  matrix_row_sample_first_3: matrix.matrix_rows.slice(0, 3),
  full_matrix_reproduction: 'Deterministic: regenerate via `npm run gate:player-history-population` (same mirrors + seed -> byte-identical matrix).',
  boundary_statements: matrix.boundary_statements,
});
writeFileSync(
  path.join(REPO_ROOT, MATRIX_MD_REL),
  `# Real-population dry-run matrix rerun (#109)

_Generated ${REPORT_DATE} • ${matrix.version} • status: **${matrix.status}**_

Dry-run matrix reassembled against the REAL target population (the #109 outcome mirror) and the regenerated input mirror. Assembly and counting only — no metrics, no training, no run.

- Target population: ${js.target_population_size} (scored: ${js.scored_target_rows}, outcome-unavailable: ${js.unavailable_target_rows})
- Matrix rows: **${matrix.matrix_rows.length}** (row_kind: \`${matrix.row_kind}\`)
- Joined rows: **${js.joined_rows}** (share: **${joinedShare === null ? 'n/a' : (joinedShare * 100).toFixed(1)}%**)
- Joined by position: ${Object.entries(joinedByPosition).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- No-history rows by position: ${Object.entries(noHistoryByPosition).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- Feature-only exclusions: ${js.feature_players_without_target_row}; outcome-unavailable exclusions: ${js.unavailable_target_rows}
- Null/missingness: ${Object.keys(matrix.missingness.null_counts_by_feature_path).length} distinct feature paths carry nulls across ${matrix.missingness.joined_rows_inspected} joined rows (${Object.values(matrix.missingness.null_counts_by_feature_path).reduce((a, b) => a + b, 0)} null cells); ${matrix.missingness.zero_value_paths_observed.length} paths show real zeros preserved distinct from nulls
- Shuffled-control posture: \`${matrix.shuffled_control.method}\`, seed ${matrix.shuffled_control.seed}, groups: ${matrix.shuffled_control.groups.map((g) => `${g.position} ${g.feature_bearing_row_count}${g.derangement_applied ? ' (deranged)' : ''}`).join(', ')}; metrics computed: **${matrix.shuffled_control.metrics_computed}**
- Outcome values are omitted from matrix rows by construction.
- Fixture warning: ${matrix.baseline_population_is_fixture_scaffold_warning ?? 'none — the target population is the real generated outcome mirror (candidate artifact, outcome-layer-only), not the n=38 fixture.'}

## Non-goals confirmed

${NON_GOALS_MD}
`,
  'utf-8',
);

// ---- 3. Mirror-overlap gate --------------------------------------------------------------------------
const overlap = evaluatePlayerHistoryMirrorOverlapGate({
  source_gate_reverification_decision: reverify.decision,
  target_population_gate_decision: tpGate.decision,
  scored_target_rows: js.scored_target_rows,
  joined_rows: js.joined_rows,
  joined_rows_by_position: joinedByPosition,
  shuffle_groups: matrix.shuffled_control.groups.map((g) => ({
    position: g.position,
    feature_bearing_row_count: g.feature_bearing_row_count,
    derangement_possible: g.derangement_possible,
  })),
});
writeJson(OVERLAP_JSON_REL, {
  report_version: 'player-history-mirror-overlap-gate-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#109',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evidence_sources: {
    source_gate_reverification: REVERIFY_JSON_REL,
    target_population_gate: TP_GATE_JSON_REL,
    dry_run_matrix: MATRIX_JSON_REL,
  },
  gate_result: overlap,
  next_allowed_step:
    overlap.decision === 'may_authorize_run_issue'
      ? 'Open a SEPARATE issue -- Forecast: authorize controlled player-history run after population gate -- which must pass its own review before any arm is run or any metric is computed. This gate result authorizes opening that issue and nothing else.'
      : 'Fix the first blocking dimension (see blocking_reasons), regenerate mirrors/reports, and re-run this gate. Do not open a run-authorizing issue.',
});
writeFileSync(
  path.join(REPO_ROOT, OVERLAP_MD_REL),
  `# Player-history mirror-overlap gate (#109)

_Generated ${REPORT_DATE} • ${overlap.gate_version} • status: **${overlap.status}** • decision: **${overlap.decision}**_

Evaluates the regenerated real-population dry-run matrix against the pre-registered #107/PR #108 overlap floors. Ceiling: \`may_authorize_run_issue\` — the gate's decision type has no \`may_run\` value; passing authorizes only opening a separate run-authorizing issue.

## Thresholds vs observed

| Check | Expected | Observed | Result |
|---|---|---|---|
${overlap.checks.map((c) => `| ${c.dimension} | \`${c.expected}\` | \`${c.observed}\` | ${c.passed ? 'pass' : 'FAIL'} |`).join('\n')}

- Decision: **\`${overlap.decision}\`**
${overlap.blocking_reasons.length > 0 ? `- Blocking reasons: ${overlap.blocking_reasons.join('; ')}\n` : ''}- Next allowed step: ${
    overlap.decision === 'may_authorize_run_issue'
      ? 'open a SEPARATE run-authorizing issue (which must pass its own review before any metric is computed). Nothing else is authorized.'
      : 'fix the first blocking dimension and re-run this gate; do not open a run-authorizing issue.'
  }

## Non-goals confirmed

${NON_GOALS_MD}

## Reproduce

\`\`\`bash
npm run gate:player-history-population   # regenerate all three reports (network-free)
npm run build && npm test
\`\`\`
`,
  'utf-8',
);

process.stderr.write(
  `target-population gate: ${tpGate.decision}\n` +
    `dry-run matrix: ${matrix.matrix_rows.length} rows, ${js.joined_rows} joined (${joinedShare === null ? 'n/a' : (joinedShare * 100).toFixed(1)}%), by position ${JSON.stringify(joinedByPosition)}\n` +
    `mirror-overlap gate: ${overlap.decision}\n` +
    `  wrote ${TP_GATE_JSON_REL} / .md\n  wrote ${MATRIX_JSON_REL} / .md\n  wrote ${OVERLAP_JSON_REL} / .md\n`,
);
