"""Transcribe the newest betting-pick episodes of the Takes shows (DECISIONS D-060, D-062).

Free by design: podcast audio comes from each show's public RSS feed (the same
files any podcast app downloads), and transcription runs locally with the
open-source Whisper model (faster-whisper) on a GitHub Actions runner. No paid
service, no API key. Output: one JSON per episode with timestamped segments,
kept private; the app shows only short credited quotes and summaries.

Usage: python scripts/takes/transcribe.py --per-show 1 --out takes-out

With --ingest-url (the workflow), every episode published in the last --max-age-days
that ingest-takes hasn't processed yet is transcribed, newest first, up to --max-new
per show per run. Taking only each show's N newest episodes (the old --per-show
behavior) skipped a picks episode whenever a show posted more than N between runs.
"""
import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

# Mirrors supabase/functions/_shared/takes-sources.ts (podcast feeds)
FEEDS = {
    "bear-bets": "https://feeds.megaphone.fm/bearbets",
    "hold-the-phone": "https://feeds.megaphone.fm/holdthephone",
    "early-edge": "https://rss.amperwave.net/v2/feed/audacynetwork/earlyedge",
}
# Episodes whose titles suggest picks; others (news talk) are skipped
PICK_TITLE = re.compile(r"\b(bets?|picks?|parlay|best bets|plays?)\b", re.I)
# Takes carries football and basketball: an episode whose title names only other sports
# (SportsLine's feed also has hockey, soccer and more) isn't worth transcribing
OTHER_SPORTS = re.compile(r"\b(NHL|hockey|soccer|Premier League|EPL|MLS|Champions League|UFC|MMA|boxing|golf|PGA|LIV|tennis|F1|NASCAR|MLB|baseball|WNBA)\b", re.I)
TAKES_SPORTS = re.compile(r"\b(NFL|NBA|college|CFB|CBB|NCAA|football|basketball|hoops|MNF|TNF|SNF|Thanksgiving|bowl|playoffs?)\b", re.I)
UA = {"User-Agent": "MGPAnalytics/1.0 (+https://mgp-analytics.com)"}


def age_days(ep: dict) -> float:
    try:
        return (time.time() - parsedate_to_datetime(ep["pubDate"]).timestamp()) / 86400
    except (TypeError, ValueError):
        return 0


def pick_episodes(feed_url: str, n: int, any_title: bool = False, title_match: "re.Pattern | None" = None,
                  max_age_days: "float | None" = None) -> list[dict]:
    """A show's episodes, newest first whatever order the feed lists them in. With
    max_age_days, every episode published within that many days (n ignored); else the n newest."""
    with urllib.request.urlopen(urllib.request.Request(feed_url, headers=UA), timeout=60) as r:
        root = ET.fromstring(r.read())
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        enc = item.find("enclosure")
        if enc is None or (not any_title and not PICK_TITLE.search(title)):
            continue
        if title_match is not None and not title_match.search(title):
            continue
        if OTHER_SPORTS.search(title) and not TAKES_SPORTS.search(title):
            continue
        out.append({"title": title, "pubDate": item.findtext("pubDate"), "guid": item.findtext("guid"), "audio": enc.get("url")})
    out.sort(key=age_days)  # stable: undated items keep their feed order
    if max_age_days is None:
        return out[:n]
    return [ep for ep in out if age_days(ep) <= max_age_days]


def github_oidc_token(audience: str) -> str:
    """A fresh GitHub Actions OIDC token (needs `permissions: id-token: write`). The
    ingest function verifies it against GitHub's public keys, so no secret is stored."""
    url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=" + audience
    req = urllib.request.Request(url, headers={"Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["value"]


def ingest(url: str, payload: dict) -> dict:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + github_oidc_token("mgp-ingest-takes")})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}"}


