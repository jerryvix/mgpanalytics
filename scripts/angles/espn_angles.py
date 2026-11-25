"""The one line per game for college football and the NBA (DECISIONS D-075, D-078, D-115, D-117, D-120).

Same method as nfl_angles.py: every angle that is true for this game, for both teams,
spread and total, from the free ESPN history built by espn_history.py; a real sample,
recent games, at most two conditions; scored by distance from a coin flip; written as one
sentence with its record and time frame; every chosen record recomputed from the raw CSV
before it can be used. No AI, no cost.

D-115 (owner, Nov 25: "I would just love like little variability"): the lines for a day are
picked together, not game by game. A condition family (after a win or loss, favorite or
underdog, home or road, rest, the series...) shows on at most 2 games of a sport's day, or
one in eight on a big college Saturday. Context such as rivalry week is one angle among
many, not a theme every line carries.

D-117: a team's record over several seasons only covers the stretch its core has been together
(college: the head coach's tenure; NBA: the current top scorer's seasons with the team).

D-120 (the catalog's NBA and college football wave, as D-118 did for the NFL): a sentence longer
than MAX_WORDS is dropped; a condition true for 90% or more of its games, or unknown for any game
the record could count, is never used; last game's result, streaks and the opponent's record count
only when no earlier game of the team (or the opponent) is still to be played, and rest, road trips
and back-to-backs read the schedule, games still to be played included. Every sentence passes the
D-117 shape check (sentence_ok) before it can be picked.

College football angles: the head coach's record (the correct coach per season from
CollegeFootballData's coach list, matched by ESPN team id), the team this season, since 2024, and
against this opponent since 2016 (named rivalries read "in the Egg Bowl"; a series needs 6 meetings,
since teams meet once a year); home or road; favorite or underdog, 3 or less, 10 or more, 20 or more;
conference games; against ranked teams, Top-10 teams, when both teams are ranked, as an unranked team
against ranked teams; against teams over or under .500; against Top-10 scoring defenses; with two
Top-25 scoring offenses (totals); off a bye, after 30 or more days off, on a short week, against teams
off a bye; on the road after a road game; at night, on Tuesdays and Wednesdays, with a noon ET kickoff
(Pacific time zone teams); after a win or loss, after losing as a favorite, after losing by 21 or more,
after scoring 40 or more; streaks; after three or more straight covers or ATS losses; against teams
that won last season's meeting; against a coach's teams; against service academies; high or low
totals; November; rivalry week, the regular-season finale, the home finale, the game before a named
rivalry; conference title games, bowl games, College Football Playoff games (ESPN's notes).
NBA angles: the team this season and since 2024-25, against this opponent since 2022-23;
home or road; favorite or underdog, 2.5 or less, 7 or more; the second and first night of a
back-to-back, two or more days of rest, more rest than the opponent, the third game in four nights,
the fourth in six, both teams on a back-to-back, on the road the night after a home game; against
teams on a back-to-back; after a win or loss, by 20 or more, by 3 or fewer, after an overtime game,
two or more straight losses, three or four or more straight wins, three or more straight covers or ATS
losses; the first, third or later and last game of a road trip, back home after a road trip, the
fourth game or later of a homestand; in Denver and Utah; Eastern teams in the Pacific time zone; tip-offs
before 4 PM ET or at 10 PM ET or later; against teams over or under .500, Top-10 scoring offenses and
defenses, the defending champion, teams that have won four or more straight, teams that won the last
meeting (by 20 or more), the same team twice in a row, in-state teams; two of the 10 fastest or slowest
paced teams (totals); division games, against the other conference; national TV; NBA Cup games, the
playoffs and each round (ESPN's notes); the first week of the season, the first five games after the
All-Star break; high or low totals; the month; without a top-3 scorer who is listed out tonight
(ESPN's injury report, checked against the box scores).

Men's college basketball ("cbb", D-116, off until the owner turns it on): Division I games only.
The head coach's record (ESPN's coach, checked against his own season record), the team this
season, since 2024-25, and against this opponent since 2012-13; home, road or neutral site;
favorite or underdog; 10+ point spreads; conference games; against ranked teams; against
teams over or under .500; after a win or loss; streaks; a day after the last game, after a
week or more off, more rest than the opponent; on the road after a road game; high or low
totals; the month; conference tournaments; the NCAA tournament. In NCAA tournament games,
seed matchups ("1 seeds are 162-2 against 16 seeds since 1985", "5 seeds are 22-28-2 ATS against
12 seeds since 2013", both through the 2026 tournament) and the coach's tournament record since 2014
(within his unbroken run in the data), from data/history/ncaab_tournament.csv
(ncaa_tournament.py), each recomputed from that file before it can be used.

Usage:
  python3 -I scripts/angles/espn_angles.py --league cfb --history data/history/cfb_espn.csv --coaches <cfbd coaches.json> --days 6
  python3 -I scripts/angles/espn_angles.py --league nba --history data/history/nba_espn.csv \
      --boxes data/history/nba_players_espn.csv --teams data/history/nba_team_games_espn.csv --days 2
  python3 -I scripts/angles/espn_angles.py --league cbb --history data/history/cbb_espn.csv <current season csv> \
      --tournament data/history/ncaab_tournament.csv --season 2027 --days 2
  (--replay 2026-03-19 runs a past day as if its games were upcoming, from the history before it)
  python3 -I scripts/angles/espn_angles.py --self-test   (both sentence shapes for every phrase, and the wording guards)
"""
import argparse
import csv
import json
import math
import os
import re
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}
HERE = os.path.dirname(os.path.abspath(__file__))
MIN_GAMES, MIN_RATE, MIN_Z = 10, 0.65, 2.0
FLOOR_RATE, FLOOR_Z = 0.62, 1.6
SERIES_MIN = 6          # college teams meet once a year: a series or rivalry-week record needs 6 games (D-115)
RECENT_SEASONS = 2
MAX_WORDS = 18          # D-120 (as D-118): a longer sentence is dropped before picking
TAUTOLOGY = 0.9         # D-120 (as D-118): a condition true for 90% or more of its games says nothing
ET = timezone(timedelta(hours=-5))
NY = ZoneInfo("America/New_York")   # kickoff clock time (night games) follows daylight saving

CONF = {
    "cfb": {"path": "football/college-football", "query": "&groups=80&limit=400", "big": 10, "since": 2016, "hi": 60, "lo": 42,
            "small": 3, "huge": 20, "blowout": 21, "rank_games": 4, "rank_teams": 100},
    "nba": {"path": "basketball/nba", "query": "", "big": 7, "since": 2023, "hi": 238, "lo": 222,
            "small": 2.5, "blowout": 20, "rank_games": 5, "rank_teams": 20},
    # men's college basketball (D-116): lines start with 2012-13; Division I only (ESPN group 50)
    # totals: 2025-26's median was 148.5; 160+ and 135- are about its top 12% and bottom 8%
    "cbb": {"path": "basketball/mens-college-basketball", "query": "&groups=50&limit=400", "big": 10, "since": 2013, "hi": 160, "lo": 135},
}
SPORT = {"cfb": "NCAAF", "nba": "NBA", "cbb": "NCAAB"}
COACH_TOURNEY_SINCE = 2014   # ESPN's checked coaches start with 2013-14 (Wikipedia's 2013 table misses 12 games' coaches)
HORIZON_DAYS = 7             # NBA: the schedule this far past the window tells the next game (D-120)

# NBA divisions by ESPN abbreviation (D-115); games of any other team (the All-Star games) are left out
NBA_DIV = {
    "BOS": "Atlantic", "BKN": "Atlantic", "NY": "Atlantic", "PHI": "Atlantic", "TOR": "Atlantic",
    "CHI": "Central", "CLE": "Central", "DET": "Central", "IND": "Central", "MIL": "Central",
    "ATL": "Southeast", "CHA": "Southeast", "MIA": "Southeast", "ORL": "Southeast", "WSH": "Southeast",
    "DEN": "Northwest", "MIN": "Northwest", "OKC": "Northwest", "POR": "Northwest", "UTAH": "Northwest",
    "GS": "Pacific", "LAC": "Pacific", "LAL": "Pacific", "PHX": "Pacific", "SAC": "Pacific",
    "DAL": "Southwest", "HOU": "Southwest", "MEM": "Southwest", "NO": "Southwest", "SA": "Southwest",
}
EAST = {"Atlantic", "Central", "Southeast"}
# D-120: NBA teams in the Eastern and Pacific time zones (Phoenix keeps Mountain time all year), the states
# with two or more teams, and the two arenas at altitude
NBA_ET = {"ATL", "BOS", "BKN", "CHA", "CLE", "DET", "IND", "MIA", "NY", "ORL", "PHI", "TOR", "WSH"}
NBA_PT = {"GS", "LAC", "LAL", "POR", "SAC"}
PT_STATES = {"CA", "OR", "WA", "NV"}
NBA_STATE = {"GS": "California", "LAC": "California", "LAL": "California", "SAC": "California",
             "DAL": "Texas", "HOU": "Texas", "SA": "Texas", "NY": "New York", "BKN": "New York", "MIA": "Florida", "ORL": "Florida"}
ALTITUDE = {"DEN", "UTAH"}
FIRST_CHAMP = {2023: "9"}    # the file starts with 2022-23: the defending champion that season, the Warriors, won the 2022 Finals
ROUNDS = [(r"\b1st Round\b", "in the first round"), (r"\bSemifinals\b", "in the second round"),
          (r"\b(East|West) Finals\b", "in the conference finals"), (r"^NBA Finals\b", "in the NBA Finals")]

# College rivalries with a name people use (D-115). Any other series reads "against Nebraska".
CFB_RIVALRIES = {frozenset(p): n for p, n in [
    (("MISS", "MSST"), "the Egg Bowl"), (("ALA", "AUB"), "the Iron Bowl"), (("TEX", "TA&M"), "the Lone Star Showdown"),
    (("SC", "CLEM"), "the Palmetto Bowl"), (("IOWA", "NEB"), "the Heroes Game"), (("ARIZ", "ASU"), "the Territorial Cup"),
    (("WASH", "WSU"), "the Apple Cup"), (("CAL", "STAN"), "the Big Game"), (("BYU", "UTAH"), "the Holy War"),
    (("KU", "KSU"), "the Sunflower Showdown"), (("PITT", "WVU"), "the Backyard Brawl"), (("ARMY", "NAVY"), "the Army-Navy Game"),
    (("UVA", "VT"), "the Commonwealth Clash"), (("OU", "OKST"), "Bedlam"),
]}
CFB_PT = {"WASH", "WSU", "ORE", "ORST", "CAL", "STAN", "UCLA", "USC", "SDSU", "SJSU", "FRES", "NEV", "UNLV"}   # D-120: noon ET kickoffs
ACADEMIES = {"ARMY", "NAVY", "AFA"}

# Condition kinds that count as one family for the slate's variety (D-115): two of one family never pair
FAMILY = {"big": "fd", "small": "fd", "huge": "fd",
          "streak": "prev", "blowout": "prev", "close": "prev", "ot": "prev", "atsrun": "prev", "upset": "prev", "scored": "prev",
          "restadv": "rest", "g4": "rest", "g6": "rest", "bothb2b": "rest", "b2bhome": "rest", "first": "rest", "layoff": "rest",
          "home_after": "trip", "tripend": "trip", "tripstart": "trip", "stand": "trip",
          "alt": "travel", "tz": "travel",
          "tipoff": "night", "midweek": "night", "noon": "night",
          "oppoff": "oppq", "oppdef": "oppq", "champ": "oppq", "hot": "oppq",
          "pace": "style", "offs": "style",
          "top10": "ranked", "bothrk": "ranked", "unrk": "ranked",
          "lastmeet": "rematch", "sameopp": "rematch", "lastyr": "rematch",
          "oppcoach": "opp",
          "round": "playoff",
          "opening": "month", "allstar": "month",
          "finale": "rweek", "homefinale": "rweek", "prerival": "rweek",
          "bowl": "post", "cfp": "post", "ccg": "post",
          "ctourney": "tourney", "ncaa": "tourney", "ncaa_coach": "tourney"}
TOTALS_ONLY = {"tot", "pace", "offs"}
# D-123 relevance (owner, Nov 25: "is that a stat that holds?"). A backtest of every line shown in 2025-26 (NBA 50.2%,
# college football 50.4%) showed the most lopsided record per game is mostly a fluke found by searching. Three checks:
# 1. A reason: each condition is rated for the spread and for the total. "none" drops the record (three straight
#    non-covers say nothing about the total), "weak" marks it down.
NO_REASON = {"ats": {"tot", "pace", "offs"},
             "ou": {"prev", "streak", "atsrun", "upset"}}
WEAK_REASON = {"ats": {"month", "opening", "allstar", "tv", "night", "tipoff", "midweek", "noon", "xconf"},
               "ou": {"role", "fd", "big", "small", "huge", "month", "opening", "allstar", "div", "conf", "ranked", "top10", "bothrk",
                      "unrk", "hot", "champ", "oppq", "trip", "home_after", "tripend", "tripstart", "stand", "tz", "rweek", "finale",
                      "homefinale", "prerival", "cup", "academy", "instate", "xconf", "tv", "night", "tipoff", "midweek", "noon",
                      "blowout", "scored", "ot", "close"}}
# 2. Beyond one team: the record is shrunk toward how every team did in the same spot over the same seasons
#    (SHRINK games of the league's rate), so a short lucky run counts for less and a league-wide lean counts for more.
SHRINK = 12
NO_BASELINE = {"out", "lastmeet", "lastyr", "sameopp", "oppcoach"}   # about this team or this pairing only
# 3. It holds: the first and second halves of the sample both lean the same way, 55% or more each.
HALF_RATE, HALF_MIN = 0.55, 4
SIZE_KINDS = {"fd", "big", "small", "huge"}
OPP_LIKE = {"opp", "oppcoach"}   # name this opponent (or its coach)
# say something about the opponent already named, so they never pair with OPP_LIKE
OPPONENT_KINDS = {"oppq", "opprest", "div", "xconf", "ranked", "conf", "rweek", "bothb2b", "alt", "tz", "oppoff", "oppdef", "champ",
                  "hot", "pace", "offs", "top10", "bothrk", "unrk", "sameopp", "instate", "academy"}
# the long team window is for this matchup, rivalry and once-a-year events only (D-115)
LONG_OK = {"opp", "rweek", "ncaa", "ctourney", "oppcoach", "alt", "champ", "instate", "cup", "playoff", "round", "opening",
           "allstar", "prerival", "academy", "bowl", "cfp", "ccg", "finale", "homefinale"}
