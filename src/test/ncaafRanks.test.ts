import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { espnFetch } from "../../supabase/functions/_shared/espn-fetch";
import {
  apRankMap,
  findApPoll,
  servedPoll,
  toGameRow,
  top25,
  weekKey,
  weeksInWindow,
  type EspnEvent,
  type PollSet,
} from "../../supabase/functions/sync-ncaaf-games/ranks";
import { isTop25, parseApPoll, slateRank, STORED_RANK_MAX_AGE_MS, type ApPoll } from "@/lib/apPoll";

// Sep 23 2026: the NCAAF slate showed Texas A&M at #8 while the AP poll
// (released Sep 20) had them at #23. Root cause: sync-ncaaf-games had not
// written since Aug 19 (ESPN 403s Deno), so every ncaaf_games row still held
// the preseason poll. These tests pin the fixed behavior end to end.

// Real cdn.espn.com rankings payload (Week 4 poll, captured Sep 23 2026),
// trimmed to three polls and REORDERED so the AFCA Coaches Poll comes first:
// a first-match or substring selector would take the wrong poll.
const cdnRankings = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/espn-cdn-rankings-2026-week4.json"), "utf-8"),
);

const SITE_RANKINGS = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings";
const TEXAS_AM = "245";
const LSU = "99";

function stubEspn() {
  const seen: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      // Deno's TLS fingerprint is refused by site.api (Node's is not, so the
      // fallback has to be forced here the same way production hits it).
      if (url.includes("site.api.espn.com")) return new Response("Access Denied", { status: 403 });
      if (url.includes("cdn.espn.com/core/college-football/rankings")) {
        return new Response(JSON.stringify(cdnRankings), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }),
  );
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ESPN rankings through the CDN fallback", () => {
  it("normalizes the web-shaped poll so the AP Top 25 resolves by ESPN team id", async () => {
    stubEspn();
    const res = await espnFetch(SITE_RANKINGS);
    expect(res.status).toBe(200);
    const payload = await res.json();

    const ap = findApPoll(payload.rankings);
    expect(ap?.name).toBe("AP Top 25");
    const ranks = apRankMap(ap);
    expect(ranks?.size).toBe(25);
    expect(ranks?.get(TEXAS_AM)).toBe(23);
    expect(ranks?.get("251")).toBe(1); // Texas
    expect(ranks?.get(LSU)).toBe(10);

    // The CDN page has no requestedSeason; the fallback derives it from the
    // selected week filter so callers can tell which poll they were served.
    expect(servedPoll(payload)).toEqual({ season: 2026, seasonType: 2, week: 4 });
  });

  it("the old selector would have ranked games off the Coaches poll", async () => {
    stubEspn();
    const payload = await (await espnFetch(SITE_RANKINGS)).json();
    const old = payload.rankings.find(
      (r: { name?: string }) => r.name?.includes("AP") || r.name?.includes("Poll"),
    );
    expect(old.name).toBe("AFCA Coaches Poll");
    expect(findApPoll(payload.rankings)?.name).toBe("AP Top 25");
  });

  it("translates site.api's plural week filters so a past poll is not silently swapped for the latest", async () => {
    const seen = stubEspn();
    await espnFetch(`${SITE_RANKINGS}?seasons=2026&types=2&weeks=3`);
    const mirror = new URL(seen.find((u) => u.includes("cdn.espn.com"))!);
    expect(mirror.searchParams.get("week")).toBe("3");
    expect(mirror.searchParams.get("seasontype")).toBe("2");
    expect(mirror.searchParams.get("year")).toBe("2026");
    expect(mirror.searchParams.has("weeks")).toBe(false);
    expect(mirror.searchParams.has("types")).toBe(false);
  });
});

