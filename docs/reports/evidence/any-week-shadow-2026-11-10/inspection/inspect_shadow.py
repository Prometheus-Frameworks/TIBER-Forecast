"""Inspection addendum for the any-week shadow candidate (2026-11-10).

Re-derives the as-run experiment (original/as-run-r1/shadow.py) from the same retained inputs,
ASSERTS that the fit and headline metrics equal the preserved r1 results, and then writes the
outputs the original run did not retain: per-player predictions and outcomes, pooled / macro /
per-position metrics with counts, paired comparisons, named-denominator coverage, week summaries,
the separate Week 2 diagnostic, the gate-condition assessment, scoring reconciliation, the
2024 legacy-vs-current format comparison and the three Hodge arms (10 / 11 / prior unavailable).

It does not refit, retune or change the objective, search grid, weighting, cohorts or fallback.

Usage:  python3 -I inspect_shadow.py RAW_DIR R1_DIR OUT_DIR
"""
import gzip, io, json, sys
import numpy as np
import pandas as pd

RAW, R1, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
POS = ['QB', 'RB', 'WR', 'TE']
HODGE = '00-0034854'
# tiber-generic-full-ppr-v1, in cents (same weights as COMPONENT_WEIGHTS in the preserved shrinkage.ts)
CENTS = dict(receptions=100, receiving_yards=10, receiving_tds=600, rushing_yards=10, rushing_tds=600,
             passing_yards=4, passing_tds=400, passing_interceptions=-200)
W = {c: v / 100 for c, v in CENTS.items()}
# r1 used this literal order and float weights; keep it so sums are bit-identical
W_R1 = dict(passing_yards=.04, passing_tds=4, passing_interceptions=-2, rushing_yards=.1, rushing_tds=6,
            receptions=1, receiving_yards=.1, receiving_tds=6)
MODELS = ['C0', 'STD', 'ALPHA', 'K']


def write_csv(df, name, gz=False):
    text = df.to_csv(index=False, lineterminator='\n')
    if gz:
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode='wb', mtime=0, compresslevel=9) as g:
            g.write(text.encode())
        open(f'{OUT}/{name}', 'wb').write(buf.getvalue())
    else:
        open(f'{OUT}/{name}', 'w').write(text)


def write_json(obj, name):
    json.dump(obj, open(f'{OUT}/{name}', 'w'), indent=1, sort_keys=True)
    open(f'{OUT}/{name}', 'a').write('\n')


# ----------------------------------------------------------------------------- load (as r1)
raw = {}
fr = []
for y in range(2021, 2027):
    x = pd.read_csv(f'{RAW}/stats_player_week_{y}.csv', low_memory=False)
    raw[y] = x
    x = x[(x.season_type == 'REG') & x.position.isin(POS)].copy()
    x['pts'] = sum(x[c].fillna(0) * w for c, w in W_R1.items())
    fr.append(x)
full = pd.concat(fr, ignore_index=True)
df = full[['player_id', 'player_display_name', 'position', 'season', 'week', 'game_id', 'team', 'opponent_team', 'pts']]
assert not df.duplicated(['player_id', 'season', 'week']).any()

