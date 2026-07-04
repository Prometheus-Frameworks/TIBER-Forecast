/**
 * Guardrail tests for the promoted-source controlled rerun (Forecast #121).
 *
 * Reruns the #112 three-arm design against the #119/#120 promoted-source mirrors. These tests pin
 * the required failure modes: the #119 mirror-refresh gate must pass with the exact ceiling decision
 * before anything executes, promoted mirror sha/lineage mismatches block, 2025 input leakage and
 * outcome-value leakage block, provenance (prefix, never substring) and fixture markers block,
 * forbidden availability fields and non-null unavailable usage fields block, the #107 floors are
 * recomputed directly from the mirrors (never trusted from stale evidence), the shuffled arm never
 * self-donates or cross-position-donates, held-out outcomes never leak into their own predictions,
 * the decision rule (including directional consistency with the #112 candidate result) is exercised
 * end to end, the decision enum stays free of production/binding/advice values, and the module
 * imports nothing from production Forecast.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  computeControlledRunMetrics,
  runControlledLoocv,
  type ControlledRunMetrics,
} from '../src/rehearsal/playerHistoryControlledRun.js';
import {
  PROMOTED_CONTROLLED_RERUN_DECISIONS,
  PROMOTED_CONTROLLED_RERUN_RESULT_MARKING,
  REQUIRED_PROMOTED_MIRROR_REFRESH_DECISION,
  assertPromotedControlledRerunPreconditions,
  buildPromotedControlledRerunRows,
  decidePromotedControlledRerun,
  executePromotedControlledRerun,
  type CandidateSourceReferenceResult,
  type PromotedControlledRerunPriorGateEvidence,
} from '../src/rehearsal/playerHistoryPromotedControlledRerun.js';
import type {
  PromotedInputMirror,
  PromotedMirrorRefreshGateResult,
  PromotedOutcomeMirror,
} from '../src/rehearsal/playerHistoryPromotedMirrorRefresh.js';
import type { PlayerHistoryInputRow } from '../src/rehearsal/playerHistoryFeatureScaffold.js';
import { PINNED_PROMOTED_ARTIFACT_SHA256 } from '../src/rehearsal/playerHistoryPromotedSourceGate.js';
import { PINNED_SOURCE_ARTIFACT_SHA256 } from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

// ---------------------------------------------------------------------------------------------
// Synthetic promoted-mirror fixtures.
// ---------------------------------------------------------------------------------------------

const APPROVED_REF = { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T00:00:00Z' };

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
  source_refs: [{ ...APPROVED_REF }],
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

const governedSource = (overrides: Partial<PromotedOutcomeMirror['governed_source']> = {}) => ({
  repo: 'Prometheus-Frameworks/TIBER-Data' as const,
  promotedArtifactPath: 'exports/promoted/nfl/player_season_coverage_v0.json' as const,
  promotedManifestPath: 'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json' as const,
  promotionMergeCommit: '65fb498253b5bdb6a7f6d0598d7235c90a78c729' as const,
  sha256: PINNED_PROMOTED_ARTIFACT_SHA256,
  artifactStatus: 'promoted_governed_artifact',
  ...overrides,
});

const sourceLineage = (overrides: Partial<PromotedOutcomeMirror['source_lineage']> = {}) => ({
  refreshed_from_source: 'candidate_pin' as const,
  refreshed_to_source: 'promoted_governed_artifact' as const,
  prior_candidate_sha256: PINNED_SOURCE_ARTIFACT_SHA256,
  archived_candidate_mirrors_preserved_at: [] as readonly string[],
  archived_candidate_mirrors_not_overwritten: true as const,
  ...overrides,
});

const outcomeMirrorOf = (
  players: Array<{ player_id: string; position?: string; season_ppr?: number | null }>,
  overrides: { governed_source?: Partial<PromotedOutcomeMirror['governed_source']>; source_lineage?: Partial<PromotedOutcomeMirror['source_lineage']> } = {},
): PromotedOutcomeMirror =>
  ({
    kind: 'player_history_promoted_outcome_mirror',
    version: 'player-history-promoted-mirror-refresh-v1',
    issue: 'TIBER-Forecast#119',
    governed_source: governedSource(overrides.governed_source),
    source_lineage: sourceLineage(overrides.source_lineage),
    boundary: {
      outcome_layer_only: true,
      rows_carry_no_input_features: true,
      outcome_values_must_not_become_2025_input_features: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
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
      source_refs: [{ ...APPROVED_REF }],
      identity_confidence: 'source_verified',
    })),
  }) as PromotedOutcomeMirror;

const inputMirrorOf = (
  rows: PlayerHistoryInputRow[],
  overrides: { governed_source?: Partial<PromotedInputMirror['governed_source']>; source_lineage?: Partial<PromotedInputMirror['source_lineage']> } = {},
): PromotedInputMirror =>
  ({
    kind: 'player_history_promoted_input_mirror',
    version: 'player-history-promoted-mirror-refresh-v1',
    issue: 'TIBER-Forecast#119',
    governed_source: governedSource(overrides.governed_source),
    source_lineage: sourceLineage(overrides.source_lineage),
    input_window: { seasons: [2022, 2023, 2024], season_type: 'REG', target_season_excluded: 2025 },
    boundary: {
      contains_no_target_season_rows: true,
      contains_no_2025_outcome_values: true,
      nulls_preserved_never_zero_coerced: true,
      no_availability_ownership_depth_injury_fields: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
    },
    counts: { rows: rows.length, players_with_history: 0, outcome_players_without_history: 0, by_season: {}, by_position: {} },
    no_history_players: [],
    rows,
  }) as PromotedInputMirror;

const passingRefreshGate = (overrides: Partial<PromotedMirrorRefreshGateResult> = {}): PromotedMirrorRefreshGateResult =>
  ({
    gate_version: 'player-history-promoted-mirror-refresh-v1',
    issue: 'TIBER-Forecast#119',
    status: 'passed',
    decision: 'may_open_promoted_controlled_rerun_issue',
    decision_rule: 'synthetic',
    checks: [],
    blocking_reasons: [],
    preflight_passed: true,
    mirror_integrity_passed: true,
    overlap_floors_passed: true,
    observed_overlap: { scored_target_rows: 0, joined_rows: 0, joined_share: null, joined_rows_by_position: {} },
    thresholds: { min_joined_rows_overall: 200, min_joined_rows_per_position: 30, min_joined_share: 0.6, required_positions: ['QB', 'RB', 'WR', 'TE'] },
    leakage_discipline: {
      target_season_2025_remains_outcome_only_for_prior_experiment_shape: true,
      input_seasons_for_2025_prediction_remain_2022_2024_only: true,
      no_2025_production_summaries_may_become_2025_input_features: true,
      no_active_availability_ownership_fields_may_be_consumed: true,
      unavailable_usage_fields_remain_null_never_zero_coerced: true,
    },
    archived_candidate_mirror_statement: 'synthetic',
    ceiling_note: 'synthetic',
    ...overrides,
  }) as PromotedMirrorRefreshGateResult;

const passingGates = (overrides: Partial<PromotedMirrorRefreshGateResult> = {}): PromotedControlledRerunPriorGateEvidence => ({
  mirrorRefreshGateResult: passingRefreshGate(overrides),
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
  return { outcomeMirror: outcomeMirrorOf(players), inputMirror: inputMirrorOf(inputRows) };
};

/** Tiny two-position population (13 rows) for fast pure-function tests. */
const syntheticExperiment = () => {
  const { outcomeMirror, inputMirror } = buildSyntheticPopulation(6, ['WR', 'RB'], 1);
  return { outcomeMirror, inputMirror, gates: passingGates() };
};

