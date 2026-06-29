import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import type { ScoringPosition } from '../contracts/scoring.js';
import {
  SEASONAL_PPR_INPUT_SEASON,
  SEASONAL_PPR_TARGET_DEFINITION,
  SEASONAL_PPR_TARGET_SEASON,
  type SeasonalPlayerObservation,
  type SeasonalPprDatasetDescriptor,
} from '../contracts/seasonalPprBacktest.js';
import { tiberDataSeasonalPprDataset } from '../datasets/seasonal/tiberDataSeasonalPprDataset.js';
import { seasonalPprNumericFeatureNames } from '../models/seasonal/seasonalPprModel.js';
import { serviceSuccess, type ServiceResult } from '../services/result.js';
import type { Run2FeatureExclusion } from './runRun2FeatureInclusionPreflight.js';
import {
  RUN2_FEATURE_TABLE_REHEARSAL_VERSION,
  buildRun2FeatureTableRehearsal,
  type BuildRun2FeatureTableRehearsalInput,
  type Run2FeatureTableRehearsalReport,
} from './runRun2FeatureTableRehearsal.js';

export const RUN2_FEATURE_MATRIX_CANDIDATE_VERSION = 'run2-feature-matrix-candidate-v1' as const;
export const RUN2_FEATURE_MATRIX_ROW_GRAIN = 'player_season_forecast' as const;

/** The Run 1 target is full-season PPR; it is label-only and never an input feature. */
const RUN1_TARGET_COLUMN = 'ppr_2025_actual' as const;

// Keys that directly name a pressure feature value; pressure is always excluded from the matrix.
const PRESSURE_FEATURE_KEYS = new Set(['pressure', 'pressurerateallowed']);

export type Run2FeatureMatrixJoinStatus = 'fixture_rehearsal_only' | 'governed_values_bound';

export interface Run2FeatureMatrixTargetColumn {
  name: string;
  role: 'label_only';
  available_during_forecast: false;
  joined: false;
  target_definition: typeof SEASONAL_PPR_TARGET_DEFINITION;
  notes: string;
}

export interface Run2FeatureMatrixJoinPosture {
  join_status: Run2FeatureMatrixJoinStatus;
  /** The candidate row grain (Run 2). */
  row_grain: typeof RUN2_FEATURE_MATRIX_ROW_GRAIN;
  /** The Run 1 row grain this is aligned to. */
  run1_row_grain: 'player_season (SeasonalPlayerObservation)';
  /** Keys required to bind governed team-week Teamstate to player-season rows at the cutoff. */
  join_keys_required: string[];
  /** The cutoff that must be enforced so no target-season Teamstate values leak in. */
  cutoff_required: string;
  /** Teamstate columns that would be appended (preflight-included + partial-null). */
  appended_columns: string[];
  /** Why Teamstate values are not yet bound (null) in this candidate. */
  unbound_reason: string | null;
}

export interface Run2FeatureMatrixCandidateRow {
  /** Explicitly a pre-train candidate row, never a model-ready training row. */
  row_kind: 'pre_train_candidate_row_not_model_ready';
  player_id: string;
  position: ScoringPosition;
  team_2024: string;
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  /**
   * Existing Run 1 numeric input features for this row, taken unstandardized from the
   * `SeasonalPlayerObservation` (e.g. `ppr_2024`, `ppr_per_game_2024` derived as Run 1 does).
   * No standardization, training, or prediction — these are the real Run 1 inputs the candidate
   * matrix is built on. The target (`ppr_2025_actual`) is never included here.
   */
  run1_feature_values: Record<string, number>;
  /** Appended governed Teamstate feature columns; `null` until a governed artifact is bound. */
  teamstate_feature_values: Record<string, null>;
  /** Appended partial-null Teamstate columns; `null` preserves upstream nulls (never zero-filled). */
  teamstate_partial_null_values: Record<string, null>;
  /** Run 1 target carried label-only, kept out of every feature group. */
  target: { column: typeof RUN1_TARGET_COLUMN; role: 'label_only'; value: number | null };
}

