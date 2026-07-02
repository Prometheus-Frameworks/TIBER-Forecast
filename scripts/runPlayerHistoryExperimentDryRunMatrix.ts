/**
 * Assemble the controlled player-history experiment DRY-RUN matrix and write a durable report
 * (Forecast issue #105). Reproducible, network-free:
 *
 *   npm run dryrun:player-history-matrix
 *
 * Writes docs/reports/player-history-experiment-dry-run-matrix-2026-07-02.{json,md}. DRY RUN ONLY:
 * no Forecast run, no Run 3, no model training/tuning/evaluation, no MAE/RMSE/Pearson/rank
 * correlation, no baseline change, no production feature binding, no seasonalPprModel.ts wiring, no
 * TIBER-Data/Teamstate change, no null-to-zero coercion, and no signal claim.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPlayerHistoryExperimentDryRunMatrix,
} from '../src/rehearsal/playerHistoryExperimentDryRunMatrix.js';
import type { PlayerHistoryInputRow } from '../src/rehearsal/playerHistoryFeatureScaffold.js';
import { seasonalPprSeedSnapshot } from '../src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-02';
const MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.input_mirror.json';
const BASELINE_REL = 'src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts';
const REPORT_JSON_REL = `docs/reports/player-history-experiment-dry-run-matrix-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-experiment-dry-run-matrix-${REPORT_DATE}.md`;
const TARGET_SEASON = 2025;

interface InputWindowMirror {
  issue: string;
  governed_source: { repo: string; sourceArtifactPath: string; sha256: string };
  refs: string[];
  input_window: { seasons: number[]; season_type: string; target_season_excluded: number };
  rows: PlayerHistoryInputRow[];
}

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const mirror = readJson<InputWindowMirror>(MIRROR_REL);

const matrix = buildPlayerHistoryExperimentDryRunMatrix({
  targetPopulation: seasonalPprSeedSnapshot,
  playerHistoryRows: mirror.rows,
  targetSeason: TARGET_SEASON,
  inputSeasons: mirror.input_window.seasons,
  baselineSource: {
    path: BASELINE_REL,
    governance_status: 'fixture',
    data_source: 'bundled-scaffold',
  },
  playerHistorySourceRefs: [
    MIRROR_REL,
    `${mirror.governed_source.repo}:${mirror.governed_source.sourceArtifactPath} (sha256 ${mirror.governed_source.sha256})`,
  ],
});

const report = {
  report_version: 'player-history-experiment-dry-run-matrix-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#105',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  predecessor_refs: [
    'TIBER-Data#184', 'TIBER-Data#185', 'TIBER-Data#186', 'TIBER-Data#187',
    'TIBER-Data#188', 'TIBER-Data#189', 'TIBER-Data#190', 'TIBER-Data#191',
    'TIBER-Forecast#99', 'TIBER-Forecast#100', 'TIBER-Forecast#101', 'TIBER-Forecast#102',
    'TIBER-Forecast#103', 'TIBER-Forecast#104',
  ],
  evaluation_kind: 'dry_run_matrix_assembly_only_no_run_no_training_no_metrics',
  mirror_inspected: {
    path: MIRROR_REL,
    issue: mirror.issue,
    governed_source: mirror.governed_source,
    input_window: mirror.input_window,
    refs: mirror.refs,
  },
  baseline_inspected: matrix.baseline_source,
  next_allowed_step:
    'Open a SEPARATE issue to authorize the controlled three-arm run (baseline_only vs real_player_history_features vs shuffled_player_history_control). That issue must state which target population is used (prefer a real mounted TIBER-Data 2025 outcome population over the n=38 fixture scaffold), re-verify the #99/#100 gate if the mirror changes, and pass its own review before any metric is computed.',
  matrix,
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

const js = matrix.join_summary;
const md = `# Player-history experiment dry-run matrix (#105)

_Generated ${REPORT_DATE} • record ${report.report_version} • matrix ${matrix.version}_

Dry-run matrix assembly only: this proves Forecast can produce baseline-ready, real-player-history-ready, and shuffled-control-ready rows with the correct target/input boundaries, null semantics, provenance, and audit metadata -- **without** running anything. No Forecast run, no Run 3, no model training/tuning/evaluation, no MAE/RMSE/Pearson/rank-correlation, no baseline change, no production feature binding, no \`seasonalPprModel.ts\` wiring, no TIBER-Data/Teamstate change, and **no player-history signal claim**.

## 1. Inputs inspected

- Player-history mirror: \`${MIRROR_REL}\` (from #103/PR #104)
- Governed source: \`${mirror.governed_source.repo}:${mirror.governed_source.sourceArtifactPath}\`
- sha256: \`${mirror.governed_source.sha256}\`
- Baseline/target population: \`${matrix.baseline_source.path}\` (governance: \`${matrix.baseline_source.governance_status}\`, source: \`${matrix.baseline_source.data_source}\`)
- Target season: ${matrix.target_season} • Input seasons: ${matrix.input_seasons.join(', ')} (REG only, QB/RB/WR/TE only)
- Predecessors: ${report.predecessor_refs.map((r) => `\`${r}\``).join(', ')}

## 2. Boundary enforcement (inherited from the #104 scaffold, fail-closed)

- No \`season >= ${matrix.target_season}\` player-history row can enter features (leakage filter).
- No pre-target row outside the approved input window (${matrix.input_seasons.join(', ')}) can enter.
- Non-REG rows and positions outside QB/RB/WR/TE fail closed.
- Forbidden active/inactive/IR/practice-squad/ownership fields fail closed.
- No null/unavailable value is converted to zero anywhere in the matrix.
- Baseline outcome values are deliberately NOT copied into matrix rows (presence only), so this artifact cannot be reused as a training/evaluation table.

## 3. Arm structure (labels/shape only -- never evaluated here)

${matrix.arms.map((arm, i) => `${i + 1}. \`${arm}\``).join('\n')}

## 4. Matrix + join/exclusion summary

- Matrix rows built: **${matrix.matrix_rows.length}** (row_kind: \`${matrix.row_kind}\`)
- Target population size: ${js.target_population_size} (scored: ${js.scored_target_rows}, outcome-unavailable: ${js.unavailable_target_rows})
- Player-history feature players: ${js.player_history_feature_players}
- Joined rows (target row + real features): **${js.joined_rows}**
- Target rows without player-history features: ${js.target_rows_without_player_history_features}
- Feature players without a target row: ${js.feature_players_without_target_row}
- Exclusions:
${js.exclusions.map((e) => `  - \`${e.player_id}\` (${e.player_name}, ${e.position}): ${e.reason}`).join('\n')}

The zero join count is the honest, expected outcome today: the compact #104 mirror (4 players chosen for edge-case coverage) and the n=38 fixture population share no player. The join machinery itself is proven by tests with synthetic aligned identities; widening the mirror to cover the target population is work for the run-authorizing issue.

## 5. Feature-family coverage

${matrix.family_coverage.map((f) => `- \`${f.family}\`: ${f.rows_with_family_available}/${f.matrix_rows_total} matrix rows`).join('\n')}

## 6. Null / missingness posture

- Posture: \`${matrix.null_handling_posture}\`
- Joined rows inspected: ${matrix.missingness.joined_rows_inspected}
- Null counts by feature path: ${Object.keys(matrix.missingness.null_counts_by_feature_path).length === 0 ? 'none (no joined rows to inspect)' : JSON.stringify(matrix.missingness.null_counts_by_feature_path)}
- Real zeros observed (preserved distinct from nulls): ${matrix.missingness.zero_value_paths_observed.length === 0 ? 'none (no joined rows to inspect)' : matrix.missingness.zero_value_paths_observed.map((p) => `\`${p}\``).join(', ')}
- Later train-fold mean imputation (the #104 primitives) would fit per-column means from TRAINING-fold rows only, per fold; nothing was fitted here.

## 7. Shuffled-control posture

- Method: \`${matrix.shuffled_control.method}\` • Seed: ${matrix.shuffled_control.seed} • Stratified by position: ${matrix.shuffled_control.stratified_by_position}
- Metrics computed: **${matrix.shuffled_control.metrics_computed}**
- Groups:
${matrix.shuffled_control.groups.map((g) => `  - ${g.position}: ${g.feature_bearing_row_count} feature-bearing row(s); derangement possible: ${g.derangement_possible}; applied: ${g.derangement_applied}`).join('\n')}
- ${matrix.shuffled_control.note}

## 8. Baseline population warning

${matrix.baseline_population_is_fixture_scaffold_warning ?? 'None.'}

## 9. Non-goals confirmed

- No Forecast run occurred.
- No Run 3 was created.
- No model was trained, tuned, evaluated, or compared.
- No MAE/RMSE/Pearson/rank-correlation was computed for any arm.
- No baseline was changed.
- No production feature binding occurred; nothing was wired into \`seasonalPprModel.ts\`.
- No TIBER-Data or Teamstate change was made; no Data artifact was promoted.
- No 2025 player-season summary was consumed as a 2025 input feature.
- No active/inactive/IR/practice-squad/ownership status was inferred.
- No null/unavailable value was coerced to zero.
- No player-history signal is claimed.
- No fantasy advice, rankings, start/sit, trade, draft, or product output was produced.

## 10. Next allowed step

${report.next_allowed_step}

## Reproduce

\`\`\`bash
npm run dryrun:player-history-matrix   # regenerate this report (network-free)
npm run build                          # tsc --noEmit
npm test                               # incl. tests/playerHistoryExperimentDryRunMatrix.test.ts
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `dry-run matrix: ${matrix.matrix_rows.length} rows, ${js.joined_rows} joined, ${js.exclusions.length} exclusions (no run, no metrics)\n`,
);
process.stderr.write(`  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`);
