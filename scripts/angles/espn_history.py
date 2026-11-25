"""Game history with betting lines from ESPN's public APIs (free, no key), for the
one-line-per-game engines (DECISIONS D-075, D-078, D-116).

For each finished game: date, teams, score, neutral site, conference game, AP rank
at game time, the pregame spread and total, and (college football) each team's head
coach that season. Lines come from ESPN's odds feed; the first pregame provider in
PROVIDER_ORDER that has a spread is used, and live odds are ignored.

Men's college basketball ("cbb", D-116): every Division I game (ESPN group 50) from daily
scoreboards. Lines exist from the 2012-13 season (ESPN season 2013) and are fetched only
for games between two Division I teams (a team with no ESPN conference id is not D1).
Opening lines and live odds are skipped, and a provider with both a spread and a total is
preferred. Extra columns: each head coach's ESPN id, each team's ESPN conference id, NCAA
tournament seeds, a tournament marker (NCAA, NIT, CBI, CIT, CBC, POST for any other
postseason event, CONF for conference tournaments) and the round (FF, R64, R32, S16, E8,
F4, NC for the NCAA tournament, worked out from the bracket; R1, R2, R3, QF, SF, F from
ESPN's note for the others). ESPN's coach lists have errors (2024 lists coaches who left
decades ago; 2025 lists some spring 2025 hires), so a coach counts only when his own season
entry shows games for that team that season (D-116).

College football and the NBA (D-120) also keep, from the same scoreboard: the last period played
(5 or more is overtime), ESPN's season type (2 regular season, 3 postseason, 5 NBA play-in), its note
(NBA Cup games, playoff rounds, conference title games, bowls, College Football Playoff rounds) and the
venue's city and state. --backfill adds those columns to a finished-seasons file in place, leaving
every other value as it was.

Usage:
  python3 -I scripts/angles/espn_history.py --league cfb --seasons 2016-2025 --out data/history/cfb_espn.csv --cache <dir>
  python3 -I scripts/angles/espn_history.py --league nba --seasons 2023-2026 --out data/history/nba_espn.csv --cache <dir>
  python3 -I scripts/angles/espn_history.py --league cbb --seasons 2014-2026 --out data/history/cbb_espn.csv --cache <dir>
  python3 -I scripts/angles/espn_history.py --league nba --seasons 2023-2026 --out data/history/nba_espn.csv --cache <dir> --backfill
NBA and college basketball seasons are named by the year they end (2026 = 2025-26), as ESPN does.
"""
import argparse
import csv
import gzip
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}
LEAGUES = {
    "cfb": ("football", "college-football"),
    "nba": ("basketball", "nba"),
    "cbb": ("basketball", "mens-college-basketball"),
}
PROVIDER_ORDER = ["DraftKings", "ESPN BET", "consensus", "teamrankings", "Caesars Sportsbook (New Jersey)",
                  "Caesars Sportsbook (Colorado)", "William Hill (New Jersey)", "Westgate", "BOVADA.lv", "BetfairSportsbook"]
# College basketball (D-116): sportsbooks first, in order of how closely each agreed with the other providers on
# the same games across 2013-2026 (98% to 99.9% within 1.5 points), then teamrankings (97.9%; most of 2012-13 has
# nothing else). Never used: projection and fantasy services and ESPN's "consensus" (89% within 1.5 points, the
# wrong favorite on 1.6% of games), plus numberfire's "EVEN" placeholders with a 0 total.
PROVIDER_ORDER_CBB = ["DraftKings", "ESPN BET", "Caesars Sportsbook (New Jersey)", "Caesars (New Jersey)",
                      "Caesars Sportsbook (Pennsylvania)", "Caesars Sportsbook (Colorado)", "Caesars Sportsbook (Tennessee)",
                      "MGM", "Titanbets", "BetfairSportsbook", "PointsBet", "Westgate", "Wynn", "Caesar's", "William Hill (New Jersey)",
                      "SugarHouse", "Unibet", "Caesars Sportsbook", "CG Technology", "5Dimes.eu", "BETONLINE.ag", "SportsBetting.ag",
                      "BOVADA.lv", "PinnacleSports.com", "BetUS.COM", "Sportsbook.com", "BETNOW.eu", "SportsInteraction.com",
                      "teamrankings"]
