"""The daily game-lines job (DECISIONS D-075, D-078, D-105), run by .github/workflows/game-lines.yml.

1. Refresh this season's ESPN history for college football and the NBA (completed seasons
   are committed under data/history/).
2. Run the three engines: NFL (nflverse), college football and NBA (ESPN).
3. Post the one line per game to the ingest-game-lines function with the run's GitHub
   OIDC token. With --dry-run, print instead of posting.
4. Player lines (D-105, D-106): refresh this season's NBA box scores, run player_angles.py for the
   NFL (next 7 days) and the NBA (next 2 days), and post each game's verified candidates to
   ingest-player-lines the same way, where the judge picks the line each game shows. A failure
   here doesn't undo the game lines already stored.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def run(args: list[str]) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run([sys.executable, "-I", *args], check=True)


def oidc(audience: str) -> str:
    url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=" + audience
    req = urllib.request.Request(url, headers={"Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["value"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="game-lines-out")
    ap.add_argument("--cache", default=os.path.expanduser("~/.cache/espn-history"))
    ap.add_argument("--nflverse", required=True, help="path to nflverse data/games.csv")
    ap.add_argument("--cfb-season", type=int, required=True)
    ap.add_argument("--nba-season", type=int, required=True, help="the year the NBA season ends, ESPN style")
    ap.add_argument("--ingest-url", default="")
    ap.add_argument("--nflverse-dir", default="", help="directory with nflverse player files for the player lines (D-105)")
    ap.add_argument("--player-ingest-url", default="")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.work, exist_ok=True)
    w = lambda name: os.path.join(args.work, name)
    hist = os.path.join(ROOT, "data", "history")

    run([os.path.join(HERE, "espn_history.py"), "--league", "cfb", "--seasons", str(args.cfb_season), "--current", str(args.cfb_season),
         "--out", w("cfb_current.csv"), "--cache", args.cache])
    run([os.path.join(HERE, "espn_history.py"), "--league", "nba", "--seasons", str(args.nba_season), "--current", str(args.nba_season),
         "--out", w("nba_current.csv"), "--cache", args.cache])
    run([os.path.join(HERE, "nfl_angles.py"), "--games", args.nflverse, "--season", str(args.cfb_season), "--json", w("nfl.json")])
    run([os.path.join(HERE, "espn_angles.py"), "--league", "cfb", "--history", os.path.join(hist, "cfb_espn.csv"), w("cfb_current.csv"),
         "--coaches", os.path.join(hist, "cfb_coaches_cfbd.json"), "--season", str(args.cfb_season), "--days", "7", "--json", w("cfb.json")])
    run([os.path.join(HERE, "espn_angles.py"), "--league", "nba", "--history", os.path.join(hist, "nba_espn.csv"), w("nba_current.csv"),
         "--season", str(args.nba_season), "--days", "2", "--json", w("nba.json")])

    lines = []
    for name in ("nfl.json", "cfb.json", "nba.json"):
        for g in json.load(open(w(name))):
            b = g.get("best")
            if not b or not g.get("espn_event_id"):
                continue
            shown = re.search(r"\d+-\d+(?:-\d+)?", b["text"])  # the record as the sentence states it (unders flip it)
            lines.append({"espn_event_id": str(g["espn_event_id"]), "sport": g["sport"], "matchup": g["matchup"],
                          "starts_at": g["starts_at"], "line_text": b["text"], "supports": b["supports"],
                          "market": b["market"], "record": shown.group(0) if shown else b["record"], "tier": b.get("tier", "strong")})
    print(f"{len(lines)} lines", flush=True)
    if args.dry_run or not args.ingest_url:
        for l in lines:
            print(f"  {l['sport']:5} {l['matchup']}: {l['line_text']}  ->  {l['supports']}")
    else:
        post(args.ingest_url, "mgp-ingest-game-lines", {"lines": lines})

    if args.nflverse_dir:
        try:
            player_lines(args, w, hist)
        except (subprocess.CalledProcessError, OSError, ValueError, RuntimeError) as e:
            print("player lines failed:", e, flush=True)
            sys.exit(1)


def player_lines(args, w, hist: str) -> None:
    """D-105, D-106: each upcoming NFL and NBA game's verified candidates, judged and stored by ingest-player-lines."""
    run([os.path.join(HERE, "nba_boxes.py"), "--games", w("nba_current.csv"), "--out", w("nba_players_current.csv"),
         "--teams-out", w("nba_team_games_current.csv"), "--cache", args.cache])
    run([os.path.join(HERE, "player_angles.py"), "--league", "nfl", "--nflverse", args.nflverse_dir, "--season", str(args.cfb_season),
         "--days", "7", "--json", w("nfl_players.json")])
    run([os.path.join(HERE, "player_angles.py"), "--league", "nba",
         "--history", os.path.join(hist, "nba_espn.csv"), w("nba_current.csv"),
         "--boxes", os.path.join(hist, "nba_players_espn.csv"), w("nba_players_current.csv"),
         "--teams", os.path.join(hist, "nba_team_games_espn.csv"), w("nba_team_games_current.csv"),
         "--season", str(args.nba_season), "--days", "2", "--json", w("nba_players.json")])
    games = []
    for name in ("nfl_players.json", "nba_players.json"):
        for g in json.load(open(w(name))):
            if g.get("props"):   # a game with no props posted yet keeps whatever it had
                games.append({k: g[k] for k in ("espn_event_id", "sport", "starts_at", "matchup", "context", "candidates")})
    print(f"{sum(len(g['candidates']) for g in games)} verified candidates for {len(games)} games", flush=True)
    if args.dry_run or not args.player_ingest_url:
        for g in games:
            for c in g["candidates"][:3]:
                print(f"  {g['sport']:4} {g['espn_event_id']} [{c['family']}] {c['sentence']}" + (f"  | {c['ticker']}" if c["ticker"] else ""))
        return
    # D-106: the judge picks each game's line in ingest-player-lines; a few games per call keeps each call
    # short, and the angle types already shown travel with the batches so the slate stays varied
    used, usage = {}, {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
    for i in range(0, len(games), 4):
        out = post(args.player_ingest_url, "mgp-ingest-player-lines", {"games": games[i:i + 4], "angle_types_used": used})
        used = out.get("angle_types_used", used)
        for k in usage:
            usage[k] += out.get("usage", {}).get(k, 0)
        for c in out.get("chosen", []):
            print(f"  {c['espn_event_id']} [{c['by']}] {c['text']}" + (f"  | {c['ticker']}" if c.get("ticker") else ""), flush=True)
    print(f"judge: {usage['input_tokens']} input and {usage['output_tokens']} output tokens, about ${usage['cost_usd']:.4f}", flush=True)


def post(url: str, audience: str, payload: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + oidc(audience)})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        print("ingest failed:", e.code, e.read().decode()[:300])
        sys.exit(1)
    print("ingest:", body[:300], flush=True)
    try:
        return json.loads(body)
    except ValueError:
        return {}


if __name__ == "__main__":
    main()
