# Forecast lane: naming, framing, and backwards-compatibility policy

> **Status:** naming/framing convention (docs/spec). This document defines the
> preferred vocabulary for the seasonal fantasy-point modeling lane and the
> backwards-compatibility rules that keep existing scripts, code identifiers, and
> the npm package name working unchanged. It changes *language*, not behavior.
> (The GitHub repository has since been renamed to `TIBER-Forecast`; see the
> [Backwards-compatibility policy](#backwards-compatibility-policy).)

## Why this exists

The seasonal lane historically used **prediction** language and the shorthand
**PPM / Point Prediction Model**. That framing overstates what the model does:
it does not *predict* a known truth, it produces an uncertain **forecast** of a
future outcome from the information available at a cutoff. Issue #62 moves the
lane toward honest forecasting vocabulary while preserving every working surface.

This is deliberately a vocabulary and documentation change. It does **not** break
scripts, rename code symbols, or change the npm package name or artifact fields
(see [Backwards-compatibility policy](#backwards-compatibility-policy)).

## Preferred names

| Use this | For | Notes |
| --- | --- | --- |
| **Forecast** | The act/output of the lane | Replaces "prediction" in prose. A forecast is an estimate with uncertainty, not a claim of truth. |
| **Fantasy Point Forecast** | The product concept / seasonal PPR forecast | The lane forecasts a fantasy-point outcome (e.g. full-season PPR), with a range, not a single deterministic point of truth. |
| **Forecast Lab** | The inspection/reporting surface | The "glass box" surface currently called *PPM Studio*. Preferred name for new UI/report work. |
| **Forecast run** | One end-to-end execution | A run has an ID, a cutoff, inputs, and metrics (see [run-manifest-spec.md](run-manifest-spec.md)). |
| **forecast cutoff** | The temporal boundary | All inputs to a run must be valid as of this cutoff — no future leakage. |

## Term mapping (old → preferred)

| Legacy term | Preferred term in new prose |
| --- | --- |
| prediction / predict / predicted value | forecast / produce a forecast / forecast value |
| Point Prediction Model | Fantasy Point Forecast lane (Forecast lane) |
| PPM | Forecast lane (PPM retained only as legacy/internal shorthand) |
| PPM Studio | Forecast Lab (inspection surface) |
| "the model knows / the model predicts the real outcome" | "the model forecasts an uncertain outcome from inputs available at the cutoff" |

> Field names in JSON artifacts (e.g. `predicted_ppr`, `output_kind:
> "model-inference"`) are **data contracts**, not prose, and are **not** renamed
> here — see the policy below. New artifacts and UI copy should prefer the
> forecast vocabulary.

## Language guidance (anti-determinism)

New and edited prose should:

- Frame outputs as **forecasts with uncertainty** (range / floor–median–ceiling /
  confidence band), never as known truth.
- Say the model "forecasts," "estimates," or "projects," not "knows" or "predicts
  reality."
- Keep every output labeled as **model inference, not observed reality** — the
  existing `output_kind: "model-inference"` stamp and the "MODEL INFERENCE, not
  observed reality" banners stay.
- Avoid any **fantasy advice / product** phrasing (start/sit/trade/draft/waiver).
  This lane is model-evaluation and reporting only.
- Describe run-to-run differences as **movement** ("the forecast moved because…"),
  not as a correction toward a known answer.

## Backwards-compatibility policy

This change is safe because it does not touch any executable or contracted
surface:

1. **GitHub repository renamed (out-of-band).** The repository has since been
   renamed to `Prometheus-Frameworks/TIBER-Forecast`; GitHub redirects the old
   `point-prediction-model` path. That was a separate operational change — the
   npm package name (`point-prediction-model`), scripts, code symbols, and
   artifact fields below are still unchanged.
2. **No script removal or rename.** Existing npm scripts
   (`backtest:seasonal-ppr`, `verify:seasonal-ppr`, …) keep working. Forecast-named
   **aliases** may be **added** alongside them (e.g. `forecast:seasonal-ppr` →
   the same command); the original names remain valid indefinitely.
3. **No code-symbol or file renames.** Module paths, exported types, function
   names, and route paths (`/studio`, `/api/studio/*`) are unchanged. Renaming
   them is out of scope and would risk integrations.
4. **No artifact field renames.** Existing JSON/JSONL field names
   (`predicted_ppr`, `seasonal_ppr_predictions.jsonl`, etc.) are data contracts
   and stay. New artifacts and reports should adopt forecast vocabulary from the
   start.
5. **Legacy shorthand may remain.** "PPM" / "PPM Studio" references may stay where
   a rename is risky, as long as they are understood as legacy/internal shorthand
   for the Forecast lane / Forecast Lab. This document is the canonical mapping.

## Scope of the wider rename (proposed, not applied here)

A full prose sweep across all 30+ docs is intentionally **not** done in this PR —
it would be a large, hard-to-review diff that mixes naming with unrelated content.
Instead:

- This PR establishes the convention (this file), introduces the framing in the
  README, and adds the additive `forecast:seasonal-ppr` alias.
- Subsequent small PRs can migrate individual docs/UI copy to forecast vocabulary,
  one surface at a time, citing this document — each remaining mechanical and
  reviewable.

## Related specs

- [Run 2 TTS feature contract](run2-tts-feature-contract.md) — what Forecast wants
  from Teamstate/TTS before a Run 2 experiment, and the governance/cutoff gates.
- [Run manifest & run-to-run visibility spec](run-manifest-spec.md) — making
  "what the model saw / what the forecast is / why it moved / what changed" a
  first-class reporting requirement.
- [Seasonal PPR backtest](seasonal-ppr-backtest.md) — the current lane
  implementation (the baseline / "Run 1").
