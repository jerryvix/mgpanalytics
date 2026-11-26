"""Each team's record this season against the spread and on the total (D-127), for the Analyst.

The owner found an Analyst answer whose numbers didn't add up: it searched the web for the Bills'
ATS record and mixed a count from before their last game with one after it. MGP already has every
game and closing line the game lines use (D-075), so the daily job stores each team's season here and
the Analyst reads it as MGP data: one source, one window, records that add up.

Same games and lines as the engines: nflverse for the NFL (spread_line, total_line), ESPN history for
college football and the NBA (home_line, total). A team covers when its margin plus its line is above
zero; a push is a tie. Regular season and postseason both count.

  team_records.py --nflverse games.csv --nfl-season 2026
                  --cfb data/history/cfb_espn.csv cfb_current.csv --cfb-season 2026
                  --nba data/history/nba_espn.csv nba_current.csv --nba-season 2027 --json out.json
  team_records.py --self-test
"""
import argparse
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

NFL_NAMES = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers", "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings", "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}
FRANCHISE = {"OAK": "LV", "SD": "LAC", "STL": "LA"}
ET = timezone(timedelta(hours=-5))
LOG_GAMES = 10   # the most recent games listed game by game


def sign(x: float) -> int:
    return (x > 0) - (x < 0)


def fmt_line(x: float) -> str:
    return "PK" if x == 0 else f"{x:+g}"


def tally(games: list[dict], key: str) -> str:
    w = sum(1 for g in games if g[key] == 1)
    l = sum(1 for g in games if g[key] == -1)
    p = sum(1 for g in games if g[key] == 0)
    return f"{w}-{l}" + (f"-{p}" if p else "")


def nfl_games(path: str, season: int) -> list[dict]:
    out = []
    for r in csv.DictReader(open(path)):
        if int(r["season"]) != season or r["result"] == "" or r["spread_line"] == "":
            continue
        spread, result = float(r["spread_line"]), float(r["result"])   # home favored by; home minus away
        total = float(r["total"]) - float(r["total_line"]) if r["total_line"] else None
        for side in ("home", "away"):
            home = side == "home"
            team = FRANCHISE.get(r[f"{side}_team"], r[f"{side}_team"])
            opp = FRANCHISE.get(r["away_team" if home else "home_team"], r["away_team" if home else "home_team"])
            margin = result if home else -result
            line = -spread if home else spread
            out.append({
                "team": team, "name": NFL_NAMES.get(team, team), "opp": opp, "date": r["gameday"],
                "site": "neutral" if r["location"] == "Neutral" else ("home" if home else "road"),
                "pts": int(r[f"{side}_score"]), "opp_pts": int(r["away_score" if home else "home_score"]),
                "line": line, "ats": sign(margin + line), "total_line": float(r["total_line"]) if r["total_line"] else None,
                "ou": sign(total) if total is not None else None, "post": r["game_type"] != "REG",
            })
    return out


def espn_games(paths: list[str], season: int) -> list[dict]:
    seen, out = set(), []
    for path in paths:
        for r in csv.DictReader(open(path)):
            if int(r["season"]) != season or r["home_pts"] == "" or r["home_line"] == "" or r["event_id"] in seen:
                continue
            seen.add(r["event_id"])
            hp, ap, hl = int(float(r["home_pts"])), int(float(r["away_pts"])), float(r["home_line"])
            total = float(r["total"]) if r["total"] else None
            day = datetime.fromisoformat(r["start"].replace("Z", "+00:00")).astimezone(ET).date().isoformat()
            for side in ("home", "away"):
                home = side == "home"
                pts, opp_pts = (hp, ap) if home else (ap, hp)
                line = hl if home else -hl
                out.append({
                    "team": r[f"{side}_abbr"], "name": r[side], "opp": r["away_abbr" if home else "home_abbr"], "date": day,
                    "site": "neutral" if r["neutral"] == "1" else ("home" if home else "road"),
                    "pts": pts, "opp_pts": opp_pts, "line": line, "ats": sign(pts - opp_pts + line),
                    "total_line": total, "ou": sign(hp + ap - total) if total is not None else None, "post": r["postseason"] == "1",
                })
    return out


