import { describe, it, expect, vi, afterEach } from "vitest";
import { announcedNearby, fetchProbableMatchups, parseSchedule, type ProjectionRow } from "../../supabase/functions/_shared/mlb-statsapi";

// Final review, Sep 24 2026: MLB announced Jacob deGrom for Friday's TEX @ MIN,
// and the Saturday TEX @ MIN card also read "deGrom PROJECTED" from ESPN's
// projection. Nobody starts twice in four days: a projection naming a pitcher
// MLB announced for the same team within 4 days of that game is dropped (TBD).

afterEach(() => vi.unstubAllGlobals());

const TEX = 140;
const MIN = 142;
const DEGROM = 594798;
const OBER = 641927;
const LEITER = 683002;
const RYAN = 657746;

const game = (gamePk: number, date: string, hour: string, away: number | null, home: number | null, awayProbable?: [number, string], homeProbable?: [number, string]) => ({
  gamePk,
  gameDate: `${date}T${hour}:10:00Z`,
  officialDate: date,
  gameNumber: 1,
  gameType: "R",
  status: { abstractGameState: "Preview", detailedState: "Scheduled" },
  teams: {
    away: { team: { id: away, name: "Texas Rangers" }, ...(awayProbable ? { probablePitcher: { id: awayProbable[0], fullName: awayProbable[1] } } : {}) },
    home: { team: { id: home, name: "Minnesota Twins" }, ...(homeProbable ? { probablePitcher: { id: homeProbable[0], fullName: homeProbable[1] } } : {}) },
  },
});
// Real Sep 25-27 2026 TEX @ MIN series: deGrom announced Friday, Saturday's Texas starter not announced
const fri = game(823652, "2026-09-25", "00", TEX, MIN, [DEGROM, "Jacob deGrom"], [RYAN, "Joe Ryan"]);
fri.gameDate = "2026-09-26T00:10:00Z"; // 7:10 PM CT Friday
const sat = game(823653, "2026-09-26", "20", TEX, MIN, undefined, [OBER, "Bailey Ober"]);
const sun = game(823650, "2026-09-27", "19", TEX, MIN);
const day = (date: string, ...games: unknown[]) => ({ date, games });

describe("announcedNearby", () => {
  const games = parseSchedule({ dates: [day("2026-09-25", fri), day("2026-09-26", sat)] });

  it("finds deGrom announced for Texas a day before Saturday's game", () => {
    expect(announcedNearby(games, TEX, DEGROM, 823653, "2026-09-26")).toBe(true);
  });

  it("only counts the same team, another game, and 4 days either way", () => {
    expect(announcedNearby(games, MIN, DEGROM, 823653, "2026-09-26")).toBe(false); // not Minnesota's
    expect(announcedNearby(games, TEX, DEGROM, 823652, "2026-09-25")).toBe(false); // his own game
    expect(announcedNearby(games, TEX, DEGROM, 1, "2026-09-29")).toBe(true); // 4 days after
    expect(announcedNearby(games, TEX, DEGROM, 1, "2026-09-21")).toBe(true); // 4 days before
    expect(announcedNearby(games, TEX, DEGROM, 1, "2026-09-30")).toBe(false); // his next turn, 5 days on
    expect(announcedNearby(games, TEX, LEITER, 823653, "2026-09-26")).toBe(false); // not announced anywhere
  });

  it("ignores a postponed placeholder's probable", () => {
    const ppd = { ...fri, status: { abstractGameState: "Final", detailedState: "Postponed" } };
    expect(announcedNearby(parseSchedule({ dates: [day("2026-09-25", ppd)] }), TEX, DEGROM, 823653, "2026-09-26")).toBe(false);
  });
});

describe("fetchProbableMatchups drops a projection of a pitcher announced nearby", () => {
  const person = (id: number, fullName: string) => ({
    id,
    fullName,
    pitchHand: { code: "R" },
    stats: [{ type: { displayName: "season" }, splits: [{ stat: { wins: 9, losses: 6, era: "3.10", whip: "1.05", strikeOuts: 150, inningsPitched: "140.0", gamesStarted: 24 } }] }],
  });
  const projections: ProjectionRow[] = [
    // ESPN's projections as sync-mlb-games stored them on mlb_games
    { date: "2026-09-26T20:10:00Z", visitor_team_name: "Texas Rangers", home_team_name: "Minnesota Twins", starting_pitcher_away: "Jacob deGrom", starting_pitcher_home: "Bailey Ober" },
    { date: "2026-09-27T19:10:00Z", visitor_team_name: "Texas Rangers", home_team_name: "Minnesota Twins", starting_pitcher_away: "Jack Leiter", starting_pitcher_home: null },
  ];
  const urls: string[] = [];
  const satSun = { dates: [day("2026-09-26", sat), day("2026-09-27", sun)] };
  const friToSun = { dates: [day("2026-09-25", fri), day("2026-09-26", sat), day("2026-09-27", sun)] };
  // `wide` null: the nearby-announcements lookup fails (a 404, so no retries)
  const stub = (wide: unknown, window: unknown = satSun) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("/schedule")) {
          if (url.includes("fields=")) return wide === null ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(wide));
          return new Response(JSON.stringify(window));
        }
        if (url.includes(`/teams/${TEX}/roster`)) {
          return new Response(
            JSON.stringify({
              roster: [
                { person: { id: DEGROM, fullName: "Jacob deGrom" }, position: { abbreviation: "P" } },
                { person: { id: LEITER, fullName: "Jack Leiter" }, position: { abbreviation: "P" } },
              ],
            }),
          );
        }
        if (url.includes("/teams/")) return new Response(JSON.stringify({ roster: [] }));
        if (url.includes("/people?personIds=")) {
          return new Response(JSON.stringify({ people: [person(DEGROM, "Jacob deGrom"), person(OBER, "Bailey Ober"), person(LEITER, "Jack Leiter")] }));
        }
        return new Response("{}", { status: 404 });
      }),
    );

  it("reads Saturday's Texas starter as TBD, even with Friday outside the window, and keeps Sunday's projection", async () => {
    urls.length = 0;
    stub(friToSun);
    const [satM, sunM] = await fetchProbableMatchups("2026-09-26", "2026-09-27", 2026, projections);
    expect(satM.game.gamePk).toBe(823653);
    expect(satM.away).toBeNull(); // not "deGrom PROJECTED"
    expect(satM.home).toMatchObject({ id: OBER, name: "Bailey Ober" }); // announced by MLB
    expect(satM.home?.projected).toBeUndefined();
    expect(sunM.away).toMatchObject({ id: LEITER, name: "Jack Leiter", projected: true });
    // Announcements from 4 days either side of the window
    expect(urls.some((u) => u.includes("/schedule") && u.includes("startDate=2026-09-22&endDate=2026-10-01"))).toBe(true);
  });

  it("falls back to the window's own announcements when the nearby lookup fails", async () => {
    stub(null, friToSun);
    const [friM, satM] = await fetchProbableMatchups("2026-09-25", "2026-09-27", 2026, projections);
    expect(friM.away).toMatchObject({ id: DEGROM, name: "Jacob deGrom" });
    expect(friM.away?.projected).toBeUndefined();
    expect(satM.away).toBeNull();
    // With neither the lookup nor the window showing Friday, the projection stands as before
    stub(null);
    const [satOnly] = await fetchProbableMatchups("2026-09-26", "2026-09-27", 2026, projections);
    expect(satOnly.away).toMatchObject({ id: DEGROM, projected: true });
  });
});
