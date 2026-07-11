# Rehearsal: independent validation of the committed rookie_transition_profile_v0.2.0 Forecast mirror (#153)

**Status:** report-only. This rehearsal performs no repair, no adaptation, no join, no filtering,
no experiment, and no activation. It independently reproduces and validates the mirror committed by
#151/PR #152; it does not modify TIBER-Rookies, the four committed Forecast mirror files, or any
refresh/verifier/commit/source-identity implementation code.

## 1. Clean merged-main starting point

**Forecast:**

| | Value |
| --- | --- |
| `git rev-parse HEAD` | `6f67c3ee8cfff27eb74b22df5cc233d5d0601bbf` |
| Remote | `https://github.com/Prometheus-Frameworks/TIBER-Forecast` |
| Initial `git status --short` | *(empty — clean worktree)* |
| Node | `v22.22.2` |
| npm | `10.9.7` |

Reproduce: `git fetch origin main && git checkout main && git reset --hard origin/main` from a
Forecast checkout, then this report's own branch was cut from that exact commit.

**TIBER-Rookies (separate, independent worktree used throughout this rehearsal):**

| | Value |
| --- | --- |
| `git rev-parse HEAD` | `2ef92faf9a9c91a393f53e9140428451529a1c48` |
| Remote | `https://github.com/Prometheus-Frameworks/TIBER-Rookies` |
| Initial `git status --short` | *(empty — clean worktree)* |

Both worktrees matched the locked identities in #153 exactly before any verification began.

## 2. Independent verification of the committed Forecast mirror

Performed by reading the four already-committed files directly — the refresh command was **not**
invoked for this section.

```bash
ls -la data/fixtures/tiberRookies/
sha256sum data/fixtures/tiberRookies/*
```

- **Directory contents:** exactly `ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json`,
  `rookie_transition_profile_v0_2026.manifest.mirror.json`,
  `rookie_transition_profile_v0_2026.mirror.csv`, `rookie_transition_profile_v0_2026.mirror.json`
  — no other file.
- **Independently computed SHA-256** (via `sha256sum`, not read from the wrapper):

  | File | SHA-256 | Matches locked hash |
  | --- | --- | --- |
  | `rookie_transition_profile_v0_2026.mirror.json` | `c95b941c7855612daccfc2226fc51e0e34dbb2ebe8a2487596675d2522a22f37` | ✅ |
  | `rookie_transition_profile_v0_2026.mirror.csv` | `3005bcd6ad4ffc87a312c6926e20c5e3658747012855aa9d8ccfa33d898545e6` | ✅ |
  | `rookie_transition_profile_v0_2026.manifest.mirror.json` | `0acf361c6d2d8cc6f684026481a5aa279e9f7fa718256fad78da0366d5804413` | ✅ |
  | `ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json` | `2639d5acb11e8d77400700e814ad9c50dba9bf0a46f3f80413e4f0d51860aaa6` | *(wrapper; not a locked upstream hash)* |