SERIES_KINDS = {"opp", "rweek", "oppcoach"}   # college football: teams meet once a year, so 6 meetings (D-115)
EVENT_START = {"cup": 2024}                   # the NBA Cup began in 2023-24: its frame never starts earlier
GUARD_WORDS = {"against", "with", "after", "on", "as"}   # two phrases never start the same way ("on the road" excepted)
# In the over/under shape these fold into the lead: "the under is 9-2 in USC conference games"
GROUPS = {"in conference games": "conference games", "in division games": "division games", "in NBA Cup games": "NBA Cup games",
          "in the playoffs": "playoff games", "in the first round": "first-round games", "in the second round": "second-round games",
          "in the conference finals": "conference finals games", "in the NBA Finals": "NBA Finals games",
          "in bowl games": "bowl games", "in College Football Playoff games": "College Football Playoff games",
          "in conference title games": "conference title games"}
MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
CFP_NOTE = re.compile(r"College Football Playoff|\bCF[BP] (Semifinal|National Championship)", re.I)
NOT_BOWL = re.compile(r"First Round|National Championship", re.I)
CUP_NOTE = re.compile(r"^NBA (Cup|In-Season Tournament)")

# D-120: every phrase the engine writes (the self-test renders each in both sentence shapes)
P = {
    "home": "at home", "road": "on the road", "neutral": "at neutral sites",
    "fav": "as a favorite", "dog": "as an underdog", "size": "as {art} {fd} of {n}{more}",
    "prev_w": "after a win", "prev_l": "after a loss",
    "streak_l2": "after two or more straight losses", "streak_w3": "after three or more straight wins",
    "streak_w4": "after four or more straight wins",
    "blowout_l": "after losing by {n} or more", "blowout_w": "after winning by {n} or more", "close": "after losing by 3 or fewer",
    "ot": "after an overtime game", "upset": "after losing as a favorite", "scored": "after scoring 40 or more",
    "cover3": "after three or more straight covers", "miss3": "after three or more straight ATS losses",
    "tot_hi": "with a total of {n} or more", "tot_lo": "with a total of {n} or less",
    "conf": "in conference games", "ranked": "against ranked teams", "top10": "against Top-10 teams",
    "bothrk": "when both teams are ranked", "unrk": "as an unranked team against ranked teams",
    "bye": "off a bye", "layoff": "after 30 or more days off", "short": "on a short week", "oppbye": "against teams off a bye",
    "trip2": "on the road after a road game", "night": "at night", "midweek": "on Tuesdays and Wednesdays",
    "noon": "with a noon ET kickoff", "over": "against teams over .500", "under": "against teams under .500",
    "oppdef": "against Top-10 scoring defenses", "oppoff": "against Top-10 scoring offenses", "offs": "with two Top-25 scoring offenses",
    "lastyr": "after losing last season's meeting", "academy": "against service academies",
    "month": "in {month}", "rweek": "in rivalry week", "finale": "in the regular-season finale", "homefinale": "in the home finale",
    "prerival": "in the game before {rivalry}", "ccg": "in conference title games", "bowl": "in bowl games",
    "cfp": "in College Football Playoff games", "opp": "against {opp}", "rivalry": "in {rivalry}", "oppcoach": "against {coach} teams",
    "day_after": "the day after a game", "week_off": "after a week or more off", "restadv_cbb": "with more rest than the opponent",
    "ctourney": "in conference tournaments", "ncaa": "in the NCAA tournament",
    "b2b2": "on the second night of a back-to-back", "b2b1": "on the first night of a back-to-back",
    "rest2": "with two or more days of rest", "restadv": "with more rest than their opponent",
    "g4": "in the third game in four nights", "g6": "in the fourth game in six nights",
    "oppb2b": "against teams on the second night of a back-to-back", "bothb2b": "with both teams on a back-to-back",
    "b2bhome": "on the road the night after a home game",
    "trip3": "in the third game or later of a road trip", "tripend": "in the last game of a road trip",
    "tripstart": "in the first game of a road trip", "home_after": "back home after a road trip",
    "stand": "in the fourth game or later of a homestand", "alt": "in Denver and Utah", "tz": "in the Pacific time zone",
    "early": "with a tip-off before 4 PM ET", "late": "with a tip-off at 10 PM ET or later",
    "champ": "against the defending champion", "hot": "against teams riding four or more straight wins",
    "lastmeet": "after losing the last meeting", "lastblow": "after losing the last meeting by 20 or more",
    "sameopp": "in the second straight game against the same team", "instate": "against {state} teams",
    "fast": "between two of the 10 fastest-paced teams", "slow": "between two of the 10 slowest-paced teams",
    "div": "in division games", "xconf": "against the {conf}", "tv": "on national TV", "cup": "in NBA Cup games",
    "playoff": "in the playoffs", "opening": "in the first week of the season",
    "allstar": "in the first five games after the All-Star break", "out": "without {player}",
}


def family(kind: str) -> str:
    return FAMILY.get(kind, kind)


@dataclass
class Row:
    season: int
    start: datetime
    event: str
    team: str          # ESPN team id
    opp: str
    home: bool
    neutral: bool
    line: float        # the team's spread, negative = favorite
    ats: int
    ou: int | None     # None when no total was posted: such games sit out total angles
    total: float | None
    coach: str
    conf: bool
    opp_ranked: bool | None
    prev: str          # previous game this season: W, L or ""
    streak: int        # before this game: +3 = three straight wins, -2 = two straight losses
    rest: int          # days since the team's previous game this season (99 if first)
    opp_rest: int
    g4: int            # the team's games in the four days ending with this one
    trip: int          # straight road games ending with this one (0 at home or neutral)
    home_after: bool   # home after 3+ straight road games
    opp_over: int      # the opponent's record before this game, 8+ games: 1 over .500, -1 under, 0 otherwise
    div: bool          # NBA: same division
    xconf: bool        # NBA: the other conference
    tv: bool           # NBA: national TV
    rweek: bool        # college: Thanksgiving week, Tuesday to Sunday
    night: bool        # college: kickoff at 7 PM Eastern or later
    month: int
    coach_id: str = ""  # college basketball: ESPN's id for the checked head coach
    tourney: str = ""   # college basketball: NCAA, NIT, CONF (conference tournament) and the rest (espn_history.py)
    # D-120 (None: the file doesn't say for this game)
    margin_prev: int | None = None     # last game's margin
    ot_prev: bool | None = None
    favloss_prev: bool | None = None   # lost last game as a favorite
    pts_prev: int | None = None
    atsrun: int = 0                    # +3 = covered the last three, -3 = failed to cover the last three
    ats_open: bool = False             # the run reached a game with no line before 3: how it stood can't be told
    g6: int = 1
    stand: int = 0                     # straight home games ending with this one
    prev_home: bool | None = None      # the game before was a true home game
    prev_opp: str = ""
    next_rest: int | None = None       # days to the next game (None: none left in a finished season)
    next_road: bool | None = None
    next_opp: str = ""
    next_known: bool = True
    hour: int = 0                      # Eastern clock time
    minute: int = 0
    weekday: int = 0
    opp_abbr: str = ""
    opp_streak: int = 0
    site_pt: bool | None = None        # played in the Pacific time zone
    cup: bool = False
    playoff: bool | None = None
    rnd: str = ""
    champ: bool | None = None          # against the defending champion
    lastmeet: int | None = None        # the last meeting: 1 won, -1 lost
    lastmargin: int | None = None
    lastyr: bool | None = None         # college: the opponent won last season's meeting
    instate: bool = False
    opening: bool = False
    allstar: bool = False
    oppoff10: bool | None = False
    oppdef10: bool | None = False
    fast: bool | None = False
    slow: bool | None = False
    offs25: bool | None = False
    my_rank: int = 99
    opp_rank: int = 99
    rank_known: bool = True
    opp_coach: str = ""
    stype: str = ""
    ccg: bool | None = False
    bowl: bool | None = False
    cfp: bool | None = False
    finale: bool | None = None
    homefinale: bool | None = None
    academy: bool = False
    opp_bye: bool = False


def zscore(w: int, l: int) -> float:
    n = w + l
    return (w - n / 2) / math.sqrt(n / 4) if n else 0.0


def fmt_line(x: float) -> str:
    return "PK" if x == 0 else (f"+{x:g}" if x > 0 else f"{x:g}")


def season_label(league: str, s: int) -> str:
    return str(s) if league == "cfb" else f"{s - 1}-{str(s)[2:]}"   # NBA and college basketball: "2025-26"


def possessive(name: str) -> str:
    return name + ("'" if name.endswith("s") else "'s")


def thanksgiving(year: int) -> date:
    first = date(year, 11, 1)
    return first + timedelta(days=(3 - first.weekday()) % 7 + 21)


def in_rivalry_week(d: date) -> bool:
    t = thanksgiving(d.year)
    return t - timedelta(days=2) <= d <= t + timedelta(days=3)


def cfb_flags(note: str, postseason: bool) -> tuple[bool | None, bool | None, bool | None]:
    """(conference title game, bowl game, College Football Playoff game) from ESPN's note (D-120). A postseason
    game with no note can't be told; a regular-season game is never a bowl or a playoff game."""
    if postseason:
        if not note:
            return False, None, None
        return False, not NOT_BOWL.search(note), bool(CFP_NOTE.search(note))
    return ("Championship" in note and "Playoff" not in note), False, False


def nba_round(note: str) -> str:
    for pat, phrase in ROUNDS:
        if re.search(pat, note or ""):
            return phrase
    return ""


# ---------------------------------------------------------------- coaches (college)
def coach_lookup(path: str):
    """({(school, season): [(coach, games), ...]} in the order they coached that season, {ESPN team id: school}).
    CollegeFootballData's team ids are ESPN's, so a school is matched by id, never by name (D-120: matching names
    gave Texas Southern the Texas coach and Alabama A&M the Alabama coach)."""
    if not path:
        return {}, {}
    data = json.load(open(path))
    by = defaultdict(list)
    ids = {}
    for c in data:
        name = f"{c['firstName']} {c['lastName']}".strip()
        for s in c.get("seasons", []):
            by[(s["school"], int(s["year"]))].append((name, int(s.get("games") or 0)))
            if s.get("teamId") is not None:
                ids[str(s["teamId"])] = s["school"]
    ordered = {}
    for (school, yr), lst in by.items():
        prev = {n for n, _ in by.get((school, yr - 1), [])}
        # whoever also coached there the year before started the season; interims after
        ordered[(school, yr)] = sorted(lst, key=lambda x: (x[0] not in prev, -x[1]))  # [(coach, games), ...]
    return ordered, ids


# ---------------------------------------------------------------- the schedule so far
@dataclass
class Played:
    start: datetime
    home: bool         # a true home game (not neutral)
    road: bool         # a true road game
    res: str           # W, L or T; "" for a game still to be played (D-120)
    event: str = ""
    opp: str = ""
    margin: int | None = None
    pts: int | None = None
    ot: bool | None = None
    favloss: bool | None = None
    ats: int | None = None
    stype: str = "2"
    ccg: bool = False
    pending: bool = False

    @property
    def day(self) -> date:
        return self.start.astimezone(ET).date()


def situation(tl: list[Played], start: datetime, home: bool, road: bool) -> dict:
    """Where a team stands going into a game, from its games so far this season. Rest, road trips and
    back-to-backs read every game on the schedule; results (last game, streaks, the record) only count
    when no earlier game is still to be played (D-120)."""
    done = [p for p in tl if not p.pending]
    fresh = len(done) == len(tl)
    day = start.astimezone(ET).date()
    run = hrun = 0
    for p in reversed(tl):
        if not p.road:
            break
        run += 1
    for p in reversed(tl):
        if not p.home:
            break
        hrun += 1
    last = tl[-1] if tl else None
    out = {"rest": (day - last.day).days if last else 99,
           "g4": 1 + sum(1 for p in tl if (day - p.day).days <= 3),
           "g6": 1 + sum(1 for p in tl if (day - p.day).days <= 5),
           "trip": run + 1 if road else 0, "stand": hrun + 1 if home else 0, "home_after": home and run >= 3,
           "prev_home": last.home if last else None, "prev_opp": last.opp if last else "", "fresh": fresh,
           "prev": "", "streak": 0, "atsrun": 0, "ats_open": False, "over": 0, "margin": None, "pts": None, "ot": None,
           "favloss": None}
    if not fresh:
        return out
    streak = 0
    for p in reversed(done):
        if p.res not in ("W", "L"):
            break
        step = 1 if p.res == "W" else -1
        if streak and (streak > 0) != (step > 0):
            break
        streak += step
    atsrun, ats_open = 0, False
    for p in reversed(done):
        if p.ats is None:
            ats_open = abs(atsrun) < 3
            break
        if p.ats == 0 or (atsrun and (atsrun > 0) != (p.ats > 0)):
            break
        atsrun += p.ats
    w = sum(1 for p in done if p.res == "W")
    l = sum(1 for p in done if p.res == "L")
    prev = done[-1] if done else None
    out.update(prev=prev.res if prev else "", streak=streak, atsrun=atsrun, ats_open=ats_open,
               over=(1 if w > l else (-1 if l > w else 0)) if w + l >= 8 else 0,
               margin=prev.margin if prev else None, pts=prev.pts if prev else None,
               ot=prev.ot if prev else None, favloss=prev.favloss if prev else None)
    return out


def topk(vals: dict[str, float], tid: str, k: int, high: bool) -> bool | None:
    """In the top k (high: the biggest values)? None when a tie at the cutoff decides it."""
    if tid not in vals:
        return False
    v = vals[tid]
    better = sum(1 for t, x in vals.items() if t != tid and (x > v if high else x < v))
    tied = sum(1 for t, x in vals.items() if t != tid and x == v)
    if better >= k:
        return False
    return True if better + tied < k else None


def both(a: bool | None, b: bool | None) -> bool | None:
    if a is False or b is False:
        return False
    return None if a is None or b is None else True


