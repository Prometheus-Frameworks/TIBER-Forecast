/**
 * Guardrail tests for the player-history production-only source binding (Forecast #143).
 *
 * Covers: fail-closed provenance verification against the locked TIBER-Data artifact identity,
 * correct trailing-history feature computation against the REAL committed mirror file, explicit
 * (never zero-filled) missing-history handling, and that attaching player-history never mutates the
 * input observations.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { SeasonalPlayerObservation } from '../src/contracts/seasonalPprBacktest.js';
import {
  attachPlayerHistoryProductionOnly,
  buildPlayerHistoryProductionOnlyIndex,
  LOCKED_PLAYER_HISTORY_ARTIFACT_MANIFEST_PATH,
  LOCKED_PLAYER_HISTORY_ARTIFACT_PATH,
  LOCKED_PLAYER_HISTORY_ARTIFACT_REPO,
  LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
  LOCKED_PLAYER_HISTORY_ARTIFACT_STATUS,
  LOCKED_PLAYER_HISTORY_MIRROR_PATH,
  LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT,
  LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW,
  PLAYER_HISTORY_PRODUCTION_ONLY_INPUT_SEASONS,
  type PlayerHistoryProductionOnlyMirrorDocument,
  verifyPlayerHistoryMirrorProvenance,
} from '../src/datasets/seasonal/playerHistoryProductionOnlySource.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;
const readRepoText = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

const realMirror = (): PlayerHistoryProductionOnlyMirrorDocument => readRepoJson(LOCKED_PLAYER_HISTORY_MIRROR_PATH);

const validGovernedSource = () => ({
  repo: LOCKED_PLAYER_HISTORY_ARTIFACT_REPO,
  promotedArtifactPath: LOCKED_PLAYER_HISTORY_ARTIFACT_PATH,
  promotedManifestPath: LOCKED_PLAYER_HISTORY_ARTIFACT_MANIFEST_PATH,
  promotionMergeCommit: LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT,
  promotionReview: LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW,
  sha256: LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256,
  artifactStatus: LOCKED_PLAYER_HISTORY_ARTIFACT_STATUS,
});

const minimalValidMirror = (overrides: Partial<PlayerHistoryProductionOnlyMirrorDocument> = {}): PlayerHistoryProductionOnlyMirrorDocument => ({
  kind: 'player_history_2024_from_2021_2023_input_mirror',
  governed_source: validGovernedSource(),
  input_window: { seasons: [...PLAYER_HISTORY_PRODUCTION_ONLY_INPUT_SEASONS], season_type: 'REG', target_season_excluded: 2024 },
  rows: [],
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
// Fail-closed provenance verification.
// ---------------------------------------------------------------------------------------------

describe('verifyPlayerHistoryMirrorProvenance (fail-closed)', () => {
  it('passes silently for a mirror matching the locked identity exactly', () => {
    expect(() => verifyPlayerHistoryMirrorProvenance(minimalValidMirror())).not.toThrow();
  });

  it('throws when sha256 does not match the locked artifact identity', () => {
    const mirror = minimalValidMirror({ governed_source: { ...validGovernedSource(), sha256: 'deadbeef' } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/sha256/);
  });

  it('throws when the repo does not match', () => {
    const mirror = minimalValidMirror({ governed_source: { ...validGovernedSource(), repo: 'Prometheus-Frameworks/some-other-repo' } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/repo/);
  });

  it('throws when the artifact path does not match', () => {
    const mirror = minimalValidMirror({ governed_source: { ...validGovernedSource(), promotedArtifactPath: 'exports/promoted/nfl/some_other_artifact.json' } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/promotedArtifactPath/);
  });

  it('throws when the promotion review reference does not match', () => {
    const mirror = minimalValidMirror({ governed_source: { ...validGovernedSource(), promotionReview: 'TIBER-Data#999' } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/promotionReview/);
  });

  it('throws when the promotion merge commit does not match', () => {
    const mirror = minimalValidMirror({ governed_source: { ...validGovernedSource(), promotionMergeCommit: '0'.repeat(40) } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/promotionMergeCommit/);
  });

  it('throws when artifactStatus is not promoted_governed_artifact', () => {
    const mirror = minimalValidMirror({ governed_source: { ...validGovernedSource(), artifactStatus: 'candidate_pin' } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/artifactStatus/);
  });

  it('throws when the input window seasons are not exactly [2021, 2022, 2023]', () => {
    const mirror = minimalValidMirror({ input_window: { seasons: [2022, 2023, 2024], season_type: 'REG', target_season_excluded: 2025 } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/input_window.seasons/);
  });

  it('throws when season_type is not REG', () => {
    const mirror = minimalValidMirror({ input_window: { seasons: [2021, 2022, 2023], season_type: 'POST', target_season_excluded: 2024 } });
    expect(() => verifyPlayerHistoryMirrorProvenance(mirror)).toThrow(/season_type/);
  });

  it('reports every mismatch at once, not just the first', () => {
    const mirror = minimalValidMirror({ governed_source: { ...validGovernedSource(), sha256: 'x', repo: 'y' } });
    try {
      verifyPlayerHistoryMirrorProvenance(mirror);
      throw new Error('expected a throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/sha256/);
      expect(message).toMatch(/repo/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// buildPlayerHistoryProductionOnlyIndex against the REAL committed mirror.
// ---------------------------------------------------------------------------------------------

describe('buildPlayerHistoryProductionOnlyIndex against the real committed mirror', () => {
  it('verifies provenance before building anything (throws on a tampered real mirror)', () => {
    const tampered = { ...realMirror(), governed_source: { ...realMirror().governed_source, sha256: 'tampered' } };
    expect(() => buildPlayerHistoryProductionOnlyIndex(tampered)).toThrow(/sha256/);
  });

  it('builds a non-empty index keyed by player_id from the real mirror', () => {
    const index = buildPlayerHistoryProductionOnlyIndex(realMirror());
    expect(index.size).toBeGreaterThan(0);
    // Aaron Rodgers, 00-0023459, appears in the real mirror across all 3 seasons.
    expect(index.has('00-0023459')).toBe(true);
  });

  it('stamps the correct contract_id/version and the mirror sha256 onto every entry', () => {
    const index = buildPlayerHistoryProductionOnlyIndex(realMirror());
    const entry = index.get('00-0023459')!;
    expect(entry.contract_id).toBe('player_history_production_only_v0');
    expect(entry.contract_version).toBe('1.0.0');
    expect(entry.source_artifact_sha256).toBe(LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256);
  });

  it('computes trailing aggregates that are internally consistent (total = sum of the two prior seasons)', () => {
    const index = buildPlayerHistoryProductionOnlyIndex(realMirror());
    for (const [playerId, entry] of index) {
      if (entry.prior_season_1_ppr !== null && entry.prior_season_2_ppr !== null) {
        expect(entry.trailing_2yr_ppr_total).toBeCloseTo(entry.prior_season_1_ppr + entry.prior_season_2_ppr, 6);
        expect(entry.trailing_2yr_ppr_mean).toBeCloseTo(entry.trailing_2yr_ppr_total! / 2, 6);
        expect(entry.year_over_year_ppr_trend).toBeCloseTo(entry.prior_season_1_ppr - entry.prior_season_2_ppr, 6);
      } else {
        expect(entry.trailing_2yr_ppr_total, `${playerId} trailing_2yr_ppr_total should be null when a prior season is missing`).toBeNull();
        expect(entry.year_over_year_ppr_trend).toBeNull();
      }
    }
  });

  it('never produces a season_ppr value from season 2024 or later (no leakage)', () => {
    // Structural proof, not just an output check: every row consumed is asserted to be < the anchor
    // season by filterPlayerHistoryInputRows inside buildPlayerHistoryFeatures. Confirm the source
    // rows themselves never carry season >= 2024.
    const mirror = realMirror();
    for (const row of mirror.rows) {
      expect(row.season).toBeLessThan(2024);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// attachPlayerHistoryProductionOnly.
// ---------------------------------------------------------------------------------------------

describe('attachPlayerHistoryProductionOnly', () => {
  const observation = (player_id: string): SeasonalPlayerObservation => ({
    player_id,
    player_name: player_id,
    position: 'QB',
    team_2024: 'FA',
    games_2024: 17,
    ppr_2024: 300,
    receptions_2024: 0,
    targets_2024: 0,
    rush_attempts_2024: 100,
    ppr_2025_actual: 280,
  });

  it('attaches the matching feature block for a player present in the index', () => {
    const index = buildPlayerHistoryProductionOnlyIndex(realMirror());
    const [attached] = attachPlayerHistoryProductionOnly([observation('00-0023459')], index);
    expect(attached.player_history).not.toBeNull();
    expect(attached.player_history?.source_artifact_sha256).toBe(LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256);
  });

  it('sets player_history to explicit null (never zero-filled, never omitted) for a player absent from the index', () => {
    const index = buildPlayerHistoryProductionOnlyIndex(realMirror());
    const [attached] = attachPlayerHistoryProductionOnly([observation('00-0000000-not-real')], index);
    expect(attached.player_history).toBeNull();
    expect('player_history' in attached).toBe(true);
  });

  it('does not mutate the input observations array or its elements', () => {
    const index = buildPlayerHistoryProductionOnlyIndex(realMirror());
    const original = observation('00-0023459');
    const frozenCopy = { ...original };
    attachPlayerHistoryProductionOnly([original], index);
    expect(original).toEqual(frozenCopy);
    expect((original as SeasonalPlayerObservation).player_history).toBeUndefined();
  });

  it('is a pure function: attaching twice from the same index yields deep-equal results', () => {
    const index = buildPlayerHistoryProductionOnlyIndex(realMirror());
    const a = attachPlayerHistoryProductionOnly([observation('00-0023459')], index);
    const b = attachPlayerHistoryProductionOnly([observation('00-0023459')], index);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------------------------
// Module hygiene: no I/O beyond the documented pure-function boundary, no forbidden production
// consumer references, locked identity constants match the exact values #142/#143 required.
// ---------------------------------------------------------------------------------------------

describe('module hygiene and locked-identity fidelity', () => {
  it('the module performs no file I/O (reading the mirror is the caller\'s job)', () => {
    const source = readRepoText('src/datasets/seasonal/playerHistoryProductionOnlySource.ts');
    expect(source).not.toMatch(/readFileSync|writeFileSync|readFile\(|require\(['"]fs['"]\)/);
  });

  it('the locked identity constants match exactly what #143 required pinning', () => {
    expect(LOCKED_PLAYER_HISTORY_ARTIFACT_PATH).toBe('exports/promoted/nfl/player_season_coverage_v0.json');
    expect(LOCKED_PLAYER_HISTORY_ARTIFACT_SHA256).toBe('d45f612b207085df00b4b080e4f55ce1abbd060dcbf30b0bee777ff833ddd8ac');
    expect(LOCKED_PLAYER_HISTORY_PROMOTION_REVIEW).toBe('TIBER-Data#202');
    expect(LOCKED_PLAYER_HISTORY_PROMOTION_MERGE_COMMIT).toBe('711d6ee158d4e3bd116d1df4d76dea282200454d');
  });

  it('the real committed mirror file matches the locked identity today', () => {
    expect(() => verifyPlayerHistoryMirrorProvenance(realMirror())).not.toThrow();
  });

  it('does not import from any Fantasy/product/board/scoring/fusion/api-route module', () => {
    const source = readRepoText('src/datasets/seasonal/playerHistoryProductionOnlySource.ts');
    const importLines = source.split('\n').filter((line) => /\bfrom\s+['"][^'"]+['"]/.test(line));
    for (const line of importLines) {
      expect(line).not.toMatch(/\/board\/|\/scoring\/|\/fusion\/|\/api\/|\/market\//);
    }
  });
});