- **Wrapper fields, read and independently cross-checked** (Python, parsing the JSON directly, not
  trusting the wrapper's self-reported values as proof):
  - `kind`: `rookie_transition_profile_v0_forecast_mirror_provenance` ✅
  - `schema_version`: `1.0.0` ✅
  - `source_lock.repo`/`commit`/`promoted_path`: `Prometheus-Frameworks/TIBER-Rookies` /
    `2ef92faf9a9c91a393f53e9140428451529a1c48` / `exports/promoted/rookie-transition-profile/` ✅
  - `governing_design`: `consumption_design_issue: TIBER-Forecast#149`,
    `consumption_design_pr: TIBER-Forecast#150`,
    `consumption_design_merge_commit: 6c68b1691476f0d26f1b0270e32c199a3ee2f436` ✅
  - `forecast_mirror.mirrored_hashes` **independently recomputed** from the three payload files and
    compared: all three match (`json match: True`, `csv match: True`, `manifest match: True`).
  - `identity_resolution.rows` has exactly **48** entries; `resolved_count: 0`,
    `unresolved_count: 48`; **every** row's `status == "unresolved_to_forecast_population"**;
    `name_based_or_fuzzy_joins_performed: False`; `feature_bearing_join_authorized: False`.
  - The wrapper's 48 `player_id` values were compared, as sets, against the 48 `player_id` values
    independently parsed from the mirrored JSON's own `rows[]`: **identical**, no duplicates in
    either.
  - `temporal_and_authorization_status`: `all_field_families: audit_only`,
    `pre_draft_temporal_eligibility: unresolved`, `phase_specific_projection_created: False`,
    `experiment_eligibility_established: False`, `model_use_authorized: False`,
    `production_use_authorized: False`.
  - `population_and_outcome_parity`: `unique_player_id_rows: 48`, `status_drafted_count: 47`,
    `status_udfa_signed_count: 1`, `udfa_row` exactly `{player_id: te-daequan-wright, nfl_team: PHI,
    is_udfa: true, draft_round: null, overall_pick: null, last_verified_at: null}`.

## 3. Independent verification of the locked upstream source

Performed against a **separate** TIBER-Rookies worktree, checked out at exactly
`2ef92faf9a9c91a393f53e9140428451529a1c48` on `main` — not a Forecast-vendored copy.

```bash
git remote get-url origin        # https://github.com/Prometheus-Frameworks/TIBER-Rookies
git rev-parse HEAD                # 2ef92faf9a9c91a393f53e9140428451529a1c48
sha256sum exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.json
sha256sum exports/promoted/rookie-transition-profile/2026_rookie_transition_profile_v0.csv
sha256sum exports/promoted/rookie-transition-profile/2026_manifest.json
sha256sum exports/promoted/rookie-alpha/2026_rookie_alpha_predraft_v0.json
sha256sum data/processed/2026_draft_capital_proxy.json
sha256sum data/processed/2026_college_production.json
sha256sum data/processed/2026_prospect_context.json
sha256sum data/processed/2026_draft_results.json
sha256sum data/processed/2026_day3_udfa_draft_result_profiles.json
```

All nine hashes matched the locked values exactly (identical to the table in #153 and to §2 above).
Also independently parsed the source JSON directly: `schema_version: rookie-transition-profile-v0.2.0`,
`season: 2026`, `generated_at: 2026-07-10T12:00:00+00:00`,
`run_id: rookie-transition-profile-2026-2026-07-10T12:00:00+00:00`, row count `48`,
`coverage_summary` matching the locked values exactly.

## 4. Byte-for-byte cross-repository comparison

```bash
diff <forecast-mirror-json> <rookies-source-json>       # no output
diff <forecast-mirror-csv> <rookies-source-csv>          # no output
diff <forecast-mirror-manifest> <rookies-source-manifest>  # no output
cmp  <forecast-mirror-json> <rookies-source-json>        # exit 0
cmp  <forecast-mirror-csv> <rookies-source-csv>          # exit 0
cmp  <forecast-mirror-manifest> <rookies-source-manifest>  # exit 0
```

```text
Forecast mirror JSON     == TIBER-Rookies JSON      byte-for-byte  (confirmed)
Forecast mirror CSV      == TIBER-Rookies CSV       byte-for-byte  (confirmed)
Forecast mirror manifest == TIBER-Rookies manifest  byte-for-byte  (confirmed)
```

## 5. Clean deterministic reproduction (two runs)

The committed wrapper's own `mirror_refreshed_at` was read first (`2026-07-11T00:00:00.000Z`) and
reused for both runs, targeting a disposable path and using the existing merged implementation
unmodified:

```bash
npm run refresh:rookie-transition-profile-mirror -- \
  --source-root=/home/user/TIBER-Rookies \
  --mirror-refreshed-at=2026-07-11T00:00:00.000Z \
  --mirror-dir=.tmp/rookie-transition-profile-mirror-rehearsal
```

**Run 1:**

```text
source: Prometheus-Frameworks/TIBER-Rookies@2ef92faf9a9c91a393f53e9140428451529a1c48
checks: 27/27 passed
status: passed -> may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue
committed .../rookie_transition_profile_v0_2026.mirror.json
committed .../rookie_transition_profile_v0_2026.mirror.csv
committed .../rookie_transition_profile_v0_2026.manifest.mirror.json
committed .../ROOKIE_TRANSITION_PROFILE_V0_MIRROR_PROVENANCE.json
```

Exactly four files emitted; no staging or backup debris (`ls .tmp/ | grep -c '\.staging-\|\.backup-'`
→ `0`).

**Run 2** (identical source root, commit, timestamp, and output path): identical output —
`27/27 passed`, same decision, same four files, no debris.

**Comparisons:**

| Comparison | Result |
| --- | --- |
| Run 1 vs. Run 2 (all four files) | byte-identical (`cmp` exit 0 for each) |
| Run 2 vs. the committed Forecast files (all four files, **including the wrapper**) | byte-identical (`cmp` exit 0 for each) |

The disposable directory was removed after evidence capture (`rm -rf .tmp/rookie-transition-profile-mirror-rehearsal`).

## 6. Black-box fail-closed rehearsal (negative controls)

Exercised the merged CLI directly (not the pure verifier's unit API), against disposable source
roots and disposable output directories only — never the committed mirror directory.

**Negative control 1 — non-git source root:**

```bash
npm run refresh:rookie-transition-profile-mirror -- \
  --source-root=/tmp/rehearsal-neg1-nongit \
  --mirror-refreshed-at=2026-07-11T00:00:00.000Z \
  --mirror-dir=.tmp/neg-control-1
```

Result: `FAIL CLOSED: could not resolve a verified git repository identity/commit at --source-root...`,
exit code `1`, no `.tmp/neg-control-1` directory created.

**Negative control 2 — a real git checkout with the correct payload bytes but a different checked-out commit:**

Built by copying the real, correct TIBER-Rookies payload bytes into a fresh directory, then
`git init` + `git remote add origin https://github.com/Prometheus-Frameworks/TIBER-Rookies` +
a fresh local commit (so the repo string matches the pin, but the actual commit does not):

```bash
npm run refresh:rookie-transition-profile-mirror -- \
  --source-root=/tmp/rehearsal-neg3-wrongcommit \
  --mirror-refreshed-at=2026-07-11T00:00:00.000Z \
  --mirror-dir=.tmp/neg-control-3
```

Result:

```text
source: Prometheus-Frameworks/TIBER-Rookies@d17c4bae318f916fef1139aedf88c9ea64be757c
checks: 26/27 passed
status: blocked -> rookie_transition_profile_forecast_mirror_blocked
  - source_commit: expected 2ef92faf9a9c91a393f53e9140428451529a1c48; observed d17c4bae318f916fef1139aedf88c9ea64be757c
No mirror was written.
```

Exit code `1`; no `.tmp/neg-control-3` directory created.

**Override-bypass check:** re-ran the same wrong-commit fixture while additionally passing
`--source-commit=2ef92faf9a9c91a393f53e9140428451529a1c48 --source-repo=Prometheus-Frameworks/TIBER-Rookies`
(asserting the *correct* pinned values as CLI arguments). Result was identical — same block, same
resolved (actual, wrong) commit reported, same failure — because the merged CLI has no
`--source-commit`/`--source-repo` flags at all (confirmed by inspecting
`scripts/refreshRookieTransitionProfileMirror.ts`'s argument list directly); those flags are simply
unrecognized and ignored. **No caller-supplied identity string can bypass the check.**

All temporary negative-control directories and the disposable output paths were removed after
evidence capture.

## 7. Population and source-semantics verification

Independently parsed the committed mirrored JSON directly (Python, reading the file fresh):

```text
48 unique player_id rows (confirmed: len(rows) == 48, len(set(ids)) == 48)
47 official_postdraft_outcome.value.status == "drafted"
1  official_postdraft_outcome.value.status == "udfa_signed"
```

Sole UDFA row, read directly from the mirrored JSON:

```text
player_id: te-daequan-wright
nfl_team: PHI
is_udfa: true
draft_round: null
overall_pick: null
provenance.last_verified_at: null
```

Also confirmed:

- Every one of the 48 rows carries an `official_postdraft_outcome` key (zero rows missing it).
- `draft_capital.provenance.source_type == "market_derived_proxy"` for all 48 rows.
- `official_postdraft_outcome.provenance.source_type == "official_draft_result"` for all rows where
  `value` is present (all 48).
- Every row's top-level keys are exactly `player_id, player_name, position, school, class_year,
  draft_capital, age_at_entry, athletic_testing, college_production, official_postdraft_outcome` —
  no fill/imputation/normalization/filtering/score/rank/composite/phase-projection field exists
  anywhere in the row schema.
- `athletic_testing.value` is `null` for 16 of 48 rows and `age_at_entry.value` is `null` for 1 of 48
  rows — consistent with the locked `coverage_summary` (`players_with_athletic_testing: 32`,
  `players_with_age_at_entry: 47`) and left genuinely null, not filled.
- A text scan of the mirrored JSON for `pre_draft_safe`, `experiment_eligible`, `feature_ready`,
  `model_ready`, `production_ready`, `composite_score`, `phase_projection` found zero matches.

## 8. JSON/CSV parity

Independently parsed both representations directly:

- 48 rows in each; identical **ordered** `player_id` sequence between JSON and CSV.
- No duplicate IDs in either representation; no extra or missing row (`set(json_ids) ==
  set(csv_ids)`).
- `official_postdraft_outcome.value.status` parity checked row-by-row across both representations:
  zero mismatches.
- Dae'Quan Wright's CSV row: `status=udfa_signed`, `nfl_team=PHI`, `is_udfa=True`,
  `draft_round=''`, `overall_pick=''`, `provenance.last_verified_at=''` — nulls survive as the
  standard empty-string CSV convention, never reinterpreted as zero or any other value.

## 9. Inertness after merge

- `grep -rln "tiberRookies\|rookie_transition_profile\|ROOKIE_TRANSITION_PROFILE" src/models
  src/services` → no hits.
- `src/index.ts` and `src/server.ts` (the `start`/`dev`/`start:api`/`dev:api` entrypoints) → no
  reference to the mirror.
- `package.json`'s `start`, `dev`, `start:api`, `dev:api`, `build` scripts → no reference to the
  mirror directory or artifact names.
- No generic fixture-discovery mechanism exists: the only `readdirSync` usage anywhere under `src/`
  is inside `src/rehearsal/rookieTransitionProfileMirrorCommit.ts`, scoped to reading back the
  commit module's own staging directory during a refresh — not a scan of `data/fixtures/` at large.
- The `rookieTransitionProfileMirror*` modules are imported only by
  `scripts/refreshRookieTransitionProfileMirror.ts` and their own four test files — confirmed by a
  repo-wide grep for the import path.
- `refresh:rookie-transition-profile-mirror` is an `npm run` script entry only; it is not invoked by
  `start`, `dev`, `build`, or any other script.
- No phase-specific projection or model-ready artifact exists anywhere else in the repository
  (confirmed in §7's field-schema scan).
- No UI or downstream import was added after PR #152 — confirmed by inspecting the merge-to-HEAD
  diff is empty (this rehearsal branch was cut directly from `6f67c3e`, PR #152's own merge commit,
  with no intervening commits on `main`).

## 10. Build and test validation

```bash
$ npm run build
tsc --noEmit   # exit 0, no errors

$ npm test
Test Files  84 passed (84)
     Tests  1136 passed (1136)
```

**Identical** to PR #152's merged baseline (`84 test files`, `1,136 tests`) — no difference to
attribute, since this rehearsal branch was cut directly from `main` at `6f67c3e` with no code
changes.

## Temporary-directory cleanup and final changed-file inventory

All disposable paths used during this rehearsal were removed after evidence capture:
`.tmp/rookie-transition-profile-mirror-rehearsal/`, `.tmp/neg-control-1/`, `.tmp/neg-control-2/`,
`.tmp/neg-control-3/`, `.tmp/neg-control-3b/`, and the `/tmp/rehearsal-*` negative-control source
fixtures. `git status --short` at the time of writing this report shows only the two new files this
PR adds (this report and its JSON companion) — no other file is touched, staged, or left dirty.

```text
A  docs/experiments/rookie-transition-profile-forecast-mirror-rehearsal-2026-07-11.md
A  docs/experiments/rookie-transition-profile-forecast-mirror-rehearsal-2026-07-11.json
```

No file under TIBER-Rookies was modified. None of the four committed Forecast mirror files were
modified. No refresh/verifier/commit/source-identity implementation code was modified.

## Decision

```text
may_open_rookie_transition_profile_forecast_preexperiment_readiness_design_issue
```

The committed inert mirror has been independently reproduced and validated end-to-end: both Git
identities, all three payload hashes and direct byte equality, the wrapper (verified against
independently recomputed values, not trusted as its own evidence), two clean deterministic
reproductions of all four files, black-box fail-closed behavior against real negative controls with
no override bypass, the 48-row/47-drafted/1-UDFA population and exact `te-daequan-wright` semantics,
full JSON/CSV parity, continued inertness after merge, and a clean build/full-suite run identical to
PR #152's baseline.

This decision authorizes **only** opening a separate pre-experiment readiness **design** issue. That
future design must still resolve both outstanding prerequisites before any experiment can be
authorized:

1. **Governed Forecast identity resolution / crosswalk policy** — TIBER-Rookies' `player_id` values
   remain unresolved to any Forecast canonical identity; §2's wrapper confirms 0 resolved of 48.
2. **Field-family source-availability proof and pinned historical as-of rules** — no field's
   pre-draft temporal eligibility has been established; it remains `unresolved` for every family per
   the #149 design.

This rehearsal does not itself authorize either prerequisite's implementation, a phase-specific
projection, controlled validation, predictive experimentation, feature use, downstream consumption,
production binding, or activation.
