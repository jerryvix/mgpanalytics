"""The one line per game (DECISIONS D-075): the strongest true angle for a matchup, from
every NFL game since 1999 with its closing line, coaches and starting QBs (nflverse,
free). No AI and no cost: every number is computed here and recomputed by the check
pass before it can be shown.

For each upcoming game it builds every angle that is TRUE for this game (the coach
as a home favorite, the QB against this opponent, the team after a loss, ...), for the
spread and the total, for both teams. An angle needs a real sample, recent games and
at most two conditions. They're scored by how far the record sits from a coin flip,
and the strongest one is written as one plain sentence with its record and time frame.

D-115: a day's lines are picked together, so no condition family shows on more than 2 games.
D-117: a team's multi-season record only covers the stretch with the same head coach and QB.
D-118 (the angle catalog, NFL game lines, data "have"): after a blowout, an upset loss or an
overtime game; win and losing streaks; a rest edge or deficit; Monday, Thursday and Sunday
night; Christmas; December, Week 14 on and the regular-season finale; the playoffs and each
round; 3-point spreads and +200 underdogs; totals of 50 or more and under 40; against teams
over or under .500, last season's playoff teams, Top-10 scoring defenses and division leaders;
against the other conference; against division rivals that won the first meeting and last
season's playoff opponents; against the other head coach; a coach against his former teams;
without their usual starting QB, for either team; Eastern teams in the Pacific time zone,
West Coast teams with a 1 PM ET kickoff, international games; indoors or outdoors and grass
or turf when it isn't the team's home setting. A condition is only used when the file says
what it was for every game it could count, and never when it is true for nearly every game.

Usage: python3 scripts/angles/nfl_angles.py --games <path to nflverse data/games.csv> --week 12 [--season 2026] [--json out.json]
       python3 scripts/angles/nfl_angles.py --self-test [--games <path>]
"""
import argparse
import csv
import json
import math
import re
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict
from dataclasses import dataclass, field

TEAM_NAMES = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers", "CHI": "Bears",
    "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers",
    "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs", "LA": "Rams", "LAC": "Chargers",
    "LV": "Raiders", "MIA": "Dolphins", "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
    "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks", "SF": "49ers", "TB": "Buccaneers",
    "TEN": "Titans", "WAS": "Commanders",
    # relocated franchises, so history follows the team
    "OAK": "Raiders", "SD": "Chargers", "STL": "Rams",
}
FRANCHISE = {"OAK": "LV", "SD": "LAC", "STL": "LA"}
ET = ZoneInfo("America/New_York")

MIN_GAMES = 10          # decided games (pushes excluded) an angle needs
MIN_RATE = 0.65         # strong tier: at least 65% (or at most 35%)
MIN_Z = 2.0             # strong tier: distance from a coin flip, in standard deviations
FLOOR_RATE = 0.62       # fallback tier, used only when a game has no strong angle
FLOOR_Z = 1.6
RECENT_SEASONS = 2      # at least one game in the last two seasons
MAX_WORDS = 18          # a longer sentence is dropped before picking
TAUTOLOGY = 0.9         # D-118: a condition true for 90% or more of its games says nothing ("outdoors" for an outdoor team)
OPP_GAMES = 6           # D-118: an opponent's record (over .500, division leader) counts from its 6th game
DEF_GAMES = 4           # and its scoring-defense rank from its 4th

# D-118: home time zone by the abbreviation a team used that season (the Rams were in St. Louis to 2015)
TEAM_TZ = {
    "ARI": "MT", "ATL": "ET", "BAL": "ET", "BUF": "ET", "CAR": "ET", "CHI": "CT", "CIN": "ET", "CLE": "ET",
    "DAL": "CT", "DEN": "MT", "DET": "ET", "GB": "CT", "HOU": "CT", "IND": "ET", "JAX": "ET", "KC": "CT",
    "LA": "PT", "LAC": "PT", "LV": "PT", "MIA": "ET", "MIN": "CT", "NE": "ET", "NO": "CT", "NYG": "ET",
    "NYJ": "ET", "PHI": "ET", "PIT": "ET", "SEA": "PT", "SF": "PT", "TB": "ET", "TEN": "CT", "WAS": "ET",
    "OAK": "PT", "SD": "PT", "STL": "CT",
}
# The AFC by the abbreviation used that season; Seattle was in the AFC until the 2002 realignment. Checked
# against the file at load: division games and conference title games stay inside a conference.
AFC = {"BAL", "BUF", "CIN", "CLE", "DEN", "HOU", "IND", "JAX", "KC", "LAC", "SD", "LV", "OAK", "MIA", "NE", "NYJ", "PIT", "TEN"}
# Stadiums outside the US (Toronto's Rogers Centre hosted the Bills); a neutral site with no NFL tenant counts too
INTL_STADIUMS = {"LON00", "LON01", "LON02", "MEX00", "GER00", "FRA00", "MUN01", "MAD01", "MEL00", "PAR00", "RIO00", "SAO00", "BUF01"}
# NFL games at Tottenham Hotspur Stadium are played on its artificial pitch (the grass pitch slides away), whatever the file says
TURF_STADIUMS = {"LON02"}
ROUNDS = {"WC": "in the Wild Card round", "DIV": "in the Divisional round", "CON": "in conference title games", "SB": "in the Super Bowl"}

# Condition kinds that count as one family for the slate's variety (D-115): two of one family never pair
FAMILY = {
    "big": "fd", "three": "fd", "ml": "fd",
    "oppcoach": "opp", "former": "opp",
    "mnf": "prime", "snf": "prime", "tnf": "prime",
    "xmas": "thanks",
    "restadv": "rest",
    "blowout": "prev", "upset": "prev", "ot": "prev", "streak": "prev",
    "oppwin": "oppq", "oppplayoff": "oppq", "oppdef": "oppq", "oppleader": "oppq",
    "prematch": "rematch",
    "dec": "late", "wk14": "late", "finale": "late",
    "round": "playoff",
    "tz": "travel", "early": "travel", "intl": "travel",
    "roof": "venue", "surface": "venue",
    "oppqbchange": "qbchange",
}
FD_KINDS = {"fd", "big", "three", "ml"}
OPP_LIKE = {"opp", "oppcoach", "former"}            # name this opponent (or its coach)
OPPONENT_KINDS = {"div", "xconf", "rematch", "prematch", "oppwin", "oppplayoff", "oppdef", "oppleader", "oppqbchange"}
TOTALS_ONLY = {"tot"}
LONG_OK = {"opp", "oppcoach", "thanks", "xmas"}      # the long team window is for rivalry and holiday angles only
GUARD_WORDS = {"against", "with", "after", "on"}    # two phrases never start the same way ("on the road" excepted)
# In the over/under shape these fold into the lead: "the under is 9-2 in Steelers division games"
GROUPS = {"in division games": "division games", "in international games": "international games", "in the playoffs": "playoff games",
          "in conference title games": "conference title games"}


