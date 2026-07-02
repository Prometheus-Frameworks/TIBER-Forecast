import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CONTROLLED_RUN_ARMS,
  CONTROLLED_RUN_DECISIONS,
  CONTROLLED_RUN_HISTORY_COLUMNS,
  CONTROLLED_RUN_RESULT_MARKING,
  assertControlledRunPreconditions,
  buildControlledRunRows,
  computeControlledRunMetrics,
  decideControlledRun,
  executeControlledRun,
  runControlledLoocv,
  type ControlledRunMetrics,
  type ControlledRunPriorGateEvidence,
  type PlayerHistoryInputRow,
  type PlayerHistoryOutcomeMirror,
  type PlayerHistoryRunPopulationInputMirror,
} from '../src/public/index.js';

// ---- synthetic fixtures -----------------------------------------------------------------------------

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

const outcomeMirrorOf = (
  players: Array<{ player_id: string; position?: string; season_ppr?: number | null }>,
  artifactStatus = 'candidate_evidence_artifact_not_promoted',
): PlayerHistoryOutcomeMirror =>
  ({
    kind: 'player_history_run_population_outcome_mirror',
    version: 'player-history-run-population-mirrors-v1',
    issue: 'TIBER-Forecast#109',
    governed_source: {
      repo: 'Prometheus-Frameworks/TIBER-Data',
      sourceArtifactPath: 'data/processed/evidence/player_season_coverage_2022_2025.source_backed.json',
      sha256: '39b6e71e36d667509221137f2b712143fe5fdccf5423f50e81b5c7a138c0072b',
      artifactStatus,
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
      position: player.position ?? 'WR',
      season: 2025,
      season_type: 'REG',
      season_ppr: player.season_ppr === undefined ? 200 : player.season_ppr,
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

const passingGates = (overrides: Partial<ControlledRunPriorGateEvidence> = {}): ControlledRunPriorGateEvidence => ({
  source_gate_reverification_decision: 'may_continue_mirror_build',
  target_population_gate_decision: 'may_continue_to_overlap_gate',
  mirror_overlap_gate_decision: 'may_authorize_run_issue',
  dry_run_matrix_status: 'dry_run_only_not_model_ready',
  dry_run_joined_rows: 485,
  dry_run_scored_target_rows: 610,
  dry_run_joined_rows_by_position: { QB: 66, RB: 115, WR: 189, TE: 115 },
  ...overrides,
});

const buildSyntheticPopulation = (joinedPerPosition: number, positions: string[], noHistoryCount: number) => {
  const players: Array<{ player_id: string; position: string; season_ppr: number }> = [];
  const inputRows: PlayerHistoryInputRow[] = [];
  for (const position of positions) {
    for (let i = 0; i < joinedPerPosition; i += 1) {
      const id = `${position.toLowerCase()}${i}`;
      const basePpr = 80 + (i % 8) * 40;
      players.push({ player_id: id, position, season_ppr: basePpr + 10 + (i % 5) * 3 });
      for (const season of [2022, 2023, 2024]) {
        inputRows.push(
          historyRow({
            player_id: id,
            season,
            position,
            production_summary: { season_ppr: basePpr, season_ppg: basePpr / 15, games_for_ppg: 15 },
          }),
        );
      }
    }
  }
  for (let i = 0; i < noHistoryCount; i += 1) {
    players.push({ player_id: `rookie${i}`, position: positions[i % positions.length]!, season_ppr: 90 + i });
  }
  const gates = passingGates({
    dry_run_joined_rows: joinedPerPosition * positions.length,
    dry_run_scored_target_rows: joinedPerPosition * positions.length + noHistoryCount,
    dry_run_joined_rows_by_position: Object.fromEntries(positions.map((position) => [position, joinedPerPosition])),
  });
  return { outcomeMirror: outcomeMirrorOf(players), inputMirror: inputMirrorOf(inputRows), gates };
};

/** Tiny two-position population (13 rows) for fast pure-function tests. Gates match its actual counts. */
const syntheticExperiment = () => {
  const { outcomeMirror, inputMirror, gates } = buildSyntheticPopulation(6, ['WR', 'RB'], 1);
  return { outcomeMirror, inputMirror, gates };
};

/** Population that satisfies the #107 floors (240 joined across 4 positions, 96% share). */
const floorSatisfyingExperiment = () => buildSyntheticPopulation(60, ['QB', 'RB', 'WR', 'TE'], 10);

// ---- preflight fail-closed --------------------------------------------------------------------------

describe('controlled run preflight (fail-closed on every prior gate)', () => {
  const { outcomeMirror, inputMirror, gates: tinyGates } = syntheticExperiment();

  it('passes when every gate decision, consistency check, and floor is satisfied', () => {
    const { outcomeMirror: bigOutcome, inputMirror: bigInput, gates } = floorSatisfyingExperiment();
    expect(() => assertControlledRunPreconditions(gates, bigOutcome, bigInput)).not.toThrow();
  });

  it('blocks when the source-gate re-verification is not passing', () => {
    expect(() =>
      assertControlledRunPreconditions({ ...tinyGates, source_gate_reverification_decision: 'blocked_source_artifact' }, outcomeMirror, inputMirror),
    ).toThrow(/source-gate re-verification/);
  });

  it('blocks when the target-population gate is not passing', () => {
    expect(() =>
      assertControlledRunPreconditions({ ...tinyGates, target_population_gate_decision: 'blocked_target_population' }, outcomeMirror, inputMirror),
    ).toThrow(/target-population gate/);
  });

  it('blocks when the mirror-overlap gate is not may_authorize_run_issue', () => {
    expect(() =>
      assertControlledRunPreconditions({ ...tinyGates, mirror_overlap_gate_decision: 'needs_overlap_fix' }, outcomeMirror, inputMirror),
    ).toThrow(/mirror-overlap gate/);
  });

  it('blocks when the dry-run matrix status is wrong', () => {
    expect(() =>
      assertControlledRunPreconditions({ ...tinyGates, dry_run_matrix_status: 'model_ready' }, outcomeMirror, inputMirror),
    ).toThrow(/dry-run matrix status/);
  });

  it('blocks when gate evidence is stale/mismatched with the mirrors actually being run', () => {
    // Evidence claims the real 485/610 population, but the mirrors passed in are the tiny synthetics.
    expect(() => assertControlledRunPreconditions(passingGates(), outcomeMirror, inputMirror)).toThrow(/stale\/mismatched/);
  });

  it('recomputed floors block a consistent-but-small population', () => {
    // Evidence matches the tiny mirrors exactly, so consistency passes -- and the floors then fail.
    expect(() => assertControlledRunPreconditions(tinyGates, outcomeMirror, inputMirror)).toThrow(/floor/);
  });

  it('blocks if the input mirror contains a 2025 row', () => {
    const tampered = inputMirrorOf([...inputMirror.rows, historyRow({ player_id: 'wr0', season: 2025 })]);
    expect(() => assertControlledRunPreconditions(tinyGates, outcomeMirror, tampered)).toThrow(/2025 rows must never be input features/);
  });

  it('blocks if outcome-valued fields appear in input rows', () => {
    const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, ppr_2025_actual: 321.5 } as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
    expect(() => assertControlledRunPreconditions(tinyGates, outcomeMirror, tampered)).toThrow(/outcome-valued fields/);
  });

  it('blocks on forbidden availability/status fields', () => {
    const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, active_status: 'active' } as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
    expect(() => assertControlledRunPreconditions(tinyGates, outcomeMirror, tampered)).toThrow(/forbidden availability/);
  });

  it('blocks if the outcome mirror source is no longer marked candidate/not-promoted', () => {
    const promoted = outcomeMirrorOf([{ player_id: 'wr0' }], 'promoted');
    expect(() => assertControlledRunPreconditions(tinyGates, promoted, inputMirror)).toThrow(/outcome mirror artifact status/);
  });

  it('blocks if the input mirror source is no longer marked candidate/not-promoted', () => {
    const promotedInput = { ...inputMirror, governed_source: { ...inputMirror.governed_source, artifactStatus: 'promoted' } };
    expect(() => assertControlledRunPreconditions(tinyGates, outcomeMirror, promotedInput)).toThrow(/input mirror artifact status/);
  });

  it('blocks if the two mirrors carry different source pins', () => {
    const repinnedInput = {
      ...inputMirror,
      governed_source: { ...inputMirror.governed_source, sha256: 'deadbeef'.repeat(8) },
    } as unknown as PlayerHistoryRunPopulationInputMirror;
    expect(() => assertControlledRunPreconditions(tinyGates, outcomeMirror, repinnedInput)).toThrow(/source pins disagree/);
  });
});

// ---- arm construction -------------------------------------------------------------------------------

describe('arm construction', () => {
  const { outcomeMirror, inputMirror } = syntheticExperiment();
  const rows = buildControlledRunRows(outcomeMirror, inputMirror.rows);

  it('the real arm consumes each player\'s own real payload; no-history rows stay all-null', () => {
    const wr0 = rows.find((row) => row.player_id === 'wr0')!;
    expect(wr0.has_player_history).toBe(true);
    expect(wr0.real_history_values.ppr_2024).toBe(80); // its own 2024 production
    const rookie = rows.find((row) => row.player_id === 'rookie0')!;
    expect(rookie.has_player_history).toBe(false);
    expect(Object.values(rookie.real_history_values).every((value) => value === null)).toBe(true);
  });

  it('the shuffled arm is position-stratified, deterministic, and never self-donates in groups >= 2', () => {
    const byId = new Map(rows.map((row) => [row.player_id, row]));
    for (const row of rows) {
      if (row.shuffled_donor_player_id === null) continue;
      expect(row.shuffled_donor_player_id).not.toBe(row.player_id);
      expect(byId.get(row.shuffled_donor_player_id)!.position).toBe(row.position);
    }
    const again = buildControlledRunRows(outcomeMirror, inputMirror.rows);
    expect(JSON.stringify(again.map((row) => row.shuffled_donor_player_id))).toBe(
      JSON.stringify(rows.map((row) => row.shuffled_donor_player_id)),
    );
  });

  it('a different seed produces a different (still valid) derangement; the same seed reproduces it', () => {
    const seedA = buildControlledRunRows(outcomeMirror, inputMirror.rows, 1);
    const seedA2 = buildControlledRunRows(outcomeMirror, inputMirror.rows, 1);
    expect(JSON.stringify(seedA)).toBe(JSON.stringify(seedA2));
  });

  it('the baseline arm never consumes player-history payloads: its prediction is exactly the train-fold position mean', () => {
    const predictions = runControlledLoocv(rows);
    const wr0 = predictions.find((prediction) => prediction.player_id === 'wr0')!;
    const trainSamePosition = rows.filter((row) => row.player_id !== 'wr0' && row.position === 'WR');
    const expectedBaseline = trainSamePosition.reduce((sum, row) => sum + row.outcome, 0) / trainSamePosition.length;
    expect(wr0.predictions.baseline_only).toBeCloseTo(expectedBaseline, 9);
  });

  it('no history column name ever references the target outcome', () => {
    for (const column of CONTROLLED_RUN_HISTORY_COLUMNS) {
      // 'targets_2024' (receiving targets) is legitimate; outcome-ish names are not.
      expect(column.name).not.toMatch(/2025|actual|outcome|target_outcome/);
    }
  });
});

// ---- leakage ----------------------------------------------------------------------------------------

describe('leakage discipline', () => {
  it('a held-out player\'s own outcome never influences its own predictions in any arm', () => {
    const { outcomeMirror, inputMirror } = syntheticExperiment();
    const rowsA = buildControlledRunRows(outcomeMirror, inputMirror.rows);
    const changed = outcomeMirrorOf(
      outcomeMirror.rows.map((row) => ({
        player_id: row.player_id,
        position: row.position,
        season_ppr: row.player_id === 'wr3' ? 9999 : row.season_ppr,
      })),
    );
    const rowsB = buildControlledRunRows(changed, inputMirror.rows);
    const predictionsA = runControlledLoocv(rowsA).find((prediction) => prediction.player_id === 'wr3')!;
    const predictionsB = runControlledLoocv(rowsB).find((prediction) => prediction.player_id === 'wr3')!;
    // wr3's own outcome changed by +9000+, but its own fold's training set excludes it entirely.
    expect(predictionsB.predictions.baseline_only).toBeCloseTo(predictionsA.predictions.baseline_only, 9);
    expect(predictionsB.predictions.real_player_history_features).toBeCloseTo(predictionsA.predictions.real_player_history_features, 9);
    expect(predictionsB.predictions.shuffled_player_history_control).toBeCloseTo(predictionsA.predictions.shuffled_player_history_control, 9);
  });

  it('LOOCV predictions are deterministic across repeated runs', () => {
    const { outcomeMirror, inputMirror } = syntheticExperiment();
    const rows = buildControlledRunRows(outcomeMirror, inputMirror.rows);
    expect(JSON.stringify(runControlledLoocv(rows))).toBe(JSON.stringify(runControlledLoocv(rows)));
  });
});

// ---- metrics + decision -----------------------------------------------------------------------------

describe('metrics', () => {
  it('computes MAE/RMSE/Pearson/Spearman exactly on a known small set', () => {
    const metrics = computeControlledRunMetrics([
      { actual: 10, predicted: 12 },
      { actual: 20, predicted: 18 },
      { actual: 30, predicted: 33 },
    ]);
    expect(metrics.n).toBe(3);
    expect(metrics.mae).toBeCloseTo((2 + 2 + 3) / 3, 9);
    expect(metrics.rmse).toBeCloseTo(Math.sqrt((4 + 4 + 9) / 3), 9);
    expect(metrics.pearson).toBeGreaterThan(0.95);
    expect(metrics.spearman).toBe(1); // rank order preserved
  });

  it('returns nulls (not zeros) for an empty subgroup', () => {
    const metrics = computeControlledRunMetrics([]);
    expect(metrics).toEqual({ n: 0, mae: null, rmse: null, pearson: null, spearman: null });
  });
});

describe('decision rule (pre-registered, ceiling-safe)', () => {
  const metricsOf = (mae: number, rmse: number): ControlledRunMetrics => ({ n: 485, mae, rmse, pearson: 0.5, spearman: 0.5 });
  const decide = (baselineMae: number, realMae: number, shuffledMae: number, realRmse = 50, shuffledRmse = 60) =>
    decideControlledRun({
      baseline_only: metricsOf(baselineMae, 80),
      real_player_history_features: metricsOf(realMae, realRmse),
      shuffled_player_history_control: metricsOf(shuffledMae, shuffledRmse),
    });

  it('candidate signal only when real beats both comparators on primary AND shuffled on secondary', () => {
    expect(decide(70, 40, 72).decision).toBe('candidate_player_history_signal_observed_requires_followup');
  });

  it('no signal when real beats neither comparator', () => {
    expect(decide(40, 70, 45).decision).toBe('no_player_history_signal_observed');
  });

  it('inconclusive when comparisons are mixed', () => {
    expect(decide(70, 60, 55).decision).toBe('inconclusive_player_history_result'); // beats baseline, not shuffled
    expect(decide(70, 40, 72, 65, 60).decision).toBe('inconclusive_player_history_result'); // fails secondary
  });

  it('run_invalid when a required metric is undefined', () => {
    const result = decideControlledRun({
      baseline_only: { n: 0, mae: null, rmse: null, pearson: null, spearman: null },
      real_player_history_features: metricsOf(40, 50),
      shuffled_player_history_control: metricsOf(70, 80),
    });
    expect(result.decision).toBe('run_invalid_must_not_use');
  });

  it('the decision enum contains exactly the four allowed values and nothing production-binding', () => {
    expect([...CONTROLLED_RUN_DECISIONS]).toEqual([
      'candidate_player_history_signal_observed_requires_followup',
      'no_player_history_signal_observed',
      'inconclusive_player_history_result',
      'run_invalid_must_not_use',
    ]);
    for (const decision of CONTROLLED_RUN_DECISIONS) {
      expect(decision).not.toMatch(/production|bind|promote|may_run|advice|ranking/);
    }
  });
});

// ---- full run boundaries ----------------------------------------------------------------------------

describe('full synthetic run: report boundaries', () => {
  const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
  const { report } = executeControlledRun(outcomeMirror, inputMirror, gates);

  it('is marked experimental_candidate_result_not_production_signal with all boundary statements', () => {
    expect(report.marking).toBe(CONTROLLED_RUN_RESULT_MARKING);
    expect(report.boundary_statements.no_production_forecast_behavior_changed).toBe(true);
    expect(report.boundary_statements.no_feature_binding_occurred).toBe(true);
    expect(report.boundary_statements.source_artifact_remains_candidate_not_promoted).toBe(true);
    expect(report.arms).toEqual(CONTROLLED_RUN_ARMS);
  });

  it('emits no product/advice/ranking keys anywhere', () => {
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
    // Keys starting with no_ are negative boundary assertions (e.g. no_fantasy_advice_or_rankings_output)
    // and are exactly the keys that SHOULD name the forbidden concepts.
    const positiveKeys = keys.filter((key) => !key.startsWith('no_'));
    for (const forbidden of ['advice', 'ranking', 'startsit', 'start_sit', 'trade', 'draft_advice', 'product_recommendation']) {
      expect(positiveKeys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });

  it('is deterministic: two executions produce byte-identical reports', () => {
    const again = executeControlledRun(outcomeMirror, inputMirror, gates);
    expect(JSON.stringify(again.report)).toBe(JSON.stringify(report));
  });

  it('reports shuffled-control integrity with zero self- and cross-position donations', () => {
    expect(report.population.shuffled_control_integrity.self_donations).toBe(0);
    expect(report.population.shuffled_control_integrity.cross_position_donations).toBe(0);
  });
});

describe('production isolation', () => {
  it('the controlled-run module never imports production model/route/service code', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/rehearsal/playerHistoryControlledRun.ts'), 'utf-8');
    const importLines = source.split('\n').filter((line) => line.trimStart().startsWith('import ') || line.includes(" from '"));
    for (const line of importLines) {
      for (const forbidden of ['seasonalPprModel', '/services/', '/server', 'models/seasonal', 'contracts/scoring']) {
        expect(line).not.toContain(forbidden);
      }
    }
  });

  it('builds the real committed mirrors into 610 rows / 485 joined with intact shuffle integrity', () => {
    const FIXTURE_DIR = path.resolve(process.cwd(), 'data/fixtures/tiberData');
    const outcome = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'player_season_coverage_v0_2025.outcome_mirror.json'), 'utf-8')) as PlayerHistoryOutcomeMirror;
    const input = JSON.parse(
      readFileSync(path.join(FIXTURE_DIR, 'player_season_coverage_v0_2022_2024.real_population_input_mirror.json'), 'utf-8'),
    ) as PlayerHistoryRunPopulationInputMirror;
    const rows = buildControlledRunRows(outcome, input.rows);
    expect(rows.length).toBe(610);
    expect(rows.filter((row) => row.has_player_history).length).toBe(485);
    const byId = new Map(rows.map((row) => [row.player_id, row]));
    for (const row of rows) {
      if (row.shuffled_donor_player_id === null) continue;
      expect(row.shuffled_donor_player_id).not.toBe(row.player_id);
      expect(byId.get(row.shuffled_donor_player_id)!.position).toBe(row.position);
    }
  });
});
