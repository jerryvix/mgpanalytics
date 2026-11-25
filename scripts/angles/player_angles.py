"""Player lines (DECISIONS D-105, D-106, D-119): for every upcoming NFL and NBA game, true facts
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
                  Rush YPG and points allowed, yards to his position, sacks, blitz rate,
                  the top end of pressure rate and interceptions; NBA points, threes,
                  rebounds and assists allowed, pace), with a ticker that names
                  tonight's opponent's exact rank: "CHI DEF 7th in Rush YPG Allowed"
  special dates   Thanksgiving, Christmas, season openers, season finales, international
                  games, off a bye, the playoffs, NBA games back after missing five or more
                  (at least 5 games, 80% or better)
  his team        his quarterback when it isn't the usual one, a top teammate out
  the matchup     this head coach (NFL), his former team, this opponent
  the setting     prime time, national TV, division, indoors or outdoors, the cold, wind,
                  short week, back-to-backs, three games in four nights, rest, at Denver and Utah
  his form        after a big game, after going over or being held under this number,
                  after heavy minutes; his current streak against the number; a milestone
                  just above the line ("30 or more Pts")
  plain splits    home or road, favorite or underdog, after a win or a loss
over his last three seasons, this season, his games since joining a new team, since moving
into the starting lineup (NBA) or becoming the lead back (NFL), his last 10, and (for rare
situations) every game in the data. Each sample is literally "his last n" such games: where
the file can't say whether a condition held (a blank temperature) the sample stops there.
Over and under are both tried; a push counts as a miss for both. A sentence over 24 words
is dropped (after one try with the shortest verb).

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
import bisect
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
MAX_WORDS = 24              # a longer sentence is dropped before ranking; player lines carry a stat and a number, so 24, not 18 (D-119)
STREAK_MIN = {"NFL": 7, "NBA": 8}   # "in 9 straight games": his current run against tonight's number (D-119)
# Milestones (D-119): a round number just above tonight's line, shown beside it ("has scored 30 or more Pts" over
# "G. Antetokounmpo O 28.5 Pts"). Only the next one up, more than 1 above the line (25 over a 24.5 line is the line
# itself) and within a quarter of it; over only, so "30 or more" always means over the line too
MILESTONES = {"pts": (20, 25, 30, 35, 40, 45, 50), "reb": (10, 15, 20), "ast": (10, 15),
              "pass_yds": (250, 300, 350), "rush_yds": (100, 150), "rec_yds": (100, 150)}
MILESTONE_VERBS = {"pts": ("scored", "put up", "posted"), "": ("put up", "posted", "had")}
ALTITUDE = {"7": "Denver", "26": "Utah"}   # ESPN ids of the NBA's two mile-high arenas (D-119)
ROLE_BEFORE = {"NBA": 5, "NFL": 3}   # games out of the role right before the run, so "since moving into" is a real move
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
    "pass":   {"top": "Top-10 pass defenses", "bottom": "Bottom-10 pass defenses", "ticker": "Pass YPG Allowed"},
    "rush":   {"top": "Top-10 run defenses", "bottom": "Bottom-10 run defenses", "ticker": "Rush YPG Allowed"},
    "pts":    {"top": "Top-10 scoring defenses", "bottom": "Bottom-10 scoring defenses", "ticker": "PPG Allowed"},
    "rec_WR": {"top": "Top-10 defenses against WRs", "bottom": "Bottom-10 defenses against WRs", "ticker": "Rec YPG Allowed to WRs"},
    "rec_TE": {"top": "Top-10 defenses against TEs", "bottom": "Bottom-10 defenses against TEs", "ticker": "Rec YPG Allowed to TEs"},
    "rec_RB": {"top": "Top-10 defenses against RBs", "bottom": "Bottom-10 defenses against RBs", "ticker": "Rec YPG Allowed to RBs"},
    "sacks":  {"more": True, "top": "Top-10 pass rushes", "bottom": "Bottom-10 pass rushes", "ticker": "Sacks"},
    "blitz":  {"more": True, "top": "blitz-heavy defenses", "bottom": "defenses that rarely blitz", "ticker": "Blitz Rate"},
    # D-119: pressures per dropback (PFR) and interceptions a game, named only at the top end, as the catalog does
    "press":  {"more": True, "top": "Top-10 pressure defenses", "ticker": "Pressure Rate"},
    "intd":   {"more": True, "top": "Top-10 interception defenses", "ticker": "INTs"},
    "pa":     {"top": "Top-10 scoring defenses", "bottom": "Bottom-10 scoring defenses", "ticker": "Pts Allowed"},
    "fg3a":   {"top": "Top-10 three-point defenses", "bottom": "Bottom-10 three-point defenses", "ticker": "3PM Allowed"},
    "pace":   {"more": True, "top": "fast-paced teams", "bottom": "slow-paced teams", "ticker": "Pace"},
    # D-119: rebounds and assists the opponent's players get a game, from the box scores
    "rba":    {"top": "Top-10 rebounding defenses", "bottom": "Bottom-10 rebounding defenses", "ticker": "Reb Allowed"},
    "asta":   {"top": "Top-10 assist defenses", "bottom": "Bottom-10 assist defenses", "ticker": "Ast Allowed"},
}
# which defense features speak to which markets ("rec_POS" = yards allowed to his position; "@RB" = only for backs)
FEATURES_FOR = {
    "pass_yds": ["pass", "blitz", "press", "sacks"], "pass_rush_yds": ["pass", "blitz", "press", "sacks"],
    "completions": ["pass", "blitz", "press"], "pass_att": ["pass", "blitz", "press"],
    "pass_tds": ["pts", "pass", "blitz", "press", "intd"], "ints": ["blitz", "press", "intd", "pass", "sacks"],
    "rush_yds": ["rush"], "rush_rec_yds": ["rush"], "carries": ["rush"],
    "rec_yds": ["rec_POS", "pass"], "receptions": ["rec_POS", "pass"],
    "anytime_td": ["pts", "rush@RB", "rec_POS@WR", "rec_POS@TE"],
    "pts": ["pa", "pace"], "pts_reb": ["pa", "pace"], "pts_ast": ["pa", "pace"], "pra": ["pa", "pace"], "fg3": ["fg3a", "pace"],
    "reb": ["rba", "pace"], "ast": ["asta", "pace"], "reb_ast": ["pace"], "stl": ["pace"], "blk": ["pace"],
}
BIG_GAMES = {   # (stat, threshold, phrase) for "after a big game", by market family
    "pass": ("passing_yards", 300, "after a 300-yard passing game"),
    "rush": ("rushing_yards", 100, "after a 100-yard rushing game"),
    "rec": ("receiving_yards", 100, "after a 100-yard receiving game"),
    "nba": ("pts", 30, "after a 30-point game"),
}
SPECIAL = {   # kind -> (adjective, noun) for the games phrase
    "thanksgiving": ("Thanksgiving", "games"), "christmas": ("Christmas", "games"), "intl": ("international", "games"),
    "week1": ("", "season openers"), "finale": ("", "season finales"), "playoff": ("playoff", "games"),
}
# Families, in the engine's order of preference (the judge has the final say, D-106)
FAMILY = {"defense": "defense", "special": "special", "out": "teammates", "qbout": "teammates", "qb": "teammates",
          "coach": "coach", "former": "coach", "opp": "opponent", "prime": "setting", "tv": "setting", "div": "setting",
          "roof": "setting", "cold": "setting", "wind": "setting", "rest": "setting", "alt": "setting", "own": "form",
          "big": "form", "mins": "form", "role": "plain", "fd": "plain", "bigline": "plain", "prev": "plain"}
# Windows that run from a change in his situation to now: "in 9 of his 11 games since joining the Heat",
# "since moving into the starting lineup" (NBA box scores' starter flag), "since becoming the lead back" (NFL snap counts)
SINCE = {"team": "since joining the {team}", "starter": "since moving into the starting lineup", "lead": "since becoming the lead back",
         "starter_again": "since returning to the starting lineup", "lead_again": "since becoming the lead back again"}
TIER = {"defense": 1, "special": 1, "teammates": 2, "coach": 3, "opponent": 4, "setting": 5, "form": 6, "plain": 7, "none": 8}
BOOST = {"defense": 1.5, "special": 1.5, "teammates": 1.5, "coach": 1.4, "opponent": 1.0, "setting": 0.7, "form": 0.5, "plain": 0.0}
MATCHUP = {"defense", "coach", "former", "out", "qbout", "qb", "cold", "wind", "opp"}   # one of a pair must be one of these
# ...and the other one of these, so a pair still reads as one plain idea ("road games vs Top-10 pass defenses",
# "as a favorite vs Top-10 pass defenses"); "after a win" and form clauses only stand alone (owner, Nov 24:
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
    special: frozenset = frozenset()   # thanksgiving, christmas, week1, finale, intl, playoff
    defense: dict = field(default_factory=dict)    # feature -> (rank, teams ranked, value) for the opponent at the time
    prev: dict = field(default_factory=dict)       # his previous game this season: market values, plus raw extras
    g4: int = 1           # his team's games in the four nights ending with this one (NBA)
    starter: bool | None = None   # he started (NBA box scores); None when the file doesn't say
    lead: bool | None = None      # his team's lead back that game, most RB snaps (NFL); None when the file doesn't say
    back: bool | None = False     # his first game back after missing five or more of his team's games in a row (NBA);
                                  # None when the file can't tell (a game with no box score in between, a trade)


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
    known: object = None  # g -> whether the file says if the condition held; "his last n" stops at a game it can't say
                          # (a blank temperature), so the sample never skips a game that might have counted

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
    mark: float | None = None   # a milestone above the line ("30 or more Pts"), graded instead of the line (D-119)

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
        if not self.conds and (self.window in SINCE or self.window == "streak" or self.mark is not None):
            return "form"   # his own run: since a change, a streak, a milestone
        fams = [c.family for c in self.conds]
        return min(fams, key=lambda f: TIER[f]) if fams else "none"

    @property
    def angle_type(self) -> str:
        if self.mark is not None and not self.conds:
            return "form:milestone"
        best = [c for c in self.conds if c.family == self.family]
        return best[0].angle_type if best else f"{self.family}:{self.window.removesuffix('_again')}"

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
        length = words(self.text)
        relevance = (sum(BOOST.get(c.family, 0) for c in self.conds) + (0.6 if self.window in SINCE else 0)
                     + (0.3 if self.window == "streak" else 0) - (0.8 if self.window == "last10" else 0)
                     - (0.3 if self.mark is not None else 0))   # a milestone sits beside the line, so the line's own record comes first
        return (3 * self.rate + 0.35 * min(self.z, 4) + 0.5 * min(self.zbase, 4) + relevance + self.prominence + credibility
                - PAIR_PENALTY * max(0, len(self.conds) - 1) - 0.06 * max(0, length - 20))

    @property
    def order(self):
        return (self.fresh, -TIER[self.family], self.strong, self.score)


def zscore(h: int, n: int, p: float = 0.5) -> float:
    if n == 0 or p <= 0 or p >= 1:
        return 0.0
    return (h - n * p) / math.sqrt(n * p * (1 - p))


def fmt_num(x: float) -> str:
    return f"{x:g}"


def words(text: str) -> int:
    """Words as a reader counts them: "Pts + Reb" is two."""
    return sum(1 for w in text.split() if w != "+")


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


def scoreboard(sport: str, days: int, others: list | None = None) -> list[dict]:
    """The games still to start in the next `days` days. `others` collects every other game in those days
    (live or finished) as (event id, start, team ids), so a later game can tell its team's earlier one isn't in the
    history yet."""
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
            if e["id"] in seen:
                continue
            seen.add(e["id"])
            if c["status"]["type"]["state"] != "pre":
                if others is not None:
                    others.append((e["id"], e["date"], {x["team"]["id"] for x in c["competitors"]}))
                continue
            events.append(e)
    return events


def pending_teams(events: list[dict], others: list, recorded) -> dict:
    """{event id: team ids with an earlier game in the window that isn't in the history yet}: for those teams this
    game's last result, rest and the player's previous game aren't known (D-119)."""
    games = [(e["id"], e["date"], {x["team"]["id"] for x in e["competitions"][0]["competitors"]}) for e in events]
    games += [o for o in others if not recorded(o[0])]
    out = {}
    for ev, start, teams in games:
        out[ev] = {t for t in teams if any(s < start and t in ts for _, s, ts in games)}
    return out


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
                "rec_RB": ("rec_RB", None), "pts": ("pts", None), "sacks": ("sacks", None), "blitz": ("blitzed", "dropbacks_adv"),
                "press": ("pressured", "dropbacks_adv"), "intd": ("ints_def", None)}


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
    elif g["game_type"] in ("WC", "DIV", "CON", "SB"):
        out.add("playoff")
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
        self.gsis_to_pfr = {p["gsis_id"]: p["pfr_id"] for p in players if p["pfr_id"]}
        self.raw: dict[tuple, dict] = {}
        self.snaps: dict[tuple, str] = {}
        self.rb_snaps: dict[tuple, dict] = defaultdict(dict)   # (game, team) -> {PFR id: offensive snaps} of its RBs
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
                    if r["position"] == "RB" and r["game_id"] in self.gidx:
                        self.rb_snaps[(r["game_id"], franchise(r["team"]))][r["pfr_player_id"]] = float(r["offense_snaps"] or 0)
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
            d["ints_def"] += float(r["passing_interceptions"] or 0)
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
            d["pressured"] += float(r["times_pressured"] or 0)
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
                           special=c["special"], defense={f: t[c["opp"]] for f, t in table.items() if c["opp"] in t},
                           lead=self.lead_of(pid, gid, team)))

        def extras(g):
            r = self.raw.get((g.player, g.key)) or {}
            return {k: float(r.get(k) or 0) for k in ("passing_yards", "rushing_yards", "receiving_yards")}
        link_previous(rows, extras)
        self.index(rows)

    def lead_of(self, pid: str, gid: str, team: str) -> bool | None:
        """Was he his team's lead back that game (the most offensive snaps among its RBs, from the snap counts)?
        None when the snap counts don't have him for that game."""
        snaps = self.rb_snaps.get((gid, team))
        pfr = self.gsis_to_pfr.get(pid)
        if not snaps or not pfr or snaps.get(pfr, 0) <= 0:
            return None
        return snaps[pfr] >= max(snaps.values())

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
        indoor = g["roof"] in ("dome", "closed")
        return {"prime": (g["gametime"] or "00:00") >= "19:00", "div": g["div_game"] == "1",
                "roof": "outdoor" if g["roof"] in ("outdoors", "open") else ("indoor" if indoor else ""),
                "cold": bool(g["temp"]) and float(g["temp"]) < 35, "coach": g["away_coach" if home else "home_coach"],
                "special": nfl_special(g, self.last_week),
                "known": {"cold": indoor or bool(g["temp"]), "wind": indoor or bool(g["wind"])}}