class Ranks:
    """D-120: scoring offense and defense (points a game) and pace (possessions a game, from the box scores)
    going into a day, from finished games of that season only. A team is ranked from its rank_games-th game,
    and a table needs rank_teams teams (college football: FBS teams only, CollegeFootballData's list)."""

    def __init__(self, league: str, raw: list[dict], poss: dict, members: set | None):
        cfg = CONF[league]
        self.min_games, self.min_teams = cfg.get("rank_games", 99), cfg.get("rank_teams", 999)
        self.members = members
        self.by_season = defaultdict(list)
        for r in raw:
            if r["home_pts"] == "" or r["away_pts"] == "":
                continue
            day = datetime.fromisoformat(r["start"].replace("Z", "+00:00")).astimezone(ET).date()
            hp, ap = poss.get((r["event_id"], r["home_id"])), poss.get((r["event_id"], r["away_id"]))
            pace = (hp + ap) / 2 if hp is not None and ap is not None else None
            self.by_season[int(r["season"])].append((day, r["home_id"], r["away_id"], float(r["home_pts"]), float(r["away_pts"]), pace))
        for lst in self.by_season.values():
            lst.sort(key=lambda x: x[0])
        self.cache = {}

    def table(self, season: int, day: date) -> dict:
        key = (season, day)
        if key not in self.cache:
            tot = defaultdict(lambda: [0, 0.0, 0.0, 0, 0.0])
            for d, h, a, hp, ap, pace in self.by_season.get(season, []):
                if d >= day:
                    break
                for t, pf, pa in ((h, hp, ap), (a, ap, hp)):
                    if self.members is not None and (t, season) not in self.members:
                        continue
                    x = tot[t]
                    x[0] += 1
                    x[1] += pf
                    x[2] += pa
                    if pace is not None:
                        x[3] += 1
                        x[4] += pace
            off = {t: x[1] / x[0] for t, x in tot.items() if x[0] >= self.min_games}
            de = {t: x[2] / x[0] for t, x in tot.items() if x[0] >= self.min_games}
            pace = {t: x[4] / x[3] for t, x in tot.items() if x[3] >= self.min_games}
            ok = lambda v: v if len(v) >= self.min_teams else {}
            self.cache[key] = {"off": ok(off), "def": ok(de), "pace": ok(pace)}
        return self.cache[key]

    def flags(self, league: str, season: int, day: date, team: str, opp: str) -> dict:
        t = self.table(season, day)
        if league == "nba":
            return {"oppoff10": topk(t["off"], opp, 10, True), "oppdef10": topk(t["def"], opp, 10, False),
                    "fast": both(topk(t["pace"], team, 10, True), topk(t["pace"], opp, 10, True)),
                    "slow": both(topk(t["pace"], team, 10, False), topk(t["pace"], opp, 10, False))}
        return {"oppdef10": topk(t["def"], opp, 10, False), "offs25": both(topk(t["off"], team, 25, True), topk(t["off"], opp, 25, True))}


# ---------------------------------------------------------------- history
class Ctx:
    """What the history says beyond each row: timelines, ranks, champions, the season calendar (D-120)."""

    def __init__(self):
        self.tl: dict[tuple[str, int], list[Played]] = defaultdict(list)
        self.pending: dict[tuple[str, int], list[Played]] = defaultdict(list)
        self.complete = False          # college football: the rest of the regular season is on the schedule
        self.ranks: Ranks | None = None
        self.champs: dict[int, str] = {}
        self.first_day: dict[int, date] = {}
        self.break_end: dict[int, date] = {}
        self.ids: dict[str, str] = {}  # abbreviation -> ESPN id (latest)
        self.coach_by_event: dict[tuple[str, str], str] = {}
        self.meets: dict[tuple[str, str, int], bool] = {}   # college: (team, opp, season) -> won the last meeting that season
        self.first_season = 0
        self.horizon_end: date | None = None


def load(league: str, paths: list[str], coaches_path: str, team_paths: list[str], cutoff: str = ""):
    raw = [r for p in paths for r in csv.DictReader(open(p))]
    raw = list({r["event_id"]: r for r in raw}.values())  # later files (the current season) win
    if cutoff:
        raw = [r for r in raw if r["start"] < cutoff]   # --replay: only what was known before that day
    if league == "nba":
        raw = [r for r in raw if r["home_abbr"] in NBA_DIV and r["away_abbr"] in NBA_DIV]   # no All-Star games
    raw.sort(key=lambda r: (r["start"], r["event_id"]))
    lookup, school_ids = coach_lookup(coaches_path) if league == "cfb" else ({}, {})
    tv_events = set()
    poss = {}
    for p in team_paths:
        for t in csv.DictReader(open(p)):
            if t.get("national_tv") == "1":
                tv_events.add(t["event_id"])
            try:
                poss[(t["event_id"], t["team_id"])] = float(t["fga"]) - float(t["oreb"]) + float(t["tov"]) + 0.44 * float(t["fta"])
            except (KeyError, ValueError):
                pass
    school_of = {}
    games_seen = defaultdict(int)
    rows: list[Row] = []
    ctx = Ctx()
    tl = ctx.tl
    abbr: dict[str, str] = {}
    last_meet: dict[tuple[str, str], tuple[bool, int]] = {}
    ctx.first_season = min((int(r["season"]) for r in raw), default=0)
    members = None
    if league == "cfb" and lookup:
        members = {(tid, yr) for tid, school in school_ids.items() for (s, yr) in lookup if s == school}
    elif league == "nba":
        members = {(r[f"{x}_id"], int(r["season"])) for r in raw for x in ("home", "away")}
    if league in ("nba", "cfb"):
        ctx.ranks = Ranks(league, raw, poss, members)
    # NBA: champions (the last NBA Finals game), opening days and the All-Star break, from the file
    if league == "nba":
        finals = defaultdict(list)
        days = defaultdict(set)
        for r in raw:
            s = int(r["season"])
            if r.get("note", "").startswith("NBA Finals"):
                finals[s].append(r)
            if r.get("season_type", "2") == "2" and r["home_pts"] != "":
                days[s].add(datetime.fromisoformat(r["start"].replace("Z", "+00:00")).astimezone(ET).date())
        for s, lst in finals.items():
            g = max(lst, key=lambda r: r["start"])
            ctx.champs[s] = g["home_id"] if float(g["home_pts"]) > float(g["away_pts"]) else g["away_id"]
        for s, ds in days.items():
            ds = sorted(ds)
            ctx.first_day[s] = ds[0]
            feb = [d for d in ds if (d.month == 2) or (d.month == 3 and d.day <= 10)]
            gaps = [(b - a).days for a, b in zip(feb, feb[1:])]
            if gaps and max(gaps) >= 4:
                i = gaps.index(max(gaps))
                ctx.break_end[s] = feb[i + 1]
    since_break = defaultdict(int)
    for r in raw:
        if r["home_pts"] == "" or r["away_pts"] == "":
            continue
        start = datetime.fromisoformat(r["start"].replace("Z", "+00:00"))
        season = int(r["season"])
        hp, ap = float(r["home_pts"]), float(r["away_pts"])
        neutral = r["neutral"] == "1"
        day = start.astimezone(ET).date()
        clock = start.astimezone(NY)
        note = r.get("note", "")
        stype = r.get("season_type", "") or ("3" if r["postseason"] == "1" else "2")
        ccg, bowl, cfp = cfb_flags(note, r["postseason"] == "1") if league == "cfb" else (False, False, False)
        sit = {}
        for side in ("home", "away"):
            tid = r[f"{side}_id"]
            abbr[tid] = r[f"{side}_abbr"]
            ctx.ids[r[f"{side}_abbr"]] = tid
            sit[side] = situation(tl[(tid, season)], start, side == "home" and not neutral, side == "away" and not neutral)
        coach = {}
        for side in ("home", "away"):
            tid = r[f"{side}_id"]
            c = r[f"{side}_coach"]
            if league == "cfb":
                c = ""  # ESPN lists today's coach for past seasons too; only CollegeFootballData's list is used
            if league == "cfb" and lookup:
                if tid not in school_of:
                    school_of[tid] = school_ids.get(tid)
                school = school_of[tid]
                lst = lookup.get((school, season)) if school else None
                if lst and sum(g for _, g in lst) == 0:
                    c = lst[-1][0]  # current season: game counts not filled in yet
                elif lst:
                    # games in date order: the first coach's games first, then the next (mid-season changes)
                    k = games_seen[(tid, season)]
                    games_seen[(tid, season)] += 1
                    acc = 0
                    c = lst[-1][0]
                    for n, g in lst:
                        acc += g
                        if k < acc:
                            c = n
                            break
            coach[side] = c
            ctx.coach_by_event[(r["event_id"], tid)] = c
        hl = float(r["home_line"]) if r["home_line"] != "" else None
        # the venue: the home team's, or at a neutral site the city ESPN names (abroad: no state)
        if neutral:
            vs, vc = r.get("venue_state", ""), r.get("venue_city", "")
            site_pt = (vs in PT_STATES) if vs else (False if vc else None)
        else:
            site_pt = r["home_abbr"] in NBA_PT if league == "nba" else None
        if league == "nba":
            playoff = stype == "3"
            rnd = nba_round(note) if playoff else ""
            cup = bool(CUP_NOTE.match(note))
        else:
            playoff, rnd, cup = None, "", False
        for side in ("home", "away"):
            tid, oid = r[f"{side}_id"], r["away_id" if side == "home" else "home_id"]
            other = "away" if side == "home" else "home"
            if hl is not None:
                line = hl if side == "home" else -hl
                margin = (hp - ap) + hl
                m = margin if side == "home" else -margin
                ats = (m > 0) - (m < 0)
                ou, total = None, None
                if r["total"] != "":
                    total = float(r["total"])
                    t = hp + ap - total
                    ou = (t > 0) - (t < 0)
                my_rank = int(r[f"{side}_rank"] or 99)
                opp_rank = int(r[f"{other}_rank"] or 99)
                rank_known = not (league == "cfb" and cfp and (my_rank == 99 or opp_rank == 99))   # ESPN left some CFP ranks blank
                me, op = sit[side], sit[other]
                d1, d2 = (NBA_DIV.get(r[f"{side}_abbr"]), NBA_DIV.get(r[f"{other}_abbr"])) if league == "nba" else (None, None)
                lm = last_meet.get((tid, oid))
                if league == "cfb":
                    if season - 1 < ctx.first_season:
                        lastyr = None
                    else:
                        won = ctx.meets.get((tid, oid, season - 1))
                        lastyr = won is False
                else:
                    lastyr = None
                flags = ctx.ranks.flags(league, season, day, tid, oid) if ctx.ranks else {}
                champ = None
                if league == "nba":
                    c = ctx.champs.get(season - 1) or FIRST_CHAMP.get(season)
                    champ = (oid == c) if c else None
                if league == "nba" and ctx.break_end.get(season) and day >= ctx.break_end[season]:
                    since_break[(tid, season)] += 1
                rows.append(Row(season=season, start=start, event=r["event_id"], team=tid, opp=oid, home=side == "home",
                                neutral=neutral, line=line, ats=ats, ou=ou, total=total,
                                coach=coach[side], conf=r["conf_game"] == "1",
                                opp_ranked=(opp_rank <= 25) if rank_known else None, prev=me["prev"],
                                streak=me["streak"], rest=me["rest"], opp_rest=op["rest"], g4=me["g4"], trip=me["trip"],
                                home_after=me["home_after"], opp_over=op["over"],
                                div=bool(d1 and d1 == d2), xconf=bool(d1 and d2 and (d1 in EAST) != (d2 in EAST)),
                                tv=r["event_id"] in tv_events, rweek=league == "cfb" and in_rivalry_week(day),
                                night=clock.hour >= 19, month=day.month,
                                coach_id=r.get(f"{side}_coach_id", "") if league == "cbb" else "",
                                tourney=r.get("tourney", "") if league == "cbb" else "",
                                margin_prev=me["margin"], ot_prev=me["ot"], favloss_prev=me["favloss"], pts_prev=me["pts"],
                                atsrun=me["atsrun"], ats_open=me["ats_open"], g6=me["g6"], stand=me["stand"], prev_home=me["prev_home"], prev_opp=me["prev_opp"],
                                hour=clock.hour, minute=clock.minute, weekday=clock.weekday(), opp_abbr=r[f"{other}_abbr"],
                                opp_streak=op["streak"], site_pt=site_pt, cup=cup, playoff=playoff, rnd=rnd, champ=champ,
                                lastmeet=(1 if lm[0] else -1) if lm else None, lastmargin=lm[1] if lm else None, lastyr=lastyr,
                                instate=bool(NBA_STATE.get(r[f"{side}_abbr"]) and NBA_STATE.get(r[f"{side}_abbr"]) == NBA_STATE.get(r[f"{other}_abbr"])),
                                opening=league == "nba" and season in ctx.first_day and (day - ctx.first_day[season]).days <= 6 and stype == "2",
                                allstar=league == "nba" and 0 < since_break[(tid, season)] <= 5 and stype == "2",
                                oppoff10=flags.get("oppoff10", False), oppdef10=flags.get("oppdef10", False),
                                fast=flags.get("fast", False), slow=flags.get("slow", False), offs25=flags.get("offs25", False),
                                my_rank=my_rank, opp_rank=opp_rank, rank_known=rank_known, opp_coach=coach[other], stype=stype,
                                ccg=ccg, bowl=bowl, cfp=cfp,
                                academy=r[f"{side}_abbr"] in ACADEMIES and r[f"{other}_abbr"] in ACADEMIES,
                                opp_bye=13 <= op["rest"] < 99))
            elif league == "nba" and ctx.break_end.get(season) and day >= ctx.break_end[season]:
                since_break[(tid, season)] += 1
        for side in ("home", "away"):
            tid, oid = r[f"{side}_id"], r["away_id" if side == "home" else "home_id"]
            won = (hp > ap) if side == "home" else (ap > hp)
            mine, theirs = (hp, ap) if side == "home" else (ap, hp)
            line = None if hl is None else (hl if side == "home" else -hl)
            ats = None
            if line is not None:
                m = mine - theirs + line
                ats = (m > 0) - (m < 0)
            periods = r.get("periods", "")
            tl[(tid, season)].append(Played(start, side == "home" and not neutral, side == "away" and not neutral,
                                            "W" if won else ("L" if hp != ap else "T"), event=r["event_id"], opp=oid,
                                            margin=int(mine - theirs), pts=int(mine), ot=(int(periods) > 4) if periods else None,
                                            favloss=None if line is None else (line < 0 and mine < theirs), ats=ats,
                                            stype=stype, ccg=bool(ccg)))
            last_meet[(tid, oid)] = (won, int(mine - theirs))
            ctx.meets[(tid, oid, season)] = won
    return raw, rows, ctx, lookup, school_of


def annotate_next(league: str, rows: list[Row], ctx: Ctx, season: int) -> None:
    """D-120: each game's next game (completed or on the schedule), and college football's regular-season
    finale and home finale. Unknown (None) where the schedule the run has doesn't reach far enough."""
    seq = {}
    for key, lst in ctx.tl.items():
        seq[key] = sorted(lst + ctx.pending.get(key, []), key=lambda p: p.start)
    pos = {}
    for (tid, s), lst in seq.items():
        for i, p in enumerate(lst):
            pos[(p.event, tid)] = ((tid, s), i)
    for r in rows:
        key, i = pos.get((r.event, r.team), (None, None))
        if key is None:
            continue
        lst = seq[key]
        done = r.season < season    # a finished season: its schedule is all here
        if i + 1 < len(lst):
            nxt = lst[i + 1]
            r.next_rest, r.next_road, r.next_opp, r.next_known = (nxt.day - lst[i].day).days, nxt.road, nxt.opp, True
        else:
            r.next_rest, r.next_road, r.next_opp, r.next_known = None, None, "", done
        if league == "cfb":
            later = lst[i + 1:]
            known = done or ctx.complete
            reg = r.stype == "2" and not r.ccg
            if not reg:
                r.finale = r.homefinale = False
            else:
                more = any(p.stype == "2" and not p.ccg for p in later)
                more_home = any(p.stype == "2" and not p.ccg and p.home for p in later)
                r.finale = False if more else (True if known else None)
                r.homefinale = (False if (more_home or not r.home or r.neutral) else (True if known else None))


