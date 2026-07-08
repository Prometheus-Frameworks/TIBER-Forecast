/**
 * Contract for the seasonal PPR backtest (Issue #49).
 *
 * This is the first governed Point-Prediction-Model backtest: it uses 2024
 * input/player data to predict known 2025 full-season PPR outcomes, where the
 * 2025 actual PPR layer is sourced from TIBER-Data.
 *
 * Design intent (mirrors `src/contracts/projectionArtifacts.ts` and the
 * point-scenario-lab governance resolver): PPM is the *producer* here, so every
 * output is explicitly stamped as MODEL INFERENCE — never observed reality — and
 * governance fails closed. A row is only ever reported with a usable prediction
 * when its target outcome is present and finite; anything missing/invalid is
 * marked `unavailable` rather than silently coerced. Nothing downstream
 * (TIBER-Fantasy Management, Team Direction, promotion gates) may consume these
 * outputs until a later contract/display PR is approved.
 */
import type { ScoringPosition } from './scoring.js';
import type { TiberDataSourceDatasetRef } from './tiberDataProjectionInput.js';

export const SEASONAL_PPR_BACKTEST_MODEL_VERSION = 'seasonal-ppr-ridge-v1' as const;
export const SEASONAL_PPR_BACKTEST_REPORT_VERSION = 'seasonal-ppr-backtest-report-v1' as const;
export const SEASONAL_PPR_PREDICTION_ARTIFACT_VERSION = 'seasonal-ppr-prediction-v1' as const;
export const SEASONAL_PPR_EXPLANATION_ARTIFACT_VERSION = 'seasonal-ppr-explanation-v1' as const;

export const SEASONAL_PPR_INPUT_SEASON = 2024 as const;
export const SEASONAL_PPR_TARGET_SEASON = 2025 as const;

/**
 * Plain-language definition of what is being predicted. Stamped onto the report
 * so the artifact is self-describing and cannot be mistaken for per-game,
 * non-PPR, or projected-vs-actual output.
 */
export const SEASONAL_PPR_TARGET_DEFINITION =
  'Full-season total PPR fantasy points scored in the 2025 NFL regular season, predicted from 2024-season input features only.' as const;

/**
 * Every emitted row/report is inference, not observed reality. This marker is
 * stamped on outputs so a downstream reader can never treat a predicted value as
 * a measured fact.
 */
export const SEASONAL_PPR_OUTPUT_KIND = 'model-inference' as const;
export type SeasonalPprOutputKind = typeof SEASONAL_PPR_OUTPUT_KIND;

/**
 * Per-row governance status. Fails closed: a row is `inference` (usable) only
 * when its target outcome is present and finite; `unavailable` otherwise. We
 * never synthesize `governed` here — the dataset itself is fixture-sourced.
 */
export type SeasonalPprRowGovernanceStatus = 'inference' | 'unavailable';

/**
 * Dataset-level governance, aligned with the point-scenario-lab statuses. The
 * curated TIBER-Data mirror used by this backtest is `fixture` — it must never
 * masquerade as `governed`.
 */
export type SeasonalPprDatasetGovernanceStatus = 'governed' | 'fixture' | 'ungoverned' | 'unknown';

/**
 * Where the backtest's weekly source rows came from. This is provenance only and
 * is ORTHOGONAL to governance: a `mounted-artifact` run is still `fixture` unless
 * the artifact carries an explicit governed marker. It exists so an operator (and
 * PPM Studio) can tell at a glance whether a run used the bundled scaffold fixture
 * or a real mounted/copied TIBER-Data artifact, without parsing the provenance text.
 */
export type SeasonalPprDataSource = 'bundled-scaffold' | 'mounted-artifact';

/** Whether a row carried enough present input features to be scored by the model. */
export type SeasonalPprFeatureCoverageStatus = 'complete' | 'partial';

/** A single input feature consumed by the seasonal model, for report transparency. */
export interface SeasonalPprFeatureSpec {
  name: string;
  kind: 'numeric' | 'categorical';
  description: string;
}

/** The accepted, implemented player-history production-only feature contract (Forecast #143). */
export const PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID = 'player_history_production_only_v0' as const;
export const PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION = '1.0.0' as const;

