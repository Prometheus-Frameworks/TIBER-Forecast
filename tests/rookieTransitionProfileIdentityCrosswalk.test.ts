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

import { MIRROR_JSON_PATH, SOURCE_COMMIT, SOURCE_REPO, SOURCE_SCHEMA_VERSION, SOURCE_SEASON } from '../src/rehearsal/rookieTransitionProfileMirror.js';
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
  type DisqualifiedEvidenceEntry,
  type GovernedArtifactEvidence,
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
// Two genuinely distinct contents -- two corroborating facts citing the same bytes are not
// "independent" (design §3.2), so fixtures must never reuse one archive for both.
const FACT_ARCHIVE_CONTENT_JERSEY = 'signing announcement archive: jersey number 11';
const FACT_ARCHIVE_CONTENT_TEAM = 'transaction log archive: signing team PHI, signing date 2026-05-02';

// rows[0] of the committed crosswalk (alphabetically first of the 48 locked identities).
const ROW_0_SOURCE_PLAYER_ID = 'qb-carson-beck';
const GOVERNED_ARTIFACT_SCHEMA_VERSION = '1.0.0';

/** One row of a hypothetical governed 3.3 artifact, matching the FULL four-field governed key. */
const governedArtifactRow = (overrides: Partial<{ source_player_id: string; gsis_id: string }> = {}) => ({
  source_repository: SOURCE_REPO,
  source_schema: SOURCE_SCHEMA_VERSION,
  source_player_id: ROW_0_SOURCE_PLAYER_ID,
  source_season: SOURCE_SEASON,
  gsis_id: GSIS_A,
  ...overrides,
});

const GOVERNED_ARTIFACT_CONTENT = JSON.stringify({
  schema_version: GOVERNED_ARTIFACT_SCHEMA_VERSION,
  rows: [governedArtifactRow()],
});
// Reproducible JSON with a `rows` array -- but no row's full governed key matches this source
// identity at all (zero matches), so the mapping cannot be proven for THIS player.
const GOVERNED_ARTIFACT_CONTENT_ZERO_MATCHES = JSON.stringify({
  schema_version: GOVERNED_ARTIFACT_SCHEMA_VERSION,
  rows: [governedArtifactRow({ source_player_id: 'someone-else-entirely' })],
});
// Two rows both matching the same full governed key -- ambiguous, ought never be picked arbitrarily.
const GOVERNED_ARTIFACT_CONTENT_MULTIPLE_MATCHES = JSON.stringify({
  schema_version: GOVERNED_ARTIFACT_SCHEMA_VERSION,
  rows: [governedArtifactRow(), governedArtifactRow()],
});
// Matches the full governed key exactly once -- but that row's own gsis_id disagrees with the claim.
const GOVERNED_ARTIFACT_CONTENT_TARGET_MISMATCH = JSON.stringify({
  schema_version: GOVERNED_ARTIFACT_SCHEMA_VERSION,
  rows: [governedArtifactRow({ gsis_id: GSIS_B })],
});
// The exact cross-row co-occurrence scenario a naive substring check would wrongly accept: one row
// names the right player with the WRONG id, a different row carries the RIGHT id for someone else.
const GOVERNED_ARTIFACT_CONTENT_CROSS_ROW_COOCCURRENCE = JSON.stringify({
  schema_version: GOVERNED_ARTIFACT_SCHEMA_VERSION,
  rows: [governedArtifactRow({ gsis_id: GSIS_B }), governedArtifactRow({ source_player_id: 'someone-else-entirely', gsis_id: GSIS_A })],
});
// Valid JSON, but no top-level array and no "rows" array -- not deterministically parseable per the
// contract this validator enforces (wrong/unsupported key name).
const GOVERNED_ARTIFACT_CONTENT_NO_ROWS_KEY = JSON.stringify({
  schema_version: GOVERNED_ARTIFACT_SCHEMA_VERSION,
  mappings: [governedArtifactRow()],
});
// Reproducible and correctly bound -- but the archived bytes declare a different schema_version
// than the citation claims.
const GOVERNED_ARTIFACT_CONTENT_SCHEMA_MISMATCH = JSON.stringify({
  schema_version: '2.0.0',
  rows: [governedArtifactRow()],
});

