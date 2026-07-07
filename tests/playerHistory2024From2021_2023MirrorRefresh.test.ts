/**
 * Guardrail tests for the player-history 2024-from-2021-2023 mirror refresh (Forecast #135).
 *
 * The refresh sources the player-history experiment mirrors for a NEW window (target season 2024,
 * input seasons 2021-2023) from the promoted TIBER-Data 2021-2025 artifact (TIBER-Data #202 review,
 * PR #207 merge, sha d45f612b...) -- a DIFFERENT promotion event from the one #117/#119/#120 are
 * pinned to (TIBER-Data #192/#193, 2022-2025, sha 29f8e378...). These tests pin the failure modes
 * required by #135: source identity is verified separately and re-verified from the actual artifact
 * bytes/records (never trusted from the manifest envelope alone), the outcome mirror stays
 * outcome-layer-only 2024, the input mirror structurally excludes 2024 and target-outcome values,
 * prefix provenance is enforced, forbidden availability fields fail, unavailable usage fields can
 * never be zero-coerced or populated, the #107 population/overlap floors gate the decision, the
 * decision enum stays exactly the three #135 values and free of run/metric/production/advice/
 * threshold values, the prior mirrors (#110, #119/#120) are preserved, and the module imports
 * nothing from production Forecast.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  INPUT_MIRROR_PATH_2021_2023,
  MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023,
  OUTCOME_MIRROR_PATH_2024,
  PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
  PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_DECISIONS,
  PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS,
  PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED,
  PROMOTION_MERGE_COMMIT_2021_2025,
  buildPlayerHistory2021_2023InputMirror,
  buildPlayerHistory2024OutcomeMirror,
  evaluatePlayerHistory2024From2021_2023MirrorRefreshGate,
  evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity,
  type PlayerHistory2021_2023InputMirror,
  type PlayerHistory2024From2021_2023MirrorRefreshGateInput,
  type PlayerHistory2024OutcomeMirror,
  type PlayerSeasonCoverageV0_2021_2025IdentityResult,
} from '../src/rehearsal/playerHistory2024From2021_2023MirrorRefresh.js';
import type {
  PromotedArtifact,
  PromotedCoverageRecord,
  PromotedManifest,
  PromotedSourceGateExpectations,
} from '../src/rehearsal/playerHistoryPromotedSourceGate.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

// ---------------------------------------------------------------------------------------------
// Synthetic source records: a tiny promoted-2021-2025-shaped artifact so each mirror-builder test
// mutates one property.
// ---------------------------------------------------------------------------------------------

const APPROVED_REF = { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-07-06T00:00:00Z' };

const synthRecord = (overrides: Partial<PromotedCoverageRecord> = {}): PromotedCoverageRecord => ({
  player_id: '00-0000001',
  player_name: 'Synthetic Player',
  position: 'RB',
  identity_confidence: 'source_verified',
  season: 2023,
  season_type: 'REG',
  source_refs: [{ ...APPROVED_REF }],
  teams: ['SF'],
  primary_team: 'SF',
  primary_team_rule: null,
  weeks_observed: 17,
  coverage_status: 'full_season',
  missing_fields: [],
  production_summary: { season_ppr: 210.4, season_ppg: 12.4, games_for_ppg: 17 },
  usage_summary: {
    targets: 60,
    receptions: 48,
    rushing_attempts: 220,
    receiving_air_yards: 120,
    target_share: 0.14,
    air_yards_share: 0.05,
    wopr: 0.4,
    racr: 1.1,
    snap_share: null,
    routes_run: null,
    route_participation: null,
    red_zone_targets: null,
    red_zone_carries: null,
  },
  birth_date: '1999-01-01',
  season_age: 25,
  draft_year: 2021,
  rookie_year: 2021,
  career_year: 4,
  ...overrides,
});

const synthArtifact = (records: PromotedCoverageRecord[], status = 'promoted_governed_artifact'): PromotedArtifact => ({
  artifact_id: 'player_season_coverage_v0',
  status,
  promotion_review: 'TIBER-Data#202',
  promotion_decision: 'promote_player_season_coverage_v0_2021_2025',
  source_candidate: {
    path: 'data/processed/evidence/player_season_coverage_2021_2025.source_backed.json',
    sha256: 'c92404a1b519a62ee9f4b75f74662157fc8dd02b883648d4cdae694d0e021424',
    status_at_promotion: 'candidate_evidence_artifact_not_promoted',
  },
  approved_source_allowlist: ["nflreadpy.load_player_stats(", 'nflreadpy.load_players('],
  seasons: [2021, 2022, 2023, 2024, 2025],
  season_type_scope: ['REG'],
  included_positions: ['QB', 'RB', 'TE', 'WR'],
  row_grain: 'player_id + season + season_type',
  counts: { records: records.length, by_season: {}, by_position: {} },
  records,
});

/** One 2024 outcome player per position plus 2021-2023 history rows for two of them. */
const defaultRecords = (): PromotedCoverageRecord[] => [
  synthRecord({ player_id: '00-0000001', season: 2024, position: 'RB', production_summary: { season_ppr: 250.1, season_ppg: 14.7, games_for_ppg: 17 } }),
  synthRecord({ player_id: '00-0000002', season: 2024, position: 'WR' }),
  synthRecord({ player_id: '00-0000003', season: 2024, position: 'QB' }),
  synthRecord({ player_id: '00-0000004', season: 2024, position: 'TE', production_summary: { season_ppr: null, season_ppg: null, games_for_ppg: null } }),
  synthRecord({ player_id: '00-0000001', season: 2023, position: 'RB' }),
  synthRecord({ player_id: '00-0000001', season: 2022, position: 'RB' }),
  synthRecord({ player_id: '00-0000002', season: 2021, position: 'WR' }),
  // A non-population player's history row: must be excluded from the input mirror.
  synthRecord({ player_id: '00-0000099', season: 2023, position: 'WR' }),
  // An off-scope position in 2024: must be excluded from the outcome mirror.
  synthRecord({ player_id: '00-0000098', season: 2024, position: 'K' }),
];

