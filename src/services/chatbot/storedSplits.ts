// Public-betting chat answers from MGP's own stored DraftKings data: splits
// (betting_splits) for % of bets and money, and the ONE DraftKings line every
// surface shows (betting_lines, or the odds table when that is the fresher
// capture: chooseLine), synced for NCAAF and NFL. A game DK posted no split
// for still gets its line, so the chat quotes the app's number instead of a
// web search's. The public-betting handler asks this first and falls back to
// web search only when no NCAAF or NFL game in the window matches the
// question. Signals come from the same Market Pulse rules Game Insights
// renders (supabase/functions/_shared/market-pulse.ts), and the live chat
// (gemini-chat) uses the same rules and matcher (_shared/pulse-chat.ts), so the
// chat and the sheet can never disagree.

import { supabase } from "@/integrations/supabase/client";
import { tbdKickoffLabel } from "@/lib/kickoff";
import {
  agoLabel,
  buildMarketPulse,
  fmtAmerican,
  openToNow,
  PUBLIC_BETS_PCT,
  PULSE_MARKETS,
  SHARP_EDGE_PTS,
  splitAsOf,
  type OddsRowLike,
  type PulseMarket,
  type PulseSideView,
} from "@/lib/marketPulse";
import { selectAll } from "../../../supabase/functions/_shared/select-all";
import { cachedPlayerNames, loadPlayerNames } from "../../../supabase/functions/_shared/player-names";
import { resolveLeague } from "../../../supabase/functions/_shared/league-detect";
// The question-to-game matcher is shared with the live chat (gemini-chat)
import {
  candidateGames,
  findSplitsGame,
  gameIntent,
  groupSplitGames,
  storedSplitsGame,
  lineOnlyGames,
  type LineGameRow,
  type SplitsGame,
  type StoredLineRow,
  type StoredSplitRow,
} from "../../../supabase/functions/_shared/pulse-chat";

export {
  findSplitsGame,
  groupSplitGames,
  lineOnlyGames,
  type LineGameRow,
  type SplitsGame,
  type StoredLineRow,
  type StoredSplitRow,
};

const fmtPrice = (v: number | null) => fmtAmerican(v);
const fmtSpread = (v: number | null) => (v === null ? "-" : v === 0 ? "PK" : v > 0 ? `+${v}` : `${v}`);

const KICKOFF = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

function sideLine(market: PulseMarket, s: PulseSideView, name: string, pricedPair: boolean): string {
  const number =
    market === "moneyline"
      ? fmtPrice(s.price)
      : `${market === "spread" ? fmtSpread(s.line) : s.line ?? "-"}${pricedPair ? ` (${fmtPrice(s.price)})` : ""}`;
  // A market DK posted no split for: the line alone
  if (s.betsPct === null || s.handlePct === null) return `${name} ${number}`;
  const tags = [s.sharp && "sharp money", s.publicSide && "public side", s.reverseMove && "reverse line move"].filter(Boolean);
  return `${name} ${number}: ${s.betsPct}% of bets, ${s.handlePct}% of money${tags.length ? ` · ${tags.join(", ")}` : ""}`;
}

export function formatSplitsAnswer(game: SplitsGame, now: Date = new Date()): string {
  const pulse = buildMarketPulse({ splits: game.rows, lines: game.lines, odds: game.odds ?? null });
  const shown = PULSE_MARKETS.filter((m) => pulse[m]?.hasSplits || (pulse[m] && pulse[m]!.lineSource !== null));
  const hasSplits = shown.some((m) => pulse[m]!.hasSplits);
  // The oldest number the answer quotes, so "updated" never oversells it
  const lineAt =
    shown
      .map((m) => pulse[m]!.lineAsOf)
      .filter((t): t is string => t !== null)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  // DK's page freshness, not our fetch time (sync-betting-splits freshness.ts)
  const splitAt = game.rows.map(splitAsOf).sort().pop() ?? null;
  const labels: Record<PulseMarket, string> = { spread: "Spread", total: "Total", moneyline: "Moneyline" };
  const when = game.start ? (game.startTbd ? tbdKickoffLabel(game.start, now) : `${KICKOFF.format(new Date(game.start))} ET`) : null;
  const lines: string[] = [
    `**${game.away} @ ${game.home}** · ${hasSplits ? "DraftKings betting splits" : "DraftKings line"}`,
    [when, lineAt ? `line updated ${agoLabel(lineAt, now)}` : null, splitAt ? `split ${agoLabel(splitAt, now)}` : null]
      .filter(Boolean)
      .join(" · "),
  ];
  if (!hasSplits) {
    lines.push(
      "",
      "DraftKings hasn't posted a public betting split for this game (its splits page lists about 50 games at a time), so there's no sharp-money or public-side read yet. Here is DraftKings' line.",
    );
  }
  for (const m of shown) {
    const v = pulse[m]!;
    const names = m === "total" ? ["Over", "Under"] : [game.away, game.home];
    lines.push("", `**${labels[m]}**`);
    const pricedPair = v.sides.every((s) => s.price !== null);
    v.sides.forEach((s, i) => lines.push(sideLine(m, s, names[i], pricedPair)));
    if (v.thin) lines.push("One-sided so far (a side at 0% of bets or money), so no signal is read.");
    const move = openToNow(v);
    if (move) lines.push(`${move}${m === "spread" ? ` (${game.away})` : m === "moneyline" ? " (away / home)" : ""}`);
  }
  if (hasSplits) {
    lines.push(
      "",
      `Sharp money = under half the bets but over half the money, money share ${SHARP_EDGE_PTS}+ points above bet share. ` +
        `Public side = ${PUBLIC_BETS_PCT}%+ of bets. Reverse line move = the line moved toward a side since DraftKings opened it ` +
        `while ${PUBLIC_BETS_PCT}%+ of bets sat on the other side.`,
      "*Source: DraftKings betting splits and line, stored by MGP. Market signal, not a pick.*",
    );
  } else {
    lines.push("", "*Source: DraftKings line, stored by MGP. Market signal, not a pick.*");
  }
  return lines.join("\n");
}

