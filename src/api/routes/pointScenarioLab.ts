import { Hono } from 'hono';
import { buildPointScenarioLab } from '../../services/pointScenarioLab/buildPointScenarioLab.js';

const LAB_ROUTE_PATH = '/api/point-scenarios/lab';

const parseSeasonParam = (raw: string | undefined): { season?: number; invalid?: true } => {
  if (raw === undefined || raw.trim() === '') {
    return {};
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    return { invalid: true };
  }

  return { season: parsed };
};

/**
 * Registers the point-scenario lab compatibility / Data Lab surface.
 *
 * This is intentionally NOT part of the primary scoring kernel. It returns a
 * canonical lab payload (top-level `rows`/`source`) that TIBER-Fantasy's existing
 * Point Scenario Lab adapter consumes directly, so the response is not wrapped in
 * the `{ ok, data }` envelope used by other routes. See Issue #43.
 */
export const registerPointScenarioLabRoutes = (app: Hono) => {
  app.get(LAB_ROUTE_PATH, (c) => {
    const seasonParam = parseSeasonParam(c.req.query('season'));
    if (seasonParam.invalid) {
      return c.json(
        { ok: false, error: 'season must be an integer between 2000 and 2100.' },
        400,
      );
    }

    const result = buildPointScenarioLab({
      season: seasonParam.season,
      mode: 'api',
      location: LAB_ROUTE_PATH,
    });

    if (!result.ok) {
      return c.json({ ok: false, errors: result.errors }, 500);
    }

    return c.json(result.data);
  });
};