export interface Run2FeatureMatrixCandidateReport {
  candidate_version: typeof RUN2_FEATURE_MATRIX_CANDIDATE_VERSION;
  candidate_status: 'pre_train_feature_matrix_candidate';
  execution_status: 'not_trained';
  evaluation_status: 'not_evaluated';
  run_2_executed: false;
  row_grain: typeof RUN2_FEATURE_MATRIX_ROW_GRAIN;
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  target_definition: typeof SEASONAL_PPR_TARGET_DEFINITION;
  row_count: number;
  /** Candidate feature schema: Run 1 numeric features + appended governed Teamstate columns. */
  feature_columns: string[];
  run1_feature_columns: string[];
  teamstate_feature_columns: string[];
  /** Appended partial-null Teamstate columns (preserved null). */
  partial_null_columns: string[];
  /** Columns blocked from the feature matrix, with explicit reasons. */
  excluded_columns: Run2FeatureExclusion[];
  /** Label-only target columns; never input features. */
  target_columns: Run2FeatureMatrixTargetColumn[];
  /** Identity / provenance columns (not predictive features). */
  metadata_columns: string[];
  teamstate_join_posture: Run2FeatureMatrixJoinPosture;
  pressure_status: 'unavailable_insufficient_data_deferred_excluded';
  target_leakage_status: 'no_target_derived_fields_included';
  teamstate_governance: Run2FeatureTableRehearsalReport['teamstate_governance'];
  source_governance: unknown;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  /** Candidate rows on the Run 1 player-season grain (Teamstate columns unbound under fixture posture). */
  candidate_rows: Run2FeatureMatrixCandidateRow[];
  /** Linkage to the feature table rehearsal (which links the preflight and manifest rehearsal). */
  feature_table_rehearsal: Run2FeatureTableRehearsalReport;
  notes: string[];
}

