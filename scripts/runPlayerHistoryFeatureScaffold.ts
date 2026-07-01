/**
 * Extract player-history features from the mirrored 2022-2024 TIBER-Data input window and write a
 * durable scaffold report (Forecast issue #103). Reproducible, network-free:
 *
 *   npm run scaffold:player-history-features
 *
 * Writes docs/reports/player-history-feature-scaffold-2026-07-01.{json,md}. This is scaffold /
 * feature-extraction only: it performs NO Forecast run, no Run 3, no model training/tuning/evaluation,
 * no baseline change, no wiring into seasonalPprModel.ts, no shuffled control, no three-arm comparison,
 * no TIBER-Data/Teamstate change, no Data artifact promotion, and makes NO player-history signal claim.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_PLAYER_HISTORY_FEATURE_FAMILIES,
  EXCLUDED_UNAVAILABLE_USAGE_FIELDS,
  PLAYER_HISTORY_FEATURE_SCAFFOLD_VERSION,
  buildPlayerHistoryFeatures,
  summarizePlayerHistoryCoverage,
  type PlayerHistoryInputRow,
} from '../src/rehearsal/playerHistoryFeatureScaffold.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-01';
const MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.input_mirror.json';
const REPORT_JSON_REL = `docs/reports/player-history-feature-scaffold-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-feature-scaffold-${REPORT_DATE}.md`;
const TARGET_SEASON = 2025;

interface InputWindowMirror {
  issue: string;
  governed_source: { repo: string; sourceArtifactPath: string; sha256: string; schemaPath: string; validatorPath: string };
  refs: string[];
  input_window: { seasons: number[]; season_type: string; positions_present_in_sample: string[]; target_season_excluded: number };
  row_sample_selection_rationale: Record<string, string>;
  rows: PlayerHistoryInputRow[];
}

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const mirror = readJson<InputWindowMirror>(MIRROR_REL);
const features = buildPlayerHistoryFeatures(mirror.rows, { targetSeason: TARGET_SEASON });
const coverageSummary = summarizePlayerHistoryCoverage(mirror.rows, TARGET_SEASON);

const report = {
  report_version: 'player-history-feature-scaffold-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#103',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  scaffold_version: PLAYER_HISTORY_FEATURE_SCAFFOLD_VERSION,
  evaluation_kind: 'feature_extraction_scaffold_only_no_run_no_binding',
  mirror_inspected: {
    path: MIRROR_REL,
    issue: mirror.issue,
    governed_source: mirror.governed_source,
    refs: mirror.refs,
    input_window: mirror.input_window,
    row_sample_selection_rationale: mirror.row_sample_selection_rationale,
  },
  status_statements: {
    forecast_did_not_run: true,
    no_run3_occurred: true,
    no_model_training_tuning_evaluation_occurred: true,
    no_baseline_change_occurred: true,
    no_feature_binding_into_seasonal_ppr_model_occurred: true,
    no_shuffled_control_or_three_arm_comparison_occurred: true,
    no_tiber_data_or_teamstate_change_occurred: true,
    no_data_artifact_promotion_occurred: true,
    no_2025_summaries_consumed_as_2025_input: true,
    no_active_or_ownership_status_inferred: true,
    no_null_to_zero_coercion_performed: true,
    no_player_history_signal_claimed: true,
  },
  feature_families_implemented: ALL_PLAYER_HISTORY_FEATURE_FAMILIES,
  unavailable_usage_fields_excluded: EXCLUDED_UNAVAILABLE_USAGE_FIELDS,
  null_handling_policy: {
    summary:
      'Missing prior seasons and missing source fields stay null; a real value of 0 (e.g. a near-zero game) is never confused with an absent observation. A pure, tested train-fold mean imputation helper (computePlayerHistoryTrainFoldMeans / imputePlayerHistoryValue) is provided for later model code to use per LOOCV fold -- this scaffold does not run or fit anything with it.',
    adapted_from: 'src/rehearsal/runRun2TeamstateComparison.ts (Run 2 Teamstate wrapper), not Run 1\'s seasonalPprModel.ts, which zero-fills missing numeric features by default',
    wired_into_model: false,
  },
  target_season: TARGET_SEASON,
  input_window_coverage_summary: coverageSummary,
  feature_rows_built: features.length,
  feature_rows: features,
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

const md = `# Player-history feature extraction scaffold (#103)

_Generated ${REPORT_DATE} • record ${report.report_version} • scaffold ${PLAYER_HISTORY_FEATURE_SCAFFOLD_VERSION}_

Feature-extraction scaffold only: this extracts candidate player-history features from the mirrored, real, sha256-pinned 2022-2024 TIBER-Data input window for target season ${TARGET_SEASON}. It performs **no** Forecast run, no Run 3, no model training/tuning/evaluation, no baseline change, no wiring into \`seasonalPprModel.ts\`, no shuffled control, no three-arm comparison, no TIBER-Data/Teamstate change, no Data artifact promotion, and makes **no player-history signal claim**.

## 1. Mirror inspected

- Mirror file: \`${MIRROR_REL}\`
- Governed source: \`${mirror.governed_source.repo}:${mirror.governed_source.sourceArtifactPath}\`
- sha256: \`${mirror.governed_source.sha256}\`
- Input seasons: ${mirror.input_window.seasons.join(', ')} (season_type=${mirror.input_window.season_type})
- Target season (excluded as input): ${mirror.input_window.target_season_excluded}
- Refs: ${mirror.refs.map((r) => `\`${r}\``).join(', ')}

## 2. Status statements

${Object.entries(report.status_statements).map(([k, v]) => `- ${k}: **${v}**`).join('\n')}

## 3. Feature families implemented (independently toggleable)

${ALL_PLAYER_HISTORY_FEATURE_FAMILIES.map((f) => `- \`${f}\``).join('\n')}

## 4. Unavailable usage fields (structurally excluded, never zero-filled)

${EXCLUDED_UNAVAILABLE_USAGE_FIELDS.map((f) => `- \`${f}\``).join('\n')}

## 5. Null-handling policy (designed here; NOT wired into any model)

${report.null_handling_policy.summary}

Adapted from: \`${report.null_handling_policy.adapted_from}\`.

## 6. Input-window coverage summary

- Target season: ${coverageSummary.target_season}
- Input seasons present: ${coverageSummary.input_seasons_present.join(', ')}
- Total players: ${coverageSummary.total_players}
- Players by seasons-observed count: ${JSON.stringify(coverageSummary.players_by_seasons_observed_count)}
- Rows considered: ${coverageSummary.rows_considered}
- Rows rejected for leakage (season >= target): ${coverageSummary.rows_rejected_for_leakage}

## 7. Feature rows built

Built ${features.length} candidate feature row(s), one per real mirrored player (row_kind: \`player_history_feature_candidate_not_model_ready\`):

${features.map((f) => `- \`${f.player_id}\` (${f.player_name}, ${f.position}): input_seasons_considered=[${f.input_seasons_considered.join(', ')}]`).join('\n')}

## 8. Non-goals confirmed

- No Forecast run occurred.
- No Run 3 occurred.
- No feature was bound into \`seasonalPprModel.ts\`'s numeric feature list.
- No model was trained, tuned, or evaluated.
- No shuffled control or three-arm comparison ran.
- No TIBER-Data or Teamstate change was made.
- No Data artifact was promoted.
- No 2025 summary was consumed as a 2025 input.
- No active/inactive/IR/practice-squad/ownership status was inferred.
- No null value was coerced to zero.
- No player-history signal is claimed by this report.

## Reproduce

\`\`\`bash
npm run scaffold:player-history-features   # regenerate this report (network-free)
npm run build                              # tsc --noEmit
npm test                                   # incl. tests/playerHistoryFeatureScaffold*.test.ts
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(`built ${features.length} feature row(s) for target_season=${TARGET_SEASON}\n`);
process.stderr.write(`  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`);
