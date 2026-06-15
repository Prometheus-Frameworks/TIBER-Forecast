import { createHash } from 'node:crypto';
import type { LeagueContextInput, PlayerOpportunityInput } from '../../contracts/scoring.js';
import {
  TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION,
  tiberDataOptionalPlayerOpportunityFields,
  tiberDataRequiredPlayerOpportunityFields,
  type TiberDataIdentityRef,
  type TiberDataProjectionInputBundle,
  type TiberDataProjectionMissingField,
  type TiberDataSourceDatasetRef,
} from '../../contracts/tiberDataProjectionInput.js';
import { TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION } from '../../contracts/tiberDataProjectionInputFixture.js';
import { serviceFailure, serviceSuccess, type ServiceError, type ServiceResult, type ServiceWarning } from '../../services/result.js';

/**
 * Named adapter: TIBER-Data `projection-input-fixture.v1.0.0`
 *   → PPM `TiberDataProjectionInputBundle` (`tiber-data-projection-input-v1`).
 *
 * The translated bundle is fed into the existing `toWeeklyScoringRequest`
 * scoring adapter. This adapter performs no scoring math and never collapses
 * or synthesizes values silently: every lossy conversion emits a warning, and
 * every unmet precondition fails closed. See
 * `docs/tiber-data-fixture-adapter-decision.md`.
 */

/** Governed identity reference inputs the fixture cannot supply on its own. */
export interface FromProjectionInputFixtureIdentityConfig {
  /** Governed identity artifact version. Required — fails closed if absent. */
  version?: string;
  /**
   * Optional explicit identity artifact id. When omitted, the adapter derives a
   * deterministic id from the fixture `identity_ref.source_paths` (documented rule).
   */
  identity_artifact_id?: string;
  uri?: string;
}

export interface FromProjectionInputFixtureInput {
  fixture: unknown;
  /** Governed identity config; `version` is mandatory (fail-closed otherwise). */
  identity_ref?: FromProjectionInputFixtureIdentityConfig;
}

export interface FromProjectionInputFixtureOutput {
  bundle: TiberDataProjectionInputBundle;
  warnings: ServiceWarning[];
}

const ENV_PLAYER_FIELDS = ['team_pass_rate_environment', 'team_pace', 'offensive_environment'] as const;

const supportedPlayerFields = new Set<string>([
  ...tiberDataRequiredPlayerOpportunityFields,
  ...tiberDataOptionalPlayerOpportunityFields,
]);

const requiredPlayerFieldSet = new Set<string>(tiberDataRequiredPlayerOpportunityFields);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const playerLabel = (player: unknown, index: number): string =>
  isRecord(player) && isNonEmptyString(player.player_id) ? player.player_id : `index:${index}`;

/**
 * Documented deterministic rule for `identity_artifact_id` when no explicit id is
 * supplied: a stable, collision-resistant digest of the governed source paths.
 * This derives an opaque reference without inventing identity semantics.
 */
const deriveIdentityArtifactId = (sourcePaths: string[]): string => {
  const digest = createHash('sha256').update(sourcePaths.join('\n')).digest('hex').slice(0, 16);
  return `tiber-data-identity:${digest}`;
};

