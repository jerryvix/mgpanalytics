// PostgREST caps every response at 1000 rows (db-max-rows) and reports no error
// when it truncates. A sync that builds an "external id -> internal id" map with
// a plain .select() therefore gets a SILENTLY PARTIAL map once a sport passes
// 1,000 players, and every player past the cap stops being written: their stats
// row keeps whatever it last held and never refreshes again.
//
// That is what froze 27 of the 133 qualified MLB hitters on Sep 23 2026 (Freddie
// Freeman, Trea Turner and Gunnar Henderson among them) with hit streaks from
// mid-August still rendering as live, while the sync reported success every run.
//
// Use this instead of a bare .select() whenever the result is meant to be "every
// row", not "the first page".
export async function selectAll<T>(
  build: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
  opts: { pageSize?: number; label?: string } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`${opts.label ?? "selectAll"} failed at offset ${from}: ${error.message}`);
    }
    const page = data ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
