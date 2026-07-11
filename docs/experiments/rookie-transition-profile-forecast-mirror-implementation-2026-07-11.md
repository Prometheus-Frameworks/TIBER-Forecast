# Inert Forecast mirror implementation: rookie_transition_profile_v0.2.0 (Forecast #151)

**Status:** implementation complete, inert. This mirror performs no transformation, filtering,
normalization, adapter, feature extraction, experiment, model import, or production binding.

**Implements exactly:**
[`rookie-transition-profile-forecast-consumption-design-2026-07-11.md`](rookie-transition-profile-forecast-consumption-design-2026-07-11.md) /
[`.json`](rookie-transition-profile-forecast-consumption-design-2026-07-11.json), approved in
TIBER-Forecast#149 / PR#150 (merge `6c68b1691476f0d26f1b0270e32c199a3ee2f436`).

## Forecast base

- **Base branch/commit:** `main` at `6c68b1691476f0d26f1b0270e32c199a3ee2f436` (the design PR's own
  merge commit).

## Upstream source lock

| | Value |
| --- | --- |
| Repo | `Prometheus-Frameworks/TIBER-Rookies` |
| Commit | `2ef92faf9a9c91a393f53e9140428451529a1c48` |
| Promoted path | `exports/promoted/rookie-transition-profile/` |
| Schema version | `rookie-transition-profile-v0.2.0` |
| Season | `2026` |
| `generated_at` | `2026-07-10T12:00:00+00:00` |
| `run_id` | `rookie-transition-profile-2026-2026-07-10T12:00:00+00:00` |
| Row count | `48` |
| Coverage summary | `players_total: 48, players_with_draft_capital: 48, players_with_age_at_entry: 47, players_with_athletic_testing: 32, players_with_college_production: 48, players_with_official_postdraft_outcome: 48, players_with_all_families: 32` |

**Artifact hashes** (verified, not assumed, against the real local TIBER-Rookies checkout pinned at
the commit above):

| File | SHA-256 |
| --- | --- |
| `2026_rookie_transition_profile_v0.json` | `c95b941c7855612daccfc2226fc51e0e34dbb2ebe8a2487596675d2522a22f37` |
| `2026_rookie_transition_profile_v0.csv` | `3005bcd6ad4ffc87a312c6926e20c5e3658747012855aa9d8ccfa33d898545e6` |
| `2026_manifest.json` | `0acf361c6d2d8cc6f684026481a5aa279e9f7fa718256fad78da0366d5804413` |

**Source-manifest input hashes** (the six upstream files TIBER-Rookies' own manifest hash-locks,
independently re-verified against the actual bytes at the pinned commit):

| Path | SHA-256 |
| --- | --- |
| `exports/promoted/rookie-alpha/2026_rookie_alpha_predraft_v0.json` | `5a7c6c945ad477c1a54e61e7337e9f5bd6b5e69455669ca4700d7668fe9816e3` |
| `data/processed/2026_draft_capital_proxy.json` | `5622f5ab86d8db812a3c98fd67b74960943d687fa323f7e9592533f8d058738f` |
| `data/processed/2026_college_production.json` | `c4c15efd609fef982e417817148b1b7bc090f53896791eb2cb85cf1bf665fb0d` |
| `data/processed/2026_prospect_context.json` | `bdf16633076bb5fb28e9451028fc476fadf6ff727dc06bdb106eb026e741de0e` |
| `data/processed/2026_draft_results.json` | `ae6b037845f5b6bcd87e17185d1086a3de1cf6a915571f3da1d5d716965f01bd` |
| `data/processed/2026_day3_udfa_draft_result_profiles.json` | `1f9b3a3c592bbc94f42c3d361461372b104f3f320fa9d11ebc5bcdb6511822ec` |

## What was implemented

1. **`src/rehearsal/rookieTransitionProfileMirror.ts`** — pure module (no I/O). Pins the full source
   lock above as exported constants; exports `refreshRookieTransitionProfileMirror()`, which takes
   the upstream JSON/CSV/manifest bytes, the six source-manifest input-file bytes, the caller-resolved
   source repo/commit identity, and an operator-supplied `mirrorRefreshedAt`, runs 26 fail-closed
   checks (repository identity, commit, three artifact hashes, six input-file hashes, input-path
   completeness, manifest self-consistency, schema version, season, `generated_at`, `run_id`,
   coverage summary, row count/uniqueness, drafted/UDFA counts, and the exact
   `te-daequan-wright` UDFA shape), and — only if every check passes — assembles the four mirror
   artifacts (three byte-identical echoes of the verified upstream bytes plus the Forecast-owned
   provenance wrapper).
2. **`scripts/refreshRookieTransitionProfileMirror.ts`** — the I/O-performing CLI. Resolves the
   source repo/commit via `git -C <source-root> remote get-url origin` / `rev-parse HEAD` (with
   `--source-repo=`/`--source-commit=` overrides for testing against a non-git fixture directory),
   reads the local TIBER-Rookies checkout's files, calls the pure module, and — only if it returns
   `status: 'passed'` — writes all four files together (no partial refresh on failure; nothing is
   written at all if any check fails).
