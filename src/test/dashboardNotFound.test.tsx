import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";
import DashboardNotFound from "@/pages/DashboardNotFound";

function PathProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="*" element={<DashboardNotFound />} />
      </Routes>
      <PathProbe />
    </MemoryRouter>
  );
}

const view = () => screen.getByRole("heading", { name: /page not found/i }).parentElement!;

describe("DashboardNotFound", () => {
  it("names the problem and shows the path instead of a blank page", () => {
    renderAt("/dashboard/nfl/typo");
    // scoped to the view: the test's PathProbe prints the path too
    expect(within(view()).getByText("/dashboard/nfl/typo")).toBeInTheDocument();
  });

  it("offers Home as a 44px phone target", () => {
    renderAt("/dashboard/nfl/typo");
    expect(within(view()).getByRole("button", { name: /home/i }).className).toMatch(/\bh-11\b/);
  });

  // Back comes from the shell (pinned top bar on phones, inline on desktop);
  // a second Back inside the page read as a duplicate
  it("does not add its own Back button", () => {
    renderAt("/dashboard/nfl/typo");
    expect(within(view()).queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("Home goes to the dashboard", () => {
    renderAt("/dashboard/nfl/typo");
    fireEvent.click(within(view()).getByRole("button", { name: /home/i }));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/dashboard$/);
  });

  // DashboardContent pulls in every page of the app, so the wiring is checked
  // at the source, like the Dashboard mount check in mobileNav.test.tsx
  it("is the dashboard's catch-all route", () => {
    const src = readFileSync(path.resolve(__dirname, "../components/DashboardContent.tsx"), "utf8");
    expect(src).toMatch(/<Route\s+path="\*"\s+element=\{<DashboardNotFound\s*\/>\}\s*\/>\s*<\/Routes>/);
  });
});
