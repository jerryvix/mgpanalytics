import { describe, it, expect } from "vitest";
import {
  detectLeague,
  leagueFor,
  ncaabInSeason,
  ncaafInSeason,
  needsCollegeGames,
  resolveLeague,
} from "../../supabase/functions/_shared/league-detect";

// The chat's league detection (gemini-chat). Its keyword lists send college
// team names to NCAAB even in September ("Arizona Washington State odds"), and
// a city plus a shared nickname to the wrong league: QC round 3 found "St.
// Louis Cardinals" and "San Francisco Giants" going to the NFL (and getting an
// NFL game's DraftKings block) and 13 of 30 MLB teams misrouted. Full team
// identities now come first, then bare nicknames by the calendar and the
// schedule, then the keywords.

const sep24 = new Date("2026-09-24T12:00:00Z"); // college football only
const dec5 = new Date("2026-12-05T12:00:00Z"); // both college sports in season
const feb10 = new Date("2027-02-10T12:00:00Z"); // college basketball only
const jul1 = new Date("2027-07-01T12:00:00Z"); // neither

describe("real phrasings in September", () => {
  const cases: Array<[string, string | null, string | null]> = [
    // question, keyword detection alone, resolved
    ["Arizona Washington State odds", "NCAAB", "NCAAF"],
    ["Georgia vs Oklahoma spread", "NCAAB", "NCAAF"],
    ["Duke basketball tonight", "NCAAB", "NCAAB"],
    ["Alabama football line", "NFL", "NCAAF"],
    ["who's favored in Texas A&M LSU", "NCAAB", "NCAAF"],
    ["college football odds today", "NFL", "NCAAF"],
    ["CFB sharp money this weekend", "NCAAF", "NCAAF"],
    ["NCAAB lines tonight", "NCAAB", "NCAAB"],
    ["Kentucky hoops tonight", "NCAAB", "NCAAB"],
  ];
  it.each(cases)("%s", (question, keyword, resolved) => {
    expect(detectLeague(question)).toBe(keyword);
    expect(leagueFor(question, sep24)).toBe(resolved);
  });
});

describe("pro teams by nickname and by keyword", () => {
  it.each([
    ["Chiefs Dolphins spread", "NFL"],
    ["football games today", "NFL"],
    ["NFL public betting this week", "NFL"],
    ["Arizona Cardinals odds", "NFL"],
    ["Lakers Celtics odds", "NBA"],
    ["Yankees Red Sox total", "MLB"],
    // "cincinnati" is in the college keyword list: the identity wins now
    ["Cincinnati Reds odds", "MLB"],
    ["Who leads the league in rushing?", null],
  ])("%s", (question, league) => {
    expect(leagueFor(question, sep24)).toBe(league);
    expect(leagueFor(question, dec5)).toBe(league);
  });
});

const MLB_TEAMS = [
  "Arizona Diamondbacks", "Atlanta Braves", "Baltimore Orioles", "Boston Red Sox", "Chicago Cubs", "Chicago White Sox",
  "Cincinnati Reds", "Cleveland Guardians", "Colorado Rockies", "Detroit Tigers", "Houston Astros", "Kansas City Royals",
  "Los Angeles Angels", "Los Angeles Dodgers", "Miami Marlins", "Milwaukee Brewers", "Minnesota Twins", "New York Mets",
  "New York Yankees", "Sacramento Athletics", "Philadelphia Phillies", "Pittsburgh Pirates", "San Diego Padres",
  "San Francisco Giants", "Seattle Mariners", "St. Louis Cardinals", "Tampa Bay Rays", "Texas Rangers",
  "Toronto Blue Jays", "Washington Nationals",
];
const NFL_TEAMS = [
  "Arizona Cardinals", "Atlanta Falcons", "Baltimore Ravens", "Buffalo Bills", "Carolina Panthers", "Chicago Bears",
  "Cincinnati Bengals", "Cleveland Browns", "Dallas Cowboys", "Denver Broncos", "Detroit Lions", "Green Bay Packers",
  "Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Kansas City Chiefs", "Las Vegas Raiders",
  "Los Angeles Chargers", "Los Angeles Rams", "Miami Dolphins", "Minnesota Vikings", "New England Patriots",
  "New Orleans Saints", "New York Giants", "New York Jets", "Philadelphia Eagles", "Pittsburgh Steelers",
  "San Francisco 49ers", "Seattle Seahawks", "Tampa Bay Buccaneers", "Tennessee Titans", "Washington Commanders",
];

