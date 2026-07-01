/**
 * player_season_coverage_v0 candidate coverage/provenance gate (Forecast #99).
 *
 * A pure, read-only gate evaluator that decides whether the new TIBER-Data
 * `player_season_coverage_v0` candidate artifact (TIBER-Data #184/#185, #186/#187, #188/#189,
 * #190/#191) is structurally serviceable enough to justify DESIGNING a future controlled Forecast
 * player-history experiment. It performs NO Forecast run, no Run 3, no feature binding, no baseline
 * change, no model tuning, and no TIBER-Data/Teamstate change — it only checks evidence against fixed
 * rules and returns a machine-readable status + decision. The strongest decision this gate can ever
 * return is `may_design_experiment`; it never authorizes a run.
 *
 * Follows the style of the Teamstate Run 2 coverage gate (`src/reports/run2TeamstateCoverageGate.ts`):
 * a pure `evaluate...(evidence)` function, fail-closed precedence, and a machine-readable result with
 * per-dimension checks, blocking reasons, warnings, and fixed notes.
 */

export const PLAYER_SEASON_COVERAGE_GATE_VERSION = 'player-season-coverage-gate-v1' as const;

/** Current accepted scope for this gate. A later issue may extend these; this gate does not. */
export const EXPECTED_SEASONS: readonly number[] = [2022, 2023, 2024, 2025];
export const EXPECTED_SEASON_TYPE_SCOPE: readonly string[] = ['REG'];
export const EXPECTED_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE'];
export const EXPECTED_ARTIFACT_STATUS = 'candidate_evidence_artifact_not_promoted' as const;
export const EXPECTED_ROW_GRAIN = 'player_id + season + season_type' as const;
export const APPROVED_SOURCE_NAME_SUBSTRINGS: readonly string[] = [
  "nflreadpy.load_player_stats",
  'nflreadpy.load_players',
];
const FIXTURE_OR_SCAFFOLD_MARKERS: readonly string[] = ['offline_fixture', 'fixture_', 'scaffold', 'smoke_test', 'fixture_demonstration_only'];
const FORBIDDEN_AVAILABILITY_KEYS: readonly string[] = ['active_status', 'ownership_status', 'roster_status', 'active_roster_status'];
/** Usage fields the upstream source never populates; must stay null, never coerced to zero. */
const ALWAYS_UNAVAILABLE_USAGE_FIELDS: readonly string[] = ['snap_share', 'routes_run', 'red_zone_targets', 'red_zone_carries', 'route_participation'];

export type PlayerSeasonCoverageGateStatus =
  | 'player_season_coverage_gate_passed'
  | 'player_season_coverage_gate_failed_identity_status'
  | 'player_season_coverage_gate_failed_provenance'
  | 'player_season_coverage_gate_failed_scope_window'
  | 'player_season_coverage_gate_failed_grain'
  | 'player_season_coverage_gate_failed_semantic_boundary'
  | 'player_season_coverage_gate_failed_cutoff_design'
  | 'player_season_coverage_gate_not_evaluated';

/**
 * The six decision values named in TIBER-Forecast #99, plus one equivalent addition
 * (`needs_scope_fix`) to distinguish a scope/window gap from a provenance gap and a grain gap. The
 * gate never returns anything stronger than `may_design_experiment` (no `may_run_model` exists in
 * this type at all).
 */
export type PlayerSeasonCoverageGateDecision =
  | 'may_design_experiment'
  | 'must_not_consume'
  | 'needs_artifact_mirror'
  | 'needs_provenance_fix'
  | 'needs_scope_fix'
  | 'needs_grain_fix'
  | 'needs_cutoff_design';

export interface PlayerSeasonCoverageIdentityEvidence {
  artifact_id: string | null;
  status: string | null;
  generated_at: string | null;
  row_grain: string | null;
}

export interface PlayerSeasonCoverageProvenanceEvidence {
  source_refs_present: boolean;
  source_names: string[];
  fixture_or_scaffold_marker_hits: number;
  season_2024_row_count: number;
  season_2024_source_backed: boolean;
}

export interface PlayerSeasonCoverageScopeEvidence {
  seasons_present: number[];
  season_type_values: string[];
  positions_present: string[];
  full_career_coverage_claimed: boolean;
}

export interface PlayerSeasonCoverageGrainEvidence {
  total_rows: number;
  duplicate_grain_count: number;
  reg_post_overlap_violations: number;
  required_row_fields_missing_count: number;
}

