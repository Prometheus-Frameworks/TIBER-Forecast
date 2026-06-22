/**
 * Compact, AI-agent-friendly model-context export derived from the seasonal PPR
 * backtest report (Issue #51 PPM Studio).
 *
 * This is a read-only projection of the report for copy/paste into another
 * agent. It deliberately re-states the interpretation warning so the export
 * cannot be mistaken for observed reality, advice, or a 2026-ready model.
 */
import {
  SEASONAL_PPR_OUTPUT_KIND,
  type SeasonalPprBacktestReport,
  type SeasonalPprErrorSummary,
} from '../contracts/seasonalPprBacktest.js';
import type { ScoringPosition } from '../contracts/scoring.js';
import type { TiberDataSourceDatasetRef } from '../contracts/tiberDataProjectionInput.js';

export const SEASONAL_PPR_MODEL_CONTEXT_KIND = 'ppm.seasonal-ppr.model-context.v1' as const;

export const SEASONAL_PPR_INTERPRETATION_WARNING =
  'This is model-inference harness output. It is not observed reality, not advice, and not approved for 2026 predictive use unless a governed real TIBER-Data artifact has been mounted and verified.' as const;

interface ModelContextMetrics {
  name: string;
  is_baseline: boolean;
  mae: number;
  rmse: number;
  correlation: number | null;
  rank_correlation: number | null;
  by_position: Partial<Record<ScoringPosition, { mae: number; rmse: number }>>;
}

export interface SeasonalPprModelContextExport {
  artifact_kind: typeof SEASONAL_PPR_MODEL_CONTEXT_KIND;
  output_kind: typeof SEASONAL_PPR_OUTPUT_KIND;
  model_version: string;
  report_version: string;
  generated_at: string;
  input_season: number;
  target_season: number;
  target_definition: string;
  dataset_id: string;
  dataset_version: string;
  governance_status: string;
  source_dataset_refs: TiberDataSourceDatasetRef[];
  row_counts: {
    observations: number;
    scored: number;
    unavailable: number;
  };
  model_metrics: ModelContextMetrics;
  baseline_metrics: ModelContextMetrics[];
  beats_baseline: boolean;
  beats_baseline_summary: string;
  top_misses: SeasonalPprBacktestReport['top_misses'];
  limitations: string[];
  interpretation_warning: typeof SEASONAL_PPR_INTERPRETATION_WARNING;
}

const toByPosition = (
  byPosition: Partial<Record<ScoringPosition, SeasonalPprErrorSummary>>,
): Partial<Record<ScoringPosition, { mae: number; rmse: number }>> =>
  Object.fromEntries(
    Object.entries(byPosition).map(([position, summary]) => [
      position,
      { mae: summary?.mae ?? 0, rmse: summary?.rmse ?? 0 },
    ]),
  );

const toMetrics = (
  evaluation: SeasonalPprBacktestReport['model'],
): ModelContextMetrics => ({
  name: evaluation.name,
  is_baseline: evaluation.is_baseline,
  mae: evaluation.overall.mae,
  rmse: evaluation.overall.rmse,
  correlation: evaluation.overall.correlation,
  rank_correlation: evaluation.overall.rank_correlation,
  by_position: toByPosition(evaluation.by_position),
});

export const buildSeasonalPprModelContextExport = (
  report: SeasonalPprBacktestReport,
): SeasonalPprModelContextExport => ({
  artifact_kind: SEASONAL_PPR_MODEL_CONTEXT_KIND,
  output_kind: report.output_kind,
  model_version: report.model_version,
  report_version: report.report_version,
  generated_at: report.generated_at,
  input_season: report.input_season,
  target_season: report.target_season,
  target_definition: report.target_definition,
  dataset_id: report.dataset.dataset_id,
  dataset_version: report.dataset.dataset_version,
  governance_status: report.dataset.governance_status,
  source_dataset_refs: report.dataset.source_dataset_refs,
  row_counts: {
    observations: report.dataset.observation_count,
    scored: report.dataset.scored_row_count,
    unavailable: report.dataset.unavailable_row_count,
  },
  model_metrics: toMetrics(report.model),
  baseline_metrics: report.baselines.map(toMetrics),
  beats_baseline: report.beats_baseline,
  beats_baseline_summary: report.beats_baseline_summary,
  top_misses: report.top_misses,
  limitations: report.limitations,
  interpretation_warning: SEASONAL_PPR_INTERPRETATION_WARNING,
});

/**
 * Whether the "not approved for 2026" / fixture-scaffold warning applies. True
 * for anything that is not an explicitly governed dataset (the common case for
 * this harness). Never upgrades governance — it only reads the reported status.
 */
export const seasonalPprFixtureWarningApplies = (report: SeasonalPprBacktestReport): boolean =>
  report.dataset.governance_status !== 'governed';
