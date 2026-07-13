/**
 * Lane B source-availability validation tests (Forecast #160): the committed governed
 * availability-evidence artifact passes the fail-closed validator against the committed mirror's
 * locked population and real pinned values, every focused negative case required by issue #160 is
 * rejected, exactly one required decision is emitted, and the artifact stays inert (never imported
 * by model/production/downstream/UI paths).
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
  type ArchivedEvidenceResolver,
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
const mirrorValueLiterals: MirrorVerificationContext['mirrorValueLiterals'] = {};
for (const row of mirrorJson.rows) {
  valuePresence[row.player_id] = Object.fromEntries(
    FIELD_FAMILIES.map((family) => [family, row[family].value !== null]),
  ) as Record<FieldFamily, boolean>;
  mirrorValueLiterals[row.player_id] = Object.fromEntries(
    FIELD_FAMILIES.map((family) => [family, row[family].value !== null ? JSON.stringify(row[family].value) : null]),
  ) as Record<FieldFamily, string | null>;
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
  mirrorValueLiterals: JSON.parse(JSON.stringify(mirrorValueLiterals)) as MirrorVerificationContext['mirrorValueLiterals'],
});

const committedArtifact = JSON.parse(readFileSync(repoPath(AVAILABILITY_EVIDENCE_PATH), 'utf-8')) as AvailabilityEvidenceArtifact;

/** No committed row cites archived evidence, so the committed-artifact resolver is never called. */
const neverResolve: ArchivedEvidenceResolver = () => {
  throw new Error('resolver must not be called for an artifact with no archived citations');
};

const clone = (): AvailabilityEvidenceArtifact => JSON.parse(JSON.stringify(committedArtifact)) as AvailabilityEvidenceArtifact;

const validate = (
  artifact: AvailabilityEvidenceArtifact,
  resolver: ArchivedEvidenceResolver = neverResolve,
  lockedIds: readonly string[] = lockedSourcePlayerIds,
  mirrorContext: MirrorVerificationContext = baseMirrorContext(),
) => validateRookieTransitionProfileAvailabilityEvidence(artifact, lockedIds, mirrorContext, resolver);

// ---------------------------------------------------------------------------------------------
// Helpers to craft eligible/ineligible row fixtures against a REAL locked player/family and its
// REAL pinned mirror value -- rows[0..4] of the committed artifact are qb-carson-beck (alphabetically
// first of the 48 locked identities), in FIELD_FAMILIES-alphabetical order.
// ---------------------------------------------------------------------------------------------

const FIRST_PLAYER = 'qb-carson-beck';
const ROW_AGE = 0; // age_at_entry, real value 23, present
const ROW_ATHLETIC = 1; // athletic_testing, present
const ROW_COLLEGE = 2; // college_production, present
const ROW_DRAFT_CAPITAL = 3; // draft_capital, present
const ROW_OUTCOME = 4; // official_postdraft_outcome, present

// rb-kaelon-black's age_at_entry mirror value is null -- the one honest `unavailable` fixture we can
// mutate without breaking the value-presence agreement invariant.
const NULL_VALUE_PLAYER = 'rb-kaelon-black';
const NULL_VALUE_ROW_INDEX = committedArtifact.rows.findIndex(
  (r) => r.source_identity.source_player_id === NULL_VALUE_PLAYER && r.field_family === 'age_at_entry',
);

const REAL_DRAFT_CAPITAL_LITERAL = JSON.stringify((mirrorJson.rows.find((r) => r.player_id === FIRST_PLAYER) as never as Record<FieldFamily, { value: unknown }>).draft_capital.value);
const REAL_OUTCOME_LITERAL = JSON.stringify((mirrorJson.rows.find((r) => r.player_id === FIRST_PLAYER) as never as Record<FieldFamily, { value: unknown }>).official_postdraft_outcome.value);

