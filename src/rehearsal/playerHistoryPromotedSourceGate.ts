/**
 * Forecast-side promoted-source gate for the TIBER-Data `player_season_coverage_v0` PROMOTED
 * artifact (Forecast issue #117, following TIBER-Data #192 / PR #193).
 *
 * This is a PROMOTED-SOURCE GATE only. It decides whether Forecast may treat the promoted TIBER-Data
 * artifact as a governed upstream source for a LATER mirror-refresh issue. It performs no model run,
 * computes no metrics, binds no features, touches no production Forecast file, and authorizes no
 * production binding, product output, or advice/rankings. The strongest decision it can emit is
 * `may_open_promoted_mirror_refresh_issue` -- opening that issue is itself a separate, later step.
 *
 * Decision semantics (exactly one is emitted):
 * - `may_open_promoted_mirror_refresh_issue`: every check passed; a later issue MAY refresh the
 *   experiment source reference/mirrors from the candidate pin to the promoted artifact.
 * - `may_continue_using_candidate_mirrors_for_archived_experiment_only`: one or more promoted-side
 *   checks failed, but the candidate-lineage checks passed (the promoted manifest still points at
 *   exactly the candidate artifact Forecast pinned in #100/#104/#108/#110/#112). The promoted
 *   artifact must NOT be consumed; the already-archived candidate-based experiment record remains
 *   internally valid as an archived record only. This is a fallback, not a pass.
 * - `blocked_promoted_artifact_gate_failed`: checks failed AND the candidate lineage could not be
 *   re-affirmed (source-candidate path/sha/status mismatch). Nothing is re-authorized.
 * - `promoted_source_gate_invalid_must_not_use`: the gate input itself is malformed (missing
 *   manifest/artifact/records), so no evaluation outcome may be used.
 *
 * Pure module: no I/O. The CLI script (`scripts/runPlayerHistoryPromotedSourceGate.ts`) reads the
 * local promoted artifact + manifest, computes the actual sha256, and passes everything in.
 */

import {
  EXPECTED_SOURCE_ARTIFACT_STATUS,
  PINNED_SOURCE_ARTIFACT_PATH,
  PINNED_SOURCE_ARTIFACT_REPO,
  PINNED_SOURCE_ARTIFACT_SHA256,
} from './playerHistoryRunPopulationMirrors.js';

/** Repo the promoted artifact lives in (same governed TIBER-Data repo as the candidate). */
export const PROMOTED_ARTIFACT_REPO = PINNED_SOURCE_ARTIFACT_REPO;
/** Promoted artifact path inside TIBER-Data (from PR #193, merge 65fb498). */
export const PROMOTED_ARTIFACT_PATH = 'exports/promoted/nfl/player_season_coverage_v0.json' as const;
/** Promotion manifest path inside TIBER-Data. */
export const PROMOTED_MANIFEST_PATH = 'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json' as const;
/** TIBER-Data merge commit that landed the promotion (PR #193). */
export const PROMOTION_MERGE_COMMIT = '65fb498253b5bdb6a7f6d0598d7235c90a78c729' as const;
/**
 * Forecast-side pin of the promoted artifact bytes, taken from the TIBER-Data #192 promotion
 * manifest (`promoted_artifact_sha256`). The gate re-verifies the ACTUAL local bytes against this
 * pin AND against the manifest's own claim -- both must agree, fail closed.
 */
export const PINNED_PROMOTED_ARTIFACT_SHA256 =
  '29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035' as const;

export const EXPECTED_PROMOTED_STATUS = 'promoted_governed_artifact' as const;
export const EXPECTED_PROMOTION_REVIEW = 'TIBER-Data#192' as const;
export const EXPECTED_PROMOTION_DECISION = 'promote_player_season_coverage_v0' as const;

/**
 * Prefix allow-list the promoted manifest must carry (`approved_source_allowlist`), matching the
 * TIBER-Data #193 standard EXACTLY: approved provenance is matched as a PREFIX (the approved
 * call-shape must START the source_name), never as a substring -- so mixed approved+unapproved refs
 * and free-text names that merely embed an approved token (e.g.
 * `manual_override:nflreadpy.load_players()`) fail closed.
 */
export const EXPECTED_APPROVED_SOURCE_PREFIXES = [
  'nflreadpy.load_player_stats(',
  'nflreadpy.load_players(',
] as const;