const citation = (content: string, pathSuffix: string): ArchivedCitation => ({
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  path: `data/experiments/rookieTransitionProfile/evidence/${pathSuffix}`,
  sha256: sha256(content),
});

const archiveResolver: ArchivedEvidenceResolver = (cited) => {
  for (const content of [
    GSIS_ARCHIVE_CONTENT,
    FACT_ARCHIVE_CONTENT_JERSEY,
    FACT_ARCHIVE_CONTENT_TEAM,
    GOVERNED_ARTIFACT_CONTENT,
    GOVERNED_ARTIFACT_CONTENT_ZERO_MATCHES,
    GOVERNED_ARTIFACT_CONTENT_MULTIPLE_MATCHES,
    GOVERNED_ARTIFACT_CONTENT_TARGET_MISMATCH,
    GOVERNED_ARTIFACT_CONTENT_CROSS_ROW_COOCCURRENCE,
    GOVERNED_ARTIFACT_CONTENT_NO_ROWS_KEY,
    GOVERNED_ARTIFACT_CONTENT_SCHEMA_MISMATCH,
    GOVERNED_BLOCKER_CONTENT,
    COVERAGE_MECHANISM_CONTENT_INDEPENDENT,
  ]) {
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
      expected_literal: 'jersey number 11',
      archived_citation: citation(FACT_ARCHIVE_CONTENT_JERSEY, 'fact_jersey.txt'),
      original_url: 'https://example.test/signing',
      retrieved_at: '2026-07-12',
    },
    {
      fact: 'signing team PHI matches the archived transaction log',
      expected_literal: 'signing team PHI',
      archived_citation: citation(FACT_ARCHIVE_CONTENT_TEAM, 'fact_team.txt'),
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

// Governed-blocker artifact fixtures (design §4/§5's "governed_blocker_citation" reason): a real
// governed-blocker record for THIS row's exact source key, mirroring the 3.3 exact-match contract.
const GOVERNED_BLOCKER_CONTENT = JSON.stringify({
  rows: [
    {
      ...governedArtifactRow(),
      blocker_reason: 'conflicting_governed_record',
      blocker_detail: 'a separately governed record independently disqualifies this candidate mapping',
    },
  ],
});

// identity_coverage_mechanism.citation fixture: a well-formed, reproducible, exact-key-matched
// governed record -- used to prove even a citation this well-shaped is still hard-rejected (#159
// review round 4: the value is unusable in schema 1.0.0 regardless of citation quality).
const COVERAGE_MECHANISM_CONTENT_INDEPENDENT = JSON.stringify({
  rows: [{ ...governedArtifactRow(), independent_of_post_draft_outcome: true }],
});

const disqualifiedEvidence = (overrides: Partial<DisqualifiedEvidenceEntry> = {}): DisqualifiedEvidenceEntry => ({
  evidence_class: '3.2_reviewed_mapping',
  disqualification_reason: 'prohibited_method',
  disqualification_detail: 'the only candidate mapping found relied on fuzzy name matching against a roster page (design §4)',
  // The REAL attempted-evidence payload -- what checkDisqualifiedEvidenceEntry actually scans for a
  // prohibited-method marker. Shaped like a genuine (if disqualified) corroborating-fact attempt.
  attempted_evidence: {
    corroborating_facts: [{ fact: 'fuzzy name match against the roster page' }],
  },
  ...overrides,
});

/** Rewrites the first row into a hypothetically blocked row with a real, verified disposition. */
const withBlockedFirstRow = (mutate?: (row: IdentityCrosswalkRow) => void): IdentityCrosswalkArtifact => {
  const artifact = clone();
  const row = artifact.rows[0];
  row.resolution_status = 'blocked';
  row.forecast_canonical_player_id = null;
  row.resolution_evidence_class = null;
  row.resolution_evidence = [disqualifiedEvidence() as unknown as IdentityCrosswalkRow['resolution_evidence'][number]];
  row.reviewer = FIXTURE_REVIEWER;
  row.reviewed_at = '2026-07-12';
  row.notes = 'blocked: the only candidate evidence found relied on fuzzy name matching (design §4); discovered during #158 audit fixture';
  artifact.status_counts = { resolved: 0, unresolved: 47, conflicting_evidence: 0, blocked: 1 };
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

  it('rejects a 3.2 corroborating fact whose archived citation is not reproducible (hash mismatch)', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).corroborating_facts[0].archived_citation.sha256 = sha256('fabricated fact bytes');
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("corroborating_facts[0]'s archived citation is not reproducible"))).toBe(true);
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

  it('rejects a resolved 3.2 row whose entry-level reviewer differs from the row-level reviewer', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).reviewer = 'A Completely Different Reviewer';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("entry's reviewer/reviewed_at must equal the row-level"))).toBe(true);
  });

  it('rejects a resolved 3.2 row whose entry-level reviewed_at differs from the row-level reviewed_at', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).reviewed_at = '2020-01-01';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("entry's reviewer/reviewed_at must equal the row-level"))).toBe(true);
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
      const candidates = [
        GSIS_ARCHIVE_CONTENT,
        GSIS_ARCHIVE_CONTENT.replace(GSIS_A, GSIS_B),
        FACT_ARCHIVE_CONTENT_JERSEY,
        FACT_ARCHIVE_CONTENT_TEAM,
      ];
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

  it('rejects 3.3 evidence whose citation cannot be reproduced from its archive', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [
        {
          evidence_class: '3.3_governed_artifact',
          resolves_to_forecast_canonical_player_id: GSIS_A,
          governed_artifact_citation: {
            repo: 'Prometheus-Frameworks/TIBER-Data',
            commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            path: 'exports/promoted/identity_crosswalk/fabricated.json',
            schema_version: '1.0.0',
            sha256: sha256('bytes nobody archived'),
          },
        },
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('governed_artifact_citation is not reproducible'))).toBe(true);
  });

  it('rejects independent_of_post_draft_outcome outright -- no governed coverage-proof contract exists in schema 1.0.0', () => {
    const artifact = clone();
    artifact.rows[0].identity_coverage_dependency = 'independent_of_post_draft_outcome';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('is not usable in schema 1.0.0'))).toBe(true);
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

  it('rejects a tampered issue reference', () => {
    const artifact = clone();
    artifact.issue = 'TIBER-Forecast#999';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('issue must be'))).toBe(true);
  });

  it('rejects a tampered governing-design merge commit', () => {
    const artifact = clone();
    artifact.governing_design.readiness_design_merge_commit = 'ffffffffffffffffffffffffffffffffffffffff';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('readiness_design_merge_commit must be'))).toBe(true);
  });

  it('rejects a tampered or incomplete governing-design document list', () => {
    const artifact = clone();
    artifact.governing_design.design_documents = [artifact.governing_design.design_documents[0]];
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('design_documents must be exactly'))).toBe(true);
  });
});