NOT_BOOKS_CBB = {"opening", "consensus", "numberfire", "accuscore", "betegy", "fantasy911.com", "unknown", "sportradar internal odds(ise)"}
FIELDS = ["league", "season", "week", "postseason", "start", "event_id", "home_id", "home", "home_abbr", "away_id", "away",
          "away_abbr", "home_pts", "away_pts", "neutral", "conf_game", "home_rank", "away_rank", "home_line", "total",
          "provider", "home_coach", "away_coach"]
FIELDS_CBB = FIELDS + ["home_coach_id", "away_coach_id", "home_conf", "away_conf", "home_seed", "away_seed", "tourney", "round"]
# College football and the NBA (D-120), straight from the scoreboard: the last period played (5+ = overtime), ESPN's
# season type (2 regular season, 3 postseason, 5 NBA play-in), its note ("NBA Cup - Group Play", "East Semifinals -
# Game 3", "SEC Championship", "Rose Bowl", "College Football Playoff First Round Game") and where the game was played
EXTRA = ["periods", "season_type", "note", "venue_city", "venue_state"]
FIELDS_EXTRA = FIELDS + EXTRA
THREADS = {"cfb": 8, "nba": 8, "cbb": 6}
CBB_CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball"
NCAA_ROUNDS = ["R64", "R32", "S16", "E8", "F4", "NC"]


class Fetcher:
    def __init__(self, cache: str, pace: float = 0.0):
        self.cache = cache
        self.pace = pace   # seconds each worker waits before a network request (college basketball: polite pacing)
        os.makedirs(cache, exist_ok=True)

    def get(self, url: str, refresh: bool = False, max_age: float | None = None):
        path = os.path.join(self.cache, hashlib.sha1(url.encode()).hexdigest() + ".json")
        fresh = max_age is None or (os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age)
        if not refresh and fresh and os.path.exists(path):
            try:
                with open(path) as f:
                    return json.load(f)
            except ValueError:
                pass  # a cut-off cache file: fetch again
        err = None
        for attempt in range(5):
            try:
                if self.pace:
                    time.sleep(self.pace)
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                    raw = r.read()
                if raw[:2] == b"\x1f\x8b":  # ESPN sometimes gzips without being asked
                    raw = gzip.decompress(raw)
                data = json.loads(raw)
                tmp = path + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(data, f)
                os.replace(tmp, path)
                return data
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                err = e
            except Exception as e:  # network hiccup or timeout: back off and retry
                err = e
            time.sleep(1.5 * 2 ** attempt)
        raise RuntimeError(f"{url}: {err}")


def pick_line(odds: dict | None, home_abbr: str, away_abbr: str, league: str = ""):
    """(home_line, total, provider) from ESPN's odds items, or (None, None, None)."""
    items = (odds or {}).get("items", [])
    items = [i for i in items if "live" not in (i.get("provider", {}).get("name", "").lower())]
    order = PROVIDER_ORDER_CBB if league == "cbb" else PROVIDER_ORDER
    if league == "cbb":
        # an opening line is not the pregame line, and projections aren't lines; a total of 0 or less is no total
        items = [dict(i, overUnder=i.get("overUnder") if (i.get("overUnder") or 0) > 0 else None) for i in items
                 if i.get("provider", {}).get("name", "").lower() not in NOT_BOOKS_CBB]
        items = [i for i in items if i.get("provider", {}).get("name", "") in PROVIDER_ORDER_CBB]
    rank = {name: n for n, name in enumerate(order)}
    # college basketball: a provider with a total as well as a spread comes first
    items.sort(key=lambda i: (league == "cbb" and i.get("overUnder") is None, rank.get(i.get("provider", {}).get("name", ""), 99)))
    for it in items:
        details = (it.get("details") or "").strip()
        spread = it.get("spread")
        if not details or spread is None:
            continue
        if details.upper().startswith("EVEN") or details.upper() == "PK":
            line = 0.0
        else:
            abbr, _, num = details.rpartition(" ")
            try:
                n = abs(float(num))
            except ValueError:
                continue
            # The team named in `details` is the favorite; the home line follows from it.
            if abbr == home_abbr:
                line = -n
            elif abbr == away_abbr:
                line = n
            else:
                line = float(spread)  # unknown abbreviation: fall back to ESPN's home-relative spread
        total = it.get("overUnder")
        return line, (float(total) if total is not None else None), it.get("provider", {}).get("name", "")
    return None, None, None