def records(sport: str, season: int, games: list[dict]) -> list[dict]:
    by_team: dict[str, list[dict]] = defaultdict(list)
    for g in games:
        by_team[g["team"]].append(g)
    teams = []
    for team, gs in by_team.items():
        gs.sort(key=lambda g: g["date"])
        decided = [g for g in gs if g["ats"] != 0]
        rate = sum(1 for g in decided if g["ats"] == 1) / len(decided) if decided else 0.5
        teams.append((team, gs, rate))
    # Rank among teams with at least half the most games played, so a 2-0 start doesn't top the list
    most = max((len(gs) for _, gs, _ in teams), default=0)
    ranked = sorted((t for t in teams if len(t[1]) * 2 >= most), key=lambda t: -t[2])
    out = []
    for team, gs, rate in teams:
        rank = None
        if len(gs) * 2 >= most:
            better = sum(1 for t in ranked if t[2] > rate + 1e-9)
            tied = sum(1 for t in ranked if abs(t[2] - rate) <= 1e-9)
            rank = {"place": better + 1, "tied": tied > 1, "of": len(ranked)}
        ou = [g for g in gs if g["ou"] is not None]
        log = [{
            "date": g["date"], "opp": g["opp"], "site": g["site"], "line": fmt_line(g["line"]),
            "score": f"{g['pts']}-{g['opp_pts']}", "su": "W" if g["pts"] > g["opp_pts"] else ("L" if g["pts"] < g["opp_pts"] else "T"),
            "ats": {1: "covered", -1: "didn't cover", 0: "push"}[g["ats"]],
            "total": g["total_line"], "ou": None if g["ou"] is None else {1: "over", -1: "under", 0: "push"}[g["ou"]],
            "post": g["post"],
        } for g in gs[-LOG_GAMES:]]
        out.append({
            "sport": sport, "season": season, "team": team, "team_name": gs[-1]["name"], "through": gs[-1]["date"],
            "record": {
                "games": len(gs),
                "su": f"{sum(1 for g in gs if g['pts'] > g['opp_pts'])}-{sum(1 for g in gs if g['pts'] < g['opp_pts'])}"
                      + (f"-{sum(1 for g in gs if g['pts'] == g['opp_pts'])}" if any(g["pts"] == g["opp_pts"] for g in gs) else ""),
                "ats": tally(gs, "ats"), "ats_rank": rank,
                "ou": tally(ou, "ou"), "ou_games": len(ou),
                "home_ats": tally([g for g in gs if g["site"] == "home"], "ats"),
                "road_ats": tally([g for g in gs if g["site"] == "road"], "ats"),
                "neutral_ats": tally([g for g in gs if g["site"] == "neutral"], "ats"),
                "fav_ats": tally([g for g in gs if g["line"] < 0], "ats"),
                "dog_ats": tally([g for g in gs if g["line"] > 0], "ats"),
                "last5_ats": tally(gs[-5:], "ats"),
                "log": log,
            },
        })
    return out


def self_test() -> None:
    games = []
    # Team A: 3 covers, 1 miss, 1 push; Team B the other side of each
    for i, (a_pts, b_pts, a_line, total) in enumerate([(24, 17, -3, 40), (20, 21, 2.5, 44), (10, 14, -3, 20),
                                                       (31, 28, -3, 59.5), (27, 13, -7, 41.5)]):
        for team, opp, pts, opp_pts, line, site in (("A", "B", a_pts, b_pts, a_line, "home"), ("B", "A", b_pts, a_pts, -a_line, "road")):
            games.append({"team": team, "name": team, "opp": opp, "date": f"2026-09-0{i + 1}", "site": site, "pts": pts, "opp_pts": opp_pts,
                          "line": line, "ats": sign(pts - opp_pts + line), "total_line": total, "ou": sign(a_pts + b_pts - total), "post": False})
    recs = {r["team"]: r["record"] for r in records("NFL", 2026, games)}
    a, b = recs["A"], recs["B"]
    assert a["ats"] == "3-1-1" and b["ats"] == "1-3-1", (a["ats"], b["ats"])
    assert a["ou"] == b["ou"] == "2-3", a["ou"]          # 41 vs 40 over, 41/44 under, 24/20 over, 59/59.5 under, 40/41.5 under
    assert a["su"] == "3-2" and b["su"] == "2-3", (a["su"], b["su"])
    assert a["fav_ats"] == "2-1-1" and a["dog_ats"] == "1-0", (a["fav_ats"], a["dog_ats"])
    assert a["ats_rank"] == {"place": 1, "tied": False, "of": 2}, a["ats_rank"]
    assert a["log"][0] == {"date": "2026-09-01", "opp": "B", "site": "home", "line": "-3", "score": "24-17", "su": "W",
                           "ats": "covered", "total": 40, "ou": "over", "post": False}, a["log"][0]
    # Every record's parts add up to its games
    for r in recs.values():
        assert sum(int(x) for x in r["ats"].split("-")) == r["games"]
        assert sum(int(x) for x in r["ou"].split("-")) == r["ou_games"]
    print("self-test passed")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--nflverse", default="")
    ap.add_argument("--nfl-season", type=int, default=0)
    ap.add_argument("--cfb", nargs="*", default=[])
    ap.add_argument("--cfb-season", type=int, default=0)
    ap.add_argument("--nba", nargs="*", default=[])
    ap.add_argument("--nba-season", type=int, default=0)
    ap.add_argument("--json", default="")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    out = []
    if args.nflverse:
        out += records("NFL", args.nfl_season, nfl_games(args.nflverse, args.nfl_season))
    if args.cfb:
        out += records("NCAAF", args.cfb_season, espn_games(args.cfb, args.cfb_season))
    if args.nba:
        out += records("NBA", args.nba_season, espn_games(args.nba, args.nba_season))
    print(f"{len(out)} team records", file=sys.stderr)
    if args.json:
        json.dump(out, open(args.json, "w"))
    else:
        json.dump(out, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