describe('3.3_governed_artifact verification (#159 review: exact governed-key mapping, not substring co-occurrence)', () => {
  const make3_3Evidence = (contentSha256: string, resolvesTo: string = GSIS_A): GovernedArtifactEvidence => ({
    evidence_class: '3.3_governed_artifact',
    resolves_to_forecast_canonical_player_id: resolvesTo,
    governed_artifact_citation: {
      repo: 'Prometheus-Frameworks/TIBER-Data',
      commit: 'cccccccccccccccccccccccccccccccccccccccc',
      path: 'exports/promoted/identity_crosswalk/tiber_identity_crosswalk_v2.json',
      schema_version: GOVERNED_ARTIFACT_SCHEMA_VERSION,
      sha256: contentSha256,
    },
  });

  it('accepts a structurally complete, archive-verified, exact-key-matched 3.3 resolution (control case)', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256(GOVERNED_ARTIFACT_CONTENT))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects 3.3 evidence whose citation cannot be reproduced from its archive', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256('bytes nobody archived'))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('governed_artifact_citation is not reproducible'))).toBe(true);
  });

  it('rejects 3.3 evidence whose cited archive cannot be deterministically parsed as JSON (no substring-search fallback)', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      // FACT_ARCHIVE_CONTENT_JERSEY is plain text, not JSON, even though it literally contains
      // neither GSIS_A nor a rows array -- the point is the parse failure itself, not content.
      row.resolution_evidence = [make3_3Evidence(sha256(FACT_ARCHIVE_CONTENT_JERSEY))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('could not be deterministically parsed as JSON'))).toBe(true);
  });

  it('rejects 3.3 evidence whose cited archive has no deterministic rows array', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256(GOVERNED_ARTIFACT_CONTENT_NO_ROWS_KEY))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not expose a deterministic rows array'))).toBe(true);
  });

  it('rejects 3.3 evidence whose cited archive has zero rows matching the full governed source key', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256(GOVERNED_ARTIFACT_CONTENT_ZERO_MATCHES))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('zero matches fails closed'))).toBe(true);
  });

  it('rejects 3.3 evidence whose cited archive has multiple rows matching the full governed source key (ambiguous)', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256(GOVERNED_ARTIFACT_CONTENT_MULTIPLE_MATCHES))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('multiple matches fails closed'))).toBe(true);
  });

  it('rejects 3.3 evidence whose single matching row maps this source identity to a different gsis_id (target mismatch)', () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256(GOVERNED_ARTIFACT_CONTENT_TARGET_MISMATCH))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('target mismatch fails closed'))).toBe(true);
  });

  it('rejects 3.3 evidence via cross-row string co-occurrence -- one row names the player, a DIFFERENT row carries the claimed id', () => {
    // The exact regression the review required: a naive substring scan over the whole document
    // would have wrongly accepted this (both strings appear somewhere in the file). The exact-key
    // match must instead find the ONE row for this player and see it maps to a different gsis_id.
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256(GOVERNED_ARTIFACT_CONTENT_CROSS_ROW_COOCCURRENCE))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('target mismatch fails closed'))).toBe(true);
  });

  it("rejects 3.3 evidence whose cited schema_version disagrees with the archived content's own declared schema_version", () => {
    const artifact = withResolvedFirstRow((row) => {
      row.resolution_evidence_class = '3.3_governed_artifact';
      row.resolution_evidence = [make3_3Evidence(sha256(GOVERNED_ARTIFACT_CONTENT_SCHEMA_MISMATCH))];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('declares schema_version/spec_version'))).toBe(true);
  });
});