def scoreboards(f: Fetcher, league: str, season: int, refresh_current: bool):
    sport, lg = LEAGUES[league]
    base = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{lg}/scoreboard"
    events = []
    if league == "cfb":
        weeks = [(2, w) for w in range(1, 17)] + [(3, 1)]
        for st, wk in weeks:
            url = f"{base}?dates={season}&seasontype={st}&week={wk}&groups=80&limit=400"
            data = f.get(url, refresh=refresh_current)
            for e in (data or {}).get("events", []):
                events.append((wk if st == 2 else 99, st == 3, e))
    else:
        if league == "cbb":
            # November to the title game in early April; Division I only (ESPN group 50)
            d, end, query = date(season - 1, 11, 1), min(date(season, 4, 15), date.today()), "&groups=50&limit=400"
        else:
            d, end, query = date(season - 1, 10, 1), min(date(season, 6, 30), date.today()), ""
        days = []
        while d <= end:
            days.append(d)
            d += timedelta(days=1)
        with ThreadPoolExecutor(THREADS[league]) as ex:
            pages = list(ex.map(lambda day: (day, f.get(f"{base}?dates={day:%Y%m%d}{query}", refresh=refresh_current and day >= date.today() - timedelta(days=3))), days))
        for day, data in pages:
            for e in (data or {}).get("events", []):
                st = e.get("season", {}).get("type", 2)
                if league == "cbb" and st not in (2, 3):
                    continue  # preseason exhibitions
                if st in (2, 3, 5):  # regular season, playoffs, play-in
                    events.append((0, st != 2, e))
    return events


def extras(e: dict) -> dict:
    """EXTRA columns for one scoreboard event (D-120)."""
    c = e["competitions"][0]
    venue = (c.get("venue") or {}).get("address") or {}
    return {"periods": (c.get("status") or {}).get("period") or "", "season_type": (e.get("season") or {}).get("type", ""),
            "note": "; ".join((n.get("headline") or "").strip() for n in c.get("notes", []) if n.get("headline")),
            "venue_city": venue.get("city", ""), "venue_state": venue.get("state", "")}


def backfill(league: str, path: str, cache: str) -> None:
    """--backfill: add the EXTRA columns to a finished-seasons file from the same scoreboards, leaving every other
    value as it is (its lines, scores and coaches don't move)."""
    rows = list(csv.DictReader(open(path)))
    f = Fetcher(cache)
    found = {}
    for season in sorted({int(r["season"]) for r in rows}):
        for _, _, e in scoreboards(f, league, season, False):
            found[e["id"]] = extras(e)
    missing = [r["event_id"] for r in rows if r["event_id"] not in found]
    for r in rows:
        r.update(found.get(r["event_id"], {k: "" for k in EXTRA}))
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS_EXTRA)
        w.writeheader()
        w.writerows(rows)
    print(f"{path}: {len(rows) - len(missing)} of {len(rows)} games filled" + (f"; not on a scoreboard: {' '.join(missing[:20])}" if missing else ""))


def coaches_for(f: Fetcher, season: int, team_id: str) -> str:
    url = f"https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/{season}/teams/{team_id}/coaches"
    data = f.get(url)
    items = (data or {}).get("items", [])
    if not items:
        return ""
    c = f.get(items[0]["$ref"].replace("http://", "https://"))
    return f"{(c or {}).get('firstName', '')} {(c or {}).get('lastName', '')}".strip()


