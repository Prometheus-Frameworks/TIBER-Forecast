/**
 * Guardrail tests for the 2024-from-2021-2023 additional validation (Forecast #137).
 *
 * Runs the isolated #111/#121 three-arm design against the #135/#136 refreshed mirrors ONLY. These
 * tests pin the required failure modes: the #136 mirror-refresh gate must have passed with the exact
 * ceiling decision, mirror identity/sha/promotion-pin mismatches block, 2024-input leakage and
 * target-outcome-value leakage block, provenance (prefix, never substring) and fixture markers block,
 * forbidden availability fields and non-null unavailable usage fields block, the #107 floors are
 * recomputed directly from the mirrors (never trusted from stale evidence) and their failure alone
 * downgrades to requires-followup rather than blocked, the feature block is re-keyed to
 * 2023/2022/2021 (not the 2024/2023/2022 keys #111/#121 used), the shuffled arm never self-donates or
 * cross-position-donates, held-out outcomes never leak into their own predictions, the decision enum
 * stays free of threshold/production/binding values, only the #136 refreshed mirrors are consumed
 * (never the #110/#119/#120 prior mirror families), and the module imports nothing from production
 * Forecast.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { computeControlledRunMetrics, runControlledLoocv, type ControlledRunMetrics } from '../src/rehearsal/playerHistoryControlledRun.js';
import {
  ADDITIONAL_VALIDATION_HISTORY_COLUMNS,
  ADDITIONAL_VALIDATION_MIRROR_PATHS,
  ADDITIONAL_VALIDATION_RESULT_MARKING,
  PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_DECISIONS,
  REQUIRED_MIRROR_REFRESH_DECISION,
  buildAdditionalValidationRows,
  evaluateAdditionalValidationPreconditions,
  executePlayerHistory2024From2021_2023AdditionalValidation,
  historyValuesFromAdditionalValidationFeatureRow,
} from '../src/rehearsal/playerHistory2024From2021_2023AdditionalValidation.js';
import {
  EXPECTED_PROMOTION_REVIEW_2021_2025,
  PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
  PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED,
  type PlayerHistory2021_2023InputMirror,
  type PlayerHistory2024From2021_2023MirrorRefreshGateResult,
  type PlayerHistory2024OutcomeMirror,
} from '../src/rehearsal/playerHistory2024From2021_2023MirrorRefresh.js';
import { buildPlayerHistoryFeatures, type PlayerHistoryInputRow } from '../src/rehearsal/playerHistoryFeatureScaffold.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

// ---------------------------------------------------------------------------------------------
// Synthetic 2024-from-2021-2023 mirror fixtures.
// ---------------------------------------------------------------------------------------------

const APPROVED_REF = { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-07-06T00:00:00Z' };

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

const governedSource = (overrides: Partial<PlayerHistory2024OutcomeMirror['governed_source']> = {}) => ({
  repo: 'Prometheus-Frameworks/TIBER-Data' as const,
  promotedArtifactPath: 'exports/promoted/nfl/player_season_coverage_v0.json' as const,
  promotedManifestPath: 'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json' as const,
  promotionMergeCommit: '711d6ee158d4e3bd116d1df4d76dea282200454d' as const,
  promotionReview: EXPECTED_PROMOTION_REVIEW_2021_2025,
  sha256: PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
  artifactStatus: 'promoted_governed_artifact',
  ...overrides,
});

const sourceLineage = () => ({
  refreshed_from_source: 'prior_promoted_artifact_2022_2025' as const,
  refreshed_to_source: 'promoted_governed_artifact_2021_2025' as const,
  prior_promoted_artifact_sha256: '29f8e378127fa5426e5897ac4522b6187941312edabab357d8a427fb20511035' as const,
  prior_mirror_paths_preserved_unchanged: PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED,
  prior_mirrors_not_overwritten: true as const,
});

const outcomeMirrorOf = (
  players: Array<{ player_id: string; position?: string; season_ppr?: number | null }>,
  overrides: { governed_source?: Partial<PlayerHistory2024OutcomeMirror['governed_source']> } = {},
): PlayerHistory2024OutcomeMirror =>
  ({
    kind: 'player_history_2024_from_2021_2023_outcome_mirror',
    version: 'player-history-2024-from-2021-2023-mirror-refresh-v1',
    issue: 'TIBER-Forecast#135',
    governed_source: governedSource(overrides.governed_source),
    source_lineage: sourceLineage(),
    boundary: {
      outcome_layer_only: true,
      rows_carry_no_input_features: true,
      outcome_values_must_not_become_2024_input_features: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
      no_validation_run_or_threshold_decision_by_this_mirror: true,
    },
    target_season: 2024,
    season_type: 'REG',
    counts: { rows: players.length, players: players.length, by_position: {} },
    rows: players.map((player) => ({
      player_id: player.player_id,
      player_name: `Player ${player.player_id}`,
      position: player.position ?? 'WR',
      season: 2024,
      season_type: 'REG',
      season_ppr: player.season_ppr === undefined ? 200 : player.season_ppr,
      source_refs: [{ ...APPROVED_REF }],
      identity_confidence: 'source_verified',
    })),
  }) as PlayerHistory2024OutcomeMirror;

const inputMirrorOf = (
  rows: PlayerHistoryInputRow[],
  overrides: { governed_source?: Partial<PlayerHistory2021_2023InputMirror['governed_source']> } = {},
): PlayerHistory2021_2023InputMirror =>
  ({
    kind: 'player_history_2024_from_2021_2023_input_mirror',
    version: 'player-history-2024-from-2021-2023-mirror-refresh-v1',
    issue: 'TIBER-Forecast#135',
    governed_source: governedSource(overrides.governed_source),
    source_lineage: sourceLineage(),
    input_window: { seasons: [2021, 2022, 2023], season_type: 'REG', target_season_excluded: 2024 },
    boundary: {
      contains_no_target_season_rows: true,
      contains_no_2024_outcome_values: true,
      nulls_preserved_never_zero_coerced: true,
      no_availability_ownership_depth_injury_fields: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
      no_validation_run_or_threshold_decision_by_this_mirror: true,
    },
    counts: { rows: rows.length, players_with_history: 0, outcome_players_without_history: 0, by_season: {}, by_position: {} },
    no_history_players: [],
    rows,
  }) as PlayerHistory2021_2023InputMirror;

const passingPriorGate = (
  overrides: Partial<Pick<PlayerHistory2024From2021_2023MirrorRefreshGateResult, 'status' | 'decision'>> = {},
): Pick<PlayerHistory2024From2021_2023MirrorRefreshGateResult, 'status' | 'decision'> => ({
  status: 'passed',
  decision: REQUIRED_MIRROR_REFRESH_DECISION,
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
      for (const season of [2021, 2022, 2023]) {
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

/** Tiny two-position population (13 rows) for fast pure-function tests; too small to clear the #107 floors. */
const syntheticExperiment = () => {
  const { outcomeMirror, inputMirror } = buildSyntheticPopulation(6, ['WR', 'RB'], 1);
  return { outcomeMirror, inputMirror, priorGate: passingPriorGate() };
};

