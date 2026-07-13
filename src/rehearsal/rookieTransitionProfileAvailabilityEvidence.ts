/**
 * Governed Forecast source-availability evidence for the committed rookie_transition_profile_v0.2.0
 * mirror (Lane B of the pre-experiment readiness design; Forecast #160), implementing design §8-§13
 * of the merged design pinned at commit `73834c2a30743c2587b32742c4e5c98320e33dfe`
 * (`docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md`)
 * to the extent schema 1.0.0 supports.
 *
 * This module is PURE (no I/O): it validates a candidate availability-evidence artifact against the
 * pinned mirror/source locks and the merged design's fail-closed rules. The CLI
 * (`scripts/runRookieTransitionProfileAvailabilityAudit.ts`) does the file I/O (dereferencing the
 * committed mirror files at the pinned commit, recomputing hashes, listing the mirror directory) and
 * calls this module.
 *
 * Lane B is independent of Lane A (#158/#159): this module never reads, imports, or depends on the
 * identity crosswalk, and never uses identity-resolution status to infer availability.
 *
 * Fail-closed philosophy (design §8-§13): a correct `unresolved_no_availability_proof` is always
 * preferable to an assumed-eligible claim. Every check below collects an error rather than repairing,
 * defaulting, or dropping anything.
 *
 * `eligible_at_cutoff`/`ineligible_after_cutoff` are HARD-REJECTED in schema 1.0.0 (decision made in
 * response to a repo-owner review of #161): a two-round independent review established that proving
 * either status honestly requires (a) binding a row's claimed value and timestamp to one exact source
 * record for that player/field_family, not merely finding both strings somewhere in a reproduced
 * archive, and (b) a typed semantic role proving a matched timestamp specifically means "this fact
 * became publicly knowable," not an event/retrieval/other timestamp. Both require per-field_family
 * structured evidence contracts (with deterministic recomputation for derived families such as
 * `age_at_entry`) that do not exist as a design yet. Rather than continue layering narrower mechanical
 * proxies for genuine record-level and semantic proof, this module hard-rejects the two statuses
 * outright -- mirroring how Lane A ultimately hard-rejected its own unverifiable `3.3_governed_artifact`
 * evidence class (#159) rather than accept mechanically-plausible-but-unauthoritative citations.
 * `cutoff_at`/`cutoff_evidence_source` exist solely to support those two statuses, so both are also
 * hard-required to stay `null` in schema 1.0.0 -- keeping them "technically settable but never
 * consumed" would itself be exactly the unused speculative schema this decision means to avoid.
 * A future schema version may lift this once a real per-field_family evidence contract is designed
 * and pinned as separate follow-up work under issue #160.
 */

import {
  AUTHORIZED_MIRROR_FILENAMES,
  MIRROR_CSV_PATH,
  MIRROR_JSON_PATH,
  MIRROR_MANIFEST_PATH,
  MIRROR_PROVENANCE_PATH,
  SOURCE_COMMIT,
  SOURCE_REPO,
  SOURCE_ROW_COUNT,
  SOURCE_SCHEMA_VERSION,
  SOURCE_SEASON,
  WRAPPER_KIND,
  WRAPPER_SCHEMA_VERSION,
} from './rookieTransitionProfileMirror.js';

export const AVAILABILITY_EVIDENCE_IMPLEMENTATION_ISSUE = 'TIBER-Forecast#160' as const;
export const READINESS_DESIGN_ISSUE = 'TIBER-Forecast#155' as const;
export const READINESS_DESIGN_PR = 'TIBER-Forecast#156' as const;
export const READINESS_DESIGN_MERGE_COMMIT = '73834c2a30743c2587b32742c4e5c98320e33dfe' as const;
export const READINESS_DESIGN_DOCUMENTS = [
  'docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md',
  'docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.json',
] as const;

export const AVAILABILITY_EVIDENCE_KIND = 'rookie_transition_profile_v0_forecast_availability_evidence' as const;
export const AVAILABILITY_EVIDENCE_SCHEMA_VERSION = '1.0.0' as const;
export const AVAILABILITY_EVIDENCE_PATH =
  'data/experiments/rookieTransitionProfile/rookie_transition_profile_v0_forecast_availability_evidence.json' as const;

