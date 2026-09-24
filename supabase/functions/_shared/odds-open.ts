// Opening-line rule for odds_history (sync-odds-snapshot). Pure so vitest can
// pin it (src/test/oddsOpen.test.ts).
//
// The open is recorded ONCE, at first sight, and every later snapshot carries
// it forward. Sep 24 2026 regression: the second snapshot of each game used
// the oldest row's CURRENT line as the open, so ESPN's real DraftKings open
// was overwritten by whatever the line was at the first capture.

export interface HistoryOpenRow {
  opening_line: number | null;
  current_line: number | null;
}

/** The open a stored row stands for: its recorded open, else (pre-ESPN rows) its line. */
export function recordedOpen(row: HistoryOpenRow): number | null {
  return row.opening_line ?? row.current_line;
}

/**
 * Open for a new snapshot row: the open already on record wins; on first
 * sight use the book's own open (ESPN relays DraftKings' opening number, the
 * same one Market Pulse reads from betting_splits); failing that, the first
 * sighting is the open.
 */
export function resolveOpeningLine(
  onRecord: number | null | undefined,
  bookOpen: number | null | undefined,
  current: number | null,
): number | null {
  if (onRecord !== null && onRecord !== undefined) return onRecord;
  if (bookOpen !== null && bookOpen !== undefined) return bookOpen;
  return current;
}
