"""The one line per game (DECISIONS D-075): the strongest true angle for a matchup, from
every NFL game since 1999 with its closing line, coaches and starting QBs (nflverse,
free). No AI and no cost: every number is computed here and recomputed by the check
pass before it can be shown.

For each upcoming game it builds every angle that is TRUE for this game (the coach
as a home favorite, the QB against this opponent, the team after a loss, ...), for the
spread and the total, for both teams. An angle needs a real sample, recent games and
at most two conditions. They're scored by how far the record sits from a coin flip,
and the strongest one is written as one plain sentence with its record and time frame.

Usage: python3 scripts/angles/nfl_angles.py --games <path to nflverse data/games.csv> --week 12 [--season 2026] [--json out.json]
"""
import argparse
import csv
import json
import math
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


def franchise(t: str) -> str:
    return FRANCHISE.get(t, t)


def is_prime(r: dict) -> bool:
    return r["weekday"] in ("Monday", "Thursday") or (r["gametime"] or "00:00") >= "19:00"


def is_thanksgiving(r: dict) -> bool:
    return r["weekday"] == "Thursday" and r["gameday"][5:7] == "11" and 22 <= int(r["gameday"][8:10]) <= 28


def load(path: str):
    games = list(csv.DictReader(open(path)))
    games.sort(key=lambda r: (r["gameday"], r["gametime"] or ""))
    rows: list[Row] = []
    last_result: dict[tuple[str, str], str] = {}
    for r in games:
        if r["game_type"] not in ("REG", "WC", "DIV", "CON", "SB"):
            continue
        done = r["result"] != "" and r["spread_line"] != ""
        for side in ("home", "away"):
            team, opp = franchise(r[f"{side}_team"]), franchise(r["away_team" if side == "home" else "home_team"])
            if not done:
                continue
            spread = float(r["spread_line"])          # home favored by this much
            result = float(r["result"])               # home score minus away score
            margin = (result - spread) if side == "home" else (spread - result)
            total = float(r["total"]) - float(r["total_line"]) if r["total_line"] else 0.0
            key = (team, r["season"])
            rows.append(Row(
                season=int(r["season"]), week=int(r["week"]), gameday=r["gameday"], team=team, opp=opp,
                home=side == "home", line=-spread if side == "home" else spread,
                ats=(margin > 0) - (margin < 0), ou=(total > 0) - (total < 0) if r["total_line"] else 0,
                coach=r[f"{side}_coach"], qb=r[f"{side}_qb_name"], div=r["div_game"] == "1",
                prime=is_prime(r), thanksgiving=is_thanksgiving(r),
                rest=int(r[f"{side}_rest"] or 7), prev=last_result.get(key, ""),
                res="W" if (result > 0) == (side == "home") and result != 0 else ("T" if result == 0 else "L"),
            ))
        if done:
            res = float(r["result"])
            for side in ("home", "away"):
                team = franchise(r[f"{side}_team"])
                won = res > 0 if side == "home" else res < 0
                last_result[(team, r["season"])] = "W" if won else ("L" if res != 0 else "T")
    return games, rows


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
        return frozenset("fd" if k == "big" else k for k in self.kinds) or frozenset({"season"})

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