# ----------------------------------------------------------------------------- scoring reconciliation
comp = list(CENTS)
null_components = int(full[comp].isna().sum().sum())
nonint = int((full[comp].fillna(0) % 1 != 0).sum().sum())
cents = sum(full[c].fillna(0).round().astype('int64') * v for c, v in CENTS.items())
max_abs_vs_cents = float((full.pts - cents / 100).abs().max())
prov = full.fantasy_points_ppr
dprov = (full.pts - prov)
differs = dprov.abs() > 1e-6
fum_lost = full[['sack_fumbles_lost', 'rushing_fumbles_lost', 'receiving_fumbles_lost']].fillna(0).sum(axis=1)
twopt = full[['passing_2pt_conversions', 'rushing_2pt_conversions', 'receiving_2pt_conversions']].fillna(0).sum(axis=1)
st_td = full['special_teams_tds'].fillna(0)
explained = (dprov - (2 * fum_lost - 2 * twopt - 6 * st_td)).abs() <= 1e-6
scoring = {
    'profile': 'tiber-generic-full-ppr-v1',
    'formula': 'receptions + 0.1*receiving_yards + 6*receiving_tds + 0.1*rushing_yards + 6*rushing_tds + 0.04*passing_yards + 4*passing_tds - 2*interceptions',
    'interceptions_source_column': 'passing_interceptions',
    'excluded': ['fumbles', 'two-point conversions', 'bonuses', 'return/special-teams touchdowns'],
    'rows_scored_REG_QB_RB_WR_TE_2021_2026': int(len(full)),
    'null_component_cells_treated_as_zero': null_components,
    'non_integer_component_cells': nonint,
    'max_abs_difference_r1_float_points_vs_integer_cents_profile': max_abs_vs_cents,
    'r1_points_match_profile': bool(max_abs_vs_cents < 1e-9),
    'provider_fantasy_points_ppr_comparison': {
        'rows_where_provider_total_differs_from_profile': int(differs.sum()),
        'share_of_rows': round(float(differs.mean()), 6),
        'of_those_explained_by_lost_fumbles_2pt_and_special_teams_tds': int((differs & explained).sum()),
        'of_those_unexplained': int((differs & ~explained).sum()),
        'note': 'r1 never used the provider total for modelling; it appears only in blocker.py output and the 26.1 Hodge constant.',
    },
    'scoring_corrected_replay_needed': False,
}
assert scoring['r1_points_match_profile']


# ----------------------------------------------------------------------------- features (as r1)
def prior(season, override=None, drop=None):
    p = df[df.season == season - 1].groupby('player_id').pts.agg(['sum', 'count'])
    P = p['sum'] / p['count']
    G = p['count'].astype(float)
    if override:
        for k_, v in override.items():
            P[k_] = v
    if drop:
        P = P.drop(drop, errors='ignore')
        G = G.drop(drop, errors='ignore')
    return P, G


def rows(season, N, override=None, drop=None):
    """origin week N -> target week N+1. Features use only season-1 and weeks <= N of the target season."""
    P, G = prior(season, override, drop)
    cur = df[df.season == season]
    tgt = cur[cur.week == N + 1][['player_id', 'player_display_name', 'position', 'team', 'opponent_team', 'game_id', 'pts']].rename(columns={'pts': 'Y'})
    s = cur[cur.week <= N].groupby('player_id').pts.agg(['sum', 'count'])
    r = tgt.copy()
    r['P'] = r.player_id.map(P)
    r['prior_games'] = r.player_id.map(G)
    r['n'] = r.player_id.map(s['count']).fillna(0)
    r['S'] = r.player_id.map(s['sum'] / s['count'])
    r['season'] = season
    r['N'] = N
    return r


def origins(season):
    return [N for N in range(1, 18) if not (season == 2026 and N > 8)]


allr = pd.concat([rows(s, N) for s in range(2022, 2027) for N in origins(s)], ignore_index=True)


def posw(t):  # each position contributes equally to the fit (spec 4.1 weighting, pooled over the fit rows)
    return 1.0 / t.groupby('position').position.transform('count')


def prim(t):
    return t[t.P.notna() & (t.n > 0)]


train = allr[allr.season.isin([2022, 2023])]

# ----------------------------------------------------------------------------- fit (identical procedure to r1)
alpha = {}
for N in range(1, 18):
    t = prim(train[train.N == N]); a = posw(t); dlt = t.S - t.P
    alpha[N] = float(np.clip((a * dlt * (t.Y - t.P)).sum() / (a * dlt * dlt).sum(), 0, 1))


def sse_k(k_, t, a):
    pred = (k_ * t.P + t.n * t.S) / (k_ + t.n)
    return float((a * (t.Y - pred) ** 2).sum())


tfit = prim(train); afit = posw(tfit)
ks = np.linspace(0.25, 30, 1191)
sse_curve = [sse_k(v, tfit, afit) for v in ks]
k = float(ks[int(np.argmin(sse_curve))])

r1 = json.load(open(f'{R1}/shadow_results.json'))
assert k == r1['params']['k_games'], (k, r1['params']['k_games'])
assert all(alpha[N] == r1['params']['alpha_by_origin_week'][str(N)] for N in alpha)


