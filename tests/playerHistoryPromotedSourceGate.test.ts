/**
 * Guardrail tests for the Forecast-side promoted-source gate (Forecast #117).
 *
 * The gate decides only whether a LATER mirror-refresh issue may be opened against the TIBER-Data
 * promoted player_season_coverage_v0 artifact. These tests pin the failure modes required by #117:
 * sha/status/decision mismatches, prefix allow-list provenance (mixed, embedded-token, fixture),
 * duplicate grain, boundary blocks, leakage-discipline recording, decision-enum purity, and import
 * isolation from production Forecast.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_LINEAGE_DIMENSIONS,
  EXPECTED_APPROVED_SOURCE_PREFIXES,
  PINNED_PROMOTED_ARTIFACT_SHA256,
  PROMOTED_SOURCE_GATE_DECISIONS,
  PROMOTED_SOURCE_GATE_EXPECTATIONS,
  PROMOTED_SOURCE_LEAKAGE_DISCIPLINE,
  REQUIRED_COMPATIBILITY_NOTE_PHRASES,
  REQUIRED_NOT_ALLOWED_ENTRIES,
  checkConsumerSafetyBoundary,
  checkManifestIdentity,
  checkPromotedArtifactIdentity,
  checkPromotedProvenance,
  evaluatePlayerHistoryPromotedSourceGate,
  type PromotedArtifact,
  type PromotedCoverageRecord,
  type PromotedManifest,
  type PromotedSourceGateExpectations,
} from '../src/rehearsal/playerHistoryPromotedSourceGate.js';
import { PINNED_SOURCE_ARTIFACT_SHA256 } from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(REPO_ROOT, 'data/fixtures/tiberData/PLAYER_SEASON_COVERAGE_V0_PROMOTED_SOURCE_GATE_EVIDENCE.json');

// ---------------------------------------------------------------------------------------------
// Synthetic fixtures: a tiny, fully conforming manifest/artifact pair with matching expectations,
// so each test mutates exactly one property and observes exactly one failure.
// ---------------------------------------------------------------------------------------------

const SYNTH_PROMOTED_SHA = 'b'.repeat(64);
const SYNTH_CANDIDATE_SHA = 'a'.repeat(64);

const syntheticRecord = (overrides: Partial<PromotedCoverageRecord> = {}): PromotedCoverageRecord => ({
  player_id: '00-0000001',
  season: 2024,
  season_type: 'REG',
  position: 'RB',
  source_refs: [
    { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T00:00:00Z', confidence: 'source_verified' },
  ],
  usage_summary: { targets: 5, snap_share: null },
  ...overrides,
});

const syntheticRecords = (): PromotedCoverageRecord[] => [
  syntheticRecord(),
  syntheticRecord({ player_id: '00-0000002', season: 2025, position: 'WR' }),
];

const syntheticManifest = (overrides: Partial<PromotedManifest> = {}): PromotedManifest => ({
  artifact_id: 'player_season_coverage_v0',
  status: 'promoted_governed_artifact',
  promotion_review: 'TIBER-Data#192',
  promotion_decision: 'promote_player_season_coverage_v0',
  source_candidate: { path: 'data/processed/evidence/candidate.json', sha256: SYNTH_CANDIDATE_SHA, status_at_promotion: 'candidate_evidence_artifact_not_promoted' },
  approved_source_allowlist: [...EXPECTED_APPROVED_SOURCE_PREFIXES],
  seasons: [2024, 2025],
  season_type_scope: ['REG'],
  included_positions: ['QB', 'RB', 'TE', 'WR'],
  row_grain: 'player_id + season + season_type',
  counts: { records: 2, by_season: { '2024': 1, '2025': 1 }, by_position: { RB: 1, WR: 1 } },
  consumer_safety: { allowed: ['source-backed player-season evidence'], not_allowed: [...REQUIRED_NOT_ALLOWED_ENTRIES] },
  forecast_compatibility_note:
    'Consumption only through a separate Forecast-side gate that re-verifies sha/provenance, enforces target-season ' +
    'leakage splits structurally, and considers a production-only feature contract given the Forecast #116 attribution ' +
    'finding. No product-facing claim is authorized until a Forecast production-binding review passes.',
  promoted_artifact_path: 'exports/promoted/nfl/player_season_coverage_v0.json',
  promoted_artifact_sha256: SYNTH_PROMOTED_SHA,
  ...overrides,
});

const syntheticArtifact = (overrides: Partial<PromotedArtifact> = {}): PromotedArtifact => {
  const manifest = syntheticManifest();
  return {
    artifact_id: manifest.artifact_id,
    status: manifest.status,
    promotion_review: manifest.promotion_review,
    promotion_decision: manifest.promotion_decision,
    source_candidate: { ...manifest.source_candidate },
    approved_source_allowlist: [...manifest.approved_source_allowlist],
    seasons: [...manifest.seasons],
    season_type_scope: [...manifest.season_type_scope],
    included_positions: [...manifest.included_positions],
    row_grain: manifest.row_grain,
    counts: { records: 2, by_season: { '2024': 1, '2025': 1 }, by_position: { RB: 1, WR: 1 } },
    consumer_safety: manifest.consumer_safety,
    forecast_compatibility_note: manifest.forecast_compatibility_note,
    records: syntheticRecords(),
    ...overrides,
  };
};

const syntheticExpectations: PromotedSourceGateExpectations = {
  ...PROMOTED_SOURCE_GATE_EXPECTATIONS,
  promotedArtifactSha256: SYNTH_PROMOTED_SHA,
  candidatePath: 'data/processed/evidence/candidate.json',
  candidateSha256: SYNTH_CANDIDATE_SHA,
  recordCount: 2,
  bySeason: { '2024': 1, '2025': 1 },
  byPosition: { RB: 1, WR: 1 },
  seasons: [2024, 2025],
};

const evaluateSynthetic = (
  manifest = syntheticManifest(),
  artifact = syntheticArtifact(),
  actualSha = SYNTH_PROMOTED_SHA,
) => evaluatePlayerHistoryPromotedSourceGate({ manifest, artifact, actualPromotedArtifactSha256: actualSha }, syntheticExpectations);

const failedDimensions = (result: ReturnType<typeof evaluateSynthetic>): string[] =>
  result.checks.filter((c) => !c.passed).map((c) => c.dimension);

describe('promoted-source gate: pass path and decision semantics', () => {
  it('a fully conforming manifest/artifact pair passes with the refresh-issue ceiling decision', () => {
    const result = evaluateSynthetic();
    expect(failedDimensions(result)).toEqual([]);
    expect(result.status).toBe('passed');
    expect(result.decision).toBe('may_open_promoted_mirror_refresh_issue');
    expect(result.candidate_lineage_intact).toBe(true);
  });

  it('promoted artifact sha mismatch (actual bytes differ) fails and falls back to archived-candidate-only', () => {
    const result = evaluateSynthetic(syntheticManifest(), syntheticArtifact(), 'c'.repeat(64));
    expect(failedDimensions(result)).toEqual(['promoted_sha256_matches_actual_bytes', 'promoted_sha256_matches_forecast_pin']);
    expect(result.status).toBe('failed');
    // Candidate lineage is intact, so the fallback is archived-experiment continuity, NOT promoted consumption.
    expect(result.decision).toBe('may_continue_using_candidate_mirrors_for_archived_experiment_only');
  });

  it('wrong promoted status fails on both manifest and artifact dimensions', () => {
    const result = evaluateSynthetic(
      syntheticManifest({ status: 'candidate_evidence_artifact_not_promoted' }),
      syntheticArtifact({ status: 'candidate_evidence_artifact_not_promoted' }),
    );
    expect(failedDimensions(result)).toEqual(['manifest_promoted_status', 'artifact_promoted_status']);
    expect(result.decision).toBe('may_continue_using_candidate_mirrors_for_archived_experiment_only');
  });

  it('missing/incorrect promotion decision fails', () => {
    const result = evaluateSynthetic(syntheticManifest({ promotion_decision: 'do_not_promote_requires_fixes' }));
    expect(failedDimensions(result)).toContain('manifest_promotion_decision');
    expect(result.status).toBe('failed');
  });

  it('broken candidate lineage escalates to blocked_promoted_artifact_gate_failed', () => {
    const manifest = syntheticManifest({
      source_candidate: { path: 'data/processed/evidence/candidate.json', sha256: 'd'.repeat(64), status_at_promotion: 'candidate_evidence_artifact_not_promoted' },
    });
    const result = evaluateSynthetic(manifest);
    expect(failedDimensions(result)).toContain('candidate_lineage_sha256');
    expect(result.candidate_lineage_intact).toBe(false);
    expect(result.decision).toBe('blocked_promoted_artifact_gate_failed');
  });

  it('malformed gate input is invalid and must not be used', () => {
    const result = evaluatePlayerHistoryPromotedSourceGate({ manifest: syntheticManifest() }, syntheticExpectations);
    expect(result.status).toBe('invalid');
    expect(result.decision).toBe('promoted_source_gate_invalid_must_not_use');
    expect(result.blocking_reasons.some((r) => r.includes('artifact missing'))).toBe(true);
  });

  it('an artifact with records missing is invalid, not silently evaluated', () => {
    const artifact = syntheticArtifact();
    (artifact as Partial<PromotedArtifact>).records = undefined;
    const result = evaluatePlayerHistoryPromotedSourceGate(
      { manifest: syntheticManifest(), artifact, actualPromotedArtifactSha256: SYNTH_PROMOTED_SHA },
      syntheticExpectations,
    );
    expect(result.decision).toBe('promoted_source_gate_invalid_must_not_use');
  });
});

describe('promoted-source gate: boundary blocks', () => {
  it('missing consumer-safety block fails', () => {
    const result = evaluateSynthetic(syntheticManifest({ consumer_safety: null }));
    expect(failedDimensions(result)).toContain('consumer_safety_not_allowed_boundary');
  });

  it('a consumer-safety block missing a required not-allowed boundary fails', () => {
    const notAllowed = REQUIRED_NOT_ALLOWED_ENTRIES.filter((e) => !e.includes('Forecast production binding'));
    const checks = checkConsumerSafetyBoundary(syntheticManifest({ consumer_safety: { allowed: [], not_allowed: [...notAllowed] } }));
    const boundary = checks.find((c) => c.dimension === 'consumer_safety_not_allowed_boundary');
    expect(boundary?.passed).toBe(false);
    expect(boundary?.observed).toContain('Forecast production binding');
  });

  it('missing Forecast compatibility note fails', () => {
    const result = evaluateSynthetic(syntheticManifest({ forecast_compatibility_note: null }));
    expect(failedDimensions(result)).toContain('forecast_compatibility_note_boundary');
  });

  it('a compatibility note missing a required element fails and names it', () => {
    const checks = checkConsumerSafetyBoundary(
      syntheticManifest({ forecast_compatibility_note: 'separate Forecast-side gate re-verifies sha/provenance and leakage splits.' }),
    );
    const note = checks.find((c) => c.dimension === 'forecast_compatibility_note_boundary');
    expect(note?.passed).toBe(false);
    expect(note?.observed).toContain('production-only feature contract');
  });
});

describe('promoted-source gate: prefix allow-list provenance (never substring)', () => {
  const provenanceCheck = (records: PromotedCoverageRecord[], dimension: string) =>
    checkPromotedProvenance(records, EXPECTED_APPROVED_SOURCE_PREFIXES).find((c) => c.dimension === dimension);

  it('missing source refs fails', () => {
    const result = evaluateSynthetic(syntheticManifest(), syntheticArtifact({ records: [syntheticRecord({ source_refs: [] }), syntheticRecords()[1]] }));
    expect(failedDimensions(result)).toContain('source_refs_present');
  });

  it('an unapproved-only source ref fails', () => {
    const records = [syntheticRecord({ source_refs: [{ source_name: 'manual_spreadsheet:file.xlsx', observed_at: '2026-06-30T00:00:00Z' }] })];
    expect(provenanceCheck(records, 'source_refs_prefix_approved')?.passed).toBe(false);
  });

  it('mixed approved + unapproved source refs fail (all-source standard, not at-least-one)', () => {
    const records = [
      syntheticRecord({
        source_refs: [
          { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T00:00:00Z' },
          { source_name: 'manual_override_or_unknown_source', observed_at: '2026-06-30T00:00:00Z' },
        ],
      }),
    ];
    expect(provenanceCheck(records, 'source_refs_prefix_approved')?.passed).toBe(false);
  });

  it('embedded-token provenance fails: an approved call-shape must START the name, not merely appear in it', () => {
    const records = [
      syntheticRecord({ source_refs: [{ source_name: 'manual_override:nflreadpy.load_players()', observed_at: '2026-06-30T00:00:00Z' }] }),
    ];
    const check = provenanceCheck(records, 'source_refs_prefix_approved');
    expect(check?.passed).toBe(false);
    expect(check?.observed).toContain('manual_override:nflreadpy.load_players()');
  });

  it('fixture/offline_fixture/scaffold markers fail', () => {
    for (const marker of ['offline_fixture:data/raw/foo.json', 'fixture_demonstration_only', 'scaffold source']) {
      const records = [syntheticRecord({ source_refs: [{ source_name: marker, observed_at: '2026-06-30T00:00:00Z' }] })];
      expect(provenanceCheck(records, 'no_fixture_scaffold_markers')?.passed).toBe(false);
    }
  });

  it('a ref missing observed_at fails', () => {
    const records = [syntheticRecord({ source_refs: [{ source_name: "nflreadpy.load_players()", observed_at: null }] })];
    expect(provenanceCheck(records, 'observed_at_present')?.passed).toBe(false);
  });
});

describe('promoted-source gate: artifact identity, grain, ordering, null semantics', () => {
  it('duplicate grain fails', () => {
    const result = evaluateSynthetic(syntheticManifest(), syntheticArtifact({ records: [syntheticRecord(), syntheticRecord()], counts: { records: 2, by_season: { '2024': 2 }, by_position: { RB: 2 } } }));
    expect(failedDimensions(result)).toContain('duplicate_grain');
  });

  it('out-of-order records fail the deterministic-ordering check', () => {
    const [a, b] = syntheticRecords();
    const checks = checkPromotedArtifactIdentity(syntheticArtifact({ records: [b, a] }), syntheticManifest(), syntheticExpectations);
    expect(checks.find((c) => c.dimension === 'deterministic_ordering')?.passed).toBe(false);
  });

  it('a record count that disagrees with the pinned count or envelope counts fails', () => {
    const checks = checkPromotedArtifactIdentity(syntheticArtifact({ records: [syntheticRecord()] }), syntheticManifest(), syntheticExpectations);
    expect(checks.find((c) => c.dimension === 'record_count')?.passed).toBe(false);
  });

  it('artifact/manifest source_candidate disagreement fails', () => {
    const artifact = syntheticArtifact({
      source_candidate: { path: 'data/processed/evidence/candidate.json', sha256: 'e'.repeat(64), status_at_promotion: 'candidate_evidence_artifact_not_promoted' },
    });
    const checks = checkPromotedArtifactIdentity(artifact, syntheticManifest(), syntheticExpectations);
    expect(checks.find((c) => c.dimension === 'artifact_source_candidate_matches_manifest')?.passed).toBe(false);
  });

  it('a forbidden availability field on any record fails', () => {
    const result = evaluateSynthetic(
      syntheticManifest(),
      syntheticArtifact({ records: [syntheticRecord({ active_roster_status: 'active' }), syntheticRecords()[1]] }),
    );
    expect(failedDimensions(result)).toContain('no_forbidden_availability_fields');
  });

  it('a zero-coerced unavailable usage field fails', () => {
    const result = evaluateSynthetic(
      syntheticManifest(),
      syntheticArtifact({ records: [syntheticRecord({ usage_summary: { targets: 5, snap_share: 0 } }), syntheticRecords()[1]] }),
    );
    expect(failedDimensions(result)).toContain('unavailable_usage_fields_null_not_zero');
  });
});

describe('promoted-source gate: leakage discipline and decision-enum purity', () => {
  it('the 2025 input-leakage policy is recorded on every result, including failures', () => {
    for (const result of [evaluateSynthetic(), evaluateSynthetic(syntheticManifest({ status: 'x' }))]) {
      expect(result.leakage_discipline_for_future_refresh).toEqual(PROMOTED_SOURCE_LEAKAGE_DISCIPLINE);
      expect(result.leakage_discipline_for_future_refresh.input_seasons_for_2025_prediction_remain_2022_2024_only).toBe(true);
      expect(result.leakage_discipline_for_future_refresh.target_season_2025_remains_outcome_only_for_prior_experiment_shape).toBe(true);
      expect(result.leakage_discipline_for_future_refresh.no_2025_production_summaries_may_become_2025_input_features).toBe(true);
    }
  });

  it('the decision enum contains exactly the four #117 values and no production/binding/run/advice value', () => {
    expect([...PROMOTED_SOURCE_GATE_DECISIONS]).toEqual([
      'may_open_promoted_mirror_refresh_issue',
      'may_continue_using_candidate_mirrors_for_archived_experiment_only',
      'blocked_promoted_artifact_gate_failed',
      'promoted_source_gate_invalid_must_not_use',
    ]);
    for (const decision of PROMOTED_SOURCE_GATE_DECISIONS) {
      for (const forbidden of ['may_run', 'bind', 'production', 'metric', 'advice', 'ranking', 'signal', 'promote_']) {
        expect(decision).not.toContain(forbidden);
      }
    }
  });

  it('gate module and script import nothing from production Forecast (no seasonalPprModel, server, routes, scoring)', () => {
    for (const rel of ['src/rehearsal/playerHistoryPromotedSourceGate.ts', 'scripts/runPlayerHistoryPromotedSourceGate.ts']) {
      const source = readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      const importLines = source.split('\n').filter((line) => /^\s*(import|export)\b.*\bfrom\s+['"]/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/seasonalPprModel|\/server|\/routes|\/scoring|\/board|\/fusion|\/services/);
      }
    }
  });
});

describe('promoted-source gate: committed real evidence', () => {
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf-8')) as {
    governed_source: { promotedArtifactSha256Pinned: string; promotedArtifactSha256Actual: string };
    manifest_verbatim: PromotedManifest;
    gate_result: { status: string; decision: string; checks: Array<{ dimension: string; passed: boolean }> };
    boundary_statements: Record<string, boolean>;
  };

  it('the real gate run passed with the ceiling decision and the pinned promoted sha', () => {
    expect(evidence.gate_result.status).toBe('passed');
    expect(evidence.gate_result.decision).toBe('may_open_promoted_mirror_refresh_issue');
    expect(evidence.gate_result.checks.every((c) => c.passed)).toBe(true);
    expect(evidence.governed_source.promotedArtifactSha256Pinned).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(evidence.governed_source.promotedArtifactSha256Actual).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
  });

  it('the verbatim manifest re-verifies against the pins (independent of the recorded gate result)', () => {
    const checks = [
      ...checkManifestIdentity(evidence.manifest_verbatim, evidence.governed_source.promotedArtifactSha256Actual),
      ...checkConsumerSafetyBoundary(evidence.manifest_verbatim),
    ];
    expect(checks.filter((c) => !c.passed)).toEqual([]);
    expect(evidence.manifest_verbatim.source_candidate.sha256).toBe(PINNED_SOURCE_ARTIFACT_SHA256);
    expect(evidence.manifest_verbatim.approved_source_allowlist).toEqual([...EXPECTED_APPROVED_SOURCE_PREFIXES]);
  });

  it('the evidence restates the non-consumption boundary: nothing vendored, refreshed, run, or bound', () => {
    expect(evidence.boundary_statements).toMatchObject({
      no_records_vendored_into_forecast: true,
      no_mirror_refresh_performed: true,
      no_forecast_run_authorized: true,
      no_metrics_computed: true,
      no_production_binding_authorized: true,
      no_product_or_advice_output: true,
      promoted_artifact_not_consumed_yet: true,
    });
  });

  it('the compatibility-note requirements themselves stay pinned to the #117 wording', () => {
    expect(REQUIRED_COMPATIBILITY_NOTE_PHRASES).toContain('production-only feature contract');
    expect(REQUIRED_NOT_ALLOWED_ENTRIES).toContain('Forecast production binding without a separate Forecast issue and gate');
  });
});
