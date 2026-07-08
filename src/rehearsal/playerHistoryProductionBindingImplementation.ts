/**
 * Player-history production-only binding implementation review (Forecast #143).
 *
 * Issue #141 / PR #142 reviewed production-binding prerequisites and emitted
 * `may_open_player_history_production_binding_implementation_issue`. That decision authorized this
 * separate implementation issue. This module evaluates whether the real code changes made under #143
 * (contract, model, dataset loader, service, and the new
 * `src/datasets/seasonal/playerHistoryProductionOnlySource.ts` binding module) satisfy the issue's
 * acceptance criteria, and emits exactly one decision from the #143 enum.
 *
 * This module does NOT itself wire anything, run a build, or scan files -- it evaluates evidence the
 * CLI script (`scripts/runPlayerHistoryProductionBindingImplementation.ts`) gathers by actually
 * running the provenance check, the scope/leakage audit, and `npm run build && npm test`.
 *
 * Decision semantics (exactly one is emitted, per the #143 issue's required enum):
 * - `player_history_production_binding_implemented_pending_human_signoff`: #142's decision is
 *   confirmed, the mirror provenance check passes against the real locked identity, the scope audit
 *   finds player-history wiring ONLY in the authorized named-consumer files and ZERO references
 *   anywhere else, build and tests both pass, and every mechanically-satisfiable #143 gate is
 *   satisfied. Human sign-off on `seasonalPprModel.ts` is -- by construction -- never satisfied by an
 *   automated review, so this is the ceiling decision this module can ever emit.
 * - `player_history_production_binding_implemented_and_signed_off`: NEVER emitted by this module. A
 *   human sign-off record is not something an automated evaluation can produce or verify from code
 *   alone; reaching this decision requires a human process outside this repository's automation.
 * - `player_history_production_binding_implementation_requires_followup`: #142's decision is
 *   confirmed and provenance passes, but the scope audit found an out-of-scope reference, or build/
 *   test failed, or a mechanically-satisfiable gate is not actually satisfied.
 * - `player_history_production_binding_implementation_blocked`: #142's decision does not match the
 *   expected ceiling, or the mirror provenance check itself fails (the evidence chain is not what
 *   this implementation claims to be).
 */

export const PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_VERSION =
  'player-history-production-binding-implementation-v1' as const;
export const PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_ISSUE = 'TIBER-Forecast#143' as const;

export const EXPECTED_PRIOR_REVIEW_DECISION = 'may_open_player_history_production_binding_implementation_issue' as const;

