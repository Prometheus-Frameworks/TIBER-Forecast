import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import {
  DEFAULT_SEASONAL_PPR_ARTIFACT_DIR,
  loadSeasonalPprExplanations,
  loadSeasonalPprStudioArtifacts,
  parseExplanationsJsonl,
  parsePredictionsJsonl,
  SEASONAL_PPR_GENERATE_COMMAND,
} from '../src/studio/loadSeasonalPprArtifacts.js';
import {
  SEASONAL_PPR_INTERPRETATION_WARNING,
  SEASONAL_PPR_MODEL_CONTEXT_KIND,
  buildSeasonalPprModelContextExport,
  seasonalPprFixtureWarningApplies,
} from '../src/studio/buildModelContextExport.js';
import { renderStudioPage } from '../src/studio/renderStudioPage.js';
import type { SeasonalPprBacktestReport } from '../src/contracts/seasonalPprBacktest.js';

// The PR #50 artifacts are committed at the default path, so the default load
// works from the repo root (vitest cwd).
const loadOk = async () => {
  const result = await loadSeasonalPprStudioArtifacts();
  if (!result.ok) {
    throw new Error(`Expected artifacts to load, got: ${result.errors.map((e) => e.code).join(', ')}`);
  }
  return result.data;
};

describe('loadSeasonalPprStudioArtifacts', () => {
  it('loads the committed seasonal PPR report and predictions', async () => {
    const { report, predictions } = await loadOk();
    expect(report.model_version).toBeTruthy();
    expect(report.report_version).toBeTruthy();
    expect(report.output_kind).toBe('model-inference');
    expect(predictions.length).toBeGreaterThan(0);
  });

  it('fails gracefully with generation guidance when the artifact is missing', async () => {
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'ppm-studio-empty-'));
    try {
      const result = await loadSeasonalPprStudioArtifacts(emptyDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].code).toBe('SEASONAL_PPR_ARTIFACT_NOT_FOUND');
        expect(JSON.stringify(result.errors[0].details)).toContain(SEASONAL_PPR_GENERATE_COMMAND);
      }
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('fails closed when the report is present but predictions are missing', async () => {
    const partialDir = await mkdtemp(path.join(os.tmpdir(), 'ppm-studio-partial-'));
    try {
      // Copy only the report into the partial mount (no predictions JSONL).
      const sourceReport = path.join(DEFAULT_SEASONAL_PPR_ARTIFACT_DIR, 'seasonal_ppr_backtest_report.json');
      await copyFile(sourceReport, path.join(partialDir, 'seasonal_ppr_backtest_report.json'));

      const result = await loadSeasonalPprStudioArtifacts(partialDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0].code).toBe('SEASONAL_PPR_PREDICTIONS_NOT_FOUND');
        expect(JSON.stringify(result.errors[0].details)).toContain(SEASONAL_PPR_GENERATE_COMMAND);
      }
    } finally {
      await rm(partialDir, { recursive: true, force: true });
    }
  });
});

describe('parsePredictionsJsonl', () => {
  it('parses non-empty lines and ignores blanks', () => {
    const rows = parsePredictionsJsonl('{"a":1}\n\n{"a":2}\n');
    expect(rows).toHaveLength(2);
  });

  it('throws on a malformed line', () => {
    expect(() => parsePredictionsJsonl('{"a":1}\nnot-json')).toThrow(/line 2/);
  });
});

describe('buildSeasonalPprModelContextExport', () => {
  it('produces a compact, warning-bearing export shape', async () => {
    const { report } = await loadOk();
    const ctx = buildSeasonalPprModelContextExport(report);

    expect(ctx.artifact_kind).toBe(SEASONAL_PPR_MODEL_CONTEXT_KIND);
    expect(ctx.output_kind).toBe('model-inference');
    expect(ctx.interpretation_warning).toBe(SEASONAL_PPR_INTERPRETATION_WARNING);
    expect(ctx.interpretation_warning).toMatch(/not approved for 2026/i);
    expect(ctx.model_version).toBe(report.model_version);
    expect(ctx.row_counts.scored).toBe(report.dataset.scored_row_count);
    expect(Array.isArray(ctx.baseline_metrics)).toBe(true);
    expect(ctx.baseline_metrics.length).toBe(report.baselines.length);
    expect(ctx.model_metrics.mae).toBe(report.model.overall.mae);
    expect(ctx.limitations.length).toBeGreaterThan(0);
    expect(ctx.top_misses.length).toBeGreaterThan(0);
    // Provenance: scaffold vs mounted artifact is carried into the export.
    expect(ctx.data_source).toBe(report.dataset.data_source);
    expect(['bundled-scaffold', 'mounted-artifact']).toContain(ctx.data_source);
  });
});