export interface PlayerSeasonCoverageRowSourceRef {
  source_name: string;
  observed_at: string | null;
}

export interface PlayerSeasonCoverageRowSample {
  player_id: string | null;
  player_name?: string | null;
  position: string | null;
  season: number | null;
  season_type: string | null;
  source_refs: PlayerSeasonCoverageRowSourceRef[];
  teams: string[];
  primary_team: string | null;
  primary_team_rule: string | null;
  coverage_status: string | null;
  missing_fields: string[];
  usage_summary: Record<string, number | string | null>;
  birth_date: string | null;
  season_age: number | null;
  draft_year: number | null;
  rookie_year: number | null;
  career_year: number | null;
  /** Present only if the row-sample source data injects a forbidden field (should never happen). */
  [forbiddenKey: string]: unknown;
}

export interface PlayerSeasonCoverageProposedCutoffDesign {
  input_seasons: number[];
  target_season: number | null;
  uses_target_season_summary_as_input: boolean;
}

/**
 * Artifact-wide (all rows, not just the row_sample) semantic violation counts. These must come from
 * a full scan of the source artifact (e.g. TIBER-Data's own validator, which already checks every one
 * of these across all 2,383 rows), not be inferred from the compact row_sample alone -- a sample of 4
 * rows out of 2,383 cannot prove the absence of a violation elsewhere in the artifact.
 */
export interface PlayerSeasonCoverageSemanticEvidence {
  forbidden_availability_field_count: number;
  zero_instead_of_null_violation_count: number;
  fabricated_age_violation_count: number;
  fabricated_career_year_violation_count: number;
  multi_team_missing_rule_violation_count: number;
}

export interface PlayerSeasonCoverageEvidence {
  identity: PlayerSeasonCoverageIdentityEvidence;
  provenance: PlayerSeasonCoverageProvenanceEvidence;
  scope: PlayerSeasonCoverageScopeEvidence;
  grain: PlayerSeasonCoverageGrainEvidence;
  /** Artifact-wide semantic violation counts (all rows), not just the sample. See {@link PlayerSeasonCoverageSemanticEvidence}. */
  semantic: PlayerSeasonCoverageSemanticEvidence;
  row_sample: PlayerSeasonCoverageRowSample[];
  /** null = no experiment design has been proposed yet (the expected, current real state). */
  proposed_cutoff_design: PlayerSeasonCoverageProposedCutoffDesign | null;
}

export interface PlayerSeasonCoverageGateCheck {
  dimension: string;
  passed: boolean;
  observed: string;
  expected: string;
  detail: string;
}

export interface PlayerSeasonCoverageGateResult {
  gate_version: typeof PLAYER_SEASON_COVERAGE_GATE_VERSION;
  status: PlayerSeasonCoverageGateStatus;
  decision: PlayerSeasonCoverageGateDecision;
  checks: PlayerSeasonCoverageGateCheck[];
  blocking_reasons: string[];
  warnings: string[];
  notes: string[];
}

const GATE_NOTES = [
  'Gate evaluation only: this evaluates whether the TIBER-Data player_season_coverage_v0 candidate artifact is structurally serviceable enough to justify DESIGNING a future controlled Forecast player-history experiment. It performs NO Forecast run, no Run 3, no feature binding, no baseline change, no model tuning, and no TIBER-Data/Teamstate change.',
  'This artifact is candidate/evidence, not promoted/governed data. This gate does not require or infer promoted/governed status, and a passing result never claims the artifact is promoted.',
  'Forecast did not run. No Forecast feature binding occurred. No model signal is claimed by this gate or its report.',
  'The strongest decision this gate can return is `may_design_experiment`. Any later Forecast run requires a SEPARATE experiment-design issue that explicitly separates input seasons from the target season and enforces the target-season cutoff; this gate does not authorize that design, only that it may be attempted.',
];

const includesApprovedSource = (sourceNames: readonly string[]): boolean =>
  sourceNames.some((name) => APPROVED_SOURCE_NAME_SUBSTRINGS.some((approved) => name.includes(approved)));

const hasForbiddenAvailabilityField = (row: PlayerSeasonCoverageRowSample): string[] =>
  FORBIDDEN_AVAILABILITY_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(row, key));

const rowHasZeroInsteadOfNull = (row: PlayerSeasonCoverageRowSample): string[] =>
  ALWAYS_UNAVAILABLE_USAGE_FIELDS.filter((field) => row.usage_summary?.[field] === 0);

