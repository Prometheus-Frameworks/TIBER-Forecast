# Integration guide

This repo now exposes a small programmatic service layer for downstream TypeScript consumers that want to reuse the existing ingestion and projection pipeline without shelling out to the CLI.

## Public entrypoint

Import from the public module:

```ts
import {
  ingestRawEvents,
  buildScenarios,
  buildFeatureRowService,
  buildFeatureBatchService,
  projectScenario,
  projectBatch,
  projectFromRawEvents,
} from 'point-prediction-model';
```

If you are consuming the repo directly from source in a monorepo, the equivalent source import is:

```ts
import {
  ingestRawEvents,
  buildScenarios,
  buildFeatureRowService,
  buildFeatureBatchService,
  projectScenario,
  projectBatch,
  projectFromRawEvents,
} from '../TIBER-Forecast/src/public/index.js';
```

## Result envelope

Every public service returns a typed envelope instead of throwing where practical:

```ts
interface ServiceResult<T> {
  ok: boolean;
  warnings: Array<{ code: string; message: string; details?: unknown }>;
  errors: Array<{ code: string; message: string; details?: unknown }>;
  data?: T;
}
```

- `ok: true` means `data` is present.
- `ok: false` means `errors` contains structured validation or pipeline failures.
- `warnings` surfaces non-fatal conditions such as deduplicated raw events.

## Example: raw events input

```ts
import { ingestRawEvents } from 'point-prediction-model';
import type { RawEvent } from 'point-prediction-model';

const rawEvents: RawEvent[] = [
  {
    id: 'raw-trade-1',
    source: 'Newswire Alpha',
    eventType: 'TRADE',
    headline: 'Jaylen Waddle traded to Denver',
    reportedAt: '2026-03-10T12:00:00Z',
    subjectPlayerName: 'Jaylen Waddle',
    subjectTeam: 'MIA',
    subjectPosition: 'WR',
    fromTeam: 'MIA',
    toTeam: 'DEN',
  },
];

const ingestResult = ingestRawEvents(rawEvents);
if (!ingestResult.ok) {
  console.error(ingestResult.errors);
} else {
  console.log(ingestResult.data.normalizedEvents);
}
```

## Example: scenario input

```ts
import { projectScenario, projectBatch } from 'point-prediction-model';
import type { ProjectionScenario } from 'point-prediction-model';

const scenario: ProjectionScenario = {
  metadata: {
    id: 'sample-wr-new-signing',
    title: 'Veteran WR navigates a new signing',
    description: 'A sample WR scenario loaded from JSON.',
  },
  player: {
    id: 'drake-london',
    name: 'Drake London',
    position: 'WR',
    team: 'ATL',
    sampleSizeGames: 17,
    routesPerGame: 35,
    targetsPerRouteRun: 0.27,
    catchRate: 0.65,
    yardsPerTarget: 8.9,
    tdPerTarget: 0.07,
    rushPointsPerGame: 0.1,
  },
  previousTeamContext: {
    team: 'ATL',
    quarterback: 'Kirk Cousins',
    targetCompetitionIndex: 72,
    qbEfficiencyIndex: 102,
    passTdEnvironmentIndex: 101,
    playVolumeIndex: 100,
    passRateIndex: 99,
  },
  newTeamContext: {
    team: 'ATL',
    quarterback: 'Kirk Cousins',
    targetCompetitionIndex: 81,
    qbEfficiencyIndex: 101,
    passTdEnvironmentIndex: 100,
    playVolumeIndex: 100,
    passRateIndex: 98,
  },
  event: {
    type: 'PLAYER_SIGNING',
    description: 'Atlanta signs another proven target earner.',
    effectiveWeek: 1,
    severity: 5,
    clarity: 0.84,
  },
};

const singleResult = projectScenario(scenario);
const batchResult = projectBatch([scenario]);
```

## Example: full pipeline output

```ts
import { projectFromRawEvents } from 'point-prediction-model';

const pipelineResult = projectFromRawEvents(rawEvents);

if (pipelineResult.ok) {
  console.log({
    normalizedEvents: pipelineResult.data.normalizedEvents,
    scenarios: pipelineResult.data.scenarios,
    projections: pipelineResult.data.results,
  });
}
```

## Example: error handling

```ts
const result = projectFromRawEvents([{ id: '', source: 'Broken input' } as never]);

if (!result.ok) {
  for (const error of result.errors) {
    console.error(error.code, error.message, error.details);
  }
}
```

## CLI relationship

The CLI still supports JSON and CSV file ingestion plus seeded scenario execution, but those file-based workflows now resolve inputs and then delegate the actual pipeline work to the same service-layer functions documented above.

## Example: feature row generation

```ts
import { buildFeatureRowService } from 'point-prediction-model';
import { sampleFeatureInputs } from 'point-prediction-model';

const featureResult = buildFeatureRowService(sampleFeatureInputs.stableVeteranWr);

if (featureResult.ok) {
  console.log(featureResult.data.row);
}
```

Feature rows use the flat `WrTeFeatureRow` contract documented in `docs/feature-schema.md`, which is intended to stay stable across both training and inference workflows.