def predict(r):
    r = r.copy()
    r['C0'] = r.P
    r['STD'] = r.S
    r['ALPHA'] = r.P + r.N.map(alpha) * (r.S - r.P)
    r['K'] = np.where(r.n > 0, (k * r.P + r.n * r.S.fillna(0)) / (k + r.n), r.P)
    r['KX'] = np.where(r.P.notna(), r.K, np.where(r.n > 0, r.S, np.nan))  # r1 served rule
    return r


def classify(r):
    r = r.copy()
    r['row_class'] = np.select(
        [r.P.notna() & (r.n > 0), r.P.notna() & (r.n == 0), r.P.isna() & (r.n > 0)],
        ['blend_prior_and_current', 'prior_only_no_current_games', 'fallback_current_average_no_prior'],
        'unavailable_no_prior_no_current')
    r['relevant'] = (r.P.notna() & (r.n > 0)) & (r[['P', 'S']].max(axis=1) >= 8)
    return r


allr = classify(predict(allr))


# ----------------------------------------------------------------------------- metrics
def per_pos(t, col):
    out = {}
    for p in POS:
        q = t[t.position == p]
        e = q.Y - q[col]
        out[p] = {'n': int(len(q)), 'mae': float(e.abs().mean()) if len(q) else None,
                  'rmse': float(np.sqrt((e ** 2).mean())) if len(q) else None}
    return out


def summary(t, col):
    pp = per_pos(t, col)
    e = t.Y - t[col]
    ok = all(v['n'] > 0 for v in pp.values())
    return {'n': int(len(t)),
            'pooled_mae': float(e.abs().mean()) if len(t) else None,
            'pooled_rmse': float(np.sqrt((e ** 2).mean())) if len(t) else None,
            'macro_mae': float(np.mean([v['mae'] for v in pp.values()])) if ok else None,
            'macro_rmse': float(np.mean([v['rmse'] for v in pp.values()])) if ok else None,
            'per_position': pp}


def paired(t, col, base='C0', seed=20261110, B=2000):
    """col minus base on identical members. Negative = col has lower error. Interval: player-cluster bootstrap within position."""
    da = (t.Y - t[col]).abs() - (t.Y - t[base]).abs()
    out = {'n': int(len(t)), 'identical_members': True,
           'pooled_mae_diff': float(da.mean()),
           'macro_mae_diff': float(np.mean([da[t.position == p].mean() for p in POS])),
           'per_position_mae_diff': {p: float(da[t.position == p].mean()) for p in POS},
           'share_rows_closer': float((da < 0).mean()), 'share_rows_farther': float((da > 0).mean())}
    rng = np.random.default_rng(seed)
    per = []
    for p in POS:
        g = pd.DataFrame({'pid': t.player_id[t.position == p], 'd': da[t.position == p]}).groupby('pid').d.agg(['sum', 'count']).sort_index()
        per.append((g['sum'].to_numpy(), g['count'].to_numpy()))
    boots = np.empty(B)
    for b in range(B):
        vals = []
        for sm, ct in per:
            idx = rng.integers(0, len(sm), len(sm))
            vals.append(sm[idx].sum() / ct[idx].sum())
        boots[b] = np.mean(vals)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    out['macro_mae_diff_bootstrap95'] = {'lo': float(lo), 'hi': float(hi), 'resamples': B, 'seed': seed,
                                         'unit': 'player, resampled within position',
                                         'note': 'descriptive only; computed after the results had been seen'}
    return out


def gate_conditions(t, col, base='C0'):
    a, b = summary(t, col), summary(t, base)
    worse = [p for p in POS if a['per_position'][p]['mae'] > b['per_position'][p]['mae']]
    return {'macro_mae_strictly_lower': a['macro_mae'] < b['macro_mae'],
            'macro_rmse_not_higher': a['macro_rmse'] <= b['macro_rmse'],
            'positions_with_higher_mae_than_prior_only': worse,
            'arithmetic_conditions_met_on_this_population': bool(a['macro_mae'] < b['macro_mae'] and a['macro_rmse'] <= b['macro_rmse'] and not worse),
            'min_rows_per_position': min(v['n'] for v in a['per_position'].values()),
            'at_least_20_rows_every_position': all(v['n'] >= 20 for v in a['per_position'].values())}


