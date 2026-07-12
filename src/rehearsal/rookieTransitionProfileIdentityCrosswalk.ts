/**
 * Governed Forecast identity crosswalk for the committed rookie_transition_profile_v0.2.0 mirror
 * (Lane A of the pre-experiment readiness design; Forecast #158), implementing exactly §1-§7 of the
 * merged design pinned at commit `73834c2a30743c2587b32742c4e5c98320e33dfe`
 * (`docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md`).
 *
 * This module is PURE (no I/O): it validates a candidate crosswalk artifact against the pinned
 * source lock and the merged design's fail-closed rules. The CLI
 * (`scripts/runRookieTransitionProfileIdentityCrosswalkAudit.ts`) does the file I/O and calls this
 * module against the committed artifact.
 *
 * The crosswalk artifact this module validates is INERT: it is never imported by any model,
 * production, downstream, or UI path (enforced by test), never authorizes feature use, and a
 * positive audit decision marks only Lane A complete -- it never authorizes the integrated
 * readiness review (which independently requires Lane B), experiment design, or any model/
 * production/downstream/UI activation.
 *
 * Fail-closed philosophy (design §5/§6/§7): a correct `unresolved`, `conflicting_evidence`, or
 * `blocked` row is always preferable to a guessed mapping. Every check below collects an error
 * rather than repairing, defaulting, or dropping anything.
 */

import {
  SOURCE_COMMIT,
  SOURCE_REPO,
  SOURCE_ROW_COUNT,
  SOURCE_SCHEMA_VERSION,
  SOURCE_SEASON,
} from './rookieTransitionProfileMirror.js';

export const IDENTITY_CROSSWALK_IMPLEMENTATION_ISSUE = 'TIBER-Forecast#158' as const;
export const READINESS_DESIGN_ISSUE = 'TIBER-Forecast#155' as const;
export const READINESS_DESIGN_PR = 'TIBER-Forecast#156' as const;
export const READINESS_DESIGN_MERGE_COMMIT = '73834c2a30743c2587b32742c4e5c98320e33dfe' as const;
export const READINESS_DESIGN_DOCUMENTS = [
  'docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.md',
  'docs/experiments/rookie-transition-profile-forecast-preexperiment-readiness-design-2026-07-11.json',
] as const;

export const IDENTITY_CROSSWALK_KIND = 'rookie_transition_profile_v0_forecast_identity_crosswalk' as const;
export const IDENTITY_CROSSWALK_SCHEMA_VERSION = '1.0.0' as const;
export const IDENTITY_CROSSWALK_PATH =
  'data/experiments/rookieTransitionProfile/rookie_transition_profile_v0_forecast_identity_crosswalk.json' as const;

/** Canonical Forecast identity format (design §1): the NFL GSIS player identifier. */
export const GSIS_ID_PATTERN = /^\d{2}-\d{7}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------------------------
// Closed enums (design §5, §7) -- any other token fails closed
// ---------------------------------------------------------------------------------------------

export const RESOLUTION_STATUSES = ['resolved', 'unresolved', 'conflicting_evidence', 'blocked'] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const RESOLUTION_EVIDENCE_CLASSES = [
  '3.1_overall_pick_chain',
  '3.2_reviewed_mapping',
  '3.3_governed_artifact',
] as const;
export type ResolutionEvidenceClass = (typeof RESOLUTION_EVIDENCE_CLASSES)[number];

export const INDEPENDENT_RESOLUTION_EVIDENCE_CLASSES = ['3.2_reviewed_mapping', '3.3_governed_artifact'] as const;
export type IndependentResolutionEvidenceClass = (typeof INDEPENDENT_RESOLUTION_EVIDENCE_CLASSES)[number];

export const IDENTITY_COVERAGE_DEPENDENCIES = [
  'independent_of_post_draft_outcome',
  'contingent_on_post_draft_participation',
  'unproven',
] as const;
export type IdentityCoverageDependency = (typeof IDENTITY_COVERAGE_DEPENDENCIES)[number];

/**
 * §3.1's pinned availability status. Directly re-verified for #158 (2026-07-12) at
 * `Prometheus-Frameworks/TIBER-Data` commit `d9a5beaacf12e3fbd74becd02db3d2ac39e48905`: no governed
 * TIBER-Data artifact joins `(draft_year, overall_pick)` to a `gsis_id`
 * (`player_season_coverage_v0.json` still has zero `draft_year: 2026` rows and `draft_pick` remains
 * an unaudited passthrough; `nfl_draft_results_2026.json` carries no GSIS-format field). Until a
 * future PR proves the design's exact §3.1 precondition in a governed artifact and changes this
 * module accordingly, ANY `3.1_overall_pick_chain` evidence entry fails validation outright.
 */
export const OVERALL_PICK_CHAIN_AVAILABILITY = 'blocked_pending_second_leg_evidence' as const;

/**
 * Prohibited-method tripwire markers (design §4). This is a defense-in-depth text scan over
 * evidence entries only (never over row `notes`, which are audit prose) -- the primary protection
 * against prohibited methods is the structural evidence requirements plus the mandatory human
 * review, not this scan. A marker hit inside any evidence entry of a row whose status is not
 * `blocked` fails validation: discovered reliance on a prohibited method must set the row to
 * `blocked` (design §4/§5), never remain `resolved`.
 */
export const PROHIBITED_METHOD_MARKERS = [
  'name-only',
  'name only',
  'fuzzy',
  'phonetic',
  'edit distance',
  'normalized-name',
  'normalized name',
  'nickname expansion',
  'position + name',
  'position+name',
  'roster-order',
  'roster order',
  'first-match',
  'first match',
  'best-effort',
  'best effort',
  'confidence score',
] as const;

// ---------------------------------------------------------------------------------------------
// Artifact shape (design §7) -- all fourteen row fields, always present
// ---------------------------------------------------------------------------------------------

export interface ArchivedCitation {
  repo: string;
  commit: string;
  path: string;
  schema_version?: string | null;
  sha256: string;
}

export interface GsisBearingEvidence {
  description: string;
  archived_citation: ArchivedCitation;
  original_url: string;
  retrieved_at: string;
}