export const FORECAST_REPO = 'Prometheus-Frameworks/TIBER-Forecast' as const;

/**
 * The exact Forecast commit this artifact's `mirror_source` must cite (the commit that merged Lane A,
 * #159). Pinned so `mirror_source.commit` cannot be silently swapped for any other 40-hex value while
 * the CLI still validates against whatever bytes happen to sit in the current worktree -- the CLI
 * dereferences the wrapper/mirror files (and the mirror directory listing) at exactly this commit via
 * `git show`/`git ls-tree`, never trusting the working tree to actually be at this commit.
 */
export const MIRROR_SOURCE_COMMIT_PIN = '53731cbfa4701aa9861ead4b2fb73c2c29afe89b' as const;

// ---------------------------------------------------------------------------------------------
// Closed enums (design §8, §11) -- any other token fails closed. `eligible_at_cutoff` and
// `ineligible_after_cutoff` remain recognized tokens (this is the full domain vocabulary) but are
// hard-rejected for any row in schema 1.0.0 -- see module doc comment.
// ---------------------------------------------------------------------------------------------

export const FIELD_FAMILIES = [
  'draft_capital',
  'age_at_entry',
  'athletic_testing',
  'college_production',
  'official_postdraft_outcome',
] as const;
export type FieldFamily = (typeof FIELD_FAMILIES)[number];

