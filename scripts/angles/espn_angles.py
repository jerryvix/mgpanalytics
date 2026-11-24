"""The one line per game for college football and the NBA (DECISIONS D-075, D-078).

Same method as nfl_angles.py: every angle that is true for this game, for both teams,
spread and total, from the free ESPN history built by espn_history.py; a real sample,
recent games, at most two conditions; scored by distance from a coin flip; the best
one written as one sentence with its record and time frame; every chosen record
recomputed from the raw CSV before it can be used. No AI, no cost.

College football angles: the head coach's record (with the correct coach per season from
CollegeFootballData's coach list), the team this season, since 2024, and against this
opponent since 2016; home, road or neutral; favorite or underdog; conference games;
against ranked teams; off a bye; after a win or loss; double-digit spreads; November.
NBA angles: the team this season and since 2024-25, against this opponent since
2022-23; home or road; favorite or underdog; the second night of a back-to-back; two or
more days of rest; after a win or loss; 7+ point spreads.

Usage:
  python3 -I scripts/angles/espn_angles.py --league cfb --history data/history/cfb_espn.csv --coaches <cfbd coaches.json> --days 6
  python3 -I scripts/angles/espn_angles.py --league nba --history data/history/nba_espn.csv --days 2
"""
import argparse
import csv
import json
import math
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}
MIN_GAMES, MIN_RATE, MIN_Z = 10, 0.65, 2.0
FLOOR_RATE, FLOOR_Z = 0.62, 1.6
RECENT_SEASONS = 2

CONF = {
    "cfb": {"path": "football/college-football", "query": "&groups=80&limit=400", "big": 10, "since": 2016},
    "nba": {"path": "basketball/nba", "query": "", "big": 7, "since": 2023},
}


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
    coach: str
    conf: bool
    opp_ranked: bool
    prev: str          # previous game this season: W, L or ""
    rest: int          # days since the team's previous game this season (99 if first)
    month: int


def zscore(w: int, l: int) -> float:
    n = w + l
    return (w - n / 2) / math.sqrt(n / 4) if n else 0.0


def fmt_line(x: float) -> str:
    return "PK" if x == 0 else (f"+{x:g}" if x > 0 else f"{x:g}")


def season_label(league: str, s: int) -> str:
    return str(s) if league == "cfb" else f"{s - 1}-{str(s)[2:]}"


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


# ---------------------------------------------------------------- history
def load(league: str, paths: list[str], coaches_path: str):
    raw = [r for p in paths for r in csv.DictReader(open(p))]
    raw = list({r["event_id"]: r for r in raw}.values())  # later files (the current season) win
    raw.sort(key=lambda r: (r["start"], r["event_id"]))
    lookup = coach_lookup(coaches_path) if league == "cfb" else {}
    schools = sorted({s for s, _ in lookup})
    school_of = {}
    games_seen = defaultdict(int)
    rows: list[Row] = []
    last: dict[tuple[str, int], tuple[datetime, str]] = {}
    names: dict[str, str] = {}
    last_coach: dict[str, str] = {}
    for r in raw:
        if r["home_pts"] == "" or r["away_pts"] == "":
            continue
        start = datetime.fromisoformat(r["start"].replace("Z", "+00:00"))
        season = int(r["season"])
        hp, ap = float(r["home_pts"]), float(r["away_pts"])
        for side in ("home", "away"):
            tid, oid = r[f"{side}_id"], r["away_id" if side == "home" else "home_id"]
            names[tid] = r[side]
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
            prev_date, prev_res = last.get((tid, season), (None, ""))
            rest = (start.date() - prev_date.date()).days if prev_date else 99
            if r["home_line"] != "":
                hl = float(r["home_line"])
                line = hl if side == "home" else -hl
                margin = (hp - ap) + hl
                m = margin if side == "home" else -margin
                ats = (m > 0) - (m < 0)
                ou = None
                if r["total"] != "":
                    t = hp + ap - float(r["total"])
                    ou = (t > 0) - (t < 0)
                opp_rank = int(r["away_rank" if side == "home" else "home_rank"] or 99)
                rows.append(Row(season=season, start=start, event=r["event_id"], team=tid, opp=oid, home=side == "home",
                                neutral=r["neutral"] == "1", line=line, ats=ats, ou=ou,
                                coach=coach, conf=r["conf_game"] == "1", opp_ranked=opp_rank <= 25, prev=prev_res,
                                rest=rest, month=start.astimezone(timezone(timedelta(hours=-5))).month))
            won = (hp > ap) if side == "home" else (ap > hp)
            last[(tid, season)] = (start, "W" if won else ("L" if hp != ap else "T"))
    return raw, rows, names, last, lookup, school_of, last_coach