/**
 * Player-history production-only trailing-history block (Forecast #143), joined onto a
 * `SeasonalPlayerObservation` from a locked, promoted TIBER-Data artifact. Every value here is
 * derived STRICTLY from seasons before `SEASONAL_PPR_INPUT_SEASON` (2021-2023) -- never the input
 * season (2024) or the target season (2025) -- so this block can never leak same-season or
 * future-season information into the model.
 *
 * A player with no qualifying prior history gets `player_history: null` on the observation
 * (see {@link SeasonalPlayerObservation}) -- the ENTIRE block is omitted, never zero-filled at the
 * observation level. Individual trailing aggregates below may still be `null` even when the block
 * itself is present, e.g. a player with only one qualifying prior season has a `prior_season_1_ppr`
 * but no `trailing_2yr_ppr_total` (which requires two consecutive prior seasons to be non-null).
 */
export interface PlayerHistoryProductionOnlyObservation {
  contract_id: typeof PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID;
  contract_version: typeof PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION;
  /** sha256 of the promoted TIBER-Data artifact this player's history was sourced from. */
  source_artifact_sha256: string;
  /** Season immediately before the input season (2023). Null if that season has no row. */
  prior_season_1_ppr: number | null;
  /** Two seasons before the input season (2022). Null if that season has no row. */
  prior_season_2_ppr: number | null;
  /** Sum of prior_season_1_ppr + prior_season_2_ppr; null unless BOTH are present. */
  trailing_2yr_ppr_total: number | null;
  /** Sum of the 3 approved input-window seasons (2021-2023); null unless ALL 3 are present. */
  trailing_3yr_ppr_total: number | null;
  trailing_2yr_ppr_mean: number | null;
  trailing_3yr_ppr_mean: number | null;
  /** prior_season_1_ppr - prior_season_2_ppr; null unless both are present. */
  year_over_year_ppr_trend: number | null;
}

/**
 * One curated player observation: 2024 input features plus the 2025 actual PPR
 * outcome (sourced from TIBER-Data). `ppr_2025_actual` is `null` when the
 * outcome is unavailable, which forces the row to fail closed.
 */
export interface SeasonalPlayerObservation {
  player_id: string;
  player_name: string;
  position: ScoringPosition;
  team_2024: string;
  /** 2024 input features. */
  games_2024: number;
  ppr_2024: number;
  receptions_2024: number;
  targets_2024: number;
  rush_attempts_2024: number;
  /** 2025 actual outcome layer, sourced from TIBER-Data. Null => unavailable. */
  ppr_2025_actual: number | null;
  /**
   * Player-history production-only trailing-history block (Forecast #143). Optional/undefined for
   * any observation built before this field existed (backward compatible). `null` (or omitted)
   * means "no qualifying prior history for this player" -- explicit, never silently zero-filled at
   * this level. See {@link PlayerHistoryProductionOnlyObservation}.
   */
  player_history?: PlayerHistoryProductionOnlyObservation | null;
}

/**
 * The opt-in gate a caller must supply before ANY production code (model or service) may read a
 * `player_history` block. `enabled: true` alone is not sufficient -- {@link resolveGatedPlayerHistory}
 * additionally requires the block's own `contract_id`/`contract_version`/`source_artifact_sha256` to
 * match this gate's declared `sourceArtifactSha256` exactly.
 */
export interface PlayerHistoryProductionOnlyGate {
  enabled: true;
  sourceArtifactSha256: string;
}

/**
 * The ONE sanctioned way to read `player_history` off an observation anywhere in production Forecast
 * code (`seasonalPprModel.ts` and `runSeasonalPprBacktestService.ts` both call this; neither reads
 * `observation.player_history` directly). Fails closed: returns `null` unless `gate` is defined,
 * `gate.enabled` is `true`, the observation actually carries a `player_history` block, AND that
 * block's `contract_id`, `contract_version`, and `source_artifact_sha256` all match exactly what
 * `gate` declares. This is what prevents a caller from changing model behavior merely by attaching a
 * `player_history` object to an observation -- with no gate (or a mismatched one), the object is
 * inert no matter which production entrypoint receives it.
 */
