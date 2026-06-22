/**
 * Read-only loader for the seasonal PPR backtest artifacts shipped in PR #50
 * (Issue #51 PPM Studio).
 *
 * Reads the deterministic report + prediction artifacts from the default
 * backtest output path. Fails gracefully (never throws to the caller, never
 * synthesizes data) so the Studio UI/API can show a "not found" state with
 * generation instructions instead of crashing the server.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SEASONAL_PPR_PREDICTIONS_FILENAME,
  SEASONAL_PPR_REPORT_FILENAME,
} from '../artifacts/writeSeasonalPprBacktestArtifacts.js';
import type {
  SeasonalPprBacktestReport,
  SeasonalPprPredictionRow,
} from '../contracts/seasonalPprBacktest.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../services/result.js';

/** Default output path the PR #50 runner writes to. */
export const DEFAULT_SEASONAL_PPR_ARTIFACT_DIR = path.join('data', 'backtests', 'seasonal-ppr');

/** How an operator regenerates the artifacts. Surfaced verbatim in the UI/API. */
export const SEASONAL_PPR_GENERATE_COMMAND = 'npm run backtest:seasonal-ppr';

export interface SeasonalPprStudioArtifacts {
  report: SeasonalPprBacktestReport;
  predictions: SeasonalPprPredictionRow[];
  /** Resolved absolute paths the artifacts were read from. */
  sourcePaths: { report: string; predictions: string };
}

const resolveDir = (artifactDir?: string): string =>
  path.resolve(artifactDir ?? process.env.PPM_STUDIO_ARTIFACT_DIR ?? DEFAULT_SEASONAL_PPR_ARTIFACT_DIR);

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';

/** Parse a JSONL string into prediction rows; throws on a malformed line. */
export const parsePredictionsJsonl = (raw: string): SeasonalPprPredictionRow[] =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as SeasonalPprPredictionRow;
      } catch {
        throw new Error(`Malformed prediction row at line ${index + 1}.`);
      }
    });

export const loadSeasonalPprStudioArtifacts = async (
  artifactDir?: string,
): Promise<ServiceResult<SeasonalPprStudioArtifacts>> => {
  const dir = resolveDir(artifactDir);
  const reportPath = path.join(dir, SEASONAL_PPR_REPORT_FILENAME);
  const predictionsPath = path.join(dir, SEASONAL_PPR_PREDICTIONS_FILENAME);

  let reportRaw: string;
  try {
    reportRaw = await readFile(reportPath, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return serviceFailure({
        code: 'SEASONAL_PPR_ARTIFACT_NOT_FOUND',
        message: `No seasonal PPR backtest artifact found at ${reportPath}.`,
        details: { generateWith: SEASONAL_PPR_GENERATE_COMMAND, expectedDir: dir },
      });
    }
    return serviceFailure({
      code: 'SEASONAL_PPR_ARTIFACT_READ_FAILED',
      message: error instanceof Error ? error.message : 'Failed to read the seasonal PPR report artifact.',
    });
  }

  let report: SeasonalPprBacktestReport;
  try {
    report = JSON.parse(reportRaw) as SeasonalPprBacktestReport;
  } catch {
    return serviceFailure({
      code: 'SEASONAL_PPR_ARTIFACT_INVALID',
      message: `The seasonal PPR report artifact at ${reportPath} is not valid JSON.`,
      details: { generateWith: SEASONAL_PPR_GENERATE_COMMAND },
    });
  }

  // Predictions are optional for read-through: a present report with missing
  // predictions still renders, just with an empty table.
  let predictions: SeasonalPprPredictionRow[] = [];
  try {
    predictions = parsePredictionsJsonl(await readFile(predictionsPath, 'utf8'));
  } catch (error) {
    if (!isMissing(error)) {
      return serviceFailure({
        code: 'SEASONAL_PPR_PREDICTIONS_INVALID',
        message: error instanceof Error ? error.message : 'Failed to read the seasonal PPR predictions artifact.',
        details: { generateWith: SEASONAL_PPR_GENERATE_COMMAND },
      });
    }
  }

  return serviceSuccess({
    report,
    predictions,
    sourcePaths: { report: reportPath, predictions: predictionsPath },
  });
};