const buildSynthMirrors = (): { outcome: PlayerHistory2024OutcomeMirror; input: PlayerHistory2021_2023InputMirror } => {
  const artifact = synthArtifact(defaultRecords());
  const outcome = buildPlayerHistory2024OutcomeMirror(artifact);
  return { outcome, input: buildPlayerHistory2021_2023InputMirror(artifact, outcome) };
};

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

describe('2024-from-2021-2023 mirror builders: scope, layering, null semantics', () => {
  it('the outcome mirror contains only 2024 REG QB/RB/WR/TE rows, outcome-layer fields only', () => {
    const { outcome } = buildSynthMirrors();
    expect(outcome.kind).toBe('player_history_2024_from_2021_2023_outcome_mirror');
    expect(outcome.rows).toHaveLength(4);
    expect(outcome.rows.every((r) => r.season === 2024 && r.season_type === 'REG')).toBe(true);
    expect(outcome.rows.map((r) => r.position).sort()).toEqual(['QB', 'RB', 'TE', 'WR']);
    for (const row of outcome.rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['identity_confidence', 'player_id', 'player_name', 'position', 'season', 'season_ppr', 'season_type', 'source_refs'].sort(),
      );
    }
    expect(outcome.rows.find((r) => r.player_id === '00-0000004')?.season_ppr).toBeNull();
    expect(outcome.governed_source.sha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025);
    expect(outcome.governed_source.promotionMergeCommit).toBe(PROMOTION_MERGE_COMMIT_2021_2025);
    expect(outcome.governed_source.promotionReview).toBe('TIBER-Data#202');
  });

  it('the input mirror excludes every 2024 record and every non-population player, and documents no-history players', () => {
    const { outcome, input } = buildSynthMirrors();
    expect(input.kind).toBe('player_history_2024_from_2021_2023_input_mirror');
    expect(input.rows.every((r) => [2021, 2022, 2023].includes(r.season))).toBe(true);
    expect(input.rows.some((r) => r.player_id === '00-0000099')).toBe(false);
    expect(input.counts.rows).toBe(3);
    expect(input.counts.players_with_history).toBe(2);
    expect(input.no_history_players.map((p) => p.player_id).sort()).toEqual(['00-0000003', '00-0000004']);
    expect(input.no_history_players.every((p) => p.note === 'no_2021_2023_source_rows_documented_absence_not_a_mirror_failure')).toBe(
      true,
    );
    expect(input.counts.outcome_players_without_history).toBe(outcome.rows.length - input.counts.players_with_history);
    expect(input.input_window.target_season_excluded).toBe(2024);
    expect(input.input_window.seasons).toEqual([2021, 2022, 2023]);
  });

  it('unavailable usage fields pass through as null, never zero-coerced; real values are preserved verbatim', () => {
    const { input } = buildSynthMirrors();
    for (const row of input.rows) {
      expect(row.usage_summary.snap_share).toBeNull();
      expect(row.usage_summary.routes_run).toBeNull();
      expect(row.usage_summary.route_participation).toBeNull();
      expect(row.usage_summary.red_zone_targets).toBeNull();
      expect(row.usage_summary.red_zone_carries).toBeNull();
      expect(row.usage_summary.targets).toBe(60);
    }
  });

  it('both mirrors stamp the prior-promotion->current-promotion source lineage and preserve prior mirror paths', () => {
    const { outcome, input } = buildSynthMirrors();
    for (const mirror of [outcome, input]) {
      expect(mirror.source_lineage.refreshed_from_source).toBe('prior_promoted_artifact_2022_2025');
      expect(mirror.source_lineage.refreshed_to_source).toBe('promoted_governed_artifact_2021_2025');
      expect(mirror.source_lineage.prior_mirror_paths_preserved_unchanged).toEqual(PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED);
      expect(mirror.source_lineage.prior_mirrors_not_overwritten).toBe(true);
    }
    for (const newPath of [OUTCOME_MIRROR_PATH_2024, INPUT_MIRROR_PATH_2021_2023, MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023]) {
      expect(PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED).not.toContain(newPath);
    }
  });

  it('a forbidden availability/ownership field on a source record fails both builds closed', () => {
    for (const key of ['active_status', 'ownership_status', 'roster_status', 'active_roster_status']) {
      const records = defaultRecords();
      records[0] = synthRecord({ ...records[0], [key]: 'ACT' } as Partial<PromotedCoverageRecord>);
      expect(() => buildPlayerHistory2024OutcomeMirror(synthArtifact(records))).toThrow(/forbidden availability field/);
    }
    const records = defaultRecords();
    records[4] = synthRecord({ ...records[4], roster_status: 'ACT' } as Partial<PromotedCoverageRecord>);
    const artifact = synthArtifact(records);
    const outcome = buildPlayerHistory2024OutcomeMirror(artifact);
    expect(() => buildPlayerHistory2021_2023InputMirror(artifact, outcome)).toThrow(/forbidden availability field/);
  });

  it('missing, unapproved, mixed, embedded-token, and fixture-marked source refs fail the build closed', () => {
    const badRefSets: Array<{ label: string; refs: PromotedCoverageRecord['source_refs'] }> = [
      { label: 'missing', refs: [] },
      { label: 'unapproved', refs: [{ source_name: 'espn_scrape_v2', observed_at: '2026-07-06T00:00:00Z' }] },
      { label: 'mixed', refs: [{ ...APPROVED_REF }, { source_name: 'manual_entry', observed_at: '2026-07-06T00:00:00Z' }] },
      { label: 'embedded-token', refs: [{ source_name: 'manual_override:nflreadpy.load_players()', observed_at: '2026-07-06T00:00:00Z' }] },
      { label: 'fixture-marked', refs: [{ source_name: "nflreadpy.load_player_stats(summary_level='reg')#offline_fixture", observed_at: '2026-07-06T00:00:00Z' }] },
    ];
    for (const { refs } of badRefSets) {
      const records = defaultRecords();
      records[0] = synthRecord({ ...records[0], source_refs: refs });
      expect(() => buildPlayerHistory2024OutcomeMirror(synthArtifact(records))).toThrow(/fails closed/);
    }
  });

  it('a duplicate player_id + season + season_type grain fails the build closed', () => {
    const records = [...defaultRecords(), synthRecord({ player_id: '00-0000001', season: 2024, position: 'RB' })];
    expect(() => buildPlayerHistory2024OutcomeMirror(synthArtifact(records))).toThrow(/duplicate outcome grain/);
    const inputDupes = [...defaultRecords(), synthRecord({ player_id: '00-0000001', season: 2023, position: 'RB' })];
    const artifact = synthArtifact(inputDupes);
    const outcome = buildPlayerHistory2024OutcomeMirror(artifact);
    expect(() => buildPlayerHistory2021_2023InputMirror(artifact, outcome)).toThrow(/duplicate input grain/);
  });
});

