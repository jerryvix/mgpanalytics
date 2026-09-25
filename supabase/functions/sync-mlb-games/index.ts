import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { fetchEspnOddsBatch } from "../_shared/espn-odds.ts";
import { espnFetch } from "../_shared/espn-fetch.ts";
import { selectAll } from "../_shared/select-all.ts";
import {
  addDays,
  compactDate,
  etDate,
  expectedStart,
  matchupKey,
  parseSchedule,
  scheduleUrl,
  statsapiJson,
  type MlbScheduleGame,
} from "../_shared/mlb-statsapi.ts";
import {
  COUNTED_GAME_TYPES,
  coreEventDate,
  coreLookupIds,
  espnEventId,
  freshCoreUrl,
  groupByMatchup,
  indexMlbSchedule,
  isStorableMlbGame,
  listingsToStore,
  mlbLists,
  pairGames,
  planListing,
  planStranded,
  strandedRows,
  unconfirmedListings,
  type CoreEvent,
  type RowFix,
} from "./reconcile.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Scoreboard days (Eastern) fetched every run: two back to finalize scores,
// four ahead so the schedule, probables and posted odds populate early.
const DAYS_BACK = 2;
const DAYS_AHEAD = 4;
// Self-healing backfill: any earlier day in this window that has no games, or
// still has unfinished ones, is re-fetched. The Aug 19 - Sep 23 2026 outage
// left five weeks of games unwritten or stuck at "scheduled"; the next run
// after a fix repairs them without anyone remembering to run a backfill.
const BACKFILL_LOOKBACK_DAYS = 45;
const BACKFILL_MAX_DAYS = 40;
const MAX_EXPLICIT_DAYS = 60;
const DATE_CONCURRENCY = 4;
// statsapi games we write carry this prefix until ESPN serves the same game,
// at which point the row is adopted (renamed) instead of duplicated.
const MLBAPI_PREFIX = "mlbapi_";
// ESPN's core API has an event's current date and status. It is asked only
// about games the scoreboard mirror and MLB disagree on (normally none), and
// at most this many per run (reconcile.ts).
const CORE_EVENTS = "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events";
const MAX_CORE_LOOKUPS = 12;

interface ESPNGame {
  id: string;
  date: string;
  name?: string;
  status: {
    type: {
      name: string;
      state: string;
      completed: boolean;
    };
  };
  competitions: Array<{
    id: string;
    date: string;
    venue?: { fullName?: string };
    competitors: Array<{
      id: string;
      homeAway: string;
      team: {
        id: string;
        name: string;
        displayName: string;
        abbreviation: string;
      };
      score?: string;
      probables?: Array<{
        athlete?: {
          displayName?: string;
        };
      }>;
    }>;
  }>;
  weather?: {
    displayValue?: string;
    temperature?: number;
  };
}

interface ExistingRow {
  id: string;
  external_id: string | null;
  date: string;
  status: string | null;
  is_final: boolean | null;
  home_team_name: string;
  visitor_team_name: string;
  home_team_id: string | null;
  visitor_team_id: string | null;
}

const UNSETTLED_EXEMPT = /POSTPONED|CANCELED|CANCELLED/i;

