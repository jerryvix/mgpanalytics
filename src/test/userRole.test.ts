import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";

type RoleResult = { data: { role: string }[] | null; error: { message: string } | null };
const mockEq = vi.fn<(col: string, val: string) => Promise<RoleResult>>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: (col: string, val: string) => mockEq(col, val) }) }),
  },
}));

import { highestRole, useUserRole, ROLE_TIMEOUT_MS } from "@/hooks/useUserRole";

const asUser = (id: string) => ({ id }) as User;

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

describe("useUserRole", () => {
  beforeEach(() => mockEq.mockReset());

  it("stays loading, not non-admin, until a session exists", () => {
    const { result } = renderHook(() => useUserRole(null));
    expect(result.current).toEqual({ role: null, isAdmin: false, loading: true });
    expect(mockEq).not.toHaveBeenCalled();
  });

  it("reports admin for a user with both role rows", async () => {
    mockEq.mockResolvedValue({ data: [{ role: "user" }, { role: "admin" }], error: null });
    const { result } = renderHook(() => useUserRole(asUser("u1")));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("does not refetch when auth hands over a new object for the same user", async () => {
    mockEq.mockResolvedValue({ data: [{ role: "admin" }], error: null });
    const { result, rerender } = renderHook(({ u }) => useUserRole(u), { initialProps: { u: asUser("u1") } });
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    rerender({ u: asUser("u1") });
    rerender({ u: asUser("u1") });
    expect(mockEq).toHaveBeenCalledTimes(1);
    expect(result.current.isAdmin).toBe(true);
  });

  it("retries once when the first request fails, then resolves", async () => {
    mockEq
      .mockResolvedValueOnce({ data: null, error: { message: "JWT expired" } })
      .mockResolvedValueOnce({ data: [{ role: "admin" }], error: null });
    const { result } = renderHook(() => useUserRole(asUser("u1")));
    await waitFor(() => expect(result.current.isAdmin).toBe(true), { timeout: 3000 });
    expect(mockEq).toHaveBeenCalledTimes(2);
  });

  it("falls back to user after the retry also fails", async () => {
    mockEq.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useUserRole(asUser("u1")));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.role).toBe("user");
  });

  it("ignores a stale response for a previous user", async () => {
    let releaseFirst: (v: RoleResult) => void = () => {};
    mockEq
      .mockImplementationOnce(() => new Promise<RoleResult>((r) => { releaseFirst = r; }))
      .mockResolvedValueOnce({ data: [{ role: "user" }], error: null });
    const { result, rerender } = renderHook(({ u }) => useUserRole(u), { initialProps: { u: asUser("admin-user") } });
    rerender({ u: asUser("plain-user") });
    await waitFor(() => expect(result.current.role).toBe("user"));
    releaseFirst({ data: [{ role: "admin" }], error: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.role).toBe("user");
  });
  it("falls back to user when the role query stalls, then upgrades on a late answer", async () => {
    vi.useFakeTimers();
    try {
      let release: (v: RoleResult) => void = () => {};
      mockEq.mockImplementationOnce(() => new Promise<RoleResult>((r) => { release = r; }));
      const { result } = renderHook(() => useUserRole(asUser("u1")));
      expect(result.current.loading).toBe(true);
      await act(async () => { vi.advanceTimersByTime(ROLE_TIMEOUT_MS); });
      expect(result.current).toEqual({ role: "user", isAdmin: false, loading: false });
      await act(async () => { release({ data: [{ role: "admin" }], error: null }); });
      expect(result.current.isAdmin).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
