import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";

// Phone viewport everywhere in this file: the sidebar must render as an
// off-canvas sheet and the bottom bar must expose a Menu tab to open it.
let mockChatOpen = false;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/contexts/ChatContext", () => ({
  useChat: () => ({ isOpen: mockChatOpen, toggleChat: vi.fn() }),
}));

import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { BottomNav } from "@/components/ui/BottomNav";
import { MobileSportNav } from "@/components/ui/MobileSportNav";

beforeEach(() => {
  mockChatOpen = false;
});

function renderMobileShell() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SidebarProvider>
        <Sidebar>
          <nav>Full navigation content</nav>
        </Sidebar>
        <BottomNav />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe("mobile navigation", () => {
  it("keeps the full sidebar reachable on phones via the Menu tab", async () => {
    renderMobileShell();

    // Sheet starts closed - content off-screen
    expect(screen.queryByText("Full navigation content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /menu/i }));

    // Opening the Menu tab reveals the complete sidebar
    expect(await screen.findByText("Full navigation content")).toBeInTheDocument();
  });

  it("still shows the core tabs alongside Menu", () => {
    renderMobileShell();
    for (const label of ["Home", "Sports", "Chat", "Profile", "Menu"]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });

  it("drops the Menu tab instead of crashing when no sidebar exists on the page", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <BottomNav />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: /menu/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /home/i })).toBeInTheDocument();
  });

  // Guard the exact regression that stranded mobile users without navigation:
  // Dashboard once rendered AppSidebar only when !isMobile, which combined
  // with the sheet-less Sidebar primitive left phones with no way to reach
  // players, trending bets, community, or admin.
  it("Dashboard mounts AppSidebar on every viewport", () => {
    const src = readFileSync(path.resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
    expect(src).toMatch(/<AppSidebar/);
    expect(src).not.toMatch(/!isMobile\s*&&[\s\S]{0,160}<AppSidebar/);
  });

  it("the Sidebar primitive keeps its mobile sheet branch", () => {
    const src = readFileSync(path.resolve(__dirname, "../components/ui/sidebar.tsx"), "utf8");
    expect(src).toMatch(/if \(isMobile\)[\s\S]{0,600}SIDEBAR_WIDTH_MOBILE/);
  });

  it("lights one tab at a time: Chat, not the route underneath, while chat is open", () => {
    mockChatOpen = true;
    renderMobileShell();
    expect(screen.getByRole("button", { name: /home/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /chat/i }).className).toContain("text-terminal-green");
    expect(screen.getByRole("button", { name: /home/i }).className).not.toContain("text-terminal-green");
  });

  it("marks the current screen's tab when chat is closed", () => {
    renderMobileShell();
    expect(screen.getByRole("button", { name: /home/i })).toHaveAttribute("aria-current", "page");
  });

  it("clears the home indicator and lets taps through its transparent gutters", () => {
    renderMobileShell();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav.className).toContain("pb-[var(--safe-bottom)]");
    expect(nav.className).toMatch(/\bpointer-events-none\b/);
    expect(nav.firstElementChild!.className).toMatch(/\bpointer-events-auto\b/);
  });
});

