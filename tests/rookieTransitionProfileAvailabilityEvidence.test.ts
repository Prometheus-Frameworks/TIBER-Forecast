/**
 * Lane B source-availability validation tests (Forecast #160): the committed governed
 * availability-evidence artifact passes the fail-closed validator against the committed mirror's
 * locked population and real pinned values, every focused negative case required by issue #160 is
 * rejected, `eligible_at_cutoff`/`ineligible_after_cutoff` are hard-rejected outright in schema
 * 1.0.0, exactly one required decision is emitted, and the artifact stays inert (never imported by
 * model/production/downstream/UI paths).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MIRROR_DIR, MIRROR_CSV_PATH, MIRROR_JSON_PATH, MIRROR_MANIFEST_PATH, MIRROR_PROVENANCE_PATH, SOURCE_ROW_COUNT } from '../src/rehearsal/rookieTransitionProfileMirror.js';
import {
  AVAILABILITY_AUDIT_DECISIONS,
  AVAILABILITY_EVIDENCE_KIND,
  AVAILABILITY_EVIDENCE_PATH,
  AVAILABILITY_EVIDENCE_ROW_FIELDS,
  AVAILABILITY_EVIDENCE_SCHEMA_VERSION,
  FIELD_FAMILIES,
  MIRROR_SOURCE_COMMIT_PIN,
  READINESS_DESIGN_MERGE_COMMIT,
  validateRookieTransitionProfileAvailabilityEvidence,
  type AvailabilityEvidenceArtifact,
  type AvailabilityEvidenceRow,
  type FieldFamily,
  type MirrorVerificationContext,
} from '../src/rehearsal/rookieTransitionProfileAvailabilityEvidence.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoPath = (rel: string): string => path.join(REPO_ROOT, rel);
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const sha256OfBytes = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

// ---------------------------------------------------------------------------------------------
// Real committed fixtures -- mirrors exactly what the CLI builds (wrapper/mirror bytes and the
// mirror-directory listing dereferenced at the exact pinned commit via git, never the current
// worktree), so tests exercise the same mirror-verification context the real audit runs against.
// ---------------------------------------------------------------------------------------------

const resolveOwnRepoFileAtPin = (relPath: string): Buffer =>
  execFileSync('git', ['show', `${MIRROR_SOURCE_COMMIT_PIN}:${relPath}`], { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 });

const resolveOwnRepoDirFilenamesAtPin = (relDir: string): string[] =>
  execFileSync('git', ['ls-tree', '--name-only', MIRROR_SOURCE_COMMIT_PIN, '--', `${relDir}/`], { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 })
    .toString('utf-8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => path.basename(line));

const wrapperBytes = resolveOwnRepoFileAtPin(MIRROR_PROVENANCE_PATH);
const wrapper = JSON.parse(wrapperBytes.toString('utf-8')) as MirrorVerificationContext['wrapper'];
const mirrorJsonBytes = resolveOwnRepoFileAtPin(MIRROR_JSON_PATH);
const mirrorCsvBytes = resolveOwnRepoFileAtPin(MIRROR_CSV_PATH);
const mirrorManifestBytes = resolveOwnRepoFileAtPin(MIRROR_MANIFEST_PATH);
const mirrorJson = JSON.parse(mirrorJsonBytes.toString('utf-8')) as {
  rows: Array<{ player_id: string } & Record<FieldFamily, { value: unknown }>>;
};

const lockedSourcePlayerIds = mirrorJson.rows.map((r) => r.player_id);

const valuePresence: MirrorVerificationContext['valuePresence'] = {};
for (const row of mirrorJson.rows) {
  valuePresence[row.player_id] = Object.fromEntries(
    FIELD_FAMILIES.map((family) => [family, row[family].value !== null]),
  ) as Record<FieldFamily, boolean>;
}

/** Fresh deep copy each call so negative-case mutations to the context never leak between tests. */
const baseMirrorContext = (): MirrorVerificationContext => ({
  wrapper: JSON.parse(JSON.stringify(wrapper)) as MirrorVerificationContext['wrapper'],
  wrapperSha256: sha256OfBytes(wrapperBytes),
  recomputedMirrorHashes: {
    mirror_json: sha256OfBytes(mirrorJsonBytes),
    mirror_csv: sha256OfBytes(mirrorCsvBytes),
    mirror_manifest: sha256OfBytes(mirrorManifestBytes),
  },
  actualMirrorDirFilenames: resolveOwnRepoDirFilenamesAtPin(MIRROR_DIR),
  valuePresence: JSON.parse(JSON.stringify(valuePresence)) as MirrorVerificationContext['valuePresence'],
});

