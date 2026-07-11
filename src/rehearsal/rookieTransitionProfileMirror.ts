/**
 * Inert Forecast mirror of TIBER-Rookies' promoted `rookie_transition_profile_v0.2.0` (Forecast
 * #151), implementing exactly the contract approved in #149/PR #150
 * (`docs/experiments/rookie-transition-profile-forecast-consumption-design-2026-07-11.md`).
 *
 * This module is PURE (no I/O): it verifies a source-locked byte payload against pinned identity
 * constants and, only if every check passes, assembles the four mirror artifacts (three
 * byte-identical echoes of the upstream payload plus one Forecast-owned provenance wrapper). The
 * CLI (`scripts/refreshRookieTransitionProfileMirror.ts`) does the actual file I/O and git-identity
 * lookup and calls this module.
 *
 * This mirror is INERT: it performs no transformation, filtering, normalization, adapter, feature
 * extraction, experiment, model import, or production binding. Every field family is `audit_only`;
 * pre-draft temporal eligibility is `unresolved` (per #149 §5); no phase-specific projection is
 * created; no canonical player-ID crosswalk is built (per #149 §3, all identities are recorded
 * `unresolved_to_forecast_population`); no field is ever labeled `pre_draft_safe`,
 * `experiment_eligible`, `feature_ready`, `model_ready`, or `production_ready`.
 *
 * Decision semantics (exactly one is emitted):
 * - `may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue`: every source-lock,
 *   byte-parity, and population check passed. Authorizes only a SEPARATE, later mirror-validation/
 *   rehearsal issue against this committed mirror -- not an availability-proof audit, adapter,
 *   experiment, feature use, or production binding.
 * - `rookie_transition_profile_forecast_mirror_requires_followup`: reserved for a future case where
 *   the refresh mechanically completes but something outside this module's fixed identity/hash/
 *   population checks needs human attention (e.g. an unexpected pre-existing mirror-directory
 *   conflict). Not reachable by any check this module currently defines; every check here is a
 *   binary identity/hash/population invariant, not a soft floor.
 * - `rookie_transition_profile_forecast_mirror_blocked`: any source-lock, hash, or population check
 *   failed. No mirror file or wrapper may be written.
 */

export const ROOKIE_TRANSITION_PROFILE_MIRROR_VERSION = 'rookie-transition-profile-forecast-mirror-v1' as const;

export const MIRROR_IMPLEMENTATION_ISSUE = 'TIBER-Forecast#151' as const;
export const CONSUMPTION_DESIGN_ISSUE = 'TIBER-Forecast#149' as const;
export const CONSUMPTION_DESIGN_PR = 'TIBER-Forecast#150' as const;
export const CONSUMPTION_DESIGN_MERGE_COMMIT = '6c68b1691476f0d26f1b0270e32c199a3ee2f436' as const;
export const CONSUMPTION_DESIGN_DOCUMENTS = [
  'docs/experiments/rookie-transition-profile-forecast-consumption-design-2026-07-11.md',
  'docs/experiments/rookie-transition-profile-forecast-consumption-design-2026-07-11.json',
] as const;

// ---------------------------------------------------------------------------------------------
// Upstream source lock (pinned; ANY mismatch fails closed -- never refreshed against mutable main)
// ---------------------------------------------------------------------------------------------

export const SOURCE_REPO = 'Prometheus-Frameworks/TIBER-Rookies' as const;
export const SOURCE_COMMIT = '2ef92faf9a9c91a393f53e9140428451529a1c48' as const;
export const SOURCE_PROMOTED_PATH = 'exports/promoted/rookie-transition-profile/' as const;
export const SOURCE_SCHEMA_VERSION = 'rookie-transition-profile-v0.2.0' as const;
export const SOURCE_SEASON = 2026 as const;
export const SOURCE_GENERATED_AT = '2026-07-10T12:00:00+00:00' as const;
export const SOURCE_RUN_ID = 'rookie-transition-profile-2026-2026-07-10T12:00:00+00:00' as const;
export const SOURCE_ROW_COUNT = 48 as const;

export const SOURCE_COVERAGE_SUMMARY = {
  players_total: 48,
  players_with_draft_capital: 48,
  players_with_age_at_entry: 47,
  players_with_athletic_testing: 32,
  players_with_college_production: 48,
  players_with_official_postdraft_outcome: 48,
  players_with_all_families: 32,
} as const;

