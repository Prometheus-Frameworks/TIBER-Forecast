import type { ScoringPosition } from './scoring.js';

/**
 * Local mirror of the upstream TIBER-Data projection-input fixture contract
 * (`TIBER-Data/src/contracts/v1/projectionInputFixture.ts`,
 * `tiber-data.projection-input-fixture.v1.0.0`).
 *
 * PPM does not import from the TIBER-Data repo, so this file documents the
 * upstream fixture envelope that the named adapter
 * (`src/adapters/tiberData/fromProjectionInputFixture.ts`) accepts and
 * validates at runtime before translating into the PPM ingestion bundle
 * (`TiberDataProjectionInputBundle`, `tiber-data-projection-input-v1`).
 *
 * This is a fixture/governance boundary only. It does not change scoring math
 * and is never treated as canonical PPM input. See
 * `docs/tiber-data-fixture-adapter-decision.md`.
 */
export const TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION =
  'tiber-data.projection-input-fixture.v1.0.0' as const;

export interface ProjectionInputFixtureScope {
  kind: string;
  production_coverage_claim: boolean;
  projection_label?: string;
  evidence_window?: string;
  notes?: string[];
}

export interface ProjectionInputFixtureSourceDatasetRef {
  name: string;
  path: string;
  version?: string;
  provenance?: string;
  source_path?: string;
  usage: string;
}

export interface ProjectionInputFixtureIdentityRef {
  source_paths: string[];
  identity_fields: string[];
  projection_label_policy: string;
}

/**
 * TIBER-Data keeps the fixture-level severity as the single literal `"warning"`.
 * It is an evidence-gap marker, not a downstream scoring `required | optional`
 * severity. Downstream adapters must remap it explicitly.
 */
export interface ProjectionInputFixtureMissingField {
  field: string;
  severity: 'warning';
  reason: string;
  player_id?: string;
  impact?: string;
}

export interface ProjectionInputFixtureLeagueContext {
  teams: number;
  starters: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    FLEX?: number;
  };
  flex_allocation?: {
    RB?: number;
    WR?: number;
    TE?: number;
  };
  /** Per-position buffer object; intentionally NOT the PPM scalar shape. */
  replacement_buffer?: Partial<Record<ScoringPosition, number>>;
}

export interface ProjectionInputFixtureBundle {
  input_contract_version: typeof TIBER_DATA_PROJECTION_INPUT_FIXTURE_CONTRACT_VERSION | string;
  tiber_data_schema_version: string;
  fixture_scope: ProjectionInputFixtureScope;
  source_dataset_refs: ProjectionInputFixtureSourceDatasetRef[];
  identity_ref: ProjectionInputFixtureIdentityRef;
  projection_context?: Record<string, unknown>;
  league_context: ProjectionInputFixtureLeagueContext;
  player_opportunities: Array<Record<string, unknown>>;
  missing_fields?: ProjectionInputFixtureMissingField[];
  adapter_warnings?: string[];
}
