"""Player lines (DECISIONS D-105, D-106): for every upcoming NFL and NBA game, true facts
about its players measured against that game's actual DraftKings prop number.

"Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games." A fact,
never a pick. No cost here: the props come from ESPN's public odds feed (DraftKings,
provider 100), the history from nflverse (NFL: weekly stats, snap counts, PFR blitz
counts, schedules with coaches and weather) and ESPN box scores (NBA). Every number is
computed here and recomputed by the check pass before it can ship.

This engine writes the candidates; the judge in ingest-player-lines (D-106) picks the one
line a game shows and may reword it, never change its numbers.

For each player and market with a line, it builds every condition that is TRUE for this
game, alone and in pairs, and measures his record against the number in each:
  the defense     tonight's opponent at either end of the league this season (Pass YPG,
                  Rush YPG and points allowed, yards to his position, sacks, blitz rate;
                  NBA points and threes allowed, pace), with a ticker that names
                  tonight's opponent's exact rank: "CHI DEF 7th in Rush YPG Allowed"
  special dates   Thanksgiving, Christmas, season openers, season finales, international
                  games, off a bye (at least 5 games, 80% or better)
  his team        his quarterback when it isn't the usual one, a top teammate out
  the matchup     this head coach (NFL), his former team, this opponent
  the setting     prime time, national TV, division, indoors or outdoors, the cold, wind,
                  short week, back-to-backs and rest
  his form        after a big game, after going over or being held under this number,
                  after heavy minutes
  plain splits    home or road, favorite or underdog, after a win or a loss
over his last three seasons, this season, his games since joining a new team, his last
10, and (for rare situations) every game in the data. Each sample is literally "his last
n" such games. Over and under are both tried; a push counts as a miss for both.

A condition has to leave out at least a quarter of his games in the window (a QB who
started every one of them, "this season" for a rookie, are not stats). A line needs a
real sample (NFL 8 games, NBA 10, special dates 5), a game in the last two seasons, a
high hit rate, distance from a coin flip and from his own rate against this number, a
number that isn't trivial, and nothing his current season contradicts.

Usage:
  python3 -I scripts/angles/player_angles.py --league nfl --nflverse <dir> --season 2026 --days 7 --json nfl_players.json
  python3 -I scripts/angles/player_angles.py --league nba --history data/history/nba_espn.csv <nba_current.csv> \\
      --boxes data/history/nba_players_espn.csv <nba_players_current.csv> \\
      --teams data/history/nba_team_games_espn.csv <nba_team_games_current.csv> --season 2027 --days 2 --json nba_players.json
  python3 -I scripts/angles/player_angles.py --self-test
<dir> holds nflverse's games.csv, players.csv and, per season, stats_player_week_<s>.csv,
snap_counts_<s>.csv and advstats_week_pass_<s>.csv.
"""
import argparse
import csv
import gzip
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
import zlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}

CFG = {
    "NFL": {"path": "football/leagues/nfl", "site": "football/nfl", "min_games": 8, "since": 2018, "prev": "the week before",
            "big": 7, "def_min": 3},
    "NBA": {"path": "basketball/leagues/nba", "site": "basketball/nba", "min_games": 10, "since": 2023, "prev": "the game before",
            "big": 7, "def_min": 5},
}
WINDOW_SEASONS = 3          # "his last n" samples reach back three seasons, this one included
RECENT_SEASONS = 2          # and need a game in the last two
STRONG_RATE, STRONG_Z, STRONG_ZBASE = 0.75, 2.0, 2.0
FLOOR_RATE, FLOOR_Z, FLOOR_ZBASE = 0.70, 1.75, 1.25
MIN_UPLIFT = 0.10           # the condition has to move his rate at least 10 points from his usual
MAX_SHARE = 0.75            # a condition must leave out at least a quarter of his games, or it isn't a stat
MAX_BASE = 0.75             # a side he already hits 75%+ of the time isn't news, whatever the condition
SEASON_CHECK = {"NFL": 4, "NBA": 5}   # with this many games this season, a line can't contradict it
SPECIAL_MIN_GAMES, SPECIAL_RATE, SPECIAL_Z = 5, 0.80, 1.3   # special dates: small samples, high bar
FRESH_SHARE = 0.5           # at least half the sample from this season and the two before, or it ranks last
PAIR_PENALTY = 0.6
TOP_N = 3                   # stored per game
CANDIDATES = 12             # sent to the judge per game
CHECKED = 120               # the best candidates per game that go through the check pass
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
INTL_STADIUMS = re.compile(r"Tottenham|Wembley|Twickenham|Azteca|Allianz|Deutsche Bank|Corinthians|Melbourne|Maracan|Stade|Bernab|Croke|Olympiastadion", re.I)


def franchise(t: str) -> str:
    return FRANCHISE.get(t, t)


@dataclass(frozen=True)
class Market:
    key: str
    stat: str             # how the sentence names it: "Pass Yds", "catches"
    cols: tuple           # raw columns summed into the stat
    family: str           # pass | rush | rec | td | nba
    one: tuple | None = None   # (over, under) wording for a 0.5 line: ("thrown an interception", "not thrown an interception")
    floor: float = 0.0    # lines at or below this are trivial ("over 0.5 catches") and skipped
    yards: bool = False   # "gone for more than 72.5 Rec Yds" reads right only for yards
    terms: tuple = ()     # words the judge's sentence must keep when the stat name isn't in it (0.5 lines)


NFL_MARKETS = {
    "Total Passing Yards (incl. overtime)": Market("pass_yds", "Pass Yds", ("passing_yards",), "pass", floor=99.5, yards=True),
    "Total Pass Completions (incl. overtime)": Market("completions", "completions", ("completions",), "pass", floor=9.5),
    "Total Passing Attempts (incl. overtime)": Market("pass_att", "pass attempts", ("attempts",), "pass", floor=14.5),
    "Total Passing Touchdowns (incl. overtime)": Market("pass_tds", "Pass TDs", ("passing_tds",), "pass",
                                                        ("thrown a TD pass", "been held without a TD pass"), terms=("Pass TD", "TD pass", "touchdown pass")),
    "Total Passing Interceptions (incl. overtime)": Market("ints", "interceptions", ("passing_interceptions",), "pass",
                                                           ("thrown an interception", "not thrown an interception"), terms=("interception",)),
    "Total Passing Plus Rushing Yards (incl. overtime)": Market("pass_rush_yds", "Pass + Rush Yds", ("passing_yards", "rushing_yards"), "pass", floor=99.5, yards=True),
    "Total Rushing Yards (incl. overtime)": Market("rush_yds", "Rush Yds", ("rushing_yards",), "rush", floor=14.5, yards=True),
    "Total Carries (incl. overtime)": Market("carries", "carries", ("carries",), "rush", floor=5.5),
    "Total Receiving Yards (incl. overtime)": Market("rec_yds", "Rec Yds", ("receiving_yards",), "rec", floor=14.5, yards=True),
    "Total Receptions (incl. overtime)": Market("receptions", "catches", ("receptions",), "rec", floor=1.5),
    "Total Rushing Plus Receiving Yards (incl. overtime)": Market("rush_rec_yds", "Rush + Rec Yds", ("rushing_yards", "receiving_yards"), "rush", floor=19.5, yards=True),
    # Yes/no market: no number in the feed, so it's graded against 0.5 touchdowns (passing touchdowns don't count)
    "Anytime Touchdown Scorer": Market("anytime_td", "touchdowns", ("rushing_tds", "receiving_tds", "special_teams_tds", "fumble_recovery_tds"), "td",
                                       ("scored", "not scored"), terms=("scored", "touchdown", "TD")),
}
NBA_MARKETS = {
    "Total Points": Market("pts", "Pts", ("pts",), "nba", floor=7.5),
    "Total Rebounds": Market("reb", "Reb", ("reb",), "nba", floor=2.5),
    "Total Assists": Market("ast", "Ast", ("ast",), "nba", floor=1.5),
    "Total 3-Point Field Goals": Market("fg3", "threes", ("fg3",), "nba", ("hit a three", "been held without a three"), terms=("three",)),
    "Total Points and Rebounds": Market("pts_reb", "Pts + Reb", ("pts", "reb"), "nba", floor=9.5),
    "Total Points and Assists": Market("pts_ast", "Pts + Ast", ("pts", "ast"), "nba", floor=9.5),
    "Total Assists and Rebounds": Market("reb_ast", "Reb + Ast", ("reb", "ast"), "nba", floor=4.5),
    "Total Points, Rebounds, and Assists": Market("pra", "Pts + Reb + Ast", ("pts", "reb", "ast"), "nba", floor=12.5),
    "Total Steals": Market("stl", "steals", ("stl",), "nba", ("recorded a steal", "been held without a steal"), terms=("steal",)),
    "Total Blocks": Market("blk", "blocks", ("blk",), "nba", ("blocked a shot", "been held without a block"), terms=("block",)),
}
MARKETS = {"NFL": NFL_MARKETS, "NBA": NBA_MARKETS}
# The bet as the app names it under the sentence: "J. Allen O 240.5 Pass Yds"
MARKET_SHORT = {
    "pass_yds": "Pass Yds", "pass_tds": "Pass TDs", "pass_att": "Pass Att", "completions": "Comp", "ints": "INTs",
    "pass_rush_yds": "Pass+Rush Yds", "rush_yds": "Rush Yds", "carries": "Rush Att", "rec_yds": "Rec Yds", "receptions": "Rec",
    "rush_rec_yds": "Rush+Rec Yds", "anytime_td": "Anytime TD",
    "pts": "Pts", "reb": "Reb", "ast": "Ast", "fg3": "3PM", "stl": "Stl", "blk": "Blk", "pra": "PRA",
    "pts_reb": "Pts+Reb", "pts_ast": "Pts+Ast", "reb_ast": "Reb+Ast",
}

