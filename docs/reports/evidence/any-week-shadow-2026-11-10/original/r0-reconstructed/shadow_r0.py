import sys, json, numpy as np, pandas as pd
d, out = sys.argv[1], sys.argv[2]
POS = ['QB','RB','WR','TE']
W = dict(passing_yards=.04, passing_tds=4, passing_interceptions=-2, rushing_yards=.1, rushing_tds=6, receptions=1, receiving_yards=.1, receiving_tds=6)
fr = []
for y in range(2021, 2027):
    x = pd.read_csv(f'{d}/stats_player_week_{y}.csv', low_memory=False)
    x = x[(x.season_type=='REG') & x.position.isin(POS)].copy()
    x['pts'] = sum(x[c].fillna(0)*w for c, w in W.items())
    fr.append(x[['player_id','player_display_name','position','season','week','team','opponent_team','pts']])
df = pd.concat(fr, ignore_index=True)
assert not df.duplicated(['player_id','season','week']).any()

def prior(season, override=None):
    p = df[df.season==season-1].groupby('player_id').pts.agg(['sum','count'])
    P = p['sum']/p['count']
    if override: 
        for k,v in override.items(): P[k] = v
    return P, p['count']

def rows(season, N, override=None):
    """origin week N -> target week N+1. Features use only season-1 and weeks<=N."""
    P, G = prior(season, override)
    cur = df[df.season==season]
    tgt = cur[cur.week==N+1][['player_id','player_display_name','position','team','opponent_team','pts']].rename(columns={'pts':'Y'})
    s = cur[cur.week<=N].groupby('player_id').pts.agg(['sum','count'])
    r = tgt.copy()
    r['P'] = r.player_id.map(P); r['Gp'] = r.player_id.map(G)
    r['n'] = r.player_id.map(s['count']).fillna(0); r['S'] = r.player_id.map(s['sum']/s['count'])
    r['season']=season; r['N']=N
    return r

allr = pd.concat([rows(s,N) for s in range(2022,2027) for N in range(1,18) if not (s==2026 and N>8)], ignore_index=True)
allr['w'] = 1.0
def posw(t):  # spec 4.1: each position contributes equally to the fit
    return 1.0/t.groupby('position').position.transform('count')
train = allr[allr.season.isin([2022,2023])]
prim = lambda t: t[t.P.notna() & (t.n>0)]

# --- per-origin-week alpha (direct generalisation of accepted C2) ---
alpha = {}
for N in range(1,18):
    t = prim(train[train.N==N]); a = posw(t); dlt = t.S-t.P
    alpha[N] = float(np.clip((a*dlt*(t.Y-t.P)).sum()/(a*dlt*dlt).sum(), 0, 1))
# --- single-parameter games-weighted shrinkage: (k*P + n*S)/(k+n) ---
def sse_k(k, t, a): 
    pred = (k*t.P + t.n*t.S)/(k+t.n); return float((a*(t.Y-pred)**2).sum())
t = prim(train); a = posw(t)
ks = np.linspace(0.25, 30, 1191); k = float(ks[np.argmin([sse_k(v,t,a) for v in ks])])
# --- no-prior extension: shrink season-to-date toward a position mean for no-prior players ---
np_tr = train[train.P.isna() & (train.n>0)]
m_np = np_tr.groupby('position').Y.mean().to_dict()
a2 = posw(np_tr)
def sse_k2(k2):
    pred = (k2*np_tr.position.map(m_np) + np_tr.n*np_tr.S)/(k2+np_tr.n); return float((a2*(np_tr.Y-pred)**2).sum())
k2 = float(ks[np.argmin([sse_k2(v) for v in ks])])

def predict(r):
    r = r.copy()
    r['C0'] = r.P
    r['STD'] = r.S
    r['ALPHA'] = r.P + r.N.map(alpha)*(r.S-r.P)
    r['K'] = np.where(r.n>0, (k*r.P + r.n*r.S.fillna(0))/(k+r.n), r.P)
    npm = r.position.map(m_np)
    r['KX'] = np.where(r.P.notna(), r.K, np.where(r.n>0, (k2*npm + r.n*r.S.fillna(0))/(k2+r.n), np.nan))
    return r
allr = predict(allr)

def macro(t, col):
    g = t.groupby('position').apply(lambda q: pd.Series({'mae': (q.Y-q[col]).abs().mean(), 'rmse': np.sqrt(((q.Y-q[col])**2).mean()), 'n': len(q)}), include_groups=False)
    return float(g.mae.mean()), float(g.rmse.mean()), int(g.n.sum()), g
res = {'params': {'alpha_by_origin_week': alpha, 'k_games': k, 'k_noprior': k2, 'noprior_pos_mean': m_np, 'train': [2022,2023]}}
def table(label, t):
    o = {}
    for col in ['C0','STD','ALPHA','K']:
        mae, rmse, n, g = macro(t, col); o[col] = {'macro_mae': round(mae,4), 'macro_rmse': round(rmse,4), 'n': n, 'pos_mae': {p: round(float(g.mae[p]),3) for p in POS}}
    res[label] = o; return o