// ---------------------------------------------------------------------------------------------
// Source identity: verified separately against the #202/#207 (2021-2025) promotion pins
// ---------------------------------------------------------------------------------------------

const SYNTH_PROMOTED_SHA = 'd'.repeat(64);
const SYNTH_CANDIDATE_SHA = 'c'.repeat(64);

const identityRecord = (overrides: Partial<PromotedCoverageRecord> = {}): PromotedCoverageRecord => ({
  player_id: '00-0000001',
  season: 2024,
  season_type: 'REG',
  position: 'RB',
  source_refs: [{ source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-07-06T00:00:00Z', confidence: 'source_verified' }],
  usage_summary: { targets: 5, snap_share: null },
  ...overrides,
});

const identityManifest = (overrides: Partial<PromotedManifest> = {}): PromotedManifest => ({
  artifact_id: 'player_season_coverage_v0',
  status: 'promoted_governed_artifact',
  promotion_review: 'TIBER-Data#202',
  promotion_decision: 'promote_player_season_coverage_v0_2021_2025',
  source_candidate: { path: 'data/processed/evidence/candidate.json', sha256: SYNTH_CANDIDATE_SHA, status_at_promotion: 'candidate_evidence_artifact_not_promoted' },
  approved_source_allowlist: ["nflreadpy.load_player_stats(", 'nflreadpy.load_players('],
  seasons: [2024, 2025],
  season_type_scope: ['REG'],
  included_positions: ['QB', 'RB', 'TE', 'WR'],
  row_grain: 'player_id + season + season_type',
  counts: { records: 2, by_season: { '2024': 1, '2025': 1 }, by_position: { RB: 1, WR: 1 } },
  consumer_safety: {
    allowed: ['source-backed player-season production/history evidence'],
    not_allowed: [
      'current active roster status',
      'player availability or injury status',
      'depth chart role',
      'ownership/team membership',
      'product advice or fantasy rankings/start-sit/trade/draft output',
      'Forecast production binding without a separate Forecast issue and gate',
    ],
  },
  forecast_compatibility_note:
    'Consumption only through a separate Forecast-side gate that re-verifies sha/provenance, enforces target-season ' +
    'leakage splits structurally, and considers a production-only feature contract. No product-facing claim is ' +
    'authorized until a Forecast production-binding review passes.',
  promoted_artifact_path: 'exports/promoted/nfl/player_season_coverage_v0.json',
  promoted_artifact_sha256: SYNTH_PROMOTED_SHA,
  ...overrides,
});

const identityArtifact = (overrides: Partial<PromotedArtifact> = {}): PromotedArtifact => {
  const manifest = identityManifest();
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
    records: [identityRecord(), identityRecord({ player_id: '00-0000002', season: 2025, position: 'WR' })],
    ...overrides,
  };
};

const identityExpectations: PromotedSourceGateExpectations = {
  ...PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS,
  promotedArtifactSha256: SYNTH_PROMOTED_SHA,
  candidatePath: 'data/processed/evidence/candidate.json',
  candidateSha256: SYNTH_CANDIDATE_SHA,
  recordCount: 2,
  bySeason: { '2024': 1, '2025': 1 },
  byPosition: { RB: 1, WR: 1 },
  seasons: [2024, 2025],
};

const evaluateIdentity = (mutateManifest?: Partial<PromotedManifest>, mutateArtifact?: Partial<PromotedArtifact>) =>
  evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity(
    {
      manifest: identityManifest(mutateManifest),
      artifact: identityArtifact(mutateArtifact),
      actualPromotedArtifactSha256: SYNTH_PROMOTED_SHA,
    },
    identityExpectations,
  );

describe('source identity: verified against the #202/#207 (2021-2025) promotion pins', () => {
  it('a conforming synthetic manifest/artifact pair passes', () => {
    const result = evaluateIdentity();
    expect(result.passed).toBe(true);
    expect(result.blocking_reasons).toEqual([]);
  });

  it('a promoted artifact sha mismatch (actual bytes vs manifest claim) fails', () => {
    const result = evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity(
      { manifest: identityManifest(), artifact: identityArtifact(), actualPromotedArtifactSha256: 'f'.repeat(64) },
      identityExpectations,
    );
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('promoted_sha256_matches_actual_bytes');
  });

  it('a promotion_review other than TIBER-Data#202 fails (this promotion is #202, never #192)', () => {
    const result = evaluateIdentity({ promotion_review: 'TIBER-Data#192' });
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('manifest_promotion_review');
  });

  it('a promotion_decision other than promote_player_season_coverage_v0_2021_2025 fails', () => {
    const result = evaluateIdentity({ promotion_decision: 'promote_player_season_coverage_v0' });
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('manifest_promotion_decision');
  });

  it('a candidate-lineage sha mismatch fails', () => {
    const result = evaluateIdentity({ source_candidate: { ...identityManifest().source_candidate, sha256: 'e'.repeat(64) } });
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('candidate_lineage_sha256');
  });

  it('a record count that disagrees with the recomputed records array fails (never trusts the envelope alone)', () => {
    const result = evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity(
      { manifest: identityManifest(), artifact: identityArtifact({ records: [identityRecord()] }), actualPromotedArtifactSha256: SYNTH_PROMOTED_SHA },
      identityExpectations,
    );
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('record_count');
  });

  it('a missing forecast_compatibility_note or consumer_safety boundary fails', () => {
    const result = evaluateIdentity({ forecast_compatibility_note: null });
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('forecast_compatibility_note_boundary');
  });

  it('an unapproved or fixture-marked source_ref fails', () => {
    const badArtifact = identityArtifact({
      records: [identityRecord({ source_refs: [{ source_name: 'espn_scrape_v2', observed_at: null }] }), identityRecord({ player_id: '00-0000002', season: 2025, position: 'WR' })],
    });
    const result = evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity(
      { manifest: identityManifest(), artifact: badArtifact, actualPromotedArtifactSha256: SYNTH_PROMOTED_SHA },
      identityExpectations,
    );
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('source_refs_prefix_approved');
  });

  it('a forbidden availability field anywhere in the records fails', () => {
    const badArtifact = identityArtifact({
      records: [identityRecord({ active_status: 'ACT' } as Partial<PromotedCoverageRecord>), identityRecord({ player_id: '00-0000002', season: 2025, position: 'WR' })],
    });
    const result = evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity(
      { manifest: identityManifest(), artifact: badArtifact, actualPromotedArtifactSha256: SYNTH_PROMOTED_SHA },
      identityExpectations,
    );
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.join(' ')).toContain('no_forbidden_availability_fields');
  });

  it('the real committed pins (default expectations) describe the #202/#207 promotion, not the #192/#193 one', () => {
    expect(PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS.promotionReview).toBe('TIBER-Data#202');
    expect(PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS.promotionDecision).toBe('promote_player_season_coverage_v0_2021_2025');
    expect(PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS.promotedArtifactSha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025);
    expect(PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS.recordCount).toBe(3016);
    expect(PLAYER_SEASON_COVERAGE_V0_2021_2025_GATE_EXPECTATIONS.seasons).toEqual([2021, 2022, 2023, 2024, 2025]);
  });
});