3. **Four mirror artifacts** written under `data/fixtures/tiberRookies/` (exactly these, nothing
   else):
   - `rookie_transition_profile_v0_2026.mirror.json` — byte-identical copy of the upstream JSON.
   - `rookie_transition_profile_v0_2026.mirror.csv` — byte-identical copy of the upstream CSV.
   - `rookie_transition_profile_v0_2026.manifest.mirror.json` — byte-identical copy of the upstream
     manifest; internal paths are **not** rewritten (still declare TIBER-Rookies' own
     `exports/promoted/rookie-transition-profile/...` paths, per the issue's explicit instruction).
   - `ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json` — the Forecast-owned wrapper
     (`kind: rookie_transition_profile_v0_forecast_mirror_provenance`, `schema_version: 1.0.0`).
4. **`package.json`**: added `refresh:rookie-transition-profile-mirror` script entry.
5. **Two test files** (42 new tests): `tests/rookieTransitionProfileMirror.test.ts` (pure-function
   fail-closed coverage against synthetic data) and
   `tests/rookieTransitionProfileMirrorCommittedArtifacts.test.ts` (guards on the real, committed
   mirror artifacts).

## Commands used to refresh and validate

```bash
# Refresh (against the real local TIBER-Rookies checkout, pinned at the locked commit)
npm run refresh:rookie-transition-profile-mirror -- \
  --source-root=/home/user/TIBER-Rookies \
  --mirror-refreshed-at=2026-07-11T00:00:00.000Z

# Determinism check: reran the identical command a second time and diffed outputs byte-for-byte
# (see "Deterministic reproduction" below)

npm run build   # tsc --noEmit
npm test        # full repository suite
```

**Refresh output (first run):**

```text
source: Prometheus-Frameworks/TIBER-Rookies@2ef92faf9a9c91a393f53e9140428451529a1c48
checks: 26/26 passed
status: passed -> may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue
wrote data/fixtures/tiberRookies/rookie_transition_profile_v0_2026.mirror.json
wrote data/fixtures/tiberRookies/rookie_transition_profile_v0_2026.mirror.csv
wrote data/fixtures/tiberRookies/rookie_transition_profile_v0_2026.manifest.mirror.json
wrote data/fixtures/tiberRookies/ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json
```

All 26 checks passed: repository identity, commit, 3 artifact hashes, 6 source-manifest input
hashes (independently re-verified against the real upstream bytes, not merely re-read from the
manifest's own claims), input-path completeness, manifest self-consistency (declared input/output
hashes agree with the pins), schema version, season, `generated_at`, `run_id`, coverage summary,
row count/uniqueness (48/48), drafted count (47), UDFA-signed count (1), and the exact
`te-daequan-wright` UDFA shape.

## Wrapper schema and identity-resolution counts

- `kind: rookie_transition_profile_v0_forecast_mirror_provenance`, `schema_version: 1.0.0`.
- **Identity resolution:** 48 `player_id` values enumerated, **0 resolved, 48 unresolved**
  (`unresolved_to_forecast_population`) — no separately governed crosswalk was found or
  constructed, per #149 §3. `name_based_or_fuzzy_joins_performed: false`,
  `feature_bearing_join_authorized: false`.
- **Temporal and authorization status:** `all_field_families: audit_only`,
  `pre_draft_temporal_eligibility: unresolved`, `phase_specific_projection_created: false`,
  `experiment_eligibility_established: false`, `model_use_authorized: false`,
  `production_use_authorized: false`. No field or row is labeled `pre_draft_safe`,
  `experiment_eligible`, `feature_ready`, `model_ready`, or `production_ready` (verified by test).
- **Population/outcome parity recorded in the wrapper:** `unique_player_id_rows: 48`,
  `status_drafted_count: 47`, `status_udfa_signed_count: 1`, and the exact
  `te-daequan-wright` shape (`nfl_team: PHI`, `is_udfa: true`, `draft_round: null`,
  `overall_pick: null`, `last_verified_at: null`).

## Deterministic-reproduction evidence

The refresh command was run twice against the identical source root and pinned
`--mirror-refreshed-at`. A byte-for-byte `diff` of both runs' `mirror.json` and
`ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json` output showed **no differences** — the
refresh is deterministic given the same source bytes and the same operator-supplied timestamp.

## Population and parity results

Independently verified directly against the mirrored JSON content (not merely trusted from the
wrapper's own claims):

- `sha256(mirror.json) == c95b941c...a22f37` (matches the pinned upstream JSON hash exactly).
- `sha256(mirror.csv) == 3005bcd6...54e6` (matches the pinned upstream CSV hash exactly).
- `sha256(manifest.mirror.json) == 0acf361c...5804413` (matches the pinned upstream manifest hash
  exactly).
- 48 unique `player_id` rows.
- 47 rows with `official_postdraft_outcome.value.status == "drafted"`.
- 1 row with `status == "udfa_signed"`: `te-daequan-wright`, `nfl_team: "PHI"`, `is_udfa: true`,
  `draft_round: null`, `overall_pick: null`, `provenance.last_verified_at: null`.
- `schema_version`, `season`, `generated_at`, `run_id`, and `coverage_summary` all match the pinned
  source lock exactly.
- The mirrored manifest's own internal paths are unmodified — it still declares
  `exports/promoted/rookie-transition-profile/...` (TIBER-Rookies-owned paths), not rewritten to
  any Forecast-local path.

## Inertness scan results

- `src/models/` and `src/services/` (every file, recursively): **zero** references to
  `tiberRookies`, `rookie_transition_profile`, or `ROOKIE_TRANSITION_PROFILE`.
- `package.json`'s `start`/`dev`/`start:api`/`dev:api`/`build` scripts: **zero** references to the
  mirror directory or artifact names.
- No generic fixture-discovery mechanism exists in this repository (`grep -rn "readdirSync\|globSync"
  src/` returns no hits touching `data/fixtures`) — every existing `data/fixtures/` consumer is an
  explicit, hardcoded path reference in a specific rehearsal module, so placing files under
  `data/fixtures/tiberRookies/` does not risk accidental activation via directory scanning.
- `data/fixtures/tiberRookies/` contains **exactly** the four authorized files (verified by test);
  no phase-filtered, normalized, feature, score, rank, or composite artifact exists anywhere in
  that directory.

## Full-suite test results

```bash
$ npm run build
tsc --noEmit   # clean, no errors

$ npm test
Test Files  82 passed (82)
     Tests  1121 passed (1121)
```

1121 = 1079 pre-existing (as of PR #150's merge) + 42 new
(`tests/rookieTransitionProfileMirror.test.ts`: 20;
`tests/rookieTransitionProfileMirrorCommittedArtifacts.test.ts`: 22).

## Changed-file inventory

```text
A  data/fixtures/tiberRookies/ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json
A  data/fixtures/tiberRookies/rookie_transition_profile_v0_2026.manifest.mirror.json
A  data/fixtures/tiberRookies/rookie_transition_profile_v0_2026.mirror.csv
A  data/fixtures/tiberRookies/rookie_transition_profile_v0_2026.mirror.json
A  docs/experiments/rookie-transition-profile-forecast-mirror-implementation-2026-07-11.md
M  package.json
A  scripts/refreshRookieTransitionProfileMirror.ts
A  src/rehearsal/rookieTransitionProfileMirror.ts
A  tests/rookieTransitionProfileMirror.test.ts
A  tests/rookieTransitionProfileMirrorCommittedArtifacts.test.ts
```

No file under TIBER-Rookies was modified (this is a Forecast-only change against a different
repository entirely). No file under `src/models/`, `src/services/`, or any production
configuration/entrypoint was touched.

## Scope note: what the committed test suite does and doesn't re-verify

`tests/rookieTransitionProfileMirror.test.ts` exercises the pure refresh function's fail-closed
behavior with synthetic data for every check (wrong repo, wrong commit, each of the three artifact
hashes, missing/mismatched source-manifest input hashes, manifest self-consistency, schema/season/
`generated_at`/`run_id`/coverage-summary mismatches, duplicate/wrong row counts, wrong drafted/UDFA
split, and a malformed UDFA row). It deliberately does **not** attempt to reproduce a full "all 26
checks pass" run using fabricated bytes for the six source-manifest input files, since Forecast does
not vendor those files at all (only the three promoted `rookie_transition_profile` artifacts are
mirrored, per the approved design) and fabricated content cannot be made to hash to the real pinned
values. That full positive path was proven for real, once, during this implementation (see
"Commands used to refresh and validate" above) and is why the committed mirror artifacts exist;
`tests/rookieTransitionProfileMirrorCommittedArtifacts.test.ts` then guards the resulting committed
files directly (byte/hash parity, population/outcome parity, wrapper shape, directory
exhaustiveness, inertness) as ongoing CI-safe regression protection that needs no external
repository present.

## Hard-boundary compliance

- TIBER-Rookies was not modified.
- No upstream byte was reinterpreted, decoded, re-encoded, or reshaped — all three payload mirrors
  are exact byte copies.
- No phase-specific projection was built; `official_postdraft_outcome` is present, unmodified, on
  every mirrored row.
- No canonical player-ID crosswalk was built; all 48 identities are recorded
  `unresolved_to_forecast_population`.
- No name-based or fuzzy matching was performed anywhere in this implementation.
- No field was declared temporally eligible; `pre_draft_temporal_eligibility: unresolved` for every
  family.
- No predictive experiment was run; no model-ready feature was created.
- No model or production path imports the mirror (verified by test).
- No MAE/RMSE/calibration/fantasy-point evaluation was performed.
- No downstream consumption, production binding, or UI activation is authorized by this change.

## Decision

```text
may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue
```

This authorizes only a separate, later mirror-validation/rehearsal issue against this committed,
inert mirror. It does not authorize an availability-proof audit, a phase-specific projection, a
controlled experiment, feature use, predictive evaluation, downstream consumption, or production
binding.