# ---------------------------------------------------------------- college basketball (D-116)
def ref_id(ref: str | None, kind: str) -> str:
    """'.../seasons/2024/teams/96?lang=en' -> '96' for kind 'teams'."""
    m = re.search(rf"/{kind}/(\d+)", ref or "")
    return m.group(1) if m else ""


def https(ref: str) -> str:
    return ref.replace("http://", "https://")


class CbbCoaches:
    """Each Division I team's head coach per season, only as far as ESPN's own records back it up.

    ESPN's team-level coach list is wrong in places (2024 lists Eddie Sutton, Bobby Knight or Cliff Ellis;
    2025 lists Darian DeVries at Indiana and Kevin Willard at Villanova, a year early). A listed coach is
    kept only when his season entry has a record for that team that season with games in it. A team left
    with nobody tries the coach it had the season before and the season after, held to the same check."""

    def __init__(self, f: Fetcher, current: int | None):
        self.f = f
        self.current = current
        self.listed: dict[tuple[int, str], list[tuple[str, str, int]]] = {}

    def _age(self, season: int):
        return 2 * 86400 if season == self.current else None   # this season's lists can change mid-year

    def check(self, season: int, cid: str, tid: str) -> tuple[str, str, int] | None:
        """(coach id, name, games) when ESPN's season entry for this coach shows games for this team."""
        entry = self.f.get(f"{CBB_CORE}/seasons/{season}/coaches/{cid}", max_age=self._age(season))
        if not entry:
            return None
        name = f"{entry.get('firstName', '')} {entry.get('lastName', '')}".strip()
        for r in entry.get("records") or []:
            if ref_id((r.get("team") or {}).get("$ref"), "teams") != tid or not (r.get("record") or {}).get("$ref"):
                continue
            rec = self.f.get(https(r["record"]["$ref"]), max_age=self._age(season)) or {}
            m = re.match(r"(\d+)-(\d+)", rec.get("summary") or "")
            games = int(m.group(1)) + int(m.group(2)) if m else 0
            return (cid, name, games) if games > 0 else None
        return None

    def listed_for(self, season: int, tid: str) -> list[tuple[str, str, int]]:
        key = (season, tid)
        if key not in self.listed:
            data = self.f.get(f"{CBB_CORE}/seasons/{season}/teams/{tid}/coaches", max_age=self._age(season)) or {}
            ids = [ref_id(it.get("$ref"), "coaches") for it in data.get("items", [])]
            self.listed[key] = [c for c in (self.check(season, cid, tid) for cid in ids if cid) if c]
        return self.listed[key]

    def for_team(self, season: int, tid: str) -> list[tuple[str, str, int]]:
        """[(coach id, name, games)] in the order they coached that season (an interim after the coach he replaced)."""
        found = self.listed_for(season, tid)
        if not found:
            near = {c[0] for s in (season - 1, season + 1) if s <= (self.current or season + 1) for c in self.listed_for(s, tid)}
            found = [c for c in (self.check(season, cid, tid) for cid in sorted(near)) if c]
        prev = {c[0] for c in self.listed.get((season - 1, tid), [])}
        return sorted(found, key=lambda c: (c[0] not in prev, -c[2]))


def cbb_tourney(st: int, c: dict, h: dict, a: dict) -> tuple[str, str]:
    """(tourney, round) from ESPN's tournament id and note: NCAA, NIT, CBI, CIT, CBC, POST, CONF or ''."""
    head = "; ".join((n.get("headline") or "") for n in c.get("notes", [])).strip()
    low = head.lower()
    tid = c.get("tournamentId")
    suffix = low.rsplit(" - ", 1)[-1] if " - " in low else ""
    rnd = ""
    for pat, code in ((r"first four|opening round", "FF"), (r"\b(1st|first) round", "R1"), (r"\b(2nd|second) round", "R2"),
                      (r"\b(3rd|third) round", "R3"), (r"quarterfinal", "QF"), (r"semifinal", "SF"), (r"final|championship", "F")):
        if suffix and re.search(pat, suffix):
            rnd = code
            break
    if tid == 22 or "men's basketball championship" in low:
        return "NCAA", rnd
    if tid == 21 or low.startswith("nit") or "national invitation" in low:
        return "NIT", rnd
    if low.startswith("cbi") or "college basketball invitational" in low:
        return "CBI", rnd
    if low.startswith("cit") or "collegeinsider" in low:
        return "CIT", rnd
    if "college basketball crown" in low:
        return "CBC", rnd
    if st == 3:
        return "POST", rnd
    hc, ac = h["team"].get("conferenceId"), a["team"].get("conferenceId")
    month = int(c.get("date", "0000-00")[5:7] or 0)
    if head and hc and hc == ac and month in (2, 3) and re.search(r"tournament|championship|playoffs|classic", low):
        return "CONF", rnd
    return "", ""


