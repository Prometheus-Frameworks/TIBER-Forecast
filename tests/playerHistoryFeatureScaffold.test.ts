import { describe, expect, it } from 'vitest';
import {
  ALL_PLAYER_HISTORY_FEATURE_FAMILIES,
  EXCLUDED_UNAVAILABLE_USAGE_FIELDS,
  assertNoForbiddenAvailabilityFields,
  assertPlayerHistoryScopeInBounds,
  buildPlayerHistoryFeatures,
  computePlayerHistoryTrainFoldMeans,
  filterPlayerHistoryInputRows,
  imputePlayerHistoryValue,
  summarizePlayerHistoryCoverage,
  type PlayerHistoryInputRow,
} from '../src/public/index.js';

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

const row = (overrides: Partial<PlayerHistoryInputRow> & { season: number }): PlayerHistoryInputRow => ({
  player_id: 'p1',
  player_name: 'Test Player',
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

describe('filterPlayerHistoryInputRows (structural leakage guard)', () => {
  it('rejects a 2025 row for targetSeason=2025', () => {
    const rows = [row({ season: 2024 }), row({ season: 2025 })];
    const filtered = filterPlayerHistoryInputRows(rows, 2025);
    expect(filtered.map((r) => r.season)).toEqual([2024]);
  });

  it('rejects any season >= targetSeason, not just an exact match', () => {
    const rows = [row({ season: 2024 }), row({ season: 2025 }), row({ season: 2026 })];
    const filtered = filterPlayerHistoryInputRows(rows, 2025);
    expect(filtered.map((r) => r.season)).toEqual([2024]);
  });

  it('accepts 2022-2024 rows for a 2025 target', () => {
    const rows = [row({ season: 2022 }), row({ season: 2023 }), row({ season: 2024 })];
    const filtered = filterPlayerHistoryInputRows(rows, 2025);
    expect(filtered.map((r) => r.season)).toEqual([2022, 2023, 2024]);
  });

  it('does not rely on caller discipline: buildPlayerHistoryFeatures applies the same filter internally', () => {
    const rows = [row({ season: 2024 }), row({ season: 2025, production_summary: { season_ppr: 999, season_ppg: 99, games_for_ppg: 10 } })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.input_seasons_considered).toEqual([2024]);
    expect(feature!.production!.season_ppr_by_season[2025]).toBeUndefined();
  });
});

describe('missing-season / null handling (never zero-filled, never fabricated)', () => {
  it('a missing prior season produces a null trend/trailing feature, not zero', () => {
    // Only 2024 present; 2023 missing entirely.
    const rows = [row({ season: 2024, production_summary: { season_ppr: 150, season_ppg: 15, games_for_ppg: 10 } })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.production!.year_over_year_ppr_trend).toBeNull();
    expect(feature!.production!.trailing_2yr_ppr_total).toBeNull();
    expect(feature!.production!.trailing_3yr_ppr_total).toBeNull();
  });

  it('a real season_ppr of 0 is preserved as 0, not conflated with a missing season', () => {
    const rows = [
      row({ season: 2023, production_summary: { season_ppr: 0, season_ppg: 0, games_for_ppg: 1 } }),
      row({ season: 2024, production_summary: { season_ppr: 150, season_ppg: 15, games_for_ppg: 10 } }),
    ];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.production!.season_ppr_by_season[2023]).toBe(0);
    expect(feature!.production!.trailing_2yr_ppr_total).toBe(150); // 150 + 0, both present
    expect(feature!.production!.year_over_year_ppr_trend).toBe(150); // 150 - 0
  });

  it('trailing 3yr total requires all 3 consecutive seasons present', () => {
    const rows = [
      row({ season: 2022, production_summary: { season_ppr: 50, season_ppg: 5, games_for_ppg: 10 } }),
      row({ season: 2024, production_summary: { season_ppr: 150, season_ppg: 15, games_for_ppg: 10 } }),
      // 2023 missing -> not consecutive
    ];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.production!.trailing_3yr_ppr_total).toBeNull();
    expect(feature!.production!.trailing_2yr_ppr_total).toBeNull(); // 2023 missing too
  });

  it('trailing windows are anchored to the target season, not to the player\'s last-observed season: a missing immediate pre-target season nulls the window rather than substituting older seasons', () => {
    // Player observed in 2022 and 2023 only; 2024 (the immediate pre-target season for a 2025 target) is
    // missing entirely. The trailing-2yr window must be [2024, 2023], not silently fall back to [2023, 2022].
    const rows = [
      row({ season: 2022, production_summary: { season_ppr: 1.48, season_ppg: 1.48, games_for_ppg: 1 } }),
      row({ season: 2023, production_summary: { season_ppr: 4.94, season_ppg: 2.47, games_for_ppg: 2 } }),
    ];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.production!.trailing_2yr_ppr_total).toBeNull();
    expect(feature!.production!.trailing_3yr_ppr_total).toBeNull();
    expect(feature!.production!.year_over_year_ppr_trend).toBeNull();
    // The by-season maps still record the real, present data -- only the target-anchored aggregates null.
    expect(feature!.production!.season_ppr_by_season[2022]).toBe(1.48);
    expect(feature!.production!.season_ppr_by_season[2023]).toBe(4.94);
  });
});

