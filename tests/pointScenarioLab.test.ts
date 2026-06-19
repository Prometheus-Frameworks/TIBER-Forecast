import { describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import { buildPointScenarioLab } from '../src/services/pointScenarioLab/buildPointScenarioLab.js';

const ACTION_LANGUAGE = /\b(start|sit|bench|trade|waiver|pickup|drop|add|recommend|advice|must-start)\b/i;

describe('point-scenario lab compatibility surface', () => {
  const app = createApp();

  it('exposes GET /api/point-scenarios/lab', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    expect(response.status).toBe(200);
  });

  it('returns a Fantasy-compatible payload with top-level rows and source', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    expect(Array.isArray(payload.rows)).toBe(true);
    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.available_seasons).toEqual([]);
    expect(payload.source).toEqual({
      provider: 'point-prediction-model',
      location: '/api/point-scenarios/lab',
      mode: 'api',
    });
  });

  it('includes the fields the Fantasy adapter requires on every row', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    for (const row of payload.rows) {
      // Required by Fantasy's canonical adapter schema.
      expect(typeof row.scenario_name).toBe('string');
      expect(row.scenario_name.length).toBeGreaterThan(0);
      expect(typeof row.player_name).toBe('string');
      expect(row.player_name.length).toBeGreaterThan(0);
    }
  });

  it('maps baseline/adjusted/delta from existing projection output', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();
    const row = payload.rows[0];

    expect(typeof row.baseline_projection).toBe('number');
    expect(typeof row.adjusted_projection).toBe('number');
    expect(typeof row.delta).toBe('number');
    expect(row.delta).toBeCloseTo(row.adjusted_projection - row.baseline_projection, 3);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(row.confidence_band);
  });

  it('labels the compatibility surface in provenance', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    for (const row of payload.rows) {
      expect(row.provenance.provider).toBe('point-prediction-model');
      expect(row.provenance.source_name).toBe('scenario-export');
      expect(row.provenance.source_type).toBe('compatibility_route');
      expect(typeof row.provenance.model_version).toBe('string');
      expect(typeof row.provenance.generated_at).toBe('string');
    }
  });

  it('echoes and stamps a requested season', async () => {
    const response = await app.request('/api/point-scenarios/lab?season=2025');
    const payload = await response.json();

    expect(payload.season).toBe(2025);
    expect(payload.available_seasons).toEqual([2025]);
    for (const row of payload.rows) {
      expect(row.season).toBe(2025);
    }
  });

  it('rejects an invalid season with a 400', async () => {
    const response = await app.request('/api/point-scenarios/lab?season=not-a-year');
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
  });

  it('introduces no advice/action language in row text', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    for (const row of payload.rows) {
      if (row.explanation) {
        expect(row.explanation).not.toMatch(ACTION_LANGUAGE);
      }
      for (const note of row.notes) {
        expect(note).not.toMatch(ACTION_LANGUAGE);
      }
    }
  });

  it('builds an artifact-mode payload for on-demand export', () => {
    const result = buildPointScenarioLab({ mode: 'artifact', location: 'point_scenario_lab.json', generatedAt: '2026-06-19T00:00:00.000Z' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.source.mode).toBe('artifact');
    expect(result.data.rows[0].provenance.source_type).toBe('data_lab_surface');
    expect(result.data.rows[0].provenance.generated_at).toBe('2026-06-19T00:00:00.000Z');
  });
});
