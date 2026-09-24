// sync-betting-splits: DraftKings' line and public betting splits for NCAAF
// and NFL, feeding Game Insights > Market Pulse, the slate cards and the
// chat's public-betting answers.
//
// Two sources, one job each:
//   - LINES (betting_lines): DraftKings' current and opening number for EVERY
//     game in the next LINES_WINDOW_DAYS, read from ESPN's core odds API
//     (keyless, relays DK, both spread prices). This is the one line every
//     surface shows. NCAAF rows are ESPN events (external_id); the NFL games
//     table is BDL-keyed, so its games are paired with ESPN's scoreboard on
//     both teams + kickoff, the way sync-nfl-games does it.
//   - SPLITS (betting_splits): DK's % of bets and % of money per side from
//     the DK Network splits page (server-rendered HTML, no key; robots.txt
//     only disallows /search-results). Its odds column lags DraftKings, so it
//     supplies percentages only; the rows keep the page's number for audit
//     and DK's opening number from the lines step.
//
// Splits, per sport and run:
//   1. Fetch the n7days window page by page (following "Next"; a page past
//      the end repeats the last one, so we also stop when nothing new shows
//      up), then the today and tomorrow windows. DK caps a window at 50
//      events, and the day windows reach the Saturday games a capped n7days
//      list can leave out. Every page is fetched past DK's CDN cache, which
//      served hours-old copies as current (./freshness.ts): a per-run
//      cache-busting parameter, no-cache headers, x-cache and age logged per
//      page, a cached answer retried, a page still stale failing the sport's
//      splits, and a page unchanged for hours while others changed flagged
//      (betting_splits_pages keeps each page's last hash). Each row carries
//      DK's page freshness in source_as_of, which the app's "split X ago"
//      label reads.
//   2. Match every DK matchup onto our games (both teams + a kickoff window).
//      Unmatched matchups are logged, counted and returned; the run reports
//      "partial" when any remain.
//   3. Upsert the latest row per side, prune sides DK stopped listing for the
//      games seen this run, and append history only for sides whose numbers
//      changed.
// Games already under way are skipped by both steps, so the last pre-kickoff
// capture stays as the closing read. A splits markup change
// (SplitsMarkupError) fails the run loudly and writes no splits for that
// sport. Parse lives in ./parse.ts, name matching in ./match.ts, line and
// row shaping in ./lines.ts and ./rows.ts: all pure and vitest-covered.
//
// POST body (all optional): { "sports": ["NCAAF"], "dryRun": true }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { selectAll } from "../_shared/select-all.ts";
import { espnFetch } from "../_shared/espn-fetch.ts";
import { fetchEspnOddsBatch, type EspnOddsLeague } from "../_shared/espn-odds.ts";
import { kickoffToUtc, parseDkSplitsPage, type DkSplitsEvent } from "./parse.ts";
import {
  assessPages,
  fetchSplitsPage,
  pageHash,
  pageKey,
  type PageObservation,
  type PageRecord,
} from "./freshness.ts";
import { matchEventsToGames } from "./match.ts";
import {
  eventsInWindow,
  linesFromQuotes,
  parseEspnScoreboard,
  resolveEspnEvents,
  upcomingGames,
  type EspnScheduleEvent,
  type LinesGame,
} from "./lines.ts";
import { buildSplitRows, splitChanged, type DkEventQuote, type LineRow, type SplitRow } from "./rows.ts";

type SyncSport = "NCAAF" | "NFL";

interface SportConfig {
  sport: SyncSport;
  /** DK Network event group (the splits page's tb_eg) */
  eventGroup: number;
  gamesTable: "ncaaf_games" | "games";
  gameColumns: string;
  /** The shared `games` table also holds NBA rows */
  league: string | null;
  espnLeague: EspnOddsLeague;
  /** How our games map to ESPN events */
  espnIds: { idPrefix: string } | { scoreboard: string };
  /** UTC month 0-11 */
  inSeason: (month: number) => boolean;
}