const committedArtifact = JSON.parse(readFileSync(repoPath(AVAILABILITY_EVIDENCE_PATH), 'utf-8')) as AvailabilityEvidenceArtifact;

const clone = (): AvailabilityEvidenceArtifact => JSON.parse(JSON.stringify(committedArtifact)) as AvailabilityEvidenceArtifact;

const validate = (
  artifact: AvailabilityEvidenceArtifact,
  lockedIds: readonly string[] = lockedSourcePlayerIds,
  mirrorContext: MirrorVerificationContext = baseMirrorContext(),
) => validateRookieTransitionProfileAvailabilityEvidence(artifact, lockedIds, mirrorContext);

// ---------------------------------------------------------------------------------------------
// Row indices: rows[0..4] of the committed artifact are qb-carson-beck (alphabetically first of
// the 48 locked identities), in FIELD_FAMILIES-alphabetical order.
// ---------------------------------------------------------------------------------------------

const FIRST_PLAYER = 'qb-carson-beck';
const ROW_AGE = 0; // age_at_entry, real mirror value present
const ROW_OUTCOME = 4; // official_postdraft_outcome, real mirror value present

// rb-kaelon-black's age_at_entry mirror value is null -- the one honest `unavailable` fixture we can
// mutate without breaking the value-presence agreement invariant.
const NULL_VALUE_PLAYER = 'rb-kaelon-black';
const NULL_VALUE_ROW_INDEX = committedArtifact.rows.findIndex(
  (r) => r.source_identity.source_player_id === NULL_VALUE_PLAYER && r.field_family === 'age_at_entry',
);

/** Mutates one row in place and keeps status_counts/status_counts_by_family consistent with the change. */
const withRowMutated = (
  artifact: AvailabilityEvidenceArtifact,
  rowIndex: number,
  mutate: (row: AvailabilityEvidenceRow) => void,
): AvailabilityEvidenceArtifact => {
  const row = artifact.rows[rowIndex];
  const family = row.field_family;
  const oldStatus = row.availability_status;
  mutate(row);
  const newStatus = row.availability_status;
  if (newStatus !== oldStatus) {
    artifact.status_counts[oldStatus] -= 1;
    artifact.status_counts[newStatus] += 1;
    artifact.status_counts_by_family[family][oldStatus] -= 1;
    artifact.status_counts_by_family[family][newStatus] += 1;
  }
  return artifact;
};

// ---------------------------------------------------------------------------------------------