function normalizeDay(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function dayRange(start: string, end: string, max: number): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * An event's current date and status from ESPN's core API, past its cache
 * (freshCoreUrl): "missing" when ESPN has no such event, null when it could
 * not be read or gave no readable date.
 */
async function fetchCoreEvent(id: string): Promise<CoreEvent | "missing" | null> {
  try {
    const res = await espnFetch(freshCoreUrl(`${CORE_EVENTS}/${id}`));
    if (res.status === 404) return "missing";
    if (!res.ok) return null;
    const event = await res.json();
    const date = coreEventDate(event);
    if (!date) return null;
    let status: string | null = null;
    const ref = event.competitions?.[0]?.status?.$ref;
    if (typeof ref === "string") {
      // Unread, the status stays null: the date alone still places the game
      const st = await espnFetch(freshCoreUrl(ref)).catch(() => null);
      if (st?.ok) status = (await st.json().catch(() => null))?.type?.name ?? null;
    }
    return { date, status };
  } catch (err) {
    console.error(`ESPN core event ${id} failed:`, err);
    return null;
  }
}

serve(async (req) => {
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

    // Service client for database operations (used by both auth paths)
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron auth bypass: allows dispatch-syncs to call without user JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-mlb-games] Authenticated via cron secret`);
    } else {
      // Authenticate user - require admin role
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = user.id;

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[sync-mlb-games] Admin user ${userId} authenticated, starting MLB games sync via ESPN...`);
    }

    // Optional explicit backfill: { "startDate": "2026-08-19", "endDate": "2026-09-22" }
    const body = await req.json().catch(() => ({})) as { startDate?: string; endDate?: string };

    syncLogId = await startSyncLog(supabase, {
      sport: "MLB",
      data_type: "games",
      function_name: "sync-mlb-games",
      trigger_source: detectTriggerSource(req),
      api_source: "espn",
    });

    const now = new Date();
    const today = etDate(now);
    const forwardDays = dayRange(addDays(today, -DAYS_BACK), addDays(today, DAYS_AHEAD), 30);

    const explicitStart = normalizeDay(body?.startDate);
    const explicitEnd = normalizeDay(body?.endDate) ?? explicitStart;
    const explicitDays = explicitStart && explicitEnd ? dayRange(explicitStart, explicitEnd, MAX_EXPLICIT_DAYS) : [];

    // Existing rows around the backfill window (paginated: 45 days of games is
    // close to the 1,000-row cap and would silently truncate).
    const windowStart = addDays(today, -BACKFILL_LOOKBACK_DAYS - 1);
    const windowEnd = addDays(today, DAYS_AHEAD + 2);
    const existing = await selectAll<ExistingRow>(
      () => supabase.from("mlb_games")
        .select("id, external_id, date, status, is_final, home_team_name, visitor_team_name, home_team_id, visitor_team_id")
        .gte("date", `${windowStart}T00:00:00Z`)
        .lt("date", `${windowEnd}T00:00:00Z`)
        .order("date", { ascending: true })
        .order("id", { ascending: true }),
      { label: "load recent mlb_games" },
    );
    const existingByDay = new Map<string, ExistingRow[]>();
    for (const row of existing) {
      const d = etDate(row.date);
      if (!existingByDay.has(d)) existingByDay.set(d, []);
      existingByDay.get(d)!.push(row);
    }

    // ---- ESPN scoreboards (site.api, then the cdn.espn.com mirror) ----
    const espnByDay = new Map<string, ESPNGame[]>();
    const espnFailed = new Set<string>();
    const fetchEspnDay = async (day: string) => {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${compactDate(day)}`;
        const response = await espnFetch(url);
        if (!response.ok) {
          console.error(`ESPN API error for ${day}: ${response.status}`);
          espnFailed.add(day);
          return;
        }
        const data = await response.json();
        espnByDay.set(day, (data.events || []) as ESPNGame[]);
      } catch (err) {
        console.error(`Error fetching ESPN ${day}:`, err);
        espnFailed.add(day);
      }
    };

    // ---- statsapi: MLB's official schedule for the whole window, one call,
    // alongside the forward ESPN pass. It decides which past days our table
    // is missing games for, supplies the announced probables, finalizes games
    // the ESPN mirror still shows in progress (the CDN can lag the final out),
    // and is the secondary source for any day ESPN cannot serve.
    const lookbackStart = addDays(today, -BACKFILL_LOOKBACK_DAYS);
    const spanStart = [lookbackStart, ...explicitDays].sort()[0];
    const spanEnd = [forwardDays[forwardDays.length - 1], ...explicitDays].sort().slice(-1)[0];
    let mlbGames: MlbScheduleGame[] = [];
    let statsapiError: string | null = null;
    const firstPass = [...new Set([...forwardDays, ...explicitDays])];
    await Promise.all([
      mapPool(firstPass, DATE_CONCURRENCY, fetchEspnDay),
      statsapiJson(scheduleUrl(spanStart, spanEnd, "probablePitcher,weather"))
        .then((json) => { mlbGames = parseSchedule(json); })
        .catch((err) => {
          statsapiError = err instanceof Error ? err.message : String(err);
          console.error(`statsapi schedule ${spanStart}..${spanEnd} failed:`, err);
        }),
    ]);
    // Regular season and postseason only (ESPN's MLB board carries the same).
    const mlbRelevant = mlbGames.filter((g) => COUNTED_GAME_TYPES.has(g.gameType));
    const mlbKeyOf = (g: MlbScheduleGame) => matchupKey(g.scheduleDay, g.away.name, g.home.name);
    const mlbTimeOf = (g: MlbScheduleGame) => Date.parse(g.gameDate) + g.gameNumber;
    // Twins exclude postponed placeholders: they are not games on that day.
    const mlbByKey = groupByMatchup(mlbRelevant.filter((g) => !g.isPlaceholder), mlbKeyOf, mlbTimeOf);
    const mlbCountByDay = new Map<string, number>();
    for (const g of mlbRelevant) {
      if (!g.isPlaceholder) mlbCountByDay.set(g.scheduleDay, (mlbCountByDay.get(g.scheduleDay) ?? 0) + 1);
    }

    // Backfill days: past days where our table holds fewer games than MLB
    // lists, or holds games that never reached a final state. If statsapi is
    // unreachable, fall back to "no rows at all before the latest day we know
    // has games".
    let latestDayWithGames: string | null = null;
    for (const d of [...existingByDay.keys(), ...[...espnByDay.entries()].filter(([, ev]) => ev.length).map(([d]) => d)]) {
      if (!latestDayWithGames || d > latestDayWithGames) latestDayWithGames = d;
    }
    const backfillDays: string[] = [];
    for (let d = addDays(today, -(DAYS_BACK + 1)); d >= lookbackStart; d = addDays(d, -1)) {
      if (firstPass.includes(d)) continue;
      const rows = existingByDay.get(d) ?? [];
      const played = rows.filter((r) => !UNSETTLED_EXEMPT.test(r.status ?? "")).length;
      const short = mlbGames.length
        ? played < (mlbCountByDay.get(d) ?? 0)
        : rows.length === 0 && !!latestDayWithGames && d < latestDayWithGames;
      const unsettled = rows.some((r) => !r.is_final && !UNSETTLED_EXEMPT.test(r.status ?? ""));
      if (short || unsettled) backfillDays.push(d);
      if (backfillDays.length >= BACKFILL_MAX_DAYS) break;
    }
    if (backfillDays.length) {
      console.log(`Backfilling ${backfillDays.length} MLB days: ${backfillDays[backfillDays.length - 1]}..${backfillDays[0]}`);
      await mapPool(backfillDays, DATE_CONCURRENCY, fetchEspnDay);
    }

    const allDays = [...firstPass, ...backfillDays];

    const failedDays = allDays.filter((d) => espnFailed.has(d));
    const okDays = allDays.filter((d) => espnByDay.has(d));
    if (okDays.length === 0 && mlbRelevant.filter((g) => failedDays.includes(g.scheduleDay)).length === 0 && failedDays.length > 0) {
      // Both sources refused us. Fail loudly: upserting nothing and returning
      // success is how the Aug 19 2026 outage stayed hidden for five weeks.
      throw new Error(`All ${failedDays.length} ESPN MLB scoreboard requests failed and statsapi had no fallback (${statsapiError ?? "no games"})`);
    }

    // ---- ESPN events -> rows ----
    const espnEvents = okDays.flatMap((d) => espnByDay.get(d) || []);
    const seenEspn = new Set<string>();
    const listed = espnEvents.filter((e) => (seenEspn.has(e.id) ? false : (seenEspn.add(e.id), true)));
    // ESPN lists postseason slots before their teams are set ("TBD at TBD",
    // "TBD at New York Yankees"). They are not games: not stored, paired,
    // checked or priced, and the same event id is written once ESPN names both
    // teams. seenEspn keeps their ids (ESPN does list them).
    const uniqueEvents = listingsToStore(listed);
    const placeholdersSkipped = listed.length - uniqueEvents.length;
    const sideOf = (e: ESPNGame, homeAway: "home" | "away") =>
      e.competitions?.[0]?.competitors?.find((c) => c.homeAway === homeAway);
    const espnKey = (e: ESPNGame) =>
      matchupKey(etDate(e.date), sideOf(e, "away")?.team?.displayName ?? "", sideOf(e, "home")?.team?.displayName ?? "");
    const espnByKey = groupByMatchup(uniqueEvents, espnKey, (e) => Date.parse(e.date));
    const twinOf = new Map<ESPNGame, MlbScheduleGame>();
    for (const [key, events] of espnByKey) {
      const twins = mlbByKey.get(key) ?? [];
      for (const [e, g] of pairGames(events, twins, (x) => Date.parse(x.date), expectedStart)) {
        twinOf.set(e, g);
      }
    }
    const mlbTwin = (e: ESPNGame): MlbScheduleGame | null => twinOf.get(e) ?? null;

    // ---- Games that left their date (reconcile.ts) ----
    // A row the scoreboard stopped listing where we have it, or a pre-game
    // listing MLB has no game for that day, may have been rescheduled while
    // the mirror lags: ask ESPN's core API where the event is now. None of
    // this may fail the sync: a row or listing that throws is logged and left.
    const forwardEnd = forwardDays[forwardDays.length - 1];
    const mlbIndex = indexMlbSchedule(mlbGames);
    let stranded: ExistingRow[] = [];
    let unconfirmed: ESPNGame[] = [];
    try {
      stranded = strandedRows(existing, {
        fromDay: today,
        toDay: forwardEnd,
        servedDays: new Set(okDays),
        listedIds: seenEspn,
        mlb: mlbIndex,
      });
      unconfirmed = unconfirmedListings(uniqueEvents, { fromDay: today, toDay: forwardEnd, hasTwin: (e) => twinOf.has(e), mlb: mlbIndex });
    } catch (err) {
      console.error("Reschedule check skipped:", err);
    }
    const coreIds = coreLookupIds(stranded, unconfirmed, MAX_CORE_LOOKUPS);
    const coreEvents = new Map(await mapPool(coreIds, DATE_CONCURRENCY, async (id) => [id, await fetchCoreEvent(id)] as const));

    let rescheduled = 0;
    let calledOff = 0;
    const movedRows: ExistingRow[] = [];
    for (const row of stranded) {
      try {
        const core = coreEvents.get(espnEventId(row.external_id)!);
        if (core === undefined) continue; // over the lookup cap: next run
        const fix = planStranded(row, core, mlbLists(mlbIndex, etDate(row.date), row.visitor_team_name, row.home_team_name));
        if (!fix) continue;
        const { error } = await supabase.from("mlb_games").update({ ...fix, updated_at: new Date().toISOString() }).eq("id", row.id);
        if (error) throw error;
        console.log(`${row.external_id} (${row.visitor_team_name} @ ${row.home_team_name}, ${row.date}) left its date: ${JSON.stringify(fix)}`);
        Object.assign(row, fix); // the statsapi fallback below pairs on the corrected row
        if (fix.date) {
          rescheduled++;
          movedRows.push(row);
        } else {
          calledOff++;
        }
      } catch (err) {
        console.error(`Rescheduling ${row.external_id} failed:`, err);
      }
    }
    // The mirror can also still list a moved game on its old day. The upsert
    // writes the corrected date; the statsapi fallback pairs on it as well, or
    // a failed new day would get a duplicate statsapi row for the same game.
    const mirrorFixes = new Map<string, RowFix>();
    for (const e of unconfirmed) {
      try {
        const core = coreEvents.get(e.id);
        if (core === undefined) continue;
        const row = existing.find((r) => r.external_id === `espn_mlb_${e.id}`);
        const fix = planListing({ date: e.date, status: e.status?.type?.name ?? null }, core, row?.date ?? null);
        if (!fix) continue;
        mirrorFixes.set(e.id, fix);
        if (fix.date && row) row.date = fix.date;
      } catch (err) {
        console.error(`Checking ESPN listing ${e.id} failed:`, err);
      }
    }

    let probablesFromMlb = 0;
    let finalsFromMlb = 0;
    let scoreCorrections = 0;
    let startTimesFromMlb = 0;
    const gamesToUpsert = uniqueEvents.map((game) => {
      const competition = game.competitions?.[0];
      const homeTeam = sideOf(game, "home");
      const awayTeam = sideOf(game, "away");
      const twin = mlbTwin(game);

      // MLB's announced probables are official; ESPN's run further ahead but
      // are partly projections (and drop accents). Prefer MLB, fall back to ESPN.
      const espnHomeP = homeTeam?.probables?.[0]?.athlete?.displayName || null;
      const espnAwayP = awayTeam?.probables?.[0]?.athlete?.displayName || null;
      const homePitcher = twin?.home.probable?.name ?? espnHomeP;
      const awayPitcher = twin?.away.probable?.name ?? espnAwayP;
      if (twin?.home.probable || twin?.away.probable) probablesFromMlb++;

      const weather = game.weather?.displayValue ||
        (game.weather?.temperature ? `${game.weather.temperature}°F` : null);

      // First pitch: MLB's own time for games not yet started (ESPN had
      // doubleheader game 2 at 22:00Z where MLB lists 22:05Z). Skipped when MLB
      // has no time set (startTimeTBD dates are placeholders) or the two
      // disagree by hours, which would mean a mispairing, not a better time.
      let date = game.date;
      if (twin && twin.state === "pre" && !twin.startTimeTBD && game.status?.type?.state === "pre") {
        const gap = Math.abs(Date.parse(twin.gameDate) - Date.parse(game.date));
        if (gap > 0 && gap <= 3 * 3600_000) {
          date = twin.gameDate;
          startTimesFromMlb++;
        }
      }
      const mirrorFix = mirrorFixes.get(game.id);
      if (mirrorFix?.date) date = mirrorFix.date;

      let status = mirrorFix?.status || game.status?.type?.name || "scheduled";
      let isCompleted = game.status?.type?.completed === true;
      let homeScore = homeTeam?.score ? parseInt(homeTeam.score) : null;
      let awayScore = awayTeam?.score ? parseInt(awayTeam.score) : null;

      // A final in MLB's own record wins: the ESPN mirror can still be
      // serving an in-progress snapshot, and the official score is MLB's.
      const espnPostponed = /POSTPONED|CANCELED|CANCELLED/i.test(status);
      if (twin?.isFinal && !espnPostponed && twin.home.score !== null && twin.away.score !== null) {
        if (!isCompleted) finalsFromMlb++;
        else if (homeScore !== twin.home.score || awayScore !== twin.away.score) scoreCorrections++;
        status = "STATUS_FINAL";
        isCompleted = true;
        homeScore = twin.home.score;
        awayScore = twin.away.score;
      }

      return {
        external_id: `espn_mlb_${game.id}`,
        date,
        season: Number(etDate(game.date).slice(0, 4)), // MLB uses calendar year
        status,
        home_team_name: homeTeam?.team?.displayName || homeTeam?.team?.name || "TBD",
        visitor_team_name: awayTeam?.team?.displayName || awayTeam?.team?.name || "TBD",
        home_team_id: homeTeam?.team?.id || null,
        visitor_team_id: awayTeam?.team?.id || null,
        venue: competition?.venue?.fullName || null,
        weather: weather,
        starting_pitcher_home: homePitcher,
        starting_pitcher_away: awayPitcher,
        is_featured: false, // Will be set based on matchup quality
        home_score: homeScore,
        away_score: awayScore,
        is_final: isCompleted,
        updated_at: new Date().toISOString(),
      };
    });

    // Adopt statsapi-sourced rows (written while ESPN was down) that ESPN now
    // serves: rename them to the ESPN id so the upsert updates, not duplicates.
    const existingByExternal = new Set(existing.map((r) => r.external_id));
    const mlbapiRowsByKey = groupByMatchup(
      existing.filter((r) => r.external_id?.startsWith(MLBAPI_PREFIX)),
      (r) => matchupKey(etDate(r.date), r.visitor_team_name, r.home_team_name),
      (r) => Date.parse(r.date),
    );
    let adopted = 0;
    for (const [key, rows] of mlbapiRowsByKey) {
      const events = espnByKey.get(key) ?? [];
      for (const [row, event] of pairGames(rows, events, (r) => Date.parse(r.date), (e) => Date.parse(e.date))) {
        const espnId = `espn_mlb_${event.id}`;
        if (existingByExternal.has(espnId)) continue;
        const { error } = await supabase.from("mlb_games").update({ external_id: espnId }).eq("id", row.id);
        if (error) console.error(`Adopting ${row.external_id} as ${espnId} failed:`, error);
        else adopted++;
      }
    }

    // ---- statsapi rows for days ESPN could not serve ----
    const failedSet = new Set(failedDays);
    const fallbackGames = mlbRelevant.filter((g) => failedSet.has(g.scheduleDay));
    const existingByKey = groupByMatchup(
      existing,
      (r) => matchupKey(etDate(r.date), r.visitor_team_name, r.home_team_name),
      (r) => Date.parse(r.date),
    );
    // ESPN team ids, learned from rows we already have and from this run's
    // ESPN events, so statsapi-sourced rows join and render like the rest.
    const espnTeamId = new Map<string, string>();
    for (const r of existing) {
      if (r.home_team_id) espnTeamId.set(r.home_team_name, r.home_team_id);
      if (r.visitor_team_id) espnTeamId.set(r.visitor_team_name, r.visitor_team_id);
    }
    for (const e of uniqueEvents) {
      for (const c of e.competitions?.[0]?.competitors ?? []) {
        if (c.team?.id && c.team?.displayName) espnTeamId.set(c.team.displayName, c.team.id);
      }
    }
    const espnTeams = new Set(espnTeamId.keys());
    let fallbackUpdated = 0;
    const fallbackInserts: Record<string, unknown>[] = [];
    for (const [key, games] of groupByMatchup(fallbackGames, mlbKeyOf, mlbTimeOf)) {
      const pairs = pairGames(games, existingByKey.get(key) ?? [], expectedStart, (r) => Date.parse(r.date));
      for (const g of games) {
        const row = pairs.get(g);
        // A postponed placeholder can mark an existing row, but is never a new
        // game (its gamePk belongs to the makeup, which gets its own row).
        if (g.isPlaceholder && !row) continue;
        // Nor is a postseason slot whose teams are not set ("AL Wild Card #2")
        if (!row && !isStorableMlbGame(g, espnTeams)) continue;
        const patch = {
          status: g.status,
          is_final: g.isFinal,
          home_score: g.home.score,
          away_score: g.away.score,
          updated_at: new Date().toISOString(),
          ...(g.home.probable ? { starting_pitcher_home: g.home.probable.name } : {}),
          ...(g.away.probable ? { starting_pitcher_away: g.away.probable.name } : {}),
        };
        if (row) {
          const { error } = await supabase.from("mlb_games").update(patch).eq("id", row.id);
          if (error) console.error(`statsapi fallback update ${row.id} failed:`, error);
          else fallbackUpdated++;
        } else {
          fallbackInserts.push({
            external_id: `${MLBAPI_PREFIX}${g.gamePk}`,
            date: g.gameDate,
            season: Number(g.officialDate.slice(0, 4)),
            home_team_name: g.home.name,
            visitor_team_name: g.away.name,
            home_team_id: espnTeamId.get(g.home.name) ?? null,
            visitor_team_id: espnTeamId.get(g.away.name) ?? null,
            venue: g.venue,
            weather: g.weather,
            is_featured: false,
            starting_pitcher_home: g.home.probable?.name ?? null,
            starting_pitcher_away: g.away.probable?.name ?? null,
            ...patch,
          });
        }
      }
    }

    // ---- write ----
    const insertedData: Array<{ id: string; external_id: string; date: string; is_final: boolean | null }> = [];
    const allRows = [...gamesToUpsert, ...fallbackInserts];
    for (let i = 0; i < allRows.length; i += 200) {
      const { data, error: insertError } = await supabase
        .from("mlb_games")
        .upsert(allRows.slice(i, i + 200), { onConflict: "external_id" })
        .select("id, external_id, date, is_final");
      if (insertError) {
        console.error("Error inserting games:", insertError);
        throw new Error(`Failed to insert games: ${insertError.message}`);
      }
      insertedData.push(...(data || []));
    }
    const insertedCount = insertedData.length;
    console.log(`Upserted ${insertedCount} MLB games (${gamesToUpsert.length} ESPN, ${fallbackInserts.length} statsapi), updated ${fallbackUpdated} via statsapi, adopted ${adopted}, rescheduled ${rescheduled}, called off ${calledOff}`);

    // Fetch DraftKings lines from ESPN (free, keyless). ESPN event ids come
    // straight from external_id, so doubleheaders and the score-update
    // lookback can't steal odds from the wrong game. Rescheduled rows are not
    // in the upsert, so they join here: their stored lines predate the move.
    const oddsPool = [
      ...insertedData,
      ...movedRows.map((r) => ({ id: r.id, external_id: r.external_id ?? "", date: r.date, is_final: r.is_final })),
    ];
    if (oddsPool.length > 0) {
      try {
        const oddsTargets = oddsPool
          .filter((g) => {
            if (g.is_final || !g.external_id?.startsWith("espn_mlb_")) return false;
            return g.date && new Date(g.date) >= now;
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 100);

        const idFor = (g: { external_id: string }) => g.external_id.replace("espn_mlb_", "");
        const oddsMap = await fetchEspnOddsBatch("mlb", oddsTargets.map(idFor));

        const oddsToUpsert = oddsTargets.flatMap((g) => {
          const o = oddsMap.get(idFor(g));
          if (!o) return [];
          return [{
            game_id: g.id,
            sportsbook: o.sportsbook,
            spread_value: o.spreadHome,
            spread_odds: o.spreadHomeOdds,
            moneyline_home: o.moneylineHome,
            moneyline_away: o.moneylineAway,
            total_value: o.totalValue,
            total_over_odds: o.totalOverOdds,
            total_under_odds: o.totalUnderOdds,
          }];
        });

        if (oddsToUpsert.length > 0) {
          const { error: oddsError } = await supabase
            .from("mlb_odds")
            .upsert(oddsToUpsert, { onConflict: "game_id,sportsbook" });

          if (oddsError) {
            console.error("Error inserting odds:", oddsError);
          } else {
            console.log(`Upserted ${oddsToUpsert.length} MLB odds records via ESPN`);
          }
        } else {
          console.log("No MLB odds posted for the upcoming window");
        }
      } catch (oddsErr) {
        console.error("Error fetching odds:", oddsErr);
      }
    }

    const details = {
      days_requested: allDays.length,
      espn_days_ok: okDays.length,
      espn_days_failed: failedDays,
      backfill_days: backfillDays,
      espn_games: gamesToUpsert.length,
      espn_placeholders_skipped: placeholdersSkipped,
      statsapi_games_inserted: fallbackInserts.length,
      statsapi_games_updated: fallbackUpdated,
      mlbapi_rows_adopted: adopted,
      espn_core_lookups: coreIds.length,
      rows_rescheduled: rescheduled,
      rows_called_off: calledOff,
      mirror_listings_corrected: mirrorFixes.size,
      probables_from_mlb: probablesFromMlb,
      finals_from_mlb: finalsFromMlb,
      score_corrections_from_mlb: scoreCorrections,
      start_times_from_mlb: startTimesFromMlb,
      statsapi_games_seen: mlbRelevant.length,
      statsapi_error: statsapiError,
    };
    const response = {
      success: true,
      gamesCount: insertedCount,
      ...details,
      message: `Synced ${insertedCount} MLB games across ${allDays.length} days (${backfillDays.length} backfilled)`,
    };

    console.log("MLB sync completed:", response);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: insertedCount + fallbackUpdated + rescheduled + calledOff,
      details,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-mlb-games:", error);
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: "An unexpected error occurred. Please try again later.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