SEASONS = {2022: 'train2022', 2023: 'train2023', 2024: 'val2024', 2025: 'final2025', 2026: 'live2026_targets_wk2to9'}
P_ = prim(allr)
rel = allr[allr.relevant]
metrics = {}
for s, nm in SEASONS.items():
    blk = {}
    for cname, t in [('any_week_blend_rows', P_[P_.season == s]), ('any_week_blend_rows_relevant_ge8', rel[rel.season == s]),
                     ('origin_week9_blend_rows_relevant_ge8', rel[(rel.season == s) & (rel.N == 9)])]:
        if not len(t) or any((t.position == p).sum() == 0 for p in POS):
            continue
        blk[cname] = {'models': {m: summary(t, m) for m in MODELS},
                      'paired_vs_prior_only': {m: paired(t, m) for m in ['STD', 'ALPHA', 'K']},
                      'paired_K_vs_current_only': paired(t, 'K', base='STD')}
    metrics[nm] = blk

# cross-check the headline figures against the preserved r1 results
for s, nm in [(2024, 'val2024'), (2025, 'final2025'), (2026, 'live2026_wk2to9')]:
    mine = metrics[SEASONS[s]]
    for mine_key, r1_key in [('any_week_blend_rows', f'{nm}_all_weeks_primary'), ('any_week_blend_rows_relevant_ge8', f'{nm}_all_weeks_relevant')]:
        for m in MODELS:
            assert round(mine[mine_key]['models'][m]['macro_mae'], 4) == r1[r1_key][m]['macro_mae'], (r1_key, m)
            assert round(mine[mine_key]['models'][m]['macro_rmse'], 4) == r1[r1_key][m]['macro_rmse'], (r1_key, m)
            assert mine[mine_key]['models'][m]['n'] == r1[r1_key][m]['n']

# served candidate, split by how each row was produced
served = {}
for s, nm in SEASONS.items():
    t = allr[allr.season == s]
    blk = {}
    for rc in ['blend_prior_and_current', 'prior_only_no_current_games', 'fallback_current_average_no_prior']:
        q = t[t.row_class == rc]
        e = q.Y - q.KX
        blk[rc] = {'n': int(len(q)), 'pooled_mae': float(e.abs().mean()), 'pooled_rmse': float(np.sqrt((e ** 2).mean())),
                   'per_position': per_pos(q, 'KX'), 'mean_outcome': float(q.Y.mean())}
    blk['unavailable_no_prior_no_current'] = {'n': int((t.row_class == 'unavailable_no_prior_no_current').sum())}
    served[nm] = blk

# coverage with named denominators
coverage = {}
for s, nm in SEASONS.items():
    t = allr[allr.season == s]
    vc = t.row_class.value_counts().to_dict()
    coverage[nm] = {'denominator_name': 'player-game rows of QB/RB/WR/TE who have a row in the target-week file (appeared-in-target-game population)',
                    'denominator': int(len(t)), 'origin_weeks': origins(s), 'by_row_class': {k_: int(v) for k_, v in sorted(vc.items())},
                    'forecast_available': int(t.KX.notna().sum()), 'forecast_available_share': float(t.KX.notna().mean()),
                    'not_in_denominator': 'rostered players with no target-week row (inactive, injured, bye, did not play): no row exists, none was inferred'}

# week summaries
wk = []
for (s, N), t in allr.groupby(['season', 'N']):
    b = t[t.row_class == 'blend_prior_and_current']
    f = t[t.row_class == 'fallback_current_average_no_prior']
    rw = {'season': s, 'origin_week': N, 'target_week': N + 1, 'games': int(t.game_id.nunique()), 'target_rows': len(t),
          'blend_rows': len(b), 'prior_only_rows': int((t.row_class == 'prior_only_no_current_games').sum()),
          'fallback_rows': len(f), 'unavailable_rows': int((t.row_class == 'unavailable_no_prior_no_current').sum())}
    for m in MODELS:
        sm = summary(b, m)
        rw[f'blend_rows_macro_mae_{m}'] = sm['macro_mae']
        rw[f'blend_rows_pooled_mae_{m}'] = sm['pooled_mae']
    rw['fallback_rows_pooled_mae'] = float((f.Y - f.KX).abs().mean()) if len(f) else None
    wk.append(rw)