describe('3.2 corroborating-fact verification (#159 review: verify claimed facts against archived bytes, and require independence)', () => {
  it('rejects a corroborating fact missing its expected_literal field', () => {
    const artifact = withResolvedFirstRow((row) => {
      const evidence = row.resolution_evidence[0] as ReviewedMappingEvidence;
      delete (evidence.corroborating_facts[0] as unknown as Record<string, unknown>).expected_literal;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('lacks fact/expected_literal/archived_citation'))).toBe(true);
  });

  it('rejects a corroborating fact whose archived content does not actually contain its claimed expected_literal', () => {
    const artifact = withResolvedFirstRow((row) => {
      const evidence = row.resolution_evidence[0] as ReviewedMappingEvidence;
      evidence.corroborating_facts[0].expected_literal = 'a phrase the archive never states';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not actually contain its claimed'))).toBe(true);
  });

  it('rejects corroborating facts that share the same archived content hash', () => {
    const artifact = withResolvedFirstRow((row) => {
      const evidence = row.resolution_evidence[0] as ReviewedMappingEvidence;
      evidence.corroborating_facts[1] = {
        ...evidence.corroborating_facts[1],
        archived_citation: evidence.corroborating_facts[0].archived_citation,
        expected_literal: evidence.corroborating_facts[0].expected_literal,
      };
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('shares its archived content hash'))).toBe(true);
  });

  it('rejects corroborating facts with identical fact text even when archives differ', () => {
    const artifact = withResolvedFirstRow((row) => {
      const evidence = row.resolution_evidence[0] as ReviewedMappingEvidence;
      evidence.corroborating_facts[1].fact = evidence.corroborating_facts[0].fact;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("repeats another corroborating fact's text verbatim"))).toBe(true);
  });

  it('rejects corroborating facts with identical original_url even when archives differ', () => {
    const artifact = withResolvedFirstRow((row) => {
      const evidence = row.resolution_evidence[0] as ReviewedMappingEvidence;
      evidence.corroborating_facts[1].original_url = evidence.corroborating_facts[0].original_url;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("repeats another corroborating fact's original_url"))).toBe(true);
  });
});

describe('blocked-row disposition (#159 review: a recognized evidence_class token alone must not manufacture a verified block)', () => {
  it('accepts a well-formed blocked row whose prohibited_method disqualification is mechanically verified, but never emits ..._complete (#159 review round 4: blocked is never terminal)', () => {
    const result = validate(withBlockedFirstRow(), archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.statusCounts.blocked).toBe(1);
    expect(result.verifiedBlockedCount).toBe(1);
    // Every claim and its "proof" were authored inside this same crosswalk PR by the same party --
    // mechanical verification rejects known-bad spoofs, but is not independent authority. A valid,
    // fully-verified blocked disposition therefore still only ever reaches requires_followup.
    expect(result.decision).toBe('rookie_transition_profile_forecast_identity_resolution_audit_requires_followup');
  });

  it('accepts a well-formed blocked row disqualified via non_reproducible_or_fabricated_evidence (archive reproduces but contradicts the claim)', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.resolution_evidence = [
        disqualifiedEvidence({
          disqualification_reason: 'non_reproducible_or_fabricated_evidence',
          disqualification_detail: 'the candidate GSIS-bearing source was claimed to bind GSIS_B, but the archive it actually cites never states that id',
          claimed_value: GSIS_B,
          disqualified_citation: { ...citation(GSIS_ARCHIVE_CONTENT, 'actually_only_binds_gsis_a.txt') },
        }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.verifiedBlockedCount).toBe(1);
  });

  it('accepts a well-formed blocked row disqualified via a reproducible, exact-key-matched governed_blocker_citation', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.resolution_evidence = [
        disqualifiedEvidence({
          disqualification_reason: 'governed_blocker_citation',
          disqualification_detail: 'a governed conflicting record rules out this candidate mapping',
          disqualified_citation: { ...citation(GOVERNED_BLOCKER_CONTENT, 'governed_blocker.json') },
        }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.verifiedBlockedCount).toBe(1);
  });

  it('rejects a bare blocked row with no attributable disposition, no notes, and no evidence', () => {
    const artifact = clone();
    artifact.rows[0].resolution_status = 'blocked';
    artifact.rows[0].notes = null;
    artifact.status_counts = { resolved: 0, unresolved: 47, conflicting_evidence: 0, blocked: 1 };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('attributable human disposition'))).toBe(true);
    expect(result.errors.some((e) => e.includes('non-empty notes'))).toBe(true);
    expect(result.errors.some((e) => e.includes('at least one resolution_evidence entry'))).toBe(true);
  });

  it("rejects the exact still-valid spoof the review identified: a recognized evidence_class with fabricated reviewer/notes but no real disqualification_reason", () => {
    const artifact = clone();
    const row = artifact.rows[0];
    row.resolution_status = 'blocked';
    row.forecast_canonical_player_id = null;
    row.resolution_evidence_class = null;
    row.resolution_evidence = [{ evidence_class: '3.2_reviewed_mapping' } as unknown as IdentityCrosswalkRow['resolution_evidence'][number]];
    row.reviewer = FIXTURE_REVIEWER;
    row.reviewed_at = '2026-07-12';
    row.notes = 'blocked for reasons';
    artifact.status_counts = { resolved: 0, unresolved: 47, conflicting_evidence: 0, blocked: 1 };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must declare a recognized disqualification_reason'))).toBe(true);
    expect(result.decision).not.toBe('rookie_transition_profile_forecast_identity_resolution_audit_complete');
  });

  it('rejects a disqualification_reason=prohibited_method claim with no attempted_evidence payload at all', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.resolution_evidence = [
        disqualifiedEvidence({ attempted_evidence: null }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a non-empty attempted_evidence payload'))).toBe(true);
  });

  it('rejects a disqualification_reason=prohibited_method claim when the marker only appears in disqualification_detail, not attempted_evidence', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.resolution_evidence = [
        disqualifiedEvidence({
          disqualification_detail: 'candidate relied on fuzzy matching', // marker here must NOT count
          attempted_evidence: { corroborating_facts: [{ fact: 'this text names no disqualifying method at all' }] },
        }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('no prohibited-method marker'))).toBe(true);
  });

  it('never emits ..._complete when all 48 rows use prohibited_method with the marker appearing only in disqualification_detail', () => {
    const artifact = clone();
    artifact.rows.forEach((row) => {
      row.resolution_status = 'blocked';
      row.forecast_canonical_player_id = null;
      row.resolution_evidence_class = null;
      row.resolution_evidence = [
        disqualifiedEvidence({
          disqualification_detail: 'candidate relied on fuzzy matching',
          attempted_evidence: { note: 'nothing disqualifying stated here' },
        }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
      row.reviewer = FIXTURE_REVIEWER;
      row.reviewed_at = '2026-07-12';
      row.notes = 'blocked for reasons';
    });
    artifact.status_counts = { resolved: 0, unresolved: 0, conflicting_evidence: 0, blocked: 48 };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.decision).not.toBe('rookie_transition_profile_forecast_identity_resolution_audit_complete');
    expect(result.verifiedBlockedCount).toBe(0);
  });

  it('rejects a disqualification_reason=non_reproducible_or_fabricated_evidence claim with no claimed_value', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.resolution_evidence = [
        disqualifiedEvidence({
          disqualification_reason: 'non_reproducible_or_fabricated_evidence',
          disqualification_detail: 'claims this citation does not reproduce',
          disqualified_citation: { ...citation(GSIS_ARCHIVE_CONTENT, 'no_claimed_value.txt') },
        }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a non-empty claimed_value'))).toBe(true);
  });

  it('rejects a disqualification_reason=non_reproducible_or_fabricated_evidence claim when the citation cannot be reproduced at all (unresolved availability is never proof)', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.resolution_evidence = [
        disqualifiedEvidence({
          disqualification_reason: 'non_reproducible_or_fabricated_evidence',
          disqualification_detail: 'claims this citation is fabricated because it cannot be fetched',
          claimed_value: GSIS_A,
          disqualified_citation: { ...citation('bytes nobody archived anywhere', 'unreachable.txt') },
        }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('proves only unresolved availability, never fabrication'))).toBe(true);
  });

  it('rejects a disqualification_reason=non_reproducible_or_fabricated_evidence claim when the cited evidence actually reproduces and contains the claimed value', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.resolution_evidence = [
        disqualifiedEvidence({
          disqualification_reason: 'non_reproducible_or_fabricated_evidence',
          disqualification_detail: 'claims this citation does not support the mapping',
          claimed_value: GSIS_A,
          disqualified_citation: { ...citation(GSIS_ARCHIVE_CONTENT, 'actually_fine.txt') },
        }) as unknown as IdentityCrosswalkRow['resolution_evidence'][number],
      ];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('the claimed defect is not real'))).toBe(true);
  });

  it('rejects a blocked row missing only its human disposition (reviewer/reviewed_at)', () => {
    const artifact = withBlockedFirstRow((row) => {
      row.reviewer = null;
      row.reviewed_at = null;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('attributable human disposition'))).toBe(true);
  });

  it('never emits ..._complete when every unresolved row is converted to an unsupported bare blocked label', () => {
    const artifact = clone();
    artifact.rows.forEach((row) => {
      row.resolution_status = 'blocked';
    });
    artifact.status_counts = { resolved: 0, unresolved: 0, conflicting_evidence: 0, blocked: 48 };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.decision).not.toBe('rookie_transition_profile_forecast_identity_resolution_audit_complete');
    expect(result.decision).toBe('rookie_transition_profile_forecast_identity_resolution_audit_blocked');
  });

  it('never emits ..._complete when every row is converted to blocked with a recognized-class-but-unverified spoof (reviewer/notes/evidence all present)', () => {
    // The review's precise concern: reviewer/reviewed_at/notes present, evidence non-empty, and a
    // recognized evidence_class -- but with no real, verified disqualification_reason anywhere.
    const artifact = clone();
    artifact.rows.forEach((row) => {
      row.resolution_status = 'blocked';
      row.forecast_canonical_player_id = null;
      row.resolution_evidence_class = null;
      row.resolution_evidence = [{ evidence_class: '3.2_reviewed_mapping' } as unknown as IdentityCrosswalkRow['resolution_evidence'][number]];
      row.reviewer = FIXTURE_REVIEWER;
      row.reviewed_at = '2026-07-12';
      row.notes = 'blocked for reasons';
    });
    artifact.status_counts = { resolved: 0, unresolved: 0, conflicting_evidence: 0, blocked: 48 };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.decision).not.toBe('rookie_transition_profile_forecast_identity_resolution_audit_complete');
    expect(result.verifiedBlockedCount).toBe(0);
  });

  it('permits a prohibited-method marker inside a properly disposed blocked row (that is the point of the disqualification)', () => {
    // The disqualified evidence entry legitimately names "fuzzy name matching" -- the very reason
    // the row is blocked. It must not itself trip the prohibited-method rejection that gates
    // `resolved` rows.
    const result = validate(withBlockedFirstRow(), archiveResolver);
    expect(result.errors.some((e) => e.includes('relies on prohibited method marker'))).toBe(false);
  });
});