export interface CorroboratingFact {
  fact: string;
  /**
   * A specific token/phrase that MUST be independently verified to appear in the archived content
   * (design §3.2: corroborating facts must "bind the GSIS-bearing record to the source player",
   * not merely cite an archive that exists). `fact` alone is unverifiable free text; this field is
   * the machine-checkable claim the validator actually confirms against the archived bytes.
   */
  expected_literal: string;
  archived_citation: ArchivedCitation;
  original_url: string;
  retrieved_at: string;
}

export interface ReviewedMappingEvidence {
  evidence_class: '3.2_reviewed_mapping';
  resolves_to_forecast_canonical_player_id: string;
  reviewer: string;
  reviewed_at: string;
  gsis_bearing_evidence: GsisBearingEvidence;
  corroborating_facts: CorroboratingFact[];
}

export interface GovernedArtifactEvidence {
  evidence_class: '3.3_governed_artifact';
  resolves_to_forecast_canonical_player_id: string;
  governed_artifact_citation: ArchivedCitation;
}

export interface OverallPickChainEvidence {
  evidence_class: '3.1_overall_pick_chain';
  resolves_to_forecast_canonical_player_id: string;
  join_key: { draft_year: number; overall_pick: number };
  source_citations: ArchivedCitation[];
}

export type ResolutionEvidenceEntry = ReviewedMappingEvidence | GovernedArtifactEvidence | OverallPickChainEvidence;

/**
 * Closed set of machine-verifiable reasons a row may be `blocked` (design §4/§5: "evidence was
 * found to rely on a prohibited method... was fabricated... or was otherwise disqualified").
 * A recognized `evidence_class` token alone is never sufficient evidence of an actual disqualifying
 * defect -- each reason below is independently verified against the entry's own content, never
 * accepted as a bare self-declared label.
 */
export const DISQUALIFICATION_REASONS = [
  'prohibited_method',
  'non_reproducible_or_fabricated_evidence',
  'governed_blocker_citation',
] as const;
export type DisqualificationReason = (typeof DISQUALIFICATION_REASONS)[number];

/** The shape a `blocked` row's `resolution_evidence` entries must take -- a disqualified attempt. */
export interface DisqualifiedEvidenceEntry {
  evidence_class: ResolutionEvidenceClass;
  disqualification_reason: DisqualificationReason;
  disqualification_detail: string;
  disqualified_citation?: ArchivedCitation | null;
}

export interface IdentityCoverageMechanism {
  description: string;
  citation: ArchivedCitation | null;
}

/** The full governed source key (design §2/§7) -- never a subset, never `source_player_id` alone. */
export interface SourceIdentityKey {
  source_repository: string;
  source_schema: string;
  source_player_id: string;
  source_season: number;
}

