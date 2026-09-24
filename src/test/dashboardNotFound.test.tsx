import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";
import DashboardNotFound from "@/pages/DashboardNotFound";

function PathProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

// entries: in-app history (last one is current); historyIdx models React
// Router's history.state.idx, which is 0 on a cold deep link / refresh
function renderAt(entries: string[], historyIdx: number) {
  window.history.replaceState({ idx: historyIdx }, "");
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="*" element={<DashboardNotFound />} />
      </Routes>
      <PathProbe />
    </MemoryRouter>
  );
}

describe("DashboardNotFound", () => {
  it("names the problem and shows the path instead of a blank page", () => {
    renderAt(["/dashboard/nfl/typo"], 0);
    const heading = screen.getByRole("heading", { name: /page not found/i });
    // scoped to the view: the test's PathProbe prints the path too
    expect(within(heading.parentElement!).getByText("/dashboard/nfl/typo")).toBeInTheDocument();
  });

  it("offers Back and Home as 44px phone targets", () => {
    renderAt(["/dashboard/nfl/typo"], 0);
    for (const name of [/back/i, /home/i]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/\bh-11\b/);
    }
  });

  it("Home goes to the dashboard", () => {
    renderAt(["/dashboard/nfl/typo"], 0);
    fireEvent.click(screen.getByRole("button", { name: /home/i }));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/dashboard$/);
  });

  it("Back walks up to the nearest real screen on a cold link", () => {
    renderAt(["/dashboard/ncaab/players"], 0);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/dashboard\/ncaab$/);
  });

  it("Back returns to the previous screen after in-app navigation", () => {
    renderAt(["/dashboard/mlb", "/dashboard/mlb/typo"], 1);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/dashboard\/mlb$/);
  });

  // DashboardContent pulls in every page of the app, so the wiring is checked
  // at the source, like the Dashboard mount check in mobileNav.test.tsx
  it("is the dashboard's catch-all route", () => {
    const src = readFileSync(path.resolve(__dirname, "../components/DashboardContent.tsx"), "utf8");
    expect(src).toMatch(/<Route\s+path="\*"\s+element=\{<DashboardNotFound\s*\/>\}\s*\/>\s*<\/Routes>/);
  });
});
