"""NBA player box scores from ESPN's public game summaries (free, no key), for the player
lines engine (DECISIONS D-105).

For every finished game in an espn_history.py CSV (data/history/nba_espn.csv for completed
seasons, the daily run's nba_current.csv for this one), one row per player who played:
minutes, points, rebounds, assists, threes, steals, blocks, turnovers and whether he
started. Players who sat (DNP, inactive) get no row, which is how "without a teammate"
is measured.

Full summaries are about 400 KB each, so only the compact rows are cached, one small
JSON file per game under <cache>/nba-box/ (the workflow keeps the cache in actions/cache).
A finished game's box score doesn't change, so a cached game is never fetched again.

Usage:
  python3 -I scripts/angles/nba_boxes.py --games data/history/nba_espn.csv --out data/history/nba_players_espn.csv --cache ~/.cache/espn-history --no-names
  python3 -I scripts/angles/nba_boxes.py --games game-lines-out/nba_current.csv --out game-lines-out/nba_players_current.csv --cache ~/.cache/espn-history
"""
import argparse
import csv
import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}
FIELDS = ["event_id", "team_id", "athlete_id", "name", "starter", "min", "pts", "reb", "ast", "fg3", "stl", "blk", "tov"]
HOSTS = ["site.api.espn.com", "site.web.api.espn.com"]


def get_json(url: str):
    err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            err = e
        except Exception as e:  # network hiccup: back off and retry
            err = e
        time.sleep(1.5 * 2 ** attempt)
    raise RuntimeError(f"{url}: {err}")


def parse_box(summary: dict, event_id: str) -> list[dict]:
    """Compact rows for everyone who played, from an ESPN summary's boxscore.players."""
    rows = []
    for team in (summary or {}).get("boxscore", {}).get("players", []):
        tid = str(team.get("team", {}).get("id", ""))
        for block in team.get("statistics", []):
            keys = block.get("keys") or []
            idx = {k: i for i, k in enumerate(keys)}
            if "points" not in idx or "minutes" not in idx:
                continue
            for a in block.get("athletes", []):
                stats = a.get("stats") or []
                if a.get("didNotPlay") or len(stats) != len(keys):
                    continue
                val = lambda k: stats[idx[k]] if k in idx else ""
                try:
                    mins = int(float(val("minutes") or 0))
                    fg3 = int(str(val("threePointFieldGoalsMade-threePointFieldGoalsAttempted")).split("-")[0] or 0)
                    row = {"event_id": event_id, "team_id": tid, "athlete_id": str(a["athlete"]["id"]),
                           "name": a["athlete"].get("displayName", ""), "starter": int(bool(a.get("starter"))), "min": mins,
                           "pts": int(val("points")), "reb": int(val("rebounds")), "ast": int(val("assists")), "fg3": fg3,
                           "stl": int(val("steals")), "blk": int(val("blocks")), "tov": int(val("turnovers"))}
                except (ValueError, KeyError, IndexError):
                    continue  # a malformed line (e.g. "--"): leave the player out rather than guess
                rows.append(row)
    return rows


def box_for(event_id: str, cache: str) -> list[dict] | None:
    path = os.path.join(cache, "nba-box", f"{event_id}.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    for host in HOSTS:
        try:
            data = get_json(f"https://{host}/apis/site/v2/sports/basketball/nba/summary?event={event_id}")
        except RuntimeError:
            continue
        rows = parse_box(data, event_id) if data else []
        if rows:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                json.dump(rows, f, separators=(",", ":"))
            return rows
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", required=True, nargs="+", help="espn_history.py CSVs (finished games)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--no-names", action="store_true", help="leave names out (the committed history file; names come from this season's rows)")
    args = ap.parse_args()
    events = []
    for p in args.games:
        for r in csv.DictReader(open(p)):
            if r["home_pts"] != "" and r["away_pts"] != "":
                events.append(r["event_id"])
    events = list(dict.fromkeys(events))
    done = 0
    out: list[dict] = []
    missing = []
    with ThreadPoolExecutor(args.workers) as ex:
        for ev, rows in zip(events, ex.map(lambda e: box_for(e, args.cache), events)):
            done += 1
            if rows is None:
                missing.append(ev)
            else:
                out.extend(rows)
            if done % 500 == 0:
                print(f"{done}/{len(events)} games", flush=True)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    fields = [f for f in FIELDS if not (args.no_names and f == "name")]
    with open(args.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(out)
    print(f"wrote {len(out)} player rows from {len(events) - len(missing)} games to {args.out}"
          + (f"; no box score for {len(missing)}: {' '.join(missing[:10])}" if missing else ""))


if __name__ == "__main__":
    main()
