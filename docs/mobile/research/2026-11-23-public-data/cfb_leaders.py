import json, urllib.request, os
K=open('anon.key').read().strip(); U='https://vwezujtftfccamoduglp.supabase.co/rest/v1/'
def fetch(q):
    out=[]; off=0
    while True:
        req=urllib.request.Request(U+q+f'&limit=1000&offset={off}', headers={'apikey':K,'Authorization':'Bearer '+K})
        rows=json.load(urllib.request.urlopen(req)); out+=rows
        if len(rows)<1000: return out
        off+=1000
lines=fetch('betting_lines?select=game_id,side,line,captured_at&sport=eq.NCAAF&market=eq.spread&side=eq.home')
games=fetch('ncaaf_games?select=id,date,home_team_name,visitor_team_name,home_score,away_score,is_final&season=eq.2026&is_final=eq.true')
print('home spread rows', len(lines), 'final games', len(games))
L={l['game_id']:l for l in lines}
rec={}; first=None; n=0
for g in games:
    l=L.get(g['id'])
    if not l or g['home_score'] is None: continue
    n+=1; first=min(first or g['date'], g['date'])
    m=(g['home_score']-g['away_score'])+l['line']   # home cover margin
    for team,sign in ((g['home_team_name'],1),(g['visitor_team_name'],-1)):
        r=rec.setdefault(team,[0,0,0]); v=m*sign
        r[0 if v>0 else (1 if v<0 else 2)]+=1
print('games with a closing line and a final:', n, 'earliest', first)
top=sorted(rec.items(), key=lambda kv:(-(kv[1][0]-kv[1][1]), -kv[1][0]))[:15]
for t,r in top: print(f"{t} {r[0]}-{r[1]}" + (f"-{r[2]}" if r[2] else ''))
for t in ['Louisiana Tech Bulldogs','Georgia Southern Eagles','Georgia Bulldogs','UCLA Bruins','Utah Utes']:
    print('check', t, rec.get(t))

# ---- leaders for the mockup: best/worst ATS, overs (with team ids for logos)
tot=fetch('betting_lines?select=game_id,side,line&sport=eq.NCAAF&market=eq.total&side=eq.over')
T={l['game_id']:l for l in tot}
games2=fetch('ncaaf_games?select=id,date,home_team_name,visitor_team_name,home_team_id,visitor_team_id,home_score,away_score&season=eq.2026&is_final=eq.true')
ats={}; ou={}; ids={}
for g in games2:
    ids[g['home_team_name']]=g['home_team_id']; ids[g['visitor_team_name']]=g['visitor_team_id']
    l=L.get(g['id'])
    if l and g['home_score'] is not None:
        m=(g['home_score']-g['away_score'])+l['line']
        for team,sign in ((g['home_team_name'],1),(g['visitor_team_name'],-1)):
            r=ats.setdefault(team,[0,0,0]); v=m*sign; r[0 if v>0 else (1 if v<0 else 2)]+=1
    t=T.get(g['id'])
    if t and g['home_score'] is not None:
        d=g['home_score']+g['away_score']-t['line']
        for team in (g['home_team_name'],g['visitor_team_name']):
            r=ou.setdefault(team,[0,0,0]); r[0 if d>0 else (1 if d<0 else 2)]+=1
fmt=lambda r: f"{r[0]}-{r[1]}"+(f"-{r[2]}" if r[2] else '')
best=sorted(ats.items(), key=lambda kv:(-(kv[1][0]-kv[1][1]), -kv[1][0]))[:6]
worst=sorted(ats.items(), key=lambda kv:((kv[1][0]-kv[1][1]), kv[1][0]))[:4]
overs=sorted(ou.items(), key=lambda kv:(-(kv[1][0]-kv[1][1]), -kv[1][0]))[:4]
out={'best':[(t,fmt(r),ids[t]) for t,r in best],'worst':[(t,fmt(r),ids[t]) for t,r in worst],'overs':[(t,fmt(r),ids[t]) for t,r in overs]}
json.dump(out, open('cfb_leaders.json','w'), indent=1)
for k,v in out.items(): print(k, v)
