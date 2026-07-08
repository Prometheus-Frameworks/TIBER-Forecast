/**
 * Player-history production-binding prerequisites review (Forecast #141).
 *
 * Issue #139 / PR #140 reviewed the #137 additional-validation metrics and emitted
 * `may_open_player_history_production_binding_review_issue`. That decision authorized only THIS
 * review issue. It did not bind production behavior, authorize full-feature-set wiring, or make a
 * product claim. This module performs that review: it confirms #140's decision and boundary
 * statements, records the exact production Forecast paths a future binding issue would touch, records
 * the exact artifact/mirror/report inputs a future binding issue would need to pin, evaluates a
 * production-path leakage audit (a static reference scan proving no production path currently
 * mentions player-history), and reports the outstanding production-binding-prerequisite gates from
 * `docs/experiments/player-history-production-binding-prerequisites-2026-07-04.md` section 6 against
 * current, evidence-cited repo state.
 *
 * This is a REVIEW module: it does NOT wire anything into production, does NOT change
 * `seasonalPprModel.ts`, does NOT authorize full-feature-set wiring, and does NOT make a
 * production-readiness claim (a readiness claim requires every prerequisite gate satisfied and
 * recorded; this review records most gates as still open, which is expected and does not itself
 * block opening a future, separately-scoped implementation issue).
 *
 * Decision semantics (exactly one is emitted, per the #141 issue's required enum):
 * - `may_open_player_history_production_binding_implementation_issue`: #140's decision and boundary
 *   statements are confirmed, the production-only default is confirmed carried forward, the
 *   production-path leakage audit finds zero references, and the wiring-point/artifact-input/
 *   prerequisite inventories required by this review are non-empty and well-formed. This authorizes
 *   opening a SEPARATE future implementation issue; it does not itself wire, bind, or approve
 *   anything, and it does not claim any individual prerequisite gate is satisfied beyond what is
 *   explicitly recorded.
 * - `player_history_production_binding_review_requires_followup`: identity checks pass, but the
 *   leakage audit found a reference to player-history in a production path, or a required inventory
 *   (wiring points, artifact inputs, or prerequisites) is empty or malformed.
 * - `player_history_production_binding_review_blocked`: the #140 evidence cited is not what this
 *   review expects (decision/boundary/feature-composition-gate mismatch). The review cannot proceed
 *   on evidence that isn't what it claims to be.
 *
 * Pure module: no I/O. The CLI script (`scripts/runPlayerHistoryProductionBindingReview.ts`) reads the
 * committed #140 report and performs the leakage-audit file scan, then passes everything in.
 */

export const PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_VERSION = 'player-history-production-binding-review-v1' as const;
export const PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_ISSUE = 'TIBER-Forecast#141' as const;

/** The exact #140 ceiling decision required to open this review at all. */
export const EXPECTED_PRIOR_REVIEW_DECISION = 'may_open_player_history_production_binding_review_issue' as const;

/**
 * The #140 boundary-statement keys this review requires to be explicitly present and true. A
 * regenerated #140 report that dropped these keys, or flipped one to false, must not silently pass.
 */
export const REQUIRED_PRIOR_REVIEW_BOUNDARY_KEYS = [
  'no_production_binding_authorized',
  'no_production_readiness_claim',
  'no_leakage_audit_run',
  'does_not_authorize_full_feature_set_production_wiring',
] as const;

/**
 * The only decisions this review may emit (per the #141 issue). The positive value only authorizes
 * OPENING a separate future implementation issue -- it contains no wiring/binding/advice verb.
 */
export const PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_DECISIONS = [
  'may_open_player_history_production_binding_implementation_issue',
  'player_history_production_binding_review_blocked',
  'player_history_production_binding_review_requires_followup',
] as const;
export type PlayerHistoryProductionBindingReviewDecision = (typeof PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_DECISIONS)[number];