export const AVAILABILITY_STATUSES = [
  'eligible_at_cutoff',
  'ineligible_after_cutoff',
  'unresolved_no_availability_proof',
  'unavailable',
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/** Statuses usable by a row in schema 1.0.0 -- `eligible_at_cutoff`/`ineligible_after_cutoff` are hard-rejected. */
const HARD_REJECTED_STATUSES = ['eligible_at_cutoff', 'ineligible_after_cutoff'] as const;

// ---------------------------------------------------------------------------------------------
// Artifact shape (design §13)
// ---------------------------------------------------------------------------------------------

export interface MirrorSourceReference {
  repo: string;
  commit: string;
  wrapper_path: string;
  kind: string;
  schema_version: string;
  sha256: string;
}

export interface SourceIdentityKey {
  source_repository: string;
  source_schema: string;
  source_player_id: string;
  source_season: number;
}

export interface AvailabilityEvidenceRow {
  field_family: FieldFamily;
  source_identity: SourceIdentityKey;
  availability_status: AvailabilityStatus;
  /** Always null in schema 1.0.0 -- reserved for a future schema version's evidence contract. */
  available_at: null;
  /** Always null in schema 1.0.0 -- no reproducible snapshot-evidence contract exists yet. */
  source_snapshot_as_of: null;
  /** Always null in schema 1.0.0 -- reserved for a future schema version's evidence contract. */
  evidence_source: null;
  notes: string | null;
  /** Always null in schema 1.0.0 -- reserved for a future schema version's evidence contract. */
  review_decision: null;
}

export const AVAILABILITY_EVIDENCE_ROW_FIELDS = [
  'field_family',
  'source_identity',
  'availability_status',
  'available_at',
  'source_snapshot_as_of',
  'evidence_source',
  'notes',
  'review_decision',
] as const;

// ---------------------------------------------------------------------------------------------
// Exact, closed nested field sets -- no nested object may carry an undeclared extra key any more
// than a row or the top-level artifact may.
// ---------------------------------------------------------------------------------------------

export const SOURCE_IDENTITY_FIELDS = ['source_repository', 'source_schema', 'source_player_id', 'source_season'] as const;
export const MIRROR_SOURCE_FIELDS = ['repo', 'commit', 'wrapper_path', 'kind', 'schema_version', 'sha256'] as const;
export const GOVERNING_DESIGN_FIELDS = [
  'readiness_design_issue',
  'readiness_design_pr',
  'readiness_design_merge_commit',
  'design_documents',
] as const;

export interface AvailabilityStatusCounts {
  eligible_at_cutoff: number;
  ineligible_after_cutoff: number;
  unresolved_no_availability_proof: number;
  unavailable: number;
}

const zeroStatusCounts = (): AvailabilityStatusCounts => ({
  eligible_at_cutoff: 0,
  ineligible_after_cutoff: 0,
  unresolved_no_availability_proof: 0,
  unavailable: 0,
});

export interface AvailabilityEvidenceArtifact {
  kind: typeof AVAILABILITY_EVIDENCE_KIND;
  schema_version: typeof AVAILABILITY_EVIDENCE_SCHEMA_VERSION;
  issue: string;
  governing_design: {
    readiness_design_issue: string;
    readiness_design_pr: string;
    readiness_design_merge_commit: string;
    design_documents: string[];
  };
  generated_at: string;
  generated_at_is_operational_timestamp_only_not_fact_availability: true;
  season: number;
  /** Always null in schema 1.0.0 -- exists solely to support eligible_at_cutoff/ineligible_after_cutoff, which are hard-rejected. */
  cutoff_at: null;
  /** Always null in schema 1.0.0 -- see cutoff_at. */
  cutoff_evidence_source: null;
  mirror_source: MirrorSourceReference;
  status_counts: AvailabilityStatusCounts;
  status_counts_by_family: Record<FieldFamily, AvailabilityStatusCounts>;
  rows: AvailabilityEvidenceRow[];
}

/** The exact, closed set of top-level artifact fields -- no undeclared claim may be added silently. */
export const AVAILABILITY_EVIDENCE_TOP_LEVEL_FIELDS = [
  'kind',
  'schema_version',
  'issue',
  'governing_design',
  'generated_at',
  'generated_at_is_operational_timestamp_only_not_fact_availability',
  'season',
  'cutoff_at',
  'cutoff_evidence_source',
  'mirror_source',
  'status_counts',
  'status_counts_by_family',
  'rows',
] as const;

// ---------------------------------------------------------------------------------------------
// Audit decision (issue #160's required decision enum -- exactly one is emitted)
// ---------------------------------------------------------------------------------------------

export const AVAILABILITY_AUDIT_DECISIONS = [
  'rookie_transition_profile_forecast_source_availability_audit_complete',
  'rookie_transition_profile_forecast_source_availability_audit_requires_followup',
  'rookie_transition_profile_forecast_source_availability_audit_blocked',
] as const;
export type AvailabilityAuditDecision = (typeof AVAILABILITY_AUDIT_DECISIONS)[number];

/**
 * Deterministic decision rule:
 * - `blocked`: the artifact fails any fail-closed validation check.
 * - `requires_followup`: the artifact is valid but at least one row remains
 *   `unresolved_no_availability_proof`.
 * - `complete`: the artifact is valid and no row remains `unresolved_no_availability_proof`. In
 *   schema 1.0.0, since `eligible_at_cutoff`/`ineligible_after_cutoff` are hard-rejected, this is
 *   only reachable if every locked (player, field_family) pair's real pinned mirror value is null --
 *   i.e. every row is honestly `unavailable`. This is not currently the case (223 of 240 pairs have a
 *   present value), so `complete` is not reachable for this population until a future schema version
 *   lifts the hard-rejection.
 */
export const decideAvailabilityAudit = (valid: boolean, statusCounts: AvailabilityStatusCounts): AvailabilityAuditDecision => {
  if (!valid) return 'rookie_transition_profile_forecast_source_availability_audit_blocked';
  if (statusCounts.unresolved_no_availability_proof > 0) {
    return 'rookie_transition_profile_forecast_source_availability_audit_requires_followup';
  }
  return 'rookie_transition_profile_forecast_source_availability_audit_complete';
};

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/**
 * Everything this validator needs to know about the real, committed mirror -- computed by the CLI
 * (which does the actual file I/O) so this module stays pure. `recomputedHashes`/`wrapperSha256` must
 * be computed from the ACTUAL bytes at the pinned commit, never trusted from the wrapper's own
 * self-report.
 */
export interface MirrorVerificationContext {
  /** Parsed content of the committed ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json wrapper, dereferenced at MIRROR_SOURCE_COMMIT_PIN. */
  wrapper: {
    kind: string;
    schema_version: string;
    source_lock: { repo: string; commit: string; schema_version: string; season: number; row_count: number };
    forecast_mirror: { paths: Record<string, string>; mirrored_hashes: Record<string, string> };
  };
  /** SHA-256 of the wrapper file's own actual bytes at the pinned commit, recomputed -- never the wrapper's self-report. */
  wrapperSha256: string;
  /** SHA-256 of the actual mirror_json/mirror_csv/mirror_manifest bytes at the pinned commit, recomputed. */
  recomputedMirrorHashes: { mirror_json: string; mirror_csv: string; mirror_manifest: string };
  /** Directory listing of the mirror directory at the pinned commit (via `git ls-tree`), not the live worktree. */
  actualMirrorDirFilenames: string[];
  /** Whether the pinned mirror value is present (non-null) for (source_player_id, field_family), derived from the actual mirror JSON. */
  valuePresence: Record<string, Record<FieldFamily, boolean>>;
}

export interface AvailabilityEvidenceValidationResult {
  valid: boolean;
  errors: string[];
  statusCounts: AvailabilityStatusCounts;
  statusCountsByFamily: Record<FieldFamily, AvailabilityStatusCounts>;
  decision: AvailabilityAuditDecision;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isParseableOffsetInstant = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
};

/** True iff `value`'s own keys are exactly `keys` (no missing, extra, or substituted key). */
const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((k, i) => k === expected[i]);
};

