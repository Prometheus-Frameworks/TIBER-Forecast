import {
  POINT_SCENARIO_LAB_MODEL_VERSION,
  type PointScenarioLabGovernanceSource,
  type PointScenarioLabGovernanceStatus,
  type PointScenarioLabMode,
  type PointScenarioLabResponse,
  type PointScenarioLabRow,
} from '../../contracts/pointScenarioLab.js';
import { scenarioRegistry } from '../../models/scenarios/registry.js';
import type { ScenarioRunResult } from '../../models/scenarios/runScenario.js';
import { projectBatch } from '../projectBatchService.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../result.js';
import { resolvePointScenarioLabMetadata } from './governance.js';

/** Producer-side governance assertion for the dataset-level metadata block. */
export interface PointScenarioLabGovernanceInput {
  status?: PointScenarioLabGovernanceStatus;
  source?: PointScenarioLabGovernanceSource;
  promotedAt?: string | null;
  promotionNotes?: string | null;
}

export interface BuildPointScenarioLabOptions {
  /** Optional season to scope the lab payload to. Seeded scenarios are season-agnostic. */
  season?: number;
  /** How the payload is being served. Controls `source.mode` and provenance `source_type`. */
  mode?: PointScenarioLabMode;
  /** Where the payload is being served from (e.g. the route path or artifact path). */
  location?: string | null;
  /** Override the wall-clock used for provenance and dataset-level metadata (mostly for deterministic tests). */
  generatedAt?: string;
  /**
   * Explicit producer-side governance assertion for the dataset-level metadata.
   * When omitted, the payload is marked as fixture data (see `FIXTURE_GOVERNANCE`):
   * the builder composes the seeded scenario registry, which is illustrative
   * fixture data and must never be reported as governed.
   */
  governance?: PointScenarioLabGovernanceInput;
}

const PROVIDER = 'point-prediction-model';
const SOURCE_NAME = 'scenario-export';

/**
 * Default governance for builder output. The seeded scenario registry is
 * illustrative fixture data, so PPM marks it explicitly as `fixture`. This is an
 * explicit marker (we know the source), not a guess — but it is non-promotable,
 * so a downstream gate keeps it out of governed flows.
 */
const FIXTURE_GOVERNANCE: PointScenarioLabGovernanceInput = {
  status: 'fixture',
  source: 'explicit_marker',
  promotionNotes: 'Seeded illustrative point scenarios; fixture data, not governed.',
};

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
    // Use the post-event team so `team` is consistent with `adjusted_projection`,
    // which is computed against `currentTeam` (e.g. a traded player's new roster).
    team: result.currentTeam?.team ?? result.player.team ?? null,
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
      previous_team: result.priorTeam?.team ?? null,
      current_team: result.currentTeam?.team ?? null,
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

  // Default to the explicit fixture marker for the seeded registry; honor an
  // explicit producer assertion when a governed pipeline supplies one.
  const governance = options.governance ?? FIXTURE_GOVERNANCE;
  const metadata = resolvePointScenarioLabMetadata({
    governanceStatus: governance.status,
    governanceSource: governance.source,
    generatedAt,
    promotedAt: governance.promotedAt,
    promotionNotes: governance.promotionNotes,
  });

  return serviceSuccess<PointScenarioLabResponse>({
    season,
    available_seasons: season == null ? [] : [season],
    rows,
    source: {
      provider: PROVIDER,
      location: options.location ?? null,
      mode,
    },
    metadata,
  });
};