// ---------------------------------------------------------------------------------------------
// Inputs.
// ---------------------------------------------------------------------------------------------

export interface FeatureCompositionGateEvidence {
  bar_cleared: boolean;
  observed_gap_pct: number;
  threshold_pct: number;
}

export interface PriorReviewEvidence {
  decision: string;
  boundary_statements: Record<string, boolean>;
  feature_composition_gate: FeatureCompositionGateEvidence | null;
}

/** One production Forecast file a future binding issue would need to touch or extend. */
export interface ProductionWiringPoint {
  path: string;
  role: string;
}

/** One exact artifact/mirror/report a future binding issue would need to pin. */
export interface RequiredArtifactInput {
  path: string;
  description: string;
}

/** One file scanned by the production-path leakage audit, and whether it matched a forbidden term. */
export interface LeakageAuditFinding {
  path: string;
  matched_terms: string[];
}

export interface LeakageAuditEvidence {
  scanned_paths: string[];
  forbidden_terms: string[];
  findings: LeakageAuditFinding[];
}

/** One production-binding prerequisite gate (from the #123 design doc section 6), evaluated honestly. */
export interface PrerequisiteGate {
  id: string;
  description: string;
  satisfied: boolean;
  evidence: string;
}

export interface ProductionBindingReviewInput {
  priorReview: PriorReviewEvidence;
  productionWiringPoints: ProductionWiringPoint[];
  requiredArtifactInputs: RequiredArtifactInput[];
  leakageAudit: LeakageAuditEvidence;
  prerequisites: PrerequisiteGate[];
}

// ---------------------------------------------------------------------------------------------
// Identity checks.
// ---------------------------------------------------------------------------------------------

export interface ReviewCheck {
  dimension: string;
  expected: string;
  observed: string;
  passed: boolean;
}

const evaluateIdentity = (priorReview: PriorReviewEvidence): ReviewCheck[] => {
  const checks: ReviewCheck[] = [];

  checks.push({
    dimension: 'prior_review_decision_is_expected_ceiling',
    expected: `decision ${EXPECTED_PRIOR_REVIEW_DECISION}`,
    observed: `decision=${priorReview.decision}`,
    passed: priorReview.decision === EXPECTED_PRIOR_REVIEW_DECISION,
  });

  const boundary = priorReview.boundary_statements ?? {};
  const missingOrFalse = REQUIRED_PRIOR_REVIEW_BOUNDARY_KEYS.filter((key) => boundary[key] !== true);
  checks.push({
    dimension: 'prior_review_confirms_required_boundary_statements',
    expected: `keys (${REQUIRED_PRIOR_REVIEW_BOUNDARY_KEYS.join(', ')}) explicitly present and true`,
    observed: missingOrFalse.length === 0 ? 'all present and true' : `missing/false: ${missingOrFalse.join(', ')}`,
    passed: missingOrFalse.length === 0,
  });

  const gate = priorReview.feature_composition_gate;
  checks.push({
    dimension: 'prior_review_declares_feature_composition_gate',
    expected: 'feature_composition_gate present with a boolean bar_cleared and finite observed_gap_pct/threshold_pct',
    observed:
      gate === null
        ? 'null (missing)'
        : `bar_cleared=${gate.bar_cleared}, observed_gap_pct=${gate.observed_gap_pct}, threshold_pct=${gate.threshold_pct}`,
    passed: gate !== null && typeof gate.bar_cleared === 'boolean' && Number.isFinite(gate.observed_gap_pct) && Number.isFinite(gate.threshold_pct),
  });

  return checks;
};

