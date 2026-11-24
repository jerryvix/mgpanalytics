"""Player lines (DECISIONS D-105): for every upcoming NFL and NBA game, the strongest true
facts about its players measured against that game's actual DraftKings prop number.

"Josh Allen has topped 225.5 passing yards in 10 of his last 12 home games." A fact,
never a pick. No AI and no cost: the props come from ESPN's public odds feed
(DraftKings, provider 100), the history from nflverse (NFL) and ESPN box scores (NBA),
and every number is computed here and recomputed by the check pass before it can ship.

For each player and market with a line, it builds every condition that is TRUE for this
game (home or road, this opponent, after a loss or a win, after his own game over or
under this number, rest, favorite or underdog, division, prime time, outdoors, the cold,
who his quarterback is, a key teammate out, the opponent's defense against his
position, ...), alone and in pairs, over his last three seasons, this season, his games
since joining a new team, his last 10, and (for rare conditions such as this opponent)
every game in the data. Each sample is literally "his last n" such games. Over and under
are both tried; a push counts as a miss for both. A line needs a real sample, a game in
the last two seasons, a high hit rate and distance from a coin flip AND from his own
overall rate against this number, so "he usually tops it" alone never qualifies. The
top 3 per game (one per player, varied markets) are kept; the first is the one the app
shows.

Usage:
  python3 -I scripts/angles/player_angles.py --league nfl --nflverse <dir> --season 2026 --days 7 --json nfl_players.json
  python3 -I scripts/angles/player_angles.py --league nba --history data/history/nba_espn.csv <nba_current.csv> \\
      --boxes data/history/nba_players_espn.csv <nba_players_current.csv> --season 2027 --days 2 --json nba_players.json
  python3 -I scripts/angles/player_angles.py --self-test
<dir> holds nflverse's games.csv, players.csv, stats_player_week_<season>.csv and snap_counts_<season>.csv.
"""
import argparse
import csv
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}

CFG = {
    "NFL": {"path": "football/leagues/nfl", "site": "football/nfl", "min_games": 8, "since": 2018, "prev": "the week before", "big": 7},
    "NBA": {"path": "basketball/leagues/nba", "site": "basketball/nba", "min_games": 10, "since": 2023, "prev": "the game before", "big": 7},
}
WINDOW_SEASONS = 3          # "his last n" samples reach back three seasons, this one included
RECENT_SEASONS = 2          # and need a game in the last two
STRONG_RATE, STRONG_Z, STRONG_ZBASE = 0.75, 2.0, 2.0
FLOOR_RATE, FLOOR_Z, FLOOR_ZBASE = 0.70, 1.75, 1.25
OBVIOUS_SHARE = 0.85        # a condition true in 85%+ of his games is just "all games"
TOP_N = 3
BANNED = re.compile(r"\b(bet|bets|betting|lock|locks|pick|picks|take|should|hammer|smash|fade|tail|play|value|edge|guarantee\w*|sure thing)\b", re.I)
DASHES = re.compile("[‒–—―−]")

NFL_TEAMS = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers", "CHI": "Bears",
    "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers",
    "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs", "LA": "Rams", "LAC": "Chargers",
    "LV": "Raiders", "MIA": "Dolphins", "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
    "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks", "SF": "49ers", "TB": "Buccaneers",
    "TEN": "Titans", "WAS": "Commanders",
}
FRANCHISE = {"OAK": "LV", "SD": "LAC", "STL": "LA"}
SKILL = {"QB", "RB", "WR", "TE", "FB"}


def franchise(t: str) -> str:
    return FRANCHISE.get(t, t)


@dataclass(frozen=True)
class Market:
    key: str
    label: str            # "passing yards"
    cols: tuple           # raw columns summed into the stat
    group: str | None     # defense ranking used for "against top-10 ... defenses"
    one: tuple | None = None  # (over, under) wording for a 0.5 line: ("thrown an interception", "not thrown an interception")


NFL_MARKETS = {
    "Total Passing Yards (incl. overtime)": Market("pass_yds", "passing yards", ("passing_yards",), "pass"),
    "Total Pass Completions (incl. overtime)": Market("completions", "completions", ("completions",), "pass"),
    "Total Passing Attempts (incl. overtime)": Market("pass_att", "pass attempts", ("attempts",), "pass"),
    "Total Passing Touchdowns (incl. overtime)": Market("pass_tds", "passing touchdowns", ("passing_tds",), "pass",
                                                        ("thrown a touchdown pass", "not thrown a touchdown pass")),
    "Total Passing Interceptions (incl. overtime)": Market("ints", "interceptions", ("passing_interceptions",), "pass",
                                                           ("thrown an interception", "not thrown an interception")),
    "Total Passing Plus Rushing Yards (incl. overtime)": Market("pass_rush_yds", "passing and rushing yards", ("passing_yards", "rushing_yards"), "pass"),
    "Total Rushing Yards (incl. overtime)": Market("rush_yds", "rushing yards", ("rushing_yards",), "rush"),
    "Total Carries (incl. overtime)": Market("carries", "carries", ("carries",), "rush"),
    "Total Receiving Yards (incl. overtime)": Market("rec_yds", "receiving yards", ("receiving_yards",), "rec"),
    "Total Receptions (incl. overtime)": Market("receptions", "receptions", ("receptions",), "rec"),
    "Total Rushing Plus Receiving Yards (incl. overtime)": Market("rush_rec_yds", "rushing and receiving yards", ("rushing_yards", "receiving_yards"), "rush"),
    # Yes/no market: no number in the feed, so it's graded against 0.5 touchdowns (passing touchdowns don't count)
    "Anytime Touchdown Scorer": Market("anytime_td", "touchdowns", ("rushing_tds", "receiving_tds", "special_teams_tds", "fumble_recovery_tds"), None,
                                       ("scored a touchdown", "not scored a touchdown")),
}
NBA_MARKETS = {
    "Total Points": Market("pts", "points", ("pts",), "def"),
    "Total Rebounds": Market("reb", "rebounds", ("reb",), "def"),
    "Total Assists": Market("ast", "assists", ("ast",), "def"),
    "Total 3-Point Field Goals": Market("fg3", "threes", ("fg3",), "def", ("made a three", "not made a three")),
    "Total Points and Rebounds": Market("pts_reb", "points and rebounds", ("pts", "reb"), "def"),
    "Total Points and Assists": Market("pts_ast", "points and assists", ("pts", "ast"), "def"),
    "Total Assists and Rebounds": Market("reb_ast", "rebounds and assists", ("reb", "ast"), "def"),
    "Total Points, Rebounds, and Assists": Market("pra", "points, rebounds and assists", ("pts", "reb", "ast"), "def"),
    "Total Steals": Market("stl", "steals", ("stl",), None, ("recorded a steal", "not recorded a steal")),
    "Total Blocks": Market("blk", "blocks", ("blk",), None, ("blocked a shot", "not blocked a shot")),
}
# The bet as the app names it after the sentence: "(J. Allen O 240.5 Pass Yds)"
MARKET_SHORT = {
    "pass_yds": "Pass Yds", "pass_tds": "Pass TDs", "pass_att": "Pass Att", "completions": "Comp", "ints": "INTs",
    "pass_rush_yds": "Pass+Rush Yds", "rush_yds": "Rush Yds", "carries": "Rush Att", "rec_yds": "Rec Yds", "receptions": "Rec",
    "rush_rec_yds": "Rush+Rec Yds", "anytime_td": "Anytime TD",
    "pts": "Pts", "reb": "Reb", "ast": "Ast", "fg3": "3PM", "stl": "Stl", "blk": "Blk", "pra": "PRA",
    "pts_reb": "Pts+Reb", "pts_ast": "Pts+Ast", "reb_ast": "Reb+Ast",
}
SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"}