def family(kind: str) -> str:
    return FAMILY.get(kind, kind)


@dataclass
class Row:
    """One finished game from one team's side."""
    season: int
    week: int
    gameday: str
    team: str
    opp: str
    home: bool
    line: float          # the team's spread: negative = favorite
    ats: int             # 1 cover, -1 miss, 0 push
    ou: int              # 1 over, -1 under, 0 push
    coach: str
    qb: str
    div: bool
    prime: bool
    thanksgiving: bool
    rest: int
    prev: str            # result of the team's previous game this season: "W", "L", "T" or ""
    res: str             # this game's result for the team: "W", "L" or "T"
    # D-118 (see game_context); None means the file doesn't say
    gtype: str = "REG"
    weekday: str = ""
    gametime: str = ""
    total_line: float | None = None
    ml: float | None = None
    opp_coach: str = ""
    opp_rest: int = 7
    opp_conf: str = ""
    streak: int = 0
    prev_margin: float | None = None
    prev_ot: bool = False
    prev_upset: bool = False
    opp_over: int = 0
    opp_playoff: bool = False
    opp_top_d: bool = False
    opp_leader: bool = False
    rematch_lost: bool = False
    prematch: bool = False
    finale: bool = False
    intl: bool = False
    site_tz: str | None = None
    indoor: bool | None = None
    surface: str | None = None
    qb_change: bool | None = None
    opp_qb_change: bool | None = None
    former: bool = False


def franchise(t: str) -> str:
    return FRANCHISE.get(t, t)


def is_prime(r: dict) -> bool:
    return r["weekday"] in ("Monday", "Thursday") or (r["gametime"] or "00:00") >= "19:00"


def is_thanksgiving(r: dict) -> bool:
    return r["weekday"] == "Thursday" and r["gameday"][5:7] == "11" and 22 <= int(r["gameday"][8:10]) <= 28


def night(weekday: str, gametime: str, day: str) -> bool | None:
    """Kickoff at 7 PM ET or later on this weekday. Every Monday game of 1999 and 2000 was Monday Night Football,
    though the file has no time (1999) or 09:00 (2000) for them."""
    if weekday != day:
        return False
    if day == "Monday" and gametime in ("", "09:00"):
        return True
    return None if not gametime else gametime >= "19:00"


def conference(team: str, season: int) -> str:
    return "AFC" if team in AFC or (team == "SEA" and season < 2002) else "NFC"


def norm_surface(s: str) -> str | None:
    s = s.strip().lower()
    return None if not s else ("grass" if s in ("grass", "dessograss") else "turf")


@dataclass
class Played:
    gameday: str
    res: str
    margin: float
    ot: bool
    line: float | None
    pa: float
    qb: str = ""


class Context:
    """What the file knows going into each game: standings, last week's game, sites and surfaces."""

    def __init__(self, games: list[dict]):
        played = [r for r in games if r["result"] != ""]
        tenant = defaultdict(Counter)
        for r in games:
            if r["location"] == "Home":
                tenant[r["stadium_id"]][r["home_team"]] += 1
        self.tenant = {s: c.most_common(1)[0][0] for s, c in tenant.items()}
        # divisions per season, from the file's division-game flags
        parent: dict = {}

        def find(x):
            while parent.setdefault(x, x) != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for r in games:
            if r["div_game"] == "1":
                s = int(r["season"])
                parent[find((s, franchise(r["home_team"])))] = find((s, franchise(r["away_team"])))
        groups = defaultdict(set)
        for x in list(parent):
            groups[find(x)].add(x[1])
        self.division = {x: frozenset(groups[find(x)]) for x in parent}
        self.playoff_teams, self.playoff_pairs = defaultdict(set), defaultdict(set)
        self.lastreg, self.first_unplayed, self.coach_first = {}, {}, {}
        self.games_of: dict[tuple[str, int], list[dict]] = defaultdict(list)
        latest = max((r["gameday"] for r in played), default="")
        for r in games:
            s = int(r["season"])
            for side in ("home", "away"):
                t = franchise(r[f"{side}_team"])
                self.games_of[(t, s)].append(r)
                if r["game_type"] == "REG":
                    self.lastreg[(t, s)] = max(self.lastreg.get((t, s), ""), r["gameday"])
                if r["result"] == "" and r["gameday"] >= latest:   # a canceled game in the past never gets a result
                    self.first_unplayed.setdefault((t, s), r["gameday"])
                coach = r[f"{side}_coach"]
                if coach:
                    self.coach_first[(coach, t)] = min(self.coach_first.get((coach, t), s), s)
            if r["game_type"] != "REG" and r["result"] != "":
                pair = frozenset((franchise(r["home_team"]), franchise(r["away_team"])))
                self.playoff_teams[s] |= pair
                self.playoff_pairs[s].add(pair)
        # surfaces: blanks take the surface every other game at that stadium that season was played on;
        # when the played games there disagree, nothing there that season counts (a list can't be checked)
        self.surfaces = defaultdict(Counter)
        for r in played:
            v = norm_surface(r["surface"])
            if v and r["stadium_id"] not in TURF_STADIUMS:
                self.surfaces[(r["season"], r["stadium_id"])][v] += 1
        # the static conference list, checked against the file
        self.conf_ok = all(conference(r["home_team"], int(r["season"])) == conference(r["away_team"], int(r["season"]))
                           for r in played if r["div_game"] == "1" or r["game_type"] == "CON")
        if not self.conf_ok:
            print("warning: the conference list doesn't match the file; no conference angles", file=sys.stderr)
        self.tl: dict[tuple[str, int], list[Played]] = defaultdict(list)
        self.meet: dict[tuple[str, str, int], list[tuple[str, str]]] = defaultdict(list)
        self._rank: dict[tuple[int, str], dict[str, int]] = {}

    def record(self, r: dict) -> None:
        """Add a finished game to the standings."""
        s, res = int(r["season"]), float(r["result"])
        spread = float(r["spread_line"]) if r["spread_line"] else None
        for side, other in (("home", "away"), ("away", "home")):
            t, o = franchise(r[f"{side}_team"]), franchise(r[f"{other}_team"])
            margin = res if side == "home" else -res
            line = (-spread if side == "home" else spread) if spread is not None else None
            outcome = "W" if margin > 0 else ("L" if margin < 0 else "T")
            pa = float(r[f"{other}_score"] or 0)
            self.tl[(t, s)].append(Played(r["gameday"], outcome, margin, r["overtime"] == "1", line, pa, r[f"{side}_qb_name"]))
            self.meet[(t, o, s)].append((r["gameday"], outcome))

    def before(self, team: str, season: int, day: str) -> list[Played]:
        return [p for p in self.tl.get((team, season), []) if p.gameday < day]

    def usual_qbs(self, team: str, season: int, day: str) -> set[str] | None:
        """The team's usual starting QBs going into this day: its Week 1 starter, and whoever has the most starts this
        season (at least 3; a tie keeps both). So a QB who took the job (Penix) and a starter back from injury
        (Darnold, after Lock's 6 starts) both count as usual. None before the team's fourth game."""
        tl = [p for p in self.before(team, season, day) if p.qb]
        if len(tl) < 3:
            return None
        starts = Counter(p.qb for p in tl)
        most = max(starts.values())
        return {tl[0].qb} | ({q for q, n in starts.items() if n == most} if most >= 3 else set())

    def fresh(self, team: str, season: int, day: str) -> bool:
        """No game of this team before this one is still to be played (so last week's result is final)."""
        nxt = self.first_unplayed.get((team, season))
        return nxt is None or day <= nxt

    def def_rank(self, season: int, day: str) -> dict[str, int]:
        """Scoring-defense rank (points allowed a game, 1 = fewest) of each team going into this day."""
        key = (season, day)
        if key not in self._rank:
            ppg = {}
            for (t, s), lst in self.tl.items():
                if s == season:
                    b = [p for p in lst if p.gameday < day]
                    if len(b) >= DEF_GAMES:
                        ppg[t] = sum(p.pa for p in b) / len(b)
            self._rank[key] = {t: 1 + sum(1 for v in ppg.values() if v < x) for t, x in ppg.items()}
        return self._rank[key]

    def surface(self, r: dict) -> str | None:
        if r["stadium_id"] in TURF_STADIUMS or "Tottenham" in r["stadium"]:
            return "turf"
        known = self.surfaces.get((r["season"], r["stadium_id"]), Counter())
        if len(known) > 1:
            return None
        listed = norm_surface(r["surface"])
        if r["result"] == "":
            # an upcoming game's listing has to agree with the games already played there this season
            return None if (known and listed and listed not in known) else (listed or (next(iter(known)) if known else None))
        return listed or (next(iter(known)) if sum(known.values()) >= 2 else None)

    def home_setting(self, team: str, season: int) -> tuple[bool | None, str | None]:
        """The team's usual roof (indoors?) and surface: what most of its home games this season were played in."""
        roofs, surfs = Counter(), Counter()
        for r in self.games_of.get((team, season), []):
            if r["location"] == "Home" and franchise(r["home_team"]) == team and r["result"] != "":
                ind = {"dome": True, "closed": True, "outdoors": False, "open": False}.get(r["roof"])
                if ind is not None:
                    roofs[ind] += 1
                sf = self.surface(r)
                if sf:
                    surfs[sf] += 1
        top = lambda c: c.most_common(1)[0][0] if c and (len(c) == 1 or c.most_common(2)[0][1] > c.most_common(2)[1][1]) else None
        return top(roofs), top(surfs)


