/**
 * Seasonal PPR backtest service (Issue #49).
 *
 * Orchestrates the first governed PPM backtest: 2024 input features -> 2025
 * full-season PPR, with the 2025 actual outcome layer sourced from TIBER-Data.
 * Produces a deterministic evaluation report and a deterministic, governed
 * prediction artifact (rows). Everything is labeled MODEL INFERENCE.
 *
 * Honesty / leakage controls:
 *  - The ridge model and the position-mean baseline are evaluated with
 *    leave-one-out cross-validation (LOOCV): the row being predicted is never in
 *    its own training set. With a single 2024->2025 season pair this is the
 *    honest way to avoid in-sample optimism.
 *  - Rows whose 2025 actual outcome is missing/invalid fail closed: they are
 *    emitted as `unavailable` with no predicted value and are excluded from all
 *    error metrics.
 *  - The service fails (no artifact) when there are too few usable rows to fit
 *    the model, rather than emitting a degenerate report.
 */
import {
  SEASONAL_PPR_BACKTEST_MODEL_VERSION,
  SEASONAL_PPR_BACKTEST_REPORT_VERSION,
  SEASONAL_PPR_EXPLANATION_ARTIFACT_VERSION,
  SEASONAL_PPR_EXPLANATION_WARNING,
  SEASONAL_PPR_INPUT_SEASON,
  SEASONAL_PPR_OUTPUT_KIND,
  SEASONAL_PPR_PREDICTION_ARTIFACT_VERSION,
  SEASONAL_PPR_TARGET_DEFINITION,
  SEASONAL_PPR_TARGET_SEASON,
  PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID,
  PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION,
  type SeasonalPlayerObservation,
  type SeasonalPprBacktestReport,
  type SeasonalPprDatasetDescriptor,
  type SeasonalPprFeatureContribution,
  type SeasonalPprModelEvaluation,
  type SeasonalPprPredictionExplanation,
  type SeasonalPprPredictionRow,
} from '../contracts/seasonalPprBacktest.js';
import {
  summarizeSeasonalErrors,
  summarizeSeasonalErrorsByPosition,
  type ScoredPair,
} from '../datasets/seasonal/evaluateSeasonalPpr.js';
import { baselinePositionMean, baselinePrevYearPpr } from '../models/seasonal/seasonalPprBaselines.js';
import {
  seasonalPprFeatureList,
  seasonalPprNumericFeatureNames,
  trainSeasonalRidgeModel,
  type SeasonalRidgeExplanation,
} from '../models/seasonal/seasonalPprModel.js';
import { serviceFailure, serviceSuccess } from './result.js';
import type { ServiceResult } from './result.js';

const MIN_SCORED_ROWS = 4;
/** How many positive/negative contributions to surface in the top lists. */
const TOP_CONTRIBUTIONS = 3;

const round4 = (value: number): number => Number(value.toFixed(4));

const roundContribution = (c: SeasonalPprFeatureContribution): SeasonalPprFeatureContribution => ({
  feature: c.feature,
  kind: c.kind,
  input_value: round4(c.input_value),
  standardized_value: round4(c.standardized_value),
  coefficient: round4(c.coefficient),
  contribution: round4(c.contribution),
});

export interface RunSeasonalPprBacktestOptions {
  /** Deterministic timestamp stamped onto every output. Defaults to now. */
  generatedAt?: string;
  /** Ridge L2 penalty override. */
  lambda?: number;
  /**
   * Truthful disclosure of the player-history production-only binding (Forecast #143) for this run.
   * Omitted/undefined means disabled -- the default for every caller that does not explicitly attach
   * player-history data to its observations beforehand. This option does not itself attach anything;
   * it only controls what the report DISCLOSES, so callers that DO attach player-history data (via
   * `attachPlayerHistoryProductionOnly`) must pass the matching sha256 here for the report to be
   * truthful.
   */
  playerHistoryProductionOnly?: { enabled: true; sourceArtifactSha256: string };
}

export interface RunSeasonalPprBacktestOutput {
  report: SeasonalPprBacktestReport;
  predictions: SeasonalPprPredictionRow[];
  /** Per-player model-mechanics explanations (one per observation). */
  explanations: SeasonalPprPredictionExplanation[];
}