def fmt(sec: float) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-show", type=int, default=1,
                    help="without --ingest-url: how many of each show's newest episodes to transcribe")
    ap.add_argument("--out", default="takes-out")
    ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small.en"))
    ap.add_argument("--any-title", action="store_true",
                    help="take each show's newest episodes even without a picks word in the title (early-week leans live there too)")
    ap.add_argument("--shows", default="",
                    help="comma-separated show keys from FEEDS (default: all)")
    ap.add_argument("--ingest-url", default="",
                    help="post each new transcript to the ingest-takes function (GitHub Actions only) and skip episodes it already has")
    ap.add_argument("--max-age-days", type=float, default=3,
                    help="with --ingest-url, transcribe every unprocessed episode published within this many days")
    ap.add_argument("--max-new", type=int, default=6,
                    help="with --ingest-url, the most new episodes to transcribe per show in one run, newest first "
                         "(the rest wait for the next run while they are still recent)")
    ap.add_argument("--title-match", default="",
                    help="regex an episode title must match, e.g. NBA team names to pull a multi-sport show's newest basketball episode")
    args = ap.parse_args()
    shows = [x.strip() for x in args.shows.split(",") if x.strip()] or list(FEEDS)
    unknown = [x for x in shows if x not in FEEDS]
    if unknown:
        ap.error(f"unknown show(s): {', '.join(unknown)}; known: {', '.join(FEEDS)}")
    title_match = re.compile(args.title_match, re.I) if args.title_match else None
    os.makedirs(args.out, exist_ok=True)

    from faster_whisper import WhisperModel  # imported late so --help works without it

    known: set[str] = set()
    if args.ingest_url:
        known = set(ingest(args.ingest_url, {"action": "known"}).get("guids", []))
        print(f"ingest: {len(known)} episodes already processed", flush=True)

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    for show in shows:
        feed = FEEDS[show]
        try:
            if args.ingest_url:
                recent = pick_episodes(feed, 0, args.any_title, title_match, max_age_days=args.max_age_days)
            else:
                recent = pick_episodes(feed, args.per_show, args.any_title, title_match)
        except (urllib.error.URLError, ET.ParseError, TimeoutError) as e:
            print(f"feed error: {show}: {e}", flush=True)
            continue
        todo = recent
        if args.ingest_url:
            for ep in recent:
                if ep["guid"] in known:
                    print(f"skip (already processed): {show} | {ep['title']}", flush=True)
            todo = [ep for ep in recent if ep["guid"] not in known]
            for ep in todo[args.max_new:]:
                print(f"next run (over --max-new {args.max_new}): {show} | {ep['title']}", flush=True)
            todo = todo[:args.max_new]
            print(f"{show}: {len(recent)} episodes in the last {args.max_age_days:g} days, {len(todo)} to transcribe", flush=True)
        for ep in todo:
            slug = re.sub(r"[^a-z0-9]+", "-", ep["title"].lower()).strip("-")[:60]
            audio_path = os.path.join(args.out, f"{show}-{slug}.mp3")
            t0 = time.time()
            try:
                with urllib.request.urlopen(urllib.request.Request(ep["audio"], headers=UA), timeout=300) as r, open(audio_path, "wb") as f:
                    f.write(r.read())
            except (urllib.error.URLError, TimeoutError) as e:
                print(f"download error (next run tries again): {show} | {ep['title']}: {e}", flush=True)
                continue
            t1 = time.time()
            segments, info = model.transcribe(audio_path, beam_size=1, vad_filter=True)
            segs = [{"start": round(s.start, 1), "end": round(s.end, 1), "text": s.text.strip()} for s in segments]
            t2 = time.time()
            os.remove(audio_path)  # keep only the text
            record = {"show": show, **{k: ep[k] for k in ("title", "pubDate", "guid")}, "model": args.model,
                      "audio_seconds": round(info.duration), "transcribe_seconds": round(t2 - t1), "segments": segs}
            with open(os.path.join(args.out, f"{show}-{slug}.json"), "w") as f:
                json.dump(record, f, indent=1)
            print(f"### {show} | {ep['title']} | {ep['pubDate']} | audio {fmt(info.duration)} | "
                  f"download {t1 - t0:.0f}s | transcribe {t2 - t1:.0f}s ({(t2 - t1) / max(info.duration, 1):.2f}x real time)")
            for s in segs:
                print(f"[{fmt(s['start'])}] {s['text']}")
            print("### end", flush=True)
            if args.ingest_url:
                result = ingest(args.ingest_url, {"action": "ingest", "show": show,
                                                  "episode": {"guid": ep["guid"], "title": ep["title"], "pubDate": ep["pubDate"],
                                                              "audio_seconds": round(info.duration)},
                                                  "segments": [{"start": s["start"], "text": s["text"]} for s in segs]})
                print("ingest:", json.dumps(result), flush=True)
                known.add(ep["guid"])


if __name__ == "__main__":
    main()