# ---------------------------------------------------------------- NBA
NBA_DEF_SPEC = {"pa": ("pts_allowed", None), "fg3a": ("fg3_allowed", None), "pace": ("poss", None),
                "rba": ("reb_allowed", None), "asta": ("ast_allowed", None)}
ABSENCE = 5     # "back after missing five or more": his team's games in a row without him (D-119)


def playoff_starts(games) -> dict:
    """{season: first day of the playoffs}: ESPN's postseason flag covers the play-in too, whose three days have two
    games each; the first round opens with four. So the playoffs start on the first postseason day with 3 or more games."""
    per_day = defaultdict(lambda: defaultdict(int))
    for g in games:
        if g.get("postseason") == "1" and g["home_pts"] != "":
            day = datetime.fromisoformat(g["start"].replace("Z", "+00:00")).astimezone(ET).date()
            per_day[int(g["season"])][day] += 1
    return {s: min(d for d, n in days.items() if n >= 3) for s, days in per_day.items() if any(n >= 3 for n in days.values())}


def games_in_four(before: list, t: str) -> int:
    """This game plus his team's games in the three days before it: 3 = "three games in four nights"."""
    day = date.fromisoformat(t[:10])
    return 1 + sum(1 for pt, _ in before[-4:] if 0 < (day - date.fromisoformat(pt[:10])).days <= 3)


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
        fg3, reb, ast = defaultdict(int), defaultdict(int), defaultdict(int)
        for (aid, ev), r in self.raw.items():
            fg3[(ev, r["team_id"])] += int(r["fg3"])
            reb[(ev, r["team_id"])] += int(r["reb"])
            ast[(ev, r["team_id"])] += int(r["ast"])
        self.playoffs = playoff_starts(games)

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
            special = set({"christmas"} if (start.month, start.day) == (12, 25) else set())
            if g.get("postseason") == "1" and s in self.playoffs and start.date() >= self.playoffs[s]:
                special.add("playoff")
            for side in ("home", "away"):
                tid, oid = g[f"{side}_id"], g["away_id" if side == "home" else "home_id"]
                prev_t, prev_res = last.get((tid, s), (None, ""))
                rest = (start.date() - prev_t.date()).days if prev_t else 99
                hl = float(g["home_line"]) if g["home_line"] != "" else None
                self.context[(g["event_id"], tid)] = {
                    "opp": oid, "home": side == "home", "neutral": g["neutral"] == "1", "season": s, "t": t, "tv": tv,
                    "spread": None if hl is None else (hl if side == "home" else -hl), "rest": rest, "prev": prev_res,
                    "special": frozenset(special), "g4": games_in_four(self.team_games[tid], t),
                }
                self.team_games[tid].append((t, g["event_id"]))
            for me, other, pts_against in ((g["home_id"], g["away_id"], ap), (g["away_id"], g["home_id"], hp)):
                vals = {"pts_allowed": pts_against}
                if (g["event_id"], other) in fg3:
                    vals["fg3_allowed"] = float(fg3[(g["event_id"], other)])
                    vals["reb_allowed"] = float(reb[(g["event_id"], other)])
                    vals["ast_allowed"] = float(ast[(g["event_id"], other)])
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
                           special=c["special"], defense={f: tb[c["opp"]] for f, tb in table.items() if c["opp"] in tb},
                           g4=c["g4"], starter={"1": True, "0": False}.get(r.get("starter", ""))))
        link_previous(rows, lambda g: {"min": float(self.raw[(g.player, g.key)]["min"])})
        self.index(rows)
        # finished games ESPN has no box score for: a player's history stops there so "his last n" stays literal
        self.gaps = defaultdict(list)
        for team, lst in self.team_games.items():
            for t, ev in lst:
                if (ev, team) not in self.played:
                    self.gaps[team].append(t)
        # D-119: his first game back after missing five or more of his team's games in a row
        self.times = {team: [t for t, _ in lst] for team, lst in self.team_games.items()}
        self.season_first = {}
        for team, lst in self.team_games.items():
            for i, (_, ev) in enumerate(lst):
                self.season_first.setdefault((team, self.context[(ev, team)]["season"]), i)
        for lst in self.by_player.values():
            for g, before in zip(lst, lst[1:] + [None]):   # newest first: `before` is his previous game
                g.back = self.absence_return(g, before)

    def absence_return(self, g: PG, before: PG | None) -> bool | None:
        """True when his team played ABSENCE or more games in a row without him right before this one. None when the
        file can't say: a game in between with no box score, or the games he missed came before his first game this
        season or for this team (an injury or a roster move, the file doesn't tell)."""
        times = self.times.get(g.team, [])
        first = self.season_first.get((g.team, g.season), 0)
        same = before is not None and before.season == g.season
        lo = max(first, bisect.bisect_right(times, before.t)) if same else first
        if bisect.bisect_left(times, g.t) - lo < ABSENCE:
            return False
        if not same or before.team != g.team or any(before.t < t < g.t for t in self.gaps.get(g.team, [])):
            return None
        return True

    def missed_since(self, team: str, t: str) -> int:
        """His team's finished games after his last one (at t): "back after missing five or more" tonight."""
        times = self.times.get(team, [])
        return len(times) - bisect.bisect_right(times, t)

    def _raw_index(self):
        """Indexes for the check pass, built straight from the raw CSV rows (not from PG)."""
        if hasattr(self, "_rx"):
            return self._rx
        start = {ev: datetime.fromisoformat(g["start"].replace("Z", "+00:00")).astimezone(ET) for ev, g in self.gidx.items()}
        team_days = defaultdict(list)
        for ev, g in self.gidx.items():
            if g["home_pts"] != "" and g["away_pts"] != "":
                for tid in (g["home_id"], g["away_id"]):
                    team_days[tid].append((start[ev], ev, int(g["season"])))
        boxed = {(ev, r["team_id"]) for (_, ev), r in self.raw.items()}
        mine = defaultdict(list)
        for (aid, ev), r in self.raw.items():
            if ev in start:
                mine[aid].append((start[ev], ev, r["team_id"], int(self.gidx[ev]["season"])))
        for lst in list(team_days.values()) + list(mine.values()):
            lst.sort()
        self._rx = {"start": start, "team": team_days, "boxed": boxed, "mine": mine, "playoffs": playoff_starts(self.gidx.values())}
        return self._rx

    def raw_back(self, aid: str, ev: str) -> bool:
        """The check pass's own count: did his team play ABSENCE or more games in a row without him before this one?"""
        rx = self._raw_index()
        games = rx["mine"][aid]
        i = next(n for n, x in enumerate(games) if x[1] == ev)
        when, _, team, season = games[i]
        if i == 0 or games[i - 1][3] != season or games[i - 1][2] != team:
            return False
        missed = [x for x in rx["team"][team] if games[i - 1][0] < x[0] < when]
        return len(missed) >= ABSENCE and all((x[1], team) in rx["boxed"] for x in missed)

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
        r = self.raw[(aid, ev)]
        b = self.team_box.get((ev, r["team_id"])) or {}
        rx = self._raw_index()
        start, season = rx["start"][ev], int(self.gidx[ev]["season"])
        special = {"christmas"} if (start.month, start.day) == (12, 25) else set()
        if self.gidx[ev].get("postseason") == "1" and season in rx["playoffs"] and start.date() >= rx["playoffs"][season]:
            special.add("playoff")
        if self.raw_back(aid, ev):
            special.add("back")
        g4 = sum(1 for x in rx["team"][r["team_id"]] if 0 <= (start.date() - x[0].date()).days <= 3 and x[0] <= start)
        return {"tv": b.get("national_tv") == "1", "special": frozenset(special), "g4": g4, "starter": r.get("starter") == "1"}


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