# ---------------------------------------------------------------- NBA box scores: who played (D-115)
class Boxes:
    """Which players played in which games, for "without a top-3 scorer" angles."""

    def __init__(self, paths: list[str], raw: list[dict]):
        when = {r["event_id"]: (datetime.fromisoformat(r["start"].replace("Z", "+00:00")), int(r["season"])) for r in raw}
        self.played: dict[tuple[str, str], set[str]] = defaultdict(set)
        self.games: dict[tuple[str, str], list[tuple[int, datetime, int]]] = defaultdict(list)  # (player, team) -> (season, start, pts)
        for p in paths:
            for b in csv.DictReader(open(p)):
                if b["event_id"] not in when:
                    continue
                key = (b["event_id"], b["team_id"])
                self.played.setdefault(key, set())
                if float(b["min"] or 0) <= 0:
                    continue
                self.played[key].add(b["athlete_id"])
                start, season = when[b["event_id"]]
                self.games[(b["athlete_id"], b["team_id"])].append((season, start, int(float(b["pts"] or 0))))

    def top_scorers(self, team: str, season: int, k: int = 3) -> list[str]:
        ppg = []
        for (pid, tid), lst in self.games.items():
            cur = [g for g in lst if g[0] == season]
            if tid == team and len(cur) >= 5:
                ppg.append((sum(g[2] for g in cur) / len(cur), pid))
        return [p for _, p in sorted(ppg, reverse=True)[:k]]

    def span(self, pid: str, team: str, season: int) -> dict[int, tuple[datetime, datetime]]:
        """{season: (first, last)} of his games for this team; this season runs to now (he's still listed)."""
        out = {}
        for s, start, _ in self.games.get((pid, team), []):
            a, b = out.get(s, (start, start))
            out[s] = (min(a, start), max(b, start))
        if season in out:
            out[season] = (out[season][0], datetime.max.replace(tzinfo=timezone.utc))
        return out


