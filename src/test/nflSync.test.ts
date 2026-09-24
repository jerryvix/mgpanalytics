import { describe, it, expect } from "vitest";
import {
  boxParticipants,
  chunk,
  currentNflSeason,
  fantasyPoints,
  gameLogRow,
  hasStarted,
  hasStoredStats,
  isFinalGame,
  isPhantomLine,
  logRowsToSeasonLines,
  mergeSeasonLines,
  nflGameDate,
  nflGameRow,
  normalizePersonName,
  officialGamesPlayed,
  passerRating,
  rosterAppearances,
  sharedLastNameIds,
  selectRecentWeeks,
  staleRows,
  weekKey,
  type BdlGame,
  type SeasonLogRow,
} from "../../supabase/functions/_shared/nfl-sync";
import { formatGameDate } from "@/utils/nflStatsFormatters";

const BUF = { id: 3, abbreviation: "BUF", full_name: "Buffalo Bills", name: "Bills" };
const DET = { id: 25, abbreviation: "DET", full_name: "Detroit Lions", name: "Lions" };

// Shape copied from a live BDL /games row (2026 Week 2 TNF)
const finalGame: BdlGame = {
  id: 1392232,
  date: "2026-09-18T00:15:00.000Z",
  week: 2,
  season: 2026,
  postseason: false,
  status: "Final",
  status_state: "final",
  home_team: BUF,
  visitor_team: DET,
  home_team_score: 41,
  visitor_team_score: 31,
};

const scheduled = (id: number, date: string, week: number, postseason = false): BdlGame => ({
  id,
  date,
  week,
  season: 2026,
  postseason,
  status: "9/27 - 1:00 PM EDT",
  status_state: "scheduled",
  home_team: BUF,
  visitor_team: DET,
  home_team_score: 0,
  visitor_team_score: 0,
});

describe("currentNflSeason", () => {
  it("labels by start year and keeps Jan/Feb on the prior season", () => {
    expect(currentNflSeason(new Date(2026, 8, 23))).toBe(2026);
    expect(currentNflSeason(new Date(2027, 0, 15))).toBe(2026);
    expect(currentNflSeason(new Date(2027, 1, 20))).toBe(2026);
    expect(currentNflSeason(new Date(2027, 2, 1))).toBe(2027);
  });
});

describe("game status", () => {
  it("treats Final and Final/OT as final", () => {
    expect(isFinalGame(finalGame)).toBe(true);
    expect(isFinalGame({ status: "Final/OT", status_state: null })).toBe(true);
    expect(isFinalGame({ status: "9/27 - 1:00 PM EDT", status_state: "scheduled" })).toBe(false);
  });

  it("knows a scheduled game has not started even with 0-0 scores", () => {
    expect(hasStarted(scheduled(1, "2026-09-27T17:00:00.000Z", 3), new Date("2026-09-24T00:00:00Z"))).toBe(false);
  });

  it("treats in-progress states as started", () => {
    const live = { ...scheduled(2, "2026-09-27T17:00:00.000Z", 3), status: "2nd Quarter", status_state: "in_progress" };
    expect(hasStarted(live)).toBe(true);
  });
});

describe("nflGameRow", () => {
  it("stores final scores and is_final", () => {
    const row = nflGameRow(finalGame, 2026);
    expect(row).toMatchObject({
      id: 1392232,
      league: "NFL",
      season: 2026,
      week: 2,
      home_team_name: "Buffalo Bills",
      visitor_team_name: "Detroit Lions",
      home_score: 41,
      away_score: 31,
      is_final: true,
      external_id: "nfl_1392232",
    });
  });

  it("leaves scores null before kickoff instead of writing 0-0", () => {
    const row = nflGameRow(scheduled(9, "2099-01-01T00:00:00.000Z", 3), 2026);
    expect(row.home_score).toBeNull();
    expect(row.away_score).toBeNull();
    expect(row.is_final).toBe(false);
  });
});

describe("nflGameDate", () => {
  it("dates night games by their Eastern kickoff day", () => {
    // Thursday Night Football, 8:15 PM EDT Sep 17 = 00:15Z Sep 18
    expect(nflGameDate("2026-09-18T00:15:00.000Z")).toBe("2026-09-17");
    // Monday night after the fall-back DST change (8:15 PM EST = 01:15Z)
    expect(nflGameDate("2026-11-10T01:15:00.000Z")).toBe("2026-11-09");
  });

  it("keeps afternoon games on the same date", () => {
    expect(nflGameDate("2026-09-13T17:00:00.000Z")).toBe("2026-09-13");
  });

  it("returns null for missing or bad input", () => {
    expect(nflGameDate(null)).toBeNull();
    expect(nflGameDate("not a date")).toBeNull();
  });
});

