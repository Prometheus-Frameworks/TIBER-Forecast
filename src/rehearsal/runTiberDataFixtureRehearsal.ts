import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectionInputCoverageArtifact } from '../contracts/projectionArtifacts.js';
import {
  fromProjectionInputFixture,
  type FromProjectionInputFixtureIdentityConfig,
} from '../adapters/tiberData/fromProjectionInputFixture.js';
import { serviceFailure, serviceSuccess, type ServiceResult, type ServiceWarning } from '../services/result.js';
import { runProjectionRehearsal } from './runProjectionRehearsal.js';

export interface RunTiberDataFixtureRehearsalInput {
  fixture_path: string;
  output_dir?: string;
  run_id?: string;
  generated_at?: string;
  /**
   * Governed identity reference config forwarded to the fixture adapter. The
   * adapter fails closed when `identity_ref.version` is absent.
   */
  identity_ref?: FromProjectionInputFixtureIdentityConfig;
}

export interface TiberDataFixtureRehearsalSummary {
  run_id: string;
  generated_at: string;
  fixture_path: string;
  output_dir: string;
  player_count: number;
  mapped_players: number;
  skipped_players: number;
  warning_count: number;
  missing_field_count: number;
  written_artifacts: Array<{ artifact_type: string; path: string; row_count: number }>;
  warnings: ServiceWarning[];
}

const deriveFixtureRunId = (fixturePath: string): string => {
  const stem = path.basename(fixturePath, path.extname(fixturePath));
  const weeklyMatch = /^weekly_projection_input_fixture_(\d{4})_w(\d{2})$/.exec(stem);
  if (weeklyMatch !== null) return `tiber-data-fixture-${weeklyMatch[1]}-w${weeklyMatch[2]}`;

  return `tiber-data-fixture-${stem.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
};

const readFixtureJson = async (fixturePath: string): Promise<ServiceResult<unknown>> => {
  if (typeof fixturePath !== 'string' || fixturePath.trim().length === 0) {
    return serviceFailure({ code: 'TIBER_DATA_FIXTURE_PATH_INVALID', message: 'fixture_path is required.' });
  }

  try {
    const contents = await readFile(fixturePath, 'utf8');
    return serviceSuccess(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return serviceFailure({
        code: 'TIBER_DATA_FIXTURE_JSON_INVALID',
        message: 'TIBER-Data fixture JSON could not be parsed.',
        details: { fixture_path: fixturePath, message: error.message },
      });
    }

    return serviceFailure({
      code: 'TIBER_DATA_FIXTURE_READ_FAILED',
      message: 'TIBER-Data fixture could not be read from the local filesystem.',
      details: error instanceof Error ? { fixture_path: fixturePath, name: error.name, message: error.message } : { fixture_path: fixturePath, error },
    });
  }
};

const readCoverageArtifact = async (outputDir: string): Promise<ServiceResult<ProjectionInputCoverageArtifact>> => {
  try {
    const contents = await readFile(path.join(outputDir, 'projection-input-coverage.json'), 'utf8');
    return serviceSuccess(JSON.parse(contents) as ProjectionInputCoverageArtifact);
  } catch (error) {
    return serviceFailure({
      code: 'TIBER_DATA_FIXTURE_COVERAGE_READ_FAILED',
      message: 'Projection input coverage artifact could not be read after rehearsal.',
      details: error instanceof Error ? { name: error.name, message: error.message } : error,
    });
  }
};

export const runTiberDataFixtureRehearsal = async (
  input: RunTiberDataFixtureRehearsalInput,
): Promise<ServiceResult<TiberDataFixtureRehearsalSummary>> => {
  if (typeof input.fixture_path !== 'string' || input.fixture_path.trim().length === 0) {
    return serviceFailure({ code: 'TIBER_DATA_FIXTURE_PATH_INVALID', message: 'fixture_path is required.' });
  }

  const resolvedFixturePath = path.resolve(input.fixture_path);
  const fixtureResult = await readFixtureJson(resolvedFixturePath);
  if (!fixtureResult.ok) return fixtureResult;

  // Translate the TIBER-Data fixture envelope into the PPM ingestion bundle
  // through the named adapter. No direct cast: mismatched provenance, identity,
  // replacement_buffer, version, and missing-field severity are mapped or fail
  // closed here rather than being silently coerced.
  const adapterResult = fromProjectionInputFixture({
    fixture: fixtureResult.data,
    ...(input.identity_ref === undefined ? {} : { identity_ref: input.identity_ref }),
  });
  if (!adapterResult.ok) return adapterResult;

  const { bundle } = adapterResult.data;
  const runId = input.run_id ?? deriveFixtureRunId(resolvedFixturePath);
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? path.join('artifacts', 'rehearsal', runId);

  const rehearsalResult = await runProjectionRehearsal({
    bundle,
    output_dir: outputDir,
    run_id: runId,
    generated_at: generatedAt,
  });
  if (!rehearsalResult.ok) return serviceFailure(rehearsalResult.errors, adapterResult.warnings.concat(rehearsalResult.warnings));

  const coverageResult = await readCoverageArtifact(rehearsalResult.data.output_dir);
  if (!coverageResult.ok) return serviceFailure(coverageResult.errors, rehearsalResult.warnings.concat(coverageResult.warnings));

  const summary: TiberDataFixtureRehearsalSummary = {
    run_id: rehearsalResult.data.run_id,
    generated_at: rehearsalResult.data.generated_at,
    fixture_path: resolvedFixturePath,
    output_dir: rehearsalResult.data.output_dir,
    player_count: coverageResult.data.total_players,
    mapped_players: rehearsalResult.data.mapped_players,
    skipped_players: rehearsalResult.data.skipped_players,
    warning_count: rehearsalResult.data.warnings.length,
    missing_field_count: coverageResult.data.missing_fields.length,
    written_artifacts: rehearsalResult.data.written_artifacts,
    warnings: rehearsalResult.data.warnings,
  };

  return serviceSuccess(summary, rehearsalResult.warnings);
};
