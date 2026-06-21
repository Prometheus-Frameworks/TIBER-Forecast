/**
 * Curated TIBER-Data mirror of the seasonal PPR backtest dataset (Issue #49).
 *
 * Each observation pairs 2024-season input features with the known 2025
 * full-season PPR outcome. The 2025 actual PPR layer is the outcome being
 * predicted and is sourced from TIBER-Data.
 *
 * PROVENANCE / GOVERNANCE (read this before trusting any number):
 *  - PPM does not import from, or pull live from, the TIBER-Data repo (see
 *    `docs/tiber-data-fixture-adapter-decision.md`). This file is a curated,
 *    versioned *mirror snapshot* of TIBER-Data's seasonal skill-position PPR
 *    table, hand-assembled for the backtest harness. The values are an
 *    approximate historical snapshot, not a live governed pull.
 *  - Accordingly the dataset governance status is `fixture`, never `governed`.
 *    It must never masquerade as governed to a downstream promotion gate. The
 *    point of Issue #49 is to prove the backtest/report/artifact loop, not to
 *    certify these specific totals.
 *  - One row intentionally carries a `null` 2025 actual to exercise the
 *    fail-closed path (the row is marked `unavailable`, not scored).
 *
 * Skill positions only (QB/RB/WR/TE), per repo scope.
 */
import type {
  SeasonalPlayerObservation,
  SeasonalPprDatasetDescriptor,
} from '../../contracts/seasonalPprBacktest.js';