describe('committed rookie_transition_profile_v0 Forecast availability evidence (#160)', () => {
  it('passes the fail-closed validator against the committed mirror population and real pinned values', () => {
    const result = validate(committedArtifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('kind/schema_version/design pins are exact', () => {
    expect(committedArtifact.kind).toBe(AVAILABILITY_EVIDENCE_KIND);
    expect(committedArtifact.schema_version).toBe(AVAILABILITY_EVIDENCE_SCHEMA_VERSION);
    expect(committedArtifact.issue).toBe('TIBER-Forecast#160');
    expect(committedArtifact.governing_design.readiness_design_merge_commit).toBe(READINESS_DESIGN_MERGE_COMMIT);
  });

  it('contains exactly 48 locked identities x 5 field families = 240 rows', () => {
    expect(committedArtifact.rows.length).toBe(SOURCE_ROW_COUNT * FIELD_FAMILIES.length);
    const pairs = new Set(committedArtifact.rows.map((r) => `${r.source_identity.source_player_id}::${r.field_family}`));
    expect(pairs.size).toBe(240);
  });

  it('never claims a human review or cutoff, and no row claims eligibility -- every timing field is null', () => {
    expect(committedArtifact.cutoff_at).toBeNull();
    expect(committedArtifact.cutoff_evidence_source).toBeNull();
    expect(committedArtifact.rows.every((r) => r.review_decision === null)).toBe(true);
    expect(committedArtifact.rows.every((r) => r.available_at === null)).toBe(true);
    expect(committedArtifact.rows.every((r) => r.evidence_source === null)).toBe(true);
    expect(committedArtifact.rows.every((r) => r.source_snapshot_as_of === null)).toBe(true);
    expect(committedArtifact.rows.every((r) => r.availability_status === 'unavailable' || r.availability_status === 'unresolved_no_availability_proof')).toBe(true);
  });

  it('every row carries all eight contract fields', () => {
    for (const row of committedArtifact.rows) {
      expect(Object.keys(row).sort()).toEqual([...AVAILABILITY_EVIDENCE_ROW_FIELDS].sort());
    }
  });

  it('emits exactly one required decision: requires_followup (223 rows pend availability proof)', () => {
    const result = validate(committedArtifact);
    expect(AVAILABILITY_AUDIT_DECISIONS).toContain(result.decision);
    expect(result.decision).toBe('rookie_transition_profile_forecast_source_availability_audit_requires_followup');
  });

  it('reports the full audit accounting counts, and every family sums to 48', () => {
    const result = validate(committedArtifact);
    expect(result.statusCounts).toEqual(committedArtifact.status_counts);
    for (const family of FIELD_FAMILIES) {
      const total = Object.values(result.statusCountsByFamily[family]).reduce((a, b) => a + b, 0);
      expect(total).toBe(SOURCE_ROW_COUNT);
    }
  });
});

describe('fail-closed validator negative cases (#160 required test list)', () => {
  it('rejects a missing locked row (missing identity)', () => {
    const artifact = clone();
    artifact.rows.splice(0, 5); // removes all five families for the first locked player
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing row'))).toBe(true);
    expect(result.decision).toBe('rookie_transition_profile_forecast_source_availability_audit_blocked');
  });

  it('rejects a missing single field family for an otherwise-present identity (missing family)', () => {
    const artifact = clone();
    artifact.rows.splice(ROW_AGE, 1); // drop only qb-carson-beck's age_at_entry row
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(`missing row: ${FIRST_PLAYER} has no row for field_family age_at_entry`))).toBe(true);
  });

  it('rejects an extra row for a player outside the 48 locked identities (extra identity)', () => {
    const artifact = clone();
    const extra = JSON.parse(JSON.stringify(artifact.rows[0])) as AvailabilityEvidenceRow;
    extra.source_identity.source_player_id = 'wr-not-a-locked-identity';
    artifact.rows.push(extra);
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('extra row'))).toBe(true);
  });

  it('rejects a duplicate (player, field_family) governed key (extra family / duplicate key)', () => {
    const artifact = clone();
    const duplicate = JSON.parse(JSON.stringify(artifact.rows[ROW_AGE])) as AvailabilityEvidenceRow;
    artifact.rows.push(duplicate);
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate governed row-family key'))).toBe(true);
    expect(result.errors.some((e) => e.includes('extra row'))).toBe(false);
  });

  it('rejects an invalid field_family enum token', () => {
    const artifact = clone();
    (artifact.rows[0] as unknown as Record<string, unknown>).field_family = 'made_up_family';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('is not in the closed enum'))).toBe(true);
  });

  it('rejects an invalid availability_status enum token', () => {
    const artifact = clone();
    (artifact.rows[0] as unknown as Record<string, unknown>).availability_status = 'probably_fine';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not in the closed §11 enum'))).toBe(true);
  });

  it('rejects a row with an extra field beyond the eight contract fields', () => {
    const artifact = clone();
    (artifact.rows[0] as unknown as Record<string, unknown>).extra_field = 'not permitted';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be exactly the eight contract fields'))).toBe(true);
  });

  it('rejects a row missing one of the eight contract fields', () => {
    const artifact = clone();
    delete (artifact.rows[0] as unknown as Record<string, unknown>).notes;
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be exactly the eight contract fields'))).toBe(true);
  });

  it('rejects rows out of deterministic (season, repository, schema, player_id, field_family) order', () => {
    const artifact = clone();
    const [first] = artifact.rows.splice(0, 1);
    artifact.rows.push(first);
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not strictly ordered'))).toBe(true);
  });

  it('rejects status counts that disagree with the recomputed rows', () => {
    const artifact = clone();
    artifact.status_counts.unavailable += 1;
    artifact.status_counts.unresolved_no_availability_proof -= 1;
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status_counts.unavailable declares'))).toBe(true);
  });

  it('rejects status_counts_by_family that disagree with the recomputed rows', () => {
    const artifact = clone();
    artifact.status_counts_by_family.age_at_entry.unavailable += 1;
    artifact.status_counts_by_family.age_at_entry.unresolved_no_availability_proof -= 1;
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status_counts_by_family.age_at_entry.unavailable declares'))).toBe(true);
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
});