def situation(ctx: Context, team: str, season: int, day: str) -> dict:
    """Where a team stands going into a game, from its games so far this season."""
    tl = ctx.before(team, season, day)
    streak = 0
    for p in reversed(tl):
        if p.res not in ("W", "L"):
            break
        step = 1 if p.res == "W" else -1
        if streak and (streak > 0) != (step > 0):
            break
        streak += step
    last = tl[-1] if tl else None
    w, l, t = (sum(1 for p in tl if p.res == x) for x in "WLT")
    return {"prev": last.res if last else "", "streak": streak, "margin": last.margin if last else None,
            "ot": bool(last and last.ot), "upset": bool(last and last.res == "L" and last.line is not None and last.line <= -3),
            "w": w, "l": l, "t": t, "n": len(tl)}


def qb_change(ctx: Context, qb: str, team: str, season: int, day: str) -> bool | None:
    """This game's starter is neither the team's Week 1 starter nor its starter with the most starts (None when the
    file has no starter; False before the team's fourth game)."""
    if not qb:
        return None
    usual = ctx.usual_qbs(team, season, day)
    return usual is not None and qb not in usual


def game_context(r: dict, side: str, ctx: Context) -> dict:
    """D-118: the facts about a game from one team's side that the new conditions test. The same function
    describes past games (for the records) and tonight's game (for which conditions are true)."""
    other = "away" if side == "home" else "home"
    raw, oraw = r[f"{side}_team"], r[f"{other}_team"]
    team, opp = franchise(raw), franchise(oraw)
    season, day, reg = int(r["season"]), r["gameday"], r["game_type"] == "REG"
    me, them = situation(ctx, team, season, day), situation(ctx, opp, season, day)
    pct = lambda s: (s["w"] + 0.5 * s["t"]) / s["n"] if s["n"] else 0.0
    mates = ctx.division.get((season, opp), frozenset()) - {opp}
    leader = them["n"] >= OPP_GAMES and bool(mates) and all(pct(them) > pct(situation(ctx, m, season, day)) for m in mates)
    meetings = [res for d, res in ctx.meet.get((team, opp, season), []) if d < day]
    intl = r["stadium_id"] in INTL_STADIUMS or "Tottenham" in r["stadium"] or (r["location"] == "Neutral" and r["stadium_id"] not in ctx.tenant)
    tenant = ctx.tenant.get(r["stadium_id"])
    qb, oqb = r[f"{side}_qb_name"], r[f"{other}_qb_name"]
    coach = r[f"{side}_coach"]
    first = ctx.coach_first.get((coach, opp)) if coach else None
    ml = r[f"{side}_moneyline"]
    return dict(
        gtype=r["game_type"], weekday=r["weekday"], gametime=r["gametime"],
        total_line=float(r["total_line"]) if r["total_line"] else None, ml=float(ml) if ml else None,
        opp_coach=r[f"{other}_coach"], opp_rest=int(r[f"{other}_rest"] or 7), opp_conf=conference(oraw, season),
        streak=me["streak"], prev_margin=me["margin"], prev_ot=me["ot"], prev_upset=me["upset"],
        opp_over=(1 if them["w"] > them["l"] else (-1 if them["l"] > them["w"] else 0)) if them["w"] + them["l"] >= OPP_GAMES else 0,
        opp_playoff=opp in ctx.playoff_teams.get(season - 1, ()),
        opp_top_d=them["n"] >= DEF_GAMES and ctx.def_rank(season, day).get(opp, 99) <= 10,
        opp_leader=leader,
        rematch_lost=r["div_game"] == "1" and meetings == ["L"],
        prematch=reg and frozenset((team, opp)) in ctx.playoff_pairs.get(season - 1, ()),
        finale=reg and ctx.lastreg.get((team, season)) == day,
        intl=intl, site_tz="INTL" if intl else TEAM_TZ.get(tenant or ""),
        indoor={"dome": True, "closed": True, "outdoors": False, "open": False}.get(r["roof"]),
        surface=ctx.surface(r),
        qb_change=qb_change(ctx, qb, team, season, day),
        opp_qb_change=qb_change(ctx, oqb, opp, season, day),
        former=first is not None and first < season,
    )


