/**
 * Guardrail tests for the player-history production-only binding implementation review (Forecast
 * #143). Pins the required failure modes: a #142 decision/provenance mismatch blocks the review, a
 * scope violation or failed replay downgrades to requires-followup, human sign-off can never be
 * satisfied by this automated module (so the "_and_signed_off" decision is structurally unreachable),
 * the decision enum stays exactly the four #143 values, the module is pure, and the committed #143
 * report reflects all of the above.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_PRIOR_REVIEW_DECISION,
  PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_DECISIONS,
  evaluatePlayerHistoryProductionBindingImplementation,
  type PrerequisiteGate,
  type ProductionBindingImplementationInput,
  type ScopeAuditFinding,
} from '../src/rehearsal/playerHistoryProductionBindingImplementation.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;
const readRepoText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

const passingGates = (overrides: Partial<Record<string, Partial<PrerequisiteGate>>> = {}): PrerequisiteGate[] => {
  const base: PrerequisiteGate[] = [
    { id: 'feature_contract_reviewed_and_accepted', description: 'd', satisfied: true, evidence: 'e' },
    { id: 'source_artifact_identity_locked_and_fail_closed_in_the_contract', description: 'd', satisfied: true, evidence: 'e' },
    { id: 'named_production_inference_path_leakage_review', description: 'd', satisfied: true, evidence: 'e' },
    { id: 'deterministic_replay_sequence_exercised_by_reviewer', description: 'd', satisfied: true, evidence: 'e' },
    { id: 'missing_history_behavior_specified_for_the_named_consumer', description: 'd', satisfied: true, evidence: 'e' },
    { id: 'no_fantasy_product_consumer_change_bundled_with_contract_wiring', description: 'd', satisfied: true, evidence: 'e' },
    { id: 'human_signoff_on_seasonal_ppr_model_change', description: 'd', satisfied: false, evidence: 'no human sign-off recorded' },
  ];
  return base.map((gate) => (overrides[gate.id] ? { ...gate, ...overrides[gate.id] } : gate));
};

const passingFindings = (): ScopeAuditFinding[] => [
  { path: 'src/models/seasonal/seasonalPprModel.ts', expected: 'authorized_to_reference', observed_has_reference: true },
  { path: 'src/api/app.ts', expected: 'must_stay_clean', observed_has_reference: false },
];

const passingInput = (overrides: Partial<ProductionBindingImplementationInput> = {}): ProductionBindingImplementationInput => ({
  priorReview: { decision: EXPECTED_PRIOR_REVIEW_DECISION },
  provenanceCheck: { verified: true, sha256: 'd45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac', mismatches: [] },
  scopeAudit: {
    authorized_consumer_paths: ['src/models/seasonal/seasonalPprModel.ts'],
    still_clean_paths: ['src/api/app.ts'],
    findings: passingFindings(),
  },
  replayEvidence: { build_passed: true, tests_passed: true, test_file_count: 77, test_count: 1009, deterministic_cli_run_confirmed: true },
  prerequisiteGates: passingGates(),
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
// Identity: fail-closed on #142 evidence drift or provenance failure.
// ---------------------------------------------------------------------------------------------

describe('identity checks (fail-closed on #142/provenance drift)', () => {
  it('reaches the pending-human-signoff ceiling when every check passes', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(passingInput());
    expect(result.identity_passed).toBe(true);
    expect(result.decision).toBe('player_history_production_binding_implemented_pending_human_signoff');
  });

  it('blocks when the #142 decision does not match the expected ceiling', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ priorReview: { decision: 'player_history_production_binding_review_requires_followup' } }),
    );
    expect(result.identity_passed).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_implementation_blocked');
  });

  it('blocks when the mirror provenance check failed', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ provenanceCheck: { verified: false, sha256: 'wrong', mismatches: ['sha256 mismatch'] } }),
    );
    expect(result.identity_passed).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_implementation_blocked');
  });

  it('never evaluates scope/replay as passing when identity fails (blocked takes priority)', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ priorReview: { decision: 'wrong' }, scopeAudit: { authorized_consumer_paths: [], still_clean_paths: [], findings: [] } }),
    );
    expect(result.decision).toBe('player_history_production_binding_implementation_blocked');
  });
});

// ---------------------------------------------------------------------------------------------
// Scope audit and replay: recoverable failures downgrade to requires-followup.
// ---------------------------------------------------------------------------------------------

describe('scope audit and replay evidence', () => {
  it('requires-followup when an authorized file is missing its expected reference', () => {
    const findings: ScopeAuditFinding[] = [
      { path: 'src/models/seasonal/seasonalPprModel.ts', expected: 'authorized_to_reference', observed_has_reference: false },
      { path: 'src/api/app.ts', expected: 'must_stay_clean', observed_has_reference: false },
    ];
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ scopeAudit: { authorized_consumer_paths: ['src/models/seasonal/seasonalPprModel.ts'], still_clean_paths: ['src/api/app.ts'], findings } }),
    );
    expect(result.identity_passed).toBe(true);
    expect(result.scope_passed).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_implementation_requires_followup');
  });

  it('requires-followup when a supposedly clean file actually references player-history (scope creep)', () => {
    const findings: ScopeAuditFinding[] = [
      { path: 'src/models/seasonal/seasonalPprModel.ts', expected: 'authorized_to_reference', observed_has_reference: true },
      { path: 'src/board/ranking/rankDecisionBoard.ts', expected: 'must_stay_clean', observed_has_reference: true },
    ];
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({
        scopeAudit: { authorized_consumer_paths: ['src/models/seasonal/seasonalPprModel.ts'], still_clean_paths: ['src/board/ranking/rankDecisionBoard.ts'], findings },
      }),
    );
    expect(result.scope_passed).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_implementation_requires_followup');
    expect(result.decision_rationale).toContain('wiring_is_confined_to_the_authorized_consumer_scope');
  });

  it('requires-followup when the build failed', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ replayEvidence: { build_passed: false, tests_passed: true, test_file_count: 77, test_count: 1009, deterministic_cli_run_confirmed: true } }),
    );
    expect(result.replay_passed).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_implementation_requires_followup');
  });

  it('requires-followup when tests failed', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ replayEvidence: { build_passed: true, tests_passed: false, test_file_count: 77, test_count: 1000, deterministic_cli_run_confirmed: false } }),
    );
    expect(result.decision).toBe('player_history_production_binding_implementation_requires_followup');
  });

  it('requires-followup when a mechanical (non-human-signoff) prerequisite gate is unsatisfied', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ prerequisiteGates: passingGates({ missing_history_behavior_specified_for_the_named_consumer: { satisfied: false } }) }),
    );
    expect(result.all_mechanical_prerequisites_satisfied).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_implementation_requires_followup');
  });
});

// ---------------------------------------------------------------------------------------------
// Human sign-off can never be satisfied by this automated module.
// ---------------------------------------------------------------------------------------------

describe('human sign-off is structurally excluded from the mechanical aggregate', () => {
  it('the ceiling decision is reached even though human_signoff_on_seasonal_ppr_model_change is unsatisfied', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(passingInput());
    const humanGate = result.prerequisite_gates.find((g) => g.id === 'human_signoff_on_seasonal_ppr_model_change');
    expect(humanGate?.satisfied).toBe(false);
    expect(result.all_mechanical_prerequisites_satisfied).toBe(true);
    expect(result.decision).toBe('player_history_production_binding_implemented_pending_human_signoff');
  });

  it('setting human_signoff satisfied=true does NOT change the decision to "_and_signed_off" (this module never emits that value)', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(
      passingInput({ prerequisiteGates: passingGates({ human_signoff_on_seasonal_ppr_model_change: { satisfied: true } }) }),
    );
    expect(result.decision).toBe('player_history_production_binding_implemented_pending_human_signoff');
    expect(result.decision).not.toBe('player_history_production_binding_implemented_and_signed_off');
  });

  it('the decision rationale explicitly names the open human-signoff gate', () => {
    const result = evaluatePlayerHistoryProductionBindingImplementation(passingInput());
    expect(result.decision_rationale).toContain('human_signoff_on_seasonal_ppr_model_change');
  });
});

// ---------------------------------------------------------------------------------------------
// Decision-enum purity and module hygiene.
// ---------------------------------------------------------------------------------------------

describe('decision-enum purity and module hygiene', () => {
  it('the decision enum contains exactly the four #143 values', () => {
    expect([...PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_DECISIONS]).toEqual([
      'player_history_production_binding_implemented_pending_human_signoff',
      'player_history_production_binding_implemented_and_signed_off',
      'player_history_production_binding_implementation_blocked',
      'player_history_production_binding_implementation_requires_followup',
    ]);
  });

  it('no decision value claims full-feature-set wiring, product/advice/ranking behavior, or a threshold amendment', () => {
    for (const decision of PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_DECISIONS) {
      for (const forbidden of ['full_feature_set', 'advice', 'ranking', 'threshold_amend', 'fantasy']) {
        expect(decision.toLowerCase()).not.toContain(forbidden);
      }
    }
  });

  it('the review module performs no file I/O and no subprocess execution (pure function only)', () => {
    const source = readRepoText('src/rehearsal/playerHistoryProductionBindingImplementation.ts');
    expect(source).not.toMatch(/readFileSync|writeFileSync|execSync|require\(['"]fs['"]\)|require\(['"]child_process['"]\)/);
  });

  it('the review module has zero imports: fully self-contained', () => {
    const source = readRepoText('src/rehearsal/playerHistoryProductionBindingImplementation.ts');
    const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
    expect(importLines).toEqual([]);
  });

  it('is a pure function: identical input always yields an identical result', () => {
    const input = passingInput();
    const a = evaluatePlayerHistoryProductionBindingImplementation(input);
    const b = evaluatePlayerHistoryProductionBindingImplementation(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------------------------
// Committed report (the real #143 output).
// ---------------------------------------------------------------------------------------------

describe('committed production-binding-implementation report', () => {
  const REPORT_PATH = 'docs/reports/player-history-production-binding-implementation-2026-07-08.json';
  const report = readRepoJson<{
    cited_documents: { prior_review: { decision: string } };
    review: {
      decision: string;
      identity_passed: boolean;
      scope_passed: boolean;
      replay_passed: boolean;
      prerequisites_satisfied_count: number;
      prerequisites_total: number;
      all_mechanical_prerequisites_satisfied: boolean;
      prerequisite_gates: PrerequisiteGate[];
      boundary_statements: Record<string, boolean>;
    };
    activation_status: { default_behavior: string };
  }>(REPORT_PATH);

  it('cites the exact #142 decision', () => {
    expect(report.cited_documents.prior_review.decision).toBe(EXPECTED_PRIOR_REVIEW_DECISION);
  });

  it('identity, scope, and replay checks all passed', () => {
    expect(report.review.identity_passed).toBe(true);
    expect(report.review.scope_passed).toBe(true);
    expect(report.review.replay_passed).toBe(true);
  });

  it('emits the pending-human-signoff decision, not the signed-off one', () => {
    expect(report.review.decision).toBe('player_history_production_binding_implemented_pending_human_signoff');
    expect(PLAYER_HISTORY_PRODUCTION_BINDING_IMPLEMENTATION_DECISIONS).toContain(report.review.decision);
  });

  it('every mechanical prerequisite is satisfied but human sign-off remains explicitly open', () => {
    expect(report.review.all_mechanical_prerequisites_satisfied).toBe(true);
    const humanGate = report.review.prerequisite_gates.find((g) => g.id === 'human_signoff_on_seasonal_ppr_model_change');
    expect(humanGate?.satisfied).toBe(false);
    expect(report.review.prerequisites_satisfied_count).toBeLessThan(report.review.prerequisites_total);
  });

  it('every boundary statement confirms production_only scope and no readiness claim', () => {
    expect(Object.values(report.review.boundary_statements).every((v) => v === true)).toBe(true);
    expect(report.review.boundary_statements.production_only_scope_only).toBe(true);
    expect(report.review.boundary_statements.no_production_readiness_claim_without_all_gates_and_signoff).toBe(true);
    expect(report.review.boundary_statements.human_signoff_not_recorded_by_this_automated_review).toBe(true);
  });

  it('discloses the binding as inert by default', () => {
    expect(report.activation_status.default_behavior).toMatch(/inert/i);
  });
});