describe("full team identities win over every keyword", () => {
  it("all 30 MLB teams as '<city> <nickname> odds tonight' are MLB", () => {
    expect(MLB_TEAMS).toHaveLength(30);
    expect(MLB_TEAMS.filter((t) => leagueFor(`${t} odds tonight`, sep24) !== "MLB")).toEqual([]);
    // ...whatever the month
    expect(MLB_TEAMS.filter((t) => leagueFor(`${t} odds tonight`, dec5) !== "MLB")).toEqual([]);
  });

  it("all 32 NFL teams as '<city> <nickname> odds' are the NFL", () => {
    expect(NFL_TEAMS).toHaveLength(32);
    expect(NFL_TEAMS.filter((t) => leagueFor(`${t} odds`, sep24) !== "NFL")).toEqual([]);
    expect(NFL_TEAMS.filter((t) => leagueFor(`${t} odds`, feb10) !== "NFL")).toEqual([]);
  });

  it("reads the short forms people type with a city", () => {
    for (const q of [
      "Arizona D-backs odds tonight",
      "Toronto Jays odds",
      "Washington Nats run line",
      "Boston Sox total",
      "Chicago Sox odds",
      "STL Cardinals odds",
      "SF Giants odds",
      "NY Yankees odds",
    ]) {
      expect(leagueFor(q, sep24), q).toBe("MLB");
    }
    for (const q of ["NY Giants odds", "KC Chiefs spread", "LA Rams odds", "Tampa Bay Bucs line"]) {
      expect(leagueFor(q, sep24), q).toBe("NFL");
    }
    expect(leagueFor("LA Lakers odds", sep24)).toBe("NBA");
  });

  it("the blockers: a city plus a shared nickname", () => {
    expect(leagueFor("St. Louis Cardinals odds", sep24)).toBe("MLB");
    expect(leagueFor("San Francisco Giants odds", sep24)).toBe("MLB");
    expect(leagueFor("New York Giants odds", sep24)).toBe("NFL");
    expect(leagueFor("Detroit Tigers odds", sep24)).toBe("MLB");
    expect(leagueFor("Louisville Cardinals odds", sep24)).toBe("NCAAF");
  });

  it("a school plus a shared nickname is college: football in September, basketball in February", () => {
    for (const q of [
      "Louisville Cardinals odds",
      "LSU Tigers odds",
      "Auburn Tigers spread",
      "Arizona Wildcats odds",
      "Georgia Bulldogs vs Fresno State Bulldogs",
      "Miami Hurricanes vs Miami RedHawks",
    ]) {
      expect(leagueFor(q, sep24), q).toBe("NCAAF");
      expect(leagueFor(q, feb10), q).toBe("NCAAB");
    }
    // A sport word still decides between college football and basketball
    expect(leagueFor("Louisville Cardinals basketball", sep24)).toBe("NCAAB");
  });

  it("two leagues named is no guess", () => {
    expect(leagueFor("Detroit Lions and Detroit Tigers odds", sep24)).toBeNull();
  });
});

