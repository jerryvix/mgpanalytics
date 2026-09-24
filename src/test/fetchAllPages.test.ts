import { describe, it, expect, vi } from "vitest";
import { fetchAllPages } from "@/lib/fetchAllPages";

// Stand-in for a PostgREST query: serves rows[from..to] like .range() does.
function server(total: number, failAtFrom?: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const page = vi.fn(async (from: number, to: number) => {
    calls.push([from, to]);
    if (from === failAtFrom) return { data: null, error: { message: "boom" } };
    return { data: rows.slice(from, to + 1), error: null };
  });
  return { page, calls };
}

describe("fetchAllPages", () => {
  it("reads past PostgREST's 1000-row cap (1036 odds_history rows)", async () => {
    const { page, calls } = server(1036);
    const rows = await fetchAllPages(page, 500);
    expect(rows).toHaveLength(1036);
    expect(calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("stops after one request when the first page is short (a 71-game window)", async () => {
    const { page, calls } = server(71);
    expect(await fetchAllPages(page, 500)).toHaveLength(71);
    expect(calls).toHaveLength(1);
  });

  it("asks once more when the last page is exactly full", async () => {
    const { page, calls } = server(1000);
    expect(await fetchAllPages(page, 500)).toHaveLength(1000);
    expect(calls).toHaveLength(3); // the third, empty page proves the end
  });

  it("keeps the rows already loaded when a later page fails", async () => {
    const { page } = server(1036, 500);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fetchAllPages(page, 500)).toHaveLength(500);
    spy.mockRestore();
  });
});
