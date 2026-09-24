import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fetchLiveScores, pickLiveGame, scoreboardDays, scoreboardUrl } from "@/lib/liveScores";
import { useLiveScores } from "@/hooks/useLiveScores";

// NCAAF final QC (Sep 24 2026): with no `groups`, ESPN's college football
// scoreboard is its Top 25 view (18 events that week, 0 of the other 53 FBS
// games), so unranked games never went LIVE, scored or Final until the daily
// sync. MLB's default board also still showed Sep 23 at 12:44 UTC on the 24th.

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

const espnEvent = (id: string, date: string, state: "pre" | "in" | "post", away: string, home: string, awayScore: number, homeScore: number) => ({
  id,
  date,
  status: { type: { state, shortDetail: state === "post" ? "Final" : state === "in" ? "4th 2:10" : "7:00 PM" } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: String(homeScore), team: { displayName: home } },
        { homeAway: "away", score: String(awayScore), team: { displayName: away } },
      ],
    },
  ],
});
const board = (...events: unknown[]) => new Response(JSON.stringify({ events }));

afterEach(() => vi.unstubAllGlobals());

describe("scoreboard URL per sport", () => {
  it("asks college for the whole FBS / Division I group, a big limit, and the Eastern day", () => {
    expect(scoreboardUrl("NCAAF", "20260926")).toBe(`${BASE}/football/college-football/scoreboard?groups=80&limit=500&dates=20260926`);
    expect(scoreboardUrl("NCAAB", "20261110")).toBe(`${BASE}/basketball/mens-college-basketball/scoreboard?groups=50&limit=500&dates=20261110`);
  });

  it("pins MLB, NBA and NFL to the Eastern day", () => {
    expect(scoreboardUrl("MLB", "20260924")).toBe(`${BASE}/baseball/mlb/scoreboard?dates=20260924`);
    expect(scoreboardUrl("NBA", "20261020")).toBe(`${BASE}/basketball/nba/scoreboard?dates=20261020`);
    expect(scoreboardUrl("NFL", "20260927")).toBe(`${BASE}/football/nfl/scoreboard?dates=20260927`);
  });
});

describe("which Eastern days to poll", () => {
  it("is the Eastern day, even after UTC has rolled over", () => {
    expect(scoreboardDays(new Date("2026-09-24T12:44:00Z"))).toEqual(["20260924"]); // 8:44 AM ET
    expect(scoreboardDays(new Date("2026-09-25T02:30:00Z"))).toEqual(["20260924"]); // 10:30 PM ET, the 25th in UTC
  });

  it("adds yesterday from midnight until 6 AM Eastern", () => {
    expect(scoreboardDays(new Date("2026-09-27T04:30:00Z"))).toEqual(["20260926", "20260927"]); // 12:30 AM ET
    expect(scoreboardDays(new Date("2026-09-27T09:59:00Z"))).toEqual(["20260926", "20260927"]); // 5:59 AM ET
    expect(scoreboardDays(new Date("2026-09-27T10:00:00Z"))).toEqual(["20260927"]); // 6:00 AM ET
  });

  it("gets yesterday right across month, year and DST boundaries", () => {
    expect(scoreboardDays(new Date("2026-10-01T05:00:00Z"))).toEqual(["20260930", "20261001"]);
    expect(scoreboardDays(new Date("2027-01-01T06:00:00Z"))).toEqual(["20261231", "20270101"]); // 1 AM EST
    // 12:30 AM EDT the night after clocks sprang forward: 24h earlier is still Mar 7 in Eastern time
    expect(scoreboardDays(new Date("2026-03-09T04:30:00Z"))).toEqual(["20260308", "20260309"]);
  });
});

describe("fetchLiveScores", () => {
  it("fetches only today's board during the day", async () => {
    const fetchMock = vi.fn(async (_url: string) => board());
    vi.stubGlobal("fetch", fetchMock);
    await fetchLiveScores("MLB", new Date("2026-09-24T12:44:00Z"));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([`${BASE}/baseball/mlb/scoreboard?dates=20260924`]);
  });

  it("merges yesterday's late games after midnight, so a game still going keeps its live score", async () => {
    // Kicked off 11:00 PM ET Saturday in Honolulu, 4th quarter at 1:10 AM ET Sunday
    const late = espnEvent("401", "2026-09-27T03:00Z", "in", "UNLV Rebels", "Hawai'i Rainbow Warriors", 24, 21);
    const fetchMock = vi.fn(async (url: string) => (url.includes("dates=20260926") ? board(late) : board()));
    vi.stubGlobal("fetch", fetchMock);
    const index = await fetchLiveScores("NCAAF", new Date("2026-09-27T05:10:00Z"));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([scoreboardUrl("NCAAF", "20260926"), scoreboardUrl("NCAAF", "20260927")]);
    const g = pickLiveGame(index, "UNLV Rebels", "Hawai'i Rainbow Warriors", { start: "2026-09-27T03:00:00Z" });
    expect(g?.state).toBe("in");
    expect(g?.homeScore).toBe(21);
    // a date-only (TBD) row still matches by its Eastern day: Saturday's midnight-ET placeholder
    expect(pickLiveGame(index, "UNLV Rebels", "Hawai'i Rainbow Warriors", { start: "2026-09-26T04:00:00Z", timeTbd: true })?.espnId).toBe("401");
  });

  it("counts a game listed on both days' boards once", async () => {
    const late = espnEvent("402", "2026-09-25T02:10Z", "in", "Colorado Rockies", "San Francisco Giants", 3, 3);
    vi.stubGlobal("fetch", vi.fn(async () => board(late)));
    const index = await fetchLiveScores("MLB", new Date("2026-09-25T04:40:00Z"));
    expect(index.get("colorado rockies@san francisco giants")).toHaveLength(1);
  });

  it("fails the poll when either board fails, so the last good scores stay up", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("dates=20260926") ? new Response("nope", { status: 503 }) : board())));
    await expect(fetchLiveScores("NCAAF", new Date("2026-09-27T05:10:00Z"))).rejects.toThrow(/503/);
  });
});

// The reported bug, end to end through the hook: an unranked FBS game on a
// Saturday is only on ESPN's board when we ask for groups=80.
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("unranked NCAAF games", () => {
  it("now attach to their rows", async () => {
    const kick = new Date(Date.now() - 3600_000).toISOString();
    const ranked = espnEvent("r", kick, "in", "Vanderbilt Commodores", "Georgia Bulldogs", 7, 14);
    const unranked = espnEvent("u", kick, "in", "Kennesaw State Owls", "Jacksonville State Gamecocks", 10, 3);
    // What ESPN serves: every FBS game with groups=80, the Top 25 view without it
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("groups=80") ? board(ranked, unranked) : board(ranked))));
    const { result } = renderHook(() => useLiveScores("NCAAF"), { wrapper });
    await waitFor(() => expect(result.current.anyLive).toBe(true));
    const g = result.current.getGame("Kennesaw State Owls", "Jacksonville State Gamecocks", { start: kick });
    expect(g?.state).toBe("in");
    expect(g?.awayScore).toBe(10);
  });
});
