/**
 * Representative governed Teamstate Forecast Run 2 artifact that is READY for value binding, carrying
 * a `teamWeekValues` channel so the binder has real team-week numbers to aggregate.
 *
 * This mirrors the hardened upstream Teamstate artifact (Teamstate #66/#68/#70): explicit-marker
 * governance, a recorded timezone-explicit pre-target forecast cutoff, deferred-null pressure, and a
 * preserved partial-null `redZoneTdRate`. It is a fixture only — the team-week numbers are small,
 * hand-assembled diagnostics, never observed reality or model-quality data.
 *
 * `teamWeekValues` rows are 2024 input-season team-week rows for a few teams that appear in the Run 1
 * dataset (BAL/PHI/CIN), plus one 2025 row to exercise the non-input-season skip. `pressureRateAllowed`
 * is null on every row; no numeric pressure feature is ever present.
 */
import { fixtureGovernedTeamstateReadinessReport } from './governedTeamstateReadinessFixture.js';
import type { TeamstateTeamWeekValueRow } from '../runRun2GovernedTeamstateValueBinding.js';

export const fixtureGovernedTeamstateBindingTeamWeekValues: TeamstateTeamWeekValueRow[] = [
  // BAL: epaPerPlay mean 0.15, successRate mean 0.45, redZoneTdRate one finite (0.6) -> 0.6.
  { teamCode: 'BAL', season: 2024, week: 1, epaPerPlay: 0.1, successRate: 0.5, redZoneTdRate: 0.6, pressureRateAllowed: null },
  { teamCode: 'BAL', season: 2024, week: 2, epaPerPlay: 0.2, successRate: 0.4, redZoneTdRate: null, pressureRateAllowed: null },
  // PHI: epaPerPlay mean 0.10, successRate mean 0.45, redZoneTdRate all null -> stays null (never zero-filled).
  { teamCode: 'PHI', season: 2024, week: 1, epaPerPlay: 0.05, successRate: 0.42, redZoneTdRate: null, pressureRateAllowed: null },
  { teamCode: 'PHI', season: 2024, week: 2, epaPerPlay: 0.15, successRate: 0.48, redZoneTdRate: null, pressureRateAllowed: null },
  { teamCode: 'PHI', season: 2024, week: 3, epaPerPlay: 0.1, successRate: 0.45, redZoneTdRate: null, pressureRateAllowed: null },
  // CIN: epaPerPlay mean 0.20, successRate mean 0.50, redZoneTdRate mean 0.5.
  { teamCode: 'CIN', season: 2024, week: 1, epaPerPlay: 0.18, successRate: 0.52, redZoneTdRate: 0.5, pressureRateAllowed: null },
  { teamCode: 'CIN', season: 2024, week: 2, epaPerPlay: 0.22, successRate: 0.48, redZoneTdRate: 0.5, pressureRateAllowed: null },
  // A target-season (2025) row that must never be aggregated (non-input-season skip).
  { teamCode: 'BAL', season: 2025, week: 1, epaPerPlay: 0.99, successRate: 0.99, redZoneTdRate: 0.99, pressureRateAllowed: null },
];

export const fixtureGovernedTeamstateBindingArtifact = {
  ...fixtureGovernedTeamstateReadinessReport,
  // Real input-season team-environment metrics: two available, one preserved partial-null, pressure deferred.
  fieldReadiness: [
    { field: 'epaPerPlay', finiteCount: 544, nullCount: 0, status: 'available' },
    { field: 'successRate', finiteCount: 544, nullCount: 0, status: 'available' },
    { field: 'redZoneTdRate', finiteCount: 412, nullCount: 132, status: 'partial_nulls' },
    { field: 'pressureRateAllowed', finiteCount: 0, nullCount: 544, status: 'deferred_insufficient_data' },
  ],
  availableFields: ['epaPerPlay', 'successRate'],
  deferredInsufficientFields: ['pressureRateAllowed'],
  partialNullFields: ['redZoneTdRate'],
  // Recorded, timezone-explicit, pre-target cutoff (matches the hardened Teamstate artifact).
  forecastCutoff: {
    inputSeason: 2024,
    targetSeason: 2025,
    asOf: '2025-03-01T00:00:00.000Z',
    sourceGeneratedAt: '2026-06-25T19:20:51+00:00',
    targetSeasonStart: '2025-09-01T00:00:00.000Z',
    cutoffBeforeTargetSeason: true,
  },
  teamWeekValues: fixtureGovernedTeamstateBindingTeamWeekValues,
} as const;