const validateEnvelope = (fixture: unknown, errors: ServiceError[]): fixture is Record<string, unknown> => {
  if (!isRecord(fixture)) {
    errors.push({ code: 'TIBER_DATA_FIXTURE_INPUT_INVALID', message: 'TIBER-Data projection input fixture must be an object.' });
    return false;
  }

  if (fixture.input_contract_version !== TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION) {
    errors.push({
      code: 'TIBER_DATA_FIXTURE_CONTRACT_VERSION_UNSUPPORTED',
      message: `Unsupported fixture contract version; expected "${TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION}".`,
      details: { received: fixture.input_contract_version },
    });
  }

  if (!isNonEmptyString(fixture.tiber_data_schema_version)) {
    errors.push({ code: 'TIBER_DATA_FIXTURE_REQUIRED_FIELD_MISSING', message: 'tiber_data_schema_version is required.' });
  }

  if (!isRecord(fixture.fixture_scope) || typeof fixture.fixture_scope.production_coverage_claim !== 'boolean') {
    errors.push({
      code: 'TIBER_DATA_FIXTURE_REQUIRED_FIELD_MISSING',
      message: 'fixture_scope.production_coverage_claim (boolean) is required.',
    });
  }

  if (!Array.isArray(fixture.source_dataset_refs) || fixture.source_dataset_refs.length === 0) {
    errors.push({ code: 'TIBER_DATA_FIXTURE_REQUIRED_FIELD_MISSING', message: 'source_dataset_refs must include at least one dataset reference.' });
  }

  if (!isRecord(fixture.identity_ref) || !Array.isArray(fixture.identity_ref.source_paths) || fixture.identity_ref.source_paths.length === 0) {
    errors.push({ code: 'TIBER_DATA_FIXTURE_REQUIRED_FIELD_MISSING', message: 'identity_ref.source_paths must include at least one source path.' });
  }

  if (!isRecord(fixture.league_context)) {
    errors.push({ code: 'TIBER_DATA_FIXTURE_REQUIRED_FIELD_MISSING', message: 'league_context is required.' });
  }

  if (!Array.isArray(fixture.player_opportunities) || fixture.player_opportunities.length === 0) {
    errors.push({ code: 'TIBER_DATA_FIXTURE_REQUIRED_FIELD_MISSING', message: 'player_opportunities must include at least one player.' });
  }

  return errors.length === 0;
};

const mapSourceDatasetRefs = (
  refs: unknown[],
  errors: ServiceError[],
  warnings: ServiceWarning[],
): TiberDataSourceDatasetRef[] => {
  const mapped: TiberDataSourceDatasetRef[] = [];
  const droppedByRef: Array<Record<string, unknown>> = [];

  refs.forEach((ref, index) => {
    if (!isRecord(ref)) {
      errors.push({ code: 'TIBER_DATA_FIXTURE_SOURCE_DATASET_INVALID', message: `source_dataset_refs[${index}] must be an object.` });
      return;
    }

    if (!isNonEmptyString(ref.name)) {
      errors.push({ code: 'TIBER_DATA_FIXTURE_SOURCE_DATASET_INVALID', message: `source_dataset_refs[${index}].name is required.` });
    }

    // PPM requires a dataset version; the fixture makes it optional. Fail closed
    // rather than defaulting or synthesizing one.
    if (!isNonEmptyString(ref.version)) {
      errors.push({
        code: 'TIBER_DATA_FIXTURE_SOURCE_DATASET_VERSION_MISSING',
        message: `source_dataset_refs[${index}].version is required for PPM ingestion and must not be defaulted.`,
        details: { name: ref.name },
      });
    }

    const uri = isNonEmptyString(ref.source_path) ? ref.source_path : isNonEmptyString(ref.path) ? ref.path : undefined;

    // Fields with no PPM home are preserved in a warning rather than silently dropped.
    const dropped: Record<string, unknown> = {};
    if (ref.provenance !== undefined) dropped.provenance = ref.provenance;
    if (ref.usage !== undefined) dropped.usage = ref.usage;
    if (isNonEmptyString(ref.source_path) && isNonEmptyString(ref.path)) dropped.path = ref.path;
    if (Object.keys(dropped).length > 0) droppedByRef.push({ name: ref.name, dropped });

    if (isNonEmptyString(ref.name) && isNonEmptyString(ref.version)) {
      mapped.push({ dataset_id: ref.name, version: ref.version, ...(uri === undefined ? {} : { uri }) });
    }
  });

  if (droppedByRef.length > 0) {
    warnings.push({
      code: 'TIBER_DATA_FIXTURE_SOURCE_DATASET_FIELDS_DROPPED',
      message: 'TIBER-Data source dataset provenance fields have no PPM target and were preserved here rather than mapped.',
      details: { refs: droppedByRef },
    });
  }

  return mapped;
};

