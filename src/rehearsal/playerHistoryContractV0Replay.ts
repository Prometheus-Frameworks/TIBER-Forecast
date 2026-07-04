/**
 * Deterministic replay/validation for the `player_history_production_feature_v0` non-production
 * contract (Forecast #129), per the requirements PR #128 §2.6 specified (and did not implement).
 *
 * This module builds a NON-PRODUCTION, production-only-scoped (PR #128 §2.2) contract instance from
 * the already-governed promoted mirrors (#119/#120), locks `source_dataset_refs` only when the
 * caller supplies a passing re-verification of the #117 promoted-source gate, and provides the
 * pinned #122 joined-population smoke-metric comparison required to prove the implementation's data
 * plumbing has not diverged from the validated experimental design.
 *
 * This module does not run a production model, does not import `seasonalPprModel.ts`, and confers no
 * production-readiness. The smoke-metric replay reuses the existing, already-tested
 * `executePromotedControlledRerun` (full five-family design, #121) verbatim -- it is a plumbing check
 * against the committed #122 numbers, not a re-scoping of the contract itself, which stays
 * production-only per PR #128 §2.2.
 *
 * Pure module: no I/O. The CLI script (`scripts/runPlayerHistoryContractV0Replay.ts`) performs I/O
 * (reading local TIBER-Data artifact/manifest copies and the committed promoted mirrors/reports).
 */

import {
  ACCEPTED_CONTRACT_VERSION,
  ACCEPTED_FEATURE_FAMILY_SCOPE,
  ACCEPTED_INPUT_WINDOW_SEASON_COUNT,
  ACCEPTED_SEASON_TYPE,
  CURRENT_PROVENANCE_STATE,
  CURRENT_VALIDATION_STATUS,
  FEATURE_AVAILABILITY_REQUIRES,
  NON_ADVICE_NON_RANKING_STATEMENT,
  NULL_NO_HISTORY_RULE,
  NULL_UNAVAILABLE_USAGE_RULE,
  PLAYER_HISTORY_CONTRACT_ID,
  PLAYER_IDENTITY_JOIN_KEY_NAMES,
  TEMPORAL_CUTOFF_EXCLUDED,
  TEMPORAL_CUTOFF_RULE,
  composeRunId,
  type MissingHistorySubgroupReport,
  type PlayerHistoryFeatureContractV0Instance,
  type PlayerHistoryFeatureContractV0Row,
  type ProductionOnlyFeatureBlock,
  type SourceDatasetRefs,
} from './playerHistoryFeatureContractV0.js';
import { buildPlayerHistoryFeatures, type PlayerHistoryInputRow, type PlayerHistoryProductionFeatures } from './playerHistoryFeatureScaffold.js';
import type { PromotedInputMirror, PromotedOutcomeMirror } from './playerHistoryPromotedMirrorRefresh.js';
import {
  PROMOTED_ARTIFACT_PATH,
  PROMOTED_ARTIFACT_REPO,
  EXPECTED_PROMOTION_REVIEW,
  PINNED_PROMOTED_ARTIFACT_SHA256,
  type PromotedSourceGateResult,
} from './playerHistoryPromotedSourceGate.js';
import type { ControlledRunArm, ControlledRunMetrics } from './playerHistoryControlledRun.js';

export const PLAYER_HISTORY_CONTRACT_V0_REPLAY_VERSION = 'player-history-contract-v0-replay-v1' as const;
export const CONTRACT_V0_REPLAY_ISSUE = 'TIBER-Forecast#129' as const;
export const CONTRACT_V0_GENERATOR_SCRIPT_VERSION = 'player-history-contract-v0-replay-v1' as const;

/** N=3 prior seasons for a 2025 target, per PR #128 §2.3's default and the #112/#122 experiments. */
export const CONTRACT_V0_TARGET_SEASON = 2025 as const;
export const CONTRACT_V0_INPUT_SEASONS = [2022, 2023, 2024] as const;

// ---------------------------------------------------------------------------------------------
// Step 1: fail-closed source-identity lock. Only locks when the caller's re-verification of the
// #117 promoted-source gate (against LOCAL bytes, never a stale committed report alone) passed with
// the exact ceiling decision and the actual re-hashed bytes match the Forecast pin.
// ---------------------------------------------------------------------------------------------