const PUBLISHED_DRAFT_START_AT = '2026-04-23T20:00:00-04:00';
const CUTOFF_AT = '2026-04-20T00:00:00-04:00';
const ELIGIBLE_AVAILABLE_AT = '2026-04-15T00:00:00-04:00';
const INELIGIBLE_AVAILABLE_AT = '2026-04-22T00:00:00-04:00';

const CUTOFF_ARCHIVE_CONTENT = `official NFL league announcement: season 2026 draft begins ${PUBLISHED_DRAFT_START_AT}`;
// This fixture's published_draft_start_at deliberately carries no "2026" substring anywhere (a
// different placeholder year), so it isolates the "archive lacks the season" failure from the
// season otherwise being implicitly present inside the timestamp itself.
const NO_SEASON_PUBLISHED_DRAFT_START_AT = '2099-04-23T20:00:00-04:00';
const CUTOFF_ARCHIVE_CONTENT_NO_SEASON = `official NFL league announcement: draft begins ${NO_SEASON_PUBLISHED_DRAFT_START_AT}`;
const CUTOFF_ARCHIVE_CONTENT_NO_START = 'official NFL league announcement: season 2026 draft schedule to be determined';

const ELIGIBLE_ARCHIVE_CONTENT = `archived snapshot dated ${ELIGIBLE_AVAILABLE_AT}: ${FIRST_PLAYER} draft_capital mirrored value = ${REAL_DRAFT_CAPITAL_LITERAL}`;
const INELIGIBLE_ARCHIVE_CONTENT = `archived snapshot dated ${INELIGIBLE_AVAILABLE_AT}: ${FIRST_PLAYER} draft_capital mirrored value = ${REAL_DRAFT_CAPITAL_LITERAL}`;
const OUTCOME_ARCHIVE_CONTENT = `archived snapshot dated ${ELIGIBLE_AVAILABLE_AT}: ${FIRST_PLAYER} official_postdraft_outcome mirrored value = ${REAL_OUTCOME_LITERAL}`;
// Deliberately lacks any dated snapshot timestamp -- proves the archive-binding check itself (a
// content string containing the value but never stating a date at all must still fail closed).
const ELIGIBLE_ARCHIVE_CONTENT_NO_DATE = `undated note: ${FIRST_PLAYER} draft_capital mirrored value = ${REAL_DRAFT_CAPITAL_LITERAL}`;
// States only a bare date (no time-of-day/offset) -- proves available_at may never be a fabricated
// "midnight in a chosen timezone" derived from a source that only ever stated a date.
const ELIGIBLE_ARCHIVE_CONTENT_DATE_ONLY = `dated 2026-04-15 (no exact time stated): ${FIRST_PLAYER} draft_capital mirrored value = ${REAL_DRAFT_CAPITAL_LITERAL}`;
// The SAME archive/value as the real eligible control case, but a different (still pre-cutoff)
// available_at the archive never actually states -- the exact regression the owner review requested:
// same archive, different self-declared timestamp on the same side of the cutoff, must still fail.
const ELIGIBLE_AVAILABLE_AT_ALTERNATE_SAME_SIDE = '2026-04-16T00:00:00-04:00';
const INELIGIBLE_AVAILABLE_AT_ALTERNATE_SAME_SIDE = '2026-04-23T00:00:00-04:00';

const FABRICATED_LITERAL = '{"big_board_rank":1,"draft_capital_proxy_0_100":99}';
const FABRICATED_ARCHIVE_CONTENT = `self-authored note dated ${ELIGIBLE_AVAILABLE_AT}: ${FIRST_PLAYER} draft_capital mirrored value = ${FABRICATED_LITERAL}`;

// Deliberately fictional reviewer: these fixtures exercise validator structure only and must never
// read as a claim that any real person signed off on a row (issue #160 human-review checkpoint).
const FIXTURE_REVIEWER = 'Hypothetical Reviewer (test fixture only)';