wk = pd.DataFrame(wk)

# ----------------------------------------------------------------------------- Week 2 diagnostic (kept separate)
week2 = {'definition': 'origin week 1 -> target week 2; C0 = prior, C1 = Week 1 points, C2 = prior + alpha*(Week1 - prior); alpha fit on 2022-2023 origin-1 blend rows',
         'alpha': alpha[1], 'alpha_identifiable_and_positive': bool(alpha[1] > 0)}
for s, nm in SEASONS.items():
    t = P_[(P_.season == s) & (P_.N == 1)]
    week2[nm] = {'models': {'C0': summary(t, 'C0'), 'C1': summary(t, 'STD'), 'C2': summary(t, 'ALPHA')},
                 'paired_C2_vs_C0': paired(t, 'ALPHA'), 'paired_C1_vs_C0': paired(t, 'STD'),
                 'gate_conditions_C2': gate_conditions(t, 'ALPHA')}

# ----------------------------------------------------------------------------- gate assessment
NOT_ASSESSED = {
    'label_resolution_at_least_95pct': 'NOT COMPARABLE - this population is defined by having a target-week row, so resolution is 100% by construction; the protocol measures it against a frozen cutoff-time roster population that was not built here',
    'frozen_cutoff_roster_population_with_nonparticipants': 'NOT MET - no roster source was used; nonparticipants are absent, not scored as zero',
    'source_admission_and_historical_purpose_authority': 'NOT MET - public nflverse release assets retrieved 2026-11-10; no admission',
    'point_in_time_evidence_class': 'NOT MET - a single later snapshot (unqualified retrospective_reconstruction at best)',
    'labels_sealed_before_fit_and_staged_opening': 'NOT MET - one script read every season at once; 2024-2026 outcomes were visible throughout',
    'completion_finality_identity_mapping_cutoff_position': 'NOT ASSESSED',
}
gate = {'rule': 'spec section 8: lower macro MAE, no higher macro RMSE and no position MAE worse than prior-only in BOTH 2024 and 2025, plus evidence and sample-sufficiency requirements',
        'conditions_not_assessed_or_not_comparable': NOT_ASSESSED,
        'governed_disposition': 'bootstrap_study_inconclusive (evidence/population requirements not met). The arithmetic below is descriptive shadow evidence and selects nothing: not the blend, not C2, and not prior-only.',
        'any_week_blend': {SEASONS[s]: {c: gate_conditions(t, 'K') for c, t in [('blend_rows', P_[P_.season == s]), ('blend_rows_relevant_ge8', rel[rel.season == s])]} for s in (2024, 2025, 2026)},
        'week2_C2': {SEASONS[s]: week2[SEASONS[s]]['gate_conditions_C2'] for s in (2024, 2025, 2026)},
        'training_rows_per_position': {SEASONS[s]: {p: int(((P_.season == s) & (P_.position == p)).sum()) for p in POS} for s in (2022, 2023)}}

