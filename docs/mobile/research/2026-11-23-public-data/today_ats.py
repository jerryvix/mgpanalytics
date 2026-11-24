# ATS records for the Today mockup's teams from ESPN's DraftKings lines (pickcenter) on completed games.
# Usage: python3 -I today_ats.py <cache-dir>; writes today_ats.json next to the cache dir. Public ESPN endpoints, no key.
import json, os, sys, time, urllib.request
C = sys.argv[1]
def get(url, key):
    p = os.path.join(C, key + '.json')
    if os.path.exists(p): return json.load(open(p))
    for i in range(4):
        try:
            d = json.load(urllib.request.urlopen(url, timeout=30)); break
        except Exception as e:
            time.sleep(2 ** i); err = e
    else: raise err
    json.dump(d, open(p, 'w')); time.sleep(0.15); return d
TEAMS = {('basketball','nba'): ['por','phi','mem','cha','lac','hou','utah','lal'], ('football','nfl'): ['cin','wsh']}
CUT = '2026-11-23T20:00Z'  # before tonight's games (UTC timestamps)
out = {}
for (sport, lg), teams in TEAMS.items():
    for ab in teams:
        sc = get(f'https://site.api.espn.com/apis/site/v2/sports/{sport}/{lg}/teams/{ab}/schedule?seasontype=2', f'{lg}-sched-{ab}')
        tid = sc['team']['id']; rec = {'all': [0,0,0], 'home': [0,0,0], 'away': [0,0,0]}; n_noline = 0
        for e in sc['events']:
            c = e['competitions'][0]
            if e['date'] >= CUT or not c['status']['type']['completed']: continue
            me = next(t for t in c['competitors'] if t['team']['id'] == tid); op = next(t for t in c['competitors'] if t['team']['id'] != tid)
            sm = get(f'https://site.api.espn.com/apis/site/v2/sports/{sport}/{lg}/summary?event={e["id"]}', f'{lg}-sum-{e["id"]}')
            dk = next((p for p in sm.get('pickcenter', []) if p.get('provider', {}).get('name') == 'DraftKings' and p.get('spread') is not None), None)
            if not dk: n_noline += 1; continue
            side = 'homeTeamOdds' if me['homeAway'] == 'home' else 'awayTeamOdds'
            fav = dk[side].get('favorite'); sp = abs(float(dk['spread']))
            line = -sp if fav else sp
            if (dk.get('details') or '').upper().startswith('EVEN'): line = 0.0
            m = float(me['score']['value']) - float(op['score']['value']) + line
            k = 0 if m > 0 else (1 if m < 0 else 2)
            rec['all'][k] += 1; rec[me['homeAway']][k] += 1
        out[ab] = {'league': lg, 'abbr': sc['team']['abbreviation'], **rec, 'no_line': n_noline}
        f = lambda r: f'{r[0]}-{r[1]}' + (f'-{r[2]}' if r[2] else '')
        print(lg, sc['team']['abbreviation'], 'ATS', f(rec['all']), 'home', f(rec['home']), 'away', f(rec['away']), 'no line', n_noline)
json.dump(out, open(os.path.join(C, '..', 'today_ats.json'), 'w'), indent=1)
