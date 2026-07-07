/**
 * Guardrail tests for the 2024-from-2021-2023 player-history threshold review (Forecast #139).
 *
 * Reviews the #137/PR #138 additional-validation metrics against the PR #132 acceptance framework and
 * the prior #121/#122 promoted-source (2025-from-2022-2024) evidence. These tests pin the required
 * failure modes: a framework/prior-origin/new-origin decision mismatch blocks the review outright, a
 * failed #137 precondition or a false boundary statement blocks it, each of the six quantitative
 * threshold components is evaluated independently per origin with NO averaging (one origin failing
 * one component alone downgrades to requires-followup even if the other origin is strong), the
 * decision is evidence-bound (changing an input metric changes the decision), the decision enum stays
 * exactly the three #139 values and never itself binds production or amends a threshold, the module is
 * pure (no I/O), and the module/script import nothing from production Forecast.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_NEW_ORIGIN_DECISION,
  EXPECTED_PRIOR_ORIGIN_DECISION,
  EXPECTED_THRESHOLD_FRAMEWORK_DECISION,
  EXPECTED_THRESHOLD_FRAMEWORK_STATUS,
  MAX_ABSOLUTE_JOINED_MAE,
  MAX_ABSOLUTE_JOINED_RMSE,
  MIN_RELATIVE_MAE_IMPROVEMENT_OVER_BASELINE,
  MIN_RELATIVE_MAE_IMPROVEMENT_OVER_SHUFFLED,
  MIN_RELATIVE_RMSE_IMPROVEMENT_OVER_SHUFFLED,
  NO_HISTORY_SHARE_SOFT_CEILING,
  PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS,
  PRODUCTION_ONLY_ADDED_VALUE_BAR_PCT,
  REQUIRED_NEW_ORIGIN_BOUNDARY_KEYS,
  evaluatePlayerHistory2024From2021_2023ThresholdReview,
  type JoinedPopulationOriginEvidence,
  type NewOriginEvidence,
  type ThresholdFrameworkEvidence,
  type ThresholdReviewInput,
} from '../src/rehearsal/playerHistory2024From2021_2023ThresholdReview.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

// ---------------------------------------------------------------------------------------------
// Synthetic passing fixtures, modeled on the real #121/#122 and #137 evidence shapes.
// ---------------------------------------------------------------------------------------------

const passingFramework = (overrides: Partial<ThresholdFrameworkEvidence> = {}): ThresholdFrameworkEvidence => ({
  status: EXPECTED_THRESHOLD_FRAMEWORK_STATUS,
  decision: EXPECTED_THRESHOLD_FRAMEWORK_DECISION,
  production_only_added_value_bar: { threshold_pct: PRODUCTION_ONLY_ADDED_VALUE_BAR_PCT, observed_gap_pct: 0.35 },
  ...overrides,
});

const passingPriorOrigin = (overrides: Partial<JoinedPopulationOriginEvidence> = {}): JoinedPopulationOriginEvidence => ({
  origin_label: '2025-from-2022-2024 (synthetic)',
  decision: EXPECTED_PRIOR_ORIGIN_DECISION,
  joined_mae: { baseline_only: 70, real_player_history_features: 40, shuffled_player_history_control: 72 },
  joined_rmse: { baseline_only: 90, real_player_history_features: 58, shuffled_player_history_control: 92 },
  population: { evaluated_rows: 600, joined_rows: 480, no_history_rows: 120 },
  ...overrides,
});

const passingNewOrigin = (overrides: Partial<NewOriginEvidence> = {}): NewOriginEvidence => ({
  origin_label: '2024-from-2021-2023 (synthetic)',
  decision: EXPECTED_NEW_ORIGIN_DECISION,
  joined_mae: { baseline_only: 71, real_player_history_features: 44, shuffled_player_history_control: 73 },
  joined_rmse: { baseline_only: 90, real_player_history_features: 60, shuffled_player_history_control: 91 },
  population: { evaluated_rows: 588, joined_rows: 470, no_history_rows: 118 },
  boundary_statements: {
    additional_validation_run_only: true,
    no_threshold_accepted_rejected_or_amended: true,
    no_production_binding_authorized: true,
    metrics_exist_only_inside_this_report: true,
  },
  preconditions_integrity_passed: true,
  preconditions_floors_passed: true,
  ...overrides,
});

const passingInput = (): ThresholdReviewInput => ({
  framework: passingFramework(),
  priorOrigin: passingPriorOrigin(),
  newOrigin: passingNewOrigin(),
});

// ---------------------------------------------------------------------------------------------
// Identity/boundary checks: fail-closed on drift.
// ---------------------------------------------------------------------------------------------

describe('identity and boundary checks (fail-closed on evidence drift)', () => {
  it('passes and reaches the ceiling decision when every cited document matches expectations and components clear', () => {
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(passingInput());
    expect(result.identity_passed).toBe(true);
    expect(result.decision).toBe('may_open_player_history_production_binding_review_issue');
  });

  it('blocks when the framework document is not the expected deferred threshold proposal', () => {
    const input = passingInput();
    input.framework = passingFramework({ decision: 'player_history_threshold_candidate_accepted_for_leakage_audit_design' });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
    expect(result.decision).toBe('player_history_2024_from_2021_2023_threshold_review_blocked');
  });

  it('blocks when the framework status string does not match (a different or stale document)', () => {
    const input = passingInput();
    input.framework = passingFramework({ status: 'some_other_status' });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('blocks when the prior-origin (#121/#122) decision does not match the expected replicated result', () => {
    const input = passingInput();
    input.priorOrigin = passingPriorOrigin({ decision: 'no_player_history_signal_observed' });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
    expect(result.decision).toBe('player_history_2024_from_2021_2023_threshold_review_blocked');
  });

  it('blocks when the new-origin (#137) decision is not the required ceiling decision', () => {
    const input = passingInput();
    input.newOrigin = passingNewOrigin({ decision: 'player_history_2024_from_2021_2023_additional_validation_requires_followup' });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('blocks when #137 preconditions did not fully pass', () => {
    const input = passingInput();
    input.newOrigin = passingNewOrigin({ preconditions_floors_passed: false });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
    expect(result.decision).toBe('player_history_2024_from_2021_2023_threshold_review_blocked');
  });

  it('blocks when a #137 boundary statement is false (e.g. a threshold was somehow marked accepted)', () => {
    const input = passingInput();
    input.newOrigin = passingNewOrigin({ boundary_statements: { ...passingNewOrigin().boundary_statements, no_threshold_accepted_rejected_or_amended: false } });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('blocks when #137 boundary_statements is empty (nothing to confirm)', () => {
    const input = passingInput();
    input.newOrigin = passingNewOrigin({ boundary_statements: {} });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('blocks when a #137 report OMITS a required boundary key entirely, even though every present key is true (regression: bare presence+truthy is not enough)', () => {
    expect(REQUIRED_NEW_ORIGIN_BOUNDARY_KEYS).toEqual(['no_threshold_accepted_rejected_or_amended', 'no_production_binding_authorized']);
    for (const omittedKey of REQUIRED_NEW_ORIGIN_BOUNDARY_KEYS) {
      const input = passingInput();
      const { [omittedKey]: _omitted, ...rest } = passingNewOrigin().boundary_statements;
      input.newOrigin = passingNewOrigin({ boundary_statements: { ...rest, some_other_true_statement: true } });
      const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
      expect(result.identity_passed).toBe(false);
      expect(result.decision).toBe('player_history_2024_from_2021_2023_threshold_review_blocked');
    }
  });

  it('never evaluates quantitative components when identity fails (no partial credit)', () => {
    const input = passingInput();
    input.framework = passingFramework({ decision: 'wrong' });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.component_checks).toEqual([]);
    expect(result.per_origin_summary).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Quantitative components: independent per-origin, no averaging.
// ---------------------------------------------------------------------------------------------

describe('quantitative threshold components: independent per origin, no averaging', () => {
  it('a single failing component on ONE origin downgrades to requires-followup even though the other origin is strong', () => {
    const input = passingInput();
    // Weaken only the new origin's real-arm MAE below the 25% relative-improvement floor over baseline.
    input.newOrigin = passingNewOrigin({ joined_mae: { baseline_only: 71, real_player_history_features: 60, shuffled_player_history_control: 73 } });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(true);
    expect(result.components_passed_both_origins).toBe(false);
    expect(result.decision).toBe('player_history_2024_from_2021_2023_threshold_review_requires_followup');
    expect(result.per_origin_summary.find((s) => s.origin_label === input.priorOrigin.origin_label)?.all_components_passed).toBe(true);
    expect(result.per_origin_summary.find((s) => s.origin_label === input.newOrigin.origin_label)?.all_components_passed).toBe(false);
    expect(result.decision_rationale).toContain(input.newOrigin.origin_label);
  });

  it('the absolute joined MAE ceiling is a hard per-arm ceiling, independent of relative improvement', () => {
    const input = passingInput();
    // Both relative-improvement checks still clear (large baseline/shuffled), but the absolute ceiling does not.
    input.newOrigin = passingNewOrigin({ joined_mae: { baseline_only: 100, real_player_history_features: 49, shuffled_player_history_control: 100 } });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    const failing = result.component_checks.find((c) => c.dimension === 'absolute_joined_mae_ceiling' && c.origin === input.newOrigin.origin_label);
    expect(failing?.passed).toBe(false);
    expect(result.decision).toBe('player_history_2024_from_2021_2023_threshold_review_requires_followup');
  });

  it('the absolute joined RMSE ceiling is independently enforced', () => {
    const input = passingInput();
    input.newOrigin = passingNewOrigin({ joined_rmse: { baseline_only: 120, real_player_history_features: 69, shuffled_player_history_control: 120 } });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    const failing = result.component_checks.find((c) => c.dimension === 'absolute_joined_rmse_ceiling' && c.origin === input.newOrigin.origin_label);
    expect(failing?.passed).toBe(false);
  });

  it('the no-history soft ceiling passes at exactly the boundary and fails just past it', () => {
    const atCeiling = passingInput();
    atCeiling.newOrigin = passingNewOrigin({ population: { evaluated_rows: 1000, joined_rows: 650, no_history_rows: 350 } }); // exactly 35%
    const atResult = evaluatePlayerHistory2024From2021_2023ThresholdReview(atCeiling);
    expect(atResult.component_checks.find((c) => c.dimension === 'no_history_subgroup_reporting_ceiling' && c.origin === atCeiling.newOrigin.origin_label)?.passed).toBe(true);

    const pastCeiling = passingInput();
    pastCeiling.newOrigin = passingNewOrigin({ population: { evaluated_rows: 1000, joined_rows: 649, no_history_rows: 351 } }); // 35.1%
    const pastResult = evaluatePlayerHistory2024From2021_2023ThresholdReview(pastCeiling);
    expect(pastResult.component_checks.find((c) => c.dimension === 'no_history_subgroup_reporting_ceiling' && c.origin === pastCeiling.newOrigin.origin_label)?.passed).toBe(false);
    expect(pastResult.decision).toBe('player_history_2024_from_2021_2023_threshold_review_requires_followup');
  });

  it('the pinned thresholds match PR #132 exactly (25% / 25% / 48.0 / 68.0 / 20% / 35%)', () => {
    expect(MIN_RELATIVE_MAE_IMPROVEMENT_OVER_BASELINE).toBe(0.25);
    expect(MIN_RELATIVE_MAE_IMPROVEMENT_OVER_SHUFFLED).toBe(0.25);
    expect(MAX_ABSOLUTE_JOINED_MAE).toBe(48.0);
    expect(MAX_ABSOLUTE_JOINED_RMSE).toBe(68.0);
    expect(MIN_RELATIVE_RMSE_IMPROVEMENT_OVER_SHUFFLED).toBe(0.2);
    expect(NO_HISTORY_SHARE_SOFT_CEILING).toBe(0.35);
  });

  it('the real #132 framework document still declares exactly these six candidate thresholds', () => {
    const framework = readRepoJson<{
      quantitative_threshold_components: Array<{ id: string; candidate_threshold: string }>;
    }>('docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json');
    const byId = Object.fromEntries(framework.quantitative_threshold_components.map((c) => [c.id, c.candidate_threshold]));
    expect(byId.relative_mae_improvement_over_baseline).toContain('25%');
    expect(byId.relative_mae_improvement_over_shuffled_control).toContain('25%');
    expect(byId.absolute_joined_mae_ceiling).toContain('48.0');
    expect(byId.absolute_joined_rmse_ceiling).toContain('68.0');
    expect(byId.relative_rmse_improvement_over_shuffled_control).toContain('20%');
    expect(byId.no_history_subgroup_reporting_ceiling).toContain('35%');
  });
});

// ---------------------------------------------------------------------------------------------
// Feature-composition gate (PR #132's sixth component): reported explicitly, never folded into
// "every component passes" (regression for the Codex P2 finding on PR #140).
// ---------------------------------------------------------------------------------------------

describe('feature-composition gate is reported explicitly and never authorizes full-feature-set wiring', () => {
  it('an uncleared gap (<=2%) is reported as bar_cleared=false with an explicit non-authorization statement', () => {
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(passingInput());
    expect(result.feature_composition_gate).not.toBeNull();
    expect(result.feature_composition_gate?.bar_cleared).toBe(false);
    expect(result.feature_composition_gate?.observed_gap_pct).toBe(0.35);
    expect(result.feature_composition_gate?.statement).toMatch(/does NOT authorize full-feature-set production wiring/);
    expect(result.decision_rationale).toMatch(/does not itself.*authorize full-feature-set wiring/);
  });

  it('a cleared gap (>2%) is reported as bar_cleared=true, still without changing components_passed_both_origins semantics', () => {
    const input = passingInput();
    input.framework = passingFramework({ production_only_added_value_bar: { threshold_pct: PRODUCTION_ONLY_ADDED_VALUE_BAR_PCT, observed_gap_pct: 2.5 } });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.feature_composition_gate?.bar_cleared).toBe(true);
    expect(result.decision).toBe('may_open_player_history_production_binding_review_issue');
  });

  it('blocks when the framework does not declare the expected pinned bar threshold (drift/tamper detection)', () => {
    const input = passingInput();
    input.framework = passingFramework({ production_only_added_value_bar: { threshold_pct: 5.0, observed_gap_pct: 0.35 } });
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
    expect(result.feature_composition_gate).toBeNull();
  });

  it('blocks when the framework omits the bar entirely (malformed input)', () => {
    const input = passingInput();
    const { production_only_added_value_bar: _omitted, ...rest } = passingFramework();
    input.framework = rest as ThresholdFrameworkEvidence;
    const result = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(result.identity_passed).toBe(false);
  });

  it('the decision enum itself never claims full-feature-set authorization', () => {
    for (const decision of PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS) {
      expect(decision).not.toContain('full_feature_set');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Evidence-bound: the decision must actually track the numbers, not be hardcoded.
// ---------------------------------------------------------------------------------------------

describe('the decision is evidence-bound, not hardcoded', () => {
  it('reverting a weakened metric back to a passing value flips the decision back to the ceiling', () => {
    const weakened = passingInput();
    weakened.newOrigin = passingNewOrigin({ joined_mae: { baseline_only: 71, real_player_history_features: 60, shuffled_player_history_control: 73 } });
    expect(evaluatePlayerHistory2024From2021_2023ThresholdReview(weakened).decision).toBe('player_history_2024_from_2021_2023_threshold_review_requires_followup');

    const restored = passingInput();
    expect(evaluatePlayerHistory2024From2021_2023ThresholdReview(restored).decision).toBe('may_open_player_history_production_binding_review_issue');
  });

  it('is a pure function: identical input always yields an identical result', () => {
    const input = passingInput();
    const a = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    const b = evaluatePlayerHistory2024From2021_2023ThresholdReview(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------------------------
// Decision-enum purity, no I/O, and production isolation.
// ---------------------------------------------------------------------------------------------

describe('decision-enum purity, no I/O, and production isolation', () => {
  it('the decision enum contains exactly the three #139 values', () => {
    expect([...PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS]).toEqual([
      'may_open_player_history_production_binding_review_issue',
      'player_history_2024_from_2021_2023_threshold_review_blocked',
      'player_history_2024_from_2021_2023_threshold_review_requires_followup',
    ]);
  });

  it('no decision value itself accepts, rejects, or amends a threshold, or claims production binding/readiness', () => {
    for (const decision of PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS) {
      for (const forbidden of ['accept_threshold', 'reject_threshold', 'amend_threshold', 'production_ready', 'wire', 'advice', 'ranking', 'promote_']) {
        expect(decision).not.toContain(forbidden);
      }
    }
    // The positive decision authorizes opening a REVIEW issue about production binding -- it must not
    // read as binding production itself (no bare "_bound"/"_binds" verb form).
    expect(PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS[0]).toBe('may_open_player_history_production_binding_review_issue');
  });

  it('the review module performs no file I/O (pure function only)', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'src/rehearsal/playerHistory2024From2021_2023ThresholdReview.ts'), 'utf-8');
    expect(source).not.toMatch(/readFileSync|writeFileSync|require\(['"]fs['"]\)/);
  });

  it('the review module has zero imports: fully self-contained, no dependency surface at all', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'src/rehearsal/playerHistory2024From2021_2023ThresholdReview.ts'), 'utf-8');
    const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
    expect(importLines).toEqual([]);
  });

  it('the CLI script imports nothing from production Forecast (no seasonalPprModel, server, routes, scoring, board, fusion, services)', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'scripts/runPlayerHistory2024From2021_2023ThresholdReview.ts'), 'utf-8');
    const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).not.toMatch(/seasonalPprModel|\/server|\/routes|\/scoring|\/board|\/fusion|\/services/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Committed report (the real #139 output).
// ---------------------------------------------------------------------------------------------

describe('committed 2024-from-2021-2023 threshold-review report', () => {
  const REPORT_PATH = 'docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.json';
  const report = readRepoJson<{
    cited_documents: {
      threshold_framework: { path: string; source_pr: string; decision: string };
      prior_origin_evidence: { path: string; decision: string };
      new_origin_evidence: { path: string; source_pr: string; decision: string };
    };
    review: {
      decision: string;
      identity_passed: boolean;
      components_passed_both_origins: boolean;
      per_origin_summary: Array<{ origin_label: string; all_components_passed: boolean }>;
      feature_composition_gate: { bar_cleared: boolean; observed_gap_pct: number; threshold_pct: number } | null;
      boundary_statements: Record<string, boolean>;
    };
  }>(REPORT_PATH);

  it('cites the exact #132 framework, #121/#122 prior evidence, and #137/#138 new evidence', () => {
    expect(report.cited_documents.threshold_framework.path).toBe('docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json');
    expect(report.cited_documents.threshold_framework.decision).toBe(EXPECTED_THRESHOLD_FRAMEWORK_DECISION);
    expect(report.cited_documents.prior_origin_evidence.decision).toBe(EXPECTED_PRIOR_ORIGIN_DECISION);
    expect(report.cited_documents.new_origin_evidence.path).toBe('docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.json');
    expect(report.cited_documents.new_origin_evidence.decision).toBe(EXPECTED_NEW_ORIGIN_DECISION);
  });

  it('identity checks passed and every quantitative component passed for both real origins', () => {
    expect(report.review.identity_passed).toBe(true);
    expect(report.review.components_passed_both_origins).toBe(true);
    expect(report.review.per_origin_summary).toHaveLength(2);
    expect(report.review.per_origin_summary.every((s) => s.all_components_passed)).toBe(true);
  });

  it('emits the ceiling decision and it is one of the three allowed #139 values', () => {
    expect(report.review.decision).toBe('may_open_player_history_production_binding_review_issue');
    expect(PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_DECISIONS).toContain(report.review.decision);
  });

  it('every boundary statement confirms no threshold amendment and no production binding', () => {
    expect(Object.values(report.review.boundary_statements).every((v) => v === true)).toBe(true);
    expect(report.review.boundary_statements.no_production_binding_authorized).toBe(true);
    expect(report.review.boundary_statements.no_threshold_amended).toBe(true);
    expect(report.review.boundary_statements.does_not_authorize_full_feature_set_production_wiring).toBe(true);
  });

  it('the feature-composition gate is reported honestly: uncleared (0.35% <= 2%), production_only stays default', () => {
    expect(report.review.feature_composition_gate).not.toBeNull();
    expect(report.review.feature_composition_gate?.bar_cleared).toBe(false);
    expect(report.review.feature_composition_gate?.observed_gap_pct).toBe(0.35);
    expect(report.review.feature_composition_gate?.threshold_pct).toBe(2.0);
  });
});
