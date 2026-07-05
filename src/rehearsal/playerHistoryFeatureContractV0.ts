/**
 * Non-production contract schema/type + structural validator for
 * `player_history_production_feature_v0` (Forecast #129).
 *
 * This module implements the amended v0 contract shape from PR #124 (design proposal) as reviewed
 * and amended by PR #126 (`docs/experiments/player-history-feature-contract-v0-review-2026-07-04.md`,
 * §3) and scoped for implementation by PR #128
 * (`docs/experiments/player-history-feature-contract-v0-implementation-design-2026-07-04.md`, §2, §4).
 *
 * It is a NON-PRODUCTION schema/type. It is not imported by `seasonalPprModel.ts`, any production
 * route, or any Fantasy/product consumer. It performs no Forecast run, no feature binding, no
 * TIBER-Data promotion/demotion, and makes no production-readiness claim. It exists so a contract
 * instance can be structurally validated (required fields, closed enums, exact verbatim statement,
 * source-identity shape, null semantics) -- nothing more.
 *
 * v0 scope decisions carried forward unchanged from the design chain (not re-litigated here):
 * - `feature_availability_rules.family_scope` MUST be `production_only` (PR #128 §2.2 default rule;
 *   the full five-family set requires a separately-reviewed contract amendment).
 * - the rolling input window is `N = 3` prior seasons (PR #128 §2.3 default; changing `N` requires
 *   re-running the full experimental design, not a config edit).
 * - `contract_version` is pinned to the PR #126 §3.4 reviewed shape, `0.3.0-reviewed`: this
 *   implementation does not change the contract's fields, so no version bump is claimed.
 *
 * Pure module: no I/O, no network, no filesystem access. The CLI script
 * (`scripts/runPlayerHistoryContractV0Replay.ts`) performs I/O and calls into this module.
 */

import { createHash } from 'node:crypto';

export const PLAYER_HISTORY_FEATURE_CONTRACT_V0_SCHEMA_VERSION = 'player-history-feature-contract-v0-schema-v1' as const;

/** Fixed for the lifetime of this contract family (PR #126 §2 field_classification). */
export const PLAYER_HISTORY_CONTRACT_ID = 'player_history_production_feature_v0' as const;

/** The reviewed, amended contract_version accepted by PR #126 §3.4. Pinned; never a range or "latest". */
export const ACCEPTED_CONTRACT_VERSION = '0.3.0-reviewed' as const;

/** PR #128 §2.2: v0 default feature-family scope. The full five-family set requires a separate,
 *  explicitly-reviewed contract amendment (MINOR-or-larger version bump) -- never adopted silently. */
export const ACCEPTED_FEATURE_FAMILY_SCOPE = 'production_only' as const;

/** PR #128 §2.3: v0 default rolling-window length. Changing this is not a config edit -- it requires
 *  re-running the full LOOCV / train-fold-only imputation / shuffled-control experimental design. */
export const ACCEPTED_INPUT_WINDOW_SEASON_COUNT = 3 as const;

/** PR #126 §3.2: closed enum. `production_bound` is intentionally unreachable by any implementation
 *  or design-review issue alone -- reaching it requires a separate, explicit, human-approved decision. */
export const PROVENANCE_STATE_ENUM = [
  'experimental_replicated_not_production_bound',
  'contract_reviewed_not_production_bound',
  'implementation_designed_not_production_bound',
  'production_bound',
] as const;
export type ProvenanceState = (typeof PROVENANCE_STATE_ENUM)[number];

/** The provenance stage every instance generated under this (#129) implementation issue must carry:
 *  the design chain has already passed through implementation-design (PR #128); no production-binding
 *  decision has been made, so `production_bound` must never appear on any instance this repo emits. */
export const CURRENT_PROVENANCE_STATE: ProvenanceState = 'implementation_designed_not_production_bound';

/** PR #126 §3.2: closed enum (contract-governance lifecycle, distinct from any one run's own
 *  pass/fail outcome). */
export const VALIDATION_STATUS_ENUM = [
  'design_proposed_not_reviewed',
  'accepted_with_amendments_for_future_implementation_design',
  'implementation_design_in_progress',
  'implementation_design_accepted',
  'rejected_requires_redesign',
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUS_ENUM)[number];

/** The governance stage every instance generated under this (#129) implementation issue must carry:
 *  PR #128's decision (`may_open_player_history_contract_implementation_issue`) is exactly the
 *  "implementation design accepted" state this enum names -- #129 is the code-level implementation
 *  that decision authorized, not a further design pass. */