def load(path: str):
    games = list(csv.DictReader(open(path)))
    games.sort(key=lambda r: (r["gameday"], r["gametime"] or ""))
    ctx = Context(games)
    rows: list[Row] = []
    for r in games:
        if r["game_type"] not in ("REG", "WC", "DIV", "CON", "SB"):
            continue
        done = r["result"] != "" and r["spread_line"] != ""
        if done:
            spread = float(r["spread_line"])          # home favored by this much
            result = float(r["result"])               # home score minus away score
            for side in ("home", "away"):
                team, opp = franchise(r[f"{side}_team"]), franchise(r["away_team" if side == "home" else "home_team"])
                margin = (result - spread) if side == "home" else (spread - result)
                total = float(r["total"]) - float(r["total_line"]) if r["total_line"] else 0.0
                c = game_context(r, side, ctx)
                rows.append(Row(
                    season=int(r["season"]), week=int(r["week"]), gameday=r["gameday"], team=team, opp=opp,
                    home=side == "home", line=-spread if side == "home" else spread,
                    ats=(margin > 0) - (margin < 0), ou=(total > 0) - (total < 0) if r["total_line"] else 0,
                    coach=r[f"{side}_coach"], qb=r[f"{side}_qb_name"], div=r["div_game"] == "1",
                    prime=is_prime(r), thanksgiving=is_thanksgiving(r),
                    rest=int(r[f"{side}_rest"] or 7), prev=situation(ctx, team, int(r["season"]), r["gameday"])["prev"],
                    res="W" if (result > 0) == (side == "home") and result != 0 else ("T" if result == 0 else "L"),
                    **c,
                ))
        if r["result"] != "":
            ctx.record(r)
    return games, rows, ctx


@dataclass
class Angle:
    text: str
    supports: str        # "BUF -3" style side, or "Over 47.5" / "Under 47.5"
    market: str          # spread | total
    w: int
    l: int
    p: int
    z: float
    conds: int
    rate: float
    last_season: int
    relevance: float = 0.0   # head-to-head and holiday angles lead; prime time and division a little
    metric: str = "ats"
    sample: list = field(default_factory=list)  # (gameday, team) of every game counted, for the check pass
    kinds: frozenset = frozenset()               # the conditions used, for the slate's variety (D-115)

    @property
    def families(self) -> frozenset:
        return frozenset(family(k) for k in self.kinds) or frozenset({"season"})

    @property
    def record(self) -> str:
        return f"{self.w}-{self.l}" + (f"-{self.p}" if self.p else "")

    @property
    def score(self) -> float:
        return abs(self.z) - 0.35 * (self.conds - 1) + self.relevance

    @property
    def strong(self) -> bool:
        return abs(self.z) >= MIN_Z and (self.rate >= MIN_RATE or self.rate <= 1 - MIN_RATE)


def tally(rows: list[Row], metric: str):
    w = sum(1 for r in rows if getattr(r, metric) == 1)
    l = sum(1 for r in rows if getattr(r, metric) == -1)
    p = sum(1 for r in rows if getattr(r, metric) == 0)
    return w, l, p


def zscore(w: int, l: int) -> float:
    n = w + l
    return (w - n / 2) / math.sqrt(n / 4) if n else 0.0


def continuity_start(team_rows: list[Row], season: int, coach: str, qb: str) -> int:
    """D-117 (owner, Nov 25: "consider if there's been the same factors like same coach, same key players"): the
    first season of the stretch with this head coach and this starting QB: going back, every game of a season had
    this coach and this QB started at least half of them. A season that fails stops the window after it."""
    s = season
    while True:
        prev = [r for r in team_rows if r.season == s - 1]
        if not prev or not coach or any(r.coach != coach for r in prev):
            return s
        if qb and sum(1 for r in prev if r.qb == qb) * 2 < len(prev):
            return s
        s -= 1


def possessive(name: str) -> str:
    return name + ("'" if name.endswith("s") else "'s")


def render(metric: str, kind: str, who: str, team_name: str, parts: list[str], frame: str, w: int, l: int, p: int) -> str:
    """D-117's two shapes, nothing else: "<subject> is 12-3 ATS <conditions> <time frame>" and
    "The under is 12-3 in <subject's> games <conditions> <time frame>"."""
    if metric == "ats":
        text = f"{who} {'are' if kind == 'team' else 'is'} {w}-{l}{f'-{p}' if p else ''} ATS {' '.join(parts)} {frame}"
    else:
        over = w > l
        a_, b_ = (w, l) if over else (l, w)
        lead = f"{team_name} games" if kind == "team" else f"{possessive(who)} games"
        rest = []
        for ph in parts:
            if ph in GROUPS:
                lead = lead[: -len("games")] + GROUPS[ph]
            else:
                rest.append(ph)
        text = f"The {'over' if over else 'under'} is {a_}-{b_}{f'-{p}' if p else ''} in {lead} {' '.join(rest)} {frame}"
    return " ".join(text.split())


FRAME = r"(in his career|this season|since (19|20)\d\d)"
SHAPES = (re.compile(r"^(The [A-Z0-9][A-Za-z0-9]* are|[A-Z][A-Za-z.' -]+ is) \d+-\d+(-\d+)? ATS .+ " + FRAME + "$"),
          re.compile(r"^The (over|under) is \d+-\d+(-\d+)? in .+ games\b.* " + FRAME + "$"))
BANNED = re.compile(r"[\u2013\u2014\u2212%]|points a game|\b(should|lock|bet|pick|have covered|have won|straight up)\b|^(Since|In his career|Under |Teams )", re.I)


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


def combo_ok(combo) -> bool:
    """D-115 wording guards, as in espn_angles.py: one condition per family; the opponent described once; no
    two phrases starting the same way ("on the road" pairs with anything); at most one folded group."""
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
    # "as a favorite after losing as a favorite of 3 or more" says favorite twice
    if sum(1 for _, ph, _ in combo if re.search(r"\b(favorite|underdog)\b", ph)) > 1:
        return False
    return sum(1 for _, ph, _ in combo if ph in GROUPS) <= 1


