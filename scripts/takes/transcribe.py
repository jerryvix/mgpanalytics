"""Transcribe the newest betting-pick episodes of the Takes shows (DECISIONS D-060, D-062).

Free by design: podcast audio comes from each show's public RSS feed (the same
files any podcast app downloads), and transcription runs locally with the
open-source Whisper model (faster-whisper) on a GitHub Actions runner. No paid
service, no API key. Output: one JSON per episode with timestamped segments,
kept private; the app shows only short credited quotes and summaries.

Usage: python scripts/takes/transcribe.py --per-show 1 --out takes-out
"""
import argparse
import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

# Mirrors supabase/functions/_shared/takes-sources.ts (podcast feeds)
FEEDS = {
    "bear-bets": "https://feeds.megaphone.fm/bearbets",
    "hold-the-phone": "https://feeds.megaphone.fm/holdthephone",
}
# Episodes whose titles suggest picks; others (news talk) are skipped
PICK_TITLE = re.compile(r"\b(bets?|picks?|parlay|best bets|plays?)\b", re.I)
UA = {"User-Agent": "MGPAnalytics/1.0 (+https://mgp-analytics.com)"}


def newest_pick_episodes(feed_url: str, n: int, any_title: bool = False) -> list[dict]:
    with urllib.request.urlopen(urllib.request.Request(feed_url, headers=UA), timeout=60) as r:
        root = ET.fromstring(r.read())
    out = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        enc = item.find("enclosure")
        if enc is None or (not any_title and not PICK_TITLE.search(title)):
            continue
        out.append({"title": title, "pubDate": item.findtext("pubDate"), "guid": item.findtext("guid"), "audio": enc.get("url")})
        if len(out) >= n:
            break
    return out


def fmt(sec: float) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-show", type=int, default=1)
    ap.add_argument("--out", default="takes-out")
    ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small.en"))
    ap.add_argument("--any-title", action="store_true",
                    help="take each show's newest episodes even without a picks word in the title (early-week leans live there too)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    from faster_whisper import WhisperModel  # imported late so --help works without it

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    for show, feed in FEEDS.items():
        for ep in newest_pick_episodes(feed, args.per_show, args.any_title):
            slug = re.sub(r"[^a-z0-9]+", "-", ep["title"].lower()).strip("-")[:60]
            audio_path = os.path.join(args.out, f"{show}-{slug}.mp3")
            t0 = time.time()
            with urllib.request.urlopen(urllib.request.Request(ep["audio"], headers=UA), timeout=300) as r, open(audio_path, "wb") as f:
                f.write(r.read())
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


if __name__ == "__main__":
    main()