// ---------------------------------------------------------------------------------------------
// Refresh gate: mirror integrity, leakage discipline, and population/overlap floors
// ---------------------------------------------------------------------------------------------

const passingIdentity = (overrides: Partial<PlayerSeasonCoverageV0_2021_2025IdentityResult> = {}): PlayerSeasonCoverageV0_2021_2025IdentityResult => ({
  passed: true,
  checks: [],
  blocking_reasons: [],
  ...overrides,
});

const passingOverlap = (): PlayerHistory2024From2021_2023MirrorRefreshGateInput['overlap'] => ({
  scored_target_rows: 600,
  joined_rows: 480,
  joined_rows_by_position: { QB: 66, RB: 115, WR: 184, TE: 115 },
  shuffle_groups: [
    { position: 'QB', feature_bearing_row_count: 66, derangement_possible: true },
    { position: 'RB', feature_bearing_row_count: 115, derangement_possible: true },
    { position: 'WR', feature_bearing_row_count: 184, derangement_possible: true },
    { position: 'TE', feature_bearing_row_count: 115, derangement_possible: true },
  ],
});

const passingGateInput = (): PlayerHistory2024From2021_2023MirrorRefreshGateInput => {
  const { outcome, input } = buildSynthMirrors();
  return {
    sourceIdentity: passingIdentity(),
    outcomeMirror: outcome,
    inputMirror: input,
    overlap: passingOverlap(),
  };
};

