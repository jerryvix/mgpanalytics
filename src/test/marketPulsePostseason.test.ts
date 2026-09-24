import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runPhrasings, type RegressionFixture } from "./marketPulseRegressionRunner";
import { collegeEvent, eventsAsked, nflEvent } from "../../supabase/functions/_shared/game-events";
import { gameIntent } from "../../supabase/functions/_shared/pulse-chat";

// QC round 8 follow-up: a futures word (playoff, Super Bowl, CFP, national
// championship, bowl, title game) gets a game only when the games tables hold
// that event in the window; otherwise it stays futures and gets nothing.
// fixtures/market-pulse-postseason.json holds synthetic slates (conference
// championship weekend, bowl week with CFP games at the Cotton, Rose and Sugar
// Bowls, NFL conference championship Sunday with the CFP title game, Super
// Bowl week), each phrasing's DraftKings block and the app's pick, with the
// league as resolveLeague reads it from the slate's tables.

interface Slate extends RegressionFixture {
  name: string;
}
const fixture = JSON.parse(readFileSync(resolve(__dirname, "fixtures/market-pulse-postseason.json"), "utf8")) as { slates: Slate[] };
const slate = (prefix: string) => fixture.slates.find((s) => s.name.startsWith(prefix))!;

describe("postseason events: a game only when one is scheduled", () => {
  it("gives every phrasing the block and the app pick the slates hold", async () => {
    for (const s of fixture.slates) {
      const got = await runPhrasings({ ...s, note: "" }, s.phrasings.map((p) => p.q), { resolveLeagues: true });
      const moved = got
        .map((g, i) => ({ g, want: s.phrasings[i] }))
        .filter(({ g, want }) => JSON.stringify(g) !== JSON.stringify(want))
        .map(({ g, want }) => `${s.name}: ${want.q}: table ${JSON.stringify({ chat: want.chat, app: want.app })}, now ${JSON.stringify({ chat: g.chat, app: g.app })}`);
      expect(moved).toEqual([]);
    }
  }, 60_000);

  it("names the scheduled event's game, by the event or by its teams", () => {
    const heads = (s: Slate, q: string) => s.phrasings.find((p) => p.q === q)!.chat.map((h) => h.replace(/ \((NCAAF|NFL), .*\)$/, ""));
    const app = (s: Slate, q: string) => s.phrasings.find((p) => p.q === q)!.app;
    const december = slate("Conference championship weekend");
    const sec = "Alabama Crimson Tide @ Georgia Bulldogs";
    const bigTen = "Oregon Ducks @ Ohio State Buckeyes";
    for (const q of ["SEC championship odds", "SEC title game spread", "Georgia SEC championship odds", "who wins the SEC championship", "Alabama odds", "SEC sharp money Alabama"]) {
      expect(heads(december, q), q).toEqual([sec]);
      expect(app(december, q), q).toBe(sec);
    }
    for (const q of ["Big Ten title game odds", "Ohio State Big Ten championship odds", "Big Ten public betting Ohio State"]) expect(heads(december, q), q).toEqual([bigTen]);
    expect(heads(december, "championship game odds")).toHaveLength(5);
    const bowls = slate("Bowl week");
    const cotton = "Texas Longhorns @ Ohio State Buckeyes";
    for (const q of ["Cotton Bowl odds", "Texas Ohio State Cotton Bowl odds", "Ohio State playoff odds"]) expect(heads(bowls, q), q).toEqual([cotton]);
    expect(heads(bowls, "Rose Bowl spread")).toEqual(["Georgia Bulldogs @ Oregon Ducks"]);
    expect(heads(bowls, "Syracuse Pinstripe Bowl odds")).toEqual(["Syracuse Orange @ Nebraska Cornhuskers"]);
    // Dec 29: the New Year's Six games are quarterfinals, so no semifinal yet (QC round 9)
    expect(heads(bowls, "CFP quarterfinal odds")).toEqual([cotton, "Georgia Bulldogs @ Oregon Ducks", "Notre Dame Fighting Irish @ Alabama Crimson Tide"]);
    expect(heads(bowls, "CFP semifinal odds")).toEqual([]);
    const january = slate("NFL conference championships");
    expect(heads(january, "national championship odds")).toEqual([bigTen]);
    expect(heads(january, "Ohio State national championship odds")).toEqual([bigTen]);
    expect(heads(january, "AFC championship odds")).toEqual(["Buffalo Bills @ Kansas City Chiefs"]);
    expect(heads(january, "NFC championship game public betting")).toEqual(["Detroit Lions @ Philadelphia Eagles"]);
    const superBowl = slate("Super Bowl week");
    for (const q of ["Super Bowl odds", "Super Bowl public betting", "Super Bowl LXI spread", "Chiefs Super Bowl odds", "who wins the Super Bowl"]) {
      expect(heads(superBowl, q), q).toEqual(["Kansas City Chiefs @ Philadelphia Eagles"]);
    }
  });

  it("keeps futures and events nobody scheduled blocked, in the chat and the app", () => {
    const none = (s: Slate, qs: string[]) => {
      for (const q of qs) expect(s.phrasings.find((p) => p.q === q), `${s.name}: ${q}`).toEqual({ q, chat: [], app: null });
    };
    none(slate("Conference championship weekend"), [
      "Georgia SEC title odds", "Ohio State Big Ten title odds", "SEC champion odds", "Alabama national championship odds",
      "national championship odds", "Alabama playoff odds", "bowl game odds Alabama", "Super Bowl odds", "Chiefs Super Bowl odds", "Georgia SEC",
    ]);
    none(slate("Bowl week"), [
      "Orange Bowl odds", "Pinstripe Bowl odds", "Syracuse playoff odds", "Georgia Sugar Bowl odds", "national championship odds",
      "Ohio State national championship odds", "Super Bowl odds", "Alabama bowl record", "Rose Bowl", "Georgia to make the playoff",
    ]);
    none(slate("NFL conference championships"), ["Georgia national championship odds", "Eagles AFC championship odds", "Super Bowl odds", "Chiefs Super Bowl odds", "NFC East odds"]);
    none(slate("Super Bowl week"), ["Bills Super Bowl odds", "Super Bowl MVP odds", "Super Bowl", "national championship odds"]);
  });

  it("gives a title-game question only the title game, finds it by date, and asks which playoffs (QC round 10)", () => {
    const heads = (s: Slate, q: string) => s.phrasings.find((p) => p.q === q)!.chat.map((h) => h.replace(/ \((NCAAF|NFL), .*\)$/, ""));
    const none = (s: Slate, qs: string[]) => {
      for (const q of qs) expect(s.phrasings.find((p) => p.q === q), `${s.name}: ${q}`).toEqual({ q, chat: [], app: null });
    };
    const titleQs = ["CFP championship odds", "CFP national championship odds", "college football playoff title game odds", "CFP final public betting", "CFP title odds", "CFP natty odds"];
    // No title game in the window: nothing, never the first round, quarterfinals or semifinals
    for (const prefix of ["CFP first round weekend", "Bowl week", "QC r9 bowl week", "QC r9 CFP quarterfinals and semifinals"]) {
      none(slate(prefix), [...titleQs, "Georgia CFP championship odds"]);
    }
    // With it: the title game alone
    for (const q of titleQs) expect(heads(slate("QC r9 championship week"), q), q).toEqual(["Ohio State Buckeyes @ Georgia Bulldogs"]);
    // Last season's title game at Hard Rock, a New Year's Six stadium: the title game by date, not the Orange Bowl
    const hardRock = slate("Title game at Hard Rock");
    expect(heads(hardRock, "national championship odds")).toEqual(["Indiana Hoosiers @ Miami Hurricanes"]);
    expect(heads(hardRock, "CFP championship odds")).toEqual(["Indiana Hoosiers @ Miami Hurricanes"]);
    none(hardRock, ["Orange Bowl odds", "CFP semifinal odds", "CFP quarterfinal odds", "Super Bowl odds"]);
    // A title game before Jan 14, a week after the semifinals: the window's gap settles it
    expect(heads(slate("Early title game"), "national championship odds")).toEqual(["Oregon Ducks @ Ohio State Buckeyes"]);
    // A bare "playoff" question: both leagues' playoffs in the window ask which; one league's are its games
    const hint = "Ambiguous 'playoffs': ask whether they mean the NFL playoffs or the College Football Playoff. Ignore this line if the question is not about betting on an upcoming game.";
    for (const prefix of ["Title game at Hard Rock", "NFL conference championships", "QC r9 championship week"]) {
      for (const q of ["playoff odds", "playoff public betting", "who is the public on in the playoffs"]) {
        expect(slate(prefix).phrasings.find((p) => p.q === q), `${prefix}: ${q}`).toEqual({ q, chat: [hint], app: null });
      }
    }
    expect(heads(slate("QC r9 Super Bowl week"), "playoff odds")).toEqual(["Detroit Lions @ Kansas City Chiefs"]);
    expect(heads(slate("QC r9 bowl week"), "playoff odds")).toHaveLength(4);
    expect(heads(hardRock, "NFL playoff odds")).toEqual(["Buffalo Bills @ Denver Broncos", "Houston Texans @ New England Patriots"]);
  });

  it("tells the CFP's rounds apart, and never reads the Pro Bowl as the Super Bowl (QC round 9)", () => {
    const heads = (s: Slate, q: string) => s.phrasings.find((p) => p.q === q)!.chat.map((h) => h.replace(/ \((NCAAF|NFL), .*\)$/, ""));
    const none = (s: Slate, qs: string[]) => {
      for (const q of qs) expect(s.phrasings.find((p) => p.q === q), `${s.name}: ${q}`).toEqual({ q, chat: [], app: null });
    };
    // First-round weekend: only the two campus games between ranked teams, not the early bowls
    const firstRound = slate("CFP first round weekend");
    const r1 = ["Indiana Hoosiers @ Penn State Nittany Lions", "SMU Mustangs @ Texas Longhorns"];
    expect(heads(firstRound, "first round CFP odds")).toEqual(r1);
    expect(heads(firstRound, "CFP odds")).toEqual(r1);
    expect(heads(firstRound, "Penn State playoff odds")).toEqual([r1[0]]);
    expect(heads(firstRound, "Utah bowl game spread")).toEqual(["USC Trojans @ Utah Utes"]);
    none(firstRound, ["Utah playoff odds", "Tulane playoff odds", "CFP quarterfinal odds", "CFP semifinal odds"]);
    // Dec 29: quarterfinals only; no semifinals or first round yet
    const bowlWeek = slate("QC r9 bowl week");
    expect(heads(bowlWeek, "CFP quarterfinal odds")).toHaveLength(4);
    none(bowlWeek, ["CFP semifinal odds", "first round CFP odds", "public betting Georgia CFP semifinal", "Kentucky playoff odds", "Citrus Bowl odds"]);
    expect(heads(bowlWeek, "Georgia Rose Bowl odds")).toEqual(["Indiana Hoosiers @ Georgia Bulldogs"]);
    // Jan 1: quarterfinals today, semifinals next week
    const jan1 = slate("QC r9 CFP quarterfinals and semifinals");
    expect(heads(jan1, "CFP semifinal odds")).toEqual(["Ohio State Buckeyes @ Texas Longhorns", "Oregon Ducks @ Miami Hurricanes"]);
    expect(heads(jan1, "CFP quarterfinal odds")).toEqual(["Indiana Hoosiers @ Georgia Bulldogs", "Ole Miss Rebels @ Notre Dame Fighting Irish"]);
    expect(heads(jan1, "Ohio State semifinal odds")).toEqual(["Ohio State Buckeyes @ Texas Longhorns"]);
    none(jan1, ["Georgia CFP semifinal odds", "public betting Georgia CFP semifinal", "first round CFP odds", "national championship odds"]);
    // Georgia plays in the title game on QC's Jan 21 slate
    expect(heads(slate("QC r9 championship week"), "Georgia national championship odds")).toEqual(["Ohio State Buckeyes @ Georgia Bulldogs"]);
    // Feb 3 with only the Pro Bowl: no Super Bowl; with the Super Bowl too, only it
    none(slate("QC r9 Pro Bowl only"), ["Super Bowl odds", "Super Bowl public betting", "who wins the Super Bowl", "Pro Bowl odds"]);
    expect(heads(slate("QC r9 Pro Bowl and Super Bowl"), "Super Bowl odds")).toEqual(["Detroit Lions @ Kansas City Chiefs"]);
  });

  it("reads the event from the games tables' columns", () => {
    const game = (date: string, away: string, home: string, extra: Record<string, unknown> = {}) => ({ date, visitor_team_name: away, home_team_name: home, ...extra });
    // NFL: BallDontLie's postseason flag and week
    expect(nflEvent(game("2027-01-10T18:00:00Z", "Buffalo Bills", "Houston Texans", { postseason: true, week: 1 }))?.name).toBe("Wild Card");
    expect(nflEvent(game("2027-01-17T18:00:00Z", "Buffalo Bills", "Kansas City Chiefs", { postseason: true, week: 2 }))?.name).toBe("Divisional Round");
    expect(nflEvent(game("2027-01-24T23:30:00Z", "Detroit Lions", "Philadelphia Eagles", { postseason: true, week: 3 }))?.name).toBe("NFC Championship");
    expect(nflEvent(game("2027-02-14T23:30:00Z", "Kansas City Chiefs", "Philadelphia Eagles", { postseason: true, week: 5 }))?.kind).toBe("super-bowl");
    expect(nflEvent(game("2026-12-06T18:00:00Z", "Kansas City Chiefs", "Buffalo Bills", { postseason: false, week: 14 }))).toBeNull();
    // The Pro Bowl (week 4, "AFC @ NFC") is no event, even in February (QC round 9)
    expect(nflEvent(game("2027-02-07T20:00:00Z", "AFC", "NFC", { postseason: true, week: 4 }))).toBeNull();
    expect(nflEvent(game("2027-02-07T20:00:00Z", "AFC", "NFC", { postseason: true, week: null }))).toBeNull();
    // College: championship weekend (the first Saturday of December and the Friday before), same conference
    expect(collegeEvent(game("2026-12-05T21:00:00Z", "Alabama Crimson Tide", "Georgia Bulldogs"))?.name).toBe("SEC Championship");
    expect(collegeEvent(game("2026-12-05T00:00:00Z", "Toledo Rockets", "Miami (OH) RedHawks"))?.name).toBe("MAC Championship");
    expect(collegeEvent(game("2026-11-28T17:00:00Z", "Michigan Wolverines", "Ohio State Buckeyes"))).toBeNull();
    // Army-Navy, a week later, is the regular season; a bowl after championship weekend is not
    expect(collegeEvent(game("2026-12-12T20:00:00Z", "Army Black Knights", "Navy Midshipmen"))).toBeNull();
    expect(collegeEvent(game("2026-12-29T19:15:00Z", "Syracuse Orange", "Nebraska Cornhuskers", { venue: "Yankee Stadium" }))).toMatchObject({ kind: "bowl", name: null, playoff: false });
    // CFP rounds by date (QC round 9): the first round on campus through Dec 21 between two ranked teams (an early
    // bowl has at most one), quarterfinals at the New Year's Six Dec 30 to Jan 2, semifinals there after Jan 3, and
    // the title game, the last one, away from them
    const ranked = { home_team_rank: 5, visitor_team_rank: 12 };
    expect(collegeEvent(game("2026-12-19T20:00:00Z", "Miami Hurricanes", "Texas A&M Aggies", { venue: "Kyle Field", ...ranked }))).toMatchObject({ kind: "cfp", round: "first round", playoff: true });
    expect(collegeEvent(game("2026-12-19T20:00:00Z", "Miami Hurricanes", "Texas A&M Aggies", { venue: "Kyle Field", home_team_rank: 5 }))).toMatchObject({ kind: "bowl", playoff: false });
    expect(collegeEvent(game("2026-12-19T20:00:00Z", "Tulane Green Wave", "Memphis Tigers", { venue: "Caesars Superdome" }))).toMatchObject({ kind: "bowl", name: null, round: null });
    expect(collegeEvent(game("2027-01-01T22:00:00Z", "Georgia Bulldogs", "Oregon Ducks", { venue: "Rose Bowl" }))).toMatchObject({ name: "Rose Bowl", playoff: true, round: "quarterfinal" });
    expect(collegeEvent(game("2027-01-01T00:30:00Z", "Oregon Ducks", "Texas Longhorns", { venue: "Hard Rock Stadium" }))?.round).toBe("quarterfinal");
    expect(collegeEvent(game("2027-01-09T00:30:00Z", "Ohio State Buckeyes", "Texas Longhorns", { venue: "State Farm Stadium" }))).toMatchObject({ name: "Fiesta Bowl", round: "semifinal" });
    expect(collegeEvent(game("2026-11-28T05:00:00Z", "USC Trojans", "UCLA Bruins", { venue: "Rose Bowl" }))).toBeNull();
    expect(collegeEvent(game("2027-01-26T00:30:00Z", "Oregon Ducks", "Ohio State Buckeyes", { venue: "Allegiant Stadium" }))).toMatchObject({ kind: "national-championship", round: "final" });
    // The title game by date from Jan 14, even at a New Year's Six stadium (Hard Rock, January 2026)
    expect(collegeEvent(game("2026-01-20T00:30:00Z", "Indiana Hoosiers", "Miami Hurricanes", { venue: "Hard Rock Stadium" }))).toMatchObject({ kind: "national-championship", name: "National Championship" });
  });

  it("reads which events a question names", () => {
    const ask = (q: string) => eventsAsked(q.toLowerCase().split(" "));
    expect(ask("super bowl odds")?.superBowl).toBe(true);
    expect(ask("rose bowl spread")?.bowls).toEqual(["Rose Bowl"]);
    expect(ask("pinstripe bowl odds")?.otherBowl).toBe(true);
    expect(ask("bowl game odds")?.bowl).toBe(true);
    expect(ask("sec championship game odds")?.championships).toEqual(["SEC"]);
    expect(ask("afc championship odds")?.championships).toEqual(["AFC"]);
    expect(ask("championship game odds")).toMatchObject({ championships: [], national: true });
    expect(ask("national title game odds")?.national).toBe(true);
    expect(ask("cfp semifinal odds")).toMatchObject({ playoff: "college", cfpRounds: ["semifinal"] });
    expect(ask("first round cfp odds")?.cfpRounds).toEqual(["first round"]);
    expect(ask("cfp quarterfinal odds")?.cfpRounds).toEqual(["quarterfinal"]);
    expect(ask("playoff odds")).toMatchObject({ playoff: "any", cfpRounds: [] });
    // The title game by any of its names asks for it alone, not every CFP game (QC round 10)
    for (const q of ["cfp championship odds", "cfp national championship odds", "college football playoff title game odds", "cfp final public betting", "cfp title odds", "cfp natty odds"]) {
      expect(ask(q), q).toMatchObject({ national: true, playoff: null, championships: null });
    }
    expect(ask("wild card odds")?.rounds).toEqual(["Wild Card"]);
    expect(ask("sec title odds")).toBeNull();
    expect(ask("georgia odds")).toBeNull();
    // An event word with a betting or prediction word is an event; futures words stay futures
    const now = new Date("2026-09-24T12:12:00Z");
    for (const q of ["Super Bowl odds", "Rose Bowl spread", "Texas playoff odds", "SEC championship odds", "who wins the SEC championship", "national championship odds"]) {
      expect(gameIntent(q, null, now), q).toBe("event");
    }
    for (const q of ["Super Bowl MVP odds", "Georgia to make the playoff", "SEC title odds", "Georgia SEC", "Alabama bowl record", "Rose Bowl"]) {
      expect(gameIntent(q, null, now), q).toBe("no");
    }
  });
});
