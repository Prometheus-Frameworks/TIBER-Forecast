/**
 * Refresh the player-history experiment mirrors from the PROMOTED TIBER-Data
 * player_season_coverage_v0 artifact and re-run the population/overlap gates (Forecast #119).
 * Deterministic and network-free; the full promoted artifact is NOT vendored -- this script reads
 * local copies of the promoted artifact + promotion manifest, RE-RUNS the #117 gate module as
 * preflight (fail-closed, never trusting the committed report alone), builds the promoted-source
 * mirrors, re-runs the dry-run matrix, evaluates the refresh gate, and writes durable reports.
 *
 *   npm run refresh:player-history-promoted-mirrors -- \
 *     --artifact=/path/to/exports/promoted/nfl/player_season_coverage_v0.json \
 *     --manifest=/path/to/exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
 *   # or env: TIBER_DATA_PROMOTED_ARTIFACT=... TIBER_DATA_PROMOTED_MANIFEST=...
 *
 * Writes:
 *   data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json
 *   data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json
 *   data/fixtures/tiberData/player_season_coverage_v0_promoted_mirror_provenance.json
 *   docs/reports/player-history-promoted-mirror-refresh-2026-07-04.{json,md}
 *   docs/reports/player-history-promoted-mirror-overlap-gate-2026-07-04.{json,md}
 *
 * The archived candidate mirrors (#110) are never touched. Mirror refresh only: no model run, no
 * MAE/RMSE/Pearson/Spearman or other metrics, no production binding, no seasonalPprModel.ts change,
 * no product/advice output, no TIBER-Data change, no availability/ownership/depth/injury inference.
 * Exits non-zero unless the refresh decision is may_open_promoted_controlled_rerun_issue.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPlayerHistoryExperimentDryRunMatrix } from '../src/rehearsal/playerHistoryExperimentDryRunMatrix.js';
import {
  ARCHIVED_CANDIDATE_MIRROR_PATHS,
  PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION,
  PROMOTED_INPUT_MIRROR_PATH,
  PROMOTED_MIRROR_PROVENANCE_PATH,
  PROMOTED_MIRROR_REFRESH_ISSUE,
  PROMOTED_OUTCOME_MIRROR_PATH,
  REQUIRED_PREFLIGHT_GATE_DECISION,
  buildPromotedInputMirror,
  buildPromotedOutcomeMirror,
  evaluatePlayerHistoryPromotedMirrorRefreshGate,
} from '../src/rehearsal/playerHistoryPromotedMirrorRefresh.js';
import {
  PINNED_PROMOTED_ARTIFACT_SHA256,
  PROMOTED_ARTIFACT_PATH,
  PROMOTED_ARTIFACT_REPO,
  PROMOTED_MANIFEST_PATH,
  PROMOTION_MERGE_COMMIT,
  evaluatePlayerHistoryPromotedSourceGate,
  type PromotedArtifact,
  type PromotedManifest,
} from '../src/rehearsal/playerHistoryPromotedSourceGate.js';
import type { SourceCoverageArtifact } from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-04';
const GATE_EVIDENCE_REL = 'data/fixtures/tiberData/PLAYER_SEASON_COVERAGE_V0_PROMOTED_SOURCE_GATE_EVIDENCE.json';
const REFRESH_JSON_REL = `docs/reports/player-history-promoted-mirror-refresh-${REPORT_DATE}.json`;
const REFRESH_MD_REL = `docs/reports/player-history-promoted-mirror-refresh-${REPORT_DATE}.md`;
const OVERLAP_JSON_REL = `docs/reports/player-history-promoted-mirror-overlap-gate-${REPORT_DATE}.json`;
const OVERLAP_MD_REL = `docs/reports/player-history-promoted-mirror-overlap-gate-${REPORT_DATE}.md`;

const NON_GOALS_MD = `- No player-history model was run; no arm was executed.
- No MAE/RMSE/Pearson/Spearman or any other player-history metric was computed.
- \`seasonalPprModel.ts\` and the production baseline are untouched; no feature was bound into production Forecast.
- No product route/UI surface, fantasy advice, rankings, start/sit, trade, or draft output was created.
- No TIBER-Data file was modified; nothing was promoted or demoted.
- No active-roster, availability, injury, depth-chart, or ownership status was inferred or consumed.
- The archived candidate mirrors (#110) were preserved unchanged.`;

const argValue = (name: string): string | undefined =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

const artifactPath = argValue('artifact') ?? process.env.TIBER_DATA_PROMOTED_ARTIFACT;
const manifestPath = argValue('manifest') ?? process.env.TIBER_DATA_PROMOTED_MANIFEST;
if (!artifactPath || !manifestPath) {
  process.stderr.write(
    'Missing promoted source paths. Pass --artifact=... --manifest=... or set TIBER_DATA_PROMOTED_ARTIFACT / TIBER_DATA_PROMOTED_MANIFEST.\n' +
      `They must be local copies of ${PROMOTED_ARTIFACT_REPO}:${PROMOTED_ARTIFACT_PATH} (sha256 ${PINNED_PROMOTED_ARTIFACT_SHA256}) and ` +
      `${PROMOTED_ARTIFACT_REPO}:${PROMOTED_MANIFEST_PATH} at merge ${PROMOTION_MERGE_COMMIT}. The full promoted artifact is deliberately NOT vendored into Forecast.\n`,
  );
  process.exit(1);
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const artifactRaw = readFileSync(artifactPath);
const actualPromotedArtifactSha256 = sha256(artifactRaw);
const manifestRaw = readFileSync(manifestPath);
const manifest = JSON.parse(manifestRaw.toString('utf-8')) as PromotedManifest;
const artifact = JSON.parse(artifactRaw.toString('utf-8')) as PromotedArtifact;

// ---- Preflight 1: the COMMITTED #117 gate evidence must be present and passed ----------------------
const committedEvidence = JSON.parse(readFileSync(path.join(REPO_ROOT, GATE_EVIDENCE_REL), 'utf-8')) as {
  gate_result: { status: string; decision: string };
  governed_source: { promotedArtifactSha256Pinned: string };
};
if (
  committedEvidence.gate_result.status !== 'passed' ||
  committedEvidence.gate_result.decision !== REQUIRED_PREFLIGHT_GATE_DECISION ||
  committedEvidence.governed_source.promotedArtifactSha256Pinned !== PINNED_PROMOTED_ARTIFACT_SHA256
) {
  process.stderr.write(
    `FAIL CLOSED: committed #117 gate evidence (${GATE_EVIDENCE_REL}) is not a passing ${REQUIRED_PREFLIGHT_GATE_DECISION} record ` +
      `(status=${committedEvidence.gate_result.status}, decision=${committedEvidence.gate_result.decision}). No mirror was written.\n`,
  );
  process.exit(1);
}

// ---- Preflight 2: RE-RUN the #117 gate module against the actual local files ----------------------
const preflight = evaluatePlayerHistoryPromotedSourceGate({ manifest, artifact, actualPromotedArtifactSha256 });
if (preflight.status !== 'passed' || preflight.decision !== REQUIRED_PREFLIGHT_GATE_DECISION) {
  process.stderr.write(
    `FAIL CLOSED: #117 promoted-source gate re-run did not pass (status=${preflight.status}, decision=${preflight.decision}).\n` +
      `${preflight.blocking_reasons.map((r) => `  - ${r}\n`).join('')}No mirror was written.\n`,
  );
  process.exit(1);
}

// ---- Refresh: build the promoted-source mirrors ----------------------------------------------------
const coverageArtifact = artifact as unknown as SourceCoverageArtifact;
const outcomeMirror = buildPromotedOutcomeMirror(coverageArtifact);
const inputMirror = buildPromotedInputMirror(coverageArtifact, outcomeMirror);

const outcomeMirrorJson = `${JSON.stringify(outcomeMirror, null, 1)}\n`;
const inputMirrorJson = `${JSON.stringify(inputMirror, null, 1)}\n`;
writeFileSync(path.join(REPO_ROOT, PROMOTED_OUTCOME_MIRROR_PATH), outcomeMirrorJson, 'utf-8');
writeFileSync(path.join(REPO_ROOT, PROMOTED_INPUT_MIRROR_PATH), inputMirrorJson, 'utf-8');

// ---- Dry-run matrix rerun against the refreshed promoted-source mirrors ---------------------------
const matrix = buildPlayerHistoryExperimentDryRunMatrix({
  targetPopulation: outcomeMirror.rows.map((row) => ({
    player_id: row.player_id,
    player_name: row.player_name,
    position: row.position,
    ppr_2025_actual: row.season_ppr,
  })),
  playerHistoryRows: inputMirror.rows,
  targetSeason: outcomeMirror.target_season,
  inputSeasons: inputMirror.input_window.seasons,
  baselineSource: {
    path: PROMOTED_OUTCOME_MIRROR_PATH,
    governance_status: `${outcomeMirror.governed_source.artifactStatus}_outcome_layer_only`,
    data_source: 'generated-mirror-from-promoted-tiber-data-artifact',
  },
  playerHistorySourceRefs: [
    PROMOTED_INPUT_MIRROR_PATH,
    `${inputMirror.governed_source.repo}:${inputMirror.governed_source.promotedArtifactPath} (sha256 ${inputMirror.governed_source.sha256})`,
  ],
});
const joinedByPosition: Record<string, number> = {};
const noHistoryByPosition: Record<string, number> = {};
for (const row of matrix.matrix_rows) {
  if (row.real_player_history !== null) joinedByPosition[row.position] = (joinedByPosition[row.position] ?? 0) + 1;
  else noHistoryByPosition[row.position] = (noHistoryByPosition[row.position] ?? 0) + 1;
}
const js = matrix.join_summary;
const joinedShare = js.scored_target_rows > 0 ? js.joined_rows / js.scored_target_rows : null;

// ---- Refresh gate: preflight + mirror integrity + population/overlap floors ------------------------
const gate = evaluatePlayerHistoryPromotedMirrorRefreshGate({
  preflightGateResult: preflight,
  actualPromotedArtifactSha256,
  manifestCandidateSha256: manifest.source_candidate?.sha256 ?? '',
  outcomeMirror,
  inputMirror,
  overlap: {
    scored_target_rows: js.scored_target_rows,
    joined_rows: js.joined_rows,
    joined_rows_by_position: joinedByPosition,
    shuffle_groups: matrix.shuffled_control.groups.map((g) => ({
      position: g.position,
      feature_bearing_row_count: g.feature_bearing_row_count,
      derangement_possible: g.derangement_possible,
    })),
  },
});

// ---- Provenance companion ---------------------------------------------------------------------------
const provenance = {
  kind: 'player_history_promoted_mirror_provenance',
  version: PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION,
  issue: PROMOTED_MIRROR_REFRESH_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  generator_script: 'scripts/runPlayerHistoryPromotedMirrorRefresh.ts',
  statement:
    'Mirror refresh only: these mirrors re-source the player-history experiment mirrors from the promoted TIBER-Data artifact. No model was run, no metric was computed, nothing was bound into production Forecast, and no product/advice output was created.',
  promoted_source: {
    repo: PROMOTED_ARTIFACT_REPO,
    promotedArtifactPath: PROMOTED_ARTIFACT_PATH,
    promotedArtifactSha256Pinned: PINNED_PROMOTED_ARTIFACT_SHA256,
    promotedArtifactSha256Actual: actualPromotedArtifactSha256,
    promotedManifestPath: PROMOTED_MANIFEST_PATH,
    promotedManifestSha256Actual: sha256(manifestRaw),
    promotionMergeCommit: PROMOTION_MERGE_COMMIT,
    sourceCandidateSha256: manifest.source_candidate?.sha256 ?? null,
    sha256_verified_fail_closed_by_generator: true,
  },
  preflight_gate: {
    evidence_path: GATE_EVIDENCE_REL,
    committed_decision: committedEvidence.gate_result.decision,
    rerun_status: preflight.status,
    rerun_decision: preflight.decision,
    rerun_checks_passed: `${preflight.checks.filter((c) => c.passed).length}/${preflight.checks.length}`,
  },
  mirrors: {
    outcome_mirror: {
      path: PROMOTED_OUTCOME_MIRROR_PATH,
      sha256: sha256(outcomeMirrorJson),
      scope: `season ${outcomeMirror.target_season}, REG, QB/RB/WR/TE, outcome layer only`,
      counts: outcomeMirror.counts,
      trimming_rationale:
        'Rows carry the target outcome (season_ppr), identity/position, and row-level provenance (source_refs, identity_confidence) -- and nothing else. No input-feature payloads are copied, so this mirror cannot be consumed as 2025 input features.',
    },
    input_mirror: {
      path: PROMOTED_INPUT_MIRROR_PATH,
      sha256: sha256(inputMirrorJson),
      scope: `seasons ${inputMirror.input_window.seasons.join('/')}, REG, QB/RB/WR/TE, players limited to the outcome-mirror population`,
      counts: inputMirror.counts,
      trimming_rationale:
        'Rows are trimmed to exactly the fields the #104 feature-extraction scaffold consumes (identity, provenance, team-of-record context, coverage, production_summary, usage_summary, age/career fields). Unavailable usage fields stay null exactly as in the promoted source; nulls are preserved verbatim and never coerced to zero. No availability/ownership/depth/injury field exists in any row.',
    },
  },
  exclusion_rules: {
    input_mirror_excludes_all_2025_records: true,
    positions_limited_to: ['QB', 'RB', 'TE', 'WR'],
    season_type_limited_to: 'REG',
    outcome_players_without_history: `${inputMirror.counts.outcome_players_without_history} outcome players have no 2022-2024 source rows (e.g. rookies); documented absence (no-history subgroup), not a mirror failure. Listed per player in the input mirror's no_history_players.`,
  },
  archived_candidate_mirrors: {
    preserved_unchanged_at: ARCHIVED_CANDIDATE_MIRROR_PATHS,
    not_overwritten_by_this_refresh: true,
    relationship:
      'The candidate-derived mirrors remain the archived record of the #112/#116 candidate experiment; the promoted-source mirrors above are the refreshed set for any FUTURE separately-authorized work.',
  },
  refresh_gate_decision: gate.decision,
  boundary_statements: {
    mirror_refresh_only_not_a_model_run: true,
    no_metrics_computed: true,
    no_production_binding_authorized: true,
    no_product_or_advice_output: true,
    no_tiber_data_change: true,
    no_availability_ownership_depth_injury_inference: true,
    input_mirror_contains_no_2025_rows: true,
    outcome_mirror_is_outcome_layer_only: true,
    nulls_preserved_never_zero_coerced: true,
  },
};
writeFileSync(path.join(REPO_ROOT, PROMOTED_MIRROR_PROVENANCE_PATH), `${JSON.stringify(provenance, null, 2)}\n`, 'utf-8');

// ---- Refresh report ----------------------------------------------------------------------------------
const refreshReport = {
  report_version: 'player-history-promoted-mirror-refresh-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PROMOTED_MIRROR_REFRESH_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evaluation_kind: 'promoted_mirror_refresh_only_no_run_no_metrics_no_binding',
  promoted_source: provenance.promoted_source,
  preflight_gate: provenance.preflight_gate,
  mirrors: provenance.mirrors,
  archived_candidate_mirrors: provenance.archived_candidate_mirrors,
  dry_run_matrix_summary: {
    version: matrix.version,
    row_kind: matrix.row_kind,
    status: matrix.status,
    target_season: matrix.target_season,
    input_seasons: matrix.input_seasons,
    matrix_row_count: matrix.matrix_rows.length,
    join_summary: matrix.join_summary,
    joined_share: joinedShare,
    joined_rows_by_position: joinedByPosition,
    no_history_rows_by_position: noHistoryByPosition,
    family_coverage: matrix.family_coverage,
    missingness_summary: {
      joined_rows_inspected: matrix.missingness.joined_rows_inspected,
      distinct_feature_paths_with_nulls: Object.keys(matrix.missingness.null_counts_by_feature_path).length,
      total_null_cells: Object.values(matrix.missingness.null_counts_by_feature_path).reduce((a, b) => a + b, 0),
      zero_value_paths_observed_count: matrix.missingness.zero_value_paths_observed.length,
    },
    shuffled_control: {
      method: matrix.shuffled_control.method,
      seed: matrix.shuffled_control.seed,
      groups: matrix.shuffled_control.groups,
      metrics_computed: matrix.shuffled_control.metrics_computed,
    },
    outcome_values_omitted_from_matrix_rows: true,
  },
  refresh_gate_result: gate,
  final_decision: gate.decision,
  boundary_statements: provenance.boundary_statements,
};
writeFileSync(path.join(REPO_ROOT, REFRESH_JSON_REL), `${JSON.stringify(refreshReport, null, 2)}\n`, 'utf-8');

const refreshMd = `# Promoted-source mirror refresh: player_season_coverage_v0 (Forecast #119)

_Generated ${REPORT_DATE} • ${PLAYER_HISTORY_PROMOTED_MIRROR_REFRESH_VERSION} • decision: **\`${gate.decision}\`**_

Refreshes the Forecast player-history experiment mirrors from the PROMOTED TIBER-Data artifact
(\`${PROMOTED_ARTIFACT_REPO}:${PROMOTED_ARTIFACT_PATH}\`, merge \`${PROMOTION_MERGE_COMMIT}\`), as authorized by the
#117 gate decision \`${REQUIRED_PREFLIGHT_GATE_DECISION}\` (PR #118). **Mirror refresh only: no model run, no new
metrics, no production binding, no \`seasonalPprModel.ts\` change, no product/advice output, no TIBER-Data change.**

## Preflight (#117 gate, re-run against local bytes -- never the committed report alone)

- Committed evidence: \`${GATE_EVIDENCE_REL}\` -> \`${committedEvidence.gate_result.decision}\`
- Re-run result: **${preflight.status}** -> \`${preflight.decision}\` (${preflight.checks.filter((c) => c.passed).length}/${preflight.checks.length} checks)
- Promoted sha256 (pin = actual): \`${actualPromotedArtifactSha256}\`
- Candidate lineage sha256: \`${manifest.source_candidate?.sha256}\`

## Refreshed promoted-source mirrors

| Mirror | Path | Rows | Notes |
|---|---|---|---|
| Outcome (2025 REG) | \`${PROMOTED_OUTCOME_MIRROR_PATH}\` | ${outcomeMirror.counts.rows} (${Object.entries(outcomeMirror.counts.by_position).sort().map(([p, n]) => `${p} ${n}`).join(', ')}) | outcome layer only; never 2025 input features |
| Input (2022-2024 REG) | \`${PROMOTED_INPUT_MIRROR_PATH}\` | ${inputMirror.counts.rows} (${Object.entries(inputMirror.counts.by_season).map(([s, n]) => `${s}: ${n}`).join(', ')}) | ${inputMirror.counts.players_with_history} players with history; ${inputMirror.counts.outcome_players_without_history} documented no-history players |
| Provenance | \`${PROMOTED_MIRROR_PROVENANCE_PATH}\` | — | ties both mirrors to the promoted artifact/manifest, merge commit, and #117 gate |

The archived candidate mirrors (#110) are preserved unchanged at:
${ARCHIVED_CANDIDATE_MIRROR_PATHS.map((p) => `- \`${p}\``).join('\n')}

## Refreshed dry-run matrix (assembly and counting only — no metrics)

- Target population: ${js.target_population_size} (scored: ${js.scored_target_rows}, outcome-unavailable: ${js.unavailable_target_rows})
- Matrix rows: **${matrix.matrix_rows.length}** (row_kind: \`${matrix.row_kind}\`)
- Joined rows: **${js.joined_rows}** (share: **${joinedShare === null ? 'n/a' : `${(joinedShare * 100).toFixed(1)}%`}**)
- Joined by position: ${Object.entries(joinedByPosition).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- No-history rows by position: ${Object.entries(noHistoryByPosition).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- Shuffled-control posture: \`${matrix.shuffled_control.method}\`, seed ${matrix.shuffled_control.seed}, groups: ${matrix.shuffled_control.groups.map((g) => `${g.position} ${g.feature_bearing_row_count}${g.derangement_possible ? '' : ' (derangement infeasible!)'}`).join(', ')}; metrics computed: **${matrix.shuffled_control.metrics_computed}**
- Outcome values are omitted from matrix rows by construction.

## Result

- **Refresh gate decision:** \`${gate.decision}\` (${gate.checks.filter((c) => c.passed).length}/${gate.checks.length} checks passed; details in \`${OVERLAP_MD_REL}\`)
- **Next step:** ${
  gate.decision === 'may_open_promoted_controlled_rerun_issue'
    ? 'a SEPARATE issue may be opened to consider rerunning the controlled experiment against these promoted-source mirrors. Opening that issue authorizes nothing by itself; the rerun would need its own review.'
    : gate.decision === 'may_use_promoted_mirrors_for_design_only'
      ? 'the mirrors may inform experiment design only; no controlled-rerun issue may be opened until the overlap floors pass.'
      : 'do not use the refreshed mirrors. Fix the first blocking reason and re-run this refresh.'
}

## Non-goals confirmed

${NON_GOALS_MD}

## Reproduce

\`\`\`bash
npm run refresh:player-history-promoted-mirrors -- \\
  --artifact=/path/to/player_season_coverage_v0.json \\
  --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build   # tsc --noEmit
npm test        # incl. tests/playerHistoryPromotedMirrorRefresh.test.ts
\`\`\`
`;
writeFileSync(path.join(REPO_ROOT, REFRESH_MD_REL), refreshMd, 'utf-8');

// ---- Overlap/population gate report -------------------------------------------------------------------
const overlapReport = {
  report_version: 'player-history-promoted-mirror-overlap-gate-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PROMOTED_MIRROR_REFRESH_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evidence_sources: {
    preflight_gate_evidence: GATE_EVIDENCE_REL,
    outcome_mirror: PROMOTED_OUTCOME_MIRROR_PATH,
    input_mirror: PROMOTED_INPUT_MIRROR_PATH,
    provenance_companion: PROMOTED_MIRROR_PROVENANCE_PATH,
    refresh_report: REFRESH_JSON_REL,
  },
  gate_result: gate,
  next_allowed_step:
    gate.decision === 'may_open_promoted_controlled_rerun_issue'
      ? 'Open a SEPARATE issue to consider rerunning the controlled experiment against the promoted-source mirrors; that issue must pass its own review before any arm is run or any metric is computed. This gate result authorizes opening that issue and nothing else.'
      : gate.decision === 'may_use_promoted_mirrors_for_design_only'
        ? 'The refreshed mirrors may inform experiment DESIGN only. Do not open a controlled-rerun issue; fix the failing overlap floor first.'
        : 'Do not use the refreshed mirrors. Fix the first blocking reason and re-run the refresh + this gate.',
};
writeFileSync(path.join(REPO_ROOT, OVERLAP_JSON_REL), `${JSON.stringify(overlapReport, null, 2)}\n`, 'utf-8');

const overlapMd = `# Promoted-mirror population/overlap gate (Forecast #119)

_Generated ${REPORT_DATE} • ${gate.gate_version} • status: **${gate.status}** • decision: **\`${gate.decision}\`**_

Re-runs the population/overlap gate stack against the REFRESHED promoted-source mirrors, using the pre-registered
#107/PR #108 floors as the minimum baseline (joined >= ${gate.thresholds.min_joined_rows_overall} overall, >= ${gate.thresholds.min_joined_rows_per_position} per position, share >= ${gate.thresholds.min_joined_share}, derangement feasible per position). ${gate.ceiling_note}

## Checks (${gate.checks.filter((c) => c.passed).length}/${gate.checks.length} passed)

| Check | Expected | Observed | Result |
|---|---|---|---|
${gate.checks.map((c) => `| ${c.dimension} | \`${c.expected.replaceAll('|', '\\|')}\` | \`${c.observed.replaceAll('|', '\\|')}\` | ${c.passed ? 'pass' : 'FAIL'} |`).join('\n')}

${gate.blocking_reasons.length > 0 ? `## Blocking reasons\n\n${gate.blocking_reasons.map((r) => `- ${r}`).join('\n')}\n\n` : ''}## Decision rule

${gate.decision_rule}

## Leakage discipline enforced on the refreshed mirrors

${Object.entries(gate.leakage_discipline)
  .map(([k, v]) => `- \`${k}\`: **${v}**`)
  .join('\n')}

## Archived candidate mirrors

${gate.archived_candidate_mirror_statement}

## Result

- **Final gate status:** \`${gate.status}\`
- **Final decision:** \`${gate.decision}\`
- **Next allowed step:** ${overlapReport.next_allowed_step}

## Non-goals confirmed

${NON_GOALS_MD}
`;
writeFileSync(path.join(REPO_ROOT, OVERLAP_MD_REL), overlapMd, 'utf-8');

process.stderr.write(
  `preflight (#117 re-run): ${preflight.status} -> ${preflight.decision}\n` +
    `outcome mirror: ${outcomeMirror.counts.rows} rows (${JSON.stringify(outcomeMirror.counts.by_position)})\n` +
    `input mirror: ${inputMirror.counts.rows} rows, ${inputMirror.counts.players_with_history} players with history, ${inputMirror.counts.outcome_players_without_history} no-history players\n` +
    `dry-run matrix: ${matrix.matrix_rows.length} rows, ${js.joined_rows} joined (${joinedShare === null ? 'n/a' : `${(joinedShare * 100).toFixed(1)}%`}), by position ${JSON.stringify(joinedByPosition)}\n` +
    `refresh gate: ${gate.status} -> ${gate.decision} (${gate.checks.filter((c) => c.passed).length}/${gate.checks.length} checks passed)\n` +
    `  wrote ${PROMOTED_OUTCOME_MIRROR_PATH}\n  wrote ${PROMOTED_INPUT_MIRROR_PATH}\n  wrote ${PROMOTED_MIRROR_PROVENANCE_PATH}\n` +
    `  wrote ${REFRESH_JSON_REL} / .md\n  wrote ${OVERLAP_JSON_REL} / .md\n`,
);
if (gate.decision !== 'may_open_promoted_controlled_rerun_issue') {
  process.exit(1);
}
