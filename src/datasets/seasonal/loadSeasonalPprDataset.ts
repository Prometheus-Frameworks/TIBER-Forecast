/**
 * Loader: TIBER-Data weekly PPR outcome rows -> player-level seasonal backtest
 * dataset (Issue #49 integration).
 *
 * Consumes the documented TIBER-Data weekly PPR artifact shape
 * (`player_weekly_ppr_outcomes_v1`) and aggregates it into the
 * `SeasonalPprDatasetDescriptor` the rest of the backtest already understands:
 * 2024 input features (input season) joined to the 2025 actual outcome (target
 * season), per player.
 *
 * Honesty / fail-closed rules (as specified):
 *  - Group by `player_id`. The model-facing position and team come from the
 *    INPUT season (never the target season) so a 2024->2025 position change
 *    cannot leak target-season info into features/baselines/metrics. The display
 *    player_name may use the latest available season (it never feeds the model).
 *  - Season actual is derived by an EXPLICIT rule: use the final (max-week)
 *    row's `season_ppr` when finite; otherwise sum weekly `ppr_points`.
 *  - Drop rows with missing/invalid `ppr_points`, `player_id`, `season`, or
 *    `week`; a player left without a usable target outcome is marked unavailable
 *    (null actual) rather than fabricated.
 *  - Fail closed (no dataset) when the same `season|week|player_id` appears with
 *    CONFLICTING values; identical duplicates are collapsed with a warning.
 *  - Null numeric source fields are treated as zero when shaping output.
 *  - Governance stays `fixture` (non-governed) unless TIBER-Data supplies an
 *    explicit governed marker. Governed is NEVER inferred from a path name.
 */
import {
  SEASONAL_PPR_INPUT_SEASON,
  SEASONAL_PPR_TARGET_SEASON,
  type SeasonalPlayerObservation,
  type SeasonalPprDataSource,
  type SeasonalPprDatasetDescriptor,
  type SeasonalPprDatasetGovernanceStatus,
} from '../../contracts/seasonalPprBacktest.js';
import type { ScoringPosition } from '../../contracts/scoring.js';
import {
  nullableToZero,
  tiberDataWeeklyScoringPositions,
  type TiberDataWeeklyPprRow,
} from '../../contracts/tiberDataWeeklyOutcomes.js';
import type { TiberDataSourceDatasetRef } from '../../contracts/tiberDataProjectionInput.js';
import { serviceFailure, serviceSuccess, type ServiceResult, type ServiceWarning } from '../../services/result.js';

/**
 * Explicit governed marker. Governed is only honored when the producer asserts
 * status `governed` AND `source: 'explicit_marker'`. Anything else fails closed
 * to `fixture` so path/fixture data can never masquerade as governed.
 */
export interface SeasonalDatasetGovernanceMarker {
  status: SeasonalPprDatasetGovernanceStatus;
  source: 'explicit_marker';
}

export interface LoadSeasonalPprDatasetOptions {
  inputSeason?: number;
  targetSeason?: number;
  datasetId?: string;
  /** Overrides the version that would otherwise be derived from row generated_at. */
  datasetVersion?: string;
  /** Explicit governed marker; omitted/invalid => fixture. */
  governanceMarker?: SeasonalDatasetGovernanceMarker;
  /**
   * Provenance of the weekly rows: the bundled scaffold fixture vs a real
   * mounted/copied TIBER-Data artifact. Defaults to `mounted-artifact` because
   * the loader's documented job is real ingestion; the scaffold dataset is the
   * one explicit exception that declares `bundled-scaffold`. Never affects
   * governance.
   */
  dataSource?: SeasonalPprDataSource;
  /** Optional path the rows were read from, recorded in provenance only. */
  artifactPath?: string;
  /** Optional extra provenance note appended to the dataset provenance. */
  provenanceNote?: string;
}

const DEFAULT_DATASET_ID = 'tiber-data-seasonal-ppr-2024-2025';

const isSkillPosition = (position: string): position is ScoringPosition =>
  (tiberDataWeeklyScoringPositions as readonly string[]).includes(position);

const isValidInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

interface NormalizedWeeklyRow {
  season: number;
  week: number;
  player_id: string;
  player_name: string;
  team: string;
  position: string;
  ppr_points: number;
  season_ppr: number | null;
  receptions: number;
  targets: number;
  rushing_attempts: number;
  source: string;
  generated_at: string;
}

const conflictFields = (row: NormalizedWeeklyRow): string =>
  [
    row.ppr_points,
    row.season_ppr ?? 'null',
    row.receptions,
    row.targets,
    row.rushing_attempts,
    row.player_name,
    row.position,
    row.team,
  ].join('|');

interface SeasonAggregate {
  season: number;
  games_played: number;
  season_actual: number;
  receptions: number;
  targets: number;
  rushing_attempts: number;
  player_name: string;
  position: string;
  team: string;
}