export const validateRookieTransitionProfileAvailabilityEvidence = (
  candidate: unknown,
  lockedSourcePlayerIds: readonly string[],
  mirrorContext: MirrorVerificationContext,
): AvailabilityEvidenceValidationResult => {
  const errors: string[] = [];
  const statusCounts = zeroStatusCounts();
  const statusCountsByFamily: Record<FieldFamily, AvailabilityStatusCounts> = {
    draft_capital: zeroStatusCounts(),
    age_at_entry: zeroStatusCounts(),
    athletic_testing: zeroStatusCounts(),
    college_production: zeroStatusCounts(),
    official_postdraft_outcome: zeroStatusCounts(),
  };

  const fail = (): AvailabilityEvidenceValidationResult => ({
    valid: false,
    errors,
    statusCounts,
    statusCountsByFamily,
    decision: decideAvailabilityAudit(false, statusCounts),
  });

  if (!isPlainObject(candidate)) {
    errors.push('artifact is not an object');
    return fail();
  }
  const artifact = candidate as Partial<AvailabilityEvidenceArtifact> & Record<string, unknown>;

  const actualTopFields = Object.keys(artifact).sort();
  const expectedTopFields = [...AVAILABILITY_EVIDENCE_TOP_LEVEL_FIELDS].sort();
  if (actualTopFields.length !== expectedTopFields.length || !actualTopFields.every((f, i) => f === expectedTopFields[i])) {
    errors.push(`artifact top-level fields must be exactly the governed contract fields, found [${actualTopFields.join(', ')}]`);
  }

  if (artifact.kind !== AVAILABILITY_EVIDENCE_KIND) errors.push(`kind must be ${AVAILABILITY_EVIDENCE_KIND}, found ${JSON.stringify(artifact.kind)}`);
  if (artifact.schema_version !== AVAILABILITY_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${AVAILABILITY_EVIDENCE_SCHEMA_VERSION}, found ${JSON.stringify(artifact.schema_version)}`);
  }
  if (artifact.issue !== AVAILABILITY_EVIDENCE_IMPLEMENTATION_ISSUE) {
    errors.push(`issue must be ${AVAILABILITY_EVIDENCE_IMPLEMENTATION_ISSUE}, found ${JSON.stringify(artifact.issue)}`);
  }
  const governingDesign = artifact.governing_design as Record<string, unknown> | undefined;
  if (!isPlainObject(governingDesign)) {
    errors.push('governing_design is missing');
  } else {
    if (!hasExactKeys(governingDesign, GOVERNING_DESIGN_FIELDS)) {
      errors.push(`governing_design fields must be exactly ${JSON.stringify(GOVERNING_DESIGN_FIELDS)}, found [${Object.keys(governingDesign).join(', ')}]`);
    }
    if (governingDesign.readiness_design_issue !== READINESS_DESIGN_ISSUE) {
      errors.push(`governing_design.readiness_design_issue must be ${READINESS_DESIGN_ISSUE}`);
    }
    if (governingDesign.readiness_design_pr !== READINESS_DESIGN_PR) {
      errors.push(`governing_design.readiness_design_pr must be ${READINESS_DESIGN_PR}`);
    }
    if (governingDesign.readiness_design_merge_commit !== READINESS_DESIGN_MERGE_COMMIT) {
      errors.push(`governing_design.readiness_design_merge_commit must be ${READINESS_DESIGN_MERGE_COMMIT}`);
    }
    const docs = governingDesign.design_documents;
    const expectedDocs = READINESS_DESIGN_DOCUMENTS as readonly string[];
    if (!Array.isArray(docs) || docs.length !== expectedDocs.length || !expectedDocs.every((d, i) => docs[i] === d)) {
      errors.push(`governing_design.design_documents must be exactly ${JSON.stringify(expectedDocs)}`);
    }
  }

  if (!isParseableOffsetInstant(artifact.generated_at)) {
    errors.push('generated_at must be a fully-qualified, offset-bearing ISO-8601 instant');
  }
  if (artifact.generated_at_is_operational_timestamp_only_not_fact_availability !== true) {
    errors.push('generated_at_is_operational_timestamp_only_not_fact_availability must be exactly true');
  }

  if (artifact.season !== SOURCE_SEASON) errors.push(`season must be ${SOURCE_SEASON}, found ${JSON.stringify(artifact.season)}`);

  // ---- mirror_source: dereference the real wrapper, recompute hashes, never trust self-report ----
  const mirrorSource = artifact.mirror_source;
  if (!isPlainObject(mirrorSource)) {
    errors.push('mirror_source is missing');
  } else {
    if (!hasExactKeys(mirrorSource, MIRROR_SOURCE_FIELDS)) {
      errors.push(`mirror_source fields must be exactly ${JSON.stringify(MIRROR_SOURCE_FIELDS)}, found [${Object.keys(mirrorSource).join(', ')}]`);
    }
    if (mirrorSource.repo !== FORECAST_REPO) errors.push(`mirror_source.repo must be ${FORECAST_REPO}`);
    if (mirrorSource.commit !== MIRROR_SOURCE_COMMIT_PIN) {
      errors.push(`mirror_source.commit must be the pinned Forecast commit ${MIRROR_SOURCE_COMMIT_PIN}`);
    }
    if (mirrorSource.wrapper_path !== MIRROR_PROVENANCE_PATH) errors.push(`mirror_source.wrapper_path must be ${MIRROR_PROVENANCE_PATH}`);
    if (mirrorSource.kind !== WRAPPER_KIND) errors.push(`mirror_source.kind must be ${WRAPPER_KIND}`);
    if (mirrorSource.schema_version !== WRAPPER_SCHEMA_VERSION) errors.push(`mirror_source.schema_version must be ${WRAPPER_SCHEMA_VERSION}`);
    if (mirrorSource.sha256 !== mirrorContext.wrapperSha256) {
      errors.push('mirror_source.sha256 does not match the recomputed SHA-256 of the actual committed wrapper file');
    }

    // Dereference the wrapper itself: exactly the four authorized files, recomputed hashes, source lock.
    const wrapper = mirrorContext.wrapper;
    if (wrapper.kind !== WRAPPER_KIND || wrapper.schema_version !== WRAPPER_SCHEMA_VERSION) {
      errors.push('dereferenced wrapper kind/schema_version does not match the pinned wrapper contract');
    }
    const lock = wrapper.source_lock;
    if (
      lock.repo !== SOURCE_REPO ||
      lock.commit !== SOURCE_COMMIT ||
      lock.schema_version !== SOURCE_SCHEMA_VERSION ||
      lock.season !== SOURCE_SEASON ||
      lock.row_count !== SOURCE_ROW_COUNT
    ) {
      errors.push("dereferenced wrapper's source_lock does not match the locked starting point (repo/commit/schema_version/season/row_count)");
    }
    const actualFilenames = [...mirrorContext.actualMirrorDirFilenames].sort();
    const expectedFilenames = [...AUTHORIZED_MIRROR_FILENAMES].sort();
    if (actualFilenames.length !== expectedFilenames.length || !actualFilenames.every((f, i) => f === expectedFilenames[i])) {
      errors.push('the mirror directory does not contain exactly the four authorized local mirror files');
    }
    const declaredHashes = wrapper.forecast_mirror?.mirrored_hashes;
    const recomputed = mirrorContext.recomputedMirrorHashes;
    if (
      !declaredHashes ||
      declaredHashes.mirror_json !== recomputed.mirror_json ||
      declaredHashes.mirror_csv !== recomputed.mirror_csv ||
      declaredHashes.mirror_manifest !== recomputed.mirror_manifest
    ) {
      errors.push("the wrapper's declared mirrored_hashes do not match the recomputed hashes of the actual committed mirror files");
    }

    // The wrapper must declare exactly the four authorized local paths -- a substituted or missing
    // path entry must not be able to pass just because the directory happens to contain the expected
    // filenames.
    const declaredPaths = wrapper.forecast_mirror?.paths;
    const expectedPaths: Record<string, string> = {
      mirror_json: MIRROR_JSON_PATH,
      mirror_csv: MIRROR_CSV_PATH,
      mirror_manifest: MIRROR_MANIFEST_PATH,
      wrapper: MIRROR_PROVENANCE_PATH,
    };
    const declaredPathKeys = declaredPaths ? Object.keys(declaredPaths).sort() : [];
    const expectedPathKeys = Object.keys(expectedPaths).sort();
    const pathsMatch =
      !!declaredPaths &&
      declaredPathKeys.length === expectedPathKeys.length &&
      declaredPathKeys.every((k, i) => k === expectedPathKeys[i]) &&
      Object.entries(expectedPaths).every(([k, v]) => declaredPaths[k] === v);
    if (!pathsMatch) {
      errors.push("the wrapper's declared forecast_mirror.paths do not match the four authorized local paths exactly (no missing, extra, or substituted keys)");
    }
  }

  // ---- Cutoff: hard-required null in schema 1.0.0 -----------------------------------------------
  // cutoff_at/cutoff_evidence_source exist solely to support eligible_at_cutoff/ineligible_after_cutoff,
  // which are hard-rejected below -- so both must stay null. See module doc comment.
  if (artifact.cutoff_at !== null) errors.push('cutoff_at must be null in schema 1.0.0');
  if (artifact.cutoff_evidence_source !== null) errors.push('cutoff_evidence_source must be null in schema 1.0.0');

  // ---- Rows (design §10-§13) -----------------------------------------------------------------------
  const rows = artifact.rows;
  if (!Array.isArray(rows)) {
    errors.push('rows is not an array');
    return fail();
  }

  const seenKeys = new Set<string>();
  const seenPlayerFamilyPairs = new Set<string>();

  rows.forEach((candidateRow, index) => {
    if (!isPlainObject(candidateRow)) {
      errors.push(`rows[${index}] is not an object`);
      return;
    }
    const row = candidateRow as Partial<AvailabilityEvidenceRow> & Record<string, unknown>;
    const identity = row.source_identity as Partial<SourceIdentityKey> | undefined;
    const rowKey = `rows[${index}] (${String(identity?.source_player_id ?? 'unknown')}/${String(row.field_family ?? 'unknown')})`;

    const actualFields = Object.keys(row).sort();
    const expectedFields = [...AVAILABILITY_EVIDENCE_ROW_FIELDS].sort();
    if (actualFields.length !== expectedFields.length || !actualFields.every((f, i) => f === expectedFields[i])) {
      errors.push(`${rowKey}: fields must be exactly the eight contract fields, found [${actualFields.join(', ')}]`);
      return;
    }

    const family = row.field_family;
    if (typeof family !== 'string' || !(FIELD_FAMILIES as readonly string[]).includes(family)) {
      errors.push(`${rowKey}: field_family ${JSON.stringify(family)} is not in the closed enum`);
      return;
    }

    if (
      !isPlainObject(identity) ||
      !hasExactKeys(identity, SOURCE_IDENTITY_FIELDS) ||
      identity.source_repository !== SOURCE_REPO ||
      identity.source_schema !== SOURCE_SCHEMA_VERSION ||
      identity.source_season !== SOURCE_SEASON ||
      !isNonEmptyString(identity.source_player_id)
    ) {
      errors.push(`${rowKey}: source_identity must carry exactly the four contract fields with the exact locked (source_repository, source_schema, source_season) and a non-empty source_player_id`);
      return;
    }
    const playerId = identity.source_player_id;

    const fullKey = `${identity.source_repository}|${identity.source_schema}|${playerId}|${identity.source_season}|${family}`;
    if (seenKeys.has(fullKey)) errors.push(`${rowKey}: duplicate governed row-family key`);
    seenKeys.add(fullKey);
    seenPlayerFamilyPairs.add(`${playerId}::${family as FieldFamily}`);

    const status = row.availability_status;
    if (typeof status !== 'string' || !(AVAILABILITY_STATUSES as readonly string[]).includes(status)) {
      errors.push(`${rowKey}: availability_status ${JSON.stringify(status)} is not in the closed §11 enum`);
      return;
    }
    statusCounts[status as AvailabilityStatus] += 1;
    statusCountsByFamily[family as FieldFamily][status as AvailabilityStatus] += 1;

    // eligible_at_cutoff / ineligible_after_cutoff are hard-rejected in schema 1.0.0 regardless of
    // how well-evidenced the row claims to be -- see module doc comment. This mirrors how Lane A
    // ultimately hard-rejected its own unverifiable 3.3_governed_artifact evidence class (#159).
    if ((HARD_REJECTED_STATUSES as readonly string[]).includes(status)) {
      errors.push(
        `${rowKey}: ${status} is hard-rejected in schema 1.0.0 pending a per-field_family structured evidence contract (design follow-up under issue #160) -- no row may claim this status yet, however well-evidenced`,
      );
      return;
    }

    if (row.source_snapshot_as_of !== null) {
      errors.push(`${rowKey}: source_snapshot_as_of must be null in schema 1.0.0`);
    }
    if (row.available_at !== null) errors.push(`${rowKey}: available_at must be null in schema 1.0.0`);
    if (row.evidence_source !== null) errors.push(`${rowKey}: evidence_source must be null in schema 1.0.0`);
    if (row.review_decision !== null) errors.push(`${rowKey}: review_decision must be null in schema 1.0.0`);

    if (row.notes !== null && typeof row.notes !== 'string') {
      errors.push(`${rowKey}: notes must be null or a string`);
    }

    // Value-presence agreement (design §11/§15): `unavailable` iff the pinned mirror value is null.
    const presence = mirrorContext.valuePresence[playerId]?.[family as FieldFamily];
    if (presence === undefined) {
      errors.push(`${rowKey}: no pinned mirror value-presence fact is available to check against (unknown player/family)`);
    } else if (presence === false && status !== 'unavailable') {
      errors.push(`${rowKey}: the pinned mirror value is actually null for this player/family, but status is not 'unavailable'`);
    } else if (presence === true && status === 'unavailable') {
      errors.push(`${rowKey}: status is 'unavailable' but the pinned mirror value is actually present -- a present value can never be marked unavailable`);
    }
  });

  // ---- Population accounting (§13: exactly 48 locked identities x 5 families = 240) -----------------
  const lockedSet = new Set(lockedSourcePlayerIds);
  if (lockedSet.size !== SOURCE_ROW_COUNT) {
    errors.push(`locked source population must contain exactly ${SOURCE_ROW_COUNT} distinct player ids, found ${lockedSet.size}`);
  }
  for (const playerId of lockedSet) {
    for (const family of FIELD_FAMILIES) {
      if (!seenPlayerFamilyPairs.has(`${playerId}::${family}`)) {
        errors.push(`missing row: ${playerId} has no row for field_family ${family}`);
      }
    }
  }
  for (const pair of seenPlayerFamilyPairs) {
    const [playerId] = pair.split('::');
    if (!lockedSet.has(playerId)) errors.push(`extra row: ${playerId} is not one of the 48 locked source identities`);
  }
  const expectedTotal = SOURCE_ROW_COUNT * FIELD_FAMILIES.length;
  if (seenKeys.size !== expectedTotal) {
    errors.push(`artifact must contain exactly ${expectedTotal} distinct governed row-family keys, found ${seenKeys.size}`);
  }

  // Deterministic ordering by (source_season, source_repository, source_schema, source_player_id, field_family).
  const orderKey = (row: Record<string, unknown>): [number, string, string, string, string] => {
    const identity = (row.source_identity ?? {}) as Record<string, unknown>;
    return [
      Number(identity.source_season),
      String(identity.source_repository),
      String(identity.source_schema),
      String(identity.source_player_id),
      String(row.field_family),
    ];
  };
  const compareOrderKeys = (a: readonly (string | number)[], b: readonly (string | number)[]): number => {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  };
  const orderedRows = (rows as unknown[]).filter(isPlainObject) as Array<Record<string, unknown>>;
  for (let i = 1; i < orderedRows.length; i += 1) {
    if (!isPlainObject(orderedRows[i - 1].source_identity) || !isPlainObject(orderedRows[i].source_identity)) continue;
    if (compareOrderKeys(orderKey(orderedRows[i - 1]), orderKey(orderedRows[i])) >= 0) {
      errors.push(
        `rows are not strictly ordered by (source_season, source_repository, source_schema, source_player_id, field_family) at index ${i}`,
      );
    }
  }

  // Status-count invariants: overall sums to 240, and each family sums to 48, matching declared counts.
  const declaredOverall = artifact.status_counts;
  if (!isPlainObject(declaredOverall)) {
    errors.push('status_counts is missing');
  } else {
    if (!hasExactKeys(declaredOverall, AVAILABILITY_STATUSES)) {
      errors.push(`status_counts fields must be exactly ${JSON.stringify(AVAILABILITY_STATUSES)}, found [${Object.keys(declaredOverall).join(', ')}]`);
    }
    for (const status of AVAILABILITY_STATUSES) {
      if (declaredOverall[status] !== statusCounts[status]) {
        errors.push(`status_counts.${status} declares ${JSON.stringify(declaredOverall[status])} but recomputation finds ${statusCounts[status]}`);
      }
    }
  }
  const overallTotal = AVAILABILITY_STATUSES.reduce((sum, s) => sum + statusCounts[s], 0);
  if (overallTotal !== expectedTotal) errors.push(`the four status counts must sum to exactly ${expectedTotal}, found ${overallTotal}`);

  const declaredByFamily = artifact.status_counts_by_family;
  if (!isPlainObject(declaredByFamily)) {
    errors.push('status_counts_by_family is missing');
  } else {
    if (!hasExactKeys(declaredByFamily, FIELD_FAMILIES)) {
      errors.push(`status_counts_by_family fields must be exactly ${JSON.stringify(FIELD_FAMILIES)}, found [${Object.keys(declaredByFamily).join(', ')}]`);
    }
    for (const family of FIELD_FAMILIES) {
      const declaredFamily = declaredByFamily[family] as Partial<AvailabilityStatusCounts> | undefined;
      if (!isPlainObject(declaredFamily)) {
        errors.push(`status_counts_by_family.${family} is missing`);
        continue;
      }
      if (!hasExactKeys(declaredFamily, AVAILABILITY_STATUSES)) {
        errors.push(`status_counts_by_family.${family} fields must be exactly ${JSON.stringify(AVAILABILITY_STATUSES)}, found [${Object.keys(declaredFamily).join(', ')}]`);
      }
      for (const status of AVAILABILITY_STATUSES) {
        if (declaredFamily[status] !== statusCountsByFamily[family][status]) {
          errors.push(`status_counts_by_family.${family}.${status} declares ${JSON.stringify(declaredFamily[status])} but recomputation finds ${statusCountsByFamily[family][status]}`);
        }
      }
      const familyTotal = AVAILABILITY_STATUSES.reduce((sum, s) => sum + statusCountsByFamily[family][s], 0);
      if (familyTotal !== SOURCE_ROW_COUNT) errors.push(`status_counts_by_family.${family} must sum to exactly ${SOURCE_ROW_COUNT}, found ${familyTotal}`);
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    statusCounts,
    statusCountsByFamily,
    decision: decideAvailabilityAudit(valid, statusCounts),
  };
};
