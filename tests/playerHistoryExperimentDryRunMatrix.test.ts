import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PLAYER_HISTORY_DRY_RUN_MATRIX_VERSION,
  PLAYER_HISTORY_DRY_RUN_ROW_KIND,
  PLAYER_HISTORY_DRY_RUN_SHUFFLE_SEED,
  PLAYER_HISTORY_EXPERIMENT_ARMS,
  buildPlayerHistoryExperimentDryRunMatrix,
  type BuildPlayerHistoryDryRunMatrixInput,
  type PlayerHistoryInputRow,
} from '../src/public/index.js';
import type { SeasonalPlayerObservation } from '../src/contracts/seasonalPprBacktest.js';
import { seasonalPprSeedSnapshot } from '../src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.js';

const baseUsage = () => ({
  targets: null,
  receptions: null,
  rushing_attempts: null,
  receiving_air_yards: null,
  target_share: null,
  air_yards_share: null,
  wopr: null,
  racr: null,
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
  weeks_observed: 10,
  coverage_status: 'partial_season',
  missing_fields: ['games_missed'],
  production_summary: { season_ppr: 100, season_ppg: 10, games_for_ppg: 10 },
  usage_summary: baseUsage(),
  birth_date: '1998-01-01',
  season_age: 26.5,
  draft_year: 2020,
  rookie_year: 2020,
  career_year: 4,
  ...overrides,
});

const targetRow = (overrides: Partial<SeasonalPlayerObservation> & { player_id: string }): SeasonalPlayerObservation => ({
  player_name: `Player ${overrides.player_id}`,
  position: 'WR',
  team_2024: 'PHI',
  games_2024: 17,
  ppr_2024: 200,
  receptions_2024: 80,
  targets_2024: 110,
  rush_attempts_2024: 5,
  ppr_2025_actual: 210,
  ...overrides,
});

const BASELINE_SOURCE = {
  path: 'src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts',
  governance_status: 'fixture',
  data_source: 'bundled-scaffold',
};

const build = (partial: Partial<BuildPlayerHistoryDryRunMatrixInput>) =>
  buildPlayerHistoryExperimentDryRunMatrix({
    targetPopulation: [],
    playerHistoryRows: [],
    targetSeason: 2025,
    inputSeasons: [2022, 2023, 2024],
    baselineSource: BASELINE_SOURCE,
    playerHistorySourceRefs: ['data/fixtures/tiberData/player_season_coverage_v0_2022_2024.input_mirror.json'],
    ...partial,
  });

describe('dry-run matrix inherits the #104 fail-closed boundaries end to end', () => {
  it('a 2025 player-history row cannot enter the matrix features (leakage filter applies)', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' })],
      playerHistoryRows: [
        historyRow({ player_id: 'p1', season: 2024, production_summary: { season_ppr: 150, season_ppg: 15, games_for_ppg: 10 } }),
        historyRow({ player_id: 'p1', season: 2025, production_summary: { season_ppr: 999, season_ppg: 99, games_for_ppg: 10 } }),
      ],
    });
    const [row] = report.matrix_rows;
    expect(row!.real_player_history!.input_seasons_considered).toEqual([2024]);
    expect(JSON.stringify(row!.real_player_history)).not.toContain('999');
  });

  it('a 2021 row fails closed when the input window is 2022-2024', () => {
    expect(() =>
      build({
        targetPopulation: [targetRow({ player_id: 'p1' })],
        playerHistoryRows: [historyRow({ player_id: 'p1', season: 2021 })],
      }),
    ).toThrow(/outside the approved input window/);
  });

  it('a non-REG player-history row fails closed', () => {
    expect(() =>
      build({
        targetPopulation: [targetRow({ player_id: 'p1' })],
        playerHistoryRows: [historyRow({ player_id: 'p1', season: 2024, season_type: 'POST' })],
      }),
    ).toThrow(/season_type/);
  });

  it('an out-of-scope position fails closed', () => {
    expect(() =>
      build({
        targetPopulation: [targetRow({ player_id: 'p1' })],
        playerHistoryRows: [historyRow({ player_id: 'p1', season: 2024, position: 'K' })],
      }),
    ).toThrow(/position/);
  });

  it('a forbidden availability/ownership field fails closed', () => {
    expect(() =>
      build({
        targetPopulation: [targetRow({ player_id: 'p1' })],
        playerHistoryRows: [{ ...historyRow({ player_id: 'p1', season: 2024 }), active_status: 'active' }],
      }),
    ).toThrow(/forbidden availability/);
  });
});