export const PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_DECISIONS = [
  'player_history_production_binding_implemented_pending_human_signoff',
  'player_history_production_binding_implemented_and_signed_off',
  'player_history_production_binding_implementation_blocked',
  'player_history_production_binding_implementation_requires_followup',
] as const;
export type PlayerHistoryProductionBindingImplementationDecision =
  (typeof PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Inputs.
// ---------------------------------------------------------------------------------------------

export interface PriorReviewEvidence {
  decision: string;
}

export interface ProvenanceCheckEvidence {
  verified: boolean;
  sha256: string;
  mismatches: string[];
}

export interface ScopeAuditFinding {
  path: string;
  expected: 'authorized_to_reference' | 'must_stay_clean';
  observed_has_reference: boolean;
}

export interface ScopeAuditEvidence {
  authorized_consumer_paths: string[];
  still_clean_paths: string[];
  findings: ScopeAuditFinding[];
}

export interface ReplayEvidence {
  build_passed: boolean;
  tests_passed: boolean;
  test_file_count: number;
  test_count: number;
  deterministic_cli_run_confirmed: boolean;
}

export interface PrerequisiteGate {
  id: string;
  description: string;
  satisfied: boolean;
  evidence: string;
}

export interface ProductionBindingImplementationInput {
  priorReview: PriorReviewEvidence;
  provenanceCheck: ProvenanceCheckEvidence;
  scopeAudit: ScopeAuditEvidence;
  replayEvidence: ReplayEvidence;
  prerequisiteGates: PrerequisiteGate[];
}

// ---------------------------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------------------------

export interface ReviewCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

const evaluateIdentity = (priorReview: PriorReviewEvidence, provenanceCheck: ProvenanceCheckEvidence): ReviewCheck[] => [
  {
    dimension: 'prior_review_decision_is_expected_ceiling',
    expected: `decision ${EXPECTED_PRIOR_REVIEW_DECISION}`,
    observed: `decision=${priorReview.decision}`,
    passed: priorReview.decision === EXPECTED_PRIOR_REVIEW_DECISION,
  },
  {
    dimension: 'mirror_provenance_verified_against_locked_identity',
    expected: 'verified=true, mismatches=[]',
    observed: `verified=${provenanceCheck.verified}, mismatches=${JSON.stringify(provenanceCheck.mismatches)}`,
    passed: provenanceCheck.verified && provenanceCheck.mismatches.length === 0,
  },
];

const evaluateScope = (scopeAudit: ScopeAuditEvidence): ReviewCheck[] => {
  const violations = scopeAudit.findings.filter((f) =>
    f.expected === 'authorized_to_reference' ? !f.observed_has_reference : f.observed_has_reference,
  );
  return [
    {
      dimension: 'scope_audit_covers_a_non_empty_file_set',
      expected: 'authorized_consumer_paths and still_clean_paths are both non-empty',
      observed: `authorized=${scopeAudit.authorized_consumer_paths.length}, still_clean=${scopeAudit.still_clean_paths.length}`,
      passed: scopeAudit.authorized_consumer_paths.length > 0 && scopeAudit.still_clean_paths.length > 0,
    },
    {
      dimension: 'wiring_is_confined_to_the_authorized_consumer_scope',
      expected: '0 scope violations (every authorized path references player-history; every still-clean path does not)',
      observed: `${violations.length} violation(s): ${violations.map((v) => v.path).join(', ') || 'none'}`,
      passed: violations.length === 0,
    },
  ];
};

const evaluateReplay = (replay: ReplayEvidence): ReviewCheck[] => [
  {
    dimension: 'build_and_tests_pass',
    expected: 'build_passed=true, tests_passed=true',
    observed: `build_passed=${replay.build_passed}, tests_passed=${replay.tests_passed} (${replay.test_file_count} files, ${replay.test_count} tests)`,
    passed: replay.build_passed && replay.tests_passed,
  },
  {
    dimension: 'deterministic_cli_run_confirmed',
    expected: 'deterministic_cli_run_confirmed=true',
    observed: `deterministic_cli_run_confirmed=${replay.deterministic_cli_run_confirmed}`,
    passed: replay.deterministic_cli_run_confirmed,
  },
];

export interface ProductionBindingImplementationResult {
  version: typeof PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_VERSION;
  issue: typeof PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_ISSUE;
  decision: PlayerHistoryProductionBindingImplementationDecision;
  identity_checks: ReviewCheck[];
  identity_passed: boolean;
  scope_checks: ReviewCheck[];
  scope_passed: boolean;
  replay_checks: ReviewCheck[];
  replay_passed: boolean;
  prerequisite_gates: PrerequisiteGate[];
  prerequisites_satisfied_count: number;
  prerequisites_total: number;
  all_mechanical_prerequisites_satisfied: boolean;
  decision_rationale: string;
  boundary_statements: {
    production_only_scope_only: true;
    no_full_feature_set_wiring: true;
    no_fantasy_product_ui_ranking_advice_behavior: true;
    no_tiber_data_change: true;
    no_threshold_amendment: true;
    no_production_readiness_claim_without_all_gates_and_signoff: true;
    human_signoff_not_recorded_by_this_automated_review: true;
  };
}

const BOUNDARY_STATEMENTS: ProductionBindingImplementationResult['boundary_statements'] = {
  production_only_scope_only: true,
  no_full_feature_set_wiring: true,
  no_fantasy_product_ui_ranking_advice_behavior: true,
  no_tiber_data_change: true,
  no_threshold_amendment: true,
  no_production_readiness_claim_without_all_gates_and_signoff: true,
  human_signoff_not_recorded_by_this_automated_review: true,
};

export const evaluatePlayerHistoryProductionBindingImplementation = (
  input: ProductionBindingImplementationInput,
): ProductionBindingImplementationResult => {
  const identityChecks = evaluateIdentity(input.priorReview, input.provenanceCheck);
  const identityPassed = identityChecks.every((c) => c.passed);

  const scopeChecks = evaluateScope(input.scopeAudit);
  const scopePassed = scopeChecks.every((c) => c.passed);

  const replayChecks = evaluateReplay(input.replayEvidence);
  const replayPassed = replayChecks.every((c) => c.passed);

  const prerequisitesSatisfiedCount = input.prerequisiteGates.filter((g) => g.satisfied).length;
  const prerequisitesTotal = input.prerequisiteGates.length;
  // "Mechanical" prerequisites exclude human sign-off, which can never be true from an automated
  // evaluation -- it is tracked separately and explicitly excluded from this aggregate so it can
  // never accidentally read as satisfied.
  const mechanicalGates = input.prerequisiteGates.filter((g) => g.id !== 'human_signoff_on_seasonal_ppr_model_change');
  const allMechanicalSatisfied = mechanicalGates.length > 0 && mechanicalGates.every((g) => g.satisfied);
  const humanSignoffGate = input.prerequisiteGates.find((g) => g.id === 'human_signoff_on_seasonal_ppr_model_change');

  let decision: PlayerHistoryProductionBindingImplementationDecision;
  let rationale: string;

  if (!identityPassed) {
    decision = 'player_history_production_binding_implementation_blocked';
    rationale =
      'Either #142 did not carry the required ceiling decision, or the mirror provenance check against the locked TIBER-Data artifact identity failed. The evidence chain this implementation depends on is not what it claims to be.';
  } else if (!scopePassed || !replayPassed || !allMechanicalSatisfied) {
    decision = 'player_history_production_binding_implementation_requires_followup';
    const failing = [...scopeChecks, ...replayChecks].filter((c) => !c.passed).map((c) => c.dimension);
    const unsatisfiedGates = mechanicalGates.filter((g) => !g.satisfied).map((g) => g.id);
    rationale = `Identity and provenance checks passed, but at least one implementation check did not: ${[...failing, ...unsatisfiedGates].join(', ') || 'unspecified'}. The binding is not yet ready to be reported as implemented.`;
  } else {
    decision = 'player_history_production_binding_implemented_pending_human_signoff';
    rationale =
      `#142's decision and the locked mirror provenance are confirmed. The scope audit found player-history wiring confined to exactly the authorized named-consumer files (${input.scopeAudit.authorized_consumer_paths.length} file(s)) with zero references anywhere else (${input.scopeAudit.still_clean_paths.length} file(s) checked). Build and tests pass (${input.replayEvidence.test_file_count} files, ${input.replayEvidence.test_count} tests), and the CLI binding was confirmed deterministic. ` +
      `Every mechanically-satisfiable #143 prerequisite gate is satisfied (${prerequisitesSatisfiedCount}/${prerequisitesTotal} overall). ` +
      `The one gate that can never be satisfied by this automated review -- ${humanSignoffGate?.id ?? 'human_signoff_on_seasonal_ppr_model_change'} -- remains explicitly open: ${humanSignoffGate?.evidence ?? 'no human sign-off has been recorded.'} ` +
      'This binding is implemented and inert-by-default (a caller must explicitly opt in); it must not be treated as production-ready, activated against a real mounted artifact, or claimed as signed off until a human reviewer with authority over seasonalPprModel.ts explicitly records sign-off.';
  }

  return {
    version: PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_VERSION,
    issue: PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_ISSUE,
    decision,
    identity_checks: identityChecks,
    identity_passed: identityPassed,
    scope_checks: scopeChecks,
    scope_passed: scopePassed,
    replay_checks: replayChecks,
    replay_passed: replayPassed,
    prerequisite_gates: input.prerequisiteGates,
    prerequisites_satisfied_count: prerequisitesSatisfiedCount,
    prerequisites_total: prerequisitesTotal,
    all_mechanical_prerequisites_satisfied: allMechanicalSatisfied,
    decision_rationale: rationale,
    boundary_statements: BOUNDARY_STATEMENTS,
  };
};
