/**
 * Lane A identity-crosswalk validation tests (Forecast #158): the committed governed crosswalk
 * artifact passes the fail-closed validator against the committed mirror's locked population, every
 * focused negative case required by issue #158 is rejected, exactly one required decision is
 * emitted, and the crosswalk stays inert (never imported by model/production/downstream/UI paths).
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MIRROR_JSON_PATH, SOURCE_COMMIT } from '../src/rehearsal/rookieTransitionProfileMirror.js';
import {
  IDENTITY_CROSSWALK_AUDIT_DECISIONS,
  IDENTITY_CROSSWALK_KIND,
  IDENTITY_CROSSWALK_PATH,
  IDENTITY_CROSSWALK_ROW_FIELDS,
  IDENTITY_CROSSWALK_SCHEMA_VERSION,
  READINESS_DESIGN_MERGE_COMMIT,
  validateRookieTransitionProfileIdentityCrosswalk,
  type ArchivedCitation,
  type ArchivedEvidenceResolver,
  type IdentityCrosswalkArtifact,
  type IdentityCrosswalkRow,
  type ReviewedMappingEvidence,
} from '../src/rehearsal/rookieTransitionProfileIdentityCrosswalk.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoPath = (rel: string): string => path.join(REPO_ROOT, rel);
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const committedArtifact = JSON.parse(readFileSync(repoPath(IDENTITY_CROSSWALK_PATH), 'utf-8')) as IdentityCrosswalkArtifact;
const mirror = JSON.parse(readFileSync(repoPath(MIRROR_JSON_PATH), 'utf-8')) as { rows: Array<{ player_id: string }> };
const lockedIds = mirror.rows.map((r) => r.player_id);

/** No committed row cites archived evidence, so the committed-artifact resolver is never called. */
const neverResolve: ArchivedEvidenceResolver = () => {
  throw new Error('resolver must not be called for an artifact with no archived citations');
};

const clone = (): IdentityCrosswalkArtifact => JSON.parse(JSON.stringify(committedArtifact)) as IdentityCrosswalkArtifact;

const validate = (artifact: IdentityCrosswalkArtifact, resolver: ArchivedEvidenceResolver = neverResolve) =>
  validateRookieTransitionProfileIdentityCrosswalk(artifact, lockedIds, resolver);

// ---------------------------------------------------------------------------------------------
// Helpers to craft a structurally complete resolved 3.2 row for negative-case mutations
// ---------------------------------------------------------------------------------------------

const GSIS_A = '00-0099001';
const GSIS_B = '00-0099002';

const GSIS_ARCHIVE_CONTENT = `official roster record: player bound to gsis_id ${GSIS_A}; jersey 11; team PHI`;
const FACT_ARCHIVE_CONTENT = 'independent corroboration snapshot';

const citation = (content: string, pathSuffix: string): ArchivedCitation => ({
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  path: `data/experiments/rookieTransitionProfile/evidence/${pathSuffix}`,
  sha256: sha256(content),
});

const archiveResolver: ArchivedEvidenceResolver = (cited) => {
  for (const content of [GSIS_ARCHIVE_CONTENT, FACT_ARCHIVE_CONTENT]) {
    if (cited.sha256 === sha256(content)) return content;
  }
  return null;
};

// Deliberately fictional reviewer: these fixtures exercise validator structure only and must never
// read as a claim that any real person signed off on a mapping (issue #158 human-review checkpoint).
const FIXTURE_REVIEWER = 'Hypothetical Reviewer (test fixture only)';

