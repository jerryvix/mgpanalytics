// Replace the draft board as exactly one capture, through the
// replace_draft_board SQL function (migration 20260924080000). Kept free of
// Deno APIs so vitest can drive it with a fake client
// (src/test/draftBoardReplace.test.ts).
//
// The function does the whole swap in one transaction under an advisory
// lock: it refuses when a newer capture is already on the board, upserts
// this one, deletes strictly older rows only, and raises unless exactly this
// capture remains, rolling everything back. Doing those steps as separate
// PostgREST calls let two overlapping runs delete each other's rows and
// leave the board empty while both logged success.

export interface BoardRow {
  rank: number;
  player_name: string;
  position: string | null;
  school: string;
  height: string | null;
  weight: number | null;
  /** Board the row came from, e.g. "DraftTek". */
  source: string;
  /** That board's own revision date (YYYY-MM-DD). */
  source_as_of: string;
  // draft_year and captured_at are stamped by the SQL function from its
  // parameters, so a payload can't mix captures
}

// The slice of the supabase-js client this needs
export type BoardDb = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function replaceBoard(
  db: BoardDb,
  draftYear: number,
  rows: BoardRow[],
  capturedAt: string
): Promise<{ rows: number; pruned: number }> {
  if (rows.length === 0) {
    throw new Error("Refusing to replace the board with an empty capture");
  }

  const { data, error } = await db.rpc("replace_draft_board", {
    p_draft_year: draftYear,
    p_capture: capturedAt,
    p_rows: rows,
  });
  if (error) {
    // The transaction rolled back, so the previous board is still whole
    throw new Error(`Board swap failed and was rolled back: ${error.message}`);
  }

  const result = data as { rows?: number; pruned?: number } | null;
  if (result?.rows !== rows.length) {
    throw new Error(`Board swap reported ${result?.rows ?? "no"} rows, expected ${rows.length}`);
  }
  return { rows: result.rows, pruned: result.pruned ?? 0 };
}