export type RunSeasonalPprBacktestResult = ServiceResult<RunSeasonalPprBacktestOutput>;

const hasUsableActual = (observation: SeasonalPlayerObservation): boolean =>
  observation.ppr_2025_actual != null && Number.isFinite(observation.ppr_2025_actual);

const featuresPresent = (observation: SeasonalPlayerObservation): string[] => {
  const present: string[] = [];
  if (observation.ppr_2024 > 0) present.push('ppr_2024');
  if (observation.games_2024 > 0 && observation.ppr_2024 > 0) present.push('ppr_per_game_2024');
  if (observation.games_2024 > 0) present.push('games_2024');
  if (observation.targets_2024 > 0) present.push('targets_2024');
  if (observation.rush_attempts_2024 > 0) present.push('rush_attempts_2024');
  present.push('position');
  const history = observation.player_history;
  if (history?.prior_season_1_ppr != null) present.push('player_history_prior_season_1_ppr');
  if (history?.prior_season_2_ppr != null) present.push('player_history_prior_season_2_ppr');
  if (history?.trailing_2yr_ppr_total != null) present.push('player_history_trailing_2yr_ppr_total');
  if (history?.trailing_3yr_ppr_total != null) present.push('player_history_trailing_3yr_ppr_total');
  if (history?.trailing_2yr_ppr_mean != null) present.push('player_history_trailing_2yr_ppr_mean');
  if (history?.trailing_3yr_ppr_mean != null) present.push('player_history_trailing_3yr_ppr_mean');
  if (history?.year_over_year_ppr_trend != null) present.push('player_history_year_over_year_ppr_trend');
  return present;
};

const featureValuePresent = (observation: SeasonalPlayerObservation, feature: string): boolean =>
  featuresPresent(observation).includes(feature);

/**
 * Fail-closed gate (Forecast #143 Codex review): `player_history` is only trusted when the CALLER
 * explicitly enabled it via `options.playerHistoryProductionOnly` AND the block's own
 * `contract_id`/`contract_version`/`source_artifact_sha256` match exactly what the caller declared.
 * Without this gate, any dataset carrying a `player_history` field would silently influence
 * predictions regardless of the disclosed `enabled` option, and a mismatched/forged/stale contract
 * block could be consumed as if it were the locked, reviewed source. Every observation that fails
 * this check has its `player_history` stripped to `null` (never partially trusted) before anything
 * else in this service reads it -- this is the ONLY place `player_history` is allowed to flow from
 * the dataset into the model.
 */
const gatePlayerHistoryOnDeclaredProvenance = (
  observations: SeasonalPlayerObservation[],
  option: RunSeasonalPprBacktestOptions['playerHistoryProductionOnly'],
): SeasonalPlayerObservation[] => {
  if (!option?.enabled) {
    return observations.map((observation) => (observation.player_history ? { ...observation, player_history: null } : observation));
  }
  return observations.map((observation) => {
    const history = observation.player_history;
    const trusted =
      history != null &&
      history.contract_id === PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_ID &&
      history.contract_version === PLAYER_HISTORY_PRODUCTION_ONLY_CONTRACT_VERSION &&
      history.source_artifact_sha256 === option.sourceArtifactSha256;
    return trusted ? observation : { ...observation, player_history: null };
  });
};

const buildModelEvaluation = (
  name: string,
  description: string,
  isBaseline: boolean,
  pairs: ScoredPair[],
): SeasonalPprModelEvaluation => ({
  name,
  is_baseline: isBaseline,
  description,
  overall: summarizeSeasonalErrors(pairs),
  by_position: summarizeSeasonalErrorsByPosition(pairs),
});

