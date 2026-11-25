"""The one line per game for college football and the NBA (DECISIONS D-075, D-078, D-115).

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

College football angles: the head coach's record (with the correct coach per season from
CollegeFootballData's coach list), the team this season, since 2024, and against this
opponent since 2016 (named rivalries read "in the Egg Bowl"; a series needs 6 meetings,
since teams meet once a year); home, road or neutral; favorite or underdog; conference
games; against ranked teams; against teams over or under .500; off a bye or on a short week;
on the road after a road game; night games; after a win or loss; streaks; double-digit spreads;
high or low totals; November; rivalry week (Thanksgiving week, for teams that meet every year).
NBA angles: the team this season and since 2024-25, against this opponent since 2022-23;
home or road; favorite or underdog; 7+ point spreads; the second night of a back-to-back,
two or more days of rest, more rest than the opponent, the third game in four nights;
against teams on a back-to-back; after a win or loss, after two or more straight losses,
after three or more straight wins; deep into a road trip, back home after one; against
teams over or under .500; division games, against the other conference; national TV;
high or low totals; the month; without a top-3 scorer who is listed out tonight (ESPN's
injury report, checked against the box scores).

Usage:
  python3 -I scripts/angles/espn_angles.py --league cfb --history data/history/cfb_espn.csv --coaches <cfbd coaches.json> --days 6
  python3 -I scripts/angles/espn_angles.py --league nba --history data/history/nba_espn.csv \
      --boxes data/history/nba_players_espn.csv --teams data/history/nba_team_games_espn.csv --days 2
"""
import argparse
import csv
import json
import math
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}
MIN_GAMES, MIN_RATE, MIN_Z = 10, 0.65, 2.0
FLOOR_RATE, FLOOR_Z = 0.62, 1.6
SERIES_MIN = 6          # college teams meet once a year: a series or rivalry-week record needs 6 games (D-115)
RECENT_SEASONS = 2
ET = timezone(timedelta(hours=-5))
NY = ZoneInfo("America/New_York")   # kickoff clock time (night games) follows daylight saving

CONF = {
    "cfb": {"path": "football/college-football", "query": "&groups=80&limit=400", "big": 10, "since": 2016, "hi": 60, "lo": 42},
    "nba": {"path": "basketball/nba", "query": "", "big": 7, "since": 2023, "hi": 238, "lo": 222},
}

# NBA divisions by ESPN abbreviation (D-115)
NBA_DIV = {
    "BOS": "Atlantic", "BKN": "Atlantic", "NY": "Atlantic", "PHI": "Atlantic", "TOR": "Atlantic",
    "CHI": "Central", "CLE": "Central", "DET": "Central", "IND": "Central", "MIL": "Central",
    "ATL": "Southeast", "CHA": "Southeast", "MIA": "Southeast", "ORL": "Southeast", "WSH": "Southeast",
    "DEN": "Northwest", "MIN": "Northwest", "OKC": "Northwest", "POR": "Northwest", "UTAH": "Northwest",
    "GS": "Pacific", "LAC": "Pacific", "LAL": "Pacific", "PHX": "Pacific", "SAC": "Pacific",
    "DAL": "Southwest", "HOU": "Southwest", "MEM": "Southwest", "NO": "Southwest", "SA": "Southwest",
}
EAST = {"Atlantic", "Central", "Southeast"}

# College rivalries with a name people use (D-115). Any other series reads "against Nebraska".
CFB_RIVALRIES = {frozenset(p): n for p, n in [
    (("MISS", "MSST"), "the Egg Bowl"), (("ALA", "AUB"), "the Iron Bowl"), (("TEX", "TA&M"), "the Lone Star Showdown"),
    (("SC", "CLEM"), "the Palmetto Bowl"), (("IOWA", "NEB"), "the Heroes Game"), (("ARIZ", "ASU"), "the Territorial Cup"),
    (("WASH", "WSU"), "the Apple Cup"), (("CAL", "STAN"), "the Big Game"), (("BYU", "UTAH"), "the Holy War"),
    (("KU", "KSU"), "the Sunflower Showdown"), (("PITT", "WVU"), "the Backyard Brawl"), (("ARMY", "NAVY"), "the Army-Navy Game"),
    (("UVA", "VT"), "the Commonwealth Clash"), (("OU", "OKST"), "Bedlam"),
]}