def build_angles(game: dict, rows: list[Row], season: int, ctx: Context | None = None) -> list[Angle]:
    """Every angle that holds for this game, scored. Both teams, spread and total."""
    out: list[Angle] = []
    spread = float(game["spread_line"])
    total_line = float(game["total_line"]) if game["total_line"] else None
    prime, thanks = is_prime(game), is_thanksgiving(game)
    div = game["div_game"] == "1"
    day = game["gameday"]
    reg = game["game_type"] == "REG"
    for side in ("home", "away"):
        team, opp = franchise(game[f"{side}_team"]), franchise(game["away_team" if side == "home" else "home_team"])
        line = -spread if side == "home" else spread
        fav = line < 0
        coach, qb = game[f"{side}_coach"], game[f"{side}_qb_name"]
        rest = int(game[f"{side}_rest"] or 7)
        team_rows = [r for r in rows if r.team == team]
        name = TEAM_NAMES[team]
        opp_name = TEAM_NAMES[opp]
        side_label = f"{game[f'{side}_team']} {fmt_line(line)}"
        c = game_context(game, side, ctx) if ctx else {}
        # last week's result and the opponent's record only count once the games before this one are final
        fresh_me = ctx is None or ctx.fresh(team, season, day)
        fresh_opp = ctx is None or ctx.fresh(opp, season, day)
        me = situation(ctx, team, season, day) if ctx else {"prev": ""}
        prev_res = me["prev"] if fresh_me else ""

        # Conditions that are true for this game: (kind, phrase, predicate), in the order they read in a sentence.
        # A predicate returns None when the file doesn't say for that game.
        role = "home" if side == "home" else "road"
        fd = "favorite" if fav else "underdog"
        art = "an" if fd == "underdog" else "a"
        conds = [
            ("role", "at home" if side == "home" else "on the road", lambda r, h=(side == "home"): r.home == h),
            ("fd", f"as {art} {fd}", lambda r, f=fav: (r.line < 0) == f),
        ]
        if abs(line) >= 7:
            conds.append(("big", f"as {art} {fd} of 7 or more", lambda r, f=fav: (r.line <= -7) if f else (r.line >= 7)))
        if abs(line) == 3:
            conds.append(("three", f"as a 3-point {fd}", lambda r, x=line: r.line == x))
        if c and not fav and c["ml"] is not None and c["ml"] >= 200:
            conds.append(("ml", "as an underdog of +200 or more", lambda r: None if r.ml is None else r.ml >= 200))
        conds.append(("opp", f"against the {opp_name}", lambda r, o=opp: r.opp == o))
        if c and c["opp_coach"]:
            conds.append(("oppcoach", f"against {possessive(c['opp_coach'])} teams", lambda r, x=c["opp_coach"]: r.opp_coach == x))
        if c and c["former"]:
            n_former = sum(1 for (ch, t), s in ctx.coach_first.items() if ch == coach and s < season and t != team)
            conds.append(("former", f"against his former team{'s' if n_former > 1 else ''}", lambda r: r.former))
        if div:
            conds.append(("div", "in division games", lambda r: r.div))
        if c and ctx.conf_ok and c["opp_conf"] != conference(game[f"{side}_team"], season):
            conds.append(("xconf", f"against {c['opp_conf']} teams", lambda r, x=c["opp_conf"]: r.opp_conf == x))
        if c and c["rematch_lost"]:
            conds.append(("rematch", "against division rivals that won the first meeting", lambda r: r.rematch_lost))
        if c and c["prematch"]:
            conds.append(("prematch", "against last season's playoff opponents", lambda r: r.prematch))
        if prime:
            conds.append(("prime", "in prime time", lambda r: r.prime))
        for kind, wd in (("mnf", "Monday"), ("tnf", "Thursday"), ("snf", "Sunday")):
            if night(game["weekday"], game["gametime"], wd) and (wd != "Sunday" or reg):
                conds.append((kind, f"on {wd} night", lambda r, wd=wd: (night(r.weekday, r.gametime, wd) and (wd != "Sunday" or r.gtype == "REG"))
                              if r.weekday == wd else False))
        if thanks:
            conds.append(("thanks", "on Thanksgiving", lambda r: r.thanksgiving))
        if day[5:] == "12-25":
            conds.append(("xmas", "on Christmas", lambda r: r.gameday[5:] == "12-25"))
        if not reg:
            conds.append(("playoff", "in the playoffs", lambda r: r.gtype != "REG"))
            conds.append(("round", ROUNDS[game["game_type"]], lambda r, x=game["game_type"]: r.gtype == x))
        if day[5:7] == "12":
            conds.append(("dec", "in December", lambda r: r.gameday[5:7] == "12"))
        if reg and int(game["week"]) >= 14:
            conds.append(("wk14", "from Week 14 on", lambda r: r.gtype == "REG" and r.week >= 14))
        if c and c["finale"]:
            conds.append(("finale", "in the regular-season finale", lambda r: r.finale))
        if c:
            home_tz = TEAM_TZ.get(game[f"{side}_team"])
            if c["intl"]:
                conds.append(("intl", "in international games", lambda r: r.intl))
            if home_tz == "ET" and c["site_tz"] == "PT":
                conds.append(("tz", "in the Pacific time zone", lambda r: None if r.site_tz is None else r.site_tz == "PT"))
            if home_tz == "PT" and game["gametime"] == "13:00":
                conds.append(("early", "with a 1 PM ET kickoff", lambda r: None if not r.gametime else r.gametime == "13:00"))
            usual_roof, usual_surface = ctx.home_setting(team, season)
            if c["indoor"] is not None and usual_roof is not None and c["indoor"] != usual_roof:
                conds.append(("roof", "indoors" if c["indoor"] else "outdoors", lambda r, x=c["indoor"]: None if r.indoor is None else r.indoor == x))
            if c["surface"] and usual_surface and c["surface"] != usual_surface:
                conds.append(("surface", f"on {c['surface']}", lambda r, x=c["surface"]: None if r.surface is None else r.surface == x))
        if rest >= 13:
            conds.append(("rest", "off a bye", lambda r: r.rest >= 13))
        if rest <= 5:
            conds.append(("rest", "on a short week", lambda r: r.rest <= 5))
        if c and rest - c["opp_rest"] >= 3:
            conds.append(("restadv", "with a rest edge of 3 or more days", lambda r: r.rest - r.opp_rest >= 3))
        elif c and rest - c["opp_rest"] <= -3:
            conds.append(("restadv", "with a rest deficit of 3 or more days", lambda r: r.rest - r.opp_rest <= -3))
        if c and c["qb_change"]:
            conds.append(("qbchange", "without their usual starting QB", lambda r: r.qb_change))
        if c and c["opp_qb_change"]:
            conds.append(("oppqbchange", "against teams without their usual starting QB", lambda r: r.opp_qb_change))
        if c and fresh_opp:
            if c["opp_over"]:
                conds.append(("oppwin", "against teams over .500" if c["opp_over"] > 0 else "against teams under .500",
                              lambda r, o=c["opp_over"]: r.opp_over == o))
            if c["opp_leader"]:
                conds.append(("oppleader", "against division leaders", lambda r: r.opp_leader))
            if c["opp_top_d"]:
                conds.append(("oppdef", "against Top-10 scoring defenses", lambda r: r.opp_top_d))
        if c and c["opp_playoff"]:
            conds.append(("oppplayoff", "against last season's playoff teams", lambda r: r.opp_playoff))
        if total_line is not None and total_line >= 50:
            conds.append(("tot", "with a total of 50 or more", lambda r: r.total_line is not None and r.total_line >= 50))
        elif total_line is not None and total_line < 40:
            conds.append(("tot", "with a total under 40", lambda r: r.total_line is not None and r.total_line < 40))
        if prev_res in ("W", "L"):
            conds.append(("prev", "after a loss" if prev_res == "L" else "after a win", lambda r, pr=prev_res: r.prev == pr))
        if c and fresh_me:
            if me["margin"] is not None and abs(me["margin"]) >= 17:
                won = me["margin"] > 0
                conds.append(("blowout", f"after {'winning' if won else 'losing'} by 17 or more",
                              lambda r, won=won: r.prev_margin is not None and (r.prev_margin >= 17 if won else r.prev_margin <= -17)))
            if me["upset"]:
                conds.append(("upset", "after losing as a favorite of 3 or more", lambda r: r.prev_upset))
            if me["ot"]:
                conds.append(("ot", "after an overtime game", lambda r: r.prev_ot))
            if me["streak"] >= 4:
                conds.append(("streak", "after four or more straight wins", lambda r: r.streak >= 4))
            elif me["streak"] <= -3:
                conds.append(("streak", "after three or more straight losses", lambda r: r.streak <= -3))

        def phrase_for(combo) -> list[str]:
            kinds = {k for k, _, _ in combo}
            size = kinds & FD_KINDS
            parts = []
            if "role" in kinds and size:
                k = next(iter(size))
                parts.append({"fd": f"as a {role} {fd}", "big": f"as a {role} {fd} of 7 or more",
                              "three": f"as a 3-point {role} {fd}", "ml": f"as a {role} underdog of +200 or more"}[k])
            for k, ph, _ in combo:
                if parts and (k == "role" or k in FD_KINDS):
                    continue
                parts.append(ph)
            return parts

        # Subjects: who the record belongs to, with its time frame
        subjects = []
        if qb:
            subjects.append(("qb", qb, [r for r in rows if r.qb == qb], "in his career"))
        if coach:
            crow = [r for r in rows if r.coach == coach]
            if crow:
                first = min(r.season for r in crow)
                subjects.append(("coach", coach, crow, "this season" if first == season else f"since {first}"))
        # D-117: a team's multi-season record only covers the stretch with the same head coach and starting QB
        stable = continuity_start(team_rows, season, coach, qb)
        recent, long_ = max(season - 2, stable), max(2010, stable)
        recent_frame, long_frame = f"since {recent}", f"since {long_}"
        if recent < season:
            subjects.append(("team", f"The {name}", [r for r in team_rows if r.season >= recent], recent_frame))
        subjects.append(("team", f"The {name}", [r for r in team_rows if r.season == season], "this season"))
        if long_ < recent:
            subjects.append(("team", f"The {name}", [r for r in team_rows if r.season >= long_], long_frame))

        combos = [(c_,) for c_ in conds] + [(a, b) for i, a in enumerate(conds) for b in conds[i + 1:]]
        combos = [cb for cb in combos if combo_ok(cb)]
        for kind, who, srows, frame in subjects:
            # bitmasks over the subject's games: each condition (true, unknown) and each outcome
            masks = {}
            full = (1 << len(srows)) - 1
            outcome = {(m, x): sum(1 << i for i, r in enumerate(srows) if getattr(r, m) == x) for m in ("ats", "ou") for x in (1, -1, 0)}
            recent_mask = sum(1 << i for i, r in enumerate(srows) if r.season >= season - (RECENT_SEASONS - 1))
            for combo in combos:
                kinds = {k for k, _, _ in combo}
                if kind == "team" and frame.startswith("since") and frame != recent_frame and not kinds & LONG_OK:
                    continue  # long team windows only for rivalry and holiday angles
                if ("former" in kinds and kind != "coach") or ("qbchange" in kinds and kind == "qb"):
                    continue  # "against his former teams" is the coach's; a QB is never without himself
                ms = []
                for k, ph, pred in combo:
                    if (k, ph) not in masks:
                        masks[(k, ph)] = cond_masks(srows, pred)
                    ms.append(masks[(k, ph)])
                sel = full
                for t_, _ in ms:
                    sel &= t_
                if sel.bit_count() < MIN_GAMES:
                    continue
                # D-118: every game the record could count has to be known for each condition, and no
                # condition may be true for nearly every game it's paired with (or every game of the window)
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
                if kind == "coach":   # "Mike McCarthy is 12-4 ATS without his usual starting QB"
                    parts = [ph.replace("without their usual", "without his usual") if ph.startswith("without") else ph for ph in parts]
                relevance = (0.5 * bool(kinds & {"opp", "oppcoach", "former", "thanks", "xmas"}) + 0.3 * bool(kinds & {"playoff", "round"})
                             + 0.2 * bool(kinds & {"prime", "mnf", "snf", "tnf"}) + 0.1 * ("div" in kinds)
                             - 0.3 * bool(kinds & {"dec", "wk14"}))   # the month is a weak reason on its own (D-115)
                for metric in ("ats", "ou"):
                    if metric == "ou" and total_line is None:
                        continue
                    if metric == "ats" and kinds & TOTALS_ONLY:
                        continue
                    w, l, p = ((sel & outcome[(metric, x)]).bit_count() for x in (1, -1, 0))
                    n = w + l
                    if n < MIN_GAMES:
                        continue
                    rate = w / n
                    if FLOOR_RATE > rate > 1 - FLOOR_RATE:
                        continue
                    z = zscore(w, l)
                    if abs(z) < FLOOR_Z:
                        continue
                    if not sel & recent_mask:
                        continue
                    sample = [srows[i] for i in range(len(srows)) if sel >> i & 1]
                    last = max(r.season for r in sample)
                    text = render(metric, kind, who, name, parts, frame, w, l, p)
                    if not short_enough(text):
                        continue
                    if metric == "ats":
                        supports = side_label if rate > 0.5 else f"{game['away_team' if side == 'home' else 'home_team']} {fmt_line(-line)}"
                    else:
                        supports = f"{'Over' if rate > 0.5 else 'Under'} {total_line:g}"
                    out.append(Angle(text=text, supports=supports, market="spread" if metric == "ats" else "total",
                                     w=w, l=l, p=p, z=z, conds=len(combo), rate=rate, last_season=last,
                                     relevance=relevance, metric=metric, kinds=frozenset(kinds),
                                     sample=[(r.gameday, r.team) for r in sample]))
    return out


