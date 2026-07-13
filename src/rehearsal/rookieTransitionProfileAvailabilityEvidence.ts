/**
 * Governed Forecast source-availability evidence for the committed rookie_transition_profile_v0.2.0
 * mirror (Lane B of the pre-experiment readiness design; Forecast #160), implementing exactly §8-§13
 * of the merged design pinned at commit `73834c2a30743c2587b32742c4e5c98320e33dfe`
 * (`docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md`).
 *
 * This module is PURE (no I/O): it validates a candidate availability-evidence artifact against the
 * pinned mirror/source locks and the merged design's fail-closed rules. The CLI
 * (`scripts/runRookieTransitionProfileAvailabilityAudit.ts`) does the file I/O (reading the committed
 * mirror files, recomputing hashes, listing the mirror directory) and calls this module.
 *
 * Lane B is independent of Lane A (#158/#159): this module never reads, imports, or depends on the
 * identity crosswalk, and never uses identity-resolution status to infer availability.
 *
 * Fail-closed philosophy (design §8-§13): a correct `unresolved_no_availability_proof` is always
 * preferable to an assumed-eligible claim. Every check below collects an error rather than repairing,
 * defaulting, or dropping anything.
 *
 * Self-certification discipline (learned from Lane A's independent review, #159): `eligible_at_cutoff`
 * and `ineligible_after_cutoff` require real archived exact-value evidence AND an explicit,
 * attributable human review decision -- exactly the same discipline design §3.2 already required of
 * Lane A's identity evidence. This module enforces the structural/mechanical half of that; the
 * human-review half can never be satisfied by this implementing agent itself. No row in the artifact
 * this module ships with claims a review that did not occur.
 */

import {
  AUTHORIZED_MIRROR_FILENAMES,
  MIRROR_PROVENANCE_PATH,
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

// ---------------------------------------------------------------------------------------------
// Closed enums (design §8, §11) -- any other token fails closed
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

const GIT_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------------------------
// Artifact shape (design §13)
// ---------------------------------------------------------------------------------------------

export interface EvidenceCitation {
  repo: string;
  commit: string;
  path: string;
  /** Non-null only where a schema/spec_version applies; otherwise null with schema_not_applicable_reason. */
  schema_version: string | null;
  schema_not_applicable_reason: string | null;
  sha256: string;
  original_url: string;
  retrieved_at: string;
}

export interface CutoffEvidenceSource extends EvidenceCitation {
  reviewer: string;
  reviewed_at: string;
  source_timezone_or_offset: string;
  published_draft_start_at: string;
}

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

export interface RowEvidenceSource extends EvidenceCitation {
  /** The exact literal string the archived content must be shown to contain (design §10/§12). */
  mirrored_value_literal: string;
}

export interface ReviewDecision {
  reviewer: string;
  reviewed_at: string;
}

export interface AvailabilityEvidenceRow {
  field_family: FieldFamily;
  source_identity: SourceIdentityKey;
  availability_status: AvailabilityStatus;
  available_at: string | null;
  source_snapshot_as_of: string | null;
  evidence_source: RowEvidenceSource | null;
  notes: string | null;
  review_decision: ReviewDecision | null;
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
  season: number;
  cutoff_at: string | null;
  cutoff_evidence_source: CutoffEvidenceSource | null;
  mirror_source: MirrorSourceReference;
  status_counts: AvailabilityStatusCounts;
  status_counts_by_family: Record<FieldFamily, AvailabilityStatusCounts>;
  rows: AvailabilityEvidenceRow[];
}

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
 * - `complete`: the artifact is valid and no row remains `unresolved_no_availability_proof`. Per
 *   issue #160, `complete` does NOT mean every row is eligible -- honest `ineligible_after_cutoff`
 *   and `unavailable` rows are terminal audit outcomes that do not block `complete`.
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

/** Resolves an archived-evidence citation to its content, or null if not reproducible. Injected so this module stays pure. */
export type ArchivedEvidenceResolver = (citation: EvidenceCitation) => string | null;

/**
 * Everything this validator needs to know about the real, committed mirror -- computed by the CLI
 * (which does the actual file I/O) so this module stays pure. `recomputedHashes`/`wrapperSha256` must
 * be computed from the ACTUAL bytes on disk at validation time, never trusted from the wrapper's own
 * self-report.
 */
export interface MirrorVerificationContext {
  /** Parsed content of the committed ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json wrapper. */
  wrapper: {
    kind: string;
    schema_version: string;
    source_lock: { repo: string; commit: string; schema_version: string; season: number; row_count: number };
    forecast_mirror: { paths: Record<string, string>; mirrored_hashes: Record<string, string> };
  };
  /** SHA-256 of the wrapper file's own actual bytes, recomputed -- never the wrapper's self-report. */
  wrapperSha256: string;
  /** SHA-256 of the actual mirror_json/mirror_csv/mirror_manifest bytes on disk, recomputed. */
  recomputedMirrorHashes: { mirror_json: string; mirror_csv: string; mirror_manifest: string };
  /** Real directory listing of the mirror directory at validation time. */
  actualMirrorDirFilenames: string[];
  /** Whether the pinned mirror value is present (non-null) for (source_player_id, field_family), derived from the actual mirror JSON. */
  valuePresence: Record<string, Record<FieldFamily, boolean>>;
  /**
   * Canonical `JSON.stringify` form of the REAL pinned mirror value for (source_player_id,
   * field_family), or null when the value itself is null. A row's `mirrored_value_literal` must
   * match this exactly (design §10/§12) -- otherwise a row could claim eligibility for a
   * self-declared literal unrelated to what the mirror actually carries, verified only against an
   * archive the same author also controls. Never accepted on the archive check alone.
   */
  mirrorValueLiterals: Record<string, Record<FieldFamily, string | null>>;
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

const isValidCitation = (value: unknown): value is EvidenceCitation => {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.repo) || !isNonEmptyString(value.path)) return false;
  if (typeof value.commit !== 'string' || !GIT_COMMIT_SHA_PATTERN.test(value.commit)) return false;
  if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) return false;
  if (!isNonEmptyString(value.original_url) || !isNonEmptyString(value.retrieved_at)) return false;
  const hasSchema = isNonEmptyString(value.schema_version);
  const hasReason = isNonEmptyString(value.schema_not_applicable_reason);
  if (value.schema_version === null) {
    if (!hasReason) return false;
  } else if (!hasSchema || value.schema_not_applicable_reason !== null) {
    return false;
  }
  return true;
};