export interface BuildRun2FeatureMatrixCandidateInput extends BuildRun2FeatureTableRehearsalInput {
  /** Run 1 seasonal dataset whose observations define the candidate row grain. Defaults to the scaffold dataset. */
  dataset?: SeasonalPprDatasetDescriptor;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFeatureTableReport = (value: unknown): value is Run2FeatureTableRehearsalReport =>
  isRecord(value) && value.rehearsal_version === RUN2_FEATURE_TABLE_REHEARSAL_VERSION;

const isBlockedColumn = (column: string): boolean =>
  PRESSURE_FEATURE_KEYS.has(column.toLowerCase()) || column === RUN1_TARGET_COLUMN;

// Unstandardized Run 1 numeric feature value, derived exactly as the seasonal ridge model does
// (`ppr_per_game_2024` is ppr/games, guarded for zero games). No standardization or training.
const run1NumericFeatureValue = (observation: SeasonalPlayerObservation, name: string): number => {
  switch (name) {
    case 'ppr_2024':
      return observation.ppr_2024;
    case 'ppr_per_game_2024':
      return observation.games_2024 > 0 ? observation.ppr_2024 / observation.games_2024 : 0;
    case 'games_2024':
      return observation.games_2024;
    case 'targets_2024':
      return observation.targets_2024;
    case 'rush_attempts_2024':
      return observation.rush_attempts_2024;
    default:
      return 0;
  }
};

/**
 * Builds a pre-train Run 2 feature matrix candidate: governed, preflight-allowed Teamstate columns
 * attached to the existing Run 1 player-season grain (`SeasonalPlayerObservation`).
 *
 * Grounded in the full chain — readGovernedTeamstateInput → buildRun2ManifestRehearsal →
 * buildRun2FeatureInclusionPreflight → buildRun2FeatureTableRehearsal — which it does not bypass:
 * pass a governed Teamstate readiness report (run through the full chain, failing closed on
 * ungoverned/fabricated input) or a prebuilt feature table rehearsal report (its preflight is
 * re-derived and re-hardened). The Run 1 target (`ppr_2025_actual`) is carried label-only, the 2024
 * input-season cutoff and player population/fold identity are preserved, and Teamstate values stay
 * unbound (`null`) under a fixture join posture. No training, evaluation, or Run 2 execution.
 */
export const buildRun2FeatureMatrixCandidate = (
  input: unknown,
  options: BuildRun2FeatureMatrixCandidateInput = {},
): ServiceResult<Run2FeatureMatrixCandidateReport> => {
  const targetColumns = options.target_columns ?? [RUN1_TARGET_COLUMN];
  // Re-derive (and re-harden) the feature table rehearsal from the chain; never trust supplied lists.
  const featureTableResult = isFeatureTableReport(input)
    ? buildRun2FeatureTableRehearsal(input.preflight, { ...options, target_columns: targetColumns })
    : buildRun2FeatureTableRehearsal(input, { ...options, target_columns: targetColumns });
  if (!featureTableResult.ok) return featureTableResult;

  const featureTable = featureTableResult.data;
  const dataset = options.dataset ?? tiberDataSeasonalPprDataset;

  // Only preflight-included / partial-null Teamstate columns are eligible; defensively drop any
  // pressure-named or target-named column that should never reach the feature matrix.
  const teamstateFeatureColumns = featureTable.feature_columns.filter((column) => !isBlockedColumn(column));
  const teamstatePartialNullColumns = featureTable.partial_null_columns.filter((column) => !isBlockedColumn(column));
  const run1FeatureColumns = [...seasonalPprNumericFeatureNames];
  const featureColumns = [...run1FeatureColumns, ...teamstateFeatureColumns];

  const nullColumns = (columns: string[]): Record<string, null> =>
    Object.fromEntries(columns.map((column) => [column, null]));

  const candidateRows: Run2FeatureMatrixCandidateRow[] = dataset.observations.map((observation) => ({
    row_kind: 'pre_train_candidate_row_not_model_ready',
    player_id: observation.player_id,
    position: observation.position,
    team_2024: observation.team_2024,
    input_season: SEASONAL_PPR_INPUT_SEASON,
    target_season: SEASONAL_PPR_TARGET_SEASON,
    run1_feature_values: Object.fromEntries(
      run1FeatureColumns.map((column) => [column, run1NumericFeatureValue(observation, column)]),
    ),
    teamstate_feature_values: nullColumns(teamstateFeatureColumns),
    teamstate_partial_null_values: nullColumns(teamstatePartialNullColumns),
    target: { column: RUN1_TARGET_COLUMN, role: 'label_only', value: observation.ppr_2025_actual },
  }));

  const appendedColumns = [...teamstateFeatureColumns, ...teamstatePartialNullColumns];

  const targetColumnSpecs: Run2FeatureMatrixTargetColumn[] = [
    {
      name: RUN1_TARGET_COLUMN,
      role: 'label_only',
      available_during_forecast: false,
      joined: false,
      target_definition: SEASONAL_PPR_TARGET_DEFINITION,
      notes: 'Run 1 target carried label-only; not an input feature, not joined, unknowable at forecast-construction time.',
    },
  ];

  return serviceSuccess({
    candidate_version: RUN2_FEATURE_MATRIX_CANDIDATE_VERSION,
    candidate_status: 'pre_train_feature_matrix_candidate',
    execution_status: 'not_trained',
    evaluation_status: 'not_evaluated',
    run_2_executed: false,
    row_grain: RUN2_FEATURE_MATRIX_ROW_GRAIN,
    input_season: SEASONAL_PPR_INPUT_SEASON,
    target_season: SEASONAL_PPR_TARGET_SEASON,
    target_definition: SEASONAL_PPR_TARGET_DEFINITION,
    row_count: candidateRows.length,
    feature_columns: featureColumns,
    run1_feature_columns: run1FeatureColumns,
    teamstate_feature_columns: teamstateFeatureColumns,
    partial_null_columns: teamstatePartialNullColumns,
    excluded_columns: featureTable.excluded_columns,
    target_columns: targetColumnSpecs,
    metadata_columns: ['player_id', 'position', 'team_2024', 'input_season', 'target_season'],
    teamstate_join_posture: {
      join_status: 'fixture_rehearsal_only',
      row_grain: RUN2_FEATURE_MATRIX_ROW_GRAIN,
      run1_row_grain: 'player_season (SeasonalPlayerObservation)',
      join_keys_required: ['player_input_season_team (team_2024)', 'input_season'],
      cutoff_required:
        'Teamstate team-week values aggregated to the 2024 input season only; no target-season (2025) Teamstate values may be joined.',
      appended_columns: appendedColumns,
      unbound_reason:
        'No governed mounted Teamstate artifact with a recorded forecast cutoff; Teamstate column values remain null (not yet bound).',
    },
    pressure_status: 'unavailable_insufficient_data_deferred_excluded',
    target_leakage_status: 'no_target_derived_fields_included',
    teamstate_governance: featureTable.teamstate_governance,
    source_governance: featureTable.source_governance,
    source_artifact_refs: featureTable.source_artifact_refs,
    validation_refs: featureTable.validation_refs,
    lineage_refs: featureTable.lineage_refs,
    candidate_rows: candidateRows,
    feature_table_rehearsal: featureTable,
    notes: [
      'Run 2 feature matrix candidate: governed, preflight-allowed Teamstate columns attached to the Run 1 player-season grain.',
      'Pre-train only: no training, evaluation, Run 2 execution, or Run 1 vs Run 2 comparison. Teamstate values are unbound (null) under a fixture join posture.',
      'Run 1 target (ppr_2025_actual) is label-only; pressure stays unavailable/insufficient_data/deferred and excluded; partial-null columns preserve nulls (never zero-filled).',
    ],
  });
};
