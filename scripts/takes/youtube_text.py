"""Send new picks videos from text-only YouTube shows to ingest-takes (DECISIONS D-060, D-074).

Some YouTube-only shows list their picks in each video's description ("Pick 1: Devin
Booker over 5.5 assists"). For those shows only the title and description are read,
from YouTube's free public channel feed (feeds/videos.xml). No watch pages, no audio
or video and no captions are ever fetched (YouTube's terms). ingest-takes runs the
text through the same Claude Haiku extraction as the podcast transcripts and stores
the picks credited to the show.

Usage:
  python scripts/takes/youtube_text.py --dry-run             # print what would be sent
  python scripts/takes/youtube_text.py --ingest-url URL      # GitHub Actions only (OIDC)
"""
import argparse
import json
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

from transcribe import UA, ingest  # same folder: the OIDC-authenticated post to ingest-takes

# Mirrors supabase/functions/_shared/takes-sources.ts and the SHOWS map in ingest-takes.
# Only shows whose descriptions actually list their picks belong here (Final Round Sports'
# descriptions point to a pinned comment instead, so it isn't one).
CHANNELS = {
    "daft-previews": "UCwvzzWorj_-_d792FUo3gmg",  # Daft Previews (@daftpreviews), NBA player props
}
FEED = "https://www.youtube.com/feeds/videos.xml?channel_id={}"
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}
# Daily picks videos ("My 3 Best NBA Player Prop Bets Today"); recaps and promos are skipped
PICK_TITLE = re.compile(r"\b(bets?|picks?|props?|parlays?|plays?)\b", re.I)


def videos(channel_id: str) -> list[dict]:
    with urllib.request.urlopen(urllib.request.Request(FEED.format(channel_id), headers=UA), timeout=60) as r:
        root = ET.fromstring(r.read())
    out = []
    for e in root.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", namespaces=NS)
        title = (e.findtext("a:title", namespaces=NS) or "").strip()
        if vid and title:
            out.append({"id": vid, "title": title, "published": e.findtext("a:published", namespaces=NS) or "",
                        "description": e.findtext("media:group/media:description", namespaces=NS) or ""})
    return out


def age_days(published: str) -> float:
    try:
        return (time.time() - datetime.fromisoformat(published).timestamp()) / 86400
    except ValueError:
        return 0


def clean(description: str) -> str:
    """The description without links, promo codes and divider lines; the picks and chapters stay."""
    keep = []
    for line in description.splitlines():
        s = line.strip()
        if not s or "http" in s or re.fullmatch(r"[\W_]+", s) or re.search(r"\b(promo|code)\b", s, re.I):
            continue
        keep.append(s)
    return "\n".join(keep)[:6000]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shows", default="", help=f"comma-separated keys from CHANNELS (default: all): {', '.join(CHANNELS)}")
    ap.add_argument("--ingest-url", default="", help="post each new video to ingest-takes (GitHub Actions only)")
    ap.add_argument("--dry-run", action="store_true", help="print the payloads instead of posting them")
    ap.add_argument("--max-age-days", type=float, default=2, help="skip videos published longer ago than this")
    args = ap.parse_args()
    shows = [x.strip() for x in args.shows.split(",") if x.strip()] or list(CHANNELS)
    unknown = [x for x in shows if x not in CHANNELS]
    if unknown:
        ap.error(f"unknown show(s): {', '.join(unknown)}; known: {', '.join(CHANNELS)}")
    post = bool(args.ingest_url) and not args.dry_run

    known: set[str] = set()
    if post:
        known = set(ingest(args.ingest_url, {"action": "known"}).get("guids", []))
        print(f"ingest: {len(known)} episodes already processed", flush=True)

    for show in shows:
        try:
            items = videos(CHANNELS[show])
        except (urllib.error.URLError, ET.ParseError, TimeoutError) as e:
            print(f"feed error: {show}: {e}", flush=True)
            continue
        for v in items:
            if age_days(v["published"]) > args.max_age_days:
                continue
            if not PICK_TITLE.search(v["title"]):
                print(f"skip (not a picks video): {show} | {v['title']}", flush=True)
                continue
            guid = f"yt:{v['id']}"
            if guid in known:
                print(f"skip (already processed): {show} | {v['title']}", flush=True)
                continue
            payload = {"action": "ingest_text", "show": show,
                       "episode": {"guid": guid, "title": v["title"], "pubDate": v["published"]},
                       "text": f"{v['title']}\n\n{clean(v['description'])}"}
            if not post:
                print(json.dumps(payload, indent=1, ensure_ascii=False), flush=True)
                continue
            result = ingest(args.ingest_url, payload)
            print(f"### {show} | {v['title']} | {v['published']}", flush=True)
            print("ingest:", json.dumps(result), flush=True)
            known.add(guid)


if __name__ == "__main__":
    main()