describe("sport tabs on phones", () => {
  function renderSportNav(pathname: string) {
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <MobileSportNav />
      </MemoryRouter>
    );
  }

  // jsdom has no layout: sizes are asserted via the classes that set them.
  // h-11 = 44px; the 34px segments grow to 44px through a 5px ::after above
  // and below. Real-layout numbers are in the browser audit.
  it("gives every sport pill a 44px-tall tap target", () => {
    renderSportNav("/dashboard/nfl");
    for (const label of ["NFL", "MLB", "NBA", "NCAAF", "NCAAB"]) {
      expect(screen.getByRole("button", { name: label }).className).toMatch(/\bh-11\b/);
    }
    expect(screen.getByRole("button", { name: "NFL" })).toHaveAttribute("aria-current", "page");
  });

  // The tabs must stay one tap away deep in a long page: pinned right under
  // the top bar (safe area + bar height), above page content
  it("pins the sport and section tabs directly under the top bar", () => {
    const { container } = renderSportNav("/dashboard/mlb/players");
    const nav = container.querySelector("[data-sport-nav]")!;
    expect(nav.className).toMatch(/\bsticky\b/);
    expect(nav.className).toContain("top-[calc(var(--safe-top)+var(--mobile-topbar-h))]");
    expect(nav.className).toMatch(/\bz-20\b/);
    expect(within(nav as HTMLElement).getByRole("button", { name: "MLB" })).toBeInTheDocument();
    expect(within(nav as HTMLElement).getByRole("button", { name: "Players" })).toBeInTheDocument();
  });

  it("tucks the sport pills away when collapsed, keeping the section tabs pinned", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/dashboard/mlb/players"]}>
        <MobileSportNav collapsed />
      </MemoryRouter>
    );
    const nav = container.querySelector("[data-sport-nav]") as HTMLElement;
    // the whole block slides up by the pills' height (a transform: nothing
    // below reflows), animated unless the user asked for reduced motion
    expect(nav).toHaveAttribute("data-collapsed");
    expect(nav.className).toContain("-translate-y-[var(--mobile-pills-h)]");
    expect(nav.className).toContain("motion-reduce:transition-none");
    // the pills can't be tapped or focused while tucked away
    const pillRow = within(nav).getByRole("button", { name: "MLB", hidden: true }).parentElement!;
    expect(pillRow.className).toMatch(/\binvisible\b/);
    // the section tabs stay put and tappable
    expect(within(nav).getByRole("button", { name: "Players" })).toBeVisible();
  });

  it("shows the sport pills when expanded", () => {
    const { container } = renderSportNav("/dashboard/mlb/players");
    const nav = container.querySelector("[data-sport-nav]") as HTMLElement;
    expect(nav).not.toHaveAttribute("data-collapsed");
    expect(nav.className).not.toContain("-translate-y-");
    expect(within(nav).getByRole("button", { name: "MLB" }).parentElement!.className).not.toMatch(/\binvisible\b/);
  });

  it("DashboardContent wires scroll restoration and the collapsing pills to the dashboard scroller", () => {
    const src = readFileSync(path.resolve(__dirname, "../components/DashboardContent.tsx"), "utf8");
    expect(src).toMatch(/useScrollRestoration\(getScroller\)/);
    expect(src).toMatch(/useCollapseOnScroll\(getScroller, isMobile && isSportsPage\)/);
    expect(src).toMatch(/<MobileSportNav collapsed=\{pillsCollapsed\} \/>/);
    expect(src).toMatch(/onRevealSubnav=\{pillsCollapsed \? revealPills : undefined\}/);
  });

  it("the dashboard scroller pads scroll-into-view by the pinned chrome above and below and never scrolls sideways", () => {
    const src = readFileSync(path.resolve(__dirname, "../pages/Dashboard.tsx"), "utf8");
    const main = src.match(/<main className="([^"]+)"/)![1];
    expect(main).toContain("phone:overflow-x-clip");
    expect(main).toContain("phone:scroll-pt-[calc(var(--safe-top)+var(--mobile-topbar-h)+1px)]");
    expect(main).toContain("phone:has-[[data-sport-nav]]:scroll-pt-[calc(var(--safe-top)+var(--mobile-topbar-h)+var(--mobile-sportnav-h))]");
    // the floating tab bar: keyboard focus in a short landscape viewport
    // used to land underneath it
    expect(main).toContain("phone:scroll-pb-[calc(var(--bottom-nav-h)+var(--safe-bottom))]");
  });

  it("extends each segmented-control tab to 44px without changing its look", () => {
    renderSportNav("/dashboard/nfl/players");
    for (const label of ["Games", "Players", "Trending"]) {
      const seg = screen.getByRole("button", { name: label });
      expect(seg.className).toMatch(/\brelative\b/);
      expect(seg.className).toContain("after:-top-[5px]");
      expect(seg.className).toContain("after:-bottom-[5px]");
      expect(seg.className).toContain("min-h-[34px]");
    }
    expect(screen.getByRole("button", { name: "Players" })).toHaveAttribute("aria-current", "page");
  });

  // Tucked, the segmented control sits flush under the top bar (its 1px
  // border + 2px padding put each segment 3px below the bar's edge). A 5px
  // extension above reached 2px into the bar, where a tap hit Back or the
  // title; 3px above + 7px below keeps the full 44px, all of it below the bar.
  it("keeps the whole 44px tab target below the top bar while the pills are tucked", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/mlb"]}>
        <MobileSportNav collapsed />
      </MemoryRouter>
    );
    for (const label of ["Games", "Players", "Trending"]) {
      const seg = screen.getByRole("button", { name: label });
      expect(seg.className).toContain("after:-top-[3px]");
      expect(seg.className).toContain("after:-bottom-[7px]");
      expect(seg.className).not.toContain("after:-top-[5px]");
      expect(seg.className).toContain("min-h-[34px]"); // 3 + 34 + 7 = 44
    }
  });
});
