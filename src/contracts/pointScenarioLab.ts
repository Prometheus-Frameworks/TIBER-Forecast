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

/** How the lab payload was produced/served. */
export type PointScenarioLabMode = 'api' | 'artifact';

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
}