describe('join, exclusion, and family-availability behavior', () => {
  it('joins features to a matching target row and flags every built family available', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' })],
      playerHistoryRows: [historyRow({ player_id: 'p1', season: 2024 })],
    });
    const [row] = report.matrix_rows;
    expect(row!.real_feature_join_status).toBe('joined');
    expect(Object.values(row!.feature_family_availability).every((flag) => flag === true)).toBe(true);
    expect(report.join_summary.joined_rows).toBe(1);
  });

  it('keeps a target row with no features in the matrix, with all family flags false', () => {
    const report = build({ targetPopulation: [targetRow({ player_id: 'p1' })], playerHistoryRows: [] });
    const [row] = report.matrix_rows;
    expect(row!.real_feature_join_status).toBe('no_player_history_features_for_player');
    expect(row!.real_player_history).toBeNull();
    expect(Object.values(row!.feature_family_availability).every((flag) => flag === false)).toBe(true);
  });

  it('excludes a feature-only player (no target row) with an explicit reason', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' })],
      playerHistoryRows: [historyRow({ player_id: 'orphan', season: 2024 })],
    });
    const exclusion = report.join_summary.exclusions.find((e) => e.player_id === 'orphan');
    expect(exclusion?.reason).toBe('player_history_features_without_target_row');
    expect(report.matrix_rows.some((row) => row.player_id === 'orphan')).toBe(false);
  });

  it('excludes a position-mismatched feature payload instead of joining it under the target position', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'switcher', position: 'RB' })],
      playerHistoryRows: [historyRow({ player_id: 'switcher', season: 2024, position: 'WR' })],
    });
    const [row] = report.matrix_rows;
    expect(row!.real_feature_join_status).toBe('position_mismatch_features_excluded');
    expect(row!.real_player_history).toBeNull();
    expect(Object.values(row!.feature_family_availability).every((flag) => flag === false)).toBe(true);
    const exclusion = report.join_summary.exclusions.find(
      (e) => e.reason === 'position_mismatch_between_target_and_player_history',
    );
    expect(exclusion?.player_id).toBe('switcher');
    expect(exclusion?.detail).toContain('position=RB');
    expect(exclusion?.detail).toContain('position=WR');
    expect(report.join_summary.joined_rows).toBe(0);
  });

  it('a position-mismatched payload can never become a shuffled-control donor in the target-position group', () => {
    const report = build({
      targetPopulation: [
        targetRow({ player_id: 'rb1', position: 'RB' }),
        targetRow({ player_id: 'rb2', position: 'RB' }),
        targetRow({ player_id: 'switcher', position: 'RB' }),
      ],
      playerHistoryRows: [
        historyRow({ player_id: 'rb1', season: 2024, position: 'RB' }),
        historyRow({ player_id: 'rb2', season: 2024, position: 'RB' }),
        historyRow({ player_id: 'switcher', season: 2024, position: 'WR' }),
      ],
    });
    const rbGroup = report.shuffled_control.groups.find((g) => g.position === 'RB');
    expect(rbGroup?.feature_bearing_row_count).toBe(2); // switcher's WR payload is not feature-bearing here
    for (const row of report.matrix_rows) {
      expect(row.shuffled_control.donor_player_id).not.toBe('switcher');
      if (row.shuffled_control.payload !== null) expect(row.shuffled_control.payload.position).toBe(row.position);
    }
  });

  it('excludes a target row whose outcome is unavailable, with an explicit reason', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' }), targetRow({ player_id: 'p2', ppr_2025_actual: null })],
      playerHistoryRows: [],
    });
    expect(report.matrix_rows.map((row) => row.player_id)).toEqual(['p1']);
    const exclusion = report.join_summary.exclusions.find((e) => e.player_id === 'p2');
    expect(exclusion?.reason).toBe('target_outcome_unavailable');
    expect(report.join_summary.unavailable_target_rows).toBe(1);
  });
});

