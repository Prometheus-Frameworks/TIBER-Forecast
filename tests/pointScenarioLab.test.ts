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

  it('uses the post-event team so team matches the adjusted projection', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    const tradeRow = payload.rows.find((row: { scenario_id: string }) => row.scenario_id === 'waddle-to-broncos');
    expect(tradeRow).toBeDefined();
    // Player is traded MIA -> DEN; the adjusted projection is computed against DEN.
    expect(tradeRow.team).toBe('DEN');
    expect(tradeRow.raw_fields.previous_team).toBe('MIA');
    expect(tradeRow.raw_fields.current_team).toBe('DEN');
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

  it('exposes dataset-level governance/contract/freshness metadata on the route', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    expect(payload.metadata).toBeDefined();
    // Exact dataset-level contract literal.
    expect(payload.metadata.contractVersion).toBe('point_scenario_lab_v1');
    // Dataset-level freshness timestamp is present and parseable.
    expect(typeof payload.metadata.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(payload.metadata.generatedAt))).toBe(false);
  });

  it('marks the seeded route/export output as fixture, never governed', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    expect(payload.metadata.governanceStatus).toBe('fixture');
    expect(payload.metadata.governanceStatus).not.toBe('governed');
    // We know the source explicitly (seeded registry), so it is an explicit marker.
    expect(payload.metadata.governanceSource).toBe('explicit_marker');
  });

  it('keeps row-level provenance intact alongside the new dataset-level metadata', async () => {
    const response = await app.request('/api/point-scenarios/lab');
    const payload = await response.json();

    for (const row of payload.rows) {
      expect(row.provenance.provider).toBe('point-prediction-model');
      expect(typeof row.provenance.model_version).toBe('string');
      expect(typeof row.provenance.generated_at).toBe('string');
    }
    // Backward-compatible: existing canonical top-level shape is unchanged.
    expect(Array.isArray(payload.rows)).toBe(true);
    expect(payload.source).toEqual({
      provider: 'point-prediction-model',
      location: '/api/point-scenarios/lab',
      mode: 'api',
    });
  });

  it('the artifact export carries the same dataset-level metadata as the route', () => {
    const result = buildPointScenarioLab({ mode: 'artifact', location: 'point_scenario_lab.json', generatedAt: '2026-06-19T00:00:00.000Z' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.metadata.contractVersion).toBe('point_scenario_lab_v1');
    expect(result.data.metadata.generatedAt).toBe('2026-06-19T00:00:00.000Z');
    expect(result.data.metadata.governanceStatus).toBe('fixture');
    expect(result.data.metadata.governanceSource).toBe('explicit_marker');
  });

  it('lets an explicit governed assertion flow through to dataset-level metadata', () => {
    const result = buildPointScenarioLab({
      generatedAt: '2026-06-19T00:00:00.000Z',
      governance: { status: 'governed', source: 'explicit_marker', promotedAt: '2026-06-19T01:00:00.000Z' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.metadata.governanceStatus).toBe('governed');
    expect(result.data.metadata.governanceSource).toBe('explicit_marker');
    expect(result.data.metadata.promotedAt).toBe('2026-06-19T01:00:00.000Z');
  });
});