# ---------------------------------------------------------------- upcoming games
def get(url: str):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def upcoming(league: str, days: int):
    cfg = CONF[league]
    now = datetime.now(timezone.utc)
    out, seen = [], set()
    for i in range(days):
        d = (now + timedelta(days=i)).astimezone(timezone(timedelta(hours=-5))).strftime("%Y%m%d")
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
                "total": odds.get("overUnder"),
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
    relevance: float = 0.0
    sample: list = field(default_factory=list)  # (event, team)

    @property
    def score(self) -> float:
        return abs(self.z) - 0.35 * (self.conds - 1) + self.relevance

    @property
    def strong(self) -> bool:
        return abs(self.z) >= MIN_Z and (self.rate >= MIN_RATE or self.rate <= 1 - MIN_RATE)


def short(league: str, team: dict) -> str:
    return team.get("location") if league == "cfb" else team.get("name") or team.get("shortDisplayName")


def build_angles(league: str, g: dict, rows: list[Row], last, lookup, school_of, last_coach, season: int) -> list[Angle]:
    cfg = CONF[league]
    out = []
    total = g["total"]
    for side in ("home", "away"):
        me, op = (g["home"], g["away"]) if side == "home" else (g["away"], g["home"])
        tid, oid = me["team"]["id"], op["team"]["id"]
        line = g["home_line"] if side == "home" else -g["home_line"]
        fav = line < 0
        fd = "favorite" if fav else "underdog"
        art = "an" if fd == "underdog" else "a"
        name, opp_name = short(league, me["team"]), short(league, op["team"])
        opp_label = opp_name if league == "cfb" else f"the {opp_name}"
        side_label = f"{me['team']['abbreviation']} {fmt_line(line)}"
        other_label = f"{op['team']['abbreviation']} {fmt_line(-line)}"
        prev_date, prev_res = last.get((tid, season), (None, ""))
        rest = (g["start"].date() - prev_date.date()).days if prev_date else 99
        opp_rank = (op.get("curatedRank") or {}).get("current") or 99

        role = "neutral" if g["neutral"] else ("home" if side == "home" else "road")
        conds = []
        if role == "home":
            conds.append(("role", "at home", lambda r: r.home and not r.neutral))
        elif role == "road":
            conds.append(("role", "on the road", lambda r: (not r.home) and not r.neutral))
        conds.append(("fd", f"as {art} {fd}", lambda r, f=fav: (r.line < 0) == f))
        conds.append(("opp", f"against {opp_label}", lambda r, o=oid: r.opp == o))
        if prev_res in ("W", "L"):
            conds.append(("prev", "after a loss" if prev_res == "L" else "after a win", lambda r, p=prev_res: r.prev == p))
        if abs(line) >= cfg["big"]:
            conds.append(("big", f"as {art} {fd} of {cfg['big']} or more", lambda r, f=fav, b=cfg["big"]: (r.line <= -b) if f else (r.line >= b)))
        if league == "cfb":
            if g["conf"]:
                conds.append(("conf", "in conference games", lambda r: r.conf))
            if opp_rank <= 25:
                conds.append(("ranked", "against ranked teams", lambda r: r.opp_ranked))
            if rest >= 13 and rest < 99:
                conds.append(("rest", "off a bye", lambda r: 13 <= r.rest < 99))
            if g["start"].astimezone(timezone(timedelta(hours=-5))).month == 11:
                conds.append(("month", "in November", lambda r: r.month == 11))
        else:
            if rest == 1:
                conds.append(("rest", "on the second night of a back-to-back", lambda r: r.rest == 1))
            elif 3 <= rest < 99:
                conds.append(("rest", "with two or more days of rest", lambda r: 3 <= r.rest < 99))

        def phrase_for(combo) -> str:
            kinds = {k for k, _, _ in combo}
            parts = []
            if "role" in kinds and ({"fd", "big"} & kinds):
                big = f" of {cfg['big']} or more" if "big" in kinds else ""
                parts.append(f"as {'a' if role == 'home' else 'a'} {role} {fd}{big}")
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
        combos = [c for c in combos if not ({"fd", "big"} <= {k for k, _, _ in c})]
        for kind, who, srows, frame in subjects:
            for combo in combos:
                kinds = {k for k, _, _ in combo}
                if kind == "team" and frame.startswith("since") and frame != f"since {season_label(league, season - 2)}" and "opp" not in kinds:
                    continue  # the long team window is for this matchup only
                sel = [r for r in srows if all(p(r) for _, _, p in combo)]
                phrase = phrase_for(combo)
                relevance = 0.5 * ("opp" in kinds) + 0.2 * bool(kinds & {"ranked", "rest"})
                for metric in ("ats", "ou"):
                    if metric == "ou" and total is None:
                        continue
                    w = sum(1 for r in sel if getattr(r, metric) == 1)
                    l = sum(1 for r in sel if getattr(r, metric) == -1)
                    p = sum(1 for r in sel if getattr(r, metric) == 0)
                    n = w + l
                    if n < MIN_GAMES:
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
                                     w, l, p, z, len(combo), rate, relevance,
                                     [(r.event, r.team) for r in sel if getattr(r, metric) is not None]))
    return out


