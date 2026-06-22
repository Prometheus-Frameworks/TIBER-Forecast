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
  SEASONAL_PPR_INPUT_SEASON,
  SEASONAL_PPR_OUTPUT_KIND,
  SEASONAL_PPR_PREDICTION_ARTIFACT_VERSION,
  SEASONAL_PPR_TARGET_DEFINITION,
  SEASONAL_PPR_TARGET_SEASON,
  type SeasonalPlayerObservation,
  type SeasonalPprBacktestReport,
  type SeasonalPprDatasetDescriptor,
  type SeasonalPprModelEvaluation,
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
} from '../models/seasonal/seasonalPprModel.js';
import { serviceFailure, serviceSuccess } from './result.js';
import type { ServiceResult } from './result.js';

const MIN_SCORED_ROWS = 4;

export interface RunSeasonalPprBacktestOptions {
  /** Deterministic timestamp stamped onto every output. Defaults to now. */
  generatedAt?: string;
  /** Ridge L2 penalty override. */
  lambda?: number;
}

export interface RunSeasonalPprBacktestOutput {
  report: SeasonalPprBacktestReport;
  predictions: SeasonalPprPredictionRow[];
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
  return present;
};

const featureValuePresent = (observation: SeasonalPlayerObservation, feature: string): boolean =>
  featuresPresent(observation).includes(feature);

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
    const observations = dataset.observations;

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

    const prevYearModel = baselinePrevYearPpr();

    for (const target of scored) {
      const trainRows = scored.filter((row) => row.player_id !== target.player_id);
      const model = trainSeasonalRidgeModel(trainRows, { lambda: options.lambda });
      modelLoocv.set(target.player_id, model.predict(target));

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

    return serviceSuccess({ report, predictions });
  } catch (error) {
    return serviceFailure({
      code: 'SEASONAL_PPR_BACKTEST_FAILED',
      message: error instanceof Error ? error.message : 'Unknown seasonal PPR backtest execution error.',
    });
  }
};
