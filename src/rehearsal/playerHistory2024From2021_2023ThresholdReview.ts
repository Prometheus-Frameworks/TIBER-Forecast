/**
 * 2024-from-2021-2023 player-history threshold review (Forecast #139).
 *
 * Reviews the #137/PR #138 additional-validation metrics (squash-merged to main as `86f5097`) against
 * the existing player-history acceptance framework proposed in PR #132
 * (`docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json`) and the
 * prior 2025-from-2022-2024 promoted-source validation evidence (#121/#122). This is a REVIEW/DECISION
 * module: it reads already-committed evidence and applies the pre-registered quantitative threshold
 * components -- it does NOT rerun any validation, does NOT amend any threshold, and does NOT bind
 * anything into production Forecast.
 *
 * PR #132 deferred threshold acceptance pending "an additional season of validation" (per PR #124
 * section 5 prerequisite 7), because the only evidence at the time was one target season (2025)
 * observed under two source-governance regimes that produced an IDENTICAL result -- not two
 * independent seasons. #137 supplies exactly that: a second, independent target season (2024) with a
 * disjoint input window (2021-2023 vs 2022-2024) using the SAME real-vs-baseline-vs-shuffled framing
 * and the SAME full-feature-set design the PR #132 thresholds were calibrated against.
 *
 * Per the #134 per-origin aggregation rule (no averaging), every quantitative threshold component must
 * pass INDEPENDENTLY for both origins; one strong origin may never mask a weak one.
 *
 * Decision semantics (exactly one is emitted, per the #139 issue's required enum). This is a REVIEW
 * decision, not a threshold amendment and not a production-binding decision:
 * - `may_open_player_history_production_binding_review_issue`: the framework/evidence identity checks
 *   pass (confirms this review is citing the right, unmodified documents and that #137 itself never
 *   decided a threshold or bound production), and every quantitative threshold component passes for
 *   BOTH the prior (2025) and new (2024) origins independently. A SEPARATE issue may be opened to
 *   consider production-binding prerequisites (including the qualitative governance conditions PR
 *   #132 explicitly deferred to that stage: the production-path leakage audit and human sign-off).
 *   This decision does not itself bind production, claim production readiness, or make a product claim.
 * - `player_history_2024_from_2021_2023_threshold_review_requires_followup`: identity/boundary checks
 *   pass, but at least one quantitative threshold component fails for either origin.
 * - `player_history_2024_from_2021_2023_threshold_review_blocked`: the review input is malformed, OR
 *   the cited framework/evidence documents are not the expected ones (decision/status mismatch), OR
 *   #137 itself did not carry the required ceiling decision or boundary statements. The review cannot
 *   proceed on evidence that isn't what it claims to be.
 *
 * Pure module: no I/O. The CLI script (`scripts/runPlayerHistory2024From2021_2023ThresholdReview.ts`)
 * reads the committed #132 framework, the committed #121/#122 promoted-rerun report, and the committed
 * #137 additional-validation report, and passes everything in.
 */

export const PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_VERSION =
  'player-history-2024-from-2021-2023-threshold-review-v1' as const;

export const PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_ISSUE = 'TIBER-Forecast#139' as const;

/** The exact #132 threshold-proposal document this review must be citing (fails closed on drift). */
export const EXPECTED_THRESHOLD_FRAMEWORK_STATUS =
  'threshold_proposal_only_no_production_binding_no_leakage_audit_no_feature_wiring' as const;
export const EXPECTED_THRESHOLD_FRAMEWORK_DECISION = 'player_history_threshold_proposed_requires_additional_validation' as const;

/** The exact prior-origin (#121/#122, 2025-from-2022-2024) evidence this review must be citing. */
export const EXPECTED_PRIOR_ORIGIN_DECISION = 'promoted_player_history_signal_replicated_requires_followup' as const;

/** The exact #137 ceiling decision required to open this review at all. */
export const EXPECTED_NEW_ORIGIN_DECISION = 'may_open_player_history_2024_from_2021_2023_threshold_review_issue' as const;

/**
 * The five quantitative threshold components from PR #132's `quantitative_threshold_components`,
 * evaluated per-origin (no averaging, per the #134 aggregation rule). The sixth component
 * (`production_only_vs_full_feature_set_added_value_bar`) is a one-time feature-composition decision
 * established via #116 on the 2025 origin -- not re-evaluated per additional-validation origin, since
 * both #121/#122 and #137 evaluate the same full-feature-set arm the bar was calibrated against.
 */
