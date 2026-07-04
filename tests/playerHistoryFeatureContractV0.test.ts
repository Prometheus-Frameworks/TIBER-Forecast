/**
 * Guardrail tests for the non-production `player_history_production_feature_v0` contract schema/
 * validator (Forecast #129). Pins: required-field/shape conformance, closed enums (including that
 * `production_bound` is unreachable), the exact verbatim non-advice/non-ranking statement, full-
 * identity `run_id` recomputation (never sha256 alone), forbidden-field fail-closed behavior, and
 * no-history rows being entirely null (never zero-coerced, never partially populated).
 */

import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_CONTRACT_VERSION,
  ACCEPTED_FEATURE_FAMILY_SCOPE,
  CURRENT_PROVENANCE_STATE,
  CURRENT_VALIDATION_STATUS,
  FEATURE_AVAILABILITY_REQUIRES,
  NON_ADVICE_NON_RANKING_STATEMENT,
  NULL_NO_HISTORY_RULE,
  NULL_UNAVAILABLE_USAGE_RULE,
  PLAYER_HISTORY_CONTRACT_ID,
  PLAYER_IDENTITY_JOIN_KEY_NAMES,
  TEMPORAL_CUTOFF_EXCLUDED,
  TEMPORAL_CUTOFF_RULE,
  composeRunId,
  validatePlayerHistoryFeatureContractV0Instance,
  type PlayerHistoryFeatureContractV0Instance,
  type PlayerHistoryFeatureContractV0Row,
  type SourceDatasetRefs,
} from '../src/rehearsal/playerHistoryFeatureContractV0.js';

const REFS: SourceDatasetRefs = {
  repo: 'Prometheus-Frameworks/TIBER-Data',
  artifact_path: 'exports/promoted/nfl/player_season_coverage_v0.json',
  artifact_sha256: '29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035',
  promotion_review: 'TIBER-Data#192',
};
const GENERATOR_SCRIPT_VERSION = 'player-history-contract-v0-replay-v1';
const GENERATED_AT = '2026-07-04T00:00:00.000Z';

const historyRow: PlayerHistoryFeatureContractV0Row = {
  player_identity_join_keys: { player_id: '00-0000001', season: 2025, season_type: 'REG', position: 'WR' },
  has_prior_history: true,
  production: {
    trailing_2yr_ppr_total: 250.5,
    trailing_3yr_ppr_total: 400.2,
    trailing_2yr_ppr_mean: 125.25,
    trailing_3yr_ppr_mean: 133.4,
    year_over_year_ppr_trend: 10.1,
  },
};

const noHistoryRow: PlayerHistoryFeatureContractV0Row = {
  player_identity_join_keys: { player_id: '00-0000002', season: 2025, season_type: 'REG', position: 'RB' },
  has_prior_history: false,
  production: null,
};