describe("a bare nickname", () => {
  it("takes the one league it can mean, in season or not", () => {
    expect(leagueFor("Lakers odds", sep24)).toBe("NBA");
    expect(leagueFor("Yankees odds", dec5)).toBe("MLB");
    expect(leagueFor("Wildcats odds", sep24)).toBe("NCAAF");
  });

  it("uses the calendar, a pro team over a college one, and an explicit word", () => {
    expect(leagueFor("Giants odds", dec5)).toBe("NFL"); // MLB is out of season
    expect(leagueFor("Tigers odds", sep24)).toBe("MLB"); // Detroit over LSU and Auburn
    expect(leagueFor("Cardinals MLB odds", sep24)).toBe("MLB");
    expect(leagueFor("Cardinals football odds", dec5)).toBe("NFL");
  });

  it("with two pro leagues live, takes the one with a game in the question's window, else nothing", () => {
    expect(leagueFor("Cardinals odds", sep24)).toBeNull();
    expect(leagueFor("Giants odds", sep24)).toBeNull();
    expect(leagueFor("Cardinals odds tonight", sep24, { withGames: ["MLB"] })).toBe("MLB");
    expect(leagueFor("Cardinals odds", sep24, { withGames: ["NFL", "MLB"] })).toBeNull();
  });
});

describe("the data, then the calendar", () => {
  it("prefers the sport with a game for the teams named when both are in season", () => {
    expect(leagueFor("Duke Kentucky tonight", dec5, { football: 0, basketball: 2 })).toBe("NCAAB");
    expect(leagueFor("Georgia Alabama odds", dec5, { football: 2, basketball: 1 })).toBe("NCAAF");
    // No game either way: the keyword answer
    expect(leagueFor("Georgia Alabama odds", dec5, { football: 0, basketball: 0 })).toBe("NCAAB");
    expect(leagueFor("Georgia Alabama odds", dec5)).toBe("NCAAB");
  });

  it("uses the calendar when only one college sport is in season", () => {
    expect(leagueFor("Georgia vs Tennessee", feb10)).toBe("NCAAB");
    expect(leagueFor("Georgia vs Tennessee", sep24)).toBe("NCAAF");
    expect(leagueFor("Alabama odds", jul1)).toBe("NCAAB"); // neither: the keyword answer
    // An explicit word still wins out of season
    expect(leagueFor("Alabama football line", feb10)).toBe("NCAAF");
  });

  it("knows the seasons: college basketball early November to early April, football late August to late January", () => {
    expect([ncaafInSeason(sep24), ncaabInSeason(sep24)]).toEqual([true, false]);
    expect([ncaafInSeason(dec5), ncaabInSeason(dec5)]).toEqual([true, true]);
    expect([ncaafInSeason(feb10), ncaabInSeason(feb10)]).toEqual([false, true]);
    expect([ncaafInSeason(jul1), ncaabInSeason(jul1)]).toEqual([false, false]);
    expect(ncaabInSeason(new Date("2026-11-02T12:00:00Z"))).toBe(false);
    expect(ncaabInSeason(new Date("2027-04-06T12:00:00Z"))).toBe(true);
    expect(ncaafInSeason(new Date("2026-08-29T12:00:00Z"))).toBe(true);
  });

  it("reads the games tables only when both college sports are in season and no word decides", () => {
    expect(needsCollegeGames("Duke Kentucky tonight", dec5)).toBe(true);
    expect(needsCollegeGames("Duke Kentucky tonight", sep24)).toBe(false);
    expect(needsCollegeGames("Duke basketball tonight", dec5)).toBe(false);
    expect(needsCollegeGames("Chiefs Dolphins spread", dec5)).toBe(false);
  });
});

