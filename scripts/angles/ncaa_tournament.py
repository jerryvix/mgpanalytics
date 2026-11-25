"""NCAA men's tournament history since 1985: every game with its seeds, and the line when
ESPN has one (DECISIONS D-116). Answers "record of N seeds against M seeds", straight up
and against the spread.

Sources, both free:
- Wikipedia's page for each tournament (1985 on): the bracket templates give every game's
  round, region, seeds, teams and score; the Teams table gives head coaches where the page
  has that column. Facts are not copyrightable and the text is CC BY-SA; the CSV credits it.
- ESPN (2002 on, the years ESPN carries seeds): the same games from ESPN's scoreboards,
  which cross-check Wikipedia game by game, plus ESPN's event id, date, the closing spread
  and total (lines start with the 2013 tournament) and ESPN's checked head coach (2014 on),
  from data/history/cbb_espn.csv and the scoreboard cache.

A game counts only once its seeds and score are known. Where ESPN and Wikipedia both have a
game they must agree on the seeds and the score, or the build stops.

Usage:
  python3 -I scripts/angles/ncaa_tournament.py build --wiki <dir> --history data/history/cbb_espn.csv \
      --cache <espn cache> --out data/history/ncaab_tournament.csv [--fetch]
  python3 -I scripts/angles/ncaa_tournament.py seeds 5 12 [--round R64] [--since 1985]
  python3 -I scripts/angles/ncaa_tournament.py coach "Tom Izzo"   (since 2014 unless --since)
  python3 -I scripts/angles/ncaa_tournament.py --self-test
"""
import argparse
import csv
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DEFAULT_CSV = os.path.join(ROOT, "data", "history", "ncaab_tournament.csv")
ROUNDS = ["FF", "R64", "R32", "S16", "E8", "F4", "NC"]
ROUND_NAMES = {"FF": "the First Four", "R64": "the first round", "R32": "the second round", "S16": "the Sweet 16",
               "E8": "the Elite Eight", "F4": "the Final Four", "NC": "the national title game"}
FIELDS = ["season", "round", "region", "date", "seed_a", "team_a", "pts_a", "seed_b", "team_b", "pts_b", "ot",
          "coach_a", "coach_b", "line_a", "total", "espn_event_id", "espn_id_a", "espn_id_b", "vacated", "source"]
WIKI_UA = {"User-Agent": "research-script/1.0 (python; low volume)"}


# ---------------------------------------------------------------- wikitext
def templates(text: str, name: str):
    """(start offset, body) of each {{name ...}} in the text, nested templates included in the body."""
    for m in re.finditer(r"\{\{\s*" + re.escape(name) + r"\s*\|", text):
        i, depth = m.start(), 0
        while i < len(text):
            if text.startswith("{{", i):
                depth += 1
                i += 2
            elif text.startswith("}}", i):
                depth -= 1
                i += 2
                if depth == 0:
                    break
            else:
                i += 1
        yield m.start(), text[m.end():i - 2]


def params(body: str) -> dict[str, str]:
    """A template's named parameters, split on the pipes that aren't inside [[...]] or {{...}}."""
    out, cur, depth, i = {}, [], 0, 0
    parts = []
    while i < len(body):
        two = body[i:i + 2]
        if two in ("[[", "{{"):
            depth += 1
            cur.append(two)
            i += 2
            continue
        if two in ("]]", "}}"):
            depth -= 1
            cur.append(two)
            i += 2
            continue
        if body[i] == "|" and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(body[i])
        i += 1
    parts.append("".join(cur))
    for p in parts:
        k, eq, v = p.partition("=")
        if eq:
            out[k.strip()] = v.strip()
    return out