def build_angles(game: dict, rows: list[Row], season: int) -> list[Angle]:
    """Every angle that holds for this game, scored. Both teams, spread and total."""
    out: list[Angle] = []
    spread = float(game["spread_line"])
    total_line = float(game["total_line"]) if game["total_line"] else None
    prime, thanks = is_prime(game), is_thanksgiving(game)
    div = game["div_game"] == "1"
    for side in ("home", "away"):
        team, opp = franchise(game[f"{side}_team"]), franchise(game["away_team" if side == "home" else "home_team"])
        line = -spread if side == "home" else spread
        fav = line < 0
        coach, qb = game[f"{side}_coach"], game[f"{side}_qb_name"]
        rest = int(game[f"{side}_rest"] or 7)
        team_rows = [r for r in rows if r.team == team]
        prev = max((r for r in team_rows if r.season == season), key=lambda r: r.gameday, default=None)
        prev_res = prev.res if prev else ""
        name = TEAM_NAMES[team]
        opp_name = TEAM_NAMES[opp]
        side_label = f"{game[f'{side}_team']} {fmt_line(line)}"

        # Conditions that are true for this game: (kind, phrase, predicate)
        role = "home" if side == "home" else "road"
        fd = "favorite" if fav else "underdog"
        conds = [
            ("role", "at home" if side == "home" else "on the road", lambda r, h=(side == "home"): r.home == h),
            ("fd", f"as a{'n' if fd == 'underdog' else ''} {fd}", lambda r, f=fav: (r.line < 0) == f),
            ("opp", f"against the {opp_name}", lambda r, o=opp: r.opp == o),
        ]
        if div:
            conds.append(("div", "in division games", lambda r: r.div))
        if prime:
            conds.append(("prime", "in prime time", lambda r: r.prime))
        if thanks:
            conds.append(("thanks", "on Thanksgiving", lambda r: r.thanksgiving))
        if rest >= 13:
            conds.append(("rest", "off a bye", lambda r: r.rest >= 13))
        if rest <= 5:
            conds.append(("rest", "on a short week", lambda r: r.rest <= 5))
        if prev_res in ("W", "L"):
            conds.append(("prev", "after a loss" if prev_res == "L" else "after a win", lambda r, pr=prev_res: r.prev == pr))
        if abs(line) >= 7:
            conds.append(("big", f"as a{'n' if fd == 'underdog' else ''} {fd} of 7 or more", lambda r, f=fav: (r.line <= -7) if f else (r.line >= 7)))

        def phrase_for(combo) -> str:
            kinds = {k for k, _, _ in combo}
            parts = []
            if "role" in kinds and ("fd" in kinds or "big" in kinds):
                big = " of 7 or more" if "big" in kinds else ""
                parts.append(f"as a {role} {fd}{big}")
            for k, ph, _ in combo:
                if k in ("role", "fd", "big") and parts and parts[0].startswith("as a "):
                    continue
                parts.append(ph)
            return " ".join(parts)

        # Subjects: who the record belongs to, with its time frame
        subjects = []
        if qb:
            subjects.append(("qb", qb, [r for r in rows if r.qb == qb], "in his career"))
        if coach:
            crow = [r for r in rows if r.coach == coach]
            if crow:
                first = min(r.season for r in crow)
                subjects.append(("coach", coach, crow, "this season" if first == season else f"since {first}"))
        subjects.append(("team", f"The {name}", [r for r in team_rows if r.season >= season - 2], f"since {season - 2}"))
        subjects.append(("team", f"The {name}", [r for r in team_rows if r.season == season], "this season"))
        subjects.append(("team", f"The {name}", [r for r in team_rows if r.season >= 2010], "since 2010"))

        combos = [(c,) for c in conds] + [(a, b) for i, a in enumerate(conds) for b in conds[i + 1:]]
        combos = [c for c in combos if not ({"fd", "big"} <= {k for k, _, _ in c})]
        for kind, who, srows, frame in subjects:
            for combo in combos:
                kinds = {k for k, _, _ in combo}
                if kind == "team" and frame == "since 2010" and not kinds & {"opp", "thanks"}:
                    continue  # long team windows only for rivalry and holiday angles
                sel = [r for r in srows if all(pred(r) for _, _, pred in combo)]
                phrase = phrase_for(combo)
                relevance = 0.5 * bool(kinds & {"opp", "thanks"}) + 0.2 * ("prime" in kinds) + 0.1 * ("div" in kinds)
                for metric in ("ats", "ou"):
                    if metric == "ou" and total_line is None:
                        continue
                    w, l, p = tally(sel, metric)
                    n = w + l
                    if n < MIN_GAMES:
                        continue
                    rate = w / n
                    if FLOOR_RATE > rate > 1 - FLOOR_RATE:
                        continue
                    z = zscore(w, l)
                    if abs(z) < FLOOR_Z:
                        continue
                    last = max(r.season for r in sel)
                    if last < season - (RECENT_SEASONS - 1):
                        continue
                    if metric == "ats":
                        text = f"{who} {'is' if kind != 'team' else 'are'} {w}-{l}{f'-{p}' if p else ''} ATS {phrase} {frame}"
                        supports = side_label if rate > 0.5 else f"{game['away_team' if side == 'home' else 'home_team']} {fmt_line(-line)}"
                    else:
                        lead = {"qb": f"{who}'s games", "coach": f"{who}'s games", "team": f"{name} games"}[kind]
                        over = rate > 0.5
                        a_, b_ = (w, l) if over else (l, w)
                        if phrase.startswith("in division games"):
                            lead, phrase = lead.replace(" games", " division games"), phrase[len("in division games"):].strip()
                        text = " ".join(f"The {'over' if over else 'under'} is {a_}-{b_}{f'-{p}' if p else ''} in {lead} {phrase} {frame}".split())
                        supports = f"{'Over' if over else 'Under'} {total_line:g}"
                    out.append(Angle(text=text, supports=supports, market="spread" if metric == "ats" else "total",
                                     w=w, l=l, p=p, z=z, conds=len(combo), rate=rate, last_season=last,
                                     relevance=relevance, metric=metric, kinds=frozenset(kinds),
                                     sample=[(r.gameday, r.team) for r in sel]))
    return out