export interface IdentityCrosswalkRow {
  source_repository: string;
  source_schema: string;
  source_player_id: string;
  source_season: number;
  forecast_canonical_player_id: string | null;
  resolution_status: ResolutionStatus;
  resolution_evidence_class: ResolutionEvidenceClass | null;
  independent_resolution_evidence_class: IndependentResolutionEvidenceClass | null;
  identity_coverage_dependency: IdentityCoverageDependency;
  identity_coverage_mechanism: IdentityCoverageMechanism | null;
  resolution_evidence: (ResolutionEvidenceEntry | DisqualifiedEvidenceEntry)[];
  reviewer: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export const IDENTITY_CROSSWALK_ROW_FIELDS = [
  'source_repository',
  'source_schema',
  'source_player_id',
  'source_season',
  'forecast_canonical_player_id',
  'resolution_status',
  'resolution_evidence_class',
  'independent_resolution_evidence_class',
  'identity_coverage_dependency',
  'identity_coverage_mechanism',
  'resolution_evidence',
  'reviewer',
  'reviewed_at',
  'notes',
] as const;

export interface IdentityCrosswalkStatusCounts {
  resolved: number;
  unresolved: number;
  conflicting_evidence: number;
  blocked: number;
}

export interface IdentityCrosswalkArtifact {
  kind: typeof IDENTITY_CROSSWALK_KIND;
  schema_version: typeof IDENTITY_CROSSWALK_SCHEMA_VERSION;
  issue: string;
  governing_design: {
    readiness_design_issue: string;
    readiness_design_pr: string;
    readiness_design_merge_commit: string;
    design_documents: string[];
  };
  generated_at: string;
  source_lock: {
    repo: string;
    commit: string;
    schema_version: string;
    season: number;
    row_count: number;
  };
  status_counts: IdentityCrosswalkStatusCounts;
  rows: IdentityCrosswalkRow[];
}

// ---------------------------------------------------------------------------------------------
// Audit decision (issue #158's required decision enum -- exactly one is emitted)
// ---------------------------------------------------------------------------------------------

export const IDENTITY_CROSSWALK_AUDIT_DECISIONS = [
  'rookie_transition_profile_forecast_identity_resolution_audit_complete',
  'rookie_transition_profile_forecast_identity_resolution_audit_requires_followup',
  'rookie_transition_profile_forecast_identity_resolution_audit_blocked',
] as const;
export type IdentityCrosswalkAuditDecision = (typeof IDENTITY_CROSSWALK_AUDIT_DECISIONS)[number];

/**
 * Deterministic decision rule:
 * - `blocked`: the artifact fails any fail-closed validation check -- no decision beyond "fix the
 *   artifact" is available.
 * - `requires_followup`: the artifact is valid but at least one row remains `unresolved` -- per
 *   design §5, `unresolved` means "no permitted evidence class has yet been attempted or completed",
 *   i.e. the question this lane exists to answer ("is there reproducible governed evidence
 *   establishing one exact gsis_id?") is not yet definitively answered for that row (most commonly
 *   because §3.2's mandatory named-human review has not yet occurred).
 * - `complete`: the artifact is valid and no row remains `unresolved`. Per issue #158, `complete`
 *   does NOT mean all 48 identities are resolved -- `conflicting_evidence` and `blocked` are
 *   definitive, honest audit outcomes -- and it never authorizes the integrated readiness review,
 *   experiment design, or any model/production/downstream/UI use.
 */
export const decideIdentityCrosswalkAudit = (
  valid: boolean,
  statusCounts: IdentityCrosswalkStatusCounts,
  verifiedBlockedCount: number,
): IdentityCrosswalkAuditDecision => {
  if (!valid) return 'rookie_transition_profile_forecast_identity_resolution_audit_blocked';
  if (statusCounts.unresolved > 0) return 'rookie_transition_profile_forecast_identity_resolution_audit_requires_followup';
  // Defense-in-depth, restating explicitly what row-level validation already enforces: `blocked`
  // may only contribute to a `..._complete` decision when EVERY blocked row has a machine-verified
  // disposition, never a bare recognized-class label (design §5).
  if (statusCounts.blocked > 0 && verifiedBlockedCount !== statusCounts.blocked) {
    return 'rookie_transition_profile_forecast_identity_resolution_audit_requires_followup';
  }
  return 'rookie_transition_profile_forecast_identity_resolution_audit_complete';
};

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/**
 * Resolves an archived-evidence citation to the archived content bytes, or `null` when the archive
 * cannot be reproduced (missing file, hash mismatch, foreign repo). Injected so this module stays
 * pure; the CLI supplies a real filesystem-backed resolver that recomputes the SHA-256 before
 * returning content. Per design §3.2/§12, non-reproducible archives fail closed.
 */
export type ArchivedEvidenceResolver = (citation: ArchivedCitation) => string | null;

export interface IdentityCrosswalkValidationResult {
  valid: boolean;
  errors: string[];
  statusCounts: IdentityCrosswalkStatusCounts;
  evidenceClassCounts: Record<string, number>;
  identityCoverageDependencyCounts: Record<IdentityCoverageDependency, number>;
  /** Count of `blocked` rows whose disposition (reviewer/notes/evidence + reason) was mechanically verified. */
  verifiedBlockedCount: number;
  decision: IdentityCrosswalkAuditDecision;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isValidCitation = (value: unknown): value is ArchivedCitation =>
  isPlainObject(value) &&
  isNonEmptyString(value.repo) &&
  isNonEmptyString(value.commit) &&
  isNonEmptyString(value.path) &&
  typeof value.sha256 === 'string' &&
  SHA256_PATTERN.test(value.sha256);

const findProhibitedMethodMarkers = (value: unknown): string[] => {
  const hits = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      const lower = node.toLowerCase();
      for (const marker of PROHIBITED_METHOD_MARKERS) if (lower.includes(marker)) hits.add(marker);
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (isPlainObject(node)) {
      Object.values(node).forEach(walk);
    }
  };
  walk(value);
  return [...hits];
};

/** §7's independence rule 4: an independent §3.2/§3.3 entry may carry no §3.1 dependency at all. */
const referencesOverallPickChain = (entry: unknown): boolean => {
  const serialized = JSON.stringify(entry).toLowerCase();
  return serialized.includes('overall_pick') || serialized.includes('official_postdraft_outcome');
};

interface EvidenceCheckOutcome {
  structurallyComplete: boolean;
  resolvesTo: string | null;
}

const checkEvidenceEntry = (
  entry: Record<string, unknown>,
  sourceIdentity: SourceIdentityKey,
  rowKey: string,
  entryIndex: number,
  resolveArchivedEvidence: ArchivedEvidenceResolver,
  errors: string[],
): EvidenceCheckOutcome => {
  const where = `${rowKey} resolution_evidence[${entryIndex}]`;
  const evidenceClass = entry.evidence_class;
  const resolvesTo =
    typeof entry.resolves_to_forecast_canonical_player_id === 'string'
      ? entry.resolves_to_forecast_canonical_player_id
      : null;

  if (typeof evidenceClass !== 'string' || !(RESOLUTION_EVIDENCE_CLASSES as readonly string[]).includes(evidenceClass)) {
    errors.push(`${where}: evidence_class ${JSON.stringify(evidenceClass)} is not a permitted class token`);
    return { structurallyComplete: false, resolvesTo };
  }
  if (resolvesTo === null || !GSIS_ID_PATTERN.test(resolvesTo)) {
    errors.push(`${where}: resolves_to_forecast_canonical_player_id ${JSON.stringify(resolvesTo)} is not GSIS format`);
    return { structurallyComplete: false, resolvesTo };
  }

  const prohibited = findProhibitedMethodMarkers(entry);
  if (prohibited.length > 0) {
    errors.push(`${where}: relies on prohibited method marker(s) [${prohibited.join(', ')}] (design §4) -- affected row must be blocked`);
    return { structurallyComplete: false, resolvesTo };
  }

  if (evidenceClass === '3.1_overall_pick_chain') {
    errors.push(
      `${where}: 3.1_overall_pick_chain is ${OVERALL_PICK_CHAIN_AVAILABILITY} (design §3.1) -- ` +
        'no governed TIBER-Data artifact joins (draft_year, overall_pick) to gsis_id; this class may not be used',
    );
    return { structurallyComplete: false, resolvesTo };
  }

  if (evidenceClass === '3.3_governed_artifact') {
    const citation = entry.governed_artifact_citation;
    if (!isValidCitation(citation) || !isNonEmptyString(citation.schema_version)) {
      errors.push(`${where}: 3.3 entry lacks a complete governed_artifact_citation (repo/commit/path/schema_version/sha256)`);
      return { structurallyComplete: false, resolvesTo };
    }
    if ((citation as ArchivedCitation).repo === 'Prometheus-Frameworks/TIBER-Forecast') {
      errors.push(
        `${where}: 3.3 governed artifact is attributed to TIBER-Forecast itself -- Forecast must only consume, ` +
          'never originate, a canonical-identity artifact (design §3.3)',
      );
      return { structurallyComplete: false, resolvesTo };
    }
    const archivedArtifactContent = resolveArchivedEvidence(citation as ArchivedCitation);
    if (archivedArtifactContent === null) {
      errors.push(`${where}: 3.3 governed_artifact_citation is not reproducible from its citation (design §3.3/§12 fail-closed)`);
      return { structurallyComplete: false, resolvesTo };
    }
    // Containing both strings somewhere in the document is not proof of a mapping -- a multi-row
    // artifact could contain the source identity in one row and the gsis_id in an unrelated one.
    // The archive must be parsed deterministically and checked for exactly one row that maps the
    // FULL four-field governed source key to the claimed gsis_id. If it cannot be parsed
    // deterministically, 3.3 stays unusable for this citation -- there is no substring fallback.
    let parsedArtifact: unknown;
    try {
      parsedArtifact = JSON.parse(archivedArtifactContent);
    } catch {
      errors.push(
        `${where}: cited governed artifact could not be deterministically parsed as JSON -- 3.3 remains unusable ` +
          'for this citation (no substring-search fallback, design §3.3)',
      );
      return { structurallyComplete: false, resolvesTo };
    }
    const candidateRows: unknown[] | null = Array.isArray(parsedArtifact)
      ? parsedArtifact
      : isPlainObject(parsedArtifact) && Array.isArray(parsedArtifact.rows)
        ? parsedArtifact.rows
        : null;
    if (candidateRows === null) {
      errors.push(
        `${where}: cited governed artifact does not expose a deterministic rows array (a top-level array, or a ` +
          '"rows" array) -- 3.3 remains unusable for this citation',
      );
      return { structurallyComplete: false, resolvesTo };
    }
    const matches = candidateRows.filter(
      (candidate): candidate is Record<string, unknown> =>
        isPlainObject(candidate) &&
        candidate.source_repository === sourceIdentity.source_repository &&
        candidate.source_schema === sourceIdentity.source_schema &&
        candidate.source_player_id === sourceIdentity.source_player_id &&
        candidate.source_season === sourceIdentity.source_season,
    );
    if (matches.length === 0) {
      errors.push(
        `${where}: cited governed artifact contains no row mapping the exact governed source key ` +
          '(source_repository/source_schema/source_player_id/source_season) -- zero matches fails closed',
      );
      return { structurallyComplete: false, resolvesTo };
    }
    if (matches.length > 1) {
      errors.push(
        `${where}: cited governed artifact contains ${matches.length} rows mapping the exact governed source key ` +
          '-- multiple matches fails closed (ambiguous)',
      );
      return { structurallyComplete: false, resolvesTo };
    }
    if (matches[0].gsis_id !== resolvesTo) {
      errors.push(
        `${where}: cited governed artifact maps this exact source identity to ${JSON.stringify(matches[0].gsis_id)}, ` +
          `not the claimed ${resolvesTo} -- target mismatch fails closed`,
      );
      return { structurallyComplete: false, resolvesTo };
    }
    // Where the archived content is itself JSON declaring a schema/spec version, it must agree with
    // the citation's own declared schema_version -- never accepted merely because both are present.
    if (isPlainObject(parsedArtifact)) {
      const declaredVersion = parsedArtifact.schema_version ?? parsedArtifact.spec_version;
      if (typeof declaredVersion === 'string' && declaredVersion !== (citation as ArchivedCitation).schema_version) {
        errors.push(
          `${where}: cited governed artifact declares schema_version/spec_version ${JSON.stringify(declaredVersion)}, ` +
            `citation claims ${JSON.stringify((citation as ArchivedCitation).schema_version)}`,
        );
        return { structurallyComplete: false, resolvesTo };
      }
    }
    return { structurallyComplete: true, resolvesTo };
  }

  // 3.2_reviewed_mapping
  let complete = true;
  if (!isNonEmptyString(entry.reviewer)) {
    errors.push(`${where}: 3.2 entry lacks a named human reviewer`);
    complete = false;
  }
  if (!isNonEmptyString(entry.reviewed_at)) {
    errors.push(`${where}: 3.2 entry lacks a dated sign-off (reviewed_at)`);
    complete = false;
  }
  const gsisEvidence = entry.gsis_bearing_evidence;
  if (
    !isPlainObject(gsisEvidence) ||
    !isNonEmptyString(gsisEvidence.description) ||
    !isValidCitation(gsisEvidence.archived_citation) ||
    !isNonEmptyString(gsisEvidence.original_url) ||
    !isNonEmptyString(gsisEvidence.retrieved_at)
  ) {
    errors.push(`${where}: 3.2 entry lacks structurally complete GSIS-bearing evidence (description/archived_citation/original_url/retrieved_at)`);
    complete = false;
  } else {
    const archivedContent = resolveArchivedEvidence(gsisEvidence.archived_citation as ArchivedCitation);
    if (archivedContent === null) {
      errors.push(`${where}: archived GSIS-bearing evidence is not reproducible from its citation (design §3.2/§12 fail-closed)`);
      complete = false;
    } else if (!archivedContent.includes(resolvesTo)) {
      errors.push(`${where}: archived GSIS-bearing evidence does not contain the claimed gsis_id ${resolvesTo}`);
      complete = false;
    }
  }
  const facts = entry.corroborating_facts;
  if (!Array.isArray(facts) || facts.length < 2) {
    errors.push(`${where}: 3.2 entry requires at least two independent corroborating facts, found ${Array.isArray(facts) ? facts.length : 0}`);
    complete = false;
  } else {
    // `facts.length >= 2` alone does not prove independence -- two entries citing the same archive,
    // the same fact text, or the same URL are not two independent corroborating facts (design §3.2:
    // "at least two independent corroborating facts", never merely two array entries).
    const seenHashes = new Set<string>();
    const seenCitationKeys = new Set<string>();
    const seenFactTexts = new Set<string>();
    const seenUrls = new Set<string>();
    facts.forEach((fact, factIndex) => {
      if (
        !isPlainObject(fact) ||
        !isNonEmptyString(fact.fact) ||
        !isNonEmptyString(fact.expected_literal) ||
        !isValidCitation(fact.archived_citation) ||
        !isNonEmptyString(fact.original_url) ||
        !isNonEmptyString(fact.retrieved_at)
      ) {
        errors.push(`${where}: corroborating_facts[${factIndex}] lacks fact/expected_literal/archived_citation/original_url/retrieved_at`);
        complete = false;
        return;
      }
      const factArchiveContent = resolveArchivedEvidence(fact.archived_citation as ArchivedCitation);
      if (factArchiveContent === null) {
        errors.push(`${where}: corroborating_facts[${factIndex}]'s archived citation is not reproducible from its citation (design §3.2/§12 fail-closed)`);
        complete = false;
        return;
      }
      // Archive existence alone does not prove the fact binds the GSIS-bearing record to the
      // source player -- the archived bytes must actually contain the specific asserted literal.
      if (!factArchiveContent.includes(fact.expected_literal)) {
        errors.push(
          `${where}: corroborating_facts[${factIndex}]'s archived content does not actually contain its claimed ` +
            `expected_literal ${JSON.stringify(fact.expected_literal)}`,
        );
        complete = false;
        return;
      }
      const citation = fact.archived_citation as ArchivedCitation;
      const citationKey = `${citation.repo}|${citation.commit}|${citation.path}`;
      const factText = fact.fact.trim().toLowerCase();
      const url = fact.original_url.trim().toLowerCase();
      if (seenHashes.has(citation.sha256)) {
        errors.push(`${where}: corroborating_facts[${factIndex}] shares its archived content hash with another corroborating fact -- not independent (design §3.2)`);
        complete = false;
      }
      if (seenCitationKeys.has(citationKey)) {
        errors.push(`${where}: corroborating_facts[${factIndex}] cites the same archived location (repo/commit/path) as another corroborating fact -- not independent (design §3.2)`);
        complete = false;
      }
      if (seenFactTexts.has(factText)) {
        errors.push(`${where}: corroborating_facts[${factIndex}] repeats another corroborating fact's text verbatim -- not independent (design §3.2)`);
        complete = false;
      }
      if (seenUrls.has(url)) {
        errors.push(`${where}: corroborating_facts[${factIndex}] repeats another corroborating fact's original_url -- not independent (design §3.2)`);
        complete = false;
      }
      seenHashes.add(citation.sha256);
      seenCitationKeys.add(citationKey);
      seenFactTexts.add(factText);
      seenUrls.add(url);
    });
  }
  return { structurallyComplete: complete, resolvesTo };
};

/**
 * Verifies a `blocked` row's disqualified-evidence entry actually exhibits its declared
 * `disqualification_reason` -- a recognized `evidence_class` token plus arbitrary reviewer/notes is
 * NOT sufficient (that would let every unresolved row be relabeled `blocked` with a fabricated
 * disqualification and no real defect). Returns whether the claimed reason was verified; pushes an
 * error and returns `false` whenever it is not.
 */
const checkDisqualifiedEvidenceEntry = (
  entry: Record<string, unknown>,
  rowKey: string,
  entryIndex: number,
  resolveArchivedEvidence: ArchivedEvidenceResolver,
  errors: string[],
): boolean => {
  const where = `${rowKey} resolution_evidence[${entryIndex}]`;
  const evidenceClass = entry.evidence_class;
  if (typeof evidenceClass !== 'string' || !(RESOLUTION_EVIDENCE_CLASSES as readonly string[]).includes(evidenceClass)) {
    errors.push(`${where}: blocked row's disqualified-evidence entry must still declare a recognized evidence_class`);
    return false;
  }
  const reason = entry.disqualification_reason;
  if (typeof reason !== 'string' || !(DISQUALIFICATION_REASONS as readonly string[]).includes(reason)) {
    errors.push(
      `${where}: blocked row's disqualified-evidence entry must declare a recognized disqualification_reason ` +
        '(design §4/§5) -- a recognized evidence_class token alone is not proof of an actual disqualifying defect',
    );
    return false;
  }
  if (!isNonEmptyString(entry.disqualification_detail)) {
    errors.push(`${where}: blocked row's disqualified-evidence entry requires non-empty disqualification_detail explaining the defect`);
    return false;
  }

  if (reason === 'prohibited_method') {
    const markers = findProhibitedMethodMarkers(entry);
    if (markers.length === 0) {
      errors.push(
        `${where}: disqualification_reason=prohibited_method claims a prohibited-method reliance, but no ` +
          'prohibited-method marker (design §4) is actually present in this entry',
      );
      return false;
    }
    return true;
  }

  if (reason === 'non_reproducible_or_fabricated_evidence') {
    const cited = entry.disqualified_citation;
    if (!isValidCitation(cited)) {
      errors.push(`${where}: disqualification_reason=non_reproducible_or_fabricated_evidence requires a structurally complete disqualified_citation`);
      return false;
    }
    if (resolveArchivedEvidence(cited as ArchivedCitation) !== null) {
      errors.push(
        `${where}: disqualification_reason=non_reproducible_or_fabricated_evidence claims the cited evidence does ` +
          'not reproduce, but it actually does -- the claimed defect is not real',
      );
      return false;
    }
    return true;
  }

  // governed_blocker_citation -- a real, reproducible citation naming the authoritative reason.
  const cited = entry.disqualified_citation;
  if (!isValidCitation(cited)) {
    errors.push(`${where}: disqualification_reason=governed_blocker_citation requires a structurally complete disqualified_citation naming the blocker`);
    return false;
  }
  if (resolveArchivedEvidence(cited as ArchivedCitation) === null) {
    errors.push(`${where}: disqualification_reason=governed_blocker_citation's cited evidence is not reproducible from its citation (design §12 fail-closed)`);
    return false;
  }
  return true;
};

export const validateRookieTransitionProfileIdentityCrosswalk = (
  candidate: unknown,
  lockedSourcePlayerIds: readonly string[],
  resolveArchivedEvidence: ArchivedEvidenceResolver,
): IdentityCrosswalkValidationResult => {
  const errors: string[] = [];
  const statusCounts: IdentityCrosswalkStatusCounts = { resolved: 0, unresolved: 0, conflicting_evidence: 0, blocked: 0 };
  const evidenceClassCounts: Record<string, number> = { null: 0 };
  for (const cls of RESOLUTION_EVIDENCE_CLASSES) evidenceClassCounts[cls] = 0;
  const identityCoverageDependencyCounts: Record<IdentityCoverageDependency, number> = {
    independent_of_post_draft_outcome: 0,
    contingent_on_post_draft_participation: 0,
    unproven: 0,
  };
  let verifiedBlockedCount = 0;

  const fail = (): IdentityCrosswalkValidationResult => ({
    valid: false,
    errors,
    statusCounts,
    evidenceClassCounts,
    identityCoverageDependencyCounts,
    verifiedBlockedCount,
    decision: decideIdentityCrosswalkAudit(false, statusCounts, verifiedBlockedCount),
  });

  if (!isPlainObject(candidate)) {
    errors.push('artifact is not an object');
    return fail();
  }
  const artifact = candidate as Partial<IdentityCrosswalkArtifact> & Record<string, unknown>;

  if (artifact.kind !== IDENTITY_CROSSWALK_KIND) errors.push(`kind must be ${IDENTITY_CROSSWALK_KIND}, found ${JSON.stringify(artifact.kind)}`);
  if (artifact.schema_version !== IDENTITY_CROSSWALK_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${IDENTITY_CROSSWALK_SCHEMA_VERSION}, found ${JSON.stringify(artifact.schema_version)}`);
  }

  // ---- Governing-design pins (issue #158 "Pin those contracts...for this work") -------------------
  if (artifact.issue !== IDENTITY_CROSSWALK_IMPLEMENTATION_ISSUE) {
    errors.push(`issue must be ${IDENTITY_CROSSWALK_IMPLEMENTATION_ISSUE}, found ${JSON.stringify(artifact.issue)}`);
  }
  const governingDesign = artifact.governing_design as Record<string, unknown> | undefined;
  if (!isPlainObject(governingDesign)) {
    errors.push('governing_design is missing');
  } else {
    if (governingDesign.readiness_design_issue !== READINESS_DESIGN_ISSUE) {
      errors.push(
        `governing_design.readiness_design_issue must be ${READINESS_DESIGN_ISSUE}, found ${JSON.stringify(governingDesign.readiness_design_issue)}`,
      );
    }
    if (governingDesign.readiness_design_pr !== READINESS_DESIGN_PR) {
      errors.push(`governing_design.readiness_design_pr must be ${READINESS_DESIGN_PR}, found ${JSON.stringify(governingDesign.readiness_design_pr)}`);
    }
    if (governingDesign.readiness_design_merge_commit !== READINESS_DESIGN_MERGE_COMMIT) {
      errors.push(
        `governing_design.readiness_design_merge_commit must be ${READINESS_DESIGN_MERGE_COMMIT}, ` +
          `found ${JSON.stringify(governingDesign.readiness_design_merge_commit)}`,
      );
    }
    const docs = governingDesign.design_documents;
    const expectedDocs = READINESS_DESIGN_DOCUMENTS as readonly string[];
    if (!Array.isArray(docs) || docs.length !== expectedDocs.length || !expectedDocs.every((d, i) => docs[i] === d)) {
      errors.push(`governing_design.design_documents must be exactly ${JSON.stringify(expectedDocs)}, found ${JSON.stringify(docs)}`);
    }
  }

  // ---- Exact source-lock agreement (issue #158 "Preserve these locks exactly") --------------------
  const lock = artifact.source_lock;
  if (!isPlainObject(lock)) {
    errors.push('source_lock is missing');
  } else {
    if (lock.repo !== SOURCE_REPO) errors.push(`source_lock.repo must be ${SOURCE_REPO}`);
    if (lock.commit !== SOURCE_COMMIT) errors.push(`source_lock.commit must be ${SOURCE_COMMIT}`);
    if (lock.schema_version !== SOURCE_SCHEMA_VERSION) errors.push(`source_lock.schema_version must be ${SOURCE_SCHEMA_VERSION}`);
    if (lock.season !== SOURCE_SEASON) errors.push(`source_lock.season must be ${SOURCE_SEASON}`);
    if (lock.row_count !== SOURCE_ROW_COUNT) errors.push(`source_lock.row_count must be ${SOURCE_ROW_COUNT}`);
  }

  const rows = artifact.rows;
  if (!Array.isArray(rows)) {
    errors.push('rows is not an array');
    return fail();
  }

  // ---- Row-level checks ---------------------------------------------------------------------------
  const seenKeys = new Set<string>();
  const seenPlayerIds = new Set<string>();
  const canonicalIdToSourceKeys = new Map<string, string[]>();

  rows.forEach((candidateRow, index) => {
    if (!isPlainObject(candidateRow)) {
      errors.push(`rows[${index}] is not an object`);
      return;
    }
    const row = candidateRow as Partial<IdentityCrosswalkRow> & Record<string, unknown>;
    const rowKey = `rows[${index}] (${String(row.source_player_id ?? 'unknown')})`;

    // All fourteen contract fields, always present -- and nothing else (fail-closed shape).
    const actualFields = Object.keys(row).sort();
    const expectedFields = [...IDENTITY_CROSSWALK_ROW_FIELDS].sort();
    if (actualFields.length !== expectedFields.length || !actualFields.every((f, i) => f === expectedFields[i])) {
      errors.push(`${rowKey}: fields must be exactly the fourteen contract fields, found [${actualFields.join(', ')}]`);
      return;
    }

    if (row.source_repository !== SOURCE_REPO) errors.push(`${rowKey}: source_repository must be ${SOURCE_REPO}`);
    if (row.source_schema !== SOURCE_SCHEMA_VERSION) errors.push(`${rowKey}: source_schema must be ${SOURCE_SCHEMA_VERSION}`);
    if (row.source_season !== SOURCE_SEASON) errors.push(`${rowKey}: source_season must be ${SOURCE_SEASON}`);
    if (!isNonEmptyString(row.source_player_id)) {
      errors.push(`${rowKey}: source_player_id must be a non-empty string`);
      return;
    }

    // Governed-key duplicate prevention (§2/§7): the FULL four-field key, never player_id alone.
    const fullKey = `${String(row.source_repository)}|${String(row.source_schema)}|${row.source_player_id}|${String(row.source_season)}`;
    if (seenKeys.has(fullKey)) errors.push(`${rowKey}: duplicate governed source key`);
    seenKeys.add(fullKey);
    seenPlayerIds.add(row.source_player_id);

    // Closed enums.
    const status = row.resolution_status;
    if (typeof status !== 'string' || !(RESOLUTION_STATUSES as readonly string[]).includes(status)) {
      errors.push(`${rowKey}: resolution_status ${JSON.stringify(status)} is not in the closed §5 enum`);
      return;
    }
    statusCounts[status as ResolutionStatus] += 1;

    const evidenceClass = row.resolution_evidence_class ?? null;
    if (evidenceClass !== null && (typeof evidenceClass !== 'string' || !(RESOLUTION_EVIDENCE_CLASSES as readonly string[]).includes(evidenceClass))) {
      errors.push(`${rowKey}: resolution_evidence_class ${JSON.stringify(evidenceClass)} is not in the closed enum`);
      return;
    }
    evidenceClassCounts[evidenceClass === null ? 'null' : evidenceClass] += 1;

    const independentClass = row.independent_resolution_evidence_class ?? null;
    if (
      independentClass !== null &&
      (typeof independentClass !== 'string' || !(INDEPENDENT_RESOLUTION_EVIDENCE_CLASSES as readonly string[]).includes(independentClass))
    ) {
      errors.push(`${rowKey}: independent_resolution_evidence_class ${JSON.stringify(independentClass)} is not in the closed enum`);
      return;
    }

    const dependency = row.identity_coverage_dependency;
    if (typeof dependency !== 'string' || !(IDENTITY_COVERAGE_DEPENDENCIES as readonly string[]).includes(dependency)) {
      errors.push(`${rowKey}: identity_coverage_dependency ${JSON.stringify(dependency)} is not in the closed enum`);
      return;
    }
    identityCoverageDependencyCounts[dependency as IdentityCoverageDependency] += 1;

    // §16: an independence claim requires a non-null, citable mechanism that proves it --
    // never a bare assertion or an evidence-class label.
    if (dependency === 'independent_of_post_draft_outcome') {
      const mechanism = row.identity_coverage_mechanism;
      if (
        !isPlainObject(mechanism) ||
        !isNonEmptyString(mechanism.description) ||
        !isValidCitation(mechanism.citation)
      ) {
        errors.push(
          `${rowKey}: identity_coverage_dependency=independent_of_post_draft_outcome requires a non-null ` +
            'identity_coverage_mechanism with a citable proof (description + repo/commit/path/sha256 citation)',
        );
      }
    }

    // Evidence entries.
    const evidence = row.resolution_evidence;
    if (!Array.isArray(evidence)) {
      errors.push(`${rowKey}: resolution_evidence must be an array`);
      return;
    }
    const sourceIdentity: SourceIdentityKey = {
      source_repository: String(row.source_repository),
      source_schema: String(row.source_schema),
      source_player_id: row.source_player_id,
      source_season: Number(row.source_season),
    };
    // A `blocked` row documents a DISQUALIFIED attempt (design §4/§5) -- its entries must declare
    // and MECHANICALLY VERIFY a real disqualification_reason (checkDisqualifiedEvidenceEntry), never
    // just a recognized evidence_class token with arbitrary reviewer/notes. They never go through
    // checkEvidenceEntry's resolving-quality gauntlet -- that gauntlet is what a legitimate attempt
    // must pass, and a disqualified attempt is expected to fail it, not repeat it.
    let blockedEntriesAllVerified = evidence.length > 0;
    const outcomes: EvidenceCheckOutcome[] = evidence.map((entry, entryIndex) => {
      if (!isPlainObject(entry)) {
        errors.push(`${rowKey} resolution_evidence[${entryIndex}]: not an object`);
        if (status === 'blocked') blockedEntriesAllVerified = false;
        return { structurallyComplete: false, resolvesTo: null };
      }
      if (status === 'blocked') {
        const verified = checkDisqualifiedEvidenceEntry(entry, rowKey, entryIndex, resolveArchivedEvidence, errors);
        if (!verified) blockedEntriesAllVerified = false;
        return { structurallyComplete: false, resolvesTo: null };
      }
      return checkEvidenceEntry(entry, sourceIdentity, rowKey, entryIndex, resolveArchivedEvidence, errors);
    });

    // Conflicting candidates produce conflicting_evidence -- never a silent pick (§6). A blocked
    // row's disqualified attempts may legitimately have surfaced multiple different candidates
    // (part of why it was disqualified), so `blocked` is exempt from this specific signal.
    const distinctTargets = new Set(outcomes.map((o) => o.resolvesTo).filter((v): v is string => v !== null));
    if (distinctTargets.size > 1 && status !== 'conflicting_evidence' && status !== 'blocked') {
      errors.push(`${rowKey}: evidence entries resolve to ${distinctTargets.size} distinct gsis_ids -- status must be conflicting_evidence`);
    }
    if (status === 'conflicting_evidence' && distinctTargets.size < 2) {
      errors.push(`${rowKey}: conflicting_evidence requires at least two evidence entries resolving to distinct gsis_ids`);
    }

    // Canonical ID rules: GSIS format, never invented locally (must be established by evidence).
    const canonicalId = row.forecast_canonical_player_id ?? null;
    if (canonicalId !== null && (typeof canonicalId !== 'string' || !GSIS_ID_PATTERN.test(canonicalId))) {
      errors.push(`${rowKey}: forecast_canonical_player_id ${JSON.stringify(canonicalId)} is not GSIS format (NN-NNNNNNN)`);
    }

    if (status === 'resolved') {
      if (canonicalId === null) {
        errors.push(`${rowKey}: resolved row must carry a forecast_canonical_player_id`);
      }
      if (evidenceClass === null) {
        errors.push(`${rowKey}: resolved row must declare its resolution_evidence_class`);
      } else {
        const supporting = evidence.filter(
          (entry, i) => isPlainObject(entry) && entry.evidence_class === evidenceClass && outcomes[i].structurallyComplete,
        );
        const matching = supporting.filter(
          (entry) => (entry as unknown as Record<string, unknown>).resolves_to_forecast_canonical_player_id === canonicalId,
        );
        if (matching.length === 0) {
          errors.push(
            `${rowKey}: resolved row has no structurally complete ${evidenceClass} evidence entry resolving to ` +
              `${JSON.stringify(canonicalId)} -- a gsis_id may never be invented locally (design §1/§7)`,
          );
        }
      }
      if (!isNonEmptyString(row.reviewer) || !isNonEmptyString(row.reviewed_at)) {
        errors.push(`${rowKey}: resolved row requires an explicit, attributable human sign-off (non-null reviewer and reviewed_at)`);
      }
      if (canonicalId !== null && isNonEmptyString(row.source_player_id)) {
        const keys = canonicalIdToSourceKeys.get(canonicalId) ?? [];
        keys.push(fullKey);
        canonicalIdToSourceKeys.set(canonicalId, keys);
      }
    } else {
      // Unresolved/conflicting/blocked rows are retained, never dropped -- and never carry a mapping or class.
      if (canonicalId !== null) errors.push(`${rowKey}: ${status} row must carry a null forecast_canonical_player_id`);
      if (evidenceClass !== null) errors.push(`${rowKey}: ${status} row must carry a null resolution_evidence_class`);

      if (status === 'blocked') {
        // A bare `blocked` token with empty evidence and no review must fail validation -- otherwise
        // every unresolved row could be silently relabeled `blocked` with zero investigation, and the
        // decision rule would dishonestly report `..._complete` (design §5: blocked "requires human
        // intervention before any further automated re-evaluation is attempted"). Beyond the bare
        // label, `blockedEntriesAllVerified` (above) additionally requires every recorded entry's
        // declared disqualification_reason to be mechanically verified against its own content.
        let rowVerified = blockedEntriesAllVerified;
        if (!isNonEmptyString(row.reviewer) || !isNonEmptyString(row.reviewed_at)) {
          errors.push(
            `${rowKey}: blocked row requires an attributable human disposition (non-null reviewer and reviewed_at) -- ` +
              'who found the disqualifying reliance/evidence, and when',
          );
          rowVerified = false;
        }
        if (!isNonEmptyString(row.notes)) {
          errors.push(`${rowKey}: blocked row requires non-empty notes recording why it was blocked`);
          rowVerified = false;
        }
        if (evidence.length === 0) {
          errors.push(`${rowKey}: blocked row requires at least one resolution_evidence entry documenting the disqualified attempt`);
          rowVerified = false;
        }
        if (rowVerified) verifiedBlockedCount += 1;
      }
    }

    // Independent-evidence checks (§7 rules 1-4).
    if (independentClass !== null) {
      if (status !== 'resolved') {
        errors.push(`${rowKey}: independent_resolution_evidence_class may only be populated on a resolved row`);
      }
      const independentEntries = evidence
        .map((entry, i) => ({ entry, outcome: outcomes[i] }))
        .filter(({ entry }) => isPlainObject(entry) && (entry as Record<string, unknown>).evidence_class === independentClass);
      const validIndependent = independentEntries.filter(
        ({ entry, outcome }) =>
          outcome.structurallyComplete && outcome.resolvesTo === canonicalId && !referencesOverallPickChain(entry),
      );
      if (validIndependent.length === 0) {
        const differing = independentEntries.some(({ outcome }) => outcome.resolvesTo !== null && outcome.resolvesTo !== canonicalId);
        errors.push(
          differing
            ? `${rowKey}: independent ${independentClass} evidence resolves to a different gsis_id than the primary resolution -- row must be conflicting_evidence`
            : `${rowKey}: independent_resolution_evidence_class=${independentClass} is not backed by a structurally complete, ` +
                '§3.1-free evidence entry of that class resolving to the same gsis_id',
        );
      }
    }
  });

  // ---- Population accounting (§2/§6/§7) -------------------------------------------------------------
  const lockedSet = new Set(lockedSourcePlayerIds);
  if (lockedSet.size !== SOURCE_ROW_COUNT) {
    errors.push(`locked source population must contain exactly ${SOURCE_ROW_COUNT} distinct player ids, found ${lockedSet.size}`);
  }
  for (const lockedId of lockedSet) {
    if (!seenPlayerIds.has(lockedId)) errors.push(`missing locked row: ${lockedId} is absent from the crosswalk`);
  }
  for (const presentId of seenPlayerIds) {
    if (!lockedSet.has(presentId)) errors.push(`extra row: ${presentId} is not one of the 48 locked source identities`);
  }
  if (seenKeys.size !== SOURCE_ROW_COUNT) {
    errors.push(`crosswalk must contain exactly ${SOURCE_ROW_COUNT} distinct governed source keys, found ${seenKeys.size}`);
  }

  // Multiple source identities mapping to one canonical id: conflicting until reviewed (§6).
  for (const [canonicalId, keys] of canonicalIdToSourceKeys) {
    if (keys.length > 1) {
      errors.push(`canonical id ${canonicalId} is claimed by ${keys.length} resolved source identities -- both must be conflicting_evidence until explicitly reviewed (design §6)`);
    }
  }

  // Deterministic ordering by (source_season, source_player_id) ascending (§7).
  const orderedRows = (rows as unknown[]).filter(isPlainObject);
  for (let i = 1; i < orderedRows.length; i += 1) {
    const prev = orderedRows[i - 1];
    const curr = orderedRows[i];
    const prevKey: [number, string] = [Number(prev.source_season), String(prev.source_player_id)];
    const currKey: [number, string] = [Number(curr.source_season), String(curr.source_player_id)];
    if (prevKey[0] > currKey[0] || (prevKey[0] === currKey[0] && prevKey[1] >= currKey[1])) {
      errors.push(`rows are not strictly ordered by (source_season, source_player_id) at index ${i} (${currKey[1]})`);
    }
  }

  // Status-count invariant (§6): declared counts equal recomputed counts and sum to exactly 48.
  const declaredCounts = artifact.status_counts;
  if (!isPlainObject(declaredCounts)) {
    errors.push('status_counts is missing');
  } else {
    for (const status of RESOLUTION_STATUSES) {
      if (declaredCounts[status] !== statusCounts[status]) {
        errors.push(`status_counts.${status} declares ${JSON.stringify(declaredCounts[status])} but recomputation finds ${statusCounts[status]}`);
      }
    }
  }
  const total = statusCounts.resolved + statusCounts.unresolved + statusCounts.conflicting_evidence + statusCounts.blocked;
  if (total !== SOURCE_ROW_COUNT) {
    errors.push(`the four status counts must sum to exactly ${SOURCE_ROW_COUNT}, found ${total}`);
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    statusCounts,
    evidenceClassCounts,
    identityCoverageDependencyCounts,
    verifiedBlockedCount,
    decision: decideIdentityCrosswalkAudit(valid, statusCounts, verifiedBlockedCount),
  };
};