const makeReviewedMappingEvidence = (resolvesTo: string): ReviewedMappingEvidence => ({
  evidence_class: '3.2_reviewed_mapping',
  resolves_to_forecast_canonical_player_id: resolvesTo,
  reviewer: FIXTURE_REVIEWER,
  reviewed_at: '2026-07-12',
  gsis_bearing_evidence: {
    description: 'archived official roster record stating the exact gsis_id alongside identifying player information',
    archived_citation: citation(GSIS_ARCHIVE_CONTENT, 'gsis_bearing.txt'),
    original_url: 'https://example.test/roster',
    retrieved_at: '2026-07-12',
  },
  corroborating_facts: [
    {
      fact: 'jersey number 11 matches the archived signing announcement',
      archived_citation: citation(FACT_ARCHIVE_CONTENT, 'fact_jersey.txt'),
      original_url: 'https://example.test/signing',
      retrieved_at: '2026-07-12',
    },
    {
      fact: 'signing team PHI and signing date match the archived transaction log',
      archived_citation: citation(FACT_ARCHIVE_CONTENT, 'fact_team.txt'),
      original_url: 'https://example.test/transactions',
      retrieved_at: '2026-07-12',
    },
  ],
});

/** Rewrites the first row into a hypothetically resolved 3.2 row, keeping the count invariant. */
const withResolvedFirstRow = (mutate?: (row: IdentityCrosswalkRow) => void): IdentityCrosswalkArtifact => {
  const artifact = clone();
  const row = artifact.rows[0];
  row.resolution_status = 'resolved';
  row.forecast_canonical_player_id = GSIS_A;
  row.resolution_evidence_class = '3.2_reviewed_mapping';
  row.resolution_evidence = [makeReviewedMappingEvidence(GSIS_A)];
  row.reviewer = FIXTURE_REVIEWER;
  row.reviewed_at = '2026-07-12';
  artifact.status_counts = { resolved: 1, unresolved: 47, conflicting_evidence: 0, blocked: 0 };
  mutate?.(row);
  return artifact;
};

// ---------------------------------------------------------------------------------------------