describe('usage history: unavailable fields stay excluded/null, source-backed fields pass through', () => {
  it('excludes snap_share/routes_run/route_participation/red_zone_* from the feature payload', () => {
    const rows = [row({ season: 2024 })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.usage!.unavailable_fields_excluded).toEqual(EXCLUDED_UNAVAILABLE_USAGE_FIELDS);
    expect(Object.keys(feature!.usage!)).not.toContain('snap_share_by_season');
  });

  it('targets/receptions/rushing_attempts pass through only when source-backed (present in the row)', () => {
    const rows = [
      row({ season: 2024, usage_summary: { ...baseUsage(), targets: 80, receptions: 55, rushing_attempts: 3 } }),
    ];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.usage!.targets_by_season[2024]).toBe(80);
    expect(feature!.usage!.receptions_by_season[2024]).toBe(55);
    expect(feature!.usage!.rushing_attempts_by_season[2024]).toBe(3);
  });

  it('a null usage field (not source-backed for that row) stays null, never coerced to 0', () => {
    const rows = [row({ season: 2024, usage_summary: { ...baseUsage(), targets: null } })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.usage!.targets_by_season[2024]).toBeNull();
  });
});

describe('age/career fabrication guards', () => {
  it('does not fabricate season_age when birth_date is null', () => {
    const rows = [row({ season: 2024, birth_date: null, season_age: null })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.age_career!.latest_pre_target_season_age).toBeNull();
  });

  it('does not fabricate career_year when rookie_year is null', () => {
    const rows = [row({ season: 2024, rookie_year: null, career_year: null })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.age_career!.latest_pre_target_career_year).toBeNull();
  });

  it('forces season_age null even if a malformed row carries a non-null season_age alongside a null birth_date', () => {
    const rows = [row({ season: 2024, birth_date: null, season_age: 26.5 })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.age_career!.latest_pre_target_season_age).toBeNull();
  });

  it('forces career_year null even if a malformed row carries a non-null career_year alongside a null rookie_year', () => {
    const rows = [row({ season: 2024, rookie_year: null, career_year: 4 })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.age_career!.latest_pre_target_career_year).toBeNull();
  });

  it('undrafted_indicator is true only for a source-verified identity with a null draft_year', () => {
    const rows = [row({ season: 2024, identity_confidence: 'source_verified', draft_year: null })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.age_career!.undrafted_indicator).toBe(true);
  });

  it('undrafted_indicator is null (unknown) when identity is not source-verified, never asserted either way', () => {
    const rows = [row({ season: 2024, identity_confidence: 'provisional', draft_year: null })];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.age_career!.undrafted_indicator).toBeNull();
  });
});

describe('team-context boundary (team-of-record only, not roster membership/active status)', () => {
  it('flags a multi-team prior season and counts it, without asserting anything about availability', () => {
    const rows = [
      row({ season: 2023, teams: ['NO', 'SEA'], primary_team: 'NO', primary_team_rule: 'most weeks observed' }),
      row({ season: 2024, teams: ['SEA'], primary_team: 'SEA' }),
    ];
    const [feature] = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(feature!.team_context!.multi_team_prior_season_indicator).toBe(true);
    expect(feature!.team_context!.multi_team_season_count).toBe(1);
    expect(feature!.team_context!.latest_primary_team).toBe('SEA');
    // Only team-of-record fields are present; no active/roster-status keys ever appear.
    expect(Object.keys(feature!.team_context!)).toEqual([
      'multi_team_prior_season_indicator',
      'multi_team_season_count',
      'latest_primary_team',
    ]);
  });
});

