# Prototype of the trend engine: templated, descriptive facts from results + closing lines.
import csv, datetime, json, sys
GAMES_CSV = 'nfldata/data/games.csv'  # path to nflverse's data/games.csv
rows=[r for r in csv.DictReader(open(GAMES_CSV)) if r['result']!='' and r['spread_line']!='']
def team_games(team, pred=lambda g: True):
    out=[]
    for r in rows:
        for home in (True, False):
            if r['home_team' if home else 'away_team']!=team: continue
            sp=float(r['spread_line']); line=-sp if home else sp          # team's spread (negative = favored)
            margin=float(r['result']) if home else -float(r['result'])
            g=dict(r=r, home=home, line=line, margin=margin, qb=r['home_qb_name' if home else 'away_qb_name'],
                   total=float(r['total']) if r['total'] else None, total_line=float(r['total_line']) if r['total_line'] else None,
                   season=int(r['season']), week=int(r['week']), date=r['gameday'], weekday=r['weekday'])
            if pred(g): out.append(g)
    return sorted(out, key=lambda g: g['date'])
def ats(gs):
    w=sum(g['margin']+g['line']>0 for g in gs); l=sum(g['margin']+g['line']<0 for g in gs); return w,l,len(gs)-w-l
def su(gs): return sum(g['margin']>0 for g in gs), sum(g['margin']<0 for g in gs)
def ou(gs):
    gs=[g for g in gs if g['total_line'] is not None]
    o=sum(g['total']>g['total_line'] for g in gs); u=sum(g['total']<g['total_line'] for g in gs); return o,u,len(gs)-o-u
fmt=lambda t: '-'.join(str(x) for x in (t if t[-1] else t[:2]))
thanksgiving=lambda g: g['weekday']=='Thursday' and g['date'][5:7]=='11' and 22<=int(g['date'][8:10])<=28
NAMES={'CIN':'Bengals','WAS':'Commanders','GB':'Packers','LA':'Rams','CHI':'Bears','DET':'Lions','PHI':'Eagles','DAL':'Cowboys','KC':'Chiefs','BUF':'Bills','DEN':'Broncos','PIT':'Steelers'}
out={}
for t,n in NAMES.items():
    s26=team_games(t, lambda g: g['season']==2026)
    facts=[f"{n} are {fmt(ats(s26))} ATS this season", f"{n} games are {fmt(ou(s26))} to the Over this season"]
    fav=team_games(t, lambda g: g['season']>=2024 and g['line']<0); dog=team_games(t, lambda g: g['season']>=2024 and g['line']>0)
    facts.append(f"{n} are {fmt(ats(fav))} ATS as a favorite since 2024"); facts.append(f"{n} are {fmt(ats(dog))} ATS as an underdog since 2024")
    tg=team_games(t, lambda g: thanksgiving(g) and g['season']>=2010)
    if len(tg)>=4: facts.append(f"{n} are {fmt(ats(tg))} ATS on Thanksgiving since 2010 ({fmt(su(tg))} SU)")
    out[t]=facts
mah=[g for g in team_games('KC', lambda g: g['qb']=='Patrick Mahomes' and g['line']>0)]
out['MAHOMES']=[f"Patrick Mahomes is {fmt(ats(mah))} ATS as an underdog ({fmt(su(mah))} SU), {len(mah)} starts"]
lg=[r for r in rows if r['season']=='2026' and int(r['week'])>=8 and float(r['spread_line'])!=0]
fw=sum((float(r['result'])-float(r['spread_line']))*(1 if float(r['spread_line'])>0 else -1)>0 for r in lg)
fl=sum((float(r['result'])-float(r['spread_line']))*(1 if float(r['spread_line'])>0 else -1)<0 for r in lg)
s26=[r for r in rows if r['season']=='2026']
ov=sum(float(r['total'])>float(r['total_line']) for r in s26); un=sum(float(r['total'])<float(r['total_line']) for r in s26)
hw=sum(float(r['result'])-float(r['spread_line'])>0 for r in s26); hl=sum(float(r['result'])-float(r['spread_line'])<0 for r in s26)
out['LEAGUE']=[f"NFL favorites are {fw}-{fl}-{len(lg)-fw-fl} ATS since Week 8", f"NFL games are {ov}-{un} to the Over this season", f"NFL home teams are {hw}-{hl} ATS this season"]
json.dump(out, open('nfl-trends-week12.json','w'), indent=1)
for k,v in out.items(): print(k, *v, sep='\n  ')
