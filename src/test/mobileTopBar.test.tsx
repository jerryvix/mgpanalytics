import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

// Phone viewport: the sidebar renders as an off-canvas sheet
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { MobileTopBar } from "@/components/ui/MobileTopBar";
import { mobileTitleFor } from "@/lib/dashboardNav";

function PathProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderBar(path: string, historyIdx: number | null = 0, subnav = false) {
  // React Router stamps { idx } onto history state; 0/null models a screen
  // opened cold (deep link, refresh) with nothing in-app to pop back to.
  window.history.replaceState(historyIdx === null ? null : { idx: historyIdx }, "");
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <Sidebar>
          <nav>Full navigation content</nav>
        </Sidebar>
        <MobileTopBar subnav={subnav} />
        <PathProbe />
      </SidebarProvider>
    </MemoryRouter>
  );
}

// jsdom has no layout, so size is asserted through the classes that set it:
// h-11 / w-11 / min-w-11 are 2.75rem = 44px, Apple's minimum tap target. The
// real-layout numbers (getBoundingClientRect + elementFromPoint at 375, 390
// and 430 widths) come from the browser audit in the PR notes.
function expect44(el: HTMLElement) {
  expect(el.className).toMatch(/\bh-11\b/);
  expect(el.className).toMatch(/\b(min-w-11|w-11)\b/);
}

describe("MobileTopBar", () => {
  it("pins Back and the menu toggle together on screens below home", () => {
    renderBar("/dashboard/nfl/players/bdl-19");
    const back = screen.getByRole("button", { name: /go back/i });
    const menu = screen.getByRole("button", { name: /open menu/i });
    expect44(back);
    expect44(menu);

    // Sticky and safe-area aware: stays under the status bar while the page
    // scrolls, instead of scrolling away with the content
    const bar = back.closest("header")!;
    expect(bar.className).toMatch(/\bsticky\b/);
    expect(bar.className).toMatch(/\btop-0\b/);
    expect(bar.className).toContain("pt-[var(--safe-top)]");
    // Phones only; desktop keeps its inline BackButton and sidebar rail
    expect(bar.className).toMatch(/\bdesk:hidden\b/);
  });

  it("shows the brand instead of Back on home, and keeps the menu toggle", () => {
    renderBar("/dashboard");
    expect(screen.queryByRole("button", { name: /go back/i })).not.toBeInTheDocument();
    expect(screen.getByText("MGP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });

  it("opens the sidebar sheet with one tap", async () => {
    renderBar("/dashboard/mlb");
    const menu = screen.getByRole("button", { name: /open menu/i });
    expect(screen.queryByText("Full navigation content")).not.toBeInTheDocument();
    expect(menu).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menu);

    expect(await screen.findByText("Full navigation content")).toBeInTheDocument();
    expect(menu).toHaveAttribute("aria-expanded", "true");
  });

  it("goes to the parent route on a cold deep link instead of leaving the app", () => {
    renderBar("/dashboard/nfl/players/bdl-19", 0);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/nfl/players");
  });

  it("keeps one hairline under the whole header when sport tabs are pinned below it", () => {
    renderBar("/dashboard/mlb", 0, true);
    const bar = screen.getByRole("button", { name: /go back/i }).closest("header")!;
    expect(bar.className).not.toMatch(/\bborder-b\b/);
    expect(bar.className).not.toMatch(/\bmb-3\b/);
    // without tabs below, the bar carries its own hairline and spacing
    const { container } = renderBar("/dashboard/chats");
    const plain = container.querySelector("header")!;
    expect(plain.className).toMatch(/\bborder-b\b/);
    expect(plain.className).toMatch(/\bmb-3\b/);
  });

  it("while the sport pills are collapsed, tapping the title brings them back", () => {
    const reveal = vi.fn();
    window.history.replaceState({ idx: 0 }, "");
    render(
      <MemoryRouter initialEntries={["/dashboard/mlb"]}>
        <SidebarProvider>
          <MobileTopBar subnav onRevealSubnav={reveal} />
        </SidebarProvider>
      </MemoryRouter>
    );
    const title = screen.getByRole("button", { name: /MLB: show sports/i });
    expect(title.className).toMatch(/\bh-11\b/);
    fireEvent.click(title);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("the title is plain text when there is nothing to reveal", () => {
    renderBar("/dashboard/mlb", 0, true);
    expect(screen.queryByRole("button", { name: /show sports/i })).not.toBeInTheDocument();
    expect(screen.getByText("MLB")).toBeInTheDocument();
  });

  it("names the current section", () => {
    renderBar("/dashboard/nfl/players/bdl-19");
    expect(screen.getByText("NFL")).toBeInTheDocument();
  });
});

describe("mobileTitleFor", () => {
  it.each([
    ["/dashboard", ""],
    ["/dashboard/", ""],
    ["/dashboard/ncaaf", "NCAAF"],
    ["/dashboard/mlb/players/123", "MLB"],
    ["/dashboard/chats", "Saved Chats"],
    ["/dashboard/watchlist", "Watchlist"],
    ["/dashboard/profile", "Profile"],
    ["/dashboard/market/line-movement", "Line Movement"],
    ["/dashboard/admin/observatory", "Sync Observatory"],
    ["/dashboard/something-new", ""],
  ])("%s -> %j", (path, title) => {
    expect(mobileTitleFor(path)).toBe(title);
  });
});
