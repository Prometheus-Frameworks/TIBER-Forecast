/**
 * Scaffold TIBER-Data weekly PPR artifact (Issue #49).
 *
 * Synthesizes weekly rows in the documented `player_weekly_ppr_outcomes_v1`
 * shape from the curated season seed (`seasonalPprSeedSnapshot.ts`), so the
 * loader and backtest harness can run end-to-end without live TIBER-Data access.
 *
 * This is SCAFFOLD-ONLY FIXTURE COVERAGE — a synthetic weekly distribution of
 * approximate season snapshots. It proves the loader/contract/harness works; it
 * is NOT governed data and must NOT be used to approve predictive loss for 2026.
 *
 * The distribution is constructed so the loader recovers each player's season
 * totals exactly:
 *  - the final (max-week) row's `season_ppr` equals the seed season PPR;
 *  - weekly `receptions`/`targets`/`rushing_attempts` sum to the seed totals;
 *  - `games_played` weeks are emitted (no synthetic missing weeks).
 */
import type { SeasonalPlayerObservation } from '../../../contracts/seasonalPprBacktest.js';
import type { TiberDataWeeklyPprRow } from '../../../contracts/tiberDataWeeklyOutcomes.js';
import { seasonalPprSeedSnapshot } from './seasonalPprSeedSnapshot.js';

const SCAFFOLD_SOURCE = 'tiber-data:scaffold-fixture';
const SCAFFOLD_GENERATED_AT = '2026-06-01T00:00:00.000Z';
const INPUT_SEASON = 2024;
const TARGET_SEASON = 2025;
const ASSUMED_2025_GAMES = 17;

const roundTo = (value: number, decimals: number): number => Number(value.toFixed(decimals));

/** Split a non-negative integer total into `weeks` parts that sum exactly to total. */
const distributeInteger = (total: number, weeks: number): number[] => {
  if (weeks <= 0) {
    return [];
  }
  const base = Math.floor(total / weeks);
  const remainder = total - base * weeks;
  return Array.from({ length: weeks }, (_, index) => base + (index < remainder ? 1 : 0));
};

/** Split a float total into `weeks` parts that sum exactly to total (last absorbs drift). */
const distributeFloat = (total: number, weeks: number): number[] => {
  if (weeks <= 0) {
    return [];
  }
  const per = roundTo(total / weeks, 1);
  const parts = Array.from({ length: weeks }, () => per);
  const prefixSum = per * (weeks - 1);
  parts[weeks - 1] = roundTo(total - prefixSum, 4);
  return parts;
};

const buildSeasonRows = (
  seed: SeasonalPlayerObservation,
  season: number,
  weeks: number,
  seasonTotal: number,
  receptions: number,
  targets: number,
  rushAttempts: number,
): TiberDataWeeklyPprRow[] => {
  const pprWeekly = distributeFloat(seasonTotal, weeks);
  const recWeekly = distributeInteger(receptions, weeks);
  const tgtWeekly = distributeInteger(targets, weeks);
  const rushWeekly = distributeInteger(rushAttempts, weeks);

  let cumulative = 0;
  return Array.from({ length: weeks }, (_, index) => {
    const week = index + 1;
    cumulative = roundTo(cumulative + pprWeekly[index], 4);
    // Pin the final cumulative value exactly to the season total so the loader's
    // "final season_ppr" rule recovers it without float drift.
    const seasonPpr = index === weeks - 1 ? roundTo(seasonTotal, 4) : cumulative;
    return {
      season,
      week,
      player_id: seed.player_id,
      player_name: seed.player_name,
      team: seed.team_2024,
      position: seed.position,
      opponent: 'UNK',
      receptions: recWeekly[index],
      targets: tgtWeekly[index],
      receiving_yards: null,
      receiving_tds: null,
      rushing_attempts: rushWeekly[index],
      rushing_yards: null,
      rushing_tds: null,
      passing_yards: null,
      passing_tds: null,
      interceptions: null,
      ppr_points: pprWeekly[index],
      rolling_3_week_ppr: null,
      rolling_5_week_ppr: null,
      season_ppr: seasonPpr,
      games_played: week,
      source: SCAFFOLD_SOURCE,
      generated_at: SCAFFOLD_GENERATED_AT,
    } satisfies TiberDataWeeklyPprRow;
  });
};

export const buildScaffoldWeeklyPprRows = (
  seeds: SeasonalPlayerObservation[] = seasonalPprSeedSnapshot,
): TiberDataWeeklyPprRow[] =>
  seeds.flatMap((seed) => {
    const rows: TiberDataWeeklyPprRow[] = [
      // 2024 input-season weekly rows (carry the usage features the model reads).
      ...buildSeasonRows(
        seed,
        INPUT_SEASON,
        seed.games_2024,
        seed.ppr_2024,
        seed.receptions_2024,
        seed.targets_2024,
        seed.rush_attempts_2024,
      ),
    ];

    // 2025 target-season weekly rows only when the outcome is available. A null
    // actual emits no 2025 rows, which the loader surfaces as `unavailable`.
    if (seed.ppr_2025_actual != null) {
      rows.push(
        ...buildSeasonRows(seed, TARGET_SEASON, ASSUMED_2025_GAMES, seed.ppr_2025_actual, 0, 0, 0),
      );
    }

    return rows;
  });

/** Bundled scaffold weekly PPR rows for the default backtest run. */
export const tiberDataWeeklyPprScaffoldRows: TiberDataWeeklyPprRow[] = buildScaffoldWeeklyPprRows();
