/**
 * Default seasonal PPR backtest dataset (Issue #49).
 *
 * The dataset is now built by running the TIBER-Data weekly-outcome LOADER over
 * a bundled scaffold weekly artifact, rather than from a hand-written
 * player-level table. This proves the real ingestion path: weekly
 * `player_weekly_ppr_outcomes_v1` rows -> aggregated 2024->2025 player rows.
 *
 * GOVERNANCE: the bundled rows are scaffold-only fixture coverage, so the
 * resulting dataset is `fixture` (never `governed`). To run against a real
 * TIBER-Data artifact, point the runner at the artifact path (see
 * `scripts/runSeasonalPprBacktest.ts`) — governed status still requires an
 * explicit TIBER-Data marker, never path-name inference.
 */
import type { SeasonalPprDatasetDescriptor } from '../../contracts/seasonalPprBacktest.js';
import { tiberDataWeeklyPprScaffoldRows } from './fixtures/tiberDataWeeklyPprScaffold.js';
import { loadSeasonalPprDatasetFromWeeklyOutcomes } from './loadSeasonalPprDataset.js';

const result = loadSeasonalPprDatasetFromWeeklyOutcomes(tiberDataWeeklyPprScaffoldRows, {
  datasetId: 'tiber-data-seasonal-ppr-2024-2025',
  datasetVersion: 'scaffold-snapshot-2026-06-01',
  provenanceNote:
    'Built from a bundled scaffold weekly artifact; replace with a mounted TIBER-Data artifact for real coverage.',
});

if (!result.ok) {
  // The bundled scaffold is validated by tests; a failure here is a build-time bug.
  throw new Error(
    `Failed to build the default seasonal PPR dataset from the scaffold artifact: ${result.errors
      .map((error) => `[${error.code}] ${error.message}`)
      .join('; ')}`,
  );
}

export const tiberDataSeasonalPprDataset: SeasonalPprDatasetDescriptor = result.data;
