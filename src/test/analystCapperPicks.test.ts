import { describe, expect, it } from "vitest";

import { askedShows, formatCapperPicks, type TakeRow } from "../../supabase/functions/_shared/capper-picks-chat";

// D-129: the Analyst answers "what are Bear Bets' picks" with the picks the app already shows.
describe("Capper Picks for the Analyst", () => {
  it("finds the show, or its host, in the question", () => {
    expect(askedShows("What are bear bets picks for nfl?")).toEqual({ shows: ["bear-bets"], people: [], any: false });
    expect(askedShows("what is @bearbets picking this week")).toEqual({ shows: ["bear-bets"], people: [], any: false });
    expect(askedShows("What does Geoff Schwartz like on Sunday?")).toEqual({ shows: ["bear-bets"], people: ["Geoff Schwartz"], any: false });
    expect(askedShows("SportsLine college football picks")).toEqual({ shows: ["early-edge"], people: [], any: false });
    expect(askedShows("What did Hold the Phone say about the Bills?").shows).toEqual(["hold-the-phone"]);
  });

  it("only treats a general picks question as one, and ignores questions about other things", () => {
    expect(askedShows("Any capper picks on Falcons Vikings?")).toEqual({ shows: [], people: [], any: true });
    expect(askedShows("How are the Bears ATS this season?")).toEqual({ shows: [], people: [], any: false });
  });

  it("credits each pick to its show and host, with the game and the episode", () => {
    const rows: TakeRow[] = [{
      show: "bear-bets", show_name: "Bear Bets", person: "Sammy Panayotovich", sport: "NFL", matchup: "Falcons at Vikings",
      starts_at: "2026-11-29T18:00:00Z", market: "spread", pick: "Falcons +7", price: null, units: null,
      episode_title: "NFL Best Bets & Underdog Picks Heading Into Week 12", episode_published_at: "2026-11-27T15:00:00Z",
    }];
    const block = formatCapperPicks(rows, ["bear-bets"]);
    expect(block).toContain("not MGP's");
    expect(block).toContain("• Bear Bets, Sammy Panayotovich: Falcons +7 · Falcons at Vikings (NFL), Sun, Nov 29 1:00 PM ET");
    expect(block).toContain('from "NFL Best Bets & Underdog Picks Heading Into Week 12"');
    expect(formatCapperPicks([], ["bear-bets"])).toContain("No upcoming picks stored from Bear Bets");
  });
});