export const CURRENT_VALIDATION_STATUS: ValidationStatus = 'implementation_design_accepted';

/** PR #126 §2, §4: must be preserved verbatim by every consumer. Not a field a future implementation
 *  may shorten, paraphrase, or drop. */
export const NON_ADVICE_NON_RANKING_STATEMENT =
  'This contract describes a candidate MODEL FEATURE only. It is not fantasy advice, not a ranking, not a start/sit recommendation, and not a product-facing claim. No consumer of this contract may present its values, or any derivative of them, as advice or ranking output without a separate, explicitly-approved product-integration review.' as const;

/** PR #124 §7 / PR #126 §3.4: the join grain every gate in the #99-#122 chain has used. */
export const PLAYER_IDENTITY_JOIN_KEY_NAMES = ['player_id', 'season', 'season_type', 'position'] as const;
export const ACCEPTED_SEASON_TYPE = 'REG' as const;
export const ACCEPTED_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

/** PR #124 §7 / PR #126 §4: the non-negotiable temporal rule, locked, never amended by implementation. */
export const TEMPORAL_CUTOFF_RULE = 'feature values for target season S are built ONLY from seasons < S' as const;
export const TEMPORAL_CUTOFF_EXCLUDED = 'target season S in any form, including partial-season in-progress data' as const;

export const FEATURE_AVAILABILITY_REQUIRES =
  'at least one prior-season REG record for this player_id in the input window' as const;

export const NULL_NO_HISTORY_RULE =
  'entire feature block is null, never zero-filled, never imputed at serve time using population statistics computed after the fact' as const;
export const NULL_UNAVAILABLE_USAGE_RULE = 'remain null even when history exists, exactly as in the source artifact' as const;

/**
 * Fields/terms that must never appear anywhere in a contract instance (PR #126 §2 forbidden_fields;
 * issue #129 hard boundary). Checked both as literal object keys and, for the phrase-shaped entries,
 * as substrings of any string value -- a contract instance is not a place `ranking`/`advice` language
 * may leak into, even inside a free-text note.
 */
export const FORBIDDEN_FIELD_KEYS = [
  'active_status',
  'ownership_status',
  'roster_status',
  'active_roster_status',
  'availability_status',
  'injury_status',
  'depth_chart_rank',
  'ranking',
  'rank',
  'advice',
  'recommendation',
  'start_sit',
  'trade_value',
  'draft_rank',
  'production_acceptance_threshold',
] as const;

export interface SourceDatasetRefs {
  repo: string;
  artifact_path: string;
  artifact_sha256: string;
  promotion_review: string;
}

export interface PlayerIdentityJoinKeys {
  player_id: string;
  season: number;
  season_type: typeof ACCEPTED_SEASON_TYPE;
  position: (typeof ACCEPTED_POSITIONS)[number];
}

export interface TemporalCutoffSemantics {
  rule: typeof TEMPORAL_CUTOFF_RULE;
  input_window: string;
  excluded: typeof TEMPORAL_CUTOFF_EXCLUDED;
}

export interface FeatureAvailabilityRules {
  requires: typeof FEATURE_AVAILABILITY_REQUIRES;
  family_scope: typeof ACCEPTED_FEATURE_FAMILY_SCOPE;
  no_partial_season_substitution: true;
}

export interface NullMissingHistoryRules {
  no_history_player: typeof NULL_NO_HISTORY_RULE;
  unavailable_usage_fields: typeof NULL_UNAVAILABLE_USAGE_RULE;
}

/** Production-only feature block (PR #128 §2.2 default scope). Every field null for a no-history player. */
export interface ProductionOnlyFeatureBlock {
  trailing_2yr_ppr_total: number | null;
  trailing_3yr_ppr_total: number | null;
  trailing_2yr_ppr_mean: number | null;
  trailing_3yr_ppr_mean: number | null;
  year_over_year_ppr_trend: number | null;
}

export interface PlayerHistoryFeatureContractV0Row {
  player_identity_join_keys: PlayerIdentityJoinKeys;
  has_prior_history: boolean;
  /** null (the whole block, not per-field) when `has_prior_history` is false. */
  production: ProductionOnlyFeatureBlock | null;
}