describe('seasonalPprFixtureWarningApplies', () => {
  const base = (governance: string): SeasonalPprBacktestReport =>
    ({ dataset: { governance_status: governance } } as unknown as SeasonalPprBacktestReport);

  it('warns for non-governed (fixture/scaffold) datasets', () => {
    expect(seasonalPprFixtureWarningApplies(base('fixture'))).toBe(true);
    expect(seasonalPprFixtureWarningApplies(base('unknown'))).toBe(true);
  });

  it('does not warn for an explicitly governed dataset', () => {
    expect(seasonalPprFixtureWarningApplies(base('governed'))).toBe(false);
  });
});

describe('renderStudioPage', () => {
  it('labels output as model inference and shows the fixture/2026 warning', async () => {
    const { report, predictions } = await loadOk();
    const html = renderStudioPage(report, predictions);
    expect(html).toContain('MODEL INFERENCE');
    expect(html).toContain('READ-ONLY');
    expect(html).toContain('NOT OBSERVED REALITY');
    expect(html).toContain('NOT ADVICE');
    expect(html).toContain('NOT APPROVED FOR 2026 PREDICTIVE USE');
    expect(html).toContain(report.model_version);
    expect(html).toContain(report.beats_baseline_summary);
  });

  it('surfaces whether the run used the bundled scaffold or a mounted artifact', () => {
    const base = (dataSource: string): SeasonalPprBacktestReport =>
      ({
        input_season: 2024,
        target_season: 2025,
        output_kind: 'model-inference',
        model_version: 'm',
        report_version: 'r',
        generated_at: 'now',
        target_definition: 't',
        beats_baseline_summary: 's',
        beats_baseline: true,
        model: { name: 'm', overall: {}, by_position: {} },
        baselines: [],
        top_misses: [],
        limitations: [],
        dataset: {
          dataset_id: 'd',
          dataset_version: 'v',
          governance_status: 'fixture',
          data_source: dataSource,
          observation_count: 0,
          scored_row_count: 0,
          unavailable_row_count: 0,
        },
      } as unknown as SeasonalPprBacktestReport);

    expect(renderStudioPage(base('bundled-scaffold'), [])).toContain('bundled scaffold fixture');
    expect(renderStudioPage(base('mounted-artifact'), [])).toContain('mounted TIBER-Data artifact');
  });

  it('does not claim scaffold provenance for a missing/unknown data_source', () => {
    // An older or externally mounted report may lack data_source entirely.
    const report = {
      input_season: 2024,
      target_season: 2025,
      output_kind: 'model-inference',
      model_version: 'm',
      report_version: 'r',
      generated_at: 'now',
      target_definition: 't',
      beats_baseline_summary: 's',
      beats_baseline: true,
      model: { name: 'm', overall: {}, by_position: {} },
      baselines: [],
      top_misses: [],
      limitations: [],
      dataset: {
        dataset_id: 'd',
        dataset_version: 'v',
        governance_status: 'fixture',
        // data_source intentionally absent
        observation_count: 0,
        scored_row_count: 0,
        unavailable_row_count: 0,
      },
    } as unknown as SeasonalPprBacktestReport;

    const html = renderStudioPage(report, []);
    expect(html).toContain('unknown / unlabeled source');
    expect(html).toContain('data source: unknown');
    expect(html).not.toContain('bundled scaffold fixture');
  });
});