describe("formatGameDate", () => {
  it("shows a stored calendar date as that day in any US timezone", () => {
    expect(formatGameDate("2026-09-13")).toBe("Sep 13");
  });
});

describe("selectRecentWeeks", () => {
  const games = [
    { ...finalGame, id: 1, week: 1, date: "2026-09-10T00:20:00.000Z" },
    { ...finalGame, id: 2, week: 2, date: "2026-09-18T00:15:00.000Z" },
    { ...finalGame, id: 3, week: 2, date: "2026-09-22T00:15:00.000Z" },
    scheduled(4, "2026-09-25T00:15:00.000Z", 3),
  ];

  it("returns the latest weeks that have kicked off, oldest first", () => {
    expect(selectRecentWeeks(games, 2, new Date("2026-09-24T06:00:00Z"))).toEqual(["R1", "R2"]);
    expect(selectRecentWeeks(games, 1, new Date("2026-09-24T06:00:00Z"))).toEqual(["R2"]);
  });

  it("keeps postseason weeks distinct from regular-season weeks with the same number", () => {
    const wildCard = { ...finalGame, id: 5, week: 1, postseason: true, date: "2027-01-16T21:30:00.000Z" };
    expect(weekKey(wildCard)).toBe("P1");
    expect(selectRecentWeeks([...games, wildCard], 2, new Date("2027-01-20T00:00:00Z"))).toEqual(["R2", "P1"]);
  });
});

describe("passerRating", () => {
  // Expected values are BDL's own qb_rating for the Week 2 BUF-DET box score
  it("matches the official formula (Josh Allen 20/31, 248, 3 TD, 0 INT)", () => {
    expect(passerRating(20, 31, 248, 3, 0)).toBe(121.4);
  });

  it("matches the official formula (Jared Goff 26/38, 327, 4 TD, 0 INT)", () => {
    expect(passerRating(26, 38, 327, 4, 0)).toBe(130);
  });

  it("caps at 158.3 and floors at 0", () => {
    expect(passerRating(10, 10, 300, 5, 0)).toBe(158.3);
    expect(passerRating(0, 10, 0, 0, 5)).toBe(0);
  });

  it("returns null without attempts", () => {
    expect(passerRating(0, 0, 0, 0, 0)).toBeNull();
  });
});

describe("gameLogRow", () => {
  const gibbs = {
    player: { id: 477, first_name: "Jahmyr", last_name: "Gibbs" },
    team: DET,
    game: finalGame,
    rushing_attempts: 16,
    rushing_yards: 52,
    rushing_touchdowns: 0,
    receptions: 6,
    receiving_yards: 61,
    receiving_touchdowns: 1,
    receiving_targets: 8,
    passing_yards: null,
  };

  it("places the player on the team he played for and scores the result", () => {
    const row = gameLogRow(gibbs, finalGame, "uuid-gibbs", 2026)!;
    expect(row).toMatchObject({
      player_id: "uuid-gibbs",
      game_id: "nfl_game_1392232",
      week: 2,
      // Thursday night kickoff (00:15Z on the 18th) is dated by its Eastern day
      game_date: "2026-09-17",
      home_away: "away",
      opponent_abbr: "BUF",
      opponent_name: "Buffalo Bills",
      team_score: 31,
      opponent_score: 41,
      result: "L",
      rush_yards: 52,
      rec_yards: 61,
      rec_td: 1,
      targets: 8,
      pass_yards: 0,
    });
    // 5.2 rushing + 6.1 receiving + 6 for the TD = 17.3; PPR adds 6 catches
    expect(row.fantasy_points).toBe(17.3);
    expect(row.fantasy_points_ppr).toBe(23.3);
  });

  it("uses the game-day team, not today's roster team, for traded players", () => {
    // Same box score line, player now listed elsewhere: stat.team still says DET
    const row = gameLogRow({ ...gibbs, team: DET }, finalGame, "uuid", 2026)!;
    expect(row.home_away).toBe("away");
  });

  it("falls back to the team abbreviation when the id is missing", () => {
    const row = gameLogRow({ ...gibbs, team: { abbreviation: "BUF" } }, finalGame, "uuid", 2026)!;
    expect(row.home_away).toBe("home");
    expect(row.result).toBe("W");
  });

  it("refuses to guess when the team matches neither side", () => {
    expect(gameLogRow({ ...gibbs, team: { id: 99, abbreviation: "XXX" } }, finalGame, "uuid", 2026)).toBeNull();
  });

  it("leaves result empty while a game is still in progress", () => {
    const live = { ...finalGame, status: "3rd Quarter", status_state: "in_progress" };
    const row = gameLogRow(gibbs, live, "uuid", 2026)!;
    expect(row.result).toBeNull();
    expect(row.team_score).toBe(31);
  });

  it("uses BDL's qb_rating for passers when present", () => {
    const allen = { player: { id: 1 }, team: BUF, qb_rating: 121.4, passing_attempts: 31, passing_completions: 20, passing_yards: 248, passing_touchdowns: 3, passing_interceptions: 0 };
    expect(gameLogRow(allen, finalGame, "uuid", 2026)!.passer_rating).toBe(121.4);
  });
});