const isParseableOffsetInstant = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
};

export const validateRookieTransitionProfileAvailabilityEvidence = (
  candidate: unknown,
  lockedSourcePlayerIds: readonly string[],
  mirrorContext: MirrorVerificationContext,
  resolveArchivedEvidence: ArchivedEvidenceResolver,
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

  if (artifact.season !== SOURCE_SEASON) errors.push(`season must be ${SOURCE_SEASON}, found ${JSON.stringify(artifact.season)}`);

  // ---- mirror_source: dereference the real wrapper, recompute hashes, never trust self-report ----
  const mirrorSource = artifact.mirror_source;
  if (!isPlainObject(mirrorSource)) {
    errors.push('mirror_source is missing');
  } else {
    if (mirrorSource.repo !== FORECAST_REPO) errors.push(`mirror_source.repo must be ${FORECAST_REPO}`);
    if (typeof mirrorSource.commit !== 'string' || !GIT_COMMIT_SHA_PATTERN.test(mirrorSource.commit)) {
      errors.push('mirror_source.commit must be a full 40-character lowercase hex git commit SHA');
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
      lock.schema_version !== SOURCE_SCHEMA_VERSION ||
      lock.season !== SOURCE_SEASON ||
      lock.row_count !== SOURCE_ROW_COUNT
    ) {
      errors.push("dereferenced wrapper's source_lock does not match the locked starting point (repo/schema_version/season/row_count)");
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
  }

  // ---- Cutoff (design §8) -------------------------------------------------------------------------
  const cutoffAt = artifact.cutoff_at ?? null;
  const cutoffSource = artifact.cutoff_evidence_source ?? null;
  if (cutoffAt === null) {
    if (cutoffSource !== null) errors.push('cutoff_evidence_source must be null while cutoff_at is null');
  } else {
    if (!isParseableOffsetInstant(cutoffAt)) {
      errors.push('cutoff_at must be a fully-qualified, offset-bearing ISO-8601 instant');
    }
    if (!isValidCitation(cutoffSource)) {
      errors.push('cutoff_at is non-null but cutoff_evidence_source is missing or structurally incomplete');
    } else {
      const source = cutoffSource as CutoffEvidenceSource;
      if (!isNonEmptyString(source.reviewer) || !isNonEmptyString(source.reviewed_at)) {
        errors.push('cutoff_evidence_source requires a named human reviewer and dated sign-off');
      }
      if (!isNonEmptyString(source.source_timezone_or_offset) || !isNonEmptyString(source.published_draft_start_at)) {
        errors.push('cutoff_evidence_source requires source_timezone_or_offset and published_draft_start_at');
      }
      const content = resolveArchivedEvidence(source);
      if (content === null) {
        errors.push('cutoff_evidence_source is not reproducible from its citation (design §8/§12 fail-closed)');
      } else {
        if (!content.includes(String(SOURCE_SEASON))) errors.push('cutoff_evidence_source archive does not state the locked season');
        if (isNonEmptyString(source.published_draft_start_at) && !content.includes(source.published_draft_start_at)) {
          errors.push('cutoff_evidence_source archive does not contain the claimed published_draft_start_at');
        }
      }
      if (
        isParseableOffsetInstant(cutoffAt) &&
        isNonEmptyString(source.published_draft_start_at) &&
        isParseableOffsetInstant(source.published_draft_start_at) &&
        !(Date.parse(cutoffAt) < Date.parse(source.published_draft_start_at))
      ) {
        errors.push('cutoff_at must be strictly earlier than the archived published_draft_start_at');
      }
    }
  }

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
      identity.source_repository !== SOURCE_REPO ||
      identity.source_schema !== SOURCE_SCHEMA_VERSION ||
      identity.source_season !== SOURCE_SEASON ||
      !isNonEmptyString(identity.source_player_id)
    ) {
      errors.push(`${rowKey}: source_identity must carry the exact locked (source_repository, source_schema, source_season) and a non-empty source_player_id`);
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

    // Value-presence agreement (design §11/§15): `unavailable` iff the pinned mirror value is null.
    const presence = mirrorContext.valuePresence[playerId]?.[family as FieldFamily];
    if (presence === undefined) {
      errors.push(`${rowKey}: no pinned mirror value-presence fact is available to check against (unknown player/family)`);
    } else if (presence === false && status !== 'unavailable') {
      errors.push(`${rowKey}: the pinned mirror value is actually null for this player/family, but status is not 'unavailable'`);
    } else if (presence === true && status === 'unavailable') {
      errors.push(`${rowKey}: status is 'unavailable' but the pinned mirror value is actually present -- a present value can never be marked unavailable`);
    }

    // official_postdraft_outcome is definitionally post-draft; it may never be pre-draft-eligible here.
    if (family === 'official_postdraft_outcome' && status === 'eligible_at_cutoff') {
      errors.push(`${rowKey}: official_postdraft_outcome may never be eligible_at_cutoff (design §10) -- this is definitionally post-draft information`);
    }

    if (status === 'unavailable' || status === 'unresolved_no_availability_proof') {
      if (row.available_at !== null) errors.push(`${rowKey}: ${status} row must carry a null available_at`);
      if (row.evidence_source !== null) errors.push(`${rowKey}: ${status} row must carry a null evidence_source`);
      return;
    }

    // eligible_at_cutoff / ineligible_after_cutoff both require real, reproduced, exact-value evidence
    // AND an explicit attributable human review decision -- never self-certified.
    if (cutoffAt === null || !isParseableOffsetInstant(cutoffAt)) {
      errors.push(`${rowKey}: ${status} requires a validly pinned cutoff_at, which is not present`);
      return;
    }
    const availableAt = row.available_at;
    if (!isParseableOffsetInstant(availableAt)) {
      errors.push(`${rowKey}: ${status} requires a non-null, parseable, offset-bearing available_at`);
      return;
    }
    const evidenceSource = row.evidence_source;
    if (!isValidCitation(evidenceSource) || !isNonEmptyString((evidenceSource as RowEvidenceSource).mirrored_value_literal)) {
      errors.push(`${rowKey}: ${status} requires a structurally complete evidence_source with a non-empty mirrored_value_literal`);
      return;
    }
    const content = resolveArchivedEvidence(evidenceSource as RowEvidenceSource);
    if (content === null) {
      errors.push(`${rowKey}: evidence_source is not reproducible from its citation (design §12 fail-closed)`);
      return;
    }
    if (!content.includes((evidenceSource as RowEvidenceSource).mirrored_value_literal)) {
      errors.push(`${rowKey}: archived evidence does not actually contain the claimed mirrored_value_literal`);
      return;
    }
    // Cross-check against the REAL pinned mirror value, not just the self-archived evidence -- a row
    // must not be able to claim eligibility for a self-declared literal unrelated to what the mirror
    // actually carries, verified only against an archive the same author also controls.
    const realLiteral = mirrorContext.mirrorValueLiterals[playerId]?.[family as FieldFamily];
    if (realLiteral === undefined) {
      errors.push(`${rowKey}: no real pinned mirror value-literal fact is available to cross-check against (unknown player/family)`);
      return;
    }
    if (realLiteral === null || realLiteral !== (evidenceSource as RowEvidenceSource).mirrored_value_literal) {
      errors.push(`${rowKey}: mirrored_value_literal does not match the real pinned mirror value for this player/field_family`);
      return;
    }
    const reviewDecision = row.review_decision;
    if (!isPlainObject(reviewDecision) || !isNonEmptyString(reviewDecision.reviewer) || !isNonEmptyString(reviewDecision.reviewed_at)) {
      errors.push(`${rowKey}: ${status} requires an explicit, attributable human review_decision (non-null reviewer and reviewed_at)`);
      return;
    }
    const availableAtMs = Date.parse(availableAt);
    const cutoffMs = Date.parse(cutoffAt);
    if (status === 'eligible_at_cutoff' && !(availableAtMs < cutoffMs)) {
      errors.push(`${rowKey}: eligible_at_cutoff requires available_at < cutoff_at`);
    }
    if (status === 'ineligible_after_cutoff' && !(availableAtMs >= cutoffMs)) {
      errors.push(`${rowKey}: ineligible_after_cutoff requires available_at >= cutoff_at`);
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
    for (const family of FIELD_FAMILIES) {
      const declaredFamily = declaredByFamily[family] as Partial<AvailabilityStatusCounts> | undefined;
      if (!isPlainObject(declaredFamily)) {
        errors.push(`status_counts_by_family.${family} is missing`);
        continue;
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