describe('feature families are independently toggleable for a later ablation arm', () => {
  it('defaults to all families when options.families is omitted', () => {
    const [feature] = buildPlayerHistoryFeatures([row({ season: 2024 })], { targetSeason: 2025 });
    for (const family of ALL_PLAYER_HISTORY_FEATURE_FAMILIES) {
      expect(feature).toHaveProperty(family);
    }
  });

  it('emits only the requested families and omits the rest', () => {
    const [feature] = buildPlayerHistoryFeatures([row({ season: 2024 })], {
      targetSeason: 2025,
      families: ['production'],
    });
    expect(feature!.production).toBeDefined();
    expect(feature!.coverage).toBeUndefined();
    expect(feature!.usage).toBeUndefined();
    expect(feature!.age_career).toBeUndefined();
    expect(feature!.team_context).toBeUndefined();
  });

  it('can build a single-family ablation for each family independently', () => {
    for (const family of ALL_PLAYER_HISTORY_FEATURE_FAMILIES) {
      const [feature] = buildPlayerHistoryFeatures([row({ season: 2024 })], { targetSeason: 2025, families: [family] });
      expect(feature).toHaveProperty(family);
      const otherFamilies = ALL_PLAYER_HISTORY_FEATURE_FAMILIES.filter((f) => f !== family);
      for (const other of otherFamilies) expect(feature![other]).toBeUndefined();
    }
  });
});