P_ = prim(allr)
rel = P_[(P_[['P','S']].max(axis=1) >= 8)]
for s, nm in [(2024,'val2024'),(2025,'final2025'),(2026,'live2026_wk2to9')]:
    table(f'{nm}_all_weeks_primary', P_[P_.season==s])
    table(f'{nm}_all_weeks_relevant', rel[rel.season==s])
    table(f'{nm}_origin1_primary', P_[(P_.season==s)&(P_.N==1)])
    if s!=2026: table(f'{nm}_origin9_relevant', rel[(rel.season==s)&(rel.N==9)])
# by-week curve (relevant cohort, 2024+2025 pooled)
bw = {}
for N in range(1,18):
    tt = rel[rel.season.isin([2024,2025])&(rel.N==N)]
    bw[N] = {c: round(macro(tt,c)[0],3) for c in ['C0','STD','ALPHA','K']}
res['by_origin_week_relevant_2024_2025'] = bw
# coverage incl. no-prior extension
for s in [2024,2025,2026]:
    tt = allr[allr.season==s]
    res[f'coverage_{s}'] = {'target_rows': len(tt), 'spec_primary(P & n>0)': int((tt.P.notna()&(tt.n>0)).sum()), 'K_available(P)': int(tt.K.notna().sum()), 'KX_available': int(tt.KX.notna().sum())}
    npx = tt[tt.P.isna() & tt.KX.notna()]
    res[f'noprior_ext_{s}'] = {'n': len(npx), 'mae_KX': round(float((npx.Y-npx.KX).abs().mean()),3), 'mae_STD': round(float((npx.Y-npx.S).abs().mean()),3)}
# --- Hodge 10 vs 11 sensitivity on the accepted design (origin wk1, target 2025 wk2) and everywhere in 2025 ---
sens = {}
for games in (10, 11):
    r = predict(pd.concat([rows(2025,N,{'00-0034854': 26.1/games}) for N in range(1,18)], ignore_index=True))
    pr = prim(r)
    sens[games] = {'origin1_macro_mae_C0': macro(pr[pr.N==1],'C0')[0], 'origin1_macro_mae_ALPHA(C2)': macro(pr[pr.N==1],'ALPHA')[0], 'allweeks_macro_mae_K': macro(pr,'K')[0],
                   'hodge_rows_in_2025_eval': int((pr.player_id=='00-0034854').sum()), 'hodge_in_wk2_cohort': bool(((pr.player_id=='00-0034854')&(pr.N==1)).any())}
res['hodge_sensitivity_2025'] = sens
json.dump(res, open(f'{out}/shadow_results.json','w'), indent=1)

# --- 2026 Week 10 shadow forecast (origin = through Week 9) ---
P26, G26 = prior(2026)
cur = df[df.season==2026]
s = cur[cur.week<=9].groupby('player_id').agg(pts_sum=('pts','sum'), n=('pts','count'))
last = cur.sort_values('week').groupby('player_id').tail(1).set_index('player_id')[['player_display_name','position','team']]
ids = sorted(set(s.index))
f = pd.DataFrame(index=ids).join(last).join(s)
f['P'] = f.index.map(P26); f['prior_games'] = f.index.map(G26); f['S'] = f.pts_sum/f.n; f['N']=9
f = predict(f.assign(Y=np.nan))
g = pd.read_csv(f'{d}/games.csv', low_memory=False); g = g[(g.season==2026)&(g.game_type=='REG')&(g.week==10)]
opp = {}; 
for _,x in g.iterrows(): opp[x.home_team]=x.away_team; opp[x.away_team]='@'+x.home_team
f['wk10_opp'] = f.team.map(opp)
f['status'] = np.where(f.wk10_opp.isna(),'bye_no_forecast', np.where(f.P.isna(),'no_prior_extension','prior_plus_2026'))
f['forecast'] = np.where(f.wk10_opp.isna(), np.nan, f.KX).round(2)
o = f.reset_index(names='gsis_id')[['gsis_id','player_display_name','position','team','wk10_opp','status','forecast','P','prior_games','S','n']].rename(columns={'P':'prior_ppg_2025','S':'ppg_2026_thru_wk9','n':'games_2026'})
o[['prior_ppg_2025','ppg_2026_thru_wk9']] = o[['prior_ppg_2025','ppg_2026_thru_wk9']].round(2)
o = o.sort_values(['position','forecast'], ascending=[True,False])
o.to_csv(f'{out}/shadow_week10_forecast.csv', index=False)
print(json.dumps(res, indent=1)[:200])
print('teams on bye wk10:', sorted(set(f.team.dropna())-set(opp)))
for p in POS: print(p); print(o[(o.position==p)&o.forecast.notna()].head(12)[['player_display_name','team','wk10_opp','forecast','prior_ppg_2025','ppg_2026_thru_wk9','games_2026']].to_string(index=False))
