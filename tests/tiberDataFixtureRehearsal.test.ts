import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectionInputCoverageArtifact, ProjectionRunManifestArtifact } from '../src/contracts/projectionArtifacts.js';
import { TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION } from '../src/contracts/tiberDataProjectionInputFixture.js';
import { TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION } from '../src/contracts/tiberDataProjectionInput.js';
import { runTiberDataFixtureRehearsal } from '../src/rehearsal/runTiberDataFixtureRehearsal.js';

const GOVERNED_IDENTITY = { version: 'tiber-data-identity-2026-w01' } as const;

const makeWorkDir = async (): Promise<string> => mkdtemp(path.join(os.tmpdir(), 'tiber-data-fixture-rehearsal-'));

const writeFixture = async (workDir: string, fixture: unknown, filename = 'weekly_projection_input_fixture_2026_w01.json'): Promise<string> => {
  const fixturePath = path.join(workDir, filename);
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  return fixturePath;
};

const readJson = async <T>(filePath: string): Promise<T> => JSON.parse(await readFile(filePath, 'utf8')) as T;

const readJsonl = async <T>(filePath: string): Promise<T[]> => {
  const contents = await readFile(filePath, 'utf8');
  if (contents.trim().length === 0) return [];
  return contents.trim().split('\n').map((line) => JSON.parse(line) as T);
};

/** Builds a fixture in the real TIBER-Data `projection-input-fixture.v1.0.0` shape. */
const makeTiberDataFixture = (includeUnsupportedContext = true): Record<string, unknown> => ({
  input_contract_version: TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION,
  tiber_data_schema_version: 'projection_input_semantics.v0.1.0',
  fixture_scope: {
    kind: 'bounded_rehearsal_fixture',
    production_coverage_claim: false,
    projection_label: '2026_w01',
    evidence_window: '2025_w01_source_backed',
    notes: ['Rehearsal-only bundle; not a production projection claim.'],
  },
  source_dataset_refs: [
    {
      name: 'player_weekly_usage_2025_source_backed',
      path: 'data/processed/evidence/player_weekly_usage_2025.source_backed.json',
      version: '2025.1.0',
      provenance: 'nflreadpy.load_player_stats',
      source_path: 'nflverse player stats via nflreadpy',
      usage: 'week 1 usage source evidence',
    },
  ],
  identity_ref: {
    source_paths: [
      'data/processed/evidence/player_weekly_usage_2025.source_backed.json',
      'data/processed/evidence/player_weekly_ppr_outcomes_2025.source_backed.json',
    ],
    identity_fields: ['player_id', 'player_name', 'team', 'position', 'season', 'week'],
    projection_label_policy: 'season/week use the 2026_w01 rehearsal label; source evidence remains 2025_w01.',
  },
  league_context: {
    teams: 12,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
    flex_allocation: { RB: 0.35, WR: 0.55, TE: 0.1 },
    replacement_buffer: { QB: 2, RB: 8, WR: 10, TE: 4 },
  },
  player_opportunities: [
    {
      player_id: 'tiber-fixture-wr-1',
      player_name: 'TIBER Fixture Receiver',
      team: 'MIN',
      position: 'WR',
      season: 2026,
      week: 1,
      games_sampled: 14,
      route_participation: 0.9,
      routes_pg: 35.5,
      targets_per_route: 0.27,
      first_read_target_share: 0.3,
      air_yards_per_target: 10.5,
      end_zone_targets_pg: 0.5,
      red_zone_target_share: 0.22,
      catch_rate: 0.66,
      yards_per_target: 8.9,
      role_stability: 0.8,
      td_dependency: 0.42,
      injury_risk: 0.25,
      ...(includeUnsupportedContext
        ? { team_pass_rate_environment: 0.61, team_pace: 1.04, offensive_environment: 22.7 }
        : {}),
    },
  ],
  missing_fields: [
    {
      field: 'receiving_td_rate',
      severity: 'warning',
      reason: 'TIBER-Data fixture intentionally omits receiver TD rate.',
      player_id: 'tiber-fixture-wr-1',
      impact: 'Adapter must keep the gap visible and not synthesize a substitute.',
    },
  ],
  adapter_warnings: ['Fixture-only rehearsal bundle; do not treat as production ingestion.'],
  // projection_context only present in the with-context variant.
  ...(includeUnsupportedContext
    ? {
        projection_context: {
          season: 2026,
          week: 1,
          league: 'NFL',
          scoring_format: 'PPR',
          fixture_only: true,
          production_ingestion: false,
          source_evidence_season: 2025,
          source_evidence_week: 1,
        },
      }
    : {}),
});

