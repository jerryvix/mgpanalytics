import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// QC, Sep 25 2026: March-July 2026 was never finalized (1,273 of 1,355 rows
// still "scheduled" with 0-0 scores): the sync's self-heal looks back 45 days.
// sync-mlb-games re-pulls an explicit { startDate, endDate } range, up to 21
// days a run (its 2s CPU budget); the admin's MLB card has a control to run it.

const invoke = vi.fn();
const upsert = vi.fn();
const toast = vi.fn();

// Chainable stand-in for the counts queries the card runs on mount; upsert() is recorded
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

import { MLBSyncCard } from "@/components/dashboard/admin/MLBSyncCard";

const start = () => screen.getByLabelText("Backfill start date") as HTMLInputElement;
const end = () => screen.getByLabelText("Backfill end date") as HTMLInputElement;
const button = () => screen.getByRole("button", { name: /Backfill Dates|Backfilling/ });
const pick = (from: string, to: string) => {
  fireEvent.change(start(), { target: { value: from } });
  fireEvent.change(end(), { target: { value: to } });
};
// A non-2xx response: supabase-js puts the Response on error.context
const httpError = (body: unknown) => ({
  message: "Edge Function returned a non-2xx status code",
  context: { json: async () => body },
});

beforeEach(() => {
  invoke.mockReset();
  upsert.mockReset();
  toast.mockReset();
});

describe("MLB backfill dates control", () => {
  it("needs both dates", () => {
    render(<MLBSyncCard />);
    expect(button()).toBeDisabled();
    fireEvent.change(start(), { target: { value: "2026-03-01" } });
    expect(button()).toBeDisabled();
  });

  it("blocks an end date before the start date", () => {
    render(<MLBSyncCard />);
    pick("2026-04-29", "2026-03-01");
    expect(button()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("The end date is before the start date.");
    fireEvent.click(button());
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks ranges over 21 days (the function's CPU budget) and allows exactly 21", () => {
    render(<MLBSyncCard />);
    pick("2026-03-01", "2026-03-22");
    expect(button()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("That is 22 days; backfill at most 21 per run.");
    pick("2026-03-01", "2026-04-29");
    expect(screen.getByRole("alert")).toHaveTextContent("That is 60 days; backfill at most 21 per run.");
    pick("2026-03-01", "2026-03-21");
    expect(button()).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Re-pulls finals and scores for up to 21 days a run.")).toBeInTheDocument();
  });

  it("invokes sync-mlb-games with the range and shows the result", async () => {
    invoke.mockResolvedValue({
      data: { success: true, message: "Backfilled 2026-03-01..2026-03-21: 288 games written, 285 final" },
      error: null,
    });
    render(<MLBSyncCard />);
    pick("2026-03-01", "2026-03-21");
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Backfilled 2026-03-01..2026-03-21: 288 games written, 285 final"));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("sync-mlb-games", { body: { startDate: "2026-03-01", endDate: "2026-03-21" } });
  });

  it("is disabled while running", async () => {
    let finish: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<MLBSyncCard />);
    pick("2026-07-01", "2026-07-21");
    fireEvent.click(button());
    await waitFor(() => expect(button()).toHaveTextContent("Backfilling..."));
    expect(button()).toBeDisabled();
    expect(start()).toBeDisabled();
    expect(end()).toBeDisabled();
    fireEvent.click(button());
    expect(invoke).toHaveBeenCalledTimes(1);
    finish({ data: { success: true, message: "done" }, error: null });
    await waitFor(() => expect(button()).toBeEnabled());
  });

  it("shows a friendly error with the function's own message", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ success: false, error: "Forbidden - admin access required" }) });
    render(<MLBSyncCard />);
    pick("2026-03-01", "2026-03-21");
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Backfill failed: Forbidden - admin access required"));
  });

  it("gives the dates and the button 44px targets", () => {
    render(<MLBSyncCard />);
    for (const el of [start(), end(), button()]) expect(el.className).toMatch(/\bh-11\b/);
  });
});

// QC round 4: the card's "Sync MLB Games" button recorded success, and
// toasted "Synced", even when the call failed.
describe("MLB sync button", () => {
  const sync = () => fireEvent.click(screen.getByRole("button", { name: /Sync MLB Games/ }));

  it("reports a failed call as a failure, with the function's message", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ success: false, error: "An unexpected error occurred. Please try again later." }) });
    render(<MLBSyncCard />);
    sync();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({
      title: "MLB Sync Failed",
      description: "An unexpected error occurred. Please try again later.",
      variant: "destructive",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sport: "MLB", data_type: "games", last_sync_status: "failed", records_synced: 0 }),
      { onConflict: "sport,data_type" },
    );
  });

  it("reports a { success: false } body as a failure", async () => {
    invoke.mockResolvedValue({ data: { success: false, error: "Unauthorized - invalid token" }, error: null });
    render(<MLBSyncCard />);
    sync();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "MLB Sync Failed", description: "Unauthorized - invalid token", variant: "destructive" }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ last_sync_status: "failed", error_message: "Unauthorized - invalid token" }), expect.anything());
  });

  it("still reports a real sync as a success", async () => {
    invoke.mockResolvedValue({ data: { success: true, gamesCount: 89, message: "Synced 89 MLB games across 7 days (0 backfilled)" }, error: null });
    render(<MLBSyncCard />);
    sync();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: "MLB Games Synced", description: "Synced 89 MLB games across 7 days (0 backfilled)" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ last_sync_status: "success", records_synced: 89, error_message: null }), expect.anything());
  });
});
