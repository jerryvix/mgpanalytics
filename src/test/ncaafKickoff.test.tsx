import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { slimEvent, toGameRow, type EspnEvent, type PollSet } from "../../supabase/functions/sync-ncaaf-games/ranks";
import { tbdGameDay, tbdGameDayKey, tbdKickoffLabel } from "@/lib/kickoff";

// QC, Sep 24 2026: ESPN's Week 5 scoreboard marks four games timeValid=false
// ("10/3 - TBD": Vanderbilt @ Georgia, Notre Dame @ North Carolina, Miami @
// Clemson, Alabama @ Mississippi State) with a placeholder of
// 2026-10-03T04:00Z, midnight Eastern. Stored with no flag, the NCAAF slate
// printed that placeholder as "Fri Oct 2, 9:00 PM" for a Pacific viewer.

const upsert = vi.fn();
const invoke = vi.fn();
const toast = vi.fn();

// Chainable stand-in for the counts queries NCAAFSyncCard runs on mount: any
// chain of filters resolves empty, and upsert() is recorded.
function query(): unknown {
  const q: unknown = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ count: 0, data: null, error: null });
        if (prop === "upsert") {
          return (...args: unknown[]) => {
            upsert(...args);
            return Promise.resolve({ error: null });
          };
        }
        return () => q;
      },
    },
  );
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => query(),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

import { NCAAFSyncCard } from "@/components/dashboard/admin/NCAAFSyncCard";

const noPolls: PollSet = { latest: null, byWeek: new Map() };
const NOW = "2026-09-24T12:00:00.000Z";

// The shape both site.api and the cdn.espn.com mirror return for a TBD game
function tbdEvent(overrides: Partial<{ timeValid: boolean | undefined; state: string; completed: boolean; score: string }> = {}): EspnEvent {
  const { state = "pre", completed = false, score = "0" } = overrides;
  // An explicit undefined means "field absent", so no destructuring default here
  const timeValid = "timeValid" in overrides ? overrides.timeValid : false;
  const side = (id: string, name: string, homeAway: string) => ({
    id,
    homeAway,
    score,
    curatedRank: { current: 99 },
    team: { id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() },
    statistics: [],
    records: [],
  });
  const comp: Record<string, unknown> = {
    id: "401856716",
    date: "2026-10-03T04:00Z",
    dateValid: true,
    startDate: "2026-10-03T04:00Z",
    venue: { fullName: "Sanford Stadium" },
    competitors: [side("61", "Georgia Bulldogs", "home"), side("238", "Vanderbilt Commodores", "away")],
  };
  if (timeValid !== undefined) comp.timeValid = timeValid;
  return {
    id: "401856716",
    date: "2026-10-03T04:00Z",
    season: { year: 2026, type: 2 },
    week: { number: 5 },
    status: { type: { name: completed ? "STATUS_FINAL" : "STATUS_SCHEDULED", state, completed } },
    competitions: [comp as never],
  };
}

describe("sync-ncaaf-games: TBD kickoffs", () => {
  it("carries ESPN's timeValid=false through slimEvent into time_tbd", () => {
    const row = toGameRow(slimEvent(tbdEvent()), noPolls, NOW);
    expect(row.time_tbd).toBe(true);
    expect(row.date).toBe("2026-10-03T04:00Z"); // placeholder kept, now flagged
  });

  it("leaves real kickoffs (timeValid true) and payloads without the field unflagged", () => {
    expect(toGameRow(slimEvent(tbdEvent({ timeValid: true })), noPolls, NOW).time_tbd).toBe(false);
    expect(toGameRow(slimEvent(tbdEvent({ timeValid: undefined })), noPolls, NOW).time_tbd).toBe(false);
  });
});