const aggregateSeason = (season: number, rows: NormalizedWeeklyRow[]): SeasonAggregate => {
  const sorted = [...rows].sort((a, b) => a.week - b.week);
  const distinctWeeks = new Set(sorted.map((row) => row.week));
  const finalRow = sorted[sorted.length - 1];

  // Explicit rule: prefer the final week's cumulative season_ppr; otherwise sum
  // weekly ppr_points. No synthetic weeks are inserted either way.
  const seasonActual = isFiniteNumber(finalRow.season_ppr)
    ? finalRow.season_ppr
    : sorted.reduce((sum, row) => sum + row.ppr_points, 0);

  return {
    season,
    games_played: distinctWeeks.size,
    season_actual: seasonActual,
    receptions: sorted.reduce((sum, row) => sum + row.receptions, 0),
    targets: sorted.reduce((sum, row) => sum + row.targets, 0),
    rushing_attempts: sorted.reduce((sum, row) => sum + row.rushing_attempts, 0),
    player_name: finalRow.player_name,
    position: finalRow.position,
    team: finalRow.team,
  };
};

const resolveGovernance = (
  marker: SeasonalDatasetGovernanceMarker | undefined,
): SeasonalPprDatasetGovernanceStatus => {
  // Fail closed: governed only on an explicit marker. Everything else is fixture.
  if (marker && marker.status === 'governed' && marker.source === 'explicit_marker') {
    return 'governed';
  }
  return 'fixture';
};

