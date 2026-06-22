import { describe, expect, it } from 'vitest';
import {
  buildScaffoldWeeklyPprRows,
  loadSeasonalPprDatasetFromWeeklyOutcomes,
  parseTiberDataWeeklyPprArtifact,
  seasonalPprSeedSnapshot,
  tiberDataWeeklyPprScaffoldRows,
} from '../src/public/index.js';
import type { SeasonalPprDatasetDescriptor, TiberDataWeeklyPprRow } from '../src/public/index.js';

type LoadResult =
  | { ok: true; data: SeasonalPprDatasetDescriptor; warnings: Array<{ code: string }> }
  | { ok: false; errors: Array<{ code: string }> };

const baseRow = (overrides: Partial<TiberDataWeeklyPprRow> = {}): TiberDataWeeklyPprRow => ({
  season: 2024,
  week: 1,
  player_id: 'p1',
  player_name: 'Player One',
  team: 'AAA',
  position: 'WR',
  opponent: 'BBB',
  receptions: 5,
  targets: 8,
  receiving_yards: 60,
  receiving_tds: 0,
  rushing_attempts: 0,
  rushing_yards: 0,
  rushing_tds: 0,
  passing_yards: 0,
  passing_tds: 0,
  interceptions: 0,
  ppr_points: 11,
  rolling_3_week_ppr: null,
  rolling_5_week_ppr: null,
  season_ppr: null,
  games_played: 1,
  source: 'tiber-data:test',
  generated_at: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const ok = (result: LoadResult): SeasonalPprDatasetDescriptor => {
  if (!result.ok) {
    throw new Error(`Expected ok, got: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
};

describe('loadSeasonalPprDatasetFromWeeklyOutcomes', () => {
  it('aggregates the bundled scaffold and recovers seed season totals exactly', () => {
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(tiberDataWeeklyPprScaffoldRows, {
      datasetVersion: 'test',
    });
    const dataset = ok(result);

    expect(dataset.observations).toHaveLength(seasonalPprSeedSnapshot.length);

    const lamar = dataset.observations.find((row) => row.player_id === '00-0034796');
    expect(lamar?.ppr_2024).toBeCloseTo(434.4, 4);
    expect(lamar?.ppr_2025_actual).toBeCloseTo(392.1, 4);
    expect(lamar?.games_2024).toBe(17);

    const chase = dataset.observations.find((row) => row.player_id === '00-0036322');
    expect(chase?.targets_2024).toBe(175);
    expect(chase?.ppr_2024).toBeCloseTo(403.1, 4);
  });

  it('marks players with no target-season rows as unavailable (null actual)', () => {
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(tiberDataWeeklyPprScaffoldRows, {});
    const dataset = ok(result);
    const mhj = dataset.observations.find((row) => row.player_id === '00-0039999');
    expect(mhj).toBeDefined();
    expect(mhj?.ppr_2025_actual).toBeNull();
  });

  it('uses final season_ppr when present, else sums weekly ppr_points', () => {
    // Case A: season_ppr present on the final week -> use it (even if != sum).
    const withSeasonPpr = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ season: 2024, week: 1, ppr_points: 10, season_ppr: 10 }),
        baseRow({ season: 2024, week: 2, ppr_points: 10, season_ppr: 99 }),
        baseRow({ season: 2025, week: 1, ppr_points: 12, season_ppr: 12 }),
      ],
      {},
    );
    const dsA = ok(withSeasonPpr);
    expect(dsA.observations[0].ppr_2024).toBeCloseTo(99, 4); // final season_ppr, not the sum (20)

    // Case B: no season_ppr anywhere -> fall back to sum of weekly ppr_points.
    const withoutSeasonPpr = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ season: 2024, week: 1, ppr_points: 10, season_ppr: null }),
        baseRow({ season: 2024, week: 2, ppr_points: 15, season_ppr: null }),
        baseRow({ season: 2025, week: 1, ppr_points: 12, season_ppr: null }),
      ],
      {},
    );
    const dsB = ok(withoutSeasonPpr);
    expect(dsB.observations[0].ppr_2024).toBeCloseTo(25, 4);
  });

  it('fails closed on conflicting rows for the same season/week/player_id', () => {
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ week: 1, ppr_points: 11 }),
        baseRow({ week: 1, ppr_points: 22 }), // conflict
      ],
      {},
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe('SEASONAL_PPR_CONFLICTING_ROWS');
    }
  });

  it('collapses identical duplicate rows with a warning', () => {
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ season: 2024, week: 1 }),
        baseRow({ season: 2024, week: 1 }), // identical duplicate
        baseRow({ season: 2025, week: 1 }),
      ],
      {},
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.some((w) => w.code === 'SEASONAL_PPR_COLLAPSED_DUPLICATE_ROWS')).toBe(true);
    }
  });

  it('drops rows with missing/invalid key fields and non-skill positions', () => {
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ season: 2024, week: 1 }),
        baseRow({ season: 2025, week: 1 }),
        baseRow({ season: 2024, week: 2, player_id: '' }), // invalid id
        baseRow({ season: 2024, week: 2.5 }), // non-int week
        baseRow({ season: 2024, week: 3, ppr_points: null }), // invalid ppr
        baseRow({ season: 2024, week: 4, position: 'K' }), // non-skill
      ],
      {},
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const codes = result.warnings.map((w) => w.code);
      expect(codes).toContain('SEASONAL_PPR_DROPPED_INVALID_ROWS');
      expect(codes).toContain('SEASONAL_PPR_DROPPED_NON_SKILL_ROWS');
    }
  });

  it('coerces null numeric components to zero', () => {
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ season: 2024, week: 1, targets: null, receptions: null, rushing_attempts: null, ppr_points: 10 }),
        baseRow({ season: 2025, week: 1, ppr_points: 10 }),
      ],
      {},
    );
    const ds = ok(result);
    expect(ds.observations[0].targets_2024).toBe(0);
    expect(ds.observations[0].receptions_2024).toBe(0);
    expect(ds.observations[0].rush_attempts_2024).toBe(0);
  });

  it('uses the input-season position (no target-season leakage) when a player changes position', () => {
    // Player is RB in 2024 (input) and WR in 2025 (target). The model-facing
    // position must reflect 2024 only, since position feeds the model/baseline.
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ player_id: 'switch', season: 2024, week: 1, position: 'RB', ppr_points: 10 }),
        baseRow({ player_id: 'switch', season: 2025, week: 1, position: 'WR', ppr_points: 12 }),
      ],
      {},
    );
    const ds = ok(result);
    const obs = ds.observations.find((row) => row.player_id === 'switch');
    expect(obs?.position).toBe('RB');
  });

  it('skips players that have only a target season (no input features)', () => {
    const result = loadSeasonalPprDatasetFromWeeklyOutcomes(
      [
        baseRow({ player_id: 'rookie', season: 2025, week: 1, ppr_points: 12 }),
        baseRow({ player_id: 'vet', season: 2024, week: 1, ppr_points: 10 }),
        baseRow({ player_id: 'vet', season: 2025, week: 1, ppr_points: 12 }),
      ],
      {},
    );
    const ds = ok(result);
    expect(ds.observations.map((row) => row.player_id)).toEqual(['vet']);
    if (result.ok) {
      expect(result.warnings.some((w) => w.code === 'SEASONAL_PPR_SKIPPED_NO_INPUT_SEASON')).toBe(true);
    }
  });

  it('stays fixture by default and only goes governed on an explicit marker', () => {
    const rows = [baseRow({ season: 2024, week: 1 }), baseRow({ season: 2025, week: 1 })];

    const def = ok(loadSeasonalPprDatasetFromWeeklyOutcomes(rows, {}));
    expect(def.governance_status).toBe('fixture');

    // governed claim without explicit_marker source must be downgraded.
    const weak = ok(
      loadSeasonalPprDatasetFromWeeklyOutcomes(rows, {
        // @ts-expect-error intentionally wrong source to prove fail-closed
        governanceMarker: { status: 'governed', source: 'path_inference' },
      }),
    );
    expect(weak.governance_status).toBe('fixture');

    const governed = ok(
      loadSeasonalPprDatasetFromWeeklyOutcomes(rows, {
        governanceMarker: { status: 'governed', source: 'explicit_marker' },
      }),
    );
    expect(governed.governance_status).toBe('governed');
  });

  it('records data_source orthogonally to governance (mounted artifact stays fixture without a marker)', () => {
    const rows = [baseRow({ season: 2024, week: 1 }), baseRow({ season: 2025, week: 1 })];

    // Default provenance is mounted-artifact (the loader's documented job), and a
    // mounted artifact is STILL fixture until an explicit governed marker arrives.
    const def = ok(loadSeasonalPprDatasetFromWeeklyOutcomes(rows, {}));
    expect(def.data_source).toBe('mounted-artifact');
    expect(def.governance_status).toBe('fixture');

    // An explicit governed marker does not change the data source.
    const governed = ok(
      loadSeasonalPprDatasetFromWeeklyOutcomes(rows, {
        governanceMarker: { status: 'governed', source: 'explicit_marker' },
      }),
    );
    expect(governed.data_source).toBe('mounted-artifact');
    expect(governed.governance_status).toBe('governed');

    // Callers can declare the bundled-scaffold provenance explicitly.
    const scaffold = ok(loadSeasonalPprDatasetFromWeeklyOutcomes(rows, { dataSource: 'bundled-scaffold' }));
    expect(scaffold.data_source).toBe('bundled-scaffold');
    expect(scaffold.governance_status).toBe('fixture');
  });

  it('regenerating the scaffold is deterministic', () => {
    expect(JSON.stringify(buildScaffoldWeeklyPprRows())).toBe(JSON.stringify(tiberDataWeeklyPprScaffoldRows));
  });
});

describe('parseTiberDataWeeklyPprArtifact', () => {
  it('accepts a top-level array', () => {
    const parsed = parseTiberDataWeeklyPprArtifact([baseRow()]);
    expect(parsed.ok).toBe(true);
  });

  it('accepts an object envelope with a rows array', () => {
    const parsed = parseTiberDataWeeklyPprArtifact({ rows: [baseRow()] });
    expect(parsed.ok).toBe(true);
  });

  it('fails on a non-array / non-enveloped payload', () => {
    const parsed = parseTiberDataWeeklyPprArtifact({ nope: true });
    expect(parsed.ok).toBe(false);
  });

  it('fails when rows are not objects', () => {
    const parsed = parseTiberDataWeeklyPprArtifact([1, 2, 3]);
    expect(parsed.ok).toBe(false);
  });
});