def injuries(event_id: str) -> dict[str, dict[str, str]]:
    """{ESPN team id: {athlete id: name}} listed Out for this game, from ESPN's game summary."""
    try:
        data = get(f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={event_id}")
    except (OSError, ValueError):
        return {}
    out = {}
    for t in data.get("injuries", []):
        tid = str((t.get("team") or {}).get("id", ""))
        out[tid] = {str((i.get("athlete") or {}).get("id", "")): (i.get("athlete") or {}).get("displayName", "")
                    for i in t.get("injuries", []) if (i.get("status") or "").lower() == "out"}
    return out


# ---------------------------------------------------------------- upcoming games
def get(url: str):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def espn_history_module():
    """espn_history.py, for college basketball's tournament marker (scripts run with -I don't put their folder on the path)."""
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    import espn_history
    return espn_history


def event_info(e: dict) -> dict:
    """What the schedule needs from any scoreboard event, played or not."""
    c = e["competitions"][0]
    h = next(x for x in c["competitors"] if x["homeAway"] == "home")
    a = next(x for x in c["competitors"] if x["homeAway"] == "away")
    venue = (c.get("venue") or {}).get("address") or {}
    return {"id": e["id"], "start": datetime.fromisoformat(e["date"].replace("Z", "+00:00")), "home_id": h["team"]["id"],
            "away_id": a["team"]["id"], "neutral": bool(c.get("neutralSite")), "stype": str((e.get("season") or {}).get("type", 2)),
            "note": "; ".join((n.get("headline") or "").strip() for n in c.get("notes", []) if n.get("headline")),
            "venue_city": venue.get("city", ""), "venue_state": venue.get("state", ""),
            "state": c.get("status", {}).get("type", {}).get("state", ""),
            "status": c.get("status", {}).get("type", {}).get("name", "")}


def game_from_event(league: str, e: dict, line: tuple[float, float | None] | None = None) -> dict | None:
    """One game as the engine reads it. `line` (home line, total) replaces ESPN's posted odds (--replay)."""
    c = e["competitions"][0]
    h = next(x for x in c["competitors"] if x["homeAway"] == "home")
    a = next(x for x in c["competitors"] if x["homeAway"] == "away")
    if line is not None:
        hl, total = line
    else:
        odds = (c.get("odds") or [{}])[0]
        details = (odds.get("details") or "").strip()
        if not details:
            return None
        if details.upper() in ("EVEN", "PK"):
            hl = 0.0
        else:
            abbr, _, num = details.rpartition(" ")
            n = abs(float(num))
            hl = -n if abbr == h["team"]["abbreviation"] else n
        total = odds.get("overUnder")
    info = event_info(e)
    g = {
        "id": e["id"], "start": info["start"], "home": h, "away": a,
        "neutral": info["neutral"], "conf": bool(c.get("conferenceCompetition")), "home_line": hl,
        "total": total, "tv": any(b.get("market") == "national" for b in c.get("broadcasts", [])),
        "note": info["note"], "stype": info["stype"], "venue_city": info["venue_city"], "venue_state": info["venue_state"],
    }
    if league == "nba" and not (h["team"].get("abbreviation") in NBA_DIV and a["team"].get("abbreviation") in NBA_DIV):
        return None
    if league == "cbb":
        if not (h["team"].get("conferenceId") and a["team"].get("conferenceId")):
            return None   # Division I against Division I only
        tourney, _ = espn_history_module().cbb_tourney(e.get("season", {}).get("type", 2), c, h, a)
        g["tourney"] = tourney
        # in the NCAA tournament ESPN's rank field is the seed; elsewhere it's the AP rank
        rank = {s: (x.get("curatedRank") or {}).get("current") or 99 for s, x in (("home", h), ("away", a))}
        g["seed"] = {s: (r if tourney == "NCAA" and r <= 16 else 0) for s, r in rank.items()}
        g["ap"] = {s: (r if tourney != "NCAA" else 99) for s, r in rank.items()}
    return g


def fetch_schedule(league: str, first: date, days: int) -> tuple[list[dict], list[dict], bool]:
    """(the window's events, the schedule's events, whether the rest of college football's regular season is in it).
    The window is `days` days from `first`; the schedule adds the NBA's next HORIZON_DAYS days and college
    football's remaining regular-season weeks (ESPN's calendar), so each game's next game is known (D-120)."""
    cfg = CONF[league]
    base = f"https://site.api.espn.com/apis/site/v2/sports/{cfg['path']}/scoreboard"
    window, sched, seen = [], [], set()
    calendar = None
    extra = HORIZON_DAYS if league == "nba" else 0
    for i in range(days + extra):
        d = first + timedelta(days=i)
        try:
            data = get(f"{base}?dates={d:%Y%m%d}{cfg['query']}")
        except (OSError, ValueError):
            if i < days:
                raise
            continue
        if calendar is None:
            calendar = data.get("leagues", [{}])[0]
        for e in data.get("events", []):
            if i < days:
                window.append(e)
            if e["id"] not in seen:
                seen.add(e["id"])
                sched.append(e)
    complete = False
    if league == "cfb" and calendar:
        year = (calendar.get("season") or {}).get("year")
        weeks = [x for c in calendar.get("calendar", []) if str(c.get("value")) == "2" for x in c.get("entries", [])]
        todo = [w for w in weeks if w.get("endDate", "")[:10] >= first.isoformat()]
        complete = bool(weeks) and bool(year)
        for w in todo:
            try:
                data = get(f"{base}?dates={year}&seasontype=2&week={w['value']}{cfg['query']}")
            except (OSError, ValueError):
                complete = False
                continue
            for e in data.get("events", []):
                if e["id"] not in seen:
                    seen.add(e["id"])
                    sched.append(e)
    return window, sched, complete


def upcoming(league: str, days: int):
    first = datetime.now(timezone.utc).astimezone(ET).date()
    window, sched, complete = fetch_schedule(league, first, days)
    out, seen = [], set()
    for e in window:
        c = e["competitions"][0]
        if c["status"]["type"]["state"] != "pre" or e["id"] in seen:
            continue
        seen.add(e["id"])
        g = game_from_event(league, e)
        if g:
            out.append(g)
    return out, sched, complete, first + timedelta(days=days + (HORIZON_DAYS if league == "nba" else 0))


def replay(league: str, day: str, idx: dict[str, dict], days: int = 1):
    """--replay: a past day's games as if they were upcoming, with the lines from the history file."""
    first = date.fromisoformat(day)
    window, sched, complete = fetch_schedule(league, first, days)
    out = []
    for e in window:
        r = idx.get(e["id"])
        if not r or r["home_line"] == "":
            continue
        g = game_from_event(league, e, (float(r["home_line"]), float(r["total"]) if r["total"] != "" else None))
        if g:
            out.append(g)
    return out, sched, complete, first + timedelta(days=days + (HORIZON_DAYS if league == "nba" else 0))


def add_pending(league: str, ctx: Ctx, sched: list[dict], done: set[str], season: int) -> None:
    """Games on the schedule that the history doesn't have as finished yet go into each team's timeline as
    still to be played: they count for rest and road trips, never for results (D-120)."""
    for e in sched:
        if e["id"] in done:
            continue
        x = event_info(e)
        if x["status"] in ("STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_SUSPENDED", "STATUS_FORFEIT"):
            continue
        ccg = cfb_flags(x["note"], x["stype"] == "3")[0] if league == "cfb" else False
        for side, other in (("home", "away"), ("away", "home")):
            tid = x[f"{side}_id"]
            ctx.pending[(tid, season)].append(Played(x["start"], side == "home" and not x["neutral"], side == "away" and not x["neutral"],
                                                     "", event=x["id"], opp=x[f"{other}_id"], stype=x["stype"], ccg=bool(ccg),
                                                     pending=True))
    for lst in ctx.pending.values():
        lst.sort(key=lambda p: p.start)


# ---------------------------------------------------------------- angles
@dataclass
class Angle:
    text: str
    supports: str
    market: str
    metric: str
    w: int
    l: int
    p: int
    z: float
    conds: int
    rate: float
    kinds: frozenset = frozenset()
    relevance: float = 0.0
    sample: list = field(default_factory=list)  # (event, team)
    crit: dict = field(default_factory=dict)    # NCAA tournament angles: what to recount from the tournament file

    @property
    def score(self) -> float:
        return abs(self.z) - 0.35 * (self.conds - 1) + self.relevance

    @property
    def strong(self) -> bool:
        return abs(self.z) >= MIN_Z and (self.rate >= MIN_RATE or self.rate <= 1 - MIN_RATE)

    @property
    def families(self) -> frozenset:
        return frozenset(family(k) for k in self.kinds)


def continuity_start(league: str, tid: str, season: int, lookup, school_of, boxes, first_season: int,
                     team_rows: list | None = None) -> int:
    """D-117 (owner, Nov 25: "consider if there's been the same factors like same coach, same key players"): the
    first season of the stretch this team's core has been together. College: the current head coach's first
    straight season at the school. NBA: back while the current top scorer played 20+ games for the team.
    Without the data to tell, the old two-season window stands (college basketball: this season only)."""
    s = season
    if league == "cbb":
        # D-116: ESPN's checked coach on every game; a season counts only if he coached all of its games there
        mine = [r for r in team_rows or [] if r.season == season and r.coach_id]
        if not mine:
            return season
        coach = mine[-1].coach_id
        seasons = defaultdict(set)
        for r in team_rows:
            seasons[r.season].add(r.coach_id)
        while s - 1 >= first_season and seasons.get(s - 1) == {coach}:
            s -= 1
        return s
    if league == "cfb":
        school = school_of.get(tid)
        lst = lookup.get((school, season)) if school else None
        if not lst:
            return season - 2
        coach = lst[-1][0]
        while s - 1 >= first_season and any(n == coach for n, _ in lookup.get((school, s - 1), [])):
            s -= 1
        return s
    if not boxes:
        return season - 2
    core = boxes.top_scorers(tid, season, 1)
    if not core:
        return season - 2
    while s - 1 >= first_season and all(sum(1 for g in boxes.games.get((p, tid), []) if g[0] == s - 1) >= 20 for p in core):
        s -= 1
    return s


def short(league: str, team: dict) -> str:
    return team.get("location") if league in ("cfb", "cbb") else team.get("name") or team.get("shortDisplayName")


def combo_ok(combo) -> bool:
    """D-115 and D-118 wording guards: one condition per family; the opponent described once ("against the
    Spurs against teams over .500"); no two phrases starting the same way ("on the road" pairs with anything);
    "favorite" or "underdog" once; at most one phrase that folds into the over/under lead."""
    kinds = [k for k, _, _ in combo]
    if len({family(k) for k in kinds}) < len(kinds):
        return False
    if len(combo) == 1:
        return True
    if set(kinds) & OPP_LIKE and set(kinds) & OPPONENT_KINDS:
        return False
    firsts = [ph.split()[0] for k, ph, _ in combo if k != "role"]
    if len(firsts) == 2 and firsts[0] == firsts[1] and firsts[0] in GUARD_WORDS:
        return False
    if sum(1 for _, ph, _ in combo if re.search(r"\b(favorite|underdog)\b", ph)) > 1:
        return False
    return sum(1 for _, ph, _ in combo if ph in GROUPS) <= 1


def render(league: str, metric: str, kind: str, who: str, parts: list[str], frame: str, w: int, l: int, p: int) -> str:
    """D-117's two shapes, nothing else: "<subject> is 12-3 ATS <conditions> <time frame>" and
    "The under is 12-3 in <subject's> games <conditions> <time frame>"."""
    if metric == "ats":
        subject = f"The {who} are" if (kind == "team" and league == "nba") else f"{who} is"
        text = f"{subject} {w}-{l}{f'-{p}' if p else ''} ATS {' '.join(parts)} {frame}"
    else:
        over = w > l
        a_, b_ = (w, l) if over else (l, w)
        lead = f"{possessive(who)} games" if kind == "coach" else f"{who} games"
        rest = []
        for ph in parts:
            if ph in GROUPS and lead.endswith(" games"):
                lead = lead[: -len("games")] + GROUPS[ph]
            elif ph == P["allstar"] and lead.endswith(" games"):
                # not "Thunder games in the first five games after the All-Star break"
                owner = possessive(who) if kind == "coach" else possessive(f"the {who}" if league == "nba" else who)
                lead = f"{owner} first five games after the All-Star break"
            else:
                rest.append(ph)
        text = f"The {'over' if over else 'under'} is {a_}-{b_}{f'-{p}' if p else ''} in {lead} {' '.join(rest)} {frame}"
    return " ".join(text.split())


FRAME = r"(this season|since (19|20)\d\d(-\d\d)?)"
SHAPES = (re.compile(r"^(The [A-Z0-9].* are|[A-Z].* is) \d+-\d+(-\d+)? ATS (.+ )?" + FRAME + "$"),
          re.compile(r"^The (over|under) is \d+-\d+(-\d+)? in .+ games\b.* " + FRAME + "$"),
          re.compile(r"^\d+ seeds are \d+-\d+(-\d+)?( ATS)? against \d+ seeds since (19|20)\d\d$"),
          re.compile(r"^[A-Z].* is \d+-\d+ in the NCAA tournament since (19|20)\d\d$"))
BANNED = re.compile(r"[–—−%]|points a game|\b(should|lock|bet|pick|picks|have covered|have won|straight up)\b"
                    r"|^(Since|In his career|Under |Teams )", re.I)


def short_enough(text: str) -> bool:
    """A line stays one quick read: MAX_WORDS words at most (a record like 11-0-1 is one word)."""
    return len(text.split()) <= MAX_WORDS


def sentence_ok(text: str) -> bool:
    """D-117: the standard shapes only. No time frame first, no percentages or points a game, no dashes,
    no picks language, and never home and road in one sentence."""
    if BANNED.search(text) or not any(s.match(text) for s in SHAPES):
        return False
    return not (re.search(r"\b(at home|home (favorite|underdog))\b", text) and re.search(r"\b(on the road|road (favorite|underdog))\b", text))


def cond_masks(srows: list[Row], pred) -> tuple[int, int]:
    """Bitmasks over a subject's games: where the condition is true, and where the file doesn't say."""
    t = u = 0
    for i, r in enumerate(srows):
        y = pred(r)
        if y is None:
            u |= 1 << i
        elif y:
            t |= 1 << i
    return t, u


_BASE: dict = {}


def league_rows(rows: list[Row], start: int) -> tuple[list[Row], dict]:
    """Every team's games from a season on, with their outcome masks (D-123)."""
    key = (id(rows), start)
    if key not in _BASE:
        lst = [r for r in rows if r.season >= start]
        outc = {(m, x): sum(1 << i for i, r in enumerate(lst) if getattr(r, m) == x) for m in ("ats", "ou") for x in (1, -1)}
        _BASE[key] = (lst, outc, {})
    return _BASE[key][0], _BASE[key]


def pred_key(k: str, ph: str, pred):
    """A cache key for a condition's predicate, or None when its captured values can't be compared."""
    try:
        cells = tuple(c.cell_contents for c in (pred.__closure__ or ()))
        key = (k, ph, pred.__code__, pred.__defaults__, cells)
        hash(key)
        return key
    except (TypeError, ValueError):
        return None


def league_rate(rows: list[Row], start: int, combo, metric: str) -> tuple[float, int]:
    """How every team did in this spot since `start`: the share of covers (or overs), and the games counted."""
    lst, entry = league_rows(rows, start)
    masks = entry[2]
    sel = (1 << len(lst)) - 1
    for k, ph, pred in combo:
        key = pred_key(k, ph, pred)
        if key is None:
            t, _ = cond_masks(lst, pred)
        else:
            if key not in masks:
                masks[key] = cond_masks(lst, pred)
            t = masks[key][0]
        sel &= t
    w = (sel & entry[1][(metric, 1)]).bit_count()
    l = (sel & entry[1][(metric, -1)]).bit_count()
    return (w / (w + l) if w + l else 0.5), w + l


def holds(srows: list[Row], sel: int, metric: str, side: int) -> bool:
    """The first and second halves of the sample (in date order) both lean the shown way (D-123)."""
    res = [getattr(srows[i], metric) for i in range(len(srows)) if sel >> i & 1]
    res = [x for x in res if x in (1, -1)]
    if len(res) < 2 * HALF_MIN:
        return True   # too few games to split: the floors already cover it
    h = len(res) // 2
    for part in (res[:h], res[h:]):
        if sum(1 for x in part if x == side) / len(part) < HALF_RATE:
            return False
    return True


def next_game(ctx: Ctx, tid: str, season: int, start: datetime) -> Played | None:
    for p in ctx.pending.get((tid, season), []):
        if p.start > start:
            return p
    return None


def build_angles(league: str, g: dict, rows: list[Row], ctx: Ctx, lookup, school_of, season: int,
                 boxes: Boxes | None = None, outs: dict | None = None, by_team: dict | None = None,
                 by_coach: dict | None = None) -> list[Angle]:
    cfg = CONF[league]
    out = []
    total = g["total"]
    day = g["start"].astimezone(ET).date()
    clock = g["start"].astimezone(NY)
    sit = {}
    for side in ("home", "away"):
        tid = g[side]["team"]["id"]
        before = [p for p in ctx.pending.get((tid, season), []) if p.start < g["start"] and p.event != g["id"]]
        sit[side] = situation(ctx.tl.get((tid, season), []) + before, g["start"], side == "home" and not g["neutral"],
                              side == "away" and not g["neutral"])
    # ranks going into the day count only when every game before that day is in
    ranks_ok = ctx.ranks is not None and not any(p.day < day for lst in ctx.pending.values() for p in lst)
    note = g.get("note", "")
    stype = g.get("stype", "2")
    for side in ("home", "away"):
        other = "away" if side == "home" else "home"
        me, op = g[side], g[other]
        tid, oid = me["team"]["id"], op["team"]["id"]
        ab, oab = me["team"]["abbreviation"], op["team"]["abbreviation"]
        my, their = sit[side], sit[other]
        line = g["home_line"] if side == "home" else -g["home_line"]
        fav = line < 0
        fd = "favorite" if fav else "underdog"
        art = "an" if fd == "underdog" else "a"
        name, opp_name = short(league, me["team"]), short(league, op["team"])
        opp_label = opp_name if league in ("cfb", "cbb") else f"the {opp_name}"
        side_label = f"{ab} {fmt_line(line)}"
        other_label = f"{oab} {fmt_line(-line)}"
        prev_res, rest = my["prev"], my["rest"]
        my_rank = (me.get("curatedRank") or {}).get("current") or 99
        opp_rank = (op.get("curatedRank") or {}).get("current") or 99
        if league == "cbb":
            opp_rank = g["ap"][other]   # in the NCAA tournament the rank field holds the seed, not the AP rank
            my_rank = g["ap"][side]
        nxt = next_game(ctx, tid, season, g["start"])
        f = lambda key, **kw: P[key].format(**kw)

        role = "neutral" if g["neutral"] else ("home" if side == "home" else "road")
        conds = []
        if role == "home":
            conds.append(("role", P["home"], lambda r: r.home and not r.neutral))
        elif role == "road":
            conds.append(("role", P["road"], lambda r: (not r.home) and not r.neutral))
        elif league == "cbb":
            conds.append(("role", P["neutral"], lambda r: r.neutral))
        # D-120: a pick'em game is neither, and an underdog record never counts pick'em games
        if line != 0:
            conds.append(("fd", P["fav" if fav else "dog"], lambda r, f_=fav: (r.line < 0) if f_ else (r.line > 0)))
        rivalry = CFB_RIVALRIES.get(frozenset((ab, oab))) if league == "cfb" else None
        conds.append(("opp", f("rivalry", rivalry=rivalry) if rivalry else f("opp", opp=opp_label), lambda r, o=oid: r.opp == o))
        if prev_res in ("W", "L"):
            conds.append(("prev", P["prev_l" if prev_res == "L" else "prev_w"], lambda r, p=prev_res: r.prev == p))
        if my["streak"] <= -2:
            conds.append(("streak", P["streak_l2"], lambda r: r.streak <= -2))
        elif my["streak"] >= 3:
            conds.append(("streak", P["streak_w3"], lambda r: r.streak >= 3))
            if league == "nba" and my["streak"] >= 4:
                conds.append(("streak", P["streak_w4"], lambda r: r.streak >= 4))
        if abs(line) >= cfg["big"]:
            conds.append(("big", f("size", art=art, fd=fd, n=cfg["big"], more="+"),
                          lambda r, f_=fav, b=cfg["big"]: (r.line <= -b) if f_ else (r.line >= b)))
        if league in ("nba", "cfb") and 0 < abs(line) <= cfg["small"]:
            conds.append(("small", f("size", art=art, fd=fd, n=f"{cfg['small']:g}", more=" or less"),
                          lambda r, f_=fav, b=cfg["small"]: (-b <= r.line < 0) if f_ else (0 < r.line <= b)))
        if league == "cfb" and abs(line) >= cfg["huge"]:
            conds.append(("huge", f("size", art=art, fd=fd, n=cfg["huge"], more="+"),
                          lambda r, f_=fav, b=cfg["huge"]: (r.line <= -b) if f_ else (r.line >= b)))
        if total is not None:
            t = float(total)
            if t >= cfg["hi"]:
                conds.append(("tot", f("tot_hi", n=cfg["hi"]), lambda r, b=cfg["hi"]: r.total is not None and r.total >= b))
            elif t <= cfg["lo"]:
                conds.append(("tot", f("tot_lo", n=cfg["lo"]), lambda r, b=cfg["lo"]: r.total is not None and r.total <= b))
        if league in ("nba", "cfb") and my["fresh"]:
            if my["margin"] is not None and my["margin"] <= -cfg["blowout"]:
                conds.append(("blowout", f("blowout_l", n=cfg["blowout"]),
                              lambda r, b=cfg["blowout"]: r.margin_prev is not None and r.margin_prev <= -b))
            elif league == "nba" and my["margin"] is not None and my["margin"] >= cfg["blowout"]:
                conds.append(("blowout", f("blowout_w", n=cfg["blowout"]),
                              lambda r, b=cfg["blowout"]: r.margin_prev is not None and r.margin_prev >= b))
            if my["atsrun"] >= 3:
                conds.append(("atsrun", P["cover3"], lambda r: True if r.atsrun >= 3 else (None if r.ats_open and r.atsrun >= 0 else False)))
            elif my["atsrun"] <= -3:
                conds.append(("atsrun", P["miss3"], lambda r: True if r.atsrun <= -3 else (None if r.ats_open and r.atsrun <= 0 else False)))
        if league == "cfb":
            if g["conf"]:
                conds.append(("conf", P["conf"], lambda r: r.conf))
            rk = lambda pred: (lambda r: pred(r) if r.rank_known else None)
            if opp_rank <= 25:
                conds.append(("ranked", P["ranked"], rk(lambda r: r.opp_rank <= 25)))
                if opp_rank <= 10:
                    conds.append(("top10", P["top10"], rk(lambda r: r.opp_rank <= 10)))
                if my_rank <= 25:
                    conds.append(("bothrk", P["bothrk"], rk(lambda r: r.my_rank <= 25 and r.opp_rank <= 25)))
                else:
                    conds.append(("unrk", P["unrk"], rk(lambda r: r.my_rank > 25 and r.opp_rank <= 25)))
            if 30 <= rest < 99:
                conds.append(("layoff", P["layoff"], lambda r: 30 <= r.rest < 99))
            if 13 <= rest < 99:
                conds.append(("rest", P["bye"], lambda r: 13 <= r.rest < 99))
            elif rest <= 5:
                conds.append(("rest", P["short"], lambda r: r.rest <= 5))
            if 13 <= their["rest"] < 99 and rest < 13:
                conds.append(("opprest", P["oppbye"], lambda r: r.opp_bye and r.rest < 13))
            if my["trip"] >= 2:
                conds.append(("trip", P["trip2"], lambda r: r.trip >= 2))
            if clock.hour >= 19:
                conds.append(("night", P["night"], lambda r: r.night))
            if clock.weekday() in (1, 2):
                conds.append(("midweek", P["midweek"], lambda r: r.weekday in (1, 2)))
            if ab in CFB_PT and (clock.hour, clock.minute) == (12, 0):
                conds.append(("noon", P["noon"], lambda r: (r.hour, r.minute) == (12, 0)))
            if their["fresh"] and their["over"]:
                conds.append(("oppq", P["over" if their["over"] > 0 else "under"], lambda r, o=their["over"]: r.opp_over == o))
            if my["fresh"]:
                if my["favloss"]:
                    conds.append(("upset", P["upset"], lambda r: r.favloss_prev))
                if my["pts"] is not None and my["pts"] >= 40:
                    conds.append(("scored", P["scored"], lambda r: r.pts_prev is not None and r.pts_prev >= 40))
            if ranks_ok and their["fresh"]:
                fl = ctx.ranks.flags(league, season, day, tid, oid)
                if fl["oppdef10"]:
                    conds.append(("oppdef", P["oppdef"], lambda r: r.oppdef10))
                if fl["offs25"] and my["fresh"]:
                    conds.append(("offs", P["offs"], lambda r: r.offs25))
            if season - 1 >= ctx.first_season and ctx.meets.get((tid, oid, season - 1)) is False:
                conds.append(("lastyr", P["lastyr"], lambda r: r.lastyr))
            if ab in ACADEMIES and oab in ACADEMIES:
                conds.append(("academy", P["academy"], lambda r: r.academy))
            if day.month == 11:
                conds.append(("month", f("month", month="November"), lambda r: r.month == 11))
            # rivalry week only for teams that meet every year (5 of the last 6 seasons), not any Thanksgiving-weekend game
            met = {r.season for r in rows if r.team == tid and r.opp == oid and season - 6 <= r.season < season}
            if in_rivalry_week(day) and len(met) >= 5:
                conds.append(("rweek", P["rweek"], lambda r: r.rweek))
            ccg, bowl, cfp = cfb_flags(note, stype == "3")
            reg = stype == "2" and not ccg
            later = [p for p in ctx.pending.get((tid, season), []) if p.start > g["start"]]
            if reg and ctx.complete and not any(p.stype == "2" and not p.ccg for p in later):
                conds.append(("finale", P["finale"], lambda r: r.finale))
            if reg and role == "home" and ctx.complete and not any(p.stype == "2" and not p.ccg and p.home for p in later):
                conds.append(("homefinale", P["homefinale"], lambda r: r.homefinale))
            rival = next((n for pair, n in CFB_RIVALRIES.items() if ab in pair), None)
            rival_id = next((ctx.ids.get(x) for pair in CFB_RIVALRIES if ab in pair for x in pair if x != ab), None)
            if rival and rival_id and nxt is not None and nxt.opp == rival_id and rival_id != oid:
                conds.append(("prerival", f("prerival", rivalry=rival),
                              lambda r, x=rival_id: (r.next_opp == x) if r.next_known else None))
            if ccg:
                conds.append(("ccg", P["ccg"], lambda r: r.ccg))
            if bowl:
                conds.append(("bowl", P["bowl"], lambda r: r.bowl))
            if cfp:
                conds.append(("cfp", P["cfp"], lambda r: r.cfp))
            oc = ""
            school = school_of.get(oid)
            lst = lookup.get((school, season)) if school else None
            if lst:
                oc = lst[-1][0]
            if oc:
                conds.append(("oppcoach", f("oppcoach", coach=possessive(oc)), lambda r, x=oc: r.opp_coach == x))
        elif league == "cbb":
            if g["conf"]:
                conds.append(("conf", P["conf"], lambda r: r.conf))
            if opp_rank <= 25:
                conds.append(("ranked", P["ranked"], lambda r: r.opp_ranked))
            if rest == 1:
                conds.append(("rest", P["day_after"], lambda r: r.rest == 1))
            elif 7 <= rest < 99:
                conds.append(("rest", P["week_off"], lambda r: 7 <= r.rest < 99))
            if their["rest"] < 99 and rest < 99 and rest > their["rest"]:
                conds.append(("restadv", P["restadv_cbb"], lambda r: r.opp_rest < 99 and r.rest < 99 and r.rest > r.opp_rest))
            if my["trip"] >= 2:
                conds.append(("trip", P["trip2"], lambda r: r.trip >= 2))
            if their["fresh"] and their["over"]:
                conds.append(("oppq", P["over" if their["over"] > 0 else "under"], lambda r, o=their["over"]: r.opp_over == o))
            conds.append(("month", f("month", month=MONTHS[day.month]), lambda r, m=day.month: r.month == m))
            if g.get("tourney") == "CONF":
                conds.append(("ctourney", P["ctourney"], lambda r: r.tourney == "CONF"))
            elif g.get("tourney") == "NCAA":
                conds.append(("ncaa", P["ncaa"], lambda r: r.tourney == "NCAA"))
        else:
            if rest == 1:
                conds.append(("rest", P["b2b2"], lambda r: r.rest == 1))
            elif 3 <= rest < 99:
                conds.append(("rest", P["rest2"], lambda r: 3 <= r.rest < 99))
            if nxt is not None and (nxt.day - day).days == 1:
                conds.append(("first", P["b2b1"], lambda r: (r.next_rest == 1) if r.next_known else None))
            if their["rest"] < 99 and rest < 99 and rest > their["rest"]:
                conds.append(("restadv", P["restadv"], lambda r: r.opp_rest < 99 and r.rest < 99 and r.rest > r.opp_rest))
            if my["g4"] >= 3:
                conds.append(("g4", P["g4"], lambda r: r.g4 >= 3))
            if my["g6"] >= 4:
                conds.append(("g6", P["g6"], lambda r: r.g6 >= 4))
            if their["rest"] == 1 and rest != 1:
                conds.append(("opprest", P["oppb2b"], lambda r: r.opp_rest == 1))
            if their["rest"] == 1 and rest == 1:
                conds.append(("bothb2b", P["bothb2b"], lambda r: r.rest == 1 and r.opp_rest == 1))
            if role == "road" and rest == 1 and my["prev_home"]:
                conds.append(("b2bhome", P["b2bhome"], lambda r: (not r.home) and not r.neutral and r.rest == 1 and r.prev_home is True))
            if my["trip"] >= 3:
                conds.append(("trip", P["trip3"], lambda r: r.trip >= 3))
            if role == "road" and my["trip"] >= 2 and nxt is not None and not nxt.road:
                conds.append(("tripend", P["tripend"],
                              lambda r: (r.trip >= 2 and (r.next_rest is None or r.next_road is False)) if r.next_known else None))
            if role == "road" and my["trip"] == 1 and nxt is not None and nxt.road:
                conds.append(("tripstart", P["tripstart"], lambda r: (r.trip == 1 and r.next_road is True) if r.next_known else None))
            if my["home_after"]:
                conds.append(("home_after", P["home_after"], lambda r: r.home_after))
            if my["stand"] >= 4:
                conds.append(("stand", P["stand"], lambda r: r.stand >= 4))
            if their["fresh"] and their["over"]:
                conds.append(("oppq", P["over" if their["over"] > 0 else "under"], lambda r, o=their["over"]: r.opp_over == o))
            d1, d2 = NBA_DIV.get(ab), NBA_DIV.get(oab)
            if d1 and d1 == d2:
                conds.append(("div", P["div"], lambda r: r.div))
            elif d1 and d2 and (d1 in EAST) != (d2 in EAST):
                conds.append(("xconf", f("xconf", conf="East" if d2 in EAST else "West"), lambda r: r.xconf))
            if g.get("tv"):
                conds.append(("tv", P["tv"], lambda r: r.tv))
            conds.append(("month", f("month", month=MONTHS[day.month]), lambda r, m=day.month: r.month == m))
            if clock.hour < 16:
                conds.append(("tipoff", P["early"], lambda r: r.hour < 16))
            elif clock.hour >= 22:
                conds.append(("tipoff", P["late"], lambda r: r.hour >= 22))
            if role == "road" and oab in ALTITUDE:
                conds.append(("alt", P["alt"], lambda r: (not r.home) and not r.neutral and r.opp_abbr in ALTITUDE))
            site_pt = (g["venue_state"] in PT_STATES if g["venue_state"] else (False if g["venue_city"] else None)) if g["neutral"] \
                else (g["home"]["team"]["abbreviation"] in NBA_PT)
            if ab in NBA_ET and site_pt:
                conds.append(("tz", P["tz"], lambda r: r.site_pt))
            if ranks_ok and their["fresh"]:
                fl = ctx.ranks.flags(league, season, day, tid, oid)
                if fl["oppoff10"]:
                    conds.append(("oppoff", P["oppoff"], lambda r: r.oppoff10))
                if fl["oppdef10"]:
                    conds.append(("oppdef", P["oppdef"], lambda r: r.oppdef10))
                if my["fresh"] and fl["fast"]:
                    conds.append(("pace", P["fast"], lambda r: r.fast))
                elif my["fresh"] and fl["slow"]:
                    conds.append(("pace", P["slow"], lambda r: r.slow))
            champ = ctx.champs.get(season - 1) or FIRST_CHAMP.get(season)
            if champ and oid == champ:
                conds.append(("champ", P["champ"], lambda r: r.champ))
            if their["fresh"] and their["streak"] >= 4:
                conds.append(("hot", P["hot"], lambda r: r.opp_streak >= 4))
            lm = [p for p in ctx.tl.get((tid, season - 1), []) + ctx.tl.get((tid, season), []) if p.opp == oid]   # the last one last
            if my["fresh"] and lm and lm[-1].res == "L":
                conds.append(("lastmeet", P["lastmeet"], lambda r: (r.lastmeet == -1) if r.lastmeet is not None else None))
                if lm[-1].margin is not None and lm[-1].margin <= -20:
                    conds.append(("lastmeet", P["lastblow"],
                                  lambda r: (r.lastmargin is not None and r.lastmargin <= -20) if r.lastmeet is not None else None))
            if my["prev_opp"] == oid:
                conds.append(("sameopp", P["sameopp"], lambda r, o=oid: r.prev_opp == r.opp))
            st = NBA_STATE.get(ab)
            if st and st == NBA_STATE.get(oab):
                conds.append(("instate", f("instate", state=st), lambda r: r.instate))
            if CUP_NOTE.match(note):
                conds.append(("cup", P["cup"], lambda r: r.cup))
            if stype == "3":
                conds.append(("playoff", P["playoff"], lambda r: r.playoff))
                rnd = nba_round(note)
                if rnd:
                    conds.append(("round", rnd, lambda r, x=rnd: r.rnd == x))
            if stype == "2" and season in ctx.first_day and (day - ctx.first_day[season]).days <= 6:
                conds.append(("opening", P["opening"], lambda r: r.opening))
            be = ctx.break_end.get(season)
            if stype == "2" and be and day >= be:
                n_after = sum(1 for p in ctx.tl.get((tid, season), []) + ctx.pending.get((tid, season), [])
                              if be <= p.day and p.start < g["start"] and p.stype == "2")
                if n_after < 5:
                    conds.append(("allstar", P["allstar"], lambda r: r.allstar))
            if boxes and outs:
                for pid, pname in (outs.get(tid) or {}).items():
                    if pid in boxes.top_scorers(tid, season) and pname:
                        span = boxes.span(pid, tid, season)
                        conds.append(("out", f("out", player=pname),
                                      lambda r, pid=pid, tm=tid, span=span: r.team == tm and r.season in span
                                      and span[r.season][0] <= r.start <= span[r.season][1]
                                      and (r.event, tm) in boxes.played and pid not in boxes.played[(r.event, tm)]))
        if league == "nba" and my["fresh"]:
            if my["margin"] is not None and -3 <= my["margin"] < 0:
                conds.append(("close", P["close"], lambda r: r.margin_prev is not None and -3 <= r.margin_prev < 0))
            if my["ot"]:
                conds.append(("ot", P["ot"], lambda r: r.ot_prev))

        def phrase_for(combo) -> list[str]:
            kinds = {k for k, _, _ in combo}
            size = kinds & SIZE_KINDS
            parts = []
            if "role" in kinds and size:
                k = next(iter(size))
                tail = {"fd": "", "big": f" of {cfg['big']}+", "small": f" of {cfg.get('small', 0):g} or less",
                        "huge": f" of {cfg.get('huge', 0)}+"}[k]
                # "as a road underdog", and at a neutral site "as an underdog at neutral sites"
                parts.append(f"as {art} {fd}{tail} {P['neutral']}" if role == "neutral" else f"as a {role} {fd}{tail}")
            for k, ph, _ in combo:
                if parts and "role" in kinds and size and (k == "role" or k in SIZE_KINDS):
                    continue
                parts.append(ph)
            return parts

        team_rows = by_team.get(tid, []) if by_team is not None else [r for r in rows if r.team == tid]
        subjects = []
        if league == "cbb":
            # the head coach: ESPN's checked coach on his team's latest game; his record wherever he coached since 2013-14
            mine = [r for r in team_rows if r.season == season and r.coach_id]
            if mine:
                cid, coach = mine[-1].coach_id, mine[-1].coach
                crow = by_coach.get(cid, []) if by_coach is not None else [r for r in rows if r.coach_id == cid]
                first = coach_start(crow, season)   # never across a season his games are missing from
                crow = [r for r in crow if r.season >= first]
                subjects.append(("coach", coach, crow, "this season" if first == season else f"since {season_label(league, first)}"))
        if league == "cfb":
            school = school_of.get(tid)
            lst = lookup.get((school, season)) if school else None
            # this season's coach: the last one listed (an interim replaces a fired coach)
            coach = lst[-1][0] if lst else ""
            if coach:
                crow = [r for r in rows if r.coach == coach]
                if crow:
                    first = min(r.season for r in crow)
                    subjects.append(("coach", coach, crow, "this season" if first == season else f"since {first}"))
        # D-117: a team's multi-season record only covers the stretch with the same core (the head coach in
        # college; the current top scorer in the NBA). A new core gets this season only.
        stable = continuity_start(league, tid, season, lookup, school_of, boxes, cfg["since"], team_rows)
        recent = max(season - 2, stable)
        long_ = max(cfg["since"], stable)
        recent_frame = f"since {season_label(league, recent)}"
        subjects.append(("team", name, [r for r in team_rows if r.season == season], "this season"))
        if recent < season:
            subjects.append(("team", name, [r for r in team_rows if r.season >= recent], recent_frame))
        if long_ < recent:
            subjects.append(("team", name, [r for r in team_rows if r.season >= long_], f"since {season_label(league, long_)}"))

        combos = [(c,) for c in conds] + [(a, b) for i, a in enumerate(conds) for b in conds[i + 1:]]
        combos = [c for c in combos if combo_ok(c)]
        for kind, who, srows, frame in subjects:
            n_rows = len(srows)
            full = (1 << n_rows) - 1
            masks = {}
            outcome = {(m, x): sum(1 << i for i, r in enumerate(srows) if getattr(r, m) == x) for m in ("ats", "ou") for x in (1, -1, 0)}
            recent_mask = sum(1 << i for i, r in enumerate(srows) if r.season >= season - (RECENT_SEASONS - 1))
            for combo in combos:
                kinds = {k for k, _, _ in combo}
                if kind == "team" and frame.startswith("since") and frame != recent_frame and not kinds & LONG_OK:
                    continue  # the long team window is for this matchup (or rivalry week, or a once-a-year event) only
                ms = []
                for k, ph, pred in combo:
                    if (k, ph) not in masks:
                        masks[(k, ph)] = cond_masks(srows, pred)
                    ms.append(masks[(k, ph)])
                sel = full
                for t_, _ in ms:
                    sel &= t_
                series = league == "cfb" and bool(kinds & SERIES_KINDS)
                floor = SERIES_MIN if series else MIN_GAMES
                if sel.bit_count() < floor:
                    continue
                # D-120: every game the record could count has to be known for each condition, and no condition
                # may be true for nearly every game it's paired with (or every game of the window)
                good = True
                for j, (t_, u_) in enumerate(ms):
                    base = full
                    for i, (t2, _) in enumerate(ms):
                        if i != j:
                            base &= t2
                    if base & u_ or (base & t_).bit_count() >= TAUTOLOGY * base.bit_count():
                        good = False
                        break
                if not good:
                    continue
                parts = phrase_for(combo)
                fr = frame
                for k in kinds & set(EVENT_START):
                    m_ = re.match(r"since (\d{4})", fr)
                    if m_ and int(m_.group(1)) + 1 < EVENT_START[k]:
                        fr = f"since {season_label(league, EVENT_START[k])}"
                # the month is a weak reason on its own: it wins only when it's clearly the strongest record
                relevance = (0.5 * bool(kinds & OPP_LIKE) + 0.3 * ("out" in kinds)
                             + 0.2 * bool(kinds & {"ranked", "rest", "opprest", "playoff", "round", "cup", "ccg", "bowl", "cfp"})
                             - 0.3 * bool(kinds & {"month", "opening", "allstar"}))
                for metric in ("ats", "ou"):
                    if metric == "ou" and total is None:
                        continue
                    if metric == "ats" and kinds & TOTALS_ONLY:
                        continue
                    if kinds & NO_REASON[metric]:
                        continue   # D-123: no reason this condition moves this market
                    w, l, p = ((sel & outcome[(metric, x)]).bit_count() for x in (1, -1, 0))
                    n = w + l
                    if n < floor:
                        continue
                    rate = w / n
                    if FLOOR_RATE > rate > 1 - FLOOR_RATE:
                        continue
                    if abs(zscore(w, l)) < FLOOR_Z or not sel & recent_mask:
                        continue
                    # D-123: shrink toward every team in the same spot, then require it to hold in both halves
                    start = min(srows[i].season for i in range(n_rows) if sel >> i & 1)
                    if kinds & NO_BASELINE:
                        base, base_n = 0.5, 0
                    else:
                        base, base_n = league_rate(rows, start, combo, metric)
                    z = (w + SHRINK * base - (n + SHRINK) / 2) / math.sqrt((n + SHRINK) / 4)
                    if abs(z) < FLOOR_Z or (z > 0) != (rate > 0.5):
                        continue
                    if not holds(srows, sel, metric, 1 if rate > 0.5 else -1):
                        continue
                    rel = relevance - 0.3 * len(kinds & WEAK_REASON[metric])
                    if base_n >= 100 and abs(base - 0.5) >= 0.03 and (base > 0.5) == (rate > 0.5):
                        rel += 0.2   # every team leans the same way in this spot
                    text = render(league, metric, kind, who, parts, fr, w, l, p)
                    if not short_enough(text):
                        continue
                    if metric == "ats":
                        supports = side_label if rate > 0.5 else other_label
                    else:
                        supports = f"{'Over' if rate > 0.5 else 'Under'} {float(total):g}"
                    sample = [(srows[i].event, srows[i].team) for i in range(n_rows) if sel >> i & 1 and getattr(srows[i], metric) is not None]
                    out.append(Angle(text, supports, "spread" if metric == "ats" else "total", metric,
                                     w, l, p, z, len(combo), rate, frozenset(kinds), rel, sample))
    return out


# ---------------------------------------------------------------- NCAA tournament (college basketball, D-116)
def tourney_module():
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    import ncaa_tournament
    return ncaa_tournament


def name_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]+", "", s)