export const SOURCE_ARTIFACT_FILENAMES = {
  json: '2026_rookie_transition_profile_v0.json',
  csv: '2026_rookie_transition_profile_v0.csv',
  manifest: '2026_manifest.json',
} as const;

export const PINNED_ARTIFACT_SHA256 = {
  json: 'c95b941c7855612daccfc2226fc51e0e34dbb2ebe8a2487596675d2522a22f37',
  csv: '3005bcd6ad4ffc87a312c6926e20c5e3658747012855aa9d8ccfa33d898545e6',
  manifest: '0acf361c6d2d8cc6f684026481a5aa279e9f7fa718256fad78da0366d5804413',
} as const;

/** The six upstream files TIBER-Rookies' own manifest hash-locks as inputs to the promoted artifact. */
export const PINNED_SOURCE_MANIFEST_INPUT_HASHES: Record<string, string> = {
  'exports/promoted/rookie-alpha/2026_rookie_alpha_predraft_v0.json':
    '5a7c6c945ad477c1a54e61e7337e9f5bd6b5e69455669ca4700d7668fe9816e3',
  'data/processed/2026_draft_capital_proxy.json': '5622f5ab86d8db812a3c98fd67b74960943d687fa323f7e9592533f8d058738f',
  'data/processed/2026_college_production.json': 'c4c15efd609fef982e417817148b1b7bc090f53896791eb2cb85cf1bf665fb0d',
  'data/processed/2026_prospect_context.json': 'bdf16633076bb5fb28e9451028fc476fadf6ff727dc06bdb106eb026e741de0e',
  'data/processed/2026_draft_results.json': 'ae6b037845f5b6bcd87e17185d1086a3de1cf6a915571f3da1d5d716965f01bd',
  'data/processed/2026_day3_udfa_draft_result_profiles.json':
    '1f9b3a3c592bbc94f42c3d361461372b104f3f320fa9d11ebc5bcdb6511822ec',
};

// ---------------------------------------------------------------------------------------------
// Authorized Forecast mirror artifacts -- exactly these four, nothing else
// ---------------------------------------------------------------------------------------------

export const MIRROR_DIR = 'data/fixtures/tiberRookies' as const;
export const MIRROR_JSON_PATH = `${MIRROR_DIR}/rookie_transition_profile_v0_2026.mirror.json` as const;
export const MIRROR_CSV_PATH = `${MIRROR_DIR}/rookie_transition_profile_v0_2026.mirror.csv` as const;
export const MIRROR_MANIFEST_PATH = `${MIRROR_DIR}/rookie_transition_profile_v0_2026.manifest.mirror.json` as const;
export const MIRROR_PROVENANCE_PATH = `${MIRROR_DIR}/ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json` as const;

export const AUTHORIZED_MIRROR_FILENAMES = [
  'rookie_transition_profile_v0_2026.mirror.json',
  'rookie_transition_profile_v0_2026.mirror.csv',
  'rookie_transition_profile_v0_2026.manifest.mirror.json',
  'ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json',
] as const;

export const WRAPPER_KIND = 'rookie_transition_profile_v0_forecast_mirror_provenance' as const;
export const WRAPPER_SCHEMA_VERSION = '1.0.0' as const;

export const REQUIRED_UDFA_ROW = {
  player_id: 'te-daequan-wright',
  nfl_team: 'PHI',
  is_udfa: true,
  draft_round: null,
  overall_pick: null,
  last_verified_at: null,
} as const;

