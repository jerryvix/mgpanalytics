import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDkSplitsPage, type DkSplitsEvent } from "../../supabase/functions/sync-betting-splits/parse";
import {
  assessPages,
  BUSTER_PARAM,
  cacheState,
  DK_MAX_AGE_S,
  fetchSplitsPage,
  MAX_ATTEMPTS,
  pageHash,
  StaleSplitsError,
  STALE_CAPTURE_MS,
  withBuster,
  type PageObservation,
  type PageRecord,
} from "../../supabase/functions/sync-betting-splits/freshness";
import { buildSplitRows } from "../../supabase/functions/sync-betting-splits/rows";

// Market Pulse QC round 2, Sep 24 2026: DK Network's CDN (WordPress VIP
// nginx) served page 1 of both sports' splits as x-cache STALE copies of the
// 06:43 page through the 08:01, 09:31 and 10:25 runs; Liberty's spread money
// read 90/10 labeled "split 12m ago" while DK's live page said 93/7.

const page1 = readFileSync(resolve(__dirname, "fixtures", "dk-splits-ncaaf-2026-09-24-p1.html"), "utf-8");
const events = parseDkSplitsPage(page1).events;
const URL_P1 = "https://dknetwork.draftkings.com/draftkings-sportsbook-betting-splits/?tb_eg=87637&tb_edate=n7days&tb_emt=0&tb_page=1";

const response = (xCache: string | null, body = "<html></html>", extra: Record<string, string> = {}, status = 200) =>
  new Response(body, {
    status,
    headers: { ...(xCache ? { "x-cache": xCache } : {}), date: "Thu, 24 Sep 2026 10:28:00 GMT", ...extra },
  });

describe("DK's cache verdicts", () => {
  it("trusts only answers that came from DK's origin on this request", () => {
    for (const v of ["MISS", "miss", "BYPASS", "EXPIRED", "REVALIDATED", null]) expect(cacheState(v)).toBe("fresh");
    expect(cacheState("HIT")).toBe("hit");
    for (const v of ["STALE", "UPDATING", "SOMETHING-NEW"]) expect(cacheState(v)).toBe("stale");
  });

  it("adds the buster without touching DK's own parameters", () => {
    const u = new URL(withBuster(URL_P1, "run1"));
    expect(u.searchParams.get(BUSTER_PARAM)).toBe("run1");
    expect(u.searchParams.get("tb_eg")).toBe("87637");
    expect(u.searchParams.get("tb_page")).toBe("1");
  });
});