const buildValidInstance = (rowsInput: PlayerHistoryFeatureContractV0Row[] = [historyRow, noHistoryRow]): PlayerHistoryFeatureContractV0Instance => {
  // Deep-clone so a test that mutates the returned instance's rows (e.g. injecting a forbidden
  // field) never leaks that mutation back into the shared `historyRow`/`noHistoryRow` fixtures.
  const rows = structuredClone(rowsInput);
  const noHistory = rows.filter((r) => !r.has_prior_history);
  const byPosition: Record<string, number> = {};
  for (const row of noHistory) byPosition[row.player_identity_join_keys.position] = (byPosition[row.player_identity_join_keys.position] ?? 0) + 1;
  return {
    kind: 'player_history_production_feature_v0_experimental_instance',
    not_production_bound: true,
    not_consumed_by_seasonal_ppr_model: true,
    not_fantasy_product_output: true,
    envelope: {
      contract_id: PLAYER_HISTORY_CONTRACT_ID,
      contract_version: ACCEPTED_CONTRACT_VERSION,
      source_dataset_refs: REFS,
      player_identity_join_keys: PLAYER_IDENTITY_JOIN_KEY_NAMES,
      temporal_cutoff_semantics: { rule: TEMPORAL_CUTOFF_RULE, input_window: 'rolling 3 prior seasons (2022, 2023, 2024)', excluded: TEMPORAL_CUTOFF_EXCLUDED },
      feature_availability_rules: { requires: FEATURE_AVAILABILITY_REQUIRES, family_scope: ACCEPTED_FEATURE_FAMILY_SCOPE, no_partial_season_substitution: true },
      null_missing_history_rules: { no_history_player: NULL_NO_HISTORY_RULE, unavailable_usage_fields: NULL_UNAVAILABLE_USAGE_RULE },
      provenance_state: CURRENT_PROVENANCE_STATE,
      generated_at: GENERATED_AT,
      generator_script_version: GENERATOR_SCRIPT_VERSION,
      run_id: composeRunId(REFS, ACCEPTED_CONTRACT_VERSION, GENERATOR_SCRIPT_VERSION, GENERATED_AT),
      validation_status: CURRENT_VALIDATION_STATUS,
      non_advice_non_ranking_statement: NON_ADVICE_NON_RANKING_STATEMENT,
    },
    rows,
    missing_history_subgroup_report: {
      count: noHistory.length,
      total: rows.length,
      share: rows.length > 0 ? noHistory.length / rows.length : 0,
      by_position: Object.fromEntries(Object.entries(byPosition).sort(([a], [b]) => (a < b ? -1 : 1))),
      every_no_history_row_entirely_null: noHistory.every((r) => r.production === null),
    },
  };
};

describe('playerHistoryFeatureContractV0 schema/validator', () => {
  it('a well-formed instance conforms and validates', () => {
    const result = validatePlayerHistoryFeatureContractV0Instance(buildValidInstance());
    expect(result.status).toBe('passed');
    expect(result.decision).toBe('contract_instance_conforms_non_production');
    expect(result.blocking_reasons).toEqual([]);
  });

  it('rejects a wrong contract_id', () => {
    const instance = buildValidInstance();
    // @ts-expect-error intentional mutation to exercise validator failure
    instance.envelope.contract_id = 'player_history_production_feature_v1';
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.decision).toBe('contract_instance_invalid_fails_closed');
    expect(result.blocking_reasons.some((r) => r.startsWith('contract_id'))).toBe(true);
  });

  it('rejects a contract_version that is not the accepted reviewed version', () => {
    const instance = buildValidInstance();
    // @ts-expect-error intentional mutation
    instance.envelope.contract_version = '0.1.0-proposed';
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('contract_version'))).toBe(true);
  });

  it('closes the provenance_state enum: production_bound is unreachable even though present in the raw enum list', () => {
    const instance = buildValidInstance();
    instance.envelope.provenance_state = 'production_bound';
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('provenance_state_closed_enum'))).toBe(true);
  });

  it('rejects an out-of-enum provenance_state', () => {
    const instance = buildValidInstance();
    // @ts-expect-error intentional mutation
    instance.envelope.provenance_state = 'made_up_state';
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
  });

  it('rejects an out-of-enum validation_status', () => {
    const instance = buildValidInstance();
    // @ts-expect-error intentional mutation
    instance.envelope.validation_status = 'made_up_status';
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('validation_status_closed_enum'))).toBe(true);
  });

  it('requires the non-advice/non-ranking statement preserved VERBATIM, not paraphrased', () => {
    const instance = buildValidInstance();
    // @ts-expect-error intentional mutation
    instance.envelope.non_advice_non_ranking_statement = NON_ADVICE_NON_RANKING_STATEMENT.replace('candidate MODEL FEATURE', 'candidate model feature');
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('non_advice_non_ranking_statement_verbatim'))).toBe(true);
  });

  it('requires source_dataset_refs.artifact_sha256 to be a sha256 hex digest', () => {
    const instance = buildValidInstance();
    instance.envelope.source_dataset_refs.artifact_sha256 = 'not-a-sha256';
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('source_dataset_refs_shape'))).toBe(true);
  });

  it('recomputes run_id from the full source identity and rejects a stale/tampered run_id', () => {
    const instance = buildValidInstance();
    instance.envelope.run_id = 'deadbeef'.repeat(8);
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('run_id_recomputable'))).toBe(true);
  });

  it('rejects a no-history row whose production block is non-null (must be entirely null)', () => {
    const instance = buildValidInstance([
      historyRow,
      { ...noHistoryRow, production: { trailing_2yr_ppr_total: 0, trailing_3yr_ppr_total: null, trailing_2yr_ppr_mean: null, trailing_3yr_ppr_mean: null, year_over_year_ppr_trend: null } },
    ]);
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('no_history_rows_entirely_null'))).toBe(true);
  });

  it('rejects a has-history row missing its production block', () => {
    const instance = buildValidInstance([{ ...historyRow, production: null }, noHistoryRow]);
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('has_history_rows_carry_production_block'))).toBe(true);
  });

  it('rejects a row with an out-of-scope position', () => {
    const instance = buildValidInstance([
      historyRow,
      { ...noHistoryRow, player_identity_join_keys: { ...noHistoryRow.player_identity_join_keys, position: 'K' as never } },
    ]);
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('row_join_keys_valid'))).toBe(true);
  });

  it('rejects a mismatched missing-history subgroup report (count/share/by_position must match the rows)', () => {
    const instance = buildValidInstance();
    instance.missing_history_subgroup_report.count = 99;
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('missing_history_count'))).toBe(true);
  });

  it('fails closed on a forbidden field (ranking) injected anywhere in the instance', () => {
    const instance = buildValidInstance();
    (instance as unknown as { rows: Array<Record<string, unknown>> }).rows[0]!.ranking = 'WR1';
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('failed');
    expect(result.blocking_reasons.some((r) => r.startsWith('no_forbidden_fields_or_language'))).toBe(true);
  });

  it('does not false-positive the forbidden-language scan on the required verbatim statement itself', () => {
    // The statement legitimately contains "advice", "ranking", "recommendation" -- must not trip itself.
    const result = validatePlayerHistoryFeatureContractV0Instance(buildValidInstance());
    expect(result.checks.find((c) => c.dimension === 'no_forbidden_fields_or_language')?.passed).toBe(true);
  });
});

