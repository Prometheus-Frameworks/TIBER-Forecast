import { describe, expect, it } from 'vitest';
import {
  RUN2_GOVERNED_VALUE_BINDING_VERSION,
  RUN2_TEAMSTATE_AGGREGATION_METHOD,
  bindRun2GovernedTeamstateValues,
  buildRun2FeatureMatrixCandidate,
  fixtureGovernedTeamstateBindingArtifact,
  tiberDataSeasonalPprDataset,
} from '../src/public/index.js';

const readyArtifact = fixtureGovernedTeamstateBindingArtifact;

const bindReady = () => {
  const result = bindRun2GovernedTeamstateValues(readyArtifact);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok');
  return result.data;
};

describe('Run 2 governed Teamstate value binding', () => {
  it('refuses to bind when readiness is not ready_for_value_binding', () => {
    const { forecastCutoff: _cutoff, ...noCutoff } = readyArtifact;
    const result = bindRun2GovernedTeamstateValues(noCutoff);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.binding_status).toBe('not_bound_readiness_not_met');
    expect(result.data.readiness.readiness_status).toBe('not_ready_for_value_binding');
    expect(result.data.row_count).toBe(0);
    expect(result.data.bound_rows).toEqual([]);
    expect(result.data.binding_coverage.bound_row_count).toBe(0);
  });

  it('refuses to bind ungoverned / non-explicit-marker input (only the gate-accepted shape binds)', () => {
    const ungoverned = { ...readyArtifact, governance: { governanceStatus: 'governed', governanceSource: 'implicit' } };
    const result = bindRun2GovernedTeamstateValues(ungoverned);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.binding_status).toBe('not_bound_readiness_not_met');
    expect(result.data.binding_coverage.bound_row_count).toBe(0);
  });

  it('binds governed values when ready, and is grounded in the readiness gate', () => {
    const data = bindReady();
    expect(data.binding_version).toBe(RUN2_GOVERNED_VALUE_BINDING_VERSION);
    expect(data.binding_status).toBe('governed_teamstate_values_bound');
    expect(data.candidate_status).toBe('pre_train_bound_feature_matrix_candidate');
    expect(data.readiness.readiness_status).toBe('ready_for_value_binding');
    expect(data.readiness_ref.readiness_status).toBe('ready_for_value_binding');
    expect(data.aggregation_method).toBe(RUN2_TEAMSTATE_AGGREGATION_METHOD);
  });

  it('preserves explicit-marker governance and source/validation/lineage refs', () => {
    const data = bindReady();
    expect(data.teamstate_governance).toMatchObject({ status: 'governed', marker: 'explicit_marker' });
    expect(data.source_artifact_refs.length).toBeGreaterThan(0);
    expect(data.validation_refs.length).toBeGreaterThan(0);
    expect(data.lineage_refs.length).toBeGreaterThan(0);
  });

  it('preserves the recorded, timezone-explicit forecast cutoff metadata', () => {
    const data = bindReady();
    expect(data.recorded_cutoff.input_season).toBe(2024);
    expect(data.recorded_cutoff.as_of).toBe('2025-03-01T00:00:00.000Z');
    expect(data.recorded_cutoff.as_of).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
    expect(data.recorded_cutoff.target_season_start).toBe('2025-09-01T00:00:00.000Z');
    // The source build timestamp is preserved separately, never used as the cutoff.
    expect(data.recorded_cutoff.source_generated_at).toBe('2026-06-25T19:20:51+00:00');
    expect(data.cutoff_validation.recorded_cutoff_input_season).toBe(2024);
    expect(data.cutoff_validation.recorded_cutoff_as_of).toBe('2025-03-01T00:00:00.000Z');
  });

  it('preserves the recorded cutoff even when the artifact uses gate-accepted cutoff aliases', () => {
    // Nested alias: forecastCutoff.season instead of inputSeason (the readiness gate accepts it).
    const { forecastCutoff: _cutoff, ...rest } = readyArtifact;
    const nestedAlias = { ...rest, forecastCutoff: { season: 2024, asOf: '2025-03-01T00:00:00.000Z' } };
    const nested = bindRun2GovernedTeamstateValues(nestedAlias);
    expect(nested.ok).toBe(true);
    if (!nested.ok) return;
    expect(nested.data.binding_status).toBe('governed_teamstate_values_bound');
    expect(nested.data.recorded_cutoff.input_season).toBe(2024);
    expect(nested.data.recorded_cutoff.as_of).toBe('2025-03-01T00:00:00.000Z');

    // Top-level aliases: forecastCutoffInputSeason / forecastCutoffAsOf, no forecastCutoff object.
    const topLevelAlias = { ...rest, forecastCutoffInputSeason: 2024, forecastCutoffAsOf: '2025-02-01T00:00:00.000Z' };
    const topLevel = bindRun2GovernedTeamstateValues(topLevelAlias);
    expect(topLevel.ok).toBe(true);
    if (!topLevel.ok) return;
    expect(topLevel.data.binding_status).toBe('governed_teamstate_values_bound');
    expect(topLevel.data.recorded_cutoff.input_season).toBe(2024);
    expect(topLevel.data.recorded_cutoff.as_of).toBe('2025-02-01T00:00:00.000Z');
  });

  it('keeps one row per Run 1 SeasonalPlayerObservation', () => {
    const data = bindReady();
    expect(data.row_grain).toBe('player_season_forecast');
    expect(data.row_count).toBe(tiberDataSeasonalPprDataset.observations.length);
    const playerIds = data.bound_rows.map((row) => row.player_id);
    expect(new Set(playerIds).size).toBe(playerIds.length);
    expect(playerIds.sort()).toEqual(tiberDataSeasonalPprDataset.observations.map((o) => o.player_id).sort());
  });

  it('preserves Run 1 unstandardized feature values unchanged', () => {
    const data = bindReady();
    const candidate = buildRun2FeatureMatrixCandidate(readyArtifact);
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    const byId = new Map(candidate.data.candidate_rows.map((row) => [row.player_id, row.run1_feature_values]));
    for (const row of data.bound_rows) {
      expect(row.run1_feature_values).toEqual(byId.get(row.player_id));
    }
    expect(data.run1_feature_columns).toEqual(candidate.data.run1_feature_columns);
  });

  it('keeps ppr_2025_actual label-only and outside input feature groups', () => {
    const data = bindReady();
    for (const row of data.bound_rows) {
      expect(row.target.column).toBe('ppr_2025_actual');
      expect(row.target.role).toBe('label_only');
      expect(row.run1_feature_values).not.toHaveProperty('ppr_2025_actual');
      expect(row.teamstate_feature_values).not.toHaveProperty('ppr_2025_actual');
      expect(row.teamstate_partial_null_values).not.toHaveProperty('ppr_2025_actual');
    }
  });

  it('separates Run 1 / bound Teamstate / partial-null / identity / label groups per row', () => {
    const row = bindReady().bound_rows[0];
    expect(row).toBeDefined();
    if (!row) return;
    for (const key of ['player_id', 'position', 'team_2024', 'input_season', 'target_season']) {
      expect(row).toHaveProperty(key);
    }
    expect(row).toHaveProperty('run1_feature_values');
    expect(row).toHaveProperty('teamstate_feature_values');
    expect(row).toHaveProperty('teamstate_partial_null_values');
    expect(row).toHaveProperty('target');
    expect(row.input_season).toBe(2024);
    expect(row.target_season).toBe(2025);
  });

  it('binds Teamstate values by team_2024 + input season using explicit join keys', () => {
    const data = bindReady();
    expect(data.join_keys_used.join(' ')).toContain('team_2024');
    expect(data.join_keys_used.join(' ')).toContain('input_season');
    for (const row of data.bound_rows) {
      const matchedTeam = data.binding_coverage.matched_teams.includes(row.team_2024);
      expect(row.teamstate_binding_matched).toBe(matchedTeam);
    }
  });

  it('aggregates team-week values to player-season rows deterministically (mean of available)', () => {
    const data = bindReady();
    const balRows = data.bound_rows.filter((row) => row.team_2024 === 'BAL');
    expect(balRows.length).toBeGreaterThan(0);
    for (const row of balRows) {
      expect(row.teamstate_binding_matched).toBe(true);
      expect(row.teamstate_feature_values.epaPerPlay).toBeCloseTo(0.15, 10);
      expect(row.teamstate_feature_values.successRate).toBeCloseTo(0.45, 10);
      // redZoneTdRate: one finite (0.6) + one null -> mean of available = 0.6.
      expect(row.teamstate_partial_null_values.redZoneTdRate).toBeCloseTo(0.6, 10);
    }
    const balAggregate = data.binding_coverage.aggregates.find((aggregate) => aggregate.team === 'BAL');
    expect(balAggregate?.contributing_team_week_rows).toBe(2);
    expect(balAggregate?.contributing_value_counts.redZoneTdRate).toBe(1);
  });

  it('reports binding coverage and missing-join coverage, and never aggregates non-input-season rows', () => {
    const data = bindReady();
    expect(data.binding_coverage.candidate_row_count).toBe(data.row_count);
    expect(data.binding_coverage.bound_row_count).toBeGreaterThan(0);
    expect(data.binding_coverage.matched_teams).toEqual(expect.arrayContaining(['BAL', 'CIN', 'PHI']));
    // The Run 1 dataset has teams with no governed team-week values -> reported unmatched, values null.
    expect(data.binding_coverage.unmatched_teams.length).toBeGreaterThan(0);
    expect(data.binding_coverage.unbound_row_count).toBeGreaterThan(0);
    // The 2025 (target-season) team-week row is supplied but never used.
    expect(data.binding_coverage.team_week_rows_supplied).toBe(8);
    expect(data.binding_coverage.team_week_rows_used).toBe(7);
    expect(data.binding_coverage.ignored_non_input_season_rows).toBe(1);
    // The target-season value (0.99) must never appear on a bound BAL row.
    for (const row of data.bound_rows.filter((r) => r.team_2024 === 'BAL')) {
      expect(row.teamstate_feature_values.epaPerPlay).not.toBeCloseTo(0.99, 5);
    }
  });

  it('keeps partial-null values null-aware and never zero-filled', () => {
    const data = bindReady();
    // PHI has redZoneTdRate null on every team-week row -> bound value stays null (not 0).
    const phiRows = data.bound_rows.filter((row) => row.team_2024 === 'PHI');
    expect(phiRows.length).toBeGreaterThan(0);
    for (const row of phiRows) {
      expect(row.teamstate_binding_matched).toBe(true);
      expect(row.teamstate_partial_null_values.redZoneTdRate).toBeNull();
    }
    // Unmatched teams keep all Teamstate values null (never zero-filled).
    const unmatched = data.bound_rows.filter((row) => !row.teamstate_binding_matched);
    for (const row of unmatched) {
      for (const value of Object.values(row.teamstate_feature_values)) expect(value).toBeNull();
      for (const value of Object.values(row.teamstate_partial_null_values)) expect(value).toBeNull();
    }
  });

  it('ignores any caller-supplied team-week values side-channel (binds only the governed artifact)', () => {
    // Simulate a caller trying to inject arbitrary, ungoverned values through options. The binder must
    // never bind them: values come only from the governed artifact's own teamWeekValues.
    const arbitraryValues = [
      { teamCode: 'BAL', season: 2024, week: 1, epaPerPlay: 9.9, successRate: 9.9, redZoneTdRate: 9.9, pressureRateAllowed: null },
    ];
    const sideChannelOptions = { teamstate_team_week_values: arbitraryValues } as unknown as Parameters<
      typeof bindRun2GovernedTeamstateValues
    >[1];

    // (a) A ready governed artifact with NO teamWeekValues + arbitrary option values -> nothing binds.
    const { teamWeekValues: _values, ...noValues } = readyArtifact;
    const injected = bindRun2GovernedTeamstateValues(noValues, sideChannelOptions);
    expect(injected.ok).toBe(true);
    if (!injected.ok) return;
    expect(injected.data.binding_status).toBe('not_bound_no_team_week_values');
    expect(injected.data.binding_coverage.team_week_rows_used).toBe(0);

    // (b) A ready governed artifact WITH its own values + arbitrary option values -> only the
    // artifact's values are bound (the 9.9 side-channel never reaches BAL).
    const both = bindRun2GovernedTeamstateValues(readyArtifact, sideChannelOptions);
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    const balRow = both.data.bound_rows.find((row) => row.team_2024 === 'BAL');
    expect(balRow?.teamstate_feature_values.epaPerPlay).toBeCloseTo(0.15, 10);
    expect(balRow?.teamstate_feature_values.epaPerPlay).not.toBeCloseTo(9.9, 5);
  });

  it('emits a not-bound report when no input-season team-week values are supplied', () => {
    const { teamWeekValues: _values, ...noValues } = readyArtifact;
    const result = bindRun2GovernedTeamstateValues(noValues);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.binding_status).toBe('not_bound_no_team_week_values');
    expect(result.data.binding_coverage.team_week_rows_used).toBe(0);
  });

  it('keeps pressure excluded and unavailable/insufficient/deferred, binding no pressure value', () => {
    const data = bindReady();
    expect(data.pressure_status).toBe('unavailable_insufficient_data_deferred_excluded');
    expect(data.teamstate_feature_columns).not.toContain('pressureRateAllowed');
    expect(data.partial_null_columns).not.toContain('pressureRateAllowed');
    expect(data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['pressureRateAllowed']));
    for (const row of data.bound_rows) {
      expect(row.teamstate_feature_values).not.toHaveProperty('pressureRateAllowed');
      expect(row.teamstate_partial_null_values).not.toHaveProperty('pressureRateAllowed');
    }
  });

  it('never binds fantasy-split or target/future/leakage columns', () => {
    const data = bindReady();
    expect(data.target_leakage_status).toBe('no_target_derived_fields_included');
    const boundColumns = [...data.teamstate_feature_columns, ...data.partial_null_columns];
    for (const column of boundColumns) {
      const lower = column.toLowerCase();
      for (const signal of ['fantasy', 'target', 'label', 'future', 'nextseason', 'outcome']) {
        expect(lower).not.toContain(signal);
      }
    }
  });

  it('records not-trained / not-evaluated / not-executed and emits no model outputs or comparison', () => {
    const data = bindReady();
    expect(data.execution_status).toBe('not_trained');
    expect(data.evaluation_status).toBe('not_evaluated');
    expect(data.run_2_executed).toBe(false);
    for (const key of [
      'predictions',
      'metrics',
      'model_refs',
      'model_ref',
      'evaluation',
      'evaluation_refs',
      'run_comparison',
      'comparison',
      'shuffled',
      'shuffle',
      'sanity_arm',
      'bound_values',
    ]) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it('returns a service failure only for non-object input', () => {
    const result = bindRun2GovernedTeamstateValues(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'RUN2_VALUE_BINDING_INPUT_INVALID' })]),
    );
  });
});