def clean(v: str) -> str:
    """Plain text of a wikitext value: links, bold, templates, refs, comments and footnote marks removed."""
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"<sup>.*?</sup>|<br\s*/?>", " ", v, flags=re.S)
    v = re.sub(r"\{\{cbb link\|([^{}]*)\}\}", lambda m: (params("x|" + m.group(1)).get("title") or params("x|" + m.group(1)).get("team") or ""), v)
    for _ in range(3):
        # a vacated result is struck through on the page; the game was still played and counts on the court
        v = re.sub(r"\{\{(?:nowrap|nobr|small|abbr|strikethrough|strike|s|del)\|([^{}|]*)[^{}]*\}\}", r"\1", v, flags=re.I)
        v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", v)
    v = re.sub(r"\[\[([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"<[^>]+>", "", v)
    v = html.unescape(v).replace("'''", "").replace("''", "").replace(" ", " ")
    v = re.sub("[\u2012\u2013\u2014\u2212]", "-", v)   # plain hyphens only (D-073): "Loyola-Chicago"
    return re.sub(r"\s+", " ", v).strip(" *#")


def score(v: str) -> tuple[int | None, int]:
    """(points, overtimes) from a bracket score like "'''81<sup>OT</sup>'''", "74*", "86 (2OT)"."""
    raw = re.sub(r"<!--.*?-->", "", v or "", flags=re.S)
    ot = 0
    m = re.search(r"(\d)\s*OT", raw)
    if m:
        ot = int(m.group(1))
    elif re.search(r"OT|\*", raw):
        ot = raw.count("*") or 1
    m = re.search(r"\d+", clean(raw).replace("OT", " "))
    return (int(m.group(0)) if m else None), ot


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("saint ", "st ").replace("state", "st")
    return re.sub(r"[^a-z0-9]+", "", s)


def heading_before(text: str, pos: int) -> str:
    hs = [m for m in re.finditer(r"^=+\s*(.*?)\s*=+\s*$", text[:pos], flags=re.M)]
    return clean(hs[-1].group(1)) if hs else ""


def region_of(heading: str, fallback: str = "") -> str:
    h = heading.replace("Regional", "Region")
    m = re.search(r"\b(East|West|South|Midwest|Southeast|Southwest|Mideast)\b", h)
    if m:
        return m.group(1)
    if fallback:
        return fallback
    # 2004 to 2006 named the regions after their host cities
    return heading.split(" Region")[0].split(" -")[0].strip()   # clean() already made dashes plain hyphens


# The bracket template's own seed order for a region's first round, used when a page leaves the seeds out
DEFAULT_SEEDS = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]
STRUCK = re.compile(r"\{\{\s*(?:strikethrough|strike|s|del)\s*\|", re.I)


def parse_wiki(year: int, text: str) -> list[dict]:
    """Every game in a tournament page's bracket templates, with seeds and scores."""
    games = []

    def slots(p: dict, rd: int, n: int):
        out = []
        for k in range(1, n + 1):
            def g(field):
                for key in (f"RD{rd}-{field}{k:02d}", f"RD{rd}-{field}{k}"):
                    if key in p:
                        return p[key]
                return ""
            team = clean(g("team"))
            pts, ot = score(g("score"))
            seed = re.sub(r"\D", "", clean(g("seed")))
            out.append({"team": team, "pts": pts, "ot": ot, "seed": int(seed) if seed else None, "vacated": bool(STRUCK.search(g("team")))})
        return out

    def add(rnd, region, a, b):
        if not a["team"] or not b["team"] or a["pts"] is None or b["pts"] is None:
            return
        games.append({"season": year, "round": rnd, "region": region, "a": a, "b": b, "ot": max(a["ot"], b["ot"])})

    regions = [(pos, body) for name in ("16TeamBracket", "16TeamBracket-Info") for pos, body in templates(text, name)]
    for pos, body in sorted(regions):
        p = params("x|" + body)
        region = region_of(heading_before(text, pos))
        for rd, n, rnd in ((1, 16, "R64"), (2, 8, "R32"), (3, 4, "S16"), (4, 2, "E8")):
            s = slots(p, rd, n)
            if rd == 1 and not any(x["seed"] for x in s):
                for x, seed in zip(s, DEFAULT_SEEDS):
                    x["seed"] = seed
            for k in range(0, n, 2):
                add(rnd, region, s[k], s[k + 1])
    for pos, body in templates(text, "4TeamBracket"):
        p = params("x|" + body)
        for rd, n, rnd in ((1, 4, "F4"), (2, 2, "NC")):
            s = slots(p, rd, n)
            for k in range(0, n, 2):
                add(rnd, "Final Four", s[k], s[k + 1])
    for pos, body in templates(text, "2TeamBracket"):
        p = params("x|" + body)
        if p.get("seeds", "").lower() == "no":
            continue  # 1991's conference play-ins were not part of the bracket
        s = slots(p, 1, 2)
        if s[0]["seed"] is None:
            continue
        add("FF", region_of(clean(p.get("RD1", "")), "First Four"), s[0], s[1])
    # seeds missing on a later-round slot come from the team's first-round slot in the same region
    seed_of = {}
    for g in games:
        for side in ("a", "b"):
            if g[side]["seed"] is not None:
                seed_of[(g["region"] if g["round"] not in ("F4", "NC") else "*", norm(g[side]["team"]))] = g[side]["seed"]
                seed_of.setdefault(("*", norm(g[side]["team"])), g[side]["seed"])
    for g in games:
        for side in ("a", "b"):
            if g[side]["seed"] is None:
                g[side]["seed"] = seed_of.get((g["region"], norm(g[side]["team"]))) or seed_of.get(("*", norm(g[side]["team"])))
    return [g for g in games if g["a"]["seed"] and g["b"]["seed"]]