// ---------------------------------------------------------------------------------------------
// Inventory validation (wiring points / artifact inputs / prerequisites must be non-empty and
// well-formed; an empty or malformed inventory means the review itself is incomplete).
// ---------------------------------------------------------------------------------------------

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const evaluateInventories = (input: ProductionBindingReviewInput): ReviewCheck[] => {
  const checks: ReviewCheck[] = [];

  const wiringPointsWellFormed =
    input.productionWiringPoints.length > 0 &&
    input.productionWiringPoints.every((p) => isNonEmptyString(p.path) && isNonEmptyString(p.role));
  checks.push({
    dimension: 'production_wiring_points_identified',
    expected: 'a non-empty list of {path, role} entries',
    observed: `${input.productionWiringPoints.length} entries, well_formed=${wiringPointsWellFormed}`,
    passed: wiringPointsWellFormed,
  });

  const artifactInputsWellFormed =
    input.requiredArtifactInputs.length > 0 &&
    input.requiredArtifactInputs.every((a) => isNonEmptyString(a.path) && isNonEmptyString(a.description));
  checks.push({
    dimension: 'required_artifact_inputs_identified',
    expected: 'a non-empty list of {path, description} entries',
    observed: `${input.requiredArtifactInputs.length} entries, well_formed=${artifactInputsWellFormed}`,
    passed: artifactInputsWellFormed,
  });

  const prerequisitesWellFormed =
    input.prerequisites.length > 0 && input.prerequisites.every((p) => isNonEmptyString(p.id) && isNonEmptyString(p.description) && isNonEmptyString(p.evidence));
  checks.push({
    dimension: 'prerequisite_gates_recorded',
    expected: 'a non-empty list of {id, description, satisfied, evidence} entries',
    observed: `${input.prerequisites.length} entries, well_formed=${prerequisitesWellFormed}`,
    passed: prerequisitesWellFormed,
  });

  return checks;
};

// ---------------------------------------------------------------------------------------------
// Full review.
// ---------------------------------------------------------------------------------------------

export interface ProductionBindingReviewResult {
  version: typeof PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_VERSION;
  issue: typeof PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_ISSUE;
  decision: PlayerHistoryProductionBindingReviewDecision;
  identity_checks: ReviewCheck[];
  identity_passed: boolean;
  inventory_checks: ReviewCheck[];
  inventories_passed: boolean;
  leakage_audit_clean: boolean;
  leakage_audit_findings: LeakageAuditFinding[];
  production_wiring_points: ProductionWiringPoint[];
  required_artifact_inputs: RequiredArtifactInput[];
  prerequisite_gates: PrerequisiteGate[];
  prerequisites_satisfied_count: number;
  prerequisites_total: number;
  all_prerequisites_satisfied: boolean;
  decision_rationale: string;
  boundary_statements: {
    review_only_no_feature_wiring: true;
    no_production_binding_authorized: true;
    no_seasonal_ppr_model_change: true;
    no_production_readiness_claim: true;
    production_only_remains_v0_default: true;
    does_not_authorize_full_feature_set_production_wiring: true;
    positive_decision_authorizes_only_a_separate_implementation_issue: true;
    no_human_sign_off_recorded_by_this_review: true;
  };
}

const BOUNDARY_STATEMENTS: ProductionBindingReviewResult['boundary_statements'] = {
  review_only_no_feature_wiring: true,
  no_production_binding_authorized: true,
  no_seasonal_ppr_model_change: true,
  no_production_readiness_claim: true,
  production_only_remains_v0_default: true,
  does_not_authorize_full_feature_set_production_wiring: true,
  positive_decision_authorizes_only_a_separate_implementation_issue: true,
  no_human_sign_off_recorded_by_this_review: true,
};

/**
 * Review production-binding prerequisites for the player-history feature (Forecast #141). Pure (no
 * I/O), fail-closed on identity drift or an incomplete/malformed review inventory.
 */
