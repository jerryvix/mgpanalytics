import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// The slates' "View All Odds" sheets (right side, full height) opened with
// their title and close X under the status bar on iPhones, and in landscape
// their content ran under the notch side. jsdom has no layout, so these pin
// the classes; the real-layout numbers (375/390/430 portrait, 844x390 and
// 932x430 landscape, desktop 1440) come from the browser harness in the PR
// notes: every edge clear, a 44x44 X that closes in one tap, desktop
// pixel-identical.
function open(side: "top" | "right" | "bottom" | "left", className?: string) {
  render(
    <Sheet open>
      <SheetContent side={side} className={className} aria-describedby={undefined}>
        <SheetTitle>Cardinals @ Pirates</SheetTitle>
      </SheetContent>
    </Sheet>
  );
  return screen.getByRole("dialog");
}

const pad = {
  top: "pt-[max(1.5rem,var(--safe-top))]",
  right: "pr-[max(1.5rem,var(--safe-right))]",
  bottom: "pb-[max(1.5rem,var(--safe-bottom))]",
  left: "pl-[max(1.5rem,var(--safe-left))]",
};

describe("Sheet safe areas", () => {
  // Each sheet pads the screen edges it touches; its fourth edge sits mid-
  // screen and keeps plain p-6. Without insets max() is 1.5rem = p-6, so
  // desktop is unchanged.
  it.each([
    ["right", ["top", "right", "bottom"], "left"],
    ["left", ["top", "left", "bottom"], "right"],
    ["top", ["top", "left", "right"], "bottom"],
    ["bottom", ["bottom", "left", "right"], "top"],
  ] as const)("a %s sheet pads its screen edges by the safe-area insets", (side, edges, inner) => {
    const sheet = open(side);
    for (const edge of edges) expect(sheet.className).toContain(pad[edge]);
    expect(sheet.className).not.toContain(pad[inner]);
    expect(sheet.className).toMatch(/\bp-6\b/);
  });

  it("the close X is a 44px target on phones, below the status bar and clear of the notch", () => {
    open("right");
    const close = screen.getByRole("button", { name: "Close" });
    // desktop: unchanged 16px icon at top-4 right-4
    expect(close.className).toMatch(/\btop-4\b/);
    expect(close.className).toMatch(/\bright-4\b/);
    // phones: 16px icon + 14px on each side = 44px, and the whole target
    // starts at the inset
    expect(close.className).toContain("phone:after:absolute");
    expect(close.className).toContain("phone:after:-inset-3.5");
    expect(close.className).toContain("phone:top-[max(1rem,calc(var(--safe-top)+14px))]");
    expect(close.className).toContain("phone:right-[max(1rem,calc(var(--safe-right)+14px))]");
  });

  it("a left sheet's X moves below the status bar but not away from the mid-screen edge", () => {
    open("left");
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toContain("phone:top-[max(1rem,calc(var(--safe-top)+14px))]");
    expect(close.className).not.toContain("phone:right-[");
  });

  // The mobile sidebar is a left Sheet with its own safe-area padding (and
  // its own close control); its classes must win outright
  it("a sheet that sets its own padding keeps it", () => {
    const sheet = open("left", "p-0 pb-[var(--safe-bottom)] pl-[var(--safe-left)] pt-[var(--safe-top)]");
    expect(sheet.className).not.toContain("max(1.5rem");
    expect(sheet.className).not.toMatch(/\bp-6\b/);
    expect(sheet.className).toContain("pt-[var(--safe-top)]");
    expect(sheet.className).toContain("pl-[var(--safe-left)]");
    expect(sheet.className).toContain("pb-[var(--safe-bottom)]");
  });
});
