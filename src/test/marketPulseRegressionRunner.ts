// Runs the Market Pulse matcher regression tables (fixtures/market-pulse-phrasings.json,
// and the postseason slates in fixtures/market-pulse-postseason.json): each
// phrasing through the chat's DraftKings block (marketPulseBlock, with
// leagueFor's league, or resolveLeague's over the fixture's tables) and the
// app's stored-splits pick (storedSplitsGame), over the fixture's slate and
// players. Shared by the tests and the scripts that wrote the fixtures, so
// both read the tables the same way.
import { leagueFor, resolveLeague } from "../../supabase/functions/_shared/league-detect";
import { clearPlayerNames, indexPlayerNames } from "../../supabase/functions/_shared/player-names";
import {
  candidateGames,
  groupSplitGames,
  lineOnlyGames,
  marketPulseBlock,
  storedSplitsGame,
  type LineGameRow,
  type SplitsGame,
  type StoredSplitRow,
} from "../../supabase/functions/_shared/pulse-chat";

export interface FixtureGame {
  /** NCAAB rows only settle a college question's league (resolveLeague reads them); they are never a block's game */
  sport: "NCAAF" | "NFL" | "NCAAB";
  id: string;
  start: string;
  away: string;
  home: string;
  /** DraftKings' matchup label for a game with a split ("Rice @ Fresno St."), null for a line-only game */
  dk: string | null;
  /** ncaaf_games: the stadium ESPN lists (a New Year's Six bowl's), and the teams' ranks */
  venue?: string | null;
  homeRank?: number | null;
  awayRank?: number | null;
  /** games (NFL): the postseason flag and week */
  postseason?: boolean;
  week?: number | null;
}

export interface PhrasingResult {
  q: string;
  /** The block's game heads ("Away @ Home (NCAAF, Sat 3:30 PM ET)"), or its ambiguity hint, or none */
  chat: string[];
  /** The app's stored-splits pick ("Away @ Home"), or null */
  app: string | null;
}

export interface RegressionFixture {
  now: string;
  note: string;
  games: FixtureGame[];
  players: string[];
  phrasings: PhrasingResult[];
}

const row = (g: FixtureGame): LineGameRow => ({
  id: g.id,
  date: g.start,
  status: "Scheduled",
  home_team_name: g.home,
  visitor_team_name: g.away,
  time_tbd: false,
  ...(g.sport === "NCAAF"
    ? { venue: g.venue ?? null, home_team_rank: g.homeRank ?? null, visitor_team_rank: g.awayRank ?? null }
    : { postseason: g.postseason ?? false, week: g.week ?? null }),
});

function splitRow(g: FixtureGame, now: string): StoredSplitRow {
  return {
    sport: g.sport,
    game_id: g.id,
    source_matchup: g.dk ?? "",
    away_team: g.away,
    home_team: g.home,
    event_start: g.start,
    market: "spread",
    side: "away",
    bets_pct: 50,
    handle_pct: 50,
    captured_at: now,
    source_as_of: now,
  };
}

/** The slate as the app's matcher sees it: split games with DK's labels (and their rows' events), then the line-only ones */
export function fixtureSlate(fx: RegressionFixture): SplitsGame[] {
  return candidateGames(groupSplitGames(fx.games.filter((g) => g.dk).map((g) => splitRow(g, fx.now))), [
    ...lineOnlyGames("NCAAF", fx.games.filter((g) => g.sport === "NCAAF").map(row)),
    ...lineOnlyGames("NFL", fx.games.filter((g) => g.sport === "NFL").map(row)),
  ]);
}

/** A client serving the fixture as the tables marketPulseBlock reads */
function fixtureClient(fx: RegressionFixture) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    betting_splits: fx.games.filter((g) => g.dk).map((g) => ({ ...splitRow(g, fx.now), source: "draftkings" })) as never,
    ncaaf_games: fx.games.filter((g) => g.sport === "NCAAF").map(row) as never,
    ncaab_games: fx.games.filter((g) => g.sport === "NCAAB").map(row) as never,
    games: fx.games.filter((g) => g.sport === "NFL").map((g) => ({ ...row(g), league: "NFL" })) as never,
    players: fx.players.map((name) => ({ name, sport: "NFL" })),
  };
  return {
    from(table: string) {
      let range: [number, number] | null = null;
      const special: Record<string, unknown> = {};
      const q: unknown = new Proxy(special, { get: (t, p) => (p in t ? t[p as string] : () => q) });
      special.range = (from: number, to: number) => {
        range = [from, to];
        return q;
      };
      special.then = (resolve: (v: unknown) => unknown) => {
        const rows = tables[table] ?? [];
        return Promise.resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null }).then(resolve);
      };
      return q;
    },
  };
}

/** Each phrasing's block and app pick; `resolveLeagues`: the league as resolveLeague reads it from the fixture's tables */
export async function runPhrasings(fx: RegressionFixture, questions: string[], opts: { resolveLeagues?: boolean } = {}): Promise<PhrasingResult[]> {
  const now = new Date(fx.now);
  const slate = fixtureSlate(fx);
  const players = indexPlayerNames(fx.players);
  const client = fixtureClient(fx);
  clearPlayerNames();
  const out: PhrasingResult[] = [];
  for (const q of questions) {
    const league = opts.resolveLeagues ? await resolveLeague(client, q, now) : leagueFor(q, now);
    const lines = (await marketPulseBlock(client, q, "general", league, now)).split("\n");
    const heads = lines.filter((l) => l.includes(" @ ")).map((l) => l.split(" · ")[0]);
    const hints = lines.filter((l) => l.startsWith("Ambiguous "));
    const app = storedSplitsGame(q, slate, now, players, league);
    out.push({ q, chat: heads.length ? heads : hints, app: app ? `${app.away} @ ${app.home}` : null });
  }
  return out;
}
