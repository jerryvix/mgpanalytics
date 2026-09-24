import { describe, it, expect } from "vitest";
import { highestRole } from "@/hooks/useUserRole";

describe("highestRole", () => {
  it("resolves a user holding both 'user' and 'admin' rows to admin", () => {
    expect(highestRole([{ role: "user" }, { role: "admin" }])).toBe("admin");
    expect(highestRole([{ role: "admin" }, { role: "user" }])).toBe("admin");
  });

  it("ranks moderator above user and below admin", () => {
    expect(highestRole([{ role: "user" }, { role: "moderator" }])).toBe("moderator");
    expect(highestRole([{ role: "moderator" }, { role: "admin" }])).toBe("admin");
  });

  it("defaults to user when there are no rows or unknown roles", () => {
    expect(highestRole([])).toBe("user");
    expect(highestRole(null)).toBe("user");
    expect(highestRole([{ role: "superuser" }, { role: null }])).toBe("user");
  });
});