export type SourceIdentityLockResult =
  | { locked: true; source_dataset_refs: SourceDatasetRefs }
  | { locked: false; reason: string };

/**
 * PR #128 §2.1: "The implementation issue must re-verify this identity is still current ... before
 * locking any source_dataset_refs value into a contract instance. ... If the implementation cannot
 * re-verify the source identity, do not lock it. Fail closed and document why."
 */
export const lockSourceDatasetRefsOrFailClosed = (
  gateResult: PromotedSourceGateResult,
  actualArtifactSha256: string,
): SourceIdentityLockResult => {
  if (gateResult.status !== 'passed') {
    return { locked: false, reason: `#117 promoted-source gate re-verification status is "${gateResult.status}", expected "passed"; refusing to lock source_dataset_refs.` };
  }
  if (gateResult.decision !== 'may_open_promoted_mirror_refresh_issue') {
    return {
      locked: false,
      reason: `#117 promoted-source gate re-verification decision is "${gateResult.decision}", expected "may_open_promoted_mirror_refresh_issue"; refusing to lock source_dataset_refs.`,
    };
  }
  if (actualArtifactSha256 !== PINNED_PROMOTED_ARTIFACT_SHA256) {
    return {
      locked: false,
      reason: `actual local promoted artifact sha256 (${actualArtifactSha256}) does not match the Forecast pin (${PINNED_PROMOTED_ARTIFACT_SHA256}); refusing to lock source_dataset_refs.`,
    };
  }
  return {
    locked: true,
    source_dataset_refs: {
      repo: PROMOTED_ARTIFACT_REPO,
      artifact_path: PROMOTED_ARTIFACT_PATH,
      artifact_sha256: actualArtifactSha256,
      promotion_review: EXPECTED_PROMOTION_REVIEW,
    },
  };
};

// ---------------------------------------------------------------------------------------------
// Step 2: build the production-only contract rows from the already-governed promoted mirrors.
// ---------------------------------------------------------------------------------------------

const productionOnlyBlockFrom = (production: PlayerHistoryProductionFeatures): ProductionOnlyFeatureBlock => ({
  trailing_2yr_ppr_total: production.trailing_2yr_ppr_total,
  trailing_3yr_ppr_total: production.trailing_3yr_ppr_total,
  trailing_2yr_ppr_mean: production.trailing_2yr_ppr_mean,
  trailing_3yr_ppr_mean: production.trailing_3yr_ppr_mean,
  year_over_year_ppr_trend: production.year_over_year_ppr_trend,
});

/**
 * Build one contract row per target-population player (the promoted-outcome-mirror population),
 * carrying ONLY the production-only feature family (PR #128 §2.2 v0 default scope) computed from the
 * promoted input mirror. Never embeds the target-season outcome value itself -- this is a feature
 * contract, not an outcome mirror. Reuses `buildPlayerHistoryFeatures`, which structurally enforces
 * `season < targetSeason` and fails closed (throws) on any forbidden availability field.
 */
export const buildProductionOnlyContractRows = (
  outcomeMirror: PromotedOutcomeMirror,
  inputMirrorRows: readonly PlayerHistoryInputRow[],
): PlayerHistoryFeatureContractV0Row[] => {
  const featureRows = buildPlayerHistoryFeatures(inputMirrorRows, {
    targetSeason: outcomeMirror.target_season,
    inputSeasons: CONTRACT_V0_INPUT_SEASONS,
    families: ['production'],
  });
  const featuresByPlayer = new Map(featureRows.map((row) => [row.player_id, row]));

  const rows: PlayerHistoryFeatureContractV0Row[] = [];
  for (const target of [...outcomeMirror.rows].sort((a, b) => (a.player_id < b.player_id ? -1 : 1))) {
    const features = featuresByPlayer.get(target.player_id);
    const matched = features !== undefined && features.position === target.position && features.production !== undefined;
    rows.push({
      player_identity_join_keys: {
        player_id: target.player_id,
        season: outcomeMirror.target_season,
        season_type: ACCEPTED_SEASON_TYPE,
        position: target.position as PlayerHistoryFeatureContractV0Row['player_identity_join_keys']['position'],
      },
      has_prior_history: matched,
      production: matched ? productionOnlyBlockFrom(features!.production!) : null,
    });
  }
  return rows;
};

