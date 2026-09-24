import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchEspnEventOdds } from "../../supabase/functions/_shared/espn-odds";
import {
  etDate,
  fetchProbableMatchups,
  matchProjectionRows,
  nextMatchupForTeam,
  parseSchedule,
  personKey,
  resolveRosterName,
  type ProbableMatchup,
  type RosterEntry,
} from "../../supabase/functions/_shared/mlb-statsapi";

// MLB QC round 2 (Sep 24 2026): run-line prices, projected starters, next-game
// rules and MLB's start-time placeholder flag.

afterEach(() => vi.unstubAllGlobals());

describe("ESPN run-line / spread price", () => {
  const stubOdds = (item: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ items: [item] }), { status: 200 }))
    );

  it("reads MLB run-line prices from current.spread.american for both sides", async () => {
    // Shape of ESPN's DraftKings item for event 401817063 (STL at PIT, Sep 24 2026)
    stubOdds({
      provider: { name: "DraftKings" },
      spread: -1.5,
      overUnder: 7,
      homeTeamOdds: {
        moneyLine: -163,
        current: { pointSpread: { american: "-1.5" }, spread: { american: "+144" }, moneyLine: { american: "-163" } },
      },
      awayTeamOdds: {
        moneyLine: 134,
        current: { pointSpread: { american: "+1.5" }, spread: { american: "-175" }, moneyLine: { american: "+134" } },
      },
    });
    const odds = await fetchEspnEventOdds("mlb", "401817063");
    expect(odds).toMatchObject({ spreadHome: -1.5, spreadHomeOdds: 144, spreadAwayOdds: -175, moneylineHome: -163 });
  });

  it("leaves football prices exactly as before (top-level spreadOdds wins)", async () => {
    stubOdds({
      provider: { name: "Draft Kings" },
      spread: -4.5,
      homeTeamOdds: {
        moneyLine: -245,
        spreadOdds: -115,
        current: { pointSpread: { american: "-4.5" }, spread: { american: "-115" } },
      },
      awayTeamOdds: {
        moneyLine: 200,
        spreadOdds: -105,
        current: { pointSpread: { american: "+4.5" }, spread: { american: "-105" } },
      },
    });
    const nfl = await fetchEspnEventOdds("nfl", "401872948");
    expect(nfl).toMatchObject({ spreadHome: -4.5, spreadHomeOdds: -115, spreadAwayOdds: -105 });

    // spreadOdds and current.spread can only differ in a malformed payload; spreadOdds still wins
    stubOdds({
      provider: { name: "Draft Kings" },
      spread: 2.5,
      homeTeamOdds: { moneyLine: 114, spreadOdds: -108, current: { spread: { american: "-999" } } },
      awayTeamOdds: { moneyLine: -135, spreadOdds: -112, current: { spread: { american: "-999" } } },
    });
    const cfb = await fetchEspnEventOdds("college-football", "401869941");
    expect(cfb).toMatchObject({ spreadHomeOdds: -108, spreadAwayOdds: -112 });
  });

  it("keeps a missing price null rather than inventing one", async () => {
    stubOdds({ provider: { name: "DraftKings" }, spread: -1.5, homeTeamOdds: { moneyLine: -120 }, awayTeamOdds: { moneyLine: 100 } });
    const odds = await fetchEspnEventOdds("mlb", "1");
    expect(odds?.spreadHomeOdds).toBeNull();
    expect(odds?.spreadAwayOdds).toBeNull();
  });
});

