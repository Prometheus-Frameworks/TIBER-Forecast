/**
 * Player-history production-only binding activation verification (Forecast #145).
 *
 * Issue #143 was implemented and merged via PR #144 (squash commit `61b1237`), emitting
 * `player_history_production_binding_implemented_pending_human_signoff`. Human sign-off was recorded
 * during PR review. This module evaluates whether the MERGED implementation on `main` actually
 * behaves as intended, per the eight verification points required by #145. It does NOT re-review
 * governance prerequisites (that was #141/#142/#143) and does NOT authorize any new feature family or
 * model change -- it is a pure post-merge behavioral check.
 *
 * This module does NOT itself run a CLI, diff files, or scan the repo -- it evaluates evidence the
 * CLI script (`scripts/runPlayerHistoryProductionBindingActivationVerification.ts`) gathers by
 * actually running the seasonal PPR backtest CLI (disabled and enabled, twice each), verifying
 * provenance against the real mirror, exercising the model gate directly, running the full-repo scope
 * scan, and running `npm run build && npm test`.
 *
 * Decision semantics (exactly one is emitted, per the #145 issue's required enum):
 * - `player_history_production_binding_activation_verified`: every one of the eight required checks
 *   passed. Confirms activation readiness for the ALREADY-IMPLEMENTED, ALREADY-SIGNED-OFF
 *   `production_only` binding. It does not authorize any additional feature family, model redesign,
 *   or product-facing change.
 * - `player_history_production_binding_activation_requires_followup`: at least one check failed in a
 *   way that looks like a real regression or gap (e.g. non-determinism, an unapproved feature leaking
 *   in, a scope violation) rather than a fundamental identity mismatch.
 * - `player_history_production_binding_activation_blocked`: the merge this verification depends on is
 *   not what it claims to be (wrong commit, build/test failing outright, or the CLI/model could not
 *   even be exercised).
 */

export const PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_VERSION =
  'player-history-production-binding-activation-verification-v1' as const;
export const PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_ISSUE = 'TIBER-Forecast#145' as const;

export const EXPECTED_MERGE_COMMIT = '61b1237' as const;

