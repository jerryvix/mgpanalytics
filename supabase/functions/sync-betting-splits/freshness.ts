// Keeping DK's splits honest about their age.
//
// DK Network serves the splits page through WordPress VIP's nginx cache:
// x-cache HIT / MISS / STALE / UPDATING, cache-control max-age=300, and the
// cache varies on Accept. A STALE copy can be hours old. On Sep 24 2026 page 1
// of both sports kept serving its 06:43 numbers through the 08:01, 09:31 and
// 10:25 runs while a cache-busted fetch differed on 32 NCAAF sides, and the
// app labeled those numbers "split 12m ago". So:
//  - every fetch carries a cache-busting parameter unique to the run, plus
//    no-cache request headers;
//  - every page logs its x-cache and age;
//  - a cached answer (HIT, STALE, UPDATING, anything unrecognized) is
//    retried with a fresh buster, and a page still stale after
//    MAX_ATTEMPTS fails the sport's splits loudly (StaleSplitsError);
//  - a page whose numbers match the previous runs' for over
//    STALE_CAPTURE_MS while other pages changed is flagged, and its rows
//    are labeled with the time the numbers were first seen, not this fetch;
//  - each row carries DK's page freshness (source_as_of): the response Date
//    of an uncached fetch, less the Age header when one is sent.
// Pure apart from fetchSplitsPage's injectable fetch; covered by
// src/test/bettingSplitsFreshness.test.ts.
import type { DkSplitsEvent } from "./parse.ts";

export const BUSTER_PARAM = "_mgp";
export const MAX_ATTEMPTS = 3;
/** A page unchanged this long while other pages changed is a stale capture */
export const STALE_CAPTURE_MS = 3 * 3600_000;
/** DK's cache-control max-age: a HIT is at most this old */
export const DK_MAX_AGE_S = 300;

export type CacheState = "fresh" | "hit" | "stale";

/**
 * nginx's upstream cache status, as WordPress VIP reports it in x-cache.
 * MISS, BYPASS, EXPIRED and REVALIDATED came from DK's origin on this
 * request; HIT is a cached copy under max-age; STALE and UPDATING are old
 * copies served while the cache refreshes. No header means no cache layer
 * answered. Anything else is treated as stale, so it is retried and, if it
 * persists, reported instead of trusted.
 */
export function cacheState(xCache: string | null): CacheState {
  const v = (xCache ?? "").trim().toUpperCase();
  if (v === "" || v === "MISS" || v === "BYPASS" || v === "EXPIRED" || v === "REVALIDATED") return "fresh";
  if (v === "HIT") return "hit";
  return "stale";
}

export function withBuster(url: string, buster: string): string {
  const u = new URL(url);
  u.searchParams.set(BUSTER_PARAM, buster);
  return u.toString();
}

/**
 * When DK's page last showed these numbers: the response Date less the Age
 * header when one is sent; a HIT without Age is taken as max-age old.
 */
export function pageAsOf(state: CacheState, dateHeader: string | null, ageHeader: string | null, fetchedAt: Date): string {
  const date = dateHeader ? Date.parse(dateHeader) : NaN;
  const at = Number.isFinite(date) ? Math.min(date, fetchedAt.getTime()) : fetchedAt.getTime();
  const age = ageHeader === null ? NaN : Number(ageHeader);
  const ageS = Number.isFinite(age) && age >= 0 ? age : state === "hit" ? DK_MAX_AGE_S : 0;
  return new Date(at - ageS * 1000).toISOString();
}

export class StaleSplitsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleSplitsError";
  }
}

export interface FetchedSplitsPage {
  html: string;
  xCache: string | null;
  ageSeconds: number | null;
  state: CacheState;
  /** DK's page freshness (pageAsOf) */
  asOf: string;
  attempts: number;
}

type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

/**
 * One splits page, uncached. The first try uses the run's buster; a cached
 * answer is retried with a new one. HIT on the last try is accepted (at
 * most max-age old, and labeled so); STALE, UPDATING or an unknown status
 * on the last try throws StaleSplitsError.
 */