describe("fantasyPoints", () => {
  it("scores passing with the -2 interception penalty", () => {
    expect(fantasyPoints({ passing_yards: 300, passing_touchdowns: 2, passing_interceptions: 1 })).toEqual({
      fantasy_points: 18,
      fantasy_points_ppr: 18,
    });
  });
});

describe("logRowsToSeasonLines", () => {
  const empty: Omit<SeasonLogRow, "player_id" | "game_id"> = {
    pass_attempts: 0, pass_completions: 0, pass_yards: 0, pass_td: 0, pass_int: 0,
    rush_attempts: 0, rush_yards: 0, rush_td: 0,
    targets: 0, receptions: 0, rec_yards: 0, rec_td: 0,
  };
  const log = (playerId: string, gameId: string, extra: Partial<SeasonLogRow>): SeasonLogRow => ({
    ...empty, player_id: playerId, game_id: gameId, ...extra,
  });
  const bdlIds = new Map([["uuid-maye", "7"], ["uuid-darnold", "8"]]);

  it("sums stored logs into one season line per player, keyed by BDL id", () => {
    const [total] = logRowsToSeasonLines(
      [
        log("uuid-maye", "nfl_game_1", { pass_yards: 250, pass_td: 2, pass_attempts: 30, rush_yards: 40 }),
        log("uuid-maye", "nfl_game_2", { pass_yards: 180, pass_td: 1, pass_attempts: 28, rush_yards: null }),
        log("uuid-maye", "nfl_game_3", { pass_yards: 398, pass_td: 3, pass_attempts: 41, rush_yards: 12 }),
      ],
      bdlIds,
      2025,
    );
    expect(total).toMatchObject({
      player: { id: 7 },
      season: 2025,
      source: "summed_from_game_logs",
      games_played: 3,
      passing_yards: 828,
      passing_touchdowns: 6,
      passing_attempts: 99,
      rushing_yards: 52,
      receptions: 0,
    });
  });

  it("counts games played as distinct games", () => {
    const [total] = logRowsToSeasonLines(
      [log("uuid-maye", "nfl_game_1", { rush_yards: 5 }), log("uuid-maye", "nfl_game_1", { rec_yards: 9 })],
      bdlIds,
      2025,
    );
    expect(total.games_played).toBe(1);
    expect(total.rushing_yards).toBe(5);
    expect(total.receiving_yards).toBe(9);
  });

  it("keeps players separate and skips players with no BDL id", () => {
    const rows = logRowsToSeasonLines(
      [log("uuid-maye", "nfl_game_1", { pass_yards: 1 }), log("uuid-darnold", "nfl_game_1", { pass_yards: 2 }), log("uuid-unknown", "nfl_game_1", { pass_yards: 3 })],
      bdlIds,
      2025,
    );
    expect(rows.map((r) => r.player.id).sort()).toEqual([7, 8]);
  });
});