/** Population that satisfies the #107 floors (240 joined across 4 positions, well over 60% share). */
const floorSatisfyingExperiment = () => {
  const { outcomeMirror, inputMirror } = buildSyntheticPopulation(60, ['QB', 'RB', 'WR', 'TE'], 10);
  return { outcomeMirror, inputMirror, priorGate: passingPriorGate() };
};

// ---------------------------------------------------------------------------------------------
// Preconditions gate: fail-closed on the #136 decision and mirror identity/leakage/provenance.
// ---------------------------------------------------------------------------------------------

describe('preconditions gate (fail-closed on the #136 decision, mirror identity, leakage, and provenance)', () => {
  it('passes integrity and floors on a floor-satisfying synthetic population', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, inputMirror);
    expect(result.integrity_passed).toBe(true);
    expect(result.floors_passed).toBe(true);
    expect(result.blocking_reasons).toEqual([]);
  });

  it('a tiny-but-consistent population fails only the floors, not integrity', () => {
    const { outcomeMirror, inputMirror, priorGate } = syntheticExperiment();
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, inputMirror);
    expect(result.integrity_passed).toBe(true);
    expect(result.floors_passed).toBe(false);
  });

  it('blocks when the #136 gate status is not passed', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const badGate = passingPriorGate({ status: 'requires_followup' as never });
    const result = evaluateAdditionalValidationPreconditions(badGate, outcomeMirror, inputMirror);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('prior_mirror_refresh_gate_decision');
  });

  it('blocks when the #136 gate decision is anything other than the required ceiling value', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const badGate = passingPriorGate({ decision: 'forecast_player_history_mirror_refresh_requires_followup' as never });
    const result = evaluateAdditionalValidationPreconditions(badGate, outcomeMirror, inputMirror);
    expect(result.integrity_passed).toBe(false);
  });

  it('blocks on an outcome/input mirror sha mismatch against the #202/#207 pin', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const tamperedOutcome = { ...outcomeMirror, governed_source: { ...outcomeMirror.governed_source, sha256: 'f'.repeat(64) } };
    const result = evaluateAdditionalValidationPreconditions(priorGate, tamperedOutcome as PlayerHistory2024OutcomeMirror, inputMirror);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('outcome_mirror_kind_and_source');
  });

  it('blocks on a wrong mirror kind (a "wrong mirror family" stand-in)', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const wrongKind = { ...inputMirror, kind: 'player_history_promoted_input_mirror' };
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, wrongKind as unknown as PlayerHistory2021_2023InputMirror);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('input_mirror_kind_and_source');
  });

  it('blocks on an off-scope input mirror position (K/DST etc) BEFORE any row is built into features', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, position: 'K' }, ...inputMirror.rows.slice(1)]);
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, tampered);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('input_positions_in_scope');
    // The execute path must report `blocked`, not throw/crash inside buildPlayerHistoryFeatures's scope guard.
    const { report, predictions } = executePlayerHistory2024From2021_2023AdditionalValidation(outcomeMirror, tampered, priorGate);
    expect(report.decision).toBe('player_history_2024_from_2021_2023_additional_validation_blocked');
    expect(predictions).toEqual([]);
  });

  it('blocks if the input mirror contains a 2024 row (leakage split violated)', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([...inputMirror.rows, historyRow({ player_id: 'qb0', season: 2024, position: 'QB' })]);
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, tampered);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('input_no_2024_rows_leakage_split_preserved');
  });

  it('blocks if a target-outcome-valued field appears on an input row', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, season_ppr_2024: 321.5 } as unknown as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, tampered);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('input_no_target_outcome_values');
  });

  it('blocks on forbidden availability/status fields', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, active_status: 'active' } as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, tampered);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('no_forbidden_availability_fields');
  });

  it('blocks missing, unapproved, mixed, and embedded-token source refs (prefix, never substring)', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    for (const refs of [
      [],
      [{ source_name: 'espn_scrape_v2', observed_at: null }],
      [APPROVED_REF, { source_name: 'manual_entry', observed_at: null }],
      [{ source_name: 'manual_override:nflreadpy.load_players()', observed_at: null }],
    ]) {
      const tampered = inputMirrorOf([{ ...inputMirror.rows[0]!, source_refs: refs } as PlayerHistoryInputRow, ...inputMirror.rows.slice(1)]);
      const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, tampered);
      expect(result.integrity_passed).toBe(false);
      expect(result.blocking_reasons.join(' ')).toMatch(/mirror_source_refs_present|mirror_source_refs_prefix_approved_no_fixture_markers/);
    }
  });

  it('blocks a fixture-marked source ref', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const tampered = inputMirrorOf([
      { ...inputMirror.rows[0]!, source_refs: [{ source_name: `${APPROVED_REF.source_name}#offline_fixture`, observed_at: null }] } as PlayerHistoryInputRow,
      ...inputMirror.rows.slice(1),
    ]);
    const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, tampered);
    expect(result.integrity_passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('mirror_source_refs_prefix_approved_no_fixture_markers');
  });

  it('blocks a non-null unavailable usage field (zero-coerced or populated)', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    for (const value of [0, 0.4]) {
      const tampered = inputMirrorOf([
        { ...inputMirror.rows[0]!, usage_summary: { ...inputMirror.rows[0]!.usage_summary, snap_share: value } },
        ...inputMirror.rows.slice(1),
      ]);
      const result = evaluateAdditionalValidationPreconditions(priorGate, outcomeMirror, tampered);
      expect(result.integrity_passed).toBe(false);
      expect(result.blocking_reasons.join(' ')).toContain('unavailable_usage_fields_remain_null');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Row assembly, re-keyed feature window, and leakage discipline.
// ---------------------------------------------------------------------------------------------

describe('row assembly re-keyed to the 2024-from-2021-2023 window (2023/2022/2021, not 2024/2023/2022)', () => {
  const { outcomeMirror, inputMirror } = syntheticExperiment();
  const rows = buildAdditionalValidationRows(outcomeMirror, inputMirror.rows);

  it("the real arm consumes each player's own re-keyed 2023 payload; no-history rows stay all-null", () => {
    const wr0 = rows.find((row) => row.player_id === 'wr0')!;
    expect(wr0.has_player_history).toBe(true);
    expect(wr0.real_history_values.ppr_2023).toBe(80);
    expect('ppr_2024' in wr0.real_history_values).toBe(false);
    const rookie = rows.find((row) => row.player_id === 'rookie0')!;
    expect(rookie.has_player_history).toBe(false);
    expect(Object.values(rookie.real_history_values).every((value) => value === null)).toBe(true);
  });

  it('the feature scaffold anchors trailing windows at target_season-1=2023 for this window', () => {
    const featureRows = buildPlayerHistoryFeatures(inputMirror.rows, { targetSeason: 2024, inputSeasons: [2021, 2022, 2023] });
    const wr0Features = featureRows.find((row) => row.player_id === 'wr0')!;
    expect(wr0Features.production?.season_ppr_by_season[2023]).toBe(80);
    expect(wr0Features.production?.trailing_3yr_ppr_total).toBe(240);
    const extracted = historyValuesFromAdditionalValidationFeatureRow(wr0Features);
    expect(extracted.ppr_2023).toBe(80);
    expect(extracted.ppr_2022).toBe(80);
    expect(extracted.ppr_2021).toBe(80);
  });

  it('ADDITIONAL_VALIDATION_HISTORY_COLUMNS is re-keyed and does not reuse the 2024/2023/2022 column names', () => {
    const names = ADDITIONAL_VALIDATION_HISTORY_COLUMNS.map((c) => c.name);
    expect(names).toContain('ppr_2023');
    expect(names).toContain('ppr_2021');
    expect(names).not.toContain('ppr_2024');
    expect(names).not.toContain('targets_2024');
  });

  it('the shuffled arm never self-donates and never cross-position-donates; deterministic across rebuilds', () => {
    const byId = new Map(rows.map((row) => [row.player_id, row]));
    for (const row of rows) {
      if (row.shuffled_donor_player_id === null) continue;
      expect(row.shuffled_donor_player_id).not.toBe(row.player_id);
      expect(byId.get(row.shuffled_donor_player_id)!.position).toBe(row.position);
    }
    const again = buildAdditionalValidationRows(outcomeMirror, inputMirror.rows);
    expect(JSON.stringify(again.map((row) => row.shuffled_donor_player_id))).toBe(JSON.stringify(rows.map((row) => row.shuffled_donor_player_id)));
  });

  it("a held-out player's own outcome never influences its own prediction in any arm", () => {
    const rowsA = buildAdditionalValidationRows(outcomeMirror, inputMirror.rows);
    const changed = outcomeMirrorOf(outcomeMirror.rows.map((row) => ({ player_id: row.player_id, position: row.position, season_ppr: row.player_id === 'wr3' ? 9999 : row.season_ppr })));
    const rowsB = buildAdditionalValidationRows(changed, inputMirror.rows);
    const predictionsA = runControlledLoocv(rowsA, 1.0, ADDITIONAL_VALIDATION_HISTORY_COLUMNS).find((p) => p.player_id === 'wr3')!;
    const predictionsB = runControlledLoocv(rowsB, 1.0, ADDITIONAL_VALIDATION_HISTORY_COLUMNS).find((p) => p.player_id === 'wr3')!;
    expect(predictionsB.predictions.baseline_only).toBeCloseTo(predictionsA.predictions.baseline_only, 9);
    expect(predictionsB.predictions.real_player_history_features).toBeCloseTo(predictionsA.predictions.real_player_history_features, 9);
    expect(predictionsB.predictions.shuffled_player_history_control).toBeCloseTo(predictionsA.predictions.shuffled_player_history_control, 9);
  });

  it('the baseline arm never consumes player-history payloads: its prediction is exactly the train-fold position mean', () => {
    const predictions = runControlledLoocv(rows, 1.0, ADDITIONAL_VALIDATION_HISTORY_COLUMNS);
    const wr0 = predictions.find((p) => p.player_id === 'wr0')!;
    const trainSamePosition = rows.filter((row) => row.player_id !== 'wr0' && row.position === 'WR');
    const expectedBaseline = trainSamePosition.reduce((sum, row) => sum + row.outcome, 0) / trainSamePosition.length;
    expect(wr0.predictions.baseline_only).toBeCloseTo(expectedBaseline, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// Metrics reuse sanity + full end-to-end execution.
// ---------------------------------------------------------------------------------------------

describe('metrics reuse', () => {
  it('computeControlledRunMetrics is reused unchanged from #111', () => {
    const metrics = computeControlledRunMetrics([
      { actual: 10, predicted: 12 },
      { actual: 20, predicted: 18 },
    ]);
    expect(metrics.n).toBe(2);
    expect(metrics.mae).toBeCloseTo(2, 9);
  });
});

describe('full execution end-to-end', () => {
  it('a #136-gate/precondition failure blocks the run: no metric is computed', () => {
    const { outcomeMirror, inputMirror } = floorSatisfyingExperiment();
    const badGate = passingPriorGate({ status: 'blocked' as never });
    const { report, predictions } = executePlayerHistory2024From2021_2023AdditionalValidation(outcomeMirror, inputMirror, badGate);
    expect(report.decision).toBe('player_history_2024_from_2021_2023_additional_validation_blocked');
    expect(predictions).toEqual([]);
    expect(report.population.evaluated_rows).toBe(0);
    expect(report.metrics_by_arm.joined_only.real_player_history_features.mae).toBeNull();
  });

  it('a floor-only failure requires followup, but still computes and reports metrics for transparency', () => {
    const { outcomeMirror, inputMirror, priorGate } = syntheticExperiment();
    const { report, predictions } = executePlayerHistory2024From2021_2023AdditionalValidation(outcomeMirror, inputMirror, priorGate);
    expect(report.decision).toBe('player_history_2024_from_2021_2023_additional_validation_requires_followup');
    expect(predictions.length).toBeGreaterThan(0);
    expect(report.population.evaluated_rows).toBeGreaterThan(0);
  });

  it('executes, marks the result experimental, and is deterministic across repeated runs when everything clears', () => {
    const { outcomeMirror, inputMirror, priorGate } = floorSatisfyingExperiment();
    const run1 = executePlayerHistory2024From2021_2023AdditionalValidation(outcomeMirror, inputMirror, priorGate);
    const run2 = executePlayerHistory2024From2021_2023AdditionalValidation(outcomeMirror, inputMirror, priorGate);
    expect(run1.report.marking).toBe(ADDITIONAL_VALIDATION_RESULT_MARKING);
    expect(JSON.stringify(run1.report)).toBe(JSON.stringify(run2.report));
    expect(run1.report.decision).toBe('may_open_player_history_2024_from_2021_2023_threshold_review_issue');
    expect(PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_DECISIONS).toContain(run1.report.decision);
  });
});

// ---------------------------------------------------------------------------------------------
// Decision-enum purity, marking, mirror-family isolation, and production isolation.
// ---------------------------------------------------------------------------------------------

describe('decision-enum purity, mirror-family isolation, and production isolation', () => {
  it('the decision enum contains exactly the three #137 values and no threshold/production/binding/advice value', () => {
    expect([...PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_DECISIONS]).toEqual([
      'may_open_player_history_2024_from_2021_2023_threshold_review_issue',
      'player_history_2024_from_2021_2023_additional_validation_blocked',
      'player_history_2024_from_2021_2023_additional_validation_requires_followup',
    ]);
    for (const decision of PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_DECISIONS) {
      for (const forbidden of ['accept_threshold', 'reject_threshold', 'amend_threshold', 'bind', 'production', 'product', 'advice', 'ranking', 'promote_']) {
        expect(decision).not.toContain(forbidden);
      }
    }
  });

  it('every result is marked experimental and not a production signal', () => {
    expect(ADDITIONAL_VALIDATION_RESULT_MARKING).toBe('experimental_2024_from_2021_2023_result_not_production_signal');
  });

  it('this run only ever points at the #136 refreshed mirror paths, never a prior mirror family path', () => {
    expect(Object.values(ADDITIONAL_VALIDATION_MIRROR_PATHS)).not.toEqual(expect.arrayContaining([...PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED]));
    for (const priorPath of PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED) {
      expect(Object.values(ADDITIONAL_VALIDATION_MIRROR_PATHS)).not.toContain(priorPath);
    }
  });

  it('module and script import nothing from production Forecast (no seasonalPprModel, server, routes, scoring, board, fusion, services)', () => {
    for (const rel of ['src/rehearsal/playerHistory2024From2021_2023AdditionalValidation.ts', 'scripts/runPlayerHistory2024From2021_2023AdditionalValidation.ts']) {
      const source = readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
      expect(importLines.length).toBeGreaterThan(0);
      for (const line of importLines) {
        expect(line).not.toMatch(/seasonalPprModel|\/server|\/routes|\/scoring|\/board|\/fusion|\/services/);
      }
    }
  });

  it('the module never imports the TIBER-Data-only #135/#136 raw-artifact-building functions (mirror-refresh module boundary respected)', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'src/rehearsal/playerHistory2024From2021_2023AdditionalValidation.ts'), 'utf-8');
    expect(source).not.toMatch(/buildPlayerHistory2024OutcomeMirror|buildPlayerHistory2021_2023InputMirror/);
  });
});

// ---------------------------------------------------------------------------------------------
// Committed report (the real #137 output) -- proves the #136 refreshed mirrors were used.
// ---------------------------------------------------------------------------------------------

describe('committed 2024-from-2021-2023 additional-validation report', () => {
  const REPORT_PATH = 'docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.json';
  const report = readRepoJson<{
    marking: string;
    inputs: {
      outcome_mirror: { path: string };
      input_mirror: { path: string };
      mirror_refresh_gate: { path: string; status: string; decision: string };
    };
    validation: {
      decision: string;
      preconditions: { integrity_passed: boolean; floors_passed: boolean };
      population: { evaluated_rows: number; joined_rows: number };
      metrics_by_arm: { joined_only: Record<string, ControlledRunMetrics> };
    };
  }>(REPORT_PATH);

  it('is marked experimental and not a production signal', () => {
    expect(report.marking).toBe(ADDITIONAL_VALIDATION_RESULT_MARKING);
  });

  it('consumed exactly the #136 refreshed mirror paths, not any prior mirror family', () => {
    expect(report.inputs.outcome_mirror.path).toBe(ADDITIONAL_VALIDATION_MIRROR_PATHS.outcome);
    expect(report.inputs.input_mirror.path).toBe(ADDITIONAL_VALIDATION_MIRROR_PATHS.input);
    for (const priorPath of PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED) {
      expect(report.inputs.outcome_mirror.path).not.toBe(priorPath);
      expect(report.inputs.input_mirror.path).not.toBe(priorPath);
    }
  });

  it('re-verified the #136 mirror-refresh gate passed with the required ceiling decision before running', () => {
    expect(report.inputs.mirror_refresh_gate.status).toBe('passed');
    expect(report.inputs.mirror_refresh_gate.decision).toBe(REQUIRED_MIRROR_REFRESH_DECISION);
  });

  it('preconditions passed (integrity and floors) against the real committed mirrors', () => {
    expect(report.validation.preconditions.integrity_passed).toBe(true);
    expect(report.validation.preconditions.floors_passed).toBe(true);
  });

  it('the real population/joined counts match the committed #136 mirrors (588 evaluated, 470 joined)', () => {
    expect(report.validation.population.evaluated_rows).toBe(588);
    expect(report.validation.population.joined_rows).toBe(470);
  });

  it('emits the ceiling decision and it is one of the three allowed #137 values', () => {
    expect(report.validation.decision).toBe('may_open_player_history_2024_from_2021_2023_threshold_review_issue');
    expect(PLAYER_HISTORY_2024_FROM_2021_2023_ADDITIONAL_VALIDATION_DECISIONS).toContain(report.validation.decision);
  });

  it('records defined joined-population metrics for every arm', () => {
    const joined = report.validation.metrics_by_arm.joined_only;
    for (const arm of ['baseline_only', 'real_player_history_features', 'shuffled_player_history_control']) {
      expect(joined[arm]!.mae).not.toBeNull();
      expect(joined[arm]!.rmse).not.toBeNull();
    }
  });
});