const SPORTS: SportConfig[] = [
  {
    sport: "NCAAF",
    eventGroup: 87637,
    gamesTable: "ncaaf_games",
    gameColumns: "id, external_id, date, time_tbd, home_team_name, visitor_team_name",
    league: null,
    espnLeague: "college-football",
    espnIds: { idPrefix: "espn_ncaaf_" },
    inSeason: (m) => m >= 7 || m === 0, // Aug through the January title game
  },
  {
    sport: "NFL",
    eventGroup: 88808,
    gamesTable: "games",
    gameColumns: "id, external_id, date, home_team_name, visitor_team_name",
    league: "NFL",
    espnLeague: "nfl",
    espnIds: { scoreboard: "football/nfl" },
    inSeason: (m) => m >= 7 || m <= 1, // Aug through the Super Bowl
  },
];

const WINDOWS = ["n7days", "today", "tomorrow"] as const;
const MAX_PAGES = 15;
const PAGE_DELAY_MS = 250;
const DK_WINDOW_CAP = 50;
const LINES_WINDOW_DAYS = 7;
const USER_AGENT = "Mozilla/5.0 (compatible; MGPAnalytics/1.0)";
const DAY_MS = 24 * 3600_000;

const splitsUrl = (eventGroup: number, window: string, page: number) =>
  `https://dknetwork.draftkings.com/draftkings-sportsbook-betting-splits/?tb_eg=${eventGroup}&tb_edate=${window}&tb_emt=0&tb_page=${page}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

interface WindowResult {
  /** One per page that listed events of its own (the repeat past the last page is not kept) */
  pages: PageObservation[];
  /** Requests made, the repeat included */
  fetched: number;
  skipped: string[];
  hitPageCap: boolean;
}

async function fetchWindow(sport: SyncSport, eventGroup: number, window: string, runBuster: string): Promise<WindowResult> {
  const seen = new Set<string>();
  const skipped = new Set<string>();
  const pages: PageObservation[] = [];
  let fetched = 0;
  let hitPageCap = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    // Uncached, or StaleSplitsError after the retries (freshness.ts)
    const got = await fetchSplitsPage(splitsUrl(eventGroup, window, page), runBuster, {
      userAgent: USER_AGENT,
      label: `${sport} DK splits ${window} p${page}`,
    });
    const parsed = parseDkSplitsPage(got.html);
    fetched++;
    const skippedBefore = skipped.size;
    parsed.skipped.forEach((s) => skipped.add(s));
    const fresh = parsed.events.filter((e) => !seen.has(e.eventId));
    fresh.forEach((e) => seen.add(e.eventId));
    // Past the last page DK repeats it: nothing new means we are done
    const nothingNew = fresh.length === 0 && skipped.size === skippedBefore;
    if (page === 1 || !nothingNew) {
      pages.push({
        window,
        page,
        hash: pageHash(parsed.events),
        xCache: got.xCache,
        ageSeconds: got.ageSeconds,
        attempts: got.attempts,
        asOf: got.asOf,
        events: parsed.events,
      });
    }
    if (!parsed.hasNext || nothingNew) break;
    if (page === MAX_PAGES) hitPageCap = true;
    await sleep(PAGE_DELAY_MS);
  }
  return { pages, fetched, skipped: [...skipped], hitPageCap };
}

/** ESPN scoreboard events for each day of the window (deduped: the CDN mirror serves football by week). */
async function fetchScoreboard(path: string, from: Date, days: number): Promise<EspnScheduleEvent[]> {
  const byId = new Map<string, EspnScheduleEvent>();
  for (let i = 0; i <= days; i++) {
    const day = yyyymmdd(new Date(from.getTime() + i * DAY_MS));
    try {
      const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}&limit=100`);
      if (!res.ok) continue;
      for (const ev of parseEspnScoreboard(await res.json())) byId.set(ev.eventId, ev);
    } catch (err) {
      console.error(`[sync-betting-splits] ESPN scoreboard ${path} ${day}:`, err);
    }
  }
  return [...byId.values()];
}