def short_name(full: str, first: str = "", last: str = "", suffix: str = "") -> str:
    """"Josh Allen" -> "J. Allen", "Marvin Harrison Jr." -> "M. Harrison Jr.", "Amon-Ra St. Brown" -> "A. St. Brown"."""
    if first and last:
        out = f"{first.strip()[0]}. {last.strip()}"
        return f"{out} {suffix.strip()}" if suffix.strip() and not out.lower().endswith(suffix.strip().lower()) else out
    parts = full.split()
    if len(parts) < 2:
        return full
    return f"{parts[0][0]}. {' '.join(parts[1:])}"


def american(x) -> str | None:
    """A price as the app shows it: "-110", "+105"; None when there isn't one."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if not v or abs(v) < 100:
        return None
    return f"+{v:g}" if v > 0 else f"{v:g}"
MARKETS = {"NFL": NFL_MARKETS, "NBA": NBA_MARKETS}
DEF_PHRASE = {
    "pass": "pass defenses", "rush": "run defenses", "def": "scoring defenses",
    "rec_WR": "defenses vs wide receivers", "rec_TE": "defenses vs tight ends", "rec_RB": "defenses vs running backs",
}


@dataclass
class PG:
    """One game a player played, with his team's situation in it."""
    key: str              # nflverse game_id or ESPN event id
    season: int
    t: str                # kickoff, sortable ("2026-11-26T20:20", Eastern)
    player: str
    team: str
    opp: str
    home: bool
    neutral: bool
    vals: dict            # market key -> value
    pos: str = ""
    prev_team: str = ""   # his team's previous game this season: W, L, T or ""
    rest: int = 7         # days since his team's previous game this season (99 if none)
    spread: float | None = None   # his team's line, negative = favorite
    div: bool = False
    prime: bool = False
    roof: str = ""        # outdoor | indoor | ""
    temp: float | None = None
    wind: float | None = None
    qb: str = ""          # his team's starting quarterback that game (most pass attempts)
    rank: dict = field(default_factory=dict)       # defense group -> opponent's rank at the time (1 = fewest allowed)
    prev_val: dict = field(default_factory=dict)   # market key -> his value in his previous game this season


@dataclass
class Cond:
    kind: str
    adj: str              # before "games": "home", "division"
    suffix: str           # after "games": "against the Chiefs"
    pred: object
    boost: float = 0.0
    rare: bool = False    # may use every season in the data, not just the last three


@dataclass
class Angle:
    sport: str
    player: str
    name: str
    team: str
    market: Market
    prop: str
    line: float
    side: str             # over | under
    hits: int
    games: int
    z: float
    zbase: float
    base: float
    window: str
    conds: tuple
    text: str = ""
    record: str = ""
    sample: list = field(default_factory=list)   # [(game key, value)] newest first
    relevance: float = 0.0

    @property
    def rate(self) -> float:
        return self.hits / self.games

    @property
    def strong(self) -> bool:
        return self.rate >= STRONG_RATE and self.z >= STRONG_Z and self.zbase >= STRONG_ZBASE

    @property
    def score(self) -> float:
        return self.z + 0.5 * self.zbase + self.relevance - 0.25 * max(0, len(self.conds) - 1)


def zscore(h: int, n: int, p: float = 0.5) -> float:
    if n == 0 or p <= 0 or p >= 1:
        return 0.0
    return (h - n * p) / math.sqrt(n * p * (1 - p))


def fmt_num(x: float) -> str:
    return f"{x:g}"


# ---------------------------------------------------------------- fetching
def get_json(url: str, tries: int = 4):
    err = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                return None
            err = e
        except Exception as e:  # network hiccup: back off and retry
            err = e
        time.sleep(1.5 * 2 ** attempt)
    raise RuntimeError(f"{url}: {err}")


def athlete_id(ref: str) -> str:
    m = re.search(r"/athletes/(\d+)", ref or "")
    return m.group(1) if m else ""


def item_prices(it: dict) -> dict:
    """{"over": "-110", "under": "-110"} when an item names its prices. ESPN's DraftKings prop items carry only
    the line today (the over and the under items are identical), so this is usually empty and the price stays null."""
    cur = it.get("current") or {}
    out = {}
    for side in ("over", "under"):
        for k in (side, f"{side}Odds"):
            v = cur.get(k)
            if isinstance(v, dict):
                v = v.get("american") or v.get("alternateDisplayValue") or v.get("value")
            p = american(v)
            if p:
                out[side] = p
    return out


def fetch_props(sport: str, event_id: str) -> dict:
    """{(ESPN athlete id, type name): (line, prices)} for DraftKings' main over/under (and yes/no anytime TD) lines."""
    base = f"https://sports.core.api.espn.com/v2/sports/{CFG[sport]['path']}/events/{event_id}/competitions/{event_id}/odds/100/propBets?lang=en&region=us&limit=1000"
    out, page, pages = {}, 1, 1
    while page <= pages:
        data = get_json(base + f"&page={page}")
        if not data:
            break
        pages = int(data.get("pageCount") or 1)
        for it in data.get("items", []):
            name = (it.get("type") or {}).get("name", "")
            if name not in MARKETS[sport]:
                continue  # milestones ladders, quarters, halves, team props, first scorer: not a single season-graded line
            aid = athlete_id((it.get("athlete") or {}).get("$ref", ""))
            if not aid:
                continue
            target = ((it.get("current") or {}).get("target") or {}).get("value")
            if name == "Anytime Touchdown Scorer":
                target = 0.5
            if target is None:
                continue
            line, prices = out.get((aid, name), (float(target), {}))
            if line == float(target):
                out[(aid, name)] = (line, {**prices, **item_prices(it)})
        page += 1
    return out


def fetch_injuries(sport: str, event_id: str) -> dict:
    """{ESPN team abbreviation: {ESPN athlete id: name}} for players listed Out (or on injured reserve) for this game."""
    data = None
    for host in ("site.api.espn.com", "site.web.api.espn.com"):
        try:
            data = get_json(f"https://{host}/apis/site/v2/sports/{CFG[sport]['site']}/summary?event={event_id}", tries=2)
        except RuntimeError:
            data = None
        if data:
            break
    out = {}
    for t in (data or {}).get("injuries", []):
        abbr = (t.get("team") or {}).get("abbreviation", "")
        outs = {}
        for i in t.get("injuries", []):
            status = (i.get("status") or "").lower()
            if status in ("out", "injured reserve"):
                a = i.get("athlete") or {}
                outs[str(a.get("id", ""))] = a.get("displayName", "")
        out[abbr] = outs
    return out


