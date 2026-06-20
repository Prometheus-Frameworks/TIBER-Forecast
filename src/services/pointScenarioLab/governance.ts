/**
 * Resolver for the dataset-level promotion metadata stamped onto the Point
 * Scenario Lab response/export.
 *
 * Design intent (PPM is the *producer* here): the metadata must be safe for a
 * downstream promotion gate to trust. That means failing closed — a payload is
 * only ever reported as `governed` (or any other status) when the producer
 * asserts it with an explicit marker. Anything missing, unrecognized, or merely
 * inferred from a path is collapsed to a non-promotable status so fixture/local
 * output can never masquerade as governed.
 */
import {
  POINT_SCENARIO_LAB_CONTRACT_VERSION,
  type PointScenarioLabGovernanceSource,
  type PointScenarioLabGovernanceStatus,
  type PointScenarioLabMetadata,
} from '../../contracts/pointScenarioLab.js';

export interface ResolvePointScenarioLabMetadataInput {
  /** Producer-asserted governance status. Omitted/unrecognized fails closed to `unknown`. */
  governanceStatus?: PointScenarioLabGovernanceStatus;
  /** How the status was established. Defaults to `explicit_marker` when a status is asserted. */
  governanceSource?: PointScenarioLabGovernanceSource;
  /** Dataset-level generation timestamp (ISO-8601). */
  generatedAt: string;
  /** Optional promotion timestamp, only when distinct from `generatedAt` and meaningful. */
  promotedAt?: string | null;
  /** Optional non-advisory operator note. */
  promotionNotes?: string | null;
}

const RECOGNIZED_STATUSES: ReadonlySet<PointScenarioLabGovernanceStatus> = new Set<PointScenarioLabGovernanceStatus>([
  'governed',
  'fixture',
  'ungoverned',
  'unknown',
]);

const RECOGNIZED_SOURCES: ReadonlySet<PointScenarioLabGovernanceSource> = new Set<PointScenarioLabGovernanceSource>([
  'explicit_marker',
  'path_inference',
  'unknown',
]);

/**
 * Builds the dataset-level metadata block, failing closed on anything that is
 * not an explicit, recognized governance assertion.
 */
export const resolvePointScenarioLabMetadata = (
  input: ResolvePointScenarioLabMetadataInput,
): PointScenarioLabMetadata => {
  const asserted =
    input.governanceStatus != null && RECOGNIZED_STATUSES.has(input.governanceStatus)
      ? input.governanceStatus
      : undefined;

  // Fail closed: no recognized assertion => `unknown`, which a gate must treat
  // as non-promotable. We never infer `governed`.
  let governanceStatus: PointScenarioLabGovernanceStatus = asserted ?? 'unknown';

  // A source is only meaningful alongside an asserted status. Path inference is
  // honored as a weak hint when explicitly passed, but is never synthesized here.
  let governanceSource: PointScenarioLabGovernanceSource;
  if (asserted == null) {
    governanceSource = 'unknown';
  } else if (input.governanceSource != null && RECOGNIZED_SOURCES.has(input.governanceSource)) {
    governanceSource = input.governanceSource;
  } else {
    governanceSource = 'explicit_marker';
  }

  // `governed` is the only promotable status, so it may be reported only when it
  // is backed by an explicit marker. A `governed` claim arriving with a weak path
  // hint (or no source) is downgraded to `unknown` so path inference can never
  // surface as governed to a downstream promotion gate.
  if (governanceStatus === 'governed' && governanceSource !== 'explicit_marker') {
    governanceStatus = 'unknown';
  }

  const metadata: PointScenarioLabMetadata = {
    governanceStatus,
    governanceSource,
    contractVersion: POINT_SCENARIO_LAB_CONTRACT_VERSION,
    generatedAt: input.generatedAt,
  };

  if (input.promotedAt != null) {
    metadata.promotedAt = input.promotedAt;
  }
  if (input.promotionNotes != null) {
    metadata.promotionNotes = input.promotionNotes;
  }

  return metadata;
};
