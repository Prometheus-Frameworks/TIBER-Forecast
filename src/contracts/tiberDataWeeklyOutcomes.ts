/**
 * Local mirror of the TIBER-Data weekly PPR-outcome and usage artifact shapes
 * (Issue #49 integration target).
 *
 * PPM does not import from, or pull live from, the TIBER-Data repo. This file
 * documents the upstream artifact row shapes that the seasonal loader
 * (`src/datasets/seasonal/loadSeasonalPprDataset.ts`) validates at runtime and
 * aggregates into the player-level seasonal backtest dataset.
 *
 * GOVERNANCE CAVEAT (do not skip): the canonical promoted artifacts are
 * currently documented by TIBER-Data as *scaffold-only fixture coverage*, not
 * full governed real-season coverage. They can prove the loader/contract/harness
 * works, but they CANNOT approve predictive loss for 2026 use. The loader keeps
 * the dataset non-governed (`fixture`) unless TIBER-Data supplies an explicit
 * governed marker — never by path-name inference.
 */
import type { ScoringPosition } from './scoring.js';

export const TIBER_DATA_WEEKLY_PPR_ARTIFACT_VERSION = 'player_weekly_ppr_outcomes_v1' as const;
export const TIBER_DATA_WEEKLY_USAGE_ARTIFACT_VERSION = 'player_weekly_usage_v1' as const;

/**
 * Documented TIBER-Data artifact paths. These are integration *targets* the
 * loader can be pointed at when the repo/artifact is mounted; PPM never resolves
 * or trusts them by path name alone.
 */
export const TIBER_DATA_ARTIFACT_PATHS = {
  pprPromoted: 'exports/promoted/nfl/player_weekly_ppr_outcomes_v1.json',
  pprSourceBacked: 'data/processed/evidence/player_weekly_ppr_outcomes_2025.source_backed.json',
  usagePromoted: 'exports/promoted/nfl/player_weekly_usage_v1.json',
  usageSourceBacked: 'data/processed/evidence/player_weekly_usage_2025.source_backed.json',
} as const;

/** Skill positions in scope (QB/RB/WR/TE). */
export const tiberDataWeeklyScoringPositions: readonly ScoringPosition[] = ['QB', 'RB', 'WR', 'TE'];

/**
 * One weekly PPR outcome row. Numeric stat fields are nullable upstream; per
 * TIBER-Data scoring semantics, null numerics are treated as zero when shaping
 * output. `ppr_points`, `player_id`, `season`, and `week` are load-bearing — a
 * row missing/invalid in any of those is dropped (and its player marked
 * unavailable if it leaves no usable outcome).
 */
export interface TiberDataWeeklyPprRow {
  season: number;
  week: number;
  player_id: string;
  player_name: string;
  team: string;
  position: string;
  opponent: string;
  receptions: number | null;
  targets: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
  rushing_attempts: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  interceptions: number | null;
  ppr_points: number | null;
  rolling_3_week_ppr: number | null;
  rolling_5_week_ppr: number | null;
  season_ppr: number | null;
  games_played: number | null;
  source: string;
  generated_at: string;
}

/** One weekly usage row (supplemental; not required to build the seasonal target). */
export interface TiberDataWeeklyUsageRow {
  season: number;
  week: number;
  player_id: string;
  player_name: string;
  team: string;
  position: string;
  opponent: string;
  targets: number | null;
  receptions: number | null;
  routes_run: number | null;
  route_participation: number | null;
  target_share: number | null;
  air_yards: number | null;
  air_yards_share: number | null;
  rushing_attempts: number | null;
  team_rushing_attempts: number | null;
  rush_share: number | null;
  red_zone_targets: number | null;
  red_zone_carries: number | null;
  snap_share: number | null;
  source: string;
  generated_at: string;
}

/**
 * PPM-side PPR scoring used only to cross-check / derive when needed. TIBER-Data
 * is the authority for `ppr_points`; this mirrors its documented formula
 * (receptions + receiving/rushing/passing yards and TDs, minus interceptions)
 * with null numerics treated as zero. Standard PPR weights.
 */
export const computePprPoints = (row: Pick<
  TiberDataWeeklyPprRow,
  | 'receptions'
  | 'receiving_yards'
  | 'receiving_tds'
  | 'rushing_yards'
  | 'rushing_tds'
  | 'passing_yards'
  | 'passing_tds'
  | 'interceptions'
>): number => {
  const z = (value: number | null): number => (value != null && Number.isFinite(value) ? value : 0);
  return (
    z(row.receptions) * 1 +
    z(row.receiving_yards) * 0.1 +
    z(row.receiving_tds) * 6 +
    z(row.rushing_yards) * 0.1 +
    z(row.rushing_tds) * 6 +
    z(row.passing_yards) * 0.04 +
    z(row.passing_tds) * 4 -
    z(row.interceptions) * 2
  );
};

/** Convert a nullable numeric source field to zero, per TIBER-Data shaping rule. */
export const nullableToZero = (value: number | null | undefined): number =>
  value != null && Number.isFinite(value) ? value : 0;
