import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// The NCAAF slate card for a game whose kickoff ESPN has not set. The row
// carries time_tbd and the midnight-ET placeholder; the card must show the
// Eastern calendar day and "TBD", never the placeholder as a clock time
// (a Pacific viewer used to see "Fri Oct 2, 9:00 PM" for a Saturday game).

const rows = [
  {
    id: "g-tbd",
    date: "2026-10-03T04:00:00+00:00",
    time_tbd: true,
    home_team_name: "Georgia Bulldogs",
    visitor_team_name: "Vanderbilt Commodores",
    home_team_id: "61",
    visitor_team_id: "238",
    home_team_rank: 2,
    visitor_team_rank: null,
    status: "STATUS_SCHEDULED",
    venue: "Sanford Stadium",
    is_featured: true,
    season: 2026,
    updated_at: "2026-09-27T11:00:00+00:00",
  },
  {
    id: "g-timed",
    date: "2026-10-03T23:30:00+00:00",
    time_tbd: false,
    home_team_name: "LSU Tigers",
    visitor_team_name: "Texas A&M Aggies",
    home_team_id: "99",
    visitor_team_id: "245",
    home_team_rank: 10,
    visitor_team_rank: 23,
    status: "STATUS_SCHEDULED",
    venue: "Tiger Stadium",
    is_featured: true,
    season: 2026,
    updated_at: "2026-09-27T11:00:00+00:00",
  },
];

// Any chain of query methods (select, eq, in, order, ...) resolves to the
// table's rows, so new filters added to the slate don't break this test.
function query(table: string): unknown {
  const result = { data: table === "ncaaf_games" ? rows : [], error: null };
  const q: unknown = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "then" ? (resolve: (v: unknown) => void) => resolve(result) : () => q,
    },
  );
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => query(t) } }));
vi.mock("@/hooks/useLiveScores", () => ({ useLiveScores: () => ({ getGame: () => undefined, anyLive: false }) }));
vi.mock("@/hooks/useApPoll", () => ({ useApPoll: () => ({ poll: null, loading: false }) }));
vi.mock("@/components/ui/FollowButton", () => ({ FollowButton: () => null }));
vi.mock("@/components/PublicBettingPreview", () => ({ PublicBettingPreview: () => null }));
vi.mock("@/components/games/GameInsightsSheet", () => ({ GameInsightsSheet: () => null }));
vi.mock("@/components/players/PropFuturesBoard", () => ({ PropFuturesBoard: () => null }));

import { NCAAFSlate } from "@/components/dashboard/NCAAFSlate";

describe("NCAAFSlate: TBD kickoff", () => {
  beforeAll(() => {
    // Sunday of the week before, so Oct 3 is neither today nor tomorrow
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("shows the Eastern game day and TBD, with no placeholder clock time", async () => {
    render(<NCAAFSlate />);
    const card = await screen.findByRole("button", { name: /Vanderbilt at Georgia/ });
    expect(card.textContent).toContain("Sat Oct 3 · TBD");
    expect(card.textContent).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    expect(card.textContent).not.toContain("Fri Oct 2");
  });

  it("still prints a real kickoff time for a scheduled game", async () => {
    render(<NCAAFSlate />);
    const card = await screen.findByRole("button", { name: /Texas A&M at LSU/ });
    await waitFor(() => expect(card.textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/));
    expect(card.textContent).not.toContain("TBD");
  });
});
