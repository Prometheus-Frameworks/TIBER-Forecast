/**
 * Pure season parsing/validation for the point-scenario lab compatibility surface.
 *
 * Shared between the `/api/point-scenarios/lab` route and the on-demand export CLI
 * so both fail closed on the same rules. Kept local to this surface — not a general
 * architecture concern. See Issue #45.
 */

export const POINT_SCENARIO_LAB_MIN_SEASON = 2000;
export const POINT_SCENARIO_LAB_MAX_SEASON = 2100;

export const POINT_SCENARIO_LAB_SEASON_ERROR = `season must be an integer between ${POINT_SCENARIO_LAB_MIN_SEASON} and ${POINT_SCENARIO_LAB_MAX_SEASON}.`;

export type SeasonTokenResult =
  | { ok: true; season: number }
  | { ok: false; error: string };

export type SeasonQueryResult =
  | { ok: true; season?: number }
  | { ok: false; error: string };

/**
 * Validates a season token that is known to be *present* (e.g. an explicit
 * `--season=` value). Empty, non-numeric, non-integer, and out-of-range tokens
 * are all rejected.
 */
export const parsePointScenarioLabSeasonToken = (raw: string): SeasonTokenResult => {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: POINT_SCENARIO_LAB_SEASON_ERROR };
  }

  const parsed = Number(trimmed);
  if (
    !Number.isInteger(parsed) ||
    parsed < POINT_SCENARIO_LAB_MIN_SEASON ||
    parsed > POINT_SCENARIO_LAB_MAX_SEASON
  ) {
    return { ok: false, error: POINT_SCENARIO_LAB_SEASON_ERROR };
  }

  return { ok: true, season: parsed };
};

/**
 * Validates an optional query-style season (e.g. a route query param). An absent
 * value — `undefined` or an empty/whitespace string — means "no season filter" and
 * is valid; any present-but-invalid value is rejected.
 */
export const parsePointScenarioLabSeasonQuery = (raw: string | undefined): SeasonQueryResult => {
  if (raw === undefined || raw.trim() === '') {
    return { ok: true, season: undefined };
  }

  const result = parsePointScenarioLabSeasonToken(raw);
  return result.ok ? { ok: true, season: result.season } : { ok: false, error: result.error };
};