# ----------------------------------------------------------------------------- 2024 legacy-vs-current format comparison
new24 = raw[2024]
old24 = pd.read_csv(f'{RAW}/legacy_player_stats_2024.csv', low_memory=False)
n_off = new24[(new24.season_type == 'REG') & new24.position.isin(POS)]
o_off = old24[(old24.season_type == 'REG') & old24.position.isin(POS)]
g_new = n_off.groupby('player_id').week.nunique().rename('current_format_weeks')
g_old = o_off.groupby('player_id').week.nunique().rename('legacy_format_weeks')
j = pd.concat([g_new, g_old], axis=1).fillna(0).astype(int)
names = n_off.drop_duplicates('player_id').set_index('player_id')[['player_display_name', 'position']]
j = j.join(names)
j['difference'] = j.current_format_weeks - j.legacy_format_weeks
key_new = set(zip(n_off.player_id, n_off.week)); key_old = set(zip(o_off.player_id, o_off.week))
only_new = n_off[[(a, b) not in key_old for a, b in zip(n_off.player_id, n_off.week)]]
only_old = o_off[[(a, b) not in key_new for a, b in zip(o_off.player_id, o_off.week)]]
off_cols = ['attempts', 'carries', 'targets'] + [c for c in comp]
zero_off = (only_new[off_cols].fillna(0) == 0).all(axis=1)
fmt = {'what_is_compared': 'two nflverse release assets retrieved 2026-11-10: legacy player_stats/player_stats_2024.csv vs current stats_player/stats_player_week_2024.csv; REG season, positions QB/RB/WR/TE by each file\'s own position column',
       'this_is_not': 'the frozen June 10/10 vs later 11/11 discrepancy. The June TIBER artifact and its producing source bytes were not available to this run.',
       'players_current_format': int(len(g_new)), 'players_legacy_format': int(len(g_old)), 'players_in_union': int(len(j)),
       'players_with_different_week_count': int((j.difference != 0).sum()),
       'current_more_than_legacy': int((j.difference > 0).sum()), 'legacy_more_than_current': int((j.difference < 0).sum()),
       'players_only_in_current_format': int((j.legacy_format_weeks == 0).sum()), 'players_only_in_legacy_format': int((j.current_format_weeks == 0).sum()),
       'player_week_rows_current': int(len(n_off)), 'player_week_rows_legacy': int(len(o_off)),
       'rows_only_in_current': int(len(only_new)), 'rows_only_in_legacy': int(len(only_old)),
       'rows_only_in_current_with_zero_attempts_carries_targets_and_scoring_components': int(zero_off.sum()),
       'rows_only_in_current_with_some_offensive_stat': int((~zero_off).sum()),
       'empirical_game_definition': {
           'current_format': 'a player-week row exists when the provider file lists the player for that game; in this file that includes rows whose offensive and scoring columns are all zero (observed: defensive tackles, penalties, returns, or no non-zero stat column at all)',
           'legacy_format': 'observed to omit most such zero-offense rows; the exact inclusion rule was not established from provider documentation here',
           'r1_recorded_game': 'one row in the current-format file for that player, season and REG week (explicit-zero rows count; absent rows are never treated as zero)'},
       'cause': 'INFERENCE, not established: the legacy and current assets apply different row-inclusion rules. No provider statement or changelog was retrieved.'}
write_csv(j[j.difference != 0].reset_index(names='gsis_id').sort_values(['difference', 'gsis_id'], ascending=[False, True])[
    ['gsis_id', 'player_display_name', 'position', 'legacy_format_weeks', 'current_format_weeks', 'difference']], 'format_week_count_differences_2024.csv')

# ----------------------------------------------------------------------------- Hodge
h_new = n_off[n_off.player_id == HODGE].sort_values('week')
h_old = o_off[o_off.player_id == HODGE].sort_values('week')
idc = {'player_id', 'player_name', 'player_display_name', 'position', 'position_group', 'headshot_url', 'season', 'week', 'season_type', 'game_id', 'team', 'opponent_team'}
num = [c for c in h_new.columns if c not in idc and pd.api.types.is_numeric_dtype(h_new[c])]
h_rows = []
for _, rw in h_new.iterrows():
    nz = {c: (int(rw[c]) if float(rw[c]).is_integer() else float(rw[c])) for c in num if pd.notna(rw[c]) and rw[c] != 0}
    h_rows.append({'week': int(rw.week), 'game_id': rw.game_id, 'in_legacy_file': bool(rw.week in set(h_old.week)),
                   'profile_points': float(sum((0 if pd.isna(rw[c]) else rw[c]) * w for c, w in W.items())),
                   'all_numeric_columns_zero_or_null': not nz, 'nonzero_columns': nz})
h_total_cents = int(sum(int(0 if pd.isna(rw[c]) else rw[c]) * v for _, rw in h_new.iterrows() for c, v in CENTS.items()))


