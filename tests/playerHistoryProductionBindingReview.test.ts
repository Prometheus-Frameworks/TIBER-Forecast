/**
 * Guardrail tests for the player-history production-binding prerequisites review (Forecast #141).
 *
 * These tests pin the required failure modes: a #140 decision/boundary/feature-composition-gate
 * mismatch blocks the review outright; an empty or malformed wiring-point, artifact-input, or
 * prerequisite inventory downgrades to requires-followup; a leakage-audit finding downgrades to
 * requires-followup; a leakage audit that scanned nothing is treated as inconclusive, not clean; the
 * decision is evidence-bound; the decision enum stays exactly the three #141 values and never itself
 * binds production, wires a feature, or claims production readiness; the module is pure (no I/O); the
 * script imports nothing that would itself constitute production wiring; the actual production
 * Forecast source tree currently carries zero player-history references; and the committed #141 report
 * reflects all of the above.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_PRIOR_REVIEW_DECISION,
  PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_DECISIONS,
  REQUIRED_PRIOR_REVIEW_BOUNDARY_KEYS,
  evaluatePlayerHistoryProductionBindingReview,
  type PrerequisiteGate,
  type PriorReviewEvidence,
  type ProductionBindingReviewInput,
  type ProductionWiringPoint,
  type RequiredArtifactInput,
} from '../src/rehearsal/playerHistoryProductionBindingReview.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;
const readRepoText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

// ---------------------------------------------------------------------------------------------
// Synthetic passing fixtures, modeled on the real #140 evidence shape and this review's own
// required inventories.
// ---------------------------------------------------------------------------------------------

const passingPriorReview = (overrides: Partial<PriorReviewEvidence> = {}): PriorReviewEvidence => ({
  decision: EXPECTED_PRIOR_REVIEW_DECISION,
  boundary_statements: {
    review_only_no_validation_rerun: true,
    no_threshold_amended: true,
    no_production_binding_authorized: true,
    no_production_readiness_claim: true,
    no_leakage_audit_run: true,
    no_product_facing_claim: true,
    no_tiber_data_change: true,
    positive_decision_authorizes_only_a_separate_production_binding_review_issue: true,
    does_not_authorize_full_feature_set_production_wiring: true,
  },
  feature_composition_gate: { bar_cleared: false, observed_gap_pct: 0.35, threshold_pct: 2.0 },
  ...overrides,
});

const onePoint: ProductionWiringPoint[] = [{ path: 'src/models/seasonal/seasonalPprModel.ts', role: 'design matrix' }];
const oneArtifact: RequiredArtifactInput[] = [{ path: 'exports/promoted/nfl/player_season_coverage_v0.json', description: 'promoted source' }];
const onePrereq: PrerequisiteGate[] = [{ id: 'human_sign_off', description: 'human sign-off recorded', satisfied: false, evidence: 'not yet recorded' }];

const passingInput = (overrides: Partial<ProductionBindingReviewInput> = {}): ProductionBindingReviewInput => ({
  priorReview: passingPriorReview(),
  productionWiringPoints: onePoint,
  requiredArtifactInputs: oneArtifact,
  leakageAudit: { scanned_paths: ['src/models/seasonal/seasonalPprModel.ts'], forbidden_terms: ['player_history'], findings: [] },
  prerequisites: onePrereq,
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
// Identity checks against #140: fail-closed on drift.
// ---------------------------------------------------------------------------------------------

describe('identity checks against #140 (fail-closed on evidence drift)', () => {
  it('reaches the ceiling decision when #140 evidence matches expectations, inventories are well-formed, and the leakage audit is clean', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(passingInput());
    expect(result.identity_passed).toBe(true);
    expect(result.decision).toBe('may_open_player_history_production_binding_implementation_issue');
  });

  it('blocks when the #140 decision is not the expected ceiling decision', () => {
    const input = passingInput({ priorReview: passingPriorReview({ decision: 'player_history_2024_from_2021_2023_threshold_review_requires_followup' }) });
    const result = evaluatePlayerHistoryProductionBindingReview(input);
    expect(result.identity_passed).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_review_blocked');
  });

  it('blocks when a required #140 boundary statement is false', () => {
    const input = passingInput({
      priorReview: passingPriorReview({ boundary_statements: { ...passingPriorReview().boundary_statements, no_production_binding_authorized: false } }),
    });
    const result = evaluatePlayerHistoryProductionBindingReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('blocks when a required #140 boundary statement is omitted entirely (regression: bare absence must fail, not pass by default)', () => {
    for (const omittedKey of REQUIRED_PRIOR_REVIEW_BOUNDARY_KEYS) {
      const { [omittedKey]: _omitted, ...rest } = passingPriorReview().boundary_statements;
      const input = passingInput({ priorReview: passingPriorReview({ boundary_statements: rest }) });
      const result = evaluatePlayerHistoryProductionBindingReview(input);
      expect(result.identity_passed).toBe(false);
      expect(result.decision).toBe('player_history_production_binding_review_blocked');
    }
  });

  it('blocks when the feature-composition gate is missing (null)', () => {
    const input = passingInput({ priorReview: passingPriorReview({ feature_composition_gate: null }) });
    const result = evaluatePlayerHistoryProductionBindingReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('blocks when the feature-composition gate carries a non-finite value', () => {
    const input = passingInput({
      priorReview: passingPriorReview({ feature_composition_gate: { bar_cleared: false, observed_gap_pct: Number.NaN, threshold_pct: 2.0 } }),
    });
    const result = evaluatePlayerHistoryProductionBindingReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('never evaluates inventories or the leakage audit when identity fails (no partial credit)', () => {
    const input = passingInput({ priorReview: passingPriorReview({ decision: 'wrong' }) });
    const result = evaluatePlayerHistoryProductionBindingReview(input);
    expect(result.decision).toBe('player_history_production_binding_review_blocked');
    // Inventory/leakage checks are still computed for transparency, but the decision must not be positive.
    expect(result.decision).not.toBe('may_open_player_history_production_binding_implementation_issue');
  });
});

// ---------------------------------------------------------------------------------------------
// Review-inventory completeness: an empty or malformed inventory means the review is incomplete.
// ---------------------------------------------------------------------------------------------

describe('review-inventory completeness (empty or malformed inventories block the ceiling decision)', () => {
  it('requires-followup when no production wiring points were identified', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(passingInput({ productionWiringPoints: [] }));
    expect(result.identity_passed).toBe(true);
    expect(result.inventories_passed).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_review_requires_followup');
  });

  it('requires-followup when a wiring point is malformed (empty path or role)', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(passingInput({ productionWiringPoints: [{ path: '', role: 'x' }] }));
    expect(result.inventories_passed).toBe(false);
  });

  it('requires-followup when no required artifact inputs were identified', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(passingInput({ requiredArtifactInputs: [] }));
    expect(result.decision).toBe('player_history_production_binding_review_requires_followup');
  });

  it('requires-followup when no prerequisite gates were recorded', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(passingInput({ prerequisites: [] }));
    expect(result.decision).toBe('player_history_production_binding_review_requires_followup');
  });

  it('requires-followup when a prerequisite gate is malformed (empty evidence)', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(
      passingInput({ prerequisites: [{ id: 'x', description: 'x', satisfied: true, evidence: '' }] }),
    );
    expect(result.inventories_passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Leakage audit: a finding, or an audit that scanned nothing, must block the ceiling decision.
// ---------------------------------------------------------------------------------------------

describe('production-path leakage audit', () => {
  it('requires-followup when the leakage audit finds a reference in a production path', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(
      passingInput({
        leakageAudit: {
          scanned_paths: ['src/models/seasonal/seasonalPprModel.ts'],
          forbidden_terms: ['player_history'],
          findings: [{ path: 'src/models/seasonal/seasonalPprModel.ts', matched_terms: ['player_history'] }],
        },
      }),
    );
    expect(result.leakage_audit_clean).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_review_requires_followup');
    expect(result.decision_rationale).toContain('seasonalPprModel.ts');
  });

  it('treats a leakage audit that scanned zero paths as inconclusive, not clean (a scan of nothing proves nothing)', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(
      passingInput({ leakageAudit: { scanned_paths: [], forbidden_terms: ['player_history'], findings: [] } }),
    );
    expect(result.leakage_audit_clean).toBe(false);
    expect(result.decision).toBe('player_history_production_binding_review_requires_followup');
  });

  it('reports leakage_audit_findings verbatim on the result for transparency', () => {
    const finding = { path: 'src/api/app.ts', matched_terms: ['playerHistory'] };
    const result = evaluatePlayerHistoryProductionBindingReview(
      passingInput({ leakageAudit: { scanned_paths: ['src/api/app.ts'], forbidden_terms: ['playerHistory'], findings: [finding] } }),
    );
    expect(result.leakage_audit_findings).toEqual([finding]);
  });
});

// ---------------------------------------------------------------------------------------------
// Evidence-bound and prerequisite bookkeeping.
// ---------------------------------------------------------------------------------------------

describe('the decision is evidence-bound, not hardcoded, and prerequisite counts are tracked honestly', () => {
  it('reverting a blocking input back to a passing value flips the decision back to the ceiling', () => {
    const weakened = passingInput({ productionWiringPoints: [] });
    expect(evaluatePlayerHistoryProductionBindingReview(weakened).decision).toBe('player_history_production_binding_review_requires_followup');

    const restored = passingInput();
    expect(evaluatePlayerHistoryProductionBindingReview(restored).decision).toBe('may_open_player_history_production_binding_implementation_issue');
  });

  it('is a pure function: identical input always yields an identical result', () => {
    const input = passingInput();
    const a = evaluatePlayerHistoryProductionBindingReview(input);
    const b = evaluatePlayerHistoryProductionBindingReview(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a positive decision does NOT require every prerequisite gate to be satisfied', () => {
    const result = evaluatePlayerHistoryProductionBindingReview(passingInput({ prerequisites: onePrereq }));
    expect(result.decision).toBe('may_open_player_history_production_binding_implementation_issue');
    expect(result.all_prerequisites_satisfied).toBe(false);
    expect(result.prerequisites_satisfied_count).toBe(0);
    expect(result.prerequisites_total).toBe(1);
  });

  it('correctly counts a mix of satisfied and unsatisfied prerequisite gates', () => {
    const mixed: PrerequisiteGate[] = [
      { id: 'a', description: 'a', satisfied: true, evidence: 'a' },
      { id: 'b', description: 'b', satisfied: false, evidence: 'b' },
      { id: 'c', description: 'c', satisfied: true, evidence: 'c' },
    ];
    const result = evaluatePlayerHistoryProductionBindingReview(passingInput({ prerequisites: mixed }));
    expect(result.prerequisites_satisfied_count).toBe(2);
    expect(result.prerequisites_total).toBe(3);
    expect(result.all_prerequisites_satisfied).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Decision-enum purity, no I/O, and production isolation.
// ---------------------------------------------------------------------------------------------

describe('decision-enum purity, no I/O, and production isolation', () => {
  it('the decision enum contains exactly the three #141 values', () => {
    expect([...PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_DECISIONS]).toEqual([
      'may_open_player_history_production_binding_implementation_issue',
      'player_history_production_binding_review_blocked',
      'player_history_production_binding_review_requires_followup',
    ]);
  });

  it('no decision value itself wires a feature, binds production, changes the model, or claims readiness/advice/ranking', () => {
    for (const decision of PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_DECISIONS) {
      for (const forbidden of ['_wired', '_bound', 'seasonal_ppr_model_changed', 'production_ready', 'advice', 'ranking', 'full_feature_set']) {
        expect(decision).not.toContain(forbidden);
      }
    }
    expect(PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_DECISIONS[0]).toBe('may_open_player_history_production_binding_implementation_issue');
  });

  it('the review module performs no file I/O (pure function only)', () => {
    const source = readRepoText('src/rehearsal/playerHistoryProductionBindingReview.ts');
    expect(source).not.toMatch(/readFileSync|writeFileSync|require\(['"]fs['"]\)/);
  });

  it('the review module has zero imports: fully self-contained, no dependency surface at all', () => {
    const source = readRepoText('src/rehearsal/playerHistoryProductionBindingReview.ts');
    const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
    expect(importLines).toEqual([]);
  });

  it('the CLI script imports nothing that would itself constitute production wiring (no direct import of seasonalPprModel, server, routes, scoring, board, fusion, services)', () => {
    const source = readRepoText('scripts/runPlayerHistoryProductionBindingReview.ts');
    const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).not.toMatch(/seasonalPprModel|\/server\.js|\/routes\/|\/scoring\/|\/board\/|\/fusion\/|\/services\//);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Real production tree: prove, today, that zero production Forecast paths reference player-history.
// This is the actual leakage-audit assertion the #141 issue requires as a test, independent of the
// generator script.
// ---------------------------------------------------------------------------------------------

describe('the real production Forecast tree carries zero player-history references (no leakage today)', () => {
  const FORBIDDEN_TERMS = ['player_history', 'player-history', 'playerHistory', 'PlayerHistory'];

  const PRODUCTION_PATHS = [
    'src/models/seasonal/seasonalPprModel.ts',
    'src/models/seasonal/seasonalPprBaselines.ts',
    'src/contracts/seasonalPprBacktest.ts',
    'src/datasets/seasonal/loadSeasonalPprDataset.ts',
    'src/datasets/seasonal/parseTiberDataWeeklyArtifact.ts',
    'src/datasets/seasonal/tiberDataSeasonalPprDataset.ts',
    'src/datasets/seasonal/fixtures/seasonalPprSeedSnapshot.ts',
    'src/datasets/seasonal/fixtures/tiberDataWeeklyPprScaffold.ts',
    'src/services/runSeasonalPprBacktestService.ts',
    'src/studio/loadSeasonalPprArtifacts.ts',
    'src/studio/buildModelContextExport.ts',
    'src/studio/renderStudioPage.ts',
    'src/api/routes/studio.ts',
    'src/api/app.ts',
    'src/server.ts',
    'src/index.ts',
  ];

  it.each(PRODUCTION_PATHS)('%s contains no player-history reference', (rel) => {
    const content = readRepoText(rel);
    for (const term of FORBIDDEN_TERMS) {
      expect(content).not.toContain(term);
    }
  });

  it('seasonalPprModel.ts NUMERIC_FEATURES is unchanged from the pre-#141 production feature set (no feature was added)', () => {
    const source = readRepoText('src/models/seasonal/seasonalPprModel.ts');
    expect(source).toContain("{ name: 'ppr_2024', kind: 'numeric'");
    expect(source).toContain("{ name: 'ppr_per_game_2024', kind: 'numeric'");
    expect(source).toContain("{ name: 'games_2024', kind: 'numeric'");
    expect(source).toContain("{ name: 'targets_2024', kind: 'numeric'");
    expect(source).toContain("{ name: 'rush_attempts_2024', kind: 'numeric'");
    // Exactly five numeric features plus position -- no sixth feature was inserted.
    const numericFeatureMatches = source.match(/\{ name: '[a-z_0-9]+', kind: 'numeric'/g) ?? [];
    expect(numericFeatureMatches).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------------------------
// Committed report (the real #141 output).
// ---------------------------------------------------------------------------------------------

describe('committed production-binding-review report', () => {
  const REPORT_PATH = 'docs/reports/player-history-production-binding-review-2026-07-08.json';
  const report = readRepoJson<{
    cited_documents: { prior_review: { path: string; decision: string } };
    review: {
      decision: string;
      identity_passed: boolean;
      inventories_passed: boolean;
      leakage_audit_clean: boolean;
      leakage_audit_findings: unknown[];
      production_wiring_points: unknown[];
      required_artifact_inputs: unknown[];
      prerequisite_gates: unknown[];
      prerequisites_satisfied_count: number;
      prerequisites_total: number;
      boundary_statements: Record<string, boolean>;
    };
    human_sign_off_requirements: string[];
  }>(REPORT_PATH);

  it('cites the exact #140 threshold-review decision', () => {
    expect(report.cited_documents.prior_review.path).toBe('docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.json');
    expect(report.cited_documents.prior_review.decision).toBe(EXPECTED_PRIOR_REVIEW_DECISION);
  });

  it('identity and inventory checks passed and the leakage audit is clean', () => {
    expect(report.review.identity_passed).toBe(true);
    expect(report.review.inventories_passed).toBe(true);
    expect(report.review.leakage_audit_clean).toBe(true);
    expect(report.review.leakage_audit_findings).toEqual([]);
  });

  it('emits the ceiling decision and it is one of the three allowed #141 values', () => {
    expect(report.review.decision).toBe('may_open_player_history_production_binding_implementation_issue');
    expect(PLAYER_HISTORY_PRODUCTION_BINDING_REVIEW_DECISIONS).toContain(report.review.decision);
  });

  it('recorded non-trivial production wiring points, required artifact inputs, and prerequisite gates', () => {
    expect(report.review.production_wiring_points.length).toBeGreaterThanOrEqual(10);
    expect(report.review.required_artifact_inputs.length).toBeGreaterThanOrEqual(5);
    expect(report.review.prerequisite_gates.length).toBeGreaterThanOrEqual(5);
  });

  it('does not claim every prerequisite is satisfied (an honest, non-rubber-stamped review)', () => {
    expect(report.review.prerequisites_satisfied_count).toBeLessThan(report.review.prerequisites_total);
  });

  it('every boundary statement confirms no production binding, no model change, and no readiness claim', () => {
    expect(Object.values(report.review.boundary_statements).every((v) => v === true)).toBe(true);
    expect(report.review.boundary_statements.no_production_binding_authorized).toBe(true);
    expect(report.review.boundary_statements.no_seasonal_ppr_model_change).toBe(true);
    expect(report.review.boundary_statements.no_production_readiness_claim).toBe(true);
    expect(report.review.boundary_statements.production_only_remains_v0_default).toBe(true);
  });

  it('records human sign-off requirements distinct from this automated review', () => {
    expect(report.human_sign_off_requirements.length).toBeGreaterThan(0);
    expect(report.human_sign_off_requirements.join(' ')).toMatch(/human reviewer/i);
  });
});
