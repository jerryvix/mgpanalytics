# Full 2026 college football regular season ATS and over/under leaders, from
# CollegeFootballData (CFBD) closing lines. Produces cfb-leaders-full-season.json
# (same shape as cfb-leaders-since-week4.json plus "weeks" and "games").
#
# How the CFBD data was fetched (Nov 23, 2026):
#   MGP's CFBD key lives only in the Supabase edge-function secret CFBD_API_KEY,
#   so a throwaway, read-only edge function (cfb-ats-leaders-oneoff, never
#   committed, deleted right after use) made exactly two CFBD calls:
#     GET /lines?year=2026&seasonType=regular
#     GET /games?year=2026&seasonType=regular
#   and returned, per game: CFBD id, week, start, completed, home/away team id,
#   name, classification and points, the providers listed, and the chosen spread
#   and total (DraftKings when it has one, else the first provider that does;
#   DraftKings had both for every completed game, so no fallback was used).
#   That response was saved to a local file and is the CFBD_JSON input here.
#   It wrote nothing to any table. It was deployed with --no-verify-jwt and
#   checked a throwaway per-call token so outside callers could not spend the
#   CFBD quota while it existed. anon.key below is the website's public
#   publishable key (VITE_SUPABASE_PUBLISHABLE_KEY).
#
# Method (same as cfb_leaders.py):
#   - Games: regular season, completed, at least one FBS team. FCS-vs-FCS games
#     in /lines are ignored. A game without a spread is skipped for ATS, and one
#     without a total is skipped for O/U (none of the 822 completed games lacked
#     either; all 127 FBS-vs-FCS games had DraftKings lines and are counted).
#   - Home cover margin = (home_score - away_score) + home spread. >0 cover,
#     <0 miss, 0 push; the away team gets the opposite.
#   - Over/under: home_score + away_score - total. >0 over, <0 under, 0 push.
#   - Ranking: best = covers minus misses, then covers; worst = reverse;
#     overs = overs minus unders, then overs. Remaining ties break by team name.
#     Only FBS teams are ranked.
#   - Team names and ids: CFBD game ids are ESPN event ids and CFBD team ids are
#     ESPN team ids, so each game joins to ncaaf_games on
#     external_id = 'espn_ncaaf_<cfbd id>' and takes home_team_name /
#     home_team_id etc. from there (895 of 895 FBS games joined, team ids and
#     final scores all agree).
#   - CFBD's "Week 1" includes the Week 0 games of Aug 29. Weeks 1 to 12 run
#     Aug 29 to Nov 22; Week 13 (Thanksgiving) had no completed games yet.
#
# Checks run against the same data (Nov 23):
#   - Weeks 4 to 12, CFBD DraftKings spread vs MGP's stored closing spread
#     (betting_lines, DraftKings, last capture usually 1 to 3 h before kickoff), 562
#     games: 318 exact, 409 (73%) within 0.5, 513 (91%) within 1, 49 more than
#     1 apart; the ATS result agrees in 545 of 562 (97%). Totals: 334 exact,
#     25 more than 1 apart. Openers agree within 0.5 in 523 of 562, so the gap
#     is late movement between MGP's last snapshot and CFBD's close.
#   - DraftKings vs Bovada in CFBD agree within 0.5 at the same rate in Weeks
#     1 to 3 (208 of 251) as in Weeks 4+ (464 of 558).
#   - Restricted to Weeks 4+ with MGP's lines, the method reproduces
#     cfb-leaders-since-week4.json exactly.
#   - Ties at the cutoffs: 8 teams are 8-3 for the 6th "best" slot (Air Force,
#     Duke, Iowa, Kennesaw State, Liberty, Nebraska, Oregon State, Wake Forest)
#     and 8 are 3-8 for the 4th "worst" slot (Auburn, Georgia Tech, Houston,
#     Marshall, Old Dominion, Purdue, Troy, USC); the name tiebreak picks the
#     first. The top 4 overs have no tie.
#
# Run from this folder: python3 cfb_leaders_full_season.py <cfbd_result.json> <anon.key>
import json, sys, urllib.request