def wiki_coaches(text: str) -> dict[str, str]:
    """{normalized team name: head coach} from the page's tables that have a coach column."""
    out = {}
    attr = r"^\s*(align|style|class|rowspan|colspan|bgcolor|scope|width|data-sort-value)[^|\[]*\|(?!\|)"
    for tm in re.finditer(r"\{\|(.*?)\n\|\}", text, flags=re.S):
        table = tm.group(1)
        header = []
        for r in re.split(r"\n\|-[^\n]*", table):
            cells, heads = [], []
            for line in r.split("\n"):
                line = line.strip()
                if line.startswith("!"):
                    heads.extend(re.sub(attr, "", h) for h in re.split(r"!!|\|\|", line[1:]))
                elif line.startswith("|") and not line.startswith("|+") and not line.startswith("|}"):
                    cells.extend(re.sub(attr, "", c) for c in re.split(r"\|\|", line[1:]))
            if len(heads) >= 3 and not cells:
                header = [clean(h).lower() for h in heads]   # a one-cell "! East" row is a section label, not a header
                continue
            cells = heads + cells   # a row header ("! scope=row | 1") is the row's first cell
            if not header or not cells:
                continue
            col = {h: i for i, h in enumerate(header)}
            ti = next((col[h] for h in col if h in ("team", "school")), None)
            ci = next((col[h] for h in col if "coach" in h), None)
            if ti is None or ci is None or len(cells) != len(header):
                continue
            team, coach = clean(cells[ti]), clean(cells[ci])
            if team and coach:
                out[norm(team)] = coach
    return out


def fetch_wiki(year: int, cache: str) -> str | None:
    path = os.path.join(cache, f"{year}.txt")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return open(path).read()
    title = f"{year} NCAA Division I men's basketball tournament"
    url = "https://en.wikipedia.org/w/index.php?" + urllib.parse.urlencode({"title": title, "action": "raw"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=WIKI_UA), timeout=30) as r:
                text = r.read().decode("utf-8")
            os.makedirs(cache, exist_ok=True)
            with open(path, "w") as f:
                f.write(text)
            time.sleep(4)   # one page every few seconds
            return text
        except Exception as e:  # rate limited or a network hiccup
            print(year, "wikipedia:", e, flush=True)
            time.sleep(15 * (attempt + 1))
    return None