describe('eligible_at_cutoff / ineligible_after_cutoff are hard-rejected outright in schema 1.0.0', () => {
  // No mechanical proxy (an archive containing a value and a timestamp somewhere) can prove they are
  // bound to one exact source record for this player/field_family, nor that a matched timestamp
  // specifically means "publicly knowable" rather than some other event/retrieval time. Rather than
  // keep layering narrower mechanical checks for that, both statuses are hard-rejected -- mirroring
  // how Lane A ultimately hard-rejected its own unverifiable 3.3_governed_artifact evidence class.
  it('rejects eligible_at_cutoff for a row with a present real mirror value, even with every other field properly null', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_AGE, (row) => {
      row.availability_status = 'eligible_at_cutoff';
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('eligible_at_cutoff is hard-rejected in schema 1.0.0'))).toBe(true);
  });

  it('rejects ineligible_after_cutoff for a row with a present real mirror value, even with every other field properly null', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_AGE, (row) => {
      row.availability_status = 'ineligible_after_cutoff';
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ineligible_after_cutoff is hard-rejected in schema 1.0.0'))).toBe(true);
  });

  it('rejects eligible_at_cutoff for official_postdraft_outcome the same way as any other family (the family-specific carve-out is now subsumed by the blanket hard-block)', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_OUTCOME, (row) => {
      row.availability_status = 'eligible_at_cutoff';
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('eligible_at_cutoff is hard-rejected in schema 1.0.0'))).toBe(true);
  });

  it('never emits ..._complete when every row is relabeled eligible_at_cutoff', () => {
    const artifact = clone();
    artifact.rows.forEach((row) => {
      row.availability_status = 'eligible_at_cutoff';
    });
    artifact.status_counts = { eligible_at_cutoff: 240, ineligible_after_cutoff: 0, unresolved_no_availability_proof: 0, unavailable: 0 };
    for (const family of FIELD_FAMILIES) {
      artifact.status_counts_by_family[family] = { eligible_at_cutoff: 48, ineligible_after_cutoff: 0, unresolved_no_availability_proof: 0, unavailable: 0 };
    }
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.decision).toBe('rookie_transition_profile_forecast_source_availability_audit_blocked');
  });
});

describe('non-null timing/evidence fields are hard-rejected for every row in schema 1.0.0', () => {
  it('rejects a non-null available_at', () => {
    const artifact = clone();
    (artifact.rows[ROW_AGE] as unknown as Record<string, unknown>).available_at = '2026-04-15T00:00:00-04:00';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('available_at must be null in schema 1.0.0'))).toBe(true);
  });

  it('rejects a non-null evidence_source', () => {
    const artifact = clone();
    (artifact.rows[ROW_AGE] as unknown as Record<string, unknown>).evidence_source = { anything: 'not permitted' };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('evidence_source must be null in schema 1.0.0'))).toBe(true);
  });

  it('rejects a non-null review_decision on any row, not only unavailable/unresolved ones', () => {
    const artifact = clone();
    (artifact.rows[ROW_AGE] as unknown as Record<string, unknown>).review_decision = { reviewer: 'Someone', reviewed_at: '2026-07-13' };
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('review_decision must be null in schema 1.0.0'))).toBe(true);
  });

  it('rejects a non-null cutoff_at', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    artifact.cutoff_at = '2026-04-20T00:00:00-04:00';
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cutoff_at must be null in schema 1.0.0'))).toBe(true);
  });

  it('rejects a non-null cutoff_evidence_source', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    artifact.cutoff_evidence_source = { anything: 'not permitted' };
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cutoff_evidence_source must be null in schema 1.0.0'))).toBe(true);
  });

  it('rejects any non-null source_snapshot_as_of, even a well-formed instant -- no reproducible snapshot-evidence contract exists yet', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_AGE, (row) => {
      (row as unknown as Record<string, unknown>).source_snapshot_as_of = '2026-07-13T00:00:00-04:00';
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('source_snapshot_as_of must be null in schema 1.0.0'))).toBe(true);
  });
});

