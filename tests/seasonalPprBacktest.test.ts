import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SEASONAL_PPR_BACKTEST_MODEL_VERSION,
  SEASONAL_PPR_INPUT_SEASON,
  SEASONAL_PPR_OUTPUT_KIND,
  SEASONAL_PPR_PREDICTIONS_FILENAME,
  SEASONAL_PPR_REPORT_FILENAME,
  SEASONAL_PPR_TARGET_SEASON,
  runSeasonalPprBacktestService,
  tiberDataSeasonalPprDataset,
  trainSeasonalRidgeModel,
  writeSeasonalPprBacktestArtifacts,
} from '../src/public/index.js';
import type {
  SeasonalPlayerObservation,
  SeasonalPprDatasetDescriptor,
} from '../src/public/index.js';

const FIXED_AT = '2026-06-21T00:00:00.000Z';

const runOk = (dataset = tiberDataSeasonalPprDataset, generatedAt = FIXED_AT) => {
  const result = runSeasonalPprBacktestService(dataset, { generatedAt });
  if (!result.ok) {
    throw new Error(`Expected success, got: ${result.errors.map((error) => error.code).join(', ')}`);
  }
  return result.data;
};

const makeObservation = (
  overrides: Partial<SeasonalPlayerObservation> & Pick<SeasonalPlayerObservation, 'player_id'>,
): SeasonalPlayerObservation => ({
  player_name: overrides.player_id,
  position: 'WR',
  team_2024: 'FA',
  games_2024: 17,
  ppr_2024: 200,
  receptions_2024: 80,
  targets_2024: 120,
  rush_attempts_2024: 0,
  ppr_2025_actual: 200,
  ...overrides,
});