CFBD_JSON, KEY_FILE = sys.argv[1], sys.argv[2]
K = open(KEY_FILE).read().strip()
U = 'https://vwezujtftfccamoduglp.supabase.co/rest/v1/'

def fetch(q):
    out = []; off = 0
    while True:
        req = urllib.request.Request(U + q + f'&limit=1000&offset={off}', headers={'apikey': K, 'Authorization': 'Bearer ' + K})
        rows = json.load(urllib.request.urlopen(req)); out += rows
        if len(rows) < 1000: return out
        off += 1000

cfbd = json.load(open(CFBD_JSON))
espn = {g['external_id']: g for g in fetch('ncaaf_games?select=id,external_id,home_team_name,visitor_team_name,home_team_id,visitor_team_id,home_score,away_score&season=eq.2026')}

games = [g for g in cfbd['games']
         if 'fbs' in (g['homeClass'], g['awayClass']) and g['completed']
         and isinstance(g['homePts'], int) and isinstance(g['awayPts'], int)]

ats, ou, ids, fbs = {}, {}, {}, set()
weeks, n_ats, n_ou, skipped = set(), 0, 0, []
for g in games:
    e = espn[f"espn_ncaaf_{g['id']}"]
    assert (str(g['homeId']), str(g['awayId'])) == (e['home_team_id'], e['visitor_team_id'])
    home, away = e['home_team_name'], e['visitor_team_name']
    ids[home], ids[away] = e['home_team_id'], e['visitor_team_id']
    if g['homeClass'] == 'fbs': fbs.add(home)
    if g['awayClass'] == 'fbs': fbs.add(away)
    weeks.add(g['week'])
    if g['spread'] is None:
        skipped.append((g['week'], home, away)); continue
    n_ats += 1
    m = (g['homePts'] - g['awayPts']) + g['spread']
    for team, sign in ((home, 1), (away, -1)):
        r = ats.setdefault(team, [0, 0, 0]); v = m * sign
        r[0 if v > 0 else (1 if v < 0 else 2)] += 1
    if g['total'] is not None:
        n_ou += 1
        dd = g['homePts'] + g['awayPts'] - g['total']
        for team in (home, away):
            r = ou.setdefault(team, [0, 0, 0]); r[0 if dd > 0 else (1 if dd < 0 else 2)] += 1

fmt = lambda r: f"{r[0]}-{r[1]}" + (f"-{r[2]}" if r[2] else '')
A = [(t, r) for t, r in ats.items() if t in fbs]
O = [(t, r) for t, r in ou.items() if t in fbs]
best = sorted(A, key=lambda kv: (-(kv[1][0] - kv[1][1]), -kv[1][0], kv[0]))
worst = sorted(A, key=lambda kv: ((kv[1][0] - kv[1][1]), kv[1][0], kv[0]))
overs = sorted(O, key=lambda kv: (-(kv[1][0] - kv[1][1]), -kv[1][0], kv[0]))
out = {
    'best': [(t, fmt(r), ids[t]) for t, r in best[:6]],
    'worst': [(t, fmt(r), ids[t]) for t, r in worst[:4]],
    'overs': [(t, fmt(r), ids[t]) for t, r in overs[:4]],
    'weeks': f"{min(weeks)} to {max(weeks)}",
    'games': n_ats,
}
json.dump(out, open('cfb-leaders-full-season.json', 'w'), indent=1)
print('ATS games', n_ats, 'O/U games', n_ou, 'skipped (no spread)', len(skipped), 'weeks', out['weeks'])
for k in ('best', 'worst', 'overs'):
    print(k, out[k])
# Show who sits just past each cutoff, so ties at the edge are visible
print('next best', [(t, fmt(r)) for t, r in best[6:10]])
print('next worst', [(t, fmt(r)) for t, r in worst[4:8]])
print('next overs', [(t, fmt(r)) for t, r in overs[4:8]])