export const PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_DECISIONS = [
  'player_history_production_binding_activation_verified',
  'player_history_production_binding_activation_requires_followup',
  'player_history_production_binding_activation_blocked',
] as const;
export type PlayerHistoryProductionBindingActivationDecision = (typeof PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Inputs -- one field per required verification point (#145 "Required verification" 1-8).
// ---------------------------------------------------------------------------------------------

export interface CheckResult {
  id: string;
  description: string;
  passed: boolean;
  evidence: string;
}

export interface ActivationVerificationInput {
  /** The exact commit this verification ran against. */
  mergeCommitVerified: boolean;
  /** 1. Default execution remains byte-identical to pre-binding expectations. */
  defaultBehaviorUnchanged: CheckResult;
  /** 2. --enable-player-history-production-only activates only the approved production_only family. */
  onlyApprovedFeaturesActivated: CheckResult;
  /** 3. Locked upstream artifact SHA and contract remain enforced. */
  provenanceFailClosed: CheckResult;
  /** 4. Missing or invalid player-history stays explicit and fail-closed. */
  missingHistoryExplicit: CheckResult;
  /** 5. Direct model usage cannot bypass the gating contract. */
  modelGateCannotBeBypassed: CheckResult;
  /** 6. Reports disclose enabled/disabled state truthfully. */
  reportDisclosureAccurate: CheckResult;
  /** 7. Deterministic replay produces stable results. */
  deterministicReplayStable: CheckResult;
  /** 8. No unrelated Forecast outputs changed. */
  noUnrelatedOutputsChanged: CheckResult;
  /** Full build + test suite, run for real as part of this verification. */
  buildAndTestPassed: CheckResult;
}

export interface ActivationVerificationResult {
  version: typeof PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_VERSION;
  issue: typeof PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_ISSUE;
  decision: PlayerHistoryProductionBindingActivationDecision;
  checks: CheckResult[];
  checks_passed_count: number;
  checks_total: number;
  all_passed: boolean;
  decision_rationale: string;
  boundary_statements: {
    verification_only_no_feature_expansion: true;
    no_model_redesign: true;
    no_full_feature_set_authorization: true;
    no_fantasy_product_ui_ranking_advice_behavior: true;
    no_tiber_data_change: true;
    no_threshold_change: true;
    positive_decision_confirms_activation_readiness_only: true;
  };
}

const BOUNDARY_STATEMENTS: ActivationVerificationResult['boundary_statements'] = {
  verification_only_no_feature_expansion: true,
  no_model_redesign: true,
  no_full_feature_set_authorization: true,
  no_fantasy_product_ui_ranking_advice_behavior: true,
  no_tiber_data_change: true,
  no_threshold_change: true,
  positive_decision_confirms_activation_readiness_only: true,
};

export const evaluatePlayerHistoryProductionBindingActivationVerification = (
  input: ActivationVerificationInput,
): ActivationVerificationResult => {
  const checks: CheckResult[] = [
    { id: 'merge_commit_verified', description: 'Verification ran against the actual #144 merge commit on main.', passed: input.mergeCommitVerified, evidence: input.mergeCommitVerified ? `Confirmed HEAD descends from ${EXPECTED_MERGE_COMMIT}.` : 'Could not confirm the expected merge commit.' },
    input.defaultBehaviorUnchanged,
    input.onlyApprovedFeaturesActivated,
    input.provenanceFailClosed,
    input.missingHistoryExplicit,
    input.modelGateCannotBeBypassed,
    input.reportDisclosureAccurate,
    input.deterministicReplayStable,
    input.noUnrelatedOutputsChanged,
    input.buildAndTestPassed,
  ];

  const checksPassedCount = checks.filter((c) => c.passed).length;
  const checksTotal = checks.length;
  const allPassed = checksPassedCount === checksTotal;

  const identityCheck = checks[0]!;
  const buildTestCheck = input.buildAndTestPassed;

  let decision: PlayerHistoryProductionBindingActivationDecision;
  let rationale: string;

  if (!identityCheck.passed || !buildTestCheck.passed) {
    decision = 'player_history_production_binding_activation_blocked';
    rationale =
      'Either the expected #144 merge commit could not be confirmed, or the build/test suite failed outright, so no other check in this verification can be trusted. See the merge_commit_verified and buildAndTestPassed checks.';
  } else if (!allPassed) {
    const failing = checks.filter((c) => !c.passed).map((c) => c.id);
    decision = 'player_history_production_binding_activation_requires_followup';
    rationale = `The merge is confirmed and the build/test suite passed, but ${checksTotal - checksPassedCount} verification point(s) did not pass: ${failing.join(', ')}. Activation readiness cannot be confirmed until these are resolved.`;
  } else {
    decision = 'player_history_production_binding_activation_verified';
    rationale =
      `All ${checksTotal} verification points passed against the #144 merge commit: default behavior is unchanged (byte-identical predictions/metrics vs. the pre-#143 commit), the opt-in flag activates only the 7 approved production_only features, the locked artifact sha256/contract fail closed on any mismatch (verified against both the real mirror and synthetically tampered copies), missing/colliding player identities null out explicitly rather than cross-contaminating, direct trainSeasonalRidgeModel usage cannot be influenced by forged or pre-enriched player_history data without the exact matching gate, report disclosure (enabled/sha256) matches the actual run type in every case, two independent enabled runs produced byte-identical output, and a full-repository scope scan found no player-history reference outside the already-authorized file set. ` +
      'This confirms activation readiness for the already-implemented, already-signed-off production_only binding. It does not authorize any additional feature family, model redesign, or product-facing change.';
  }

  return {
    version: PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_VERSION,
    issue: PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_VERIFICATION_ISSUE,
    decision,
    checks,
    checks_passed_count: checksPassedCount,
    checks_total: checksTotal,
    all_passed: allPassed,
    decision_rationale: rationale,
    boundary_statements: BOUNDARY_STATEMENTS,
  };
};