interface LinesSummary {
  games: number;
  espnEvents: number;
  withDkLine: number;
  rows: number;
  pruned: number;
  unmatchedEspnEvents: string[];
  sample?: LineRow[];
}

async function syncLines(
  supabase: any,
  cfg: SportConfig,
  capturedAt: string,
  dryRun: boolean,
): Promise<{ summary: LinesSummary; quotesByGame: Map<string, DkEventQuote> }> {
  const now = new Date(capturedAt);
  const from = new Date(now.getTime() - DAY_MS).toISOString(); // TBD placeholders sit at midnight Eastern
  // One day past the scoreboard's last date, so a late kickoff on that date still pairs
  const until = new Date(now.getTime() + (LINES_WINDOW_DAYS + 1) * DAY_MS).toISOString();
  const all = await selectAll<LinesGame>(
    () => {
      let q = supabase.from(cfg.gamesTable).select(cfg.gameColumns).gte("date", from).lte("date", until);
      if (cfg.league) q = q.eq("league", cfg.league);
      return q.order("id");
    },
    { label: `${cfg.gamesTable} lines window` },
  );
  const games = upcomingGames(all, now);

  const events =
    "scoreboard" in cfg.espnIds
      ? eventsInWindow(await fetchScoreboard(cfg.espnIds.scoreboard, now, LINES_WINDOW_DAYS), now, new Date(until))
      : [];
  const { byGame, unmatchedEspnEvents } = (() => {
    const r = resolveEspnEvents(cfg.sport, games, "idPrefix" in cfg.espnIds ? cfg.espnIds : { events });
    return { byGame: r.byGame, unmatchedEspnEvents: r.unmatchedEvents };
  })();

  const eventIds = [...new Set([...byGame.values()].map((r) => r.eventId))];
  const quotes = (await fetchEspnOddsBatch(cfg.espnLeague, eventIds)) as Map<string, DkEventQuote & { sportsbook: string }>;
  const { rows, quotesByGame } = linesFromQuotes(cfg.sport, byGame, quotes, capturedAt);

  const summary: LinesSummary = {
    games: games.length,
    espnEvents: byGame.size,
    withDkLine: quotesByGame.size,
    rows: rows.length,
    pruned: 0,
    unmatchedEspnEvents,
  };
  if (dryRun) {
    summary.sample = rows.slice(0, 6);
    return { summary, quotesByGame };
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("betting_lines")
      .upsert(rows.slice(i, i + 500), { onConflict: "source,sport,game_id,market,side" });
    if (error) throw new Error(`${cfg.sport} betting_lines upsert failed: ${error.message}`);
  }
  // Sides DK took down for games it still quotes (a pulled total). Games ESPN
  // returned nothing for this run keep their last line; its age shows.
  const quoted = [...quotesByGame.keys()];
  for (let i = 0; i < quoted.length; i += 200) {
    const { error, count } = await supabase
      .from("betting_lines")
      .delete({ count: "exact" })
      .eq("source", "draftkings")
      .eq("sport", cfg.sport)
      .in("game_id", quoted.slice(i, i + 200))
      .lt("captured_at", capturedAt);
    if (error) console.error(`[sync-betting-splits] ${cfg.sport} lines prune failed: ${error.message}`);
    summary.pruned += count ?? 0;
  }
  return { summary, quotesByGame };
}

interface SplitsSummary {
  dkEvents: number;
  alreadyStarted: number;
  matched: number;
  unmatched: Array<{ matchup: string; kickoff: string; reason: string }>;
  windows: Record<string, { events: number; pages: number; capped: boolean }>;
  skippedBlocks: string[];
  rows: number;
  historyRows: number;
  pruned: number;
  withDkOpen: number;
  pageLagging: string[];
  /** Every page kept this run, with DK's cache verdict (freshness.ts) */
  pages: Array<{ window: string; page: number; xCache: string | null; ageSeconds: number | null; attempts: number; events: number }>;
  /** Pages whose numbers have not changed for hours while other pages did */
  staleCaptures: Array<{ window: string; page: number; unchangedSince: string }>;
  pagesChanged: number;
  /** betting_splits_pages read/write problems (the stale-capture check could not run) */
  pageStateErrors: string[];
  sample?: SplitRow[];
}

