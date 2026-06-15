import { describe, expect, it } from 'vitest';
import { fromProjectionInputFixture } from '../src/adapters/tiberData/fromProjectionInputFixture.js';
import { TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION } from '../src/contracts/tiberDataProjectionInputFixture.js';
import { TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION } from '../src/contracts/tiberDataProjectionInput.js';

const GOVERNED_IDENTITY = { version: 'gov-identity-v1' } as const;

const baseFixture = (): Record<string, unknown> => ({
  input_contract_version: TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION,
  tiber_data_schema_version: 'projection_input_semantics.v0.1.0',
  fixture_scope: {
    kind: 'bounded_rehearsal_fixture',
    production_coverage_claim: false,
    projection_label: '2026_w01',
    evidence_window: '2025_w01_source_backed',
    notes: ['rehearsal only'],
  },
  source_dataset_refs: [
    {
      name: 'player_weekly_usage_2025_source_backed',
      path: 'data/processed/evidence/usage.json',
      version: '2025.1.0',
      provenance: 'nflreadpy.load_player_stats',
      source_path: 'nflverse via nflreadpy',
      usage: 'week 1 usage evidence',
    },
  ],
  identity_ref: {
    source_paths: ['data/processed/evidence/usage.json', 'data/processed/evidence/ppr.json'],
    identity_fields: ['player_id', 'player_name', 'team', 'position'],
    projection_label_policy: 'rehearsal label policy',
  },
  projection_context: { season: 2026, week: 1, fixture_only: true },
  league_context: {
    teams: 12,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
    flex_allocation: { RB: 0.35, WR: 0.55, TE: 0.1 },
    replacement_buffer: { QB: 2, RB: 8, WR: 10, TE: 4 },
  },
  player_opportunities: [
    {
      player_id: 'wr-1',
      player_name: 'Fixture Receiver',
      team: 'MIN',
      position: 'WR',
      season: 2026,
      week: 1,
      games_sampled: 14,
      routes_pg: 35.5,
      targets_per_route: 0.27,
      catch_rate: 0.66,
      yards_per_target: 8.9,
      team_pass_rate_environment: 0.61,
      team_pace: 1.04,
      offensive_environment: 22.7,
    },
  ],
  missing_fields: [
    { field: 'receiving_td_rate', severity: 'warning', reason: 'omitted', player_id: 'wr-1' },
    { field: 'player_name', severity: 'warning', reason: 'demonstrates required mapping', player_id: 'wr-1' },
  ],
  adapter_warnings: ['fixture-only bundle'],
});

const warningCodes = (warnings: { code: string }[]): string[] => warnings.map((warning) => warning.code);