def fmt_line(x: float) -> str:
    return "PK" if x == 0 else (f"+{x:g}" if x > 0 else f"{x:g}")


def raw_index(raw: list[dict]) -> dict:
    idx = {}
    for r in raw:
        for side in ("home", "away"):
            idx[(r["gameday"], franchise(r[f"{side}_team"]))] = (r, side)
    return idx


def verify(angle: Angle, idx: dict) -> bool:
    """The check pass: recompute the record from the raw CSV rows (raw_index), independently of Row."""
    w = l = p = 0
    for gameday, team in angle.sample:
        r, side = idx[(gameday, team)]
        if angle.metric == "ats":
            m = float(r["result"]) - float(r["spread_line"])
            m = m if side == "home" else -m
        else:
            m = float(r["total"]) - float(r["total_line"])
        w, l, p = w + (m > 0), l + (m < 0), p + (m == 0)
    return (w, l, p) == (angle.w, angle.l, angle.p)


def season_fallback(game: dict, rows: list[Row], season: int) -> Angle | None:
    """When a game has no qualifying angle: the team whose ATS record this season is furthest from even."""
    best = None
    spread = float(game["spread_line"])
    for side in ("home", "away"):
        team = franchise(game[f"{side}_team"])
        sel = [r for r in rows if r.team == team and r.season == season]
        w, l, p = tally(sel, "ats")
        if w + l == 0:
            continue
        line = -spread if side == "home" else spread
        z = zscore(w, l)
        supports = f"{game[f'{side}_team']} {fmt_line(line)}" if w >= l else f"{game['away_team' if side == 'home' else 'home_team']} {fmt_line(-line)}"
        a = Angle(text=f"The {TEAM_NAMES[team]} are {w}-{l}{f'-{p}' if p else ''} ATS this season", supports=supports, market="spread",
                  w=w, l=l, p=p, z=z, conds=1, rate=w / (w + l), last_season=season, metric="ats",
                  sample=[(r.gameday, r.team) for r in sel])
        if best is None or abs(a.z) > abs(best.z):
            best = a
    return best