async function syncSplits(
  supabase: any,
  cfg: SportConfig,
  capturedAt: string,
  dryRun: boolean,
  quotesByGame: Map<string, DkEventQuote>,
  runBuster: string,
): Promise<SplitsSummary> {
  const now = new Date(capturedAt);
  const summary: SplitsSummary = {
    dkEvents: 0,
    alreadyStarted: 0,
    matched: 0,
    unmatched: [],
    windows: {},
    skippedBlocks: [],
    rows: 0,
    historyRows: 0,
    pruned: 0,
    withDkOpen: 0,
    pageLagging: [],
    pages: [],
    staleCaptures: [],
    pagesChanged: 0,
    pageStateErrors: [],
  };

  // 1) Every DK page across the windows, fetched past DK's cache
  const observations: PageObservation[] = [];
  for (const window of WINDOWS) {
    const w = await fetchWindow(cfg.sport, cfg.eventGroup, window, runBuster);
    const events = new Set(w.pages.flatMap((p) => p.events.map((e) => e.eventId))).size;
    summary.windows[window] = { events, pages: w.fetched, capped: events >= DK_WINDOW_CAP };
    summary.skippedBlocks.push(...w.skipped.filter((s) => !summary.skippedBlocks.includes(s)));
    if (w.hitPageCap) console.warn(`[sync-betting-splits] ${cfg.sport} ${window}: stopped at the ${MAX_PAGES}-page cap`);
    observations.push(...w.pages);
  }
  summary.pages = observations.map((p) => ({
    window: p.window,
    page: p.page,
    xCache: p.xCache,
    ageSeconds: p.ageSeconds,
    attempts: p.attempts,
    events: p.events.length,
  }));

  // 2) Stale-capture check against the pages the previous runs saw
  let previous: PageRecord[] = [];
  const { data: prevPages, error: prevError } = await supabase
    .from("betting_splits_pages")
    .select("source, sport, window_key, page, content_hash, hash_since, fetched_at, x_cache, age_seconds, events")
    .eq("source", "draftkings")
    .eq("sport", cfg.sport);
  if (prevError) summary.pageStateErrors.push(`read: ${prevError.message}`);
  else previous = (prevPages ?? []) as PageRecord[];
  const assessment = assessPages(cfg.sport, observations, previous, now);
  summary.pagesChanged = assessment.changed;
  summary.staleCaptures = assessment.flagged;
  for (const f of assessment.flagged) {
    console.warn(
      `[sync-betting-splits] ${cfg.sport} STALE CAPTURE ${f.window} p${f.page}: numbers unchanged since ${f.unchangedSince} while other pages changed`,
    );
  }
  if (!dryRun && !prevError) {
    const { error } = await supabase
      .from("betting_splits_pages")
      .upsert(assessment.records, { onConflict: "source,sport,window_key,page" });
    if (error) {
      summary.pageStateErrors.push(`write: ${error.message}`);
    } else {
      // Pages DK no longer lists (the list shortens as games kick off)
      const { error: pruneError } = await supabase
        .from("betting_splits_pages")
        .delete()
        .eq("source", "draftkings")
        .eq("sport", cfg.sport)
        .lt("fetched_at", now.toISOString());
      if (pruneError) summary.pageStateErrors.push(`prune: ${pruneError.message}`);
    }
  }
  for (const e of summary.pageStateErrors) console.error(`[sync-betting-splits] ${cfg.sport} betting_splits_pages ${e}`);

  // Events deduped by DK event id: first seen wins, except that a copy from a
  // page flagged stale gives way to one from a page that is not
  const flaggedPages = new Set(assessment.flagged.map((f) => pageKey(f.window, f.page)));
  const byId = new Map<string, DkSplitsEvent>();
  const asOfById = new Map<string, { asOf: string; stale: boolean }>();
  for (const p of observations) {
    const key = pageKey(p.window, p.page);
    const stale = flaggedPages.has(key);
    const asOf = assessment.asOfByPage.get(key) ?? p.asOf;
    for (const e of p.events) {
      const prev = asOfById.get(e.eventId);
      if (prev && !(prev.stale && !stale)) continue;
      byId.set(e.eventId, e);
      asOfById.set(e.eventId, { asOf, stale });
    }
  }
  summary.dkEvents = byId.size;
  if (summary.skippedBlocks.length > 0 && byId.size === 0) {
    throw new Error(`${cfg.sport}: every DK event block failed to parse: ${summary.skippedBlocks.slice(0, 3).join("; ")}`);
  }

  const upcoming = [...byId.values()]
    .map((e) => ({ ...e, kickoffUtc: kickoffToUtc(e.kickoff, now) }))
    .filter((e) => {
      const started = e.kickoffUtc.getTime() <= now.getTime();
      if (started) summary.alreadyStarted++;
      return !started;
    });
  if (upcoming.length === 0) return summary;

  // 3) Our games around DK's kickoff range
  const times = upcoming.map((e) => e.kickoffUtc.getTime());
  const from = new Date(Math.min(...times) - 2 * DAY_MS).toISOString();
  const to = new Date(Math.max(...times) + 2 * DAY_MS).toISOString();
  const games = await selectAll<LinesGame>(
    () => {
      let q = supabase.from(cfg.gamesTable).select(cfg.gameColumns).gte("date", from).lte("date", to);
      if (cfg.league) q = q.eq("league", cfg.league);
      return q.order("id");
    },
    { label: `${cfg.gamesTable} ${from}..${to}` },
  );

  const { matched, unmatched } = matchEventsToGames(cfg.sport, upcoming, games);
  summary.matched = matched.length;
  summary.unmatched = unmatched.map((u) => ({
    matchup: `${u.event.away} @ ${u.event.home}`,
    kickoff: u.event.kickoffLabel,
    reason: u.reason,
  }));
  for (const u of summary.unmatched) {
    console.warn(`[sync-betting-splits] ${cfg.sport} UNMATCHED ${u.matchup} (${u.kickoff}): ${u.reason}`);
  }
  if (matched.length === 0) return summary;

  const gameIds = matched.map((m) => String(m.game.id));

  // Latest stored rows: history diff + open carry-forward
  const existing = await selectAll<{
    game_id: string;
    market: string;
    side: string;
    line: number | string | null;
    price: number | null;
    bets_pct: number;
    handle_pct: number;
    open_line: number | string | null;
    open_price: number | null;
  }>(
    () =>
      supabase
        .from("betting_splits")
        .select("game_id, market, side, line, price, bets_pct, handle_pct, open_line, open_price")
        .eq("source", "draftkings")
        .eq("sport", cfg.sport)
        .in("game_id", gameIds)
        .order("id"),
    { label: "betting_splits existing" },
  );
  const keyOf = (r: { game_id: string; market: string; side: string }) => `${r.game_id}|${r.market}|${r.side}`;
  const prevByKey = new Map(existing.map((r) => [keyOf(r), r]));

  // 4) Rows. DK's opening number comes from the lines step's ESPN quote.
  const rows: SplitRow[] = [];
  for (const m of matched) {
    const gameId = String(m.game.id);
    const quote = quotesByGame.get(gameId) ?? null;
    if (quote) summary.withDkOpen++;
    const built = buildSplitRows(cfg.sport, m.event, m, quote, capturedAt, asOfById.get(m.event.eventId)?.asOf ?? capturedAt);
    for (const r of built) {
      if (r.open_line === null && r.open_price === null) {
        const prev = prevByKey.get(keyOf(r));
        if (prev) {
          r.open_line = prev.open_line === null ? null : Number(prev.open_line);
          r.open_price = prev.open_price;
        }
      }
    }
    // Monitoring only: the splits page's own number trails DraftKings'
    const pageHome = built.find((r) => r.market === "spread" && r.side === "home")?.line;
    if (quote?.spreadHome != null && pageHome != null && Math.abs(quote.spreadHome - pageHome) >= 0.5) {
      summary.pageLagging.push(`${m.event.away} @ ${m.event.home}: page ${pageHome} vs DK ${quote.spreadHome}`);
    }
    rows.push(...built);
  }
  const history = rows.filter((r) => splitChanged(prevByKey.get(keyOf(r)), r));
  summary.rows = rows.length;
  summary.historyRows = history.length;

  if (dryRun) {
    summary.sample = rows.slice(0, 6);
    return summary;
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("betting_splits")
      .upsert(rows.slice(i, i + 500), { onConflict: "source,sport,game_id,market,side" });
    if (error) throw new Error(`${cfg.sport} betting_splits upsert failed: ${error.message}`);
  }

  // Sides DK stopped listing for games seen this run (e.g. a total pulled)
  const { error: pruneError, count: pruned } = await supabase
    .from("betting_splits")
    .delete({ count: "exact" })
    .eq("source", "draftkings")
    .eq("sport", cfg.sport)
    .in("game_id", gameIds)
    .lt("captured_at", capturedAt);
  if (pruneError) console.error(`[sync-betting-splits] ${cfg.sport} prune failed: ${pruneError.message}`);
  summary.pruned = pruned ?? 0;

  if (history.length > 0) {
    const historyRows = history.map((r) => ({
      sport: r.sport,
      game_id: r.game_id,
      source: r.source,
      source_event_id: r.source_event_id,
      market: r.market,
      side: r.side,
      line: r.line,
      price: r.price,
      bets_pct: r.bets_pct,
      handle_pct: r.handle_pct,
      captured_at: r.captured_at,
      source_as_of: r.source_as_of,
    }));
    for (let i = 0; i < historyRows.length; i += 500) {
      const { error } = await supabase.from("betting_splits_history").insert(historyRows.slice(i, i + 500));
      if (error) throw new Error(`${cfg.sport} betting_splits_history insert failed: ${error.message}`);
    }
  }
  return summary;
}

