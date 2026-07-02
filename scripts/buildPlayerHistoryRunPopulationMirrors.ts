/**
 * Generate the real target-population mirrors for the player-history run path (Forecast #109).
 * Deterministic and network-free; the full TIBER-Data artifact is NOT vendored -- this script reads a
 * local copy, verifies its sha256 against the #100/#104/#108 pin (fail-closed), and emits compact
 * generated mirrors + a shared provenance companion + a #99/#100 source-gate re-verification report.
 *
 *   npm run generate:player-history-run-mirrors -- --artifact=/path/to/player_season_coverage_2022_2025.source_backed.json
 *   # or: TIBER_DATA_COVERAGE_ARTIFACT=/path/... npm run generate:player-history-run-mirrors
 *
 * Writes:
 *   data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json
 *   data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json
 *   data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json
 *   docs/reports/player-history-source-gate-reverification-2026-07-02.{json,md}
 *
 * No run, no metrics, no model, no promotion, no signal claim.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPROVED_SOURCE_NAME_SUBSTRINGS } from '../src/reports/playerSeasonCoverageGate.js';
import {
  EXPECTED_SOURCE_ARTIFACT_STATUS,
  PINNED_SOURCE_ARTIFACT_PATH,
  PINNED_SOURCE_ARTIFACT_REPO,
  PINNED_SOURCE_ARTIFACT_SHA256,
  PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION,
  RUN_POPULATION_INPUT_SEASONS,
  RUN_POPULATION_TARGET_SEASON,
  assertPinnedSourceArtifactSha256,
  buildPlayerHistoryOutcomeMirror,
  buildPlayerHistoryRunPopulationInputMirror,
  type SourceCoverageArtifact,
} from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-02';
const OUTCOME_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json';
const INPUT_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json';
const PROVENANCE_REL = 'data/fixtures/tiberData/PLAYER_HISTORY_RUN_POPULATION_MIRRORS_PROVENANCE.json';
const REVERIFY_JSON_REL = `docs/reports/player-history-source-gate-reverification-${REPORT_DATE}.json`;
const REVERIFY_MD_REL = `docs/reports/player-history-source-gate-reverification-${REPORT_DATE}.md`;

const artifactArg = process.argv.find((arg) => arg.startsWith('--artifact='))?.slice('--artifact='.length);
const artifactPath = artifactArg ?? process.env.TIBER_DATA_COVERAGE_ARTIFACT;
if (!artifactPath) {
  process.stderr.write(
    'Missing source artifact path. Pass --artifact=/path/to/artifact.json or set TIBER_DATA_COVERAGE_ARTIFACT.\n' +
      `The artifact must be a local copy of ${PINNED_SOURCE_ARTIFACT_REPO}:${PINNED_SOURCE_ARTIFACT_PATH} ` +
      `with sha256 ${PINNED_SOURCE_ARTIFACT_SHA256}. The full artifact is deliberately NOT vendored into Forecast.\n`,
  );
  process.exit(1);
}

const raw = readFileSync(artifactPath);
const actualSha = createHash('sha256').update(raw).digest('hex');
try {
  assertPinnedSourceArtifactSha256(actualSha);
} catch (error) {
  process.stderr.write(`FAIL CLOSED: ${(error as Error).message}\n`);
  process.exit(1);
}

const artifact = JSON.parse(raw.toString('utf-8')) as SourceCoverageArtifact;

// ---- #99/#100 source-gate re-verification (short report; the full gate already passed on this pin) --
const reverifyChecks = [
  { dimension: 'sha256_pin', expected: PINNED_SOURCE_ARTIFACT_SHA256, observed: actualSha, passed: actualSha === PINNED_SOURCE_ARTIFACT_SHA256 },
  { dimension: 'artifact_status', expected: EXPECTED_SOURCE_ARTIFACT_STATUS, observed: artifact.status, passed: artifact.status === EXPECTED_SOURCE_ARTIFACT_STATUS },
  { dimension: 'seasons_scope', expected: '2022,2023,2024,2025', observed: [...artifact.seasons].sort((a, b) => a - b).join(','), passed: [...artifact.seasons].sort((a, b) => a - b).join(',') === '2022,2023,2024,2025' },
  { dimension: 'season_type_scope', expected: 'REG', observed: artifact.season_type_scope.join(','), passed: artifact.season_type_scope.length === 1 && artifact.season_type_scope[0] === 'REG' },
  { dimension: 'included_positions', expected: 'QB,RB,TE,WR', observed: [...artifact.included_positions].sort().join(','), passed: [...artifact.included_positions].sort().join(',') === 'QB,RB,TE,WR' },
  { dimension: 'row_grain', expected: 'player_id + season + season_type', observed: artifact.row_grain, passed: artifact.row_grain === 'player_id + season + season_type' },
  {
    dimension: 'source_refs_approved',
    // "At least one approved source" would still pass a record carrying an approved source plus an
    // unapproved extra; preserve the stricter #100 all-source allow-list standard.
    expected: `every record carries >= 1 source_ref, ALL source_refs are on the approved allow-list (${APPROVED_SOURCE_NAME_SUBSTRINGS.join(', ')}), and none carries a fixture marker`,
    observed: (() => {
      const bad = artifact.records.filter(
        (r) =>
          !Array.isArray(r.source_refs) ||
          r.source_refs.length === 0 ||
          r.source_refs.some((ref) => !APPROVED_SOURCE_NAME_SUBSTRINGS.some((approved) => ref.source_name.includes(approved))) ||
          r.source_refs.some((ref) => ref.source_name.toLowerCase().includes('fixture')),
      ).length;
      return `${bad} non-conforming records`;
    })(),
    passed: artifact.records.every(
      (r) =>
        Array.isArray(r.source_refs) &&
        r.source_refs.length > 0 &&
        r.source_refs.every((ref) => APPROVED_SOURCE_NAME_SUBSTRINGS.some((approved) => ref.source_name.includes(approved))) &&
        !r.source_refs.some((ref) => ref.source_name.toLowerCase().includes('fixture')),
    ),
  },
];
const reverifyPassed = reverifyChecks.every((c) => c.passed);
const reverifyDecision = reverifyPassed ? 'may_continue_mirror_build' : 'blocked_source_artifact';
if (!reverifyPassed) {
  process.stderr.write(`FAIL CLOSED: source-gate re-verification failed:\n${JSON.stringify(reverifyChecks.filter((c) => !c.passed), null, 2)}\n`);
  process.exit(1);
}

// ---- Mirrors --------------------------------------------------------------------------------------
const outcomeMirror = buildPlayerHistoryOutcomeMirror(artifact);
const inputMirror = buildPlayerHistoryRunPopulationInputMirror(artifact, outcomeMirror);

writeFileSync(path.join(REPO_ROOT, OUTCOME_MIRROR_REL), `${JSON.stringify(outcomeMirror, null, 1)}\n`, 'utf-8');
writeFileSync(path.join(REPO_ROOT, INPUT_MIRROR_REL), `${JSON.stringify(inputMirror, null, 1)}\n`, 'utf-8');

// ---- Shared provenance companion ------------------------------------------------------------------
const provenance = {
  kind: 'player_history_run_population_mirrors_provenance',
  version: PLAYER_HISTORY_RUN_POPULATION_MIRRORS_VERSION,
  issue: 'TIBER-Forecast#109',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  generator_script: 'scripts/buildPlayerHistoryRunPopulationMirrors.ts',
  governed_source: {
    repo: PINNED_SOURCE_ARTIFACT_REPO,
    sourceArtifactPath: PINNED_SOURCE_ARTIFACT_PATH,
    sha256: PINNED_SOURCE_ARTIFACT_SHA256,
    artifactStatus: EXPECTED_SOURCE_ARTIFACT_STATUS,
    sha256_verified_fail_closed_by_generator: true,
  },
  refs: [
    'TIBER-Data#184', 'TIBER-Data#185', 'TIBER-Data#186', 'TIBER-Data#187',
    'TIBER-Data#188', 'TIBER-Data#189', 'TIBER-Data#190', 'TIBER-Data#191',
    'TIBER-Forecast#99', 'TIBER-Forecast#100', 'TIBER-Forecast#101', 'TIBER-Forecast#102',
    'TIBER-Forecast#103', 'TIBER-Forecast#104', 'TIBER-Forecast#105', 'TIBER-Forecast#106',
    'TIBER-Forecast#107', 'TIBER-Forecast#108', 'TIBER-Forecast#109',
  ],
  mirrors: {
    outcome_mirror: {
      path: OUTCOME_MIRROR_REL,
      scope: `season ${RUN_POPULATION_TARGET_SEASON}, REG, QB/RB/WR/TE, outcome layer only`,
      counts: outcomeMirror.counts,
      trimming_rationale:
        'Rows carry the target outcome (season_ppr), identity/position, and row-level provenance (source_refs, identity_confidence) required by the target-population gate -- and nothing else. No input-feature payloads (production/usage/coverage/team fields) are copied, so this mirror cannot be consumed as features.',
    },
    input_mirror: {
      path: INPUT_MIRROR_REL,
      scope: `seasons ${RUN_POPULATION_INPUT_SEASONS.join('/')}, REG, QB/RB/WR/TE, players limited to the outcome-mirror population`,
      counts: inputMirror.counts,
      trimming_rationale:
        'Rows are trimmed to exactly the fields the #104 feature-extraction scaffold consumes (identity, provenance, team-of-record context, coverage, production_summary, usage_summary, age/career fields). Unavailable usage fields stay null exactly as in the source; nulls are preserved verbatim and never coerced to zero.',
    },
  },
  season_scope: { input_seasons: [...RUN_POPULATION_INPUT_SEASONS], target_season: RUN_POPULATION_TARGET_SEASON, season_type: 'REG' },
  exclusion_reasons: {
    outcome_players_without_history:
      `${inputMirror.counts.outcome_players_without_history} outcome players have no 2022-2024 source rows (e.g. rookies); this is documented absence (no-history subgroup), not a mirror failure. They are listed per player in the input mirror's no_history_players.`,
  },
  boundary_statements: {
    input_mirror_contains_no_2025_rows: true,
    outcome_mirror_is_outcome_layer_only: true,
    source_artifact_is_candidate_not_promoted: true,
    generating_these_mirrors_promotes_nothing: true,
    no_production_consumer_may_treat_this_as_promoted_truth: true,
    no_forecast_run_authorized: true,
    nulls_preserved_never_zero_coerced: true,
  },
};
writeFileSync(path.join(REPO_ROOT, PROVENANCE_REL), `${JSON.stringify(provenance, null, 2)}\n`, 'utf-8');

// ---- Re-verification report -----------------------------------------------------------------------
const reverifyReport = {
  report_version: 'player-history-source-gate-reverification-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#109',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  relationship_to_full_gate:
    'Short re-verification of the #99/#100 player-season coverage gate against the unchanged sha256 pin. The full gate (PR #100) already returned may_design_experiment for this exact artifact identity; this report re-verifies identity, status, scope, and source-backing rather than duplicating the whole gate.',
  checks: reverifyChecks,
  decision: reverifyDecision,
  decision_ceiling_note: 'may_continue_mirror_build is the strongest decision this re-verification can return; it never emits may_run and authorizes no Forecast run.',
  status_statements: {
    source_artifact_identity_verified: true,
    sha256_verified: true,
    status_remains_candidate_not_promoted: true,
    no_forecast_run_authorized: true,
  },
};
writeFileSync(path.join(REPO_ROOT, REVERIFY_JSON_REL), `${JSON.stringify(reverifyReport, null, 2)}\n`, 'utf-8');

const md = `# Source-gate re-verification for the player-history run mirrors (#109)

_Generated ${REPORT_DATE} • ${reverifyReport.report_version} • decision: **${reverifyDecision}**_

${reverifyReport.relationship_to_full_gate}

| Check | Expected | Observed | Result |
|---|---|---|---|
${reverifyChecks.map((c) => `| ${c.dimension} | \`${c.expected}\` | \`${c.observed}\` | ${c.passed ? 'pass' : 'FAIL'} |`).join('\n')}

- Decision: \`${reverifyDecision}\` (ceiling: never \`may_run\`; authorizes only continuing the mirror build)
- The artifact remains \`${EXPECTED_SOURCE_ARTIFACT_STATUS}\`; generating mirrors from it promotes nothing.
- No Forecast run occurred; no model was trained/tuned/evaluated; no metric was computed; no signal is claimed.

## Reproduce

\`\`\`bash
npm run generate:player-history-run-mirrors -- --artifact=/path/to/local/copy.json
\`\`\`
`;
writeFileSync(path.join(REPO_ROOT, REVERIFY_MD_REL), md, 'utf-8');

process.stderr.write(
  `sha256 verified (${actualSha.slice(0, 12)}…) -> ${reverifyDecision}\n` +
    `outcome mirror: ${outcomeMirror.counts.rows} rows (${JSON.stringify(outcomeMirror.counts.by_position)})\n` +
    `input mirror: ${inputMirror.counts.rows} rows, ${inputMirror.counts.players_with_history} players with history, ${inputMirror.counts.outcome_players_without_history} no-history players\n` +
    `  wrote ${OUTCOME_MIRROR_REL}\n  wrote ${INPUT_MIRROR_REL}\n  wrote ${PROVENANCE_REL}\n  wrote ${REVERIFY_JSON_REL}\n  wrote ${REVERIFY_MD_REL}\n`,
);