export const resolveGatedPlayerHistory = (
  observation: SeasonalPlayerObservation,
  gate: PlayerHistoryProductionOnlyGate | undefined,
): PlayerHistoryProductionOnlyObservation | null => {
  const history = observation.player_history;
  if (!gate?.enabled || !history) return null;
  if (history.contract_id !== PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID) return null;
  if (history.contract_version !== PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION) return null;
  if (history.source_artifact_sha256 !== gate.sourceArtifactSha256) return null;
  return history;
};

/** Dataset descriptor: provenance + governance for the curated observation set. */
export interface SeasonalPprDatasetDescriptor {
  dataset_id: string;
  dataset_version: string;
  governance_status: SeasonalPprDatasetGovernanceStatus;
  /** Bundled scaffold fixture vs a mounted/copied real TIBER-Data artifact. */
  data_source: SeasonalPprDataSource;
  /** TIBER-Data refs for the 2025 actual PPR outcome layer and 2024 inputs. */
  source_dataset_refs: TiberDataSourceDatasetRef[];
  /** Honest provenance note. */
  provenance: string;
  observations: SeasonalPlayerObservation[];
}

/** One prediction row in the governed artifact (one per player observation). */
export interface SeasonalPprPredictionRow {
  artifact_version: typeof SEASONAL_PPR_PREDICTION_ARTIFACT_VERSION;
  output_kind: SeasonalPprOutputKind;
  model_version: typeof SEASONAL_PPR_BACKTEST_MODEL_VERSION;
  player_id: string;
  player_name: string;
  position: ScoringPosition;
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  /** Model-inferred 2025 PPR. Null when the row is `unavailable`. */
  predicted_ppr: number | null;
  /** Observed 2025 PPR from TIBER-Data. Null when unavailable. */
  actual_ppr: number | null;
  /** |predicted - actual|. Null when either side is unavailable. */
  absolute_error: number | null;
  feature_coverage_status: SeasonalPprFeatureCoverageStatus;
  /** Names of features that were present (non-default) for this row. */
  features_present: string[];
  governance_status: SeasonalPprRowGovernanceStatus;
  source_dataset_refs: TiberDataSourceDatasetRef[];
  dataset_version: string;
  generated_at: string;
}

/**
 * Fixed warning stamped on every explanation so a reader can never mistake the
 * additive ridge decomposition for a causal football claim or for advice.
 */
export const SEASONAL_PPR_EXPLANATION_WARNING =
  'This is a model-mechanics explanation, not a causal football explanation. It shows how the ridge model combined input features to produce the prediction. It is not advice and not observed reality.' as const;

/**
 * Whether a prediction row could be explained. `explained` requires a scored row
 * with a fitted model; `unavailable` rows (null prediction) carry no synthesized
 * contributions and fail gracefully at the row level.
 */
export type SeasonalPprExplanationStatus = 'explained' | 'unavailable';

/** One additive feature term: `contribution = coefficient * standardized_value`. */
export interface SeasonalPprFeatureContribution {
  feature: string;
  kind: 'numeric' | 'position';
  input_value: number;
  standardized_value: number;
  coefficient: number;
  contribution: number;
}

/**
 * One per-player explanation row (one per observation, parallel to the
 * prediction rows). Model mechanics only — see `SEASONAL_PPR_EXPLANATION_WARNING`.
 */
