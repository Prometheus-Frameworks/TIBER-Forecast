/**
 * Server-rendered PPM Studio inspection page for the seasonal PPR backtest
 * (Issue #51). Dependency-light: a single self-contained HTML document with
 * inline CSS and CSS/SVG bars — no frontend stack, no client JS required.
 *
 * The page is a read-only "glass box" around PR #50's report/predictions. It
 * prominently labels everything as model inference (not observed reality, not
 * advice) and, for non-governed (fixture/scaffold) data, that it is not approved
 * for 2026 predictive use.
 */
import type {
  SeasonalPprBacktestReport,
  SeasonalPprErrorSummary,
  SeasonalPprPredictionRow,
} from '../contracts/seasonalPprBacktest.js';
import { seasonalPprFixtureWarningApplies } from './buildModelContextExport.js';
import { SEASONAL_PPR_GENERATE_COMMAND } from './loadSeasonalPprArtifacts.js';

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmt = (value: number | null | undefined, digits = 2): string =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0a0e1a; color: #e6e9f0; line-height: 1.5; }
  main { max-width: 1040px; margin: 0 auto; padding: 24px 20px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #93a0bf;
    margin: 32px 0 12px; border-bottom: 1px solid #1e2535; padding-bottom: 6px; }
  .sub { color: #93a0bf; font-size: 13px; margin: 0 0 16px; }
  .banner { border-radius: 8px; padding: 12px 14px; margin: 0 0 12px; font-size: 13px; font-weight: 600; }
  .banner-inference { background: #1a2236; border: 1px solid #2d3a5e; color: #c7d2f0; }
  .banner-warn { background: #2a1d10; border: 1px solid #6b4a1f; color: #f2c98a; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; }
  .chip { background: #141a2b; border: 1px solid #283251; border-radius: 999px;
    padding: 3px 10px; font-size: 12px; color: #aeb9d6; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .card { background: #121826; border: 1px solid #1e2535; border-radius: 8px; padding: 10px 12px; }
  .card .k { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #7e8aa8; }
  .card .v { font-size: 15px; font-weight: 600; margin-top: 2px; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #1a2233; }
  th { color: #93a0bf; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .bars { display: grid; gap: 6px; }
  .bar-row { display: grid; grid-template-columns: 190px 1fr 64px; align-items: center; gap: 10px; font-size: 13px; }
  .bar-label { color: #c7d2f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { background: #131a2a; border-radius: 4px; height: 16px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .bar-model { background: linear-gradient(90deg, #3b82f6, #8b5cf6); }
  .bar-baseline { background: #39507e; }
  .bar-pos { background: #2f6f57; }
  .bar-miss { background: #8a3b54; }
  .bar-val { text-align: right; color: #aeb9d6; font-variant-numeric: tabular-nums; }
  .tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; font-weight: 600; }
  .tag-inference { background: #1a2740; color: #8fb4ff; }
  .tag-unavailable { background: #3a2330; color: #f0a0b8; }
  ul.lim { padding-left: 18px; margin: 0; }
  ul.lim li { margin: 4px 0; color: #cdd5ea; font-size: 13px; }
  .links a { color: #8fb4ff; margin-right: 14px; font-size: 13px; }
  code { background: #131a2a; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
  footer { margin-top: 36px; color: #6b7693; font-size: 12px; }
`;

const card = (key: string, value: unknown): string =>
  `<div class="card"><div class="k">${escapeHtml(key)}</div><div class="v">${escapeHtml(value)}</div></div>`;

interface BarItem {
  label: string;
  value: number;
  variant: 'model' | 'baseline' | 'pos' | 'miss';
}

const renderBars = (items: BarItem[], digits = 2): string => {
  const max = Math.max(...items.map((item) => item.value), 0.0001);
  const rows = items
    .map((item) => {
      const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
      return `<div class="bar-row">
        <span class="bar-label">${escapeHtml(item.label)}</span>
        <span class="bar-track"><span class="bar-fill bar-${item.variant}" style="width:${pct.toFixed(1)}%"></span></span>
        <span class="bar-val">${fmt(item.value, digits)}</span>
      </div>`;
    })
    .join('');
  return `<div class="bars">${rows}</div>`;
};

const maeBars = (report: SeasonalPprBacktestReport): BarItem[] => [
  { label: `${report.model.name} (model)`, value: report.model.overall.mae, variant: 'model' },
  ...report.baselines.map((b) => ({ label: b.name, value: b.overall.mae, variant: 'baseline' as const })),
];

const rmseBars = (report: SeasonalPprBacktestReport): BarItem[] => [
  { label: `${report.model.name} (model)`, value: report.model.overall.rmse, variant: 'model' },
  ...report.baselines.map((b) => ({ label: b.name, value: b.overall.rmse, variant: 'baseline' as const })),
];

const byPositionMaeBars = (
  byPosition: Partial<Record<string, SeasonalPprErrorSummary>>,
): BarItem[] =>
  Object.entries(byPosition)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([position, summary]) => ({
      label: `${position} (n=${summary?.sample_size ?? 0})`,
      value: summary?.mae ?? 0,
      variant: 'pos' as const,
    }));

const topMissBars = (report: SeasonalPprBacktestReport): BarItem[] =>
  report.top_misses
    .slice(0, 10)
    .map((miss) => ({ label: `${miss.player_name} (${miss.position})`, value: miss.absolute_error, variant: 'miss' as const }));

const renderPredictionTable = (predictions: SeasonalPprPredictionRow[]): string => {
  if (predictions.length === 0) {
    return '<p class="sub">No prediction rows available.</p>';
  }
  // Show the most informative subset: largest absolute errors first, with
  // unavailable rows (null error) sorted last. Full set is at the export links.
  const ordered = [...predictions].sort((a, b) => {
    const ae = a.absolute_error ?? -1;
    const be = b.absolute_error ?? -1;
    return be - ae;
  });
  const shown = ordered.slice(0, 25);
  const rows = shown
    .map((row) => {
      const tagClass = row.governance_status === 'inference' ? 'tag-inference' : 'tag-unavailable';
      return `<tr>
        <td>${escapeHtml(row.player_name)}</td>
        <td>${escapeHtml(row.position)}</td>
        <td class="num">${fmt(row.predicted_ppr, 1)}</td>
        <td class="num">${fmt(row.actual_ppr, 1)}</td>
        <td class="num">${fmt(row.absolute_error, 1)}</td>
        <td>${escapeHtml(row.feature_coverage_status)}</td>
        <td><span class="tag ${tagClass}">${escapeHtml(row.governance_status)}</span></td>
      </tr>`;
    })
    .join('');
  return `<p class="sub">Showing ${shown.length} of ${predictions.length} rows (largest absolute error first).
      Full set: <a href="/api/studio/seasonal-ppr/predictions">predictions JSON</a>.</p>
    <table><thead><tr>
      <th>Player</th><th>Pos</th><th>Predicted PPR</th><th>Actual PPR</th><th>Abs error</th>
      <th>Feature coverage</th><th>Governance</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
};

const shell = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
  <body><main>${body}</main></body></html>`;

/** Renders the graceful "no artifact" page with generation instructions. */
export const renderStudioNotFound = (message: string): string =>
  shell(
    'PPM Studio — no artifact',
    `<h1>PPM Studio</h1>
     <div class="banner banner-warn">No seasonal PPR backtest artifact found.</div>
     <p class="sub">${escapeHtml(message)}</p>
     <p>Generate it by running:</p>
     <p><code>${escapeHtml(SEASONAL_PPR_GENERATE_COMMAND)}</code></p>
     <p class="sub">This page is a read-only inspection surface; it never synthesizes report data.</p>`,
  );

export const renderStudioPage = (
  report: SeasonalPprBacktestReport,
  predictions: SeasonalPprPredictionRow[],
): string => {
  const fixtureWarn = seasonalPprFixtureWarningApplies(report);
  // Fail closed on provenance: only the two known discriminator values are
  // asserted. A missing/unrecognized data_source (e.g. an older or externally
  // mounted report that predates this field) is labeled "unknown" rather than
  // silently claimed to be the bundled scaffold.
  const dataSource = report.dataset.data_source;
  const dataSourceChip =
    dataSource === 'mounted-artifact' || dataSource === 'bundled-scaffold' ? dataSource : 'unknown';
  const dataSourceLabel =
    dataSource === 'mounted-artifact'
      ? 'mounted TIBER-Data artifact'
      : dataSource === 'bundled-scaffold'
        ? 'bundled scaffold fixture'
        : 'unknown / unlabeled source';

  const warnBanner = fixtureWarn
    ? `<div class="banner banner-warn">NOT APPROVED FOR 2026 PREDICTIVE USE — dataset governance is
        "${escapeHtml(report.dataset.governance_status)}" (fixture/scaffold) with data source
        "${escapeHtml(dataSourceLabel)}", not a governed real TIBER-Data pull. Harness validation only.</div>`
    : '';

  const body = `
    <h1>PPM Studio — Seasonal PPR Backtest</h1>
    <p class="sub">Read-only inspection of ${escapeHtml(report.input_season)} → ${escapeHtml(report.target_season)} model-inference output.</p>

    <div class="banner banner-inference">MODEL INFERENCE · READ-ONLY · NOT OBSERVED REALITY · NOT ADVICE</div>
    ${warnBanner}

    <div class="chips">
      <span class="chip">output: ${escapeHtml(report.output_kind)}</span>
      <span class="chip">governance: ${escapeHtml(report.dataset.governance_status)}</span>
      <span class="chip">data source: ${escapeHtml(dataSourceChip)}</span>
      <span class="chip">model: ${escapeHtml(report.model_version)}</span>
      <span class="chip">report: ${escapeHtml(report.report_version)}</span>
    </div>

    <h2>Run metadata</h2>
    <div class="grid">
      ${card('Model version', report.model_version)}
      ${card('Report version', report.report_version)}
      ${card('Generated at', report.generated_at)}
      ${card('Input season', report.input_season)}
      ${card('Target season', report.target_season)}
      ${card('Output kind', report.output_kind)}
      ${card('Dataset', `${report.dataset.dataset_id}@${report.dataset.dataset_version}`)}
      ${card('Governance', report.dataset.governance_status)}
      ${card('Data source', dataSourceLabel)}
      ${card('Observations', report.dataset.observation_count)}
      ${card('Scored rows', report.dataset.scored_row_count)}
      ${card('Unavailable rows', report.dataset.unavailable_row_count)}
      ${card('Target', report.target_definition)}
    </div>

    <h2>Headline metrics</h2>
    <div class="grid">
      ${card('Model MAE', fmt(report.model.overall.mae))}
      ${card('Model RMSE', fmt(report.model.overall.rmse))}
      ${card('Correlation', fmt(report.model.overall.correlation))}
      ${card('Rank correlation', fmt(report.model.overall.rank_correlation))}
      ${card('Beats baseline', report.beats_baseline ? 'YES' : 'NO')}
    </div>
    <div class="banner banner-inference" style="font-weight:500">${escapeHtml(report.beats_baseline_summary)}</div>

    <h2>Model vs baseline — MAE</h2>
    ${renderBars(maeBars(report))}

    <h2>Model vs baseline — RMSE</h2>
    ${renderBars(rmseBars(report))}

    <h2>By-position MAE (model)</h2>
    ${renderBars(byPositionMaeBars(report.model.by_position))}

    <h2>Top misses by absolute error</h2>
    ${renderBars(topMissBars(report), 1)}

    <h2>Predictions</h2>
    ${renderPredictionTable(predictions)}

    <h2>Limitations</h2>
    <ul class="lim">${report.limitations.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>

    <h2>Export</h2>
    <p class="links">
      <a href="/api/studio/seasonal-ppr/report">report JSON</a>
      <a href="/api/studio/seasonal-ppr/predictions">predictions JSON</a>
      <a href="/api/studio/seasonal-ppr/export/model-context">AI-agent model context</a>
    </p>

    <footer>
      Read-only inspection surface (PPM Studio). Outputs are model inference, not observed reality, and not advice.
      ${fixtureWarn ? 'Fixture/scaffold data is not approved for 2026 predictive use.' : ''}
      Regenerate artifacts with <code>${escapeHtml(SEASONAL_PPR_GENERATE_COMMAND)}</code>.
    </footer>`;

  return shell('PPM Studio — Seasonal PPR Backtest', body);
};