describe("hockey names and everyday words", () => {
  it("an NHL team is never read as another league's team (the app has no NHL data: no league)", () => {
    for (const q of [
      "New York Rangers odds",
      "Winnipeg Jets odds",
      "Florida Panthers odds",
      "Carolina Hurricanes odds",
      "Vegas Golden Knights odds",
      "LA Kings odds",
      "Boston Bruins odds",
      "Minnesota Wild odds",
      "Oilers odds",
      "NHL odds tonight",
    ]) {
      expect(leagueFor(q, sep24), q).toBeNull();
      expect(leagueFor(q, dec5), q).toBeNull();
    }
  });

  it("a nickname the NHL shares means the team the app covers, or the college team out of hockey season", () => {
    expect(leagueFor("Jets odds", dec5)).toBe("NFL");
    expect(leagueFor("Panthers odds", dec5)).toBe("NFL");
    expect(leagueFor("Kings odds", feb10)).toBe("NBA");
    expect(leagueFor("Kings odds", sep24)).toBe("NBA"); // neither in season yet
    expect(leagueFor("Rangers odds tonight", sep24)).toBe("MLB");
    expect(leagueFor("Rangers odds", dec5)).toBeNull(); // only the NHL's Rangers are playing
    expect(leagueFor("Bruins odds", sep24)).toBe("NCAAF"); // UCLA
    expect(leagueFor("Bruins odds", dec5)).toBeNull();
  });

  it("everyday words are nicknames only with their city, or give way to another team named", () => {
    expect(leagueFor("NFL wild card odds", dec5)).toBe("NFL");
    expect(leagueFor("wild card round spreads", dec5)).toBeNull();
    expect(leagueFor("top point guards in college basketball", dec5)).toBe("NCAAB");
    expect(leagueFor("Cards odds", sep24)).toBeNull();
    expect(leagueFor("STL Cards odds", sep24)).toBe("MLB");
    expect(leagueFor("Arizona Cards spread", sep24)).toBe("NFL");
    expect(leagueFor("Cleveland Indians odds", sep24)).toBe("MLB");
    expect(leagueFor("20 bucks on the Chiefs", dec5)).toBe("NFL");
    expect(leagueFor("Heat odds tonight", dec5)).toBe("NBA");
  });

  it("Kansas City and Oklahoma City are not Kansas or Oklahoma", () => {
    expect(leagueFor("Kansas City odds", sep24)).toBeNull();
    expect(leagueFor("Kansas City Royals odds tonight", sep24)).toBe("MLB");
    expect(leagueFor("Kansas City Chiefs spread", sep24)).toBe("NFL");
    expect(leagueFor("Oklahoma City Thunder odds", dec5)).toBe("NBA");
    expect(leagueFor("Kansas odds", sep24)).toBe("NCAAF");
  });
});

