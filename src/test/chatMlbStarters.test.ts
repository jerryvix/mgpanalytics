import { describe, it, expect } from "vitest";
import { chatStarterGames, gameStateLabel, gameTimeLabel, starterLine } from "../../supabase/functions/gemini-chat/mlb-starters";
import { nextMatchupForTeam, type MlbScheduleGame, type PitcherLine, type ProbableMatchup } from "../../supabase/functions/_shared/mlb-statsapi";

// Final review, Sep 24 2026: "Who is pitching for the Pirates today?" after
// the Pirates beat the Cardinals 2-1 got only Friday's starter (Bubba
// Chandler at DET): the chat's starter context dropped every final game.
// Today's games now stay in every state, labeled with the score.

const side = (id: number, name: string, score: number | null = null) => ({ id, name, score, probable: null });
const mk = (gamePk: number, gameDate: string, away: [number, string, number?], home: [number, string, number?], extra: Partial<MlbScheduleGame> = {}): MlbScheduleGame => ({
  gamePk,
  gameDate,
  officialDate: gameDate.slice(0, 10),
  scheduleDay: gameDate.slice(0, 10),
  isPlaceholder: false,
  startTimeTBD: false,
  gameNumber: 1,
  gameType: "R",
  detailedState: "Scheduled",
  state: "pre",
  status: "STATUS_SCHEDULED",
  isFinal: false,
  venue: null,
  weather: null,
  away: side(away[0], away[1], away[2] ?? null),
  home: side(home[0], home[1], home[2] ?? null),
  ...extra,
});
const pitcher = (id: number, name: string): PitcherLine => ({ id, name, hand: "R", season: null, last3: null });
const FINAL = { state: "post" as const, status: "STATUS_FINAL", isFinal: true, detailedState: "Final" };
const LIVE = { state: "in" as const, status: "STATUS_IN_PROGRESS", detailedState: "In Progress" };

// Sep 24-25 2026, as statsapi served them
const stlPit: ProbableMatchup = {
  game: mk(823326, "2026-09-24T16:35:00Z", [138, "St. Louis Cardinals", 1], [134, "Pittsburgh Pirates", 2], FINAL),
  away: pitcher(1, "Kyle Leahy"),
  home: pitcher(694973, "Paul Skenes"),
};
const milPhi: ProbableMatchup = {
  game: mk(823411, "2026-09-24T22:05:00Z", [158, "Milwaukee Brewers", 1], [143, "Philadelphia Phillies", 0], LIVE),
  away: pitcher(2, "Shane Drohan"),
  home: pitcher(3, "Andrew Painter"),
};
const pitDet: ProbableMatchup = {
  game: mk(824220, "2026-09-25T22:40:00Z", [134, "Pittsburgh Pirates"], [116, "Detroit Tigers"]),
  away: pitcher(4, "Bubba Chandler"),
  home: pitcher(5, "Jackson Jobe"),
};
const ppd: ProbableMatchup = {
  game: mk(824785, "2026-09-24T22:35:00Z", [141, "Toronto Blue Jays"], [110, "Baltimore Orioles"], { isPlaceholder: true, status: "STATUS_POSTPONED", state: "post" }),
  away: null,
  home: null,
};