def scoreboard(sport: str, days: int) -> list[dict]:
    now = datetime.now(ET)
    events, seen = [], set()
    for i in range(days):
        d = (now + timedelta(days=i)).strftime("%Y%m%d")
        data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/{CFG[sport]['site']}/scoreboard?dates={d}") or {}
        for e in data.get("events", []):
            c = e["competitions"][0]
            if c["status"]["type"]["state"] != "pre" or e["id"] in seen:
                continue
            seen.add(e["id"])
            events.append(e)
    return events


# ---------------------------------------------------------------- shared history helpers
def link_previous(rows: list[PG], markets: dict) -> None:
    """Each game gets the player's value in his previous game of the same season."""
    by = defaultdict(list)
    for r in rows:
        by[r.player].append(r)
    for lst in by.values():
        lst.sort(key=lambda r: r.t)
        for a, b in zip(lst, lst[1:]):
            if a.season == b.season:
                b.prev_val = dict(a.vals)


def ranks_by_date(allowed: dict, min_games: int) -> dict:
    """allowed: {season: [(t, defense team, {group: value})]} -> {(season, t): {group: {team: rank}}}, using only games before t."""
    out = {}
    for season, recs in allowed.items():
        recs.sort(key=lambda x: x[0])
        times = sorted({t for t, _, _ in recs})
        tot = defaultdict(lambda: defaultdict(float))
        cnt = defaultdict(int)
        i = 0
        for t in times + ["9999"]:
            while i < len(recs) and recs[i][0] < t[:10]:
                rt, team, vals = recs[i]
                cnt[team] += 1
                for g, v in vals.items():
                    tot[team][g] += v
                i += 1
            groups = {g for _, _, v in recs for g in v}
            table = {}
            for g in groups:
                avg = [(tot[team][g] / cnt[team], team) for team in cnt if cnt[team] >= min_games]
                if len(avg) < 20:
                    continue
                avg.sort()
                table[g] = {team: n + 1 for n, (_, team) in enumerate(avg)}
                table[g]["_n"] = len(avg)
            out[(season, t[:10])] = table
    return out


def rank_at(ranks: dict, season: int, t: str) -> dict:
    return ranks.get((season, t[:10]), {})


# ---------------------------------------------------------------- NFL
class NFLData:
    def __init__(self, d: str, season: int):
        self.season = season
        self.games = list(csv.DictReader(open(os.path.join(d, "games.csv"))))
        self.gidx = {g["game_id"]: g for g in self.games}
        self.by_espn = {g["espn"]: g for g in self.games if g["espn"]}
        players = list(csv.DictReader(open(os.path.join(d, "players.csv"))))
        self.info = {p["gsis_id"]: p for p in players}
        self.espn_to_gsis = {p["espn_id"]: p["gsis_id"] for p in players if p["espn_id"]}
        self.gsis_to_espn = {p["gsis_id"]: p["espn_id"] for p in players if p["espn_id"]}
        pfr_to_gsis = {p["pfr_id"]: p["gsis_id"] for p in players if p["pfr_id"]}
        self.raw: dict[tuple, dict] = {}
        self.snaps: dict[tuple, str] = {}
        for s in range(CFG["NFL"]["since"], season + 1):
            path = os.path.join(d, f"stats_player_week_{s}.csv")
            if os.path.exists(path):
                for r in csv.DictReader(open(path)):
                    if r["season_type"] in ("REG", "POST") and r["game_id"] in self.gidx:
                        self.raw[(r["player_id"], r["game_id"])] = r
            path = os.path.join(d, f"snap_counts_{s}.csv")
            if os.path.exists(path):
                for r in csv.DictReader(open(path)):
                    gs = pfr_to_gsis.get(r["pfr_player_id"])
                    if gs and r["position"] in SKILL and float(r["offense_snaps"] or 0) > 0 and r["game_id"] in self.gidx:
                        self.snaps[(gs, r["game_id"])] = franchise(r["team"])
        self.build()

    def ctx(self):
        """Per (game_id, team): the team's situation, from games.csv."""
        out = {}
        last = {}
        for g in sorted(self.games, key=lambda r: (r["gameday"], r["gametime"] or "")):
            if g["game_type"] not in ("REG", "WC", "DIV", "CON", "SB"):
                continue
            s = int(g["season"])
            for side in ("home", "away"):
                team = franchise(g[f"{side}_team"])
                opp = franchise(g["away_team" if side == "home" else "home_team"])
                sp = float(g["spread_line"]) if g["spread_line"] else None
                roof = "outdoor" if g["roof"] in ("outdoors", "open") else ("indoor" if g["roof"] in ("dome", "closed") else "")
                out[(g["game_id"], team)] = {
                    "opp": opp, "home": side == "home", "neutral": g["location"] == "Neutral",
                    "spread": None if sp is None else (-sp if side == "home" else sp),
                    "div": g["div_game"] == "1", "prime": (g["gametime"] or "00:00") >= "19:00",
                    "roof": roof, "temp": float(g["temp"]) if g["temp"] else None, "wind": float(g["wind"]) if g["wind"] else None,
                    "rest": int(g[f"{side}_rest"] or 7), "prev": last.get((team, s), ""),
                    "t": f"{g['gameday']}T{g['gametime'] or '13:00'}", "season": s,
                    "qb_id": g[f"{side}_qb_id"], "qb_name": g[f"{side}_qb_name"],
                }
            if g["result"] != "":
                res = float(g["result"])
                for side in ("home", "away"):
                    team = franchise(g[f"{side}_team"])
                    won = res > 0 if side == "home" else res < 0
                    last[(team, s)] = "W" if won else ("L" if res != 0 else "T")
        return out

    def build(self):
        self.context = self.ctx()
        # the starting quarterback of each team-game: most pass attempts
        qb = {}
        for (pid, gid), r in self.raw.items():
            k = (gid, franchise(r["team"]))
            a = float(r["attempts"] or 0)
            if a > 0 and a > qb.get(k, ("", 0))[1]:
                qb[k] = (pid, a)
        self.qb = {k: v[0] for k, v in qb.items()}
        # yards allowed by each defense, per game, for the "against top-10 ... defenses" conditions
        allowed = defaultdict(lambda: defaultdict(float))
        for (pid, gid), r in self.raw.items():
            c = self.context.get((gid, franchise(r["team"])))
            if not c:
                continue
            d = allowed[(c["season"], gid, c["opp"], c["t"][:10])]
            d["pass"] += float(r["passing_yards"] or 0)
            d["rush"] += float(r["rushing_yards"] or 0)
            pos = (self.info.get(pid) or {}).get("position") or r["position"]
            pos = "RB" if pos == "FB" else pos
            if pos in ("WR", "TE", "RB"):
                d[f"rec_{pos}"] += float(r["receiving_yards"] or 0)
        per_season = defaultdict(list)
        for (s, gid, team, day), vals in allowed.items():
            per_season[s].append((day, team, dict(vals)))
        self.ranks = ranks_by_date(per_season, 3)
        rows = []
        keys = set(self.raw) | set(self.snaps)
        for pid, gid in keys:
            r = self.raw.get((pid, gid))
            team = franchise(r["team"]) if r else self.snaps[(pid, gid)]
            c = self.context.get((gid, team))
            if not c:
                continue
            vals = {m.key: (sum(float(r[col] or 0) for col in m.cols) if r else 0.0) for m in NFL_MARKETS.values()}
            info = self.info.get(pid) or {}
            pos = info.get("position") or (r["position"] if r else "")
            rows.append(PG(key=gid, season=c["season"], t=c["t"], player=pid, team=team, opp=c["opp"], home=c["home"],
                           neutral=c["neutral"], vals=vals, pos="RB" if pos == "FB" else pos, prev_team=c["prev"],
                           rest=c["rest"], spread=c["spread"], div=c["div"], prime=c["prime"], roof=c["roof"],
                           temp=c["temp"], wind=c["wind"], qb=self.qb.get((gid, team), ""),
                           rank=rank_at(self.ranks, c["season"], c["t"])))
        link_previous(rows, NFL_MARKETS)
        self.rows = rows
        self.by_player = defaultdict(list)
        for r in rows:
            self.by_player[r.player].append(r)
        for lst in self.by_player.values():
            lst.sort(key=lambda r: r.t, reverse=True)
        self.played = defaultdict(set)   # (game, team) -> players
        for r in rows:
            self.played[(r.key, r.team)].add(r.player)

    def name(self, pid: str) -> str:
        return (self.info.get(pid) or {}).get("display_name", "")

    def short(self, pid: str) -> str:
        p = self.info.get(pid) or {}
        first = p.get("common_first_name") or p.get("first_name") or ""
        return short_name(p.get("display_name", ""), first, p.get("last_name", ""), p.get("suffix", ""))

    def value(self, pid: str, gid: str, m: Market) -> float | None:
        """Raw recompute for the check pass: straight from the nflverse CSV rows."""
        r = self.raw.get((pid, gid))
        if r is not None:
            return sum(float(r[col] or 0) for col in m.cols)
        return 0.0 if (pid, gid) in self.snaps else None

    def raw_side(self, pid: str, gid: str) -> tuple[str, bool, bool]:
        g = self.gidx[gid]
        r = self.raw.get((pid, gid))
        team = franchise(r["team"]) if r else self.snaps[(pid, gid)]
        home = franchise(g["home_team"]) == team
        return franchise(g["away_team"] if home else g["home_team"]), home, g["location"] == "Neutral"