/** Fixture/scaffold markers that must never appear in promoted provenance (same set as TIBER-Data). */
export const PROMOTED_FIXTURE_MARKERS = ['offline_fixture', 'fixture_', 'scaffold', 'fixture_demonstration_only'] as const;

/** Availability/ownership keys no consumed record may carry (same forbidden set as the whole chain). */
export const PROMOTED_FORBIDDEN_AVAILABILITY_KEYS = [
  'active_status',
  'ownership_status',
  'roster_status',
  'active_roster_status',
] as const;

/** Usage fields that are never source-backed in this artifact: they must stay null, never 0. */
export const PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS = [
  'snap_share',
  'routes_run',
  'route_participation',
  'red_zone_targets',
  'red_zone_carries',
] as const;

/**
 * The only decisions this gate may emit. Deliberately NO value contains run/bind/production/
 * metric/advice semantics: nothing here authorizes a model run, metric computation, production
 * binding, Data promotion, product output, or advice/rankings (tested).
 */
export const PROMOTED_SOURCE_GATE_DECISIONS = [
  'may_open_promoted_mirror_refresh_issue',
  'may_continue_using_candidate_mirrors_for_archived_experiment_only',
  'blocked_promoted_artifact_gate_failed',
  'promoted_source_gate_invalid_must_not_use',
] as const;
export type PromotedSourceGateDecision = (typeof PROMOTED_SOURCE_GATE_DECISIONS)[number];

/**
 * Leakage discipline recorded for any FUTURE mirror refresh/use of the promoted artifact
 * (issue #117 gate check 5). Recording these here changes nothing now -- no refresh happens in
 * this gate -- but any later refresh issue must restate and enforce them structurally.
 */
export const PROMOTED_SOURCE_LEAKAGE_DISCIPLINE = {
  target_season_2025_remains_outcome_only_for_prior_experiment_shape: true,
  input_seasons_for_2025_prediction_remain_2022_2024_only: true,
  no_2025_production_summaries_may_become_2025_input_features: true,
  no_active_availability_ownership_fields_may_be_consumed: true,
  unavailable_usage_fields_remain_null_never_zero_coerced: true,
} as const;

/** Consumer-safety `not_allowed` entries the manifest must include, at minimum (substring match). */
export const REQUIRED_NOT_ALLOWED_ENTRIES = [
  'current active roster status',
  'player availability or injury status',
  'depth chart role',
  'ownership/team membership',
  'product advice or fantasy rankings/start-sit/trade/draft output',
  'Forecast production binding without a separate Forecast issue and gate',
] as const;

/** Phrases the Forecast compatibility note must contain (substring match, one per requirement). */
export const REQUIRED_COMPATIBILITY_NOTE_PHRASES = [
  'separate Forecast-side gate',
  're-verifies sha/provenance',
  'leakage splits',
  'production-only feature contract',
  'No product-facing claim is authorized until a Forecast production-binding review passes',
] as const;

// ---------------------------------------------------------------------------------------------
// Input shapes (parsed from the real TIBER-Data files by the CLI script; typed minimally)
// ---------------------------------------------------------------------------------------------

export interface PromotedSourceRef {
  source_name: string;
  observed_at: string | null;
  confidence?: string | null;
  [key: string]: unknown;
}

export interface PromotedCoverageRecord {
  player_id: string;
  season: number;
  season_type: string;
  position: string;
  source_refs: PromotedSourceRef[];
  usage_summary?: Record<string, number | string | null> | null;
  [key: string]: unknown;
}

export interface PromotedSourceCandidateBlock {
  path: string;
  sha256: string;
  status_at_promotion: string;
}

/** Envelope fields shared by the promotion manifest and the promoted artifact. */
export interface PromotedEnvelopeCommon {
  artifact_id: string;
  status: string;
  promotion_review: string;
  promotion_decision: string;
  source_candidate: PromotedSourceCandidateBlock;
  approved_source_allowlist: string[];
  seasons: number[];
  season_type_scope: string[];
  included_positions: string[];
  row_grain: string;
  counts: { records: number; by_season: Record<string, number>; by_position: Record<string, number> };
  consumer_safety?: { allowed: string[]; not_allowed: string[] } | null;
  forecast_compatibility_note?: string | null;
}