const mapIdentityRef = (
  fixtureIdentity: Record<string, unknown>,
  config: FromProjectionInputFixtureIdentityConfig | undefined,
  errors: ServiceError[],
  warnings: ServiceWarning[],
): TiberDataIdentityRef | undefined => {
  const sourcePaths = (fixtureIdentity.source_paths as unknown[]).filter(isNonEmptyString);

  // version has no upstream source in the fixture; it must come from governed
  // config. Do not invent it.
  if (!isNonEmptyString(config?.version)) {
    errors.push({
      code: 'TIBER_DATA_FIXTURE_IDENTITY_VERSION_MISSING',
      message: 'identity_ref.version must be supplied by governed adapter config and was not provided.',
    });
  }

  const identityArtifactId = isNonEmptyString(config?.identity_artifact_id)
    ? config.identity_artifact_id
    : sourcePaths.length > 0
      ? deriveIdentityArtifactId(sourcePaths)
      : undefined;

  if (identityArtifactId === undefined) {
    errors.push({
      code: 'TIBER_DATA_FIXTURE_IDENTITY_ARTIFACT_ID_UNRESOLVED',
      message: 'identity_artifact_id could not be derived: no explicit id and no usable source_paths.',
    });
  }

  warnings.push({
    code: 'TIBER_DATA_FIXTURE_IDENTITY_REMAPPED',
    message: 'TIBER-Data identity_ref shape was remapped to the PPM opaque reference; source identity detail is preserved here.',
    details: {
      source_paths: fixtureIdentity.source_paths,
      identity_fields: fixtureIdentity.identity_fields,
      projection_label_policy: fixtureIdentity.projection_label_policy,
      identity_artifact_id_derived: !isNonEmptyString(config?.identity_artifact_id),
    },
  });

  if (identityArtifactId === undefined || !isNonEmptyString(config?.version)) return undefined;

  return {
    identity_artifact_id: identityArtifactId,
    version: config.version,
    ...(isNonEmptyString(config?.uri) ? { uri: config.uri } : {}),
  };
};

const mapLeagueContext = (fixtureLeague: Record<string, unknown>, warnings: ServiceWarning[]): LeagueContextInput => {
  const { replacement_buffer, ...rest } = fixtureLeague;

  if (replacement_buffer !== undefined) {
    // Per-position object cannot become a single PPM scalar without inventing a
    // rule. Omit it and preserve the original per-position values in a warning.
    warnings.push({
      code: 'TIBER_DATA_FIXTURE_REPLACEMENT_BUFFER_OMITTED',
      message: 'Per-position replacement_buffer cannot map to the PPM scalar replacement_buffer; it was omitted, not collapsed.',
      details: { replacement_buffer },
    });
  }

  return rest as unknown as LeagueContextInput;
};

const mapPlayers = (
  players: unknown[],
  collection: 'player_opportunities',
  warnings: ServiceWarning[],
): PlayerOpportunityInput[] => {
  const strippedByPlayer = new Map<string, string[]>();

  const mapped = players.map((player, index) => {
    if (!isRecord(player)) return player as PlayerOpportunityInput;

    const kept: Record<string, unknown> = {};
    const stripped: string[] = [];
    for (const [field, value] of Object.entries(player)) {
      if (supportedPlayerFields.has(field)) kept[field] = value;
      else stripped.push(field);
    }

    if (stripped.length > 0) strippedByPlayer.set(playerLabel(player, index), stripped);
    return kept as unknown as PlayerOpportunityInput;
  });

  if (strippedByPlayer.size > 0) {
    warnings.push({
      code: 'TIBER_DATA_FIXTURE_PLAYER_FIELDS_IGNORED',
      message: `Unsupported ${collection} fields were omitted before scoring; no scoring math consumes them in this adapter.`,
      details: {
        collection,
        env_fields: [...ENV_PLAYER_FIELDS],
        fields_by_player: Object.fromEntries(strippedByPlayer),
      },
    });
  }

  return mapped;
};

const mapMissingFields = (
  fixtureMissing: unknown,
  warnings: ServiceWarning[],
): TiberDataProjectionMissingField[] | undefined => {
  if (!Array.isArray(fixtureMissing)) return undefined;

  let upgradedToRequired = 0;
  const mapped = fixtureMissing
    .filter(isRecord)
    .map((entry) => {
      // Named severity policy: a fixture "warning" becomes "required" only when
      // the field is a PPM-required scoring field; otherwise it stays "optional".
      // Fixture warnings are never blanket-upgraded to required.
      const severity: TiberDataProjectionMissingField['severity'] = requiredPlayerFieldSet.has(String(entry.field))
        ? 'required'
        : 'optional';
      if (severity === 'required') upgradedToRequired += 1;

      return {
        field: String(entry.field),
        severity,
        reason: isNonEmptyString(entry.reason) ? entry.reason : 'TIBER-Data fixture evidence gap.',
        ...(isNonEmptyString(entry.player_id) ? { player_id: entry.player_id } : {}),
        ...(isNonEmptyString(entry.impact) ? { impact: entry.impact } : {}),
      } satisfies TiberDataProjectionMissingField;
    });

  if (mapped.length > 0) {
    warnings.push({
      code: 'TIBER_DATA_FIXTURE_MISSING_FIELD_SEVERITY_MAPPED',
      message: 'TIBER-Data fixture missing_fields severity "warning" was mapped to PPM required|optional via the named policy.',
      details: {
        total: mapped.length,
        mapped_required: upgradedToRequired,
        mapped_optional: mapped.length - upgradedToRequired,
      },
    });
  }

  return mapped;
};

