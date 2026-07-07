/**
 * Review the #137/PR #138 additional-validation metrics against the PR #132 acceptance framework and
 * the prior #121/#122 promoted-source evidence (Forecast #139).
 *
 * Deterministic and network-free: reads three already-committed documents from main --
 *
 *   docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json  (#132)
 *   docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json                    (#121/#122)
 *   docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.json     (#137)
 *
 * -- and applies the pre-registered quantitative threshold components independently to both origins
 * (no averaging). Does NOT rerun any validation, does NOT amend any threshold, does NOT bind anything
 * into production Forecast. Writes:
 *
 *   docs/reports/player-history-2024-from-2021-2023-threshold-review-2026-07-07.{json,md}
 *
 * Exits non-zero unless the decision is may_open_player_history_production_binding_review_issue.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_ISSUE,
  evaluatePlayerHistory2024From2021_2023ThresholdReview,
  type JoinedPopulationOriginEvidence,
  type NewOriginEvidence,
  type ThresholdFrameworkEvidence,
} from '../src/rehearsal/playerHistory2024From2021_2023ThresholdReview.js';
import type { ControlledRunMetrics } from '../src/rehearsal/playerHistoryControlledRun.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-07';
const FRAMEWORK_REL = 'docs/experiments/player-history-feature-contract-v0-threshold-proposal-2026-07-04.json';
const PRIOR_ORIGIN_REL = 'docs/reports/player-history-promoted-controlled-rerun-2026-07-04.json';
const NEW_ORIGIN_REL = 'docs/reports/player-history-2024-from-2021-2023-additional-validation-2026-07-07.json';
const REPORT_JSON_REL = `docs/reports/player-history-2024-from-2021-2023-threshold-review-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-2024-from-2021-2023-threshold-review-${REPORT_DATE}.md`;

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const frameworkDoc = readJson<{ status: string; decision: string }>(FRAMEWORK_REL);
const priorOriginReport = readJson<{
  experiment: { decision: { decision: string }; metrics_by_arm: { joined_only: Record<string, ControlledRunMetrics> }; population: { evaluated_rows: number; joined_rows: number; no_history_rows: number } };
}>(PRIOR_ORIGIN_REL);
const newOriginReport = readJson<{
  validation: {
    decision: string;
    boundary_statements: Record<string, boolean>;
    preconditions: { integrity_passed: boolean; floors_passed: boolean };
    metrics_by_arm: { joined_only: Record<string, ControlledRunMetrics> };
    population: { evaluated_rows: number; joined_rows: number; no_history_rows: number };
  };
}>(NEW_ORIGIN_REL);

const framework: ThresholdFrameworkEvidence = { status: frameworkDoc.status, decision: frameworkDoc.decision };

const armsOf = (joined: Record<string, ControlledRunMetrics>) => ({
  mae: {
    baseline_only: joined.baseline_only!.mae!,
    real_player_history_features: joined.real_player_history_features!.mae!,
    shuffled_player_history_control: joined.shuffled_player_history_control!.mae!,
  },
  rmse: {
    baseline_only: joined.baseline_only!.rmse!,
    real_player_history_features: joined.real_player_history_features!.rmse!,
    shuffled_player_history_control: joined.shuffled_player_history_control!.rmse!,
  },
});

const priorArms = armsOf(priorOriginReport.experiment.metrics_by_arm.joined_only);
const priorOrigin: JoinedPopulationOriginEvidence = {
  origin_label: '2025-from-2022-2024 (#121/#122 promoted-source rerun)',
  decision: priorOriginReport.experiment.decision.decision,
  joined_mae: priorArms.mae,
  joined_rmse: priorArms.rmse,
  population: priorOriginReport.experiment.population,
};

const newArms = armsOf(newOriginReport.validation.metrics_by_arm.joined_only);
const newOrigin: NewOriginEvidence = {
  origin_label: '2024-from-2021-2023 (#137/#138 additional validation)',
  decision: newOriginReport.validation.decision,
  joined_mae: newArms.mae,
  joined_rmse: newArms.rmse,
  population: newOriginReport.validation.population,
  boundary_statements: newOriginReport.validation.boundary_statements,
  preconditions_integrity_passed: newOriginReport.validation.preconditions.integrity_passed,
  preconditions_floors_passed: newOriginReport.validation.preconditions.floors_passed,
};

const review = evaluatePlayerHistory2024From2021_2023ThresholdReview({ framework, priorOrigin, newOrigin });

const fullReport = {
  report_version: 'player-history-2024-from-2021-2023-threshold-review-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: PLAYER_HISTORY_2024_FROM_2021_2023_THRESHOLD_REVIEW_ISSUE,
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  cited_documents: {
    threshold_framework: { path: FRAMEWORK_REL, source_pr: 'TIBER-Forecast#132', status: framework.status, decision: framework.decision },
    prior_origin_evidence: { path: PRIOR_ORIGIN_REL, source_issues: 'TIBER-Forecast#121/#122', decision: priorOrigin.decision },
    new_origin_evidence: { path: NEW_ORIGIN_REL, source_pr: 'TIBER-Forecast#138 (squash commit 86f5097)', decision: newOrigin.decision },
  },
  review,
  next_allowed_step:
    review.decision === 'may_open_player_history_production_binding_review_issue'
      ? 'A SEPARATE issue may be opened to review production-binding prerequisites (including the PR #132 qualitative governance conditions: a production-path leakage audit and dated human sign-off on the specific wiring proposal). This decision does not itself bind production, run a leakage audit, amend any threshold, or make a product claim.'
      : review.decision === 'player_history_2024_from_2021_2023_threshold_review_requires_followup'
        ? 'Do not open a production-binding review issue yet. See component_checks for the specific failing dimension(s) and origin(s).'
        : 'Do not rely on this review. See identity_checks for the specific mismatch; the cited evidence is not what this review expects.',
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const checksTable = (checks: typeof review.identity_checks): string =>
  `| Dimension | Origin | Expected | Observed | Passed |
|---|---|---|---|---|
${checks.map((c) => `| ${c.dimension} | ${c.origin} | ${c.expected} | ${c.observed} | ${c.passed ? '✅' : '❌'} |`).join('\n')}`;

const md = `# Player-history 2024-from-2021-2023 threshold review (#139)

_Generated ${REPORT_DATE} • ${review.version}_

**Decision: \`${review.decision}\`**

Reviews the #137/PR #138 additional-validation metrics (squash commit \`86f5097\`) against the PR #132 acceptance framework and the prior #121/#122 promoted-source (2025-from-2022-2024) evidence. This is a review only: no validation was rerun, no threshold was amended, and no production behavior was bound.

## 1. Cited documents

- Threshold framework: \`${FRAMEWORK_REL}\` (PR #132) -- status \`${framework.status}\`, decision \`${framework.decision}\`
- Prior origin: \`${PRIOR_ORIGIN_REL}\` (#121/#122) -- decision \`${priorOrigin.decision}\`
- New origin: \`${NEW_ORIGIN_REL}\` (#137/PR #138) -- decision \`${newOrigin.decision}\`

## 2. Identity and boundary checks (${review.identity_checks.filter((c) => c.passed).length}/${review.identity_checks.length} passed)

${checksTable(review.identity_checks)}

## 3. Quantitative threshold components, evaluated per-origin (no averaging)

${review.component_checks.length > 0 ? checksTable(review.component_checks) : '_Not evaluated: identity checks failed._'}

## 4. Per-origin summary

${review.per_origin_summary.map((s) => `- **${s.origin_label}**: all components passed = **${s.all_components_passed}**`).join('\n') || '_Not evaluated: identity checks failed._'}

## 5. Decision

- **\`${review.decision}\`**
- ${review.decision_rationale}

## 6. Non-goals confirmed

- No validation was rerun; every metric cited above is read directly from the committed #121/#122 and #137 reports.
- No threshold was accepted, rejected, or amended.
- No production Forecast behavior was bound; nothing was wired into \`seasonalPprModel.ts\`.
- No production-path leakage audit was run; no human sign-off was recorded.
- No product/UI/rankings/advice/Fantasy behavior was authorized.
- No TIBER-Data change.
- ${review.decision === 'may_open_player_history_production_binding_review_issue' ? 'The positive decision authorizes only a separate production-binding review issue; it does not itself decide production readiness.' : 'No production-binding review issue is authorized by this result as recorded.'}

## 7. Next allowed step

${fullReport.next_allowed_step}

## Reproduce

\`\`\`bash
npm run review:player-history-2024-from-2021-2023-threshold   # deterministic, network-free
npm run build && npm test
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `threshold review complete: identity_passed=${review.identity_passed}, components_passed_both_origins=${review.components_passed_both_origins}\n` +
    `decision: ${review.decision}\n` +
    `  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
if (review.decision !== 'may_open_player_history_production_binding_review_issue') {
  process.exit(1);
}