def fmt_line(x: float) -> str:
    return "PK" if x == 0 else (f"+{x:g}" if x > 0 else f"{x:g}")


def verify(angle: Angle, raw: list[dict]) -> bool:
    """The check pass: recompute the record from the raw CSV rows, independently of Row."""
    idx = {}
    for r in raw:
        for side in ("home", "away"):
            idx[(r["gameday"], franchise(r[f"{side}_team"]))] = (r, side)
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


def pick_slate(week: list[dict], found: dict[str, list[Angle]]) -> dict[str, Angle]:
    """D-115: one line per game, picked per game day so no condition family (favorite or underdog, after a win
    or loss, home or road...) shows on more than 2 games. Games with the fewest kinds of angle choose first; a game
    whose every angle is over the limit takes the one whose families are least used."""
    by_day = defaultdict(list)
    for g in week:
        if found[g["game_id"]]:
            by_day[g["gameday"]].append(g)
    picked = {}
    for day_games in by_day.values():
        used = Counter()
        options = {g["game_id"]: len({f for a in found[g["game_id"]] for f in a.families}) for g in day_games}
        for g in sorted(day_games, key=lambda g: (options[g["game_id"]], -found[g["game_id"]][0].score)):
            angles = found[g["game_id"]]
            best = next((a for a in angles if all(used[f] < 2 for f in a.families)), None)
            if best is None:
                best = min(angles, key=lambda a: (max(used[f] for f in a.families), -a.strong, -a.score))
            used.update(best.families)
            picked[g["game_id"]] = best
    return picked


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", required=True)
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--week", type=int, default=0, help="default: every unplayed game in the next 8 days")
    ap.add_argument("--json", default="")
    args = ap.parse_args()
    games, rows = load(args.games)
    if args.week:
        week = [g for g in games if int(g["season"]) == args.season and int(g["week"]) == args.week and g["result"] == "" and g["spread_line"]]
    else:
        today = datetime.now(ET).date()
        week = [g for g in games if g["result"] == "" and g["spread_line"] and g["gameday"]
                and today <= date.fromisoformat(g["gameday"]) <= today + timedelta(days=8)]
    results = []
    found = {}
    for g in week:
        angles = sorted(build_angles(g, rows, args.season), key=lambda a: (a.strong, a.score), reverse=True)
        found[g["game_id"]] = [a for a in angles[:60] if verify(a, games)]   # nothing unverified moves up
    picked = pick_slate(week, found)
    for g in week:
        angles = found[g["game_id"]]
        best = picked.get(g["game_id"]) or season_fallback(g, rows, args.season)
        tier = "strong" if angles and best.strong else ("fallback" if angles else "season")
        kickoff = datetime.fromisoformat(f"{g['gameday']}T{g['gametime'] or '13:00'}").replace(tzinfo=ET)
        results.append({
            "espn_event_id": g["espn"], "sport": "NFL", "starts_at": kickoff.astimezone(timezone.utc).isoformat(),
            "matchup": f"{TEAM_NAMES[franchise(g['away_team'])]} {'vs' if g['location'] == 'Neutral' else 'at'} {TEAM_NAMES[franchise(g['home_team'])]}",
            "game": f"{g['away_team']} at {g['home_team']}", "gameday": g["gameday"], "gametime": g["gametime"],
            "line": f"{g['home_team']} {fmt_line(-float(g['spread_line']))}", "total": g["total_line"],
            "best": best and {"text": best.text, "supports": best.supports, "market": best.market, "record": best.record,
                              "z": round(best.z, 2), "tier": tier, "games": best.w + best.l + best.p},
            "runners_up": [{"text": a.text, "supports": a.supports, "z": round(a.z, 2)} for a in angles[1:4]],
            "candidates": len(angles),
        })
        print(f"\n{g['away_team']} at {g['home_team']} ({g['gameday']}, {g['home_team']} {fmt_line(-float(g['spread_line']))}, O/U {g['total_line']}): {len(angles)} angles, {tier}")
        if best:
            print(f"  BEST  {best.text}  ->  {best.supports}")
        for a in angles[1:3]:
            print(f"  {a.score:4.2f}  {a.text}  ->  {a.supports}")
    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)


if __name__ == "__main__":
    main()