const citation = (content: string, pathSuffix: string) => ({
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  path: `data/experiments/rookieTransitionProfile/evidence/${pathSuffix}`,
  schema_version: null,
  schema_not_applicable_reason: 'raw archived snapshot; no schema applies',
  sha256: sha256(content),
  original_url: 'https://example.test/evidence',
  retrieved_at: '2026-07-13',
});

const cutoffEvidenceSource = (content: string = CUTOFF_ARCHIVE_CONTENT, publishedDraftStartAt: string = PUBLISHED_DRAFT_START_AT) => ({
  ...citation(content, 'cutoff_announcement.txt'),
  reviewer: FIXTURE_REVIEWER,
  reviewed_at: '2026-07-13',
  source_timezone_or_offset: '-04:00',
  published_draft_start_at: publishedDraftStartAt,
});

const rowEvidenceSource = (content: string, pathSuffix: string, literal: string) => ({
  ...citation(content, pathSuffix),
  mirrored_value_literal: literal,
});

const reviewDecision = () => ({ reviewer: FIXTURE_REVIEWER, reviewed_at: '2026-07-13' });

const archiveResolver: ArchivedEvidenceResolver = (cited) => {
  for (const content of [
    CUTOFF_ARCHIVE_CONTENT,
    CUTOFF_ARCHIVE_CONTENT_NO_SEASON,
    CUTOFF_ARCHIVE_CONTENT_NO_START,
    ELIGIBLE_ARCHIVE_CONTENT,
    INELIGIBLE_ARCHIVE_CONTENT,
    OUTCOME_ARCHIVE_CONTENT,
    ELIGIBLE_ARCHIVE_CONTENT_NO_DATE,
    ELIGIBLE_ARCHIVE_CONTENT_DATE_ONLY,
    FABRICATED_ARCHIVE_CONTENT,
  ]) {
    if (cited.sha256 === sha256(content)) return content;
  }
  return null;
};

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

const withCutoffSet = (artifact: AvailabilityEvidenceArtifact, source = cutoffEvidenceSource()): AvailabilityEvidenceArtifact => {
  artifact.cutoff_at = CUTOFF_AT;
  artifact.cutoff_evidence_source = source as AvailabilityEvidenceArtifact['cutoff_evidence_source'];
  return artifact;
};

/** A structurally complete, archive-verified, real-mirror-matched, human-reviewed eligible_at_cutoff row. */
const withEligibleRow = (mutate?: (row: AvailabilityEvidenceRow, artifact: AvailabilityEvidenceArtifact) => void): AvailabilityEvidenceArtifact => {
  const artifact = withCutoffSet(clone());
  withRowMutated(artifact, ROW_DRAFT_CAPITAL, (row) => {
    row.availability_status = 'eligible_at_cutoff';
    row.available_at = ELIGIBLE_AVAILABLE_AT;
    row.evidence_source = rowEvidenceSource(ELIGIBLE_ARCHIVE_CONTENT, 'draft_capital_eligible.txt', REAL_DRAFT_CAPITAL_LITERAL) as AvailabilityEvidenceRow['evidence_source'];
    row.review_decision = reviewDecision();
    row.notes = 'eligible control case fixture: archived snapshot predates the pinned cutoff';
  });
  mutate?.(artifact.rows[ROW_DRAFT_CAPITAL], artifact);
  return artifact;
};

