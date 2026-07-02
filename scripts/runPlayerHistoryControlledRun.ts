/**
 * Execute the isolated controlled player-history experiment (Forecast #111). Reproducible,
 * network-free, deterministic:
 *
 *   npm run experiment:player-history-controlled-run
 *
 * Fails closed unless every prior #109 gate passed (source re-verification, target-population gate,
 * mirror-overlap gate at may_authorize_run_issue, dry-run matrix at dry_run_only_not_model_ready with
 * the #107 floors still satisfied). Writes
 * docs/reports/player-history-controlled-run-2026-07-02.{json,md}.
 *
 * Every metric in the output is marked experimental_candidate_result_not_production_signal. No
 * production Forecast behavior changes, no feature binding, no promotion, no product/advice output.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  executeControlledRun,
  type ControlledRunMetrics,
  type ControlledRunPriorGateEvidence,
} from '../src/rehearsal/playerHistoryControlledRun.js';
import type {
  PlayerHistoryOutcomeMirror,
  PlayerHistoryRunPopulationInputMirror,
} from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-02';
const OUTCOME_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json';
const INPUT_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json';
const REVERIFY_REL = `docs/reports/player-history-source-gate-reverification-${REPORT_DATE}.json`;
const TP_GATE_REL = `docs/reports/player-history-target-population-gate-${REPORT_DATE}.json`;
const MATRIX_REL = `docs/reports/player-history-real-population-dry-run-matrix-${REPORT_DATE}.json`;
const OVERLAP_REL = `docs/reports/player-history-mirror-overlap-gate-${REPORT_DATE}.json`;
const REPORT_JSON_REL = `docs/reports/player-history-controlled-run-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-controlled-run-${REPORT_DATE}.md`;

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf-8')) as T;

const outcomeMirror = readJson<PlayerHistoryOutcomeMirror>(OUTCOME_MIRROR_REL);
const inputMirror = readJson<PlayerHistoryRunPopulationInputMirror>(INPUT_MIRROR_REL);
const reverify = readJson<{ decision: string }>(REVERIFY_REL);
const tpGate = readJson<{ gate_result: { decision: string } }>(TP_GATE_REL);
const matrixReport = readJson<{
  matrix_summary: {
    status: string;
    join_summary: { joined_rows: number; scored_target_rows: number };
    joined_rows_by_position: Record<string, number>;
  };
}>(MATRIX_REL);
const overlapGate = readJson<{ gate_result: { decision: string } }>(OVERLAP_REL);

const gates: ControlledRunPriorGateEvidence = {
  source_gate_reverification_decision: reverify.decision,
  target_population_gate_decision: tpGate.gate_result.decision,
  mirror_overlap_gate_decision: overlapGate.gate_result.decision,
  dry_run_matrix_status: matrixReport.matrix_summary.status,
  dry_run_joined_rows: matrixReport.matrix_summary.join_summary.joined_rows,
  dry_run_scored_target_rows: matrixReport.matrix_summary.join_summary.scored_target_rows,
  dry_run_joined_rows_by_position: matrixReport.matrix_summary.joined_rows_by_position,
};

const startedAt = Date.now();
const { report, predictions } = executeControlledRun(outcomeMirror, inputMirror, gates);
const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

const fullReport = {
  report_version: 'player-history-controlled-run-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#111',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  marking: report.marking,
  predecessor_refs: [
    'TIBER-Data#184-191',
    'TIBER-Forecast#99/#100', 'TIBER-Forecast#101/#102', 'TIBER-Forecast#103/#104',
    'TIBER-Forecast#105/#106', 'TIBER-Forecast#107/#108', 'TIBER-Forecast#109/#110',
  ],
  inputs: {
    outcome_mirror: { path: OUTCOME_MIRROR_REL, governed_source: outcomeMirror.governed_source },
    input_mirror: { path: INPUT_MIRROR_REL, governed_source: inputMirror.governed_source },
    prior_gates: {
      source_gate_reverification: { path: REVERIFY_REL, decision: gates.source_gate_reverification_decision },
      target_population_gate: { path: TP_GATE_REL, decision: gates.target_population_gate_decision },
      dry_run_matrix: { path: MATRIX_REL, status: gates.dry_run_matrix_status },
      mirror_overlap_gate: { path: OVERLAP_REL, decision: gates.mirror_overlap_gate_decision },
    },
  },
  baseline_choice_rationale:
    'baseline_only is the train-fold position mean of the 2025 outcome: reproducible on the real 610-player population without production rewiring, structurally unable to leak the held-out outcome, and consuming no player-history payloads. The old n=38 fixture backtest baseline was NOT reused as empirical truth for this population (per #107/#108 and the issue requirement).',
  null_handling_policy:
    'Nulls preserved end-to-end; per-fold imputation uses the #104 train-fold mean primitives fit on training rows only; standardization is train-fold-only z-scoring; real zeros are distinct from nulls in the mirrors and feature rows; no full-population statistics were fit; no null was silently coerced to zero outside the documented ridge-neutral train-fold fallback for fully-null training columns.',
  experiment: report,
  timing_seconds: Number(elapsedSeconds),
  next_allowed_step:
    'Open a follow-up review issue for this experimental result. No decision from this run authorizes production binding, seasonalPprModel.ts wiring, Data artifact promotion, or product output -- a positive candidate result requires its own review; a negative or inconclusive result stands as recorded.',
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const fmt = (value: number | null, digits = 3): string => (value === null ? 'n/a' : value.toFixed(digits));
const metricsRow = (label: string, metrics: ControlledRunMetrics): string =>
  `| ${label} | ${metrics.n} | ${fmt(metrics.mae)} | ${fmt(metrics.rmse)} | ${fmt(metrics.pearson)} | ${fmt(metrics.spearman)} |`;

const armLabels: Record<string, string> = {
  baseline_only: 'baseline_only',
  real_player_history_features: 'real_player_history',
  shuffled_player_history_control: 'shuffled_control',
};

const subgroupTable = (title: string, metrics: Record<string, ControlledRunMetrics>): string =>
  `### ${title}

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
${Object.entries(metrics).map(([arm, m]) => metricsRow(armLabels[arm] ?? arm, m)).join('\n')}`;

const e = report;
const md = `# Controlled player-history experiment (#111)

_Generated ${REPORT_DATE} • ${e.version} • **${e.marking}**_

**Decision: \`${e.decision.decision}\`**

This is an ISOLATED controlled experiment. The source artifact remains candidate evidence (not promoted); no production Forecast behavior changed; no feature binding occurred; no product-facing player-history signal is claimed; no fantasy advice/rankings/start-sit/trade/draft output was produced. Metrics below exist only inside this report.

## 1. Inputs and prior gates (all verified fail-closed before execution)

- Outcome mirror: \`${OUTCOME_MIRROR_REL}\` (sha256 \`${outcomeMirror.governed_source.sha256}\`, status \`${outcomeMirror.governed_source.artifactStatus}\`)
- Input mirror: \`${INPUT_MIRROR_REL}\` (2022-2024 REG only; no 2025 rows)
- Source-gate re-verification: \`${gates.source_gate_reverification_decision}\` • Target-population gate: \`${gates.target_population_gate_decision}\` • Dry-run matrix: \`${gates.dry_run_matrix_status}\` • Mirror-overlap gate: \`${gates.mirror_overlap_gate_decision}\`

## 2. Design

- Arms: ${e.arms.map((arm) => `\`${arm}\``).join(', ')}
- Validation: leave-one-out cross-validation, ${e.fold_design.folds} folds (fold order = sorted player_id; fully deterministic)
- Baseline: train-fold position mean (see JSON \`baseline_choice_rationale\`); consumes no player-history payloads
- Feature arms: ridge (lambda=${e.fold_design.ridge_lambda}, intercept unpenalized) on position dummies + has_history indicator + ${26} player-history columns across the 5 #104 families; train-fold-only imputation (the #104 primitives) and z-scoring
- Shuffled control: \`${e.fold_design.shuffle_method}\`, seed ${e.fold_design.shuffle_seed}
- Population: ${e.population.evaluated_rows} evaluated rows (${e.population.joined_rows} joined, ${e.population.no_history_rows} no-history); by position: ${Object.entries(e.population.by_position).sort().map(([p, n]) => `${p} ${n}`).join(', ')}
- Shuffled-control integrity: ${e.population.shuffled_control_integrity.donors_assigned} donors assigned, ${e.population.shuffled_control_integrity.self_donations} self-donations, ${e.population.shuffled_control_integrity.cross_position_donations} cross-position donations

## 3. Metrics by arm (experimental candidate results, NOT production signal)

${subgroupTable('Overall (n=' + e.population.evaluated_rows + ')', e.metrics_by_arm.overall)}

${subgroupTable('Joined only (primary comparison population, n=' + e.population.joined_rows + ')', e.metrics_by_arm.joined_only)}

${subgroupTable('No-history subgroup (n=' + e.population.no_history_rows + ')', e.metrics_by_arm.no_history_only)}

${Object.entries(e.metrics_by_arm.per_position).map(([position, metrics]) => subgroupTable(`Position ${position}`, metrics)).join('\n\n')}

Note on the per-position baseline correlations: within a single position, the leave-one-out position-mean prediction is a deterministic decreasing function of the held-out player's own outcome (a higher own outcome lowers the everyone-else mean), so its within-position Pearson/Spearman is exactly -1. This is a well-known LOOCV artifact of a group-mean baseline evaluated inside its own group, not a bug; MAE/RMSE are the primary comparison metrics, and the pooled (overall/joined) correlations are unaffected because they span positions.

## 4. Pairwise comparisons (MAE delta = second arm minus first; positive favors the first arm)

| Comparison | Subgroup | MAE delta | RMSE delta | Better on MAE |
|---|---|---|---|---|
${e.comparisons.map((c) => `| ${c.comparison} | ${c.subgroup} | ${fmt(c.mae_delta)} | ${fmt(c.rmse_delta)} | ${c.better_on_mae} |`).join('\n')}

## 5. Decision

- **\`${e.decision.decision}\`**
- Primary metric: ${e.decision.primary_metric} • real beats baseline: **${e.decision.real_beats_baseline_on_primary}** • real beats shuffled: **${e.decision.real_beats_shuffled_on_primary}** • real beats shuffled on secondary (${e.decision.secondary_metric}): **${e.decision.real_beats_shuffled_on_secondary}**
- ${e.decision.rationale}

## 6. Non-goals confirmed

- No production Forecast behavior was modified; nothing was wired into \`seasonalPprModel.ts\`; the production baseline is unchanged.
- No product routes or UI surfaces were added; no fantasy advice, rankings, start/sit, trade, or draft output was produced.
- No TIBER-Data or Teamstate change; no Data artifact promotion (the source remains \`candidate_evidence_artifact_not_promoted\`).
- No 2025 player-season summary was consumed as a 2025 input feature; no availability/ownership status was inferred.
- No null was coerced to zero outside the documented train-fold imputation policy.
- No production signal is claimed. ${e.decision.decision === 'candidate_player_history_signal_observed_requires_followup' ? 'The candidate result requires its own follow-up review issue before anything further.' : ''}

## 7. Next allowed step

${fullReport.next_allowed_step}

## Reproduce

\`\`\`bash
npm run experiment:player-history-controlled-run   # deterministic, network-free (~${elapsedSeconds}s)
npm run build && npm test
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

const joined = report.metrics_by_arm.joined_only;
process.stderr.write(
  `controlled run complete in ${elapsedSeconds}s: ${predictions.length} LOOCV folds\n` +
    `joined-population MAE -- baseline: ${fmt(joined.baseline_only.mae)}, real: ${fmt(joined.real_player_history_features.mae)}, shuffled: ${fmt(joined.shuffled_player_history_control.mae)}\n` +
    `decision: ${report.decision.decision}\n` +
    `  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