# ---------------------------------------------------------------- ESPN
def espn_tournament(history: str, cache: str, years: list[int]) -> list[dict]:
    """ESPN's NCAA tournament games: from the history CSV (2013 on) and, for 2002-2012, the
    tournament's scoreboards (mid-March to early April), read through espn_history's cache."""
    sys.path.insert(0, HERE)
    import espn_history as eh
    out = []
    have = set()
    if history and os.path.exists(history):
        for r in csv.DictReader(open(history)):
            if r["tourney"] == "NCAA" and int(r["season"]) in years:
                out.append(r)
                have.add(int(r["season"]))
    f = eh.Fetcher(cache, pace=0.05)
    base = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
    for year in years:
        if year in have or year < 2002:
            continue
        rows = []
        d = date(year, 3, 10)
        while d <= date(year, 4, 10):
            data = f.get(f"{base}?dates={d:%Y%m%d}&groups=50&limit=400") or {}
            for e in data.get("events", []):
                c = e["competitions"][0]
                if not c.get("status", {}).get("type", {}).get("completed"):
                    continue
                h = next(x for x in c["competitors"] if x["homeAway"] == "home")
                a = next(x for x in c["competitors"] if x["homeAway"] == "away")
                tourney, _ = eh.cbb_tourney(e.get("season", {}).get("type", 2), c, h, a)
                if tourney != "NCAA" or any(r["event_id"] == e["id"] for r in rows):
                    continue
                rk = lambda x: (x.get("curatedRank") or {}).get("current") or 99
                rows.append({"season": str(year), "start": e["date"], "event_id": e["id"], "tourney": "NCAA", "round": "",
                             "home_id": h["team"]["id"], "home": h["team"].get("displayName", ""), "home_pts": h.get("score", ""),
                             "away_id": a["team"]["id"], "away": a["team"].get("displayName", ""), "away_pts": a.get("score", ""),
                             "home_seed": str(rk(h)) if rk(h) <= 16 else "", "away_seed": str(rk(a)) if rk(a) <= 16 else "",
                             "home_line": "", "total": "", "home_coach": "", "away_coach": ""})
            d += timedelta(days=1)
        eh.ncaa_rounds(rows)
        out.extend(rows)
    return out


# ---------------------------------------------------------------- build
def build(args) -> None:
    years = [y for y in range(1985, (args.last or date.today().year) + 1) if y != 2020]
    espn = espn_tournament(args.history, args.cache, years)
    by_year = defaultdict(list)
    for r in espn:
        by_year[int(r["season"])].append(r)
    out, problems, notes = [], [], []
    stats = Counter()
    for year in years:
        text = fetch_wiki(year, args.wiki) if args.fetch else (open(os.path.join(args.wiki, f"{year}.txt")).read()
                                                               if os.path.exists(os.path.join(args.wiki, f"{year}.txt")) else None)
        wiki = parse_wiki(year, text) if text else []
        coaches = wiki_coaches(text) if text else {}
        stats["wiki_games"] += len(wiki)
        espn_games = by_year.get(year, [])
        used = set()
        for g in wiki:
            a, b = g["a"], g["b"]
            if a["seed"] > b["seed"]:
                a, b = b, a
            row = {"season": year, "round": g["round"], "region": g["region"], "date": "", "seed_a": a["seed"], "team_a": a["team"],
                   "pts_a": a["pts"], "seed_b": b["seed"], "team_b": b["team"], "pts_b": b["pts"], "ot": g["ot"] or "",
                   "coach_a": coaches.get(norm(a["team"]), ""), "coach_b": coaches.get(norm(b["team"]), ""),
                   "line_a": "", "total": "", "espn_event_id": "", "espn_id_a": "", "espn_id_b": "",
                   "vacated": ("a" if a["vacated"] else "") + ("b" if b["vacated"] else ""), "source": "wikipedia"}
            # the same game at ESPN: same round, same pair of seeds and the same pair of scores
            match = None
            for e in espn_games:
                if e["event_id"] in used or e["round"] != g["round"]:
                    continue
                es = {(int(e["home_seed"] or 0), int(e["home_pts"])), (int(e["away_seed"] or 0), int(e["away_pts"]))}
                if es == {(a["seed"], a["pts"]), (b["seed"], b["pts"])}:
                    match = e
                    break
            if not match:
                # ESPN sometimes leaves the seeds off a game (the 2008 and 2018 First Four): the same round and
                # the same two scores, when exactly one ESPN game fits
                fits = [e for e in espn_games if e["event_id"] not in used and e["round"] == g["round"]
                        and not (e["home_seed"] and e["away_seed"]) and {int(e["home_pts"]), int(e["away_pts"])} == {a["pts"], b["pts"]}]
                if len(fits) == 1:
                    match = fits[0]
                    stats["matched_without_espn_seeds"] += 1
            if match:
                used.add(match["event_id"])
                home_is_a = int(match["home_pts"]) == a["pts"]   # the two scores always differ
                pre = ("home", "away") if home_is_a else ("away", "home")
                hl = match.get("home_line", "")
                row.update({"date": match["start"][:10], "espn_event_id": match["event_id"], "espn_id_a": match[f"{pre[0]}_id"],
                            "espn_id_b": match[f"{pre[1]}_id"], "source": "wikipedia+espn", "total": match.get("total", "")})
                if hl != "":
                    row["line_a"] = float(hl) if home_is_a else -float(hl)
                for side, p in (("a", pre[0]), ("b", pre[1])):
                    if match.get(f"{p}_coach"):
                        row[f"coach_{side}"] = match[f"{p}_coach"]   # ESPN's checked coach (2014 on)
                stats["matched"] += 1
            elif year >= 2002:
                # ESPN didn't mark this one as a tournament game (the 2002-2007 opening round, the 2017 First Four)
                notes.append(f"{year} {g['round']} {a['seed']} {a['team']} {a['pts']} - {b['seed']} {b['team']} {b['pts']}: not marked at ESPN")
            out.append(row)
        for e in espn_games:
            if e["event_id"] not in used:
                # a game Wikipedia's brackets don't show (a no-contest is never listed with a score)
                problems.append(f"{year} {e['round']} {e['away_seed']} {e['away']} {e['away_pts']} at {e['home_seed']} {e['home']} {e['home_pts']}: not on Wikipedia")
        n = sum(1 for r in out if r["season"] == year)
        print(f"{year}: {n} games ({sum(1 for r in out if r['season'] == year and r['source'] != 'wikipedia')} matched at ESPN, "
              f"{sum(1 for r in out if r['season'] == year and r['line_a'] != '')} with a line, "
              f"{sum(1 for r in out if r['season'] == year and r['coach_a'] and r['coach_b'])} with both coaches)", flush=True)
    for n in notes:
        print("note:", n)
    for p in problems:
        print("CHECK:", p)
    out.sort(key=lambda r: (r["season"], ROUNDS.index(r["round"]), r["region"], r["seed_a"], r["seed_b"]))
    with open(args.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)
    print(f"wrote {len(out)} games to {args.out}; {stats['matched']} matched ESPN game for game "
          f"({stats['matched_without_espn_seeds']} of them by round and score, ESPN having no seeds on them); "
          f"{len(notes)} Wikipedia games ESPN doesn't mark; {len(problems)} ESPN games with no match (must be 0)")
    if problems and not args.allow_problems:
        sys.exit(1)


