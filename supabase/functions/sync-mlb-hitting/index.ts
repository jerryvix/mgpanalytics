import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { selectAll } from "../_shared/select-all.ts";
import {
  MLB_STATSAPI,
  statsapiJson,
  hittingGamesFromSplits,
  computeHitStreak,
  rosterUrl,
  parseRoster,
  addDays,
  etDate,
  gameStatusUrl,
  parseSchedule,
  unfinishedGamePks,
} from "../_shared/mlb-statsapi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Days without a game before a hit streak stops counting as live (injury, demotion).
const STREAK_STALE_DAYS = 7;
// Game logs list a game from its first pitch. Games this many days back (a
// late game past midnight, a suspended one) whose final isn't in yet are left
// out of the streak until they end.
const UNFINISHED_LOOKBACK_DAYS = 3;
// Anyone with this many plate appearances gets a streak check. The season
// endpoint defaults to QUALIFIED hitters only (about 130 in late September),
// which silently skipped every part-timer and September call-up on a streak.
const STREAK_MIN_PA = 5;
// Full game logs are stored for the busiest hitters plus anyone on a streak.
const LOG_STORE_TOP_PA = 250;
const LOG_STORE_MIN_STREAK = 3;
const CONCURRENCY = 8;
// Abort before writing if this share of game-log fetches failed: a half-built
// run would zero real streaks, and the previous run's numbers are better.
const MAX_FAILURE_RATE = 0.2;

// statsapi's `fields` filter trims each game log about 10x (170KB -> 18KB).
const LOG_STAT_FIELDS = [
  "gamesPlayed", "plateAppearances", "atBats", "runs", "hits", "doubles", "triples", "homeRuns", "rbi",
  "baseOnBalls", "intentionalWalks", "hitByPitch", "strikeOuts", "stolenBases", "caughtStealing",
  "sacFlies", "sacBunts", "totalBases", "leftOnBase", "groundIntoDoublePlay", "catchersInterference",
  "avg", "obp", "slg", "ops", "summary",
];
const LOG_FIELDS = ["stats", "splits", "date", "isHome", "opponent", "name", "game", "gamePk", "gameNumber", "stat", ...LOG_STAT_FIELDS].join(",");

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Everyone on a 26-man active roster right now, or null if that can't be
 * known. A hitter optioned to Triple-A or on the injured list keeps his
 * official streak but isn't playing tonight, so the site hides it (the same
 * reasoning as the 7-day staleness guard). Fails open: if any team's roster
 * can't be read, return null and filter nobody rather than zero real streaks.
 */