/** The contract envelope (governance/provenance metadata) -- one per generated run, not one per row. */
export interface PlayerHistoryFeatureContractV0Envelope {
  contract_id: typeof PLAYER_HISTORY_CONTRACT_ID;
  contract_version: typeof ACCEPTED_CONTRACT_VERSION;
  source_dataset_refs: SourceDatasetRefs;
  player_identity_join_keys: readonly string[];
  temporal_cutoff_semantics: TemporalCutoffSemantics;
  feature_availability_rules: FeatureAvailabilityRules;
  null_missing_history_rules: NullMissingHistoryRules;
  provenance_state: ProvenanceState;
  generated_at: string;
  generator_script_version: string;
  run_id: string;
  validation_status: ValidationStatus;
  non_advice_non_ranking_statement: typeof NON_ADVICE_NON_RANKING_STATEMENT;
}

export interface MissingHistorySubgroupReport {
  count: number;
  total: number;
  share: number;
  by_position: Record<string, number>;
  every_no_history_row_entirely_null: boolean;
}

export interface PlayerHistoryFeatureContractV0Instance {
  kind: 'player_history_production_feature_v0_experimental_instance';
  not_production_bound: true;
  not_consumed_by_seasonal_ppr_model: true;
  not_fantasy_product_output: true;
  envelope: PlayerHistoryFeatureContractV0Envelope;
  rows: PlayerHistoryFeatureContractV0Row[];
  missing_history_subgroup_report: MissingHistorySubgroupReport;
}

// ---------------------------------------------------------------------------------------------
// run_id composition (PR #126 §3.3): full source identity, never sha256 alone.
// ---------------------------------------------------------------------------------------------

export const composeRunId = (
  sourceDatasetRefs: SourceDatasetRefs,
  contractVersion: string,
  generatorScriptVersion: string,
  generatedAt: string,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        sourceDatasetRefs.artifact_path,
        sourceDatasetRefs.artifact_sha256,
        sourceDatasetRefs.promotion_review,
        contractVersion,
        generatorScriptVersion,
        generatedAt,
      ]),
    )
    .digest('hex');

// ---------------------------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------------------------

export interface ContractValidationCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

const check = (dimension: string, expected: string, observed: string, passed: boolean): ContractValidationCheck => ({
  dimension,
  expected,
  observed,
  passed,
});

export const PLAYER_HISTORY_CONTRACT_V0_VALIDATION_DECISIONS = [
  'contract_instance_conforms_non_production',
  'contract_instance_invalid_fails_closed',
] as const;
export type ContractV0ValidationDecision = (typeof PLAYER_HISTORY_CONTRACT_V0_VALIDATION_DECISIONS)[number];

export interface ContractV0ValidationResult {
  schema_version: typeof PLAYER_HISTORY_FEATURE_CONTRACT_V0_SCHEMA_VERSION;
  status: 'passed' | 'failed';
  decision: ContractV0ValidationDecision;
  checks: ContractValidationCheck[];
  blocking_reasons: string[];
}

const isSha256Hex = (value: unknown): boolean => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isIso8601 = (value: unknown): boolean => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);

const objectKeysDeep = (value: unknown, keys: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) objectKeysDeep(item, keys);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      objectKeysDeep(nested, keys);
    }
  }
  return keys;
};

const stringValuesDeep = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringValuesDeep(item, out);
  else if (value !== null && typeof value === 'object') for (const nested of Object.values(value)) stringValuesDeep(nested, out);
  return out;
};

const checkForbiddenFields = (instance: PlayerHistoryFeatureContractV0Instance): ContractValidationCheck => {
  const keys = objectKeysDeep(instance as unknown);
  const literalHits = FORBIDDEN_FIELD_KEYS.filter((forbidden) => keys.has(forbidden));
  // The verbatim non-advice/non-ranking statement itself legitimately contains words like
  // "advice"/"ranking"/"recommendation" -- exclude it from the substring scan so the required
  // statement does not trip its own forbidden-language check.
  const otherStrings = stringValuesDeep(instance as unknown).filter((s) => s !== NON_ADVICE_NON_RANKING_STATEMENT);
  const substringHits = FORBIDDEN_FIELD_KEYS.filter((forbidden) =>
    otherStrings.some((s) => s.toLowerCase().includes(forbidden.replaceAll('_', ' '))),
  );
  const hits = [...new Set([...literalHits, ...substringHits])];
  return check(
    'no_forbidden_fields_or_language',
    `none of: ${FORBIDDEN_FIELD_KEYS.join(', ')}`,
    hits.length === 0 ? 'none present' : `present: ${hits.join(', ')}`,
    hits.length === 0,
  );
};