describe('value-presence agreement (design §11/§15: `unavailable` iff the pinned mirror value is null)', () => {
  it('rejects `unavailable` claimed for a player/family whose real mirror value is actually present', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_AGE, (row) => {
      row.availability_status = 'unavailable';
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('a present value can never be marked unavailable'))).toBe(true);
  });

  it('rejects a non-unavailable status for a player/family whose real mirror value is actually null', () => {
    const artifact = clone();
    withRowMutated(artifact, NULL_VALUE_ROW_INDEX, (row) => {
      row.availability_status = 'unresolved_no_availability_proof';
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('the pinned mirror value is actually null for this player/family'))).toBe(true);
  });

  it('control case: the committed unavailable row for the real null-valued player/family passes', () => {
    expect(committedArtifact.rows[NULL_VALUE_ROW_INDEX].availability_status).toBe('unavailable');
    const result = validate(committedArtifact);
    expect(result.valid).toBe(true);
  });
});

describe('nested schema closure (no nested object may carry an undeclared extra key)', () => {
  it('rejects a governing_design with an extra undeclared key', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    (artifact.governing_design as Record<string, unknown>).extra_claim = 'not permitted';
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('governing_design fields must be exactly'))).toBe(true);
  });

  it('rejects a mirror_source with an extra undeclared key', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    (artifact.mirror_source as Record<string, unknown>).extra_claim = 'not permitted';
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('mirror_source fields must be exactly'))).toBe(true);
  });

  it('rejects a source_identity with an extra undeclared key', () => {
    const artifact = clone();
    (artifact.rows[0].source_identity as unknown as Record<string, unknown>).extra_claim = 'not permitted';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('source_identity must carry exactly the four contract fields'))).toBe(true);
  });

  it('rejects a status_counts with an extra undeclared status key', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    (artifact.status_counts as Record<string, unknown>).extra_status = 0;
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status_counts fields must be exactly'))).toBe(true);
  });

  it('rejects a status_counts_by_family with an extra undeclared family key', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    (artifact.status_counts_by_family as Record<string, unknown>).extra_family = {
      eligible_at_cutoff: 0,
      ineligible_after_cutoff: 0,
      unresolved_no_availability_proof: 0,
      unavailable: 0,
    };
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status_counts_by_family fields must be exactly'))).toBe(true);
  });

  it('rejects a status_counts_by_family entry with an extra undeclared status key', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    ((artifact.status_counts_by_family as Record<string, unknown>).draft_capital as Record<string, unknown>).extra_status = 0;
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status_counts_by_family.draft_capital fields must be exactly'))).toBe(true);
  });

  it('rejects a row whose notes is neither null nor a string', () => {
    const artifact = clone();
    (artifact.rows[0] as unknown as Record<string, unknown>).notes = 12345;
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('notes must be null or a string'))).toBe(true);
  });
});

