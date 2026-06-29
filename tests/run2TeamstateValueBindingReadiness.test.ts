import { describe, expect, it } from 'vitest';
import {
  RUN2_TEAMSTATE_VALUE_BINDING_READINESS_VERSION,
  assessRun2TeamstateValueBindingReadiness,
  buildRun2FeatureMatrixCandidate,
  fixtureGovernedTeamstateReadinessReport,
} from '../src/public/index.js';

// The base governed fixture has no recorded forecast cutoff -> not ready.
const baseFixture = fixtureGovernedTeamstateReadinessReport;
// A governed fixture with a valid 2024 input-season cutoff recorded on the artifact.
const readyFixture = {
  ...fixtureGovernedTeamstateReadinessReport,
  forecastCutoff: { inputSeason: 2024, asOf: '2025-02-15T00:00:00.000Z' },
};

describe('Run 2 Teamstate value-binding readiness gate', () => {
  it('grants readiness only when a governed artifact with a valid 2024 cutoff is supplied', () => {
    const result = assessRun2TeamstateValueBindingReadiness(readyFixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readiness_version).toBe(RUN2_TEAMSTATE_VALUE_BINDING_READINESS_VERSION);
    expect(result.data.readiness_status).toBe('ready_for_value_binding');
    expect(result.data.missing_requirements).toEqual([]);
    expect(result.data.binding_status).toBe('not_bound_readiness_only');
    expect(result.data.required_cutoff.recorded_cutoff_input_season).toBe(2024);
  });

  it('is not ready when no governed mounted artifact / cutoff is present (fixture has no cutoff)', () => {
    const result = assessRun2TeamstateValueBindingReadiness(baseFixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readiness_status).toBe('not_ready_for_value_binding');
    expect(result.data.missing_requirements).toContain('forecast_cutoff_recorded');
    expect(result.data.required_cutoff.recorded_cutoff_input_season).toBeNull();
  });

  it('fails closed when governance is missing / ungoverned', () => {
    const { governance: _governance, ...ungoverned } = readyFixture;
    const result = assessRun2TeamstateValueBindingReadiness(ungoverned);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readiness_status).toBe('not_ready_for_value_binding');
    expect(result.data.missing_requirements).toContain('governed_teamstate_artifact_present');
    expect(result.data.blocking_reasons.join(' ')).toContain('GOVERNANCE');
    expect(result.data.candidate).toBeNull();
  });

  it('fails closed when governance is not explicit-marker based', () => {
    const result = assessRun2TeamstateValueBindingReadiness({
      ...readyFixture,
      governance: { governanceStatus: 'governed', governanceSource: 'implicit' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readiness_status).toBe('not_ready_for_value_binding');
  });

  it('fails closed when fabricated numeric pressure is present', () => {
    const result = assessRun2TeamstateValueBindingReadiness({ ...readyFixture, pressureRateAllowed: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readiness_status).toBe('not_ready_for_value_binding');
    expect(result.data.blocking_reasons.join(' ')).toContain('PRESSURE');
  });

  it('fails closed when the forecast cutoff is missing', () => {
    const { forecastCutoff: _cutoff, ...noCutoff } = readyFixture;
    const result = assessRun2TeamstateValueBindingReadiness(noCutoff);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readiness_status).toBe('not_ready_for_value_binding');
    expect(result.data.missing_requirements).toEqual(
      expect.arrayContaining(['forecast_cutoff_recorded', 'forecast_cutoff_matches_input_season']),
    );
  });

  it('fails closed when the forecast cutoff is target-season / future-looking', () => {
    const result = assessRun2TeamstateValueBindingReadiness({
      ...readyFixture,
      forecastCutoff: { inputSeason: 2025 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.readiness_status).toBe('not_ready_for_value_binding');
    expect(result.data.missing_requirements).toEqual(
      expect.arrayContaining(['forecast_cutoff_matches_input_season', 'no_target_or_future_season_cutoff']),
    );
    expect(result.data.blocking_reasons.join(' ')).toContain('leak');
  });

  it('records required join keys and row-grain alignment', () => {
    const result = assessRun2TeamstateValueBindingReadiness(readyFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.required_join_keys.length).toBeGreaterThan(0);
    expect(result.data.required_join_keys).toEqual(expect.arrayContaining(['input_season']));
    expect(result.data.row_grain_alignment).toMatchObject({
      teamstate_grain: 'team_week',
      run1_grain: 'player_season (SeasonalPlayerObservation)',
      joinable: true,
    });
    expect(result.data.input_season).toBe(2024);
    expect(result.data.target_season).toBe(2025);
  });

  it('preserves the allowed / preflight column set from the candidate chain', () => {
    const readiness = assessRun2TeamstateValueBindingReadiness(readyFixture);
    const candidate = buildRun2FeatureMatrixCandidate(readyFixture);
    expect(readiness.ok && candidate.ok).toBe(true);
    if (!readiness.ok || !candidate.ok) return;

    expect(readiness.data.allowed_columns).toEqual(candidate.data.teamstate_feature_columns);
    expect(readiness.data.partial_null_columns).toEqual(candidate.data.partial_null_columns);
    expect(readiness.data.excluded_columns.map((column) => column.field)).toEqual(
      candidate.data.excluded_columns.map((column) => column.field),
    );
  });

  it('keeps partial-null columns null-aware and binds no values', () => {
    const result = assessRun2TeamstateValueBindingReadiness(readyFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.partial_null_columns).toEqual(['redZoneTdRate']);
    expect(result.data.binding_status).toBe('not_bound_readiness_only');
    // No values are bound: the linked candidate rows still carry null Teamstate values.
    for (const row of result.data.candidate?.candidate_rows ?? []) {
      for (const value of Object.values(row.teamstate_partial_null_values)) expect(value).toBeNull();
      for (const value of Object.values(row.teamstate_feature_values)) expect(value).toBeNull();
    }
  });

  it('keeps pressure excluded and unavailable/insufficient/deferred', () => {
    const result = assessRun2TeamstateValueBindingReadiness(readyFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.pressure_status).toBe('unavailable_insufficient_data_deferred_excluded');
    expect(result.data.allowed_columns).not.toContain('pressureRateAllowed');
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(
      expect.arrayContaining(['pressureRateAllowed']),
    );
  });

  it('excludes fantasy split fields from the allowed binding set', () => {
    const result = assessRun2TeamstateValueBindingReadiness({
      ...readyFixture,
      fieldReadiness: [
        ...readyFixture.fieldReadiness,
        { field: 'fantasyPprSplit', finiteCount: 0, nullCount: 544, status: 'available' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.allowed_columns).not.toContain('fantasyPprSplit');
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(expect.arrayContaining(['fantasyPprSplit']));
  });

  it('blocks target / future / leakage-named fields from the allowed binding set', () => {
    const result = assessRun2TeamstateValueBindingReadiness({
      ...readyFixture,
      fieldReadiness: [
        ...readyFixture.fieldReadiness,
        { field: 'nextSeasonTargetShare', finiteCount: 544, nullCount: 0, status: 'available' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.allowed_columns).not.toContain('nextSeasonTargetShare');
    expect(result.data.excluded_columns.map((column) => column.field)).toEqual(
      expect.arrayContaining(['nextSeasonTargetShare']),
    );
  });

  it('records not trained / not evaluated / not executed and produces no model outputs or comparison', () => {
    const result = assessRun2TeamstateValueBindingReadiness(readyFixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.execution_status).toBe('not_trained');
    expect(result.data.evaluation_status).toBe('not_evaluated');
    expect(result.data.run_2_executed).toBe(false);
    for (const key of ['predictions', 'metrics', 'model_refs', 'evaluation', 'run_comparison', 'comparison', 'bound_values']) {
      expect(result.data).not.toHaveProperty(key);
    }
  });

  it('returns a service failure only for non-object input', () => {
    const result = assessRun2TeamstateValueBindingReadiness(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'RUN2_VALUE_BINDING_READINESS_INPUT_INVALID' })]),
    );
  });
});