describe("mergeSeasonLines (season totals from the stored game logs)", () => {
  const KC = { id: 16, abbreviation: "KC", full_name: "Kansas City Chiefs", name: "Chiefs" };
  const DEN = { id: 10, abbreviation: "DEN", full_name: "Denver Broncos", name: "Broncos" };
  const IND = { id: 13, abbreviation: "IND", full_name: "Indianapolis Colts", name: "Colts" };
  const kelce = { id: 212, first_name: "Travis", last_name: "Kelce" };
  const game1: BdlGame = { ...finalGame, id: 9001, week: 1, home_team: KC, visitor_team: DEN, home_team_score: 31, visitor_team_score: 10 };
  const game2: BdlGame = { ...finalGame, id: 9002, week: 2, home_team: KC, visitor_team: IND, home_team_score: 33, visitor_team_score: 30 };
  // Kelce's two 2026 box scores: 5 and 11 targets (ESPN and NFL.com agree on 16)
  const box = [
    { player: kelce, team: KC, game: game1, receiving_targets: 5, receptions: 4, receiving_yards: 41, receiving_touchdowns: 0 },
    { player: kelce, team: KC, game: game2, receiving_targets: 11, receptions: 8, receiving_yards: 96, receiving_touchdowns: 1 },
  ];
  // BDL /season_stats said 17 targets
  const seasonLine = { player: kelce, games_played: 2, receiving_targets: 17, receptions: 12, receiving_yards: 137, receiving_touchdowns: 1, qbr: null };
  const bdlIds = new Map([["uuid-kelce", "212"]]);
  // The production path: box score -> stored log row -> season line
  const storedLogs = (lines: typeof box) => lines.map((b) => gameLogRow(b, b.game, "uuid-kelce", 2026)!);
  const fromLogs = (lines: typeof box) => logRowsToSeasonLines(storedLogs(lines), bdlIds, 2026);

  it("takes counting stats from the logs, not BDL's season line", () => {
    const { lines } = mergeSeasonLines(fromLogs(box), [seasonLine]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ receiving_targets: 16, receptions: 12, receiving_yards: 137, games_played: 2, source: "summed_from_game_logs" });
  });

  it("equals the sum of the stored game-log rows", () => {
    const [line] = mergeSeasonLines(fromLogs(box), [seasonLine]).lines;
    const logs = storedLogs(box);
    const sum = (k: "targets" | "receptions" | "rec_yards" | "rec_td") => logs.reduce((a, l) => a + l[k], 0);
    expect(line.receiving_targets).toBe(sum("targets"));
    expect(line.receptions).toBe(sum("receptions"));
    expect(line.receiving_yards).toBe(sum("rec_yards"));
    expect(line.receiving_touchdowns).toBe(sum("rec_td"));
    // Catch % on the player page is receptions / targets from this row
    expect(Math.round((line.receptions / line.receiving_targets) * 1000) / 10).toBe(75);
  });

  it("keeps BDL's official games played when it counts appearances without a log", () => {
    const [line] = mergeSeasonLines(fromLogs([box[0]]), [{ ...seasonLine, games_played: 2 }]).lines;
    expect(line.games_played).toBe(2);
    expect(line.receiving_targets).toBe(5);
  });

  it("never reports fewer games than the player has logs", () => {
    const [line] = mergeSeasonLines(fromLogs(box), [{ ...seasonLine, games_played: 1 }]).lines;
    expect(line.games_played).toBe(2);
  });

  it("keeps players found in only one source", () => {
    const other = { player: { id: 99 }, games_played: 1, receptions: 0 };
    const res = mergeSeasonLines(fromLogs(box), [other]);
    expect(res.lines).toHaveLength(2);
    expect(res.boxOnly).toBe(1);
    expect(res.seasonOnly).toBe(1);
  });
});

