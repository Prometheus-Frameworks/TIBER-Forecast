import { Hono } from 'hono';
import { buildSeasonalPprModelContextExport } from '../../studio/buildModelContextExport.js';
import { loadSeasonalPprStudioArtifacts } from '../../studio/loadSeasonalPprArtifacts.js';
import { renderStudioNotFound, renderStudioPage } from '../../studio/renderStudioPage.js';

/**
 * PPM Studio: a minimal, read-only inspection surface for the seasonal PPR
 * backtest artifacts shipped in PR #50 (Issue #51).
 *
 * This is a "glass box" for operators — it makes the report/predictions
 * readable and exportable. It does not change model math, retrain, integrate
 * with TIBER-Fantasy, or make any output more authoritative. Missing artifacts
 * fail gracefully with generation instructions; data is never synthesized.
 */
export const registerStudioRoutes = (app: Hono) => {
  // Server-rendered inspection page.
  app.get('/studio', async (c) => {
    const result = await loadSeasonalPprStudioArtifacts();
    if (!result.ok) {
      const message = result.errors[0]?.message ?? 'No seasonal PPR backtest artifact found.';
      return c.html(renderStudioNotFound(message), 404);
    }
    return c.html(renderStudioPage(result.data.report, result.data.predictions));
  });

  // Latest seasonal PPR backtest report JSON (raw report shape).
  app.get('/api/studio/seasonal-ppr/report', async (c) => {
    const result = await loadSeasonalPprStudioArtifacts();
    if (!result.ok) {
      return c.json({ ok: false, errors: result.errors }, 404);
    }
    return c.json(result.data.report);
  });

  // Parsed prediction rows from the JSONL artifact.
  app.get('/api/studio/seasonal-ppr/predictions', async (c) => {
    const result = await loadSeasonalPprStudioArtifacts();
    if (!result.ok) {
      return c.json({ ok: false, errors: result.errors }, 404);
    }
    return c.json({
      count: result.data.predictions.length,
      predictions: result.data.predictions,
    });
  });

  // Compact, AI-agent-friendly model-context export derived from the report.
  app.get('/api/studio/seasonal-ppr/export/model-context', async (c) => {
    const result = await loadSeasonalPprStudioArtifacts();
    if (!result.ok) {
      return c.json({ ok: false, errors: result.errors }, 404);
    }
    return c.json(buildSeasonalPprModelContextExport(result.data.report));
  });
};
