import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import {
  DEFAULT_SEASONAL_PPR_ARTIFACT_DIR,
  loadSeasonalPprStudioArtifacts,
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