const mapAdapterWarnings = (fixtureWarnings: unknown): ServiceWarning[] => {
  if (!Array.isArray(fixtureWarnings)) return [];
  return fixtureWarnings
    .filter(isNonEmptyString)
    .map((message) => ({ code: 'TIBER_DATA_FIXTURE_WARNING', message }));
};

export const fromProjectionInputFixture = (
  input: FromProjectionInputFixtureInput,
): ServiceResult<FromProjectionInputFixtureOutput> => {
  const errors: ServiceError[] = [];
  const warnings: ServiceWarning[] = [];

  const fixture = input.fixture;
  if (!validateEnvelope(fixture, errors)) return serviceFailure(errors);

  // Contract version is remapped to the PPM constant; the source version is preserved.
  warnings.push({
    code: 'TIBER_DATA_FIXTURE_CONTRACT_VERSION_MAPPED',
    message: 'Fixture contract version was mapped to the PPM ingestion contract version.',
    details: {
      source_version: fixture.input_contract_version,
      mapped_version: TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION,
    },
  });

  // fixture_scope has no PPM target; preserve the fixture-only / non-production intent.
  const scope = fixture.fixture_scope as Record<string, unknown>;
  warnings.push({
    code: 'TIBER_DATA_FIXTURE_SCOPE_PRESERVED',
    message: 'Fixture scope is preserved as a warning; this bundle must not be treated as production coverage.',
    details: {
      kind: scope.kind,
      production_coverage_claim: scope.production_coverage_claim,
      ...(scope.projection_label === undefined ? {} : { projection_label: scope.projection_label }),
      ...(scope.evidence_window === undefined ? {} : { evidence_window: scope.evidence_window }),
    },
  });

  if (fixture.projection_context !== undefined) {
    warnings.push({
      code: 'TIBER_DATA_FIXTURE_PROJECTION_CONTEXT_IGNORED',
      message: 'projection_context is preserved on the bundle but is not part of the scoring contract, so it is not consumed for scoring.',
      details: { field: 'projection_context' },
    });
  }

  const sourceDatasetRefs = mapSourceDatasetRefs(fixture.source_dataset_refs as unknown[], errors, warnings);
  const identityRef = mapIdentityRef(fixture.identity_ref as Record<string, unknown>, input.identity_ref, errors, warnings);
  const leagueContext = mapLeagueContext(fixture.league_context as Record<string, unknown>, warnings);
  const players = mapPlayers(fixture.player_opportunities as unknown[], 'player_opportunities', warnings);
  const missingFields = mapMissingFields(fixture.missing_fields, warnings);
  const fixtureAdapterWarnings = mapAdapterWarnings(fixture.adapter_warnings);

  if (errors.length > 0 || identityRef === undefined) return serviceFailure(errors, warnings);

  const bundle: TiberDataProjectionInputBundle = {
    input_contract_version: TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION,
    tiber_data_schema_version: fixture.tiber_data_schema_version as string,
    source_dataset_refs: sourceDatasetRefs,
    identity_ref: identityRef,
    ...(fixture.projection_context === undefined ? {} : { projection_context: fixture.projection_context as Record<string, unknown> }),
    league_context: leagueContext,
    player_opportunities: players,
    ...(missingFields === undefined ? {} : { missing_fields: missingFields }),
    // All adapter-generated warnings plus the wrapped fixture warnings travel on
    // the bundle so the downstream scoring adapter and coverage report retain them.
    adapter_warnings: [...fixtureAdapterWarnings, ...warnings],
  };

  return serviceSuccess({ bundle, warnings }, warnings);
};