export interface PromotedManifest extends PromotedEnvelopeCommon {
  promoted_artifact_path: string;
  promoted_artifact_sha256: string;
}

export interface PromotedArtifact extends PromotedEnvelopeCommon {
  records: PromotedCoverageRecord[];
}

export interface PromotedSourceGateInput {
  manifest: PromotedManifest;
  artifact: PromotedArtifact;
  /** sha256 hex of the ACTUAL promoted artifact bytes, computed by the caller from the file read. */
  actualPromotedArtifactSha256: string;
}

/**
 * Expected identity the gate verifies against. Defaults to the real #193 pins; tests may override
 * to exercise pass/fail paths on synthetic inputs without weakening the production defaults.
 */
export interface PromotedSourceGateExpectations {
  promotedArtifactSha256: string;
  promotedArtifactPath: string;
  promotedStatus: string;
  promotionReview: string;
  promotionDecision: string;
  candidatePath: string;
  candidateSha256: string;
  candidateStatusAtPromotion: string;
  approvedSourcePrefixes: readonly string[];
  recordCount: number;
  bySeason: Record<string, number>;
  byPosition: Record<string, number>;
  seasons: readonly number[];
  seasonType: string;
  positions: readonly string[];
  rowGrain: string;
}

export const PROMOTED_SOURCE_GATE_EXPECTATIONS: PromotedSourceGateExpectations = {
  promotedArtifactSha256: PINNED_PROMOTED_ARTIFACT_SHA256,
  promotedArtifactPath: PROMOTED_ARTIFACT_PATH,
  promotedStatus: EXPECTED_PROMOTED_STATUS,
  promotionReview: EXPECTED_PROMOTION_REVIEW,
  promotionDecision: EXPECTED_PROMOTION_DECISION,
  // Relationship to the PRIOR Forecast candidate pin (#100/#104/#108/#110/#112): the promoted
  // artifact must be a promotion of exactly the candidate all archived experiment mirrors used.
  candidatePath: PINNED_SOURCE_ARTIFACT_PATH,
  candidateSha256: PINNED_SOURCE_ARTIFACT_SHA256,
  candidateStatusAtPromotion: EXPECTED_SOURCE_ARTIFACT_STATUS,
  approvedSourcePrefixes: EXPECTED_APPROVED_SOURCE_PREFIXES,
  recordCount: 2383,
  bySeason: { '2022': 609, '2023': 576, '2024': 588, '2025': 610 },
  byPosition: { QB: 323, RB: 606, TE: 519, WR: 935 },
  seasons: [2022, 2023, 2024, 2025],
  seasonType: 'REG',
  positions: ['QB', 'RB', 'TE', 'WR'],
  rowGrain: 'player_id + season + season_type',
};

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

export interface PromotedSourceGateCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

const check = (dimension: string, expected: string, observed: string, passed: boolean): PromotedSourceGateCheck => ({
  dimension,
  expected,
  observed,
  passed,
});

/** Dimensions that establish the candidate lineage (used to pick the fallback decision on failure). */
export const CANDIDATE_LINEAGE_DIMENSIONS = [
  'candidate_lineage_path',
  'candidate_lineage_sha256',
  'candidate_lineage_status_at_promotion',
] as const;

