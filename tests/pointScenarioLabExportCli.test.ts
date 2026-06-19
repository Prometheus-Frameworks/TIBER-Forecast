import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const tsxPath = path.resolve('node_modules/.bin/tsx');
const scriptPath = path.resolve('scripts/exportPointScenarioLab.ts');
const cwd = path.resolve('.');

describe('point-scenario lab export CLI', () => {
  let workDir: string;
  let outputPath: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'psl-export-'));
    outputPath = path.join(workDir, 'point_scenario_lab.json');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const runExport = (args: string[]): { status: number } => {
    try {
      execFileSync(tsxPath, [scriptPath, outputPath, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
      return { status: 0 };
    } catch (error) {
      const status = (error as { status?: number }).status;
      return { status: typeof status === 'number' ? status : 1 };
    }
  };

  it('writes the artifact and stamps the season for a valid --season', () => {
    const { status } = runExport(['--season=2025']);

    expect(status).toBe(0);
    expect(existsSync(outputPath)).toBe(true);

    const payload = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(payload.season).toBe(2025);
    expect(payload.available_seasons).toEqual([2025]);
    expect(payload.rows.length).toBeGreaterThan(0);
    for (const row of payload.rows) {
      expect(row.season).toBe(2025);
    }
  });

  it('exits non-zero and writes nothing for a non-numeric --season', () => {
    const { status } = runExport(['--season=abc']);

    expect(status).not.toBe(0);
    expect(existsSync(outputPath)).toBe(false);
  });

  it('exits non-zero and writes nothing for an out-of-range --season', () => {
    const { status } = runExport(['--season=1999']);

    expect(status).not.toBe(0);
    expect(existsSync(outputPath)).toBe(false);
  });

  it('exits non-zero and writes nothing for an empty --season', () => {
    const { status } = runExport(['--season=']);

    expect(status).not.toBe(0);
    expect(existsSync(outputPath)).toBe(false);
  });

  it('still writes a season-agnostic artifact when --season is omitted', () => {
    const { status } = runExport([]);

    expect(status).toBe(0);
    expect(existsSync(outputPath)).toBe(true);

    const payload = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(payload.season).toBeNull();
    expect(payload.available_seasons).toEqual([]);
  });
});