# ---------------------------------------------------------------- NBA
class NBAData:
    def __init__(self, history: list[str], boxes: list[str], season: int):
        self.season = season
        raw_games = [r for p in history for r in csv.DictReader(open(p))]
        self.gidx = {r["event_id"]: r for r in raw_games}   # later files (this season) win
        self.raw: dict[tuple, dict] = {}
        self.names: dict[str, str] = {}
        for p in boxes:
            for r in csv.DictReader(open(p)):
                self.raw[(r["athlete_id"], r["event_id"])] = r
                if r.get("name"):
                    self.names[r["athlete_id"]] = r["name"]
        self.build()

    def build(self):
        games = sorted(self.gidx.values(), key=lambda r: (r["start"], r["event_id"]))
        self.context = {}
        last = {}
        allowed = defaultdict(list)
        self.team_games = defaultdict(list)   # team -> [(t, event)] of every finished game
        for g in games:
            if g["home_pts"] == "" or g["away_pts"] == "":
                continue
            s = int(g["season"])
            start = datetime.fromisoformat(g["start"].replace("Z", "+00:00")).astimezone(ET)
            t = start.strftime("%Y-%m-%dT%H:%M")
            hp, ap = float(g["home_pts"]), float(g["away_pts"])
            for side in ("home", "away"):
                tid, oid = g[f"{side}_id"], g["away_id" if side == "home" else "home_id"]
                prev_t, prev_res = last.get((tid, s), (None, ""))
                rest = (start.date() - prev_t.date()).days if prev_t else 99
                hl = float(g["home_line"]) if g["home_line"] != "" else None
                self.context[(g["event_id"], tid)] = {
                    "opp": oid, "home": side == "home", "neutral": g["neutral"] == "1", "season": s, "t": t,
                    "spread": None if hl is None else (hl if side == "home" else -hl), "rest": rest, "prev": prev_res,
                }
                allowed[s].append((t[:10], oid, {"def": hp if side == "home" else ap}))  # what the opponent's defense allowed
                self.team_games[tid].append((t, g["event_id"]))
            for side in ("home", "away"):
                tid = g[f"{side}_id"]
                won = (hp > ap) if side == "home" else (ap > hp)
                last[(tid, s)] = (start, "W" if won else ("L" if hp != ap else "T"))
        self.last = last
        self.ranks = ranks_by_date(allowed, 5)
        rows = []
        for (aid, ev), r in self.raw.items():
            c = self.context.get((ev, r["team_id"]))
            if not c:
                continue
            vals = {m.key: float(sum(int(r[col]) for col in m.cols)) for m in NBA_MARKETS.values()}
            rows.append(PG(key=ev, season=c["season"], t=c["t"], player=aid, team=r["team_id"], opp=c["opp"], home=c["home"],
                           neutral=c["neutral"], vals=vals, prev_team=c["prev"], rest=c["rest"], spread=c["spread"],
                           rank=rank_at(self.ranks, c["season"], c["t"])))
        link_previous(rows, NBA_MARKETS)
        self.rows = rows
        self.by_player = defaultdict(list)
        for r in rows:
            self.by_player[r.player].append(r)
        for lst in self.by_player.values():
            lst.sort(key=lambda r: r.t, reverse=True)
        self.played = defaultdict(set)
        for r in rows:
            self.played[(r.key, r.team)].add(r.player)
        # finished games ESPN has no box score for: a player's history stops there so "his last n" stays literal
        boxed = {(ev, team) for (ev, team) in self.played}
        self.gaps = defaultdict(list)
        for team, lst in self.team_games.items():
            for t, ev in lst:
                if (ev, team) not in boxed:
                    self.gaps[team].append(t)

    def name(self, aid: str) -> str:
        return self.names.get(aid, "")

    def short(self, aid: str) -> str:
        return short_name(self.names.get(aid, ""))

    def value(self, aid: str, ev: str, m: Market) -> float | None:
        r = self.raw.get((aid, ev))
        return None if r is None else float(sum(int(r[col]) for col in m.cols))

    def raw_side(self, aid: str, ev: str) -> tuple[str, bool, bool]:
        g = self.gidx[ev]
        team = self.raw[(aid, ev)]["team_id"]
        home = g["home_id"] == team
        return (g["away_id"] if home else g["home_id"]), home, g["neutral"] == "1"


def cut_at_gaps(rows: list[PG], gaps: dict) -> list[PG]:
    """Newest-first rows, stopped before any unrecorded game of his team (NBA box scores ESPN never
    published): if his team played a game we can't see after one of his games, everything from that
    game back is dropped, so "his last n" never skips a game he may have played."""
    if not gaps:
        return rows
    for i, r in enumerate(rows):
        newer = rows[i - 1].t if i else "9999"
        if any(r.t < t < newer for t in gaps.get(r.team, [])):
            return rows[:i]
    return rows


# ---------------------------------------------------------------- the upcoming game
@dataclass
class Upcoming:
    sport: str
    event: str
    start: str            # ISO UTC
    t: str                # Eastern, sortable
    season: int
    matchup: str
    teams: dict           # side -> {"id", "abbr", "name", "opp_id"}
    ctx: dict             # team id -> situation for this game
    props: dict
    outs: dict            # team id -> {player id: name}


