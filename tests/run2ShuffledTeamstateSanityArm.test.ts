import { describe, expect, it } from 'vitest';
import {
  RUN2_SHUFFLED_SANITY_ARM_VERSION,
  RUN2_SHUFFLE_DEFAULT_SEED,
  bindRun2GovernedTeamstateValues,
  buildRun2ShuffledTeamstateSanityArm,
  fixtureGovernedTeamstateBindingArtifact,
  tiberDataSeasonalPprDataset,
} from '../src/public/index.js';

const readyArtifact = fixtureGovernedTeamstateBindingArtifact;

const buildReady = (seed?: number) => {
  const result = buildRun2ShuffledTeamstateSanityArm(readyArtifact, seed === undefined ? {} : { shuffle_seed: seed });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  return result.data;
};

describe('Run 2 shuffled-Teamstate sanity arm', () => {
  it('returns a service failure only for non-object input', () => {
    const result = buildRun2ShuffledTeamstateSanityArm(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'RUN2_SHUFFLED_SANITY_ARM_INPUT_INVALID' })]),
    );
  });

  it('emits a not-built report when readiness is not met (no governed bind)', () => {
    const { forecastCutoff: _cutoff, ...noCutoff } = readyArtifact;
    const result = buildRun2ShuffledTeamstateSanityArm(noCutoff);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sanity_arm_status).toBe('not_built_not_bound');
    expect(result.data.shuffled_rows).toEqual([]);
    expect(result.data.bound.binding_status).not.toBe('governed_teamstate_values_bound');
  });

  it('emits a not-built report when ready but no team-week values were bound', () => {
    const { teamWeekValues: _values, ...noValues } = readyArtifact;
    const result = buildRun2ShuffledTeamstateSanityArm(noValues);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sanity_arm_status).toBe('not_built_not_bound');
    expect(result.data.bound.binding_status).toBe('not_bound_no_team_week_values');
  });

  it('is grounded in the #82 bound report and does not bypass value binding', () => {
    const data = buildReady();
    expect(data.sanity_arm_version).toBe(RUN2_SHUFFLED_SANITY_ARM_VERSION);
    expect(data.candidate_status).toBe('pre_train_shuffled_teamstate_sanity_candidate');
    expect(data.sanity_arm_status).toBe('shuffled_teamstate_values_ready');
    expect(data.bound.binding_status).toBe('governed_teamstate_values_bound');
    expect(data.bound_ref.binding_status).toBe('governed_teamstate_values_bound');
    expect(data.readiness_ref.readiness_status).toBe('ready_for_value_binding');
  });

  it('keeps one row per Run 1 SeasonalPlayerObservation', () => {
    const data = buildReady();
    expect(data.row_grain).toBe('player_season_forecast');
    expect(data.row_count).toBe(tiberDataSeasonalPprDataset.observations.length);
    expect(data.row_count).toBe(data.bound.row_count);
    const ids = data.shuffled_rows.map((row) => row.player_id).sort();
    expect(ids).toEqual(tiberDataSeasonalPprDataset.observations.map((o) => o.player_id).sort());
  });

  it('preserves Run 1 feature values, identity, seasons, and the label-only target unchanged', () => {
    const data = buildReady();
    const bound = bindRun2GovernedTeamstateValues(readyArtifact);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const boundById = new Map(bound.data.bound_rows.map((row) => [row.player_id, row]));
    for (const row of data.shuffled_rows) {
      const original = boundById.get(row.player_id);
      expect(original).toBeDefined();
      if (!original) continue;
      // Run 1 inputs and identity/seasons untouched.
      expect(row.run1_feature_values).toEqual(original.run1_feature_values);
      expect(row.position).toBe(original.position);
      expect(row.team_2024).toBe(original.team_2024);
      expect(row.input_season).toBe(2024);
      expect(row.target_season).toBe(2025);
      // Label-only target untouched and outside input groups.
      expect(row.target).toEqual(original.target);
      expect(row.target.role).toBe('label_only');
      expect(row.run1_feature_values).not.toHaveProperty('ppr_2025_actual');
      expect(row.teamstate_feature_values).not.toHaveProperty('ppr_2025_actual');
    }
  });

  it('shuffles only the Teamstate value payloads (assigns another team\'s bound group)', () => {
    const data = buildReady(); // default seed -> BAL receives PHI's group
    const bound = bindRun2GovernedTeamstateValues(readyArtifact);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const aggregateValues = new Map(bound.data.binding_coverage.aggregates.map((a) => [a.team, a.values]));

    const balRow = data.shuffled_rows.find((row) => row.team_2024 === 'BAL');
    expect(balRow?.teamstate_shuffled).toBe(true);
    expect(balRow?.original_teamstate_source_team).toBe('BAL');
    const source = balRow?.shuffled_teamstate_source_team;
    expect(source).toBeDefined();
    expect(source).not.toBe('BAL');
    if (source) {
      // The bound values now equal the SOURCE team's bound group, not BAL's own.
      expect(balRow?.teamstate_feature_values.epaPerPlay).toBeCloseTo(aggregateValues.get(source)?.epaPerPlay as number, 10);
      expect(balRow?.teamstate_feature_values.epaPerPlay).not.toBeCloseTo(aggregateValues.get('BAL')?.epaPerPlay as number, 5);
    }
  });

  it('is deterministic for a fixed seed and reassigns groups away from their team where feasible', () => {
    const a = buildReady(RUN2_SHUFFLE_DEFAULT_SEED);
    const b = buildReady(RUN2_SHUFFLE_DEFAULT_SEED);
    expect(a.shuffle_map).toEqual(b.shuffle_map);
    expect(a.shuffled_rows).toEqual(b.shuffled_rows);
    // 3 matched groups -> a full derangement is feasible; none maps to itself.
    expect(a.shuffle_coverage.identity_avoided).toBe(true);
    expect(a.shuffle_map.every((entry) => entry.shuffled_away)).toBe(true);
    expect(a.shuffle_coverage.matched_group_count).toBe(3);
    expect(a.shuffle_coverage.permuted_group_count).toBe(3);
  });

  it('changes the shuffle mapping when the seed changes (where feasible)', () => {
    const s0 = buildReady(0);
    const s1 = buildReady(1);
    expect(s0.shuffle_map).not.toEqual(s1.shuffle_map);
    expect(s0.shuffle_seed).toBe(0);
    expect(s1.shuffle_seed).toBe(1);
  });

  it('preserves the marginal multiset of Teamstate value groups (bijection over matched teams)', () => {
    const data = buildReady();
    const groupKey = (values: Record<string, number | null>): string =>
      JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]));
    // One assigned group per matched team, taken from a representative row.
    const assignedByTeam = new Map<string, string>();
    for (const row of data.shuffled_rows) {
      if (!row.teamstate_binding_matched) continue;
      assignedByTeam.set(row.team_2024, groupKey({ ...row.teamstate_feature_values, ...row.teamstate_partial_null_values }));
    }
    const bound = bindRun2GovernedTeamstateValues(readyArtifact);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const originalGroups = bound.data.binding_coverage.aggregates.map((a) => groupKey(a.values)).sort();
    const assignedGroups = [...assignedByTeam.values()].sort();
    expect(assignedGroups).toEqual(originalGroups);
  });

  it('keeps unmatched rows null and never zero-filled', () => {
    const data = buildReady();
    const unmatched = data.shuffled_rows.filter((row) => !row.teamstate_binding_matched);
    expect(unmatched.length).toBeGreaterThan(0);
    for (const row of unmatched) {
      expect(row.unmatched_null_preserved).toBe(true);
      expect(row.teamstate_shuffled).toBe(false);
      expect(row.shuffled_teamstate_source_team).toBeNull();
      for (const value of Object.values(row.teamstate_feature_values)) expect(value).toBeNull();
      for (const value of Object.values(row.teamstate_partial_null_values)) expect(value).toBeNull();
    }
    // A matched team whose partial-null column was all-null keeps null after shuffling (PHI's group).
    const recipientsOfNullPartial = data.shuffled_rows.filter(
      (row) => row.teamstate_binding_matched && row.shuffled_teamstate_source_team === 'PHI',
    );
    for (const row of recipientsOfNullPartial) {
      expect(row.teamstate_partial_null_values.redZoneTdRate).toBeNull();
    }
  });

  it('preserves governance / source / validation / lineage / cutoff refs from the bound report', () => {
    const data = buildReady();
    expect(data.teamstate_governance).toEqual(data.bound.teamstate_governance);
    expect(data.source_artifact_refs).toEqual(data.bound.source_artifact_refs);
    expect(data.validation_refs).toEqual(data.bound.validation_refs);
    expect(data.lineage_refs).toEqual(data.bound.lineage_refs);
    expect(data.recorded_cutoff).toEqual(data.bound.recorded_cutoff);
    expect(data.recorded_cutoff.input_season).toBe(2024);
    expect(data.recorded_cutoff.as_of).toBe('2025-03-01T00:00:00.000Z');
  });

  it('keeps pressure / fantasy / target-leakage out of the shuffled columns', () => {
    const data = buildReady();
    expect(data.pressure_status).toBe('unavailable_insufficient_data_deferred_excluded');
    expect(data.target_leakage_status).toBe('no_target_derived_fields_included');
    const columns = [...data.teamstate_shuffled_feature_columns, ...data.partial_null_columns];
    for (const column of columns) {
      const lower = column.toLowerCase();
      for (const signal of ['pressure', 'fantasy', 'target', 'label', 'future', 'nextseason', 'outcome']) {
        expect(lower).not.toContain(signal);
      }
    }
    for (const row of data.shuffled_rows) {
      expect(row.teamstate_feature_values).not.toHaveProperty('pressureRateAllowed');
      expect(row.teamstate_partial_null_values).not.toHaveProperty('pressureRateAllowed');
    }
  });

  it('records not-trained / not-evaluated / not-executed / not-compared and emits no model outputs', () => {
    const data = buildReady();
    expect(data.execution_status).toBe('not_trained');
    expect(data.evaluation_status).toBe('not_evaluated');
    expect(data.run_2_executed).toBe(false);
    expect(data.comparison_status).toBe('not_run');
    for (const key of [
      'predictions',
      'metrics',
      'model_refs',
      'model_ref',
      'evaluation',
      'evaluation_refs',
      'run_comparison',
      'comparison',
      'result',
      'results',
    ]) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it('identifies itself as a pre-train shuffled sanity/control arm, not real Run 2', () => {
    const data = buildReady();
    expect(data.candidate_status).toBe('pre_train_shuffled_teamstate_sanity_candidate');
    expect(data.notes.join(' ').toLowerCase()).toContain('control');
    expect(data.notes.join(' ').toLowerCase()).toContain('not a result');
  });
});
