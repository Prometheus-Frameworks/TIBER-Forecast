/**
 * Player-history production-only source binding (Forecast #143).
 *
 * Joins the reviewed, validated `production_only` player-history trailing-history feature family
 * (PR #132 / #140 / #142) onto `SeasonalPlayerObservation` rows, sourced from the committed,
 * fail-closed-verified Forecast mirror at `data/fixtures/tiberData/player_history_2021_2023_input_mirror.json`
 * (#135/#136), itself sourced from the promoted TIBER-Data artifact locked below (TIBER-Data#202/#207).
 *
 * Fail-closed identity: {@link verifyPlayerHistoryMirrorProvenance} throws unless the mirror's
 * `governed_source` block matches the locked identity EXACTLY (repo, artifact path, sha256, promotion
 * review, promotion merge commit, and `artifactStatus === 'promoted_governed_artifact'`). No caller of
 * this module may bypass that check -- {@link buildPlayerHistoryProductionOnlyIndex} always calls it
 * first.
 *
 * No leakage: every mirror row is season 2021, 2022, or 2023 (the `input_window` is asserted below),
 * strictly before the model's `SEASONAL_PPR_INPUT_SEASON` (2024) and `SEASONAL_PPR_TARGET_SEASON`
 * (2025). This module never reads a 2024 or 2025 row from the mirror.
 *
 * Reuses the already-tested, already-reviewed pure feature-extraction primitives from
 * `src/rehearsal/playerHistoryFeatureScaffold.ts` (`buildPlayerHistoryFeatures`) rather than
 * re-implementing trailing-window math -- that module's own docstring anticipates exactly this reuse
 * ("a reusable, tested, pure ... helper ... for LATER model code to use").
 *
 * This module is pure aside from {@link verifyPlayerHistoryMirrorProvenance}'s fail-closed throw; it
 * performs no file I/O and no network access. The CLI script that wires this into a real backtest run
 * reads the mirror file from disk and passes its parsed JSON in.
 */
import {
  buildPlayerHistoryFeatures,
  type PlayerHistoryInputRow,
} from '../../rehearsal/playerHistoryFeatureScaffold.js';
import {
  PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID,
  PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION,
  type PlayerHistoryProductionOnlyObservation,
  type SeasonalPlayerObservation,
} from '../../contracts/seasonalPprBacktest.js';

/** The only promoted TIBER-Data artifact identity this binding may ever consume (locked, #142/#143). */
export const LOCKED_PLAYER_HISTORY_ARTIFACT_REPO = 'Prometheus-Frameworks/TIBER-Data' as const;
export const LOCKED_PLAYER_HISTORY_ARTIFACT_PATH = 'exports/promoted/nfl/player_season_coverage_v0.json' as const;
export const LOCKED_PLAYER_HISTORY_ARTIFACT_MANIFEST_PATH =
  'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json' as const;
export const LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256 = 'd45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac' as const;
export const LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW = 'TIBER-Data#202' as const;
export const LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT = '711d6ee158d4e3bd116d1df4d76dea282200454d' as const;
export const LOCKED_PLAYER_HISTORY_ARTIFACT_STATUS = 'promoted_governed_artifact' as const;

/** The only committed mirror this binding reads (Forecast #135/#136). */
export const LOCKED_PLAYER_HISTORY_MIRROR_PATH = 'data/fixtures/tiberData/player_history_2021_2023_input_mirror.json' as const;

/** The approved trailing-history input window (Forecast #143): strictly before the 2024 input season. */
export const PLAYER_HISTORY_PRODUCTION_ONLY_INPUT_SEASONS = [2021, 2022, 2023] as const;
/**
 * The scaffold's own "target season" concept for this join: the season the trailing window is
 * anchored to (2024, the model's existing input season) -- NOT `SEASONAL_PPR_TARGET_SEASON` (2025).
 * The mirror never carries a 2024 row (`buildPlayerHistoryFeatures`'s structural leakage filter would
 * reject one anyway), so this only controls the trailing-window arithmetic (2023 - 1, 2023 - 2, ...).
 */
export const PLAYER_HISTORY_PRODUCTION_ONLY_TRAILING_ANCHOR_SEASON = 2024 as const;

export interface PlayerHistoryMirrorGovernedSource {
  repo: string;
  promotedArtifactPath: string;
  promotedManifestPath: string;
  promotionMergeCommit: string;
  promotionReview: string;
  sha256: string;
  artifactStatus: string;
}

export interface PlayerHistoryMirrorInputWindow {
  seasons: number[];
  season_type: string;
  target_season_excluded: number;
}

export interface PlayerHistoryProductionOnlyMirrorDocument {
  kind: string;
  governed_source: PlayerHistoryMirrorGovernedSource;
  input_window: PlayerHistoryMirrorInputWindow;
  rows: PlayerHistoryInputRow[];
}

/**
 * Fail-closed provenance check. Throws unless every locked identity field matches exactly and the
 * mirror's declared input window is exactly the approved 2021-2023 REG window. Never returns a
 * boolean for the caller to (mis)handle -- a provenance mismatch must halt the caller, not degrade.
 */