def team_conds(sport: str, u: Upcoming, team: str, data) -> list[Cond]:
    """Conditions true for this team in this game (the player-specific ones are added per player)."""
    c = u.ctx[team]
    big = CFG[sport]["big"]
    out = []
    if not c["neutral"]:
        if c["home"]:
            out.append(Cond("role", "home", "", lambda g: g.home and not g.neutral, 0.1))
        else:
            out.append(Cond("role", "road", "", lambda g: (not g.home) and not g.neutral, 0.1))
    out.append(Cond("opp", "", f"against the {c['opp_name']}", lambda g, o=c["opp"]: g.opp == o, 0.5, rare=True))
    if c["prev"] in ("W", "L"):
        out.append(Cond("prev", "", "after a loss" if c["prev"] == "L" else "after a win", lambda g, p=c["prev"]: g.prev_team == p, 0.2))
    if c.get("spread") is not None and c["spread"] != 0:
        fav = c["spread"] < 0
        out.append(Cond("fd", "", "as a favorite" if fav else "as an underdog", lambda g, f=fav: g.spread is not None and g.spread != 0 and (g.spread < 0) == f, 0.1))
        if abs(c["spread"]) >= big:
            out.append(Cond("big", "", f"as a {'favorite' if fav else 'n underdog'} of {big} or more".replace("a n ", "an "),
                            lambda g, f=fav: g.spread is not None and ((g.spread <= -big) if f else (g.spread >= big)), 0.2))
    if sport == "NFL":
        if c["rest"] >= 13:
            out.append(Cond("rest", "", "off a bye", lambda g: g.rest >= 13, 0.3, rare=True))
        elif c["rest"] <= 5:
            out.append(Cond("rest", "", "on a short week", lambda g: g.rest <= 5, 0.3, rare=True))
        if c["div"]:
            out.append(Cond("div", "division", "", lambda g: g.div, 0.2, rare=True))
        if c["prime"]:
            out.append(Cond("prime", "prime-time", "", lambda g: g.prime, 0.3, rare=True))
        if c["roof"] == "outdoor":
            out.append(Cond("roof", "outdoor", "", lambda g: g.roof == "outdoor", 0.1))
            if c.get("temp") is not None and c["temp"] <= 40:
                out.append(Cond("cold", "", "at 40 degrees or colder", lambda g: g.temp is not None and g.temp <= 40, 0.4, rare=True))
            if c.get("windy"):
                out.append(Cond("wind", "", "with winds of 15 mph or more", lambda g: g.wind is not None and g.wind >= 15, 0.4, rare=True))
        elif c["roof"] == "indoor":
            out.append(Cond("roof", "indoor", "", lambda g: g.roof == "indoor", 0.1))
    else:
        if c["rest"] == 1:
            out.append(Cond("rest", "", "on the second night of a back-to-back", lambda g: g.rest == 1, 0.3))
        elif 3 <= c["rest"] < 99:
            out.append(Cond("rest", "", "with two or more days of rest", lambda g: 3 <= g.rest < 99, 0.2))
    return out


def player_conds(sport: str, u: Upcoming, team: str, pid: str, m: Market, line: float, hist: list[PG], data) -> list[Cond]:
    c = u.ctx[team]
    out = []
    # his own last game against this number
    last = hist[0] if hist else None
    if last and last.season == u.season and line != 0.5 and m.key in last.vals:
        v = last.vals[m.key]
        when = CFG[sport]["prev"]
        if v > line:
            out.append(Cond("own", "", f"after topping {fmt_num(line)} {when}", lambda g, k=m.key, ln=line: k in g.prev_val and g.prev_val[k] > ln, 0.2))
        elif v < line:
            out.append(Cond("own", "", f"after finishing under {fmt_num(line)} {when}", lambda g, k=m.key, ln=line: k in g.prev_val and g.prev_val[k] < ln, 0.2))
    # the opponent's defense against his position
    if m.group:
        grp = m.group
        if grp == "rec":
            pos = hist[0].pos if hist else ""
            grp = f"rec_{pos}" if pos in ("WR", "TE", "RB") else ""
        table = c["ranks"].get(grp) if grp else None
        if table and c["opp"] in table:
            n = table["_n"]
            rk = table[c["opp"]]
            if rk <= 10 or rk > n - 10:
                top = rk <= 10
                out.append(Cond("defrank", "", f"against {'top' if top else 'bottom'}-10 {DEF_PHRASE[grp]}",
                                lambda g, grp=grp, top=top: grp in g.rank and g.opp in g.rank[grp] and
                                ((g.rank[grp][g.opp] <= 10) if top else (g.rank[grp][g.opp] > g.rank[grp]["_n"] - 10)), 0.4))
    # who his quarterback is (receivers and backs, this team only)
    if sport == "NFL" and hist and hist[0].pos in ("WR", "TE", "RB") and c.get("qb_id"):
        qb = c["qb_id"]
        qname = data.name(qb) or c.get("qb_name", "")
        if qname:
            mine = [g for g in hist if g.team == team and g.season >= u.season - (WINDOW_SEASONS - 1)]
            share = sum(1 for g in mine if g.qb == qb) / len(mine) if mine else 1
            out.append(Cond("qb", "", f"with {qname} at quarterback", lambda g, q=qb, tm=team: g.team == tm and g.qb == q,
                            0.6 if share < 0.6 else 0.1))
    # a key teammate out tonight: his games for this team, in seasons they shared, when that teammate sat
    for tid, tname in key_outs(sport, u, team, pid, data).items():
        span = teammate_span(data, tid, team, u.season)
        if not span:
            continue
        out.append(Cond("out", "", f"without {tname}",
                        lambda g, tid=tid, tm=team, span=span: g.team == tm and g.season in span and span[g.season][0] <= g.t <= span[g.season][1]
                        and tid not in data.played[(g.key, tm)], 0.6))
    return out


def teammate_span(data, tid: str, team: str, season: int) -> dict:
    """{season: (first, last)} of the teammate's games for this team; this season runs to now (he's still listed)."""
    span = {}
    for g in data.by_player.get(tid, []):
        if g.team != team:
            continue
        a, b = span.get(g.season, (g.t, g.t))
        span[g.season] = (min(a, g.t), max(b, g.t))
    if season in span:
        span[season] = (span[season][0], "9999")
    return span


def key_outs(sport: str, u: Upcoming, team: str, pid: str, data) -> dict:
    """Teammates listed out for this game who matter: the team's top 3 scorers (NBA), its top 2 targets and lead back (NFL)."""
    outs = u.outs.get(team, {})
    if not outs:
        return {}
    cache = data.__dict__.setdefault("_key_players", {})
    if (team, u.season) not in cache:
        by = defaultdict(list)
        for p, lst in data.by_player.items():
            for g in lst:
                if g.season < u.season:
                    break
                if g.team == team:
                    by[p].append(g)
        if sport == "NBA":
            ppg = sorted(((sum(g.vals["pts"] for g in lst) / len(lst), p) for p, lst in by.items() if len(lst) >= 5), reverse=True)
            keys = [p for _, p in ppg[:3]]
        else:
            tg = []
            for p, lst in by.items():
                raws = [data.raw.get((p, g.key)) for g in lst]
                tg.append((sum(float(r["targets"] or 0) for r in raws if r), sum(float(r["carries"] or 0) for r in raws if r), p))
            keys = [p for _, _, p in sorted(tg, reverse=True)[:2]] + [p for _, _, p in sorted(tg, key=lambda x: -x[1])[:1]]
        cache[(team, u.season)] = keys
    keys = cache[(team, u.season)]
    res = {}
    for k in keys:
        if k == pid:
            continue
        espn = data.gsis_to_espn.get(k, "") if sport == "NFL" else k
        if espn and espn in outs:
            res[k] = data.name(k) or outs[espn]
    return res