describe("phantom-line guard (ESPN box score check)", () => {
  const PHI = { id: 26, abbreviation: "PHI", full_name: "Philadelphia Eagles", name: "Eagles" };
  // Trimmed ESPN box (cdn.espn.com/core/nfl/boxscore gamepackageJSON.boxscore),
  // 2025 Week 8 NYG @ PHI: Calcaterra is not in it
  const athlete = (firstName: string, lastName: string) => ({ athlete: { firstName, lastName, displayName: `${firstName} ${lastName}` } });
  const espnBox = {
    players: [
      {
        team: { displayName: "Philadelphia Eagles", abbreviation: "PHI" },
        statistics: [
          { name: "passing", athletes: [athlete("Jalen", "Hurts")] },
          { name: "rushing", athletes: [athlete("Saquon", "Barkley"), athlete("Jalen", "Hurts")] },
          { name: "receiving", athletes: [athlete("A.J.", "Brown"), athlete("DeVonta", "Smith"), athlete("Dallas", "Goedert")] },
        ],
      },
      {
        team: { displayName: "New York Giants", abbreviation: "NYG" },
        statistics: [
          { name: "passing", athletes: [athlete("Jaxson", "Dart")] },
          // Older payloads omit lastName: fall back to displayName
          { name: "receiving", athletes: [{ athlete: { displayName: "Wan'Dale Robinson" } }, athlete("Ray-Ray", "McCloud III")] },
        ],
      },
    ],
  };
  const participants = boxParticipants(espnBox);
  const line = (last: string, team: typeof PHI | { full_name: string }, stats: Record<string, number | null>) => ({
    player: { id: 1, first_name: "X", last_name: last },
    team,
    ...stats,
  });

  it("normalizes names: case, accents, punctuation, hyphens and suffixes", () => {
    expect(normalizePersonName("Ray-Ray McCloud III")).toBe("ray ray mccloud");
    expect(normalizePersonName("Amon-Ra St. Brown")).toBe("amon ra st brown");
    expect(normalizePersonName("Ja’Marr Chase")).toBe("jamarr chase");
    expect(normalizePersonName("D'Andre Swift")).toBe("dandre swift");
    expect(normalizePersonName("José Ramírez")).toBe("jose ramirez");
    expect(normalizePersonName("Kenneth Walker Jr.")).toBe("kenneth walker");
    expect(normalizePersonName(null)).toBe("");
  });

  it("reads every player with a stat, per team", () => {
    expect([...participants.keys()].sort()).toEqual(["new york giants", "philadelphia eagles"]);
    expect(participants.get("philadelphia eagles")).toEqual(new Set(["hurts", "barkley", "brown", "smith", "goedert"]));
    expect(participants.get("new york giants")).toEqual(new Set(["dart", "robinson", "mccloud"]));
  });

  it("flags a stat line for a player his team's box does not list (Calcaterra, 1 target)", () => {
    expect(isPhantomLine(line("Calcaterra", PHI, { receiving_targets: 1, receptions: 0 }), participants)).toBe(true);
  });

  it("keeps players who are in the box", () => {
    expect(isPhantomLine(line("Goedert", PHI, { receiving_targets: 6, receptions: 4, receiving_yards: 38 }), participants)).toBe(false);
    // BDL's suffix and ESPN's suffix both normalize away
    expect(isPhantomLine(line("McCloud III", { full_name: "New York Giants" }, { receiving_targets: 2 }), participants)).toBe(false);
    expect(isPhantomLine(line("McCloud", { full_name: "New York Giants" }, { receiving_targets: 2 }), participants)).toBe(false);
  });

  it("keeps lines with nothing we store (special-teams appearances)", () => {
    const specialTeams = line("Calcaterra", PHI, { receiving_targets: 0, receptions: 0, rushing_yards: null, defensive_tackles: 2 } as Record<string, number | null>);
    expect(hasStoredStats(specialTeams)).toBe(false);
    expect(isPhantomLine(specialTeams, participants)).toBe(false);
  });

  it("never drops a line when ESPN's box does not cover the player's team", () => {
    expect(isPhantomLine(line("Calcaterra", { full_name: "Dallas Cowboys" }, { receiving_targets: 1 }), participants)).toBe(false);
    const thin = boxParticipants({ players: [{ team: { displayName: "Philadelphia Eagles" }, statistics: [] }] });
    expect(isPhantomLine(line("Calcaterra", PHI, { receiving_targets: 1 }), thin)).toBe(false);
    expect(isPhantomLine(line("Calcaterra", PHI, { receiving_targets: 1 }), boxParticipants(undefined))).toBe(false);
  });
});