def select(rows: list[PG], combo: tuple) -> list[PG]:
    """The games of a window where every condition held, newest first. It stops at the first game the file can't
    say about (a blank temperature) where the other conditions held, so "his last n" never skips one that might count."""
    sel = []
    for g in rows:
        known = [c.known is None or c.known(g) for c in combo]
        if not all(known):
            if all(c.pred(g) for c, k in zip(combo, known) if k):
                break
            continue
        if all(c.pred(g) for c in combo):
            sel.append(g)
    return sel


def leading(rows: list[PG], ok) -> list[PG]:
    """His current run, newest first: the games before the first one where ok fails."""
    out = []
    for g in rows:
        if not ok(g):
            break
        out.append(g)
    return out


def role_run(hist: list[PG], team: str, role: str, before: int) -> tuple[list[PG], bool]:
    """(run, again): his current run as a starter (NBA) or as his team's lead back (NFL), newest first, when at least
    `before` games for this team out of that role came right before it (a one-game benching isn't a move into the
    lineup); `again` when he had the role for this team before that stretch ("since returning to the starting lineup").
    ([], False) when the data starts inside the run, or the run or that stretch reaches another team or a game the
    file can't say about."""
    run, out_of = [], 0
    for g in hist:
        v = getattr(g, role)
        if out_of >= before and not (g.team == team and v is False):
            return run, g.team == team and v is True   # the game before the whole stretch out of the role
        if out_of < before and (g.team != team or v is None or (v and out_of)):
            return [], False
        if v:
            run.append(g)
        else:
            out_of += 1
    return (run, False) if out_of >= before else ([], False)


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
    # a team with an earlier game still to play (NBA tomorrow, after tonight): its last result, rest and form
    # aren't known yet, so they aren't used (D-119, as D-118 does for the NFL game lines)
    pending = c.get("pending", False)
    if c["prev"] in ("W", "L") and not pending:
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
            # games.csv leaves temperature and wind blank for many outdoor games (70 of 2026's first 114), so the
            # sample stops at the first one it can't say about rather than skipping it (D-119)
            if c.get("temp") is not None and c["temp"] < 35:
                out.append(Cond("cold", "", "in temperatures under 35 degrees", lambda g: g.temp is not None and g.temp < 35, rare=True,
                                known=lambda g: g.roof == "indoor" or g.temp is not None))
            if c.get("windy"):
                out.append(Cond("wind", "", "in winds of 15 mph or more", lambda g: g.wind is not None and g.wind >= 15, rare=True,
                                known=lambda g: g.roof == "indoor" or g.wind is not None))
        elif c["roof"] == "indoor":
            out.append(Cond("roof", "indoor", "", lambda g: g.roof == "indoor"))
    elif not pending:
        if c["rest"] == 1:
            out.append(Cond("rest", "", "on the second night of a back-to-back", lambda g: g.rest == 1))
        elif 3 <= c["rest"] < 99:
            out.append(Cond("rest", "", "on two or more days of rest", lambda g: 3 <= g.rest < 99))
        if c.get("g4", 0) >= 3:   # D-119; a "rest" kind, so it never pairs with the back-to-back
            out.append(Cond("rest", "", "with three games in four nights", lambda g: g.g4 >= 3, feature="g4"))
    if sport == "NBA" and c.get("tv"):
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
        label = spec.get("top" if is_top else "bottom")
        if not label:
            continue   # pressure and interceptions are named at the top end only
        if spec.get("more"):
            pred = (lambda g, f=f: f in g.defense and g.defense[f][0] > g.defense[f][1] - 10) if high else \
                   (lambda g, f=f: f in g.defense and g.defense[f][0] <= 10)
        else:
            pred = (lambda g, f=f: f in g.defense and g.defense[f][0] <= 10) if low else \
                   (lambda g, f=f: f in g.defense and g.defense[f][0] > g.defense[f][1] - 10)
        out.append(Cond("defense", "", f"vs {label}", pred, feature=f, ticker=ticker))
    return out


