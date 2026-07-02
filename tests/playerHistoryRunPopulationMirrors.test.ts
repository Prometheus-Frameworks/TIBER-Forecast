import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SOURCE_ARTIFACT_STATUS,
  PINNED_SOURCE_ARTIFACT_SHA256,
  RUN_POPULATION_INPUT_SEASONS,
  RUN_POPULATION_TARGET_SEASON,
  assertPinnedSourceArtifactSha256,
  buildPlayerHistoryExperimentDryRunMatrix,
  buildPlayerHistoryOutcomeMirror,
  buildPlayerHistoryRunPopulationInputMirror,
  type PlayerHistoryOutcomeMirror,
  type PlayerHistoryRunPopulationInputMirror,
  type SourceCoverageArtifact,
  type SourceCoverageRecord,
} from '../src/public/index.js';

const usage = () => ({
  targets: 10,
  receptions: 8,
  rushing_attempts: null,
  receiving_air_yards: 120,
  target_share: 0.2,
  air_yards_share: 0.15,
  wopr: 0.4,
  racr: null,
  snap_share: null,
  routes_run: null,
  route_participation: null,
  red_zone_targets: null,
  red_zone_carries: null,
});

const record = (overrides: Partial<SourceCoverageRecord> & { player_id: string; season: number }): SourceCoverageRecord => ({
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
  usage_summary: usage(),
  birth_date: '1998-01-01',
  season_age: 26.5,
  draft_year: 2020,
  rookie_year: 2020,
  career_year: 4,
  ...overrides,
});

const artifact = (records: SourceCoverageRecord[]): SourceCoverageArtifact => ({
  artifact_id: 'player_season_coverage_v0',
  status: EXPECTED_SOURCE_ARTIFACT_STATUS,
  seasons: [2022, 2023, 2024, 2025],
  season_type_scope: ['REG'],
  included_positions: ['QB', 'RB', 'WR', 'TE'],
  row_grain: 'player_id + season + season_type',
  records,
});