describe("sync-ncaaf-games: scores", () => {
  it("stores null, not ESPN's 0-0, for a game not yet played", () => {
    const row = toGameRow(slimEvent(tbdEvent()), noPolls, NOW);
    expect([row.away_score, row.home_score]).toEqual([null, null]);
    expect(row.is_final).toBe(false);
  });

  it("keeps real scores once a game is live or final", () => {
    const live = toGameRow(slimEvent(tbdEvent({ timeValid: true, state: "in", score: "14" })), noPolls, NOW);
    expect([live.away_score, live.home_score]).toEqual([14, 14]);
    const final = toGameRow(slimEvent(tbdEvent({ timeValid: true, state: "post", completed: true, score: "0" })), noPolls, NOW);
    expect([final.away_score, final.home_score]).toEqual([0, 0]); // a real shutout score survives
  });

  it("stores null for a postponed or canceled game", () => {
    const off = toGameRow(slimEvent(tbdEvent({ timeValid: true, state: "post", completed: false })), noPolls, NOW);
    expect([off.away_score, off.home_score]).toEqual([null, null]);
  });
});

describe("kickoff labels", () => {
  const edt = "2026-10-03T04:00Z"; // placeholder during daylight time
  const est = "2026-11-07T05:00Z"; // placeholder during standard time

  it("uses the Eastern calendar day, where a Pacific reading lands a day early", () => {
    const pacific = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(edt));
    expect(pacific).toBe("Fri, Oct 2, 9:00 PM"); // what the slate used to show
    expect(tbdKickoffLabel(edt, new Date(NOW))).toBe("Sat Oct 3 · TBD");
    expect(tbdGameDay(edt)).toBe("Sat Oct 3");
    expect(tbdGameDayKey(edt)).toBe("2026-10-03");
  });

  it("handles the standard-time placeholder (05:00Z) the same way", () => {
    expect(tbdKickoffLabel(est, new Date(NOW))).toBe("Sat Nov 7 · TBD");
    expect(tbdGameDayKey(est)).toBe("2026-11-07");
  });

  it("says Today or Tomorrow by the Eastern date", () => {
    expect(tbdKickoffLabel(edt, new Date("2026-10-02T15:00:00Z"))).toBe("Tomorrow · TBD");
    expect(tbdKickoffLabel(edt, new Date("2026-10-03T15:00:00Z"))).toBe("Today · TBD");
    // 11 PM Friday in Los Angeles is already Saturday in the East
    expect(tbdKickoffLabel(edt, new Date("2026-10-03T06:00:00Z"))).toBe("Today · TBD");
  });

  it("never prints a clock time", () => {
    for (const iso of [edt, est]) expect(tbdKickoffLabel(iso)).not.toMatch(/\d:\d\d|AM|PM/);
  });
});

describe("NCAAFSyncCard: honest sync results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const clickSync = () => fireEvent.click(screen.getByRole("button", { name: /Sync NCAAF Games/i }));

  it("labels the job as what it does now", () => {
    render(<NCAAFSyncCard />);
    expect(screen.getByRole("button", { name: /Sync NCAAF Games \(All FBS, -7\/\+60 Days\)/ })).toBeInTheDocument();
    expect(screen.getByText(/last 45 days/)).toBeInTheDocument();
    expect(screen.queryByText(/Top 25, 7 Days/)).toBeNull();
  });

  it("records and toasts a failure when the function errors", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }), {
          status: 500,
        }),
      },
    });
    render(<NCAAFSyncCard />);
    clickSync();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "NCAAF Sync Failed",
        variant: "destructive",
        description: "An unexpected error occurred. Please try again later.",
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ last_sync_status: "failed", error_message: "An unexpected error occurred. Please try again later." }),
      { onConflict: "sport,data_type" },
    );
  });

  it("treats a 200 carrying success:false as a failure", async () => {
    invoke.mockResolvedValue({ data: { success: false, error: "All 10 ESPN NCAAF week scoreboards failed" }, error: null });
    render(<NCAAFSyncCard />);
    clickSync();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "NCAAF Sync Failed", variant: "destructive" }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ last_sync_status: "failed" }), expect.anything());
  });

  it("reports a real success with the function's own message", async () => {
    invoke.mockResolvedValue({
      data: { success: true, gamesCount: 637, message: "Synced 637 NCAAF games (182 Top 25)" },
      error: null,
    });
    render(<NCAAFSyncCard />);
    clickSync();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "NCAAF Games Synced", description: "Synced 637 NCAAF games (182 Top 25)" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ last_sync_status: "success", records_synced: 637, error_message: null }),
      expect.anything(),
    );
  });
});