# ---------------------------------------------------------------- records
def load(path: str = DEFAULT_CSV) -> list[dict]:
    return list(csv.DictReader(open(path)))


def seed_record(rows: list[dict], s: int, t: int, rounds: set | None = None, since: int = 0, until: int = 9999) -> dict:
    """Seed s against seed t: straight up (w, l) from s's side, and against the spread (w, l, p) where a line is known."""
    su_w = su_l = ats_w = ats_l = ats_p = 0
    first = first_ats = None
    for r in rows:
        y = int(r["season"])
        if not (since <= y <= until) or (rounds and r["round"] not in rounds):
            continue
        sa, sb = int(r["seed_a"]), int(r["seed_b"])
        if {sa, sb} != {s, t} or s == t:
            continue
        mine, theirs = ("a", "b") if sa == s else ("b", "a")
        margin = int(r[f"pts_{mine}"]) - int(r[f"pts_{theirs}"])
        su_w, su_l = su_w + (margin > 0), su_l + (margin < 0)
        first = y if first is None else min(first, y)
        if r["line_a"] != "":
            line = float(r["line_a"]) if mine == "a" else -float(r["line_a"])
            m = margin + line
            ats_w, ats_l, ats_p = ats_w + (m > 0), ats_l + (m < 0), ats_p + (m == 0)
            first_ats = y if first_ats is None else min(first_ats, y)
    return {"su": (su_w, su_l), "ats": (ats_w, ats_l, ats_p), "first": first, "first_ats": first_ats}


def coach_record(rows: list[dict], coach: str, since: int = 0) -> dict:
    w = l = 0
    first = None
    for r in rows:
        if int(r["season"]) < since:
            continue
        for mine, theirs in (("a", "b"), ("b", "a")):
            if r[f"coach_{mine}"] == coach:
                m = int(r[f"pts_{mine}"]) - int(r[f"pts_{theirs}"])
                w, l = w + (m > 0), l + (m < 0)
                first = int(r["season"]) if first is None else min(first, int(r["season"]))
    return {"su": (w, l), "first": first}