def player_conds(sport: str, u: Upcoming, team: str, pid: str, m: Market, line: float, hist: list[PG], data) -> list[Cond]:
    c = u.ctx[team]
    out = []
    pos = hist[0].pos if hist else ""
    when = CFG[sport]["prev"]
    last = hist[0] if hist else None
    pending = c.get("pending", False)   # an earlier game still to play: "the game before" isn't his last one yet
    if last and last.season == u.season and not pending:
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
        # D-119: tonight he'd be back after missing his team's last five or more games (not listed Out: he has props).
        # Rare, so it's held to the special-date bar (5 games, 80%)
        espn = data.gsis_to_espn.get(pid, "") if sport == "NFL" else pid
        if (sport == "NBA" and last.team == team and data.missed_since(team, last.t) >= ABSENCE
                and espn not in u.outs.get(team, {})):
            out.append(Cond("special", "", "back after missing five or more", lambda g: g.back is True, rare=True,
                            feature="back", known=lambda g: g.back is not None))
    out.extend(defense_conds(sport, u, team, m, pos))
    # D-119: at altitude, for a visitor who never played for Denver or Utah (so "his games at Denver" are all road games)
    if (sport == "NBA" and not c["home"] and not c["neutral"] and c["opp"] in ALTITUDE
            and not any(g.team in ALTITUDE for g in hist)):
        out.append(Cond("alt", "", "at Denver and Utah", lambda g: not g.home and not g.neutral and g.opp in ALTITUDE, rare=True))
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
    suffix_order = ["opp", "former", "coach", "defense", "alt", "qb", "qbout", "out", "special", "cold", "wind", "rest", "fd", "bigline", "prev", "big", "own", "mins"]
    sufs = []
    for c in sorted(conds, key=lambda c: suffix_order.index(c.kind) if c.kind in suffix_order else 99):
        if not c.suffix:
            continue
        s = c.suffix
        if c.kind == "prev" and team_name and team_only_sample:
            s = s.replace("a win", f"a {team_name} win").replace("a loss", f"a {team_name} loss")
        sufs.append(s)
    merged = []
    for sfx in sufs:   # "vs Top-10 pass defenses and ...", "without A and B"
        word = sfx.split(" ", 1)[0]
        if merged and word in ("vs", "without") and merged[-1].startswith(word + " "):
            merged[-1] += " and " + sfx[len(word) + 1:]
        else:
            merged.append(sfx)
    return " ".join(adjs + [noun] + merged)