# Condition kinds that count as one family for the slate's variety (D-115)
FAMILY = {"big": "fd", "streak": "prev", "restadv": "rest", "g4": "rest", "home_after": "trip"}
TOTALS_ONLY = {"tot"}
OPPONENT_KINDS = {"oppq", "opprest", "div", "xconf", "ranked", "conf", "rweek"}   # say something about the opponent already named
MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


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
    opp_ranked: bool
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


def zscore(w: int, l: int) -> float:
    n = w + l
    return (w - n / 2) / math.sqrt(n / 4) if n else 0.0


def fmt_line(x: float) -> str:
    return "PK" if x == 0 else (f"+{x:g}" if x > 0 else f"{x:g}")


def season_label(league: str, s: int) -> str:
    return str(s) if league == "cfb" else f"{s - 1}-{str(s)[2:]}"


def thanksgiving(year: int) -> date:
    first = date(year, 11, 1)
    return first + timedelta(days=(3 - first.weekday()) % 7 + 21)


def in_rivalry_week(d: date) -> bool:
    t = thanksgiving(d.year)
    return t - timedelta(days=2) <= d <= t + timedelta(days=3)


# ---------------------------------------------------------------- coaches (college)
def coach_lookup(path: str):
    """{(school, season): [coach, ...]} in the order they coached that season."""
    if not path:
        return {}
    data = json.load(open(path))
    by = defaultdict(list)
    for c in data:
        name = f"{c['firstName']} {c['lastName']}".strip()
        for s in c.get("seasons", []):
            by[(s["school"], int(s["year"]))].append((name, int(s.get("games") or 0)))
    ordered = {}
    for (school, yr), lst in by.items():
        prev = {n for n, _ in by.get((school, yr - 1), [])}
        # whoever also coached there the year before started the season; interims after
        ordered[(school, yr)] = sorted(lst, key=lambda x: (x[0] not in prev, -x[1]))  # [(coach, games), ...]
    return ordered


# ESPN display names that don't start with CollegeFootballData's school name
ALIASES = {"Appalachian State": "App State", "UT San Antonio": "UTSA", "San Jose State": "San José State",
           "Southern Mississippi": "Southern Miss", "Connecticut": "UConn"}


def school_for(display: str, schools: list[str]) -> str | None:
    for espn, cfbd in ALIASES.items():
        if display.startswith(espn + " ") and cfbd in schools:
            return cfbd
    best = None
    for s in schools:
        if display == s or display.startswith(s + " "):
            if best is None or len(s) > len(best):
                best = s
    return best


# ---------------------------------------------------------------- the schedule so far
@dataclass
class Played:
    start: datetime
    home: bool         # a true home game (not neutral)
    road: bool         # a true road game
    res: str           # W, L or T


def situation(tl: list[Played], start: datetime, home: bool, road: bool) -> dict:
    """Where a team stands going into a game, from its games so far this season."""
    streak = 0
    for p in reversed(tl):
        if p.res not in ("W", "L"):
            break
        step = 1 if p.res == "W" else -1
        if streak and (streak > 0) != (step > 0):
            break
        streak += step
    day = start.astimezone(ET).date()
    g4 = 1 + sum(1 for p in tl if (day - p.start.astimezone(ET).date()).days <= 3)
    run = 0
    for p in reversed(tl):
        if not p.road:
            break
        run += 1
    w = sum(1 for p in tl if p.res == "W")
    l = sum(1 for p in tl if p.res == "L")
    return {"prev": tl[-1].res if tl else "", "streak": streak,
            "rest": (day - tl[-1].start.astimezone(ET).date()).days if tl else 99, "g4": g4,
            "trip": run + 1 if road else 0, "home_after": home and run >= 3,
            "over": (1 if w > l else (-1 if l > w else 0)) if w + l >= 8 else 0}