describe("findApPoll / top25", () => {
  it("never falls back to another poll when the AP Top 25 is absent", () => {
    // Regular-season Week 1 lists only FCS, D-II and D-III polls
    const week1 = [
      { name: "FCS Coaches Poll", type: "fcs", id: "20", ranks: [{ current: 1, team: { id: "2449" } }] },
      { name: "AFCA Division II Coaches Poll", type: "afca", id: "11", ranks: [] },
    ];
    expect(findApPoll(week1)).toBeNull();
  });

  it("treats ESPN's 99 (unranked) and 0 (receiving votes) as unranked", () => {
    expect(top25(99)).toBeNull();
    expect(top25(0)).toBeNull();
    expect(top25(26)).toBeNull();
    expect(top25("7")).toBe(7);
    expect(top25(23)).toBe(23);
  });
});

function event(opts: {
  id?: string;
  state: "pre" | "in" | "post";
  week: number;
  season?: number;
  away: { id: string; name: string; curated: number; score?: string };
  home: { id: string; name: string; curated: number; score?: string };
}): EspnEvent {
  const side = (s: typeof opts.home, homeAway: string) => ({
    homeAway,
    score: s.score ?? "0",
    curatedRank: { current: s.curated },
    team: { id: s.id, displayName: s.name },
  });
  return {
    id: opts.id ?? "401856702",
    date: "2026-09-26T23:30Z",
    season: { year: opts.season ?? 2026, type: 2 },
    week: { number: opts.week },
    status: {
      type: {
        name: opts.state === "post" ? "STATUS_FINAL" : opts.state === "in" ? "STATUS_IN_PROGRESS" : "STATUS_SCHEDULED",
        state: opts.state,
        completed: opts.state === "post",
      },
    },
    competitions: [{ competitors: [side(opts.home, "home"), side(opts.away, "away")] }],
  };
}

const week4Poll = new Map([[TEXAS_AM, 23], [LSU, 10]]);
const week3Poll = new Map([[TEXAS_AM, 9], [LSU, 7]]);
const polls: PollSet = {
  latest: { season: 2026, ranks: week4Poll },
  byWeek: new Map([[weekKey(2026, 4), week4Poll], [weekKey(2026, 3), week3Poll]]),
};
const NOW = "2026-09-24T06:00:00.000Z";

describe("toGameRow ranks", () => {
  it("gives an upcoming game the CURRENT AP rank, not a stale preseason one", () => {
    // Scoreboard still carrying the preseason ranks (A&M 8, LSU 11)
    const ev = event({
      state: "pre",
      week: 4,
      away: { id: TEXAS_AM, name: "Texas A&M Aggies", curated: 8 },
      home: { id: LSU, name: "LSU Tigers", curated: 11 },
    });
    const row = toGameRow(ev, polls, NOW);
    expect(row.visitor_team_rank).toBe(23);
    expect(row.home_team_rank).toBe(10);
    expect(row.is_featured).toBe(true);
  });

  it("keeps a played game at the rank the teams carried into kickoff", () => {
    const ev = event({
      id: "401856694",
      state: "post",
      week: 3,
      away: { id: "96", name: "Kentucky Wildcats", curated: 99, score: "31" },
      home: { id: TEXAS_AM, name: "Texas A&M Aggies", curated: 9, score: "21" },
    });
    const row = toGameRow(ev, polls, NOW);
    expect(row.home_team_rank).toBe(9); // Week 3 poll, not this week's 23
    expect(row.visitor_team_rank).toBeNull(); // unranked is null, never 99
    expect(row.is_final).toBe(true);
    expect([row.away_score, row.home_score]).toEqual([31, 21]);
  });

  it("falls back to ESPN's curatedRank when that week has no AP poll (Week 1 runs on the preseason poll)", () => {
    const ev = event({
      state: "post",
      week: 1,
      away: { id: "2623", name: "Missouri State Bears", curated: 99 },
      home: { id: TEXAS_AM, name: "Texas A&M Aggies", curated: 8 },
    });
    const row = toGameRow(ev, polls, NOW);
    expect(row.home_team_rank).toBe(8);
    expect(row.visitor_team_rank).toBeNull();
  });

  it("never ranks next season's games off last season's final poll", () => {
    const offseason: PollSet = { latest: { season: 2025, ranks: new Map([[TEXAS_AM, 8]]) }, byWeek: new Map() };
    const ev = event({
      state: "pre",
      week: 1,
      season: 2026,
      away: { id: "2623", name: "Missouri State Bears", curated: 99 },
      home: { id: TEXAS_AM, name: "Texas A&M Aggies", curated: 99 },
    });
    const row = toGameRow(ev, offseason, NOW);
    expect(row.home_team_rank).toBeNull();
    expect(row.is_featured).toBe(false);
  });
});