def load_tourney(path: str, cutoff: str = "") -> list[dict]:
    """ncaab_tournament.csv; with --replay, only the tournaments (and that tournament's games) before that day."""
    if not path:
        return []
    rows = list(csv.DictReader(open(path)))
    if cutoff:
        y = int(cutoff[:4])
        rows = [r for r in rows if int(r["season"]) < y or (int(r["season"]) == y and r["date"] and r["date"] < cutoff[:10])]
    return rows


def passes(w: int, l: int, last: int, season: int) -> bool:
    """The same bar as every other angle: 10+ decided games, 62% or better (or 38% or worse), 1.6 standard
    deviations from a coin flip, and a game in the last two tournaments."""
    n = w + l
    if n < MIN_GAMES:
        return False
    rate = w / n
    return not (FLOOR_RATE > rate > 1 - FLOOR_RATE) and abs(zscore(w, l)) >= FLOOR_Z and last >= season - (RECENT_SEASONS - 1)


def coach_start(crow: list, season: int) -> int:
    """The first season of the coach's unbroken run in the data, up to this one. ESPN's coach data has a few
    holes (some 2024 and 2025 teams have no checked coach), so a coach's record never reaches across a season
    with none of his games: "since 2013-14" has to mean every game he coached since then."""
    have = {r.season for r in crow}
    s = season
    while s - 1 in have:
        s -= 1
    return s


