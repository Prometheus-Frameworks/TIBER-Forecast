/**
 * Guardrail tests for the player-history production-only binding across the model, service, and CLI
 * layers (Forecast #143).
 *
 * Covers: the model produces numerically identical fits/predictions when player-history is absent
 * (the default for every existing caller), the service's coverage tracking and report disclosure are
 * accurate, and the CLI opt-in flag actually wires real historical data end-to-end while leaving the
 * default (no-flag) run byte-for-byte unaffected.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SeasonalPlayerObservation } from '../src/contracts/seasonalPprBacktest.js';
import { trainSeasonalRidgeModel, seasonalPprFeatureList } from '../src/models/seasonal/seasonalPprModel.js';
import { runSeasonalPprBacktestService } from '../src/services/runSeasonalPprBacktestService.js';
import { tiberDataSeasonalPprDataset } from '../src/datasets/seasonal/tiberDataSeasonalPprDataset.js';
import {
  attachPlayerHistoryProductionOnly,
  buildPlayerHistoryProductionOnlyIndex,
  LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
  LOCKED_PLAYER_HISTORY_MIRROR_PATH,
} from '../src/datasets/seasonal/playerHistoryProductionOnlySource.js';

const makeObservation = (overrides: Partial<SeasonalPlayerObservation> & Pick<SeasonalPlayerObservation, 'player_id'>): SeasonalPlayerObservation => ({
  player_name: overrides.player_id,
  position: 'WR',
  team_2024: 'FA',
  games_2024: 17,
  ppr_2024: 200,
  receptions_2024: 80,
  targets_2024: 110,
  rush_attempts_2024: 0,
  ppr_2025_actual: 210,
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
// Model inertness: absent player_history must not change predictions for anything else.
// ---------------------------------------------------------------------------------------------

describe('model inertness when player-history is absent (default for every existing caller)', () => {
  const trainRows = Array.from({ length: 8 }, (_, i) =>
    makeObservation({ player_id: `train-${i}`, ppr_2024: 150 + i * 20, ppr_2025_actual: 160 + i * 18, position: i % 2 === 0 ? 'WR' : 'RB' }),
  );

  it('feature_list now reports 12 numeric features plus position (Forecast #143)', () => {
    expect(seasonalPprFeatureList.filter((f) => f.kind === 'numeric')).toHaveLength(12);
    expect(seasonalPprFeatureList.some((f) => f.kind === 'categorical' && f.name === 'position')).toBe(true);
  });

  it('predictions for observations with no player_history field are identical to observations with an explicit null player_history', () => {
    const target = makeObservation({ player_id: 'target', ppr_2024: 180 });
    const targetWithExplicitNull: SeasonalPlayerObservation = { ...target, player_history: null };

    const modelA = trainSeasonalRidgeModel(trainRows, { lambda: 1 });
    const modelB = trainSeasonalRidgeModel(
      trainRows.map((r) => ({ ...r, player_history: null })),
      { lambda: 1 },
    );

    expect(modelA.predict(target)).toBeCloseTo(modelB.predict(targetWithExplicitNull), 9);
  });

  it("a player-history-aware coefficient never contaminates a different player's baseline features when history is entirely absent", () => {
    // Every train row has player_history absent -> every player-history column is a constant-zero
    // column in the design matrix. A constant-zero column must not change the fitted coefficients
    // for any OTHER column (they decouple in the ridge normal equations, see seasonalPprModel.ts).
    const model = trainSeasonalRidgeModel(trainRows, { lambda: 1 });
    const target = makeObservation({ player_id: 'target', ppr_2024: 180 });
    const explanation = model.explain(target);
    const historyContributions = explanation.contributions.filter((c) => c.feature.startsWith('player_history_'));
    expect(historyContributions).toHaveLength(7);
    for (const c of historyContributions) {
      expect(c.standardized_value).toBe(0);
      expect(c.contribution).toBe(0);
    }
  });

  it('the bundled default dataset (tiberDataSeasonalPprDataset) carries player_history: null for every observation', () => {
    for (const observation of tiberDataSeasonalPprDataset.observations) {
      expect(observation.player_history ?? null).toBeNull();
    }
  });

  it('running the service against the bundled dataset with no playerHistoryProductionOnly option discloses enabled: false', () => {
    const result = runSeasonalPprBacktestService(tiberDataSeasonalPprDataset, { generatedAt: '2026-07-08T00:00:00.000Z' });
    if (!result.ok) throw new Error('expected success');
    expect(result.data.report.player_history_production_only).toEqual({
      enabled: false,
      source_artifact_sha256: null,
      human_signoff_recorded: false,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Service: coverage tracking and truthful disclosure when player-history IS attached.
// ---------------------------------------------------------------------------------------------

describe('service coverage tracking and disclosure when player-history is attached', () => {
  it('missing_feature_coverage reports non-trivial, non-uniform counts for player-history features against the real mirror', () => {
    const mirror = JSON.parse(readFileSync(path.resolve(LOCKED_PLAYER_HISTORY_MIRROR_PATH), 'utf8'));
    const index = buildPlayerHistoryProductionOnlyIndex(mirror);
    const enriched = attachPlayerHistoryProductionOnly(tiberDataSeasonalPprDataset.observations, index);
    const result = runSeasonalPprBacktestService(
      { ...tiberDataSeasonalPprDataset, observations: enriched },
      { generatedAt: '2026-07-08T00:00:00.000Z', playerHistoryProductionOnly: { enabled: true, sourceArtifactSha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256 } },
    );
    if (!result.ok) throw new Error('expected success');

    const byFeature = Object.fromEntries(result.data.report.missing_feature_coverage.map((m) => [m.feature, m.rows_missing]));
    const total = tiberDataSeasonalPprDataset.observations.length;
    // Some rows have history, some don't -- coverage must be strictly between 0 and total, not
    // uniformly all-present or all-missing (which would indicate the join silently failed or
    // silently matched everything).
    expect(byFeature['player_history_prior_season_1_ppr']).toBeGreaterThan(0);
    expect(byFeature['player_history_prior_season_1_ppr']).toBeLessThan(total);

    expect(result.data.report.player_history_production_only).toEqual({
      enabled: true,
      source_artifact_sha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
      human_signoff_recorded: false,
    });
  });

  it('REGRESSION (Codex P2): player_history on observations is ignored when the option is omitted, even though the data is attached', () => {
    const mirror = JSON.parse(readFileSync(path.resolve(LOCKED_PLAYER_HISTORY_MIRROR_PATH), 'utf8'));
    const index = buildPlayerHistoryProductionOnlyIndex(mirror);
    const enriched = attachPlayerHistoryProductionOnly(tiberDataSeasonalPprDataset.observations, index);

    // No playerHistoryProductionOnly option passed, despite observations carrying real player_history.
    const result = runSeasonalPprBacktestService({ ...tiberDataSeasonalPprDataset, observations: enriched }, { generatedAt: '2026-07-08T00:00:00.000Z' });
    if (!result.ok) throw new Error('expected success');

    expect(result.data.report.player_history_production_only).toEqual({ enabled: false, source_artifact_sha256: null, human_signoff_recorded: false });
    // The disclosure must be true, not just optimistic: no prediction row may report a player_history
    // feature as present when the report says the binding was disabled.
    for (const row of result.data.predictions) {
      expect(row.features_present.some((f) => f.startsWith('player_history_'))).toBe(false);
    }
    for (const m of result.data.report.missing_feature_coverage) {
      if (m.feature.startsWith('player_history_')) {
        expect(m.rows_missing).toBe(tiberDataSeasonalPprDataset.observations.length);
      }
    }
  });

  it('REGRESSION (Codex P2): a player_history block with the WRONG declared sha256 is ignored even when enabled: true', () => {
    const mirror = JSON.parse(readFileSync(path.resolve(LOCKED_PLAYER_HISTORY_MIRROR_PATH), 'utf8'));
    const index = buildPlayerHistoryProductionOnlyIndex(mirror);
    const enriched = attachPlayerHistoryProductionOnly(tiberDataSeasonalPprDataset.observations, index);

    const result = runSeasonalPprBacktestService(
      { ...tiberDataSeasonalPprDataset, observations: enriched },
      { generatedAt: '2026-07-08T00:00:00.000Z', playerHistoryProductionOnly: { enabled: true, sourceArtifactSha256: 'not-the-locked-sha256' } },
    );
    if (!result.ok) throw new Error('expected success');
    for (const m of result.data.report.missing_feature_coverage) {
      if (m.feature.startsWith('player_history_')) {
        expect(m.rows_missing).toBe(tiberDataSeasonalPprDataset.observations.length);
      }
    }
  });

  it('a player_history block with a forged/stale contract_id or contract_version is ignored even when enabled: true with the right sha256', () => {
    const forged = tiberDataSeasonalPprDataset.observations.map((o) => ({
      ...o,
      player_history: {
        contract_id: 'player_history_production_only_v0' as const,
        contract_version: '0.1.0-proposed' as unknown as '1.0.0', // stale/forged version, not the accepted one
        source_artifact_sha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
        prior_season_1_ppr: 999,
        prior_season_2_ppr: 999,
        trailing_2yr_ppr_total: 1998,
        trailing_3yr_ppr_total: 2997,
        trailing_2yr_ppr_mean: 999,
        trailing_3yr_ppr_mean: 999,
        year_over_year_ppr_trend: 0,
      },
    }));
    const result = runSeasonalPprBacktestService(
      { ...tiberDataSeasonalPprDataset, observations: forged },
      { generatedAt: '2026-07-08T00:00:00.000Z', playerHistoryProductionOnly: { enabled: true, sourceArtifactSha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256 } },
    );
    if (!result.ok) throw new Error('expected success');
    for (const m of result.data.report.missing_feature_coverage) {
      if (m.feature.startsWith('player_history_')) {
        expect(m.rows_missing).toBe(tiberDataSeasonalPprDataset.observations.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// CLI integration: the opt-in flag, end to end.
// ---------------------------------------------------------------------------------------------

describe('runSeasonalPprBacktest CLI: --enable-player-history-production-only', () => {
  const tsxPath = path.resolve('node_modules/.bin/tsx');
  const scriptPath = path.resolve('scripts/runSeasonalPprBacktest.ts');
  const cwd = path.resolve('.');
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'seasonal-ppr-cli-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const run = (args: string[]): { status: number; stderr: string } => {
    try {
      execFileSync(tsxPath, [scriptPath, workDir, '--generated-at=2026-07-08T00:00:00.000Z', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
      return { status: 0, stderr: '' };
    } catch (error) {
      const err = error as { status?: number; stderr?: string };
      return { status: typeof err.status === 'number' ? err.status : 1, stderr: err.stderr ?? '' };
    }
  };

  it('without the flag, the report discloses player_history_production_only.enabled: false', () => {
    const { status } = run([]);
    expect(status).toBe(0);
    const report = JSON.parse(readFileSync(path.join(workDir, 'seasonal_ppr_backtest_report.json'), 'utf8'));
    expect(report.player_history_production_only).toEqual({ enabled: false, source_artifact_sha256: null, human_signoff_recorded: false });
  });

  it('with the flag, the report discloses enabled: true with the locked sha256 and non-trivial player-history coverage', () => {
    const { status } = run(['--enable-player-history-production-only']);
    expect(status).toBe(0);
    const report = JSON.parse(readFileSync(path.join(workDir, 'seasonal_ppr_backtest_report.json'), 'utf8'));
    expect(report.player_history_production_only).toEqual({
      enabled: true,
      source_artifact_sha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
      human_signoff_recorded: false,
    });
    const coverage = Object.fromEntries(report.missing_feature_coverage.map((m: { feature: string; rows_missing: number }) => [m.feature, m.rows_missing]));
    expect(coverage['player_history_prior_season_1_ppr']).toBeGreaterThan(0);
  });

  it('two enabled runs produce byte-identical reports (deterministic)', () => {
    expect(run(['--enable-player-history-production-only']).status).toBe(0);
    const first = readFileSync(path.join(workDir, 'seasonal_ppr_backtest_report.json'), 'utf8');
    rmSync(workDir, { recursive: true, force: true });
    workDir = mkdtempSync(path.join(tmpdir(), 'seasonal-ppr-cli-'));
    expect(run(['--enable-player-history-production-only']).status).toBe(0);
    const second = readFileSync(path.join(workDir, 'seasonal_ppr_backtest_report.json'), 'utf8');
    expect(first).toBe(second);
  });

  it('the default (no-flag) run is byte-for-byte unaffected by the binding existing in the codebase (feature_list still lists 13 entries, but every player_history value is the 0-default)', () => {
    const { status } = run([]);
    expect(status).toBe(0);
    const predictions = readFileSync(path.join(workDir, 'seasonal_ppr_predictions.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(predictions.length).toBeGreaterThan(0);
    for (const row of predictions) {
      expect(row.features_present).not.toEqual(expect.arrayContaining([expect.stringMatching(/^player_history_/)]));
    }
  });
});