describe("official postseason games played (ESPN playoff game rosters)", () => {
  // Trimmed ESPN core roster entries: a stat record ref means the player appeared
  const entry = (playerId: number, displayName: string, opts: { stats?: boolean; dnp?: boolean } = {}) => ({
    playerId,
    displayName,
    didNotPlay: opts.dnp ?? false,
    ...(opts.stats === false ? {} : { statistics: { $ref: `http://sports.core.api.espn.com/x/${playerId}` } }),
  });
  // 2025 New England: Jack Westover (special teams) appears in every game but
  // has a box-score line in one; an injured player keeps a roster entry
  // without a stat record; a flagged did-not-play entry never counts. ESPN's
  // game rosters name players by last name only.
  const ne = (...extra: ReturnType<typeof entry>[]) => ({
    team: "New England Patriots",
    entries: rosterAppearances({ entries: [entry(4361100, "Westover"), entry(4430807, "Chism III"), ...extra] }),
  });
  const rosters = [
    ne(entry(1, "Player", { stats: false })),
    ne(entry(1, "Player", { stats: false })),
    ne(entry(2, "Quarterback", { dnp: true })),
    ne(),
    { team: "Seattle Seahawks", entries: rosterAppearances({ entries: [entry(2975863, "Saubert"), entry(9, "St. Brown")] }) },
  ];

  it("reads appearances from a game roster", () => {
    expect(rosterAppearances({ entries: [entry(7, "B"), entry(8, "D", { stats: false }), entry(9, "F", { dnp: true })] }).map((e) => e.appeared)).toEqual([true, false, false]);
    expect(rosterAppearances(null)).toEqual([]);
  });

  it("flags teammates who share a last name (they need a full-name lookup)", () => {
    const seattle = { team: "Seattle Seahawks", entries: rosterAppearances({ entries: [entry(21, "Smith"), entry(22, "Smith"), entry(23, "Saubert")] }) };
    const other = { team: "New England Patriots", entries: rosterAppearances({ entries: [entry(24, "Smith")] }) };
    expect(sharedLastNameIds([seattle, other])).toEqual(new Set(["21", "22"]));
  });

  it("counts every game a player appeared in, not just box-score lines", () => {
    const gp = officialGamesPlayed(rosters, [
      { key: "westover", team: "New England Patriots", first: "Jack", last: "Westover" },
      { key: "saubert", team: "Seattle Seahawks", first: "Eric", last: "Saubert" },
      { key: "injured", team: "New England Patriots", first: "Injured", last: "Player" },
      { key: "backup", team: "New England Patriots", first: "Backup", last: "Quarterback" },
    ]);
    expect(gp.get("westover")).toBe(4);
    expect(gp.get("saubert")).toBe(1);
    expect(gp.get("injured")).toBe(0);
    expect(gp.get("backup")).toBe(0);
  });

  it("matches suffixes, punctuation and first-initial variants within the team", () => {
    const gp = officialGamesPlayed(rosters, [
      { key: "chism", team: "New England Patriots", first: "Efton", last: "Chism" },
      { key: "st-brown", team: "Seattle Seahawks", first: "Amon Ra", last: "St Brown" },
      { key: "initial", team: "New England Patriots", first: "J.", last: "Westover" },
    ]);
    expect(gp.get("chism")).toBe(4);
    expect(gp.get("st-brown")).toBe(1);
    expect(gp.get("initial")).toBe(4);
  });

  it("tells teammates with the same last name apart by their full names", () => {
    const smiths = rosterAppearances({ entries: [entry(21, "Smith"), entry(22, "Smith", { stats: false })] });
    smiths[0].fullName = "Jalen Smith";
    smiths[1].fullName = "Tre Smith";
    const gp = officialGamesPlayed([{ team: "Seattle Seahawks", entries: smiths }], [
      { key: "jalen", team: "Seattle Seahawks", first: "Jalen", last: "Smith" },
      { key: "tre", team: "Seattle Seahawks", first: "Tre", last: "Smith" },
    ]);
    expect(gp.get("jalen")).toBe(1);
    expect(gp.get("tre")).toBe(0);
  });

  it("leaves a player out rather than guess (other team, unknown name, ambiguous)", () => {
    const twins = rosterAppearances({ entries: [entry(21, "Smith"), entry(22, "Smith")] });
    twins[0].fullName = "Jalen Smith";
    twins[1].fullName = "Jordan Smith";
    const gp = officialGamesPlayed([...rosters, { team: "Seattle Seahawks", entries: twins }], [
      { key: "wrong-team", team: "Seattle Seahawks", first: "Jack", last: "Westover" },
      { key: "unknown", team: "New England Patriots", first: "Not", last: "Listed" },
      { key: "ambiguous", team: "Seattle Seahawks", first: "J", last: "Smith" },
    ]);
    expect(gp.has("wrong-team")).toBe(false);
    expect(gp.has("unknown")).toBe(false);
    expect(gp.has("ambiguous")).toBe(false);
  });
});

describe("staleRows / chunk", () => {
  it("returns rows the source no longer reports", () => {
    const existing = [
      { id: "a", player_id: "p1" },
      { id: "b", player_id: "p2" },
      { id: "c", player_id: "p3" },
    ];
    expect(staleRows(existing, (r) => r.player_id, new Set(["p1", "p3"]))).toEqual([{ id: "b", player_id: "p2" }]);
  });

  it("chunks without dropping the tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