describe("weeksInWindow", () => {
  const calendar = [
    {
      value: "2",
      entries: [
        { value: "3", startDate: "2026-09-14T07:00Z", endDate: "2026-09-21T06:59Z" },
        { value: "4", startDate: "2026-09-21T07:00Z", endDate: "2026-09-28T06:59Z" },
        { value: "5", startDate: "2026-09-28T07:00Z", endDate: "2026-10-05T06:59Z" },
      ],
    },
    { value: "4", entries: [{ value: "1", startDate: "2027-01-28T08:00Z", endDate: "2027-02-01T07:59Z" }] },
  ];

  it("fetches each overlapping week once and skips the off season", () => {
    const weeks = weeksInWindow(calendar, 2026, new Date("2026-09-17T00:00Z"), new Date("2026-09-30T00:00Z"));
    expect(weeks.map((w) => w.week)).toEqual([3, 4, 5]);
    expect(weeks.every((w) => w.seasonType === 2 && w.year === 2026)).toBe(true);
  });
});

describe("slate rank (frontend)", () => {
  const livePoll: ApPoll = { ranks: new Map([[TEXAS_AM, 23], [LSU, 10]]), season: 2026, week: 4 };
  const now = Date.parse("2026-09-24T06:00:00Z");
  const staleSync = "2026-08-19T01:00:37Z";

  it("parses only the AP poll out of a site.api payload", () => {
    const poll = parseApPoll({
      rankings: [
        { name: "AFCA Coaches Poll", type: "usa", id: "2", ranks: [{ current: 1, team: { id: TEXAS_AM } }] },
        {
          name: "AP Top 25",
          type: "ap",
          id: "1",
          season: { year: 2026 },
          occurrence: { value: "4" },
          ranks: [{ current: 23, team: { id: TEXAS_AM } }, { current: 10, team: { id: LSU } }],
        },
      ],
    });
    expect(poll?.ranks.get(TEXAS_AM)).toBe(23);
    expect(poll?.season).toBe(2026);
    expect(poll?.week).toBe(4);
  });

  it("shows the live poll over a stale synced rank (the #8 vs #23 bug)", () => {
    expect(
      slateRank({ teamId: TEXAS_AM, storedRank: 8, storedAt: staleSync, gameSeason: 2026, poll: livePoll, now }),
    ).toBe(23);
    // Dropped out of the poll: no badge, even with a rank still stored
    expect(
      slateRank({ teamId: "2483", storedRank: 2, storedAt: staleSync, gameSeason: 2026, poll: livePoll, now }),
    ).toBeNull();
  });

  it("falls back to the synced rank only while it is fresh", () => {
    const fresh = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const stale = new Date(now - STORED_RANK_MAX_AGE_MS - 1).toISOString();
    expect(slateRank({ teamId: TEXAS_AM, storedRank: 23, storedAt: fresh, gameSeason: 2026, poll: null, now })).toBe(23);
    expect(slateRank({ teamId: TEXAS_AM, storedRank: 8, storedAt: stale, gameSeason: 2026, poll: null, now })).toBeNull();
    expect(slateRank({ teamId: TEXAS_AM, storedRank: 99, storedAt: fresh, gameSeason: 2026, poll: null, now })).toBeNull();
  });

  it("ignores a poll from another season", () => {
    const lastSeason: ApPoll = { ...livePoll, season: 2025 };
    expect(
      slateRank({ teamId: TEXAS_AM, storedRank: null, storedAt: null, gameSeason: 2026, poll: lastSeason, now }),
    ).toBeNull();
  });

  it("does not count 99 as ranked", () => {
    expect(isTop25(99)).toBe(false);
    expect(isTop25(null)).toBe(false);
    expect(isTop25(25)).toBe(true);
  });
});
