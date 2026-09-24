import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
let mockPathname = "/dashboard/nfl/players/bdl-123";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: mockPathname, search: "", hash: "", state: null, key: "t" }),
  };
});

import { BackButton } from "@/components/ui/BackButton";
import { parentPath } from "@/lib/dashboardNav";

function renderAt(pathname: string, historyIdx: number | null) {
  mockPathname = pathname;
  // React Router stamps { idx } onto history state; null models a page opened
  // cold (deep link / refresh) where there is nothing in-app to pop back to.
  window.history.replaceState(historyIdx === null ? null : { idx: historyIdx }, "");
  return render(
    <MemoryRouter>
      <BackButton />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BackButton", () => {
  it("renders on every dashboard screen below home", () => {
    renderAt("/dashboard/nfl/players/bdl-123", 2);
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
  });

  it("does not render on dashboard home, which has nothing above it", () => {
    const { container } = renderAt("/dashboard", 0);
    expect(container).toBeEmptyDOMElement();

    const trailingSlash = renderAt("/dashboard/", 0);
    expect(trailingSlash.container).toBeEmptyDOMElement();
  });

  it("pops in-app history when the user navigated here from another screen", () => {
    renderAt("/dashboard/nfl/players/bdl-123", 3);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("falls back to the parent route on a cold deep link instead of leaving the site", () => {
    renderAt("/dashboard/nfl/players/bdl-123", 0);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/nfl/players");
  });

  it("floors the cold-start fallback at dashboard home", () => {
    renderAt("/dashboard/ncaaf", null);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("walks admin sub-pages up one level", () => {
    renderAt("/dashboard/admin/observatory", 0);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/admin");
  });

  // /dashboard/market has no screen: landing there showed a blank page with
  // nothing but a Back button, the dead end the owner flagged.
  it("skips screenless parents on a cold deep link to a market tool", () => {
    renderAt("/dashboard/market/live-edges", 0);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});

describe("parentPath", () => {
  it.each([
    ["/dashboard/nfl/players/bdl-123", "/dashboard/nfl/players"],
    ["/dashboard/nfl/players/", "/dashboard/nfl"],
    ["/dashboard/mlb", "/dashboard"],
    ["/dashboard/market/props", "/dashboard"],
    ["/dashboard/community/feed", "/dashboard"],
    ["/dashboard/community/cappers/sharps", "/dashboard/community/cappers"],
    ["/dashboard", "/dashboard"],
  ])("%s -> %s", (from, to) => {
    expect(parentPath(from)).toBe(to);
  });
});