export const MIRROR_REFRESH_DECISIONS = [
  'may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue',
  'rookie_transition_profile_forecast_mirror_requires_followup',
  'rookie_transition_profile_forecast_mirror_blocked',
] as const;
export type MirrorRefreshDecision = (typeof MIRROR_REFRESH_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

interface RookieTransitionProfileValue<T> {
  value: T | null;
  provenance: { source_type: string; last_verified_at: string | null; [key: string]: unknown };
}

interface RookieTransitionProfileRow {
  player_id: string;
  official_postdraft_outcome: RookieTransitionProfileValue<{
    status: string;
    nfl_team: string | null;
    draft_round: number | null;
    overall_pick: number | null;
    is_udfa: boolean;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface RookieTransitionProfileArtifact {
  schema_version: string;
  season: number;
  generated_at: string;
  run_id: string;
  coverage_summary: Record<string, number>;
  rows: RookieTransitionProfileRow[];
  [key: string]: unknown;
}

interface RookieTransitionProfileManifest {
  input_files: Array<{ path: string; sha256: string }>;
  output_files: Array<{ path: string; sha256: string }>;
  [key: string]: unknown;
}

export interface MirrorIdentityRow {
  player_id: string;
  status: 'unresolved_to_forecast_population';
}

export interface RookieTransitionProfileMirrorProvenance {
  kind: typeof WRAPPER_KIND;
  schema_version: typeof WRAPPER_SCHEMA_VERSION;
  issue: typeof MIRROR_IMPLEMENTATION_ISSUE;
  governing_design: {
    consumption_design_issue: typeof CONSUMPTION_DESIGN_ISSUE;
    consumption_design_pr: typeof CONSUMPTION_DESIGN_PR;
    consumption_design_merge_commit: typeof CONSUMPTION_DESIGN_MERGE_COMMIT;
    design_documents: typeof CONSUMPTION_DESIGN_DOCUMENTS;
  };
  source_lock: {
    repo: typeof SOURCE_REPO;
    commit: typeof SOURCE_COMMIT;
    promoted_path: typeof SOURCE_PROMOTED_PATH;
    schema_version: typeof SOURCE_SCHEMA_VERSION;
    season: typeof SOURCE_SEASON;
    generated_at: typeof SOURCE_GENERATED_AT;
    run_id: typeof SOURCE_RUN_ID;
    row_count: typeof SOURCE_ROW_COUNT;
    coverage_summary: typeof SOURCE_COVERAGE_SUMMARY;
    artifact_hashes: typeof PINNED_ARTIFACT_SHA256;
    source_manifest_input_hashes: typeof PINNED_SOURCE_MANIFEST_INPUT_HASHES;
  };
  forecast_mirror: {
    paths: {
      mirror_json: typeof MIRROR_JSON_PATH;
      mirror_csv: typeof MIRROR_CSV_PATH;
      mirror_manifest: typeof MIRROR_MANIFEST_PATH;
      wrapper: typeof MIRROR_PROVENANCE_PATH;
    };
    mirrored_hashes: { mirror_json: string; mirror_csv: string; mirror_manifest: string };
    mirror_refreshed_at: string;
    mirror_refreshed_at_is_operational_timestamp_only_not_fact_availability: true;
  };
  identity_resolution: {
    crosswalk_status: 'no_verified_crosswalk_exists';
    resolved_count: number;
    unresolved_count: number;
    rows: MirrorIdentityRow[];
    name_based_or_fuzzy_joins_performed: false;
    feature_bearing_join_authorized: false;
  };
  temporal_and_authorization_status: {
    all_field_families: 'audit_only';
    pre_draft_temporal_eligibility: 'unresolved';
    phase_specific_projection_created: false;
    experiment_eligibility_established: false;
    model_use_authorized: false;
    production_use_authorized: false;
  };
  population_and_outcome_parity: {
    unique_player_id_rows: number;
    status_drafted_count: number;
    status_udfa_signed_count: number;
    udfa_row: typeof REQUIRED_UDFA_ROW;
  };
  boundary: {
    no_transformation_of_upstream_bytes: true;
    no_phase_specific_projection: true;
    no_official_postdraft_outcome_removed: true;
    no_canonical_player_id_crosswalk_built: true;
    no_name_based_or_fuzzy_matching_performed: true;
    no_field_declared_temporally_eligible: true;
    no_predictive_experiment_run: true;
    no_model_ready_features_created: true;
    no_model_or_production_import: true;
    no_mae_rmse_calibration_or_fantasy_point_evaluation: true;
    no_downstream_consumption_production_binding_or_ui_activation_authorized: true;
  };
}

// ---------------------------------------------------------------------------------------------
// Refresh: verify (fail-closed) then assemble -- pure, no I/O
// ---------------------------------------------------------------------------------------------

export interface RefreshCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface RefreshInput {
  sourceRepo: string;
  sourceCommit: string;
  jsonBytes: Buffer;
  csvBytes: Buffer;
  manifestBytes: Buffer;
  /** Actual bytes of the six upstream files the manifest hash-locks, keyed by their manifest path. */
  inputFileBytes: Record<string, Buffer>;
  /** Operator-supplied, deterministic, purely operational Forecast-side timestamp. */
  mirrorRefreshedAt: string;
  sha256: (bytes: Buffer) => string;
}

export interface RefreshResult {
  version: typeof ROOKIE_TRANSITION_PROFILE_MIRROR_VERSION;
  issue: typeof MIRROR_IMPLEMENTATION_ISSUE;
  status: 'passed' | 'blocked';
  decision: MirrorRefreshDecision;
  checks: RefreshCheck[];
  blocking_reasons: string[];
  files?: {
    mirrorJson: Buffer;
    mirrorCsv: Buffer;
    mirrorManifest: Buffer;
    wrapper: RookieTransitionProfileMirrorProvenance;
  };
}

const byPathAsc = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export const refreshRookieTransitionProfileMirror = (input: RefreshInput): RefreshResult => {
  const checks: RefreshCheck[] = [];
  const check = (dimension: string, expected: string, observed: string, passed: boolean): void => {
    checks.push({ dimension, expected, observed, passed });
  };

  // ---- Repository + commit identity (never refresh from a different repo or a moved main) --------
  check('source_repo', SOURCE_REPO, input.sourceRepo, input.sourceRepo === SOURCE_REPO);
  check('source_commit', SOURCE_COMMIT, input.sourceCommit, input.sourceCommit === SOURCE_COMMIT);

  // ---- Artifact byte hashes -------------------------------------------------------------------------
  const jsonSha256 = input.sha256(input.jsonBytes);
  const csvSha256 = input.sha256(input.csvBytes);
  const manifestSha256 = input.sha256(input.manifestBytes);
  check('artifact_json_sha256', PINNED_ARTIFACT_SHA256.json, jsonSha256, jsonSha256 === PINNED_ARTIFACT_SHA256.json);
  check('artifact_csv_sha256', PINNED_ARTIFACT_SHA256.csv, csvSha256, csvSha256 === PINNED_ARTIFACT_SHA256.csv);
  check(
    'artifact_manifest_sha256',
    PINNED_ARTIFACT_SHA256.manifest,
    manifestSha256,
    manifestSha256 === PINNED_ARTIFACT_SHA256.manifest,
  );

  // ---- Source-manifest input hashes (independently reproved against actual bytes) -------------------
  const pinnedInputPaths = Object.keys(PINNED_SOURCE_MANIFEST_INPUT_HASHES).sort();
  const providedInputPaths = Object.keys(input.inputFileBytes).sort();
  check(
    'source_manifest_input_paths_complete',
    pinnedInputPaths.join(', '),
    providedInputPaths.join(', '),
    pinnedInputPaths.length === providedInputPaths.length && pinnedInputPaths.every((p, i) => p === providedInputPaths[i]),
  );
  for (const relPath of pinnedInputPaths) {
    const bytes = input.inputFileBytes[relPath];
    const actual = bytes ? input.sha256(bytes) : 'MISSING';
    check(`source_manifest_input_sha256:${relPath}`, PINNED_SOURCE_MANIFEST_INPUT_HASHES[relPath], actual, actual === PINNED_SOURCE_MANIFEST_INPUT_HASHES[relPath]);
  }

  // ---- Manifest self-consistency: its own declared hashes agree with the pins we just proved ------
  let manifest: RookieTransitionProfileManifest | undefined;
  try {
    manifest = JSON.parse(input.manifestBytes.toString('utf-8')) as RookieTransitionProfileManifest;
  } catch {
    manifest = undefined;
  }
  const manifestParsed = manifest !== undefined && Array.isArray(manifest.input_files) && Array.isArray(manifest.output_files);
  check('manifest_parses_as_json', 'valid JSON with input_files[] and output_files[]', manifestParsed ? 'valid' : 'invalid or unparsable', manifestParsed);

  if (manifestParsed && manifest) {
    const declaredInputs = [...manifest.input_files].sort(byPathAsc);
    const expectedInputs = pinnedInputPaths.map((p) => ({ path: p, sha256: PINNED_SOURCE_MANIFEST_INPUT_HASHES[p] })).sort(byPathAsc);
    const inputsMatch =
      declaredInputs.length === expectedInputs.length &&
      declaredInputs.every((d, i) => d.path === expectedInputs[i].path && d.sha256 === expectedInputs[i].sha256);
    check(
      'manifest_declared_input_hashes_match_pins',
      JSON.stringify(expectedInputs),
      JSON.stringify(declaredInputs),
      inputsMatch,
    );

    const declaredOutputJson = manifest.output_files.find((f) => f.path.endsWith(SOURCE_ARTIFACT_FILENAMES.json));
    const declaredOutputCsv = manifest.output_files.find((f) => f.path.endsWith(SOURCE_ARTIFACT_FILENAMES.csv));
    check(
      'manifest_declared_output_json_hash_matches_pin',
      PINNED_ARTIFACT_SHA256.json,
      declaredOutputJson?.sha256 ?? 'MISSING',
      declaredOutputJson?.sha256 === PINNED_ARTIFACT_SHA256.json,
    );
    check(
      'manifest_declared_output_csv_hash_matches_pin',
      PINNED_ARTIFACT_SHA256.csv,
      declaredOutputCsv?.sha256 ?? 'MISSING',
      declaredOutputCsv?.sha256 === PINNED_ARTIFACT_SHA256.csv,
    );
  }

  // ---- Artifact identity/population/coverage ---------------------------------------------------------
  let artifact: RookieTransitionProfileArtifact | undefined;
  try {
    artifact = JSON.parse(input.jsonBytes.toString('utf-8')) as RookieTransitionProfileArtifact;
  } catch {
    artifact = undefined;
  }
  const artifactParsed = artifact !== undefined && Array.isArray(artifact.rows);
  check('artifact_parses_as_json', 'valid JSON with rows[]', artifactParsed ? 'valid' : 'invalid or unparsable', artifactParsed);

  let uniquePlayerIdCount = 0;
  let draftedCount = 0;
  let udfaSignedCount = 0;
  let udfaRowMatches = false;
  if (artifactParsed && artifact) {
    check('schema_version', SOURCE_SCHEMA_VERSION, artifact.schema_version, artifact.schema_version === SOURCE_SCHEMA_VERSION);
    check('season', String(SOURCE_SEASON), String(artifact.season), artifact.season === SOURCE_SEASON);
    check('generated_at', SOURCE_GENERATED_AT, artifact.generated_at, artifact.generated_at === SOURCE_GENERATED_AT);
    check('run_id', SOURCE_RUN_ID, artifact.run_id, artifact.run_id === SOURCE_RUN_ID);
    check(
      'coverage_summary',
      JSON.stringify(SOURCE_COVERAGE_SUMMARY),
      JSON.stringify(artifact.coverage_summary),
      JSON.stringify(artifact.coverage_summary) === JSON.stringify(SOURCE_COVERAGE_SUMMARY),
    );

    const ids = artifact.rows.map((r) => r.player_id);
    uniquePlayerIdCount = new Set(ids).size;
    check(
      'row_count_and_uniqueness',
      `${SOURCE_ROW_COUNT} unique player_id rows`,
      `${artifact.rows.length} rows, ${uniquePlayerIdCount} unique`,
      artifact.rows.length === SOURCE_ROW_COUNT && uniquePlayerIdCount === SOURCE_ROW_COUNT,
    );

    for (const row of artifact.rows) {
      const status = row.official_postdraft_outcome?.value?.status;
      if (status === 'drafted') draftedCount += 1;
      else if (status === 'udfa_signed') udfaSignedCount += 1;
    }
    check('status_drafted_count', '47', String(draftedCount), draftedCount === 47);
    check('status_udfa_signed_count', '1', String(udfaSignedCount), udfaSignedCount === 1);

    const udfaRow = artifact.rows.find((r) => r.official_postdraft_outcome?.value?.status === 'udfa_signed');
    const v = udfaRow?.official_postdraft_outcome?.value;
    const p = udfaRow?.official_postdraft_outcome?.provenance;
    udfaRowMatches =
      udfaRow?.player_id === REQUIRED_UDFA_ROW.player_id &&
      v?.nfl_team === REQUIRED_UDFA_ROW.nfl_team &&
      v?.is_udfa === REQUIRED_UDFA_ROW.is_udfa &&
      v?.draft_round === REQUIRED_UDFA_ROW.draft_round &&
      v?.overall_pick === REQUIRED_UDFA_ROW.overall_pick &&
      p?.last_verified_at === REQUIRED_UDFA_ROW.last_verified_at;
    check(
      'udfa_row_exact_match',
      JSON.stringify(REQUIRED_UDFA_ROW),
      JSON.stringify({
        player_id: udfaRow?.player_id,
        nfl_team: v?.nfl_team,
        is_udfa: v?.is_udfa,
        draft_round: v?.draft_round,
        overall_pick: v?.overall_pick,
        last_verified_at: p?.last_verified_at,
      }),
      udfaRowMatches,
    );
  }

  const failed = checks.filter((c) => !c.passed);
  const passed = failed.length === 0;

  if (!passed) {
    return {
      version: ROOKIE_TRANSITION_PROFILE_MIRROR_VERSION,
      issue: MIRROR_IMPLEMENTATION_ISSUE,
      status: 'blocked',
      decision: 'rookie_transition_profile_forecast_mirror_blocked',
      checks,
      blocking_reasons: failed.map((c) => `${c.dimension}: expected ${c.expected}; observed ${c.observed}`),
    };
  }

  const identityRows: MirrorIdentityRow[] = (artifact as RookieTransitionProfileArtifact).rows.map((r) => ({
    player_id: r.player_id,
    status: 'unresolved_to_forecast_population',
  }));

  const wrapper: RookieTransitionProfileMirrorProvenance = {
    kind: WRAPPER_KIND,
    schema_version: WRAPPER_SCHEMA_VERSION,
    issue: MIRROR_IMPLEMENTATION_ISSUE,
    governing_design: {
      consumption_design_issue: CONSUMPTION_DESIGN_ISSUE,
      consumption_design_pr: CONSUMPTION_DESIGN_PR,
      consumption_design_merge_commit: CONSUMPTION_DESIGN_MERGE_COMMIT,
      design_documents: CONSUMPTION_DESIGN_DOCUMENTS,
    },
    source_lock: {
      repo: SOURCE_REPO,
      commit: SOURCE_COMMIT,
      promoted_path: SOURCE_PROMOTED_PATH,
      schema_version: SOURCE_SCHEMA_VERSION,
      season: SOURCE_SEASON,
      generated_at: SOURCE_GENERATED_AT,
      run_id: SOURCE_RUN_ID,
      row_count: SOURCE_ROW_COUNT,
      coverage_summary: SOURCE_COVERAGE_SUMMARY,
      artifact_hashes: PINNED_ARTIFACT_SHA256,
      source_manifest_input_hashes: PINNED_SOURCE_MANIFEST_INPUT_HASHES,
    },
    forecast_mirror: {
      paths: {
        mirror_json: MIRROR_JSON_PATH,
        mirror_csv: MIRROR_CSV_PATH,
        mirror_manifest: MIRROR_MANIFEST_PATH,
        wrapper: MIRROR_PROVENANCE_PATH,
      },
      mirrored_hashes: { mirror_json: jsonSha256, mirror_csv: csvSha256, mirror_manifest: manifestSha256 },
      mirror_refreshed_at: input.mirrorRefreshedAt,
      mirror_refreshed_at_is_operational_timestamp_only_not_fact_availability: true,
    },
    identity_resolution: {
      crosswalk_status: 'no_verified_crosswalk_exists',
      resolved_count: 0,
      unresolved_count: identityRows.length,
      rows: identityRows,
      name_based_or_fuzzy_joins_performed: false,
      feature_bearing_join_authorized: false,
    },
    temporal_and_authorization_status: {
      all_field_families: 'audit_only',
      pre_draft_temporal_eligibility: 'unresolved',
      phase_specific_projection_created: false,
      experiment_eligibility_established: false,
      model_use_authorized: false,
      production_use_authorized: false,
    },
    population_and_outcome_parity: {
      unique_player_id_rows: uniquePlayerIdCount,
      status_drafted_count: draftedCount,
      status_udfa_signed_count: udfaSignedCount,
      udfa_row: REQUIRED_UDFA_ROW,
    },
    boundary: {
      no_transformation_of_upstream_bytes: true,
      no_phase_specific_projection: true,
      no_official_postdraft_outcome_removed: true,
      no_canonical_player_id_crosswalk_built: true,
      no_name_based_or_fuzzy_matching_performed: true,
      no_field_declared_temporally_eligible: true,
      no_predictive_experiment_run: true,
      no_model_ready_features_created: true,
      no_model_or_production_import: true,
      no_mae_rmse_calibration_or_fantasy_point_evaluation: true,
      no_downstream_consumption_production_binding_or_ui_activation_authorized: true,
    },
  };

  return {
    version: ROOKIE_TRANSITION_PROFILE_MIRROR_VERSION,
    issue: MIRROR_IMPLEMENTATION_ISSUE,
    status: 'passed',
    decision: 'may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue',
    checks,
    blocking_reasons: [],
    files: {
      mirrorJson: input.jsonBytes,
      mirrorCsv: input.csvBytes,
      mirrorManifest: input.manifestBytes,
      wrapper,
    },
  };
};