/** NCAAF and NFL games in the window from the games tables; a failed read gives none (splits still answer). */
async function upcomingLineGames(now: Date): Promise<SplitsGame[]> {
  const from = new Date(now.getTime() - 6 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 8 * 24 * 3600_000).toISOString();
  const read = async (sport: "NCAAF" | "NFL"): Promise<SplitsGame[]> => {
    try {
      const { data, error } =
        sport === "NFL"
          ? await supabase
              .from("games")
              .select("id, date, status, home_team_name, visitor_team_name, postseason, week")
              .eq("league", "NFL")
              .gte("date", from)
              .lte("date", to)
              .order("date", { ascending: true })
              .limit(400)
          : await supabase
              .from("ncaaf_games")
              .select("id, date, status, home_team_name, visitor_team_name, time_tbd, venue, home_team_rank, visitor_team_rank")
              .gte("date", from)
              .lte("date", to)
              .order("date", { ascending: true })
              .limit(400);
      if (error) throw error;
      return lineOnlyGames(sport, (data ?? []) as unknown as LineGameRow[]);
    } catch (err) {
      console.warn(`[storedSplits] ${sport} games read failed`, err);
      return [];
    }
  };
  return (await Promise.all([read("NCAAF"), read("NFL")])).flat();
}

/**
 * A formatted answer from stored DraftKings data: the split and line for a
 * game DK posted a split for, the line alone for any other NCAAF or NFL game
 * in the window. Null when no such game matches, or nothing is stored for it.
 * A school beside a known player's name ("sharp money jalen hurts alabama")
 * names no game without a game cue (the players' names are read once per
 * session). The live chat's league, guards, intent and history rules apply
 * (resolveLeague, storedSplitsGame): no answer for a history or futures
 * question or a nickname two leagues share, a postseason event ("Super Bowl
 * public betting") only when its game is scheduled, and a question with no
 * betting word gets one only for a game between the two teams it names.
 */
export async function answerFromStoredSplits(query: string, now: Date = new Date()): Promise<string | null> {
  if (gameIntent(query, cachedPlayerNames(now), now) === "no") return null;
  const since = new Date(now.getTime() - 6 * 3600_000).toISOString();
  const [rows, lineGames, players, league] = await Promise.all([
    selectAll<StoredSplitRow>(
      () =>
        supabase
          .from("betting_splits")
          .select("sport, game_id, source_matchup, away_team, home_team, event_start, market, side, bets_pct, handle_pct, captured_at, source_as_of")
          .eq("source", "draftkings")
          .gte("event_start", since)
          .order("id"),
      { label: "betting_splits for chat" },
    ),
    upcomingLineGames(now),
    loadPlayerNames(supabase, now),
    resolveLeague(supabase, query, now),
  ]);
  const candidates = candidateGames(groupSplitGames(rows), lineGames);
  const game = storedSplitsGame(query, candidates, now, players, league);
  if (!game) return null;
  const [{ data: lineRows, error }, { data: oddsRows }] = await Promise.all([
    supabase
      .from("betting_lines")
      .select("sport, game_id, market, side, line, price, open_line, open_price, captured_at")
      .eq("source", "draftkings")
      .eq("sport", game.sport)
      .eq("game_id", game.gameId),
    // The game's odds-table row, for the same freshness rule the cards use;
    // a failed read just leaves the stored line (NFL ids are the int games.id)
    supabase
      .from((game.sport === "NFL" ? "odds" : "ncaaf_odds") as "ncaaf_odds")
      .select("spread_value, spread_odds, moneyline_home, moneyline_away, total_value, total_over_odds, total_under_odds, updated_at")
      .eq("game_id", game.gameId)
      .ilike("sportsbook", "%draftkings%")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  if (error) throw error;
  const lines = (lineRows ?? []) as StoredLineRow[];
  const odds = ((oddsRows ?? [])[0] as OddsRowLike | undefined) ?? null;
  // Nothing stored for the game: let the handler search instead
  if (!game.rows.length && !lines.length && !odds) return null;
  return formatSplitsAnswer({ ...game, lines, odds }, now);
}