// QC round 4: a city alone that pro and college teams share is a guess
describe("a city alone", () => {
  it("several teams playing there is no guess", () => {
    for (const city of ["Houston", "Pittsburgh", "Buffalo", "Miami", "Arizona", "Washington", "Minnesota", "Cincinnati", "Tennessee", "New York", "Kansas City"]) {
      expect(leagueFor(`${city} odds`, sep24), city).toBeNull();
    }
  });

  it("the schedule or a league word settles it", () => {
    expect(leagueFor("Houston odds tonight", sep24, { playing: ["Houston Astros"] })).toBe("MLB"); // only the Astros play tonight
    expect(leagueFor("Tennessee odds", sep24, { playing: ["Tennessee Volunteers"], playingCollege: ["NCAAF"] })).toBe("NCAAF"); // a Titans bye
    expect(leagueFor("Houston NFL odds", sep24)).toBe("NFL");
    expect(leagueFor("Houston college football odds", sep24)).toBe("NCAAF");
    expect(leagueFor("Houston baseball odds", sep24)).toBe("MLB");
  });

  it("a city with one team in season is that team's league", () => {
    expect(leagueFor("Boston odds tonight", sep24)).toBe("MLB"); // the Red Sox; the Celtics and Bruins are off
    expect(leagueFor("New England odds", sep24)).toBe("NFL");
    expect(leagueFor("New Orleans odds", sep24)).toBe("NFL"); // the Pelicans are off
    expect(leagueFor("Utah odds", sep24)).toBe("NCAAF"); // the Jazz and Mammoth are off
    expect(leagueFor("Houston odds", jul1)).toBe("MLB"); // only the Astros play in July
  });

  it("two such cities: the league where they meet", () => {
    expect(leagueFor("Cincinnati Pittsburgh spread", sep24)).toBeNull();
    const nfl = { matchups: [{ league: "NFL", teams: ["Cincinnati Bengals", "Pittsburgh Steelers"] as [string, string] }] };
    expect(leagueFor("Cincinnati Pittsburgh spread", sep24, nfl)).toBe("NFL");
    const cfb = { matchups: [{ league: "NCAAF", teams: ["Minnesota Golden Gophers", "Washington Huskies"] as [string, string] }] };
    expect(leagueFor("Minnesota vs Washington odds", sep24, cfb)).toBe("NCAAF");
    expect(leagueFor("Minnesota vs Washington odds", sep24, { matchups: [] })).toBeNull();
    expect(leagueFor("Cincinnati Pittsburgh NFL spread", sep24)).toBe("NFL"); // a league word needs no read
  });

  it("a player's name is not the school or city it shares a word with", () => {
    expect(detectLeague("Justin Houston sacks")).toBe("NCAAB"); // the old keyword read
    expect(leagueFor("Justin Houston sacks", sep24)).toBeNull();
    expect(leagueFor("Darnell Washington receiving yards", sep24)).toBeNull();
    expect(leagueFor("Rashee Rice odds", sep24)).toBeNull();
    expect(leagueFor("Rice Owls odds", sep24)).toBe("NCAAF");
    expect(leagueFor("Houston odds", sep24)).toBeNull(); // still the shared city
  });

  it("schools no pro team shares keep the college answer", () => {
    for (const q of ["Alabama odds", "Clemson odds", "Oregon odds", "Central Florida odds", "Ole Miss odds"]) {
      expect(leagueFor(q, sep24), q).toBe("NCAAF");
    }
  });

  it("resolveLeague reads who plays in the question's window", async () => {
    const tables: Record<string, Array<Record<string, unknown>>> = {
      ncaaf_games: [
        { home_team_name: "Georgia Southern Eagles", visitor_team_name: "Houston Cougars", date: "2026-09-26T20:00:00Z" },
        { home_team_name: "Tennessee Volunteers", visitor_team_name: "Texas Longhorns", date: "2026-09-26T16:00:00Z" },
      ],
      games: [
        { home_team_name: "Indianapolis Colts", visitor_team_name: "Houston Texans", date: "2026-09-27T17:00:00Z", league: "NFL" },
        { home_team_name: "Pittsburgh Steelers", visitor_team_name: "Cincinnati Bengals", date: "2026-09-27T17:00:00Z", league: "NFL" },
      ],
      mlb_games: [{ home_team_name: "Houston Astros", visitor_team_name: "Seattle Mariners", date: "2026-09-25T00:10:00Z" }],
    };
    const client = {
      from(table: string) {
        let from = "";
        let to = "";
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "limit"]) q[m] = () => q;
        q.gte = (_c: string, v: string) => ((from = v), q);
        q.lte = (_c: string, v: string) => ((to = v), q);
        q.then = (resolve: (v: unknown) => unknown) => {
          const rows = (tables[table] ?? []).filter((g) => Date.parse(String(g.date)) >= Date.parse(from) && Date.parse(String(g.date)) <= Date.parse(to));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        };
        return q;
      },
    };
    expect(await resolveLeague(client, "Houston odds", sep24)).toBeNull(); // the Cougars, Texans and Astros all play this week
    expect(await resolveLeague(client, "Houston odds tonight", sep24)).toBe("MLB"); // only the Astros tonight
    expect(await resolveLeague(client, "Tennessee odds", sep24)).toBe("NCAAF"); // no Titans game this week: the Volunteers
    expect(await resolveLeague(client, "Cincinnati Pittsburgh spread", sep24)).toBe("NFL"); // the Bengals visit the Steelers
  });
});

