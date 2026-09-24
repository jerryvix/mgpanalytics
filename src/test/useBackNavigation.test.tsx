import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter, Link, Routes, Route, useLocation } from "react-router-dom";
import { useBackNavigation } from "@/hooks/useBackNavigation";

// Real BrowserRouter on jsdom's window.history, so Back exercises the same
// history.state.idx bookkeeping and popstate round trips as a phone does.

function Screen() {
  const { pathname } = useLocation();
  const { goBack } = useBackNavigation();
  return (
    <>
      <div data-testid="path">{pathname}</div>
      <button onClick={goBack}>Back</button>
      <Link to="/dashboard/nfl/players/bdl-34">Open player</Link>
    </>
  );
}

// A cold deep link (shared URL, refresh, new tab): the tab's history holds
// just this entry, which React Router stamps idx 0 on startup.
function renderColdAt(url: string) {
  window.history.replaceState(null, "", url);
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Screen />} />
      </Routes>
    </BrowserRouter>
  );
}

const pathIs = (p: string) => waitFor(() => expect(screen.getByTestId("path").textContent).toBe(p));
const back = () => fireEvent.click(screen.getByRole("button", { name: "Back" }));

describe("Back from a cold deep link", () => {
  // The owner-reported loop: pushing the parent let the next Back pop down to
  // the deep link again (players, detail, players...).
  it("walks up three levels, one per tap, and never back down", async () => {
    renderColdAt("/dashboard/nfl/players/bdl-34");
    const entries = window.history.length;

    back();
    await pathIs("/dashboard/nfl/players");
    back();
    await pathIs("/dashboard/nfl");
    back();
    await pathIs("/dashboard");

    // each step replaced the entry; nothing was pushed that Back could pop into
    expect(window.history.length).toBe(entries);
  });

  it("climbs out of an unknown nested path without looping", async () => {
    renderColdAt("/dashboard/foo/bar");
    back();
    await pathIs("/dashboard/foo");
    back();
    await pathIs("/dashboard");
  });

  it("still returns to the previous screen after in-app navigation, then keeps climbing", async () => {
    renderColdAt("/dashboard/nfl/players");
    fireEvent.click(screen.getByRole("link", { name: "Open player" }));
    await pathIs("/dashboard/nfl/players/bdl-34");

    back(); // in-app history: pops to where the user came from
    await pathIs("/dashboard/nfl/players");
    back(); // back at the cold entry: climbs instead of leaving the app
    await pathIs("/dashboard/nfl");
  });
});
