import { describe, it, expect } from "vitest";
import { normalizeScoreboard, liveKey } from "@/lib/liveScores";
import { isLiveStatus, isFinalStatus } from "@/lib/gameStatus";

const espnFixture = {
  events: [
    {
      id: "401776543",
      shortName: "SEA @ NE",
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
