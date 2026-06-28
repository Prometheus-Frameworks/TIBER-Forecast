import type { ProjectionArtifactRef } from '../contracts/projectionArtifacts.js';
import type { ForecastTeamstateInputMetadata } from '../contracts/teamstateInput.js';
import { serviceSuccess, type ServiceResult } from '../services/result.js';
import type { BuildRun2ManifestRehearsalInput } from './runRun2ManifestRehearsal.js';
import {
  RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION,
  buildRun2FeatureInclusionPreflight,
  type Run2FeatureExclusion,
  type Run2FeatureInclusionPreflightReport,
} from './runRun2FeatureInclusionPreflight.js';

export const RUN2_FEATURE_TABLE_REHEARSAL_VERSION = 'run2-feature-table-rehearsal-v1' as const;
export const RUN2_FEATURE_TABLE_ROW_GRAIN = 'player_season_forecast_rehearsal' as const;

const DEFAULT_FORECAST_INPUT_SEASON = 2024;
const DEFAULT_METADATA_COLUMNS = ['player_id', 'forecast_input_season'] as const;
// The Run 2 target is full-season PPR for the forecast season (label-only, not joined into inputs).
const DEFAULT_TARGET_COLUMNS = ['fullSeasonPprActual'] as const;
const DEFAULT_REHEARSAL_ROW_COUNT = 2;

export type Run2FeatureTableRehearsalStatus = 'feature_table_shape_only';

export interface Run2FeatureTableTargetColumn {
  name: string;
  /** Targets are labels only — never an input feature. */
  role: 'label_only';
  /** A future-season target is not knowable at forecast-construction time. */
  available_during_forecast: false;
  /** Targets are not joined into the feature rows (kept separate to prevent leakage). */
  joined: false;
  notes: string;
}

export interface Run2FeatureTableRehearsalRow {
  /** Explicitly a shape-only rehearsal row, never a model-ready training row. */
  row_kind: 'rehearsal_shape_only_not_model_ready';
  /**
   * Table row keyed by column name. Metadata columns carry toy placeholders; feature and
   * partial-null columns are `null` (not populated, never zero-filled or fabricated). Target
   * and pressure columns are intentionally absent.
   */
  columns: Record<string, string | number | null>;
}

export interface Run2FeatureTableRehearsalReport {
  rehearsal_version: typeof RUN2_FEATURE_TABLE_REHEARSAL_VERSION;
  /** Shape only: columns and toy rows, never a real/model-ready feature matrix. */
  rehearsal_status: Run2FeatureTableRehearsalStatus;
  execution_status: 'not_trained';
  evaluation_status: 'not_evaluated';
  run_2_executed: false;
  row_grain: typeof RUN2_FEATURE_TABLE_ROW_GRAIN;
  /** Allowed feature columns (governed, available) from the feature inclusion preflight. */
  feature_columns: string[];
  /** Admitted partial-null columns whose upstream nulls are preserved, never zero-filled. */
  partial_null_columns: string[];
  /** Columns blocked from the feature table, with explicit reasons (pressure, fantasy, leakage, deferred). */
  excluded_columns: Run2FeatureExclusion[];
  /** Label-only target columns kept separate from input features. */
  target_columns: Run2FeatureTableTargetColumn[];
  /** Identity / provenance columns (not predictive features). */
  metadata_columns: string[];
  target_leakage_status: 'no_target_derived_fields_included';
  pressure_status: 'unavailable_insufficient_data_deferred_excluded';
  /** A small number of explicitly-toy rehearsal rows proving the table shape. */
  rehearsal_rows: Run2FeatureTableRehearsalRow[];
  teamstate_governance: ForecastTeamstateInputMetadata['governance'];
  source_governance: unknown;
  source_artifact_refs: ProjectionArtifactRef[];
  validation_refs: ProjectionArtifactRef[];
  lineage_refs: ProjectionArtifactRef[];
  /** Linkage back to the feature inclusion preflight (which links the manifest rehearsal). */
  preflight: Run2FeatureInclusionPreflightReport;
  /** Compact linkage back to the Run 2 manifest rehearsal. */
  manifest_rehearsal_ref: { run_id: string; rehearsal_version: string };
  notes: string[];
}