export const MIN_RELATIVE_MAE_IMPROVEMENT_OVER_BASELINE = 0.25;
export const MIN_RELATIVE_MAE_IMPROVEMENT_OVER_SHUFFLED = 0.25;
export const MAX_ABSOLUTE_JOINED_MAE = 48.0;
export const MAX_ABSOLUTE_JOINED_RMSE = 68.0;
export const MIN_RELATIVE_RMSE_IMPROVEMENT_OVER_SHUFFLED = 0.2;
/** Soft ceiling (reporting requirement, not a hard reject at or below it) from PR #132. */
export const NO_HISTORY_SHARE_SOFT_CEILING = 0.35;

/**
 * The only decisions this review may emit (per the #139 issue). Deliberately NO value contains
 * threshold-amend or production-binding semantics: even the strongest value only permits OPENING a
 * separate later production-binding review issue.
 */
export const PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS = [
  'may_open_player_history_production_binding_review_issue',
  'player_history_2024_from_2021_2023_threshold_review_blocked',
  'player_history_2024_from_2021_2023_threshold_review_requires_followup',
] as const;
export type PlayerHistory2024From2021_2023ThresholdReviewDecision =
  (typeof PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Inputs.
// ---------------------------------------------------------------------------------------------

export interface JoinedPopulationArmMetrics {
  baseline_only: number;
  real_player_history_features: number;
  shuffled_player_history_control: number;
}

export interface JoinedPopulationOriginEvidence {
  origin_label: string;
  decision: string;
  joined_mae: JoinedPopulationArmMetrics;
  joined_rmse: JoinedPopulationArmMetrics;
  population: { evaluated_rows: number; joined_rows: number; no_history_rows: number };
}

export interface NewOriginEvidence extends JoinedPopulationOriginEvidence {
  boundary_statements: Record<string, boolean>;
  preconditions_integrity_passed: boolean;
  preconditions_floors_passed: boolean;
}

export interface ThresholdFrameworkEvidence {
  status: string;
  decision: string;
}

export interface ThresholdReviewInput {
  framework: ThresholdFrameworkEvidence;
  /** #121/#122 promoted-source rerun: 2025-from-2022-2024. */
  priorOrigin: JoinedPopulationOriginEvidence;
  /** #137/#138 additional validation: 2024-from-2021-2023. */
  newOrigin: NewOriginEvidence;
}

// ---------------------------------------------------------------------------------------------
// Component evaluation.
// ---------------------------------------------------------------------------------------------

export interface ThresholdReviewCheck {
  dimension: string;
  origin: string;
  expected: string;
  observed: string;
  passed: boolean;
}

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

const evaluateComponentsForOrigin = (origin: JoinedPopulationOriginEvidence): ThresholdReviewCheck[] => {
  const { joined_mae: mae, joined_rmse: rmse, population } = origin;
  const relBaseline = (mae.baseline_only - mae.real_player_history_features) / mae.baseline_only;
  const relShuffledMae = (mae.shuffled_player_history_control - mae.real_player_history_features) / mae.shuffled_player_history_control;
  const relShuffledRmse = (rmse.shuffled_player_history_control - rmse.real_player_history_features) / rmse.shuffled_player_history_control;
  const noHistoryShare = population.evaluated_rows > 0 ? population.no_history_rows / population.evaluated_rows : null;

  return [
    {
      dimension: 'relative_mae_improvement_over_baseline',
      origin: origin.origin_label,
      expected: `>= ${pct(MIN_RELATIVE_MAE_IMPROVEMENT_OVER_BASELINE)}`,
      observed: pct(relBaseline),
      passed: relBaseline >= MIN_RELATIVE_MAE_IMPROVEMENT_OVER_BASELINE,
    },
    {
      dimension: 'relative_mae_improvement_over_shuffled_control',
      origin: origin.origin_label,
      expected: `>= ${pct(MIN_RELATIVE_MAE_IMPROVEMENT_OVER_SHUFFLED)}`,
      observed: pct(relShuffledMae),
      passed: relShuffledMae >= MIN_RELATIVE_MAE_IMPROVEMENT_OVER_SHUFFLED,
    },
    {
      dimension: 'absolute_joined_mae_ceiling',
      origin: origin.origin_label,
      expected: `<= ${MAX_ABSOLUTE_JOINED_MAE.toFixed(1)}`,
      observed: mae.real_player_history_features.toFixed(4),
      passed: mae.real_player_history_features <= MAX_ABSOLUTE_JOINED_MAE,
    },
    {
      dimension: 'absolute_joined_rmse_ceiling',
      origin: origin.origin_label,
      expected: `<= ${MAX_ABSOLUTE_JOINED_RMSE.toFixed(1)}`,
      observed: rmse.real_player_history_features.toFixed(4),
      passed: rmse.real_player_history_features <= MAX_ABSOLUTE_JOINED_RMSE,
    },
    {
      dimension: 'relative_rmse_improvement_over_shuffled_control',
      origin: origin.origin_label,
      expected: `>= ${pct(MIN_RELATIVE_RMSE_IMPROVEMENT_OVER_SHUFFLED)}`,
      observed: pct(relShuffledRmse),
      passed: relShuffledRmse >= MIN_RELATIVE_RMSE_IMPROVEMENT_OVER_SHUFFLED,
    },
    {
      dimension: 'no_history_subgroup_reporting_ceiling',
      origin: origin.origin_label,
      expected: `reported, soft ceiling <= ${pct(NO_HISTORY_SHARE_SOFT_CEILING)}`,
      observed: noHistoryShare === null ? 'undefined (no evaluated rows)' : `${pct(noHistoryShare)} (${population.no_history_rows}/${population.evaluated_rows})`,
      passed: noHistoryShare !== null && noHistoryShare <= NO_HISTORY_SHARE_SOFT_CEILING,
    },
  ];
};

// ---------------------------------------------------------------------------------------------
// Full review.
// ---------------------------------------------------------------------------------------------

export interface ThresholdReviewResult {
  version: typeof PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_VERSION;
  issue: typeof PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_ISSUE;
  decision: PlayerHistory2024From2021_2023ThresholdReviewDecision;
  identity_checks: ThresholdReviewCheck[];
  identity_passed: boolean;
  component_checks: ThresholdReviewCheck[];
  components_passed_both_origins: boolean;
  per_origin_summary: Array<{ origin_label: string; all_components_passed: boolean }>;
  decision_rationale: string;
  boundary_statements: {
    review_only_no_validation_rerun: true;
    no_threshold_amended: true;
    no_production_binding_authorized: true;
    no_production_readiness_claim: true;
    no_leakage_audit_run: true;
    no_product_facing_claim: true;
    no_tiber_data_change: true;
    positive_decision_authorizes_only_a_separate_production_binding_review_issue: true;
  };
}

const BOUNDARY_STATEMENTS: ThresholdReviewResult['boundary_statements'] = {
  review_only_no_validation_rerun: true,
  no_threshold_amended: true,
  no_production_binding_authorized: true,
  no_production_readiness_claim: true,
  no_leakage_audit_run: true,
  no_product_facing_claim: true,
  no_tiber_data_change: true,
  positive_decision_authorizes_only_a_separate_production_binding_review_issue: true,
};

/**
 * Review the #137 additional-validation evidence against the PR #132 acceptance framework and the
 * prior #121/#122 promoted-source evidence. Pure (no I/O), fail-closed on identity/boundary drift.
 */
export const evaluatePlayerHistory2024From2021_2023ThresholdReview = (input: ThresholdReviewInput): ThresholdReviewResult => {
  const identityChecks: ThresholdReviewCheck[] = [];
  const identityCheck = (dimension: string, origin: string, expected: string, observed: string, passed: boolean): void => {
    identityChecks.push({ dimension, origin, expected, observed, passed });
  };

  identityCheck(
    'framework_is_expected_deferred_threshold_proposal',
    'framework',
    `status ${EXPECTED_THRESHOLD_FRAMEWORK_STATUS}, decision ${EXPECTED_THRESHOLD_FRAMEWORK_DECISION}`,
    `status=${input.framework.status}, decision=${input.framework.decision}`,
    input.framework.status === EXPECTED_THRESHOLD_FRAMEWORK_STATUS && input.framework.decision === EXPECTED_THRESHOLD_FRAMEWORK_DECISION,
  );
  identityCheck(
    'prior_origin_is_expected_replicated_evidence',
    input.priorOrigin.origin_label,
    `decision ${EXPECTED_PRIOR_ORIGIN_DECISION}`,
    `decision=${input.priorOrigin.decision}`,
    input.priorOrigin.decision === EXPECTED_PRIOR_ORIGIN_DECISION,
  );
  identityCheck(
    'new_origin_carries_required_ceiling_decision',
    input.newOrigin.origin_label,
    `decision ${EXPECTED_NEW_ORIGIN_DECISION}`,
    `decision=${input.newOrigin.decision}`,
    input.newOrigin.decision === EXPECTED_NEW_ORIGIN_DECISION,
  );
  identityCheck(
    'new_origin_preconditions_passed',
    input.newOrigin.origin_label,
    'integrity_passed=true, floors_passed=true',
    `integrity_passed=${input.newOrigin.preconditions_integrity_passed}, floors_passed=${input.newOrigin.preconditions_floors_passed}`,
    input.newOrigin.preconditions_integrity_passed === true && input.newOrigin.preconditions_floors_passed === true,
  );
  const boundaryEntries = Object.entries(input.newOrigin.boundary_statements ?? {});
  const boundaryFailures = boundaryEntries.filter(([, value]) => value !== true);
  identityCheck(
    'new_origin_confirms_no_threshold_decision_and_no_production_binding',
    input.newOrigin.origin_label,
    'every #137 boundary_statement is true (including no_threshold_accepted_rejected_or_amended, no_production_binding_authorized)',
    boundaryEntries.length === 0 ? 'no boundary_statements present' : `${boundaryFailures.length} non-true of ${boundaryEntries.length}`,
    boundaryEntries.length > 0 && boundaryFailures.length === 0,
  );

  const identityPassed = identityChecks.every((c) => c.passed);

  const componentChecks = identityPassed ? [...evaluateComponentsForOrigin(input.priorOrigin), ...evaluateComponentsForOrigin(input.newOrigin)] : [];
  const perOriginSummary = identityPassed
    ? [input.priorOrigin, input.newOrigin].map((origin) => ({
        origin_label: origin.origin_label,
        all_components_passed: componentChecks.filter((c) => c.origin === origin.origin_label).every((c) => c.passed),
      }))
    : [];
  const componentsPassedBothOrigins = identityPassed && perOriginSummary.every((s) => s.all_components_passed);

  let decision: PlayerHistory2024From2021_2023ThresholdReviewDecision;
  let rationale: string;
  if (!identityPassed) {
    decision = 'player_history_2024_from_2021_2023_threshold_review_blocked';
    rationale =
      'The framework/evidence documents this review must cite are not the expected ones, or #137 did not carry the required ceiling decision and boundary statements. The review cannot proceed on evidence that is not what it claims to be.';
  } else if (!componentsPassedBothOrigins) {
    const failing = componentChecks.filter((c) => !c.passed).map((c) => `${c.origin}/${c.dimension}`);
    decision = 'player_history_2024_from_2021_2023_threshold_review_requires_followup';
    rationale = `At least one PR #132 quantitative threshold component failed for an origin (no averaging across origins, per the #134 aggregation rule): ${failing.join(', ')}. A production-binding review issue may not be opened until this is resolved or explicitly re-scoped.`;
  } else {
    decision = 'may_open_player_history_production_binding_review_issue';
    rationale =
      'Every PR #132 quantitative threshold component passes independently for both the prior (2025-from-2022-2024, #121/#122) and new (2024-from-2021-2023, #137) origins, satisfying the additional-season-of-validation bar PR #132 deferred on. #137 itself never decided a threshold or bound production. A SEPARATE issue may be opened to consider production-binding prerequisites, including the qualitative governance conditions (production-path leakage audit, human sign-off) PR #132 explicitly deferred to that stage. This decision does not itself bind production, claim production readiness, or make a product claim.';
  }

  return {
    version: PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_VERSION,
    issue: PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_ISSUE,
    decision,
    identity_checks: identityChecks,
    identity_passed: identityPassed,
    component_checks: componentChecks,
    components_passed_both_origins: componentsPassedBothOrigins,
    per_origin_summary: perOriginSummary,
    decision_rationale: rationale,
    boundary_statements: BOUNDARY_STATEMENTS,
  };
};