export const runSeasonalPprBacktestService = (
  dataset: SeasonalPprDatasetDescriptor,
  options: RunSeasonalPprBacktestOptions = {},
): RunSeasonalPprBacktestResult => {
  try {
    const generatedAt = options.generatedAt ?? new Date().toISOString();
    const observations = gatePlayerHistoryOnDeclaredProvenance(dataset.observations, options.playerHistoryProductionOnly);

    if (observations.length === 0) {
      return serviceFailure({
        code: 'SEASONAL_PPR_DATASET_EMPTY',
        message: 'Seasonal PPR backtest dataset contains no observations.',
      });
    }

    const scored = observations.filter(hasUsableActual);
    const unavailable = observations.filter((observation) => !hasUsableActual(observation));

    if (scored.length < MIN_SCORED_ROWS) {
      return serviceFailure({
        code: 'SEASONAL_PPR_INSUFFICIENT_ROWS',
        message: `Seasonal PPR backtest requires at least ${MIN_SCORED_ROWS} rows with a usable 2025 actual outcome; found ${scored.length}.`,
        details: { scoredRows: scored.length, unavailableRows: unavailable.length },
      });
    }

    // LOOCV predictions, keyed by player_id, for model and position-mean baseline.
    const modelLoocv = new Map<string, number>();
    const positionMeanLoocv = new Map<string, number>();
    const prevYearPredictions = new Map<string, number>();
    // The SAME per-target LOOCV model that produced each prediction, captured so
    // explanations faithfully reconstruct the stored predicted_ppr.
    const explanationLoocv = new Map<string, SeasonalRidgeExplanation>();

    const prevYearModel = baselinePrevYearPpr();

    for (const target of scored) {
      const trainRows = scored.filter((row) => row.player_id !== target.player_id);
      const model = trainSeasonalRidgeModel(trainRows, { lambda: options.lambda });
      modelLoocv.set(target.player_id, model.predict(target));
      explanationLoocv.set(target.player_id, model.explain(target));

      const positionMean = baselinePositionMean(trainRows);
      positionMeanLoocv.set(target.player_id, positionMean.predict(target));

      prevYearPredictions.set(target.player_id, prevYearModel.predict(target));
    }

    const toPairs = (predictions: Map<string, number>): ScoredPair[] =>
      scored.map((observation) => ({
        position: observation.position,
        predicted: predictions.get(observation.player_id) as number,
        actual: observation.ppr_2025_actual as number,
      }));

    const modelEvaluation = buildModelEvaluation(
      SEASONAL_PPR_BACKTEST_MODEL_VERSION,
      'Ridge linear regression over standardized 2024 features plus position one-hot, evaluated leave-one-out.',
      false,
      toPairs(modelLoocv),
    );

    const baselineEvaluations: SeasonalPprModelEvaluation[] = [
      buildModelEvaluation(
        prevYearModel.name,
        prevYearModel.description,
        true,
        toPairs(prevYearPredictions),
      ),
      buildModelEvaluation(
        'baseline-position-mean',
        baselinePositionMean(scored).description,
        true,
        toPairs(positionMeanLoocv),
      ),
    ];

    const bestBaselineMae = Math.min(...baselineEvaluations.map((evaluation) => evaluation.overall.mae));
    const bestBaseline = baselineEvaluations.find((evaluation) => evaluation.overall.mae === bestBaselineMae);
    const beatsBaseline = modelEvaluation.overall.mae < bestBaselineMae;
    const maeDelta = bestBaselineMae - modelEvaluation.overall.mae;
    const beatsBaselineSummary = beatsBaseline
      ? `Model MAE ${modelEvaluation.overall.mae.toFixed(2)} beats best baseline (${bestBaseline?.name}) MAE ${bestBaselineMae.toFixed(2)} by ${maeDelta.toFixed(2)} PPR.`
      : `Model MAE ${modelEvaluation.overall.mae.toFixed(2)} does NOT beat best baseline (${bestBaseline?.name}) MAE ${bestBaselineMae.toFixed(2)} (gap ${(-maeDelta).toFixed(2)} PPR). The naive baseline is at least as good.`;

    // Missing-feature coverage across ALL observations (scored + unavailable).
    const missingFeatureCoverage = seasonalPprNumericFeatureNames.map((feature) => ({
      feature,
      rows_missing: observations.filter((observation) => !featureValuePresent(observation, feature)).length,
    }));

    // Top misses from the model's LOOCV predictions over scored rows.
    const topMisses = scored
      .map((observation) => {
        const predicted = modelLoocv.get(observation.player_id) as number;
        const actual = observation.ppr_2025_actual as number;
        return {
          player_id: observation.player_id,
          player_name: observation.player_name,
          position: observation.position,
          predicted_ppr: predicted,
          actual_ppr: actual,
          absolute_error: Math.abs(predicted - actual),
        };
      })
      .sort((a, b) => b.absolute_error - a.absolute_error || a.player_id.localeCompare(b.player_id))
      .slice(0, 10);

    // Deterministic prediction rows (sorted by player_id), one per observation.
    const predictions: SeasonalPprPredictionRow[] = [...observations]
      .sort((a, b) => a.player_id.localeCompare(b.player_id))
      .map((observation) => {
        const usable = hasUsableActual(observation);
        const present = featuresPresent(observation);
        const coreComplete =
          observation.ppr_2024 > 0 && observation.games_2024 > 0;
        const predicted = usable ? (modelLoocv.get(observation.player_id) as number) : null;
        const actual = usable ? (observation.ppr_2025_actual as number) : null;
        return {
          artifact_version: SEASONAL_PPR_PREDICTION_ARTIFACT_VERSION,
          output_kind: SEASONAL_PPR_OUTPUT_KIND,
          model_version: SEASONAL_PPR_BACKTEST_MODEL_VERSION,
          player_id: observation.player_id,
          player_name: observation.player_name,
          position: observation.position,
          input_season: SEASONAL_PPR_INPUT_SEASON,
          target_season: SEASONAL_PPR_TARGET_SEASON,
          predicted_ppr: predicted == null ? null : Number(predicted.toFixed(4)),
          actual_ppr: actual,
          absolute_error: predicted == null || actual == null ? null : Number(Math.abs(predicted - actual).toFixed(4)),
          feature_coverage_status: coreComplete ? 'complete' : 'partial',
          features_present: present,
          governance_status: usable ? 'inference' : 'unavailable',
          source_dataset_refs: dataset.source_dataset_refs,
          dataset_version: dataset.dataset_version,
          generated_at: generatedAt,
        };
      });

    // Deterministic per-player explanation rows (sorted by player_id), one per
    // observation. Scored rows carry the additive ridge decomposition from their
    // own LOOCV model; unavailable rows fail gracefully with no synthesized data.
    const explanations: SeasonalPprPredictionExplanation[] = [...observations]
      .sort((a, b) => a.player_id.localeCompare(b.player_id))
      .map((observation) => {
        const explanation = explanationLoocv.get(observation.player_id);
        const base = {
          artifact_version: SEASONAL_PPR_EXPLANATION_ARTIFACT_VERSION,
          output_kind: SEASONAL_PPR_OUTPUT_KIND,
          model_version: SEASONAL_PPR_BACKTEST_MODEL_VERSION,
          report_version: SEASONAL_PPR_BACKTEST_REPORT_VERSION,
          player_id: observation.player_id,
          player_name: observation.player_name,
          position: observation.position,
          input_season: SEASONAL_PPR_INPUT_SEASON,
          target_season: SEASONAL_PPR_TARGET_SEASON,
          data_source: dataset.data_source,
          governance_status: dataset.governance_status,
          explanation_warning: SEASONAL_PPR_EXPLANATION_WARNING,
          generated_at: generatedAt,
        } as const;

        if (!explanation) {
          // Unavailable row (no usable actual => no LOOCV model): explain nothing.
          return {
            ...base,
            explanation_status: 'unavailable',
            predicted_ppr: null,
            actual_ppr: null,
            absolute_error: null,
            intercept: null,
            feature_contributions: [],
            top_positive_contributions: [],
            top_negative_contributions: [],
          };
        }

        const contributions = explanation.contributions.map(roundContribution);
        const positives = contributions
          .filter((c) => c.contribution > 0)
          .sort((a, b) => b.contribution - a.contribution || a.feature.localeCompare(b.feature));
        const negatives = contributions
          .filter((c) => c.contribution < 0)
          .sort((a, b) => a.contribution - b.contribution || a.feature.localeCompare(b.feature));

        const predicted = round4(explanation.prediction);
        const actual = observation.ppr_2025_actual as number;
        return {
          ...base,
          explanation_status: 'explained',
          predicted_ppr: predicted,
          actual_ppr: actual,
          absolute_error: round4(Math.abs(predicted - actual)),
          intercept: round4(explanation.intercept),
          feature_contributions: contributions,
          top_positive_contributions: positives.slice(0, TOP_CONTRIBUTIONS),
          top_negative_contributions: negatives.slice(0, TOP_CONTRIBUTIONS),
        };
      });

    const report: SeasonalPprBacktestReport = {
      report_version: SEASONAL_PPR_BACKTEST_REPORT_VERSION,
      output_kind: SEASONAL_PPR_OUTPUT_KIND,
      model_version: SEASONAL_PPR_BACKTEST_MODEL_VERSION,
      generated_at: generatedAt,
      target_definition: SEASONAL_PPR_TARGET_DEFINITION,
      input_season: SEASONAL_PPR_INPUT_SEASON,
      target_season: SEASONAL_PPR_TARGET_SEASON,
      dataset: {
        dataset_id: dataset.dataset_id,
        dataset_version: dataset.dataset_version,
        governance_status: dataset.governance_status,
        data_source: dataset.data_source,
        source_dataset_refs: dataset.source_dataset_refs,
        provenance: dataset.provenance,
        observation_count: observations.length,
        scored_row_count: scored.length,
        unavailable_row_count: unavailable.length,
      },
      feature_list: seasonalPprFeatureList,
      missing_feature_coverage: missingFeatureCoverage,
      player_history_production_only: options.playerHistoryProductionOnly
        ? {
            enabled: true,
            source_artifact_sha256: options.playerHistoryProductionOnly.sourceArtifactSha256,
            human_signoff_recorded: false,
          }
        : { enabled: false, source_artifact_sha256: null, human_signoff_recorded: false },
      evaluation_method:
        'Leave-one-out cross-validation (LOOCV) over scored rows for the ridge model and position-mean baseline; the previous-year baseline requires no fitting.',
      model: modelEvaluation,
      baselines: baselineEvaluations,
      beats_baseline: beatsBaseline,
      beats_baseline_summary: beatsBaselineSummary,
      top_misses: topMisses,
      limitations: [
        'OUTPUT IS MODEL INFERENCE, NOT OBSERVED REALITY. Predicted PPR values are estimates from a simple model and must not be presented as facts or as advice.',
        'Dataset shown here is PPM-local scaffold/fixture coverage with fixture governance, not full real 2025 coverage and not a live governed TIBER-Data pull; it must not be promoted as governed.',
        'HARNESS/LOADER VALIDATION ONLY. This proves the TIBER-Data weekly-outcome loader, contract, and backtest loop run and compare against baselines. It does NOT approve the model for 2026 predictive use until a canonical source-backed/governed TIBER-Data artifact is mounted and verified.',
        'Scope guardrails: no TIBER-Fantasy integration, no TIBER-Rookies ML, no neural networks, and no advice language are part of this harness.',
        'Single season pair (2024 inputs -> 2025 outcomes). LOOCV reduces but does not eliminate optimism; there is no out-of-period holdout season.',
        'Small sample of skill-position players only (QB/RB/WR/TE). Results do not generalize to all players, depth pieces, or rookies without 2024 input data.',
        'Season-ending injuries, role/team changes, and rookie breakouts are not modeled and drive the largest misses.',
        'Features are 2024 box-score volume/efficiency only; no schedule, age, contract, scheme, or coaching-change signals.',
        'Not integrated with TIBER-Fantasy. No downstream Management, Team Direction, scoring, promotion, or UI behavior consumes this output.',
      ],
    };

    return serviceSuccess({ report, predictions, explanations });
  } catch (error) {
    return serviceFailure({
      code: 'SEASONAL_PPR_BACKTEST_FAILED',
      message: error instanceof Error ? error.message : 'Unknown seasonal PPR backtest execution error.',
    });
  }
};