const observations: SeasonalPlayerObservation[] = [
  // ----- Quarterbacks -----
  { player_id: '00-0034796', player_name: 'Lamar Jackson', position: 'QB', team_2024: 'BAL', games_2024: 17, ppr_2024: 434.4, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 139, ppr_2025_actual: 392.1 },
  { player_id: '00-0036971', player_name: 'Jalen Hurts', position: 'QB', team_2024: 'PHI', games_2024: 15, ppr_2024: 332.7, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 150, ppr_2025_actual: 348.5 },
  { player_id: '00-0036389', player_name: 'Joe Burrow', position: 'QB', team_2024: 'CIN', games_2024: 17, ppr_2024: 381.8, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 42, ppr_2025_actual: 305.2 },
  { player_id: '00-0037834', player_name: 'Josh Allen', position: 'QB', team_2024: 'BUF', games_2024: 17, ppr_2024: 386.0, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 102, ppr_2025_actual: 379.6 },
  { player_id: '00-0039163', player_name: 'Jayden Daniels', position: 'QB', team_2024: 'WAS', games_2024: 17, ppr_2024: 372.5, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 148, ppr_2025_actual: 318.7 },
  { player_id: '00-0034857', player_name: 'Baker Mayfield', position: 'QB', team_2024: 'TB', games_2024: 17, ppr_2024: 358.9, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 56, ppr_2025_actual: 330.4 },
  { player_id: '00-0033873', player_name: 'Patrick Mahomes', position: 'QB', team_2024: 'KC', games_2024: 16, ppr_2024: 312.6, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 58, ppr_2025_actual: 336.9 },
  { player_id: '00-0036442', player_name: 'Jordan Love', position: 'QB', team_2024: 'GB', games_2024: 15, ppr_2024: 286.4, receptions_2024: 0, targets_2024: 0, rush_attempts_2024: 36, ppr_2025_actual: 271.0 },

  // ----- Running backs -----
  { player_id: '00-0038542', player_name: 'Saquon Barkley', position: 'RB', team_2024: 'PHI', games_2024: 16, ppr_2024: 363.3, receptions_2024: 33, targets_2024: 43, rush_attempts_2024: 345, ppr_2025_actual: 268.4 },
  { player_id: '00-0037539', player_name: 'Jahmyr Gibbs', position: 'RB', team_2024: 'DET', games_2024: 17, ppr_2024: 327.4, receptions_2024: 52, targets_2024: 63, rush_attempts_2024: 250, ppr_2025_actual: 312.8 },
  { player_id: '00-0036223', player_name: 'Bijan Robinson', position: 'RB', team_2024: 'ATL', games_2024: 17, ppr_2024: 312.0, receptions_2024: 61, targets_2024: 72, rush_attempts_2024: 304, ppr_2025_actual: 333.6 },
  { player_id: '00-0034844', player_name: 'Derrick Henry', position: 'RB', team_2024: 'BAL', games_2024: 17, ppr_2024: 318.2, receptions_2024: 19, targets_2024: 23, rush_attempts_2024: 325, ppr_2025_actual: 244.5 },
  { player_id: '00-0035700', player_name: 'Josh Jacobs', position: 'RB', team_2024: 'GB', games_2024: 17, ppr_2024: 276.1, receptions_2024: 36, targets_2024: 43, rush_attempts_2024: 301, ppr_2025_actual: 258.9 },
  { player_id: '00-0036924', player_name: 'Kyren Williams', position: 'RB', team_2024: 'LAR', games_2024: 16, ppr_2024: 264.5, receptions_2024: 34, targets_2024: 41, rush_attempts_2024: 316, ppr_2025_actual: 231.7 },
  { player_id: '00-0038120', player_name: 'De\'Von Achane', position: 'RB', team_2024: 'MIA', games_2024: 17, ppr_2024: 281.6, receptions_2024: 78, targets_2024: 87, rush_attempts_2024: 203, ppr_2025_actual: 296.2 },
  { player_id: '00-0035685', player_name: 'Chase Brown', position: 'RB', team_2024: 'CIN', games_2024: 16, ppr_2024: 245.0, receptions_2024: 54, targets_2024: 65, rush_attempts_2024: 229, ppr_2025_actual: 226.3 },
  { player_id: '00-0038977', player_name: 'Bucky Irving', position: 'RB', team_2024: 'TB', games_2024: 17, ppr_2024: 241.8, receptions_2024: 47, targets_2024: 53, rush_attempts_2024: 207, ppr_2025_actual: 252.1 },
  { player_id: '00-0034791', player_name: 'Christian McCaffrey', position: 'RB', team_2024: 'SF', games_2024: 4, ppr_2024: 70.5, receptions_2024: 15, targets_2024: 19, rush_attempts_2024: 50, ppr_2025_actual: 289.4 },

  // ----- Wide receivers -----
  { player_id: '00-0036322', player_name: 'Ja\'Marr Chase', position: 'WR', team_2024: 'CIN', games_2024: 17, ppr_2024: 403.1, receptions_2024: 127, targets_2024: 175, rush_attempts_2024: 0, ppr_2025_actual: 358.0 },
  { player_id: '00-0036262', player_name: 'Justin Jefferson', position: 'WR', team_2024: 'MIN', games_2024: 17, ppr_2024: 343.2, receptions_2024: 103, targets_2024: 154, rush_attempts_2024: 0, ppr_2025_actual: 336.7 },
  { player_id: '00-0037240', player_name: 'Amon-Ra St. Brown', position: 'WR', team_2024: 'DET', games_2024: 17, ppr_2024: 348.7, receptions_2024: 115, targets_2024: 141, rush_attempts_2024: 0, ppr_2025_actual: 322.4 },
  { player_id: '00-0039337', player_name: 'Brian Thomas Jr.', position: 'WR', team_2024: 'JAX', games_2024: 17, ppr_2024: 308.7, receptions_2024: 87, targets_2024: 133, rush_attempts_2024: 0, ppr_2025_actual: 241.9 },
  { player_id: '00-0036963', player_name: 'Nico Collins', position: 'WR', team_2024: 'HOU', games_2024: 12, ppr_2024: 226.9, receptions_2024: 68, targets_2024: 92, rush_attempts_2024: 0, ppr_2025_actual: 281.5 },
  { player_id: '00-0033921', player_name: 'Mike Evans', position: 'WR', team_2024: 'TB', games_2024: 14, ppr_2024: 240.5, receptions_2024: 74, targets_2024: 109, rush_attempts_2024: 0, ppr_2025_actual: 213.8 },
  { player_id: '00-0035659', player_name: 'A.J. Brown', position: 'WR', team_2024: 'PHI', games_2024: 13, ppr_2024: 224.4, receptions_2024: 67, targets_2024: 98, rush_attempts_2024: 0, ppr_2025_actual: 248.6 },
  { player_id: '00-0037247', player_name: 'Terry McLaurin', position: 'WR', team_2024: 'WAS', games_2024: 17, ppr_2024: 270.8, receptions_2024: 82, targets_2024: 117, rush_attempts_2024: 0, ppr_2025_actual: 198.3 },
  { player_id: '00-0038543', player_name: 'Puka Nacua', position: 'WR', team_2024: 'LAR', games_2024: 11, ppr_2024: 211.0, receptions_2024: 79, targets_2024: 106, rush_attempts_2024: 8, ppr_2025_actual: 314.7 },
  { player_id: '00-0039910', player_name: 'Malik Nabers', position: 'WR', team_2024: 'NYG', games_2024: 15, ppr_2024: 287.9, receptions_2024: 109, targets_2024: 170, rush_attempts_2024: 0, ppr_2025_actual: 169.4 },
  { player_id: '00-0033040', player_name: 'Tyreek Hill', position: 'WR', team_2024: 'MIA', games_2024: 17, ppr_2024: 233.9, receptions_2024: 81, targets_2024: 123, rush_attempts_2024: 0, ppr_2025_actual: 156.2 },
  { player_id: '00-0034348', player_name: 'CeeDee Lamb', position: 'WR', team_2024: 'DAL', games_2024: 15, ppr_2024: 287.1, receptions_2024: 101, targets_2024: 152, rush_attempts_2024: 0, ppr_2025_actual: 263.3 },
  { player_id: '00-0039051', player_name: 'Jaxon Smith-Njigba', position: 'WR', team_2024: 'SEA', games_2024: 17, ppr_2024: 254.6, receptions_2024: 100, targets_2024: 137, rush_attempts_2024: 0, ppr_2025_actual: 312.9 },
  { player_id: '00-0036902', player_name: 'Garrett Wilson', position: 'WR', team_2024: 'NYJ', games_2024: 17, ppr_2024: 250.1, receptions_2024: 101, targets_2024: 154, rush_attempts_2024: 0, ppr_2025_actual: 244.0 },

  // ----- Tight ends -----
  { player_id: '00-0036971-te', player_name: 'Brock Bowers', position: 'TE', team_2024: 'LV', games_2024: 17, ppr_2024: 280.5, receptions_2024: 112, targets_2024: 153, rush_attempts_2024: 0, ppr_2025_actual: 233.1 },
  { player_id: '00-0033857', player_name: 'George Kittle', position: 'TE', team_2024: 'SF', games_2024: 15, ppr_2024: 222.6, receptions_2024: 78, targets_2024: 98, rush_attempts_2024: 0, ppr_2025_actual: 196.4 },
  { player_id: '00-0035229', player_name: 'Trey McBride', position: 'TE', team_2024: 'ARI', games_2024: 16, ppr_2024: 251.1, receptions_2024: 111, targets_2024: 147, rush_attempts_2024: 0, ppr_2025_actual: 241.8 },
  { player_id: '00-0030506', player_name: 'Travis Kelce', position: 'TE', team_2024: 'KC', games_2024: 16, ppr_2024: 210.7, receptions_2024: 97, targets_2024: 133, rush_attempts_2024: 0, ppr_2025_actual: 162.5 },
  { player_id: '00-0037744', player_name: 'Sam LaPorta', position: 'TE', team_2024: 'DET', games_2024: 16, ppr_2024: 178.6, receptions_2024: 60, targets_2024: 83, rush_attempts_2024: 0, ppr_2025_actual: 184.2 },
  { player_id: '00-0038996', player_name: 'Dalton Kincaid', position: 'TE', team_2024: 'BUF', games_2024: 13, ppr_2024: 110.3, receptions_2024: 44, targets_2024: 75, rush_attempts_2024: 0, ppr_2025_actual: 138.7 },

  // Outcome unavailable from TIBER-Data: exercises the fail-closed path. This
  // row must be emitted as `unavailable` and excluded from all error metrics.
  { player_id: '00-0039999', player_name: 'Marvin Harrison Jr.', position: 'WR', team_2024: 'ARI', games_2024: 17, ppr_2024: 205.4, receptions_2024: 62, targets_2024: 116, rush_attempts_2024: 0, ppr_2025_actual: null },
];

export const tiberDataSeasonalPprDataset: SeasonalPprDatasetDescriptor = {
  dataset_id: 'tiber-data-seasonal-ppr-2024-2025',
  dataset_version: 'snapshot-2026-06-01',
  governance_status: 'fixture',
  source_dataset_refs: [
    {
      dataset_id: 'tiber-data.seasonal-skill-ppr.2025-actuals',
      version: 'snapshot-2026-06-01',
      uri: 'tiber-data://seasonal/skill/ppr/2025',
    },
    {
      dataset_id: 'tiber-data.seasonal-skill-inputs.2024',
      version: 'snapshot-2026-06-01',
      uri: 'tiber-data://seasonal/skill/inputs/2024',
    },
  ],
  provenance:
    'Curated, versioned mirror snapshot of the TIBER-Data seasonal skill-position PPR table. Hand-assembled for the PPM backtest harness; values are an approximate historical snapshot, not a live governed pull. Governance status is fixture, never governed.',
  observations,
};