const rowFabricatesAge = (row: PlayerSeasonCoverageRowSample): boolean =>
  row.birth_date === null && row.season_age !== null;

const rowFabricatesCareerYear = (row: PlayerSeasonCoverageRowSample): boolean =>
  row.rookie_year === null && row.career_year !== null;

const rowMissingRequiredFields = (row: PlayerSeasonCoverageRowSample): boolean =>
  !row.player_id ||
  row.season === null ||
  !row.season_type ||
  !Array.isArray(row.source_refs) ||
  row.source_refs.length === 0 ||
  !Array.isArray(row.teams) ||
  !row.coverage_status ||
  !Array.isArray(row.missing_fields);

const rowMultiTeamMissingRule = (row: PlayerSeasonCoverageRowSample): boolean =>
  row.teams.length > 1 && (row.primary_team_rule === null || row.primary_team_rule === '');

/**
 * Evaluate the player_season_coverage_v0 gate. Fail-closed precedence, following the order of
 * TIBER-Forecast #99's own required-check sections: identity/status -> provenance -> scope/window ->
 * grain/shape -> semantics -> cutoff discipline. `null` evidence (no mirror supplied) is
 * `not_evaluated` / `needs_artifact_mirror`.
 */
export const evaluatePlayerSeasonCoverageGate = (
  evidence: PlayerSeasonCoverageEvidence | null,
): PlayerSeasonCoverageGateResult => {
  if (evidence === null) {
    return {
      gate_version: PLAYER_SEASON_COVERAGE_GATE_VERSION,
      status: 'player_season_coverage_gate_not_evaluated',
      decision: 'needs_artifact_mirror',
      checks: [],
      blocking_reasons: ['No evidence mirror supplied; the gate cannot be evaluated without a compact evidence mirror of the TIBER-Data candidate artifact.'],
      warnings: [],
      notes: GATE_NOTES,
    };
  }

  const checks: PlayerSeasonCoverageGateCheck[] = [];
  const warnings: string[] = [];

  // 1. Artifact identity / status.
  const identityOk =
    evidence.identity.artifact_id !== null &&
    evidence.identity.artifact_id.length > 0 &&
    evidence.identity.status === EXPECTED_ARTIFACT_STATUS &&
    evidence.identity.generated_at !== null &&
    evidence.identity.generated_at.length > 0 &&
    evidence.identity.row_grain === EXPECTED_ROW_GRAIN;
  checks.push({
    dimension: 'identity_status',
    passed: identityOk,
    observed: `artifact_id=${evidence.identity.artifact_id ?? 'null'}, status=${evidence.identity.status ?? 'null'}, row_grain=${evidence.identity.row_grain ?? 'null'}`,
    expected: `status="${EXPECTED_ARTIFACT_STATUS}", row_grain="${EXPECTED_ROW_GRAIN}", non-empty artifact_id and generated_at`,
    detail: 'The artifact must explicitly identify itself as candidate/evidence, not governed/promoted, with the documented row grain.',
  });

  // 2. Source / provenance.
  const approvedSourcePresent = includesApprovedSource(evidence.provenance.source_names);
  // Every reported source name must be on the approved allow-list, not merely at-least-one: a mirror
  // reporting one approved nflreadpy source alongside an unrelated/unknown source (e.g. a manual
  // override) must not pass provenance just because it lacks a fixture/scaffold marker.
  const unapprovedSourceNames = evidence.provenance.source_names.filter(
    (name) => !APPROVED_SOURCE_NAME_SUBSTRINGS.some((approved) => name.includes(approved)),
  );
  const provenanceOk =
    evidence.provenance.source_refs_present &&
    approvedSourcePresent &&
    unapprovedSourceNames.length === 0 &&
    evidence.provenance.fixture_or_scaffold_marker_hits === 0 &&
    evidence.provenance.season_2024_row_count > 0 &&
    evidence.provenance.season_2024_source_backed;
  checks.push({
    dimension: 'provenance',
    passed: provenanceOk,
    observed: `source_refs_present=${evidence.provenance.source_refs_present}, sources=[${evidence.provenance.source_names.join(', ')}], unapproved_sources=[${unapprovedSourceNames.join(', ')}], fixture_hits=${evidence.provenance.fixture_or_scaffold_marker_hits}, 2024_rows=${evidence.provenance.season_2024_row_count}, 2024_source_backed=${evidence.provenance.season_2024_source_backed}`,
    expected: `source_refs present, every reported source name on the approved allow-list (no unapproved sources), 0 fixture/scaffold markers, 2024 rows > 0 and source-backed`,
    detail: 'Source refs must be present and machine-readable, drawn from approved nflverse sources, with zero fixture/scaffold contamination, and 2024 must be source-backed (not the prior fixture-only state).',
  });

  // 3. Scope / window.
  const seasonsSet = new Set(evidence.scope.seasons_present);
  const allExpectedSeasonsPresent = EXPECTED_SEASONS.every((season) => seasonsSet.has(season));
  const seasonTypeIsRegOnly =
    evidence.scope.season_type_values.length > 0 &&
    evidence.scope.season_type_values.every((value) => EXPECTED_SEASON_TYPE_SCOPE.includes(value));
  const positionsWithinExpected = evidence.scope.positions_present.every((position) => EXPECTED_POSITIONS.includes(position));
  const scopeOk =
    allExpectedSeasonsPresent &&
    seasonTypeIsRegOnly &&
    positionsWithinExpected &&
    evidence.scope.full_career_coverage_claimed === false;
  checks.push({
    dimension: 'scope_window',
    passed: scopeOk,
    observed: `seasons=[${evidence.scope.seasons_present.join(', ')}], season_type_values=[${evidence.scope.season_type_values.join(', ')}], positions=[${evidence.scope.positions_present.join(', ')}], full_career_claimed=${evidence.scope.full_career_coverage_claimed}`,
    expected: `seasons include all of [${EXPECTED_SEASONS.join(', ')}], season_type_values subset of [${EXPECTED_SEASON_TYPE_SCOPE.join(', ')}], positions subset of [${EXPECTED_POSITIONS.join(', ')}], no full-career claim`,
    detail: 'Current accepted slice is 2022-2025, REG only, QB/RB/WR/TE only. The evidence must not claim full-career coverage.',
  });

  // 4. Grain / shape.
  const sampleGrainKeys = evidence.row_sample.map((row) => `${row.player_id}|${row.season}|${row.season_type}`);
  const sampleHasDuplicates = new Set(sampleGrainKeys).size !== sampleGrainKeys.length;
  const sampleMissingRequiredFields = evidence.row_sample.filter(rowMissingRequiredFields).length;
  const grainOk =
    evidence.grain.duplicate_grain_count === 0 &&
    evidence.grain.reg_post_overlap_violations === 0 &&
    evidence.grain.required_row_fields_missing_count === 0 &&
    !sampleHasDuplicates &&
    sampleMissingRequiredFields === 0;
  checks.push({
    dimension: 'grain_shape',
    passed: grainOk,
    observed: `duplicate_grain_count=${evidence.grain.duplicate_grain_count}, reg_post_overlap_violations=${evidence.grain.reg_post_overlap_violations}, required_row_fields_missing_count=${evidence.grain.required_row_fields_missing_count}, sample_duplicates=${sampleHasDuplicates}, sample_missing_required_fields=${sampleMissingRequiredFields}`,
    expected: 'zero duplicate grain rows, zero REG+POST overlap violations, zero missing required fields, one logical row per player_id + season + season_type',
    detail: 'One logical row per (player_id, season, season_type); a REG+POST row may never coexist with a separate REG/POST row for the same player-season.',
  });

  // 5. Semantics. Two independent signals must BOTH be clean: (a) artifact-wide aggregate violation
  // counts covering all rows (authoritative -- a 4-row sample out of 2,383 total rows cannot prove a
  // violation doesn't exist elsewhere), and (b) the row_sample itself (defense-in-depth: catches a
  // sample/aggregate mismatch, e.g. if the aggregate counts were not updated to reflect the sample).
  const forbiddenFieldRows = evidence.row_sample.flatMap((row) => hasForbiddenAvailabilityField(row));
  const zeroInsteadOfNullRows = evidence.row_sample.filter((row) => rowHasZeroInsteadOfNull(row).length > 0);
  const fabricatedAgeRows = evidence.row_sample.filter(rowFabricatesAge);
  const fabricatedCareerYearRows = evidence.row_sample.filter(rowFabricatesCareerYear);
  const multiTeamMissingRuleRows = evidence.row_sample.filter(rowMultiTeamMissingRule);
  const aggregateSemanticClean =
    evidence.semantic.forbidden_availability_field_count === 0 &&
    evidence.semantic.zero_instead_of_null_violation_count === 0 &&
    evidence.semantic.fabricated_age_violation_count === 0 &&
    evidence.semantic.fabricated_career_year_violation_count === 0 &&
    evidence.semantic.multi_team_missing_rule_violation_count === 0;
  const sampleSemanticClean =
    forbiddenFieldRows.length === 0 &&
    zeroInsteadOfNullRows.length === 0 &&
    fabricatedAgeRows.length === 0 &&
    fabricatedCareerYearRows.length === 0 &&
    multiTeamMissingRuleRows.length === 0;
  const semanticOk = aggregateSemanticClean && sampleSemanticClean;
  checks.push({
    dimension: 'semantic_boundary',
    passed: semanticOk,
    observed: `aggregate(forbidden=${evidence.semantic.forbidden_availability_field_count}, zero_instead_of_null=${evidence.semantic.zero_instead_of_null_violation_count}, fabricated_age=${evidence.semantic.fabricated_age_violation_count}, fabricated_career_year=${evidence.semantic.fabricated_career_year_violation_count}, multi_team_missing_rule=${evidence.semantic.multi_team_missing_rule_violation_count}) sample(forbidden_fields=${forbiddenFieldRows.length}, zero_instead_of_null_rows=${zeroInsteadOfNullRows.length}, fabricated_age_rows=${fabricatedAgeRows.length}, fabricated_career_year_rows=${fabricatedCareerYearRows.length}, multi_team_missing_rule_rows=${multiTeamMissingRuleRows.length})`,
    expected: 'no active/ownership/roster status fields present; unavailable usage fields stay null; age/career fields never fabricated; every multi-team row carries an explicit primary_team_rule',
    detail: 'Roster/team production context must never be treated as availability; zero and null/unavailable must remain distinct.',
  });

  // 6. Forecast cutoff discipline. With no design proposed yet (the current real state), this passes
  // but always carries an explicit warning that no run is authorized and a separate design issue is
  // required. A design that IS proposed and leaks target-season data into the input row fails closed.
  const proposedDesign = evidence.proposed_cutoff_design;
  // Leakage is derived two ways, not trusted from the boolean alone: (a) the design explicitly says so,
  // or (b) the target season literally appears in input_seasons -- an overlapping season is leakage
  // regardless of what the boolean claims (a false/omitted boolean does not make an overlap safe).
  const cutoffDesignSeasonOverlap =
    proposedDesign !== null &&
    proposedDesign.target_season !== null &&
    proposedDesign.input_seasons.includes(proposedDesign.target_season);
  const cutoffDesignLeaks =
    proposedDesign !== null && (proposedDesign.uses_target_season_summary_as_input === true || cutoffDesignSeasonOverlap);
  const cutoffOk = !cutoffDesignLeaks;
  checks.push({
    dimension: 'cutoff_discipline',
    passed: cutoffOk,
    observed:
      proposedDesign === null
        ? 'no experiment design proposed yet'
        : `proposed design uses_target_season_summary_as_input=${proposedDesign.uses_target_season_summary_as_input}, input_seasons=[${proposedDesign.input_seasons.join(', ')}], target_season=${proposedDesign.target_season}, season_overlap=${cutoffDesignSeasonOverlap}`,
    expected: 'no proposed design leaks target-season summaries into the input row for a prior season, and target_season must not appear in input_seasons',
    detail: '2025 target-season summaries must never be fed into a 2024-input row (or equivalent); a design whose target season overlaps its own input seasons is invalid regardless of the leakage flag. Any future design is a separate, later issue.',
  });
  warnings.push(
    'No Forecast run is authorized by this gate. A separate experiment-design issue is required before any model/feature work, and that design must explicitly separate input seasons from the target season with a defensible cutoff.',
  );

  const forbiddenRowNames = forbiddenFieldRows.length > 0 ? [...new Set(forbiddenFieldRows)] : [];
  if (evidence.scope.seasons_present.length > EXPECTED_SEASONS.length) {
    warnings.push(`Evidence reports seasons beyond the expected slice: [${evidence.scope.seasons_present.filter((s) => !EXPECTED_SEASONS.includes(s)).join(', ')}]. Confirm this is an intentional extension, not overclaim.`);
  }

  // Fail-closed precedence, matching the section order in TIBER-Forecast #99.
  let status: PlayerSeasonCoverageGateStatus;
  let decision: PlayerSeasonCoverageGateDecision;
  const blocking_reasons: string[] = [];

  if (!identityOk) {
    status = 'player_season_coverage_gate_failed_identity_status';
    decision = evidence.identity.status === null || evidence.identity.status.length === 0 ? 'needs_artifact_mirror' : 'must_not_consume';
    blocking_reasons.push('Artifact identity/status evidence is missing or does not match the expected candidate/evidence status and row grain.');
  } else if (!provenanceOk) {
    status = 'player_season_coverage_gate_failed_provenance';
    decision = 'needs_provenance_fix';
    blocking_reasons.push('Source/provenance evidence is incomplete: missing source refs, a disallowed/unapproved source, fixture/scaffold contamination, or 2024 not source-backed.');
    if (unapprovedSourceNames.length > 0) {
      blocking_reasons.push(`Unapproved source name(s) reported: ${unapprovedSourceNames.join(', ')}. Every reported source must be on the approved allow-list.`);
    }
  } else if (!scopeOk) {
    status = 'player_season_coverage_gate_failed_scope_window';
    decision = 'needs_scope_fix';
    blocking_reasons.push('Scope/window evidence does not match the accepted slice: seasons, season_type, positions, or a full-career-coverage overclaim.');
  } else if (!grainOk) {
    status = 'player_season_coverage_gate_failed_grain';
    decision = 'needs_grain_fix';
    blocking_reasons.push('Row grain/shape evidence failed: duplicate grain, REG+POST overlap, or missing required row fields.');
  } else if (!semanticOk) {
    status = 'player_season_coverage_gate_failed_semantic_boundary';
    const forbiddenAnywhere = forbiddenFieldRows.length > 0 || evidence.semantic.forbidden_availability_field_count > 0;
    decision = forbiddenAnywhere ? 'must_not_consume' : 'needs_grain_fix';
    if (forbiddenRowNames.length > 0) {
      blocking_reasons.push(`Forbidden availability/ownership field(s) present in sampled row evidence: ${forbiddenRowNames.join(', ')}. This artifact must not be consumed if it asserts availability status.`);
    }
    if (evidence.semantic.forbidden_availability_field_count > 0) {
      blocking_reasons.push(`Artifact-wide scan reports ${evidence.semantic.forbidden_availability_field_count} row(s) with a forbidden availability/ownership field beyond the sample. This artifact must not be consumed if it asserts availability status.`);
    }
    if (zeroInsteadOfNullRows.length > 0) blocking_reasons.push(`${zeroInsteadOfNullRows.length} sampled row(s) coerce an always-unavailable usage field to zero instead of null.`);
    if (evidence.semantic.zero_instead_of_null_violation_count > 0) blocking_reasons.push(`Artifact-wide scan reports ${evidence.semantic.zero_instead_of_null_violation_count} row(s) coercing an always-unavailable usage field to zero instead of null.`);
    if (fabricatedAgeRows.length > 0) blocking_reasons.push(`${fabricatedAgeRows.length} sampled row(s) carry a season_age with no birth_date (fabrication).`);
    if (evidence.semantic.fabricated_age_violation_count > 0) blocking_reasons.push(`Artifact-wide scan reports ${evidence.semantic.fabricated_age_violation_count} row(s) with a fabricated season_age (fabrication).`);
    if (fabricatedCareerYearRows.length > 0) blocking_reasons.push(`${fabricatedCareerYearRows.length} sampled row(s) carry a career_year with no rookie_year (fabrication).`);
    if (evidence.semantic.fabricated_career_year_violation_count > 0) blocking_reasons.push(`Artifact-wide scan reports ${evidence.semantic.fabricated_career_year_violation_count} row(s) with a fabricated career_year (fabrication).`);
    if (multiTeamMissingRuleRows.length > 0) blocking_reasons.push(`${multiTeamMissingRuleRows.length} sampled multi-team row(s) missing an explicit primary_team_rule.`);
    if (evidence.semantic.multi_team_missing_rule_violation_count > 0) blocking_reasons.push(`Artifact-wide scan reports ${evidence.semantic.multi_team_missing_rule_violation_count} multi-team row(s) missing an explicit primary_team_rule.`);
  } else if (!cutoffOk) {
    status = 'player_season_coverage_gate_failed_cutoff_design';
    decision = 'needs_cutoff_design';
    blocking_reasons.push('A proposed cutoff design leaks target-season summaries into an input-season row; this must be redesigned before any experiment can even be proposed.');
  } else {
    status = 'player_season_coverage_gate_passed';
    decision = 'may_design_experiment';
  }

  return {
    gate_version: PLAYER_SEASON_COVERAGE_GATE_VERSION,
    status,
    decision,
    checks,
    blocking_reasons,
    warnings,
    notes: GATE_NOTES,
  };
};