describe('composeRunId (PR #126 §3.3: full source identity, never sha256 alone)', () => {
  const base = () => composeRunId(REFS, ACCEPTED_CONTRACT_VERSION, GENERATOR_SCRIPT_VERSION, GENERATED_AT);

  it('is deterministic for identical inputs', () => {
    expect(base()).toBe(base());
  });

  it('changes when artifact_sha256 changes (same path/promotion_review)', () => {
    const other = composeRunId({ ...REFS, artifact_sha256: 'a'.repeat(64) }, ACCEPTED_CONTRACT_VERSION, GENERATOR_SCRIPT_VERSION, GENERATED_AT);
    expect(other).not.toBe(base());
  });

  it('changes when artifact_path changes, even with the SAME sha256 (never sha256 alone)', () => {
    const other = composeRunId({ ...REFS, artifact_path: 'exports/promoted/nfl/other_path.json' }, ACCEPTED_CONTRACT_VERSION, GENERATOR_SCRIPT_VERSION, GENERATED_AT);
    expect(other).not.toBe(base());
  });

  it('changes when promotion_review changes, even with the SAME sha256 (never sha256 alone)', () => {
    const other = composeRunId({ ...REFS, promotion_review: 'TIBER-Data#999' }, ACCEPTED_CONTRACT_VERSION, GENERATOR_SCRIPT_VERSION, GENERATED_AT);
    expect(other).not.toBe(base());
  });

  it('changes when contract_version, generator_script_version, or generated_at change', () => {
    expect(composeRunId(REFS, '0.4.0-reviewed', GENERATOR_SCRIPT_VERSION, GENERATED_AT)).not.toBe(base());
    expect(composeRunId(REFS, ACCEPTED_CONTRACT_VERSION, 'other-generator-v2', GENERATED_AT)).not.toBe(base());
    expect(composeRunId(REFS, ACCEPTED_CONTRACT_VERSION, GENERATOR_SCRIPT_VERSION, '2026-07-05T00:00:00.000Z')).not.toBe(base());
  });
});