describe("projected starters", () => {
  const roster: RosterEntry[] = [
    { id: 527048, name: "Martín Pérez", position: "P", status: "A" },
    { id: 663738, name: "Daniel Lynch IV", position: "P", status: "A" },
    { id: 571510, name: "Matthew Boyd", position: "P", status: "A" },
    { id: 1, name: "Chris Holmes", position: "P", status: "A" },
    { id: 2, name: "Clay Holmes", position: "P", status: "A" },
  ];

  it("matches ESPN spellings on the team roster, accents and suffixes aside", () => {
    expect(personKey("Martín Pérez")).toBe(personKey("Martin Perez"));
    expect(resolveRosterName(roster, "Martin Perez")?.id).toBe(527048);
    expect(resolveRosterName(roster, "Daniel Lynch")?.id).toBe(663738);
    expect(resolveRosterName(roster, "Matt Boyd")?.id).toBe(571510); // same last name + initial, one pitcher
    expect(resolveRosterName(roster, "Clay Holmes")?.id).toBe(2);
    expect(resolveRosterName(roster, "C. Holmes")).toBeNull(); // two Holmeses with a C: ambiguous, so TBD
    expect(resolveRosterName(roster, "Nobody Here")).toBeNull();
  });

  const schedule = {
    dates: [
      {
        date: "2026-09-25",
        games: [
          {
            gamePk: 10,
            gameDate: "2026-09-26T02:15:00Z",
            officialDate: "2026-09-25",
            gameNumber: 1,
            gameType: "R",
            status: { abstractGameState: "Preview", detailedState: "Scheduled" },
            teams: {
              away: { team: { id: 119, name: "Los Angeles Dodgers" } },
              home: { team: { id: 137, name: "San Francisco Giants" }, probablePitcher: { id: 805074, fullName: "Yunior Marte" } },
            },
          },
          {
            gamePk: 11,
            gameDate: "2026-09-25T22:40:00Z",
            officialDate: "2026-09-25",
            gameNumber: 1,
            gameType: "R",
            status: { abstractGameState: "Preview", detailedState: "Scheduled" },
            teams: { away: { team: { id: 134, name: "Pittsburgh Pirates" } }, home: { team: { id: 116, name: "Detroit Tigers" } } },
          },
        ],
      },
    ],
  };
  const person = (id: number, fullName: string, era: string) => ({
    id,
    fullName,
    pitchHand: { code: "L" },
    stats: [
      {
        type: { displayName: "season" },
        splits: [{ stat: { wins: 11, losses: 7, era, whip: "0.98", strikeOuts: 180, inningsPitched: "151.2", gamesStarted: 25 } }],
      },
    ],
  });

  it("labels ESPN projections, gives them MLB stats, and leaves unresolvable ones TBD", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/schedule")) return new Response(JSON.stringify(schedule));
        if (url.includes("/teams/119/roster")) {
          return new Response(
            JSON.stringify({ roster: [{ person: { id: 669373, fullName: "Tarik Skubal" }, position: { abbreviation: "P" } }] })
          );
        }
        if (url.includes("/teams/")) return new Response(JSON.stringify({ roster: [] }));
        if (url.includes("/people?personIds=")) {
          return new Response(
            JSON.stringify({ people: [person(669373, "Tarik Skubal", "2.85"), person(805074, "Yunior Marte", "4.10")] })
          );
        }
        return new Response("{}", { status: 404 });
      })
    );
    const projections = [
      {
        date: "2026-09-26T02:15:00Z",
        visitor_team_name: "Los Angeles Dodgers",
        home_team_name: "San Francisco Giants",
        starting_pitcher_away: "Tarik Skubal",
        starting_pitcher_home: "Yunior Marte",
      },
      {
        date: "2026-09-25T22:40:00Z",
        visitor_team_name: "Pittsburgh Pirates",
        home_team_name: "Detroit Tigers",
        starting_pitcher_away: "Bubba Chandler",
        starting_pitcher_home: null,
      },
    ];
    const [lad, pit] = await fetchProbableMatchups("2026-09-25", "2026-09-25", 2026, projections);

    expect(lad.home).toMatchObject({ name: "Yunior Marte" }); // announced by MLB
    expect(lad.home?.projected).toBeUndefined();
    expect(lad.away).toMatchObject({ name: "Tarik Skubal", projected: true, hand: "L" }); // ESPN projection, MLB stats
    expect(lad.away?.season?.era).toBe(2.85);
    expect(pit.away).toBeNull(); // Chandler not found on the roster: TBD, not a bare name
    expect(pit.home).toBeNull(); // nobody listed
  });

  it("pairs mlb_games rows with MLB games by day, matchup and closest first pitch", () => {
    const games = parseSchedule(schedule);
    const map = matchProjectionRows(games, [
      {
        date: "2026-09-25T22:40:00Z",
        visitor_team_name: "Pittsburgh Pirates",
        home_team_name: "Detroit Tigers",
        starting_pitcher_away: "A",
        starting_pitcher_home: null,
      },
      {
        date: "2026-09-24T22:40:00Z",
        visitor_team_name: "Pittsburgh Pirates",
        home_team_name: "Detroit Tigers",
        starting_pitcher_away: "Yesterday",
        starting_pitcher_home: null,
      },
    ]);
    expect(map.get(11)?.starting_pitcher_away).toBe("A");
    expect(map.has(10)).toBe(false);
  });

  it("reads MLB's startTimeTBD flag", () => {
    const [g] = parseSchedule({
      dates: [
        {
          date: "2026-10-01",
          games: [
            {
              gamePk: 1,
              gameDate: "2026-10-01T07:33:00Z",
              gameNumber: 1,
              status: { abstractGameState: "Preview", detailedState: "Scheduled", startTimeTBD: true },
              teams: { away: { team: { name: "A" } }, home: { team: { name: "B" } } },
            },
          ],
        },
      ],
    });
    expect(g.startTimeTBD).toBe(true);
  });
});

