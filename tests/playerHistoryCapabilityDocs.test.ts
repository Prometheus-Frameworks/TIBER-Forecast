/**
 * Completeness guardrail for the player-history governed-capability-path documentation (Forecast
 * #147). Documentation-only issue: this test does not exercise any behavior, it only pins that the
 * required content elements are present and that the doc does not misstate the capability's scope.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

const CAPABILITY_DOC = 'docs/capabilities/player-history-production-only-v0.md';
const PATTERN_DOC = 'docs/capabilities/README.md';

describe('player-history capability documentation (#147)', () => {
  const doc = readRepoText(CAPABILITY_DOC);

  it('records the exact capability/contract identity', () => {
    expect(doc).toContain('player_history_production_only_v0');
    expect(doc).toContain('1.0.0');
  });

  it('records the source-of-truth repo and promoted artifact identity', () => {
    expect(doc).toContain('Prometheus-Frameworks/TIBER-Data');
    expect(doc).toContain('exports/promoted/nfl/player_season_coverage_v0.json');
    expect(doc).toContain('d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac');
    expect(doc).toContain('TIBER-Data#202');
  });

  it('cites the Forecast mirrors and every report in the chain', () => {
    expect(doc).toContain('data/fixtures/tiberData/player_history_2021_2023_input_mirror.json');
    expect(doc).toContain('data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json');
    for (const reportStem of [
      'player-history-2024-from-2021-2023-mirror-refresh-2026-07-07',
      'player-history-2024-from-2021-2023-additional-validation-2026-07-07',
      'player-history-2024-from-2021-2023-threshold-review-2026-07-07',
      'player-history-production-binding-review-2026-07-08',
      'player-history-production-binding-implementation-2026-07-08',
      'player-history-production-binding-activation-verification-2026-07-08',
    ]) {
      expect(doc).toContain(reportStem);
    }
  });

  it('cites the exact decision emitted at every stage of the chain', () => {
    for (const decision of [
      'may_open_player_history_2024_from_2021_2023_additional_validation_issue',
      'may_open_player_history_2024_from_2021_2023_threshold_review_issue',
      'may_open_player_history_production_binding_review_issue',
      'may_open_player_history_production_binding_implementation_issue',
      'player_history_production_binding_implemented_pending_human_signoff',
      'player_history_production_binding_activation_verified',
    ]) {
      expect(doc).toContain(decision);
    }
  });

  it('records that default behavior is inert and activation is opt-in', () => {
    expect(doc.toLowerCase()).toMatch(/inert|byte-for-byte unaffected/);
    expect(doc).toContain('--enable-player-history-production-only');
  });

  it('records the fail-closed provenance/model-gate principles', () => {
    expect(doc).toContain('verifyPlayerHistoryMirrorProvenance');
    expect(doc).toContain('resolveGatedPlayerHistory');
  });

  it('explicitly states production_only, not the full feature set, is authorized', () => {
    expect(doc).toMatch(/production_only/);
    expect(doc).toMatch(/full[- ]feature[- ]set/i);
    expect(doc).toContain('0.35%');
  });

  it('explicitly states what this capability does NOT authorize', () => {
    expect(doc).toMatch(/does not authorize|not authorize/i);
    expect(doc.toLowerCase()).toContain('fantasy');
    expect(doc.toLowerCase()).toContain('tiber-data change');
  });

  it('does not claim a new implementation decision or production-readiness beyond what #144/#146 already established', () => {
    expect(doc).not.toMatch(/player_history_production_binding_implemented_and_signed_off/);
    expect(doc.toLowerCase()).not.toContain('production-ready for all users');
  });

  it('references the general governed-capability-path pattern doc', () => {
    expect(doc).toContain('README.md');
  });
});

describe('governed capability path pattern documentation (#147)', () => {
  const doc = readRepoText(PATTERN_DOC);

  it('documents all eight stages of the governed capability path', () => {
    for (const stage of [
      'capability identified',
      'owned source artifact',
      'mirror',
      'validation',
      'threshold review',
      'binding review',
      'implementation',
      'activation verification',
    ]) {
      expect(doc.toLowerCase()).toContain(stage.toLowerCase());
    }
  });

  it('states that permissions narrow rather than escalate at each stage', () => {
    expect(doc.toLowerCase()).toMatch(/narrowing|not.*escalat/);
  });

  it('references player-history as the reference instance', () => {
    expect(doc).toContain('player-history-production-only-v0.md');
  });

  it('instructs future capabilities to add a sibling doc rather than editing this one', () => {
    expect(doc.toLowerCase()).toContain('sibling file');
  });
});