def pick_slate(week: list[dict], found: dict[str, list[Angle]], ok=lambda a: True) -> dict[str, Angle]:
    """D-115: one line per game, picked per game day so no condition family (favorite or underdog, after a win
    or loss, home or road...) shows on more than 2 games. Games with the fewest kinds of angle choose first; a game
    whose every angle is over the limit takes the one whose families are least used. `ok` is the check pass."""
    by_day = defaultdict(list)
    for g in week:
        if found[g["game_id"]]:
            by_day[g["gameday"]].append(g)
    picked = {}
    for day_games in by_day.values():
        used = Counter()
        options = {g["game_id"]: len({f for a in found[g["game_id"]][:40] for f in a.families}) for g in day_games}
        for g in sorted(day_games, key=lambda g: (options[g["game_id"]], -found[g["game_id"]][0].strong, -found[g["game_id"]][0].score)):
            angles = found[g["game_id"]]
            best = next((a for a in angles if all(used[f] < 2 for f in a.families) and ok(a)), None)
            if best is None:
                over = [a for a in angles[:40] if ok(a)]
                best = min(over, key=lambda a: (max(used[f] for f in a.families), -a.strong, -a.score), default=None)
            if best:
                used.update(best.families)
                picked[g["game_id"]] = best
    return picked