describe('null and zero semantics in matrix payloads', () => {
  it('real nulls remain null and are counted, never coerced to zero', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' })],
      playerHistoryRows: [historyRow({ player_id: 'p1', season: 2024, usage_summary: { ...baseUsage(), targets: null } })],
    });
    const [row] = report.matrix_rows;
    expect(row!.real_player_history!.usage!.targets_by_season[2024]).toBeNull();
    expect(report.missingness.null_counts_by_feature_path['usage.targets_by_season.2024']).toBe(1);
  });

  it('a real zero stays zero and is reported as an observed zero, not as missing', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' })],
      playerHistoryRows: [
        historyRow({ player_id: 'p1', season: 2024, production_summary: { season_ppr: 0, season_ppg: 0, games_for_ppg: 1 } }),
      ],
    });
    const [row] = report.matrix_rows;
    expect(row!.real_player_history!.production!.season_ppr_by_season[2024]).toBe(0);
    expect(report.missingness.zero_value_paths_observed).toContain('production.season_ppr_by_season.2024');
    expect(report.missingness.null_counts_by_feature_path['production.season_ppr_by_season.2024']).toBeUndefined();
  });
});

describe('dry-run marking and metric absence', () => {
  it('marks every matrix row and the report itself as dry-run-only / not model-ready', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' })],
      playerHistoryRows: [historyRow({ player_id: 'p1', season: 2024 })],
    });
    expect(report.status).toBe('dry_run_only_not_model_ready');
    for (const row of report.matrix_rows) {
      expect(row.row_kind).toBe(PLAYER_HISTORY_DRY_RUN_ROW_KIND);
      expect(row.status).toBe('dry_run_only_not_model_ready');
    }
  });

  it('never copies the target outcome value into a matrix row', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1', ppr_2025_actual: 321.77 })],
      playerHistoryRows: [],
    });
    expect(JSON.stringify(report.matrix_rows)).not.toContain('321.77');
    expect(report.matrix_rows[0]!.target_row_ref.outcome_value_deliberately_omitted).toBe(true);
  });

  it('emits no metric keys (mae/rmse/pearson/rank_correlation) anywhere in the report', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'p1' })],
      playerHistoryRows: [historyRow({ player_id: 'p1', season: 2024 })],
    });
    const keys: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          keys.push(key);
          collect(nested);
        }
      }
    };
    collect(report);
    for (const metric of ['mae', 'rmse', 'pearson', 'rank_correlation', 'absolute_error', 'predicted_ppr']) {
      expect(keys).not.toContain(metric);
    }
    expect(report.shuffled_control.metrics_computed).toBe(false);
    expect(report.boundary_statements.no_mae_rmse_pearson_rank_correlation_computed).toBe(true);
  });

  it('declares the three future arms without evaluating any of them', () => {
    const report = build({ targetPopulation: [targetRow({ player_id: 'p1' })], playerHistoryRows: [] });
    expect(report.arms).toEqual(PLAYER_HISTORY_EXPERIMENT_ARMS);
    expect(report.arms).toEqual(['baseline_only', 'real_player_history_features', 'shuffled_player_history_control']);
  });
});