export const verifyPlayerHistoryMirrorProvenance = (mirror: PlayerHistoryProductionOnlyMirrorDocument): void => {
  const source = mirror.governed_source;
  const mismatches: string[] = [];
  if (source.repo !== LOCKED_PLAYER_HISTORY_ARTIFACT_REPO) mismatches.push(`repo: expected ${LOCKED_PLAYER_HISTORY_ARTIFACT_REPO}, got ${source.repo}`);
  if (source.promotedArtifactPath !== LOCKED_PLAYER_HISTORY_ARTIFACT_PATH)
    mismatches.push(`promotedArtifactPath: expected ${LOCKED_PLAYER_HISTORY_ARTIFACT_PATH}, got ${source.promotedArtifactPath}`);
  if (source.promotedManifestPath !== LOCKED_PLAYER_HISTORY_ARTIFACT_MANIFEST_PATH)
    mismatches.push(`promotedManifestPath: expected ${LOCKED_PLAYER_HISTORY_ARTIFACT_MANIFEST_PATH}, got ${source.promotedManifestPath}`);
  if (source.sha256 !== LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256) mismatches.push(`sha256: expected ${LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256}, got ${source.sha256}`);
  if (source.promotionReview !== LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW)
    mismatches.push(`promotionReview: expected ${LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW}, got ${source.promotionReview}`);
  if (source.promotionMergeCommit !== LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT)
    mismatches.push(`promotionMergeCommit: expected ${LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT}, got ${source.promotionMergeCommit}`);
  if (source.artifactStatus !== LOCKED_PLAYER_HISTORY_ARTIFACT_STATUS)
    mismatches.push(`artifactStatus: expected ${LOCKED_PLAYER_HISTORY_ARTIFACT_STATUS}, got ${source.artifactStatus}`);

  const window = mirror.input_window;
  const expectedSeasons = [...PLAYER_HISTORY_PRODUCTION_ONLY_INPUT_SEASONS];
  if (!window || JSON.stringify([...window.seasons].sort()) !== JSON.stringify(expectedSeasons)) {
    mismatches.push(`input_window.seasons: expected ${JSON.stringify(expectedSeasons)}, got ${JSON.stringify(window?.seasons)}`);
  }
  if (window?.season_type !== 'REG') mismatches.push(`input_window.season_type: expected REG, got ${window?.season_type}`);
  if (window?.target_season_excluded !== PLAYER_HISTORY_PRODUCTION_ONLY_TRAILING_ANCHOR_SEASON) {
    mismatches.push(`input_window.target_season_excluded: expected ${PLAYER_HISTORY_PRODUCTION_ONLY_TRAILING_ANCHOR_SEASON}, got ${window?.target_season_excluded}`);
  }

  if (mismatches.length > 0) {
    throw new Error(
      `player-history production-only binding: mirror provenance verification failed closed (${mismatches.length} mismatch(es)): ${mismatches.join('; ')}`,
    );
  }
};

/**
 * Build a player_id -> feature-block index from a provenance-verified mirror. Reuses
 * `buildPlayerHistoryFeatures` (families: ['production'] only) so the trailing-window math and
 * leakage guards are byte-identical to the already-reviewed scaffold module.
 */
export const buildPlayerHistoryProductionOnlyIndex = (
  mirror: PlayerHistoryProductionOnlyMirrorDocument,
): Map<string, PlayerHistoryProductionOnlyObservation> => {
  verifyPlayerHistoryMirrorProvenance(mirror);

  const featureRows = buildPlayerHistoryFeatures(mirror.rows, {
    targetSeason: PLAYER_HISTORY_PRODUCTION_ONLY_TRAILING_ANCHOR_SEASON,
    families: ['production'],
    inputSeasons: [...PLAYER_HISTORY_PRODUCTION_ONLY_INPUT_SEASONS],
  });

  const index = new Map<string, PlayerHistoryProductionOnlyObservation>();
  const anchor = PLAYER_HISTORY_PRODUCTION_ONLY_TRAILING_ANCHOR_SEASON;
  for (const row of featureRows) {
    const production = row.production;
    if (!production) continue; // families requested only 'production'; should always be present.
    index.set(row.player_id, {
      contract_id: PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID,
      contract_version: PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION,
      source_artifact_sha256: mirror.governed_source.sha256,
      prior_season_1_ppr: production.season_ppr_by_season[anchor - 1] ?? null,
      prior_season_2_ppr: production.season_ppr_by_season[anchor - 2] ?? null,
      trailing_2yr_ppr_total: production.trailing_2yr_ppr_total,
      trailing_3yr_ppr_total: production.trailing_3yr_ppr_total,
      trailing_2yr_ppr_mean: production.trailing_2yr_ppr_mean,
      trailing_3yr_ppr_mean: production.trailing_3yr_ppr_mean,
      year_over_year_ppr_trend: production.year_over_year_ppr_trend,
    });
  }
  return index;
};

/**
 * Attach player-history to every observation in a dataset. A player_id present in `index` gets that
 * exact feature block; a player_id absent from `index` gets `player_history: null` -- explicit,
 * never zero-filled, never imputed. Pure; does not mutate the input observations.
 */
export const attachPlayerHistoryProductionOnly = (
  observations: readonly SeasonalPlayerObservation[],
  index: ReadonlyMap<string, PlayerHistoryProductionOnlyObservation>,
): SeasonalPlayerObservation[] =>
  observations.map((observation) => ({
    ...observation,
    player_history: index.get(observation.player_id) ?? null,
  }));