def tourney_angles(g: dict, trows: list[dict], by_team: dict, season: int, by_coach: dict | None = None,
                   team_names: dict | None = None) -> list[Angle]:
    """In an NCAA tournament game: the seed matchup straight up (since 1985) and against the spread (lines
    since 2013), and each head coach's tournament record since 2013, written from the side with the winning
    record: "1 seeds are 162-2 against 16 seeds since 1985", "Mark Few is 29-11 in the NCAA tournament since 2014"
    (going into March 19, 2026)."""
    out = []
    if g.get("tourney") != "NCAA" or not trows:
        return out
    line = {"home": g["home_line"], "away": -g["home_line"]}
    abbr = {s: g[s]["team"]["abbreviation"] for s in ("home", "away")}
    seed = g["seed"]
    if seed["home"] and seed["away"] and seed["home"] != seed["away"]:
        for metric in ("su", "ats"):
            w = l = p = 0
            first = last = None
            for r in trows:
                sa, sb = int(r["seed_a"]), int(r["seed_b"])
                if {sa, sb} != {seed["home"], seed["away"]} or (metric == "ats" and r["line_a"] == ""):
                    continue
                mine, theirs = ("a", "b") if sa == seed["home"] else ("b", "a")
                m = int(r[f"pts_{mine}"]) - int(r[f"pts_{theirs}"])
                if metric == "ats":
                    m += float(r["line_a"]) if mine == "a" else -float(r["line_a"])
                w, l, p = w + (m > 0), l + (m < 0), p + (m == 0)
                y = int(r["season"])
                first, last = (y if first is None else min(first, y)), (y if last is None else max(last, y))
            if first is None or w == l:
                continue
            side = "home" if w > l else "away"   # the home team's seed has the winning record, or the away team's
            other = "away" if side == "home" else "home"
            sw, sl = (w, l) if side == "home" else (l, w)
            if not passes(sw, sl, last, season):
                continue
            rec = f"{sw}-{sl}" + (f"-{p}" if p else "")
            ats = " ATS" if metric == "ats" else ""
            text = f"{seed[side]} seeds are {rec}{ats} against {seed[other]} seeds since {first}"
            supports = f"{abbr[side]} {fmt_line(line[side])}" if metric == "ats" else f"{abbr[side]} ML"
            out.append(Angle(text, supports, "spread" if metric == "ats" else "moneyline", f"seed_{metric}", sw, sl, p,
                             zscore(sw, sl), 1, sw / (sw + sl), frozenset({"seed"}), 0.0, [],
                             {"kind": "seed", "metric": metric, "s": seed[side], "t": seed[other], "first": first}))
    for side in ("home", "away"):
        other = "away" if side == "home" else "home"
        mine = [r for r in by_team.get(g[side]["team"]["id"], []) if r.season == season and r.coach_id]
        if not mine or by_coach is None:
            continue
        cid, coach = mine[-1].coach_id, mine[-1].coach
        crow = by_coach.get(cid, [])
        start = max(COACH_TOURNEY_SINCE, coach_start(crow, season))
        teams = defaultdict(set)   # his team each season of the run, by ESPN id
        for r in crow:
            if r.season >= start:
                teams[r.season].add(r.team)
        key = name_key(coach)
        w = l = 0
        seasons, names, complete = [], set(), True
        for r in trows:
            y = int(r["season"])
            if y < start or y not in teams:
                continue
            for x, o in (("a", "b"), ("b", "a")):
                tid = r[f"espn_id_{x}"]
                if tid and tid not in teams[y]:
                    continue
                if not tid and not any(k.startswith(name_key(r[f"team_{x}"])) for t in teams[y] for k in (team_names or {}).get(t, ())):
                    continue
                if not tid or name_key(r[f"coach_{x}"]) != key:
                    complete = False   # one of his team's games without his name on it: the record can't be told
                    continue
                names.add(r[f"coach_{x}"])
                m = int(r[f"pts_{x}"]) - int(r[f"pts_{o}"])
                w, l = w + (m > 0), l + (m < 0)
                seasons.append(y)
        if not complete or not seasons or not passes(w, l, max(seasons), season):
            continue
        text = f"{coach} is {w}-{l} in the NCAA tournament since {min(seasons)}"
        supports = f"{abbr[side]} ML" if w > l else f"{abbr[other]} ML"
        out.append(Angle(text, supports, "moneyline", "coach_su", w, l, 0, zscore(w, l), 1, w / (w + l),
                         frozenset({"ncaa_coach"}), 0.0, [],
                         {"kind": "coach", "names": sorted(names), "since": start, "first": min(seasons)}))
    return out


def verify_tourney(a: Angle, trows: list[dict]) -> bool:
    """Recount a tournament angle with ncaa_tournament.py's own record functions, a separate code path."""
    nt = tourney_module()
    c = a.crit
    if c["kind"] == "seed":
        r = nt.seed_record(trows, c["s"], c["t"])
        got = r["su"] + (0,) if c["metric"] == "su" else r["ats"]
        first = r["first"] if c["metric"] == "su" else r["first_ats"]
        return got == (a.w, a.l, a.p) and first == c["first"] and a.text.endswith(f"since {first}")
    w = l = 0
    first = None
    for name in c["names"]:
        r = nt.coach_record(trows, name, since=c["since"])
        w, l = w + r["su"][0], l + r["su"][1]
        if r["first"] is not None:
            first = r["first"] if first is None else min(first, r["first"])
    return (w, l) == (a.w, a.l) and first == c["first"] and a.text.endswith(f"since {first}")


def verify(a: Angle, idx: dict[str, dict], trows: list[dict] | None = None) -> bool:
    """Recompute the record straight from the CSV rows, independently of Row (tournament angles: the tournament file)."""
    if a.crit:
        return verify_tourney(a, trows or [])
    w = l = p = 0
    for event, team in a.sample:
        r = idx[event]
        home = r["home_id"] == team
        hp, ap = float(r["home_pts"]), float(r["away_pts"])
        if a.metric == "ats":
            m = (hp - ap) + float(r["home_line"])
            m = m if home else -m
        else:
            m = hp + ap - float(r["total"])
        w, l, p = w + (m > 0), l + (m < 0), p + (m == 0)
    return (w, l, p) == (a.w, a.l, a.p)


def season_fallback(league: str, g: dict, by_team: dict, season: int) -> Angle | None:
    """D-123 (owner, Nov 25: "Ship, fill the gaps"): a game with no line that clears the relevance bar shows its
    plainest fact, a team's record this season against the spread or on the total, whichever of the four is
    furthest from even. Needs 4+ decided games and a lean; same shapes and same recount as every other line."""
    best = None
    for side in ("home", "away"):
        me, op = (g["home"], g["away"]) if side == "home" else (g["away"], g["home"])
        tid = me["team"]["id"]
        line = g["home_line"] if side == "home" else -g["home_line"]
        name = short(league, me["team"])
        cur = [r for r in by_team.get(tid, []) if r.season == season]
        for metric in ("ats", "ou"):
            if metric == "ou" and g["total"] is None:
                continue
            sel = [r for r in cur if getattr(r, metric) is not None]
            w = sum(1 for r in sel if getattr(r, metric) == 1)
            l = sum(1 for r in sel if getattr(r, metric) == -1)
            p = sum(1 for r in sel if getattr(r, metric) == 0)
            if w + l < 4 or w == l:
                continue
            z = zscore(w, l)
            if best is not None and abs(z) <= abs(best.z):
                continue
            text = render(league, metric, "team", name, [], "this season", w, l, p)
            if metric == "ats":
                supports = (f"{me['team']['abbreviation']} {fmt_line(line)}" if w > l
                            else f"{op['team']['abbreviation']} {fmt_line(-line)}")
            else:
                supports = f"{'Over' if w > l else 'Under'} {float(g['total']):g}"
            best = Angle(text, supports, "spread" if metric == "ats" else "total", metric, w, l, p, z, 1, w / (w + l),
                         frozenset({"season"}), 0.0, [(r.event, r.team) for r in sel])
    return best


def pick_slate(games: list[tuple[dict, list[Angle]]], ok, overflow: int | None = None) -> dict[str, Angle]:
    """D-115: one line per game, picked per Eastern day so no condition family shows on more than
    2 games (one in eight on a big college Saturday). Games with the fewest kinds of angle choose first;
    a game whose every angle is over the limit takes the one whose families are least used."""
    by_day = defaultdict(list)
    for g, angles in games:
        by_day[g["start"].astimezone(ET).date()].append((g, angles))
    picked = {}
    for day_games in by_day.values():
        cap = max(2, math.ceil(len(day_games) / 8))
        used = Counter()
        # games with the fewest kinds of angle choose first, so the games with many options adapt around them
        options = {g["id"]: len({f for a in angles[:40] for f in a.families}) for g, angles in day_games}
        for g, angles in sorted(day_games, key=lambda x: (options[x[0]["id"]], -x[1][0].strong, -x[1][0].score)):
            fresh = (a for a in angles if all(used[f] < cap for f in a.families) and ok(a))
            best = next(fresh, None)
            if best is None:   # every angle is over the limit: the one whose families are least used, then the strongest
                # college basketball (D-116): at most `overflow` past the limit; a game that can't fit goes without
                over = [a for a in angles[:40] if ok(a) and (overflow is None or max(used[f] for f in a.families) < cap + overflow)]
                best = min(over, key=lambda a: (max(used[f] for f in a.families), -a.strong, -a.score), default=None)
            if best:
                used.update(best.families)
                picked[g["id"]] = best
        repair(day_games, picked, used, cap + (overflow or 0), ok)   # college basketball keeps D-116's one past the limit
    return picked


def repair(day_games: list, picked: dict, used: Counter, cap: int, ok) -> None:
    """D-120: after the greedy pass, move a game off a family that went over the limit when another of its
    verified angles fits, directly or by moving one more game first. Only moves that cut the overflow."""
    def excess(u: Counter) -> int:
        return sum(max(0, n - cap) for n in u.values())

    for _ in range(100):
        if not excess(used):
            return
        best_move, best_cut = None, 0
        for g, angles in day_games:
            cur = picked.get(g["id"])
            if not cur or all(used[f] <= cap for f in cur.families):
                continue
            for a in angles[:40]:
                if a is cur or not ok(a):
                    continue
                u = used.copy()
                u.subtract(cur.families)
                u.update(a.families)
                cut = excess(used) - excess(u)
                if cut > best_cut and all(u[f] <= cap for f in a.families):
                    best_move, best_cut = [(g["id"], cur, a)], cut
                    continue
                # one more game steps aside from the family that blocks this angle
                block = [f for f in a.families if u[f] > cap]
                if len(block) != 1:
                    continue
                for g2, angles2 in day_games:
                    cur2 = picked.get(g2["id"])
                    if g2 is g or not cur2 or block[0] not in cur2.families:
                        continue
                    for b in angles2[:40]:
                        if b is cur2 or not ok(b):
                            continue
                        u2 = u.copy()
                        u2.subtract(cur2.families)
                        u2.update(b.families)
                        cut2 = excess(used) - excess(u2)
                        if cut2 > best_cut and all(u2[f] <= cap for f in a.families | b.families):
                            best_move, best_cut = [(g["id"], cur, a), (g2["id"], cur2, b)], cut2
                            break
        if not best_move:
            return
        for gid, old, new in best_move:
            used.subtract(old.families)
            used.update(new.families)
            picked[gid] = new


