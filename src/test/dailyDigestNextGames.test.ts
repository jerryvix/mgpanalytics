import { describe, it, expect } from "vitest";
import { nextGamesFor } from "../../supabase/functions/daily-digest/next-games";

// QC round 2 (Sep 25 2026): the Daily Edge email's "Your teams' next games"
// read every row, so a Yankees follower would have been sent the "if
// necessary" ALWC Game 3 (espn_mlb_401907964, Oct 1) that ESPN cancels once a
// series ends 2-0. The app's Your Teams card already skipped called-off games.

const game = (date: string, status: string, away: string, home = "New York Yankees") => ({
  home_team_name: home,
  visitor_team_name: away,
  date,
  status,
});

describe("daily digest: each followed team's next game", () => {
  it("skips a canceled or postponed game and lists the next real one", () => {
    const rows = [
      game("2026-10-01T04:00:00+00:00", "STATUS_CANCELED", "Detroit Tigers"), // ALWC Game 3, not needed
      game("2026-10-02T04:00:00+00:00", "STATUS_POSTPONED", "Seattle Mariners", "Houston Astros"),
      game("2026-10-03T21:08:00+00:00", "STATUS_SCHEDULED", "Tampa Bay Rays"), // ALDS Game 1
    ];
    expect(nextGamesFor(rows, ["New York Yankees"])).toEqual([
      { team: "New York Yankees", opponent: "Tampa Bay Rays", isHome: true, date: "2026-10-03T21:08:00+00:00" },
    ]);
  });

  it("lists nothing for a team whose only upcoming game was called off", () => {
    expect(nextGamesFor([game("2026-10-01T04:00:00+00:00", "STATUS_CANCELED", "Detroit Tigers")], ["New York Yankees"])).toEqual([]);
  });

  it("keeps the first game per team, home or away, as before", () => {
    const rows = [
      game("2026-09-25T20:05:00+00:00", "STATUS_SCHEDULED", "Baltimore Orioles"),
      game("2026-09-25T23:05:00+00:00", "STATUS_SCHEDULED", "Baltimore Orioles"),
    ];
    expect(nextGamesFor(rows, ["New York Yankees", "Baltimore Orioles"])).toEqual([
      { team: "New York Yankees", opponent: "Baltimore Orioles", isHome: true, date: "2026-09-25T20:05:00+00:00" },
      { team: "Baltimore Orioles", opponent: "New York Yankees", isHome: false, date: "2026-09-25T20:05:00+00:00" },
    ]);
  });
});
