import sys, pandas as pd
d = sys.argv[1]
pid = '00-0034854'
new = pd.read_csv(f'{d}/stats_player_week_2024.csv', low_memory=False)
old = pd.read_csv(f'{d}/legacy_player_stats_2024.csv', low_memory=False)
n = new[(new.player_id==pid)&(new.season_type=='REG')]
o = old[(old.player_id==pid)&(old.season_type=='REG')]
print('name/pos/team:', n.player_display_name.iloc[0], n.position.iloc[0], sorted(n.team.unique()))
print('new-format REG rows:', len(n), 'weeks', sorted(n.week))
print('legacy-format REG rows:', len(o), 'weeks', sorted(o.week))
cols = ['week','team','opponent_team','targets','receptions','receiving_yards','receiving_tds','carries','rushing_yards','fantasy_points_ppr','penalties','def_tackles_solo','def_tackles_with_assist','punt_returns','kickoff_returns','fumble_recovery_own','fumbles_total']
cols=[c for c in cols if c in n.columns]
print(n[cols].sort_values('week').to_string(index=False))
miss = sorted(set(n.week)-set(o.week))
print('weeks only in new format:', miss)
# overall population-level difference 2024 REG offense
off = new[(new.season_type=='REG')&(new.position.isin(['QB','RB','WR','TE']))]
ooff = old[(old.season_type=='REG')&(old.position.isin(['QB','RB','WR','TE']))]
g_new = off.groupby('player_id').week.nunique(); g_old = ooff.groupby('player_id').week.nunique()
j = pd.concat([g_new.rename('new'), g_old.rename('old')],axis=1).fillna(0)
print('2024 QB/RB/WR/TE players: new-format', len(g_new), 'legacy', len(g_old), '| players whose game count differs:', int((j.new!=j.old).sum()), '| new>old:', int((j.new>j.old).sum()))
print('total PPR', round(n.fantasy_points_ppr.sum(),2), '-> per game /10 =', round(n.fantasy_points_ppr.sum()/10,3), ' /11 =', round(n.fantasy_points_ppr.sum()/11,3))