describe('TIBER-Data fixture rehearsal flow', () => {
  it('consumes a TIBER-Data-owned fixture shape and writes projection artifacts', async () => {
    const workDir = await makeWorkDir();
    const fixturePath = await writeFixture(workDir, makeTiberDataFixture());
    const outputDir = path.join(workDir, 'artifacts');

    const result = await runTiberDataFixtureRehearsal({
      fixture_path: fixturePath,
      output_dir: outputDir,
      generated_at: '2026-05-14T00:00:00.000Z',
      identity_ref: GOVERNED_IDENTITY,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({
      run_id: 'tiber-data-fixture-2026-w01',
      generated_at: '2026-05-14T00:00:00.000Z',
      fixture_path: path.resolve(fixturePath),
      player_count: 1,
      mapped_players: 1,
      skipped_players: 0,
    });
    expect(result.data.warning_count).toBe(result.data.warnings.length);
    expect(result.data.missing_field_count).toBeGreaterThanOrEqual(1);
    expect(result.data.written_artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact_type: 'projection_run_manifest', row_count: 1 }),
        expect.objectContaining({ artifact_type: 'weekly_player_projection', row_count: 1 }),
        expect.objectContaining({ artifact_type: 'projection_input_coverage', row_count: 1 }),
      ]),
    );

    for (const artifact of result.data.written_artifacts) {
      await expect(stat(artifact.path)).resolves.toMatchObject({ isFile: expect.any(Function) });
    }
  });

  it('maps refs/identity to PPM shape and preserves provenance + boundary warnings', async () => {
    const workDir = await makeWorkDir();
    const fixturePath = await writeFixture(workDir, makeTiberDataFixture());
    const outputDir = path.join(workDir, 'artifacts');

    const result = await runTiberDataFixtureRehearsal({ fixture_path: fixturePath, output_dir: outputDir, identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const manifest = await readJson<ProjectionRunManifestArtifact>(path.join(outputDir, 'projection-run-manifest.json'));
    const coverage = await readJson<ProjectionInputCoverageArtifact>(path.join(outputDir, 'projection-input-coverage.json'));

    // Manifest carries the MAPPED PPM ref shape, not the raw fixture shape.
    expect(manifest.input_contract_version).toBe(TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION);
    expect(manifest.source_dataset_refs).toEqual([
      {
        dataset_id: 'player_weekly_usage_2025_source_backed',
        version: '2025.1.0',
        uri: 'nflverse player stats via nflreadpy',
      },
    ]);
    expect(manifest.identity_ref).toMatchObject({ version: GOVERNED_IDENTITY.version });
    expect(manifest.identity_ref.identity_artifact_id).toMatch(/^tiber-data-identity:[0-9a-f]{16}$/);

    const warningCodes = coverage.adapter_warnings.map((warning) => warning.code);
    expect(warningCodes).toEqual(
      expect.arrayContaining([
        'TIBER_DATA_FIXTURE_WARNING',
        'TIBER_DATA_FIXTURE_CONTRACT_VERSION_MAPPED',
        'TIBER_DATA_FIXTURE_SCOPE_PRESERVED',
        'TIBER_DATA_FIXTURE_PROJECTION_CONTEXT_IGNORED',
        'TIBER_DATA_FIXTURE_PLAYER_FIELDS_IGNORED',
        'TIBER_DATA_FIXTURE_SOURCE_DATASET_FIELDS_DROPPED',
        'TIBER_DATA_FIXTURE_IDENTITY_REMAPPED',
        'TIBER_DATA_FIXTURE_REPLACEMENT_BUFFER_OMITTED',
        'TIBER_DATA_FIXTURE_MISSING_FIELD_SEVERITY_MAPPED',
      ]),
    );

    const scopeWarning = coverage.adapter_warnings.find((warning) => warning.code === 'TIBER_DATA_FIXTURE_SCOPE_PRESERVED');
    expect(scopeWarning?.details).toMatchObject({ production_coverage_claim: false });

    // missing_fields severity "warning" became "optional" (receiving_td_rate is not a PPM-required field).
    expect(coverage.missing_fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'receiving_td_rate', severity: 'optional' })]),
    );
  });

  it('does not let extra context fields affect scoring yet', async () => {
    const workDir = await makeWorkDir();
    const withContextPath = await writeFixture(workDir, makeTiberDataFixture(true), 'weekly_projection_input_fixture_2026_w01.json');
    const withoutContextPath = await writeFixture(workDir, makeTiberDataFixture(false), 'weekly_projection_input_fixture_2026_w01_no_context.json');

    const withContextResult = await runTiberDataFixtureRehearsal({ fixture_path: withContextPath, output_dir: path.join(workDir, 'with-context'), identity_ref: GOVERNED_IDENTITY });
    const withoutContextResult = await runTiberDataFixtureRehearsal({ fixture_path: withoutContextPath, output_dir: path.join(workDir, 'without-context'), identity_ref: GOVERNED_IDENTITY });

    expect(withContextResult.ok).toBe(true);
    expect(withoutContextResult.ok).toBe(true);
    if (!withContextResult.ok || !withoutContextResult.ok) return;

    const withContextRows = await readJsonl<Record<string, unknown>>(path.join(withContextResult.data.output_dir, 'weekly-player-projections.jsonl'));
    const withoutContextRows = await readJsonl<Record<string, unknown>>(path.join(withoutContextResult.data.output_dir, 'weekly-player-projections.jsonl'));

    expect(withContextRows[0]).not.toHaveProperty('team_pass_rate_environment');
    expect(withContextRows[0]).not.toHaveProperty('team_pace');
    expect(withContextRows[0]).not.toHaveProperty('offensive_environment');
    expect(withContextRows[0].expected_points).toBe(withoutContextRows[0].expected_points);
    expect(withContextRows[0].floor).toBe(withoutContextRows[0].floor);
    expect(withContextRows[0].ceiling).toBe(withoutContextRows[0].ceiling);
  });

  it('no longer casts a PPM-shaped bundle straight through (rejects wrong contract version)', async () => {
    const workDir = await makeWorkDir();
    // A bundle already in the PPM ingestion shape must NOT be accepted as a fixture.
    const ppmShapedBundle = {
      input_contract_version: TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION,
      tiber_data_schema_version: 'ppm-shaped-v1',
      source_dataset_refs: [{ dataset_id: 'x', version: '1', uri: 'memory://x' }],
      identity_ref: { identity_artifact_id: 'x', version: '1' },
      league_context: { teams: 12, starters: { QB: 1, RB: 2, WR: 2, TE: 1 } },
      player_opportunities: [{ player_id: 'p1', player_name: 'P', team: 'MIN', position: 'WR', games_sampled: 10 }],
    };
    const fixturePath = await writeFixture(workDir, ppmShapedBundle);

    const result = await runTiberDataFixtureRehearsal({ fixture_path: fixturePath, output_dir: path.join(workDir, 'artifacts'), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIBER_DATA_FIXTURE_CONTRACT_VERSION_UNSUPPORTED' })]),
    );
  });

  it('fails closed when governed identity version is absent', async () => {
    const workDir = await makeWorkDir();
    const fixturePath = await writeFixture(workDir, makeTiberDataFixture());

    const result = await runTiberDataFixtureRehearsal({ fixture_path: fixturePath, output_dir: path.join(workDir, 'artifacts') });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIBER_DATA_FIXTURE_IDENTITY_VERSION_MISSING' })]),
    );
  });

  it('fails cleanly for an invalid local fixture path', async () => {
    const workDir = await makeWorkDir();
    const result = await runTiberDataFixtureRehearsal({ fixture_path: path.join(workDir, 'missing.json'), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TIBER_DATA_FIXTURE_READ_FAILED' })]));
  });

  it('fails malformed optional values through adapter validation without coercion', async () => {
    const workDir = await makeWorkDir();
    const fixture = makeTiberDataFixture();
    (fixture.player_opportunities as Array<Record<string, unknown>>)[0].catch_rate = '0.66';
    const fixturePath = await writeFixture(workDir, fixture);

    const result = await runTiberDataFixtureRehearsal({ fixture_path: fixturePath, output_dir: path.join(workDir, 'artifacts'), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TIBER_DATA_OPTIONAL_FIELD_INVALID',
          message: 'player_opportunities[0].catch_rate must be a finite number when supplied.',
        }),
      ]),
    );
  });
});