# ---------------------------------------------------------------- history
def load(league: str, paths: list[str], coaches_path: str, team_paths: list[str]):
    raw = [r for p in paths for r in csv.DictReader(open(p))]
    raw = list({r["event_id"]: r for r in raw}.values())  # later files (the current season) win
    raw.sort(key=lambda r: (r["start"], r["event_id"]))
    lookup = coach_lookup(coaches_path) if league == "cfb" else {}
    schools = sorted({s for s, _ in lookup})
    tv_events = set()
    for p in team_paths:
        for t in csv.DictReader(open(p)):
            if t.get("national_tv") == "1":
                tv_events.add(t["event_id"])
    school_of = {}
    games_seen = defaultdict(int)
    rows: list[Row] = []
    tl: dict[tuple[str, int], list[Played]] = defaultdict(list)
    abbr: dict[str, str] = {}
    last_coach: dict[str, str] = {}
    for r in raw:
        if r["home_pts"] == "" or r["away_pts"] == "":
            continue
        start = datetime.fromisoformat(r["start"].replace("Z", "+00:00"))
        season = int(r["season"])
        hp, ap = float(r["home_pts"]), float(r["away_pts"])
        neutral = r["neutral"] == "1"
        sit = {}
        for side in ("home", "away"):
            tid = r[f"{side}_id"]
            abbr[tid] = r[f"{side}_abbr"]
            sit[side] = situation(tl[(tid, season)], start, side == "home" and not neutral, side == "away" and not neutral)
        for side in ("home", "away"):
            tid, oid = r[f"{side}_id"], r["away_id" if side == "home" else "home_id"]
            other = "away" if side == "home" else "home"
            coach = r[f"{side}_coach"]
            if coach:
                last_coach[tid] = coach
            if league == "cfb":
                coach = ""  # ESPN lists today's coach for past seasons too; only CollegeFootballData's list is used
            if league == "cfb" and lookup:
                if tid not in school_of:
                    school_of[tid] = school_for(r[side], schools)
                school = school_of[tid]
                lst = lookup.get((school, season)) if school else None
                if lst and sum(g for _, g in lst) == 0:
                    coach = lst[-1][0]  # current season: game counts not filled in yet
                elif lst:
                    # games in date order: the first coach's games first, then the next (mid-season changes)
                    k = games_seen[(tid, season)]
                    games_seen[(tid, season)] += 1
                    acc = 0
                    coach = lst[-1][0]
                    for n, g in lst:
                        acc += g
                        if k < acc:
                            coach = n
                            break
            if r["home_line"] != "":
                hl = float(r["home_line"])
                line = hl if side == "home" else -hl
                margin = (hp - ap) + hl
                m = margin if side == "home" else -margin
                ats = (m > 0) - (m < 0)
                ou, total = None, None
                if r["total"] != "":
                    total = float(r["total"])
                    t = hp + ap - total
                    ou = (t > 0) - (t < 0)
                opp_rank = int(r["away_rank" if side == "home" else "home_rank"] or 99)
                me, op = sit[side], sit[other]
                d1, d2 = NBA_DIV.get(r[f"{side}_abbr"]), NBA_DIV.get(r[f"{other}_abbr"])
                rows.append(Row(season=season, start=start, event=r["event_id"], team=tid, opp=oid, home=side == "home",
                                neutral=neutral, line=line, ats=ats, ou=ou, total=total,
                                coach=coach, conf=r["conf_game"] == "1", opp_ranked=opp_rank <= 25, prev=me["prev"],
                                streak=me["streak"], rest=me["rest"], opp_rest=op["rest"], g4=me["g4"], trip=me["trip"],
                                home_after=me["home_after"], opp_over=op["over"],
                                div=bool(d1 and d1 == d2), xconf=bool(d1 and d2 and (d1 in EAST) != (d2 in EAST)),
                                tv=r["event_id"] in tv_events, rweek=league == "cfb" and in_rivalry_week(start.astimezone(ET).date()),
                                night=start.astimezone(NY).hour >= 19,
                                month=start.astimezone(ET).month))
        for side in ("home", "away"):
            tid = r[f"{side}_id"]
            won = (hp > ap) if side == "home" else (ap > hp)
            tl[(tid, season)].append(Played(start, side == "home" and not neutral, side == "away" and not neutral,
                                            "W" if won else ("L" if hp != ap else "T")))
    return raw, rows, tl, lookup, school_of


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