describe('top-level artifact schema closure', () => {
  it('rejects an artifact with an extra, undeclared top-level field', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    artifact.undeclared_extra_claim = 'not permitted';
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('top-level fields must be exactly the governed contract fields'))).toBe(true);
  });

  it('rejects an artifact missing a required top-level field', () => {
    const artifact = clone() as unknown as Record<string, unknown>;
    delete artifact.generated_at_is_operational_timestamp_only_not_fact_availability;
    const result = validate(artifact as unknown as AvailabilityEvidenceArtifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('top-level fields must be exactly the governed contract fields'))).toBe(true);
  });

  it('rejects a generated_at that is not a parseable, offset-bearing instant', () => {
    const artifact = clone();
    (artifact as unknown as Record<string, unknown>).generated_at = '2026-07-13';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('generated_at must be a fully-qualified, offset-bearing ISO-8601 instant'))).toBe(true);
  });

  it('rejects a generated_at_is_operational_timestamp_only_not_fact_availability that is not exactly true', () => {
    const artifact = clone();
    (artifact as unknown as Record<string, unknown>).generated_at_is_operational_timestamp_only_not_fact_availability = false;
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('generated_at_is_operational_timestamp_only_not_fact_availability must be exactly true'))).toBe(true);
  });

  it('control case: the committed artifact passes the top-level schema-closure and generated_at checks', () => {
    const result = validate(committedArtifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('mirror wrapper dereferencing (design §9: never trust a wrapper self-report)', () => {
  it('rejects a mirror_source.sha256 that does not match the recomputed hash of the actual wrapper file', () => {
    const artifact = clone();
    artifact.mirror_source.sha256 = sha256('fabricated bytes');
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not match the recomputed SHA-256 of the actual committed wrapper file'))).toBe(true);
  });

  it('rejects a mirror_source.commit that is not the pinned commit', () => {
    const artifact = clone();
    artifact.mirror_source.commit = 'main';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('mirror_source.commit must be the pinned Forecast commit'))).toBe(true);
  });

  it('rejects a mirror_source.commit that is a well-formed but different 40-hex SHA than the pinned commit (a different commit cannot silently pass just by looking like a SHA)', () => {
    const artifact = clone();
    artifact.mirror_source.commit = 'ffffffffffffffffffffffffffffffffffffffff';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('mirror_source.commit must be the pinned Forecast commit'))).toBe(true);
  });

  it('rejects a mirror_source.repo that does not match the pinned Forecast repo', () => {
    const artifact = clone();
    artifact.mirror_source.repo = 'Prometheus-Frameworks/TIBER-Data';
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('mirror_source.repo must be'))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose declared mirrored_hashes disagree with the recomputed hashes of the actual mirror files', () => {
    const context = baseMirrorContext();
    context.recomputedMirrorHashes.mirror_json = sha256('different bytes entirely');
    const result = validate(committedArtifact, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("wrapper's declared mirrored_hashes do not match the recomputed hashes"))).toBe(true);
  });

  it('rejects when the actual mirror directory does not contain exactly the four authorized files', () => {
    const context = baseMirrorContext();
    context.actualMirrorDirFilenames = [...context.actualMirrorDirFilenames, 'unexpected_extra_file.json'];
    const result = validate(committedArtifact, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not contain exactly the four authorized local mirror files'))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose source_lock disagrees with the locked starting point', () => {
    const context = baseMirrorContext();
    context.wrapper.source_lock.row_count = 47;
    const result = validate(committedArtifact, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dereferenced wrapper's source_lock does not match"))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose source_lock.commit has moved off the pinned upstream commit even while repo/schema/season/row_count and mirror hashes still agree', () => {
    const context = baseMirrorContext();
    context.wrapper.source_lock.commit = 'ffffffffffffffffffffffffffffffffffffffff';
    const result = validate(committedArtifact, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dereferenced wrapper's source_lock does not match"))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose forecast_mirror.paths substitutes a different path while the live directory still contains the expected filenames', () => {
    const context = baseMirrorContext();
    context.wrapper.forecast_mirror.paths.mirror_json = 'data/fixtures/tiberRookies/some_other_file.json';
    const result = validate(committedArtifact, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("wrapper's declared forecast_mirror.paths do not match the four authorized local paths"))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose forecast_mirror.paths is missing a required key', () => {
    const context = baseMirrorContext();
    delete (context.wrapper.forecast_mirror.paths as Record<string, string>).mirror_csv;
    const result = validate(committedArtifact, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("wrapper's declared forecast_mirror.paths do not match the four authorized local paths"))).toBe(true);
  });

  it('control case: the real dereferenced wrapper (built exactly as the CLI builds it) declares forecast_mirror.paths matching the four authorized paths exactly', () => {
    const result = validate(committedArtifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('locked population accounting', () => {
  it('rejects when the injected locked population is not exactly 48 distinct ids', () => {
    const result = validate(committedArtifact, [...lockedSourcePlayerIds, 'extra-unlocked-id']);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('locked source population must contain exactly 48 distinct player ids'))).toBe(true);
  });
});

describe('inertness -- the availability-evidence artifact is outside all model, production, downstream, and UI paths', () => {
  const SCAN_DIRS = ['src/models', 'src/services', 'src/api', 'src/adapters', 'src/features', 'app'];
  const needles = ['availability_evidence', 'AvailabilityEvidence', 'rookieTransitionProfileAvailabilityEvidence'];

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

  it('no model/service/api/adapter/feature/UI file references the availability-evidence artifact or validator', () => {
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

  it('no start/dev/build production script references the availability-evidence audit', () => {
    const pkg = JSON.parse(readFileSync(repoPath('package.json'), 'utf-8')) as { scripts: Record<string, string> };
    for (const scriptName of ['start', 'dev', 'start:api', 'dev:api', 'build']) {
      expect(pkg.scripts[scriptName] ?? '').not.toContain('AvailabilityAudit');
    }
  });
});