def pick_verb(m: Market, side: str, seed: str, short: bool = False) -> str:
    options = VERBS[side] + (VERBS["over_yards"] if side == "over" and m.yards else [])
    if short:   # a sentence over MAX_WORDS gets one more try with the shortest verbs before it's dropped
        options = [v for v in options if len(v.split()) == min(len(o.split()) for o in options)]
    return options[zlib.crc32(seed.encode()) % len(options)]


def milestone(m: Market, line: float) -> float | None:
    """The round number a milestone line names for tonight's line, or None (see MILESTONES)."""
    above = [x for x in MILESTONES.get(m.key, ()) if x > line]
    return float(above[0]) if above and above[0] > line + 1 and above[0] <= 1.25 * line + 1 else None


def sentence(name: str, m: Market, line: float, side: str, hits: int, n: int, window: str, conds: tuple, team_name: str,
             team_only_sample: bool = False, seed: str = "", mark: float | None = None, short: bool = False) -> tuple[str, str]:
    """(text, record), record being the exact run of the text the app bolds. Varied verbs, short stat names.
    A perfect record reads "in 9 straight games" in every window."""
    if mark is not None:   # "has scored 30 or more Pts", over only
        verbs = [v for v in MILESTONE_VERBS.get(m.key, MILESTONE_VERBS[""]) if not short or " " not in v]
        lead = f"has {verbs[zlib.crc32((seed or name + m.key).encode()) % len(verbs)]} {fmt_num(mark)} or more {m.stat}"
    elif m.one and line == 0.5:
        lead = "has " + (m.one[0] if side == "over" else m.one[1])
    else:
        lead = f"has {pick_verb(m, side, seed or name + m.key, short)} {fmt_num(line)} {m.stat}"
    games = phrase(conds, team_name, team_only_sample)
    perfect = hits == n
    if window == "season" or window in SINCE:
        tail = "this season" if window == "season" else SINCE[window].format(team=team_name)
        record = f"{n} straight" if perfect else f"{hits} of his {n}"
        text = f"in {n} straight {games} {tail}" if perfect else f"in {hits} of his {n} {games} {tail}"
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
    # D-119: since moving into the starting lineup (NBA) or becoming his team's lead back (NFL), on the same terms
    role = "starter" if sport == "NBA" else ("lead" if hist[0].pos == "RB" else "")
    run, again = role_run(hist, team, role, ROLE_BEFORE[sport]) if role else ([], False)
    if run and len(run) <= MAX_SHARE * len(recent):
        windows[role + ("_again" if again else "")] = run
    out = []

    def add(window, combo, sel, side, hits, z, zb, base_rate, mark=None):
        n = len(sel)
        if window == "last10" and hits == n:
            return   # a perfect last 10 is part of a streak, which says it whole ("in 12 straight games")
        team_sample = all(g.team == team for g in sel)
        seed = f"{pid}|{m.key}|{side}|{window}|{'|'.join(c.adj + c.suffix + c.noun for c in combo)}" + (f"|{mark:g}" if mark else "")
        text, record = sentence(name, m, line, side, hits, n, window, combo, team_name, team_sample, seed, mark)
        if words(text) > MAX_WORDS:
            text, record = sentence(name, m, line, side, hits, n, window, combo, team_name, team_sample, seed, mark, short=True)
        if words(text) > MAX_WORDS:
            return   # too long to read at a glance, even with the shortest verb (D-119)
        out.append(Angle(sport, pid, name, team, m, prop, line, side, hits, n, z, zb, base_rate, window,
                         combo, text, record, [(g.key, g.vals[m.key]) for g in sel], prominence,
                         sum(1 for g in sel if g.season >= season - (WINDOW_SEASONS - 1)) / n, mark))

    def clears(hits, n, base_rate):
        z, zb = zscore(hits, n), zscore(hits, n, base_rate)
        rate = hits / n
        return rate >= base_rate + MIN_UPLIFT and rate >= FLOOR_RATE and z >= FLOOR_Z and zb >= FLOOR_ZBASE, z, zb

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
        size = 2 if window in ("recent", "career") else (1 if window == "season" or window in SINCE else 0)
        single_n, single_rate = {}, {}
        for combo in combos(usable, size):
            if window == "career" and not any(c.rare for c in combo):
                continue  # every season in the data only for rare situations (this opponent, special dates, prime time, ...)
            if window == "recent" and not combo:
                continue  # that's the base rate itself
            special = len(combo) == 1 and combo[0].kind == "special"
            sel = select(rows, combo)
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
                add(window, combo, sel, side, hits, z, zb, base[side])
    # D-119: his current run against tonight's number, no condition: "in 9 straight games"
    for side in ("over", "under"):
        if base[side] > MAX_BASE or not current_ok[side] or (m.key == "anytime_td" and side == "under"):
            continue
        streak = leading(hist, lambda g, s=side: hit(g, s))
        if len(streak) >= STREAK_MIN[sport]:
            ok, z, zb = clears(len(streak), len(streak), base[side])
            if ok:
                add("streak", (), streak, side, len(streak), z, zb, base[side])
    # D-119: a milestone just above the line, no condition: "has scored 30 or more Pts in 8 of his last 10 games"
    mark = milestone(m, line)
    if mark is not None:
        reached = lambda g: g.vals[m.key] >= mark   # noqa: E731
        mbase = sum(1 for g in recent if reached(g)) / len(recent)
        now_ok = len(this_season) < SEASON_CHECK[sport] or sum(1 for g in this_season if reached(g)) / len(this_season) >= 0.5
        streak = leading(hist, reached)
        for window, sel, floor_n in (("last10", recent[:10], min_games), ("season", windows.get("season", []), min_games),
                                     ("streak", streak, STREAK_MIN[sport])):
            if mbase > MAX_BASE or not now_ok or len(sel) < floor_n:
                continue
            hits = sum(1 for g in sel if reached(g))
            ok, z, zb = clears(hits, len(sel), mbase)
            if ok:
                add(window, (), sel, "over", hits, z, zb, mbase, mark)
    # the same sample in several windows (career = recent when there are no older games): keep one
    seen, uniq = set(), []
    for a in sorted(out, key=lambda a: a.order, reverse=True):
        k = (a.side, a.hits, a.games, a.kinds, a.mark, tuple(k for k, _ in a.sample[:3]))
        if k not in seen:
            seen.add(k)
            uniq.append(a)
    # a milestone with the same record as the line itself in the same games adds nothing: the line's number wins (D-105)
    plain = {(a.side, a.hits, a.games, a.kinds, tuple(k for k, _ in a.sample)) for a in uniq if a.mark is None}
    return [a for a in uniq if a.mark is None or (a.side, a.hits, a.games, a.kinds, tuple(k for k, _ in a.sample)) not in plain]


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
        if a.mark is not None:
            hits += v >= a.mark
        else:
            hits += (v > a.line) if a.side == "over" else (v < a.line)
        opp, home, neutral = data.raw_side(a.player, key)
        if "role" in a.kinds and (neutral or home != want["home"]):
            return f"home/road wrong in {key}"
        if ("opp" in a.kinds or "former" in a.kinds) and opp != want["opp"]:
            return f"opponent wrong in {key}"
        if "alt" in a.kinds and (home or neutral or opp not in ALTITUDE):
            return f"altitude wrong in {key}"
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
            if c.feature == "g4" and "g4" in flags and flags["g4"] < 3:
                return f"three in four wrong in {key}"
        if a.window.startswith("starter") and flags.get("starter") is not True:
            return f"not a start in {key}"
        if a.window.startswith("lead") and data.lead_of(a.player, key, a.team) is not True:
            return f"not the lead back in {key}"
    if hits != a.hits:
        return f"hits {hits} != {a.hits}"
    # "his last n": a streak is his newest games, and a condition the file can't always say about (temperature)
    # skipped no game newer than the oldest one in the sample where the rest of the combo held
    hist = cut_at_gaps([g for g in data.by_player.get(a.player, []) if g.t < u.t], getattr(data, "gaps", {}))
    keys = [k for k, _ in a.sample]
    if a.window == "streak" and (keys != [g.key for g in hist[:a.games]] or a.hits != a.games):
        return "streak is not his latest games"
    unsure = [c for c in a.conds if c.known is not None]
    if unsure:
        oldest = next((g.t for g in hist if g.key == keys[-1]), None)
        if oldest is None:
            return "sample not in his history"
        for g in hist:
            if g.t <= oldest or g.key in keys or not all(c.pred(g) for c in a.conds if c.known is None):
                continue
            known = data.raw_flags(a.player, g.key).get("known", {})
            if not all(known.get(c.kind, True) for c in unsure):
                return f"skipped {g.key}, which the file can't say about"
    if a.mark is not None:
        if f"{fmt_num(a.mark)} or more" not in a.text or a.record not in a.text:
            return "sentence lost its numbers"
    elif a.record not in a.text or (a.line != 0.5 and fmt_num(a.line) not in a.text):
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
            # an earlier game of this team still to be played: its last result isn't the one games.csv has yet
            pending = any(o["season"] == g["season"] and o["result"] == "" and o["game_id"] != g["game_id"]
                          and team in (franchise(o["home_team"]), franchise(o["away_team"]))
                          and (o["gameday"], o["gametime"] or "") < (g["gameday"], g["gametime"] or "") for o in data.games)
            situ[team] = {**k, "roof": roof, "temp": float(temp) if temp is not None else None,
                          "windy": "wind" in (weather.get("displayValue") or "").lower(),
                          "opp_name": NFL_TEAMS.get(k["opp"], k["opp"]), "opp_abbr": espn_abbr.get("away" if side == "home" else "home", k["opp"]),
                          "defense": {f: tb[k["opp"]] for f, tb in table.items() if k["opp"] in tb}, "pending": pending}
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
    others = []
    events = scoreboard("NBA", days, others)
    pending = pending_teams(events, others, lambda ev: ev in data.gidx and data.gidx[ev]["home_pts"] != "")
    for e in events:
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
                         "defense": {f: tb[oid] for f, tb in table.items() if oid in tb},
                         "g4": games_in_four(data.team_games.get(tid, []), t), "pending": tid in pending.get(e["id"], set())}
            teams[side] = {"id": tid, "abbr": me["team"]["abbreviation"], "name": me["team"].get("name") or me["team"].get("shortDisplayName")}
        injuries = fetch_injuries("NBA", e["id"])
        outs = {teams[s]["id"]: injuries.get(teams[s]["abbr"], {}) for s in ("home", "away")}
        special = set({"christmas"} if (start.month, start.day) == (12, 25) else set())
        if (e.get("season") or {}).get("type") == 3:   # the playoffs (ESPN's play-in is type 5)
            special.add("playoff")
        special = frozenset(special)
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
            "recent_share": round(a.recent_share, 2), "stale": not a.fresh, "milestone": a.mark}