# ---------------------------------------------------------------- building lines
WINDOWS = ("recent", "season", "career", "team", "last10")


def phrase(conds: tuple) -> str:
    order = {"role": 0, "div": 1, "prime": 2, "roof": 3}
    adjs = [c.adj for c in sorted(conds, key=lambda c: order.get(c.kind, 9)) if c.adj]
    suffix_order = ["opp", "defrank", "qb", "out", "cold", "wind", "rest", "fd", "big", "prev", "own"]
    sufs = [c.suffix for c in sorted(conds, key=lambda c: suffix_order.index(c.kind) if c.kind in suffix_order else 99) if c.suffix]
    return " ".join(adjs + ["games"] + sufs)


def sentence(name: str, m: Market, line: float, side: str, hits: int, n: int, window: str, conds: tuple, team_name: str) -> tuple[str, str]:
    """(text, record) where record is the exact run of the text the app bolds."""
    if m.one and line == 0.5:
        verb = "has " + (m.one[0] if side == "over" else m.one[1])
    else:
        verb = f"has {'topped' if side == 'over' else 'stayed under'} {fmt_num(line)} {m.label}"
    games = phrase(conds)
    if window == "season":
        record = f"{hits} of his {n}"
        tail = f"{games} this season"
    elif window == "team":
        record = f"{hits} of his {n}"
        tail = f"{games} since joining the {team_name}"
    else:
        record = f"{hits} of his last {n}"
        tail = games
    return " ".join(f"{name} {verb} in {record} {tail}".split()), record


def combos(conds: list[Cond], size: int):
    out = [()] + [(c,) for c in conds]
    if size >= 2:
        bad = [{"fd", "big"}, {"roof", "cold"}, {"roof", "wind"}]
        for i, a in enumerate(conds):
            for b in conds[i + 1:]:
                if a.kind == b.kind or any(s <= {a.kind, b.kind} for s in bad):
                    continue
                out.append((a, b))
    return out


def evaluate(sport: str, u: Upcoming, team: str, pid: str, prop: str, line: float, data, team_name: str) -> list[Angle]:
    m = MARKETS[sport][prop]
    season = u.season
    hist = [g for g in data.by_player.get(pid, []) if g.t < u.t]
    hist = cut_at_gaps(hist, getattr(data, "gaps", {}))
    if not hist or hist[0].season < season - 1:
        return []
    name = data.name(pid)
    if not name:
        return []
    min_games = CFG[sport]["min_games"]
    recent = [g for g in hist if g.season >= season - (WINDOW_SEASONS - 1)]
    if len(recent) < min_games:
        return []
    base = {"over": sum(1 for g in recent if g.vals[m.key] > line) / len(recent),
            "under": sum(1 for g in recent if g.vals[m.key] < line) / len(recent)}
    conds = team_conds(sport, u, team, data) + player_conds(sport, u, team, pid, m, line, hist, data)
    # drop conditions that are true in nearly all his games: "with Josh Allen at quarterback" for a Bills receiver is just "all games"
    conds = [c for c in conds if sum(1 for g in recent if c.pred(g)) / len(recent) <= OBVIOUS_SHARE]
    windows = {"recent": recent, "season": [g for g in hist if g.season == season], "career": hist, "last10": recent[:10]}
    stint = []
    for g in hist:
        if g.team != team:
            break
        stint.append(g)
    if len(stint) < len(hist):   # he played for someone else before this team
        windows["team"] = stint
    out = []
    for window, rows in windows.items():
        if len(rows) < min_games:
            continue
        size = 2 if window in ("recent", "career") else (1 if window in ("season", "team") else 0)
        for combo in combos(conds, size):
            if window == "career" and not any(c.rare for c in combo):
                continue  # every season in the data only for rare situations (this opponent, the cold, prime time, ...)
            if window == "recent" and not combo:
                continue  # that's the base rate itself
            sel = [g for g in rows if all(c.pred(g) for c in combo)]
            n = len(sel)
            if n < min_games or sel[0].season < season - (RECENT_SEASONS - 1):
                continue
            if window == "career" and len(sel) == len([g for g in windows["recent"] if all(c.pred(g) for c in combo)]):
                continue  # no older games: the same sample as the recent window
            for side in ("over", "under"):
                hits = sum(1 for g in sel if (g.vals[m.key] > line if side == "over" else g.vals[m.key] < line))
                rate = hits / n
                if rate < FLOOR_RATE:
                    continue
                z = zscore(hits, n)
                zb = zscore(hits, n, base[side])
                if z < FLOOR_Z or zb < FLOOR_ZBASE:
                    continue
                text, record = sentence(name, m, line, side, hits, n, window, combo, team_name)
                rel = sum(c.boost for c in combo)
                rel += {"season": 0.0, "team": 0.4, "last10": -0.8, "recent": 0.0, "career": 0.0}[window]
                if not combo and window == "season":
                    rel -= 0.6     # "this season" alone is the obvious one
                out.append(Angle(sport, pid, name, team, m, prop, line, side, hits, n, z, zb, base[side], window,
                                 tuple(c.kind for c in combo), text, record, [(g.key, g.vals[m.key]) for g in sel], rel))
    return out


def verify(a: Angle, data, u: Upcoming) -> str | None:
    """The check pass: recompute the record from the raw rows, independently of PG. None when it holds."""
    if len(a.sample) != a.games or len({k for k, _ in a.sample}) != a.games:
        return "sample size"
    hits = 0
    for key, _ in a.sample:
        v = data.value(a.player, key, a.market)
        if v is None:
            return f"no raw row for {key}"
        hits += (v > a.line) if a.side == "over" else (v < a.line)
        opp, home, neutral = data.raw_side(a.player, key)
        if "role" in a.conds and (neutral or home != u.ctx[a.team]["home"]):
            return f"home/road wrong in {key}"
        if "opp" in a.conds and opp != u.ctx[a.team]["opp"]:
            return f"opponent wrong in {key}"
    if hits != a.hits:
        return f"hits {hits} != {a.hits}"
    if a.record not in a.text or f"{fmt_num(a.line)}" not in a.text and a.line != 0.5:
        return "sentence lost its numbers"
    if not re.search(rf"\b{a.hits} of his (last )?{a.games}\b", a.text):
        return "record wording"
    if BANNED.search(a.text) or DASHES.search(a.text):
        return "wording"
    return None


def choose(angles: list[Angle]) -> list[Angle]:
    """Top 3 for a game: one per player, different markets when there are enough to go around."""
    ranked = sorted(angles, key=lambda a: (a.strong, a.score), reverse=True)
    best = {}
    for a in ranked:
        best.setdefault(a.player, a)
    pool = list(best.values())
    picks, markets = [], set()
    for a in pool:
        if len(picks) < TOP_N and a.market.key not in markets:
            picks.append(a)
            markets.add(a.market.key)
    for a in pool:
        if len(picks) < TOP_N and a not in picks:
            picks.append(a)
    return sorted(picks, key=lambda a: (a.strong, a.score), reverse=True)