describe("fetchSplitsPage", () => {
  const now = () => new Date("2026-09-24T10:28:03Z");

  it("sends the run's buster and no-cache headers, logs x-cache and age, and labels a MISS with DK's response time", async () => {
    const fetchImpl = vi.fn(async () => response("MISS", "fresh page", { age: "0" }));
    const log = vi.fn();
    const got = await fetchSplitsPage(URL_P1, "run1", { userAgent: "UA", label: "NCAAF n7days p1", fetchImpl, log, now });
    expect(got).toMatchObject({ html: "fresh page", xCache: "MISS", ageSeconds: 0, state: "fresh", attempts: 1 });
    expect(got.asOf).toBe("2026-09-24T10:28:00.000Z");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(new URL(url).searchParams.get(BUSTER_PARAM)).toBe("run1");
    expect(init.headers).toMatchObject({ "Cache-Control": "no-cache", Pragma: "no-cache", Accept: "text/html" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("x-cache=MISS age=0"));
  });

  it("retries a STALE copy with a fresh buster and keeps only the uncached page", async () => {
    const answers = [response("STALE", "the 06:43 page"), response("MISS", "the live page")];
    const fetchImpl = vi.fn(async () => answers.shift()!);
    const got = await fetchSplitsPage(URL_P1, "run1", { userAgent: "UA", label: "p1", fetchImpl, log: () => {}, now });
    expect(got).toMatchObject({ html: "the live page", attempts: 2, state: "fresh" });
    const busters = fetchImpl.mock.calls.map((c) => new URL((c as unknown as [string])[0]).searchParams.get(BUSTER_PARAM));
    expect(busters[0]).toBe("run1");
    expect(busters[1]).not.toBe("run1");
  });

  it("fails loudly when every try comes back from the cache", async () => {
    const fetchImpl = vi.fn(async () => response("STALE"));
    await expect(fetchSplitsPage(URL_P1, "run1", { userAgent: "UA", label: "NCAAF n7days p1", fetchImpl, log: () => {}, now })).rejects.toThrow(
      StaleSplitsError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    await expect(
      fetchSplitsPage(URL_P1, "run1", { userAgent: "UA", label: "NCAAF n7days p1", fetchImpl: async () => response("UPDATING"), log: () => {}, now }),
    ).rejects.toThrow(/NCAAF n7days p1 still came from DK's cache \(x-cache UPDATING\)/);
  });

  it("accepts a HIT only on the last try, labeled as old as DK's max-age allows", async () => {
    const fetchImpl = vi.fn(async () => response("HIT", "cached page"));
    const got = await fetchSplitsPage(URL_P1, "run1", { userAgent: "UA", label: "p1", fetchImpl, log: () => {}, now });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(got.state).toBe("hit");
    expect(got.asOf).toBe(new Date(Date.parse("2026-09-24T10:28:00Z") - DK_MAX_AGE_S * 1000).toISOString());
    // An Age header, when sent, is exact
    const aged = await fetchSplitsPage(URL_P1, "run1", {
      userAgent: "UA",
      label: "p1",
      fetchImpl: async () => response("HIT", "cached page", { age: "120" }),
      log: () => {},
      now,
    });
    expect(aged.asOf).toBe("2026-09-24T10:26:00.000Z");
  });

  it("throws on an HTTP error instead of parsing an error page", async () => {
    await expect(
      fetchSplitsPage(URL_P1, "run1", { userAgent: "UA", label: "p1", fetchImpl: async () => response("MISS", "oops", {}, 503), log: () => {}, now }),
    ).rejects.toThrow("p1: HTTP 503");
  });
});

describe("pageHash", () => {
  const liberty = events.find((e) => e.away.startsWith("Liberty"))!;
  const withSpreadMoney = (awayMoney: number): DkSplitsEvent[] =>
    events.map((e) =>
      e !== liberty
        ? e
        : {
            ...e,
            markets: {
              ...e.markets,
              spread: [
                { ...e.markets.spread![0], handlePct: awayMoney },
                { ...e.markets.spread![1], handlePct: 100 - awayMoney },
              ],
            },
          },
    );

  it("changes when one side's money moves (Liberty 90/10 to 93/7) and ignores event order", () => {
    expect(liberty.markets.spread![0].handlePct).toBe(90);
    expect(pageHash(events)).toBe(pageHash([...events].reverse()));
    expect(pageHash(withSpreadMoney(93))).not.toBe(pageHash(events));
    expect(pageHash(withSpreadMoney(90))).toBe(pageHash(events));
  });
});

describe("assessPages (stale capture)", () => {
  const at = (iso: string) => new Date(iso);
  const obs = (page: number, hash: string, asOf = "2026-09-24T10:25:00.000Z"): PageObservation => ({
    window: "n7days",
    page,
    hash,
    xCache: "MISS",
    ageSeconds: null,
    attempts: 1,
    asOf,
    events: [],
  });
  const rec = (page: number, hash: string, since: string): PageRecord => ({
    source: "draftkings",
    sport: "NCAAF",
    window_key: "n7days",
    page,
    content_hash: hash,
    hash_since: since,
    fetched_at: "2026-09-24T09:31:03.943+00:00",
    x_cache: "STALE",
    age_seconds: null,
    events: 10,
  });
  const now = at("2026-09-24T10:25:00Z");

  it("flags page 1 unchanged since 06:43 while page 2 moved, and labels it with 06:43", () => {
    const a = assessPages("NCAAF", [obs(1, "p1-0643"), obs(2, "p2-new")], [rec(1, "p1-0643", "2026-09-24T06:43:44.106+00:00"), rec(2, "p2-old", "2026-09-24T09:31:03.943+00:00")], now);
    expect(a.changed).toBe(1);
    expect(a.flagged).toEqual([{ window: "n7days", page: 1, unchangedSince: "2026-09-24T06:43:44.106Z" }]);
    expect(a.asOfByPage.get("n7days|1")).toBe("2026-09-24T06:43:44.106Z");
    expect(a.asOfByPage.get("n7days|2")).toBe("2026-09-24T10:25:00.000Z");
    // The unchanged page keeps its first sighting; the changed one restarts
    expect(a.records.map((r) => [r.page, r.hash_since])).toEqual([
      [1, "2026-09-24T06:43:44.106Z"],
      [2, "2026-09-24T10:25:00.000Z"],
    ]);
  });

  it("does not flag a quiet slate (nothing changed anywhere) or a page unchanged for less than the limit", () => {
    const quiet = assessPages("NCAAF", [obs(1, "a"), obs(2, "b")], [rec(1, "a", "2026-09-24T02:00:00Z"), rec(2, "b", "2026-09-24T02:00:00Z")], now);
    expect(quiet.flagged).toEqual([]);
    const recent = new Date(now.getTime() - STALE_CAPTURE_MS + 60_000).toISOString();
    const young = assessPages("NCAAF", [obs(1, "a"), obs(2, "b2")], [rec(1, "a", recent), rec(2, "b", recent)], now);
    expect(young.flagged).toEqual([]);
    expect(young.asOfByPage.get("n7days|1")).toBe("2026-09-24T10:25:00.000Z");
  });

  it("starts every page fresh on the first run", () => {
    const first = assessPages("NFL", [obs(1, "a")], [], now);
    expect(first).toMatchObject({ changed: 0, flagged: [] });
    expect(first.records[0]).toMatchObject({ sport: "NFL", hash_since: "2026-09-24T10:25:00.000Z", x_cache: "MISS" });
  });
});

describe("split rows carry DK's page freshness", () => {
  it("labels rows with the page's as-of, our fetch time when none is given", () => {
    const e = { ...events[0], kickoffUtc: new Date("2026-09-24T23:30:00Z") };
    const match = { game: { id: "g1", home_team_name: e.home, visitor_team_name: e.away }, swapped: false };
    const rows = buildSplitRows("NCAAF", e, match, null, "2026-09-24T10:25:00Z", "2026-09-24T06:43:44.106Z");
    expect(rows.every((r) => r.captured_at === "2026-09-24T10:25:00Z" && r.source_as_of === "2026-09-24T06:43:44.106Z")).toBe(true);
    expect(buildSplitRows("NCAAF", e, match, null, "2026-09-24T10:25:00Z")[0].source_as_of).toBe("2026-09-24T10:25:00Z");
  });
});