/** A structurally complete, archive-verified, real-mirror-matched, human-reviewed ineligible_after_cutoff row. */
const withIneligibleRow = (mutate?: (row: AvailabilityEvidenceRow, artifact: AvailabilityEvidenceArtifact) => void): AvailabilityEvidenceArtifact => {
  const artifact = withCutoffSet(clone());
  withRowMutated(artifact, ROW_DRAFT_CAPITAL, (row) => {
    row.availability_status = 'ineligible_after_cutoff';
    row.available_at = INELIGIBLE_AVAILABLE_AT;
    row.evidence_source = rowEvidenceSource(INELIGIBLE_ARCHIVE_CONTENT, 'draft_capital_ineligible.txt', REAL_DRAFT_CAPITAL_LITERAL) as AvailabilityEvidenceRow['evidence_source'];
    row.review_decision = reviewDecision();
    row.notes = 'ineligible control case fixture: archived snapshot postdates the pinned cutoff';
  });
  mutate?.(artifact.rows[ROW_DRAFT_CAPITAL], artifact);
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

  it('never claims a human review that did not occur -- review_decision is null on every non-eligible/ineligible row', () => {
    expect(committedArtifact.rows.every((r) => r.review_decision === null)).toBe(true);
    expect(committedArtifact.cutoff_evidence_source).toBeNull();
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

describe('official_postdraft_outcome temporal restriction (design §10: definitionally post-draft, never pre-draft-eligible)', () => {
  it('rejects official_postdraft_outcome claimed as eligible_at_cutoff even with otherwise-complete evidence', () => {
    const artifact = withCutoffSet(clone());
    withRowMutated(artifact, ROW_OUTCOME, (row) => {
      row.availability_status = 'eligible_at_cutoff';
      row.available_at = ELIGIBLE_AVAILABLE_AT;
      row.evidence_source = rowEvidenceSource(OUTCOME_ARCHIVE_CONTENT, 'outcome_eligible.txt', REAL_OUTCOME_LITERAL) as AvailabilityEvidenceRow['evidence_source'];
      row.review_decision = reviewDecision();
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('official_postdraft_outcome may never be eligible_at_cutoff'))).toBe(true);
  });
});

describe('cutoff validation (design §8)', () => {
  it('rejects a non-null cutoff_evidence_source while cutoff_at is null', () => {
    const artifact = clone();
    artifact.cutoff_evidence_source = cutoffEvidenceSource() as AvailabilityEvidenceArtifact['cutoff_evidence_source'];
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cutoff_evidence_source must be null while cutoff_at is null'))).toBe(true);
  });

  it('rejects a non-null cutoff_at with a null cutoff_evidence_source', () => {
    const artifact = clone();
    artifact.cutoff_at = CUTOFF_AT;
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cutoff_evidence_source is missing or structurally incomplete'))).toBe(true);
  });

  it('rejects a cutoff_evidence_source missing reviewer/reviewed_at', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), reviewer: '', reviewed_at: '' });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a named human reviewer and a parseable dated sign-off'))).toBe(true);
  });

  it('rejects a cutoff_evidence_source missing source_timezone_or_offset/published_draft_start_at', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), source_timezone_or_offset: '', published_draft_start_at: '' });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be a numeric offset'))).toBe(true);
    expect(result.errors.some((e) => e.includes('requires published_draft_start_at'))).toBe(true);
  });

  it('rejects a cutoff_evidence_source.source_timezone_or_offset that names a zone rather than a numeric offset (schema 1.0.0 is closed to numeric offsets only)', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), source_timezone_or_offset: 'America/New_York' });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be a numeric offset (Z or +HH:MM/-HH:MM)'))).toBe(true);
  });

  it('rejects a non-reproducible cutoff_evidence_source citation (hash mismatch fails closed)', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), sha256: sha256('bytes nobody archived') });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cutoff_evidence_source is not reproducible'))).toBe(true);
  });

  it('rejects a cutoff_evidence_source whose published_draft_start_at is not a parseable offset-bearing instant, even though non-empty (previously this silently skipped the ordering check entirely rather than failing closed)', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), published_draft_start_at: 'not-a-timestamp' });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('published_draft_start_at must be a fully-qualified, offset-bearing ISO-8601 instant'))).toBe(true);
  });

  it('rejects a cutoff_evidence_source whose source_timezone_or_offset disagrees with the offset actually embedded in published_draft_start_at', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), source_timezone_or_offset: '+00:00' }); // PUBLISHED_DRAFT_START_AT embeds -04:00
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not agree with the offset embedded in published_draft_start_at'))).toBe(true);
  });

  it('rejects a cutoff archive that does not actually state the locked season', () => {
    const artifact = withCutoffSet(
      clone(),
      cutoffEvidenceSource(CUTOFF_ARCHIVE_CONTENT_NO_SEASON, NO_SEASON_PUBLISHED_DRAFT_START_AT),
    );
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not state the locked season'))).toBe(true);
  });

  it('rejects a cutoff archive that does not actually contain the claimed published_draft_start_at', () => {
    const artifact = withCutoffSet(clone(), cutoffEvidenceSource(CUTOFF_ARCHIVE_CONTENT_NO_START));
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not contain the claimed published_draft_start_at'))).toBe(true);
  });

  it('rejects cutoff_at that is not strictly earlier than the archived published_draft_start_at', () => {
    const artifact = withCutoffSet(clone());
    artifact.cutoff_at = PUBLISHED_DRAFT_START_AT; // equal, not strictly earlier
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be strictly earlier than the archived published_draft_start_at'))).toBe(true);
  });

  it('control case: a well-formed cutoff with no eligible/ineligible rows validates cleanly', () => {
    const artifact = withCutoffSet(clone());
    const result = validate(artifact, archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('eligible_at_cutoff / ineligible_after_cutoff rows (design §10/§12: real archived evidence + attributable human review, never self-certified)', () => {
  it('accepts a structurally complete, archive-verified, real-mirror-matched, human-reviewed eligible_at_cutoff row (control case)', () => {
    const result = validate(withEligibleRow(), archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.statusCounts.eligible_at_cutoff).toBe(1);
  });

  it('accepts a structurally complete, archive-verified, real-mirror-matched, human-reviewed ineligible_after_cutoff row (control case)', () => {
    const result = validate(withIneligibleRow(), archiveResolver);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.statusCounts.ineligible_after_cutoff).toBe(1);
  });

  it('rejects an eligible_at_cutoff row when no cutoff_at is pinned at all', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_DRAFT_CAPITAL, (row) => {
      row.availability_status = 'eligible_at_cutoff';
      row.available_at = ELIGIBLE_AVAILABLE_AT;
      row.evidence_source = rowEvidenceSource(ELIGIBLE_ARCHIVE_CONTENT, 'draft_capital_eligible.txt', REAL_DRAFT_CAPITAL_LITERAL) as AvailabilityEvidenceRow['evidence_source'];
      row.review_decision = reviewDecision();
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a validly pinned cutoff_at'))).toBe(true);
  });

  it('rejects a row with an unparseable available_at', () => {
    const artifact = withEligibleRow((row) => {
      row.available_at = 'not-a-timestamp';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a non-null, parseable, offset-bearing available_at'))).toBe(true);
  });

  it('rejects a row missing evidence_source entirely', () => {
    const artifact = withEligibleRow((row) => {
      row.evidence_source = null;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a structurally complete evidence_source'))).toBe(true);
  });

  it('rejects a row whose evidence_source has an empty mirrored_value_literal', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).mirrored_value_literal = '';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('non-empty mirrored_value_literal'))).toBe(true);
  });

  it('rejects a non-reproducible row evidence_source citation (hash mismatch fails closed)', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).sha256 = sha256('bytes nobody archived for this row');
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('evidence_source is not reproducible'))).toBe(true);
  });

  it('rejects a row whose archived evidence does not actually contain the claimed mirrored_value_literal', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).mirrored_value_literal = 'a literal the archive never states';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not actually contain the claimed mirrored_value_literal'))).toBe(true);
  });

  it('rejects a row whose archived evidence contains the claimed value but never states the claimed available_at date at all (archive-binding gap closed)', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).sha256 = sha256(ELIGIBLE_ARCHIVE_CONTENT_NO_DATE);
      (row.evidence_source as unknown as Record<string, unknown>).path = 'data/experiments/rookieTransitionProfile/evidence/undated.txt';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not actually contain the claimed available_at'))).toBe(true);
  });

  it('rejects a self-declared available_at the archive never actually states, even while citing content that genuinely proves the value (timestamp-substitution via an unbound available_at)', () => {
    const artifact = withEligibleRow((row) => {
      // The archive proves the VALUE, dated to the real eligible snapshot -- but the row claims an
      // earlier, more favorable available_at the archive never actually states.
      row.available_at = '2020-01-01T00:00:00-04:00';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not actually contain the claimed available_at'))).toBe(true);
  });

  it('rejects a self-declared available_at that differs from the archive-stated one but still lands on the SAME side of the cutoff as the genuine eligible snapshot (owner-requested regression)', () => {
    const artifact = withEligibleRow((row) => {
      row.available_at = ELIGIBLE_AVAILABLE_AT_ALTERNATE_SAME_SIDE; // still < cutoff_at, same claimed status
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not actually contain the claimed available_at'))).toBe(true);
  });

  it('rejects a self-declared available_at that differs from the archive-stated one but still lands on the SAME side of the cutoff as the genuine ineligible snapshot (owner-requested regression)', () => {
    const artifact = withIneligibleRow((row) => {
      row.available_at = INELIGIBLE_AVAILABLE_AT_ALTERNATE_SAME_SIDE; // still >= cutoff_at, same claimed status
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not actually contain the claimed available_at'))).toBe(true);
  });

  it('rejects an available_at claimed as an exact instant when the archive only ever states a bare date, never silently treating it as midnight in some chosen timezone', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).sha256 = sha256(ELIGIBLE_ARCHIVE_CONTENT_DATE_ONLY);
      (row.evidence_source as unknown as Record<string, unknown>).path = 'data/experiments/rookieTransitionProfile/evidence/date_only.txt';
      // A real author might be tempted to derive midnight in the cutoff's timezone from the bare date.
      row.available_at = '2026-04-15T00:00:00-04:00';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not actually contain the claimed available_at'))).toBe(true);
  });

  it('rejects a mirrored_value_literal that does not match the REAL pinned mirror value, even though the archive faithfully contains it (self-certification gap closed)', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).mirrored_value_literal = FABRICATED_LITERAL;
      (row.evidence_source as unknown as Record<string, unknown>).sha256 = sha256(FABRICATED_ARCHIVE_CONTENT);
      (row.evidence_source as unknown as Record<string, unknown>).path = 'data/experiments/rookieTransitionProfile/evidence/fabricated.txt';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not match the real pinned mirror value'))).toBe(true);
  });

  it('rejects an eligible/ineligible row missing an attributable human review_decision', () => {
    const artifact = withEligibleRow((row) => {
      row.review_decision = null;
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires an explicit, attributable human review_decision'))).toBe(true);
  });

  it('rejects an eligible/ineligible row with a review_decision missing reviewer or reviewed_at', () => {
    const artifact = withEligibleRow((row) => {
      row.review_decision = { reviewer: '', reviewed_at: '' };
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires an explicit, attributable human review_decision'))).toBe(true);
  });

  it('rejects unavailable/unresolved rows carrying a non-null available_at (timestamp-substitution rejection)', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_AGE, (row) => {
      row.available_at = ELIGIBLE_AVAILABLE_AT;
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must carry a null available_at'))).toBe(true);
  });

  it('rejects unavailable/unresolved rows carrying a non-null evidence_source (timestamp-substitution rejection)', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_AGE, (row) => {
      row.evidence_source = rowEvidenceSource(ELIGIBLE_ARCHIVE_CONTENT, 'sneaked_in.txt', REAL_DRAFT_CAPITAL_LITERAL) as AvailabilityEvidenceRow['evidence_source'];
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must carry a null evidence_source'))).toBe(true);
  });

  it('rejects eligible_at_cutoff whose available_at is not strictly before cutoff_at (timestamp-substitution rejection)', () => {
    const artifact = withEligibleRow((row) => {
      row.available_at = INELIGIBLE_AVAILABLE_AT; // >= cutoff_at, contradicts the claimed eligible status
      (row.evidence_source as unknown as Record<string, unknown>).sha256 = sha256(INELIGIBLE_ARCHIVE_CONTENT);
      (row.evidence_source as unknown as Record<string, unknown>).path = 'data/experiments/rookieTransitionProfile/evidence/draft_capital_ineligible.txt';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('eligible_at_cutoff requires available_at < cutoff_at'))).toBe(true);
  });

  it('rejects ineligible_after_cutoff whose available_at is actually before cutoff_at (timestamp-substitution rejection)', () => {
    const artifact = withIneligibleRow((row) => {
      row.available_at = ELIGIBLE_AVAILABLE_AT; // < cutoff_at, contradicts the claimed ineligible status
      (row.evidence_source as unknown as Record<string, unknown>).sha256 = sha256(ELIGIBLE_ARCHIVE_CONTENT);
      (row.evidence_source as unknown as Record<string, unknown>).path = 'data/experiments/rookieTransitionProfile/evidence/draft_capital_eligible.txt';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ineligible_after_cutoff requires available_at >= cutoff_at'))).toBe(true);
  });

  it('a valid, fully-verified eligible row still only reaches requires_followup while other rows remain unresolved', () => {
    const result = validate(withEligibleRow(), archiveResolver);
    expect(result.valid).toBe(true);
    expect(result.decision).toBe('rookie_transition_profile_forecast_source_availability_audit_requires_followup');
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

  it('rejects a mirror_source.commit that is not a full 40-hex SHA', () => {
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
    const result = validate(committedArtifact, neverResolve, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("wrapper's declared mirrored_hashes do not match the recomputed hashes"))).toBe(true);
  });

  it('rejects when the actual mirror directory does not contain exactly the four authorized files', () => {
    const context = baseMirrorContext();
    context.actualMirrorDirFilenames = [...context.actualMirrorDirFilenames, 'unexpected_extra_file.json'];
    const result = validate(committedArtifact, neverResolve, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not contain exactly the four authorized local mirror files'))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose source_lock disagrees with the locked starting point', () => {
    const context = baseMirrorContext();
    context.wrapper.source_lock.row_count = 47;
    const result = validate(committedArtifact, neverResolve, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dereferenced wrapper's source_lock does not match"))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose source_lock.commit has moved off the pinned upstream commit even while repo/schema/season/row_count and mirror hashes still agree', () => {
    const context = baseMirrorContext();
    context.wrapper.source_lock.commit = 'ffffffffffffffffffffffffffffffffffffffff';
    const result = validate(committedArtifact, neverResolve, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("dereferenced wrapper's source_lock does not match"))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose forecast_mirror.paths substitutes a different path while the live directory still contains the expected filenames', () => {
    const context = baseMirrorContext();
    context.wrapper.forecast_mirror.paths.mirror_json = 'data/fixtures/tiberRookies/some_other_file.json';
    const result = validate(committedArtifact, neverResolve, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("wrapper's declared forecast_mirror.paths do not match the four authorized local paths"))).toBe(true);
  });

  it('rejects a dereferenced wrapper whose forecast_mirror.paths is missing a required key', () => {
    const context = baseMirrorContext();
    delete (context.wrapper.forecast_mirror.paths as Record<string, string>).mirror_csv;
    const result = validate(committedArtifact, neverResolve, lockedSourcePlayerIds, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("wrapper's declared forecast_mirror.paths do not match the four authorized local paths"))).toBe(true);
  });

  it('control case: the real dereferenced wrapper (built exactly as the CLI builds it) declares forecast_mirror.paths matching the four authorized paths exactly', () => {
    const result = validate(committedArtifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('top-level artifact schema closure (owner review on PR #161, finding 5)', () => {
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

  it('rejects any non-null source_snapshot_as_of -- schema 1.0.0 has no reproducible snapshot-evidence contract to support the claim, even a well-formed instant', () => {
    const artifact = clone();
    withRowMutated(artifact, ROW_AGE, (row) => {
      row.source_snapshot_as_of = '2026-07-13T00:00:00-04:00'; // well-formed, still rejected
    });
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('source_snapshot_as_of must be null in schema 1.0.0'))).toBe(true);
  });

  it('control case: the committed artifact passes the top-level schema-closure and generated_at checks', () => {
    const result = validate(committedArtifact);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('nested schema closure (owner review on PR #161, 2nd round finding 4: no nested object may carry an undeclared extra key)', () => {
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

  it('rejects an unresolved/unavailable row carrying a non-null review_decision -- only a human-reviewed eligible/ineligible row may claim one', () => {
    const artifact = clone();
    (artifact.rows[ROW_AGE] as unknown as Record<string, unknown>).review_decision = reviewDecision();
    const result = validate(artifact);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must carry a null review_decision'))).toBe(true);
  });

  it('rejects a cutoff_evidence_source with an extra undeclared key', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), extra_claim: 'not permitted' } as unknown as ReturnType<typeof cutoffEvidenceSource>);
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cutoff_evidence_source fields must be exactly'))).toBe(true);
  });

  it('rejects a row evidence_source with an extra undeclared key', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).extra_claim = 'not permitted';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a structurally complete evidence_source'))).toBe(true);
  });

  it('rejects a review_decision with an extra undeclared key', () => {
    const artifact = withEligibleRow((row) => {
      (row.review_decision as unknown as Record<string, unknown>).extra_claim = 'not permitted';
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('requires an explicit, attributable human review_decision'))).toBe(true);
  });
});

describe('temporal chronology (owner review on PR #161, 2nd round finding 4: retrieval cannot precede the fact, review cannot precede retrieval)', () => {
  it('rejects a row whose evidence_source.retrieved_at is earlier than the claimed available_at', () => {
    const artifact = withEligibleRow((row) => {
      (row.evidence_source as unknown as Record<string, unknown>).retrieved_at = '2020-01-01'; // long before ELIGIBLE_AVAILABLE_AT
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('evidence_source.retrieved_at must not be earlier than available_at'))).toBe(true);
  });

  it('rejects a row whose review_decision.reviewed_at is earlier than evidence_source.retrieved_at', () => {
    const artifact = withEligibleRow((row) => {
      row.review_decision = { reviewer: FIXTURE_REVIEWER, reviewed_at: '2020-01-01' }; // before evidence_source.retrieved_at (2026-07-13)
    });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('review_decision.reviewed_at must not be earlier than evidence_source.retrieved_at'))).toBe(true);
  });

  it('rejects a cutoff_evidence_source whose reviewed_at is earlier than its own retrieved_at', () => {
    const artifact = withCutoffSet(clone(), { ...cutoffEvidenceSource(), retrieved_at: '2026-07-13', reviewed_at: '2020-01-01' });
    const result = validate(artifact, archiveResolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cutoff_evidence_source.reviewed_at must not be earlier than retrieved_at'))).toBe(true);
  });

  it('control case: the real eligible/ineligible fixtures and the committed cutoff satisfy retrieval/review chronology', () => {
    expect(validate(withEligibleRow(), archiveResolver).valid).toBe(true);
    expect(validate(withIneligibleRow(), archiveResolver).valid).toBe(true);
  });
});

describe('locked population accounting', () => {
  it('rejects when the injected locked population is not exactly 48 distinct ids', () => {
    const result = validate(committedArtifact, neverResolve, [...lockedSourcePlayerIds, 'extra-unlocked-id']);
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
