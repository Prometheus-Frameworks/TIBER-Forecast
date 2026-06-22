# Verifying the seasonal PPR backtest against a mounted TIBER-Data artifact

> **This is harness/loader verification, not a model-quality approval.** Running
> against a mounted artifact proves the ingestion → aggregation → backtest loop
> works on the real `player_weekly_ppr_outcomes_v1` shape. It does **not** approve
> the model for 2026 predictive use, and it does **not** upgrade governance.
> Governance stays `fixture` unless the artifact carries an explicit governed
> marker recognized by the loader (see below).

This guide covers how to point the existing seasonal PPR backtest at a mounted or
copied TIBER-Data artifact and how to confirm — from the report, PPM Studio, and
the model-context export — whether a run used the bundled scaffold or a real
artifact. It adds no model math, no features, and no downstream behavior.

## Canonical artifact path

PPM does not own or publish TIBER-Data's canonical paths; it only consumes an
artifact when one is mounted/provided. The expected promoted lane is:

```
exports/promoted/nfl/player_weekly_ppr_outcomes_v1.json
```

This path is **not** committed to PPM. Mount it (volume/copy) into the repo before
verifying. The path name alone never confers trust — see *Governance honesty*.

## Run the verification

Two equivalent entry points; both fail closed on a missing/malformed/conflicting
artifact and never synthesize data.

**Canonical-path alias** (defaults to the promoted lane above):

```bash
npm run verify:seasonal-ppr
```

**Explicit path** (any mounted/copied location):

```bash
npm run backtest:seasonal-ppr -- --ppr-artifact=/path/to/player_weekly_ppr_outcomes_v1.json
```

Add `--generated-at=<iso>` for byte-deterministic artifacts, and an optional
output directory (defaults to `data/backtests/seasonal-ppr/`).

The runner prints a `data source:` line and an explicit `verification:` verdict,
for example:

```
  data source:     mounted-artifact
  verification:    MOUNTED artifact, but governance is NOT governed — still fail-closed (fixture). Not approved for 2026 predictive use.
```

versus the bundled default:

```
  data source:     bundled-scaffold
  verification:    BUNDLED scaffold fixture — not a mounted TIBER-Data artifact. Not approved for 2026 predictive use.
```

## How scaffold vs mounted is recorded

The run is self-describing via a machine-readable `data_source` discriminator
(`bundled-scaffold` | `mounted-artifact`), in addition to the human-readable
provenance string. It surfaces in three places:

| Surface | Where |
| --- | --- |
| Report JSON | `dataset.data_source` (and a sentence in `dataset.provenance`) |
| PPM Studio | a `data source` chip + a *Data source* card; the not-approved banner names the source |
| Model-context export | `data_source` field on `/api/studio/seasonal-ppr/export/model-context` |

`data_source` is **provenance only** and is orthogonal to governance: a
`mounted-artifact` run is still `fixture` until an explicit governed marker is
present. The two fields are reported independently so neither can be inferred
from the other.

## Governance honesty (fail closed)

- Governance is **never** inferred from a path name or from `data_source`. Mounting
  the file at the canonical promoted path does **not** make it `governed`.
- `governed` is honored **only** when the loader receives an explicit marker
  (`{ status: 'governed', source: 'explicit_marker' }`). Any weaker claim is
  downgraded to `fixture`. The runner does not set this marker from the CLI, so a
  plain `--ppr-artifact` run stays `fixture` by design.
- Until a governed, verified artifact is mounted, every output remains labeled
  model inference / read-only / not advice / **not approved for 2026 predictive
  use** — in the report limitations, the export warning, and the Studio banners.

## Fail-closed cases (no artifact written)

The runner exits non-zero and writes nothing when the artifact is:

- **Missing** — unreadable path (e.g. the canonical path is not mounted).
- **Malformed** — not a row array / object envelope, or contains non-object rows.
- **Conflicting** — the same `season|week|player_id` appears with differing
  values (identical duplicates are collapsed with a warning).
- **Incomplete** — after validation, no usable rows remain, or too few rows with a
  usable 2025 actual outcome to fit the model.

Rows with a missing/invalid 2025 outcome are individually marked `unavailable`
(null prediction, excluded from metrics) rather than fabricated.

## PPM Studio compatibility

The generated `seasonal_ppr_backtest_report.json` and
`seasonal_ppr_predictions.jsonl` keep the same shape Studio already reads, plus
the additive `data_source` field. Inspect a verified run by pointing Studio at the
output directory:

```bash
PPM_STUDIO_ARTIFACT_DIR=data/backtests/seasonal-ppr npm run start:api
# then open /studio
```

See [seasonal-ppr-backtest.md](seasonal-ppr-backtest.md) for the full harness,
loader rules, and model/baseline details.