const checkEnvelope = (envelope: PlayerHistoryFeatureContractV0Envelope): ContractValidationCheck[] => {
  const refs = envelope.source_dataset_refs;
  return [
    check('contract_id', PLAYER_HISTORY_CONTRACT_ID, String(envelope.contract_id), envelope.contract_id === PLAYER_HISTORY_CONTRACT_ID),
    check('contract_version', ACCEPTED_CONTRACT_VERSION, String(envelope.contract_version), envelope.contract_version === ACCEPTED_CONTRACT_VERSION),
    check(
      'source_dataset_refs_shape',
      'repo (non-empty string) + artifact_path (non-empty string) + artifact_sha256 (sha256 hex) + promotion_review (non-empty string)',
      `repo=${refs?.repo} artifact_path=${refs?.artifact_path} artifact_sha256=${refs?.artifact_sha256} promotion_review=${refs?.promotion_review}`,
      Boolean(refs) &&
        typeof refs.repo === 'string' &&
        refs.repo.length > 0 &&
        typeof refs.artifact_path === 'string' &&
        refs.artifact_path.length > 0 &&
        isSha256Hex(refs.artifact_sha256) &&
        typeof refs.promotion_review === 'string' &&
        refs.promotion_review.length > 0,
    ),
    check(
      'player_identity_join_keys',
      JSON.stringify(PLAYER_IDENTITY_JOIN_KEY_NAMES),
      JSON.stringify(envelope.player_identity_join_keys),
      JSON.stringify(envelope.player_identity_join_keys) === JSON.stringify(PLAYER_IDENTITY_JOIN_KEY_NAMES),
    ),
    check(
      'temporal_cutoff_semantics',
      `rule="${TEMPORAL_CUTOFF_RULE}"; excluded="${TEMPORAL_CUTOFF_EXCLUDED}"`,
      `rule="${envelope.temporal_cutoff_semantics?.rule}"; excluded="${envelope.temporal_cutoff_semantics?.excluded}"`,
      envelope.temporal_cutoff_semantics?.rule === TEMPORAL_CUTOFF_RULE &&
        envelope.temporal_cutoff_semantics?.excluded === TEMPORAL_CUTOFF_EXCLUDED,
    ),
    check(
      'feature_availability_rules',
      `requires="${FEATURE_AVAILABILITY_REQUIRES}"; family_scope="${ACCEPTED_FEATURE_FAMILY_SCOPE}"; no_partial_season_substitution=true`,
      `requires="${envelope.feature_availability_rules?.requires}"; family_scope="${envelope.feature_availability_rules?.family_scope}"; no_partial_season_substitution=${envelope.feature_availability_rules?.no_partial_season_substitution}`,
      envelope.feature_availability_rules?.requires === FEATURE_AVAILABILITY_REQUIRES &&
        envelope.feature_availability_rules?.family_scope === ACCEPTED_FEATURE_FAMILY_SCOPE &&
        envelope.feature_availability_rules?.no_partial_season_substitution === true,
    ),
    check(
      'null_missing_history_rules',
      `no_history_player="${NULL_NO_HISTORY_RULE}"; unavailable_usage_fields="${NULL_UNAVAILABLE_USAGE_RULE}"`,
      `no_history_player="${envelope.null_missing_history_rules?.no_history_player}"; unavailable_usage_fields="${envelope.null_missing_history_rules?.unavailable_usage_fields}"`,
      envelope.null_missing_history_rules?.no_history_player === NULL_NO_HISTORY_RULE &&
        envelope.null_missing_history_rules?.unavailable_usage_fields === NULL_UNAVAILABLE_USAGE_RULE,
    ),
    check(
      'provenance_state_closed_enum',
      PROVENANCE_STATE_ENUM.join(' | '),
      String(envelope.provenance_state),
      (PROVENANCE_STATE_ENUM as readonly string[]).includes(envelope.provenance_state) &&
        envelope.provenance_state !== 'production_bound',
    ),
    check(
      'validation_status_closed_enum',
      VALIDATION_STATUS_ENUM.join(' | '),
      String(envelope.validation_status),
      (VALIDATION_STATUS_ENUM as readonly string[]).includes(envelope.validation_status),
    ),
    check('generated_at_iso8601', 'ISO-8601 timestamp', String(envelope.generated_at), isIso8601(envelope.generated_at)),
    check(
      'generator_script_version_present',
      'non-empty string',
      String(envelope.generator_script_version),
      typeof envelope.generator_script_version === 'string' && envelope.generator_script_version.length > 0,
    ),
    check(
      'run_id_recomputable',
      'run_id === composeRunId(source_dataset_refs, contract_version, generator_script_version, generated_at)',
      `stored=${envelope.run_id} recomputed=${refs ? composeRunId(refs, envelope.contract_version, envelope.generator_script_version, envelope.generated_at) : 'n/a'}`,
      Boolean(refs) && envelope.run_id === composeRunId(refs, envelope.contract_version, envelope.generator_script_version, envelope.generated_at),
    ),
    check(
      'non_advice_non_ranking_statement_verbatim',
      NON_ADVICE_NON_RANKING_STATEMENT,
      String(envelope.non_advice_non_ranking_statement),
      envelope.non_advice_non_ranking_statement === NON_ADVICE_NON_RANKING_STATEMENT,
    ),
  ];
};