describe('identity_coverage_dependency=independent_of_post_draft_outcome (#159 review round 4: hard-rejected, not self-certifiable)', () => {
  // Round 3 tried to verify this claim by resolving and exact-key-matching a cited artifact. The
  // review correctly identified that the cited artifact is still authored inside this same
  // crosswalk PR by the same party making the claim -- a self-declaring JSON row is not independent
  // proof, however precisely it is parsed and matched. Until a real governed coverage-proof contract
  // (required kind/schema/governing authority/acquisition mechanism) exists, this value is simply
  // unusable, mirroring how §3.1 stays hard-blocked pending its own missing precondition.
  const withIndependenceClaim = (citationContent: string): IdentityCrosswalkArtifact => {
    const artifact = clone();
    artifact.rows[0].identity_coverage_dependency = 'independent_of_post_draft_outcome';
    artifact.rows[0].identity_coverage_mechanism = {
      description: 'sourced from a governed pre-draft registry independent of roster outcome',
      citation: citation(citationContent, 'coverage_mechanism.json'),
    };
    return artifact;
  };

  it('rejects independent_of_post_draft_outcome even with a well-formed, reproducible, exact-key-matched citation', () => {
    const result = validate(withIndependenceClaim(COVERAGE_MECHANISM_CONTENT_INDEPENDENT), archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('is not usable in schema 1.0.0'))).toBe(true);
  });

  it('rejects independent_of_post_draft_outcome even with a fabricated/unreproducible citation (same outcome either way)', () => {
    const artifact = withIndependenceClaim('bytes nobody archived for a coverage-independence claim');
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('is not usable in schema 1.0.0'))).toBe(true);
  });

  it('never counts toward identityCoverageDependencyCounts.independent_of_post_draft_outcome for a valid artifact', () => {
    // The committed baseline (all 48 rows unproven) is the only valid state schema 1.0.0 permits.
    const result = validate(committedArtifact);
    expect(result.valid).toBe(true);
    expect(result.identityCoverageDependencyCounts.independent_of_post_draft_outcome).toBe(0);
  });
});

describe('citation commit format (#159 review: an immutable full 40-hex SHA, never a mutable ref)', () => {
  it('rejects a mutable ref (main) as a citation commit', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).gsis_bearing_evidence.archived_citation.commit = 'main';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('GSIS-bearing evidence'))).toBe(true);
  });

  it('rejects HEAD as a citation commit', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).gsis_bearing_evidence.archived_citation.commit = 'HEAD';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('GSIS-bearing evidence'))).toBe(true);
  });

  it('rejects an abbreviated SHA as a citation commit', () => {
    const artifact = withResolvedFirstRow((row) => {
      (row.resolution_evidence[0] as ReviewedMappingEvidence).gsis_bearing_evidence.archived_citation.commit = 'aaaaaaa';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('GSIS-bearing evidence'))).toBe(true);
  });

  it('accepts a full 40-character lowercase hex commit SHA (control case)', () => {
    const result = validate(withResolvedFirstRow(), archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
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
