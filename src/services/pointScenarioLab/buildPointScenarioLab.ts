import {
  POINT_SCENARIO_LAB_MODEL_VERSION,
  type PointScenarioLabMode,
  type PointScenarioLabResponse,
  type PointScenarioLabRow,
} from '../../contracts/pointScenarioLab.js';
import { scenarioRegistry } from '../../models/scenarios/registry.js';
import type { ScenarioRunResult } from '../../models/scenarios/runScenario.js';
import { projectBatch } from '../projectBatchService.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../result.js';

export interface BuildPointScenarioLabOptions {
  /** Optional season to scope the lab payload to. Seeded scenarios are season-agnostic. */
  season?: number;
  /** How the payload is being served. Controls `source.mode` and provenance `source_type`. */
  mode?: PointScenarioLabMode;
  /** Where the payload is being served from (e.g. the route path or artifact path). */
  location?: string | null;
  /** Override the wall-clock used for provenance (mostly for deterministic tests). */
  generatedAt?: string;
}

const PROVIDER = 'point-prediction-model';
const SOURCE_NAME = 'scenario-export';

const sourceTypeForMode = (mode: PointScenarioLabMode): string =>
  mode === 'artifact' ? 'data_lab_surface' : 'compatibility_route';

const confidenceLabelForBand = (band: ScenarioRunResult['confidenceBand']): string => {
  switch (band) {
    case 'HIGH':
      return 'High confidence';
    case 'MEDIUM':
      return 'Medium confidence';
    case 'LOW':
    default:
      return 'Low confidence';
  }
};

const roundMetric = (value: number): number => Math.round(value * 1000) / 1000;

const toLabRow = (
  result: ScenarioRunResult,
  options: Required<Pick<BuildPointScenarioLabOptions, 'mode' | 'generatedAt'>> & { season: number | null },
): PointScenarioLabRow => {
  const scenarioType = result.scenarioTags.length > 0 ? result.scenarioTags[0] : null;

  return {
    scenario_id: result.scenarioId,
    scenario_name: result.scenarioTitle,
    player_id: result.player.id,
    player_name: result.player.name,
    team: result.player.team ?? null,
    position: result.player.position ?? null,
    season: options.season,
    week: result.event?.effectiveWeek ?? null,
    baseline_projection: roundMetric(result.baseline.pprPointsPerGame),
    adjusted_projection: roundMetric(result.adjusted.pprPointsPerGame),
    delta: roundMetric(result.deltaPprPointsPerGame),
    confidence_band: result.confidenceBand,
    confidence_label: confidenceLabelForBand(result.confidenceBand),
    scenario_type: scenarioType,
    event_type: result.eventType ?? null,
    notes: [...result.explanation],
    explanation: result.explanation.length > 0 ? result.explanation.join(' ') : null,
    provenance: {
      provider: PROVIDER,
      source_name: SOURCE_NAME,
      source_type: sourceTypeForMode(options.mode),
      model_version: POINT_SCENARIO_LAB_MODEL_VERSION,
      generated_at: options.generatedAt,
      source_metadata: {
        surface: 'point_scenario_lab',
        derived_from: 'legacy_scenario_projection',
        confidence_score: result.confidenceScore,
        scenario_tags: result.scenarioTags,
      },
    },
    raw_fields: {
      scenario_description: result.scenarioDescription,
      scenario_tags: result.scenarioTags,
      baseline_breakdown: result.baseline,
      adjusted_breakdown: result.adjusted,
    },
  };
};

/**
 * Builds the point-scenario lab compatibility payload by composing the existing
 * seeded scenario registry with the existing `projectBatch` projection service.
 *
 * This adds no scoring logic of its own: every numeric value is taken from the
 * legacy projection output. Seeded scenarios are season-agnostic illustrative
 * fixtures, so when a `season` is requested it is echoed at the top level and
 * stamped onto each row; otherwise season fields are `null`.
 */
export const buildPointScenarioLab = (
  options: BuildPointScenarioLabOptions = {},
): ServiceResult<PointScenarioLabResponse> => {
  const mode: PointScenarioLabMode = options.mode ?? 'api';
  const season = options.season ?? null;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const projection = projectBatch(scenarioRegistry);
  if (!projection.ok) {
    return serviceFailure(projection.errors);
  }

  const rows = projection.data.results.map((result) =>
    toLabRow(result, { mode, generatedAt, season }),
  );

  return serviceSuccess<PointScenarioLabResponse>({
    season,
    available_seasons: season == null ? [] : [season],
    rows,
    source: {
      provider: PROVIDER,
      location: options.location ?? null,
      mode,
    },
  });
};