def upcoming(league: str, days: int):
    cfg = CONF[league]
    now = datetime.now(timezone.utc)
    out, seen = [], set()
    for i in range(days):
        d = (now + timedelta(days=i)).astimezone(ET).strftime("%Y%m%d")
        data = get(f"https://site.api.espn.com/apis/site/v2/sports/{cfg['path']}/scoreboard?dates={d}{cfg['query']}")
        for e in data.get("events", []):
            c = e["competitions"][0]
            if c["status"]["type"]["state"] != "pre" or e["id"] in seen:
                continue
            seen.add(e["id"])
            h = next(x for x in c["competitors"] if x["homeAway"] == "home")
            a = next(x for x in c["competitors"] if x["homeAway"] == "away")
            odds = (c.get("odds") or [{}])[0]
            details = (odds.get("details") or "").strip()
            if not details:
                continue
            if details.upper() in ("EVEN", "PK"):
                hl = 0.0
            else:
                abbr, _, num = details.rpartition(" ")
                n = abs(float(num))
                hl = -n if abbr == h["team"]["abbreviation"] else n
            out.append({
                "id": e["id"], "start": datetime.fromisoformat(e["date"].replace("Z", "+00:00")), "home": h, "away": a,
                "neutral": bool(c.get("neutralSite")), "conf": bool(c.get("conferenceCompetition")), "home_line": hl,
                "total": odds.get("overUnder"), "tv": any(b.get("market") == "national" for b in c.get("broadcasts", [])),
            })
    return out


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

    @property
    def score(self) -> float:
        return abs(self.z) - 0.35 * (self.conds - 1) + self.relevance

    @property
    def strong(self) -> bool:
        return abs(self.z) >= MIN_Z and (self.rate >= MIN_RATE or self.rate <= 1 - MIN_RATE)

    @property
    def families(self) -> frozenset:
        return frozenset(family(k) for k in self.kinds)


def short(league: str, team: dict) -> str:
    return team.get("location") if league == "cfb" else team.get("name") or team.get("shortDisplayName")


