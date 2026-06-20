# Point-scenario lab compatibility surface

> Status: compatibility / Data Lab surface. **Not** part of the primary scoring kernel.
> Tracking: Issue #43.

## Why this exists

`/api/scoring/*` and `/api/tiber/*` remain the **primary** scoring-first identity of this
repository. They are the supported path for player-level expected points, ranges,
confidence, replacement and VORP outputs.

Separately, TIBER-Fantasy's **Point Scenario Lab** adapter consumes a lab-style
compatibility payload. It expects either:

- `GET /api/point-scenarios/lab`, or
- a `point_scenario_lab.json` artifact (its offline fallback).

This document declares that contract and how PPM serves it.

## Route

```
GET /api/point-scenarios/lab
GET /api/point-scenarios/lab?season=2025
```

- The route composes the existing seeded scenario registry with the existing
  `projectBatch` projection service (`src/services/pointScenarioLab/buildPointScenarioLab.ts`).
  It adds **no scoring logic of its own** — every numeric value comes from the legacy
  projection output.
- Unlike other PPM routes, the response is **not** wrapped in the `{ ok, data }`
  envelope. It returns the canonical lab payload at the top level so TIBER-Fantasy's
  adapter can consume it directly.
- `season` is optional. Seeded scenarios are season-agnostic illustrative fixtures, so a
  requested season is echoed at the top level and stamped onto each row. Without a
  `season`, season fields are `null` and `available_seasons` is `[]`. Invalid seasons
  return `400`.

## Response shape

```jsonc
{
  "season": 2025 | null,
  "available_seasons": [2025],          // [] when season is unknown
  "rows": [
    {
      "scenario_id": "waddle-to-broncos",
      "scenario_name": "Jaylen Waddle traded to Denver",   // required, non-empty
      "player_id": "jaylen-waddle",
      "player_name": "Jaylen Waddle",                       // required, non-empty
      "team": "DEN",          // post-event team (consistent with adjusted_projection)
      "position": "WR",
      "season": 2025 | null,
      "week": 1 | null,
      "baseline_projection": 14.87,
      "adjusted_projection": 14.08,
      "delta": -0.79,
      "confidence_band": "HIGH",
      "confidence_label": "High confidence",
      "scenario_type": "trade",
      "event_type": "PLAYER_TRADE",
      "notes": ["..."],
      "explanation": "...",
      "provenance": {
        "provider": "point-prediction-model",
        "source_name": "scenario-export",
        "source_type": "compatibility_route",   // "data_lab_surface" for the artifact
        "model_version": "0.1.0",
        "generated_at": "2026-06-19T00:00:00.000Z",
        "source_metadata": { "surface": "point_scenario_lab", "derived_from": "legacy_scenario_projection", "...": "..." }
      },
      "raw_fields": { "...": "..." }
    }
  ],
  "source": {
    "provider": "point-prediction-model",
    "location": "/api/point-scenarios/lab",
    "mode": "api"          // "artifact" for the JSON export
  },
  "metadata": {
    "governanceStatus": "fixture",        // governed | fixture | ungoverned | unknown
    "governanceSource": "explicit_marker", // explicit_marker | path_inference | unknown
    "contractVersion": "point_scenario_lab_v1",
    "generatedAt": "2026-06-20T00:00:00.000Z",
    "promotionNotes": "Seeded illustrative point scenarios; fixture data, not governed."
    // optional: "promotedAt" (only when distinct from generatedAt and meaningful)
  }
}
```

