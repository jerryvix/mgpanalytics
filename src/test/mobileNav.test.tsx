import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";

// Phone viewport everywhere in this file: the sidebar must render as an
// off-canvas sheet and the bottom bar must expose a Menu tab to open it.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/contexts/ChatContext", () => ({
  useChat: () => ({ isOpen: false, toggleChat: vi.fn() }),
}));

import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { BottomNav } from "@/components/ui/BottomNav";

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
});
