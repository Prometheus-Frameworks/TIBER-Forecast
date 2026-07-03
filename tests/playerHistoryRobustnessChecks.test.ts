import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ABLATION_VARIANTS,
  CONTROLLED_RUN_HISTORY_COLUMNS,
  CONTROLLED_RUN_RESULT_MARKING,
  CONTROLLED_RUN_SHUFFLE_SEED,
  ROBUSTNESS_DECISIONS,
  ROBUSTNESS_LAMBDAS,
  ROBUSTNESS_SHUFFLE_SEEDS,
  ablationColumnsFor,
  buildControlledRunRows,
  runControlledLoocv,
  runPlayerHistoryRobustnessChecks,
  runPriorYearPositionBaselineLoocv,
  type ControlledRunPriorGateEvidence,
  type PlayerHistoryInputRow,
  type PlayerHistoryOutcomeMirror,
  type PlayerHistoryRunPopulationInputMirror,
} from '../src/public/index.js';

// ---- synthetic fixtures (floor-satisfying, mirrors the #112 test helpers) -----------------------------

const usage = () => ({
  targets: 50,
  receptions: 40,
  rushing_attempts: 10,
  receiving_air_yards: 400,
  target_share: 0.2,
  air_yards_share: 0.2,
  wopr: 0.4,
  racr: 1.1,
  snap_share: null,
  routes_run: null,
  route_participation: null,
  red_zone_targets: null,
  red_zone_carries: null,
});

