import { describe, it, expect } from "vitest";
import { normalizeScoreboard, liveKey, toScoreboardMap, isCalledOff, type LiveGame } from "@/lib/liveScores";
import { isLiveStatus, isFinalStatus } from "@/lib/gameStatus";

const espnFixture = {
  events: [
    {
      id: "401776543",
      shortName: "SEA @ NE",
      date: "2026-07-17T20:05Z",
      status: {
        period: 3,
        displayClock: "10:23",
        type: { state: "in", shortDetail: "10:23 - 3rd", description: "In Progress" },
      },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "17", team: { displayName: "New England Patriots" } },
            { homeAway: "away", score: "21", team: { displayName: "Seattle Seahawks" } },
          ],
        },
      ],
    },
    {
      id: "401776544",
      status: {
        period: 9,
        displayClock: "0:00",
        type: { state: "post", shortDetail: "Final", description: "Final" },
      },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "4", team: { displayName: "New York Yankees" } },
            { homeAway: "away", score: "0", team: { displayName: "Boston Red Sox" } },
          ],
        },
      ],
    },
    {
      id: "401776545",
      status: { period: 0, displayClock: "0:00", type: { state: "pre", shortDetail: "7/20 - 1:05 PM EDT" } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", team: { displayName: "Chicago Cubs" } },
            { homeAway: "away", team: { displayName: "St. Louis Cardinals" } },
          ],
        },
      ],
    },
  ],
};

describe("normalizeScoreboard", () => {
  const games = normalizeScoreboard(espnFixture);

  it("parses all events", () => {
    expect(games).toHaveLength(3);
  });

  it("extracts live game state, scores, period, and clock", () => {
    const live = games[0];
    expect(live.state).toBe("in");
    expect(live.homeName).toBe("New England Patriots");
    expect(live.awayName).toBe("Seattle Seahawks");
    expect(live.homeScore).toBe(17);
    expect(live.awayScore).toBe(21);
    expect(live.period).toBe(3);
    expect(live.clock).toBe("10:23");
    expect(live.detail).toBe("10:23 - 3rd");
    expect(live.startTime).toBe("2026-07-17T20:05Z");
  });

  it("startTime is null when the event has no date", () => {
    expect(games[1].startTime).toBeNull();
  });

  it("extracts final games", () => {
    expect(games[1].state).toBe("post");
    expect(games[1].detail).toBe("Final");
    expect(games[1].homeScore).toBe(4);
  });

  it("handles pre-game with no scores", () => {
    expect(games[2].state).toBe("pre");
    expect(games[2].homeScore).toBeNull();
    expect(games[2].awayScore).toBeNull();
  });

  it("returns empty array on malformed payloads", () => {
    expect(normalizeScoreboard(null)).toEqual([]);
    expect(normalizeScoreboard({})).toEqual([]);
    expect(normalizeScoreboard({ events: "nope" })).toEqual([]);
  });
});

describe("liveKey", () => {
  it("is case-insensitive and trimmed", () => {
    expect(liveKey(" Seattle Seahawks ", "New England Patriots")).toBe(
      "seattle seahawks@new england patriots"
    );
  });
});

const mkGame = (over: Partial<LiveGame>): LiveGame => ({
  espnId: "1",
  homeName: "Boston Red Sox",
  awayName: "Tampa Bay Rays",
  homeScore: null,
  awayScore: null,
  state: "pre",
  detail: "",
  period: null,
  clock: null,
  startTime: null,
  ...over,
});

describe("toScoreboardMap (doubleheaders)", () => {
  const key = liveKey("Tampa Bay Rays", "Boston Red Sox");

  it("keeps the upcoming game over the finished one, regardless of order", () => {
    const final = mkGame({ espnId: "g1", state: "post", detail: "Final" });
    const upcoming = mkGame({ espnId: "g2", state: "pre", startTime: "2026-07-17T23:10Z" });
    expect(toScoreboardMap([final, upcoming]).get(key)?.espnId).toBe("g2");
    expect(toScoreboardMap([upcoming, final]).get(key)?.espnId).toBe("g2");
  });

  it("a live game always wins", () => {
    const live = mkGame({ espnId: "g1", state: "in", detail: "Bot 7th" });
    const upcoming = mkGame({ espnId: "g2", state: "pre" });
    expect(toScoreboardMap([upcoming, live]).get(key)?.espnId).toBe("g1");
    expect(toScoreboardMap([live, upcoming]).get(key)?.espnId).toBe("g1");
  });

  it("distinct matchups never collide", () => {
    const a = mkGame({ espnId: "a" });
    const b = mkGame({ espnId: "b", homeName: "New York Yankees", awayName: "Los Angeles Dodgers" });
    expect(toScoreboardMap([a, b]).size).toBe(2);
  });
});

describe("isCalledOff", () => {
  it("flags postponed/canceled/suspended finals", () => {
    expect(isCalledOff({ state: "post", detail: "Postponed" })).toBe(true);
    expect(isCalledOff({ state: "post", detail: "Canceled" })).toBe(true);
    expect(isCalledOff({ state: "post", detail: "Suspended" })).toBe(true);
  });

  it("does not flag real finals or non-post states", () => {
    expect(isCalledOff({ state: "post", detail: "Final" })).toBe(false);
    expect(isCalledOff({ state: "post", detail: "Final/11 Inn" })).toBe(false);
    expect(isCalledOff({ state: "pre", detail: "Postponed" })).toBe(false);
  });
});

describe("gameStatus helpers", () => {
  it("detects live statuses from every provider format", () => {
    expect(isLiveStatus("STATUS_IN_PROGRESS")).toBe(true);
    expect(isLiveStatus("In Progress")).toBe(true);
    expect(isLiveStatus("live")).toBe(true);
    expect(isLiveStatus("InProgress")).toBe(true);
    expect(isLiveStatus("STATUS_HALFTIME")).toBe(true);
    expect(isLiveStatus("STATUS_END_PERIOD")).toBe(true);
    expect(isLiveStatus("STATUS_SCHEDULED")).toBe(false);
    expect(isLiveStatus("Final")).toBe(false);
    expect(isLiveStatus(null)).toBe(false);
  });

  it("detects final statuses from every provider format", () => {
    expect(isFinalStatus("STATUS_FINAL")).toBe(true);
    expect(isFinalStatus("Final")).toBe(true);
    expect(isFinalStatus("Final/OT")).toBe(true);
    expect(isFinalStatus("STATUS_SCHEDULED")).toBe(false);
    expect(isFinalStatus(undefined)).toBe(false);
  });
});