export const loadSeasonalPprDatasetFromWeeklyOutcomes = (
  rows: TiberDataWeeklyPprRow[],
  options: LoadSeasonalPprDatasetOptions = {},
): ServiceResult<SeasonalPprDatasetDescriptor> => {
  const inputSeason = options.inputSeason ?? SEASONAL_PPR_INPUT_SEASON;
  const targetSeason = options.targetSeason ?? SEASONAL_PPR_TARGET_SEASON;
  const warnings: ServiceWarning[] = [];

  if (!Array.isArray(rows)) {
    return serviceFailure({
      code: 'SEASONAL_PPR_WEEKLY_ROWS_INVALID',
      message: 'Weekly PPR rows must be provided as an array.',
    });
  }

  // 1. Validate, normalize, and dedupe; fail closed on conflicting duplicates.
  const byKey = new Map<string, NormalizedWeeklyRow>();
  const valid: NormalizedWeeklyRow[] = [];
  let droppedInvalid = 0;
  let droppedNonSkill = 0;
  let collapsedDuplicates = 0;

  for (const raw of rows) {
    if (
      raw == null ||
      !isValidInt(raw.season) ||
      !isValidInt(raw.week) ||
      typeof raw.player_id !== 'string' ||
      raw.player_id.trim() === '' ||
      !isFiniteNumber(raw.ppr_points)
    ) {
      droppedInvalid += 1;
      continue;
    }

    if (typeof raw.position !== 'string' || !isSkillPosition(raw.position)) {
      droppedNonSkill += 1;
      continue;
    }

    const normalized: NormalizedWeeklyRow = {
      season: raw.season,
      week: raw.week,
      player_id: raw.player_id,
      player_name: typeof raw.player_name === 'string' ? raw.player_name : raw.player_id,
      team: typeof raw.team === 'string' ? raw.team : 'UNK',
      position: raw.position,
      ppr_points: raw.ppr_points,
      season_ppr: isFiniteNumber(raw.season_ppr) ? raw.season_ppr : null,
      receptions: nullableToZero(raw.receptions),
      targets: nullableToZero(raw.targets),
      rushing_attempts: nullableToZero(raw.rushing_attempts),
      source: typeof raw.source === 'string' && raw.source.trim() !== '' ? raw.source : 'tiber-data:unknown',
      generated_at: typeof raw.generated_at === 'string' ? raw.generated_at : '',
    };

    const key = `${normalized.season}|${normalized.week}|${normalized.player_id}`;
    const existing = byKey.get(key);
    if (existing) {
      if (conflictFields(existing) !== conflictFields(normalized)) {
        return serviceFailure({
          code: 'SEASONAL_PPR_CONFLICTING_ROWS',
          message: `Conflicting weekly rows for ${key}; refusing to aggregate ambiguous source data.`,
          details: { key, first: conflictFields(existing), second: conflictFields(normalized) },
        });
      }
      collapsedDuplicates += 1;
      continue;
    }
    byKey.set(key, normalized);
    valid.push(normalized);
  }

  if (droppedInvalid > 0) {
    warnings.push({
      code: 'SEASONAL_PPR_DROPPED_INVALID_ROWS',
      message: `Dropped ${droppedInvalid} weekly row(s) with missing/invalid season, week, player_id, or ppr_points.`,
    });
  }
  if (droppedNonSkill > 0) {
    warnings.push({
      code: 'SEASONAL_PPR_DROPPED_NON_SKILL_ROWS',
      message: `Dropped ${droppedNonSkill} weekly row(s) for non-skill positions (only QB/RB/WR/TE are in scope).`,
    });
  }
  if (collapsedDuplicates > 0) {
    warnings.push({
      code: 'SEASONAL_PPR_COLLAPSED_DUPLICATE_ROWS',
      message: `Collapsed ${collapsedDuplicates} identical duplicate weekly row(s).`,
    });
  }

  if (valid.length === 0) {
    return serviceFailure({
      code: 'SEASONAL_PPR_WEEKLY_ROWS_EMPTY',
      message: 'No usable weekly PPR rows remained after validation.',
    });
  }

  // 2. Group by player_id, then by season.
  const byPlayer = new Map<string, Map<number, NormalizedWeeklyRow[]>>();
  for (const row of valid) {
    const seasons = byPlayer.get(row.player_id) ?? new Map<number, NormalizedWeeklyRow[]>();
    const seasonRows = seasons.get(row.season) ?? [];
    seasonRows.push(row);
    seasons.set(row.season, seasonRows);
    byPlayer.set(row.player_id, seasons);
  }

  // 3. Build one observation per player that has an input-season feature snapshot.
  const observations: SeasonalPlayerObservation[] = [];
  let skippedNoInput = 0;

  for (const [playerId, seasons] of byPlayer) {
    const inputRows = seasons.get(inputSeason);
    if (!inputRows || inputRows.length === 0) {
      // No 2024 inputs => not a 2024->2025 row for this model. Skip (e.g. rookies).
      skippedNoInput += 1;
      continue;
    }

    const inputAgg = aggregateSeason(inputSeason, inputRows);
    const targetRows = seasons.get(targetSeason);
    const targetAgg = targetRows && targetRows.length > 0 ? aggregateSeason(targetSeason, targetRows) : undefined;

    // The model-facing position MUST come from the input season only: it is
    // one-hot encoded as a feature and drives the position-mean baseline and
    // by-position metrics, so using the target-season position for a player who
    // changed positions would leak 2025 information into a 2024-inputs backtest.
    const modelPosition = inputAgg.position;
    if (!isSkillPosition(modelPosition)) {
      continue;
    }
    // Display name may use the latest available season (it never feeds the model).
    const displayName = (targetAgg ?? inputAgg).player_name;

    observations.push({
      player_id: playerId,
      player_name: displayName,
      position: modelPosition,
      team_2024: inputAgg.team,
      games_2024: inputAgg.games_played,
      ppr_2024: Number(inputAgg.season_actual.toFixed(4)),
      receptions_2024: inputAgg.receptions,
      targets_2024: inputAgg.targets,
      rush_attempts_2024: inputAgg.rushing_attempts,
      ppr_2025_actual: targetAgg ? Number(targetAgg.season_actual.toFixed(4)) : null,
    });
  }

  if (skippedNoInput > 0) {
    warnings.push({
      code: 'SEASONAL_PPR_SKIPPED_NO_INPUT_SEASON',
      message: `Skipped ${skippedNoInput} player(s) without ${inputSeason} input features (cannot form a ${inputSeason}->${targetSeason} row).`,
    });
  }

  observations.sort((a, b) => a.player_id.localeCompare(b.player_id));

  // 4. Provenance / source refs derived from the rows themselves.
  const distinctSources = [...new Set(valid.map((row) => row.source))].sort();
  const latestGeneratedAt = valid
    .map((row) => row.generated_at)
    .filter((value) => value !== '')
    .sort()
    .at(-1);
  const datasetVersion = options.datasetVersion ?? latestGeneratedAt ?? 'unversioned';

  const sourceDatasetRefs: TiberDataSourceDatasetRef[] = distinctSources.map((source) => ({
    dataset_id: source,
    version: datasetVersion,
    uri: options.artifactPath ?? source,
  }));

  const governanceStatus = resolveGovernance(options.governanceMarker);
  const dataSource: SeasonalPprDataSource = options.dataSource ?? 'mounted-artifact';

  const provenanceParts = [
    `Aggregated from TIBER-Data weekly PPR outcome rows (player_weekly_ppr_outcomes_v1) into ${inputSeason}->${targetSeason} player-level rows.`,
    `Data source: ${dataSource} (scaffold = bundled fixture; mounted-artifact = a real TIBER-Data artifact provided via the runner seam).`,
    `Governance: ${governanceStatus} (governed is only honored with an explicit TIBER-Data marker, never inferred from a path or data source).`,
    'Harness/loader validation only: the committed promoted artifacts are documented as scaffold-only fixture coverage and do not approve predictive loss for 2026 use.',
  ];
  if (options.artifactPath) {
    provenanceParts.push(`Source artifact: ${options.artifactPath}.`);
  }
  if (options.provenanceNote) {
    provenanceParts.push(options.provenanceNote);
  }

  const descriptor: SeasonalPprDatasetDescriptor = {
    dataset_id: options.datasetId ?? DEFAULT_DATASET_ID,
    dataset_version: datasetVersion,
    governance_status: governanceStatus,
    data_source: dataSource,
    source_dataset_refs: sourceDatasetRefs,
    provenance: provenanceParts.join(' '),
    observations,
  };

  return serviceSuccess(descriptor, warnings);
};
