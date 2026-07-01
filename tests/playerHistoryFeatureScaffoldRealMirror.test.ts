import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPlayerHistoryFeatures,
  summarizePlayerHistoryCoverage,
  type PlayerHistoryInputRow,
} from '../src/public/index.js';

const FIXTURE_DIR = path.resolve(process.cwd(), 'data/fixtures/tiberData');
const readJson = <T>(name: string): T => JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf-8')) as T;

interface InputWindowMirror {
  governed_source: { sha256: string };
  input_window: { seasons: number[]; target_season_excluded: number };
  rows: PlayerHistoryInputRow[];
}

const mirror = readJson<InputWindowMirror>('player_season_coverage_v0_2022_2024.input_mirror.json');

describe('player-history feature scaffold against the real mirrored 2022-2024 input window (#103)', () => {
  it('the mirror carries no 2025 (target season) rows at all', () => {
    expect(mirror.rows.every((row) => row.season < 2025)).toBe(true);
    expect(mirror.input_window.target_season_excluded).toBe(2025);
  });

  it('builds one feature row per real player, ordered deterministically by player_id', () => {
    const features = buildPlayerHistoryFeatures(mirror.rows, { targetSeason: 2025 });
    const playerIds = features.map((f) => f.player_id);
    expect(playerIds).toEqual([...playerIds].sort());
    expect(new Set(playerIds).size).toBe(4);
  });

  it('Aaron Rodgers (3 real prior seasons) gets a non-null trailing_3yr total that preserves his real 2023 zero', () => {
    const [rodgers] = buildPlayerHistoryFeatures(mirror.rows, { targetSeason: 2025 }).filter(
      (f) => f.player_id === '00-0023459',
    );
    expect(rodgers?.production?.season_ppr_by_season[2023]).toBe(0.0);
    expect(rodgers?.production?.trailing_3yr_ppr_total).toBeCloseTo(239.20000000000002 + 0.0 + 256.58, 6);
    expect(rodgers?.production?.trailing_2yr_ppr_total).toBeCloseTo(0.0 + 256.58, 6);
  });

  it('Colt McCoy (only 1 real prior season) gets null trailing aggregates, never a fabricated partial sum', () => {
    const [mccoy] = buildPlayerHistoryFeatures(mirror.rows, { targetSeason: 2025 }).filter(
      (f) => f.player_id === '00-0027688',
    );
    expect(mccoy?.production?.trailing_2yr_ppr_total).toBeNull();
    expect(mccoy?.production?.trailing_3yr_ppr_total).toBeNull();
    expect(mccoy?.production?.year_over_year_ppr_trend).toBeNull();
  });

  it('Brian Hoyer (undrafted, source_verified) gets undrafted_indicator=true without a fabricated career_year change', () => {
    const [hoyer] = buildPlayerHistoryFeatures(mirror.rows, { targetSeason: 2025 }).filter(
      (f) => f.player_id === '00-0026625',
    );
    expect(hoyer?.age_career?.draft_year).toBeNull();
    expect(hoyer?.age_career?.undrafted_indicator).toBe(true);
    expect(hoyer?.age_career?.rookie_year).toBe(2009);
  });

  it('Kenyan Drake preserves his real 2023 multi-team season with its primary_team_rule intact upstream', () => {
    const [drake] = buildPlayerHistoryFeatures(mirror.rows, { targetSeason: 2025 }).filter(
      (f) => f.player_id === '00-0033118',
    );
    expect(drake?.team_context?.multi_team_prior_season_indicator).toBe(true);
    expect(drake?.team_context?.multi_team_season_count).toBe(1);
    expect(drake?.team_context?.latest_primary_team).toBe('BAL');
  });

  it('no built feature row for any real player emits a snap_share/routes_run/red_zone by-season key', () => {
    const features = buildPlayerHistoryFeatures(mirror.rows, { targetSeason: 2025 });
    for (const feature of features) {
      const usageKeys = Object.keys(feature.usage ?? {});
      expect(usageKeys).not.toContain('snap_share_by_season');
      expect(usageKeys).not.toContain('routes_run_by_season');
      expect(usageKeys).not.toContain('route_participation_by_season');
      expect(usageKeys).not.toContain('red_zone_targets_by_season');
      expect(usageKeys).not.toContain('red_zone_carries_by_season');
    }
  });

  it('summarizePlayerHistoryCoverage over the real mirror reports 4 players and 0 rejected rows (no 2025 present to reject)', () => {
    const summary = summarizePlayerHistoryCoverage(mirror.rows, 2025);
    expect(summary.total_players).toBe(4);
    expect(summary.rows_rejected_for_leakage).toBe(0);
    expect(summary.rows_considered).toBe(mirror.rows.length);
    expect(summary.input_seasons_present).toEqual([2022, 2023, 2024]);
  });
});