/** Gate check 1: manifest identity, promoted status, promotion decision, sha, candidate lineage. */
export const checkManifestIdentity = (
  manifest: PromotedManifest,
  actualPromotedArtifactSha256: string,
  expect: PromotedSourceGateExpectations = PROMOTED_SOURCE_GATE_EXPECTATIONS,
): PromotedSourceGateCheck[] => {
  const allowlist = manifest.approved_source_allowlist ?? [];
  return [
    check('manifest_artifact_id', 'player_season_coverage_v0', String(manifest.artifact_id), manifest.artifact_id === 'player_season_coverage_v0'),
    check('manifest_promoted_status', expect.promotedStatus, String(manifest.status), manifest.status === expect.promotedStatus),
    check('manifest_promotion_review', expect.promotionReview, String(manifest.promotion_review), manifest.promotion_review === expect.promotionReview),
    check('manifest_promotion_decision', expect.promotionDecision, String(manifest.promotion_decision), manifest.promotion_decision === expect.promotionDecision),
    check('manifest_promoted_artifact_path', expect.promotedArtifactPath, String(manifest.promoted_artifact_path), manifest.promoted_artifact_path === expect.promotedArtifactPath),
    check(
      'promoted_sha256_matches_actual_bytes',
      `manifest.promoted_artifact_sha256 === sha256(actual local promoted artifact bytes)`,
      `manifest=${manifest.promoted_artifact_sha256} actual=${actualPromotedArtifactSha256}`,
      manifest.promoted_artifact_sha256 === actualPromotedArtifactSha256,
    ),
    check(
      'promoted_sha256_matches_forecast_pin',
      expect.promotedArtifactSha256,
      String(manifest.promoted_artifact_sha256),
      manifest.promoted_artifact_sha256 === expect.promotedArtifactSha256 && actualPromotedArtifactSha256 === expect.promotedArtifactSha256,
    ),
    check('candidate_lineage_path', expect.candidatePath, String(manifest.source_candidate?.path), manifest.source_candidate?.path === expect.candidatePath),
    check(
      'candidate_lineage_sha256',
      `${expect.candidateSha256} (the prior Forecast candidate pin: promoted artifact must descend from exactly the candidate the archived experiment mirrors used)`,
      String(manifest.source_candidate?.sha256),
      manifest.source_candidate?.sha256 === expect.candidateSha256,
    ),
    check(
      'candidate_lineage_status_at_promotion',
      expect.candidateStatusAtPromotion,
      String(manifest.source_candidate?.status_at_promotion),
      manifest.source_candidate?.status_at_promotion === expect.candidateStatusAtPromotion,
    ),
    check(
      'manifest_allowlist_is_pinned_prefix_set',
      JSON.stringify([...expect.approvedSourcePrefixes]),
      JSON.stringify(allowlist),
      allowlist.length === expect.approvedSourcePrefixes.length && expect.approvedSourcePrefixes.every((p, i) => allowlist[i] === p),
    ),
  ];
};

/** Gate check 2: promoted artifact identity, scope, grain, ordering -- scanned over ALL records. */
export const checkPromotedArtifactIdentity = (
  artifact: PromotedArtifact,
  manifest: PromotedManifest,
  expect: PromotedSourceGateExpectations = PROMOTED_SOURCE_GATE_EXPECTATIONS,
): PromotedSourceGateCheck[] => {
  const records = artifact.records ?? [];
  const bySeason: Record<string, number> = {};
  const byPosition: Record<string, number> = {};
  const grains = new Set<string>();
  let duplicateGrains = 0;
  let nonRegRecords = 0;
  let outOfScopePositions = 0;
  let orderingViolations = 0;
  for (let i = 0; i < records.length; i += 1) {
    const row = records[i];
    bySeason[String(row.season)] = (bySeason[String(row.season)] ?? 0) + 1;
    byPosition[row.position] = (byPosition[row.position] ?? 0) + 1;
    const grain = `${row.player_id}|${row.season}|${row.season_type}`;
    if (grains.has(grain)) duplicateGrains += 1;
    grains.add(grain);
    if (row.season_type !== expect.seasonType) nonRegRecords += 1;
    if (!expect.positions.includes(row.position)) outOfScopePositions += 1;
    if (i > 0) {
      const prev = records[i - 1];
      if (row.season < prev.season || (row.season === prev.season && row.player_id < prev.player_id)) orderingViolations += 1;
    }
  }
  const sameCandidate =
    artifact.source_candidate?.path === manifest.source_candidate?.path &&
    artifact.source_candidate?.sha256 === manifest.source_candidate?.sha256 &&
    artifact.source_candidate?.status_at_promotion === manifest.source_candidate?.status_at_promotion;
  const seasonsSorted = [...(artifact.seasons ?? [])].sort((a, b) => a - b).join(',');
  return [
    check('artifact_promoted_status', expect.promotedStatus, String(artifact.status), artifact.status === expect.promotedStatus),
    check(
      'artifact_source_candidate_matches_manifest',
      'artifact.source_candidate identical to manifest.source_candidate (path, sha256, status_at_promotion)',
      sameCandidate ? 'identical' : `artifact=${JSON.stringify(artifact.source_candidate)} manifest=${JSON.stringify(manifest.source_candidate)}`,
      sameCandidate,
    ),
    check(
      'record_count',
      `${expect.recordCount} records, matching envelope counts.records`,
      `${records.length} records, envelope counts.records=${artifact.counts?.records}`,
      records.length === expect.recordCount && artifact.counts?.records === expect.recordCount,
    ),
    check(
      'seasons_scope_and_counts',
      `seasons ${expect.seasons.join(',')}; per-season counts ${JSON.stringify(expect.bySeason)} recomputed from records`,
      `seasons ${seasonsSorted}; recomputed ${JSON.stringify(bySeason)}`,
      seasonsSorted === expect.seasons.join(',') && JSON.stringify(bySeason) === JSON.stringify(expect.bySeason),
    ),
    check('season_type_reg_only', `every record season_type=${expect.seasonType}; envelope scope [${expect.seasonType}]`, `${nonRegRecords} non-${expect.seasonType} records; envelope scope [${(artifact.season_type_scope ?? []).join(',')}]`, nonRegRecords === 0 && (artifact.season_type_scope ?? []).join(',') === expect.seasonType),
    check(
      'positions_scope_and_counts',
      `positions ${expect.positions.join('/')} only; per-position counts ${JSON.stringify(expect.byPosition)} recomputed from records`,
      `${outOfScopePositions} out-of-scope position records; recomputed ${JSON.stringify(Object.fromEntries(Object.entries(byPosition).sort(([a], [b]) => (a < b ? -1 : 1))))}`,
      outOfScopePositions === 0 &&
        JSON.stringify(Object.fromEntries(Object.entries(byPosition).sort(([a], [b]) => (a < b ? -1 : 1)))) === JSON.stringify(expect.byPosition),
    ),
    check('row_grain_declared', expect.rowGrain, String(artifact.row_grain), artifact.row_grain === expect.rowGrain),
    check('duplicate_grain', '0 duplicate (player_id, season, season_type) grains across all records', `${duplicateGrains} duplicates`, duplicateGrains === 0),
    check(
      'deterministic_ordering',
      'records sorted by (season, player_id) as the #192 promotion review recorded',
      `${orderingViolations} ordering violations`,
      orderingViolations === 0,
    ),
    check('records_present', 'records array present and non-empty', `${records.length} records`, records.length > 0),
  ];
};

