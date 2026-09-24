import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

// Phones in landscape get the phone layout, and with it the bottom-sheet
// Drawer (Game Insights). The notch sits on the left or right there, so the
// sheet's content is inset by the side safe areas. They are 0 in portrait
// and on desktop, so nothing moves anywhere else. Real-layout numbers
// (844x390 and 932x430, 47/59px side insets) come from the browser audit.
describe("Drawer", () => {
  it("keeps its content clear of the notch sides", async () => {
    render(
      <Drawer open>
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Cardinals @ Pirates</DrawerTitle>
          <p>Market read</p>
        </DrawerContent>
      </Drawer>
    );
    const sheet = await screen.findByRole("dialog");
    expect(sheet.className).toContain("pl-[var(--safe-left)]");
    expect(sheet.className).toContain("pr-[var(--safe-right)]");
    // the surface itself still spans the full width
    expect(sheet.className).toMatch(/\binset-x-0\b/);
  });
});
