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

## Artifact export (`point_scenario_lab.json`)

`point_scenario_lab.json` is supported **only as an on-demand export**. It is **not**
auto-promoted and is not wired into `build`/`start`.

```bash
npm run export:point-scenario-lab                 # -> data/point-scenarios/point_scenario_lab.json
npm run export:point-scenario-lab -- ./out.json --season=2025
```

The export uses the same builder with `source.mode: "artifact"` (and provenance
`source_type: "data_lab_surface"`), so the file is a drop-in for TIBER-Fantasy's
artifact fallback path.

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