describe('fromProjectionInputFixture', () => {
  it('1. maps a valid fixture into the PPM TiberDataProjectionInputBundle', () => {
    const result = fromProjectionInputFixture({ fixture: baseFixture(), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { bundle } = result.data;
    expect(bundle.input_contract_version).toBe(TIBER_DATA_PROJECTION_INPUT_CONTRACT_VERSION);
    expect(bundle.tiber_data_schema_version).toBe('projection_input_semantics.v0.1.0');
    expect(bundle.source_dataset_refs).toEqual([
      { dataset_id: 'player_weekly_usage_2025_source_backed', version: '2025.1.0', uri: 'nflverse via nflreadpy' },
    ]);
    expect(bundle.identity_ref.version).toBe('gov-identity-v1');
    expect(bundle.identity_ref.identity_artifact_id).toMatch(/^tiber-data-identity:[0-9a-f]{16}$/);
    expect(bundle.projection_context).toEqual({ season: 2026, week: 1, fixture_only: true });
    expect(bundle.league_context).not.toHaveProperty('replacement_buffer');

    // The contract-version remap warning preserves the source version.
    const versionWarning = result.warnings.find((warning) => warning.code === 'TIBER_DATA_FIXTURE_CONTRACT_VERSION_MAPPED');
    expect(versionWarning?.details).toMatchObject({ source_version: TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION });
  });

  it('2. fails closed when a source_dataset_refs[].version is missing (no default)', () => {
    const fixture = baseFixture();
    delete (fixture.source_dataset_refs as Array<Record<string, unknown>>)[0].version;

    const result = fromProjectionInputFixture({ fixture, identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIBER_DATA_FIXTURE_SOURCE_DATASET_VERSION_MISSING' })]),
    );
  });

  it('3. fails closed when governed identity version/config is absent', () => {
    const result = fromProjectionInputFixture({ fixture: baseFixture() });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIBER_DATA_FIXTURE_IDENTITY_VERSION_MISSING' })]),
    );
  });

  it('4. omits per-position replacement_buffer and warns with the original values', () => {
    const result = fromProjectionInputFixture({ fixture: baseFixture(), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.bundle.league_context).not.toHaveProperty('replacement_buffer');
    const bufferWarning = result.warnings.find((warning) => warning.code === 'TIBER_DATA_FIXTURE_REPLACEMENT_BUFFER_OMITTED');
    expect(bufferWarning?.details).toMatchObject({ replacement_buffer: { QB: 2, RB: 8, WR: 10, TE: 4 } });
  });

  it('5. preserves fixture_scope.production_coverage_claim: false in a warning', () => {
    const result = fromProjectionInputFixture({ fixture: baseFixture(), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const scopeWarning = result.warnings.find((warning) => warning.code === 'TIBER_DATA_FIXTURE_SCOPE_PRESERVED');
    expect(scopeWarning?.details).toMatchObject({ production_coverage_claim: false, kind: 'bounded_rehearsal_fixture' });
  });

  it('6. maps missing_fields "warning" through the named required|optional policy', () => {
    const result = fromProjectionInputFixture({ fixture: baseFixture(), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const missing = result.data.bundle.missing_fields ?? [];
    // player_name is a PPM-required field → required; receiving_td_rate is not → optional.
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'player_name', severity: 'required' }),
        expect.objectContaining({ field: 'receiving_td_rate', severity: 'optional' }),
      ]),
    );
    const severityWarning = result.warnings.find((warning) => warning.code === 'TIBER_DATA_FIXTURE_MISSING_FIELD_SEVERITY_MAPPED');
    expect(severityWarning?.details).toMatchObject({ total: 2, mapped_required: 1, mapped_optional: 1 });
  });

  it('7. strips unsupported player env fields and warns', () => {
    const result = fromProjectionInputFixture({ fixture: baseFixture(), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const player = result.data.bundle.player_opportunities[0] as unknown as Record<string, unknown>;
    expect(player).not.toHaveProperty('team_pass_rate_environment');
    expect(player).not.toHaveProperty('team_pace');
    expect(player).not.toHaveProperty('offensive_environment');
    expect(player).toMatchObject({ player_id: 'wr-1', position: 'WR', catch_rate: 0.66 });

    const stripWarning = result.warnings.find((warning) => warning.code === 'TIBER_DATA_FIXTURE_PLAYER_FIELDS_IGNORED');
    expect(stripWarning?.details).toMatchObject({
      fields_by_player: { 'wr-1': expect.arrayContaining(['team_pass_rate_environment', 'team_pace', 'offensive_environment']) },
    });
  });

  it('rejects an unsupported fixture contract version', () => {
    const fixture = baseFixture();
    fixture.input_contract_version = 'tiber-data-projection-input-v1';

    const result = fromProjectionInputFixture({ fixture, identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TIBER_DATA_FIXTURE_CONTRACT_VERSION_UNSUPPORTED' })]),
    );
  });

  it('wraps fixture string adapter_warnings into ServiceWarning objects', () => {
    const result = fromProjectionInputFixture({ fixture: baseFixture(), identity_ref: GOVERNED_IDENTITY });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.bundle.adapter_warnings).toEqual(
      expect.arrayContaining([{ code: 'TIBER_DATA_FIXTURE_WARNING', message: 'fixture-only bundle' }]),
    );
    expect(warningCodes(result.warnings)).toContain('TIBER_DATA_FIXTURE_PROJECTION_CONTEXT_IGNORED');
  });
});
