/**
 * Parse a raw TIBER-Data weekly PPR artifact (as read from disk) into a row
 * array the loader can consume. Tolerant of a top-level array or a wrapping
 * object envelope, but fails closed on anything that is not row-shaped. Deep
 * per-row validation (and dropping/aggregation) is the loader's job.
 */
import type { TiberDataWeeklyPprRow } from '../../contracts/tiberDataWeeklyOutcomes.js';
import { serviceFailure, serviceSuccess, type ServiceResult } from '../../services/result.js';

const ROW_ARRAY_KEYS = ['rows', 'data', 'records', 'player_weekly_ppr_outcomes', 'outcomes'] as const;

export const parseTiberDataWeeklyPprArtifact = (
  raw: unknown,
): ServiceResult<TiberDataWeeklyPprRow[]> => {
  let candidate: unknown = raw;

  if (candidate != null && !Array.isArray(candidate) && typeof candidate === 'object') {
    const envelope = candidate as Record<string, unknown>;
    const key = ROW_ARRAY_KEYS.find((name) => Array.isArray(envelope[name]));
    if (key) {
      candidate = envelope[key];
    }
  }

  if (!Array.isArray(candidate)) {
    return serviceFailure({
      code: 'TIBER_DATA_WEEKLY_ARTIFACT_NOT_ARRAY',
      message: `Expected a row array or an object containing one of [${ROW_ARRAY_KEYS.join(', ')}].`,
    });
  }

  const nonObjectRows = candidate.filter((row) => row == null || typeof row !== 'object').length;
  if (nonObjectRows > 0) {
    return serviceFailure({
      code: 'TIBER_DATA_WEEKLY_ARTIFACT_MALFORMED_ROWS',
      message: `Artifact contains ${nonObjectRows} non-object row(s); expected weekly PPR row objects.`,
    });
  }

  return serviceSuccess(candidate as TiberDataWeeklyPprRow[]);
};
