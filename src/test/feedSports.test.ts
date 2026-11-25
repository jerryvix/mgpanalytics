import { describe, expect, it } from "vitest";
import { feedSports, requestedSports, sportList } from "../../supabase/functions/_shared/feed-sports";

// D-116: college basketball is built but stays out of the app feed until ENABLE_NCAAB is "true"
describe("feed sports", () => {
  it("serves NFL, college football and the NBA by default", () => {
    expect(feedSports(undefined)).toEqual(["NFL", "NCAAF", "NBA"]);
    expect(feedSports("")).toEqual(["NFL", "NCAAF", "NBA"]);
    expect(feedSports("false")).toEqual(["NFL", "NCAAF", "NBA"]);
    expect(feedSports("TRUE")).toEqual(["NFL", "NCAAF", "NBA"]);
    expect(feedSports("1")).toEqual(["NFL", "NCAAF", "NBA"]);
  });

  it("adds college basketball last when the flag is exactly true", () => {
    expect(feedSports("true")).toEqual(["NFL", "NCAAF", "NBA", "NCAAB"]);
  });

  it("narrows ?sports= to the sports that are on", () => {
    const off = feedSports(undefined);
    expect(requestedSports(null, off)).toEqual(off);
    expect(requestedSports("NBA", off)).toEqual(["NBA"]);
    expect(requestedSports("NCAAB", off)).toEqual(off); // off: asking for it gets the usual sports
    expect(requestedSports("NCAAB", feedSports("true"))).toEqual(["NCAAB"]);
    expect(requestedSports("NFL,MLB", off)).toEqual(["NFL"]);
  });

  it("labels each sport in Title Case for the app", () => {
    expect(sportList(feedSports("true"))).toEqual([
      { key: "NFL", label: "NFL" },
      { key: "NCAAF", label: "College Football" },
      { key: "NBA", label: "NBA" },
      { key: "NCAAB", label: "College Basketball" },
    ]);
  });
});