const historyRow = (overrides: Partial<PlayerHistoryInputRow> & { player_id: string; season: number }): PlayerHistoryInputRow => ({
  player_name: `Player ${overrides.player_id}`,
  position: 'WR',
  season_type: 'REG',
  identity_confidence: 'source_verified',
  source_refs: [{ source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T00:00:00Z' }],
  teams: ['PHI'],
  primary_team: 'PHI',
  primary_team_rule: null,
  weeks_observed: 15,
  coverage_status: 'partial_season',
  missing_fields: ['games_missed'],
  production_summary: { season_ppr: 150, season_ppg: 10, games_for_ppg: 15 },
  usage_summary: usage(),
  birth_date: '1998-01-01',
  season_age: 26.5,
  draft_year: 2020,
  rookie_year: 2020,
  career_year: 4,
  ...overrides,
});

const outcomeMirrorOf = (players: Array<{ player_id: string; position: string; season_ppr: number }>): PlayerHistoryOutcomeMirror =>
  ({
    kind: 'player_history_run_population_outcome_mirror',
    version: 'player-history-run-population-mirrors-v1',
    issue: 'TIBER-Forecast#109',
    governed_source: {
      repo: 'Prometheus-Frameworks/TIBER-Data',
      sourceArtifactPath: 'data/processed/evidence/player_season_coverage_2022_2025.source_backed.json',
      sha256: '39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b',
      artifactStatus: 'candidate_evidence_artifact_not_promoted',
    },
    boundary: {
      outcome_layer_only: true,
      rows_carry_no_input_features: true,
      source_artifact_not_promoted: true,
      building_this_mirror_promotes_nothing: true,
      no_forecast_run_authorized_by_this_mirror: true,
    },
    target_season: 2025,
    season_type: 'REG',
    counts: { rows: players.length, players: players.length, by_position: {} },
    rows: players.map((player) => ({
      player_id: player.player_id,
      player_name: `Player ${player.player_id}`,
      position: player.position,
      season: 2025,
      season_type: 'REG',
      season_ppr: player.season_ppr,
      source_refs: [{ source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: null }],
      identity_confidence: 'source_verified',
    })),
  }) as PlayerHistoryOutcomeMirror;

const inputMirrorOf = (rows: PlayerHistoryInputRow[]): PlayerHistoryRunPopulationInputMirror =>
  ({
    kind: 'player_history_run_population_input_mirror',
    version: 'player-history-run-population-mirrors-v1',
    issue: 'TIBER-Forecast#109',
    governed_source: {
      repo: 'Prometheus-Frameworks/TIBER-Data',
      sourceArtifactPath: 'data/processed/evidence/player_season_coverage_2022_2025.source_backed.json',
      sha256: '39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b',
      artifactStatus: 'candidate_evidence_artifact_not_promoted',
    },
    input_window: { seasons: [2022, 2023, 2024], season_type: 'REG', target_season_excluded: 2025 },
    boundary: {
      contains_no_target_season_rows: true,
      contains_no_2025_outcome_values: true,
      source_artifact_not_promoted: true,
      nulls_preserved_never_zero_coerced: true,
      no_forecast_run_authorized_by_this_mirror: true,
    },
    counts: { rows: rows.length, players_with_history: 0, outcome_players_without_history: 0, by_season: {}, by_position: {} },
    no_history_players: [],
    rows,
  }) as PlayerHistoryRunPopulationInputMirror;

const floorSatisfyingExperiment = () => {
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const players: Array<{ player_id: string; position: string; season_ppr: number }> = [];
  const inputRows: PlayerHistoryInputRow[] = [];
  for (const position of positions) {
    for (let i = 0; i < 60; i += 1) {
      const id = `${position.toLowerCase()}${i}`;
      const basePpr = 80 + (i % 8) * 40;
      players.push({ player_id: id, position, season_ppr: basePpr + 10 + (i % 5) * 3 });
      for (const season of [2022, 2023, 2024]) {
        inputRows.push(
          historyRow({ player_id: id, season, position, production_summary: { season_ppr: basePpr, season_ppg: basePpr / 15, games_for_ppg: 15 } }),
        );
      }
    }
  }
  for (let i = 0; i < 10; i += 1) players.push({ player_id: `rookie${i}`, position: positions[i % 4]!, season_ppr: 90 + i });
  const gates: ControlledRunPriorGateEvidence = {
    source_gate_reverification_decision: 'may_continue_mirror_build',
    target_population_gate_decision: 'may_continue_to_overlap_gate',
    mirror_overlap_gate_decision: 'may_authorize_run_issue',
    dry_run_matrix_status: 'dry_run_only_not_model_ready',
    dry_run_joined_rows: 240,
    dry_run_scored_target_rows: 250,
    dry_run_joined_rows_by_position: { QB: 60, RB: 60, WR: 60, TE: 60 },
  };
  return { outcomeMirror: outcomeMirrorOf(players), inputMirror: inputMirrorOf(inputRows), gates };
};

// ---- tests -------------------------------------------------------------------------------------------

describe('preflight reuse (fail-closed)', () => {
  it('refuses to run when a prior gate is not passing (reusing the #112 preflight verbatim)', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    expect(() =>
      runPlayerHistoryRobustnessChecks(outcomeMirror, inputMirror, { ...gates, mirror_overlap_gate_decision: 'needs_overlap_fix' }),
    ).toThrow(/mirror-overlap gate/);
    expect(() =>
      runPlayerHistoryRobustnessChecks(outcomeMirror, inputMirror, { ...gates, source_gate_reverification_decision: 'blocked' }),
    ).toThrow(/source-gate re-verification/);
  });
});

describe('P1 ablation column selection', () => {
  it('each family variant includes only columns of the named families', () => {
    for (const variant of ABLATION_VARIANTS) {
      if (variant.families === null) continue;
      const columns = ablationColumnsFor(variant);
      expect(columns.length).toBeGreaterThan(0);
      for (const column of columns) expect(variant.families).toContain(column.family);
      const excluded = CONTROLLED_RUN_HISTORY_COLUMNS.filter((column) => !variant.families!.includes(column.family));
      for (const column of excluded) expect(columns.map((c) => c.name)).not.toContain(column.name);
    }
  });

  it('ppr_2024_alone uses exactly the ppr_2024 history column', () => {
    const variant = ABLATION_VARIANTS.find((entry) => entry.name === 'ppr_2024_alone')!;
    const columns = ablationColumnsFor(variant);
    expect(columns.map((column) => column.name)).toEqual(['ppr_2024']);
  });

  it('an ablated LOOCV run differs from the full run only through the column subset (same folds/inputs)', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const rows = buildControlledRunRows(outcomeMirror, inputMirror.rows, CONTROLLED_RUN_SHUFFLE_SEED);
    const full = runControlledLoocv(rows, 1);
    const ablated = runControlledLoocv(rows, 1, ablationColumnsFor({ families: ['production'] }));
    // Baseline arm is identical (consumes no payload); real arm differs because columns differ.
    expect(full.map((p) => p.predictions.baseline_only)).toEqual(ablated.map((p) => p.predictions.baseline_only));
    expect(full.map((p) => p.player_id)).toEqual(ablated.map((p) => p.player_id));
  });
});

describe('P2 prior-year position baseline', () => {
  it('consumes prior-year PPR only: identical predictions when every other feature value changes', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const rows = buildControlledRunRows(outcomeMirror, inputMirror.rows, CONTROLLED_RUN_SHUFFLE_SEED);
    const before = runPriorYearPositionBaselineLoocv(rows);
    const mutated = rows.map((row) => ({
      ...row,
      real_history_values: Object.fromEntries(
        Object.entries(row.real_history_values).map(([key, value]) => [key, key === 'ppr_2024' ? value : value === null ? null : value + 999]),
      ),
    }));
    const after = runPriorYearPositionBaselineLoocv(mutated);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('falls back to the train-fold position mean for no-history rows', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const rows = buildControlledRunRows(outcomeMirror, inputMirror.rows, CONTROLLED_RUN_SHUFFLE_SEED);
    const predictions = runPriorYearPositionBaselineLoocv(rows);
    const rookie = predictions.find((prediction) => prediction.player_id === 'rookie0')!;
    const trainSamePosition = rows.filter((row) => row.player_id !== 'rookie0' && row.position === rookie.position);
    const positionMean = trainSamePosition.reduce((sum, row) => sum + row.outcome, 0) / trainSamePosition.length;
    expect(rookie.predicted).toBeCloseTo(positionMean, 9);
  });
});