/** PR #128 §2.7: no-history subgroup count/share/by-position, required in any replay/validation output. */
export const computeMissingHistorySubgroupReport = (
  rows: readonly PlayerHistoryFeatureContractV0Row[],
): MissingHistorySubgroupReport => {
  const total = rows.length;
  const noHistoryRows = rows.filter((row) => !row.has_prior_history);
  const count = noHistoryRows.length;
  const byPosition: Record<string, number> = {};
  for (const row of noHistoryRows) {
    byPosition[row.player_identity_join_keys.position] = (byPosition[row.player_identity_join_keys.position] ?? 0) + 1;
  }
  return {
    count,
    total,
    share: total > 0 ? count / total : 0,
    by_position: Object.fromEntries(Object.entries(byPosition).sort(([a], [b]) => (a < b ? -1 : 1))),
    every_no_history_row_entirely_null: noHistoryRows.every((row) => row.production === null),
  };
};

/**
 * Assemble the full non-production contract instance. Pure given its inputs; the caller supplies
 * `generatedAt` so a replay run can be deterministically re-verified (recomputing with the same
 * `generatedAt` must reproduce the same `run_id`).
 */
export const buildPlayerHistoryFeatureContractV0Instance = (
  sourceDatasetRefs: SourceDatasetRefs,
  outcomeMirror: PromotedOutcomeMirror,
  inputMirrorRows: readonly PlayerHistoryInputRow[],
  generatedAt: string,
): PlayerHistoryFeatureContractV0Instance => {
  const rows = buildProductionOnlyContractRows(outcomeMirror, inputMirrorRows);
  const missingHistoryReport = computeMissingHistorySubgroupReport(rows);
  const runId = composeRunId(sourceDatasetRefs, ACCEPTED_CONTRACT_VERSION, CONTRACT_V0_GENERATOR_SCRIPT_VERSION, generatedAt);
  return {
    kind: 'player_history_production_feature_v0_experimental_instance',
    not_production_bound: true,
    not_consumed_by_seasonal_ppr_model: true,
    not_fantasy_product_output: true,
    envelope: {
      contract_id: PLAYER_HISTORY_CONTRACT_ID,
      contract_version: ACCEPTED_CONTRACT_VERSION,
      source_dataset_refs: sourceDatasetRefs,
      player_identity_join_keys: PLAYER_IDENTITY_JOIN_KEY_NAMES,
      temporal_cutoff_semantics: {
        rule: TEMPORAL_CUTOFF_RULE,
        input_window: `rolling ${ACCEPTED_INPUT_WINDOW_SEASON_COUNT} prior seasons (${CONTRACT_V0_INPUT_SEASONS.join(', ')} for target season ${outcomeMirror.target_season})`,
        excluded: TEMPORAL_CUTOFF_EXCLUDED,
      },
      feature_availability_rules: {
        requires: FEATURE_AVAILABILITY_REQUIRES,
        family_scope: ACCEPTED_FEATURE_FAMILY_SCOPE,
        no_partial_season_substitution: true,
      },
      null_missing_history_rules: {
        no_history_player: NULL_NO_HISTORY_RULE,
        unavailable_usage_fields: NULL_UNAVAILABLE_USAGE_RULE,
      },
      provenance_state: CURRENT_PROVENANCE_STATE,
      generated_at: generatedAt,
      generator_script_version: CONTRACT_V0_GENERATOR_SCRIPT_VERSION,
      run_id: runId,
      validation_status: CURRENT_VALIDATION_STATUS,
      non_advice_non_ranking_statement: NON_ADVICE_NON_RANKING_STATEMENT,
    },
    rows,
    missing_history_subgroup_report: missingHistoryReport,
  };
};

// ---------------------------------------------------------------------------------------------
// Step 3: pinned #122 joined-population smoke metrics (PR #128 §2.6's required reproduction check).
// ---------------------------------------------------------------------------------------------

export const PINNED_122_JOINED_MAE = {
  baseline_only: 68.926,
  real_player_history_features: 40.034,
  shuffled_player_history_control: 72.031,
} as const;

