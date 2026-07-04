/**
 * Guardrail tests for the deterministic replay/validation logic behind the non-production
 * `player_history_production_feature_v0` contract (Forecast #129). Pins: source-identity lock only
 * on a passing #117 gate re-verification (fail closed otherwise), production-only-scoped row
 * building with no-history rows entirely null, missing-history subgroup count/share/by-position
 * reporting, run_id determinism across independent rebuilds, the pinned #122 smoke-metric
 * comparison (including a real end-to-end replay against the committed promoted mirrors/reports),
 * and the final bounded decision rule.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildPlayerHistoryFeatureContractV0Instance,
  buildProductionOnlyContractRows,
  compareSmokeMetrics,
  computeMissingHistorySubgroupReport,
  decideContractV0Replay,
  lockSourceDatasetRefsOrFailClosed,
  verifyMirrorSourceIdentityOrFailClosed,
  PINNED_122_JOINED_MAE,
  PINNED_122_JOINED_RMSE,
} from '../src/rehearsal/playerHistoryContractV0Replay.js';
import { validatePlayerHistoryFeatureContractV0Instance } from '../src/rehearsal/playerHistoryFeatureContractV0.js';
import {
  executePromotedControlledRerun,
  type CandidateSourceReferenceResult,
  type PromotedControlledRerunPriorGateEvidence,
} from '../src/rehearsal/playerHistoryPromotedControlledRerun.js';
import type { ControlledRunMetrics } from '../src/rehearsal/playerHistoryControlledRun.js';
import type { PlayerHistoryInputRow } from '../src/rehearsal/playerHistoryFeatureScaffold.js';
import type { PromotedInputMirror, PromotedMirrorRefreshGateResult, PromotedOutcomeMirror } from '../src/rehearsal/playerHistoryPromotedMirrorRefresh.js';
import { PINNED_PROMOTED_ARTIFACT_SHA256, type PromotedSourceGateResult } from '../src/rehearsal/playerHistoryPromotedSourceGate.js';
import { PINNED_SOURCE_ARTIFACT_SHA256 } from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

// ---------------------------------------------------------------------------------------------
// Source identity lock: fail closed unless the #117 gate re-verification passed with the exact
// ceiling decision AND the actual re-hashed bytes match the Forecast pin.
// ---------------------------------------------------------------------------------------------

const passingGate = (overrides: Partial<PromotedSourceGateResult> = {}): PromotedSourceGateResult =>
  ({
    gate_version: 'player-history-promoted-source-gate-v1',
    status: 'passed',
    decision: 'may_open_promoted_mirror_refresh_issue',
    decision_rule: 'synthetic',
    checks: [],
    blocking_reasons: [],
    candidate_lineage_intact: true,
    leakage_discipline_for_future_refresh: {
      target_season_2025_remains_outcome_only_for_prior_experiment_shape: true,
      input_seasons_for_2025_prediction_remain_2022_2024_only: true,
      no_2025_production_summaries_may_become_2025_input_features: true,
      no_active_availability_ownership_fields_may_be_consumed: true,
      unavailable_usage_fields_remain_null_never_zero_coerced: true,
    },
    candidate_mirror_relationship: 'synthetic',
    ceiling_note: 'synthetic',
    ...overrides,
  }) as PromotedSourceGateResult;

describe('lockSourceDatasetRefsOrFailClosed (PR #128 §2.1: lock only after fail-closed re-verification)', () => {
  it('locks source_dataset_refs when the gate passed, decision is correct, and bytes match the pin', () => {
    const result = lockSourceDatasetRefsOrFailClosed(passingGate(), PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(result.locked).toBe(true);
    if (result.locked) {
      expect(result.source_dataset_refs.artifact_sha256).toBe(PINNED_PROMOTED_ARTIFACT_SHA256);
      expect(result.source_dataset_refs.promotion_review).toBe('TIBER-Data#192');
    }
  });

  it('fails closed when the gate status is not passed', () => {
    const result = lockSourceDatasetRefsOrFailClosed(passingGate({ status: 'failed' }), PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(result.locked).toBe(false);
    if (!result.locked) expect(result.reason).toMatch(/status/);
  });

  it('fails closed when the gate decision is anything other than may_open_promoted_mirror_refresh_issue', () => {
    const result = lockSourceDatasetRefsOrFailClosed(passingGate({ decision: 'blocked_promoted_artifact_gate_failed' }), PINNED_PROMOTED_ARTIFACT_SHA256);
    expect(result.locked).toBe(false);
    if (!result.locked) expect(result.reason).toMatch(/decision/);
  });

  it('fails closed on a sha256 mismatch between the actual bytes and the Forecast pin', () => {
    const result = lockSourceDatasetRefsOrFailClosed(passingGate(), 'f'.repeat(64));
    expect(result.locked).toBe(false);
    if (!result.locked) expect(result.reason).toMatch(/sha256/);
  });
});

// ---------------------------------------------------------------------------------------------
// Production-only row building + missing-history subgroup reporting (synthetic mirrors).
// ---------------------------------------------------------------------------------------------

const APPROVED_REF = { source_name: "nflreadpy.load_player_stats(summary_level='reg')", observed_at: '2026-06-30T00:00:00Z' };

const historyInputRow = (overrides: Partial<PlayerHistoryInputRow> & { player_id: string; season: number }): PlayerHistoryInputRow => ({
  player_name: `Player ${overrides.player_id}`,
  position: 'WR',
  season_type: 'REG',
  identity_confidence: 'source_verified',
  source_refs: [{ ...APPROVED_REF }],
  teams: ['PHI'],
  primary_team: 'PHI',
  primary_team_rule: null,
  weeks_observed: 15,
  coverage_status: 'full_season',
  missing_fields: [],
  production_summary: { season_ppr: 150, season_ppg: 10, games_for_ppg: 15 },
  usage_summary: {
    targets: 50, receptions: 40, rushing_attempts: 10, receiving_air_yards: 400, target_share: 0.2, air_yards_share: 0.2, wopr: 0.4, racr: 1.1,
    snap_share: null, routes_run: null, route_participation: null, red_zone_targets: null, red_zone_carries: null,
  },
  birth_date: '1998-01-01',
  season_age: 26.5,
  draft_year: 2020,
  rookie_year: 2020,
  career_year: 4,
  ...overrides,
});

const outcomeMirrorOf = (players: Array<{ player_id: string; position?: string; season_ppr?: number | null }>): PromotedOutcomeMirror =>
  ({
    kind: 'player_history_promoted_outcome_mirror',
    version: 'player-history-promoted-mirror-refresh-v1',
    issue: 'TIBER-Forecast#119',
    governed_source: {
      repo: 'Prometheus-Frameworks/TIBER-Data',
      promotedArtifactPath: 'exports/promoted/nfl/player_season_coverage_v0.json',
      promotedManifestPath: 'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json',
      promotionMergeCommit: '65fb498253b5bdb6a7f6d0598d7235c90a78c729',
      sha256: PINNED_PROMOTED_ARTIFACT_SHA256,
      artifactStatus: 'promoted_governed_artifact',
    },
    source_lineage: {
      refreshed_from_source: 'candidate_pin',
      refreshed_to_source: 'promoted_governed_artifact',
      prior_candidate_sha256: PINNED_SOURCE_ARTIFACT_SHA256,
      archived_candidate_mirrors_preserved_at: [],
      archived_candidate_mirrors_not_overwritten: true,
    },
    boundary: {
      outcome_layer_only: true,
      rows_carry_no_input_features: true,
      outcome_values_must_not_become_2025_input_features: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
    },
    target_season: 2025,
    season_type: 'REG',
    counts: { rows: players.length, players: players.length, by_position: {} },
    rows: players.map((player) => ({
      player_id: player.player_id,
      player_name: `Player ${player.player_id}`,
      position: player.position ?? 'WR',
      season: 2025,
      season_type: 'REG',
      season_ppr: player.season_ppr === undefined ? 200 : player.season_ppr,
      source_refs: [{ ...APPROVED_REF }],
      identity_confidence: 'source_verified',
    })),
  }) as PromotedOutcomeMirror;

const SYNTHETIC_GOVERNED_SOURCE = {
  repo: 'Prometheus-Frameworks/TIBER-Data',
  promotedArtifactPath: 'exports/promoted/nfl/player_season_coverage_v0.json',
  promotedManifestPath: 'exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json',
  promotionMergeCommit: '65fb498253b5bdb6a7f6d0598d7235c90a78c729',
  sha256: PINNED_PROMOTED_ARTIFACT_SHA256,
  artifactStatus: 'promoted_governed_artifact',
};

const inputMirrorOf = (governedSourceOverrides: Partial<typeof SYNTHETIC_GOVERNED_SOURCE> = {}): PromotedInputMirror =>
  ({
    kind: 'player_history_promoted_input_mirror',
    version: 'player-history-promoted-mirror-refresh-v1',
    issue: 'TIBER-Forecast#119',
    governed_source: { ...SYNTHETIC_GOVERNED_SOURCE, ...governedSourceOverrides },
    source_lineage: {
      refreshed_from_source: 'candidate_pin',
      refreshed_to_source: 'promoted_governed_artifact',
      prior_candidate_sha256: PINNED_SOURCE_ARTIFACT_SHA256,
      archived_candidate_mirrors_preserved_at: [],
      archived_candidate_mirrors_not_overwritten: true,
    },
    input_window: { seasons: [2022, 2023, 2024], season_type: 'REG', target_season_excluded: 2025 },
    boundary: {
      contains_no_target_season_rows: true,
      contains_no_2025_outcome_values: true,
      nulls_preserved_never_zero_coerced: true,
      no_availability_ownership_depth_injury_fields: true,
      no_forecast_run_authorized_by_this_mirror: true,
      no_production_binding_authorized_by_this_mirror: true,
    },
    counts: { rows: 0, players_with_history: 0, outcome_players_without_history: 0, by_season: {}, by_position: {} },
    no_history_players: [],
    rows: [],
  }) as PromotedInputMirror;

const outcomeMirrorWithGovernedSource = (governedSourceOverrides: Partial<typeof SYNTHETIC_GOVERNED_SOURCE> = {}): PromotedOutcomeMirror => {
  const mirror = outcomeMirrorOf([{ player_id: 'p1' }]);
  return { ...mirror, governed_source: { ...SYNTHETIC_GOVERNED_SOURCE, ...governedSourceOverrides } } as PromotedOutcomeMirror;
};

const LOCKED_REFS = {
  repo: SYNTHETIC_GOVERNED_SOURCE.repo,
  artifact_path: SYNTHETIC_GOVERNED_SOURCE.promotedArtifactPath,
  artifact_sha256: SYNTHETIC_GOVERNED_SOURCE.sha256,
  promotion_review: 'TIBER-Data#192',
};

describe('verifyMirrorSourceIdentityOrFailClosed (required fix: mirrors must correspond to the just-locked source identity)', () => {
  it('verifies when both mirrors governed_source blocks match the locked identity exactly', () => {
    const result = verifyMirrorSourceIdentityOrFailClosed(LOCKED_REFS, outcomeMirrorWithGovernedSource(), inputMirrorOf());
    expect(result.verified).toBe(true);
  });

  it('fails closed when the outcome mirror sha256 does not match the locked artifact_sha256', () => {
    const result = verifyMirrorSourceIdentityOrFailClosed(LOCKED_REFS, outcomeMirrorWithGovernedSource({ sha256: 'f'.repeat(64) as never }), inputMirrorOf());
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toMatch(/outcome mirror governed_source\.sha256/);
  });

  it('fails closed when the input mirror promotedArtifactPath does not match the locked artifact_path', () => {
    const result = verifyMirrorSourceIdentityOrFailClosed(LOCKED_REFS, outcomeMirrorWithGovernedSource(), inputMirrorOf({ promotedArtifactPath: 'exports/promoted/nfl/other_path.json' as never }));
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toMatch(/input mirror governed_source\.promotedArtifactPath/);
  });

  it('fails closed when a mirror promotionMergeCommit does not match the expected promotion merge commit', () => {
    const result = verifyMirrorSourceIdentityOrFailClosed(LOCKED_REFS, outcomeMirrorWithGovernedSource({ promotionMergeCommit: 'deadbeef' as never }), inputMirrorOf());
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toMatch(/promotionMergeCommit/);
  });

  it('fails closed when a mirror artifactStatus is not the expected promoted status', () => {
    const result = verifyMirrorSourceIdentityOrFailClosed(LOCKED_REFS, outcomeMirrorWithGovernedSource({ artifactStatus: 'candidate_evidence' as never }), inputMirrorOf());
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toMatch(/artifactStatus/);
  });

  it('fails closed when the locked promotion_review does not match the expected promotion review', () => {
    const result = verifyMirrorSourceIdentityOrFailClosed({ ...LOCKED_REFS, promotion_review: 'TIBER-Data#1' }, outcomeMirrorWithGovernedSource(), inputMirrorOf());
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toMatch(/promotion_review/);
  });

  it('verifies against the REAL committed promoted mirrors and the real locked identity (integration check)', () => {
    const outcomeMirror = readRepoJson<PromotedOutcomeMirror>('data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json');
    const inputMirror = readRepoJson<PromotedInputMirror>('data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json');
    const result = verifyMirrorSourceIdentityOrFailClosed(LOCKED_REFS, outcomeMirror, inputMirror);
    expect(result.verified).toBe(true);
  });
});

describe('buildProductionOnlyContractRows + computeMissingHistorySubgroupReport (synthetic mirrors)', () => {
  const inputRows: PlayerHistoryInputRow[] = [
    historyInputRow({ player_id: 'p1', season: 2022, position: 'WR', production_summary: { season_ppr: 100, season_ppg: 6.7, games_for_ppg: 15 } }),
    historyInputRow({ player_id: 'p1', season: 2023, position: 'WR', production_summary: { season_ppr: 120, season_ppg: 8, games_for_ppg: 15 } }),
    historyInputRow({ player_id: 'p1', season: 2024, position: 'WR', production_summary: { season_ppr: 140, season_ppg: 9.3, games_for_ppg: 15 } }),
  ];
  const outcomeMirror = outcomeMirrorOf([
    { player_id: 'p1', position: 'WR' },
    { player_id: 'rookie1', position: 'RB' },
    { player_id: 'rookie2', position: 'QB' },
  ]);

  it('marks a player with 2022-2024 history as has_prior_history with a populated production block', () => {
    const rows = buildProductionOnlyContractRows(outcomeMirror, inputRows);
    const p1 = rows.find((r) => r.player_identity_join_keys.player_id === 'p1')!;
    expect(p1.has_prior_history).toBe(true);
    expect(p1.production).not.toBeNull();
    expect(p1.production!.trailing_3yr_ppr_total).toBe(100 + 120 + 140);
    expect(p1.player_identity_join_keys.season).toBe(2025);
    expect(p1.player_identity_join_keys.season_type).toBe('REG');
  });

  it('marks a player with no prior rows as has_prior_history=false with an entirely null production block', () => {
    const rows = buildProductionOnlyContractRows(outcomeMirror, inputRows);
    const rookie = rows.find((r) => r.player_identity_join_keys.player_id === 'rookie1')!;
    expect(rookie.has_prior_history).toBe(false);
    expect(rookie.production).toBeNull();
  });

  it('reports missing-history count/share/by-position and flags every no-history row entirely null', () => {
    const rows = buildProductionOnlyContractRows(outcomeMirror, inputRows);
    const report = computeMissingHistorySubgroupReport(rows);
    expect(report.count).toBe(2);
    expect(report.total).toBe(3);
    expect(report.share).toBeCloseTo(2 / 3, 9);
    expect(report.by_position).toEqual({ QB: 1, RB: 1 });
    expect(report.every_no_history_row_entirely_null).toBe(true);
  });

  it('throws (fails closed) if an input row carries a forbidden availability field', () => {
    const badRows = [...inputRows, historyInputRow({ player_id: 'p1', season: 2022, active_status: 'active' } as never)];
    expect(() => buildProductionOnlyContractRows(outcomeMirror, badRows)).toThrow(/forbidden availability field/);
  });
});

// ---------------------------------------------------------------------------------------------
// run_id determinism across independent rebuilds of the full instance.
// ---------------------------------------------------------------------------------------------

describe('buildPlayerHistoryFeatureContractV0Instance run_id determinism', () => {
  const refs = {
    repo: 'Prometheus-Frameworks/TIBER-Data',
    artifact_path: 'exports/promoted/nfl/player_season_coverage_v0.json',
    artifact_sha256: PINNED_PROMOTED_ARTIFACT_SHA256,
    promotion_review: 'TIBER-Data#192',
  };
  const outcomeMirror = outcomeMirrorOf([{ player_id: 'p1', position: 'WR' }]);
  const inputRows: PlayerHistoryInputRow[] = [historyInputRow({ player_id: 'p1', season: 2024 })];

  it('produces an identical run_id when rebuilt independently with the same generated_at', () => {
    const a = buildPlayerHistoryFeatureContractV0Instance(refs, outcomeMirror, inputRows, '2026-07-04T00:00:00.000Z');
    const b = buildPlayerHistoryFeatureContractV0Instance(refs, outcomeMirror, inputRows, '2026-07-04T00:00:00.000Z');
    expect(a.envelope.run_id).toBe(b.envelope.run_id);
    expect(a.envelope.run_id).toHaveLength(64);
  });

  it('produces a different run_id for a different generated_at', () => {
    const a = buildPlayerHistoryFeatureContractV0Instance(refs, outcomeMirror, inputRows, '2026-07-04T00:00:00.000Z');
    const b = buildPlayerHistoryFeatureContractV0Instance(refs, outcomeMirror, inputRows, '2026-07-05T00:00:00.000Z');
    expect(a.envelope.run_id).not.toBe(b.envelope.run_id);
  });

  it('builds an instance that itself passes structural schema validation', () => {
    const instance = buildPlayerHistoryFeatureContractV0Instance(refs, outcomeMirror, inputRows, '2026-07-04T00:00:00.000Z');
    const result = validatePlayerHistoryFeatureContractV0Instance(instance);
    expect(result.status).toBe('passed');
  });
});

// ---------------------------------------------------------------------------------------------
// Pinned #122 smoke-metric comparison.
// ---------------------------------------------------------------------------------------------

const metrics = (mae: number, rmse: number): ControlledRunMetrics => ({ n: 485, mae, rmse, pearson: 0, spearman: 0 });

describe('compareSmokeMetrics (PR #128 §2.6: must reproduce the committed #122 numbers exactly)', () => {
  it('matches when observed metrics equal the pinned #122 values exactly', () => {
    const joined = {
      baseline_only: metrics(PINNED_122_JOINED_MAE.baseline_only, PINNED_122_JOINED_RMSE.baseline_only),
      real_player_history_features: metrics(PINNED_122_JOINED_MAE.real_player_history_features, PINNED_122_JOINED_RMSE.real_player_history_features),
      shuffled_player_history_control: metrics(PINNED_122_JOINED_MAE.shuffled_player_history_control, PINNED_122_JOINED_RMSE.shuffled_player_history_control),
    };
    const comparison = compareSmokeMetrics(joined);
    expect(comparison.matches).toBe(true);
    expect(comparison.diffs).toEqual([]);
  });

  it('flags a mismatch when any observed metric diverges from the pinned #122 value', () => {
    const joined = {
      baseline_only: metrics(PINNED_122_JOINED_MAE.baseline_only, PINNED_122_JOINED_RMSE.baseline_only),
      real_player_history_features: metrics(41.0, PINNED_122_JOINED_RMSE.real_player_history_features),
      shuffled_player_history_control: metrics(PINNED_122_JOINED_MAE.shuffled_player_history_control, PINNED_122_JOINED_RMSE.shuffled_player_history_control),
    };
    const comparison = compareSmokeMetrics(joined);
    expect(comparison.matches).toBe(false);
    expect(comparison.diffs.some((d) => d.arm === 'real_player_history_features' && d.metric === 'mae')).toBe(true);
  });

  it('flags a mismatch when an observed metric is null', () => {
    const joined = {
      baseline_only: metrics(PINNED_122_JOINED_MAE.baseline_only, PINNED_122_JOINED_RMSE.baseline_only),
      real_player_history_features: { ...metrics(0, 0), mae: null },
      shuffled_player_history_control: metrics(PINNED_122_JOINED_MAE.shuffled_player_history_control, PINNED_122_JOINED_RMSE.shuffled_player_history_control),
    };
    const comparison = compareSmokeMetrics(joined);
    expect(comparison.matches).toBe(false);
  });
});

describe('replay smoke test end-to-end against the REAL committed promoted mirrors/reports (#119-#122)', () => {
  it('reproduces the pinned #122 joined-population MAE/RMSE numbers exactly', () => {
    const outcomeMirror = readRepoJson<PromotedOutcomeMirror>('data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json');
    const inputMirror = readRepoJson<PromotedInputMirror>('data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json');
    const refreshGateReport = readRepoJson<{ gate_result: PromotedMirrorRefreshGateResult }>('docs/reports/player-history-promoted-mirror-overlap-gate-2026-07-04.json');
    const candidateRunReport = readRepoJson<{
      experiment: { decision: { decision: string }; metrics_by_arm: { joined_only: Record<string, ControlledRunMetrics> } };
    }>('docs/reports/player-history-controlled-run-2026-07-02.json');

    const gates: PromotedControlledRerunPriorGateEvidence = { mirrorRefreshGateResult: refreshGateReport.gate_result };
    const candidateJoined = candidateRunReport.experiment.metrics_by_arm.joined_only;
    const candidateReference: CandidateSourceReferenceResult = {
      decision: candidateRunReport.experiment.decision.decision,
      joined_mae: {
        baseline_only: candidateJoined.baseline_only!.mae!,
        real_player_history_features: candidateJoined.real_player_history_features!.mae!,
        shuffled_player_history_control: candidateJoined.shuffled_player_history_control!.mae!,
      },
      joined_rmse: {
        baseline_only: candidateJoined.baseline_only!.rmse!,
        real_player_history_features: candidateJoined.real_player_history_features!.rmse!,
        shuffled_player_history_control: candidateJoined.shuffled_player_history_control!.rmse!,
      },
    };

    const { report } = executePromotedControlledRerun(outcomeMirror, inputMirror, gates, candidateReference);
    const comparison = compareSmokeMetrics(report.metrics_by_arm.joined_only);
    expect(comparison.matches).toBe(true);
    expect(comparison.diffs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Final bounded decision rule.
// ---------------------------------------------------------------------------------------------

const readyInputs = { sourceIdentityLocked: true, mirrorSourceVerified: true, schemaValidationPassed: true, smokeMetricsMatch: true, runIdDeterministic: true };

describe('decideContractV0Replay', () => {
  it('emits the ready-for-review decision when every input is true', () => {
    const result = decideContractV0Replay(readyInputs);
    expect(result.decision).toBe('player_history_contract_v0_non_production_implementation_ready_for_review');
  });

  it('emits the blocked decision, naming the reason, when the source identity could not be locked', () => {
    const result = decideContractV0Replay({ ...readyInputs, sourceIdentityLocked: false });
    expect(result.decision).toBe('player_history_contract_v0_implementation_blocked_requires_followup');
    expect(result.rationale).toMatch(/source_dataset_refs could not be locked/);
  });

  it('emits the blocked decision when the committed mirrors did not verify against the locked source identity', () => {
    const result = decideContractV0Replay({ ...readyInputs, mirrorSourceVerified: false });
    expect(result.decision).toBe('player_history_contract_v0_implementation_blocked_requires_followup');
    expect(result.rationale).toMatch(/committed promoted mirrors did not verify/);
  });

  it('emits the blocked decision when schema validation failed', () => {
    const result = decideContractV0Replay({ ...readyInputs, schemaValidationPassed: false });
    expect(result.decision).toBe('player_history_contract_v0_implementation_blocked_requires_followup');
    expect(result.rationale).toMatch(/structural schema validation/);
  });

  it('emits the blocked decision when the replay smoke metrics diverged from #122', () => {
    const result = decideContractV0Replay({ ...readyInputs, smokeMetricsMatch: false });
    expect(result.decision).toBe('player_history_contract_v0_implementation_blocked_requires_followup');
    expect(result.rationale).toMatch(/replay smoke metrics diverged/);
  });

  it('emits the blocked decision when run_id did not recompute deterministically', () => {
    const result = decideContractV0Replay({ ...readyInputs, runIdDeterministic: false });
    expect(result.decision).toBe('player_history_contract_v0_implementation_blocked_requires_followup');
    expect(result.rationale).toMatch(/run_id did not recompute deterministically/);
  });

  it('never emits a decision that authorizes production wiring', () => {
    const decisions = [
      decideContractV0Replay(readyInputs).decision,
      decideContractV0Replay({ sourceIdentityLocked: false, mirrorSourceVerified: false, schemaValidationPassed: false, smokeMetricsMatch: false, runIdDeterministic: false }).decision,
    ];
    for (const decision of decisions) {
      expect(decision).not.toMatch(/production_bound|wiring|bind|promote/);
    }
  });
});
