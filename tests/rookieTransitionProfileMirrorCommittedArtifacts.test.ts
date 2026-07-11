/**
 * Guards the actual committed rookie_transition_profile_v0.2.0 Forecast mirror (#151) under
 * `data/fixtures/tiberRookies/`: byte/hash parity with the pinned TIBER-Rookies source, population
 * and drafted/UDFA outcome parity, wrapper shape and authorization/labeling invariants, that exactly
 * the four authorized artifacts exist and nothing else, and that no model/production path imports
 * the mirror (inertness).
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AUTHORIZED_MIRROR_FILENAMES,
  MIRROR_CSV_PATH,
  MIRROR_DIR,
  MIRROR_JSON_PATH,
  MIRROR_MANIFEST_PATH,
  MIRROR_PROVENANCE_PATH,
  PINNED_ARTIFACT_SHA256,
  PINNED_SOURCE_MANIFEST_INPUT_HASHES,
  REQUIRED_UDFA_ROW,
  SOURCE_COMMIT,
  SOURCE_COVERAGE_SUMMARY,
  SOURCE_REPO,
  SOURCE_ROW_COUNT,
  WRAPPER_KIND,
  WRAPPER_SCHEMA_VERSION,
  type RookieTransitionProfileMirrorProvenance,
} from '../src/rehearsal/rookieTransitionProfileMirror.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoPath = (rel: string): string => path.join(REPO_ROOT, rel);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

interface MirroredRow {
  player_id: string;
  official_postdraft_outcome: {
    value: { status: string; nfl_team: string | null; draft_round: number | null; overall_pick: number | null; is_udfa: boolean } | null;
    provenance: { last_verified_at: string | null };
  };
}
interface MirroredArtifact {
  schema_version: string;
  season: number;
  coverage_summary: Record<string, number>;
  rows: MirroredRow[];
}

const mirrorJsonBytes = readFileSync(repoPath(MIRROR_JSON_PATH));
const mirrorCsvBytes = readFileSync(repoPath(MIRROR_CSV_PATH));
const mirrorManifestBytes = readFileSync(repoPath(MIRROR_MANIFEST_PATH));
const wrapper = JSON.parse(readFileSync(repoPath(MIRROR_PROVENANCE_PATH), 'utf-8')) as RookieTransitionProfileMirrorProvenance;
const mirroredArtifact = JSON.parse(mirrorJsonBytes.toString('utf-8')) as MirroredArtifact;

describe('committed rookie_transition_profile_v0.2.0 Forecast mirror (#151)', () => {
  describe('byte and hash parity', () => {
    it('mirrored JSON/CSV/manifest hashes equal the pinned upstream hashes', () => {
      expect(sha256(mirrorJsonBytes)).toBe(PINNED_ARTIFACT_SHA256.json);
      expect(sha256(mirrorCsvBytes)).toBe(PINNED_ARTIFACT_SHA256.csv);
      expect(sha256(mirrorManifestBytes)).toBe(PINNED_ARTIFACT_SHA256.manifest);
    });

    it('the wrapper records the same mirrored hashes it was built from', () => {
      expect(wrapper.forecast_mirror.mirrored_hashes.mirror_json).toBe(PINNED_ARTIFACT_SHA256.json);
      expect(wrapper.forecast_mirror.mirrored_hashes.mirror_csv).toBe(PINNED_ARTIFACT_SHA256.csv);
      expect(wrapper.forecast_mirror.mirrored_hashes.mirror_manifest).toBe(PINNED_ARTIFACT_SHA256.manifest);
    });

    it('the mirrored manifest is unmodified -- still declares its original internal paths', () => {
      const manifest = JSON.parse(mirrorManifestBytes.toString('utf-8')) as { output_files: Array<{ path: string }> };
      expect(manifest.output_files.some((f) => f.path.startsWith('exports/promoted/rookie-transition-profile/'))).toBe(true);
    });
  });

  describe('source lock', () => {
    it('the wrapper records the exact locked repo, commit, and promoted path', () => {
      expect(wrapper.source_lock.repo).toBe(SOURCE_REPO);
      expect(wrapper.source_lock.commit).toBe(SOURCE_COMMIT);
      expect(wrapper.source_lock.artifact_hashes).toEqual(PINNED_ARTIFACT_SHA256);
      expect(wrapper.source_lock.source_manifest_input_hashes).toEqual(PINNED_SOURCE_MANIFEST_INPUT_HASHES);
    });

    it('the wrapper points at the governing #149/#150 design and this implementation issue', () => {
      expect(wrapper.issue).toBe('TIBER-Forecast#151');
      expect(wrapper.governing_design.consumption_design_issue).toBe('TIBER-Forecast#149');
      expect(wrapper.governing_design.consumption_design_pr).toBe('TIBER-Forecast#150');
      expect(wrapper.governing_design.consumption_design_merge_commit).toBe('6c68b1691476f0d26f1b0270e32c199a3ee2f436');
    });

    it('wrapper kind/schema_version are exactly as specified', () => {
      expect(wrapper.kind).toBe(WRAPPER_KIND);
      expect(wrapper.schema_version).toBe(WRAPPER_SCHEMA_VERSION);
    });
  });

  describe('population and outcome parity', () => {
    it('48 unique player_id rows in the mirrored JSON', () => {
      const ids = mirroredArtifact.rows.map((r) => r.player_id);
      expect(mirroredArtifact.rows.length).toBe(SOURCE_ROW_COUNT);
      expect(new Set(ids).size).toBe(SOURCE_ROW_COUNT);
    });

    it('47 drafted + 1 udfa_signed', () => {
      const statuses = mirroredArtifact.rows.map((r) => r.official_postdraft_outcome.value?.status);
      expect(statuses.filter((s) => s === 'drafted').length).toBe(47);
      expect(statuses.filter((s) => s === 'udfa_signed').length).toBe(1);
    });

    it("te-daequan-wright's row matches the required UDFA shape exactly, with last_verified_at null", () => {
      const row = mirroredArtifact.rows.find((r) => r.player_id === REQUIRED_UDFA_ROW.player_id);
      expect(row).toBeDefined();
      expect(row?.official_postdraft_outcome.value?.status).toBe('udfa_signed');
      expect(row?.official_postdraft_outcome.value?.nfl_team).toBe(REQUIRED_UDFA_ROW.nfl_team);
      expect(row?.official_postdraft_outcome.value?.is_udfa).toBe(true);
      expect(row?.official_postdraft_outcome.value?.draft_round).toBeNull();
      expect(row?.official_postdraft_outcome.value?.overall_pick).toBeNull();
      expect(row?.official_postdraft_outcome.provenance.last_verified_at).toBeNull();
    });

    it('schema_version, season, and coverage_summary match the pinned source lock', () => {
      expect(mirroredArtifact.schema_version).toBe('rookie-transition-profile-v0.2.0');
      expect(mirroredArtifact.season).toBe(2026);
      expect(mirroredArtifact.coverage_summary).toEqual(SOURCE_COVERAGE_SUMMARY);
    });

    it('the wrapper records the same population/outcome parity counts', () => {
      expect(wrapper.population_and_outcome_parity.unique_player_id_rows).toBe(48);
      expect(wrapper.population_and_outcome_parity.status_drafted_count).toBe(47);
      expect(wrapper.population_and_outcome_parity.status_udfa_signed_count).toBe(1);
      expect(wrapper.population_and_outcome_parity.udfa_row).toEqual(REQUIRED_UDFA_ROW);
    });
  });

  describe('identity-resolution status', () => {
    it('all 48 player_id values are enumerated and marked unresolved_to_forecast_population', () => {
      expect(wrapper.identity_resolution.rows.length).toBe(48);
      expect(wrapper.identity_resolution.resolved_count).toBe(0);
      expect(wrapper.identity_resolution.unresolved_count).toBe(48);
      expect(wrapper.identity_resolution.rows.every((r) => r.status === 'unresolved_to_forecast_population')).toBe(true);
      const wrapperIds = new Set(wrapper.identity_resolution.rows.map((r) => r.player_id));
      const artifactIds = new Set(mirroredArtifact.rows.map((r) => r.player_id));
      expect(wrapperIds).toEqual(artifactIds);
    });

    it('no name-based or fuzzy join is claimed, and no feature-bearing join is authorized', () => {
      expect(wrapper.identity_resolution.name_based_or_fuzzy_joins_performed).toBe(false);
      expect(wrapper.identity_resolution.feature_bearing_join_authorized).toBe(false);
      expect(wrapper.identity_resolution.crosswalk_status).toBe('no_verified_crosswalk_exists');
    });
  });

  describe('temporal and authorization status', () => {
    it('every family is audit_only, pre-draft eligibility is unresolved, and every authorization flag is false', () => {
      expect(wrapper.temporal_and_authorization_status).toEqual({
        all_field_families: 'audit_only',
        pre_draft_temporal_eligibility: 'unresolved',
        phase_specific_projection_created: false,
        experiment_eligibility_established: false,
        model_use_authorized: false,
        production_use_authorized: false,
      });
    });

    it('the wrapper never assigns any value equal to pre_draft_safe, experiment_eligible, feature_ready, model_ready, or production_ready', () => {
      // Substring search would false-positive on legitimate NEGATION flag names (e.g.
      // "no_model_ready_features_created": true), so this walks actual VALUES instead -- the
      // real invariant is that no field/row is ever labeled with one of these statuses, not that
      // the words never appear as part of a negated boundary-flag key name.
      const forbiddenValues = ['pre_draft_safe', 'experiment_eligible', 'feature_ready', 'model_ready', 'production_ready'];
      const hits: string[] = [];
      const walk = (value: unknown, keyPath: string): void => {
        if (typeof value === 'string' && forbiddenValues.includes(value)) hits.push(keyPath);
        else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${keyPath}[${i}]`));
        else if (value !== null && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) walk(v, `${keyPath}.${k}`);
        }
      };
      walk(wrapper, 'wrapper');
      expect(hits).toEqual([]);
    });

    it('mirror_refreshed_at is documented as an operational timestamp only', () => {
      expect(wrapper.forecast_mirror.mirror_refreshed_at_is_operational_timestamp_only_not_fact_availability).toBe(true);
      expect(typeof wrapper.forecast_mirror.mirror_refreshed_at).toBe('string');
    });

    it('every boundary flag is true (no transformation, no projection, no crosswalk, no experiment, no model/production import)', () => {
      expect(Object.values(wrapper.boundary).every((v) => v === true)).toBe(true);
    });
  });

  describe('no derived artifact', () => {
    it('data/fixtures/tiberRookies/ contains exactly the four authorized files and nothing else', () => {
      const actualFiles = readdirSync(repoPath(MIRROR_DIR)).sort();
      expect(actualFiles).toEqual([...AUTHORIZED_MIRROR_FILENAMES].sort());
    });

    it('no filename in the mirror directory suggests a phase-filtered, normalized, feature, score, or composite artifact', () => {
      const actualFiles = readdirSync(repoPath(MIRROR_DIR));
      const suspiciousMarkers = ['pre_draft', 'post_draft', 'adapter', 'feature', 'score', 'rank', 'composite', 'normalized'];
      for (const filename of actualFiles) {
        for (const marker of suspiciousMarkers) {
          expect(filename.toLowerCase()).not.toContain(marker);
        }
      }
    });

    it('official_postdraft_outcome is present on every row of the mirrored JSON (never removed by a projection)', () => {
      expect(mirroredArtifact.rows.every((r) => Object.prototype.hasOwnProperty.call(r, 'official_postdraft_outcome'))).toBe(true);
    });
  });

  describe('inertness', () => {
    const SCAN_DIRS = ['src/models', 'src/services'];

    const collectFiles = (dir: string): string[] => {
      const abs = repoPath(dir);
      const out: string[] = [];
      const walk = (current: string): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) out.push(full);
        }
      };
      walk(abs);
      return out;
    };

    it('no file under src/models/ or src/services/ references the mirror directory or its paths', () => {
      const needles = ['tiberRookies', 'rookie_transition_profile', 'ROOKIE_TRANSITION_PROFILE'];
      const hits: string[] = [];
      for (const dir of SCAN_DIRS) {
        for (const file of collectFiles(dir)) {
          const text = readFileSync(file, 'utf-8');
          for (const needle of needles) {
            if (text.includes(needle)) hits.push(`${file}: ${needle}`);
          }
        }
      }
      expect(hits).toEqual([]);
    });

    it('package.json has no start/build/production script that references the mirror', () => {
      const pkg = JSON.parse(readFileSync(repoPath('package.json'), 'utf-8')) as { scripts: Record<string, string> };
      const productionLikeScripts = ['start', 'dev', 'start:api', 'dev:api', 'build'];
      for (const scriptName of productionLikeScripts) {
        const command = pkg.scripts[scriptName] ?? '';
        expect(command).not.toContain('tiberRookies');
        expect(command).not.toContain('rookie_transition_profile');
      }
    });
  });
});