export async function fetchSplitsPage(
  url: string,
  runBuster: string,
  opts: { userAgent: string; label: string; fetchImpl?: FetchLike; log?: (message: string) => void; now?: () => Date },
): Promise<FetchedSplitsPage> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const log = opts.log ?? ((m: string) => console.log(m));
  const now = opts.now ?? (() => new Date());
  let lastXCache: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const buster = attempt === 1 ? runBuster : `${runBuster}-${attempt}${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetchImpl(withBuster(url, buster), {
      headers: {
        "User-Agent": opts.userAgent,
        Accept: "text/html",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    const xCache = res.headers.get("x-cache");
    const age = res.headers.get("age");
    const state = cacheState(xCache);
    log(`[sync-betting-splits] ${opts.label} try ${attempt}: HTTP ${res.status} x-cache=${xCache ?? "-"} age=${age ?? "-"}`);
    if (!res.ok) throw new Error(`${opts.label}: HTTP ${res.status}`);
    const html = await res.text();
    if (state === "fresh" || (state === "hit" && attempt === MAX_ATTEMPTS)) {
      const ageSeconds = age === null || !Number.isFinite(Number(age)) ? null : Number(age);
      return { html, xCache, ageSeconds, state, asOf: pageAsOf(state, res.headers.get("date"), age, now()), attempts: attempt };
    }
    lastXCache = xCache;
  }
  throw new StaleSplitsError(
    `${opts.label} still came from DK's cache (x-cache ${lastXCache ?? "-"}) after ${MAX_ATTEMPTS} cache-busted tries`,
  );
}

/** FNV-1a, 32 bits, as 8 hex digits */
function fnv1a(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * A page's numbers, independent of event order: every event's sides, lines,
 * prices and percentages. Not the raw HTML, whose ads and markup change on
 * their own.
 */
export function pageHash(events: DkSplitsEvent[]): string {
  const canon = events
    .map((e) =>
      [
        e.eventId,
        ...(["spread", "total", "moneyline"] as const).flatMap((m) =>
          (e.markets[m] ?? []).map((o) => `${m}:${o.side}:${o.line ?? ""}:${o.price ?? ""}:${o.betsPct}:${o.handlePct}`),
        ),
      ].join("|"),
    )
    .sort()
    .join("\n");
  return fnv1a(canon, 0x811c9dc5) + fnv1a(canon, 0x01000193);
}

/** One fetched page of one window */
export interface PageObservation {
  window: string;
  page: number;
  hash: string;
  xCache: string | null;
  ageSeconds: number | null;
  attempts: number;
  /** DK's page freshness for this fetch */
  asOf: string;
  events: DkSplitsEvent[];
}

/** A betting_splits_pages row: the last hash seen per page, and since when */
export interface PageRecord {
  source: "draftkings";
  sport: string;
  window_key: string;
  page: number;
  content_hash: string;
  /** First run that saw this content_hash */
  hash_since: string;
  fetched_at: string;
  x_cache: string | null;
  age_seconds: number | null;
  events: number;
}

export interface PageAssessment {
  records: PageRecord[];
  /** Pages unchanged past STALE_CAPTURE_MS while other pages changed */
  flagged: Array<{ window: string; page: number; unchangedSince: string }>;
  /** Freshness to label each page's rows with, by `${window}|${page}` */
  asOfByPage: Map<string, string>;
  /** Pages whose numbers differ from the previous run's */
  changed: number;
}

export const pageKey = (window: string, page: number) => `${window}|${page}`;

/**
 * Compares this run's pages with the stored records. A page with the same
 * numbers as last time keeps its hash_since; it is flagged when that is over
 * staleAfterMs ago AND some other page changed this run (DK is updating, this
 * page is not). A flagged page's rows are labeled with its hash_since.
 */
export function assessPages(
  sport: string,
  pages: PageObservation[],
  previous: PageRecord[],
  now: Date,
  staleAfterMs: number = STALE_CAPTURE_MS,
): PageAssessment {
  const prevByKey = new Map(previous.map((p) => [pageKey(p.window_key, p.page), p]));
  const isChanged = (p: PageObservation) => {
    const prev = prevByKey.get(pageKey(p.window, p.page));
    return !!prev && prev.content_hash !== p.hash;
  };
  const changed = pages.filter(isChanged).length;
  const records: PageRecord[] = [];
  const flagged: PageAssessment["flagged"] = [];
  const asOfByPage = new Map<string, string>();
  for (const p of pages) {
    const key = pageKey(p.window, p.page);
    const prev = prevByKey.get(key);
    const same = !!prev && prev.content_hash === p.hash;
    // PostgREST returns "+00:00" timestamps: normalize before comparing
    const sinceMs = same ? Date.parse(prev!.hash_since) : now.getTime();
    const hashSince = new Date(Number.isFinite(sinceMs) ? sinceMs : now.getTime()).toISOString();
    records.push({
      source: "draftkings",
      sport,
      window_key: p.window,
      page: p.page,
      content_hash: p.hash,
      hash_since: hashSince,
      fetched_at: now.toISOString(),
      x_cache: p.xCache,
      age_seconds: p.ageSeconds,
      events: p.events.length,
    });
    const stale = same && changed > 0 && now.getTime() - Date.parse(hashSince) > staleAfterMs;
    if (stale) flagged.push({ window: p.window, page: p.page, unchangedSince: hashSince });
    asOfByPage.set(key, stale ? new Date(Math.min(Date.parse(hashSince), Date.parse(p.asOf))).toISOString() : p.asOf);
  }
  return { records, flagged, asOfByPage, changed };
}