# ---------------------------------------------------------------- upcoming games per league
def nfl_upcoming(data: NFLData, days: int) -> list[Upcoming]:
    out = []
    for e in scoreboard("NFL", days):
        g = data.by_espn.get(e["id"])
        if not g:
            print(f"  {e['shortName']}: not in nflverse games.csv yet", flush=True)
            continue
        c = e["competitions"][0]
        venue = c.get("venue") or {}
        weather = e.get("weather") or {}
        ctx = data.context.get((g["game_id"], franchise(g["home_team"])))
        t = ctx["t"]
        season = int(g["season"])
        teams, situ = {}, {}
        espn_abbr = {x["homeAway"]: x["team"]["abbreviation"] for x in c["competitors"]}
        for side in ("home", "away"):
            team = franchise(g[f"{side}_team"])
            k = data.context[(g["game_id"], team)]
            roof = k["roof"] or ("indoor" if venue.get("indoor") else ("outdoor" if venue.get("indoor") is False else ""))
            temp = weather.get("temperature") if roof == "outdoor" else None
            situ[team] = {**k, "roof": roof, "temp": float(temp) if temp is not None else None,
                          "windy": "wind" in (weather.get("displayValue") or "").lower(),
                          "opp_name": NFL_TEAMS.get(k["opp"], k["opp"]),
                          "ranks": rank_at(data.ranks, season, t) or latest_ranks(data.ranks, season)}
            teams[side] = {"id": team, "abbr": espn_abbr.get(side, team), "name": NFL_TEAMS.get(team, team)}
        injuries = fetch_injuries("NFL", e["id"])
        outs = {teams[s]["id"]: injuries.get(teams[s]["abbr"], {}) for s in ("home", "away")}
        out.append(Upcoming("NFL", e["id"], e["date"], t, season,
                            f"{teams['away']['name']} {'vs' if g['location'] == 'Neutral' else 'at'} {teams['home']['name']}",
                            teams, situ, fetch_props("NFL", e["id"]), outs))
    return out


def latest_ranks(ranks: dict, season: int) -> dict:
    keys = sorted(k for k in ranks if k[0] == season)
    return ranks[keys[-1]] if keys else {}


def nba_upcoming(data: NBAData, days: int) -> list[Upcoming]:
    out = []
    for e in scoreboard("NBA", days):
        c = e["competitions"][0]
        start = datetime.fromisoformat(e["date"].replace("Z", "+00:00")).astimezone(ET)
        t = start.strftime("%Y-%m-%dT%H:%M")
        season = int((e.get("season") or {}).get("year") or data.season)
        odds = (c.get("odds") or [{}])[0]
        details = (odds.get("details") or "").strip()
        h = next(x for x in c["competitors"] if x["homeAway"] == "home")
        a = next(x for x in c["competitors"] if x["homeAway"] == "away")
        home_line = None
        if details.upper() in ("EVEN", "PK"):
            home_line = 0.0
        elif details:
            abbr, _, num = details.rpartition(" ")
            try:
                home_line = -abs(float(num)) if abbr == h["team"]["abbreviation"] else abs(float(num))
            except ValueError:
                home_line = None
        teams, situ = {}, {}
        ranks = latest_ranks(data.ranks, season)
        for side, me, op in (("home", h, a), ("away", a, h)):
            tid, oid = me["team"]["id"], op["team"]["id"]
            prev_t, prev_res = data.last.get((tid, season), (None, ""))
            rest = (start.date() - prev_t.date()).days if prev_t else 99
            situ[tid] = {"opp": oid, "home": side == "home", "neutral": bool(c.get("neutralSite")), "rest": rest, "prev": prev_res,
                         "spread": None if home_line is None else (home_line if side == "home" else -home_line),
                         "opp_name": op["team"].get("name") or op["team"].get("shortDisplayName"), "ranks": ranks}
            teams[side] = {"id": tid, "abbr": me["team"]["abbreviation"], "name": me["team"].get("name") or me["team"].get("shortDisplayName")}
        injuries = fetch_injuries("NBA", e["id"])
        outs = {teams[s]["id"]: injuries.get(teams[s]["abbr"], {}) for s in ("home", "away")}
        out.append(Upcoming("NBA", e["id"], e["date"], t, season, f"{teams['away']['name']} at {teams['home']['name']}",
                            teams, situ, fetch_props("NBA", e["id"]), outs))
    return out


def run_game(u: Upcoming, data) -> tuple[list[Angle], int, int]:
    """(chosen lines, candidates, dropped by the check pass)"""
    by_team = {u.teams[s]["id"]: u.teams[s]["name"] for s in ("home", "away")}
    angles = []
    for (aid, prop), (line, _prices) in u.props.items():
        pid = data.espn_to_gsis.get(aid) if u.sport == "NFL" else aid
        if not pid:
            continue
        hist = data.by_player.get(pid, [])
        cur = next((g for g in hist if g.season == u.season and g.t < u.t), None)
        if not cur or cur.team not in by_team:
            continue  # hasn't played this season, or not for either team: no current team to speak for
        angles.extend(evaluate(u.sport, u, cur.team, pid, prop, line, data, by_team[cur.team]))
    ranked = sorted(angles, key=lambda a: (a.strong, a.score), reverse=True)
    good, dropped = [], 0
    for a in ranked:
        if len(good) >= 60:
            break
        why = verify(a, data, u)
        if why:
            dropped += 1
            print(f"  CHECK FAILED ({why}): {a.text}", flush=True)
            continue
        good.append(a)
    return choose(good), len(angles), dropped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", choices=["nfl", "nba"])
    ap.add_argument("--nflverse", default="", help="directory with nflverse games.csv, players.csv, stats_player_week_*.csv, snap_counts_*.csv")
    ap.add_argument("--history", nargs="+", default=[], help="NBA: espn_history.py CSVs, completed seasons then this one")
    ap.add_argument("--boxes", nargs="+", default=[], help="NBA: nba_boxes.py CSVs, completed seasons then this one")
    ap.add_argument("--season", type=int, default=0)
    ap.add_argument("--days", type=int, default=0)
    ap.add_argument("--json", default="")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    sport = args.league.upper()
    if sport == "NFL":
        data = NFLData(args.nflverse, args.season)
        games = nfl_upcoming(data, args.days or 7)
    else:
        data = NBAData(args.history, args.boxes, args.season)
        data.espn_to_gsis = {}
        games = nba_upcoming(data, args.days or 2)
    print(f"{sport}: {len(data.rows)} player-games of history, {len(games)} upcoming games", flush=True)
    results = []
    for u in games:
        picks, n, dropped = run_game(u, data)
        print(f"\n{u.matchup} ({u.t}, {len(u.props)} props): {n} candidates, {dropped} failed the check, {len(picks)} kept", flush=True)
        for i, a in enumerate(picks, 1):
            print(f"  {i}. [{'strong' if a.strong else 'fallback'} {a.score:.2f} z{a.z:.1f}/{a.zbase:.1f} base {a.base:.0%}] {a.text}", flush=True)
        results.append({
            "espn_event_id": u.event, "sport": sport, "starts_at": u.start, "matchup": u.matchup, "props": len(u.props), "candidates": n,
            "check_failed": dropped,
            "lines": [{"player_name": a.name, "short_name": data.short(a.player),
                       "espn_athlete_id": (data.gsis_to_espn.get(a.player, "") if sport == "NFL" else a.player),
                       "team": next(u.teams[s]["abbr"] for s in ("home", "away") if u.teams[s]["id"] == a.team),
                       "market": a.market.key, "market_short": MARKET_SHORT[a.market.key], "prop": a.prop, "line": a.line, "side": a.side,
                       "price": u.props[(data.gsis_to_espn.get(a.player, "") if sport == "NFL" else a.player, a.prop)][1].get(a.side),
                       "text": a.text, "hits": a.hits,
                       "games": a.games, "record": a.record, "tier": "strong" if a.strong else "fallback", "rank": i,
                       "z": round(a.z, 2), "z_base": round(a.zbase, 2), "base_rate": round(a.base, 3), "window": a.window,
                       "conditions": list(a.conds)} for i, a in enumerate(picks, 1)],
        })
    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)


