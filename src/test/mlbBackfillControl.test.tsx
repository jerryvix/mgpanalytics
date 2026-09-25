import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// QC, Sep 25 2026: March-July 2026 was never finalized (1,273 of 1,355 rows
// still "scheduled" with 0-0 scores): the sync's self-heal looks back 45 days.
// sync-mlb-games already re-pulls an explicit { startDate, endDate } range, up
// to 60 days a run; the admin's MLB card now has a control to run it.

const invoke = vi.fn();

// Chainable stand-in for the counts queries the card runs on mount
function query(): unknown {
  const q: unknown = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ count: 0, data: null, error: null });
        if (prop === "upsert") return () => Promise.resolve({ error: null });
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
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { MLBSyncCard } from "@/components/dashboard/admin/MLBSyncCard";

const start = () => screen.getByLabelText("Backfill start date") as HTMLInputElement;
const end = () => screen.getByLabelText("Backfill end date") as HTMLInputElement;
const button = () => screen.getByRole("button", { name: /Backfill Dates|Backfilling/ });
const pick = (from: string, to: string) => {
  fireEvent.change(start(), { target: { value: from } });
  fireEvent.change(end(), { target: { value: to } });
};

beforeEach(() => {
  invoke.mockReset();
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

  it("blocks ranges over 60 days and allows exactly 60", () => {
    render(<MLBSyncCard />);
    pick("2026-03-01", "2026-04-30");
    expect(button()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("That is 61 days; backfill at most 60 per run.");
    pick("2026-03-01", "2026-04-29");
    expect(button()).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("invokes sync-mlb-games with the range and shows the result", async () => {
    invoke.mockResolvedValue({
      data: { success: true, message: "Backfilled 2026-03-01..2026-04-29: 784 games written, 775 final" },
      error: null,
    });
    render(<MLBSyncCard />);
    pick("2026-03-01", "2026-04-29");
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Backfilled 2026-03-01..2026-04-29: 784 games written, 775 final"));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("sync-mlb-games", { body: { startDate: "2026-03-01", endDate: "2026-04-29" } });
  });

  it("is disabled while running", async () => {
    let finish: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<MLBSyncCard />);
    pick("2026-06-29", "2026-07-21");
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
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ success: false, error: "Forbidden - admin access required" }) },
      },
    });
    render(<MLBSyncCard />);
    pick("2026-03-01", "2026-03-31");
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Backfill failed: Forbidden - admin access required"));
  });

  it("gives the dates and the button 44px targets", () => {
    render(<MLBSyncCard />);
    for (const el of [start(), end(), button()]) expect(el.className).toMatch(/\bh-11\b/);
  });
});
