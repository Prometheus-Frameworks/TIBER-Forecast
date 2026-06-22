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
  SEASONAL_PPR_EXPLANATIONS_FILENAME,
  SEASONAL_PPR_PREDICTIONS_FILENAME,
  SEASONAL_PPR_REPORT_FILENAME,
} from '../artifacts/writeSeasonalPprBacktestArtifacts.js';
import type {
  SeasonalPprBacktestReport,
  SeasonalPprPredictionExplanation,
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

  // Fail closed on an incomplete artifact set: the runner always writes the
  // report and predictions together, so a missing predictions file is an
  // incomplete/partial mount, not an empty result. Surfacing it (rather than
  // rendering "no rows") avoids misleading an operator into trusting a partial
  // backtest artifact set.
  let predictionsRaw: string;
  try {
    predictionsRaw = await readFile(predictionsPath, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return serviceFailure({
        code: 'SEASONAL_PPR_PREDICTIONS_NOT_FOUND',
        message: `No seasonal PPR predictions artifact found at ${predictionsPath} (the report is present but the prediction set is missing).`,
        details: { generateWith: SEASONAL_PPR_GENERATE_COMMAND, expectedDir: dir },
      });
    }
    return serviceFailure({
      code: 'SEASONAL_PPR_PREDICTIONS_READ_FAILED',
      message: error instanceof Error ? error.message : 'Failed to read the seasonal PPR predictions artifact.',
    });
  }

  let predictions: SeasonalPprPredictionRow[];
  try {
    predictions = parsePredictionsJsonl(predictionsRaw);
  } catch (error) {
    return serviceFailure({
      code: 'SEASONAL_PPR_PREDICTIONS_INVALID',
      message: error instanceof Error ? error.message : 'Failed to parse the seasonal PPR predictions artifact.',
      details: { generateWith: SEASONAL_PPR_GENERATE_COMMAND },
    });
  }

  return serviceSuccess({
    report,
    predictions,
    sourcePaths: { report: reportPath, predictions: predictionsPath },
  });
};

/** Parse a JSONL string into explanation rows; throws on a malformed line. */
export const parseExplanationsJsonl = (raw: string): SeasonalPprPredictionExplanation[] =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as SeasonalPprPredictionExplanation;
      } catch {
        throw new Error(`Malformed explanation row at line ${index + 1}.`);
      }
    });

export interface SeasonalPprStudioExplanations {
  explanations: SeasonalPprPredictionExplanation[];
  /** Resolved absolute path the explanations were read from. */
  sourcePath: string;
}

/**
 * Read-only loader for the additive per-player explanation artifact. Kept
 * SEPARATE from the report/predictions load so an older or externally mounted
 * artifact set that predates this file still renders the main Studio page; the
 * explanation surfaces fail gracefully (404 + generation guidance) instead.
 */
export const loadSeasonalPprExplanations = async (
  artifactDir?: string,
): Promise<ServiceResult<SeasonalPprStudioExplanations>> => {
  const dir = resolveDir(artifactDir);
  const explanationsPath = path.join(dir, SEASONAL_PPR_EXPLANATIONS_FILENAME);

  let raw: string;
  try {
    raw = await readFile(explanationsPath, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return serviceFailure({
        code: 'SEASONAL_PPR_EXPLANATIONS_NOT_FOUND',
        message: `No seasonal PPR explanation artifact found at ${explanationsPath}.`,
        details: { generateWith: SEASONAL_PPR_GENERATE_COMMAND, expectedDir: dir },
      });
    }
    return serviceFailure({
      code: 'SEASONAL_PPR_EXPLANATIONS_READ_FAILED',
      message: error instanceof Error ? error.message : 'Failed to read the seasonal PPR explanation artifact.',
    });
  }

  let explanations: SeasonalPprPredictionExplanation[];
  try {
    explanations = parseExplanationsJsonl(raw);
  } catch (error) {
    return serviceFailure({
      code: 'SEASONAL_PPR_EXPLANATIONS_INVALID',
      message: error instanceof Error ? error.message : 'Failed to parse the seasonal PPR explanation artifact.',
      details: { generateWith: SEASONAL_PPR_GENERATE_COMMAND },
    });
  }

  return serviceSuccess({ explanations, sourcePath: explanationsPath });
};