def ncaa_rounds(rows: list[dict]) -> None:
    """Name each NCAA tournament game's round from the bracket: games before the first round of 64 (the
    first game whose seeds add up to 17) are the First Four (or the old opening round), and a team's next
    games are R64, R32, S16, E8, F4 and the title game. ESPN's own notes renamed the rounds in 2011-2015,
    and ESPN sometimes leaves the seeds off a First Four game (2008, 2018), so neither is relied on."""
    games = sorted((r for r in rows if r["tourney"] == "NCAA"), key=lambda r: (r["start"], r["event_id"]))
    r64 = [r["start"] for r in games if r["home_seed"] and r["away_seed"] and int(r["home_seed"]) + int(r["away_seed"]) == 17]
    first_r64 = min(r64) if r64 else ""
    played: dict[str, int] = defaultdict(int)
    for r in games:
        k = max(played[r["home_id"]], played[r["away_id"]])
        if k == 0 and first_r64 and r["start"] < first_r64:
            r["round"] = "FF"
            continue
        r["round"] = NCAA_ROUNDS[min(k, len(NCAA_ROUNDS) - 1)]
        played[r["home_id"]] = played[r["away_id"]] = k + 1


def build(league: str, seasons: list[int], cache: str, current: int | None) -> list[dict]:
    f = Fetcher(cache, pace=0.05 if league == "cbb" else 0.0)
    sport, lg = LEAGUES[league]
    cbb_coaches = CbbCoaches(f, current) if league == "cbb" else None
    rows = []
    for season in seasons:
        evs = scoreboards(f, league, season, refresh_current=(season == current))
        done = []
        seen = set()
        for wk, post, e in evs:
            c = e["competitions"][0]
            if not c.get("status", {}).get("type", {}).get("completed"):
                continue
            h = next(x for x in c["competitors"] if x["homeAway"] == "home")
            a = next(x for x in c["competitors"] if x["homeAway"] == "away")
            if league == "cbb":
                try:
                    pts = float(h.get("score") or 0) + float(a.get("score") or 0)
                except ValueError:
                    continue
                key = (e["date"][:10], h["team"]["id"], a["team"]["id"])
                if pts < 40 or e["id"] in seen or key in seen:
                    continue  # forfeits, placeholders and ESPN's occasional duplicate listing
                seen.update({e["id"], key})
            done.append((wk, post, e, c, h, a))

        def odds(item):
            e, h, a = item[2], item[4], item[5]
            if league == "cbb" and not (h["team"].get("conferenceId") and a["team"].get("conferenceId")):
                return None  # a non-Division I opponent: no line
            return f.get(f"https://sports.core.api.espn.com/v2/sports/{sport}/leagues/{lg}/events/{e['id']}/competitions/{e['id']}/odds")

        with ThreadPoolExecutor(THREADS[league]) as ex:
            all_odds = list(ex.map(odds, done))
        coach_cache: dict[str, str] = {}
        if league == "cfb":
            team_ids = sorted({x[4]["team"]["id"] for x in done} | {x[5]["team"]["id"] for x in done})
            with ThreadPoolExecutor(8) as ex:
                for tid, name in zip(team_ids, ex.map(lambda t: coaches_for(f, season, t), team_ids)):
                    coach_cache[tid] = name
        cbb_staff: dict[str, list[tuple[str, str, int]]] = {}
        if league == "cbb":
            d1 = sorted({x["team"]["id"] for g in done for x in (g[4], g[5]) if x["team"].get("conferenceId")})
            with ThreadPoolExecutor(THREADS[league]) as ex:
                for tid, staff in zip(d1, ex.map(lambda t: cbb_coaches.for_team(season, t), d1)):
                    cbb_staff[tid] = staff
        games_seen: dict[str, int] = defaultdict(int)
        season_rows = []
        for (wk, post, e, c, h, a), od in sorted(zip(done, all_odds), key=lambda x: (x[0][2]["date"], x[0][2]["id"])):
            line, total, provider = pick_line(od, h["team"].get("abbreviation", ""), a["team"].get("abbreviation", ""), league)
            rank = lambda x: (x.get("curatedRank") or {}).get("current") or 99
            row = {
                "league": league, "season": season, "week": wk, "postseason": int(post), "start": e["date"],
                "event_id": e["id"], "home_id": h["team"]["id"], "home": h["team"].get("displayName", ""),
                "home_abbr": h["team"].get("abbreviation", ""), "away_id": a["team"]["id"], "away": a["team"].get("displayName", ""),
                "away_abbr": a["team"].get("abbreviation", ""), "home_pts": h.get("score", ""), "away_pts": a.get("score", ""),
                "neutral": int(bool(c.get("neutralSite"))), "conf_game": int(bool(c.get("conferenceCompetition"))),
                "home_rank": rank(h) if league == "cfb" else "", "away_rank": rank(a) if league == "cfb" else "",
                "home_line": "" if line is None else line, "total": "" if total is None else total, "provider": provider or "",
                "home_coach": coach_cache.get(h["team"]["id"], ""), "away_coach": coach_cache.get(a["team"]["id"], ""),
            }
            if league != "cbb":
                row.update(extras(e))
            if league == "cbb":
                st = e.get("season", {}).get("type", 2)
                tourney, rnd = cbb_tourney(st, c, h, a)
                for side, x in (("home", h), ("away", a)):
                    tid = x["team"]["id"]
                    r = rank(x)
                    # in the NCAA tournament ESPN's rank field carries the seed; elsewhere it's the AP rank
                    row[f"{side}_seed"] = r if tourney == "NCAA" and r <= 16 else ""
                    row[f"{side}_rank"] = r if tourney != "NCAA" and r <= 25 else ""
                    row[f"{side}_conf"] = x["team"].get("conferenceId") or ""
                    staff = cbb_staff.get(tid) or []
                    # games in date order: the first coach's games first, then the next (mid-season changes)
                    k = games_seen[tid]
                    games_seen[tid] += 1
                    who = staff[-1] if staff else ("", "", 0)
                    acc = 0
                    for s in staff:
                        acc += s[2]
                        if k < acc:
                            who = s
                            break
                    row[f"{side}_coach_id"], row[f"{side}_coach"] = who[0], who[1]
                row["tourney"], row["round"] = tourney, rnd
            season_rows.append(row)
        if league == "cbb":
            ncaa_rounds(season_rows)
        rows.extend(season_rows)
        with_lines = sum(1 for r in season_rows if r["home_line"] != "")
        print(f"{league} {season}: {len(season_rows)} finished games, {with_lines} with a line", flush=True)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", choices=list(LEAGUES), required=True)
    ap.add_argument("--seasons", required=True, help="e.g. 2016-2025")
    ap.add_argument("--current", type=int, default=0, help="the in-progress season, re-fetched each run")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--backfill", action="store_true", help="college football and NBA: add the D-120 columns to --out in place")
    args = ap.parse_args()
    if args.backfill:
        backfill(args.league, args.out, args.cache)
        return
    a, _, b = args.seasons.partition("-")
    seasons = list(range(int(a), int(b or a) + 1))
    rows = build(args.league, seasons, args.cache, args.current or None)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS_CBB if args.league == "cbb" else FIELDS_EXTRA)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["start"], r["event_id"])))
    print(f"wrote {len(rows)} games to {args.out}")


if __name__ == "__main__":
    main()
