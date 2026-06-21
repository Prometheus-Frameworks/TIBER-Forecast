/**
 * Deterministic writer for the seasonal PPR backtest outputs (Issue #49).
 *
 * Emits two read-only artifacts into the output directory:
 *  - `seasonal_ppr_backtest_report.json` (pretty JSON)
 *  - `seasonal_ppr_predictions.jsonl` (one governed prediction row per line)
 *
 * Serialization is stable (insertion-ordered keys, sorted rows upstream) so
 * repeated runs with the same `generatedAt` produce byte-identical files. The
 * artifacts are not auto-promoted and must not be consumed downstream until a
 * later contract/display PR is approved.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  SeasonalPprBacktestReport,
  SeasonalPprPredictionRow,
} from '../contracts/seasonalPprBacktest.js';
import { serviceFailure, serviceSuccess } from '../services/result.js';
import type { ServiceResult } from '../services/result.js';

export const SEASONAL_PPR_REPORT_FILENAME = 'seasonal_ppr_backtest_report.json';
export const SEASONAL_PPR_PREDICTIONS_FILENAME = 'seasonal_ppr_predictions.jsonl';

export interface WriteSeasonalPprBacktestArtifactsInput {
  output_dir: string;
  report: SeasonalPprBacktestReport;
  predictions: SeasonalPprPredictionRow[];
}

export interface WrittenSeasonalPprArtifact {
  artifact: 'report' | 'predictions';
  path: string;
  row_count: number;
}

export interface WriteSeasonalPprBacktestArtifactsOutput {
  output_dir: string;
  written_artifacts: WrittenSeasonalPprArtifact[];
}

export type WriteSeasonalPprBacktestArtifactsResult = ServiceResult<WriteSeasonalPprBacktestArtifactsOutput>;

const prettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const jsonl = (rows: readonly unknown[]): string =>
  rows.length === 0 ? '' : `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;

export const writeSeasonalPprBacktestArtifacts = async (
  input: WriteSeasonalPprBacktestArtifactsInput,
): Promise<WriteSeasonalPprBacktestArtifactsResult> => {
  try {
    const outputDir = path.resolve(input.output_dir);
    await mkdir(outputDir, { recursive: true });

    const reportPath = path.join(outputDir, SEASONAL_PPR_REPORT_FILENAME);
    const predictionsPath = path.join(outputDir, SEASONAL_PPR_PREDICTIONS_FILENAME);

    await writeFile(reportPath, prettyJson(input.report), 'utf8');
    await writeFile(predictionsPath, jsonl(input.predictions), 'utf8');

    return serviceSuccess({
      output_dir: outputDir,
      written_artifacts: [
        { artifact: 'report', path: reportPath, row_count: 1 },
        { artifact: 'predictions', path: predictionsPath, row_count: input.predictions.length },
      ],
    });
  } catch (error) {
    return serviceFailure({
      code: 'SEASONAL_PPR_ARTIFACT_WRITE_FAILED',
      message: error instanceof Error ? error.message : 'Unknown seasonal PPR artifact write error.',
    });
  }
};