export interface SeasonalPprPredictionExplanation {
  artifact_version: typeof SEASONAL_PPR_EXPLANATION_ARTIFACT_VERSION;
  output_kind: SeasonalPprOutputKind;
  model_version: typeof SEASONAL_PPR_BACKTEST_MODEL_VERSION;
  report_version: typeof SEASONAL_PPR_BACKTEST_REPORT_VERSION;
  player_id: string;
  player_name: string;
  position: ScoringPosition;
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  data_source: SeasonalPprDataSource;
  governance_status: SeasonalPprDatasetGovernanceStatus;
  explanation_status: SeasonalPprExplanationStatus;
  /** Model-inferred 2025 PPR (null for unavailable rows). */
  predicted_ppr: number | null;
  actual_ppr: number | null;
  absolute_error: number | null;
  /** Ridge intercept (baseline before feature contributions); null if unexplained. */
  intercept: number | null;
  /** All additive contributions; empty for unavailable rows (never synthesized). */
  feature_contributions: SeasonalPprFeatureContribution[];
  /** Contributions that pushed the prediction up, largest first. */
  top_positive_contributions: SeasonalPprFeatureContribution[];
  /** Contributions that pushed the prediction down, largest magnitude first. */
  top_negative_contributions: SeasonalPprFeatureContribution[];
  explanation_warning: typeof SEASONAL_PPR_EXPLANATION_WARNING;
  generated_at: string;
}

/** MAE/RMSE/correlation summary over a set of scored rows. */
export interface SeasonalPprErrorSummary {
  sample_size: number;
  mae: number;
  rmse: number;
  /** Pearson correlation between predicted and actual; null when undefined. */
  correlation: number | null;
  /** Spearman-style rank correlation; null when undefined. */
  rank_correlation: number | null;
}

/** Named model/baseline result for the report's comparison table. */
export interface SeasonalPprModelEvaluation {
  name: string;
  is_baseline: boolean;
  description: string;
  overall: SeasonalPprErrorSummary;
  by_position: Partial<Record<ScoringPosition, SeasonalPprErrorSummary>>;
}

/** A single large miss, for limitations transparency. */
export interface SeasonalPprMiss {
  player_id: string;
  player_name: string;
  position: ScoringPosition;
  predicted_ppr: number;
  actual_ppr: number;
  absolute_error: number;
}

export interface SeasonalPprBacktestReport {
  report_version: typeof SEASONAL_PPR_BACKTEST_REPORT_VERSION;
  output_kind: SeasonalPprOutputKind;
  model_version: typeof SEASONAL_PPR_BACKTEST_MODEL_VERSION;
  generated_at: string;
  target_definition: typeof SEASONAL_PPR_TARGET_DEFINITION;
  input_season: typeof SEASONAL_PPR_INPUT_SEASON;
  target_season: typeof SEASONAL_PPR_TARGET_SEASON;
  dataset: {
    dataset_id: string;
    dataset_version: string;
    governance_status: SeasonalPprDatasetGovernanceStatus;
    /** Bundled scaffold fixture vs a mounted/copied real TIBER-Data artifact. */
    data_source: SeasonalPprDataSource;
    source_dataset_refs: TiberDataSourceDatasetRef[];
    provenance: string;
    /** Observations supplied to the backtest. */
    observation_count: number;
    /** Rows with a usable 2025 actual outcome (scored). */
    scored_row_count: number;
    /** Rows failed closed for missing/invalid outcome. */
    unavailable_row_count: number;
  };
  feature_list: SeasonalPprFeatureSpec[];
  /** Per-feature count of rows missing (defaulted) coverage. */
  missing_feature_coverage: Array<{ feature: string; rows_missing: number }>;
  /**
   * Truthful disclosure of whether the player-history production-only binding (Forecast #143) was
   * active for this run. `enabled: false` (the default for every run that does not explicitly opt
   * in) means every observation's `player_history` field was left as supplied by the dataset loader
   * (typically absent/null), and the model's player-history feature columns evaluated to their
   * zero-default for every row -- i.e. this run is behaviorally identical to a pre-#143 run.
   */
  player_history_production_only: {
    enabled: boolean;
    /** sha256 of the promoted TIBER-Data artifact the history mirror was verified against; null when disabled. */
    source_artifact_sha256: string | null;
    /** Human sign-off is NEVER claimed by an automated report; always false here. */
    human_signoff_recorded: false;
  };
  /** Validation strategy used for the model so reviewers can judge optimism. */
  evaluation_method: string;
  model: SeasonalPprModelEvaluation;
  baselines: SeasonalPprModelEvaluation[];
  /** Whether the model's overall MAE beats the best baseline's overall MAE. */
  beats_baseline: boolean;
  beats_baseline_summary: string;
  top_misses: SeasonalPprMiss[];
  limitations: string[];
}