const evaluate = (mutate?: (input: PlayerHistory2024From2021_2023MirrorRefreshGateInput) => void) => {
  const input = passingGateInput();
  mutate?.(input);
  return evaluatePlayerHistory2024From2021_2023MirrorRefreshGate(input);
};

describe('refresh gate: the ceiling decision and source-identity precedence', () => {
  it('the synthetic baseline passes with the ceiling decision', () => {
    const result = evaluate();
    expect(result.status).toBe('passed');
    expect(result.decision).toBe('may_open_player_history_2024_from_2021_2023_additional_validation_issue');
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.blocking_reasons).toEqual([]);
  });

  it('a failed source-identity result blocks the refresh outright', () => {
    const result = evaluate((input) => {
      input.sourceIdentity = passingIdentity({ passed: false, blocking_reasons: ['synthetic identity failure'] });
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.source_identity_passed).toBe(false);
  });

  it('malformed gate input is blocked, not silently passed', () => {
    const result = evaluatePlayerHistory2024From2021_2023MirrorRefreshGate({});
    expect(result.status).toBe('invalid');
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.checks).toEqual([]);
  });
});

describe('refresh gate: leakage, provenance, and null-semantics enforcement on the refreshed mirrors', () => {
  it('an injected 2024 row in the input mirror blocks (no target-season input leakage)', () => {
    const result = evaluate((input) => {
      input.inputMirror.rows.push({ ...input.inputMirror.rows[0], season: 2024 });
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.blocking_reasons.join(' ')).toContain('input_no_2024_rows');
  });

  it('a target-outcome value copied onto an input row blocks', () => {
    const result = evaluate((input) => {
      (input.inputMirror.rows[0] as Record<string, unknown>).ppr_2024_actual = 250.1;
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.blocking_reasons.join(' ')).toContain('input_no_target_outcome_values');
  });

  it('an off-scope outcome row (wrong season) blocks', () => {
    const result = evaluate((input) => {
      input.outcomeMirror.rows[0] = { ...input.outcomeMirror.rows[0], season: 2023 };
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.blocking_reasons.join(' ')).toContain('outcome_rows_2024_reg_approved_positions_only');
  });

  it('an input row for a player outside the outcome population blocks', () => {
    const result = evaluate((input) => {
      input.inputMirror.rows.push({ ...input.inputMirror.rows[0], player_id: '00-0009999' });
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.blocking_reasons.join(' ')).toContain('input_players_subset_of_outcome_population');
  });

  it('missing, unapproved, mixed, and embedded-token source refs on mirror rows block (prefix, never substring)', () => {
    for (const refs of [
      [],
      [{ source_name: 'espn_scrape_v2', observed_at: null }],
      [APPROVED_REF, { source_name: 'manual_entry', observed_at: null }],
      [{ source_name: 'manual_override:nflreadpy.load_players()', observed_at: null }],
    ]) {
      const result = evaluate((input) => {
        input.inputMirror.rows[0] = { ...input.inputMirror.rows[0], source_refs: refs };
      });
      expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
      expect(result.blocking_reasons.join(' ')).toMatch(/mirror_source_refs_present|mirror_source_refs_prefix_approved/);
    }
  });

  it('a forbidden availability/ownership field on any mirror row blocks', () => {
    const result = evaluate((input) => {
      (input.inputMirror.rows[0] as Record<string, unknown>).active_status = 'ACT';
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.blocking_reasons.join(' ')).toContain('mirror_no_forbidden_availability_fields');
  });

  it('a zero-coerced unavailable usage field blocks; a populated one blocks too', () => {
    for (const value of [0, 0.55]) {
      const result = evaluate((input) => {
        input.inputMirror.rows[0] = {
          ...input.inputMirror.rows[0],
          usage_summary: { ...input.inputMirror.rows[0].usage_summary, snap_share: value },
        };
      });
      expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
      expect(result.blocking_reasons.join(' ')).toContain('mirror_unavailable_usage_fields_remain_null');
    }
  });

  it('internally-contradictory overlap evidence (joined > scored) blocks outright, never requires-followup', () => {
    const result = evaluate((input) => {
      input.overlap.joined_rows = input.overlap.scored_target_rows + 1;
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_counts_sane');
  });

  it('missing shuffle evidence for a joined position blocks outright', () => {
    const result = evaluate((input) => {
      input.overlap.shuffle_groups = input.overlap.shuffle_groups.filter((g) => g.position !== 'QB');
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
    expect(result.blocking_reasons.join(' ')).toContain('missing shuffle evidence for: QB');
  });
});

describe('refresh gate: #107 population/overlap floors', () => {
  it('joined rows below the overall floor downgrade to requires-followup (mirrors intact, issue not authorized)', () => {
    const result = evaluate((input) => {
      input.overlap.joined_rows = 150;
      input.overlap.joined_rows_by_position = { QB: 40, RB: 40, WR: 35, TE: 35 };
    });
    expect(result.status).toBe('requires_followup');
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_requires_followup');
    expect(result.mirror_integrity_passed).toBe(true);
    expect(result.overlap_floors_passed).toBe(false);
  });

  it('a single position below the per-position floor downgrades to requires-followup', () => {
    const result = evaluate((input) => {
      input.overlap.joined_rows_by_position = { ...input.overlap.joined_rows_by_position, QB: 29 };
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_requires_followup');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_min_joined_rows_position_QB');
  });

  it('a joined share below 60% downgrades to requires-followup', () => {
    const result = evaluate((input) => {
      input.overlap.scored_target_rows = 1000;
      input.overlap.joined_rows = 480;
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_requires_followup');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_min_joined_share');
  });

  it('an infeasible derangement in any feature-bearing position group downgrades to requires-followup', () => {
    const result = evaluate((input) => {
      input.overlap.shuffle_groups[0] = { position: 'QB', feature_bearing_row_count: 1, derangement_possible: false };
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_requires_followup');
    expect(result.blocking_reasons.join(' ')).toContain('overlap_derangement_feasible_by_position');
  });

  it('a source-identity failure takes precedence over floor failures: blocked, not requires-followup', () => {
    const result = evaluate((input) => {
      input.sourceIdentity = passingIdentity({ passed: false, blocking_reasons: ['synthetic'] });
      input.overlap.joined_rows = 10;
    });
    expect(result.decision).toBe('forecast_player_history_mirror_refresh_blocked');
  });
});

// ---------------------------------------------------------------------------------------------
// Decision-enum purity and import isolation
// ---------------------------------------------------------------------------------------------

describe('refresh: decision-enum purity and production isolation', () => {
  it('the decision enum contains exactly the three #135 values and no production/binding/run/metric/advice/threshold value', () => {
    expect([...PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_DECISIONS]).toEqual([
      'may_open_player_history_2024_from_2021_2023_additional_validation_issue',
      'forecast_player_history_mirror_refresh_blocked',
      'forecast_player_history_mirror_refresh_requires_followup',
    ]);
    for (const decision of PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_DECISIONS) {
      for (const forbidden of ['may_run', 'bind', 'production', 'metric', 'advice', 'ranking', 'signal', 'promote_', 'threshold']) {
        expect(decision).not.toContain(forbidden);
      }
    }
  });

  it('every gate result restates the leakage discipline and the prior-mirror preservation statement', () => {
    for (const result of [evaluate(), evaluatePlayerHistory2024From2021_2023MirrorRefreshGate({})]) {
      expect(result.leakage_discipline).toBeDefined();
      expect(result.prior_mirror_statement).toContain('preserved unchanged');
      expect(result.ceiling_note).toContain('does not itself run that validation');
    }
  });

  it('refresh module and script import nothing from production Forecast (no seasonalPprModel, server, routes, scoring, board, fusion, services)', () => {
    for (const rel of [
      'src/rehearsal/playerHistory2024From2021_2023MirrorRefresh.ts',
      'scripts/runPlayerHistory2024From2021_2023MirrorRefresh.ts',
    ]) {
      const source = readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
      const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
      expect(importLines.length).toBeGreaterThan(0);
      for (const line of importLines) {
        expect(line).not.toMatch(/seasonalPprModel|\/server|\/routes|\/scoring|\/board|\/fusion|\/services/);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Committed refreshed artifacts (the real #135 outputs)
// ---------------------------------------------------------------------------------------------

describe('committed 2024-from-2021-2023 mirrors and reports', () => {
  const outcome = readRepoJson<PlayerHistory2024OutcomeMirror>(OUTCOME_MIRROR_PATH_2024);
  const inputMirror = readRepoJson<PlayerHistory2021_2023InputMirror>(INPUT_MIRROR_PATH_2021_2023);
  const provenance = readRepoJson<{
    promoted_source: {
      promotedArtifactSha256Pinned: string;
      promotedArtifactSha256Actual: string;
      promotionMergeCommit: string;
      promotionReview: string;
      promotionDecision: string;
    };
    source_identity_gate: { status: string; decision: string; source_identity_passed: boolean; overlap_floors_passed: boolean };
    mirrors: { outcome_mirror: { path: string; sha256: string }; input_mirror: { path: string; sha256: string } };
    prior_mirrors: { preserved_unchanged_at: string[]; not_overwritten_by_this_refresh: boolean };
    overlap_evidence: { scored_target_rows: number; joined_rows: number };
    refresh_gate_decision: string;
    boundary_statements: Record<string, boolean>;
  }>(MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023);

  it('the committed outcome mirror is the real 2024 REG population tied to the #202/#207 promoted pin', () => {
    expect(outcome.kind).toBe('player_history_2024_from_2021_2023_outcome_mirror');
    expect(outcome.governed_source.sha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025);
    expect(outcome.governed_source.promotionReview).toBe('TIBER-Data#202');
    expect(outcome.counts.rows).toBe(588);
    expect(outcome.rows).toHaveLength(588);
    expect(outcome.rows.every((r) => r.season === 2024 && r.season_type === 'REG')).toBe(true);
  });

  it('the committed input mirror has zero 2024 rows and preserves null usage semantics on every row', () => {
    expect(inputMirror.kind).toBe('player_history_2024_from_2021_2023_input_mirror');
    expect(inputMirror.governed_source.sha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025);
    expect(inputMirror.rows.every((r) => r.season !== 2024 && [2021, 2022, 2023].includes(r.season))).toBe(true);
    expect(
      inputMirror.rows.every(
        (r) =>
          r.usage_summary.snap_share === null &&
          r.usage_summary.routes_run === null &&
          r.usage_summary.route_participation === null &&
          r.usage_summary.red_zone_targets === null &&
          r.usage_summary.red_zone_carries === null,
      ),
    ).toBe(true);
  });

  it('every committed mirror row carries prefix-approved provenance', () => {
    const approved = ["nflreadpy.load_player_stats(", 'nflreadpy.load_players('];
    for (const rows of [outcome.rows, inputMirror.rows]) {
      expect(rows.every((r) => r.source_refs.length > 0 && r.source_refs.every((ref) => approved.some((p) => ref.source_name.startsWith(p))))).toBe(
        true,
      );
    }
  });

  it('the provenance companion ties the mirrors to the #202/#207 promoted artifact and records a passing identity gate', () => {
    expect(provenance.promoted_source.promotedArtifactSha256Pinned).toBe(PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025);
    expect(provenance.promoted_source.promotedArtifactSha256Actual).toBe(PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025);
    expect(provenance.promoted_source.promotionMergeCommit).toBe(PROMOTION_MERGE_COMMIT_2021_2025);
    expect(provenance.promoted_source.promotionReview).toBe('TIBER-Data#202');
    expect(provenance.promoted_source.promotionDecision).toBe('promote_player_season_coverage_v0_2021_2025');
    expect(provenance.source_identity_gate.source_identity_passed).toBe(true);
    expect(provenance.refresh_gate_decision).toBe('may_open_player_history_2024_from_2021_2023_additional_validation_issue');
    expect(PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_DECISIONS).toContain(provenance.refresh_gate_decision);
    expect(provenance.boundary_statements.mirror_refresh_only_not_a_model_run).toBe(true);
    expect(provenance.boundary_statements.no_metrics_computed).toBe(true);
    expect(provenance.boundary_statements.no_validation_run).toBe(true);
    expect(provenance.boundary_statements.no_threshold_accepted_rejected_or_amended).toBe(true);
    expect(provenance.boundary_statements.no_production_binding_authorized).toBe(true);
  });

  it('the provenance-recorded mirror sha256s match the committed mirror bytes', () => {
    for (const mirror of [provenance.mirrors.outcome_mirror, provenance.mirrors.input_mirror]) {
      const actual = createHash('sha256').update(readFileSync(path.join(REPO_ROOT, mirror.path))).digest('hex');
      expect(actual).toBe(mirror.sha256);
    }
  });

  it('the prior mirrors (#110 archived candidate + #119/#120 promoted-source) still exist unchanged', () => {
    expect(provenance.prior_mirrors.preserved_unchanged_at).toEqual([...PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED]);
    expect(provenance.prior_mirrors.not_overwritten_by_this_refresh).toBe(true);
    const priorPromotedOutcome = readRepoJson<{ kind: string; governed_source: { sha256: string } }>(
      'data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json',
    );
    expect(priorPromotedOutcome.kind).toBe('player_history_promoted_outcome_mirror');
    // The prior (#192/#193, 2022-2025) promotion sha must differ from this (#202/#207, 2021-2025) one.
    expect(priorPromotedOutcome.governed_source.sha256).not.toBe(PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025);
  });

  it('the overlap evidence recorded in provenance clears the pre-registered #107/PR#108 floors', () => {
    expect(provenance.overlap_evidence.joined_rows).toBeGreaterThanOrEqual(200);
    expect(provenance.source_identity_gate.overlap_floors_passed).toBe(true);
  });
});
