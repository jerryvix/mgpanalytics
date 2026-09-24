// The DraftKings lines sync-betting-splits stores (betting_lines), laid over
// a surface's odds-table rows, so the slate cards, Today's Board and the chat
// show the same number per market as Game Insights > Market Pulse. The rule
// that picks the number is chooseLine (supabase/functions/_shared/dk-line.ts,
// re-exported by lib/marketPulse.ts).
//
// Rows are keyed by OUR game id. The sync already paired ESPN's events with
// our games (NCAAF by the ESPN id in external_id; NFL, whose games table is
// BDL-keyed, on both teams and kickoff, the way sync-nfl-games pairs them),
// so a surface reads by its own ids and never re-matches names.

import { supabase } from "@/integrations/supabase/client";
import { withStoredLine, type LineRowLike, type OddsRowLike, type StoredOddsRow } from "@/lib/marketPulse";
import { fetchDkLines, type GameLineRow } from "../../supabase/functions/_shared/dk-line";

export type { GameLineRow };

/**
 * Every stored DraftKings line for these games, by game id. Sports without
 * stored lines (MLB) read nothing. A failed read gives an empty map, so the
 * surface falls back to its odds table instead of losing the board.
 */
export async function fetchStoredLines(sport: string, gameIds: Array<string | number>): Promise<Map<string, GameLineRow[]>> {
  try {
    return await fetchDkLines(supabase, sport, gameIds);
  } catch (err) {
    console.warn(`[storedLines] ${sport} betting_lines read failed; showing the odds table's lines`, err);
    return new Map();
  }
}

/**
 * Each game's odds row with its stored line laid over it (withStoredLine),
 * plus a row for a game only the line store has, built on `blank(gameId)`
 * (the fields a surface needs to recognize the row, e.g. its sportsbook).
 */
export function overlayStoredLines<T extends Partial<OddsRowLike>>(
  oddsByGame: Map<string, T>,
  linesByGame: Map<string, LineRowLike[]>,
  blank: (gameId: string) => T,
): Map<string, T & StoredOddsRow> {
  const out = new Map<string, T & StoredOddsRow>();
  for (const id of new Set([...oddsByGame.keys(), ...linesByGame.keys()])) {
    const lines = linesByGame.get(id) ?? [];
    const merged = withStoredLine(oddsByGame.get(id) ?? (lines.length ? blank(id) : null), lines);
    if (merged) out.set(id, merged);
  }
  return out;
}