describe("chat MLB starters context", () => {
  it("keeps today's final and live games next to tomorrow's, first pitch first, and drops postponed placeholders", () => {
    const games = chatStarterGames([pitDet, milPhi, ppd, stlPit]);
    expect(games.map((m) => m.game.gamePk)).toEqual([823326, 823411, 824220]);
  });

  it("answers who started today and who starts next for the Pirates", () => {
    const lines = chatStarterGames([pitDet, stlPit]).map(starterLine);
    // (\s: some ICU builds put a narrow no-break space before PM)
    expect(lines[0]).toMatch(/^• Thu 12:35\sPM ET \[FINAL: St\. Louis Cardinals 1, Pittsburgh Pirates 2\]: St\. Louis Cardinals \(Kyle Leahy, RHP\) @ Pittsburgh Pirates \(Paul Skenes, RHP\)$/);
    expect(lines[1]).toMatch(/^• Fri 6:40\sPM ET: Pittsburgh Pirates \(Bubba Chandler, RHP\) @ Detroit Tigers \(Jackson Jobe, RHP\)$/);
  });

  it("labels a game in progress with the score so far", () => {
    expect(gameStateLabel(milPhi.game)).toBe("IN PROGRESS: Milwaukee Brewers 1, Philadelphia Phillies 0");
    expect(starterLine(milPhi)).toContain("[IN PROGRESS: Milwaukee Brewers 1, Philadelphia Phillies 0]: Milwaukee Brewers (Shane Drohan, RHP)");
    expect(gameStateLabel(pitDet.game)).toBeNull();
  });

  it("says a started game's starter is not listed rather than TBD, and keeps TBD for games ahead", () => {
    expect(starterLine({ ...stlPit, away: null })).toContain("St. Louis Cardinals (starter not listed) @");
    expect(starterLine({ ...pitDet, home: null })).toContain("@ Detroit Tigers (TBD)");
  });

  it("still gives hit-streak hitters the next game, not today's final", () => {
    const now = Date.parse("2026-09-24T23:00:00Z");
    const next = nextMatchupForTeam(chatStarterGames([stlPit, pitDet]), "Pittsburgh Pirates", now);
    expect(next?.matchup.game.gamePk).toBe(824220);
    expect(next?.isHome).toBe(false);
  });
});

// Final review, Sep 25 2026: doubleheader game 2 read "Fri 4:10 PM ET", MLB's
// placeholder five minutes after game 1, though MLB lists its time as TBD
// (ESPN and the slate had 7:05 PM ET).
describe("chat MLB starters: a first pitch MLB has not set", () => {
  const TBD = { startTimeTBD: true, gameNumber: 2, scheduleDay: "2026-09-25", officialDate: "2026-09-25" };
  const game1: ProbableMatchup = {
    game: mk(823489, "2026-09-25T20:05:00Z", [110, "Baltimore Orioles"], [147, "New York Yankees"]),
    away: { ...pitcher(6, "Trevor Rogers"), hand: "L" },
    home: null,
  };
  const game2: ProbableMatchup = {
    game: mk(823491, "2026-09-25T20:10:00Z", [110, "Baltimore Orioles"], [147, "New York Yankees"], TBD),
    away: pitcher(7, "Brandon Young"),
    home: null,
  };

  it("prints 'time TBD', never the placeholder, for doubleheader game 2", () => {
    expect(starterLine(game2)).toBe("• Fri, time TBD: Baltimore Orioles (Brandon Young, RHP) @ New York Yankees (TBD)");
    expect(starterLine(game2)).not.toMatch(/4:10/);
  });

  it("keeps game 1's real first pitch", () => {
    expect(starterLine(game1)).toMatch(/^• Fri 4:05\sPM ET: Baltimore Orioles \(Trevor Rogers, LHP\) @ New York Yankees \(TBD\)$/);
  });

  it("drops the time once game 2 is under way or over (MLB keeps the TBD flag)", () => {
    const live = { ...game2, game: { ...game2.game, ...LIVE, away: { ...game2.game.away, score: 2 }, home: { ...game2.game.home, score: 1 } } };
    expect(gameTimeLabel(live.game)).toBe("Fri");
    expect(starterLine(live)).toBe("• Fri [IN PROGRESS: Baltimore Orioles 2, New York Yankees 1]: Baltimore Orioles (Brandon Young, RHP) @ New York Yankees (starter not listed)");
    expect(gameTimeLabel({ ...game2.game, ...FINAL })).toBe("Fri");
  });

  it("labels hit-streak next games the same way", () => {
    expect(gameTimeLabel(game2.game)).toBe("Fri, time TBD");
    expect(gameTimeLabel(game1.game)).toMatch(/^Fri 4:05\sPM ET$/);
  });
});
