/**
 * Canonical contract for the point-scenario lab compatibility / Data Lab surface.
 *
 * This is a PPM-owned mirror of the tolerant shape TIBER-Fantasy's Point Scenario
 * Lab adapter consumes. It is intentionally a compatibility surface and is NOT part
 * of the primary scoring kernel (`/api/scoring/*`, `/api/tiber/*`). See
 * `docs/point-scenario-lab-compatibility.md` and Issue #43.
 *
 * Field naming uses snake_case to match the downstream adapter's preferred keys so
 * the payload validates without relying on the adapter's looser fallbacks.
 */

/** Kernel version stamped into provenance. Mirrors `package.json` version. */
export const POINT_SCENARIO_LAB_MODEL_VERSION = '0.1.0';

/**
 * Stable, dataset-level contract literal for the Point Scenario Lab surface.
 *
 * This is intentionally distinct from `model_version` (a per-row kernel stamp):
 * it identifies the *shape and meaning* of the lab dataset as a whole, so a
 * downstream promotion gate can pin to an exact contract. Bump only on a
 * breaking change to the canonical lab response/export contract.
 */
export const POINT_SCENARIO_LAB_CONTRACT_VERSION = 'point_scenario_lab_v1';

/** How the lab payload was produced/served. */
export type PointScenarioLabMode = 'api' | 'artifact';

/**
 * Dataset-level governance state of a lab payload.
 *
 * - `governed`   — produced from an explicitly governed dataset/pipeline.
 * - `fixture`    — seeded/illustrative/sample data (e.g. the seeded scenario
 *                  registry). Distinguishable from governed output, never promotable.
 * - `ungoverned` — real but not governed output.
 * - `unknown`    — governance could not be established. Fail-closed default.
 */
export type PointScenarioLabGovernanceStatus = 'governed' | 'fixture' | 'ungoverned' | 'unknown';

/**
 * How the governance status was established.
 *
 * - `explicit_marker` — the producer explicitly asserted the status. The only
 *                       signal a promotion gate should treat as authoritative.
 * - `path_inference`  — inferred from an artifact/route path. A weak hint only.
 * - `unknown`         — no signal available. Fail-closed default.
 */
export type PointScenarioLabGovernanceSource = 'explicit_marker' | 'path_inference' | 'unknown';

/**
 * Producer-owned, dataset-level promotion metadata for the lab payload.
 *
 * This is the surface TIBER-Fantasy's shared promotion gate consumes. Field
 * names are camelCase (matching the gate's expected keys), intentionally
 * distinct from the snake_case row/provenance keys the lab adapter consumes.
 *
 * Row-level `provenance.model_version` / `provenance.generated_at` and
 * `source.mode` are NOT sufficient for promotion: a gate must read these
 * dataset-level fields instead.
 */
export interface PointScenarioLabMetadata {
  governanceStatus: PointScenarioLabGovernanceStatus;
  governanceSource: PointScenarioLabGovernanceSource;
  /** Exact dataset-level contract literal, e.g. `point_scenario_lab_v1`. */
  contractVersion: string;
  /** Dataset-level freshness timestamp for this response/export (ISO-8601). */
  generatedAt: string;
  /** Optional promotion timestamp, only when distinct from `generatedAt` and meaningful. */
  promotedAt?: string | null;
  /** Optional non-advisory operator note. Never start/sit/trade/waiver guidance. */
  promotionNotes?: string | null;
}

export interface PointScenarioLabProvenance {
  provider: string;
  source_name: string | null;
  source_type: string | null;
  model_version: string | null;
  generated_at: string | null;
  source_metadata: Record<string, unknown>;
}

export interface PointScenarioLabRow {
  scenario_id: string | null;
  scenario_name: string;
  player_id: string | null;
  player_name: string;
  team: string | null;
  position: string | null;
  season: number | null;
  week: number | null;
  baseline_projection: number | null;
  adjusted_projection: number | null;
  delta: number | null;
  confidence_band: string | null;
  confidence_label: string | null;
  scenario_type: string | null;
  event_type: string | null;
  notes: string[];
  explanation: string | null;
  provenance: PointScenarioLabProvenance;
  raw_fields: Record<string, unknown>;
}

export interface PointScenarioLabSource {
  provider: string;
  location: string | null;
  mode: PointScenarioLabMode;
}

export interface PointScenarioLabResponse {
  season: number | null;
  available_seasons: number[];
  rows: PointScenarioLabRow[];
  source: PointScenarioLabSource;
  /** Dataset-level governance/contract/freshness metadata (additive; see `PointScenarioLabMetadata`). */
  metadata: PointScenarioLabMetadata;
}