# Opponent defense this season, as of each game (games before it only). "more": rank 1 is the most
# (sacks, blitz rate, pace); otherwise rank 1 is the fewest allowed. top = the league's first 10 that way.
# Each names tonight's opponent's exact rank in a ticker ("CHI DEF 7th in Rush YPG Allowed").
DEF_FEATURES = {
    "pass":   {"top": "top-10 pass defenses", "bottom": "bottom-10 pass defenses", "ticker": "Pass YPG Allowed"},
    "rush":   {"top": "top-10 run defenses", "bottom": "bottom-10 run defenses", "ticker": "Rush YPG Allowed"},
    "pts":    {"top": "top-10 scoring defenses", "bottom": "bottom-10 scoring defenses", "ticker": "PPG Allowed"},
    "rec_WR": {"top": "top-10 defenses against WRs", "bottom": "bottom-10 defenses against WRs", "ticker": "Rec YPG Allowed to WRs"},
    "rec_TE": {"top": "top-10 defenses against TEs", "bottom": "bottom-10 defenses against TEs", "ticker": "Rec YPG Allowed to TEs"},
    "rec_RB": {"top": "top-10 defenses against RBs", "bottom": "bottom-10 defenses against RBs", "ticker": "Rec YPG Allowed to RBs"},
    "sacks":  {"more": True, "top": "the 10 defenses with the most sacks", "bottom": "the 10 defenses with the fewest sacks", "ticker": "Sacks"},
    "blitz":  {"more": True, "top": "the 10 defenses that blitz the most", "bottom": "the 10 defenses that blitz the least", "ticker": "Blitz Rate"},
    "pa":     {"top": "top-10 scoring defenses", "bottom": "bottom-10 scoring defenses", "ticker": "Pts Allowed"},
    "fg3a":   {"top": "the 10 teams that allow the fewest threes", "bottom": "the 10 teams that allow the most threes", "ticker": "3PM Allowed"},
    "pace":   {"more": True, "top": "fast-paced teams", "bottom": "slow-paced teams", "ticker": "Pace"},
}
# which defense features speak to which markets ("rec_POS" = yards allowed to his position; "@RB" = only for backs)
FEATURES_FOR = {
    "pass_yds": ["pass", "blitz", "sacks"], "pass_rush_yds": ["pass", "blitz", "sacks"],
    "completions": ["pass", "blitz"], "pass_att": ["pass", "blitz"],
    "pass_tds": ["pts", "pass", "blitz"], "ints": ["blitz", "pass", "sacks"],
    "rush_yds": ["rush"], "rush_rec_yds": ["rush"], "carries": ["rush"],
    "rec_yds": ["rec_POS", "pass"], "receptions": ["rec_POS", "pass"],
    "anytime_td": ["pts", "rush@RB", "rec_POS@WR", "rec_POS@TE"],
    "pts": ["pa", "pace"], "pts_reb": ["pa", "pace"], "pts_ast": ["pa", "pace"], "pra": ["pa", "pace"], "fg3": ["fg3a", "pace"],
    "reb": ["pace"], "ast": ["pace"], "reb_ast": ["pace"], "stl": ["pace"], "blk": ["pace"],
}
BIG_GAMES = {   # (stat, threshold, phrase) for "after a big game", by market family
    "pass": ("passing_yards", 300, "after a 300-yard passing game"),
    "rush": ("rushing_yards", 100, "after a 100-yard rushing game"),
    "rec": ("receiving_yards", 100, "after a 100-yard receiving game"),
    "nba": ("pts", 30, "after a 30-point game"),
}
SPECIAL = {   # kind -> (adjective, noun) for the games phrase
    "thanksgiving": ("Thanksgiving", "games"), "christmas": ("Christmas", "games"), "intl": ("international", "games"),
    "week1": ("", "season openers"), "finale": ("", "season finales"),
}
# Families, in the engine's order of preference (the judge has the final say, D-106)
FAMILY = {"defense": "defense", "special": "special", "out": "teammates", "qbout": "teammates", "qb": "teammates",
          "coach": "coach", "former": "coach", "opp": "opponent", "prime": "setting", "tv": "setting", "div": "setting",
          "roof": "setting", "cold": "setting", "wind": "setting", "rest": "setting", "own": "form", "big": "form",
          "mins": "form", "role": "plain", "fd": "plain", "bigline": "plain", "prev": "plain"}
TIER = {"defense": 1, "special": 1, "teammates": 2, "coach": 3, "opponent": 4, "setting": 5, "form": 6, "plain": 7, "none": 8}
BOOST = {"defense": 1.5, "special": 1.5, "teammates": 1.5, "coach": 1.4, "opponent": 1.0, "setting": 0.7, "form": 0.5, "plain": 0.0}
MATCHUP = {"defense", "coach", "former", "out", "qbout", "qb", "cold", "wind", "opp"}   # one of a pair must be one of these
# ...and the other one of these, so a pair still reads as one plain idea ("road games vs top-10 pass defenses",
# "as a favorite vs top-10 pass defenses"); "after a win" and form clauses only stand alone (owner, Nov 24:
# "against the 10 defenses with the fewest missed tackles after a win" is word garbage)
PAIR_PARTNER = MATCHUP | {"role", "roof", "div", "prime", "tv", "fd", "bigline", "rest"}
# The players a game's line can be about: the starting quarterback, the lead back and the top three
# receivers by their DraftKings lines (NBA: the top four by points line) on each team
FEATURED = {"NFL": [("pass_yds", 1), ("rush_yds", 1), ("rec_yds", 3)], "NBA": [("pts", 4)]}
VERBS = {"over": ["gone over", "cleared", "topped"], "over_yards": ["gone for more than"],
         "under": ["been held under", "stayed under", "finished under"]}


def short_name(full: str, first: str = "", last: str = "", suffix: str = "") -> str:
    """"Josh Allen" -> "J. Allen", "Marvin Harrison Jr." -> "M. Harrison Jr.", "Amon-Ra St. Brown" -> "A. St. Brown"."""
    if first and last:
        out = f"{first.strip()[0]}. {last.strip()}"
        sfx = suffix.strip()
        return f"{out} {sfx}" if sfx and not out.lower().endswith(sfx.lower()) else out
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


