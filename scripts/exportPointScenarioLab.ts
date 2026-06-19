/**
 * On-demand export of the point-scenario lab compatibility artifact.
 *
 * This is intentionally NOT wired into build/start and is NOT auto-promoted. It
 * writes a single `point_scenario_lab.json` file using the same builder that backs
 * the `/api/point-scenarios/lab` route (`source.mode: 'artifact'`), so the file is a
 * drop-in for TIBER-Fantasy's artifact fallback path. See Issue #43 and
 * `docs/point-scenario-lab-compatibility.md`.
 *
 * Usage:
 *   tsx scripts/exportPointScenarioLab.ts [outputPath] [--season=2025]
 *
 * Defaults to `data/point-scenarios/point_scenario_lab.json`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPointScenarioLab } from '../src/services/pointScenarioLab/buildPointScenarioLab.js';

const DEFAULT_OUTPUT_PATH = path.join('data', 'point-scenarios', 'point_scenario_lab.json');

const parseArgs = (argv: string[]): { outputPath: string; season?: number } => {
  let outputPath = DEFAULT_OUTPUT_PATH;
  let season: number | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--season=')) {
      const parsed = Number(arg.slice('--season='.length));
      if (Number.isInteger(parsed)) {
        season = parsed;
      }
      continue;
    }
    if (!arg.startsWith('--')) {
      outputPath = arg;
    }
  }

  return { outputPath, season };
};

const main = async () => {
  const { outputPath, season } = parseArgs(process.argv.slice(2));
  const resolvedPath = path.resolve(outputPath);

  const result = buildPointScenarioLab({
    season,
    mode: 'artifact',
    location: resolvedPath,
  });

  if (!result.ok) {
    console.error('Failed to build point-scenario lab artifact:');
    for (const error of result.errors) {
      console.error(`- [${error.code}] ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(result.data, null, 2)}\n`, 'utf8');

  console.log(`Exported ${result.data.rows.length} point-scenario lab row(s) to ${resolvedPath}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}`);
  process.exitCode = 1;
});