def build_angles(league: str, g: dict, rows: list[Row], tl, lookup, school_of, season: int,
                 boxes: Boxes | None = None, outs: dict | None = None) -> list[Angle]:
    cfg = CONF[league]
    out = []
    total = g["total"]
    day = g["start"].astimezone(ET).date()
    sit = {}
    for side in ("home", "away"):
        tid = g[side]["team"]["id"]
        sit[side] = situation(tl.get((tid, season), []), g["start"], side == "home" and not g["neutral"],
                              side == "away" and not g["neutral"])
    for side in ("home", "away"):
        other = "away" if side == "home" else "home"
        me, op = g[side], g[other]
        tid, oid = me["team"]["id"], op["team"]["id"]
        my, their = sit[side], sit[other]
        line = g["home_line"] if side == "home" else -g["home_line"]
        fav = line < 0
        fd = "favorite" if fav else "underdog"
        art = "an" if fd == "underdog" else "a"
        name, opp_name = short(league, me["team"]), short(league, op["team"])
        opp_label = opp_name if league == "cfb" else f"the {opp_name}"
        side_label = f"{me['team']['abbreviation']} {fmt_line(line)}"
        other_label = f"{op['team']['abbreviation']} {fmt_line(-line)}"
        prev_res, rest = my["prev"], my["rest"]
        opp_rank = (op.get("curatedRank") or {}).get("current") or 99

        role = "neutral" if g["neutral"] else ("home" if side == "home" else "road")
        conds = []
        if role == "home":
            conds.append(("role", "at home", lambda r: r.home and not r.neutral))
        elif role == "road":
            conds.append(("role", "on the road", lambda r: (not r.home) and not r.neutral))
        conds.append(("fd", f"as {art} {fd}", lambda r, f=fav: (r.line < 0) == f))
        rivalry = CFB_RIVALRIES.get(frozenset((me["team"]["abbreviation"], op["team"]["abbreviation"]))) if league == "cfb" else None
        conds.append(("opp", f"in {rivalry}" if rivalry else f"against {opp_label}", lambda r, o=oid: r.opp == o))
        if prev_res in ("W", "L"):
            conds.append(("prev", "after a loss" if prev_res == "L" else "after a win", lambda r, p=prev_res: r.prev == p))
        if my["streak"] <= -2:
            conds.append(("streak", "after two or more straight losses", lambda r: r.streak <= -2))
        elif my["streak"] >= 3:
            conds.append(("streak", "after three or more straight wins", lambda r: r.streak >= 3))
        if abs(line) >= cfg["big"]:
            conds.append(("big", f"as {art} {fd} of {cfg['big']} or more", lambda r, f=fav, b=cfg["big"]: (r.line <= -b) if f else (r.line >= b)))
        if total is not None:
            t = float(total)
            if t >= cfg["hi"]:
                conds.append(("tot", f"with a total of {cfg['hi']} or more", lambda r, b=cfg["hi"]: r.total is not None and r.total >= b))
            elif t <= cfg["lo"]:
                conds.append(("tot", f"with a total of {cfg['lo']} or less", lambda r, b=cfg["lo"]: r.total is not None and r.total <= b))
        if league == "cfb":
            if g["conf"]:
                conds.append(("conf", "in conference games", lambda r: r.conf))
            if opp_rank <= 25:
                conds.append(("ranked", "against ranked teams", lambda r: r.opp_ranked))
            if 13 <= rest < 99:
                conds.append(("rest", "off a bye", lambda r: 13 <= r.rest < 99))
            elif rest <= 5:
                conds.append(("rest", "on a short week", lambda r: r.rest <= 5))
            if my["trip"] >= 2:
                conds.append(("trip", "on the road after a road game", lambda r: r.trip >= 2))
            if g["start"].astimezone(NY).hour >= 19:
                conds.append(("night", "at night", lambda r: r.night))
            if their["over"]:
                conds.append(("oppq", "against teams over .500" if their["over"] > 0 else "against teams under .500",
                              lambda r, o=their["over"]: r.opp_over == o))
            if day.month == 11:
                conds.append(("month", "in November", lambda r: r.month == 11))
            # rivalry week only for teams that meet every year (5 of the last 6 seasons), not any Thanksgiving-weekend game
            met = {r.season for r in rows if r.team == tid and r.opp == oid and season - 6 <= r.season < season}
            if in_rivalry_week(day) and len(met) >= 5:
                conds.append(("rweek", "in rivalry week", lambda r: r.rweek))
        else:
            if rest == 1:
                conds.append(("rest", "on the second night of a back-to-back", lambda r: r.rest == 1))
            elif 3 <= rest < 99:
                conds.append(("rest", "with two or more days of rest", lambda r: 3 <= r.rest < 99))
            if their["rest"] < 99 and rest < 99 and rest > their["rest"]:
                conds.append(("restadv", "with more rest than their opponent", lambda r: r.opp_rest < 99 and r.rest < 99 and r.rest > r.opp_rest))
            if my["g4"] >= 3:
                conds.append(("g4", "in the third game in four nights", lambda r: r.g4 >= 3))
            if their["rest"] == 1 and rest != 1:
                conds.append(("opprest", "against teams on the second night of a back-to-back", lambda r: r.opp_rest == 1))
            if my["trip"] >= 3:
                conds.append(("trip", "in the third game or later of a road trip", lambda r: r.trip >= 3))
            if my["home_after"]:
                conds.append(("home_after", "back home after a road trip", lambda r: r.home_after))
            if their["over"]:
                conds.append(("oppq", "against teams over .500" if their["over"] > 0 else "against teams under .500",
                              lambda r, o=their["over"]: r.opp_over == o))
            d1, d2 = NBA_DIV.get(me["team"]["abbreviation"]), NBA_DIV.get(op["team"]["abbreviation"])
            if d1 and d1 == d2:
                conds.append(("div", "in division games", lambda r: r.div))
            elif d1 and d2 and (d1 in EAST) != (d2 in EAST):
                conds.append(("xconf", f"against the {'East' if d2 in EAST else 'West'}", lambda r: r.xconf))
            if g.get("tv"):
                conds.append(("tv", "on national TV", lambda r: r.tv))
            conds.append(("month", f"in {MONTHS[day.month]}", lambda r, m=day.month: r.month == m))
            if boxes and outs:
                for pid, pname in (outs.get(tid) or {}).items():
                    if pid in boxes.top_scorers(tid, season) and pname:
                        span = boxes.span(pid, tid, season)
                        conds.append(("out", f"without {pname}",
                                      lambda r, pid=pid, tm=tid, span=span: r.team == tm and r.season in span
                                      and span[r.season][0] <= r.start <= span[r.season][1]
                                      and (r.event, tm) in boxes.played and pid not in boxes.played[(r.event, tm)]))

        def phrase_for(combo) -> str:
            kinds = {k for k, _, _ in combo}
            parts = []
            if "role" in kinds and ({"fd", "big"} & kinds):
                big = f" of {cfg['big']} or more" if "big" in kinds else ""
                parts.append(f"as a {role} {fd}{big}")
            for k, ph, _ in combo:
                if parts and k in ("role", "fd", "big") and parts[0].startswith("as a"):
                    continue
                parts.append(ph)
            return " ".join(parts)

        team_rows = [r for r in rows if r.team == tid]
        subjects = []
        if league == "cfb":
            school = school_of.get(tid)
            lst = lookup.get((school, season)) if school else None
            # this season's coach: the last one listed (an interim replaces a fired coach), else ESPN's
            coach = lst[-1][0] if lst else ""
            if coach:
                crow = [r for r in rows if r.coach == coach]
                if crow:
                    first = min(r.season for r in crow)
                    subjects.append(("coach", coach, crow, "this season" if first == season else f"since {first}"))
        subjects.append(("team", name, [r for r in team_rows if r.season == season], "this season"))
        subjects.append(("team", name, [r for r in team_rows if r.season >= season - 2], f"since {season_label(league, season - 2)}"))
        subjects.append(("team", name, [r for r in team_rows if r.season >= cfg["since"]], f"since {season_label(league, cfg['since'])}"))

        combos = [(c,) for c in conds] + [(a, b) for i, a in enumerate(conds) for b in conds[i + 1:]]
        # two conditions from one family say the same thing twice ("after a loss after two straight losses")
        combos = [c for c in combos if len({family(k) for k, _, _ in c}) == len(c)]
        # and the opponent can't be described twice ("against the Spurs against teams over .500"), nor can two
        # phrases start the same way ("against teams over .500 against the West", "with ... with ...")
        combos = [c for c in combos if len(c) == 1 or not (
            ("opp" in {k for k, _, _ in c} and {k for k, _, _ in c} & OPPONENT_KINDS)
            or c[0][1].split()[0] == c[1][1].split()[0] in ("against", "with", "after"))]
        for kind, who, srows, frame in subjects:
            for combo in combos:
                kinds = {k for k, _, _ in combo}
                if kind == "team" and frame.startswith("since") and frame != f"since {season_label(league, season - 2)}" and not kinds & {"opp", "rweek"}:
                    continue  # the long team window is for this matchup (or rivalry week) only
                sel = [r for r in srows if all(p(r) for _, _, p in combo)]
                phrase = phrase_for(combo)
                # the month is a weak reason on its own: it wins only when it's clearly the strongest record
                relevance = (0.5 * ("opp" in kinds) + 0.3 * ("out" in kinds) + 0.2 * bool(kinds & {"ranked", "rest", "opprest"})
                             - 0.3 * ("month" in kinds))
                series = league == "cfb" and bool(kinds & {"opp", "rweek"})
                for metric in ("ats", "ou"):
                    if metric == "ou" and total is None:
                        continue
                    if metric == "ats" and kinds & TOTALS_ONLY:
                        continue
                    w = sum(1 for r in sel if getattr(r, metric) == 1)
                    l = sum(1 for r in sel if getattr(r, metric) == -1)
                    p = sum(1 for r in sel if getattr(r, metric) == 0)
                    n = w + l
                    if n < (SERIES_MIN if series else MIN_GAMES):
                        continue
                    rate = w / n
                    if FLOOR_RATE > rate > 1 - FLOOR_RATE:
                        continue
                    z = zscore(w, l)
                    if abs(z) < FLOOR_Z or max(r.season for r in sel) < season - (RECENT_SEASONS - 1):
                        continue
                    rec = f"{w}-{l}" + (f"-{p}" if p else "")
                    if metric == "ats":
                        subject = f"The {who} are" if (kind == "team" and league == "nba") else f"{who} is"
                        text = f"{subject} {rec} ATS {phrase} {frame}"
                        supports = side_label if rate > 0.5 else other_label
                    else:
                        over = rate > 0.5
                        rec = f"{w}-{l}" if over else f"{l}-{w}"
                        rec += f"-{p}" if p else ""
                        lead = (f"{who}'" if who.endswith("s") else f"{who}'s") + " games" if kind == "coach" else f"{who} games"
                        for group in ("in conference games", "in division games"):
                            if phrase.startswith(group):
                                lead, phrase = lead.replace(" games", f" {group.split()[1]} games"), phrase[len(group):].strip()
                        text = f"The {'over' if over else 'under'} is {rec} in {lead} {phrase} {frame}"
                        supports = f"{'Over' if over else 'Under'} {float(total):g}"
                    out.append(Angle(" ".join(text.split()), supports, "spread" if metric == "ats" else "total", metric,
                                     w, l, p, z, len(combo), rate, frozenset(kinds), relevance,
                                     [(r.event, r.team) for r in sel if getattr(r, metric) is not None]))
    return out