export const PINNED_122_JOINED_RMSE = {
  baseline_only: 88.553,
  real_player_history_features: 57.287,
  shuffled_player_history_control: 90.409,
} as const;

const SMOKE_METRIC_TOLERANCE = 1e-3;

export interface SmokeMetricDiff {
  arm: ControlledRunArm;
  metric: 'mae' | 'rmse';
  pinned: number;
  observed: number | null;
  delta: number | null;
}

export interface SmokeMetricComparison {
  matches: boolean;
  diffs: SmokeMetricDiff[];
}

/**
 * Compare a joined-population metrics-by-arm result (from re-running the existing, already-tested
 * `executePromotedControlledRerun`) against the pinned #122 numbers. A mismatch means the
 * implementation's data plumbing diverged from the validated experimental design and must not
 * proceed (PR #128 §2.6).
 */
export const compareSmokeMetrics = (joined: Record<ControlledRunArm, ControlledRunMetrics>): SmokeMetricComparison => {
  const diffs: SmokeMetricDiff[] = [];
  const arms: readonly ControlledRunArm[] = ['baseline_only', 'real_player_history_features', 'shuffled_player_history_control'];
  for (const arm of arms) {
    const maeObserved = joined[arm].mae;
    const maePinned = PINNED_122_JOINED_MAE[arm];
    if (maeObserved === null || Math.abs(maeObserved - maePinned) > SMOKE_METRIC_TOLERANCE) {
      diffs.push({ arm, metric: 'mae', pinned: maePinned, observed: maeObserved, delta: maeObserved === null ? null : maeObserved - maePinned });
    }
    const rmseObserved = joined[arm].rmse;
    const rmsePinned = PINNED_122_JOINED_RMSE[arm];
    if (rmseObserved === null || Math.abs(rmseObserved - rmsePinned) > SMOKE_METRIC_TOLERANCE) {
      diffs.push({ arm, metric: 'rmse', pinned: rmsePinned, observed: rmseObserved, delta: rmseObserved === null ? null : rmseObserved - rmsePinned });
    }
  }
  return { matches: diffs.length === 0, diffs };
};

// ---------------------------------------------------------------------------------------------
// Step 4: final bounded decision (issue #129 §7).
// ---------------------------------------------------------------------------------------------

export const PLAYER_HISTORY_CONTRACT_V0_REPLAY_DECISIONS = [
  'player_history_contract_v0_non_production_implementation_ready_for_review',
  'player_history_contract_v0_implementation_blocked_requires_followup',
] as const;
export type ContractV0ReplayDecision = (typeof PLAYER_HISTORY_CONTRACT_V0_REPLAY_DECISIONS)[number];

export interface ContractV0ReplayDecisionInputs {
  sourceIdentityLocked: boolean;
  schemaValidationPassed: boolean;
  smokeMetricsMatch: boolean;
  runIdDeterministic: boolean;
}

export interface ContractV0ReplayDecisionRationale {
  decision: ContractV0ReplayDecision;
  rationale: string;
}

export const decideContractV0Replay = (inputs: ContractV0ReplayDecisionInputs): ContractV0ReplayDecisionRationale => {
  const blockers: string[] = [];
  if (!inputs.sourceIdentityLocked) blockers.push('source_dataset_refs could not be locked (fail-closed re-verification did not pass)');
  if (!inputs.schemaValidationPassed) blockers.push('generated contract instance failed structural schema validation');
  if (!inputs.smokeMetricsMatch) blockers.push('replay smoke metrics diverged from the pinned #122 joined-population numbers');
  if (!inputs.runIdDeterministic) blockers.push('run_id did not recompute deterministically from the same inputs');
  if (blockers.length === 0) {
    return {
      decision: 'player_history_contract_v0_non_production_implementation_ready_for_review',
      rationale:
        'Source identity was re-verified and locked, the generated non-production contract instance passed structural validation, run_id recomputed deterministically, and the replay reproduced the pinned #122 joined-population smoke metrics exactly. This does not authorize seasonalPprModel.ts wiring, production feature use, or any Fantasy/product consumer change.',
    };
  }
  return {
    decision: 'player_history_contract_v0_implementation_blocked_requires_followup',
    rationale: `Implementation blocked, fail closed: ${blockers.join('; ')}.`,
  };
};
