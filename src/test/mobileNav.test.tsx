import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