interface SportResult {
  lines?: LinesSummary;
  splits?: SplitsSummary;
  errors: string[];
}

async function syncSport(
  supabase: any,
  cfg: SportConfig,
  capturedAt: string,
  dryRun: boolean,
  runBuster: string,
): Promise<SportResult> {
  const result: SportResult = { errors: [] };
  // Lines first: every surface's number, and the splits step's DK opens
  let quotesByGame = new Map<string, DkEventQuote>();
  try {
    const lines = await syncLines(supabase, cfg, capturedAt, dryRun);
    result.lines = lines.summary;
    quotesByGame = lines.quotesByGame;
  } catch (err) {
    result.errors.push(`lines: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    result.splits = await syncSplits(supabase, cfg, capturedAt, dryRun, quotesByGame, runBuster);
  } catch (err) {
    result.errors.push(`splits: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let syncLogId: string | null = null;
  const syncStartTime = Date.now();
  let supabase: any;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret (dispatch-syncs, including the Admin panel's Run
    // button) or an admin user's JWT, like sync-odds-snapshot and dispatch-syncs
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log("[sync-betting-splits] Authenticated via cron secret");
    } else {
      if (!bearerToken) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized - no token provided" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader! } },
      });
      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized - invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Users can hold several roles; check the set rather than .single()
      const { data: roleRows, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (roleError || !(roleRows ?? []).some((r: { role: string }) => r.role === "admin")) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden - admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[sync-betting-splits] Admin user ${user.id} authenticated`);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const requested: string[] | null = Array.isArray(body?.sports) ? body.sports : null;
    const month = new Date().getUTCMonth();
    const targets = SPORTS.filter((s) => (requested ? requested.includes(s.sport) : s.inSeason(month)));

    if (!dryRun) {
      syncLogId = await startSyncLog(supabase, {
        sport: "ALL",
        data_type: "betting_splits",
        function_name: "sync-betting-splits",
        trigger_source: detectTriggerSource(req),
        api_source: "dk_network+espn",
      });
    }

    const capturedAt = new Date().toISOString();
    // Unique per run: DK's CDN caches each distinct URL (freshness.ts)
    const runBuster = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const perSport: Record<string, SportResult> = {};
    for (const cfg of targets) {
      perSport[cfg.sport] = await syncSport(supabase, cfg, capturedAt, dryRun, runBuster);
      for (const e of perSport[cfg.sport].errors) console.error(`[sync-betting-splits] ${cfg.sport} ${e}`);
    }

    const results = Object.entries(perSport);
    const failures = results.flatMap(([sport, r]) => r.errors.map((e) => `${sport} ${e}`));
    const lineRows = results.reduce((n, [, r]) => n + (r.lines?.rows ?? 0), 0);
    const splitRows = results.reduce((n, [, r]) => n + (r.splits?.rows ?? 0), 0);
    const unmatchedCount = results.reduce((n, [, r]) => n + (r.splits?.unmatched.length ?? 0), 0);
    const skippedCount = results.reduce((n, [, r]) => n + (r.splits?.skippedBlocks.length ?? 0), 0);
    const staleCaptures = results.flatMap(([sport, r]) =>
      (r.splits?.staleCaptures ?? []).map((f) => `${sport} ${f.window} p${f.page} unchanged since ${f.unchangedSince}`),
    );
    const pageStateErrors = results.flatMap(([sport, r]) => (r.splits?.pageStateErrors ?? []).map((e) => `${sport} pages ${e}`));
    const status: "success" | "partial" | "failed" =
      failures.length > 0
        ? "failed"
        : unmatchedCount > 0 || skippedCount > 0 || staleCaptures.length > 0 || pageStateErrors.length > 0
          ? "partial"
          : "success";
    const warnings = [
      ...(unmatchedCount ? [`${unmatchedCount} DK matchups unmatched`] : []),
      ...(staleCaptures.length ? [`stale DK splits capture (other pages changed): ${staleCaptures.join(", ")}`] : []),
      ...pageStateErrors,
    ];

    const message =
      targets.length === 0
        ? "No sport in season; nothing to sync"
        : results
            .map(([sport, r]) => {
              const parts: string[] = [];
              if (r.lines) parts.push(`lines for ${r.lines.withDkLine}/${r.lines.games} games`);
              if (r.splits) parts.push(`splits ${r.splits.matched}/${r.splits.dkEvents - r.splits.alreadyStarted} DK games matched`);
              if (r.errors.length) parts.push(`FAILED ${r.errors.join("; ")}`);
              return `${sport}: ${parts.join(", ")}`;
            })
            .join("; ");

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status,
      records_added: lineRows + splitRows,
      api_requests_used: results.reduce(
        (n, [, r]) =>
          n + (r.lines?.espnEvents ?? 0) + Object.values(r.splits?.windows ?? {}).reduce((p, w) => p + w.pages, 0),
        0,
      ),
      error_message: failures.length ? [...failures, ...warnings].join("; ") : warnings.length ? warnings.join("; ") : undefined,
      details: { captured_at: capturedAt, per_sport: perSport },
    });

    return new Response(
      JSON.stringify({
        success: failures.length === 0,
        status,
        dryRun,
        capturedAt,
        count: lineRows + splitRows,
        message,
        sports: perSport,
      }),
      { status: failures.length === 0 ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-betting-splits] Error:", message);
    await completeSyncLog(supabase, syncLogId, syncStartTime, { status: "failed", error_message: message });
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