describe('P3/P4 configuration', () => {
  it('lambda grid and seed set match the issue exactly, with the original #112 seed included', () => {
    expect([...ROBUSTNESS_LAMBDAS]).toEqual([0.1, 1, 10, 100]);
    expect(ROBUSTNESS_SHUFFLE_SEEDS.length).toBe(5);
    expect(ROBUSTNESS_SHUFFLE_SEEDS).toContain(CONTROLLED_RUN_SHUFFLE_SEED);
    expect(new Set(ROBUSTNESS_SHUFFLE_SEEDS).size).toBe(5);
  });
});

describe('full synthetic robustness run', () => {
  const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
  const report = runPlayerHistoryRobustnessChecks(outcomeMirror, inputMirror, gates);

  it('is marked experimental and states the #112-primary + non-goal boundary statements', () => {
    expect(report.marking).toBe(CONTROLLED_RUN_RESULT_MARKING);
    expect(report.primary_run_note).toContain('#112 remains the primary');
    expect(report.boundary_statements.primary_112_run_unmodified).toBe(true);
    expect(report.boundary_statements.no_production_forecast_behavior_changed).toBe(true);
    expect(report.boundary_statements.no_source_artifact_promoted).toBe(true);
  });

  it('reports all five checks with the required shapes', () => {
    expect(report.p1_feature_family_ablation.map((entry) => entry.variant)).toEqual(
      ['full_feature_set', 'production_only', 'usage_only', 'coverage_only', 'age_career_team_context_only', 'ppr_2024_alone'],
    );
    expect(report.p3_lambda_sensitivity.map((entry) => entry.lambda)).toEqual([0.1, 1, 10, 100]);
    expect(report.p4_shuffled_seeds.length).toBe(5);
    expect(report.p5_leverage_sensitivity.primary_metrics_untouched).toBe(true);
    expect(report.p5_leverage_sensitivity.partial_season_sensitivity.computed).toBe(false);
    expect(report.p5_leverage_sensitivity.partial_season_sensitivity.minimal_source_change_recommendation).toContain('coverage_status');
  });

  it('every shuffled seed is deterministic, position-stratified, and derangement-clean', () => {
    for (const entry of report.p4_shuffled_seeds) {
      expect(entry.self_donations).toBe(0);
      expect(entry.cross_position_donations).toBe(0);
      expect(entry.donors_assigned).toBe(240);
    }
    const again = runPlayerHistoryRobustnessChecks(outcomeMirror, inputMirror, gates);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });

  it('outlier trim reports separate metrics without touching the reference metrics', () => {
    expect(report.p5_leverage_sensitivity.trimmed_joined.real_player_history_features.n).toBe(240 - report.p5_leverage_sensitivity.top_k_excluded);
    expect(report.reference_joined_mae.full_real).not.toBeNull();
  });

  it('the decision enum is review-only and the report emits no product/advice keys', () => {
    expect([...ROBUSTNESS_DECISIONS]).toEqual([
      'candidate_signal_survives_initial_robustness_checks',
      'candidate_signal_weakened_requires_more_review',
      'candidate_signal_not_robust',
      'robustness_review_invalid_must_not_use',
    ]);
    for (const decision of ROBUSTNESS_DECISIONS) expect(decision).not.toMatch(/production|bind|promote|may_run|advice|ranking/);
    expect(ROBUSTNESS_DECISIONS).toContain(report.decision.decision);
    const keys: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          keys.push(key.toLowerCase());
          collect(nested);
        }
      }
    };
    collect(report);
    const positiveKeys = keys.filter((key) => !key.startsWith('no_'));
    for (const forbidden of ['advice', 'ranking', 'startsit', 'start_sit', 'trade', 'draft_advice', 'product_recommendation']) {
      expect(positiveKeys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });
});

describe('production isolation', () => {
  it('the robustness module never imports production model/route/service code', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/rehearsal/playerHistoryRobustnessChecks.ts'), 'utf-8');
    const importLines = source.split('\n').filter((line) => line.trimStart().startsWith('import ') || line.includes(" from '"));
    for (const line of importLines) {
      for (const forbidden of ['seasonalPprModel', '/services/', '/server', 'models/seasonal', 'contracts/scoring']) {
        expect(line).not.toContain(forbidden);
      }
    }
  });
});
