import { describe, expect, it, vi } from "vitest";
import { activityStorageKey, easternDay, recordWebActivity } from "@/lib/activity";

const USER = { id: "0f8fad5b-d9cb-469f-a165-70867728950e" };

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("The website's daily activity row (lib/activity.ts)", () => {
  it("counts the day in US Eastern time", () => {
    // 3:30 AM UTC on Nov 25 is still Nov 24 in New York
    expect(easternDay(new Date("2026-11-25T03:30:00Z"))).toBe("2026-11-24");
    expect(easternDay(new Date("2026-11-25T05:30:00Z"))).toBe("2026-11-25");
  });

  it("writes one 'web' row a day and remembers it", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const storage = memoryStorage();
    const now = new Date("2026-11-24T18:00:00Z");
    expect(await recordWebActivity(USER, { upsert, storage, now })).toBe(true);
    expect(upsert).toHaveBeenCalledWith({ user_id: USER.id, day: "2026-11-24", source: "web" });
    expect(storage.m.get(activityStorageKey(USER.id))).toBe("2026-11-24");
    expect(await recordWebActivity(USER, { upsert, storage, now })).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    // Next Eastern day writes again
    expect(await recordWebActivity(USER, { upsert, storage, now: new Date("2026-11-25T18:00:00Z") })).toBe(true);
  });

  it("skips guests, the dev preview user and missing users", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    expect(await recordWebActivity(null, { upsert })).toBe(false);
    expect(await recordWebActivity({ ...USER, is_anonymous: true }, { upsert })).toBe(false);
    expect(await recordWebActivity({ id: "dev-preview-user" }, { upsert })).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("ignores errors and blocked storage, and retries after a failed write", async () => {
    const storage = memoryStorage();
    const failing = vi.fn().mockResolvedValue({ error: { message: "RLS" } });
    expect(await recordWebActivity(USER, { upsert: failing, storage })).toBe(false);
    expect(storage.m.size).toBe(0);
    const throwing = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await recordWebActivity(USER, { upsert: throwing, storage })).toBe(false);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const ok = vi.fn().mockResolvedValue({ error: null });
    expect(await recordWebActivity(USER, { upsert: ok, storage: blocked })).toBe(true);
  });
});