# ---------------------------------------------------------------- self-test (D-120)
def self_test() -> None:
    """Every phrase in both D-117 shapes, a few exact sentences, the wording guards, the shape check's
    rejections, and the pieces the new conditions stand on (pending games, ties at a rank cutoff, notes)."""
    fills = {"art": "a", "fd": "favorite", "n": 3, "more": "less", "month": "November", "rivalry": "the Iron Bowl",
             "opp": "the Spurs", "coach": "Kirby Smart's", "state": "Texas", "conf": "East", "player": "Joel Embiid"}
    n = 0
    for key, ph in P.items():
        text = ph.format(**fills)
        fits = Counter()
        for league, kind, who in (("nba", "team", "Celtics"), ("cfb", "team", "Ohio State"), ("cfb", "coach", "Kirby Smart")):
            for metric, (w, l) in (("ats", (12, 4)), ("ou", (4, 12))):
                frame = "since 2024-25" if league == "nba" else "since 2016"
                s = render(league, metric, kind, who, [text], frame, w, l, 0)
                assert sentence_ok(s), (key, s)
                fits[metric] += short_enough(s)
                n += 1
        # every phrase fits MAX_WORDS in one shape at least, and the totals-only ones in the over/under shape
        assert fits["ou"] if key in ("fast", "slow", "offs", "tot_hi", "tot_lo") else (fits["ats"] or fits["ou"]), (key, "too long")
    cases = [
        (("nba", "ats", "team", "Celtics", ["after losing by 20 or more"], "since 2024-25", 11, 3, 0),
         "The Celtics are 11-3 ATS after losing by 20 or more since 2024-25"),
        (("nba", "ou", "team", "Celtics", ["after losing by 20 or more"], "since 2024-25", 3, 11, 0),
         "The under is 11-3 in Celtics games after losing by 20 or more since 2024-25"),
        (("nba", "ats", "team", "Warriors", ["on the road the night after a home game"], "since 2024-25", 2, 9, 0),
         "The Warriors are 2-9 ATS on the road the night after a home game since 2024-25"),
        (("nba", "ou", "team", "Knicks", ["in NBA Cup games"], "since 2023-24", 9, 3, 0),
         "The over is 9-3 in Knicks NBA Cup games since 2023-24"),
        (("nba", "ou", "team", "Thunder", ["in the first five games after the All-Star break"], "since 2022-23", 11, 1, 3),
         "The over is 11-1-3 in the Thunder's first five games after the All-Star break since 2022-23"),
        (("nba", "ats", "team", "Pelicans", ["in the first five games after the All-Star break"], "since 2022-23", 4, 14, 0),
         "The Pelicans are 4-14 ATS in the first five games after the All-Star break since 2022-23"),
        (("nba", "ou", "team", "Celtics", ["in the second round"], "since 2022-23", 4, 12, 0),
         "The under is 12-4 in Celtics second-round games since 2022-23"),
        (("nba", "ou", "team", "Kings", ["between two of the 10 fastest-paced teams"], "since 2024-25", 15, 6, 0),
         "The over is 15-6 in Kings games between two of the 10 fastest-paced teams since 2024-25"),
        (("nba", "ats", "team", "Heat", ["in the Pacific time zone"], "since 2024-25", 4, 12, 0),
         "The Heat are 4-12 ATS in the Pacific time zone since 2024-25"),
        (("nba", "ats", "team", "Lakers", ["against Texas teams"], "since 2024-25", 9, 3, 0),
         "The Lakers are 9-3 ATS against Texas teams since 2024-25"),
        (("cfb", "ats", "coach", "Kalani Sitake", ["in bowl games"], "since 2016", 6, 2, 0),
         "Kalani Sitake is 6-2 ATS in bowl games since 2016"),
        (("cfb", "ou", "coach", "Dabo Swinney", ["in College Football Playoff games"], "since 2016", 4, 7, 0),
         "The under is 7-4 in Dabo Swinney's College Football Playoff games since 2016"),
        (("cfb", "ou", "coach", "Kirby Smart", ["at home", "in conference title games"], "since 2016", 2, 5, 0),
         "The under is 5-2 in Kirby Smart's conference title games at home since 2016"),
        (("cfb", "ats", "team", "Auburn", ["in the game before the Iron Bowl"], "since 2016", 2, 8, 0),
         "Auburn is 2-8 ATS in the game before the Iron Bowl since 2016"),
        (("cfb", "ats", "coach", "Kirby Smart", ["against Steve Sarkisian's teams"], "since 2016", 3, 0, 0),
         "Kirby Smart is 3-0 ATS against Steve Sarkisian's teams since 2016"),
        (("cfb", "ou", "team", "Army", ["against service academies"], "since 2016", 4, 14, 0),
         "The under is 14-4 in Army games against service academies since 2016"),
        (("cfb", "ats", "team", "Arkansas", ["at home", "as an unranked team against ranked teams"], "since 2016", 9, 3, 0),
         "Arkansas is 9-3 ATS at home as an unranked team against ranked teams since 2016"),
        (("cfb", "ats", "team", "Clemson", ["as a road favorite of 3 or less"], "since 2016", 3, 10, 0),
         "Clemson is 3-10 ATS as a road favorite of 3 or less since 2016"),
    ]
    for args, want in cases:
        got = render(*args)
        assert got == want, (got, want)
        assert sentence_ok(got), got
    for bad in ("Since 2024-25, the Celtics are 12-4 ATS as road favorites", "The Spurs have covered 6 straight since 2024-25",
                "The Thunder have covered 71% of their games as home favorites since 2024-25",
                "Teams facing the Spurs on the second night of a back-to-back are 3-12 ATS since 2024-25",
                "The Warriors are 18-9 ATS at home and 9-19 ATS on the road since 2024-25",
                "The Pistons have beaten the closing spread by 5.1 points a game this season",
                "The Knicks are 9-2 ATS after a loss – since 2024-25", "Indiana has covered 7 straight games since 2016",
                "Under Dan Lanning, Oregon is 14-5 ATS at home", "LSU games have gone over the total in 8 straight November games",
                "The Celtics should cover: 12-4 ATS after a loss since 2024-25"):
        assert not sentence_ok(bad), bad
    assert sentence_ok("1 seeds are 158-2 against 16 seeds since 1985") and sentence_ok("Mark Few is 29-11 in the NCAA tournament since 2014")
    p = lambda r: True
    assert not combo_ok((("prev", P["prev_l"], p), ("blowout", "after losing by 20 or more", p)))         # one family
    assert not combo_ok((("opp", "against the Spurs", p), ("oppq", P["over"], p)))                         # opponent twice
    assert not combo_ok((("opp", "against the Spurs", p), ("champ", P["champ"], p)))
    assert not combo_ok((("oppcoach", "against Kirby Smart's teams", p), ("ranked", P["ranked"], p)))
    assert not combo_ok((("xconf", "against the East", p), ("hot", P["hot"], p)))                           # "against ... against"
    assert not combo_ok((("tv", P["tv"], p), ("rest", P["b2b2"], p)))                                       # "on ... on"
    assert not combo_ok((("tot", "with a total of 238 or more", p), ("restadv", P["restadv"], p)))          # "with ... with"
    assert not combo_ok((("fd", P["fav"], p), ("upset", P["upset"], p)))                                    # favorite twice
    assert not combo_ok((("div", P["div"], p), ("ccg", P["ccg"], p)))                                       # two folded groups
    assert combo_ok((("role", P["road"], p), ("first", P["b2b1"], p)))
    assert not combo_ok((("fd", P["dog"], p), ("unrk", P["unrk"], p)))                                     # "as ... as"
    assert combo_ok((("opp", "against Virginia", p), ("lastyr", P["lastyr"], p)))
    assert combo_ok((("fd", P["fav"], p), ("small", "as a favorite of 2.5 or less", p))) is False           # one family
    assert combo_ok((("role", P["home"], p), ("small", "as a favorite of 2.5 or less", p)))
    assert combo_ok((("div", P["div"], p), ("prev", P["prev_l"], p)))
    assert not short_enough("The over is 11-0-1 in Kalen DeBoer's games against teams over .500 after winning by 21 or more since 2016")
    # pending games: rest and back-to-backs count them, results don't
    t0 = datetime(2026, 11, 20, 0, 30, tzinfo=timezone.utc)
    done = [Played(t0, True, False, "W", margin=25, ats=1), Played(t0 + timedelta(days=2), False, True, "W", margin=2, ats=1)]
    pend = [Played(t0 + timedelta(days=4), False, True, "", pending=True)]
    s = situation(done + pend, t0 + timedelta(days=5), False, True)
    assert s["rest"] == 1 and s["trip"] == 3 and not s["fresh"] and s["prev"] == "" and s["streak"] == 0, s
    s = situation(done, t0 + timedelta(days=5), False, True)
    assert s["rest"] == 3 and s["fresh"] and s["prev"] == "W" and s["streak"] == 2 and s["atsrun"] == 2 and not s["ats_open"], s
    s = situation([Played(t0, True, False, "W", ats=None)] + done, t0 + timedelta(days=5), False, True)
    assert s["atsrun"] == 2 and s["ats_open"], s   # two covers, then a game with no line: three straight can't be told
    # a tie at the cutoff can't be told; a team outside the table is not in it
    vals = {str(i): float(100 + i) for i in range(20)}
    assert topk(vals, "19", 10, True) is True and topk(vals, "0", 10, True) is False and topk(vals, "x", 10, True) is False
    vals["9"] = vals["10"]
    assert topk(vals, "10", 10, True) is None and topk(vals, "9", 10, True) is None
    assert both(True, None) is None and both(False, None) is False and both(True, True) is True
    # ESPN's notes
    assert cfb_flags("SEC Championship Game", False) == (True, False, False)
    assert cfb_flags("College Football Playoff First Round Game", True) == (False, False, True)
    assert cfb_flags("Rose Bowl Game Presented by Northwestern Mutual - CFB Semifinal", True) == (False, True, True)
    assert cfb_flags("CFP NATIONAL CHAMPIONSHIP PRESENTED BY AT&T", True) == (False, False, True)
    assert cfb_flags("Frisco Football Classic Presented by Ryan", True) == (False, True, False)
    assert cfb_flags("", True) == (False, None, None)
    assert nba_round("East 1st Round - Game 6") == "in the first round" and nba_round("West Semifinals - Game 3") == "in the second round"
    assert nba_round("East Finals - Game 4") == "in the conference finals" and nba_round("NBA Finals - Game 2") == "in the NBA Finals"
    assert CUP_NOTE.match("NBA In-Season Tournament - Group Play") and CUP_NOTE.match("NBA Cup Championship")
    assert not CUP_NOTE.match("NBA Play-In - East - 7th Place vs 8th Place")
    print(f"self-test: {len(P)} phrases in both shapes ({n} sentences), {len(cases)} exact sentences, the guards and notes pass")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", choices=list(CONF))
    ap.add_argument("--history", nargs="+", help="completed seasons file, then the current season's")
    ap.add_argument("--coaches", default="")
    ap.add_argument("--boxes", nargs="*", default=[], help="NBA: nba_boxes.py player CSVs (who played)")
    ap.add_argument("--teams", nargs="*", default=[], help="NBA: nba_boxes.py team CSVs (national TV, pace)")
    ap.add_argument("--season", type=int)
    ap.add_argument("--days", type=int, default=2)
    ap.add_argument("--json", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--tournament", default="", help="college basketball: ncaab_tournament.csv (seed matchups, coaches)")
    ap.add_argument("--replay", default="", help="YYYY-MM-DD: run a past day's games as if upcoming, from the history before it")
    ap.add_argument("--replay-days", type=int, default=1, help="with --replay: that many days from it, as a run that morning would see them")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    if not (args.league and args.history and args.season):
        ap.error("--league, --history and --season are required")
    cutoff = f"{args.replay}T08:00Z" if args.replay else ""   # 3 or 4 AM Eastern: every game of the day before is in
    raw, rows, ctx, lookup, school_of = load(args.league, args.history, args.coaches, args.teams, cutoff)
    idx = {r["event_id"]: r for r in raw}
    boxes = Boxes(args.boxes, raw) if args.league == "nba" and args.boxes else None
    by_team, by_coach = defaultdict(list), defaultdict(list)
    for r in rows:
        by_team[r.team].append(r)
        if r.coach_id:
            by_coach[r.coach_id].append(r)
    trows = load_tourney(args.tournament, cutoff) if args.league == "cbb" else []
    team_names = defaultdict(set)   # ESPN team id -> its names, to place Wikipedia-only tournament games
    for r in raw:
        for x in ("home", "away"):
            team_names[r[f"{x}_id"]].add(name_key(r[x]))
    if args.replay:
        full = {r["event_id"]: r for p in args.history for r in csv.DictReader(open(p))}
        games, sched, complete, horizon = replay(args.league, args.replay, full, args.replay_days)
    else:
        games, sched, complete, horizon = upcoming(args.league, args.days)
    finished = {r["event_id"] for r in raw if r["home_pts"] != "" and r["away_pts"] != ""}
    add_pending(args.league, ctx, sched, finished, args.season)
    ctx.complete, ctx.horizon_end = complete, horizon
    annotate_next(args.league, rows, ctx, args.season)
    if args.limit:
        games = games[: args.limit]
    found = []
    for g in games:
        outs = injuries(g["id"]) if boxes else None
        angles = build_angles(args.league, g, rows, ctx, lookup, school_of, args.season, boxes, outs, by_team,
                              by_coach if args.league == "cbb" else None)
        if args.league == "cbb":
            angles += tourney_angles(g, trows, by_team, args.season, by_coach, team_names)
        angles = sorted(angles, key=lambda a: (a.strong, a.score), reverse=True)
        if angles:
            found.append((g, angles))
    checked: dict[int, bool] = {}

    def ok(a: Angle) -> bool:   # nothing unverified, or off the D-117 shapes, moves up
        if id(a) not in checked:
            checked[id(a)] = verify(a, idx, trows) and sentence_ok(a.text) and short_enough(a.text)
        return checked[id(a)]

    picked = pick_slate(found, ok, overflow=1 if args.league == "cbb" else None)
    results = []
    for g in games:
        best = picked.get(g["id"])
        tier = None if best is None else ("strong" if best.strong else "fallback")
        if best is None:   # D-123: no line clears the bar, so the plain season record fills the gap
            best = season_fallback(args.league, g, by_team, args.season)
            if best is not None and not ok(best):
                best = None
            tier = "season"
        label = f"{g['away']['team']['shortDisplayName']} {'vs' if g['neutral'] else 'at'} {g['home']['team']['shortDisplayName']}"
        if best is None:
            continue
        results.append({"espn_event_id": g["id"], "sport": SPORT[args.league], "matchup": label,
                        "starts_at": g["start"].isoformat(),
                        "best": {"text": best.text, "supports": best.supports, "market": best.market,
                                 "record": f"{best.w}-{best.l}" + (f"-{best.p}" if best.p else ""),
                                 "z": round(best.z, 2), "tier": tier,
                                 "families": sorted(best.families)}})
        print(f"{label} ({g['home']['team']['abbreviation']} {fmt_line(g['home_line'])}, O/U {g['total']}): "
              f"{best.text}  ->  {best.supports}  [{', '.join(sorted(best.families))}]")
    print(f"{len(results)} of {len(games)} games with a line", file=sys.stderr)
    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)


if __name__ == "__main__":
    main()