def possessive(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def thanksgiving(d: date) -> bool:
    """The fourth Thursday of November."""
    return d.month == 11 and d.weekday() == 3 and 22 <= d.day <= 28


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
    tv: bool = False      # national TV (NBA)
    roof: str = ""        # outdoor | indoor | ""
    temp: float | None = None
    wind: float | None = None
    qb: str = ""          # his team's starting quarterback that game (most pass attempts)
    coach_opp: str = ""   # the opposing head coach (NFL)
    special: frozenset = frozenset()   # thanksgiving, christmas, week1, finale, intl
    defense: dict = field(default_factory=dict)    # feature -> (rank, teams ranked, value) for the opponent at the time
    prev: dict = field(default_factory=dict)       # his previous game this season: market values, plus raw extras


@dataclass
class Cond:
    kind: str
    adj: str              # before the noun: "home", "division", "Thanksgiving"
    suffix: str           # after it: "vs the Chiefs"
    pred: object
    rare: bool = False    # may use every season in the data, not just the last three
    noun: str = ""        # replaces "games": "season openers"
    team_only: bool = False   # about his current team (QB, teammates): share measured on his games for it
    feature: str = ""     # the defense feature, for the ticker and the angle type
    ticker: str | None = None

    @property
    def family(self) -> str:
        return FAMILY.get(self.kind, "plain")

    @property
    def angle_type(self) -> str:
        return f"{self.family}:{self.feature or self.kind}"


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
    conds: tuple          # the Cond objects
    text: str = ""
    record: str = ""
    sample: list = field(default_factory=list)   # [(game key, value)] newest first
    prominence: float = 0.0
    recent_share: float = 1.0

    @property
    def kinds(self) -> tuple:
        return tuple(c.kind for c in self.conds)

    @property
    def rate(self) -> float:
        return self.hits / self.games

    @property
    def special(self) -> bool:
        return any(c.kind == "special" for c in self.conds)

    @property
    def strong(self) -> bool:
        if self.special:
            return self.rate >= SPECIAL_RATE and self.hits >= SPECIAL_MIN_GAMES
        return self.rate >= STRONG_RATE and self.z >= STRONG_Z and self.zbase >= STRONG_ZBASE

    @property
    def family(self) -> str:
        if self.window == "team" and not self.conds:
            return "form"
        fams = [c.family for c in self.conds]
        return min(fams, key=lambda f: TIER[f]) if fams else "none"

    @property
    def angle_type(self) -> str:
        best = [c for c in self.conds if c.family == self.family]
        return best[0].angle_type if best else f"{self.family}:{self.window}"

    @property
    def ticker(self) -> str | None:
        return next((c.ticker for c in self.conds if c.ticker), None)

    @property
    def fresh(self) -> bool:
        """Mostly recent games (special dates are yearly, so they're exempt)."""
        return self.special or self.recent_share >= FRESH_SHARE

    @property
    def score(self) -> float:
        credibility = min(1.0, 0.4 * math.log2(max(1, self.games) / CFG[self.sport]["min_games"])) if self.games >= CFG[self.sport]["min_games"] else 0.0
        words = len(self.text.split())
        relevance = sum(BOOST.get(c.family, 0) for c in self.conds) + (0.6 if self.window == "team" else 0) - (0.8 if self.window == "last10" else 0)
        return (3 * self.rate + 0.35 * min(self.z, 4) + 0.5 * min(self.zbase, 4) + relevance + self.prominence + credibility
                - PAIR_PENALTY * max(0, len(self.conds) - 1) - 0.06 * max(0, words - 20))

    @property
    def order(self):
        return (self.fresh, -TIER[self.family], self.strong, self.score)


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
                body = r.read()
            if body[:2] == b"\x1f\x8b":   # ESPN sometimes gzips without being asked
                body = gzip.decompress(body)
            if not body:
                raise ValueError("empty response")   # a bad cached copy at ESPN's edge: try again
            return json.loads(body)
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
                continue  # milestone ladders, quarters, halves, team props, first scorer: not one season-graded line
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
        try:
            # &limit keeps the URL off a stale cached copy ESPN's edge sometimes serves empty
            data = get_json(f"https://site.api.espn.com/apis/site/v2/sports/{CFG[sport]['site']}/scoreboard?dates={d}&limit=200") or {}
        except RuntimeError as e:
            print(f"  scoreboard {d}: {e}", flush=True)
            continue
        for e in data.get("events", []):
            c = e["competitions"][0]
            if c["status"]["type"]["state"] != "pre" or e["id"] in seen:
                continue
            seen.add(e["id"])
            events.append(e)
    return events


# ---------------------------------------------------------------- shared history helpers
def link_previous(rows: list, extras) -> None:
    """Each game gets the player's previous game of the same season (its market values and extras)."""
    by = defaultdict(list)
    for r in rows:
        by[r.player].append(r)
    for lst in by.values():
        lst.sort(key=lambda r: r.t)
        for a, b in zip(lst, lst[1:]):
            if a.season == b.season:
                b.prev = {**a.vals, **extras(a)}


def defense_tables(records: dict, spec: dict, min_games: int) -> dict:
    """records: {season: [(day, defense team, {key: value})]}; spec: {feature: (numerator, denominator or None = per game)}.
    -> {(season, day): {feature: {team: (rank, teams ranked, value)}}}, rank 1 = lowest value, from games before that day only."""
    out = {}
    for season, recs in records.items():
        recs.sort(key=lambda x: x[0])
        days = sorted({d for d, _, _ in recs})
        tot = defaultdict(lambda: defaultdict(float))
        cnt = defaultdict(int)
        i = 0
        for day in days + ["9999-12-31"]:
            while i < len(recs) and recs[i][0] < day:
                _, team, vals = recs[i]
                cnt[team] += 1
                for k, v in vals.items():
                    tot[team][k] += v
                i += 1
            table = {}
            for feat, (num, den) in spec.items():
                vals = []
                for team in cnt:
                    if cnt[team] < min_games or num not in tot[team]:
                        continue
                    d = tot[team][den] if den else cnt[team]
                    if d > 0:
                        vals.append((tot[team][num] / d, team))
                if len(vals) < 20:
                    continue
                vals.sort()
                table[feat] = {team: (n + 1, len(vals), v) for n, (v, team) in enumerate(vals)}
            out[(season, day)] = table
    return out


def latest_table(tables: dict, season: int) -> dict:
    keys = sorted(k for k in tables if k[0] == season)
    return tables[keys[-1]] if keys else {}


def natural_rank(feature: str, rank: int, n: int) -> int:
    """The rank people say: 1st in Rush YPG Allowed = allows the fewest; 1st in Sacks = the most."""
    return n - rank + 1 if DEF_FEATURES[feature].get("more") else rank


class History:
    """What both leagues share: the per-player index and the lookups the conditions use."""
    def index(self, rows):
        self.rows = rows
        self.by_player = defaultdict(list)
        for r in rows:
            self.by_player[r.player].append(r)
        for lst in self.by_player.values():
            lst.sort(key=lambda r: r.t, reverse=True)
        self.played = defaultdict(set)   # (game, team) -> players
        for r in rows:
            self.played[(r.key, r.team)].add(r.player)


# ---------------------------------------------------------------- NFL
NFL_DEF_SPEC = {"pass": ("pass", None), "rush": ("rush", None), "rec_WR": ("rec_WR", None), "rec_TE": ("rec_TE", None),
                "rec_RB": ("rec_RB", None), "pts": ("pts", None), "sacks": ("sacks", None), "blitz": ("blitzed", "dropbacks_adv")}


def nfl_special(g: dict, last_week: dict) -> frozenset:
    out = set()
    d = date.fromisoformat(g["gameday"])
    if g["game_type"] == "REG":
        if thanksgiving(d):
            out.add("thanksgiving")
        if g["week"] == "1":
            out.add("week1")
        if int(g["week"]) == last_week.get(g["season"], 0):
            out.add("finale")
        if g["location"] == "Neutral" and INTL_STADIUMS.search(g.get("stadium") or ""):
            out.add("intl")
    if d.month == 12 and d.day == 25:
        out.add("christmas")
    return frozenset(out)


class NFLData(History):
    def __init__(self, d: str, season: int):
        self.season = season
        self.games = list(csv.DictReader(open(os.path.join(d, "games.csv"))))
        self.gidx = {g["game_id"]: g for g in self.games}
        self.by_espn = {g["espn"]: g for g in self.games if g["espn"]}
        self.last_week = defaultdict(int)
        for g in self.games:
            if g["game_type"] == "REG":
                self.last_week[g["season"]] = max(self.last_week[g["season"]], int(g["week"]))
        players = list(csv.DictReader(open(os.path.join(d, "players.csv"))))
        self.info = {p["gsis_id"]: p for p in players}
        self.espn_to_gsis = {p["espn_id"]: p["gsis_id"] for p in players if p["espn_id"]}
        self.gsis_to_espn = {p["gsis_id"]: p["espn_id"] for p in players if p["espn_id"]}
        self.pfr_to_gsis = {p["pfr_id"]: p["gsis_id"] for p in players if p["pfr_id"]}
        self.raw: dict[tuple, dict] = {}
        self.snaps: dict[tuple, str] = {}
        self.adv_pass = []
        for s in range(CFG["NFL"]["since"], season + 1):
            path = os.path.join(d, f"stats_player_week_{s}.csv")
            if os.path.exists(path):
                for r in csv.DictReader(open(path)):
                    if r["season_type"] in ("REG", "POST") and r["game_id"] in self.gidx:
                        self.raw[(r["player_id"], r["game_id"])] = r
            path = os.path.join(d, f"snap_counts_{s}.csv")
            if os.path.exists(path):
                for r in csv.DictReader(open(path)):
                    gs = self.pfr_to_gsis.get(r["pfr_player_id"])
                    if gs and r["position"] in SKILL and float(r["offense_snaps"] or 0) > 0 and r["game_id"] in self.gidx:
                        self.snaps[(gs, r["game_id"])] = franchise(r["team"])
            path = os.path.join(d, f"advstats_week_pass_{s}.csv")
            if os.path.exists(path):
                self.adv_pass.extend(r for r in csv.DictReader(open(path)) if r["game_id"] in self.gidx)
        self.build()

    def ctx(self):
        """Per (game_id, team): the team's situation, from games.csv."""
        out = {}
        last = {}
        for g in sorted(self.games, key=lambda r: (r["gameday"], r["gametime"] or "")):
            if g["game_type"] not in ("REG", "WC", "DIV", "CON", "SB"):
                continue
            s = int(g["season"])
            special = nfl_special(g, self.last_week)
            for side in ("home", "away"):
                other = "away" if side == "home" else "home"
                team = franchise(g[f"{side}_team"])
                sp = float(g["spread_line"]) if g["spread_line"] else None
                roof = "outdoor" if g["roof"] in ("outdoors", "open") else ("indoor" if g["roof"] in ("dome", "closed") else "")
                out[(g["game_id"], team)] = {
                    "opp": franchise(g[f"{other}_team"]), "home": side == "home", "neutral": g["location"] == "Neutral",
                    "spread": None if sp is None else (-sp if side == "home" else sp),
                    "div": g["div_game"] == "1", "prime": (g["gametime"] or "00:00") >= "19:00",
                    "roof": roof, "temp": float(g["temp"]) if g["temp"] else None, "wind": float(g["wind"]) if g["wind"] else None,
                    "rest": int(g[f"{side}_rest"] or 7), "prev": last.get((team, s), ""),
                    "t": f"{g['gameday']}T{g['gametime'] or '13:00'}", "season": s, "special": special,
                    "qb_id": g[f"{side}_qb_id"], "qb_name": g[f"{side}_qb_name"],
                    "coach_opp": g[f"{other}_coach"], "pts_allowed": float(g[f"{other}_score"]) if g[f"{other}_score"] else None,
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
        # what each defense allowed, per game: yards by kind and position, points and sacks (nflverse), and
        # blitzes per dropback from the opposing quarterbacks' PFR rows
        allowed = defaultdict(lambda: defaultdict(float))

        def slot(gid, offense_team):
            c = self.context.get((gid, franchise(offense_team)))
            return allowed[(c["season"], gid, c["opp"], c["t"][:10])] if c else None
        for (pid, gid), r in self.raw.items():
            d = slot(gid, r["team"])
            if d is None:
                continue
            d["pass"] += float(r["passing_yards"] or 0)
            d["rush"] += float(r["rushing_yards"] or 0)
            d["sacks"] += float(r["sacks_suffered"] or 0)
            pos = (self.info.get(pid) or {}).get("position") or r["position"]
            pos = "RB" if pos == "FB" else pos
            if pos in ("WR", "TE", "RB"):
                d[f"rec_{pos}"] += float(r["receiving_yards"] or 0)
        for r in self.adv_pass:
            d = slot(r["game_id"], r["team"])
            st = self.raw.get((self.pfr_to_gsis.get(r["pfr_player_id"], ""), r["game_id"]))
            if d is None or st is None:
                continue
            d["blitzed"] += float(r["times_blitzed"] or 0)
            d["dropbacks_adv"] += float(st["attempts"] or 0) + float(st["sacks_suffered"] or 0)
        per_season = defaultdict(list)
        for (s, gid, team, day), vals in allowed.items():
            pts = self.context.get((gid, team), {}).get("pts_allowed")
            if pts is not None:
                vals["pts"] = pts
            per_season[s].append((day, team, dict(vals)))
        self.tables = defense_tables(per_season, NFL_DEF_SPEC, CFG["NFL"]["def_min"])
        rows = []
        for pid, gid in set(self.raw) | set(self.snaps):
            r = self.raw.get((pid, gid))
            team = franchise(r["team"]) if r else self.snaps[(pid, gid)]
            c = self.context.get((gid, team))
            if not c:
                continue
            vals = {m.key: (sum(float(r[col] or 0) for col in m.cols) if r else 0.0) for m in NFL_MARKETS.values()}
            info = self.info.get(pid) or {}
            pos = info.get("position") or (r["position"] if r else "")
            table = self.tables.get((c["season"], c["t"][:10]), {})
            rows.append(PG(key=gid, season=c["season"], t=c["t"], player=pid, team=team, opp=c["opp"], home=c["home"],
                           neutral=c["neutral"], vals=vals, pos="RB" if pos == "FB" else pos, prev_team=c["prev"],
                           rest=c["rest"], spread=c["spread"], div=c["div"], prime=c["prime"], roof=c["roof"],
                           temp=c["temp"], wind=c["wind"], qb=self.qb.get((gid, team), ""), coach_opp=c["coach_opp"],
                           special=c["special"], defense={f: t[c["opp"]] for f, t in table.items() if c["opp"] in t}))

        def extras(g):
            r = self.raw.get((g.player, g.key)) or {}
            return {k: float(r.get(k) or 0) for k in ("passing_yards", "rushing_yards", "receiving_yards")}
        link_previous(rows, extras)
        self.index(rows)

    def name(self, pid: str) -> str:
        return (self.info.get(pid) or {}).get("display_name", "")

    def short(self, pid: str) -> str:
        p = self.info.get(pid) or {}
        first = p.get("common_first_name") or p.get("first_name") or ""
        return short_name(p.get("display_name", ""), first, p.get("last_name", ""), p.get("suffix", ""))

    def prev_stat(self, g: PG, stat: str) -> float:
        r = self.raw.get((g.player, g.key))
        return float(r.get(stat) or 0) if r else 0.0

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

    def raw_flags(self, pid: str, gid: str) -> dict:
        """The situational facts of a past game, read again from games.csv for the check pass."""
        g = self.gidx[gid]
        _, home, _ = self.raw_side(pid, gid)
        return {"prime": (g["gametime"] or "00:00") >= "19:00", "div": g["div_game"] == "1",
                "roof": "outdoor" if g["roof"] in ("outdoors", "open") else ("indoor" if g["roof"] in ("dome", "closed") else ""),
                "cold": bool(g["temp"]) and float(g["temp"]) < 35, "coach": g["away_coach" if home else "home_coach"],
                "special": nfl_special(g, self.last_week)}


# ---------------------------------------------------------------- NBA
NBA_DEF_SPEC = {"pa": ("pts_allowed", None), "fg3a": ("fg3_allowed", None), "pace": ("poss", None)}


class NBAData(History):
    def __init__(self, history: list[str], boxes: list[str], teams: list[str], season: int):
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
        self.team_box = {}
        for p in teams:
            for r in csv.DictReader(open(p)):
                self.team_box[(r["event_id"], r["team_id"])] = r
        self.gsis_to_espn = {}
        self.espn_to_gsis = {}
        self.build()

    def build(self):
        games = sorted(self.gidx.values(), key=lambda r: (r["start"], r["event_id"]))
        self.context = {}
        last = {}
        records = defaultdict(list)
        self.team_games = defaultdict(list)   # team -> [(t, event)] of every finished game
        fg3 = defaultdict(int)
        for (aid, ev), r in self.raw.items():
            fg3[(ev, r["team_id"])] += int(r["fg3"])

        def poss(b):
            return float(b["fga"]) - float(b["oreb"]) + float(b["tov"]) + 0.44 * float(b["fta"])
        for g in games:
            if g["home_pts"] == "" or g["away_pts"] == "":
                continue
            s = int(g["season"])
            start = datetime.fromisoformat(g["start"].replace("Z", "+00:00")).astimezone(ET)
            t = start.strftime("%Y-%m-%dT%H:%M")
            hp, ap = float(g["home_pts"]), float(g["away_pts"])
            hb, ab = self.team_box.get((g["event_id"], g["home_id"])), self.team_box.get((g["event_id"], g["away_id"]))
            tv = bool(hb and hb.get("national_tv") == "1")
            special = frozenset({"christmas"} if (start.month, start.day) == (12, 25) else set())
            for side in ("home", "away"):
                tid, oid = g[f"{side}_id"], g["away_id" if side == "home" else "home_id"]
                prev_t, prev_res = last.get((tid, s), (None, ""))
                rest = (start.date() - prev_t.date()).days if prev_t else 99
                hl = float(g["home_line"]) if g["home_line"] != "" else None
                self.context[(g["event_id"], tid)] = {
                    "opp": oid, "home": side == "home", "neutral": g["neutral"] == "1", "season": s, "t": t, "tv": tv,
                    "spread": None if hl is None else (hl if side == "home" else -hl), "rest": rest, "prev": prev_res,
                    "special": special,
                }
                self.team_games[tid].append((t, g["event_id"]))
            for me, other, pts_against in ((g["home_id"], g["away_id"], ap), (g["away_id"], g["home_id"], hp)):
                vals = {"pts_allowed": pts_against}
                if (g["event_id"], other) in fg3:
                    vals["fg3_allowed"] = float(fg3[(g["event_id"], other)])
                if hb and ab:
                    vals["poss"] = (poss(hb) + poss(ab)) / 2
                records[s].append((t[:10], me, vals))
            for side in ("home", "away"):
                tid = g[f"{side}_id"]
                won = (hp > ap) if side == "home" else (ap > hp)
                last[(tid, s)] = (start, "W" if won else ("L" if hp != ap else "T"))
        self.last = last
        self.tables = defense_tables(records, NBA_DEF_SPEC, CFG["NBA"]["def_min"])
        rows = []
        for (aid, ev), r in self.raw.items():
            c = self.context.get((ev, r["team_id"]))
            if not c:
                continue
            vals = {m.key: float(sum(int(r[col]) for col in m.cols)) for m in NBA_MARKETS.values()}
            table = self.tables.get((c["season"], c["t"][:10]), {})
            rows.append(PG(key=ev, season=c["season"], t=c["t"], player=aid, team=r["team_id"], opp=c["opp"], home=c["home"],
                           neutral=c["neutral"], vals=vals, prev_team=c["prev"], rest=c["rest"], spread=c["spread"], tv=c["tv"],
                           special=c["special"], defense={f: tb[c["opp"]] for f, tb in table.items() if c["opp"] in tb}))
        link_previous(rows, lambda g: {"min": float(self.raw[(g.player, g.key)]["min"])})
        self.index(rows)
        # finished games ESPN has no box score for: a player's history stops there so "his last n" stays literal
        self.gaps = defaultdict(list)
        for team, lst in self.team_games.items():
            for t, ev in lst:
                if (ev, team) not in self.played:
                    self.gaps[team].append(t)

    def name(self, aid: str) -> str:
        return self.names.get(aid, "")

    def short(self, aid: str) -> str:
        return short_name(self.names.get(aid, ""))

    def prev_stat(self, g: PG, stat: str) -> float:
        return g.vals.get(stat, 0.0)

    def value(self, aid: str, ev: str, m: Market) -> float | None:
        r = self.raw.get((aid, ev))
        return None if r is None else float(sum(int(r[col]) for col in m.cols))

    def raw_side(self, aid: str, ev: str) -> tuple[str, bool, bool]:
        g = self.gidx[ev]
        team = self.raw[(aid, ev)]["team_id"]
        home = g["home_id"] == team
        return (g["away_id"] if home else g["home_id"]), home, g["neutral"] == "1"

    def raw_flags(self, aid: str, ev: str) -> dict:
        b = self.team_box.get((ev, self.raw[(aid, ev)]["team_id"])) or {}
        start = datetime.fromisoformat(self.gidx[ev]["start"].replace("Z", "+00:00")).astimezone(ET)
        return {"tv": b.get("national_tv") == "1", "special": frozenset({"christmas"} if (start.month, start.day) == (12, 25) else set())}


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
    teams: dict           # side -> {"id", "abbr", "name"}
    ctx: dict             # team id -> situation for this game
    props: dict
    outs: dict            # team id -> {ESPN athlete id: name}
    special: frozenset = frozenset()


def team_conds(sport: str, u: Upcoming, team: str) -> list[Cond]:
    """Conditions true for this team in this game (the player-specific ones are added per player)."""
    c = u.ctx[team]
    big = CFG[sport]["big"]
    out = []
    if not c["neutral"]:
        if c["home"]:
            out.append(Cond("role", "home", "", lambda g: g.home and not g.neutral))
        else:
            out.append(Cond("role", "road", "", lambda g: (not g.home) and not g.neutral))
    out.append(Cond("opp", "", f"vs the {c['opp_name']}", lambda g, o=c["opp"]: g.opp == o, rare=True))
    if c["prev"] in ("W", "L"):
        out.append(Cond("prev", "", "after a loss" if c["prev"] == "L" else "after a win", lambda g, p=c["prev"]: g.prev_team == p))
    if c.get("spread") is not None and c["spread"] != 0:
        fav = c["spread"] < 0
        out.append(Cond("fd", "", "as a favorite" if fav else "as an underdog", lambda g, f=fav: g.spread is not None and g.spread != 0 and (g.spread < 0) == f))
        if abs(c["spread"]) >= big:
            out.append(Cond("bigline", "", f"as a favorite of {big} or more" if fav else f"as an underdog of {big} or more",
                            lambda g, f=fav: g.spread is not None and ((g.spread <= -big) if f else (g.spread >= big))))
    for kind in sorted(u.special):
        adj, noun = SPECIAL[kind]
        out.append(Cond("special", adj, "", lambda g, k=kind: k in g.special, rare=True, noun=noun if noun != "games" else "", feature=kind))
    if sport == "NFL":
        if c.get("coach_opp"):
            coach = c["coach_opp"]
            out.append(Cond("coach", "", f"vs {possessive(coach)} teams", lambda g, k=coach: g.coach_opp == k, rare=True))
        if c["rest"] >= 13:
            out.append(Cond("special", "", "off a bye", lambda g: 13 <= g.rest < 99, rare=True, feature="bye"))
        elif c["rest"] <= 5:
            out.append(Cond("rest", "", "on a short week", lambda g: g.rest <= 5, rare=True))
        if c["div"]:
            out.append(Cond("div", "division", "", lambda g: g.div, rare=True))
        if c["prime"]:
            out.append(Cond("prime", "prime-time", "", lambda g: g.prime, rare=True))
        if c["roof"] == "outdoor":
            out.append(Cond("roof", "outdoor", "", lambda g: g.roof == "outdoor"))
            if c.get("temp") is not None and c["temp"] < 35:
                out.append(Cond("cold", "", "in temperatures under 35 degrees", lambda g: g.temp is not None and g.temp < 35, rare=True))
            if c.get("windy"):
                out.append(Cond("wind", "", "in winds of 15 mph or more", lambda g: g.wind is not None and g.wind >= 15, rare=True))
        elif c["roof"] == "indoor":
            out.append(Cond("roof", "indoor", "", lambda g: g.roof == "indoor"))
    else:
        if c["rest"] == 1:
            out.append(Cond("rest", "", "on the second night of a back-to-back", lambda g: g.rest == 1))
        elif 3 <= c["rest"] < 99:
            out.append(Cond("rest", "", "on two or more days of rest", lambda g: 3 <= g.rest < 99))
        if c.get("tv"):
            out.append(Cond("tv", "national TV", "", lambda g: g.tv))
    return out


def defense_conds(sport: str, u: Upcoming, team: str, m: Market, pos: str) -> list[Cond]:
    """Tonight's opponent at one end of the league for what this market measures, with its exact rank as the ticker."""
    c = u.ctx[team]
    opp_abbr = c["opp_abbr"]
    out = []
    for f in FEATURES_FOR[m.key]:
        f, _, only = f.partition("@")
        if only and only != pos:
            continue
        if f == "rec_POS":
            if pos not in ("WR", "TE", "RB"):
                continue
            f = f"rec_{pos}"
        cur = c["defense"].get(f)
        if not cur:
            continue
        spec = DEF_FEATURES[f]
        rank, n, _ = cur
        nat = natural_rank(f, rank, n)
        ticker = f"{opp_abbr} {'DEF ' if sport == 'NFL' else ''}{ordinal(nat)} in {spec['ticker']}"
        # rank 1 = the lowest value; "top" is the league's first 10 in the natural direction
        low, high = rank <= 10, rank > n - 10
        if not (low or high):
            continue
        is_top = high if spec.get("more") else low
        if spec.get("more"):
            pred = (lambda g, f=f: f in g.defense and g.defense[f][0] > g.defense[f][1] - 10) if high else \
                   (lambda g, f=f: f in g.defense and g.defense[f][0] <= 10)
        else:
            pred = (lambda g, f=f: f in g.defense and g.defense[f][0] <= 10) if low else \
                   (lambda g, f=f: f in g.defense and g.defense[f][0] > g.defense[f][1] - 10)
        out.append(Cond("defense", "", f"vs {spec['top'] if is_top else spec['bottom']}", pred, feature=f, ticker=ticker))
    return out


def player_conds(sport: str, u: Upcoming, team: str, pid: str, m: Market, line: float, hist: list[PG], data) -> list[Cond]:
    c = u.ctx[team]
    out = []
    pos = hist[0].pos if hist else ""
    when = CFG[sport]["prev"]
    last = hist[0] if hist else None
    if last and last.season == u.season:
        if line != 0.5 and m.key in last.vals:
            v = last.vals[m.key]
            if v > line:
                out.append(Cond("own", "", f"after going over {fmt_num(line)} {when}", lambda g, k=m.key, ln=line: k in g.prev and g.prev[k] > ln))
            elif v < line:
                out.append(Cond("own", "", f"after being held under {fmt_num(line)} {when}", lambda g, k=m.key, ln=line: k in g.prev and g.prev[k] < ln))
        big = BIG_GAMES.get(m.family)
        if big and not (sport == "NBA" and m.key not in ("pts", "pts_reb", "pts_ast", "pra", "fg3")):
            stat, thr, ph = big
            if data.prev_stat(last, stat) >= thr:
                out.append(Cond("big", "", ph, lambda g, s=stat, x=thr: g.prev.get(s, -1) >= x))
        if sport == "NBA" and float(data.raw[(last.player, last.key)]["min"]) >= 38:
            out.append(Cond("mins", "", f"after playing 38 or more minutes {when}", lambda g: g.prev.get("min", 0) >= 38))
    out.extend(defense_conds(sport, u, team, m, pos))
    # his former team: games against them after he left
    left = {}
    in_stint = True
    for g in hist:   # newest first: the first game for another team ends his current stint
        if in_stint and g.team == team:
            continue
        in_stint = False
        left.setdefault(g.team, g.t)
    if c["opp"] in left:
        out.append(Cond("former", "", f"vs the {c['opp_name']}, his former team",
                        lambda g, o=c["opp"], x=left[c["opp"]]: g.opp == o and g.t > x, rare=True))
    if sport == "NFL" and pos in ("WR", "TE", "RB") and c.get("qb_id"):
        qb = c["qb_id"]
        qname = data.name(qb) or c.get("qb_name", "")
        if qname:
            out.append(Cond("qb", "", f"with {qname} at QB", lambda g, q=qb, tm=team: g.team == tm and g.qb == q, team_only=True))
        starts = defaultdict(int)
        for g in hist:
            if g.season == u.season and g.team == team and g.qb:
                starts[g.qb] += 1
        usual = max(starts, key=starts.get) if starts else ""
        if usual and usual != qb and data.name(usual):
            span = teammate_span(data, usual, team, u.season)
            out.append(Cond("qbout", "", f"without {data.name(usual)} at QB",
                            lambda g, q=usual, tm=team, span=span: g.team == tm and g.season in span
                            and span[g.season][0] <= g.t <= span[g.season][1] and g.qb != q, team_only=True))
    for tid, tname in key_outs(sport, u, team, pid, data).items():
        span = teammate_span(data, tid, team, u.season)
        if span:
            out.append(Cond("out", "", f"without {tname}",
                            lambda g, tid=tid, tm=team, span=span: g.team == tm and g.season in span
                            and span[g.season][0] <= g.t <= span[g.season][1] and tid not in data.played[(g.key, tm)], team_only=True))
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
    res = {}
    for k in cache[(team, u.season)]:
        if k == pid:
            continue
        espn = data.gsis_to_espn.get(k, "") if sport == "NFL" else k
        if espn and espn in outs:
            res[k] = data.name(k) or outs[espn]
    return res


# ---------------------------------------------------------------- writing lines
def phrase(conds: tuple, team_name: str = "", team_only_sample: bool = False) -> str:
    """The games a record covers: "road division games after a Cowboys win", "Thanksgiving games"."""
    order = {"role": 0, "special": 1, "div": 2, "prime": 3, "tv": 4, "roof": 5}
    adjs = [c.adj for c in sorted(conds, key=lambda c: order.get(c.kind, 9)) if c.adj]
    noun = next((c.noun for c in conds if c.noun), "games")
    suffix_order = ["opp", "former", "coach", "defense", "qb", "qbout", "out", "special", "cold", "wind", "rest", "fd", "bigline", "prev", "big", "own", "mins"]
    sufs = []
    for c in sorted(conds, key=lambda c: suffix_order.index(c.kind) if c.kind in suffix_order else 99):
        if not c.suffix:
            continue
        s = c.suffix
        if c.kind == "prev" and team_name and team_only_sample:
            s = s.replace("a win", f"a {team_name} win").replace("a loss", f"a {team_name} loss")
        sufs.append(s)
    merged = []
    for sfx in sufs:   # "vs top-10 pass defenses and ...", "without A and B"
        word = sfx.split(" ", 1)[0]
        if merged and word in ("vs", "without") and merged[-1].startswith(word + " "):
            merged[-1] += " and " + sfx[len(word) + 1:]
        else:
            merged.append(sfx)
    return " ".join(adjs + [noun] + merged)


def pick_verb(m: Market, side: str, seed: str) -> str:
    options = VERBS[side] + (VERBS["over_yards"] if side == "over" and m.yards else [])
    return options[zlib.crc32(seed.encode()) % len(options)]


def sentence(name: str, m: Market, line: float, side: str, hits: int, n: int, window: str, conds: tuple, team_name: str,
             team_only_sample: bool = False, seed: str = "") -> tuple[str, str]:
    """(text, record), record being the exact run of the text the app bolds. Varied verbs, short stat names."""
    if m.one and line == 0.5:
        lead = "has " + (m.one[0] if side == "over" else m.one[1])
    else:
        lead = f"has {pick_verb(m, side, seed or name + m.key)} {fmt_num(line)} {m.stat}"
    games = phrase(conds, team_name, team_only_sample)
    perfect = hits == n
    if window in ("season", "team"):
        tail = "this season" if window == "season" else f"since joining the {team_name}"
        record = f"all {n}" if perfect else f"{hits} of his {n}"
        text = f"in all {n} of his {games} {tail}" if perfect else f"in {hits} of his {n} {games} {tail}"
    else:
        record = f"{n} straight" if perfect else f"{hits} of his last {n}"
        text = f"in {n} straight {games}" if perfect else f"in {hits} of his last {n} {games}"
    return " ".join(f"{name} {lead} {text}".split()), record


def combos(conds: list[Cond], size: int):
    out = [()] + [(c,) for c in conds]
    if size >= 2:
        # redundant or unreadable together: this opponent is already its defense; two "after" clauses don't read;
        # special dates stand alone
        bad = [{"fd", "bigline"}, {"roof", "cold"}, {"roof", "wind"}, {"opp", "former"}, {"opp", "coach"}, {"coach", "former"},
               {"opp", "defense"}, {"coach", "defense"}, {"former", "defense"}, {"qb", "qbout"},
               {"prev", "own"}, {"prev", "big"}, {"prev", "mins"}, {"own", "big"}, {"own", "mins"}, {"big", "mins"}]
        for i, a in enumerate(conds):
            for b in conds[i + 1:]:
                if a.kind == b.kind and a.kind != "out":
                    continue
                if "special" in (a.kind, b.kind) or any(s <= {a.kind, b.kind} for s in bad):
                    continue
                if not ({a.kind, b.kind} & MATCHUP) or not {a.kind, b.kind} <= PAIR_PARTNER:
                    continue
                out.append((a, b))
    return out


def evaluate(sport: str, u: Upcoming, team: str, pid: str, prop: str, line: float, data, team_name: str, prominence: float = 0.0) -> list[Angle]:
    m = MARKETS[sport][prop]
    if line <= m.floor:
        return []   # "over 0.5 catches": true and dull
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

    def hit(g, side):
        return g.vals[m.key] > line if side == "over" else g.vals[m.key] < line
    base = {s: sum(1 for g in recent if hit(g, s)) / len(recent) for s in ("over", "under")}
    this_season = [g for g in hist if g.season == season]
    current_ok = {s: len(this_season) < SEASON_CHECK[sport] or sum(1 for g in this_season if hit(g, s)) / len(this_season) >= 0.5
                  for s in ("over", "under")}
    conds = team_conds(sport, u, team) + player_conds(sport, u, team, pid, m, line, hist, data)
    windows = {"recent": recent, "career": hist, "last10": recent[:10]}
    # "this season" and "since joining" only when they leave out a real share of his recent games
    if len(this_season) <= MAX_SHARE * len(recent):
        windows["season"] = this_season
    stint = []
    for g in hist:
        if g.team != team:
            break
        stint.append(g)
    if len(stint) < len(hist) and stint and stint[-1].season >= season - 1 and len(stint) <= MAX_SHARE * len(recent):
        windows["team"] = stint
    out = []
    for window, rows in windows.items():
        if not rows:
            continue
        # the tautology filter: in this window a condition must leave out at least a quarter of his games
        # (of his games for this team, for team conditions)
        usable = []
        for c in conds:
            base_rows = [g for g in rows if g.team == team] if c.team_only else rows
            if base_rows and sum(1 for g in base_rows if c.pred(g)) / len(base_rows) <= MAX_SHARE:
                usable.append(c)
        size = 2 if window in ("recent", "career") else (1 if window in ("season", "team") else 0)
        single_n, single_rate = {}, {}
        for combo in combos(usable, size):
            if window == "career" and not any(c.rare for c in combo):
                continue  # every season in the data only for rare situations (this opponent, special dates, prime time, ...)
            if window == "recent" and not combo:
                continue  # that's the base rate itself
            special = len(combo) == 1 and combo[0].kind == "special"
            sel = [g for g in rows if all(c.pred(g) for c in combo)]
            n = len(sel)
            if len(combo) == 1 and n:
                single_n[id(combo[0])] = n
                for s in ("over", "under"):
                    single_rate[(id(combo[0]), s)] = sum(1 for g in sel if hit(g, s)) / n
            floor_n = SPECIAL_MIN_GAMES if special else min_games
            if n < floor_n or sel[0].season < season - (RECENT_SEASONS - 1):
                continue
            if len(combo) == 2 and any(single_n.get(id(c)) in (None, n) for c in combo):
                continue  # the second condition has to leave something out
            for side in ("over", "under"):
                if base[side] > MAX_BASE or not current_ok[side] or (m.key == "anytime_td" and side == "under"):
                    continue
                hits = sum(1 for g in sel if hit(g, side))
                rate = hits / n
                if rate < base[side] + MIN_UPLIFT:
                    continue
                z = zscore(hits, n)
                zb = zscore(hits, n, base[side])
                if special:
                    if rate < SPECIAL_RATE or z < SPECIAL_Z:
                        continue
                elif rate < FLOOR_RATE or z < FLOOR_Z or zb < FLOOR_ZBASE:
                    continue
                if len(combo) == 2:
                    parts = [single_rate.get((id(c), side)) for c in combo]
                    if any(p is None or p < base[side] or p >= rate for p in parts):
                        continue
                team_sample = all(g.team == team for g in sel)
                seed = f"{pid}|{m.key}|{side}|{window}|{'|'.join(c.adj + c.suffix + c.noun for c in combo)}"
                text, record = sentence(name, m, line, side, hits, n, window, combo, team_name, team_sample, seed)
                out.append(Angle(sport, pid, name, team, m, prop, line, side, hits, n, z, zb, base[side], window,
                                 combo, text, record, [(g.key, g.vals[m.key]) for g in sel], prominence,
                                 sum(1 for g in sel if g.season >= season - (WINDOW_SEASONS - 1)) / n))
    # the same sample in several windows (career = recent when there are no older games): keep one
    seen, uniq = set(), []
    for a in sorted(out, key=lambda a: a.order, reverse=True):
        k = (a.side, a.hits, a.games, a.kinds, tuple(k for k, _ in a.sample[:3]))
        if k not in seen:
            seen.add(k)
            uniq.append(a)
    return uniq


def verify(a: Angle, data, u: Upcoming) -> str | None:
    """The check pass: recompute the record from the raw rows, independently of PG. None when it holds."""
    if len(a.sample) != a.games or len({k for k, _ in a.sample}) != a.games:
        return "sample size"
    hits = 0
    want = u.ctx[a.team]
    for key, _ in a.sample:
        v = data.value(a.player, key, a.market)
        if v is None:
            return f"no raw row for {key}"
        hits += (v > a.line) if a.side == "over" else (v < a.line)
        opp, home, neutral = data.raw_side(a.player, key)
        if "role" in a.kinds and (neutral or home != want["home"]):
            return f"home/road wrong in {key}"
        if ("opp" in a.kinds or "former" in a.kinds) and opp != want["opp"]:
            return f"opponent wrong in {key}"
        flags = data.raw_flags(a.player, key)
        for c in a.conds:
            if c.kind == "special" and c.feature != "bye" and c.feature not in flags.get("special", ()):
                return f"{c.feature} wrong in {key}"
            if c.kind in ("prime", "div", "cold") and c.kind in flags and not flags[c.kind]:
                return f"{c.kind} wrong in {key}"
            if c.kind == "roof" and "roof" in flags and flags["roof"] != want.get("roof"):
                return f"roof wrong in {key}"
            if c.kind == "coach" and "coach" in flags and flags["coach"] != want.get("coach_opp"):
                return f"coach wrong in {key}"
            if c.kind == "tv" and "tv" in flags and not flags["tv"]:
                return f"tv wrong in {key}"
    if hits != a.hits:
        return f"hits {hits} != {a.hits}"
    if a.record not in a.text or (a.line != 0.5 and fmt_num(a.line) not in a.text):
        return "sentence lost its numbers"
    if not re.search(rf"\b({a.hits} of his (last )?{a.games}|{a.games} straight|all {a.games})\b", a.text):
        return "record wording"
    if BANNED.search(a.text) or DASHES.search(a.text):
        return "wording"
    return None


def choose(angles: list[Angle]) -> list[Angle]:
    """The engine's own top 3 (the judge's fallback): one per player, different markets when possible."""
    ranked = sorted(angles, key=lambda a: a.order, reverse=True)
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
    return sorted(picks, key=lambda a: a.order, reverse=True)


def candidate_pool(angles: list[Angle]) -> list[Angle]:
    """The candidates the judge sees: the engine's best, at most 2 per player and 4 per angle type, varied."""
    ranked = sorted(angles, key=lambda a: a.order, reverse=True)
    fresh = [a for a in ranked if a.fresh]
    if len(fresh) >= 3:
        ranked = fresh   # a sample mostly from older seasons only when there's little else
    per_player, per_type, per_pm = defaultdict(int), defaultdict(int), set()
    out = []
    for a in ranked:
        if per_player[a.player] >= 2 or per_type[a.angle_type] >= 4 or (a.player, a.market.key, a.family) in per_pm:
            continue
        per_player[a.player] += 1
        per_type[a.angle_type] += 1
        per_pm.add((a.player, a.market.key, a.family))
        out.append(a)
        if len(out) >= CANDIDATES:
            break
    return out


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
        season = int(g["season"])
        teams, situ = {}, {}
        espn_abbr = {x["homeAway"]: x["team"]["abbreviation"] for x in c["competitors"]}
        table = latest_table(data.tables, season)
        t = ""
        for side in ("home", "away"):
            team = franchise(g[f"{side}_team"])
            k = data.context[(g["game_id"], team)]
            t = k["t"]
            roof = k["roof"] or ("indoor" if venue.get("indoor") else ("outdoor" if venue.get("indoor") is False else ""))
            temp = weather.get("temperature") if roof == "outdoor" else None
            situ[team] = {**k, "roof": roof, "temp": float(temp) if temp is not None else None,
                          "windy": "wind" in (weather.get("displayValue") or "").lower(),
                          "opp_name": NFL_TEAMS.get(k["opp"], k["opp"]), "opp_abbr": espn_abbr.get("away" if side == "home" else "home", k["opp"]),
                          "defense": {f: tb[k["opp"]] for f, tb in table.items() if k["opp"] in tb}}
            teams[side] = {"id": team, "abbr": espn_abbr.get(side, team), "name": NFL_TEAMS.get(team, team)}
        injuries = fetch_injuries("NFL", e["id"])
        outs = {teams[s]["id"]: injuries.get(teams[s]["abbr"], {}) for s in ("home", "away")}
        special = nfl_special(g, data.last_week)
        out.append(Upcoming("NFL", e["id"], e["date"], t, season,
                            f"{teams['away']['name']} {'vs' if g['location'] == 'Neutral' else 'at'} {teams['home']['name']}",
                            teams, situ, fetch_props("NFL", e["id"]), outs, special))
    return out


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
        tv = any(b.get("market") == "national" for b in c.get("broadcasts", []))
        table = latest_table(data.tables, season)
        teams, situ = {}, {}
        for side, me, op in (("home", h, a), ("away", a, h)):
            tid, oid = me["team"]["id"], op["team"]["id"]
            prev_t, prev_res = data.last.get((tid, season), (None, ""))
            rest = (start.date() - prev_t.date()).days if prev_t else 99
            situ[tid] = {"opp": oid, "home": side == "home", "neutral": bool(c.get("neutralSite")), "rest": rest, "prev": prev_res,
                         "spread": None if home_line is None else (home_line if side == "home" else -home_line), "tv": tv,
                         "opp_name": op["team"].get("name") or op["team"].get("shortDisplayName"), "opp_abbr": op["team"]["abbreviation"],
                         "defense": {f: tb[oid] for f, tb in table.items() if oid in tb}}
            teams[side] = {"id": tid, "abbr": me["team"]["abbreviation"], "name": me["team"].get("name") or me["team"].get("shortDisplayName")}
        injuries = fetch_injuries("NBA", e["id"])
        outs = {teams[s]["id"]: injuries.get(teams[s]["abbr"], {}) for s in ("home", "away")}
        special = frozenset({"christmas"} if (start.month, start.day) == (12, 25) else set())
        out.append(Upcoming("NBA", e["id"], e["date"], t, season, f"{teams['away']['name']} at {teams['home']['name']}",
                            teams, situ, fetch_props("NBA", e["id"]), outs, special))
    return out


def run_game(u: Upcoming, data) -> tuple[list[Angle], list[Angle], int, int, int]:
    """(engine top 3, judge candidates, candidates found, checked, dropped by the check pass)"""
    by_team = {u.teams[s]["id"]: u.teams[s]["name"] for s in ("home", "away")}
    markets_per_player = defaultdict(int)
    for (aid, _prop) in u.props:
        markets_per_player[aid] += 1
    current = {}   # ESPN athlete id -> (player id, his team now)
    for (aid, _prop) in u.props:
        pid = data.espn_to_gsis.get(aid) if u.sport == "NFL" else aid
        cur = next((g for g in data.by_player.get(pid, []) if g.season == u.season and g.t < u.t), None) if pid else None
        if cur and cur.team in by_team:
            current[aid] = (pid, cur.team)   # players who haven't played this season, or not for either team, are left out
    featured = set()
    for key, top in FEATURED[u.sport]:
        prop = next(p for p, mk in MARKETS[u.sport].items() if mk.key == key)
        for team in by_team:
            lines = sorted(((line, aid) for (aid, p), (line, _) in u.props.items() if p == prop and current.get(aid, ("", ""))[1] == team), reverse=True)
            featured.update(aid for _, aid in lines[:top])
    angles = []
    for (aid, prop), (line, _prices) in u.props.items():
        if aid not in current or aid not in featured:
            continue
        pid, team = current[aid]
        prominence = 0.15 * min(markets_per_player[aid], 6)
        angles.extend(evaluate(u.sport, u, team, pid, prop, line, data, by_team[team], prominence))
    ranked = sorted(angles, key=lambda a: a.order, reverse=True)
    good, checked, dropped = [], 0, 0
    for a in ranked[:CHECKED]:
        checked += 1
        why = verify(a, data, u)
        if why:
            dropped += 1
            print(f"  CHECK FAILED ({why}): {a.text}", flush=True)
            continue
        good.append(a)
    return choose(good), candidate_pool(good), len(angles), checked, dropped


def candidate_json(u: Upcoming, a: Angle, i: int, data) -> dict:
    espn = data.gsis_to_espn.get(a.player, "") if u.sport == "NFL" else a.player
    return {"id": f"c{i}", "player_name": a.name, "short_name": data.short(a.player), "espn_athlete_id": espn,
            "team": next(u.teams[s]["abbr"] for s in ("home", "away") if u.teams[s]["id"] == a.team),
            "market": a.market.key, "market_short": MARKET_SHORT[a.market.key], "stat": a.market.stat,
            "stat_terms": list(dict.fromkeys([a.market.stat, *a.market.terms])), "line": a.line, "side": a.side,
            "price": u.props[(espn, a.prop)][1].get(a.side), "hits": a.hits, "games": a.games, "record": a.record,
            "sentence": a.text, "window": a.window, "conditions": [c.kind for c in a.conds], "family": a.family,
            "angle_type": a.angle_type, "ticker": a.ticker, "tier": "strong" if a.strong else "fallback",
            "z": round(a.z, 2), "z_base": round(a.zbase, 2), "base_rate": round(a.base, 3), "score": round(a.score, 2),
            "recent_share": round(a.recent_share, 2), "stale": not a.fresh}


def game_context(u: Upcoming) -> dict:
    start = datetime.fromisoformat(u.start.replace("Z", "+00:00")).astimezone(ET)
    home = u.ctx[u.teams["home"]["id"]]
    special = {"thanksgiving": "Thanksgiving", "christmas": "Christmas Day", "week1": "season opener",
               "finale": "season finale", "intl": "international game"}
    return {"sport": u.sport, "matchup": u.matchup, "date_et": start.strftime("%A, %B %-d, %Y"), "kickoff_et": start.strftime("%-I:%M %p ET"),
            "special": [special[k] for k in sorted(u.special)], "prime_time": bool(home.get("prime")) if u.sport == "NFL" else None,
            "national_tv": bool(home.get("tv")) if u.sport == "NBA" else None, "roof": home.get("roof"), "temp_f": home.get("temp"),
            "home": u.teams["home"]["abbr"], "away": u.teams["away"]["abbr"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", choices=["nfl", "nba"])
    ap.add_argument("--nflverse", default="", help="directory with the nflverse files (see the module docstring)")
    ap.add_argument("--history", nargs="+", default=[], help="NBA: espn_history.py CSVs, completed seasons then this one")
    ap.add_argument("--boxes", nargs="+", default=[], help="NBA: nba_boxes.py player CSVs, completed seasons then this one")
    ap.add_argument("--teams", nargs="+", default=[], help="NBA: nba_boxes.py team CSVs (--teams-out), completed seasons then this one")
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
        data = NBAData(args.history, args.boxes, args.teams, args.season)
        games = nba_upcoming(data, args.days or 2)
    print(f"{sport}: {len(data.rows)} player-games of history, {len(games)} upcoming games", flush=True)
    results = []
    total_checked = total_failed = 0
    for u in games:
        picks, pool, n, checked, dropped = run_game(u, data)
        total_checked += checked
        total_failed += dropped
        print(f"\n{u.matchup} ({u.t}{', ' + ', '.join(sorted(u.special)) if u.special else ''}, {len(u.props)} props): "
              f"{n} candidates, {checked} checked, {dropped} failed, {len(pool)} for the judge", flush=True)
        for a in pool:
            print(f"  [{a.family} {'strong' if a.strong else 'fallback'} {a.score:.2f}{'' if a.fresh else ' stale'}] {a.text}"
                  f"{'  | ' + a.ticker if a.ticker else ''}", flush=True)
        lines = []
        for i, a in enumerate(picks, 1):
            cj = candidate_json(u, a, i, data)
            lines.append({**cj, "text": a.text, "rank": i})
        results.append({"espn_event_id": u.event, "sport": sport, "starts_at": u.start, "matchup": u.matchup, "props": len(u.props),
                        "context": game_context(u), "candidates_found": n, "checked": checked, "check_failed": dropped,
                        "candidates": [candidate_json(u, a, i, data) for i, a in enumerate(pool)], "lines": lines})
    print(f"\ncheck pass: {total_checked - total_failed} of {total_checked} top candidates recomputed from the raw rows and matched;"
          f" {total_failed} dropped", flush=True)
    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)


# ---------------------------------------------------------------- self-test
def self_test() -> None:
    """Synthetic history: wording, pushes, thresholds, the tautology filter, special dates, tickers, ranking, the check pass."""
    rows = []
    # 30 games over three seasons: 30 points at home, 18 on the road; the home games came against top-10 scoring defenses
    for i in range(30):
        s = 2025 + i // 10
        home = i % 2 == 0
        rows.append(PG(key=f"e{i}", season=s, t=f"{s}-01-{(i % 10) + 10}T19:00", player="p1", team="T1", opp="T2" if i % 3 else "T3",
                       home=home, neutral=False, vals={k.key: 0.0 for k in NBA_MARKETS.values()} | {"pts": 30.0 if home else 18.0},
                       prev_team="L" if i % 4 == 0 else "W", rest=1 if i % 5 == 0 else 2,
                       defense={"pa": (5 if home else 20, 30, 108.0)}))

    class Fake(History):
        gaps = {}
        raw = {}
        gsis_to_espn = {}
        espn_to_gsis = {}

        def name(self, pid):
            return "Test Player"

        def value(self, pid, key, mk):
            return next(r.vals[mk.key] for r in rows if r.key == key)

        def raw_side(self, pid, key):
            return next((r.opp, r.home, r.neutral) for r in rows if r.key == key)

        def raw_flags(self, pid, key):
            return {"special": next(r.special for r in rows if r.key == key)}

        def prev_stat(self, g, stat):
            return g.vals.get(stat, 0.0)
    data = Fake()
    data.index(rows)
    data.raw = {("p1", r.key): {"min": "30"} for r in rows}
    u = Upcoming("NBA", "x", "2027-02-01T00:00Z", "2027-02-01T19:00", 2027, "A at B",
                 {"home": {"id": "T1", "abbr": "ONE", "name": "Ones"}, "away": {"id": "T2", "abbr": "TWO", "name": "Twos"}},
                 {"T1": {"opp": "T2", "opp_abbr": "TWO", "home": True, "neutral": False, "rest": 2, "prev": "W", "spread": -3.0,
                         "opp_name": "Twos", "defense": {"pa": (4, 30, 107.0)}, "tv": False}},
                 {("p1", "Total Points"): (24.5, {})}, {})
    angles = evaluate("NBA", u, "T1", "p1", "Total Points", 24.5, data, "Ones")
    home = [a for a in angles if a.kinds == ("role",) and a.window == "recent"]
    assert home, "the home angle should qualify"
    a = home[0]
    assert (a.hits, a.games, a.side) == (15, 15, "over"), (a.hits, a.games, a.side)
    assert a.text.startswith("Test Player has ") and a.text.endswith(" 24.5 Pts in 15 straight home games"), a.text
    assert a.record == "15 straight" and a.strong and verify(a, data, u) is None
    top = sorted(angles, key=lambda x: x.order, reverse=True)[0]
    assert top.family == "defense" and top.text.endswith("in 15 straight games vs top-10 scoring defenses"), top.text
    assert top.ticker == "TWO 4th in Pts Allowed", top.ticker
    assert verify(Angle(**{**a.__dict__, "hits": 14}), data, u) is not None
    assert verify(Angle(**{**a.__dict__, "text": a.text.replace(" has ", " should have ")}), data, u) is not None
    # the tautology filter: a condition true in every game of a window is not a stat
    assert all(c.kind != "fd" for x in angles for c in x.conds), "favorite in every game: filtered"
    # pushes count as misses for both sides
    for r in rows[:3]:
        r.vals["pts"] = 24.0
    for x in evaluate("NBA", u, "T1", "p1", "Total Points", 24.0, data, "Ones"):
        assert verify(x, data, u) is None, verify(x, data, u)
        assert x.hits <= x.games - sum(1 for _, v in x.sample if v == 24.0)
    for r in rows[:3]:
        r.vals["pts"] = 30.0 if r.home else 18.0
    assert not [x for x in angles if x.window == "recent" and not x.conds]
    assert all(x.rate >= x.base + MIN_UPLIFT for x in angles)
    assert evaluate("NBA", u, "T1", "p1", "Total Points", 6.5, data, "Ones") == []
    # special dates: 5 games are enough at 80% or better
    for r in rows[20:26]:
        r.special = frozenset({"christmas"})
        r.home = True
        r.vals["pts"] = 30.0
    u.special = frozenset({"christmas"})
    xmas = [x for x in evaluate("NBA", u, "T1", "p1", "Total Points", 24.5, data, "Ones") if x.special]
    assert xmas and xmas[0].text.endswith("in 6 straight Christmas games") and xmas[0].strong, [x.text for x in xmas]
    assert verify(xmas[0], data, u) is None
    # sentences: 0.5 lines, season and team windows, verbs vary, short stat names
    t, rec = sentence("A B", NFL_MARKETS["Total Passing Interceptions (incl. overtime)"], 0.5, "under", 9, 12, "recent", (), "Bills")
    assert t == "A B has not thrown an interception in 9 of his last 12 games" and rec == "9 of his last 12", t
    t, rec = sentence("A B", NBA_MARKETS["Total Points"], 27.5, "over", 9, 11, "team", (), "Heat")
    assert t.endswith("27.5 Pts in 9 of his 11 games since joining the Heat") and rec == "9 of his 11", t
    t, rec = sentence("A B", NFL_MARKETS["Anytime Touchdown Scorer"], 0.5, "over", 10, 11, "recent",
                      (Cond("defense", "", "vs top-10 run defenses", None),), "Lions")
    assert t == "A B has scored in 10 of his last 11 games vs top-10 run defenses", t
    verbs = {sentence("A B", NFL_MARKETS["Total Receiving Yards (incl. overtime)"], 60.5, "over", 9, 12, "recent", (), "X", seed=str(i))[0].split(" 60.5")[0]
             for i in range(40)}
    assert len(verbs) >= 3, verbs
    assert phrase((Cond("opp", "", "vs the Chiefs", None), Cond("role", "road", "", None))) == "road games vs the Chiefs"
    assert phrase((Cond("prev", "", "after a win", None),), "Cowboys", True) == "games after a Cowboys win"
    assert phrase((Cond("special", "", "", None, noun="season openers"),)) == "season openers"
    assert phrase((Cond("out", "", "without A", None), Cond("out", "", "without B", None))) == "games without A and B"
    assert possessive("Andy Reid") == "Andy Reid's" and possessive("Raheem Morris") == "Raheem Morris'"
    assert [ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28)] == ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "28th"]
    assert natural_rank("sacks", 30, 32) == 3 and natural_rank("rush", 7, 32) == 7
    assert thanksgiving(date(2026, 11, 26)) and not thanksgiving(date(2026, 11, 19)) and thanksgiving(date(2025, 11, 27))
    # top 3 and the candidate pool
    def mk(p, mkt, z, conds=(Cond("role", "home", "", None),)):
        return Angle("NBA", p, p, "T1", mkt, "", 1.5, "over", 9, 10, z, 2.5, 0.5, "recent", conds, "x", "9 of his last 10")
    pts, reb = NBA_MARKETS["Total Points"], NBA_MARKETS["Total Rebounds"]
    picks = choose([mk("a", pts, 4), mk("a", reb, 3.9), mk("b", pts, 3.8), mk("c", reb, 3.0), mk("d", pts, 2.9)])
    assert [p.player for p in picks] == ["a", "b", "c"], [p.player for p in picks]
    dcond = (Cond("defense", "", "vs x", None, feature="pa"),)
    assert choose([mk("a", pts, 4), mk("b", reb, 2.0, dcond)])[0].player == "b"
    pool = candidate_pool([mk(p, pts, 3.0, dcond) for p in "abcdef"])
    assert len(pool) == 4, len(pool)   # at most 4 of one angle type
    stale = mk("s", pts, 4.0, dcond)
    stale.recent_share = 0.3
    assert choose([stale, mk("t", reb, 2.0)])[0].player == "t"
    g = [PG(key=str(i), season=2027, t=f"2027-01-{20 - i:02d}T19:00", player="p", team="T", opp="O", home=True, neutral=False, vals={}) for i in range(5)]
    assert len(cut_at_gaps(g, {"T": ["2027-01-17T12:00"]})) == 4 and len(cut_at_gaps(g, {"T": ["2027-01-25T19:00"]})) == 0
    tb = defense_tables({2027: [("2027-01-01", f"T{i}", {"x": float(i)}) for i in range(25)] +
                         [("2027-01-08", f"T{i}", {"x": float(30 - i)}) for i in range(25)]}, {"x": ("x", None)}, 1)
    assert tb[(2027, "2027-01-08")]["x"]["T0"][0] == 1 and tb[(2027, "2027-01-01")] == {}
    assert short_name("Josh Allen") == "J. Allen" and short_name("Jaren Jackson Jr.") == "J. Jackson Jr."
    assert short_name("Amon-Ra St. Brown", "Amon-Ra", "St. Brown") == "A. St. Brown"
    assert american(-110) == "-110" and american("105") == "+105" and american(None) is None
    assert set(MARKET_SHORT) >= {m.key for mk_ in MARKETS.values() for m in mk_.values()}
    print("self-test passed")


if __name__ == "__main__":
    main()
