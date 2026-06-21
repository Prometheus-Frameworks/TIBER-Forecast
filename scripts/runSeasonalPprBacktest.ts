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
 *   tsx scripts/runSeasonalPprBacktest.ts [outputDir] [--generated-at=<iso>] [--lambda=<n>]
 *
 * Defaults to `data/backtests/seasonal-ppr/`.
 */
import path from 'node:path';
import { tiberDataSeasonalPprDataset } from '../src/datasets/seasonal/tiberDataSeasonalPprDataset.js';
import { runSeasonalPprBacktestService } from '../src/services/runSeasonalPprBacktestService.js';
import { writeSeasonalPprBacktestArtifacts } from '../src/artifacts/writeSeasonalPprBacktestArtifacts.js';

const DEFAULT_OUTPUT_DIR = path.join('data', 'backtests', 'seasonal-ppr');
const GENERATED_AT_FLAG = '--generated-at=';
const LAMBDA_FLAG = '--lambda=';

interface ParsedArgs {
  outputDir: string;
  generatedAt?: string;
  lambda?: number;
}

const parseArgs = (argv: string[]): { ok: true; args: ParsedArgs } | { ok: false; error: string } => {
  let outputDir = DEFAULT_OUTPUT_DIR;
  let generatedAt: string | undefined;
  let lambda: number | undefined;

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
    if (!arg.startsWith('--')) {
      outputDir = arg;
    }
  }

  return { ok: true, args: { outputDir, generatedAt, lambda } };
};

const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`Invalid arguments: ${parsed.error}`);
    process.exitCode = 1;
    return;
  }

  const { outputDir, generatedAt, lambda } = parsed.args;

  const result = runSeasonalPprBacktestService(tiberDataSeasonalPprDataset, { generatedAt, lambda });
  if (!result.ok) {
    console.error('Seasonal PPR backtest failed (fail-closed):');
    for (const error of result.errors) {
      console.error(`- [${error.code}] ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const { report, predictions } = result.data;

  const written = await writeSeasonalPprBacktestArtifacts({ output_dir: outputDir, report, predictions });
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