def verify(a: Angle, idx: dict[str, dict]) -> bool:
    """Recompute the record straight from the CSV rows, independently of Row."""
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


def pick_slate(games: list[tuple[dict, list[Angle]]], ok) -> dict[str, Angle]:
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
                over = [a for a in angles[:40] if ok(a)]
                best = min(over, key=lambda a: (max(used[f] for f in a.families), -a.strong, -a.score), default=None)
            if best:
                used.update(best.families)
                picked[g["id"]] = best
    return picked


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", choices=list(CONF), required=True)
    ap.add_argument("--history", required=True, nargs="+", help="completed seasons file, then the current season's")
    ap.add_argument("--coaches", default="")
    ap.add_argument("--boxes", nargs="*", default=[], help="NBA: nba_boxes.py player CSVs (who played)")
    ap.add_argument("--teams", nargs="*", default=[], help="NBA: nba_boxes.py team CSVs (national TV)")
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--days", type=int, default=2)
    ap.add_argument("--json", default="")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    raw, rows, tl, lookup, school_of = load(args.league, args.history, args.coaches, args.teams)
    idx = {r["event_id"]: r for r in raw}
    boxes = Boxes(args.boxes, raw) if args.league == "nba" and args.boxes else None
    games = upcoming(args.league, args.days)
    if args.limit:
        games = games[: args.limit]
    found = []
    for g in games:
        outs = injuries(g["id"]) if boxes else None
        angles = sorted(build_angles(args.league, g, rows, tl, lookup, school_of, args.season, boxes, outs),
                        key=lambda a: (a.strong, a.score), reverse=True)
        if angles:
            found.append((g, angles))
    checked: dict[int, bool] = {}

    def ok(a: Angle) -> bool:
        if id(a) not in checked:
            checked[id(a)] = verify(a, idx)
        return checked[id(a)]

    picked = pick_slate(found, ok)
    results = []
    for g, _ in found:
        best = picked.get(g["id"])
        label = f"{g['away']['team']['shortDisplayName']} {'vs' if g['neutral'] else 'at'} {g['home']['team']['shortDisplayName']}"
        if best is None:
            continue
        results.append({"espn_event_id": g["id"], "sport": "NCAAF" if args.league == "cfb" else "NBA", "matchup": label,
                        "starts_at": g["start"].isoformat(),
                        "best": {"text": best.text, "supports": best.supports, "market": best.market,
                                 "record": f"{best.w}-{best.l}" + (f"-{best.p}" if best.p else ""),
                                 "z": round(best.z, 2), "tier": "strong" if best.strong else "fallback",
                                 "families": sorted(best.families)}})
        print(f"{label} ({g['home']['team']['abbreviation']} {fmt_line(g['home_line'])}, O/U {g['total']}): "
              f"{best.text}  ->  {best.supports}  [{', '.join(sorted(best.families))}]")
    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)


if __name__ == "__main__":
    main()