describe('sha256 pin (fail-closed)', () => {
  it('accepts the pinned sha and rejects any other', () => {
    expect(() => assertPinnedSourceArtifactSha256(PINNED_SOURCE_ARTIFACT_SHA256)).not.toThrow();
    expect(() => assertPinnedSourceArtifactSha256('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toThrow(
      /sha256 mismatch/,
    );
  });
});

describe('outcome mirror builder', () => {
  it('contains 2025 REG rows only, one per player, sorted by player_id', () => {
    const mirror = buildPlayerHistoryOutcomeMirror(
      artifact([
        record({ player_id: 'z9', season: 2025, production_summary: { season_ppr: 50, season_ppg: 5, games_for_ppg: 10 } }),
        record({ player_id: 'a1', season: 2025 }),
        record({ player_id: 'a1', season: 2024 }),
        record({ player_id: 'a1', season: 2022 }),
      ]),
    );
    expect(mirror.rows.map((r) => r.player_id)).toEqual(['a1', 'z9']);
    expect(mirror.rows.every((r) => r.season === RUN_POPULATION_TARGET_SEASON && r.season_type === 'REG')).toBe(true);
  });

  it('carries the outcome + identity + row-level provenance, and NO input-feature payloads', () => {
    const mirror = buildPlayerHistoryOutcomeMirror(artifact([record({ player_id: 'a1', season: 2025 })]));
    const row = mirror.rows[0]!;
    expect(row.season_ppr).toBe(100);
    expect(row.source_refs.length).toBeGreaterThan(0);
    expect(row.identity_confidence).toBe('source_verified');
    const keys = Object.keys(row);
    for (const forbidden of ['usage_summary', 'production_summary', 'weeks_observed', 'coverage_status', 'teams', 'birth_date']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('preserves a null outcome as null, never zero', () => {
    const mirror = buildPlayerHistoryOutcomeMirror(
      artifact([record({ player_id: 'a1', season: 2025, production_summary: { season_ppr: null, season_ppg: null, games_for_ppg: null } })]),
    );
    expect(mirror.rows[0]!.season_ppr).toBeNull();
  });

  it('surfaces candidate/not-promoted status and the outcome-layer-only boundary', () => {
    const mirror = buildPlayerHistoryOutcomeMirror(artifact([record({ player_id: 'a1', season: 2025 })]));
    expect(mirror.governed_source.artifactStatus).toBe(EXPECTED_SOURCE_ARTIFACT_STATUS);
    expect(mirror.governed_source.sha256).toBe(PINNED_SOURCE_ARTIFACT_SHA256);
    expect(mirror.boundary.outcome_layer_only).toBe(true);
    expect(mirror.boundary.building_this_mirror_promotes_nothing).toBe(true);
  });

  it('fails closed on a forbidden availability field', () => {
    const bad = { ...record({ player_id: 'a1', season: 2025 }), active_status: 'active' };
    expect(() => buildPlayerHistoryOutcomeMirror(artifact([bad]))).toThrow(/forbidden availability/);
  });

  it('fails closed on duplicate player_id + season + season_type grain', () => {
    const rows = [record({ player_id: 'a1', season: 2025 }), record({ player_id: 'a1', season: 2025 })];
    expect(() => buildPlayerHistoryOutcomeMirror(artifact(rows))).toThrow(/duplicate outcome grain/);
  });

  it('excludes non-REG and out-of-scope-position 2025 rows from the population', () => {
    const mirror = buildPlayerHistoryOutcomeMirror(
      artifact([
        record({ player_id: 'a1', season: 2025 }),
        record({ player_id: 'post', season: 2025, season_type: 'POST' }),
        record({ player_id: 'kicker', season: 2025, position: 'K' }),
      ]),
    );
    expect(mirror.rows.map((r) => r.player_id)).toEqual(['a1']);
  });
});

describe('input mirror builder', () => {
  const sourceRecords = [
    record({ player_id: 'a1', season: 2025 }),
    record({ player_id: 'a1', season: 2024 }),
    record({ player_id: 'a1', season: 2022, production_summary: { season_ppr: 0, season_ppg: 0, games_for_ppg: 1 } }),
    record({ player_id: 'rookie', season: 2025 }),
    record({ player_id: 'not_in_population', season: 2023 }),
  ];
  const outcome = () => buildPlayerHistoryOutcomeMirror(artifact(sourceRecords));
  const input = () => buildPlayerHistoryRunPopulationInputMirror(artifact(sourceRecords), outcome());

  it('contains 2022-2024 rows only -- no 2025 row and no 2025 outcome value', () => {
    const mirror = input();
    expect(mirror.rows.every((r) => RUN_POPULATION_INPUT_SEASONS.includes(r.season))).toBe(true);
    expect(mirror.rows.some((r) => r.season === 2025)).toBe(false);
    expect(mirror.boundary.contains_no_target_season_rows).toBe(true);
    expect(mirror.boundary.contains_no_2025_outcome_values).toBe(true);
  });

  it('contains only players from the outcome mirror', () => {
    const mirror = input();
    const populationIds = new Set(outcome().rows.map((r) => r.player_id));
    expect(mirror.rows.every((r) => populationIds.has(r.player_id))).toBe(true);
    expect(mirror.rows.some((r) => r.player_id === 'not_in_population')).toBe(false);
  });

  it('documents outcome players with no input rows as no-history players, not failures', () => {
    const mirror = input();
    expect(mirror.counts.outcome_players_without_history).toBe(1);
    expect(mirror.no_history_players[0]).toMatchObject({
      player_id: 'rookie',
      note: 'no_2022_2024_source_rows_documented_absence_not_a_mirror_failure',
    });
  });

  it('preserves nulls and real zeros verbatim (no zero coercion, no null-zero conflation)', () => {
    const mirror = input();
    const row2022 = mirror.rows.find((r) => r.season === 2022)!;
    expect(row2022.production_summary.season_ppr).toBe(0); // real zero stays zero
    expect(row2022.usage_summary.rushing_attempts).toBeNull(); // real null stays null
    expect(row2022.usage_summary.snap_share).toBeNull(); // unavailable field stays null
  });

  it('preserves source_refs and identity_confidence on every row', () => {
    const mirror = input();
    for (const row of mirror.rows) {
      expect(row.source_refs.length).toBeGreaterThan(0);
      expect(row.identity_confidence).toBe('source_verified');
    }
  });

  it('fails closed on a forbidden availability field in an input record', () => {
    const bad = [...sourceRecords, { ...record({ player_id: 'a1', season: 2023 }), roster_status: 'active' }];
    expect(() => buildPlayerHistoryRunPopulationInputMirror(artifact(bad), buildPlayerHistoryOutcomeMirror(artifact(bad)))).toThrow(
      /forbidden availability/,
    );
  });
});

describe('the COMMITTED generated mirrors (real data)', () => {
  const FIXTURE_DIR = path.resolve(process.cwd(), 'data/fixtures/tiberData');
  const outcomeMirror = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, 'player_season_coverage_v0_2025.outcome_mirror.json'), 'utf-8'),
  ) as PlayerHistoryOutcomeMirror;
  const inputMirror = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, 'player_season_coverage_v0_2022_2024.real_population_input_mirror.json'), 'utf-8'),
  ) as PlayerHistoryRunPopulationInputMirror;

  it('outcome mirror: 610 players, 2025 REG only, pinned sha, candidate status', () => {
    expect(outcomeMirror.counts.rows).toBe(610);
    expect(outcomeMirror.rows.every((r) => r.season === 2025 && r.season_type === 'REG')).toBe(true);
    expect(outcomeMirror.governed_source.sha256).toBe(PINNED_SOURCE_ARTIFACT_SHA256);
    expect(outcomeMirror.governed_source.artifactStatus).toBe(EXPECTED_SOURCE_ARTIFACT_STATUS);
  });

  it('input mirror: 1145 rows, 2022-2024 only, players subset of the outcome population, 125 no-history players', () => {
    expect(inputMirror.counts.rows).toBe(1145);
    expect(inputMirror.rows.every((r) => [2022, 2023, 2024].includes(r.season))).toBe(true);
    const populationIds = new Set(outcomeMirror.rows.map((r) => r.player_id));
    expect(inputMirror.rows.every((r) => populationIds.has(r.player_id))).toBe(true);
    expect(inputMirror.counts.outcome_players_without_history).toBe(125);
    expect(inputMirror.no_history_players.length).toBe(125);
  });

  it('no 2025 outcome value and no forbidden field appears anywhere in the input mirror rows', () => {
    for (const row of inputMirror.rows) {
      expect(row.season).toBeLessThan(2025);
      for (const forbidden of ['active_status', 'ownership_status', 'roster_status', 'active_roster_status']) {
        expect(Object.prototype.hasOwnProperty.call(row, forbidden)).toBe(false);
      }
    }
  });

  describe('regenerated dry-run matrix against the committed real mirrors', () => {
    const buildRealMatrix = () =>
      buildPlayerHistoryExperimentDryRunMatrix({
        targetPopulation: outcomeMirror.rows.map((r) => ({
          player_id: r.player_id,
          player_name: r.player_name,
          position: r.position,
          ppr_2025_actual: r.season_ppr,
        })),
        playerHistoryRows: inputMirror.rows,
        targetSeason: 2025,
        inputSeasons: inputMirror.input_window.seasons,
        baselineSource: {
          path: 'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json',
          governance_status: `${outcomeMirror.governed_source.artifactStatus}_outcome_layer_only`,
          data_source: 'generated-mirror-from-pinned-tiber-data-artifact',
        },
        playerHistorySourceRefs: ['data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json'],
      });

    it('computes joined counts and per-position counts deterministically (two builds, byte-identical)', () => {
      const a = buildRealMatrix();
      const b = buildRealMatrix();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.join_summary.joined_rows).toBe(485);
      const joinedByPosition: Record<string, number> = {};
      for (const row of a.matrix_rows) {
        if (row.real_player_history !== null) joinedByPosition[row.position] = (joinedByPosition[row.position] ?? 0) + 1;
      }
      expect(joinedByPosition).toEqual({ QB: 66, RB: 115, WR: 189, TE: 115 });
    });

    it('marks every real-population matrix row not model-ready and omits every outcome value', () => {
      const matrix = buildRealMatrix();
      expect(matrix.matrix_rows.length).toBe(610);
      const numericOutcomes = new Set(
        outcomeMirror.rows.filter((r) => typeof r.season_ppr === 'number' && r.season_ppr > 0).map((r) => String(r.season_ppr)),
      );
      const serializedRows = JSON.stringify(matrix.matrix_rows.slice(0, 25));
      // Spot-check: the first 25 rows' serialization contains none of their own players' outcome values.
      for (const row of matrix.matrix_rows.slice(0, 25)) {
        const outcome = outcomeMirror.rows.find((r) => r.player_id === row.player_id)?.season_ppr;
        if (typeof outcome === 'number' && outcome > 0 && numericOutcomes.has(String(outcome))) {
          expect(serializedRows.includes(`"season_ppr":${outcome},"source_refs"`)).toBe(false);
        }
        expect(row.status).toBe('dry_run_only_not_model_ready');
        expect(row.target_row_ref.outcome_value_deliberately_omitted).toBe(true);
      }
    });

    it('shuffled-control groups are all derangement-feasible at real-population sizes and no metric is computed', () => {
      const matrix = buildRealMatrix();
      for (const group of matrix.shuffled_control.groups) {
        expect(group.feature_bearing_row_count).toBeGreaterThanOrEqual(66);
        expect(group.derangement_possible).toBe(true);
        expect(group.derangement_applied).toBe(true);
      }
      expect(matrix.shuffled_control.metrics_computed).toBe(false);
    });
  });
});