# ---------------------------------------------------------------- self-test
def self_test() -> None:
    """Synthetic history: wording, pushes, thresholds, the check pass and the top-3 rules."""
    class Fake:
        pass

    m = NBA_MARKETS["Total Points"]
    rows = []
    # 30 games over three seasons: home games 26+ points, road games 20 (and one 24.5-exact push can't happen with .5 lines)
    for i in range(30):
        s = 2025 + i // 10
        home = i % 2 == 0
        rows.append(PG(key=f"e{i}", season=s, t=f"{s}-01-{(i % 10) + 10}T19:00", player="p1", team="T1", opp="T2" if i % 3 else "T3",
                       home=home, neutral=False, vals={k.key: 0.0 for k in NBA_MARKETS.values()} | {"pts": 30.0 if home else 18.0},
                       prev_team="L" if i % 4 == 0 else "W", rest=1 if i % 5 == 0 else 2))
    data = Fake()
    data.by_player = {"p1": sorted(rows, key=lambda r: r.t, reverse=True)}
    data.played = defaultdict(set)
    for r in rows:
        data.played[(r.key, r.team)].add("p1")
    data.gaps = {}
    data.name = lambda pid: "Test Player"
    data.value = lambda pid, key, mk: next(r.vals[mk.key] for r in rows if r.key == key)
    data.raw_side = lambda pid, key: next((r.opp, r.home, r.neutral) for r in rows if r.key == key)
    data.espn_to_gsis = {}
    u = Upcoming("NBA", "x", "2027-02-01T00:00Z", "2027-02-01T19:00", 2027, "A at B",
                 {"home": {"id": "T1", "abbr": "T1", "name": "Ones"}, "away": {"id": "T2", "abbr": "T2", "name": "Twos"}},
                 {"T1": {"opp": "T2", "home": True, "neutral": False, "rest": 2, "prev": "W", "spread": -3.0, "opp_name": "Twos", "ranks": {}}},
                 {("p1", "Total Points"): (24.5, {})}, {})
    angles = evaluate("NBA", u, "T1", "p1", "Total Points", 24.5, data, "Ones")
    home = [a for a in angles if a.conds == ("role",) and a.window == "recent"]
    assert home, "the home angle should qualify"
    a = home[0]
    assert (a.hits, a.games, a.side) == (15, 15, "over"), (a.hits, a.games, a.side)
    assert a.text == "Test Player has topped 24.5 points in 15 of his last 15 home games", a.text
    assert a.record == "15 of his last 15" and a.strong
    assert verify(a, data, u) is None
    # tampering is caught
    bad = Angle(**{**a.__dict__, "hits": 14})
    assert verify(bad, data, u) is not None
    bad = Angle(**{**a.__dict__, "text": a.text.replace("topped", "should hit")})
    assert verify(bad, data, u) == "wording" or verify(bad, data, u) == "sentence lost its numbers"
    # pushes count as misses for both sides
    for r in rows[:3]:
        r.vals["pts"] = 24.0
    ang = evaluate("NBA", u, "T1", "p1", "Total Points", 24.0, data, "Ones")
    for x in ang:
        assert verify(x, data, u) is None, verify(x, data, u)
        assert all(v != 24.0 for k, v in x.sample) or x.hits < x.games
    # no "all games" in the recent window, and nothing below the floor
    assert not [x for x in angles if x.window == "recent" and not x.conds]
    assert all(x.rate >= FLOOR_RATE and x.z >= FLOOR_Z for x in angles)
    # sentences for 0.5 lines and windows
    t, rec = sentence("A B", NFL_MARKETS["Total Passing Interceptions (incl. overtime)"], 0.5, "under", 9, 12, "recent", (), "Bills")
    assert t == "A B has not thrown an interception in 9 of his last 12 games" and rec == "9 of his last 12", t
    t, rec = sentence("A B", NBA_MARKETS["Total Points"], 27.5, "over", 9, 11, "team", (), "Heat")
    assert t == "A B has topped 27.5 points in 9 of his 11 games since joining the Heat", t
    cs = (Cond("opp", "", "against the Chiefs", None), Cond("role", "road", "", None))
    assert phrase(cs) == "road games against the Chiefs"
    # top 3: one per player, markets varied when possible
    mk = lambda p, mkt, z: Angle("NBA", p, p, "T1", mkt, "", 1.5, "over", 9, 10, z, 2.5, 0.5, "recent", ("role",), "x", "9 of his last 10")
    pts, reb = NBA_MARKETS["Total Points"], NBA_MARKETS["Total Rebounds"]
    picks = choose([mk("a", pts, 4), mk("a", reb, 3.9), mk("b", pts, 3.8), mk("c", reb, 3.0), mk("d", pts, 2.9)])
    assert [p.player for p in picks] == ["a", "b", "c"], [p.player for p in picks]
    picks = choose([mk("a", pts, 4), mk("b", pts, 3.8), mk("c", pts, 3.7), mk("d", reb, 2.5)])
    assert {p.market.key for p in picks} == {"pts", "reb"} and len(picks) == 3
    # gaps: a game with no box score stops the history there
    g = [PG(key=str(i), season=2027, t=f"2027-01-{20 - i:02d}T19:00", player="p", team="T", opp="O", home=True, neutral=False, vals={}) for i in range(5)]
    assert len(cut_at_gaps(g, {"T": ["2027-01-17T12:00"]})) == 4
    assert len(cut_at_gaps(g, {"T": ["2027-01-25T19:00"]})) == 0
    assert len(cut_at_gaps(g, {})) == 5
    assert short_name("Josh Allen") == "J. Allen" and short_name("Jaren Jackson Jr.") == "J. Jackson Jr."
    assert short_name("Amon-Ra St. Brown", "Amon-Ra", "St. Brown") == "A. St. Brown"
    assert short_name("Marvin Harrison Jr.", "Marvin", "Harrison", "Jr.") == "M. Harrison Jr."
    assert american(-110) == "-110" and american("105") == "+105" and american(None) is None and american(1.9) is None
    assert set(MARKET_SHORT) >= {m.key for mk in MARKETS.values() for m in mk.values()}
    print("self-test passed")


if __name__ == "__main__":
    main()
