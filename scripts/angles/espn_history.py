"""Game history with betting lines from ESPN's public APIs (free, no key), for the
one-line-per-game engines (DECISIONS D-075, D-078).

For each finished game: date, teams, score, neutral site, conference game, AP rank
at game time, the pregame spread and total, and (college football) each team's head
coach that season. Lines come from ESPN's odds feed; the first pregame provider in
PROVIDER_ORDER that has a spread is used, and live odds are ignored.

Usage:
  python3 -I scripts/angles/espn_history.py --league cfb --seasons 2016-2025 --out data/history/cfb_espn.csv --cache <dir>
  python3 -I scripts/angles/espn_history.py --league nba --seasons 2023-2026 --out data/history/nba_espn.csv --cache <dir>
NBA seasons are named by the year they end (2026 = 2025-26), as ESPN does.
"""
import argparse
import csv
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}
LEAGUES = {
    "cfb": ("football", "college-football"),
    "nba": ("basketball", "nba"),
}
PROVIDER_ORDER = ["DraftKings", "ESPN BET", "consensus", "teamrankings", "Caesars Sportsbook (New Jersey)",
                  "Caesars Sportsbook (Colorado)", "William Hill (New Jersey)", "Westgate", "BOVADA.lv", "BetfairSportsbook"]
FIELDS = ["league", "season", "week", "postseason", "start", "event_id", "home_id", "home", "home_abbr", "away_id", "away",
          "away_abbr", "home_pts", "away_pts", "neutral", "conf_game", "home_rank", "away_rank", "home_line", "total",
          "provider", "home_coach", "away_coach"]


class Fetcher:
    def __init__(self, cache: str):
        self.cache = cache
        os.makedirs(cache, exist_ok=True)

    def get(self, url: str, refresh: bool = False):
        path = os.path.join(self.cache, hashlib.sha1(url.encode()).hexdigest() + ".json")
        if not refresh and os.path.exists(path):
            with open(path) as f:
                return json.load(f)
        err = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                    data = json.load(r)
                with open(path, "w") as f:
                    json.dump(data, f)
                return data
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                err = e
            except Exception as e:  # network hiccup: back off and retry
                err = e
            time.sleep(1.5 * 2 ** attempt)
        raise RuntimeError(f"{url}: {err}")


def pick_line(odds: dict | None, home_abbr: str, away_abbr: str):
    """(home_line, total, provider) from ESPN's odds items, or (None, None, None)."""
    items = (odds or {}).get("items", [])
    items = [i for i in items if "live" not in (i.get("provider", {}).get("name", "").lower())]
    rank = {name: n for n, name in enumerate(PROVIDER_ORDER)}
    items.sort(key=lambda i: rank.get(i.get("provider", {}).get("name", ""), 99))
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
        d, end = date(season - 1, 10, 1), min(date(season, 6, 30), date.today())
        days = []
        while d <= end:
            days.append(d)
            d += timedelta(days=1)
        with ThreadPoolExecutor(8) as ex:
            pages = list(ex.map(lambda day: (day, f.get(f"{base}?dates={day:%Y%m%d}", refresh=refresh_current and day >= date.today() - timedelta(days=3))), days))
        for day, data in pages:
            for e in (data or {}).get("events", []):
                st = e.get("season", {}).get("type", 2)
                if st in (2, 3, 5):  # regular season, playoffs, play-in
                    events.append((0, st != 2, e))
    return events


def coaches_for(f: Fetcher, season: int, team_id: str) -> str:
    url = f"https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/{season}/teams/{team_id}/coaches"
    data = f.get(url)
    items = (data or {}).get("items", [])
    if not items:
        return ""
    c = f.get(items[0]["$ref"].replace("http://", "https://"))
    return f"{(c or {}).get('firstName', '')} {(c or {}).get('lastName', '')}".strip()


def build(league: str, seasons: list[int], cache: str, current: int | None) -> list[dict]:
    f = Fetcher(cache)
    sport, lg = LEAGUES[league]
    rows = []
    for season in seasons:
        evs = scoreboards(f, league, season, refresh_current=(season == current))
        done = []
        for wk, post, e in evs:
            c = e["competitions"][0]
            if not c.get("status", {}).get("type", {}).get("completed"):
                continue
            h = next(x for x in c["competitors"] if x["homeAway"] == "home")
            a = next(x for x in c["competitors"] if x["homeAway"] == "away")
            done.append((wk, post, e, c, h, a))

        def odds(item):
            e = item[2]
            return f.get(f"https://sports.core.api.espn.com/v2/sports/{sport}/leagues/{lg}/events/{e['id']}/competitions/{e['id']}/odds")

        with ThreadPoolExecutor(8) as ex:
            all_odds = list(ex.map(odds, done))
        coach_cache: dict[str, str] = {}
        if league == "cfb":
            team_ids = sorted({x[4]["team"]["id"] for x in done} | {x[5]["team"]["id"] for x in done})
            with ThreadPoolExecutor(8) as ex:
                for tid, name in zip(team_ids, ex.map(lambda t: coaches_for(f, season, t), team_ids)):
                    coach_cache[tid] = name
        for (wk, post, e, c, h, a), od in zip(done, all_odds):
            line, total, provider = pick_line(od, h["team"].get("abbreviation", ""), a["team"].get("abbreviation", ""))
            rank = lambda x: (x.get("curatedRank") or {}).get("current") or 99
            rows.append({
                "league": league, "season": season, "week": wk, "postseason": int(post), "start": e["date"],
                "event_id": e["id"], "home_id": h["team"]["id"], "home": h["team"].get("displayName", ""),
                "home_abbr": h["team"].get("abbreviation", ""), "away_id": a["team"]["id"], "away": a["team"].get("displayName", ""),
                "away_abbr": a["team"].get("abbreviation", ""), "home_pts": h.get("score", ""), "away_pts": a.get("score", ""),
                "neutral": int(bool(c.get("neutralSite"))), "conf_game": int(bool(c.get("conferenceCompetition"))),
                "home_rank": rank(h) if league == "cfb" else "", "away_rank": rank(a) if league == "cfb" else "",
                "home_line": "" if line is None else line, "total": "" if total is None else total, "provider": provider or "",
                "home_coach": coach_cache.get(h["team"]["id"], ""), "away_coach": coach_cache.get(a["team"]["id"], ""),
            })
        with_lines = sum(1 for r in rows if r["season"] == season and r["home_line"] != "")
        print(f"{league} {season}: {sum(1 for r in rows if r['season'] == season)} finished games, {with_lines} with a line", flush=True)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", choices=list(LEAGUES), required=True)
    ap.add_argument("--seasons", required=True, help="e.g. 2016-2025")
    ap.add_argument("--current", type=int, default=0, help="the in-progress season, re-fetched each run")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", required=True)
    args = ap.parse_args()
    a, _, b = args.seasons.partition("-")
    seasons = list(range(int(a), int(b or a) + 1))
    rows = build(args.league, seasons, args.cache, args.current or None)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["start"], r["event_id"])))
    print(f"wrote {len(rows)} games to {args.out}")


if __name__ == "__main__":
    main()