def verify(a: Angle, raw: list[dict]) -> bool:
    """Recompute the record straight from the CSV rows, independently of Row."""
    idx = {r["event_id"]: r for r in raw}
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", choices=list(CONF), required=True)
    ap.add_argument("--history", required=True, nargs="+", help="completed seasons file, then the current season's")
    ap.add_argument("--coaches", default="")
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--days", type=int, default=2)
    ap.add_argument("--json", default="")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    raw, rows, names, last, lookup, school_of, last_coach = load(args.league, args.history, args.coaches)
    games = upcoming(args.league, args.days)
    if args.limit:
        games = games[: args.limit]
    results = []
    for g in games:
        angles = sorted(build_angles(args.league, g, rows, last, lookup, school_of, last_coach, args.season),
                        key=lambda a: (a.strong, a.score), reverse=True)
        angles = [a for a in angles if verify(a, raw)]
        best = angles[0] if angles else None
        label = f"{g['away']['team']['shortDisplayName']} {'vs' if g['neutral'] else 'at'} {g['home']['team']['shortDisplayName']}"
        if best is None:
            continue
        results.append({"espn_event_id": g["id"], "sport": "NCAAF" if args.league == "cfb" else "NBA", "matchup": label,
                        "starts_at": g["start"].isoformat(),
                        "best": best and {"text": best.text, "supports": best.supports, "market": best.market,
                                          "record": f"{best.w}-{best.l}" + (f"-{best.p}" if best.p else ""),
                                          "z": round(best.z, 2), "tier": "strong" if best.strong else "fallback"}})
        print(f"{label} ({g['home']['team']['abbreviation']} {fmt_line(g['home_line'])}, O/U {g['total']}): "
              + (f"{best.text}  ->  {best.supports}" if best else "no angle"))
    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)


if __name__ == "__main__":
    main()
