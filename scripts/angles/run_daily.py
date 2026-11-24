"""The daily game-lines job (DECISIONS D-075, D-078), run by .github/workflows/game-lines.yml.

1. Refresh this season's ESPN history for college football and the NBA (completed seasons
   are committed under data/history/).
2. Run the three engines: NFL (nflverse), college football and NBA (ESPN).
3. Post the one line per game to the ingest-game-lines function with the run's GitHub
   OIDC token. With --dry-run, print instead of posting.
"""
import argparse
import json
import os
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
            lines.append({"espn_event_id": str(g["espn_event_id"]), "sport": g["sport"], "matchup": g["matchup"],
                          "starts_at": g["starts_at"], "line_text": b["text"], "supports": b["supports"],
                          "market": b["market"], "record": b["record"], "tier": b.get("tier", "strong")})
    print(f"{len(lines)} lines", flush=True)
    if args.dry_run or not args.ingest_url:
        for l in lines:
            print(f"  {l['sport']:5} {l['matchup']}: {l['line_text']}  ->  {l['supports']}")
        return
    req = urllib.request.Request(args.ingest_url, data=json.dumps({"lines": lines}).encode(), method="POST", headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + oidc("mgp-ingest-game-lines")})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print("ingest:", r.read().decode())
    except urllib.error.HTTPError as e:
        print("ingest failed:", e.code, e.read().decode()[:300])
        sys.exit(1)


if __name__ == "__main__":
    main()
