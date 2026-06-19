import { Hono } from 'hono';
import { buildPointScenarioLab } from '../../services/pointScenarioLab/buildPointScenarioLab.js';
import { parsePointScenarioLabSeasonQuery } from '../../services/pointScenarioLab/season.js';

const LAB_ROUTE_PATH = '/api/point-scenarios/lab';

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
    const seasonResult = parsePointScenarioLabSeasonQuery(c.req.query('season'));
    if (!seasonResult.ok) {
      return c.json({ ok: false, error: seasonResult.error }, 400);
    }

    const result = buildPointScenarioLab({
      season: seasonResult.season,
      mode: 'api',
      location: LAB_ROUTE_PATH,
    });

    if (!result.ok) {
      return c.json({ ok: false, errors: result.errors }, 500);
    }

    return c.json(result.data);
  });
};