describe("nextMatchupForTeam options", () => {
  const mk = (gamePk: number, gameDate: string, gameNumber: number, extra: Record<string, unknown> = {}): ProbableMatchup => ({
    game: {
      gamePk,
      gameDate,
      officialDate: etDate(gameDate),
      scheduleDay: etDate(gameDate),
      isPlaceholder: false,
      startTimeTBD: false,
      gameNumber,
      gameType: "R",
      detailedState: "",
      state: "pre",
      status: "STATUS_SCHEDULED",
      isFinal: false,
      venue: null,
      weather: null,
      away: { id: 1, name: "Chicago Cubs", score: null, probable: null },
      home: { id: 2, name: "Boston Red Sox", score: null, probable: null },
      ...extra,
    },
    away: null,
    home: null,
  });
  const now = Date.parse("2026-09-25T20:00:00Z");

  it("keeps a just-finished game for the table, but prefers doubleheader game 2", () => {
    const final1 = mk(1, "2026-09-25T17:05:00Z", 1, { isFinal: true, status: "STATUS_FINAL", state: "post" });
    const g2 = mk(2, "2026-09-25T22:05:00Z", 2);
    const tomorrow = mk(3, "2026-09-26T17:05:00Z", 1);
    expect(nextMatchupForTeam([final1, tomorrow], "Chicago Cubs", now, { includeRecentFinal: true })?.matchup.game.gamePk).toBe(1);
    expect(nextMatchupForTeam([final1, g2, tomorrow], "Chicago Cubs", now, { includeRecentFinal: true })?.matchup.game.gamePk).toBe(2);
    expect(nextMatchupForTeam([final1, tomorrow], "Chicago Cubs", now)?.matchup.game.gamePk).toBe(3); // chat: next not-final game
  });

  it("never treats a postponed placeholder as the next game", () => {
    const ppd = mk(4, "2026-09-25T22:05:00Z", 1, { isPlaceholder: true, status: "STATUS_POSTPONED" });
    const later = mk(5, "2026-09-26T17:05:00Z", 1);
    expect(nextMatchupForTeam([ppd, later], "Boston Red Sox", now)?.matchup.game.gamePk).toBe(5);
  });
});
