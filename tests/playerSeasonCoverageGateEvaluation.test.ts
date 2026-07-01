import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPlayerSeasonCoverageEvidenceFromMirror,
  evaluatePlayerSeasonCoverageGateFromMirror,
  type MirroredPlayerSeasonCoverageEvidence,
} from '../src/public/index.js';

const FIXTURE_DIR = path.resolve(process.cwd(), 'data/fixtures/tiberData');
const readJson = <T>(name: string): T => JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf-8')) as T;

const mirror = readJson<MirroredPlayerSeasonCoverageEvidence>('player_season_coverage_v0_2022_2025.mirror.json');

describe('player_season_coverage_v0 gate evaluation against the real mirrored TIBER-Data evidence (#99)', () => {
  it('accepts the real mirrored candidate evidence and passes with may_design_experiment', () => {
    const { result } = evaluatePlayerSeasonCoverageGateFromMirror(mirror);
    expect(result.status).toBe('player_season_coverage_gate_passed');
    expect(result.decision).toBe('may_design_experiment');
    expect(result.blocking_reasons).toEqual([]);
  });

  it('builds evidence whose identity/provenance/scope reflect the real TIBER-Data #191 artifact', () => {
    const evidence = buildPlayerSeasonCoverageEvidenceFromMirror(mirror);
    expect(evidence.identity.status).toBe('candidate_evidence_artifact_not_promoted');
    expect(evidence.identity.row_grain).toBe('player_id + season + season_type');
    expect(evidence.scope.seasons_present).toEqual([2022, 2023, 2024, 2025]);
    expect(evidence.scope.season_type_values).toEqual(['REG']);
    expect(evidence.provenance.season_2024_source_backed).toBe(true);
    expect(evidence.provenance.fixture_or_scaffold_marker_hits).toBe(0);
  });

  it('carries the pinned sha256 of the real TIBER-Data source artifact in source identity', () => {
    const { source_identity } = evaluatePlayerSeasonCoverageGateFromMirror(mirror);
    expect(source_identity.tiber_data_source_sha256).toBe(mirror.governed_source.sha256);
    expect(source_identity.tiber_data_source_artifact_path).toBe(
      'data/processed/evidence/player_season_coverage_2022_2025.source_backed.json',
    );
    expect(source_identity.refs).toContain('TIBER-Data#190');
    expect(source_identity.refs).toContain('TIBER-Data#191');
  });

  it('the row sample includes a multi-team row with an explicit primary_team_rule (Shaheed 2025)', () => {
    const evidence = buildPlayerSeasonCoverageEvidenceFromMirror(mirror);
    const multiTeamRow = evidence.row_sample.find((row) => row.teams.length > 1);
    expect(multiTeamRow).toBeDefined();
    expect(multiTeamRow?.primary_team_rule).toBeTruthy();
  });

  it('the row sample includes a genuine zero (season target count) that is not conflated with unavailable fields', () => {
    const evidence = buildPlayerSeasonCoverageEvidenceFromMirror(mirror);
    const rodgers = evidence.row_sample.find((row) => row.player_id === '00-0023459');
    expect(rodgers?.usage_summary.targets).toBe(0);
    expect(rodgers?.usage_summary.snap_share).toBeNull();
  });

  it('fails closed if the mirrored artifact status is mutated away from candidate/evidence', () => {
    const mutated: MirroredPlayerSeasonCoverageEvidence = {
      ...mirror,
      identity: { ...mirror.identity, status: 'promoted' },
    };
    const { result } = evaluatePlayerSeasonCoverageGateFromMirror(mutated);
    expect(result.status).toBe('player_season_coverage_gate_failed_identity_status');
    expect(result.decision).toBe('must_not_consume');
  });

  it('is deterministic / reproducible', () => {
    const a = evaluatePlayerSeasonCoverageGateFromMirror(mirror).result;
    const b = evaluatePlayerSeasonCoverageGateFromMirror(mirror).result;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the committed durable report matches a fresh evaluation', () => {
    const committed = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'docs/reports/player-season-coverage-gate-2026-07-01.json'), 'utf-8'),
    ) as { final_status: string; final_decision: string; gate_result: unknown };
    const fresh = evaluatePlayerSeasonCoverageGateFromMirror(mirror);
    expect(committed.final_status).toBe(fresh.result.status);
    expect(committed.final_decision).toBe(fresh.result.decision);
    expect(committed.gate_result).toEqual(JSON.parse(JSON.stringify(fresh.result)));
  });
});
