import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

let mockIsMobile = true;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mockIsMobile }));
vi.mock("@/contexts/ChatContext", () => ({
  useChat: () => ({
    conversations: [],
    conversationsLoading: false,
    activeConversationId: null,
    startNewConversation: vi.fn(),
    loadConversation: vi.fn(),
    refreshConversations: vi.fn(),
    lastDataRefresh: null,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: vi.fn(), getUser: vi.fn() }, from: vi.fn() },
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileTopBar } from "@/components/ui/MobileTopBar";

const user = { id: "u1", email: "fan@example.com" } as User;

function PathProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <AppSidebar user={user} isAdmin={false} />
        <MobileTopBar />
        <PathProbe />
      </SidebarProvider>
    </MemoryRouter>
  );
}

// Generous timeouts: these tests mount the full AppSidebar (icons, Radix
// portal + presence cycle), and the first one also pays the cold module load.
// Under a busy machine that ran past Vitest's default 5s per test.
vi.setConfig({ testTimeout: 20_000 });
const SLOW = { timeout: 5000 };

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
  return screen.findByRole("dialog", {}, SLOW);
}

const inSheet = (role: string, name: string | RegExp) => screen.findByRole(role, { name }, SLOW);

const expectClosed = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), SLOW);

beforeEach(() => {
  mockIsMobile = true;
});

describe("sidebar sheet on phones", () => {
  it("has a visible 44px close control that closes it in one tap", async () => {
    renderShell("/dashboard/nfl");
    await openSheet();

    const close = await inSheet("button", /close menu/i);
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close.className).toMatch(/\bw-11\b/);
    // The desktop collapse toggle (and its focus tooltip) stays out of the sheet
    expect(screen.queryByText("Toggle Sidebar")).not.toBeInTheDocument();

    fireEvent.click(close);
    await expectClosed();
  });

  it("navigates and closes when a nav item is tapped", async () => {
    renderShell("/dashboard/nfl");
    await openSheet();

    fireEvent.click(await inSheet("link", /NCAAF/));

    await expectClosed();
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/ncaaf");
  });

  // The route-change effect alone never fired here, so the sheet stayed open
  // and the tap looked broken
  it("closes when the tapped item is the screen already showing", async () => {
    renderShell("/dashboard/nfl");
    await openSheet();

    fireEvent.click(await inSheet("link", "Games"));

    await expectClosed();
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/nfl");
  });

  it("closes from the footer items too", async () => {
    renderShell("/dashboard/nfl");
    await openSheet();

    fireEvent.click(await inSheet("link", /saved chats/i));

    await expectClosed();
    expect(screen.getByTestId("path")).toHaveTextContent("/dashboard/chats");
  });

  it("keeps sport expand toggles as 44px targets that do not close the sheet", async () => {
    renderShell("/dashboard/nfl");
    await openSheet();

    const expand = await inSheet("button", /expand mlb/i);
    expect(expand.className).toMatch(/\bmax-md:h-11\b/);
    expect(expand.className).toMatch(/\bmax-md:w-11\b/);

    fireEvent.click(expand);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await inSheet("button", /collapse mlb/i)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("sidebar on desktop", () => {
  it("keeps the collapse toggle and has no sheet close button", () => {
    mockIsMobile = false;
    renderShell("/dashboard/nfl");
    expect(screen.getByText("Toggle Sidebar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close menu/i })).not.toBeInTheDocument();
  });
});
