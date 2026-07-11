/**
 * Guardrail tests for the inert rookie_transition_profile_v0.2.0 Forecast mirror (#151).
 *
 * These tests exercise the PURE refresh function with synthetic inputs to prove every fail-closed
 * check independently (repo/commit identity, each of the three artifact hashes, the six
 * source-manifest input hashes, manifest self-consistency, schema/season/run_id/coverage_summary,
 * row count/uniqueness, drafted/UDFA outcome parity, and the exact Dae'Quan Wright UDFA shape), plus
 * the decision enum and wrapper authorization/labeling invariants.
 *
 * Note on scope: this module intentionally does NOT vendor a second, private copy of TIBER-Rookies'
 * six upstream source-manifest input files anywhere in this repo purely to exercise a full "all
 * checks pass" happy path in CI -- Forecast does not vendor those files at all (only the three
 * promoted rookie_transition_profile artifacts are mirrored, per #149's approved design), and
 * fabricating substitute bytes that happen to hash to the real pinned values is not possible. The
 * full "all 26 checks pass" positive path was proven for real during implementation by running
 * `npm run refresh:rookie-transition-profile-mirror` against an actual local TIBER-Rookies checkout
 * pinned at the locked commit (see the implementation report). This test file instead proves: (a)
 * every individual check correctly fails closed on synthetic bad data, and (b) the already-committed
 * mirror artifacts satisfy every real, CI-provable invariant (see
 * `rookieTransitionProfileMirrorCommittedArtifacts.test.ts`).
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  MIRROR_REFRESH_DECISIONS,
  PINNED_ARTIFACT_SHA256,
  PINNED_SOURCE_MANIFEST_INPUT_HASHES,
  REQUIRED_UDFA_ROW,
  SOURCE_COMMIT,
  SOURCE_COVERAGE_SUMMARY,
  SOURCE_GENERATED_AT,
  SOURCE_REPO,
  SOURCE_ROW_COUNT,
  SOURCE_RUN_ID,
  SOURCE_SCHEMA_VERSION,
  refreshRookieTransitionProfileMirror,
  type RefreshInput,
} from '../src/rehearsal/rookieTransitionProfileMirror.js';

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

// ---------------------------------------------------------------------------------------------
// Synthetic artifact builder: shaped like the real payload, but its bytes will NOT match the real
// pinned hashes (that's expected and fine -- these tests exercise the hash-mismatch failure path,
// not a fabricated "happy path").
// ---------------------------------------------------------------------------------------------

interface SynthRowOverrides {
  player_id?: string;
  status?: 'drafted' | 'udfa_signed';
  nfl_team?: string | null;
  draft_round?: number | null;
  overall_pick?: number | null;
  is_udfa?: boolean;
  last_verified_at?: string | null;
}

const synthRow = (overrides: SynthRowOverrides = {}) => {
  const status = overrides.status ?? 'drafted';
  return {
    player_id: overrides.player_id ?? `wr-synth-${Math.random().toString(36).slice(2)}`,
    official_postdraft_outcome: {
      value: {
        status,
        nfl_team: overrides.nfl_team ?? 'ARI',
        draft_round: overrides.draft_round ?? (status === 'drafted' ? 1 : null),
        overall_pick: overrides.overall_pick ?? (status === 'drafted' ? 1 : null),
        is_udfa: overrides.is_udfa ?? status === 'udfa_signed',
      },
      provenance: { source_type: 'official_draft_result', last_verified_at: overrides.last_verified_at ?? '2026-05-17' },
    },
  };
};

const synthUdfaRow = () =>
  synthRow({
    player_id: REQUIRED_UDFA_ROW.player_id,
    status: 'udfa_signed',
    nfl_team: REQUIRED_UDFA_ROW.nfl_team,
    draft_round: REQUIRED_UDFA_ROW.draft_round,
    overall_pick: REQUIRED_UDFA_ROW.overall_pick,
    is_udfa: REQUIRED_UDFA_ROW.is_udfa,
    last_verified_at: REQUIRED_UDFA_ROW.last_verified_at,
  });

const buildSynthArtifact = (rowCount: number = SOURCE_ROW_COUNT) => {
  const rows = [];
  for (let i = 0; i < rowCount - 1; i += 1) rows.push(synthRow({ player_id: `wr-synth-${i}` }));
  rows.push(synthUdfaRow());
  return {
    schema_version: SOURCE_SCHEMA_VERSION,
    season: 2026,
    generated_at: SOURCE_GENERATED_AT,
    run_id: SOURCE_RUN_ID,
    coverage_summary: SOURCE_COVERAGE_SUMMARY,
    rows,
  };
};

const buildSynthManifest = () => ({
  input_files: Object.entries(PINNED_SOURCE_MANIFEST_INPUT_HASHES).map(([path, sha256Value]) => ({ path, sha256: sha256Value })),
  output_files: [
    { path: 'exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.json', sha256: PINNED_ARTIFACT_SHA256.json },
    { path: 'exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.csv', sha256: PINNED_ARTIFACT_SHA256.csv },
  ],
});

const buildValidInputFileBytes = (): Record<string, Buffer> => {
  const bytes: Record<string, Buffer> = {};
  for (const relPath of Object.keys(PINNED_SOURCE_MANIFEST_INPUT_HASHES)) {
    // Deliberately synthetic -- its hash will NOT match the pin. Used only for tests that check a
    // DIFFERENT dimension and don't care about this one, or that expect it to fail.
    bytes[relPath] = Buffer.from(`synthetic-content-for-${relPath}`);
  }
  return bytes;
};

const baseInput = (): RefreshInput => ({
  sourceRepo: SOURCE_REPO,
  sourceCommit: SOURCE_COMMIT,
  jsonBytes: Buffer.from(JSON.stringify(buildSynthArtifact())),
  csvBytes: Buffer.from('player_id\n'),
  manifestBytes: Buffer.from(JSON.stringify(buildSynthManifest())),
  inputFileBytes: buildValidInputFileBytes(),
  mirrorRefreshedAt: '2026-07-11T00:00:00.000Z',
  sha256,
});

describe('rookie_transition_profile_v0.2.0 Forecast mirror refresh (#151)', () => {
  it('decision enum contains exactly the three required values, none implying experimentation/production', () => {
    expect(MIRROR_REFRESH_DECISIONS).toEqual([
      'may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue',
      'rookie_transition_profile_forecast_mirror_requires_followup',
      'rookie_transition_profile_forecast_mirror_blocked',
    ]);
  });

  it('fails closed on wrong source repo', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), sourceRepo: 'Prometheus-Frameworks/TIBER-Data' });
    expect(result.status).toBe('blocked');
    expect(result.decision).toBe('rookie_transition_profile_forecast_mirror_blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('source_repo'))).toBe(true);
  });

  it('fails closed on wrong source commit (a moved/mutable main, not the locked commit)', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), sourceCommit: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('source_commit'))).toBe(true);
  });

  it('fails closed on a changed JSON hash', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(buildSynthArtifact())) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('artifact_json_sha256'))).toBe(true);
  });

  it('fails closed on a changed CSV hash', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), csvBytes: Buffer.from('different,csv\n') });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('artifact_csv_sha256'))).toBe(true);
  });

  it('fails closed on a changed manifest hash', () => {
    const result = refreshRookieTransitionProfileMirror({
      ...baseInput(),
      manifestBytes: Buffer.from(JSON.stringify({ ...buildSynthManifest(), extra: true })),
    });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('artifact_manifest_sha256'))).toBe(true);
  });

  it('fails closed when a source-manifest input file is missing', () => {
    const inputFileBytes = buildValidInputFileBytes();
    delete inputFileBytes['data/processed/2026_draft_results.json'];
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), inputFileBytes });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('source_manifest_input_paths_complete'))).toBe(true);
  });

  it('fails closed when every source-manifest input hash mismatches (synthetic bytes never match the real pins)', () => {
    const result = refreshRookieTransitionProfileMirror(baseInput());
    expect(result.status).toBe('blocked');
    for (const relPath of Object.keys(PINNED_SOURCE_MANIFEST_INPUT_HASHES)) {
      expect(result.blocking_reasons.some((r) => r.startsWith(`source_manifest_input_sha256:${relPath}`))).toBe(true);
    }
  });

  it('fails closed on wrong schema_version', () => {
    const artifact = { ...buildSynthArtifact(), schema_version: 'rookie-transition-profile-v0.1.0' };
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('schema_version'))).toBe(true);
  });

  it('fails closed on wrong season', () => {
    const artifact = { ...buildSynthArtifact(), season: 2027 };
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('season'))).toBe(true);
  });

  it('fails closed on wrong generated_at / run_id', () => {
    const artifact = { ...buildSynthArtifact(), generated_at: '2099-01-01T00:00:00+00:00' };
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('generated_at'))).toBe(true);
  });

  it('fails closed on a changed coverage_summary', () => {
    const artifact = { ...buildSynthArtifact(), coverage_summary: { ...SOURCE_COVERAGE_SUMMARY, players_total: 49 } };
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('coverage_summary'))).toBe(true);
  });

  it('fails closed on a duplicate player_id (wrong unique-row count)', () => {
    const artifact = buildSynthArtifact();
    artifact.rows[1] = { ...artifact.rows[0] };
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('row_count_and_uniqueness'))).toBe(true);
  });

  it('fails closed on a changed row count', () => {
    const artifact = buildSynthArtifact(47);
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('row_count_and_uniqueness'))).toBe(true);
  });

  it('fails closed on wrong drafted/udfa_signed split', () => {
    const artifact = buildSynthArtifact();
    artifact.rows[0] = synthRow({ player_id: artifact.rows[0].player_id, status: 'udfa_signed' });
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('status_udfa_signed_count'))).toBe(true);
  });

  it('fails closed when the UDFA row is not exactly te-daequan-wright with the required shape', () => {
    const artifact = buildSynthArtifact();
    const udfaIndex = artifact.rows.findIndex((r) => r.official_postdraft_outcome.value.status === 'udfa_signed');
    artifact.rows[udfaIndex] = synthRow({ player_id: 'wr-someone-else', status: 'udfa_signed', nfl_team: 'DAL' });
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('udfa_row_exact_match'))).toBe(true);
  });

  it('fails closed when te-daequan-wright is present but last_verified_at was backfilled instead of staying null', () => {
    const artifact = buildSynthArtifact();
    const udfaIndex = artifact.rows.findIndex((r) => r.official_postdraft_outcome.value.status === 'udfa_signed');
    artifact.rows[udfaIndex].official_postdraft_outcome.provenance.last_verified_at = '2026-07-11T00:00:00.000Z';
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from(JSON.stringify(artifact)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('udfa_row_exact_match'))).toBe(true);
  });

  it('fails closed on unparsable JSON / manifest', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), jsonBytes: Buffer.from('not json') });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('artifact_parses_as_json'))).toBe(true);
  });

  it('fails closed when the manifest input_files disagree with the pinned hashes (self-consistency)', () => {
    const manifest = buildSynthManifest();
    manifest.input_files[0] = { ...manifest.input_files[0], sha256: '0'.repeat(64) };
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), manifestBytes: Buffer.from(JSON.stringify(manifest)) });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('manifest_declared_input_hashes_match_pins'))).toBe(true);
  });

  it('never produces a status: passed result when even a single check fails (no partial pass)', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), sourceCommit: 'wrong' });
    expect(result.files).toBeUndefined();
    expect(result.status).toBe('blocked');
  });

  it('fails closed on an empty mirror_refreshed_at (PR #152 review hardening)', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), mirrorRefreshedAt: '' });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('mirror_refreshed_at_format'))).toBe(true);
  });

  it('fails closed on a malformed (non-RFC3339/ISO-8601) mirror_refreshed_at', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), mirrorRefreshedAt: 'July 11 2026' });
    expect(result.status).toBe('blocked');
    expect(result.blocking_reasons.some((r) => r.startsWith('mirror_refreshed_at_format'))).toBe(true);
  });

  it('accepts a well-formed RFC3339/ISO-8601 mirror_refreshed_at', () => {
    const result = refreshRookieTransitionProfileMirror({ ...baseInput(), mirrorRefreshedAt: '2026-07-11T00:00:00+00:00' });
    expect(result.checks.find((c) => c.dimension === 'mirror_refreshed_at_format')?.passed).toBe(true);
  });
});