Only `scenario_name` and `player_name` are strictly required per row (matching the
downstream adapter's canonical schema); all other fields are nullable/optional. The
field mapping from the legacy projection output is:

| Lab field             | Source (`ScenarioRunResult`)              |
| --------------------- | ----------------------------------------- |
| `scenario_id`         | `scenarioId`                              |
| `scenario_name`       | `scenarioTitle`                           |
| `player_id` / `player_name` / `position` | `player.{id,name,position}`    |
| `team`                | `currentTeam.team` (post-event roster)    |
| `week`                | `event.effectiveWeek`                     |
| `baseline_projection` | `baseline.pprPointsPerGame`               |
| `adjusted_projection` | `adjusted.pprPointsPerGame`               |
| `delta`               | `deltaPprPointsPerGame`                    |
| `confidence_band`     | `confidenceBand`                          |
| `event_type`          | `eventType`                               |
| `notes` / `explanation` | `explanation[]`                         |

## Dataset-level promotion metadata (`metadata`)

> Tracking: Issue #47.

In addition to per-row `provenance`, the canonical lab payload carries a single
**dataset-level** `metadata` block. This is the producer-owned surface a downstream
consumer (TIBER-Fantasy's shared promotion gate) reads to decide whether the dataset
may be promoted. It uses **camelCase** keys — matching the gate's expected field
names — intentionally distinct from the snake_case row/provenance keys.

| Field              | Type                                                   | Meaning |
| ------------------ | ------------------------------------------------------ | ------- |
| `governanceStatus` | `governed` \| `fixture` \| `ungoverned` \| `unknown`   | Dataset-level governance state. |
| `governanceSource` | `explicit_marker` \| `path_inference` \| `unknown`     | How the status was established. |
| `contractVersion`  | string literal (`point_scenario_lab_v1`)               | Stable dataset contract identifier. |
| `generatedAt`      | ISO-8601 string                                        | Dataset-level freshness timestamp. |
| `promotedAt`       | ISO-8601 string (optional)                             | Promotion time, only when distinct/meaningful. |
| `promotionNotes`   | string (optional)                                      | Non-advisory operator note. |

Rules the metadata enforces (PPM is the **producer**, so it fails closed):

- Row-level `provenance.model_version`, row-level `provenance.generated_at`, and
  `source.mode`/`source.provider` are **not** sufficient for promotion. A gate must
  read the dataset-level `metadata` block instead.
- `governanceStatus` is only reported as anything other than `unknown` when the
  producer asserts it with an **explicit marker**. Missing or unrecognized status
  collapses to `unknown` (`governanceSource: "unknown"`).
- Artifact/route **path inference** (e.g. a `/promoted/` segment) is a **weak hint
  only**. It is honored as `governanceSource: "path_inference"` solely when passed
  explicitly; it is never synthesized and never upgrades a status to `governed`.
- The seeded scenario registry is illustrative **fixture** data, so the route and the
  on-demand export are both stamped `governanceStatus: "fixture"` with an explicit
  marker — distinguishable from governed output and never promotable.
- `contractVersion` is the exact stable literal `point_scenario_lab_v1`
  (`POINT_SCENARIO_LAB_CONTRACT_VERSION`). It is distinct from the per-row
  `model_version` kernel stamp.

The `metadata` block is **additive**: existing top-level `rows`/`source` and per-row
`provenance` are unchanged and remain backward-compatible.

## Artifact export (`point_scenario_lab.json`)

`point_scenario_lab.json` is supported **only as an on-demand export**. It is **not**
auto-promoted and is not wired into `build`/`start`.

```bash
npm run export:point-scenario-lab                 # -> data/point-scenarios/point_scenario_lab.json
npm run export:point-scenario-lab -- ./out.json --season=2025
```

The export uses the same builder with `source.mode: "artifact"` (and provenance
`source_type: "data_lab_surface"`), so the file is a drop-in for TIBER-Fantasy's
artifact fallback path. It carries the same dataset-level `metadata` block as the
route (same `contractVersion`, an explicit `generatedAt`, and `governanceStatus:
"fixture"` for the seeded artifact).

`--season` is validated with the same rules as the route (integer, 2000–2100). An
invalid value fails closed: the CLI prints an error, exits non-zero, and writes no
file — it never falls back to a silently season-agnostic artifact. Omitting `--season`
still produces a season-agnostic export.

## Boundaries

- No Management activation. No advice/recommendation/start-sit/trade/waiver behavior.
- No changes to `/api/scoring/*`, `/api/tiber/*`, `/api/scenarios`, or
  `/api/project/scenarios`.
- No artifact auto-promotion. Management remains deferred until TIBER-Fantasy has a
  governed/fresh readiness surface around this compatibility contract.
