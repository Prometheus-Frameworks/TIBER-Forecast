# Deployment & inspection (PPM Studio)

This is the operator guide for inspecting **Point-Prediction-Model (PPM)** in a
deployed environment (e.g. Railway). It explains where the model studio lives,
how to read the seasonal PPR artifacts, and exactly what the deployed output is
and is not.

## What is deployed

PPM serves a JSON API plus a small, server-rendered **read-only** studio. The
root URL (`/`) returns an operator-friendly manifest that identifies the service
as Point-Prediction-Model (PPM) and links straight to the studio surfaces below.

> **Status of currently deployed artifacts.** Everything reachable here is:
>
> - **model inference**
> - **read-only**
> - **fixture/scaffold-backed**
> - **not observed reality**
> - **not advice**
> - **not approved for 2026 predictive use** unless a governed real TIBER-Data
>   artifact has been mounted and verified.
>
> Fixture/scaffold output is never production-approved. Governance status is
> `fixture` unless TIBER-Data supplies an explicit governed marker that has been
> verified — see [seasonal-ppr-backtest.md](seasonal-ppr-backtest.md).

## How to view the model studio

Open the deployment root and follow the `studio` links, or go directly to:

| Surface | Path | What it is |
| --- | --- | --- |
| Studio page | `GET /studio` | Server-rendered "glass box" over the latest seasonal PPR report and predictions. Labels output as model inference and, for fixture/scaffold data, as not approved for 2026 predictive use. |
| Report (JSON) | `GET /api/studio/seasonal-ppr/report` | Raw seasonal PPR backtest report. |
| Predictions (JSON) | `GET /api/studio/seasonal-ppr/predictions` | Parsed prediction rows (`{ count, predictions }`) from the JSONL artifact. |
| Explanations (JSON) | `GET /api/studio/seasonal-ppr/explanations` | Per-player model-mechanics explanation rows (additive artifact). Single player: `GET /api/studio/seasonal-ppr/explanations/:playerId`. |
| Player explanation (page) | `GET /studio?explain=<playerId>` | Server-rendered panel: how the ridge model combined a player's features (model mechanics, not causal football). |
| Model-context export (JSON) | `GET /api/studio/seasonal-ppr/export/model-context` | Compact, copy/paste-friendly export of the report for use in another tool, carrying the same model-inference / not-advice notice. |

If the artifacts are missing, every surface fails closed (HTTP 404) with
generation instructions instead of synthesizing data. To regenerate the
artifacts, run the backtest harness documented in
[seasonal-ppr-backtest.md](seasonal-ppr-backtest.md):

```bash
npm run backtest:seasonal-ppr
```

## Endpoint compatibility

The root manifest still lists the in-season fantasy scoring kernel endpoints
(`/api/scoring/*`, `/api/tiber/*`, legacy scenario routes, and the Point
Scenario Lab compatibility route). These are unchanged; only the root metadata
and documentation were reframed around PPM and the studio.