export const evaluatePlayerHistoryProductionBindingReview = (input: ProductionBindingReviewInput): ProductionBindingReviewResult => {
  const identityChecks = evaluateIdentity(input.priorReview);
  const identityPassed = identityChecks.every((c) => c.passed);

  const inventoryChecks = evaluateInventories(input);
  const inventoriesPassed = inventoryChecks.every((c) => c.passed);

  const leakageFindings = input.leakageAudit.findings ?? [];
  const leakageClean = input.leakageAudit.scanned_paths.length > 0 && leakageFindings.length === 0;

  const prerequisitesSatisfiedCount = input.prerequisites.filter((p) => p.satisfied).length;
  const prerequisitesTotal = input.prerequisites.length;
  const allPrerequisitesSatisfied = prerequisitesTotal > 0 && prerequisitesSatisfiedCount === prerequisitesTotal;

  let decision: PlayerHistoryProductionBindingReviewDecision;
  let rationale: string;

  if (!identityPassed) {
    decision = 'player_history_production_binding_review_blocked';
    rationale =
      'The #140 evidence this review must cite is not what it claims to be: a decision, boundary-statement, or feature-composition-gate mismatch was found. See identity_checks for the specific dimension.';
  } else if (!inventoriesPassed) {
    decision = 'player_history_production_binding_review_requires_followup';
    rationale =
      'Identity checks against #140 passed, but this review\'s own required inventories (production wiring points, required artifact inputs, or prerequisite gates) are empty or malformed. The review is incomplete and must be finished before a future implementation issue may be opened.';
  } else if (input.leakageAudit.scanned_paths.length === 0) {
    decision = 'player_history_production_binding_review_requires_followup';
    rationale = 'The leakage audit did not scan any production paths. A leakage audit that inspects nothing proves nothing.';
  } else if (!leakageClean) {
    decision = 'player_history_production_binding_review_requires_followup';
    rationale = `The production-path leakage audit found ${leakageFindings.length} existing reference(s) to player-history terms in production Forecast paths (${leakageFindings.map((f) => f.path).join(', ')}). This must be resolved before a production-binding implementation issue may be opened.`;
  } else {
    decision = 'may_open_player_history_production_binding_implementation_issue';
    rationale =
      `The #140 decision and required boundary statements are confirmed, production_only is confirmed carried forward as the v0 default (feature-composition bar_cleared=${input.priorReview.feature_composition_gate?.bar_cleared}), the production-path leakage audit scanned ${input.leakageAudit.scanned_paths.length} production paths and found zero player-history references, and this review recorded ${input.productionWiringPoints.length} production wiring point(s), ${input.requiredArtifactInputs.length} required artifact input(s), and ${prerequisitesTotal} prerequisite gate(s) (${prerequisitesSatisfiedCount}/${prerequisitesTotal} currently satisfied). ` +
      'A SEPARATE future issue may be opened to propose a bounded production-binding implementation. This decision does not itself wire any feature, change seasonalPprModel.ts, authorize full-feature-set wiring, make a product/advice/ranking claim, or claim production readiness -- ' +
      `${allPrerequisitesSatisfied ? 'every recorded prerequisite gate happens to be satisfied, but this review still does not itself make a production-readiness claim.' : `${prerequisitesTotal - prerequisitesSatisfiedCount} prerequisite gate(s) remain unsatisfied and are recorded as open blockers for that future issue.`}`;
  }

  return {
    version: PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_VERSION,
    issue: PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_ISSUE,
    decision,
    identity_checks: identityChecks,
    identity_passed: identityPassed,
    inventory_checks: inventoryChecks,
    inventories_passed: inventoriesPassed,
    leakage_audit_clean: leakageClean,
    leakage_audit_findings: leakageFindings,
    production_wiring_points: input.productionWiringPoints,
    required_artifact_inputs: input.requiredArtifactInputs,
    prerequisite_gates: input.prerequisites,
    prerequisites_satisfied_count: prerequisitesSatisfiedCount,
    prerequisites_total: prerequisitesTotal,
    all_prerequisites_satisfied: allPrerequisitesSatisfied,
    decision_rationale: rationale,
    boundary_statements: BOUNDARY_STATEMENTS,
  };
};