const isZeroSentinelForNull = (value: number | null): boolean => value === 0;

/** The exact field set a present `production` block must carry -- never a subset, never extra keys. */
const PRODUCTION_BLOCK_FIELD_NAMES = [
  'trailing_2yr_ppr_total',
  'trailing_3yr_ppr_total',
  'trailing_2yr_ppr_mean',
  'trailing_3yr_ppr_mean',
  'year_over_year_ppr_trend',
] as const;

/** True only if `value` is a plain object with EXACTLY the required keys, each `number | null`. */
const isWellFormedProductionBlock = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== PRODUCTION_BLOCK_FIELD_NAMES.length || !PRODUCTION_BLOCK_FIELD_NAMES.every((name) => keys.includes(name))) return false;
  return PRODUCTION_BLOCK_FIELD_NAMES.every((name) => {
    const fieldValue = (value as Record<string, unknown>)[name];
    return fieldValue === null || typeof fieldValue === 'number';
  });
};

const checkRows = (rows: readonly PlayerHistoryFeatureContractV0Row[]): ContractValidationCheck[] => {
  let badJoinKeys = 0;
  let noHistoryNotNull = 0;
  let noHistoryZeroCoerced = 0;
  let historyMissingBlock = 0;
  let historyMalformedBlock = 0;
  for (const row of rows) {
    const keys = row.player_identity_join_keys;
    if (
      !keys ||
      typeof keys.player_id !== 'string' ||
      typeof keys.season !== 'number' ||
      keys.season_type !== ACCEPTED_SEASON_TYPE ||
      !(ACCEPTED_POSITIONS as readonly string[]).includes(keys.position)
    ) {
      badJoinKeys += 1;
    }
    if (!row.has_prior_history) {
      if (row.production !== null) {
        noHistoryNotNull += 1;
        const values = Object.values(row.production as unknown as Record<string, number | null>);
        if (values.some((v) => isZeroSentinelForNull(v))) noHistoryZeroCoerced += 1;
      }
    } else if (row.production === null) {
      historyMissingBlock += 1;
    } else if (!isWellFormedProductionBlock(row.production)) {
      historyMalformedBlock += 1;
    }
  }
  return [
    check('row_join_keys_valid', `player_id:string, season:number, season_type:${ACCEPTED_SEASON_TYPE}, position:${ACCEPTED_POSITIONS.join('|')}`, `${badJoinKeys} invalid of ${rows.length}`, badJoinKeys === 0),
    check(
      'no_history_rows_entirely_null',
      'has_prior_history=false => production block is null (never zero-filled, never partially populated)',
      `${noHistoryNotNull} non-null no-history blocks (${noHistoryZeroCoerced} zero-coerced)`,
      noHistoryNotNull === 0,
    ),
    check(
      'has_history_rows_carry_production_block',
      'has_prior_history=true => production block present (object, may contain individually-null fields)',
      `${historyMissingBlock} missing blocks`,
      historyMissingBlock === 0,
    ),
    check(
      'has_history_production_block_shape_valid',
      `production block has EXACTLY these keys, each number|null: ${PRODUCTION_BLOCK_FIELD_NAMES.join(', ')}`,
      `${historyMalformedBlock} malformed blocks (missing/renamed/extra fields or wrong-typed values)`,
      historyMalformedBlock === 0,
    ),
  ];
};

