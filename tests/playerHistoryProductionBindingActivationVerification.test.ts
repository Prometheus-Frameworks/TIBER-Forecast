/**
 * Guardrail tests for the player-history production-only binding activation verification (Forecast
 * #145). Pins the required failure modes: a merge-commit mismatch or build/test failure blocks the
 * verification outright, any other failing check downgrades to requires-followup, the decision enum
 * stays exactly the three #145 values, the module is pure, and the committed #145 report reflects a
 * fully-passing verification.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_MERGE_COMMIT,
  PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_DECISIONS,
  evaluatePlayerHistoryProductionBindingActivationVerification,
  type ActivationVerificationInput,
  type CheckResult,
} from '../src/rehearsal/playerHistoryProductionBindingActivationVerification.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;
const readRepoText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

const pass = (id: string): CheckResult => ({ id, description: id, passed: true, evidence: 'ok' });
const fail = (id: string): CheckResult => ({ id, description: id, passed: false, evidence: 'not ok' });

const passingInput = (overrides: Partial<ActivationVerificationInput> = {}): ActivationVerificationInput => ({
  mergeCommitVerified: true,
  defaultBehaviorUnchanged: pass('default_behavior_unchanged'),
  onlyApprovedFeaturesActivated: pass('only_approved_features_activated'),
  provenanceFailClosed: pass('provenance_fail_closed'),
  missingHistoryExplicit: pass('missing_history_explicit'),
  modelGateCannotBeBypassed: pass('model_gate_cannot_be_bypassed'),
  reportDisclosureAccurate: pass('report_disclosure_accurate'),
  deterministicReplayStable: pass('deterministic_replay_stable'),
  noUnrelatedOutputsChanged: pass('no_unrelated_outputs_changed'),
  buildAndTestPassed: pass('build_and_test_passed'),
  ...overrides,
});

describe('identity/build gate (fail-closed, blocks the whole verification)', () => {
  it('reaches the verified decision when everything passes', () => {
    const result = evaluatePlayerHistoryProductionBindingActivationVerification(passingInput());
    expect(result.all_passed).toBe(true);
    expect(result.decision).toBe('player_history_production_binding_activation_verified');
  });

  it('blocks when the merge commit cannot be confirmed', () => {
    const result = evaluatePlayerHistoryProductionBindingActivationVerification(passingInput({ mergeCommitVerified: false }));
    expect(result.decision).toBe('player_history_production_binding_activation_blocked');
  });

  it('blocks when build/test failed, even if every other check passed', () => {
    const result = evaluatePlayerHistoryProductionBindingActivationVerification(passingInput({ buildAndTestPassed: fail('build_and_test_passed') }));
    expect(result.decision).toBe('player_history_production_binding_activation_blocked');
  });

  it('blocked takes priority over any other failing check', () => {
    const result = evaluatePlayerHistoryProductionBindingActivationVerification(
      passingInput({ mergeCommitVerified: false, provenanceFailClosed: fail('provenance_fail_closed') }),
    );
    expect(result.decision).toBe('player_history_production_binding_activation_blocked');
  });
});

describe('individual verification points downgrade to requires-followup', () => {
  const fieldsToBreak: Array<keyof ActivationVerificationInput> = [
    'defaultBehaviorUnchanged',
    'onlyApprovedFeaturesActivated',
    'provenanceFailClosed',
    'missingHistoryExplicit',
    'modelGateCannotBeBypassed',
    'reportDisclosureAccurate',
    'deterministicReplayStable',
    'noUnrelatedOutputsChanged',
  ];

  it.each(fieldsToBreak)('a failing %s check downgrades to requires-followup, not blocked', (field) => {
    const result = evaluatePlayerHistoryProductionBindingActivationVerification(passingInput({ [field]: fail(String(field)) } as Partial<ActivationVerificationInput>));
    expect(result.decision).toBe('player_history_production_binding_activation_requires_followup');
    expect(result.decision_rationale).toContain(String(field));
  });

  it('never evaluates as verified when even one point fails', () => {
    const result = evaluatePlayerHistoryProductionBindingActivationVerification(passingInput({ deterministicReplayStable: fail('deterministic_replay_stable') }));
    expect(result.all_passed).toBe(false);
    expect(result.decision).not.toBe('player_history_production_binding_activation_verified');
  });
});

describe('decision-enum purity and module hygiene', () => {
  it('the decision enum contains exactly the three #145 values', () => {
    expect([...PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_DECISIONS]).toEqual([
      'player_history_production_binding_activation_verified',
      'player_history_production_binding_activation_requires_followup',
      'player_history_production_binding_activation_blocked',
    ]);
  });

  it('no decision value claims a new feature family, model redesign, or product behavior', () => {
    for (const decision of PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_DECISIONS) {
      for (const forbidden of ['full_feature_set', 'redesign', 'advice', 'ranking', 'fantasy']) {
        expect(decision.toLowerCase()).not.toContain(forbidden);
      }
    }
  });

  it('the expected merge commit constant matches PR #144', () => {
    expect(EXPECTED_MERGE_COMMIT).toBe('61b1237');
  });

  it('the module performs no file I/O and no subprocess execution (pure function only)', () => {
    const source = readRepoText('src/rehearsal/playerHistoryProductionBindingActivationVerification.ts');
    expect(source).not.toMatch(/readFileSync|writeFileSync|execSync|execFileSync|require\(['"]fs['"]\)|require\(['"]child_process['"]\)/);
  });

  it('the module has zero imports: fully self-contained', () => {
    const source = readRepoText('src/rehearsal/playerHistoryProductionBindingActivationVerification.ts');
    const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
    expect(importLines).toEqual([]);
  });

  it('is a pure function: identical input always yields an identical result', () => {
    const input = passingInput();
    const a = evaluatePlayerHistoryProductionBindingActivationVerification(input);
    const b = evaluatePlayerHistoryProductionBindingActivationVerification(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('committed activation-verification report (the real #145 output)', () => {
  const REPORT_PATH = 'docs/reports/player-history-production-binding-activation-verification-2026-07-08.json';
  const report = readRepoJson<{
    verified_against: { expected_merge_commit: string; merge_commit_verified: boolean; source_pr: string };
    review: {
      decision: string;
      checks: Array<{ id: string; passed: boolean }>;
      checks_passed_count: number;
      checks_total: number;
      all_passed: boolean;
      boundary_statements: Record<string, boolean>;
    };
  }>(REPORT_PATH);

  it('verified against the exact #144 merge commit', () => {
    expect(report.verified_against.expected_merge_commit).toBe('61b1237');
    expect(report.verified_against.merge_commit_verified).toBe(true);
    expect(report.verified_against.source_pr).toBe('TIBER-Forecast#144');
  });

  it('every one of the 10 checks passed', () => {
    expect(report.review.all_passed).toBe(true);
    expect(report.review.checks_passed_count).toBe(report.review.checks_total);
    for (const check of report.review.checks) {
      expect(check.passed, `check ${check.id} should have passed`).toBe(true);
    }
  });

  it('emits the verified decision', () => {
    expect(report.review.decision).toBe('player_history_production_binding_activation_verified');
    expect(PLAYER_HISTORY_PRODUCTION_BINDING_ACTIVATION_DECISIONS).toContain(report.review.decision);
  });

  it('every boundary statement confirms no scope expansion', () => {
    expect(Object.values(report.review.boundary_statements).every((v) => v === true)).toBe(true);
    expect(report.review.boundary_statements.verification_only_no_feature_expansion).toBe(true);
    expect(report.review.boundary_statements.no_full_feature_set_authorization).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Coverage gap found during #145 verification: the #143/#144 scope audits only checked a FIXED
// list of paths, so a brand-new, unlisted file that started referencing player-history would slip
// past them silently. This test scans the ENTIRE src/ tree so any future leak is caught regardless
// of whether anyone remembers to add the new file to a hardcoded list.
// ---------------------------------------------------------------------------------------------

describe('full-repository player-history scope scan (regression: fixed-list audits can miss new files)', () => {
  const FORBIDDEN_TERMS = ['player_history', 'player-history', 'playerHistory', 'PlayerHistory'];

  const AUTHORIZED_PATTERNS = [
    /^src\/models\/seasonal\/seasonalPprModel\.ts$/,
    /^src\/contracts\/seasonalPprBacktest\.ts$/,
    /^src\/datasets\/seasonal\/loadSeasonalPprDataset\.ts$/,
    /^src\/services\/runSeasonalPprBacktestService\.ts$/,
    /^src\/datasets\/seasonal\/playerHistoryProductionOnlySource\.ts$/,
    /^src\/rehearsal\/playerHistoryProductionBindingReview\.ts$/,
    /^src\/rehearsal\/playerHistoryProductionBindingImplementation\.ts$/,
    /^src\/rehearsal\/playerHistoryProductionBindingActivationVerification\.ts$/,
    /^src\/rehearsal\/playerHistory(?!ProductionBinding).*\.ts$/,
    /^src\/reports\/playerSeasonCoverageGate\.ts$/,
    /^src\/public\/index\.ts$/,
  ];

  const walk = (dir: string): string[] => {
    const entries = readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true });
    let files: string[] = [];
    for (const entry of entries) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) files = files.concat(walk(rel));
      else if (entry.name.endsWith('.ts')) files.push(rel);
    }
    return files;
  };

  it('every .ts file under src/ that references player-history is on the authorized list', () => {
    const allFiles = walk('src');
    expect(allFiles.length).toBeGreaterThan(50); // sanity: the walk actually found the tree
    const withReferences = allFiles.filter((f) => {
      const content = readRepoText(f);
      return FORBIDDEN_TERMS.some((term) => content.includes(term));
    });
    const unauthorized = withReferences.filter((f) => !AUTHORIZED_PATTERNS.some((p) => p.test(f)));
    expect(unauthorized, `unauthorized player-history references found in: ${unauthorized.join(', ')}`).toEqual([]);
    expect(withReferences.length).toBeGreaterThan(0); // sanity: the scan isn't vacuously passing
  });

  it('board, scoring, fusion, market, and API-route directories (outside studio) carry zero player-history references', () => {
    for (const dir of ['src/board', 'src/scoring', 'src/fusion', 'src/market']) {
      if (!existsSync(path.join(REPO_ROOT, dir))) continue;
      for (const f of walk(dir)) {
        const content = readRepoText(f);
        for (const term of FORBIDDEN_TERMS) {
          expect(content, `${f} should not reference player-history`).not.toContain(term);
        }
      }
    }
  });
});