describe('determinism', () => {
  it('produces byte-identical output across repeated calls on the same input', () => {
    const rows = [
      row({ player_id: 'p2', season: 2022 }),
      row({ player_id: 'p1', season: 2023 }),
      row({ player_id: 'p2', season: 2024 }),
      row({ player_id: 'p1', season: 2024 }),
    ];
    const a = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    const b = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('orders output rows deterministically by player_id regardless of input order', () => {
    const rows = [row({ player_id: 'zeta', season: 2024 }), row({ player_id: 'alpha', season: 2024 })];
    const result = buildPlayerHistoryFeatures(rows, { targetSeason: 2025 });
    expect(result.map((r) => r.player_id)).toEqual(['alpha', 'zeta']);
  });
});

describe('forbidden availability/status fields fail closed', () => {
  it('throws if any input row carries active_status', () => {
    const rows = [{ ...row({ season: 2024 }), active_status: 'active' }];
    expect(() => buildPlayerHistoryFeatures(rows, { targetSeason: 2025 })).toThrow(/forbidden availability/);
  });

  it('throws if any input row carries ownership_status', () => {
    const rows = [{ ...row({ season: 2024 }), ownership_status: 'active_roster' }];
    expect(() => assertNoForbiddenAvailabilityFields(rows)).toThrow(/ownership_status/);
  });

  it('never emits a forbidden key on any built feature row', () => {
    const [feature] = buildPlayerHistoryFeatures([row({ season: 2024 })], { targetSeason: 2025 });
    const serialized = JSON.stringify(feature).toLowerCase();
    for (const forbidden of ['active_status', 'ownership_status', 'roster_status', 'active_roster_status']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('experiment scope enforcement (REG season_type, QB/RB/WR/TE positions only, fails closed)', () => {
  it('throws if any input row has a non-REG season_type (e.g. POST)', () => {
    const rows = [row({ season: 2024, season_type: 'POST' })];
    expect(() => buildPlayerHistoryFeatures(rows, { targetSeason: 2025 })).toThrow(/season_type/);
    expect(() => assertPlayerHistoryScopeInBounds(rows)).toThrow(/outside the approved experiment scope/);
  });

  it('throws if any input row has an out-of-scope position (e.g. K or DST)', () => {
    const rows = [row({ season: 2024, position: 'K' })];
    expect(() => buildPlayerHistoryFeatures(rows, { targetSeason: 2025 })).toThrow(/position/);
    expect(() => assertPlayerHistoryScopeInBounds(rows)).toThrow(/outside the approved experiment scope/);
  });

  it('summarizePlayerHistoryCoverage also fails closed on an out-of-scope row', () => {
    const rows = [row({ season: 2024, season_type: 'POST' })];
    expect(() => summarizePlayerHistoryCoverage(rows, 2025)).toThrow(/season_type/);
  });

  it('accepts every approved position (QB, RB, WR, TE) without throwing', () => {
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      const rows = [row({ season: 2024, position })];
      expect(() => buildPlayerHistoryFeatures(rows, { targetSeason: 2025 })).not.toThrow();
    }
  });
});

describe('no fantasy advice / ranking / product output', () => {
  it('emits no fantasy/advice/ranking/product keys anywhere in a built feature row', () => {
    const [feature] = buildPlayerHistoryFeatures([row({ season: 2024 })], { targetSeason: 2025 });
    const collectKeys = (value: unknown, acc: string[] = []): string[] => {
      if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, acc));
      else if (value !== null && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          acc.push(key);
          collectKeys(nested, acc);
        }
      }
      return acc;
    };
    const keys = collectKeys(feature).map((key) => key.toLowerCase());
    for (const forbidden of ['ranking', 'startsit', 'start_sit', 'advice', 'trade', 'draft_advice', 'product_recommendation', 'prediction']) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });
});

describe('summarizePlayerHistoryCoverage', () => {
  it('reports rejected leakage rows and per-player observed-season-count distribution', () => {
    const rows = [
      row({ player_id: 'p1', season: 2022 }),
      row({ player_id: 'p1', season: 2023 }),
      row({ player_id: 'p1', season: 2024 }),
      row({ player_id: 'p2', season: 2024 }),
      row({ player_id: 'p1', season: 2025 }), // leakage row, must be rejected
    ];
    const summary = summarizePlayerHistoryCoverage(rows, 2025);
    expect(summary.rows_rejected_for_leakage).toBe(1);
    expect(summary.rows_considered).toBe(4);
    expect(summary.input_seasons_present).toEqual([2022, 2023, 2024]);
    expect(summary.total_players).toBe(2);
    expect(summary.players_by_seasons_observed_count).toEqual({ 1: 1, 3: 1 });
  });
});

describe('train-fold mean imputation helper (pure primitives; no model is trained here)', () => {
  it('computes the mean over non-null training values only', () => {
    const trainRows = [
      { player_id: 'a', values: { x: 10 } },
      { player_id: 'b', values: { x: 20 } },
      { player_id: 'c', values: { x: null } },
    ];
    const means = computePlayerHistoryTrainFoldMeans(trainRows, ['x']);
    expect(means.x).toBe(15);
  });

  it('falls back to a documented ridge-neutral 0 when a column is fully null across the training fold', () => {
    const trainRows = [{ player_id: 'a', values: { x: null } }, { player_id: 'b', values: { x: null } }];
    const means = computePlayerHistoryTrainFoldMeans(trainRows, ['x']);
    expect(means.x).toBe(0);
  });

  it('imputes a missing value to the fold mean and passes through a real value unchanged', () => {
    const means = { x: 15 };
    expect(imputePlayerHistoryValue({ player_id: 'held_out', values: { x: null } }, 'x', means)).toBe(15);
    expect(imputePlayerHistoryValue({ player_id: 'held_out', values: { x: 42 } }, 'x', means)).toBe(42);
  });

  it('never uses the held-out row itself to compute the fold mean (no leakage)', () => {
    // Simulate LOOCV: mean must be computed from train rows only, excluding the held-out row's value.
    const allRows = [
      { player_id: 'held_out', values: { x: 1000 } }, // an extreme outlier if it leaked into the mean
      { player_id: 'a', values: { x: 10 } },
      { player_id: 'b', values: { x: 20 } },
    ];
    const trainRows = allRows.filter((r) => r.player_id !== 'held_out');
    const means = computePlayerHistoryTrainFoldMeans(trainRows, ['x']);
    expect(means.x).toBe(15); // not influenced by the held-out row's 1000
  });
});