def fmt_rec(rec: tuple) -> str:
    return "-".join(str(x) for x in rec[:2]) + (f"-{rec[2]}" if len(rec) > 2 and rec[2] else "")


def seeds_cmd(args) -> None:
    rows = load(args.csv)
    rounds = {args.round} if args.round else None
    r = seed_record(rows, args.s, args.t, rounds, args.since)
    where = f" in {ROUND_NAMES[args.round]}" if args.round else ""
    if r["first"] is None:
        print(f"No games between {args.s} and {args.t} seeds{where}")
        return
    print(f"{args.s} seeds are {fmt_rec(r['su'])} against {args.t} seeds{where} since {r['first']}")
    if r["first_ats"] is not None:
        print(f"{args.s} seeds are {fmt_rec(r['ats'])} ATS against {args.t} seeds{where} since {r['first_ats']}")


def coach_cmd(args) -> None:
    r = coach_record(load(args.csv), args.name, since=args.since)
    if r["first"] is None:
        print(f"No NCAA tournament games found for {args.name}")
    else:
        print(f"{args.name} is {fmt_rec(r['su'])} in the NCAA tournament since {r['first']}")


# ---------------------------------------------------------------- self-test
def self_test() -> None:
    # parsing
    assert clean("'''[[1984\u201385 Georgetown Hoyas men's basketball team|Georgetown]]'''") == "Georgetown"
    assert clean("Loyola\u2013Chicago") == "Loyola-Chicago"   # plain hyphens only (D-073)
    assert clean("{{cbb link|1990|team=Fordham Rams|title=Fordham}}") == "Fordham"
    assert score("'''81<sup>OT</sup>'''") == (81, 1)
    assert score("74*") == (74, 1) and score("68") == (68, 0) and score("90 (2OT)") == (90, 2)
    p = params("x| RD1-seed01=1\n | RD1-team01='''[[A|Duke]]'''\n | RD1-score01='''70'''\n | RD1-seed02=16\n | RD1-team02=[[B|Lehigh]]\n | RD1-score02=50")
    assert p["RD1-team01"] == "'''[[A|Duke]]'''" and p["RD1-seed02"] == "16"
    page = ("===East Regional===\n{{16TeamBracket | RD1-seed01=1 | RD1-team01='''Duke''' | RD1-score01='''70''' | RD1-seed02=16 "
            "| RD1-team02=Lehigh | RD1-score02=50 | RD2-team01='''Duke''' | RD2-score01=80 | RD2-team02=Iowa | RD2-score02=79 "
            "| RD1-seed03=8 | RD1-team03=Iowa | RD1-score03=60 | RD1-seed04=9 | RD1-team04=Utah | RD1-score04=59}}\n")
    g = parse_wiki(2000, page)
    assert len(g) == 3, g
    r32 = next(x for x in g if x["round"] == "R32")
    assert (r32["a"]["seed"], r32["b"]["seed"]) == (1, 8), r32   # later-round seeds filled in from round one
    assert all(x["region"] == "East" for x in g)
    # records
    rows = [
        {"season": "2013", "round": "R64", "seed_a": "5", "pts_a": "70", "seed_b": "12", "pts_b": "60", "line_a": "-6.5"},   # 5 wins, covers
        {"season": "2014", "round": "R64", "seed_a": "5", "pts_a": "64", "seed_b": "12", "pts_b": "66", "line_a": "-3"},     # 12 wins
        {"season": "2015", "round": "R64", "seed_a": "5", "pts_a": "70", "seed_b": "12", "pts_b": "66", "line_a": "-4"},     # 5 wins, push
        {"season": "1990", "round": "R64", "seed_a": "5", "pts_a": "80", "seed_b": "12", "pts_b": "70", "line_a": ""},       # no line
        {"season": "2016", "round": "R32", "seed_a": "4", "pts_a": "80", "seed_b": "12", "pts_b": "70", "line_a": "-5"},
        {"season": "2016", "round": "F4", "seed_a": "1", "pts_a": "80", "seed_b": "1", "pts_b": "70", "line_a": "-5"},
    ]
    r = seed_record(rows, 5, 12)
    assert r["su"] == (3, 1) and r["ats"] == (1, 1, 1) and r["first"] == 1990 and r["first_ats"] == 2013, r
    r = seed_record(rows, 12, 5)
    assert r["su"] == (1, 3) and r["ats"] == (1, 1, 1), r   # the other side of the same games
    assert seed_record(rows, 12, 5, since=2014)["su"] == (1, 1)
    assert seed_record(rows, 12, 4, rounds={"R32"})["su"] == (0, 1)
    assert seed_record(rows, 1, 1)["su"] == (0, 0)   # equal seeds say nothing
    assert fmt_rec((1, 1, 1)) == "1-1-1" and fmt_rec((150, 2)) == "150-2"
    # the committed file, when present: every tournament complete and internally consistent
    if os.path.exists(DEFAULT_CSV):
        data = load()
        per = Counter(int(r["season"]) for r in data)
        for y, n in per.items():
            want = 63 if y <= 2000 else (64 if y <= 2010 else 67)
            if y == 2021:
                want = 66   # VCU-Oregon was ruled a no-contest
            assert n == want, (y, n, want)
        assert 2020 not in per
        for r in data:
            if r["round"] == "R64" and not (int(r["season"]) == 2021 and "Oregon" in (r["team_a"], r["team_b"])):
                assert int(r["seed_a"]) + int(r["seed_b"]) == 17, r
            if r["round"] == "FF":
                assert r["seed_a"] == r["seed_b"], r
            assert int(r["pts_a"]) != int(r["pts_b"]), r
        champs = Counter(int(r["season"]) for r in data if r["round"] == "NC")
        assert all(v == 1 for v in champs.values()), champs
        known = {1985: "Villanova", 2018: "Villanova", 2008: "Kansas", 2019: "Virginia", 2023: "UConn"}
        for y, team in known.items():
            nc = next(r for r in data if int(r["season"]) == y and r["round"] == "NC")
            winner = nc["team_a"] if int(nc["pts_a"]) > int(nc["pts_b"]) else nc["team_b"]
            assert team in winner, (y, winner)
        # well-known upsets of 1 seeds by 16 seeds: UMBC over Virginia (2018), FDU over Purdue (2023)
        upsets = [(int(r["season"])) for r in data if {r["seed_a"], r["seed_b"]} == {"1", "16"} and int(r["pts_b"]) > int(r["pts_a"])]
        assert sorted(upsets)[:2] == [2018, 2023], upsets
        through_2023 = seed_record([r for r in data if int(r["season"]) <= 2023], 1, 16)["su"]
        assert through_2023 == (150, 2), through_2023   # the record widely quoted after the 2023 tournament
    print("self-test passed")