describe('studio routes', () => {
  afterEach(() => {
    delete process.env.PPM_STUDIO_ARTIFACT_DIR;
  });

  it('does not break the existing API root index', async () => {
    const app = createApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; endpoints: Record<string, string> };
    expect(body.ok).toBe(true);
    expect(body.endpoints.studio).toBe('/studio');
  });

  it('renders /studio without crashing', async () => {
    const app = createApp();
    const res = await app.request('/studio');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('PPM Studio');
  });

  it('serves report, predictions, and model-context JSON endpoints', async () => {
    const app = createApp();

    const report = await app.request('/api/studio/seasonal-ppr/report');
    expect(report.status).toBe(200);
    expect((await report.json() as { output_kind: string }).output_kind).toBe('model-inference');

    const predictions = await app.request('/api/studio/seasonal-ppr/predictions');
    expect(predictions.status).toBe(200);
    expect((await predictions.json() as { count: number }).count).toBeGreaterThan(0);

    const ctx = await app.request('/api/studio/seasonal-ppr/export/model-context');
    expect(ctx.status).toBe(200);
    expect((await ctx.json() as { artifact_kind: string }).artifact_kind).toBe(SEASONAL_PPR_MODEL_CONTEXT_KIND);
  });

  it('returns 404 with guidance when artifacts are missing', async () => {
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'ppm-studio-route-'));
    process.env.PPM_STUDIO_ARTIFACT_DIR = emptyDir;
    try {
      const app = createApp();

      const page = await app.request('/studio');
      expect(page.status).toBe(404);
      const pageHtml = await page.text();
      expect(pageHtml).toContain('No seasonal PPR backtest artifact found');
      expect(pageHtml).toContain(SEASONAL_PPR_GENERATE_COMMAND);

      const report = await app.request('/api/studio/seasonal-ppr/report');
      expect(report.status).toBe(404);
      expect((await report.json() as { ok: boolean }).ok).toBe(false);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('parseExplanationsJsonl', () => {
  it('parses non-empty lines and ignores blanks', () => {
    const rows = parseExplanationsJsonl('{"player_id":"a"}\n\n{"player_id":"b"}\n');
    expect(rows).toHaveLength(2);
  });

  it('throws on a malformed line', () => {
    expect(() => parseExplanationsJsonl('{"player_id":"a"}\nnot-json')).toThrow(/line 2/);
  });
});

describe('seasonal PPR explanation surfaces', () => {
  afterEach(() => {
    delete process.env.PPM_STUDIO_ARTIFACT_DIR;
  });

  it('loads the committed explanation artifact', async () => {
    const result = await loadSeasonalPprExplanations();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.explanations.length).toBeGreaterThan(0);
      const explained = result.data.explanations.find((row) => row.explanation_status === 'explained');
      expect(explained?.explanation_warning).toMatch(/model-mechanics explanation/);
      expect(explained?.feature_contributions.length).toBeGreaterThan(0);
    }
  });

  it('serves all explanations and a single player, 404 for an unknown player', async () => {
    const app = createApp();

    const all = await app.request('/api/studio/seasonal-ppr/explanations');
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as {
      count: number;
      explanations: Array<{ player_id: string; explanation_status: string }>;
    };
    expect(allBody.count).toBeGreaterThan(0);

    const explained = allBody.explanations.find((row) => row.explanation_status === 'explained');
    const single = await app.request(`/api/studio/seasonal-ppr/explanations/${explained?.player_id}`);
    expect(single.status).toBe(200);
    expect((await single.json() as { player_id: string }).player_id).toBe(explained?.player_id);

    const missing = await app.request('/api/studio/seasonal-ppr/explanations/no-such-player');
    expect(missing.status).toBe(404);
    expect((await missing.json() as { ok: boolean }).ok).toBe(false);
  });

  it('renders the ?explain= panel with contributions and the mechanics warning', async () => {
    const app = createApp();
    const all = (await (await app.request('/api/studio/seasonal-ppr/explanations')).json()) as {
      explanations: Array<{ player_id: string; explanation_status: string }>;
    };
    const explained = all.explanations.find((row) => row.explanation_status === 'explained');

    const page = await app.request(`/studio?explain=${explained?.player_id}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Per-player explanation');
    expect(html).toContain('This is a model-mechanics explanation, not a causal football');
    expect(html).toContain('Pushed prediction up');
    expect(html).toContain('Pushed prediction down');
    expect(html).toContain('Model contribution');
  });

  it('fails gracefully (404) when the explanation artifact is absent', async () => {
    const partialDir = await mkdtemp(path.join(os.tmpdir(), 'ppm-studio-noexpl-'));
    process.env.PPM_STUDIO_ARTIFACT_DIR = partialDir;
    try {
      // Copy only report + predictions, not the explanations file.
      await copyFile(
        path.join(DEFAULT_SEASONAL_PPR_ARTIFACT_DIR, 'seasonal_ppr_backtest_report.json'),
        path.join(partialDir, 'seasonal_ppr_backtest_report.json'),
      );
      await copyFile(
        path.join(DEFAULT_SEASONAL_PPR_ARTIFACT_DIR, 'seasonal_ppr_predictions.jsonl'),
        path.join(partialDir, 'seasonal_ppr_predictions.jsonl'),
      );
      const app = createApp();

      // Main page still renders (explanations are additive) without Explain links.
      const page = await app.request('/studio');
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain('PPM Studio');
      expect(html).not.toContain('?explain=');

      // Explanation API fails closed with guidance.
      const explanations = await app.request('/api/studio/seasonal-ppr/explanations');
      expect(explanations.status).toBe(404);
      const body = (await explanations.json()) as { ok: boolean; errors: Array<{ code: string }> };
      expect(body.ok).toBe(false);
      expect(body.errors[0].code).toBe('SEASONAL_PPR_EXPLANATIONS_NOT_FOUND');
    } finally {
      await rm(partialDir, { recursive: true, force: true });
    }
  });
});

describe('renderStudioPage metric glossary', () => {
  const loadOkPair = async () => {
    const result = await loadSeasonalPprStudioArtifacts();
    if (!result.ok) throw new Error('expected artifacts');
    return result.data;
  };

  it('explains MAE, RMSE, correlation, rank correlation, and baseline in plain language', async () => {
    const { report, predictions } = await loadOkPair();
    const html = renderStudioPage(report, predictions);
    expect(html).toContain('What these metrics mean');
    expect(html).toContain('Average miss');
    expect(html).toContain('Big-miss sensitive');
    expect(html).toContain('Direction signal');
    expect(html).toContain('Ordering signal');
    expect(html).toContain('Better than dumb comparison');
    expect(html).toContain('do not make the model decision-grade or approved for 2026 predictive use');
  });
});