def hodge_arm(label, override=None, drop=None):
    r = classify(predict(pd.concat([rows(2025, N, override, drop) for N in range(1, 18)], ignore_index=True)))
    pr = prim(r)
    hr = r[r.player_id == HODGE]
    o1 = pr[pr.N == 1]
    return {'arm': label,
            'hodge_prior_2025_target': None if hr.P.isna().all() else float(hr.P.iloc[0]),
            'week2_diagnostic_origin1': {'C0_macro_mae': summary(o1, 'C0')['macro_mae'], 'C2_macro_mae': summary(o1, 'ALPHA')['macro_mae'], 'n': int(len(o1)), 'hodge_in_cohort': bool((o1.player_id == HODGE).any())},
            'any_week_blend_rows': {'n': int(len(pr)), 'C0_macro_mae': summary(pr, 'C0')['macro_mae'], 'K_macro_mae': summary(pr, 'K')['macro_mae'],
                                    'K_macro_rmse': summary(pr, 'K')['macro_rmse'], 'WR_n': int((pr.position == 'WR').sum()), 'K_WR_mae': summary(pr, 'K')['per_position']['WR']['mae']},
            'served_forecast_available_rows': int(r.KX.notna().sum()), 'target_rows': int(len(r)),
            'hodge_rows': [{'origin_week': int(a.N), 'target_week': int(a.N) + 1, 'outcome': float(a.Y), 'games_so_far': int(a.n), 'row_class': a.row_class,
                            'forecast': None if pd.isna(a.KX) else float(a.KX)} for a in hr.itertuples()]}


arms = [hodge_arm('denominator_10', override={HODGE: h_total_cents / 100 / 10}),
        hodge_arm('denominator_11_as_in_current_file', override={HODGE: h_total_cents / 100 / 11}),
        hodge_arm('prior_unavailable_row_retained', drop=[HODGE])]
base = hodge_arm('r1_default_no_override')
wr_n1 = int(((P_.season == 2025) & (P_.N == 1) & (P_.position == 'WR')).sum())
hodge = {'gsis_id': HODGE, 'name': h_new.player_display_name.iloc[0], 'position_in_2024_file': h_new.position.iloc[0], 'team_2024': sorted(h_new.team.unique()),
         'three_different_counts': {
             'frozen_june_tiber_artifact': '10 (per the preserved readiness report; not re-observed here)',
             'frozen_later_retained_evidence': '11 (per the preserved readiness report)',
             'legacy_release_asset_retrieved_2026_11_10': int(len(h_old)),
             'current_release_asset_retrieved_2026_11_10': int(len(h_new)),
             'note': 'The 6-vs-11 comparison is between two provider file formats on one day. It does not show what the June artifact contained or which game changed, and it does not answer the revision-provenance question.'},
         'current_file_rows_2024_REG': h_rows, 'legacy_file_weeks_2024_REG': [int(w) for w in h_old.week],
         'profile_total_points_2024_REG': h_total_cents / 100, 'provider_fantasy_points_ppr_total': float(h_new.fantasy_points_ppr.sum()),
         'prior_if_10': h_total_cents / 100 / 10, 'prior_if_11': h_total_cents / 100 / 11,
         'r1_default_used': 'the current-format file as retrieved, i.e. 11 rows. That was a data default, not a denominator selection; this PR selects neither 10 nor 11.',
         'r1_default_equals_arm_11': bool(abs(base['any_week_blend_rows']['K_macro_mae'] - arms[1]['any_week_blend_rows']['K_macro_mae']) < 1e-12),
         'sensitivity_population': 'appeared-in-target-game rows, target season 2025, origin weeks 1-17, current-format files (see coverage)',
         'arms': arms,
         'bound_if_he_were_in_the_week2_cohort': {
             'assumption': 'he is added to the WR cohort of the Week 2 diagnostic at its present size',
             'max_change_in_his_abs_error': abs(h_total_cents / 100 / 10 - h_total_cents / 100 / 11),
             'WR_rows_origin1_2025': wr_n1,
             'max_change_in_macro_mae': abs(h_total_cents / 100 / 10 - h_total_cents / 100 / 11) / (wr_n1 + 1) / 4,
             'caveat': 'under the protocol\'s frozen roster population the cohort is larger and differently composed; this bound is illustrative, not a governed result'}}
assert hodge['r1_default_equals_arm_11']