describe('shuffled-control shape: position-stratified, deterministic, honest about small groups', () => {
  const threeQbsTwoWrs = (): { targets: SeasonalPlayerObservation[]; history: PlayerHistoryInputRow[] } => ({
    targets: [
      targetRow({ player_id: 'qb1', position: 'QB' }),
      targetRow({ player_id: 'qb2', position: 'QB' }),
      targetRow({ player_id: 'qb3', position: 'QB' }),
      targetRow({ player_id: 'wr1', position: 'WR' }),
      targetRow({ player_id: 'wr2', position: 'WR' }),
    ],
    history: [
      historyRow({ player_id: 'qb1', season: 2024, position: 'QB' }),
      historyRow({ player_id: 'qb2', season: 2024, position: 'QB' }),
      historyRow({ player_id: 'qb3', season: 2024, position: 'QB' }),
      historyRow({ player_id: 'wr1', season: 2024, position: 'WR' }),
      historyRow({ player_id: 'wr2', season: 2024, position: 'WR' }),
    ],
  });

  it('assigns donors strictly within position and never self-assigns when a derangement is possible', () => {
    const { targets, history } = threeQbsTwoWrs();
    const report = build({ targetPopulation: targets, playerHistoryRows: history });
    const byId = new Map(report.matrix_rows.map((row) => [row.player_id, row]));
    for (const row of report.matrix_rows) {
      expect(row.shuffled_control.posture).toBe('assigned');
      expect(row.shuffled_control.donor_player_id).not.toBe(row.player_id);
      const donor = byId.get(row.shuffled_control.donor_player_id!)!;
      expect(donor.position).toBe(row.position);
    }
    for (const group of report.shuffled_control.groups) {
      expect(group.derangement_possible).toBe(true);
      expect(group.derangement_applied).toBe(true);
    }
  });

  it('reports a single-row position group as derangement-impossible instead of self-assigning', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'te1', position: 'TE' })],
      playerHistoryRows: [historyRow({ player_id: 'te1', season: 2024, position: 'TE' })],
    });
    const [row] = report.matrix_rows;
    expect(row!.shuffled_control.posture).toBe('identity_unavoidable_single_row_group');
    expect(row!.shuffled_control.donor_player_id).toBeNull();
    const group = report.shuffled_control.groups.find((g) => g.position === 'TE');
    expect(group?.derangement_possible).toBe(false);
    expect(group?.feature_bearing_row_count).toBe(1);
  });

  it('is deterministic: same inputs and seed produce a byte-identical report', () => {
    const { targets, history } = threeQbsTwoWrs();
    const a = build({ targetPopulation: targets, playerHistoryRows: history, shuffleSeed: 7 });
    const b = build({ targetPopulation: targets, playerHistoryRows: history, shuffleSeed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.shuffled_control.seed).toBe(7);
  });

  it('uses the documented default seed when none is supplied', () => {
    const report = build({ targetPopulation: [targetRow({ player_id: 'p1' })], playerHistoryRows: [] });
    expect(report.shuffled_control.seed).toBe(PLAYER_HISTORY_DRY_RUN_SHUFFLE_SEED);
    expect(report.shuffled_control.stratified_by_position).toBe(true);
  });

  it('orders matrix rows deterministically by player_id regardless of input order', () => {
    const report = build({
      targetPopulation: [targetRow({ player_id: 'zzz' }), targetRow({ player_id: 'aaa' })],
      playerHistoryRows: [],
    });
    expect(report.matrix_rows.map((row) => row.player_id)).toEqual(['aaa', 'zzz']);
  });
});

describe('against the REAL baseline population and REAL #104 mirror', () => {
  interface InputWindowMirror {
    input_window: { seasons: number[] };
    rows: PlayerHistoryInputRow[];
  }
  const mirror = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.input_mirror.json'), 'utf-8'),
  ) as InputWindowMirror;

  it('assembles honestly: 38 scored rows, zero joins (the compact mirror and fixture population share no player), 4 feature-only exclusions', () => {
    const report = build({
      targetPopulation: seasonalPprSeedSnapshot,
      playerHistoryRows: mirror.rows,
      inputSeasons: mirror.input_window.seasons,
    });
    expect(report.matrix_rows.length).toBe(38);
    expect(report.join_summary.unavailable_target_rows).toBe(1);
    expect(report.join_summary.joined_rows).toBe(0);
    expect(report.join_summary.feature_players_without_target_row).toBe(4);
    expect(report.join_summary.target_rows_without_player_history_features).toBe(38);
  });

  it('warns that the target population is still the fixture scaffold', () => {
    const report = build({
      targetPopulation: seasonalPprSeedSnapshot,
      playerHistoryRows: mirror.rows,
      inputSeasons: mirror.input_window.seasons,
    });
    expect(report.baseline_population_is_fixture_scaffold_warning).toMatch(/fixture/);
    expect(report.version).toBe(PLAYER_HISTORY_DRY_RUN_MATRIX_VERSION);
  });
});