describe('committed rookie_transition_profile_v0 Forecast identity crosswalk (#158)', () => {
  it('passes the fail-closed validator against the committed mirror population', () => {
    const result = validate(committedArtifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('kind/schema_version/design pins are exact', () => {
    expect(committedArtifact.kind).toBe(IDENTITY_CROSSWALK_KIND);
    expect(committedArtifact.schema_version).toBe(IDENTITY_CROSSWALK_SCHEMA_VERSION);
    expect(committedArtifact.issue).toBe('TIBER-Forecast#158');
    expect(committedArtifact.governing_design.readiness_design_merge_commit).toBe(READINESS_DESIGN_MERGE_COMMIT);
    expect(committedArtifact.source_lock.commit).toBe(SOURCE_COMMIT);
  });

  it('contains exactly the 48 locked source identities, every one honestly unresolved', () => {
    expect(committedArtifact.rows.length).toBe(48);
    expect(new Set(committedArtifact.rows.map((r) => r.source_player_id))).toEqual(new Set(lockedIds));
    expect(committedArtifact.rows.every((r) => r.resolution_status === 'unresolved')).toBe(true);
    expect(committedArtifact.rows.every((r) => r.forecast_canonical_player_id === null)).toBe(true);
    expect(committedArtifact.rows.every((r) => r.resolution_evidence.length === 0)).toBe(true);
    expect(committedArtifact.rows.every((r) => r.identity_coverage_dependency === 'unproven')).toBe(true);
    expect(committedArtifact.status_counts).toEqual({ resolved: 0, unresolved: 48, conflicting_evidence: 0, blocked: 0 });
  });

  it('never claims a human review that did not occur -- reviewer and reviewed_at are null on every row', () => {
    expect(committedArtifact.rows.every((r) => r.reviewer === null && r.reviewed_at === null)).toBe(true);
  });

  it('every row carries all fourteen contract fields', () => {
    for (const row of committedArtifact.rows) {
      expect(Object.keys(row).sort()).toEqual([...IDENTITY_CROSSWALK_ROW_FIELDS].sort());
    }
  });

  it('emits exactly one required decision: requires_followup (48 unresolved rows pend §3.2 human review)', () => {
    const result = validate(committedArtifact);
    expect(IDENTITY_CROSSWALK_AUDIT_DECISIONS).toContain(result.decision);
    expect(result.decision).toBe('rookie_transition_profile_forecast_identity_resolution_audit_requires_followup');
  });

  it('reports the full audit accounting counts', () => {
    const result = validate(committedArtifact);
    expect(result.statusCounts).toEqual({ resolved: 0, unresolved: 48, conflicting_evidence: 0, blocked: 0 });
    expect(result.evidenceClassCounts).toEqual({
      null: 48,
      '3.1_overall_pick_chain': 0,
      '3.2_reviewed_mapping': 0,
      '3.3_governed_artifact': 0,
    });
    expect(result.identityCoverageDependencyCounts).toEqual({
      independent_of_post_draft_outcome: 0,
      contingent_on_post_draft_participation: 0,
      unproven: 48,
    });
  });
});

describe('fail-closed validator negative cases (#158 required test list)', () => {
  it('rejects a missing locked row', () => {
    const artifact = clone();
    artifact.rows.splice(10, 1);
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing locked row'))).toBe(true);
    expect(result.decision).toBe('rookie_transition_profile_forecast_identity_resolution_audit_blocked');
  });

  it('rejects an extra row', () => {
    const artifact = clone();
    const extra = JSON.parse(JSON.stringify(artifact.rows[0])) as IdentityCrosswalkRow;
    extra.source_player_id = 'wr-not-a-locked-identity';
    artifact.rows.push(extra);
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('extra row'))).toBe(true);
  });

  it('rejects a duplicate governed source key', () => {
    const artifact = clone();
    artifact.rows[5] = JSON.parse(JSON.stringify(artifact.rows[4])) as IdentityCrosswalkRow;
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate governed source key'))).toBe(true);
  });

  it('rejects an invalid resolution_status token', () => {
    const artifact = clone();
    (artifact.rows[0] as unknown as Record<string, unknown>).resolution_status = 'probably_fine';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not in the closed §5 enum'))).toBe(true);
  });

  it('rejects an invalid evidence-class token', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row as unknown as Record<string, unknown>).resolution_evidence_class = '3.4_vibes';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('resolution_evidence_class') && e.includes('closed enum'))).toBe(true);
  });

  it('accepts a structurally complete, archive-verified, human-signed 3.2 resolution (control case)', () => {
    const result = validate(withResolvedFirstRow(), archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.statusCounts.resolved).toBe(1);
  });

  it('rejects a resolved row without GSIS-bearing evidence', () => {
    const artifact = withResolvedFirstRow((row) => {
      delete ((row.resolution_evidence[0] as ReviewedMappingEvidence) as unknown as Record<string, unknown>).gsis_bearing_evidence;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('GSIS-bearing evidence'))).toBe(true);
  });

  it('rejects a resolved row with no evidence entries at all', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence = [];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('no structurally complete'))).toBe(true);
  });

  it('rejects a claimed GSIS ID absent from the archived evidence content', () => {
    const artifact = withResolvedFirstRow((row) => {
      // The archive content binds GSIS_A; claim GSIS_B instead, everywhere.
      row.forecast_canonical_player_id = GSIS_B;
      (row.resolution_evidence[0] as ReviewedMappingEvidence).resolves_to_forecast_canonical_player_id = GSIS_B;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not contain the claimed gsis_id'))).toBe(true);
  });

  it('rejects a non-reproducible archived citation (hash mismatch fails closed)', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).gsis_bearing_evidence.archived_citation.sha256 = sha256('different bytes');
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not reproducible'))).toBe(true);
  });

  it('rejects fewer than two corroborating facts for 3.2', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).corroborating_facts.splice(1);
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least two independent corroborating facts'))).toBe(true);
  });

  it('rejects a 3.2 resolution without a named human sign-off', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.reviewer = null;
      row.reviewed_at = null;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('attributable human sign-off'))).toBe(true);
  });

  it('rejects independent evidence resolving to a different GSIS ID', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.independent_resolution_evidence_class = '3.2_reviewed_mapping';
      const conflicting = makeReviewedMappingEvidence(GSIS_B);
      // Point the conflicting entry's archive at content that DOES contain GSIS_B, so the only
      // failure is the cross-entry disagreement, not archive verification.
      conflicting.gsis_bearing_evidence.archived_citation = citation(GSIS_ARCHIVE_CONTENT.replace(GSIS_A, GSIS_B), 'gsis_bearing_b.txt');
      row.resolution_evidence.push(conflicting);
    });
    const resolver: ArchivedEvidenceResolver = (cited) => {
      const candidates = [GSIS_ARCHIVE_CONTENT, GSIS_ARCHIVE_CONTENT.replace(GSIS_A, GSIS_B), FACT_ARCHIVE_CONTENT];
      for (const content of candidates) if (cited.sha256 === sha256(content)) return content;
      return null;
    };
    const result = validate(artifact, resolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status must be conflicting_evidence'))).toBe(true);
  });

  it('rejects an unsupported independent-evidence claim with no backing entry', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.independent_resolution_evidence_class = '3.3_governed_artifact';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('independent_resolution_evidence_class=3.3_governed_artifact is not backed'))).toBe(true);
  });

  it('rejects unsupported 3.1 usage while the second leg remains unproven', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.1_overall_pick_chain';
      row.resolution_evidence = [
        {
          evidence_class: '3.1_overall_pick_chain',
          resolves_to_forecast_canonical_player_id: GSIS_A,
          join_key: { draft_year: 2026, overall_pick: 2 },
          source_citations: [citation(GSIS_ARCHIVE_CONTENT, 'draft_results.json')],
        },
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('blocked_pending_second_leg_evidence'))).toBe(true);
  });

  it('rejects prohibited-method contamination in evidence (design §4)', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).corroborating_facts[0].fact =
        'fuzzy name match against the roster page';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('prohibited method marker'))).toBe(true);
  });

  it('rejects a locally invented GSIS ID on a self-attributed 3.3 governed artifact', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [
        {
          evidence_class: '3.3_governed_artifact',
          resolves_to_forecast_canonical_player_id: GSIS_A,
          governed_artifact_citation: { ...citation(GSIS_ARCHIVE_CONTENT, 'self_made.json'), schema_version: '1.0.0' },
        },
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('never originate'))).toBe(true);
  });

  it('rejects an unsupported independence claim (no citable mechanism)', () => {
    const artifact = clone();
    artifact.rows[0].identity_coverage_dependency = 'independent_of_post_draft_outcome';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a non-null identity_coverage_mechanism'))).toBe(true);
  });

  it('rejects status counts that do not sum to 48 / disagree with the rows', () => {
    const artifact = clone();
    artifact.status_counts = { resolved: 1, unresolved: 47, conflicting_evidence: 0, blocked: 0 };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status_counts.resolved declares 1'))).toBe(true);
  });

  it('rejects rows out of deterministic (source_season, source_player_id) order', () => {
    const artifact = clone();
    const [first] = artifact.rows.splice(0, 1);
    artifact.rows.push(first);
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not strictly ordered'))).toBe(true);
  });

  it('rejects a tampered source lock', () => {
    const artifact = clone();
    artifact.source_lock.commit = 'ffffffffffffffffffffffffffffffffffffffff';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('source_lock.commit'))).toBe(true);
  });
});

describe('inertness -- the crosswalk is outside all model, production, downstream, and UI paths', () => {
  const SCAN_DIRS = ['src/models', 'src/services', 'src/api', 'src/adapters', 'src/features', 'app'];
  const needles = ['identity_crosswalk', 'identityCrosswalk', 'rookieTransitionProfileIdentityCrosswalk'];

  const collectFiles = (dir: string): string[] => {
    const abs = repoPath(dir);
    const out: string[] = [];
    const walk = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) out.push(full);
      }
    };
    walk(abs);
    return out;
  };

  it('no model/service/api/adapter/feature/UI file references the crosswalk artifact or validator', () => {
    const hits: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of collectFiles(dir)) {
        const text = readFileSync(file, 'utf-8');
        for (const needle of needles) {
          if (text.includes(needle)) hits.push(`${file}: ${needle}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('no start/dev/build production script references the crosswalk', () => {
    const pkg = JSON.parse(readFileSync(repoPath('package.json'), 'utf-8')) as { scripts: Record<string, string> };
    for (const scriptName of ['start', 'dev', 'start:api', 'dev:api', 'build']) {
      expect(pkg.scripts[scriptName] ?? '').not.toContain('IdentityCrosswalk');
    }
  });
});
