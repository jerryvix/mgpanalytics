// "Your teams' next games" for the Daily Edge email. Pure (no Deno or
// Supabase imports), so src/test/dailyDigestNextGames.test.ts pins it.
import { isCalledOffStatus } from "../_shared/game-status.ts";

export interface NextGame {
  team: string;
  opponent: string;
  isHome: boolean;
  date: string;
}

export interface DigestGameRow {
  home_team_name: string;
  visitor_team_name: string;
  date: string;
  status?: string | null;
}

/**
 * Each followed team's next game, from rows in start order. A postponed or
 * canceled game is nobody's next game (the app's Your Teams card skips them
 * too): ESPN cancels an "if necessary" Wild Card game 3 after a 2-0 series,
 * and the email would have led with it.
 */
export function nextGamesFor(rows: DigestGameRow[], teams: string[]): NextGame[] {
  const out: NextGame[] = [];
  const seen = new Set<string>();
  for (const g of rows) {
    if (isCalledOffStatus(g.status)) continue;
    for (const team of teams) {
      if (seen.has(team)) continue;
      const isHome = g.home_team_name === team;
      const isAway = g.visitor_team_name === team;
      if (!isHome && !isAway) continue;
      seen.add(team);
      out.push({ team, opponent: isHome ? g.visitor_team_name : g.home_team_name, isHome, date: g.date });
    }
  }
  return out;
}