describe('runSeasonalPprBacktestService', () => {
  it('produces a governed report and prediction artifact from the TIBER-Data fixture', () => {
    const { report, predictions } = runOk();

    expect(report.output_kind).toBe(SEASONAL_PPR_OUTPUT_KIND);
    expect(report.model_version).toBe(SEASONAL_PPR_BACKTEST_MODEL_VERSION);
    expect(report.input_season).toBe(SEASONAL_PPR_INPUT_SEASON);
    expect(report.target_season).toBe(SEASONAL_PPR_TARGET_SEASON);
    expect(report.generated_at).toBe(FIXED_AT);

    // One prediction row per observation; dataset provenance preserved.
    expect(predictions).toHaveLength(tiberDataSeasonalPprDataset.observations.length);
    expect(report.dataset.governance_status).toBe('fixture');
    // The default dataset is the bundled scaffold fixture, not a mounted artifact.
    expect(report.dataset.data_source).toBe('bundled-scaffold');
    expect(report.dataset.source_dataset_refs.length).toBeGreaterThan(0);
  });

  it('compares the model against at least one naive baseline and states whether it wins', () => {
    const { report } = runOk();

    expect(report.baselines.length).toBeGreaterThanOrEqual(1);
    const baselineNames = report.baselines.map((baseline) => baseline.name);
    expect(baselineNames).toContain('baseline-prev-year-ppr');
    expect(baselineNames).toContain('baseline-position-mean');

    const bestBaselineMae = Math.min(...report.baselines.map((baseline) => baseline.overall.mae));
    expect(report.beats_baseline).toBe(report.model.overall.mae < bestBaselineMae);
    expect(report.beats_baseline_summary).toMatch(/baseline/i);
  });

  it('reports finite MAE/RMSE and a by-position breakdown', () => {
    const { report } = runOk();

    expect(Number.isFinite(report.model.overall.mae)).toBe(true);
    expect(Number.isFinite(report.model.overall.rmse)).toBe(true);
    expect(report.model.overall.sample_size).toBe(report.dataset.scored_row_count);
    expect(Object.keys(report.model.by_position).length).toBeGreaterThan(0);
    expect(report.top_misses.length).toBeGreaterThan(0);
    expect(report.feature_list.length).toBeGreaterThan(0);
    expect(report.limitations.length).toBeGreaterThan(0);
  });

  it('fails closed on rows with a missing 2025 actual outcome', () => {
    const { report, predictions } = runOk();

    expect(report.dataset.unavailable_row_count).toBeGreaterThanOrEqual(1);

    const unavailable = predictions.filter((row) => row.governance_status === 'unavailable');
    expect(unavailable.length).toBe(report.dataset.unavailable_row_count);
    for (const row of unavailable) {
      expect(row.predicted_ppr).toBeNull();
      expect(row.actual_ppr).toBeNull();
      expect(row.absolute_error).toBeNull();
    }

    // Unavailable rows are excluded from the scored metrics.
    expect(report.model.overall.sample_size).toBe(
      tiberDataSeasonalPprDataset.observations.length - report.dataset.unavailable_row_count,
    );
  });

  it('labels every prediction row as model inference, never observed reality', () => {
    const { predictions } = runOk();
    for (const row of predictions) {
      expect(row.output_kind).toBe(SEASONAL_PPR_OUTPUT_KIND);
      expect(row.model_version).toBe(SEASONAL_PPR_BACKTEST_MODEL_VERSION);
      expect(['inference', 'unavailable']).toContain(row.governance_status);
    }
    const inferenceRows = predictions.filter((row) => row.governance_status === 'inference');
    for (const row of inferenceRows) {
      expect(row.predicted_ppr).not.toBeNull();
      expect(row.actual_ppr).not.toBeNull();
      expect(row.absolute_error).not.toBeNull();
    }
  });

  it('is deterministic: identical inputs produce identical outputs', () => {
    const first = runOk();
    const second = runOk();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('emits one model-mechanics explanation per observation, reconstructing predictions', () => {
    const { report, predictions, explanations } = runOk();
    expect(explanations).toHaveLength(predictions.length);

    const explanationById = new Map(explanations.map((row) => [row.player_id, row]));
    for (const prediction of predictions) {
      const explanation = explanationById.get(prediction.player_id);
      expect(explanation).toBeDefined();
      if (!explanation) continue;

      // Provenance + identity carried onto every explanation row.
      expect(explanation.model_version).toBe(SEASONAL_PPR_BACKTEST_MODEL_VERSION);
      expect(explanation.data_source).toBe(report.dataset.data_source);
      expect(explanation.governance_status).toBe(report.dataset.governance_status);
      expect(explanation.input_season).toBe(SEASONAL_PPR_INPUT_SEASON);
      expect(explanation.target_season).toBe(SEASONAL_PPR_TARGET_SEASON);
      expect(explanation.explanation_warning).toMatch(/model-mechanics explanation, not a causal football/);

      if (prediction.governance_status === 'unavailable') {
        // Unexplained rows fail gracefully — no synthesized contributions.
        expect(explanation.explanation_status).toBe('unavailable');
        expect(explanation.predicted_ppr).toBeNull();
        expect(explanation.intercept).toBeNull();
        expect(explanation.feature_contributions).toEqual([]);
        expect(explanation.top_positive_contributions).toEqual([]);
        expect(explanation.top_negative_contributions).toEqual([]);
      } else {
        expect(explanation.explanation_status).toBe('explained');
        expect(explanation.predicted_ppr).toBe(prediction.predicted_ppr);
        // Additive reconstruction matches the stored prediction (post-clamp).
        const sum =
          (explanation.intercept as number) +
          explanation.feature_contributions.reduce((acc, c) => acc + c.contribution, 0);
        expect(Math.max(0, Number(sum.toFixed(4)))).toBeCloseTo(prediction.predicted_ppr as number, 1);
        // Top lists are correctly signed.
        for (const c of explanation.top_positive_contributions) expect(c.contribution).toBeGreaterThan(0);
        for (const c of explanation.top_negative_contributions) expect(c.contribution).toBeLessThan(0);
      }
    }
  });

  it('fails (no artifact) when there are too few usable rows', () => {
    const dataset: SeasonalPprDatasetDescriptor = {
      ...tiberDataSeasonalPprDataset,
      observations: [
        makeObservation({ player_id: 'a' }),
        makeObservation({ player_id: 'b' }),
      ],
    };
    const result = runSeasonalPprBacktestService(dataset, { generatedAt: FIXED_AT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe('SEASONAL_PPR_INSUFFICIENT_ROWS');
    }
  });

  it('fails on an empty dataset', () => {
    const dataset: SeasonalPprDatasetDescriptor = { ...tiberDataSeasonalPprDataset, observations: [] };
    const result = runSeasonalPprBacktestService(dataset, { generatedAt: FIXED_AT });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe('SEASONAL_PPR_DATASET_EMPTY');
    }
  });
});

describe('trainSeasonalRidgeModel', () => {
  it('recovers a roughly linear prev-year signal and clamps to non-negative', () => {
    // Construct a clean linear relationship: 2025 ~= 1.1 * 2024.
    const rows: SeasonalPlayerObservation[] = Array.from({ length: 12 }, (_, index) => {
      const ppr = 50 + index * 20;
      return makeObservation({
        player_id: `p${index}`,
        ppr_2024: ppr,
        ppr_2025_actual: ppr * 1.1,
      });
    });
    const model = trainSeasonalRidgeModel(rows, { lambda: 0.01 });
    const prediction = model.predict(makeObservation({ player_id: 'x', ppr_2024: 150, ppr_2025_actual: 0 }));
    expect(prediction).toBeGreaterThan(120);
    expect(prediction).toBeLessThan(200);
    expect(prediction).toBeGreaterThanOrEqual(0);
  });

  it('throws on empty training data (fail closed)', () => {
    expect(() => trainSeasonalRidgeModel([])).toThrow();
  });

  it('explain() reconstructs predict() additively without changing it', () => {
    const rows: SeasonalPlayerObservation[] = Array.from({ length: 12 }, (_, index) => {
      const ppr = 40 + index * 18;
      return makeObservation({
        player_id: `p${index}`,
        position: index % 2 === 0 ? 'WR' : 'RB',
        ppr_2024: ppr,
        targets_2024: 80 + index,
        ppr_2025_actual: ppr * 1.05,
      });
    });
    const model = trainSeasonalRidgeModel(rows, { lambda: 0.5 });
    const target = makeObservation({ player_id: 'x', position: 'WR', ppr_2024: 150, ppr_2025_actual: 0 });

    const predicted = model.predict(target);
    const explanation = model.explain(target);

    // Additive decomposition reconstructs the (pre-clamp) raw prediction exactly.
    const sum = explanation.intercept + explanation.contributions.reduce((s, c) => s + c.contribution, 0);
    expect(sum).toBeCloseTo(explanation.raw_prediction, 9);
    expect(explanation.prediction).toBe(predicted);
    // One contribution per numeric feature plus a single position term.
    expect(explanation.contributions.some((c) => c.feature === 'position=WR')).toBe(true);
    expect(explanation.contributions.filter((c) => c.kind === 'numeric')).toHaveLength(5);
  });
});

describe('writeSeasonalPprBacktestArtifacts', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('writes a deterministic report and JSONL prediction artifact', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'seasonal-ppr-'));
    const { report, predictions, explanations } = runOk();

    const written = await writeSeasonalPprBacktestArtifacts({
      output_dir: tempDir,
      report,
      predictions,
      explanations,
    });
    expect(written.ok).toBe(true);
    if (!written.ok) {
      return;
    }

    const reportRaw = await readFile(path.join(tempDir, SEASONAL_PPR_REPORT_FILENAME), 'utf8');
    const predictionsRaw = await readFile(path.join(tempDir, SEASONAL_PPR_PREDICTIONS_FILENAME), 'utf8');

    expect(JSON.parse(reportRaw).report_version).toBe(report.report_version);
    const lines = predictionsRaw.trimEnd().split('\n');
    expect(lines).toHaveLength(predictions.length);
    expect(JSON.parse(lines[0]).output_kind).toBe(SEASONAL_PPR_OUTPUT_KIND);

    // Re-writing the same payload yields byte-identical files.
    const second = await writeSeasonalPprBacktestArtifacts({ output_dir: tempDir, report, predictions, explanations });
    expect(second.ok).toBe(true);
    const reportRaw2 = await readFile(path.join(tempDir, SEASONAL_PPR_REPORT_FILENAME), 'utf8');
    expect(reportRaw2).toBe(reportRaw);
  });
});