/**
 * Gate check 3: row-level provenance re-verified over ALL records of the actual consumed file with
 * PREFIX allow-list semantics (the TIBER-Data #193 standard -- never downgraded to substring):
 * every ref must START with an approved prefix, so mixed approved+unapproved refs and embedded-token
 * names fail; fixture/scaffold markers fail; observed_at must be present.
 */
export const checkPromotedProvenance = (
  records: PromotedCoverageRecord[],
  approvedPrefixes: readonly string[],
): PromotedSourceGateCheck[] => {
  let recordsMissingRefs = 0;
  let unapprovedRefs = 0;
  let fixtureMarkedRefs = 0;
  let refsMissingObservedAt = 0;
  let totalRefs = 0;
  const examples: string[] = [];
  for (const row of records) {
    const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
    if (refs.length === 0) {
      recordsMissingRefs += 1;
      continue;
    }
    for (const ref of refs) {
      totalRefs += 1;
      const name = String(ref.source_name ?? '');
      if (!approvedPrefixes.some((prefix) => name.startsWith(prefix))) {
        unapprovedRefs += 1;
        if (examples.length < 3) examples.push(name);
      }
      if (PROMOTED_FIXTURE_MARKERS.some((marker) => name.includes(marker))) fixtureMarkedRefs += 1;
      if (!ref.observed_at) refsMissingObservedAt += 1;
    }
  }
  return [
    check('source_refs_present', 'every record carries >= 1 source_ref', `${recordsMissingRefs} records missing refs (of ${records.length})`, recordsMissingRefs === 0 && records.length > 0),
    check(
      'source_refs_prefix_approved',
      `ALL refs start with an approved prefix (${approvedPrefixes.join(' | ')}); mixed and embedded-token provenance fail closed`,
      `${unapprovedRefs} unapproved of ${totalRefs} refs${examples.length > 0 ? ` (e.g. ${examples.join('; ')})` : ''}`,
      unapprovedRefs === 0 && totalRefs > 0,
    ),
    check('no_fixture_scaffold_markers', `no ref contains ${PROMOTED_FIXTURE_MARKERS.join('/')}`, `${fixtureMarkedRefs} fixture-marked refs`, fixtureMarkedRefs === 0),
    check('observed_at_present', 'every ref carries observed_at', `${refsMissingObservedAt} refs missing observed_at`, refsMissingObservedAt === 0),
  ];
};

