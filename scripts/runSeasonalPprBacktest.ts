/**
 * On-demand runner for the seasonal PPR backtest (Issue #49).
 *
 * Runs the first governed PPM backtest (2024 inputs -> 2025 PPR, actuals from
 * TIBER-Data), printing a short human-readable summary and writing two
 * deterministic, read-only artifacts:
 *   - <out>/seasonal_ppr_backtest_report.json
 *   - <out>/seasonal_ppr_predictions.jsonl
 *
 * This is intentionally NOT wired into build/start and is NOT auto-promoted. The
 * artifacts are MODEL INFERENCE and must not be consumed downstream until a
 * later contract/display PR is approved.
 *
 * Usage:
 *   tsx scripts/runSeasonalPprBacktest.ts [outputDir] [--generated-at=<iso>] [--lambda=<n>] [--ppr-artifact=<path>]
 *
 * Defaults to `data/backtests/seasonal-ppr/`. With `--ppr-artifact=<path>` the
 * runner reads a real TIBER-Data weekly PPR artifact (the documented
 * `player_weekly_ppr_outcomes_v1` shape) and aggregates it through the loader.
 * Without it, a bundled scaffold-only fixture is used. Governed status is never
 * inferred from a path; the dataset stays `fixture` unless TIBER-Data supplies
 * an explicit governed marker.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { tiberDataSeasonalPprDataset } from '../src/datasets/seasonal/tiberDataSeasonalPprDataset.js';
import { loadSeasonalPprDatasetFromWeeklyOutcomes } from '../src/datasets/seasonal/loadSeasonalPprDataset.js';
import { parseTiberDataWeeklyPprArtifact } from '../src/datasets/seasonal/parseTiberDataWeeklyArtifact.js';
import type { SeasonalPprDatasetDescriptor } from '../src/contracts/seasonalPprBacktest.js';
import { runSeasonalPprBacktestService } from '../src/services/runSeasonalPprBacktestService.js';
import { writeSeasonalPprBacktestArtifacts } from '../src/artifacts/writeSeasonalPprBacktestArtifacts.js';

const DEFAULT_OUTPUT_DIR = path.join('data', 'backtests', 'seasonal-ppr');
const GENERATED_AT_FLAG = '--generated-at=';
const LAMBDA_FLAG = '--lambda=';
const PPR_ARTIFACT_FLAG = '--ppr-artifact=';

interface ParsedArgs {
  outputDir: string;
  generatedAt?: string;
  lambda?: number;
  pprArtifactPath?: string;
}

const parseArgs = (argv: string[]): { ok: true; args: ParsedArgs } | { ok: false; error: string } => {
  let outputDir = DEFAULT_OUTPUT_DIR;
  let generatedAt: string | undefined;
  let lambda: number | undefined;
  let pprArtifactPath: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith(GENERATED_AT_FLAG)) {
      const value = arg.slice(GENERATED_AT_FLAG.length);
      if (Number.isNaN(Date.parse(value))) {
        return { ok: false, error: `--generated-at must be a valid ISO timestamp, got "${value}".` };
      }
      generatedAt = value;
      continue;
    }
    if (arg.startsWith(LAMBDA_FLAG)) {
      const value = Number(arg.slice(LAMBDA_FLAG.length));
      if (!Number.isFinite(value) || value < 0) {
        return { ok: false, error: `--lambda must be a non-negative number, got "${arg.slice(LAMBDA_FLAG.length)}".` };
      }
      lambda = value;
      continue;
    }
    if (arg.startsWith(PPR_ARTIFACT_FLAG)) {
      const value = arg.slice(PPR_ARTIFACT_FLAG.length);
      if (value.trim() === '') {
        return { ok: false, error: '--ppr-artifact must be a non-empty path.' };
      }
      pprArtifactPath = value;
      continue;
    }
    if (!arg.startsWith('--')) {
      outputDir = arg;
    }
  }

  return { ok: true, args: { outputDir, generatedAt, lambda, pprArtifactPath } };
};

const resolveDataset = async (
  pprArtifactPath: string | undefined,
): Promise<{ ok: true; dataset: SeasonalPprDatasetDescriptor } | { ok: false; error: string }> => {
  if (!pprArtifactPath) {
    return { ok: true, dataset: tiberDataSeasonalPprDataset };
  }

  const resolved = path.resolve(pprArtifactPath);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolved, 'utf8'));
  } catch (error) {
    return { ok: false, error: `Could not read/parse artifact at ${resolved}: ${error instanceof Error ? error.message : String(error)}` };
  }

  const parsed = parseTiberDataWeeklyPprArtifact(raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.errors.map((e) => `[${e.code}] ${e.message}`).join('; ') };
  }

  // The rows came from a mounted/copied artifact file, so the provenance
  // data_source is `mounted-artifact`. Governed status is intentionally NOT set
  // from the CLI/path: real governance must arrive as an explicit TIBER-Data
  // marker, so the dataset stays `fixture` here regardless of the file path.
  const loaded = loadSeasonalPprDatasetFromWeeklyOutcomes(parsed.data, {
    artifactPath: resolved,
    dataSource: 'mounted-artifact',
  });
  if (!loaded.ok) {
    return { ok: false, error: loaded.errors.map((e) => `[${e.code}] ${e.message}`).join('; ') };
  }
  for (const warning of loaded.warnings) {
    console.warn(`Warning [${warning.code}]: ${warning.message}`);
  }
  return { ok: true, dataset: loaded.data };
};

const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`Invalid arguments: ${parsed.error}`);
    process.exitCode = 1;
    return;
  }

  const { outputDir, generatedAt, lambda, pprArtifactPath } = parsed.args;

  const datasetResult = await resolveDataset(pprArtifactPath);
  if (!datasetResult.ok) {
    console.error(`Failed to load TIBER-Data weekly PPR artifact (fail-closed): ${datasetResult.error}`);
    process.exitCode = 1;
    return;
  }

  const result = runSeasonalPprBacktestService(datasetResult.dataset, { generatedAt, lambda });
  if (!result.ok) {
    console.error('Seasonal PPR backtest failed (fail-closed):');
    for (const error of result.errors) {
      console.error(`- [${error.code}] ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const { report, predictions, explanations } = result.data;

  const written = await writeSeasonalPprBacktestArtifacts({ output_dir: outputDir, report, predictions, explanations });
  if (!written.ok) {
    console.error('Failed to write seasonal PPR backtest artifacts:');
    for (const error of written.errors) {
      console.error(`- [${error.code}] ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Seasonal PPR backtest (MODEL INFERENCE — not observed reality)');
  console.log(`  model:           ${report.model_version}`);
  console.log(`  dataset:         ${report.dataset.dataset_id}@${report.dataset.dataset_version} [${report.dataset.governance_status}]`);
  console.log(`  data source:     ${report.dataset.data_source}`);
  if (report.dataset.data_source === 'mounted-artifact') {
    console.log(
      report.dataset.governance_status === 'governed'
        ? '  verification:    MOUNTED artifact, governed marker honored — verified against a governed TIBER-Data artifact.'
        : '  verification:    MOUNTED artifact, but governance is NOT governed — still fail-closed (fixture). Not approved for 2026 predictive use.',
    );
  } else {
    console.log('  verification:    BUNDLED scaffold fixture — not a mounted TIBER-Data artifact. Not approved for 2026 predictive use.');
  }
  console.log(`  rows scored:     ${report.dataset.scored_row_count} (unavailable: ${report.dataset.unavailable_row_count})`);
  console.log(`  model MAE/RMSE:  ${report.model.overall.mae.toFixed(2)} / ${report.model.overall.rmse.toFixed(2)}`);
  for (const baseline of report.baselines) {
    console.log(`  ${baseline.name.padEnd(24)} MAE/RMSE: ${baseline.overall.mae.toFixed(2)} / ${baseline.overall.rmse.toFixed(2)}`);
  }
  console.log(`  beats baseline:  ${report.beats_baseline ? 'YES' : 'NO'} — ${report.beats_baseline_summary}`);
  for (const artifact of written.data.written_artifacts) {
    console.log(`  wrote ${artifact.artifact}: ${artifact.path} (${artifact.row_count} row(s))`);
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}`);
  process.exitCode = 1;
});