async function loadActiveRosterIds(season: number): Promise<Set<string> | null> {
  try {
    const teamsJson = await statsapiJson<any>(`${MLB_STATSAPI}/teams?sportId=1&season=${season}`);
    const teamIds: number[] = (teamsJson?.teams ?? [])
      .filter((t: any) => t?.sport?.id === 1 && t?.active !== false && typeof t?.id === "number")
      .map((t: any) => t.id);
    if (teamIds.length < 30) return null;
    const rosters = await Promise.all(teamIds.map((id) => statsapiJson(rosterUrl(id, "active", season))));
    const ids = new Set<string>();
    for (const r of rosters) for (const e of parseRoster(r)) ids.add(String(e.id));
    return ids.size >= 30 * 20 ? ids : null; // sanity: 30 teams x 26 men
  } catch (err) {
    console.error("[sync-mlb-hitting] active rosters unavailable, not filtering:", err);
    return null;
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

interface Hitter {
  extId: string;
  playerId: string;
  pa: number;
  qualified: boolean;
  stat: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log("[sync-mlb-hitting] Authenticated via cron secret");
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // .eq("role", "admin") + maybeSingle: a user with both a "user" and an
      // "admin" row made the old .single() error out and 403 a real admin.
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").limit(1).maybeSingle();
      if (roleError || roleData?.role !== "admin") {
        return new Response(JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const season = new Date().getFullYear();
    syncLogId = await startSyncLog(supabase, {
      sport: "MLB", data_type: "hitting", function_name: "sync-mlb-hitting",
      trigger_source: detectTriggerSource(req), api_source: "mlb_statsapi",
    });

    // Map external MLB id -> internal players.id. Must be paginated: there are
    // more than 1,000 MLB players, and a plain select silently returns only the
    // first page, so every hitter past the cap stops being refreshed entirely.
    // Ordered so the pages are stable.
    const mlbPlayers = await selectAll<{ id: string; external_id: string }>(
      () => supabase.from("players").select("id, external_id").eq("sport", "MLB").order("id"),
      { label: "load MLB players" },
    );
    if (!mlbPlayers || mlbPlayers.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0, message: "No MLB players found. Run sync-mlb-players first." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const idMap = new Map<string, string>(mlbPlayers.map((p) => [String(p.external_id), p.id]));

    // 1) Season hitting for EVERY hitter (playerPool=ALL), plus the qualified
    // pool so rate-stat boards can keep MLB's batting-title rule (3.1 PA per
    // team game) instead of letting a 40-AB call-up lead the OPS grid.
    const seasonBase = `${MLB_STATSAPI}/stats?stats=season&group=hitting&season=${season}&sportId=1&gameType=R&limit=2000`;
    const today = etDate(new Date());
    const [allJson, qualifiedJson, activeIds, statusJson] = await Promise.all([
      statsapiJson<any>(`${seasonBase}&playerPool=ALL`),
      statsapiJson<any>(`${seasonBase}&playerPool=QUALIFIED`),
      loadActiveRosterIds(season),
      // Which recent games are still being played. No fail-open here: without
      // it a live game ends streaks again, and the last run's numbers are better.
      statsapiJson<any>(gameStatusUrl(addDays(today, -UNFINISHED_LOOKBACK_DAYS), today)),
    ]);
    // A 200 without a schedule would read as "nothing live" and let live games
    // end streaks again; treat it like a failed read
    if (!Array.isArray(statusJson?.dates)) throw new Error("statsapi returned no schedule for recent game states");
    const unfinished = unfinishedGamePks(parseSchedule(statusJson));
    const allSplits: any[] = allJson?.stats?.[0]?.splits || [];
    const qualifiedIds = new Set<string>((qualifiedJson?.stats?.[0]?.splits || []).map((sp: any) => String(sp.player?.id)));
    if (allSplits.length === 0) throw new Error("statsapi returned no season hitting splits");

    const hitters: Hitter[] = [];
    let unmapped = 0;
    for (const sp of allSplits) {
      const extId = String(sp.player?.id);
      const playerId = idMap.get(extId);
      if (!playerId) { unmapped++; continue; }
      const stat = sp.stat || {};
      hitters.push({
        extId, playerId, stat,
        pa: num(stat.plateAppearances) || num(stat.atBats),
        qualified: qualifiedIds.has(extId),
      });
    }

    // 2) Game logs -> current hit streak for every hitter with a real sample.
    const candidates = hitters.filter((h) => h.pa >= STREAK_MIN_PA).sort((a, b) => b.pa - a.pa);
    const streakByPlayer = new Map<string, { streak: number; avg: number }>();
    const logRowsByPlayer = new Map<string, any[]>();
    const failures: string[] = [];
    let staleHidden = 0;
    let withUnfinishedGame = 0;
    const offRosterHidden: string[] = [];

    await mapPool(candidates, CONCURRENCY, async (cand, rank) => {
      let splits: any[];
      try {
        const logJson = await statsapiJson<any>(
          `${MLB_STATSAPI}/people/${cand.extId}/stats?stats=gameLog&group=hitting&season=${season}&sportId=1&gameType=R&fields=${LOG_FIELDS}`,
        );
        splits = logJson?.stats?.[0]?.splits || [];
      } catch (err) {
        failures.push(cand.extId);
        console.error(`Game log error for ${cand.extId}:`, err);
        return;
      }

      const games = hittingGamesFromSplits(splits);
      const result = computeHitStreak(games, { staleDays: STREAK_STALE_DAYS, unfinished });
      if (result.stale) staleHidden++;
      if (games.some((g) => g.gamePk != null && unfinished.has(g.gamePk))) withUnfinishedGame++;
      // Optioned, injured or otherwise off every active roster: not a live angle tonight.
      const offRoster = result.streak > 0 && activeIds !== null && !activeIds.has(cand.extId);
      if (offRoster) offRosterHidden.push(cand.extId);
      streakByPlayer.set(cand.playerId, offRoster ? { streak: 0, avg: 0 } : { streak: result.streak, avg: result.avg });

      if (rank < LOG_STORE_TOP_PA || result.streak >= LOG_STORE_MIN_STREAK) {
        const chron = [...splits].sort((a, b) =>
          a.date === b.date ? num(a.game?.gameNumber) - num(b.game?.gameNumber) : a.date < b.date ? -1 : 1,
        );
        logRowsByPlayer.set(cand.playerId, chron.map((sp) => {
          const s = sp.stat || {};
          return {
            player_id: cand.playerId, sport: "MLB", season,
            game_date: sp.date || null,
            home_away: sp.isHome ? "home" : "away",
            opponent_name: sp.opponent?.name || null,
            at_bats: num(s.atBats), hits: num(s.hits), doubles: num(s.doubles), triples: num(s.triples),
            home_runs: num(s.homeRuns), rbi: num(s.rbi), walks: num(s.baseOnBalls),
            strikeouts: num(s.strikeOuts), stolen_bases: num(s.stolenBases),
            total_bases: num(s.totalBases), raw_data: s,
          };
        }));
      }
    });

    if (candidates.length > 0 && failures.length / candidates.length > MAX_FAILURE_RATE) {
      throw new Error(`Game log fetch failed for ${failures.length} of ${candidates.length} hitters; not writing a partial streak board`);
    }

    // 3) One season row per hitter, streak included. Writing hit_streak in the
    // same upsert as the stats means every hitter's streak is recomputed on
    // every run: a streak that ended, or a hitter whose log failed, reads 0
    // instead of keeping the number it was frozen at.
    const now = new Date().toISOString();
    const seasonRows = hitters.map((h) => {
      const s = h.stat as Record<string, any>;
      const streak = streakByPlayer.get(h.playerId);
      return {
        player_id: h.playerId, sport: "MLB", season, season_type: "regular",
        source: "mlb_statsapi", games_played: num(s.gamesPlayed),
        at_bats: num(s.atBats), hits: num(s.hits), doubles: num(s.doubles), triples: num(s.triples),
        home_runs: num(s.homeRuns), rbi: num(s.rbi), walks: num(s.baseOnBalls),
        strikeouts: num(s.strikeOuts), stolen_bases: num(s.stolenBases),
        batting_avg: num(s.avg), on_base_pct: num(s.obp), slugging_pct: num(s.slg), ops: num(s.ops),
        hit_streak: streak?.streak ?? 0,
        hit_streak_avg: streak?.avg ?? 0,
        raw_data: { ...s, qualified: h.qualified },
        updated_at: now,
      };
    });

    for (let i = 0; i < seasonRows.length; i += 200) {
      const { error } = await supabase.from("player_season_stats")
        .upsert(seasonRows.slice(i, i + 200), { onConflict: "player_id,season,sport,season_type" });
      if (error) throw new Error(`Season stats upsert failed: ${error.message}`);
    }

    // 4) Any other MLB row still carrying a streak was not produced by this
    // run (player no longer mapped, or not in statsapi's pool): zero it.
    const written = new Set(seasonRows.map((r) => r.player_id));
    const leftovers = (await selectAll<{ id: string; player_id: string }>(
      () => supabase.from("player_season_stats").select("id, player_id")
        .eq("sport", "MLB").eq("season", season).eq("season_type", "regular").gt("hit_streak", 0).order("id"),
      { label: "load live streak rows" },
    )).filter((r) => !written.has(r.player_id));
    for (let i = 0; i < leftovers.length; i += 100) {
      const { error } = await supabase.from("player_season_stats")
        .update({ hit_streak: 0, hit_streak_avg: 0 })
        .in("id", leftovers.slice(i, i + 100).map((r) => r.id));
      if (error) console.error("Leftover streak reset error:", error);
    }

    // 5) Replace stored game logs player by player (only players whose fetch
    // succeeded, so a failed fetch never deletes good history).
    const logPlayers = [...logRowsByPlayer.keys()];
    let gameLogCount = 0;
    for (let i = 0; i < logPlayers.length; i += 25) {
      const chunkIds = logPlayers.slice(i, i + 25);
      const { error: delError } = await supabase.from("player_game_logs").delete()
        .eq("sport", "MLB").eq("season", season).in("player_id", chunkIds);
      if (delError) { console.error("Game log delete error:", delError); continue; }
      const rows = chunkIds.flatMap((id) => logRowsByPlayer.get(id) || []);
      for (let j = 0; j < rows.length; j += 500) {
        const { error } = await supabase.from("player_game_logs").insert(rows.slice(j, j + 500));
        if (error) console.error("Game log insert error:", error);
        else gameLogCount += Math.min(500, rows.length - j);
      }
    }

    const activeStreaks = [...streakByPlayer.values()].filter((s) => s.streak > 0).length;
    const response = {
      success: true,
      seasonRows: seasonRows.length,
      qualified: hitters.filter((h) => h.qualified).length,
      unmappedHitters: unmapped,
      streakChecked: streakByPlayer.size,
      streakFetchFailures: failures.length,
      staleStreaksHidden: staleHidden,
      // Hitters whose log holds a game not final yet, left out of the streak until it ends
      hittersWithUnfinishedGame: withUnfinishedGame,
      activeRosterFilter: activeIds !== null ? `${activeIds.size} active players` : "unavailable (not filtering)",
      offRosterStreaksHidden: offRosterHidden.length,
      leftoverStreaksZeroed: leftovers.length,
      gameLogs: gameLogCount,
      activeStreaks,
      streaks5plus: [...streakByPlayer.values()].filter((s) => s.streak >= 5).length,
      message: `Synced ${seasonRows.length} MLB season lines, ${gameLogCount} game logs, ${activeStreaks} active hit streaks`,
    };
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success", records_added: seasonRows.length + gameLogCount, details: response,
    });
    return new Response(JSON.stringify(response), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Error in sync-mlb-hitting:", error);
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed", error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
