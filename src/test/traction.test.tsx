import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { TractionView } from "@/components/dashboard/admin/TractionCard";
import { compactNumber, easternDateTime, niceMax, parseTraction, shortDay, type Traction } from "@/lib/traction";

const day = (d: string, over: Partial<Traction["daily"][number]> = {}) => ({
  day: d, signups_app: 0, signups_web: 0, new_guests: 0, active_app: 0, active_web: 0, active_total: 0, questions: 0, ...over,
});

const sample: Traction = {
  generated_at: "2026-11-24T20:15:00Z",
  today: "2026-11-24",
  days: 3,
  accounts: 21,
  guests: 12_345,
  converted_guests: 2,
  active: { today: 5, last_7: 9, last_30: 14 },
  questions_today: 7,
  feedback: { up: 4, down: 1, up_7d: 3, down_7d: 0 },
  chats: { total: 76, in_window: 3 },
  daily: [
    day("2026-11-22", { signups_web: 1 }),
    day("2026-11-23", { signups_app: 2, new_guests: 4, active_app: 3, active_total: 3 }),
    day("2026-11-24", { signups_app: 1, signups_web: 1, active_app: 4, active_web: 2, active_total: 5, questions: 7 }),
  ],
  newest_accounts: [
    { email: "new@test.com", created_at: "2026-11-24T20:00:00Z", signup_source: "app", was_guest: true },
    { email: "old@test.com", created_at: "2026-11-20T15:30:00Z", signup_source: "web", was_guest: false },
  ],
};

describe("Traction helpers (lib/traction.ts)", () => {
  it("reads the RPC's jsonb defensively", () => {
    expect(parseTraction(null)).toBeNull();
    expect(parseTraction([])).toBeNull();
    const t = parseTraction({ accounts: 3, daily: [{ day: "2026-11-24", active_total: "2" }], newest_accounts: [{ email: null, signup_source: "ios" }] })!;
    expect(t.accounts).toBe(3);
    expect(t.guests).toBe(0);
    expect(t.active).toEqual({ today: 0, last_7: 0, last_30: 0 });
    expect(t.daily[0]).toEqual(day("2026-11-24", { active_total: 2 }));
    expect(t.newest_accounts[0]).toEqual({ email: null, created_at: "", signup_source: "web", was_guest: false });
  });

  it("formats numbers in full under 10,000 and compact above", () => {
    expect(compactNumber(1284)).toBe("1,284");
    expect(compactNumber(12_900)).toBe("12.9K");
    expect(compactNumber(4_200_000)).toBe("4.2M");
  });

  it("rounds an axis top up to 1, 2 or 5 times a power of ten", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(50)).toBe(50);
  });

  it("labels days and times without dashes or time zone drift", () => {
    expect(shortDay("2026-11-24")).toBe("Nov 24");
    expect(shortDay("2026-03-01")).toBe("Mar 1");
    expect(easternDateTime("2026-11-24T20:15:00Z")).toBe("Nov 24, 3:15 PM");
    expect(easternDateTime("nope")).toBe("");
  });
});

describe("The admin panel's Traction section", () => {
  it("shows the six stat tiles with Title Case labels", () => {
    render(<TractionView t={sample} />);
    for (const label of ["Accounts", "Guests", "Active Today", "Active 7 Days", "Active 30 Days", "Analyst Questions Today"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("12.3K")).toBeInTheDocument();
    expect(screen.getByText("2 from guests")).toBeInTheDocument();
    expect(screen.getByText("App 4, Web 2")).toBeInTheDocument();
  });

  it("charts sign-ups and active users by day, with a legend and a per-day readout", () => {
    render(<TractionView t={sample} />);
    expect(screen.getByText("Sign-Ups by Day")).toBeInTheDocument();
    expect(screen.getByText("Active Users by Day")).toBeInTheDocument();
    const nov24 = screen.getByLabelText("Nov 24: App 1, Web 1, New guests 0");
    fireEvent.mouseEnter(nov24);
    expect(screen.getAllByText("Nov 24").length).toBeGreaterThan(1);
    expect(screen.getByLabelText("Nov 24: Active 5, App 4, Web 2")).toBeInTheDocument();
  });

  it("opens a per-day table, newest first", () => {
    render(<TractionView t={sample} />);
    fireEvent.click(screen.getByRole("button", { name: "Show Table" }));
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Nov 24");
    expect(screen.getByRole("button", { name: "Hide Table" })).toBeInTheDocument();
  });

  it("lists the newest accounts with source and join time", () => {
    render(<TractionView t={sample} />);
    expect(screen.getByText("Newest Accounts")).toBeInTheDocument();
    expect(screen.getByText("new@test.com")).toBeInTheDocument();
    expect(screen.getByText("From Guest")).toBeInTheDocument();
    expect(screen.getByText("Nov 24, 3:00 PM")).toBeInTheDocument();
    expect(screen.getAllByText("App").length).toBeGreaterThan(0);
  });

  it("uses no em or en dashes and no trailing periods in its text", () => {
    const { container } = render(<TractionView t={sample} />);
    const text = container.textContent ?? "";
    const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
    for (const d of dashes) expect(text.includes(d)).toBe(false);
    for (const el of Array.from(container.querySelectorAll("div, span, p, th, td, h3, button"))) {
      if (el.children.length === 0) expect(el.textContent?.trim()).not.toMatch(/\.$/);
    }
  });
});
