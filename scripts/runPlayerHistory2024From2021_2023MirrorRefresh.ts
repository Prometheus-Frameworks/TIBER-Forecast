/**
 * Refresh the Forecast player-history mirrors for the 2024-from-2021-2023 additional-validation path
 * from the PROMOTED TIBER-Data 2021-2025 `player_season_coverage_v0` artifact (Forecast #135, following
 * TIBER-Data's #202 promotion review / PR #207 merge and its decision
 * `may_open_forecast_player_history_2021_2023_mirror_refresh_issue`).
 *
 * Deterministic and network-free; the full promoted artifact is NOT vendored -- this script reads
 * local copies of the promoted artifact + promotion manifest, verifies source identity fail-closed
 * (never trusting the manifest's claims alone -- it recomputes counts/grain/provenance from the
 * records), builds the 2024-outcome / 2021-2023-input mirrors, computes population/overlap evidence,
 * evaluates the refresh gate, and writes durable mirrors + reports.
 *
 *   npm run refresh:player-history-2024-from-2021-2023-mirrors -- \
 *     --artifact=/path/to/exports/promoted/nfl/player_season_coverage_v0.json \
 *     --manifest=/path/to/exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
 *   # or env: TIBER_DATA_PROMOTED_ARTIFACT=... TIBER_DATA_PROMOTED_MANIFEST=...
 *
 * Writes:
 *   data/fixtures/tiberData/player_history_2024_target_outcome_mirror.json
 *   data/fixtures/tiberData/player_history_2021_2023_input_mirror.json
 *   data/fixtures/tiberData/PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_PROVENANCE.json
 *   docs/reports/player-history-2024-from-2021-2023-mirror-refresh-2026-07-07.{json,md}
 *
 * Mirror refresh only: no model run, no MAE/RMSE/Pearson/Spearman or other metric, no production
 * binding, no seasonalPprModel.ts change, no product/advice output, no TIBER-Data change, no
 * availability/ownership/depth/injury inference, no validation run, no threshold acceptance. The
 * #110 archived candidate mirrors and the #119/#120 promoted-source mirrors (2025 outcome / 2022-2024
 * input) are never touched. Exits non-zero unless the decision is
 * may_open_player_history_2024_from_2021_2023_additional_validation_issue.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INPUT_MIRROR_PATH_2021_2023,
  MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023,
  OUTCOME_MIRROR_PATH_2024,
  PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
  PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE,
  PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION,
  PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED,
  PROMOTION_MERGE_COMMIT_2021_2025,
  buildPlayerHistory2021_2023InputMirror,
  buildPlayerHistory2024OutcomeMirror,
  evaluatePlayerHistory2024From2021_2023MirrorRefreshGate,
  evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity,
} from '../src/rehearsal/playerHistory2024From2021_2023MirrorRefresh.js';
import {
  PROMOTED_ARTIFACT_PATH,
  PROMOTED_ARTIFACT_REPO,
  PROMOTED_MANIFEST_PATH,
  type PromotedArtifact,
  type PromotedManifest,
} from '../src/rehearsal/playerHistoryPromotedSourceGate.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-07';
const REFRESH_JSON_REL = `docs/reports/player-history-2024-from-2021-2023-mirror-refresh-${REPORT_DATE}.json`;
const REFRESH_MD_REL = `docs/reports/player-history-2024-from-2021-2023-mirror-refresh-${REPORT_DATE}.md`;

const NON_GOALS_MD = `- No player-history model was run; no arm was executed.
- No MAE/RMSE/Pearson/Spearman or any other player-history metric was computed.
- No additional validation was run; no threshold was accepted, rejected, or amended.
- No leakage-audit or production-readiness claim is made by this refresh.
- \`seasonalPprModel.ts\` and the production baseline are untouched; no feature was bound into production Forecast.
- No product route/UI surface, fantasy advice, rankings, start/sit, trade, or draft output was created.
- No TIBER-Data file was modified; nothing was promoted or demoted.
- No active-roster, availability, injury, depth-chart, or ownership status was inferred or consumed.
- The #110 archived candidate mirrors and the #119/#120 promoted-source mirrors were preserved unchanged.`;

const argValue = (name: string): string | undefined =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

const artifactPath = argValue('artifact') ?? process.env.TIBER_DATA_PROMOTED_ARTIFACT;
const manifestPath = argValue('manifest') ?? process.env.TIBER_DATA_PROMOTED_MANIFEST;
if (!artifactPath || !manifestPath) {
  process.stderr.write(
    'Missing promoted source paths. Pass --artifact=... --manifest=... or set TIBER_DATA_PROMOTED_ARTIFACT / TIBER_DATA_PROMOTED_MANIFEST.\n' +
      `They must be local copies of ${PROMOTED_ARTIFACT_REPO}:${PROMOTED_ARTIFACT_PATH} (sha256 ${PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025}) and ` +
      `${PROMOTED_ARTIFACT_REPO}:${PROMOTED_MANIFEST_PATH} at merge ${PROMOTION_MERGE_COMMIT_2021_2025}. The full promoted artifact is deliberately NOT vendored into Forecast.\n`,
  );
  process.exit(1);
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const artifactRaw = readFileSync(artifactPath);
const actualPromotedArtifactSha256 = sha256(artifactRaw);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PromotedManifest;
const artifact = JSON.parse(artifactRaw.toString('utf-8')) as PromotedArtifact;

// ---- Verify source identity fail-closed BEFORE trusting anything else from this artifact -----------
const sourceIdentity = evaluatePlayerSeasonCoverageV0_2021_2025SourceIdentity({ manifest, artifact, actualPromotedArtifactSha256 });
if (!sourceIdentity.passed) {
  process.stderr.write(
    `FAIL CLOSED: source-identity verification against the #202/#207 (2021-2025) promotion pins did not pass. No mirror was written.\n` +
      `${sourceIdentity.blocking_reasons.map((r) => `  - ${r}\n`).join('')}`,
  );
  process.exit(1);
}

// ---- Build the 2024-from-2021-2023 mirrors --------------------------------------------------------
const outcomeMirror = buildPlayerHistory2024OutcomeMirror(artifact);
const inputMirror = buildPlayerHistory2021_2023InputMirror(artifact, outcomeMirror);

const outcomeMirrorJson = `${JSON.stringify(outcomeMirror, null, 1)}\n`;
const inputMirrorJson = `${JSON.stringify(inputMirror, null, 1)}\n`;
writeFileSync(path.join(REPO_ROOT, OUTCOME_MIRROR_PATH_2024), outcomeMirrorJson, 'utf-8');
writeFileSync(path.join(REPO_ROOT, INPUT_MIRROR_PATH_2021_2023), inputMirrorJson, 'utf-8');

// ---- Population/overlap evidence (assembly and counting only -- no metrics, no model) --------------
const inputByPlayer = new Map<string, number>();
for (const row of inputMirror.rows) inputByPlayer.set(row.player_id, (inputByPlayer.get(row.player_id) ?? 0) + 1);
const joinedRowsByPosition: Record<string, number> = {};
let joinedRows = 0;
for (const row of outcomeMirror.rows) {
  if ((inputByPlayer.get(row.player_id) ?? 0) > 0) {
    joinedRows += 1;
    joinedRowsByPosition[row.position] = (joinedRowsByPosition[row.position] ?? 0) + 1;
  }
}
const shuffleGroups = Object.entries(joinedRowsByPosition).map(([position, count]) => ({
  position,
  feature_bearing_row_count: count,
  derangement_possible: count >= 2,
}));

const gate = evaluatePlayerHistory2024From2021_2023MirrorRefreshGate({
  sourceIdentity,
  outcomeMirror,
  inputMirror,
  overlap: {
    scored_target_rows: outcomeMirror.rows.length,
    joined_rows: joinedRows,
    joined_rows_by_position: joinedRowsByPosition,
    shuffle_groups: shuffleGroups,
  },
});

// ---- Provenance companion ---------------------------------------------------------------------------
const provenance = {
  kind: 'player_history_2024_from_2021_2023_mirror_provenance',
  version: PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION,
  issue: PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  generator_script: 'scripts/runPlayerHistory2024From2021_2023MirrorRefresh.ts',
  statement:
    'Mirror refresh only: these mirrors source the player-history 2024-from-2021-2023 additional-validation path from ' +
    'the promoted TIBER-Data 2021-2025 player_season_coverage_v0 artifact. No model was run, no metric was computed, ' +
    'no validation was run, no threshold was accepted, nothing was bound into production Forecast, and no ' +
    'product/advice output was created.',
  promoted_source: {
    repo: PROMOTED_ARTIFACT_REPO,
    promotedArtifactPath: PROMOTED_ARTIFACT_PATH,
    promotedArtifactSha256Pinned: PINNED_PROMOTED_ARTIFACT_SHA256_2021_2025,
    promotedArtifactSha256Actual: actualPromotedArtifactSha256,
    promotedManifestPath: PROMOTED_MANIFEST_PATH,
    promotedManifestSha256Actual: sha256(readFileSync(manifestPath)),
    promotionMergeCommit: PROMOTION_MERGE_COMMIT_2021_2025,
    promotionReview: manifest.promotion_review,
    promotionDecision: manifest.promotion_decision,
    sourceCandidateSha256: manifest.source_candidate?.sha256 ?? null,
    sha256_verified_fail_closed_by_generator: true,
  },
  source_identity_gate: {
    status: gate.status,
    decision: gate.decision,
    checks_passed: `${gate.checks.filter((c) => c.passed).length}/${gate.checks.length}`,
    source_identity_passed: gate.source_identity_passed,
    mirror_integrity_passed: gate.mirror_integrity_passed,
    overlap_floors_passed: gate.overlap_floors_passed,
  },
  mirrors: {
    outcome_mirror: {
      path: OUTCOME_MIRROR_PATH_2024,
      sha256: sha256(outcomeMirrorJson),
      scope: `season ${outcomeMirror.target_season}, REG, QB/RB/WR/TE, outcome layer only`,
      counts: outcomeMirror.counts,
      trimming_rationale:
        'Rows carry the target outcome (season_ppr), identity/position, and row-level provenance (source_refs, ' +
        'identity_confidence) -- and nothing else. No input-feature payloads are copied, so this mirror cannot be ' +
        'consumed as 2024 input features.',
    },
    input_mirror: {
      path: INPUT_MIRROR_PATH_2021_2023,
      sha256: sha256(inputMirrorJson),
      scope: `seasons ${inputMirror.input_window.seasons.join('/')}, REG, QB/RB/WR/TE, players limited to the outcome-mirror population`,
      counts: inputMirror.counts,
      trimming_rationale:
        'Rows are trimmed to exactly the fields the #104 feature-extraction scaffold consumes (identity, provenance, ' +
        'team-of-record context, coverage, production_summary, usage_summary, age/career fields). Unavailable usage ' +
        'fields stay null exactly as in the promoted source; nulls are preserved verbatim and never coerced to zero. ' +
        'No availability/ownership/depth/injury field exists in any row.',
    },
  },
  exclusion_rules: {
    input_mirror_excludes_all_2024_records: true,
    positions_limited_to: ['QB', 'RB', 'TE', 'WR'],
    season_type_limited_to: 'REG',
    outcome_players_without_history: `${inputMirror.counts.outcome_players_without_history} outcome players have no 2021-2023 source rows (e.g. rookies); documented absence (no-history subgroup), not a mirror failure. Listed per player in the input mirror's no_history_players.`,
  },
  prior_mirrors: {
    preserved_unchanged_at: PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED,
    not_overwritten_by_this_refresh: true,
    relationship:
      'The #110 archived candidate mirrors remain the archived record of the #112/#116 candidate experiment. The ' +
      '#119/#120 promoted-source mirrors (2025 outcome / 2022-2024 input) remain the refreshed record of the prior ' +
      '(#192/#193, 2022-2025) promotion event. The mirrors above are a NEW, separate refreshed set for the ' +
      '2024-from-2021-2023 window, sourced from the #202/#207 (2021-2025) promotion.',
  },
  overlap_evidence: {
    scored_target_rows: outcomeMirror.rows.length,
    joined_rows: joinedRows,
    joined_rows_by_position: joinedRowsByPosition,
    joined_share: outcomeMirror.rows.length > 0 ? joinedRows / outcomeMirror.rows.length : null,
  },
  refresh_gate_decision: gate.decision,
  boundary_statements: {
    mirror_refresh_only_not_a_model_run: true,
    no_metrics_computed: true,
    no_validation_run: true,
    no_threshold_accepted_rejected_or_amended: true,
    no_leakage_audit_or_production_readiness_claim: true,
    no_production_binding_authorized: true,
    no_product_or_advice_output: true,
    no_tiber_data_change: true,
    no_availability_ownership_depth_injury_inference: true,
    input_mirror_contains_no_2024_rows: true,
    outcome_mirror_is_outcome_layer_only: true,
    nulls_preserved_never_zero_coerced: true,
  },
};
writeFileSync(
  path.join(REPO_ROOT, MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023),
  `${JSON.stringify(provenance, null, 2)}\n`,
  'utf-8',
);

// ---- Refresh report ----------------------------------------------------------------------------------
const joinedShare = provenance.overlap_evidence.joined_share;
const refreshReport = {
  report_version: 'player-history-2024-from-2021-2023-mirror-refresh-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PLAYER_HISTORY_2024_FROM_2021_2023_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evaluation_kind: 'mirror_refresh_only_no_run_no_validation_no_threshold_no_binding',
  existing_mirror_inventory: {
    archived_candidate_mirrors_from_110: [
      'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json',
      'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json',
      'data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json',
    ],
    note_on_archived_mirrors:
      'Built from the CANDIDATE (not-promoted) 2022-2025 evidence artifact for the original #109 controlled-run ' +
      'design; preserved as the archived record of the #112/#116 experiment. Not touched by this refresh.',
    promoted_source_mirrors_from_119_120: [
      'data/fixtures/tiberData/player_season_coverage_v0_2025.promoted_outcome_mirror.json',
      'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.promoted_input_mirror.json',
      'data/fixtures/tiberData/player_season_coverage_v0_promoted_mirror_provenance.json',
    ],
    note_on_prior_promoted_mirrors:
      'Refreshed from the TIBER-Data #192/#193 promotion (2022-2025 scope, sha 29f8e378...): 2025 outcome / ' +
      '2022-2024 input. Superseded in scope by the #202/#207 (2021-2025) promotion this issue consumes, but NOT ' +
      'overwritten -- they remain valid as the refreshed record of that prior promotion event. Not touched by this refresh.',
    this_refresh_covers: 'A DIFFERENT window (2024-from-2021-2023) from the same #202/#207 (2021-2025) promoted ' +
      'artifact, needed for a possible future additional-validation issue. Does not replace or invalidate the ' +
      '2025-from-2022-2024 mirrors above.',
  },
  promoted_source: provenance.promoted_source,
  source_identity_gate: provenance.source_identity_gate,
  gate_checks: gate.checks,
  mirrors: provenance.mirrors,
  prior_mirrors: provenance.prior_mirrors,
  overlap_evidence: provenance.overlap_evidence,
  refresh_gate_result: gate,
  final_decision: gate.decision,
  boundary_statements: provenance.boundary_statements,
};
writeFileSync(path.join(REPO_ROOT, REFRESH_JSON_REL), `${JSON.stringify(refreshReport, null, 2)}\n`, 'utf-8');

const refreshMd = `# Player-history mirror refresh: 2024-from-2021-2023 (Forecast #135)

_Generated ${REPORT_DATE} • ${PLAYER_HISTORY_2024_FROM_2021_2023_MIRROR_REFRESH_VERSION} • decision: **\`${gate.decision}\`**_

Refreshes Forecast-side, non-production player-history mirrors for the 2024-from-2021-2023 additional-validation path
from the PROMOTED TIBER-Data artifact (\`${PROMOTED_ARTIFACT_REPO}:${PROMOTED_ARTIFACT_PATH}\`, TIBER-Data #202 review,
merge \`${PROMOTION_MERGE_COMMIT_2021_2025}\`), as authorized by the TIBER-Data #207 decision
\`may_open_forecast_player_history_2021_2023_mirror_refresh_issue\`. **Mirror refresh only: no validation run, no
threshold acceptance, no leakage-audit or production-readiness claim, no model run, no new metrics, no production
binding, no \`seasonalPprModel.ts\` change, no product/advice output, no TIBER-Data change.**

## 1. Existing Forecast player-history mirror inputs (located and documented)

| Mirror set | Paths | What it contains |
|---|---|---|
| Archived candidate (#110) | ${refreshReport.existing_mirror_inventory.archived_candidate_mirrors_from_110.map((p) => `\`${p}\``).join(', ')} | ${refreshReport.existing_mirror_inventory.note_on_archived_mirrors} |
| Promoted-source (#119/#120) | ${refreshReport.existing_mirror_inventory.promoted_source_mirrors_from_119_120.map((p) => `\`${p}\``).join(', ')} | ${refreshReport.existing_mirror_inventory.note_on_prior_promoted_mirrors} |

${refreshReport.existing_mirror_inventory.this_refresh_covers}

## 2. Upstream identity verified before use

- Artifact id: \`player_season_coverage_v0\`
- Promoted sha256 (pin = actual local bytes): \`${actualPromotedArtifactSha256}\`
- Promotion review: \`${manifest.promotion_review}\`
- Promotion decision: \`${manifest.promotion_decision}\`
- Seasons: 2021-2025 (633/609/576/588/610 records); this refresh's window: target season 2024, input seasons 2021-2023
- Source-identity gate: ${gate.checks.filter((c) => c.passed).length}/${gate.checks.length} checks passed; source_identity_passed=**${gate.source_identity_passed}**, mirror_integrity_passed=**${gate.mirror_integrity_passed}**, overlap_floors_passed=**${gate.overlap_floors_passed}**

## 3. Refreshed mirrors

| Mirror | Path | Rows | Notes |
|---|---|---|---|
| Outcome (2024 REG) | \`${OUTCOME_MIRROR_PATH_2024}\` | ${outcomeMirror.counts.rows} (${Object.entries(outcomeMirror.counts.by_position).sort().map(([p, n]) => `${p} ${n}`).join(', ')}) | outcome layer only; never 2024 input features |
| Input (2021-2023 REG) | \`${INPUT_MIRROR_PATH_2021_2023}\` | ${inputMirror.counts.rows} (${Object.entries(inputMirror.counts.by_season).map(([s, n]) => `${s}: ${n}`).join(', ')}) | ${inputMirror.counts.players_with_history} players with history; ${inputMirror.counts.outcome_players_without_history} documented no-history players |
| Provenance | \`${MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023}\` | — | ties both mirrors to the promoted artifact/manifest, merge commit, and this gate |

The archived candidate mirrors (#110) and the prior promoted-source mirrors (#119/#120) are preserved unchanged at:
${PRIOR_MIRROR_PATHS_PRESERVED_UNCHANGED.map((p) => `- \`${p}\``).join('\n')}

## 4. Population/overlap evidence (counting only -- no metrics, no model)

- 2024 outcome population: ${outcomeMirror.rows.length} players
- Joined with 2021-2023 history: **${joinedRows}** (share: **${joinedShare === null ? 'n/a' : `${(joinedShare * 100).toFixed(1)}%`}**)
- Joined by position: ${Object.entries(joinedRowsByPosition).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- Thresholds (pre-registered #107/PR#108 floors, reused as-is): overall >= ${gate.thresholds.min_joined_rows_overall}, per position >= ${gate.thresholds.min_joined_rows_per_position}, share >= ${gate.thresholds.min_joined_share}

## Result

- **Refresh gate decision:** \`${gate.decision}\` (${gate.checks.filter((c) => c.passed).length}/${gate.checks.length} checks passed)
- **Next step:** ${
  gate.decision === 'may_open_player_history_2024_from_2021_2023_additional_validation_issue'
    ? 'a SEPARATE issue may be opened to consider running additional validation against these mirrors. Opening that issue authorizes nothing by itself; the validation run would need its own review, and would not itself accept or amend any threshold or make a production/leakage claim.'
    : gate.decision === 'forecast_player_history_mirror_refresh_requires_followup'
      ? 'do not open the additional-validation issue yet. The mirrors are internally valid but a population/overlap floor did not clear; fix the identified gap and re-run this refresh.'
      : 'do not use the refreshed mirrors. Fix the first blocking reason and re-run this refresh.'
}

## Non-goals confirmed

${NON_GOALS_MD}

## Reproduce

\`\`\`bash
npm run refresh:player-history-2024-from-2021-2023-mirrors -- \\
  --artifact=/path/to/player_season_coverage_v0.json \\
  --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build   # tsc --noEmit
npm test        # incl. tests/playerHistory2024From2021_2023MirrorRefresh.test.ts
\`\`\`
`;
writeFileSync(path.join(REPO_ROOT, REFRESH_MD_REL), refreshMd, 'utf-8');

process.stderr.write(
  `source-identity gate: ${gate.status} -> ${gate.decision}\n` +
    `outcome mirror: ${outcomeMirror.counts.rows} rows (${JSON.stringify(outcomeMirror.counts.by_position)})\n` +
    `input mirror: ${inputMirror.counts.rows} rows, ${inputMirror.counts.players_with_history} players with history, ${inputMirror.counts.outcome_players_without_history} no-history players\n` +
    `overlap: ${joinedRows} joined of ${outcomeMirror.rows.length} (${joinedShare === null ? 'n/a' : `${(joinedShare * 100).toFixed(1)}%`}), by position ${JSON.stringify(joinedRowsByPosition)}\n` +
    `refresh gate: ${gate.status} -> ${gate.decision} (${gate.checks.filter((c) => c.passed).length}/${gate.checks.length} checks passed)\n` +
    `  wrote ${OUTCOME_MIRROR_PATH_2024}\n  wrote ${INPUT_MIRROR_PATH_2021_2023}\n  wrote ${MIRROR_PROVENANCE_PATH_2024_FROM_2021_2023}\n` +
    `  wrote ${REFRESH_JSON_REL} / .md\n`,
);
if (gate.decision !== 'may_open_player_history_2024_from_2021_2023_additional_validation_issue') {
  process.exit(1);
}
