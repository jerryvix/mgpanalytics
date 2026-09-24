// Every row a query matches, not the first page of it.
//
// PostgREST serves at most 1000 rows per response and truncates without an
// error (db-max-rows), and a fixed .limit() does the same by design. The
// Trending board lost 31 of 71 NCAAF games that way (.limit(40)), and its
// line-move rails read 1000 of 1036 odds_history rows. This pages with
// .range() until a short page comes back. Give the query a stable order
// (a unique column last) so pages never overlap or skip.

export const PAGE_SIZE = 500;
const MAX_ROWS = 20_000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => Page<T>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) {
      // Keep what already loaded; the caller renders a partial board rather than none
      console.error("[fetchAllPages] page failed:", error);
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