def game_context(u: Upcoming) -> dict:
    start = datetime.fromisoformat(u.start.replace("Z", "+00:00")).astimezone(ET)
    home = u.ctx[u.teams["home"]["id"]]
    special = {"thanksgiving": "Thanksgiving", "christmas": "Christmas Day", "week1": "season opener",
               "finale": "season finale", "intl": "international game", "playoff": "playoff game"}
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
    # 30 games over three seasons: 30 points at home, 18 on the road; the home games came against Top-10 scoring defenses
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
            return getattr(self, "full", "Test Player")

        def value(self, pid, key, mk):
            return next(r.vals[mk.key] for r in rows if r.key == key)

        def raw_side(self, pid, key):
            return next((r.opp, r.home, r.neutral) for r in rows if r.key == key)

        def raw_flags(self, pid, key):
            r = next(r for r in rows if r.key == key)
            return {"special": r.special, "g4": r.g4, "starter": r.starter, "known": {"cold": r.temp is not None}}

        def prev_stat(self, g, stat):
            return g.vals.get(stat, 0.0)

        def missed_since(self, team, t):
            return getattr(self, "missed", 0)
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
    assert top.family == "defense" and top.text.endswith("in 15 straight games vs Top-10 scoring defenses"), top.text
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
                      (Cond("defense", "", "vs Top-10 run defenses", None),), "Lions")
    assert t == "A B has scored in 10 of his last 11 games vs Top-10 run defenses", t
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
    self_test_wave1(Fake)
    print("self-test passed")