# ----------------------------------------------------------------------------- write
fit = {'candidate': 'any-week games-weighted blend (shadow)', 'formula': 'forecast = (k*P + n*S)/(k+n); P = prior-season points per recorded game; S = current-season points per recorded game through the origin week; n = current-season recorded games',
       'k': k, 'training_seasons': [2022, 2023], 'training_origin_weeks': list(range(1, 18)), 'training_rows': int(len(tfit)),
       'training_rows_by_season': {str(s): int((tfit.season == s).sum()) for s in (2022, 2023)},
       'training_rows_by_position': {p: int((tfit.position == p).sum()) for p in POS},
       'training_row_rule': 'row in the target-week file, prior available (>=1 prior-season row) and >=1 current-season row through the origin week',
       'objective': 'sum_i a_i*(Y_i - forecast_i)^2 with a_i = 1/n_p, n_p = number of training rows at the player\'s position (pooled over both seasons and all origin weeks)',
       'search': {'method': 'exhaustive grid, argmin', 'grid': 'numpy.linspace(0.25, 30, 1191)', 'step': float(ks[1] - ks[0]), 'min': float(ks[0]), 'max': float(ks[-1]),
                  'objective_at_k': float(min(sse_curve)), 'objective_at_neighbours': {str(round(float(ks[i]), 3)): float(sse_curve[i]) for i in range(int(np.argmin(sse_curve)) - 2, int(np.argmin(sse_curve)) + 3)}},
       'alpha_by_origin_week_diagnostic': {str(N): alpha[N] for N in alpha},
       'alpha_rule': 'per origin week N: clip(sum a*d*(Y-P) / sum a*d^2, 0, 1), d = S-P, a = 1/n_p within that origin week\'s 2022-2023 rows',
       'fallbacks': {'prior_but_no_current_games': 'forecast = P', 'no_prior_but_current_games': 'forecast = S (plain current-season average)', 'neither': 'unavailable'},
       'fallback_history': 'r0 shrank no-prior rows toward a training-season position mean ((k2*m_p + n*S)/(k2+n), k2 = %s); r1 replaced that with plain S AFTER seeing it score worse on 2024, 2025 and 2026 rows. That choice is therefore not out-of-sample.' % r1['params']['k_noprior'],
       'zero_and_missing': 'a row with all-zero scoring components is a recorded game worth 0; a missing row is not a game and is never converted to zero; null component cells inside an existing row are treated as 0 (count in scoring.json)',
       'relevant_cohort': 'blend rows with max(P, S) >= 8 points per game; both quantities are known at the cutoff'}

pred = allr[['season', 'N', 'game_id', 'player_id', 'player_display_name', 'position', 'team', 'opponent_team', 'row_class', 'relevant', 'prior_games', 'n', 'P', 'S', 'Y', 'C0', 'STD', 'ALPHA', 'K', 'KX']].rename(
    columns={'N': 'origin_week', 'player_id': 'gsis_id', 'n': 'current_games', 'P': 'prior_ppg', 'S': 'current_ppg', 'Y': 'outcome_points',
             'C0': 'pred_prior_only', 'STD': 'pred_current_only', 'ALPHA': 'pred_alpha_by_week', 'K': 'pred_blend', 'KX': 'served_forecast', 'relevant': 'relevant_ge8'})
pred.insert(2, 'target_week', pred.origin_week + 1)
pred = pred.sort_values(['season', 'origin_week', 'position', 'gsis_id']).reset_index(drop=True)
for c in ['prior_ppg', 'current_ppg', 'outcome_points', 'pred_prior_only', 'pred_current_only', 'pred_alpha_by_week', 'pred_blend', 'served_forecast']:
    pred[c] = pred[c].round(6)
for c in ['prior_games', 'current_games']:
    pred[c] = pred[c].astype('Int64')
write_csv(pred, 'predictions_and_outcomes.csv.gz', gz=True)
write_csv(wk.round(6), 'week_summary.csv')
write_json(fit, 'fit.json')
write_json(scoring, 'scoring.json')
write_json({'metrics_any_week': metrics, 'served_candidate_by_row_class': served, 'coverage': coverage}, 'metrics.json')
write_json(week2, 'week2_diagnostic.json')
write_json(gate, 'gate_assessment.json')
write_json(fmt, 'format_comparison_2024.json')
write_json(hodge, 'hodge.json')
print('k', k, 'training rows', len(tfit), '| predictions rows', len(pred))
print('r1 cross-checks passed: k, alpha, macro MAE/RMSE and n for 2024/2025/2026 primary and relevant cohorts')
