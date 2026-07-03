/**
 * Run the bounded robustness checks for the candidate player-history signal (Forecast #115).
 * Reproducible, network-free, deterministic:
 *
 *   npm run experiment:player-history-robustness
 *
 * Reuses the #112 fail-closed preflight (all prior gate decisions + mirror consistency + provenance)
 * before anything executes. Writes docs/reports/player-history-robustness-checks-2026-07-03.{json,md}.
 * #112 remains the primary recorded controlled run; these are review-only diagnostics marked
 * experimental_candidate_result_not_production_signal.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ControlledRunMetrics, ControlledRunPriorGateEvidence } from '../src/rehearsal/playerHistoryControlledRun.js';
import { runPlayerHistoryRobustnessChecks } from '../src/rehearsal/playerHistoryRobustnessChecks.js';
import type {
  PlayerHistoryOutcomeMirror,
  PlayerHistoryRunPopulationInputMirror,
} from '../src/rehearsal/playerHistoryRunPopulationMirrors.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DATE = '2026-07-03';
const GATE_DATE = '2026-07-02';
const OUTCOME_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2025.outcome_mirror.json';
const INPUT_MIRROR_REL = 'data/fixtures/tiberData/player_season_coverage_v0_2022_2024.real_population_input_mirror.json';
const REVERIFY_REL = `docs/reports/player-history-source-gate-reverification-${GATE_DATE}.json`;
const TP_GATE_REL = `docs/reports/player-history-target-population-gate-${GATE_DATE}.json`;
const MATRIX_REL = `docs/reports/player-history-real-population-dry-run-matrix-${GATE_DATE}.json`;
const OVERLAP_REL = `docs/reports/player-history-mirror-overlap-gate-${GATE_DATE}.json`;
const REPORT_JSON_REL = `docs/reports/player-history-robustness-checks-${REPORT_DATE}.json`;
const REPORT_MD_REL = `docs/reports/player-history-robustness-checks-${REPORT_DATE}.md`;

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

const report = runPlayerHistoryRobustnessChecks(outcomeMirror, inputMirror, gates);

const fullReport = {
  report_version: 'player-history-robustness-checks-report-v1',
  repo: 'Prometheus-Frameworks/TIBER-Forecast',
  issue: 'TIBER-Forecast#115',
  generated_at: `${REPORT_DATE}T00:00:00.000Z`,
  marking: report.marking,
  predecessor_refs: [
    'TIBER-Data#184-191',
    'TIBER-Forecast#99/#100', 'TIBER-Forecast#101/#102', 'TIBER-Forecast#103/#104',
    'TIBER-Forecast#105/#106', 'TIBER-Forecast#107/#108', 'TIBER-Forecast#109/#110',
    'TIBER-Forecast#111/#112', 'TIBER-Forecast#113/#114',
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
    preflight: 'assertControlledRunPreconditions reused verbatim from #112; the run refuses to execute on any violation',
  },
  robustness: report,
  next_recommended_issue:
    report.decision.decision === 'candidate_signal_survives_initial_robustness_checks'
      ? 'TIBER-Data: promote player_season_coverage_v0 after source-backed governance review (per the #114 section-4 sketch) -- the signal survived the bounded checks, so upstream governance is now the blocking prerequisite for any binding path.'
      : report.decision.decision === 'candidate_signal_weakened_requires_more_review'
        ? 'Forecast: review weakened player-history attribution (decide whether the simple prior-year comparator should replace the broader feature set as the candidate, or whether targeted feature work is justified) -- do not open a promotion or binding issue on the current evidence.'
        : 'Record the negative/invalid result; the binding path stops here unless a later review reopens it.',
};

writeFileSync(path.join(REPO_ROOT, REPORT_JSON_REL), `${JSON.stringify(fullReport, null, 2)}\n`, 'utf-8');

const fmt = (value: number | null, digits = 3): string => (value === null ? 'n/a' : value.toFixed(digits));
const metricsCells = (metrics: ControlledRunMetrics): string =>
  `${metrics.n} | ${fmt(metrics.mae)} | ${fmt(metrics.rmse)} | ${fmt(metrics.pearson)} | ${fmt(metrics.spearman)}`;

const r = report;
const md = `# Player-history robustness checks (#115)

_Generated ${REPORT_DATE} • ${r.version} • **${r.marking}**_

**Classification: \`${r.decision.decision}\`**

Review-only robustness diagnostics for the #112 candidate signal, per the #113/#114 prioritization. **#112 remains the primary recorded controlled run** — nothing here replaces or mutates it. Same isolated experiment path, same fail-closed preflight (reused \`assertControlledRunPreconditions\`), same mirrors (candidate/not-promoted, pinned sha \`${outcomeMirror.governed_source.sha256.slice(0, 12)}…\`). No production behavior change, no binding, no promotion, no production signal claim, no advice/product output.

Population: ${r.population.evaluated_rows} evaluated rows (${r.population.joined_rows} joined, ${r.population.no_history_rows} no-history). Reference joined-population MAE: baseline ${fmt(r.reference_joined_mae.baseline_only)}, full real ${fmt(r.reference_joined_mae.full_real)}.

## P1 — Feature-family ablation (real arm, joined population)

| Variant | columns | n | MAE | RMSE | Pearson | Spearman | MAE gain vs baseline | MAE gain vs shuffled |
|---|---|---|---|---|---|---|---|---|
${r.p1_feature_family_ablation.map((entry) => `| ${entry.variant} | ${entry.history_columns_used.length} | ${metricsCells(entry.real_arm.joined)} | ${fmt(entry.joined_mae_vs_baseline_delta)} | ${fmt(entry.joined_mae_vs_shuffled_delta)} |`).join('\n')}

Per-position MAE (real arm): ${r.p1_feature_family_ablation.map((entry) => `${entry.variant}: {${Object.entries(entry.real_arm.per_position_mae).map(([position, mae]) => `${position} ${fmt(mae, 1)}`).join(', ')}}`).join(' • ')}

No-history subgroup MAE (real arm): ${r.p1_feature_family_ablation.map((entry) => `${entry.variant} ${fmt(entry.real_arm.no_history.mae, 1)}`).join(' • ')}

Overall MAE/RMSE (real arm): ${r.p1_feature_family_ablation.map((entry) => `${entry.variant} ${fmt(entry.real_arm.overall.mae, 1)}/${fmt(entry.real_arm.overall.rmse, 1)}`).join(' • ')}

**${r.p1_attribution_note}**

## P2 — Stronger simple baseline: per-position train-fold OLS on prior-year PPR

| View | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| joined | ${metricsCells(r.p2_prior_year_position_baseline.view.joined)} |
| overall | ${metricsCells(r.p2_prior_year_position_baseline.view.overall)} |
| no-history | ${metricsCells(r.p2_prior_year_position_baseline.view.no_history)} |

- MAE gain vs position-mean baseline: ${fmt(r.p2_prior_year_position_baseline.joined_mae_vs_position_mean_baseline)}
- MAE gap vs full real arm (positive = full better): ${fmt(r.p2_prior_year_position_baseline.joined_mae_vs_full_real)}
- MAE gap vs ppr_2024-alone ridge (positive = ridge better): ${fmt(r.p2_prior_year_position_baseline.joined_mae_vs_ppr_2024_alone)}

## P3 — Ridge λ sensitivity (full feature set, joined population)

| λ | n | MAE | RMSE | Pearson | Spearman | beats baseline |
|---|---|---|---|---|---|---|
${r.p3_lambda_sensitivity.map((entry) => `| ${entry.lambda} | ${metricsCells(entry.real_joined)} | ${entry.real_beats_baseline_on_joined_mae} |`).join('\n')}

## P4 — Repeated shuffled-control seeds (joined population)

| Seed | original | n | MAE | RMSE | Pearson | Spearman | donors | self | cross-pos |
|---|---|---|---|---|---|---|---|---|---|
${r.p4_shuffled_seeds.map((entry) => `| ${entry.seed} | ${entry.is_original_112_seed} | ${metricsCells(entry.shuffled_joined)} | ${entry.donors_assigned} | ${entry.self_donations} | ${entry.cross_position_donations} |`).join('\n')}

Per-position shuffled MAE by seed: ${r.p4_shuffled_seeds.map((entry) => `${entry.seed}: {${Object.entries(entry.per_position_mae).map(([position, mae]) => `${position} ${fmt(mae, 1)}`).join(', ')}}`).join(' • ')}

## P5 — Outlier / partial-season leverage sensitivity

Top-${r.p5_leverage_sensitivity.top_k_excluded} absolute-error rows excluded per arm (joined population; **primary #112 metrics untouched**):

| Arm | n | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|
| baseline_only | ${metricsCells(r.p5_leverage_sensitivity.trimmed_joined.baseline_only)} |
| real_player_history | ${metricsCells(r.p5_leverage_sensitivity.trimmed_joined.real_player_history_features)} |
| shuffled_control | ${metricsCells(r.p5_leverage_sensitivity.trimmed_joined.shuffled_player_history_control)} |

- Real still beats baseline after trim: **${r.p5_leverage_sensitivity.real_still_beats_baseline_after_trim}**
- Partial-season sensitivity: **not computed** — ${r.p5_leverage_sensitivity.partial_season_sensitivity.reason}. Minimal source change: ${r.p5_leverage_sensitivity.partial_season_sensitivity.minimal_source_change_recommendation}.

## Classification

**\`${r.decision.decision}\`** (pre-registered weakened margin: ${r.decision.weakened_margin * 100}%)

| Criterion | Result | Detail |
|---|---|---|
${r.decision.checks.map((check) => `| ${check.criterion} | ${check.passed ? 'pass' : 'FAIL'} | ${check.detail} |`).join('\n')}

${r.decision.rationale}

## Non-goals confirmed

- These are robustness diagnostics only; #112 remains the primary recorded controlled run.
- No production Forecast behavior changed; nothing was wired into \`seasonalPprModel.ts\`; the production baseline is unchanged.
- No feature binding occurred; no product routes/UI; no fantasy advice, rankings, start/sit, trade, or draft output.
- No source artifact was promoted; the source remains \`candidate_evidence_artifact_not_promoted\`; no TIBER-Data/Teamstate change.
- No production signal is claimed.

## Next recommended issue

${fullReport.next_recommended_issue}

## Reproduce

\`\`\`bash
npm run experiment:player-history-robustness   # deterministic, network-free
npm run build && npm test
\`\`\`
`;

writeFileSync(path.join(REPO_ROOT, REPORT_MD_REL), md, 'utf-8');

process.stderr.write(
  `robustness checks complete: decision ${r.decision.decision}\n` +
    `joined MAE -- baseline ${fmt(r.reference_joined_mae.baseline_only)}, full ${fmt(r.reference_joined_mae.full_real)}, ppr_2024-alone ${fmt(r.reference_joined_mae.ppr_2024_alone)}, prior-year OLS ${fmt(r.reference_joined_mae.prior_year_position_baseline)}\n` +
    `shuffled seeds MAE: ${Object.values(r.reference_joined_mae.shuffled_by_seed).map((mae) => fmt(mae, 2)).join(', ')}\n` +
    `  wrote ${REPORT_JSON_REL}\n  wrote ${REPORT_MD_REL}\n`,
);