def self_test_wave1(Fake) -> None:
    """D-119: streaks, milestones, the starting lineup window, the known-temperature stop, altitude, three in four
    nights, games back from an absence, playoffs, top-only defenses, the pending-game guard and the word cap."""
    pts, reb, ast = NBA_MARKETS["Total Points"], NBA_MARKETS["Total Rebounds"], NBA_MARKETS["Total Assists"]
    rows = []
    # 40 games, newest first once indexed: last season (2026) and this one (2027), 20 each
    for i in range(40):
        s = 2026 + i // 20
        newest = 39 - i   # 0 = his latest game
        p = 31.0 if (newest < 10 and newest not in (3, 7)) or (newest >= 10 and newest % 10 < 3) else (27.0 if newest < 10 else 22.0)
        r = 25.0 if newest < 9 else (10.0 if newest == 9 else (25.0 if newest % 2 else 6.0))
        a = (7.0 if newest != 5 else 4.0) if newest < 12 else (7.0 if newest % 5 < 2 else 4.0)
        rows.append(PG(key=f"w{i}", season=s, t=(date(s - 1, 11, 1) + timedelta(days=3 * (i % 20))).isoformat() + "T19:00",
                       player="p2", team="T1", opp="T2", home=i % 2 == 0, neutral=False,
                       vals={k.key: 0.0 for k in NBA_MARKETS.values()} | {"pts": p, "reb": r, "ast": a},
                       starter=newest < 12 or newest % 3 == 0))
    for r in rows[-17:-12]:
        r.starter = False   # five games off the bench right before his current run of 12 starts
    data = Fake()
    data.index(rows)
    data.raw = {("p2", r.key): {"min": "30"} for r in rows}
    data.value = lambda pid, key, mk: next(r.vals[mk.key] for r in rows if r.key == key)
    data.raw_side = lambda pid, key: next((r.opp, r.home, r.neutral) for r in rows if r.key == key)
    data.raw_flags = lambda pid, key: next({"special": r.special, "g4": r.g4, "starter": r.starter} for r in rows if r.key == key)
    u = Upcoming("NBA", "y", "2027-02-01T00:00Z", "2027-02-01T19:00", 2027, "A at B",
                 {"home": {"id": "T1", "abbr": "ONE", "name": "Ones"}, "away": {"id": "T2", "abbr": "TWO", "name": "Twos"}},
                 {"T1": {"opp": "T2", "opp_abbr": "TWO", "home": True, "neutral": False, "rest": 2, "prev": "W", "spread": None,
                         "opp_name": "Twos", "defense": {}, "tv": False}}, {}, {})
    # a streak against tonight's number: his last 9, then a miss
    st = [x for x in evaluate("NBA", u, "T1", "p2", "Total Rebounds", 20.5, data, "Ones") if x.window == "streak"]
    assert st and st[0].text.endswith("20.5 Reb in 9 straight games") and st[0].family == "form", [x.text for x in st]
    assert st[0].angle_type == "form:streak" and verify(st[0], data, u) is None
    assert verify(Angle(**{**st[0].__dict__, "sample": st[0].sample[1:] + st[0].sample[:1]}), data, u) is not None
    # a milestone: 30 or more over a 26.5 line, 8 of his last 10
    assert milestone(pts, 26.5) == 30 and milestone(pts, 24.5) is None and milestone(pts, 20.5) == 25
    assert milestone(NFL_MARKETS["Total Receiving Yards (incl. overtime)"], 72.5) is None
    assert milestone(NFL_MARKETS["Total Receiving Yards (incl. overtime)"], 85.5) == 100
    ms = [x for x in evaluate("NBA", u, "T1", "p2", "Total Points", 26.5, data, "Ones") if x.mark is not None]
    assert ms and re.search(r"^Test Player has (scored|put up|posted) 30 or more Pts in 8 of his last 10 games$", ms[0].text), [x.text for x in ms]
    assert ms[0].angle_type == "form:milestone" and ms[0].side == "over" and ms[0].line == 26.5 and verify(ms[0], data, u) is None
    assert verify(Angle(**{**ms[0].__dict__, "mark": 31.0}), data, u) is not None
    # since moving (back) into the starting lineup: his 12 straight starts after six off the bench, 11 over
    sl = [x for x in evaluate("NBA", u, "T1", "p2", "Total Assists", 5.5, data, "Ones") if x.window == "starter_again" and not x.conds]
    assert sl and sl[0].text.endswith("5.5 Ast in 11 of his 12 games since returning to the starting lineup"), [x.text for x in sl]
    assert verify(sl[0], data, u) is None and sl[0].angle_type == "form:starter"
    assert len(role_run(data.by_player["p2"], "T1", "starter", 5)[0]) == 12 and role_run(data.by_player["p2"], "T1", "starter", 5)[1]
    assert not role_run(data.by_player["p2"], "T9", "starter", 5)[0] and not role_run(data.by_player["p2"], "T1", "starter", 7)[0]
    rows[-15].starter = True   # two bench games, a start, two more: a short benching, not a move into the lineup
    assert not role_run(data.by_player["p2"], "T1", "starter", 5)[0]
    rows[-15].starter = False
    for r in rows[:-17]:
        r.starter = False   # off the bench in every game before: a first move into the lineup
    sl = [x for x in evaluate("NBA", u, "T1", "p2", "Total Assists", 5.5, data, "Ones") if x.window == "starter" and not x.conds]
    assert sl and sl[0].text.endswith("5.5 Ast in 11 of his 12 games since moving into the starting lineup"), [x.text for x in sl]
    t, rec = sentence("A B", NFL_MARKETS["Total Passing Yards (incl. overtime)"], 173.5, "under", 10, 10, "team", (), "Steelers")
    assert t.endswith("173.5 Pass Yds in 10 straight games since joining the Steelers") and rec == "10 straight", t
    # the word cap: a long name pushes every sentence past 24 words
    data.full = "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu"
    long = evaluate("NBA", u, "T1", "p2", "Total Points", 26.5, data, "Ones")
    assert long and not [x for x in long if words(x.text) > MAX_WORDS] and not [x for x in long if x.mark is not None]   # 26 words
    assert words("A B has cleared 17.5 Pts + Reb + Ast") == 8
    rec_yds = NFL_MARKETS["Total Receiving Yards (incl. overtime)"]
    assert {pick_verb(rec_yds, "over", str(i), short=True) for i in range(40)} == {"cleared", "topped"}
    assert {pick_verb(rec_yds, "under", str(i), short=True) for i in range(40)} == {"stayed under", "finished under"}
    del data.full
    # the known-temperature stop: a blank temperature where the other conditions held ends "his last n"
    g = [PG(key=str(i), season=2026, t=f"2026-12-{20 - i:02d}T13:00", player="p", team="T", opp="O", home=True, neutral=False,
            vals={}, roof="outdoor", temp=(None if i == 2 else (20.0 if i % 2 == 0 else 50.0))) for i in range(8)]
    cold = Cond("cold", "", "in temperatures under 35 degrees", lambda x: x.temp is not None and x.temp < 35,
                known=lambda x: x.roof == "indoor" or x.temp is not None)
    assert [x.key for x in select(g, (cold,))] == ["0"]
    home_only = Cond("role", "road", "", lambda x: not x.home)
    assert select(g, (cold, home_only)) == []   # road games only: the blank home game doesn't matter, nothing qualifies
    # altitude, three in four nights, back from an absence, playoffs: phrases and flags
    assert phrase((Cond("alt", "", "at Denver and Utah", None),)) == "games at Denver and Utah"
    assert phrase((Cond("rest", "", "with three games in four nights", None),)) == "games with three games in four nights"
    assert phrase((Cond("special", "", "back after missing five or more", None, feature="back"),)) == "games back after missing five or more"
    assert phrase((Cond("special", "playoff", "", None, feature="playoff"),)) == "playoff games"
    assert games_in_four([("2027-01-28T19:00", "a"), ("2027-01-29T19:00", "b"), ("2027-01-31T19:00", "c")], "2027-02-01T19:00") == 3
    assert games_in_four([("2027-01-27T19:00", "a"), ("2027-01-30T19:00", "b")], "2027-02-01T19:00") == 2
    assert "playoff" in nfl_special({"gameday": "2027-01-10", "game_type": "WC", "week": "19", "season": "2026", "location": "Home"}, {})
    days = [("2026-04-14", 2), ("2026-04-15", 2), ("2026-04-17", 2), ("2026-04-18", 4)]
    post = [{"postseason": "1", "home_pts": "100", "season": "2026", "start": f"{d}T23:00Z"} for d, n in days for _ in range(n)]
    assert playoff_starts(post) == {2026: date(2026, 4, 18)}
    nba = NBAData.__new__(NBAData)
    tt = [f"2027-01-{d:02d}T19:00" for d in range(1, 13)]
    nba.times, nba.season_first, nba.gaps = {"T": tt}, {("T", 2027): 0}, {}

    def pg(day, team="T", season=2027):
        return PG(key=str(day), season=season, t=f"2027-01-{day:02d}T19:00", player="p", team=team, opp="O", home=True, neutral=False, vals={})
    assert nba.absence_return(pg(8), pg(1)) is True        # missed six in a row
    assert nba.absence_return(pg(5), pg(1)) is False       # missed three
    assert nba.absence_return(pg(8), None) is None         # his first game this season, after seven: the file can't say why
    assert nba.absence_return(pg(3), None) is False        # two before his first game: not five
    nba.gaps = {"T": ["2027-01-04T19:00"]}
    assert nba.absence_return(pg(8), pg(1)) is None        # a game with no box score in between
    assert nba.missed_since("T", "2027-01-08T19:00") == 4
    # pressure and interceptions are named at the top end only, with the opponent's exact rank
    uq = Upcoming("NFL", "q", "", "2026-12-01T13:00", 2026, "", {}, {"T": {"opp": "O", "opp_abbr": "GB", "defense": {"press": (32, 32, 0.4), "intd": (1, 32, 0.2)}}}, {}, {})
    dc = defense_conds("NFL", uq, "T", NFL_MARKETS["Total Passing Interceptions (incl. overtime)"], "QB")
    assert [(x.suffix, x.ticker) for x in dc if x.feature in ("press", "intd")] == [("vs Top-10 pressure defenses", "GB DEF 1st in Pressure Rate")], dc
    # an earlier game still to play: no last result, rest or three in four for this one
    up = {**u.ctx["T1"], "prev": "W", "rest": 1, "g4": 3, "pending": True}
    kinds = {x.kind for x in team_conds("NBA", Upcoming("NBA", "z", "", u.t, 2027, "", u.teams, {"T1": up}, {}, {}), "T1")}
    assert not kinds & {"prev", "rest"}, kinds
    kinds = {(x.kind, x.feature) for x in team_conds("NBA", Upcoming("NBA", "z", "", u.t, 2027, "", u.teams, {"T1": {**up, "pending": False}}, {}, {}), "T1")}
    assert {("prev", ""), ("rest", ""), ("rest", "g4")} <= kinds, kinds


if __name__ == "__main__":
    main()