def main() -> None:
    if "--self-test" in sys.argv:
        self_test()
        return
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--wiki", required=True, help="directory for Wikipedia's tournament pages (wikitext)")
    b.add_argument("--fetch", action="store_true", help="fetch pages that aren't in --wiki yet")
    b.add_argument("--history", default=os.path.join(ROOT, "data", "history", "cbb_espn.csv"))
    b.add_argument("--cache", required=True, help="espn_history.py's response cache")
    b.add_argument("--last", type=int, default=0, help="last tournament to include")
    b.add_argument("--out", default=DEFAULT_CSV)
    b.add_argument("--allow-problems", action="store_true")
    s = sub.add_parser("seeds")
    s.add_argument("s", type=int)
    s.add_argument("t", type=int)
    s.add_argument("--round", choices=ROUNDS)
    s.add_argument("--since", type=int, default=0)
    s.add_argument("--csv", default=DEFAULT_CSV)
    c = sub.add_parser("coach")
    c.add_argument("name")
    c.add_argument("--since", type=int, default=2014, help="tournament coaches are complete from 2014 (ESPN's checked coach)")
    c.add_argument("--csv", default=DEFAULT_CSV)
    args = ap.parse_args()
    {"build": build, "seeds": seeds_cmd, "coach": coach_cmd}[args.cmd](args)


if __name__ == "__main__":
    main()