const checkMissingHistoryReport = (
  rows: readonly PlayerHistoryFeatureContractV0Row[],
  report: MissingHistorySubgroupReport,
): ContractValidationCheck[] => {
  const actualCount = rows.filter((row) => !row.has_prior_history).length;
  const actualTotal = rows.length;
  const actualShare = actualTotal > 0 ? actualCount / actualTotal : 0;
  const actualByPosition: Record<string, number> = {};
  for (const row of rows) {
    if (!row.has_prior_history) actualByPosition[row.player_identity_join_keys.position] = (actualByPosition[row.player_identity_join_keys.position] ?? 0) + 1;
  }
  const sortedActual = Object.fromEntries(Object.entries(actualByPosition).sort(([a], [b]) => (a < b ? -1 : 1)));
  const sortedReported = Object.fromEntries(Object.entries(report.by_position ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));
  return [
    check('missing_history_count', String(actualCount), String(report.count), report.count === actualCount),
    check('missing_history_total', String(actualTotal), String(report.total), report.total === actualTotal),
    check('missing_history_share', actualShare.toFixed(6), Number(report.share).toFixed(6), Math.abs(report.share - actualShare) < 1e-9),
    check('missing_history_by_position', JSON.stringify(sortedActual), JSON.stringify(sortedReported), JSON.stringify(sortedActual) === JSON.stringify(sortedReported)),
    check(
      'missing_history_every_row_entirely_null_flag',
      'true',
      String(report.every_no_history_row_entirely_null),
      report.every_no_history_row_entirely_null === true,
    ),
  ];
};

/**
 * Validate a contract instance structurally against the amended v0 shape. Pure; no I/O. Fails
 * closed: `contract_instance_invalid_fails_closed` unless every check passes. This is a STRUCTURAL
 * validator only -- it is never a production consumer and confers no production-readiness.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const validatePlayerHistoryFeatureContractV0Instance = (
  instance: PlayerHistoryFeatureContractV0Instance,
): ContractV0ValidationResult => {
  // Guard the two nested objects every sub-check dereferences without optional chaining. A
  // malformed/corrupted/parsed-JSON instance missing `envelope` or `missing_history_subgroup_report`
  // entirely must FAIL CLOSED with a documented blocking reason -- never throw an uncaught exception,
  // which would prevent a caller from ever seeing a result to act on.
  const envelopePresent = isPlainObject(instance?.envelope);
  const reportPresent = isPlainObject(instance?.missing_history_subgroup_report);
  const rows = Array.isArray(instance?.rows) ? instance.rows : [];

  const checks: ContractValidationCheck[] = [
    check('kind', 'player_history_production_feature_v0_experimental_instance', String(instance?.kind), instance?.kind === 'player_history_production_feature_v0_experimental_instance'),
    check('not_production_bound', 'true', String(instance?.not_production_bound), instance?.not_production_bound === true),
    check('not_consumed_by_seasonal_ppr_model', 'true', String(instance?.not_consumed_by_seasonal_ppr_model), instance?.not_consumed_by_seasonal_ppr_model === true),
    check('not_fantasy_product_output', 'true', String(instance?.not_fantasy_product_output), instance?.not_fantasy_product_output === true),
    check('envelope_present', 'envelope is a present object', envelopePresent ? 'present' : String(instance?.envelope), envelopePresent),
    ...(envelopePresent ? checkEnvelope(instance.envelope) : []),
    ...checkRows(rows),
    check('missing_history_subgroup_report_present', 'missing_history_subgroup_report is a present object', reportPresent ? 'present' : String(instance?.missing_history_subgroup_report), reportPresent),
    ...(reportPresent ? checkMissingHistoryReport(rows, instance.missing_history_subgroup_report) : []),
    checkForbiddenFields(instance),
  ];
  const failed = checks.filter((c) => !c.passed);
  return {
    schema_version: PLAYER_HISTORY_FEATURE_CONTRACT_V0_SCHEMA_VERSION,
    status: failed.length === 0 ? 'passed' : 'failed',
    decision: failed.length === 0 ? 'contract_instance_conforms_non_production' : 'contract_instance_invalid_fails_closed',
    checks,
    blocking_reasons: failed.map((c) => `${c.dimension}: expected ${c.expected}; observed ${c.observed}`),
  };
};