export interface BuildRun2FeatureTableRehearsalInput extends BuildRun2ManifestRehearsalInput {
  target_columns?: string[];
  metadata_columns?: string[];
  forecast_input_season?: number;
  rehearsal_row_count?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPreflightReport = (value: unknown): value is Run2FeatureInclusionPreflightReport =>
  isRecord(value) && value.preflight_version === RUN2_FEATURE_INCLUSION_PREFLIGHT_VERSION;

const buildTargetColumns = (names: readonly string[]): Run2FeatureTableTargetColumn[] =>
  names.map((name) => ({
    name,
    role: 'label_only',
    available_during_forecast: false,
    joined: false,
    notes: 'Target/label column held separate from input features; not joined and unknowable at forecast-construction time.',
  }));

const buildRehearsalRows = (
  rowCount: number,
  featureColumns: string[],
  partialNullColumns: string[],
  metadataColumns: string[],
  forecastInputSeason: number,
): Run2FeatureTableRehearsalRow[] => {
  const rows: Run2FeatureTableRehearsalRow[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const columns: Record<string, string | number | null> = {};
    for (const metadataColumn of metadataColumns) {
      columns[metadataColumn] = metadataColumn.toLowerCase().includes('season')
        ? forecastInputSeason
        : `${RUN2_FEATURE_TABLE_ROW_GRAIN}-${String(index + 1).padStart(4, '0')}`;
    }
    // Feature and partial-null columns are present but unpopulated: null, never zero-filled.
    for (const featureColumn of featureColumns) columns[featureColumn] = null;
    for (const partialNullColumn of partialNullColumns) columns[partialNullColumn] = null;
    rows.push({ row_kind: 'rehearsal_shape_only_not_model_ready', columns });
  }
  return rows;
};

/**
 * Rehearses the *shape* of a future Run 2 feature table from governed, eligible fields only.
 *
 * It is grounded in the existing boundary chain — readGovernedTeamstateInput →
 * buildRun2ManifestRehearsal → buildRun2FeatureInclusionPreflight — and does not bypass those
 * checks: pass a governed Teamstate readiness report (run through the full chain, failing closed
 * on ungoverned input) or a prebuilt preflight report (whose embedded rehearsal is re-derived and
 * re-hardened; the supplied classification is never trusted blindly).
 *
 * The output is shape-only: column groups plus a couple of explicitly-toy rows with null feature
 * values. It performs no model training, evaluation, or Run 2 execution; it never constructs or
 * imputes pressure, never joins a target, and never produces a real/model-ready feature matrix.
 */
export const buildRun2FeatureTableRehearsal = (
  input: unknown,
  options: BuildRun2FeatureTableRehearsalInput = {},
): ServiceResult<Run2FeatureTableRehearsalReport> => {
  // Re-derive (and thereby re-harden) the preflight from the boundary chain. A prebuilt preflight
  // contributes only its embedded rehearsal; its classification lists are recomputed, not trusted.
  const preflightResult = isPreflightReport(input)
    ? buildRun2FeatureInclusionPreflight(input.rehearsal)
    : buildRun2FeatureInclusionPreflight(input, options);
  if (!preflightResult.ok) return preflightResult;

  const preflight = preflightResult.data;

  const targetColumnNames = options.target_columns ?? [...DEFAULT_TARGET_COLUMNS];
  const metadataColumns = options.metadata_columns ?? [...DEFAULT_METADATA_COLUMNS];
  const forecastInputSeason = options.forecast_input_season ?? DEFAULT_FORECAST_INPUT_SEASON;
  const rowCount = Math.max(0, options.rehearsal_row_count ?? DEFAULT_REHEARSAL_ROW_COUNT);

  // Feature/partial-null columns come straight from the preflight; defensively ensure no target
  // name ever leaks into the feature columns.
  const targetColumnSet = new Set(targetColumnNames);
  const featureColumns = preflight.included_features.filter((column) => !targetColumnSet.has(column));
  const partialNullColumns = preflight.partial_null_features.filter((column) => !targetColumnSet.has(column));

  const rehearsalRows = buildRehearsalRows(rowCount, featureColumns, partialNullColumns, metadataColumns, forecastInputSeason);

  return serviceSuccess({
    rehearsal_version: RUN2_FEATURE_TABLE_REHEARSAL_VERSION,
    rehearsal_status: 'feature_table_shape_only',
    execution_status: 'not_trained',
    evaluation_status: 'not_evaluated',
    run_2_executed: false,
    row_grain: RUN2_FEATURE_TABLE_ROW_GRAIN,
    feature_columns: featureColumns,
    partial_null_columns: partialNullColumns,
    excluded_columns: preflight.exclusion_reasons,
    target_columns: buildTargetColumns(targetColumnNames),
    metadata_columns: metadataColumns,
    target_leakage_status: 'no_target_derived_fields_included',
    pressure_status: 'unavailable_insufficient_data_deferred_excluded',
    rehearsal_rows: rehearsalRows,
    teamstate_governance: preflight.teamstate_governance,
    source_governance: preflight.source_governance,
    source_artifact_refs: preflight.source_artifact_refs,
    validation_refs: preflight.validation_refs,
    lineage_refs: preflight.lineage_refs,
    preflight,
    manifest_rehearsal_ref: {
      run_id: preflight.rehearsal.manifest.run_id,
      rehearsal_version: preflight.rehearsal.rehearsal_version,
    },
    notes: [
      'Run 2 feature table rehearsal: shape only (column groups + toy rows), grounded in the governed feature inclusion preflight.',
      'No model training, evaluation, or Run 2 execution; pressure stays unavailable/insufficient_data/deferred and is excluded; targets are label-only and not joined.',
      'Rehearsal rows are not model-ready: feature columns are null (unpopulated), never zero-filled or fabricated.',
    ],
  });
};