/** Population that satisfies the #107 floors (240 joined across 4 positions, 96% share). */
const floorSatisfyingExperiment = () => {
  const { outcomeMirror, inputMirror } = buildSyntheticPopulation(60, ['QB', 'RB', 'WR', 'TE'], 10);
  return { outcomeMirror, inputMirror, gates: passingGates() };
};

// ---------------------------------------------------------------------------------------------
// Preflight fail-closed.
// ---------------------------------------------------------------------------------------------

describe('promoted controlled rerun preflight (fail-closed on the #119 gate and mirror integrity)', () => {
  const { outcomeMirror: tinyOutcome, inputMirror: tinyInput, gates: tinyGates } = syntheticExperiment();

  it('passes when the #119 gate, mirror identity, lineage, and floors are all satisfied', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, inputMirror)).not.toThrow();
  });

  it('recomputed floors block a consistent-but-small population', () => {
    expect(() => assertPromotedControlledRerunPreconditions(tinyGates, tinyOutcome, tinyInput)).toThrow(/floor/);
  });

  it('blocks when the #119 gate status is not passed', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const badGates = passingGates({ status: 'design_only' });
    expect(() => assertPromotedControlledRerunPreconditions(badGates, outcomeMirror, inputMirror)).toThrow(/#119 mirror-refresh gate status/);
    void gates;
  });

  it('blocks when the #119 gate decision is anything other than may_open_promoted_controlled_rerun_issue', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const badGates = passingGates({ decision: 'may_use_promoted_mirrors_for_design_only' });
    expect(() => assertPromotedControlledRerunPreconditions(badGates, outcomeMirror, inputMirror)).toThrow(
      new RegExp(REQUIRED_PROMOTED_MIRROR_REFRESH_DECISION),
    );
  });

  it('blocks on a promoted outcome/input mirror sha mismatch', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const tamperedOutcome = { ...outcomeMirror, governed_source: { ...outcomeMirror.governed_source, sha256: 'f'.repeat(64) } };
    expect(() => assertPromotedControlledRerunPreconditions(gates, tamperedOutcome as PromotedOutcomeMirror, inputMirror)).toThrow(/outcome mirror sha256/);
    const tamperedInput = { ...inputMirror, governed_source: { ...inputMirror.governed_source, sha256: 'e'.repeat(64) } };
    expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tamperedInput as PromotedInputMirror)).toThrow(/input mirror sha256/);
  });

  it('blocks on a missing/wrong mirror kind (a "missing promoted mirror" stand-in)', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const wrongKind = { ...outcomeMirror, kind: 'player_history_run_population_outcome_mirror' };
    expect(() => assertPromotedControlledRerunPreconditions(gates, wrongKind as unknown as PromotedOutcomeMirror, inputMirror)).toThrow(
      /outcome mirror kind/,
    );
  });

  it('blocks on a source-candidate lineage mismatch', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const tampered = { ...outcomeMirror, source_lineage: { ...outcomeMirror.source_lineage, prior_candidate_sha256: 'd'.repeat(64) } };
    expect(() => assertPromotedControlledRerunPreconditions(gates, tampered as PromotedOutcomeMirror, inputMirror)).toThrow(
      /outcome mirror candidate lineage sha256/,
    );
  });

  it('blocks if the input mirror contains a 2025 row', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([...inputMirror.rows, historyRow({ player_id: 'qb0', season: 2025, position: 'QB' })]);
    expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tampered)).toThrow(/2025 rows must never be input features/);
  });

  it('blocks a stale/malformed outcome mirror carrying an off-scope row (wrong season, wrong season_type, or out-of-scope position)', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const wrongSeason = { ...outcomeMirror, rows: [...outcomeMirror.rows, { ...outcomeMirror.rows[0]!, player_id: 'extra1', season: 2026 }] };
    expect(() => assertPromotedControlledRerunPreconditions(gates, wrongSeason as PromotedOutcomeMirror, inputMirror)).toThrow(/outcome mirror rows are off-scope/);

    const wrongSeasonType = { ...outcomeMirror, rows: [...outcomeMirror.rows, { ...outcomeMirror.rows[0]!, player_id: 'extra2', season_type: 'POST' }] };
    expect(() => assertPromotedControlledRerunPreconditions(gates, wrongSeasonType as PromotedOutcomeMirror, inputMirror)).toThrow(/outcome mirror rows are off-scope/);

    const wrongPosition = { ...outcomeMirror, rows: [...outcomeMirror.rows, { ...outcomeMirror.rows[0]!, player_id: 'extra3', position: 'K' }] };
    expect(() => assertPromotedControlledRerunPreconditions(gates, wrongPosition as PromotedOutcomeMirror, inputMirror)).toThrow(/outcome mirror rows are off-scope/);
  });

  it('blocks if outcome-valued fields appear on input rows', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, ppr_2025_actual: 321.5 } as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
    expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tampered)).toThrow(/outcome-valued fields/);
  });

  it('blocks on forbidden availability/status fields', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, active_status: 'active' } as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
    expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tampered)).toThrow(/forbidden availability field/);
  });

  it('blocks missing, unapproved, and mixed source refs (prefix, never substring)', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    for (const refs of [[], [{ source_name: 'espn_scrape_v2', observed_at: null }], [APPROVED_REF, { source_name: 'manual_entry', observed_at: null }]]) {
      const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, source_refs: refs } as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
      expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tampered)).toThrow(/source_refs|source ref/);
    }
  });

  it('blocks an embedded-token source ref (prefix match required, substring is not enough)', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([
      { ...inputMirror.rows[0]!, source_refs: [{ source_name: 'manual_override:nflreadpy.load_players()', observed_at: null }] } as PlayerHistoryInputRow,
      ...inputMirror.rows.slice(1),
    ]);
    expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tampered)).toThrow(/non-prefix-approved source ref/);
  });

  it('blocks a fixture/scaffold/offline_fixture-marked source ref', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([
      { ...inputMirror.rows[0]!, source_refs: [{ source_name: `${APPROVED_REF.source_name} offline_fixture`, observed_at: null }] } as PlayerHistoryInputRow,
      ...inputMirror.rows.slice(1),
    ]);
    expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tampered)).toThrow(/fixture\/scaffold-marked source ref/);
  });

  it('blocks a non-null unavailable usage field (zero-coerced or populated)', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    for (const value of [0, 0.4]) {
      const tampered = inputMirrorOf([
        { ...inputMirror.rows[0]!, usage_summary: { ...inputMirror.rows[0]!.usage_summary, snap_share: value } },
        ...inputMirror.rows.slice(1),
      ]);
      expect(() => assertPromotedControlledRerunPreconditions(gates, outcomeMirror, tampered)).toThrow(/never source-backed and must remain null/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Row assembly + leakage discipline (identical discipline to #112, re-verified for the promoted path).
// ---------------------------------------------------------------------------------------------

describe('promoted arm construction and leakage discipline', () => {
  const { outcomeMirror, inputMirror } = syntheticExperiment();
  const rows = buildPromotedControlledRerunRows(outcomeMirror, inputMirror.rows);

  it("the real arm consumes each player's own promoted-source payload; no-history rows stay all-null", () => {
    const wr0 = rows.find((row) => row.player_id === 'wr0')!;
    expect(wr0.has_player_history).toBe(true);
    expect(wr0.real_history_values.ppr_2024).toBe(80);
    const rookie = rows.find((row) => row.player_id === 'rookie0')!;
    expect(rookie.has_player_history).toBe(false);
    expect(Object.values(rookie.real_history_values).every((value) => value === null)).toBe(true);
  });

  it('the shuffled arm never self-donates and never cross-position-donates; deterministic across rebuilds', () => {
    const byId = new Map(rows.map((row) => [row.player_id, row]));
    for (const row of rows) {
      if (row.shuffled_donor_player_id === null) continue;
      expect(row.shuffled_donor_player_id).not.toBe(row.player_id);
      expect(byId.get(row.shuffled_donor_player_id)!.position).toBe(row.position);
    }
    const again = buildPromotedControlledRerunRows(outcomeMirror, inputMirror.rows);
    expect(JSON.stringify(again.map((row) => row.shuffled_donor_player_id))).toBe(JSON.stringify(rows.map((row) => row.shuffled_donor_player_id)));
  });

  it("a held-out player's own outcome never influences its own prediction in any arm", () => {
    const rowsA = buildPromotedControlledRerunRows(outcomeMirror, inputMirror.rows);
    const changed = outcomeMirrorOf(
      outcomeMirror.rows.map((row) => ({ player_id: row.player_id, position: row.position, season_ppr: row.player_id === 'wr3' ? 9999 : row.season_ppr })),
    );
    const rowsB = buildPromotedControlledRerunRows(changed, inputMirror.rows);
    const predictionsA = runControlledLoocv(rowsA).find((prediction) => prediction.player_id === 'wr3')!;
    const predictionsB = runControlledLoocv(rowsB).find((prediction) => prediction.player_id === 'wr3')!;
    expect(predictionsB.predictions.baseline_only).toBeCloseTo(predictionsA.predictions.baseline_only, 9);
    expect(predictionsB.predictions.real_player_history_features).toBeCloseTo(predictionsA.predictions.real_player_history_features, 9);
    expect(predictionsB.predictions.shuffled_player_history_control).toBeCloseTo(predictionsA.predictions.shuffled_player_history_control, 9);
  });

  it('the baseline arm never consumes player-history payloads: its prediction is exactly the train-fold position mean', () => {
    const predictions = runControlledLoocv(rows);
    const wr0 = predictions.find((prediction) => prediction.player_id === 'wr0')!;
    const trainSamePosition = rows.filter((row) => row.player_id !== 'wr0' && row.position === 'WR');
    const expectedBaseline = trainSamePosition.reduce((sum, row) => sum + row.outcome, 0) / trainSamePosition.length;
    expect(wr0.predictions.baseline_only).toBeCloseTo(expectedBaseline, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// Decision rule, including directional consistency with the #112 candidate result.
// ---------------------------------------------------------------------------------------------

describe('promoted controlled rerun decision rule', () => {
  const metricsOf = (mae: number, rmse: number): ControlledRunMetrics => ({ n: 485, mae, rmse, pearson: 0.5, spearman: 0.5 });
  const joined = (baselineMae: number, realMae: number, shuffledMae: number, realRmse = 50, shuffledRmse = 60) => ({
    baseline_only: metricsOf(baselineMae, 80),
    real_player_history_features: metricsOf(realMae, realRmse),
    shuffled_player_history_control: metricsOf(shuffledMae, shuffledRmse),
  });
  const candidateReplicated: CandidateSourceReferenceResult = {
    decision: 'candidate_player_history_signal_observed_requires_followup',
    joined_mae: { baseline_only: 68.926, real_player_history_features: 40.034, shuffled_player_history_control: 72.031 },
    joined_rmse: { baseline_only: 88.553, real_player_history_features: 57.287, shuffled_player_history_control: 90.409 },
  };
  const candidateNoSignal: CandidateSourceReferenceResult = {
    decision: 'no_player_history_signal_observed',
    joined_mae: { baseline_only: 40, real_player_history_features: 70, shuffled_player_history_control: 45 },
    joined_rmse: { baseline_only: 60, real_player_history_features: 90, shuffled_player_history_control: 65 },
  };
  const decide = (j: ReturnType<typeof joined>, candidate: CandidateSourceReferenceResult) => {
    const promotedBeatsBoth = j.real_player_history_features.mae! < j.baseline_only.mae! && j.real_player_history_features.mae! < j.shuffled_player_history_control.mae!;
    const candidateBeatsBoth =
      candidate.joined_mae.real_player_history_features < candidate.joined_mae.baseline_only &&
      candidate.joined_mae.real_player_history_features < candidate.joined_mae.shuffled_player_history_control;
    const comparison = {
      candidate_decision: candidate.decision,
      candidate_beat_baseline_and_shuffled: candidateBeatsBoth,
      promoted_beat_baseline_and_shuffled: promotedBeatsBoth,
      directionally_consistent: candidateBeatsBoth === promotedBeatsBoth,
      joined_mae_delta_vs_candidate: { baseline_only: 0, real_player_history_features: 0, shuffled_player_history_control: 0 },
      joined_rmse_delta_vs_candidate: { baseline_only: 0, real_player_history_features: 0, shuffled_player_history_control: 0 },
      replication_note: '',
    };
    return decidePromotedControlledRerun(j, comparison);
  };

  it('replicated_requires_followup when real beats both comparators, beats shuffled on RMSE, and matches the candidate direction', () => {
    expect(decide(joined(70, 40, 72), candidateReplicated).decision).toBe('promoted_player_history_signal_replicated_requires_followup');
  });

  it('not_replicated when real beats neither comparator (matching a no-signal candidate direction)', () => {
    expect(decide(joined(40, 70, 45), candidateNoSignal).decision).toBe('promoted_player_history_signal_not_replicated');
  });

  it('inconclusive when the comparisons are mixed', () => {
    expect(decide(joined(70, 60, 55), candidateReplicated).decision).toBe('promoted_player_history_result_inconclusive');
  });

  it('inconclusive when the result is directionally inconsistent with the candidate even though it beats both comparators', () => {
    // Beats both + secondary here, but the candidate showed NO signal -- directions disagree.
    expect(decide(joined(70, 40, 72), candidateNoSignal).decision).toBe('promoted_player_history_result_inconclusive');
  });

  it('invalid_must_not_use when a required joined-population metric is undefined', () => {
    const j = {
      baseline_only: { n: 0, mae: null, rmse: null, pearson: null, spearman: null },
      real_player_history_features: metricsOf(40, 50),
      shuffled_player_history_control: metricsOf(70, 80),
    };
    const comparison = {
      candidate_decision: candidateReplicated.decision,
      candidate_beat_baseline_and_shuffled: true,
      promoted_beat_baseline_and_shuffled: false,
      directionally_consistent: false,
      joined_mae_delta_vs_candidate: { baseline_only: 0, real_player_history_features: 0, shuffled_player_history_control: 0 },
      joined_rmse_delta_vs_candidate: { baseline_only: 0, real_player_history_features: 0, shuffled_player_history_control: 0 },
      replication_note: '',
    };
    expect(decidePromotedControlledRerun(j, comparison).decision).toBe('promoted_controlled_rerun_invalid_must_not_use');
  });
});

// ---------------------------------------------------------------------------------------------
// Metrics reuse sanity + full end-to-end execution.
// ---------------------------------------------------------------------------------------------

describe('metrics reuse', () => {
  it('computeControlledRunMetrics is reused unchanged from #112', () => {
    const metrics = computeControlledRunMetrics([
      { actual: 10, predicted: 12 },
      { actual: 20, predicted: 18 },
    ]);
    expect(metrics.n).toBe(2);
    expect(metrics.mae).toBeCloseTo(2, 9);
  });
});

describe('full execution end-to-end (synthetic)', () => {
  it('executes, marks the result experimental, and is deterministic across repeated runs', () => {
    const { outcomeMirror, inputMirror, gates } = floorSatisfyingExperiment();
    const candidateReference: CandidateSourceReferenceResult = {
      decision: 'candidate_player_history_signal_observed_requires_followup',
      joined_mae: { baseline_only: 100, real_player_history_features: 50, shuffled_player_history_control: 100 },
      joined_rmse: { baseline_only: 120, real_player_history_features: 60, shuffled_player_history_control: 120 },
    };
    const run1 = executePromotedControlledRerun(outcomeMirror, inputMirror, gates, candidateReference);
    const run2 = executePromotedControlledRerun(outcomeMirror, inputMirror, gates, candidateReference);
    expect(run1.report.marking).toBe(PROMOTED_CONTROLLED_RERUN_RESULT_MARKING);
    expect(JSON.stringify(run1.report)).toBe(JSON.stringify(run2.report));
    expect(PROMOTED_CONTROLLED_RERUN_DECISIONS).toContain(run1.report.decision.decision);
  });

  it('a preflight failure prevents execution entirely: no report is produced', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const badGates = passingGates({ status: 'failed' });
    const candidateReference: CandidateSourceReferenceResult = {
      decision: 'no_player_history_signal_observed',
      joined_mae: { baseline_only: 1, real_player_history_features: 1, shuffled_player_history_control: 1 },
      joined_rmse: { baseline_only: 1, real_player_history_features: 1, shuffled_player_history_control: 1 },
    };
    expect(() => executePromotedControlledRerun(outcomeMirror, inputMirror, badGates, candidateReference)).toThrow(/BLOCKED/);
  });
});

// ---------------------------------------------------------------------------------------------
// Decision-enum purity, marking, and production isolation.
// ---------------------------------------------------------------------------------------------

describe('decision-enum purity and production isolation', () => {
  it('the decision enum contains exactly the four #121 values and no production/binding/product/advice value', () => {
    expect([...PROMOTED_CONTROLLED_RERUN_DECISIONS]).toEqual([
      'promoted_player_history_signal_replicated_requires_followup',
      'promoted_player_history_signal_not_replicated',
      'promoted_player_history_result_inconclusive',
      'promoted_controlled_rerun_invalid_must_not_use',
    ]);
    for (const decision of PROMOTED_CONTROLLED_RERUN_DECISIONS) {
      for (const forbidden of ['bind', 'production', 'product', 'advice', 'ranking', 'promote_', 'wire']) {
        expect(decision).not.toContain(forbidden);
      }
    }
  });

  it('every result is marked experimental and not a production signal', () => {
    expect(PROMOTED_CONTROLLED_RERUN_RESULT_MARKING).toBe('experimental_promoted_source_result_not_production_signal');
  });

  it('module and script import nothing from production Forecast (no seasonalPprModel, server, routes, scoring, board, fusion, services)', () => {
    for (const rel of ['src/rehearsal/playerHistoryPromotedControlledRerun.ts', 'scripts/runPlayerHistoryPromotedControlledRerun.ts']) {
      const source = readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
      expect(importLines.length).toBeGreaterThan(0);
      for (const line of importLines) {
        expect(line).not.toMatch(/seasonalPprModel|\/server|\/routes|\/scoring|\/board|\/fusion|\/services/);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Committed report (the real #121 output).
// ---------------------------------------------------------------------------------------------

describe('committed promoted-source controlled rerun report', () => {
  const REPORT_PATH = 'docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json';
  const report = readRepoJson<{
    marking: string;
    inputs: { refresh_gate: { status: string; decision: string }; candidate_source_run: { decision: string } };
    experiment: {
      population: { evaluated_rows: number; joined_rows: number };
      metrics_by_arm: { joined_only: Record<string, ControlledRunMetrics> };
      candidate_source_comparison: { directionally_consistent: boolean; candidate_beat_baseline_and_shuffled: boolean; promoted_beat_baseline_and_shuffled: boolean };
      decision: { decision: string };
    };
  }>(REPORT_PATH);

  it('is marked experimental and not a production signal', () => {
    expect(report.marking).toBe(PROMOTED_CONTROLLED_RERUN_RESULT_MARKING);
  });

  it('preflight passed against the #119 gate before execution', () => {
    expect(report.inputs.refresh_gate.status).toBe('passed');
    expect(report.inputs.refresh_gate.decision).toBe('may_open_promoted_controlled_rerun_issue');
  });

  it('the real population/joined counts match the committed promoted mirrors (610 evaluated, 485 joined)', () => {
    expect(report.experiment.population.evaluated_rows).toBe(610);
    expect(report.experiment.population.joined_rows).toBe(485);
  });

  it('replicates the #112 candidate-source result exactly, since the promoted mirror payloads are verbatim-identical', () => {
    const joined = report.experiment.metrics_by_arm.joined_only;
    expect(joined.baseline_only!.mae).toBeCloseTo(68.926, 2);
    expect(joined.real_player_history_features!.mae).toBeCloseTo(40.034, 2);
    expect(joined.shuffled_player_history_control!.mae).toBeCloseTo(72.031, 2);
    expect(report.experiment.candidate_source_comparison.directionally_consistent).toBe(true);
    expect(report.experiment.candidate_source_comparison.candidate_beat_baseline_and_shuffled).toBe(true);
    expect(report.experiment.candidate_source_comparison.promoted_beat_baseline_and_shuffled).toBe(true);
  });

  it('emits the replicated decision and it is one of the four allowed values', () => {
    expect(report.experiment.decision.decision).toBe('promoted_player_history_signal_replicated_requires_followup');
    expect(PROMOTED_CONTROLLED_RERUN_DECISIONS).toContain(report.experiment.decision.decision);
  });
});