describe("resolveLeague for a bare nickname", () => {
  // The real week of Sep 24, 2026: the Cardinals play baseball Thursday and football Sunday
  const tables: Record<string, Array<Record<string, unknown>>> = {
    mlb_games: [
      { home_team_name: "Pittsburgh Pirates", visitor_team_name: "St. Louis Cardinals", date: "2026-09-24T16:35:00Z" },
      { home_team_name: "Milwaukee Brewers", visitor_team_name: "St. Louis Cardinals", date: "2026-09-25T23:40:00Z" },
      { home_team_name: "Philadelphia Phillies", visitor_team_name: "Los Angeles Dodgers", date: "2026-10-08T22:08:00Z" },
    ],
    games: [
      { home_team_name: "San Francisco 49ers", visitor_team_name: "Arizona Cardinals", date: "2026-09-27T20:05:00Z", league: "NFL" },
      { home_team_name: "Seattle Seahawks", visitor_team_name: "Arizona Cardinals", date: "2026-10-11T20:05:00Z", league: "NFL" },
    ],
  };
  const reads: string[] = [];
  const client = {
    from(table: string) {
      let from = "";
      let to = "";
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) q[m] = () => q;
      q.gte = (_c: string, v: string) => ((from = v), q);
      q.lte = (_c: string, v: string) => ((to = v), q);
      q.then = (resolve: (v: unknown) => unknown) => {
        reads.push(table);
        const rows = (tables[table] ?? []).filter((g) => Date.parse(String(g.date)) >= Date.parse(from) && Date.parse(String(g.date)) <= Date.parse(to));
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      };
      return q;
    },
  };

  it("tonight's game settles it; games for both this week do not", async () => {
    expect(await resolveLeague(client, "Cardinals odds tonight", sep24)).toBe("MLB");
    expect(await resolveLeague(client, "Cardinals odds", sep24)).toBeNull();
    expect(await resolveLeague(client, "Giants odds tonight", sep24)).toBeNull(); // no game for either
  });

  it("October, the Cardinals out of the playoffs: the NFL", async () => {
    expect(await resolveLeague(client, "Cardinals odds", new Date("2026-10-08T12:00:00Z"))).toBe("NFL");
  });

  it("reads nothing when the names settle it", async () => {
    reads.length = 0;
    expect(await resolveLeague(client, "St. Louis Cardinals odds", sep24)).toBe("MLB");
    expect(await resolveLeague(client, "Cardinals MLB odds", sep24)).toBe("MLB");
    expect(await resolveLeague(client, "Lakers odds", sep24)).toBe("NBA");
    expect(reads).toEqual([]);
  });
});

describe("resolveLeague", () => {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    ncaaf_games: [
      { id: "f1", date: "2026-12-06T01:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Georgia Bulldogs", visitor_team_name: "Alabama Crimson Tide" },
    ],
    ncaab_games: [
      { id: "b1", date: "2026-12-06T00:00:00Z", status: "STATUS_SCHEDULED", home_team_name: "Kentucky Wildcats", visitor_team_name: "Duke Blue Devils" },
    ],
  };
  const reads: string[] = [];
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "gte", "lte", "limit"]) q[m] = () => q;
      q.then = (resolve: (v: unknown) => unknown) => {
        reads.push(table);
        return Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
      };
      return q;
    },
  };

  it("settles a December college question by the games on the schedule", async () => {
    reads.length = 0;
    expect(await resolveLeague(client, "Duke vs Kentucky odds", dec5)).toBe("NCAAB");
    expect(await resolveLeague(client, "Alabama Georgia spread", dec5)).toBe("NCAAF");
    expect(new Set(reads)).toEqual(new Set(["ncaaf_games", "ncaab_games"]));
  });

  it("needs no read in September, and falls back to the calendar when a read fails", async () => {
    reads.length = 0;
    expect(await resolveLeague(client, "Arizona Washington State odds", sep24)).toBe("NCAAF");
    expect(reads).toEqual([]);
    const failing = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "gte", "lte", "limit"]) q[m] = () => q;
        q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "offline" } }).then(resolve);
        return q;
      },
    };
    expect(await resolveLeague(failing, "Duke vs Kentucky odds", dec5)).toBe("NCAAB");
  });
});