def self_test(games_path: str = "") -> None:
    """Both sentence shapes for a few phrases, the wording guards, and (with --games) every candidate sentence
    for the coming week through the shape check."""
    cases = [
        (("ats", "team", "The Bills", "Bills", ["in December"], "since 2021", 21, 9, 0), "The Bills are 21-9 ATS in December since 2021"),
        (("ou", "team", "The Bills", "Bills", ["in December"], "since 2021", 9, 21, 0), "The under is 21-9 in Bills games in December since 2021"),
        (("ats", "qb", "Josh Allen", "Bills", ["on Monday night"], "in his career", 9, 2, 0), "Josh Allen is 9-2 ATS on Monday night in his career"),
        (("ou", "qb", "Josh Allen", "Bills", ["on Monday night"], "in his career", 9, 2, 0), "The over is 9-2 in Josh Allen's games on Monday night in his career"),
        (("ats", "coach", "Todd Bowles", "Buccaneers", ["in division games", "after a loss"], "since 2015", 3, 11, 1), "Todd Bowles is 3-11-1 ATS in division games after a loss since 2015"),
        (("ou", "coach", "Todd Bowles", "Buccaneers", ["after a loss", "in division games"], "since 2015", 3, 11, 1), "The under is 11-3-1 in Todd Bowles' division games after a loss since 2015"),
        (("ats", "team", "The Jaguars", "Jaguars", ["in international games"], "since 2021", 5, 2, 0), "The Jaguars are 5-2 ATS in international games since 2021"),
        (("ou", "team", "The Jaguars", "Jaguars", ["in international games"], "since 2021", 5, 2, 0), "The over is 5-2 in Jaguars international games since 2021"),
        (("ou", "coach", "Andy Reid", "Chiefs", ["in the playoffs"], "since 1999", 12, 20, 0), "The under is 20-12 in Andy Reid's playoff games since 1999"),
        (("ats", "team", "The Seahawks", "Seahawks", ["on the road", "with a 1 PM ET kickoff"], "since 2025", 3, 9, 0), "The Seahawks are 3-9 ATS on the road with a 1 PM ET kickoff since 2025"),
        (("ou", "team", "The Dolphins", "Dolphins", ["in the Pacific time zone"], "since 2024", 1, 10, 0), "The under is 10-1 in Dolphins games in the Pacific time zone since 2024"),
        (("ats", "team", "The 49ers", "49ers", ["with a rest edge of 3 or more days"], "since 2023", 9, 2, 0), "The 49ers are 9-2 ATS with a rest edge of 3 or more days since 2023"),
        (("ou", "team", "The Bengals", "Bengals", ["with a total of 50 or more"], "since 2024", 3, 9, 0), "The under is 9-3 in Bengals games with a total of 50 or more since 2024"),
        (("ats", "qb", "Jared Goff", "Lions", ["against Kevin O'Connell's teams"], "in his career", 6, 1, 0), "Jared Goff is 6-1 ATS against Kevin O'Connell's teams in his career"),
        (("ou", "team", "The Giants", "Giants", ["against division leaders"], "since 2024", 11, 3, 0), "The over is 11-3 in Giants games against division leaders since 2024"),
        (("ats", "coach", "Mike McCarthy", "Steelers", ["without his usual starting QB"], "since 2006", 12, 4, 0), "Mike McCarthy is 12-4 ATS without his usual starting QB since 2006"),
        (("ats", "team", "The Lions", "Lions", ["after losing as a favorite of 3 or more"], "since 2021", 8, 1, 0), "The Lions are 8-1 ATS after losing as a favorite of 3 or more since 2021"),
        (("ou", "team", "The Packers", "Packers", ["on the road", "on grass"], "since 2024", 10, 2, 0), "The over is 10-2 in Packers games on the road on grass since 2024"),
        (("ou", "coach", "Andy Reid", "Chiefs", ["at home", "in conference title games"], "since 1999", 2, 5, 0), "The under is 5-2 in Andy Reid's conference title games at home since 1999"),
        (("ats", "coach", "Andy Reid", "Chiefs", ["in the Divisional round", "off a bye"], "since 1999", 9, 3, 0), "Andy Reid is 9-3 ATS in the Divisional round off a bye since 1999"),
        (("ats", "coach", "Sean Payton", "Broncos", ["against his former team"], "since 2006", 3, 0, 0), "Sean Payton is 3-0 ATS against his former team since 2006"),
    ]
    for args, want in cases:
        got = render(*args)
        assert got == want, (got, want)
        assert sentence_ok(got), got
    for bad in ("Since 2021, the Lions are 13-4 ATS after a loss", "The Packers have covered 6 straight on Monday night",
                "Andy Reid's teams are 76% ATS off a bye since 1999", "Teams facing the Ravens are 1-8 ATS since 2021",
                "The Cowboys are 14-6 ATS at home and 6-14 ATS on the road since 2021", "The Bills are 9-2 ATS in December \u2013 since 2021",
                "Steelers division games have stayed under in 9 of the last 11"):
        assert not sentence_ok(bad), bad
    p = lambda r: True
    assert not combo_ok((("prev", "after a loss", p), ("blowout", "after losing by 17 or more", p)))      # one family
    assert not combo_ok((("opp", "against the Bears", p), ("oppwin", "against teams over .500", p)))      # opponent twice
    assert not combo_ok((("oppcoach", "against Ben Johnson's teams", p), ("div", "in division games", p)))
    assert not combo_ok((("xconf", "against AFC teams", p), ("oppleader", "against division leaders", p)))  # "against ... against"
    assert not combo_ok((("tnf", "on Thursday night", p), ("thanks", "on Thanksgiving", p)))              # "on ... on"
    assert not combo_ok((("tot", "with a total of 50 or more", p), ("restadv", "with a rest edge of 3 or more days", p)))
    assert not combo_ok((("fd", "as a favorite", p), ("upset", "after losing as a favorite of 3 or more", p)))  # favorite twice
    assert combo_ok((("role", "on the road", p), ("mnf", "on Monday night", p)))
    assert combo_ok((("div", "in division games", p), ("prev", "after a loss", p)))
    assert possessive("Todd Bowles") == "Todd Bowles'" and possessive("Andy Reid") == "Andy Reid's"
    assert not short_enough("The over is 11-0-1 in Matthew Stafford's games against teams over .500 after winning by 17 or more in his career")
    assert short_enough("The Bills are 21-9 ATS in December since 2021")
    assert night("Monday", "09:00", "Monday") and night("Thursday", "12:30", "Thursday") is False and night("Sunday", "", "Sunday") is None
    print(f"self-test: {len(cases)} sentences in both shapes and the wording guards pass")
    if games_path:
        games, rows, ctx = load(games_path)
        today = datetime.now(ET).date()
        week = [g for g in games if g["result"] == "" and g["spread_line"] and g["gameday"]
                and today <= date.fromisoformat(g["gameday"]) <= today + timedelta(days=8)]
        idx, n, bad = raw_index(games), 0, []
        for g in week:
            for a in build_angles(g, rows, int(g["season"]), ctx):
                n += 1
                if not sentence_ok(a.text) or not short_enough(a.text):
                    bad.append(a.text)
                assert verify(a, idx), a.text
        assert not bad, bad[:10]
        print(f"self-test: {n} candidate sentences for {len(week)} games match the shapes and recompute from the file")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", default="")
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--week", type=int, default=0, help="default: every unplayed game in the next 8 days")
    ap.add_argument("--json", default="")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test(args.games)
        return
    if not args.games:
        ap.error("--games is required")
    games, rows, ctx = load(args.games)
    if args.week:
        week = [g for g in games if int(g["season"]) == args.season and int(g["week"]) == args.week and g["result"] == "" and g["spread_line"]]
    else:
        today = datetime.now(ET).date()
        week = [g for g in games if g["result"] == "" and g["spread_line"] and g["gameday"]
                and today <= date.fromisoformat(g["gameday"]) <= today + timedelta(days=8)]
    idx = raw_index(games)
    checked: dict[int, bool] = {}

    def ok(a: Angle) -> bool:   # nothing unverified moves up
        if id(a) not in checked:
            checked[id(a)] = verify(a, idx) and sentence_ok(a.text)
        return checked[id(a)]

    results = []
    found = {}
    for g in week:
        found[g["game_id"]] = sorted(build_angles(g, rows, args.season, ctx), key=lambda a: (a.strong, a.score), reverse=True)
    picked = pick_slate(week, found, ok)
    for g in week:
        angles = [a for a in found[g["game_id"]][:60] if ok(a)]
        best = picked.get(g["game_id"]) or season_fallback(g, rows, args.season)
        tier = "strong" if angles and best.strong else ("fallback" if angles else "season")
        kickoff = datetime.fromisoformat(f"{g['gameday']}T{g['gametime'] or '13:00'}").replace(tzinfo=ET)
        results.append({
            "espn_event_id": g["espn"], "sport": "NFL", "starts_at": kickoff.astimezone(timezone.utc).isoformat(),
            "matchup": f"{TEAM_NAMES[franchise(g['away_team'])]} {'vs' if g['location'] == 'Neutral' else 'at'} {TEAM_NAMES[franchise(g['home_team'])]}",
            "game": f"{g['away_team']} at {g['home_team']}", "gameday": g["gameday"], "gametime": g["gametime"],
            "line": f"{g['home_team']} {fmt_line(-float(g['spread_line']))}", "total": g["total_line"],
            "best": best and {"text": best.text, "supports": best.supports, "market": best.market, "record": best.record,
                              "z": round(best.z, 2), "tier": tier, "games": best.w + best.l + best.p, "families": sorted(best.families)},
            "runners_up": [{"text": a.text, "supports": a.supports, "z": round(a.z, 2)} for a in angles if a is not best][:3],
            "candidates": len(angles),
        })
        print(f"\n{g['away_team']} at {g['home_team']} ({g['gameday']}, {g['home_team']} {fmt_line(-float(g['spread_line']))}, O/U {g['total_line']}): {len(angles)} angles, {tier}")
        if best:
            print(f"  BEST  {best.text}  ->  {best.supports}  [{', '.join(sorted(best.families))}]")
        for a in [a for a in angles if a is not best][:2]:
            print(f"  {a.score:4.2f}  {a.text}  ->  {a.supports}")
    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)


if __name__ == "__main__":
    main()
