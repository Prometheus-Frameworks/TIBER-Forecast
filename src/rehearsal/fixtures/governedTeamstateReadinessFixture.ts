/**
 * Representative governed Teamstate readiness report, mirroring the real
 * `team_week_raw_v0_governed_readiness` shape emitted by TIBER-Teamstate (PR #65).
 *
 * This is a fixture only: the numeric values are readiness/diagnostic counts
 * (`finiteCount`, `nullCount`, `rowCount`), never pressure feature values.
 * `pressureRateAllowed` is deferred (insufficient data) and `redZoneTdRate`
 * is a preserved partial-null field.
 */
export const fixtureGovernedTeamstateReadinessReport = {
  kind: 'team_week_raw_v0_governed_readiness',
  artifact: 'team_week_raw_v0',
  teamstateGovernedArtifact: true,
  productionReady: false,
  sourceArtifactPath: 'exports/governed/team_week_raw_v0/2024/team_week_raw_v0.jsonl',
  sourceArtifacts: ['exports/governed/team_week_raw_v0/2024/team_week_raw_v0.jsonl'],
  validationReportPath: 'exports/governed/team_week_raw_v0/2024/validation-report.json',
  lineageManifestPath: 'exports/governed/team_week_raw_v0/2024/lineage-manifest.json',
  provenanceStatus: 'governed_real_data',
  governance: {
    governanceStatus: 'governed',
    governanceSource: 'explicit_marker',
    notes: 'governed via explicit marker on team_week_raw_v0',
  },
  upstreamFieldReadiness: {
    source: 'team_week_raw_v0',
    rowCount: 544,
    teamCount: 32,
    weeks: '1-18',
  },
  rowCount: 544,
  pressurePosture: 'unavailable_insufficient_data_deferred',
  deferredFields: ['pressureRateAllowed'],
  coverage: { teamWeeks: 544, seasons: ['2024'] },
  readinessStatus: 'ready_minimal_boundary',
  fieldReadiness: [
    { field: 'teamWeekId', finiteCount: 544, nullCount: 0, status: 'available' },
    { field: 'redZoneTdRate', finiteCount: 412, nullCount: 132, status: 'partial_nulls' },
    { field: 'pressureRateAllowed', finiteCount: 0, nullCount: 544, status: 'deferred_insufficient_data' },
  ],
  availableFields: ['teamWeekId'],
  deferredInsufficientFields: ['pressureRateAllowed'],
  partialNullFields: ['redZoneTdRate'],
  notes: ['pressureRateAllowed deferred: insufficient finite coverage for a governed pressure feature'],
} as const;