/** Gate check 4: consumer-safety block and Forecast compatibility note boundaries. */
export const checkConsumerSafetyBoundary = (manifest: PromotedManifest): PromotedSourceGateCheck[] => {
  const notAllowed = manifest.consumer_safety?.not_allowed ?? [];
  const missingEntries = REQUIRED_NOT_ALLOWED_ENTRIES.filter(
    (required) => !notAllowed.some((entry) => entry.includes(required)),
  );
  const note = manifest.forecast_compatibility_note ?? '';
  const missingPhrases = REQUIRED_COMPATIBILITY_NOTE_PHRASES.filter((phrase) => !note.includes(phrase));
  return [
    check(
      'consumer_safety_not_allowed_boundary',
      `consumer_safety.not_allowed present and includes all ${REQUIRED_NOT_ALLOWED_ENTRIES.length} required boundaries (roster status, availability/injury, depth chart, ownership, advice/rankings, Forecast binding w/o separate gate)`,
      manifest.consumer_safety
        ? missingEntries.length === 0
          ? 'all required boundaries present'
          : `missing: ${missingEntries.join('; ')}`
        : 'consumer_safety block MISSING',
      Boolean(manifest.consumer_safety) && missingEntries.length === 0,
    ),
    check(
      'forecast_compatibility_note_boundary',
      `note present and requires: ${REQUIRED_COMPATIBILITY_NOTE_PHRASES.join(' • ')}`,
      note ? (missingPhrases.length === 0 ? 'all required elements present' : `missing: ${missingPhrases.join('; ')}`) : 'forecast_compatibility_note MISSING',
      note.length > 0 && missingPhrases.length === 0,
    ),
  ];
};

/** Gate check 5 (data side): the promoted rows themselves respect the leakage/null boundaries. */
export const checkLeakageDataBoundaries = (records: PromotedCoverageRecord[]): PromotedSourceGateCheck[] => {
  let forbiddenFieldHits = 0;
  let zeroCoercedUsage = 0;
  for (const row of records) {
    for (const key of PROMOTED_FORBIDDEN_AVAILABILITY_KEYS) {
      if (key in row) forbiddenFieldHits += 1;
    }
    const usage = row.usage_summary ?? {};
    for (const field of PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS) {
      if (usage !== null && field in usage && usage[field] === 0) zeroCoercedUsage += 1;
    }
  }
  return [
    check(
      'no_forbidden_availability_fields',
      `no record carries ${PROMOTED_FORBIDDEN_AVAILABILITY_KEYS.join('/')}`,
      `${forbiddenFieldHits} forbidden-field hits`,
      forbiddenFieldHits === 0,
    ),
    check(
      'unavailable_usage_fields_null_not_zero',
      `never zero-coerced: ${PROMOTED_ALWAYS_UNAVAILABLE_USAGE_FIELDS.join('/')} stay null when unavailable`,
      `${zeroCoercedUsage} zero-coerced values`,
      zeroCoercedUsage === 0,
    ),
  ];
};

// ---------------------------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------------------------

export interface PromotedSourceGateResult {
  gate_version: 'player-history-promoted-source-gate-v1';
  status: 'passed' | 'failed' | 'invalid';
  decision: PromotedSourceGateDecision;
  decision_rule: string;
  checks: PromotedSourceGateCheck[];
  blocking_reasons: string[];
  candidate_lineage_intact: boolean;
  leakage_discipline_for_future_refresh: typeof PROMOTED_SOURCE_LEAKAGE_DISCIPLINE;
  candidate_mirror_relationship: string;
  ceiling_note: string;
}

const DECISION_RULE =
  'all checks pass -> may_open_promoted_mirror_refresh_issue; any check fails with candidate lineage intact -> ' +
  'may_continue_using_candidate_mirrors_for_archived_experiment_only (promoted artifact must NOT be consumed); ' +
  'any check fails with candidate lineage broken -> blocked_promoted_artifact_gate_failed; malformed gate input -> ' +
  'promoted_source_gate_invalid_must_not_use. No decision authorizes a model run, metric computation, production ' +
  'binding, Data promotion, product output, or advice/rankings.';

