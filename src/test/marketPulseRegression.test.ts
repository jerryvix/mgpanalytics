import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runPhrasings, type RegressionFixture } from "./marketPulseRegressionRunner";
import { normalizeTeamName } from "../../supabase/functions/sync-betting-splits/match";
import { CONFERENCE_TEAMS, scanTeams } from "../../supabase/functions/_shared/team-names";
import { listScope } from "../../supabase/functions/_shared/pulse-chat";
import { indexPlayerNames, playerSpans } from "../../supabase/functions/_shared/player-names";

// The Market Pulse matcher's regression table (QC rounds 3 to 8): every
// phrasing QC tested, run through the chat's DraftKings block and the app's
// stored-splits pick over the week-4 slate as stored on Sep 24 2026. A change
// to team names, league detection, the intent gate or the matcher that moves
// any answer fails here with the phrasing, what the table holds and what came
// back. The table is fixtures/market-pulse-phrasings.json.

const fixture = JSON.parse(readFileSync(resolve(__dirname, "fixtures/market-pulse-phrasings.json"), "utf8")) as RegressionFixture;

describe("Market Pulse matcher regression table", () => {
  it("reads a possessive as the name it belongs to (QC round 7)", () => {
    expect(normalizeTeamName("Ohio State's")).toBe("ohio state");
    expect(normalizeTeamName("Ohio State’s")).toBe("ohio state");
    expect(normalizeTeamName("Ohio St's")).toBe("ohio st");
    expect(normalizeTeamName("Texas A&M's")).toBe("texas a and m");
    expect(normalizeTeamName("Ole Miss's")).toBe("ole miss");
    expect(normalizeTeamName("Titans'")).toBe("titans");
    expect(normalizeTeamName("St. John's")).toBe("st john");
    // Not a possessive: the other apostrophes just go
    expect(normalizeTeamName("Hawai'i")).toBe("hawaii");
    expect(normalizeTeamName("Hawaiʻi Rainbow Warriors")).toBe("hawaii rainbow warriors");
    expect(normalizeTeamName("Louisiana Ragin' Cajuns")).toBe("louisiana ragin cajuns");
  });

  it("covers QC's phrasings", () => {
    // Rounds 3 to 6's 162 and more, and every phrasing in QC's round 7 and 8 lists
    expect(fixture.phrasings.length).toBeGreaterThanOrEqual(980);
    expect(new Set(fixture.phrasings.map((p) => p.q)).size).toBe(fixture.phrasings.length);
  });

  // About 1,300 phrasings through both paths: 10 to 20 seconds, longer beside the full suite
  it("gives every phrasing the block and the app pick the table holds", async () => {
    const got = await runPhrasings(fixture, fixture.phrasings.map((p) => p.q));
    const moved = got
      .map((g, i) => ({ g, want: fixture.phrasings[i] }))
      .filter(({ g, want }) => JSON.stringify(g) !== JSON.stringify(want))
      .map(({ g, want }) => `${want.q}: table ${JSON.stringify({ chat: want.chat, app: want.app })}, now ${JSON.stringify({ chat: g.chat, app: g.app })}`);
    expect(moved).toEqual([]);
  }, 120_000);

  it("holds QC's must-match and must-not lists", () => {
    const row = (q: string) => fixture.phrasings.find((p) => p.q === q)!;
    // Round 6: team phrases before a place, the missed matchups, short names
    for (const [q, game] of [
      ["A&M LSU public betting", "Texas A&M Aggies @ LSU Tigers"],
      ["Miss State Missouri public betting", "Missouri Tigers @ Mississippi State Bulldogs"],
      ["K-State Cincinnati public betting", "Kansas State Wildcats @ Cincinnati Bearcats"],
      ["Kansas City Miami odds", "Kansas City Chiefs @ Miami Dolphins"],
      ["San Francisco Arizona odds", "Arizona Cardinals @ San Francisco 49ers"],
      ["UGA OU spread", "Oklahoma Sooners @ Georgia Bulldogs"],
      ["OSU Illinois line", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["Chiefs Dolphins prediction", "Kansas City Chiefs @ Miami Dolphins"],
      ["Oklahoma Georgia", "Oklahoma Sooners @ Georgia Bulldogs"],
      ["20 bucks on the Chiefs", "Kansas City Chiefs @ Miami Dolphins"],
    ]) {
      expect(row(q).app, q).toBe(game);
      expect(row(q).chat[0]?.startsWith(game), q).toBe(true);
    }
    // History, player and generic-word questions get nothing
    for (const q of ["Alabama 2020 championship", "did Joe Burrow play at LSU", "jalen hurts alabama", "Bryce Young Alabama", "Old Miss odds", "Rashee Rice odds"]) {
      expect(row(q), q).toEqual({ q, chat: [], app: null });
    }
    // Round 7: possessives, scoped splits lists, futures, "the UK"
    for (const [q, game] of [
      ["Ohio State's spread", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["Ohio St's odds", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["Ohio State’s spread", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["Michigan State's odds", "Nebraska Cornhuskers @ Michigan State Spartans"],
      ["sharp money on Michigan State's game", "Nebraska Cornhuskers @ Michigan State Spartans"],
      ["Iowa State's spread", "Utah Utes @ Iowa State Cyclones"],
      ["Florida State's odds", "Central Arkansas Bears @ Florida State Seminoles"],
      ["Mississippi State's line", "Missouri Tigers @ Mississippi State Bulldogs"],
      ["Oklahoma State's odds", "Oklahoma State Cowboys @ West Virginia Mountaineers"],
      ["Oregon State's odds", "Oregon State Beavers @ UTEP Miners"],
      ["Alabama's odds", "South Carolina Gamecocks @ Alabama Crimson Tide"],
      ["Georgia's spread", "Oklahoma Sooners @ Georgia Bulldogs"],
      ["LSU's line", "Texas A&M Aggies @ LSU Tigers"],
      ["Texas A&M's odds", "Texas A&M Aggies @ LSU Tigers"],
      ["Ole Miss's odds", "Ole Miss Rebels @ Florida Gators"],
      ["Hawai'i odds", "Hawai'i Rainbow Warriors @ Wyoming Cowboys"],
      ["Titans' odds", "Tennessee Titans @ New York Giants"],
    ]) {
      expect(row(q).app, q).toBe(game);
      expect(row(q).chat, q).toHaveLength(1);
      expect(row(q).chat[0].startsWith(game), q).toBe(true);
    }
    const heads = (q: string) => row(q).chat.map((h) => h.replace(/ \((NCAAF|NFL), .*\)$/, ""));
    expect(heads("TNF public betting")).toEqual(["Atlanta Falcons @ Green Bay Packers"]);
    expect(heads("public betting thursday night football")).toEqual(["Atlanta Falcons @ Green Bay Packers"]);
    expect(heads("SNF sharp money")).toEqual(["Los Angeles Rams @ Denver Broncos"]);
    expect(heads("MNF public betting")).toEqual(["Philadelphia Eagles @ Chicago Bears"]);
    expect(heads("who is the public on tonight")).toEqual(["Liberty Flames @ Coastal Carolina Chanticleers", "Atlanta Falcons @ Green Bay Packers"]);
    const inConference = (q: string, conference: string) =>
      heads(q).every((h) => h.split(" @ ").some((team) => CONFERENCE_TEAMS[conference].includes(team)));
    expect(heads("AFC East public betting")).toHaveLength(4);
    expect(inConference("AFC East public betting", "AFC East")).toBe(true);
    for (const [q, conference] of [
      ["SEC public betting", "SEC"],
      ["Big Ten sharp money", "Big Ten"],
      ["sharp money ACC games", "ACC"],
      ["Pac-12 public betting", "Pac-12"],
      ["MAC sharp money", "MAC"],
    ]) {
      expect(heads(q).length, q).toBeGreaterThan(0);
      expect(inConference(q, conference), q).toBe(true);
    }
    for (const q of [
      "CFL public betting",
      "UFL public betting",
      "Heisman public betting",
      "NFL draft public betting",
      "Chiefs Super Bowl odds",
      "Alabama national championship odds",
      "Ohio State win total",
      "Chiefs win total over under",
      "Josh Allen MVP odds",
      "is sports betting legal in the UK",
      "St. John's odds",
    ]) {
      expect(row(q), q).toEqual({ q, chat: [], app: null });
    }
    expect(row("OSU odds").chat[0]).toBe(
      "Ambiguous team 'OSU': ask whether they mean the Beavers (NCAAF), Buckeyes (NCAAF) or Cowboys (NCAAF). Ignore this line if the question is not about betting on an upcoming game.",
    );
  });

  it("holds QC round 8's lists", () => {
    const row = (q: string) => fixture.phrasings.find((p) => p.q === q)!;
    const heads = (q: string) => row(q).chat.map((h) => h.replace(/ \((NCAAF|NFL), .*\)$/, ""));
    const games = {
      uga: "Oklahoma Sooners @ Georgia Bulldogs",
      clemson: "Clemson Tigers @ California Golden Bears",
      auburn: "Vanderbilt Commodores @ Auburn Tigers",
      temple: "Army Black Knights @ Temple Owls",
      stanford: "Georgia Tech Yellow Jackets @ Stanford Cardinal",
      liberty: "Liberty Flames @ Coastal Carolina Chanticleers",
      purdue: "Notre Dame Fighting Irish @ Purdue Boilermakers",
      uva: "Delaware Blue Hens @ Virginia Cavaliers",
      tnf: "Atlanta Falcons @ Green Bay Packers",
      snf: "Los Angeles Rams @ Denver Broncos",
      mnf: "Philadelphia Eagles @ Chicago Bears",
      bama: "South Carolina Gamecocks @ Alabama Crimson Tide",
    };
    // 1. A school with a qualifier after it: its own game in the chat and the app, never the list
    for (const [q, game] of [
      ["public betting on Georgia to cover", games.uga],
      ["public betting on Clemson to cover", games.clemson],
      ["public betting on Auburn to cover", games.auburn],
      ["public betting on Temple to cover", games.temple],
      ["public betting on Stanford to cover", games.stanford],
      ["public betting on Liberty to cover", games.liberty],
      ["public betting on Purdue to cover", games.purdue],
      ["public betting on Virginia to cover", games.uva],
      ["sharp money on the Georgia side", games.uga],
      ["where's the sharp money on Clemson going", games.clemson],
    ]) {
      expect(heads(q), q).toEqual([game]);
      expect(row(q).app, q).toBe(game);
    }
    expect(row("sharp money on Houston to win").chat).toHaveLength(1);
    expect(row("sharp money on Houston to win").chat[0]).toMatch(/^Ambiguous team 'Houston'/);
    // 2. Scopes the list can't filter by: nothing
    for (const q of [
      "late games public betting",
      "early games sharp money",
      "noon games public betting",
      "night games public betting",
      "public betting top 25 games",
      "public betting on ranked matchups",
      "Group of Five public betting",
      "Power 4 sharp money",
      "FCS public betting",
      "SWAC public betting",
      "Ivy League sharp money",
      "HBCU public betting",
      "rivalry games public betting",
      "west coast games public betting",
    ]) {
      expect(row(q), q).toEqual({ q, chat: [], app: null });
    }
    // 3. Weekday nights (that date, 7 PM ET or later) and NFL prime time
    const evening = (q: string, day: string) => {
      expect(row(q).chat.length, q).toBeGreaterThan(0);
      for (const h of row(q).chat) expect(h, q).toMatch(new RegExp(`\\((NCAAF|NFL), ${day} ([7-9]|1[01]):\\d\\d PM ET\\)$`));
    };
    evening("saturday night public betting", "Sat");
    evening("public betting on the Saturday night games", "Sat");
    evening("friday night sharp money", "Fri");
    expect(heads("thursday night public betting")).toEqual([games.liberty, games.tnf]);
    expect(heads("thursday night college football public betting")).toEqual([games.liberty]);
    expect(heads("primetime sharp money")).toEqual([games.tnf, games.snf, games.mnf]);
    // 4. A named prime-time slot is scope enough without a pulse word
    for (const [q, game] of [
      ["thursday night football odds", games.tnf],
      ["sunday night football spread", games.snf],
      ["monday night football odds", games.mnf],
      ["TNF odds", games.tnf],
      ["SNF odds", games.snf],
      ["MNF line", games.mnf],
    ]) {
      expect(heads(q), q).toEqual([game]);
    }
    // 5. "<school> states" is the State school, in the chat and the app
    for (const [q, game] of [
      ["michigan states odds", "Nebraska Cornhuskers @ Michigan State Spartans"],
      ["iowa states odds", "Utah Utes @ Iowa State Cyclones"],
      ["oklahoma states spread", "Oklahoma State Cowboys @ West Virginia Mountaineers"],
      ["ohio states spread", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["florida states spread", "Central Arkansas Bears @ Florida State Seminoles"],
      ["mississippi states odds", "Missouri Tigers @ Mississippi State Bulldogs"],
      ["public betting michigan states game", "Nebraska Cornhuskers @ Michigan State Spartans"],
    ]) {
      expect(heads(q), q).toEqual([game]);
      expect(row(q).app, q).toBe(game);
    }
    // 6. Futures and the past: nothing in the chat or the app
    for (const q of [
      "odds Alabama wins it all",
      "Ohio State odds to win it all",
      "sharp money on Ohio State to win it all",
      "public betting on Alabama to win it all",
      "Georgia to win the SEC odds",
      "who is favored to win the SEC",
      "Ohio State Big Ten champion odds",
      "Chiefs to win the AFC odds",
      "public betting Chiefs to win the AFC",
      "Eagles NFC East odds",
      "Bills to win the division odds",
      "public betting on the Bills to win the division",
      "Georgia odds to make the playoff",
      "where is the money on Georgia to make the playoff",
      "public betting Alabama last season",
      "what was Alabama's ATS record last season",
      "how did Alabama do against the spread last year",
      "What were Alabama's odds in 2020",
    ]) {
      expect(row(q), q).toEqual({ q, chat: [], app: null });
    }
    // 7. "Draft Kings" in two words is the sportsbook
    expect(heads("Draft Kings odds Alabama")).toEqual([games.bama]);
    expect(row("Draft Kings odds Alabama").app).toBe(games.bama);
    expect(heads("what does draft kings have for Georgia Oklahoma")).toEqual([games.uga]);
    // 8. A conference beside one team: its game with a betting word, a title race without one or with a title word
    for (const [q, game] of [
      ["Big Ten public betting Ohio State", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["SEC sharp money Alabama", games.bama],
      ["sharp money Eagles NFC East", games.mnf],
    ]) {
      expect(heads(q), q).toEqual([game]);
      expect(row(q).app, q).toBe(game);
    }
    for (const q of ["Georgia SEC", "Georgia SEC odds", "Ohio State Big Ten odds", "Eagles NFC East odds", "Ohio State Big Ten champion odds"]) {
      expect(row(q), q).toEqual({ q, chat: [], app: null });
    }
    // 9. Postseason words in September: nothing is scheduled, so futures (marketPulsePostseason.test.ts has the postseason)
    for (const q of ["Rose Bowl odds", "Georgia playoff odds", "SEC championship odds", "who wins the SEC championship", "Chiefs Super Bowl odds", "CFP odds"]) {
      expect(row(q), q).toEqual({ q, chat: [], app: null });
    }
  });

  it("holds QC round 9's lists", () => {
    const row = (q: string) => fixture.phrasings.find((p) => p.q === q)!;
    const heads = (q: string) => row(q).chat.map((h) => h.replace(/ \((NCAAF|NFL), .*\)$/, ""));
    // A bare "championship", "division odds" and "conference odds" are title markets; a team the question rules out
    // ("besides", "except", "excluding", "other than", "but", "not") is never matched
    for (const q of [
      "Alabama championship odds",
      "Notre Dame championship odds",
      "public betting on Alabama for the championship",
      "public betting Alabama championship odds",
      "public betting Notre Dame championship",
      "Chiefs division odds",
      "sharp money on the Chiefs division odds",
      "conference odds Georgia",
      "public betting besides Alabama",
      "SEC public betting excluding Alabama",
      "public betting SEC excluding Alabama",
      "public betting all SEC games except Georgia",
      "sharp money on anyone but Ohio State",
      "sharp money other than Georgia",
      "public betting except for Clemson",
      "Miami Sate odds",
      // QC round 10: the other ways to rule a team out, sentence-initial included
      "public betting aside from Alabama",
      "apart from Georgia, public betting",
      "sharp money without Ohio State",
      "public betting minus Alabama",
      "ignoring Alabama where is the sharp money",
      "public betting not including Alabama",
      "not counting Alabama, who is the public on in the SEC",
      "public betting outside of Georgia",
      "leaving out Alabama public betting SEC",
      // The title game by its CFP names, not scheduled in September
      "CFP championship odds",
      "college football playoff title game odds",
      "CFP natty odds",
      // QC round 11: every team in a ruled-out list ("and", "or", "nor", "&", a comma), and a stadium's name
      "public betting besides Alabama or Georgia",
      "sharp money excluding Ohio State and Michigan",
      "other than Alabama and LSU public betting",
      "sharp money not counting the Chiefs or Bills",
      "besides the Chiefs and Bills, where is the sharp money",
      "public betting on the SEC except Alabama and Georgia",
      "public betting ignoring Alabama and Georgia",
      "sharp money besides Alabama, Georgia and LSU",
      // QC round 12: "both" and "either" skipped, "neither ... nor"
      "public betting excluding both Alabama and Georgia",
      "sharp money except for both Georgia and Alabama",
      "not either Alabama or Georgia",
      "neither Alabama nor Georgia, who is the public on",
      "Ohio Stadium odds",
      "Notre Dame Stadium odds",
      "Michigan Stadium public betting",
      "Georgia Dome odds",
      "Liberty Bowl odds",
    ]) {
      expect(row(q), q).toEqual({ q, chat: [], app: null });
    }
    expect(heads("Georgia vs Oklahoma odds, not Alabama")).toEqual(["Oklahoma Sooners @ Georgia Bulldogs"]);
    // The list starts only after the negation word; a sentence break ends it
    expect(heads("public betting on Alabama and Georgia except LSU")).toEqual(["Oklahoma Sooners @ Georgia Bulldogs", "South Carolina Gamecocks @ Alabama Crimson Tide"]);
    expect(heads("public betting besides Alabama, what about Georgia")).toEqual(["Oklahoma Sooners @ Georgia Bulldogs"]);
    // One edit from "state" after a school is that State school, in the chat and the app
    for (const [q, game] of [
      ["Iowa Sate odds", "Utah Utes @ Iowa State Cyclones"],
      ["public betting Iowa Sate", "Utah Utes @ Iowa State Cyclones"],
      ["Michigan Stat odds", "Nebraska Cornhuskers @ Michigan State Spartans"],
      ["sharp money Michigan Stat", "Nebraska Cornhuskers @ Michigan State Spartans"],
      ["Ohio St8 odds", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["public betting Ohio St8", "Illinois Fighting Illini @ Ohio State Buckeyes"],
      ["Oklahoma Staet spread", "Oklahoma State Cowboys @ West Virginia Mountaineers"],
    ]) {
      expect(heads(q), q).toEqual([game]);
      expect(row(q).app, q).toBe(game);
    }
  });

  it("gives the generic list only to questions made of list words (QC round 8, structural)", () => {
    const now = new Date(fixture.now);
    const players = indexPlayerNames(fixture.players);
    for (const p of fixture.phrasings) {
      const hint = p.chat.some((h) => h.startsWith("Ambiguous "));
      const listable = listScope(p.q, now, players) !== null;
      const scan = scanTeams(p.q);
      // A block of three or more games is the generic list (only a question listScope accepts) or the games of the
      // teams the question names ("Georgia Alabama LSU odds"), each with one of them
      const named = new Set(scan.mentions.flatMap((m) => m.teams.map((t) => t.name)));
      if (p.chat.length >= 3 && !listable) {
        for (const head of p.chat) expect(head.replace(/ \((NCAAF|NFL), .*\)$/, "").split(" @ ").some((team) => named.has(team)), `${p.q}: ${head}`).toBe(true);
      }
      // A question listScope rejects that names no team or person gets no games at all
      const namesSomeone = scan.mentions.length > 0 || scan.people.length > 0 || playerSpans(scan.tokens, players).length > 0;
      if (!listable && !namesSomeone && !hint) expect(p.chat, p.q).toEqual([]);
    }
  });
});
