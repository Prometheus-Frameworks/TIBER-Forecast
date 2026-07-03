/**
 * Run the Forecast-side promoted-source gate for the TIBER-Data player_season_coverage_v0
 * PROMOTED artifact (Forecast #117). Deterministic and network-free; the full promoted artifact is
 * NOT vendored into Forecast -- this script reads local copies of the promoted artifact + promotion
 * manifest, computes the actual sha256, evaluates the gate, and writes a compact committed evidence
 * fixture plus a durable report.
 *
 *   npm run gate:player-history-promoted-source -- \
 *     --artifact=/path/to/exports/promoted/nfl/player_season_coverage_v0.json \
 *     --manifest=/path/to/exports/promoted/nfl/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
 *   # or env: TIBER_DATA_PROMOTED_ARTIFACT=... TIBER_DATA_PROMOTED_MANIFEST=...
 *
 * Writes:
 *   data/fixtures/tiberData/PLAYER_SEASON_COVERAGE_V0_PROMOTED_SOURCE_GATE_EVIDENCE.json
 *   docs/reports/player-history-promoted-source-gate-2026-07-03.{json,md}
 *
 * Gate only: no model run, no metrics, no feature binding, no mirror refresh, no production change,
 * no product output. Exits non-zero unless the gate decision is may_open_promoted_mirror_refresh_issue.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-03';
const EVIDENCE_REL = 'data/fixtures/tiberData/PLAYER_SEASON_COVERAGE_V0_PROMOTED_SOURCE_GATE_EVIDENCE.json';
const REPORT_JSON_REL = `docs/reports/player-history-promoted-source-gate-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-promoted-source-gate-${REPORT_DATE}.md`;

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

const artifactRaw = readFileSync(artifactPath);
const actualPromotedArtifactSha256 = createHash('sha256').update(artifactRaw).digest('hex');
const artifact = JSON.parse(artifactRaw.toString('utf-8')) as PromotedArtifact;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PromotedManifest;

const result = evaluatePlayerHistoryPromotedSourceGate({ manifest, artifact, actualPromotedArtifactSha256 });

// ---- Committed compact evidence fixture (manifest verbatim + scan outcomes; NO records vendored) --
const evidence = {
  kind: 'player_season_coverage_v0_promoted_source_gate_evidence',
  issue: 'TIBER-Forecast#117',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  generator_script: 'scripts/runPlayerHistoryPromotedSourceGate.ts',
  governed_source: {
    repo: PROMOTED_ARTIFACT_REPO,
    promotedArtifactPath: PROMOTED_ARTIFACT_PATH,
    promotedManifestPath: PROMOTED_MANIFEST_PATH,
    promotionMergeCommit: PROMOTION_MERGE_COMMIT,
    promotedArtifactSha256Pinned: PINNED_PROMOTED_ARTIFACT_SHA256,
    promotedArtifactSha256Actual: actualPromotedArtifactSha256,
    sha256_verified_fail_closed_by_gate: true,
  },
  refs: [
    'TIBER-Data#188', 'TIBER-Data#189', 'TIBER-Data#190', 'TIBER-Data#191', 'TIBER-Data#192',
    'TIBER-Forecast#99', 'TIBER-Forecast#100', 'TIBER-Forecast#103', 'TIBER-Forecast#104',
    'TIBER-Forecast#105', 'TIBER-Forecast#106', 'TIBER-Forecast#107', 'TIBER-Forecast#108',
    'TIBER-Forecast#109', 'TIBER-Forecast#110', 'TIBER-Forecast#111', 'TIBER-Forecast#112',
    'TIBER-Forecast#113', 'TIBER-Forecast#114', 'TIBER-Forecast#115', 'TIBER-Forecast#116',
    'TIBER-Forecast#117',
  ],
  manifest_verbatim: manifest,
  gate_result: result,
  boundary_statements: {
    no_records_vendored_into_forecast: true,
    no_mirror_refresh_performed: true,
    no_forecast_run_authorized: true,
    no_metrics_computed: true,
    no_production_binding_authorized: true,
    no_product_or_advice_output: true,
    promoted_artifact_not_consumed_yet: true,
  },
};
writeFileSync(path.join(REPO_ROOT, EVIDENCE_REL), `${JSON.stringify(evidence, null, 2)}\n`, 'utf-8');

// ---- Reports --------------------------------------------------------------------------------------
const report = {
  report_version: 'player-history-promoted-source-gate-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#117',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  evaluation_kind: 'promoted_source_gate_only_no_run_no_refresh_no_binding',
  upstream_source: evidence.governed_source,
  gate_result: result,
  final_status: result.status,
  final_decision: result.decision,
  next_step:
    result.decision === 'may_open_promoted_mirror_refresh_issue'
      ? 'A SEPARATE later issue may refresh the experiment source reference/mirrors from the candidate pin to the promoted artifact; that issue must re-run population/overlap gates on the refreshed mirrors and re-state the leakage discipline before any further use. Nothing runs or binds here.'
      : 'Do not consume the promoted artifact. Fix the first blocking reason and re-run this gate.',
};
writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

const checkRows = result.checks
  .map((c) => `| ${c.dimension} | \`${c.expected.replaceAll('|', '\\|')}\` | \`${c.observed.replaceAll('|', '\\|')}\` | ${c.passed ? 'pass' : 'FAIL'} |`)
  .join('\n');

const md = `# Promoted-source gate: player_season_coverage_v0 (Forecast #117)

_Generated ${REPORT_DATE} • ${report.report_version} • status: **${result.status}** • decision: **\`${result.decision}\`**_

Forecast-side gate over the TIBER-Data PROMOTED artifact (\`${PROMOTED_ARTIFACT_REPO}:${PROMOTED_ARTIFACT_PATH}\`, promoted by TIBER-Data #192 / PR #193, merge \`${PROMOTION_MERGE_COMMIT}\`). Gate only: **no model run, no new metrics, no feature binding, no mirror refresh, no production change, no product/advice output.** ${result.ceiling_note}

## Upstream identity

- Promoted artifact: \`${PROMOTED_ARTIFACT_PATH}\`
- Promotion manifest: \`${PROMOTED_MANIFEST_PATH}\`
- Promoted sha256 (pin): \`${PINNED_PROMOTED_ARTIFACT_SHA256}\`
- Promoted sha256 (actual local bytes): \`${actualPromotedArtifactSha256}\`
- Candidate lineage intact: **${result.candidate_lineage_intact}**

## Checks (${result.checks.filter((c) => c.passed).length}/${result.checks.length} passed)

| Check | Expected | Observed | Result |
|---|---|---|---|
${checkRows}

${result.blocking_reasons.length > 0 ? `## Blocking reasons\n\n${result.blocking_reasons.map((r) => `- ${r}`).join('\n')}\n` : ''}## Decision rule

${result.decision_rule}

## Leakage discipline recorded for any future mirror refresh/use

${Object.entries(result.leakage_discipline_for_future_refresh)
  .map(([k, v]) => `- \`${k}\`: **${v}**`)
  .join('\n')}

## Relationship to existing candidate mirrors

${result.candidate_mirror_relationship}

## Result

- **Final gate status:** \`${result.status}\`
- **Final decision:** \`${result.decision}\`
- **Next step:** ${report.next_step}

## Reproduce

\`\`\`bash
npm run gate:player-history-promoted-source -- --artifact=/path/to/player_season_coverage_v0.json --manifest=/path/to/PLAYER_SEASON_COVERAGE_V0_PROMOTION_MANIFEST.json
npm run build   # tsc --noEmit
npm test        # incl. tests/playerHistoryPromotedSourceGate.test.ts
\`\`\`
`;
writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `${result.status} -> ${result.decision} (${result.checks.filter((c) => c.passed).length}/${result.checks.length} checks passed)\n` +
    `  wrote ${EVIDENCE_REL}\n  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
if (result.decision !== 'may_open_promoted_mirror_refresh_issue') {
  process.exit(1);
}