const CEILING_NOTE =
  'may_open_promoted_mirror_refresh_issue is the strongest decision this gate can emit. It authorizes only OPENING a ' +
  'separate, later mirror-refresh issue that would update the experiment source reference from the candidate pin to the ' +
  'promoted artifact. It does not refresh mirrors here, does not run a model, computes no metrics, binds nothing into ' +
  'production Forecast, and makes no product or signal claim.';

const CANDIDATE_MIRROR_RELATIONSHIP =
  'Existing Forecast experiment mirrors (#110) were generated from the candidate pin ' +
  `${PINNED_SOURCE_ARTIFACT_SHA256} and remain valid ONLY as the archived record of the #112/#116 experiment. ` +
  'They are not refreshed, re-blessed, or invalidated by this gate; if a future issue refreshes mirrors from the ' +
  'promoted artifact, it must re-run the population/overlap gates on the refreshed mirrors before any further use.';

/** Structural validity of the gate input itself (not data quality -- evaluability). */
const gateInputProblems = (input: Partial<PromotedSourceGateInput>): string[] => {
  const problems: string[] = [];
  if (!input.manifest || typeof input.manifest !== 'object') problems.push('manifest missing or not an object');
  if (!input.artifact || typeof input.artifact !== 'object') problems.push('artifact missing or not an object');
  else if (!Array.isArray(input.artifact.records)) problems.push('artifact.records missing or not an array');
  if (!input.actualPromotedArtifactSha256 || !/^[0-9a-f]{64}$/.test(input.actualPromotedArtifactSha256)) {
    problems.push('actualPromotedArtifactSha256 missing or not a sha256 hex digest');
  }
  return problems;
};

/** Evaluate the full promoted-source gate. Pure (no I/O). */
export const evaluatePlayerHistoryPromotedSourceGate = (
  input: Partial<PromotedSourceGateInput>,
  expect: PromotedSourceGateExpectations = PROMOTED_SOURCE_GATE_EXPECTATIONS,
): PromotedSourceGateResult => {
  const problems = gateInputProblems(input);
  if (problems.length > 0) {
    return {
      gate_version: 'player-history-promoted-source-gate-v1',
      status: 'invalid',
      decision: 'promoted_source_gate_invalid_must_not_use',
      decision_rule: DECISION_RULE,
      checks: [],
      blocking_reasons: problems.map((p) => `gate input malformed: ${p}`),
      candidate_lineage_intact: false,
      leakage_discipline_for_future_refresh: PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
      candidate_mirror_relationship: CANDIDATE_MIRROR_RELATIONSHIP,
      ceiling_note: CEILING_NOTE,
    };
  }
  const { manifest, artifact, actualPromotedArtifactSha256 } = input as PromotedSourceGateInput;
  const checks = [
    ...checkManifestIdentity(manifest, actualPromotedArtifactSha256, expect),
    ...checkPromotedArtifactIdentity(artifact, manifest, expect),
    ...checkPromotedProvenance(artifact.records, expect.approvedSourcePrefixes),
    ...checkConsumerSafetyBoundary(manifest),
    ...checkLeakageDataBoundaries(artifact.records),
  ];
  const failed = checks.filter((c) => !c.passed);
  const lineageIntact = checks
    .filter((c) => (CANDIDATE_LINEAGE_DIMENSIONS as readonly string[]).includes(c.dimension))
    .every((c) => c.passed);
  const decision: PromotedSourceGateDecision =
    failed.length === 0
      ? 'may_open_promoted_mirror_refresh_issue'
      : lineageIntact
        ? 'may_continue_using_candidate_mirrors_for_archived_experiment_only'
        : 'blocked_promoted_artifact_gate_failed';
  return {
    gate_version: 'player-history-promoted-source-gate-v1',
    status: failed.length === 0 ? 'passed' : 'failed',
    decision,
    decision_rule: DECISION_RULE,
    checks,
    blocking_reasons: failed.map((c) => `${c.dimension}: expected ${c.expected}; observed ${c.observed}`),
    candidate_lineage_intact: lineageIntact,
    leakage_discipline_for_future_refresh: PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
    candidate_mirror_relationship: CANDIDATE_MIRROR_RELATIONSHIP,
    ceiling_note: CEILING_NOTE,
  };
};
