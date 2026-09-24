import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { selectAll } from "../_shared/select-all.ts";
import { bdlNflFetchAll, type BdlParams } from "../_shared/bdl-nfl.ts";
import {
  chunk,
  currentNflSeason,
  gameLogRow,
  hasStarted,
  isFinalGame,
  isPhantomLine,
  nflGameDate,
  selectRecentWeeks,
  weekKey,
  type BdlGame,
  type BoxParticipants,
} from "../_shared/nfl-sync.ts";
import { espnBoxParticipants, espnEventKey, espnWeekEventIds } from "../_shared/espn-box.ts";
import { rebuildNflSeasonStats, type SeasonRebuildResult } from "../_shared/nfl-season-rebuild.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Sep 2026 rewrite. The old version walked every skill player (~1,180) and
// called /stats once per player for the whole season, which blew through the
// 150s gateway limit and 504'd every run from Sep 18 on: Week 2's Sunday and
// Monday games never landed. It also pulled preseason box scores (BDL's
// /stats?seasons[] includes August games labeled weeks 1-4), so player pages
// showed preseason games as regular-season weeks.
//
// Now: read the season schedule from /games (regular + postseason only), pick
// the weeks to refresh, and pull box scores by game_ids[] for just those
// games. A default run (the dispatcher sends no body) refreshes the two most
// recent weeks that have kicked off: roughly 25 BDL calls instead of 1,200.
//
// Sep 24 2026: only FINAL games are stored, and each is checked against
// ESPN's box score first. BDL's box scores carry phantom lines (a stat for a
// player who is not in the game at all: 14 in 2025, e.g. Grant Calcaterra's
// 1 target in NYG @ PHI Week 8); those are dropped, and any already stored
// for the game are deleted. A final game whose ESPN box cannot be read is
// skipped and reported, never stored unchecked. The current season's totals
// are then rebuilt from the logs in the same run (_shared/nfl-season-rebuild).
//
// Body (all optional):
//   season        season label (default: current, start-year convention)
//   week | weeks  explicit regular-season week(s) to refresh
//   fullSeason    refresh every week that has kicked off
//   postseason    refresh playoff games only (optionally with weeks)
//   recentWeeks   how many recent weeks the default run covers (default 2)
//   pruneOrphans  delete this season's NFL log rows dated before the first
//                 regular-season kickoff (the preseason rows); needs a full
//                 schedule from /games
//   allowPastSeason  required with an explicit season before the current one
const GAMES_PER_STATS_CALL = 8;
const UPSERT_BATCH = 500;
const SKILL_POSITIONS = [
  "QB", "RB", "WR", "TE", "FB",
  "Quarterback", "Running Back", "Wide Receiver", "Tight End", "Fullback",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let syncLogId: string | null = null;
  // deno-lint-ignore no-explicit-any
  let supabase: any;

  try {
    const apiKey = Deno.env.get("BALLDONTLIE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!apiKey) throw new Error("BALLDONTLIE_API_KEY not configured");
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Supabase configuration missing");
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: cron secret, service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nfl-game-logs] Authenticated via cron secret`);
    } else if (bearerToken === supabaseServiceKey) {
      console.log(`[sync-nfl-game-logs] Authenticated via service role key`);
    } else {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - no token provided" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: "NFL",
      data_type: "game_logs",
      function_name: "sync-nfl-game-logs",
      trigger_source: triggerSource,
      api_source: "balldontlie",
    });

    let season = currentNflSeason();
    let explicitWeeks: number[] | null = null;
    let fullSeason = false;
    let postseasonOnly = false;
    let recentWeeks = 2;
    let pruneOrphans = false;
    let explicitSeason = false;
    let allowPastSeason = false;
    try {
      const body = await req.json();
      if (body.season) {
        season = parseInt(body.season, 10);
        explicitSeason = true;
      }
      if (body.allowPastSeason === true) allowPastSeason = true;
      if (body.week) explicitWeeks = [parseInt(body.week, 10)];
      if (Array.isArray(body.weeks)) explicitWeeks = body.weeks.map((w: unknown) => parseInt(String(w), 10));
      if (body.fullSeason === true) fullSeason = true;
      if (body.postseason === true) postseasonOnly = true;
      if (body.recentWeeks) recentWeeks = Math.max(1, parseInt(body.recentWeeks, 10));
      if (body.pruneOrphans === true) pruneOrphans = true;
    } catch {
      // No body: default recent-weeks refresh
    }

    // Past seasons are final (2025's logs were checked game by game against
    // ESPN on Sep 24 2026). The Admin panel builds before that sent
    // { season: 2024 } on every click, so an explicit past season now needs
    // { allowPastSeason: true }.
    if (explicitSeason && season < currentNflSeason() && !allowPastSeason) {
      const message = `Season ${season} is final and was left untouched (send allowPastSeason: true to refresh it)`;
      console.log(`[sync-nfl-game-logs] ${message}`);
      await completeSyncLog(supabase, syncLogId, startTime, {
        status: "success",
        records_added: 0,
        details: { season, skipped: message },
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, season, synced: 0, count: 0, message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: the season schedule. /games is the authority on which games
    // count; /stats would otherwise hand back preseason box scores too.
    const games: BdlGame[] = await bdlNflFetchAll(apiKey, "/games", [["seasons[]", season]]);
    const gameById = new Map<number, BdlGame>(games.map((g) => [g.id, g]));
    const started = games.filter((g) => hasStarted(g));

    let targetGames: BdlGame[];
    let scope: string;
    if (postseasonOnly) {
      targetGames = started.filter((g) => g.postseason && (!explicitWeeks || explicitWeeks.includes(g.week ?? -1)));
      scope = `postseason${explicitWeeks ? ` weeks ${explicitWeeks.join(",")}` : ""}`;
    } else if (explicitWeeks) {
      targetGames = started.filter((g) => !g.postseason && explicitWeeks!.includes(g.week ?? -1));
      scope = `weeks ${explicitWeeks.join(",")}`;
    } else if (fullSeason) {
      targetGames = started;
      scope = "full season";
    } else {
      const keys = new Set(selectRecentWeeks(games, recentWeeks));
      targetGames = started.filter((g) => keys.has(weekKey(g)));
      scope = `recent ${[...keys].join(",") || "(none started)"}`;
    }
    const weeksCovered = [...new Set(targetGames.map((g) => weekKey(g)))];
    console.log(`[sync-nfl-game-logs] Season ${season}: ${games.length} scheduled, ${started.length} kicked off, ${targetGames.length} targeted (${scope})`);

    // Step 2: BDL player id -> our player row. Paginated: NFL has more than
    // 1,000 skill players and a plain select truncates silently at the cap.
    const players = await selectAll<{ id: string; external_id: string }>(
      () => supabase
        .from("players")
        .select("id, external_id")
        .eq("sport", "NFL")
        .not("external_id", "is", null)
        .in("position", SKILL_POSITIONS)
        .order("id"),
      { label: "fetch NFL players" },
    );
    const playerMap = new Map<string, string>(players.map((p) => [String(p.external_id), p.id]));
    console.log(`[sync-nfl-game-logs] ${playerMap.size} NFL players with BDL ids`);

    // Step 3: ESPN's box score for every FINAL targeted game (the phantom
    // guard, see isPhantomLine). Games still in progress wait for the next
    // run: mid-game, BDL and ESPN update at different speeds. A final game
    // whose ESPN box cannot be read is skipped, not stored unchecked.
    const errors: string[] = [];
    const finalGames = targetGames.filter((g) => isFinalGame(g));
    const inProgress = targetGames.length - finalGames.length;
    const eventIdsByWeek = new Map<string, Map<string, string>>();
    for (const g of finalGames) {
      const wk = weekKey(g);
      if (!eventIdsByWeek.has(wk)) eventIdsByWeek.set(wk, await espnWeekEventIds(season, !!g.postseason, g.week ?? 0));
    }
    const participantsByGame = new Map<number, BoxParticipants>();
    const boxSources: Record<string, number> = {};
    const unverified: number[] = [];
    {
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, finalGames.length) }, async () => {
        while (next < finalGames.length) {
          const g = finalGames[next++];
          const eventId = eventIdsByWeek.get(weekKey(g))?.get(espnEventKey(g));
          const box = eventId ? await espnBoxParticipants(eventId) : null;
          if (!box) {
            unverified.push(g.id);
            continue;
          }
          participantsByGame.set(g.id, box.participants);
          boxSources[box.source] = (boxSources[box.source] ?? 0) + 1;
        }
      }));
    }
    const verifiedGames = finalGames.filter((g) => participantsByGame.has(g.id));
    if (unverified.length) {
      errors.push(`${unverified.length} final game(s) skipped: no ESPN box score to check against (BDL ids ${unverified.join(", ")})`);
    }

    // Step 4: BDL box scores for the verified games, a few games per call
    const rowsByKey = new Map<string, NonNullable<ReturnType<typeof gameLogRow>>>();
    let statLines = 0;
    let unmatched = 0;
    const phantoms: string[] = [];
    for (const group of chunk(verifiedGames, GAMES_PER_STATS_CALL)) {
      const params: BdlParams = group.map((g) => ["game_ids[]", g.id] as [string, number]);
      const stats = await bdlNflFetchAll(apiKey, "/stats", params);
      statLines += stats.length;
      for (const stat of stats) {
        const playerId = playerMap.get(String(stat.player?.id));
        if (!playerId) {
          unmatched++;
          continue;
        }
        const game = gameById.get(stat.game?.id) ?? stat.game;
        if (!game) continue;
        if (isPhantomLine(stat, participantsByGame.get(game.id)!)) {
          phantoms.push(`${stat.player?.first_name} ${stat.player?.last_name} (${stat.team?.abbreviation}) BDL game ${game.id}`);
          continue;
        }
        const row = gameLogRow(stat, game, playerId, season);
        if (row) rowsByKey.set(`${row.player_id}|${row.game_id}`, row);
      }
    }
    const rows = [...rowsByKey.values()];
    console.log(`[sync-nfl-game-logs] ${statLines} stat lines, ${rows.length} skill-player logs, ${phantoms.length} phantom lines dropped, ${unmatched} lines for players we do not track`);

    // Step 5: remove already-stored phantoms for the verified games (a row
    // written before this guard existed, or BDL adding a line later). The
    // same rule, applied to the stored BDL line, so only a stat-carrying row
    // for a player ESPN's box does not list is ever deleted.
    let phantomRowsRemoved = 0;
    for (const group of chunk(verifiedGames, GAMES_PER_STATS_CALL)) {
      const { data: stored, error } = await supabase
        .from("player_game_logs")
        .select("id, game_id, raw_data")
        .eq("sport", "NFL")
        .eq("season", season)
        .in("week", [...new Set(group.map((g) => g.week ?? 0))])
        .in("game_id", group.map((g) => `nfl_game_${g.id}`));
      if (error) {
        errors.push(`phantom check: ${error.message}`);
        continue;
      }
      const doomed = (stored ?? []).filter((r: { game_id: string; raw_data: Record<string, unknown> | null }) => {
        const gid = Number(String(r.game_id).replace("nfl_game_", ""));
        const participants = participantsByGame.get(gid);
        return participants && r.raw_data ? isPhantomLine(r.raw_data, participants) : false;
      }).map((r: { id: string }) => r.id);
      if (doomed.length) {
        const { error: delError } = await supabase.from("player_game_logs").delete().in("id", doomed);
        if (delError) errors.push(`phantom delete: ${delError.message}`);
        else phantomRowsRemoved += doomed.length;
      }
    }

    // Step 6: upsert
    let totalUpserted = 0;
    for (const batch of chunk(rows, UPSERT_BATCH)) {
      const { error } = await supabase
        .from("player_game_logs")
        .upsert(batch, { onConflict: "player_id,game_id" });
      if (error) {
        console.error(`[sync-nfl-game-logs] Upsert error:`, error.message);
        errors.push(error.message);
      } else {
        totalUpserted += batch.length;
      }
    }

    // Step 7 (opt-in): drop the preseason box scores older runs wrote. BDL's
    // /games schedule is regular season + playoffs only, so anything dated
    // before its first regular-season kickoff is preseason. One indexed
    // DELETE: listing ids first (ORDER BY id over this multi-sport table)
    // hits the statement timeout. Guarded on a full schedule so a partial
    // /games response can never move the cutoff.
    let pruned = 0;
    if (pruneOrphans) {
      const regular = games.filter((g) => !g.postseason);
      if (regular.length < 250) {
        console.log(`[sync-nfl-game-logs] Prune skipped: only ${regular.length} regular-season games on the schedule`);
      } else {
        const firstKickoff = regular.reduce((min, g) => (g.date < min ? g.date : min), regular[0].date);
        // Same Eastern-date convention game_date is stored in. The preseason
        // ends well over a week before the opener, so this is never close.
        const cutoffDate = nflGameDate(firstKickoff)!;
        const { count, error } = await supabase
          .from("player_game_logs")
          .delete({ count: "exact" })
          .eq("sport", "NFL")
          .eq("season", season)
          .lt("game_date", cutoffDate);
        if (error) errors.push(`prune: ${error.message}`);
        else pruned = count ?? 0;
        console.log(`[sync-nfl-game-logs] Pruned ${pruned} preseason rows dated before ${cutoffDate}`);
      }
    }

    // Step 8: season totals follow the logs in the same run (current season
    // only; past seasons are final and only change through reviewed repairs)
    let seasonRebuild: SeasonRebuildResult | { error: string } | null = null;
    if (season === currentNflSeason() && totalUpserted > 0 && !errors.some((e) => !e.includes("skipped: no ESPN box score"))) {
      try {
        const rebuilt = await rebuildNflSeasonStats(supabase, apiKey, season, { prune: true });
        seasonRebuild = rebuilt;
        if (rebuilt.errors.length) errors.push(...rebuilt.errors.map((e) => `season rebuild: ${e}`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        seasonRebuild = { error: message };
        errors.push(`season rebuild: ${message}`);
      }
    }

    const status = errors.length === 0 ? "success" : totalUpserted > 0 ? "partial" : "failed";
    await supabase.from("sync_schedule").upsert(
      {
        sport: "NFL",
        data_type: "game_logs",
        last_sync_at: new Date().toISOString(),
        last_sync_status: status,
        records_synced: totalUpserted,
        error_message: errors.length ? errors.join("; ").slice(0, 500) : null,
      },
      { onConflict: "sport,data_type" }
    );

    const duration = Math.round((Date.now() - startTime) / 1000);
    const response = {
      success: status !== "failed",
      synced: totalUpserted,
      count: totalUpserted,
      season,
      scope,
      weeks: weeksCovered,
      games: targetGames.length,
      finalGames: finalGames.length,
      inProgressSkipped: inProgress,
      unverifiedGames: unverified.length,
      boxScoreSources: boxSources,
      phantomLinesDropped: phantoms.length,
      phantomSample: phantoms.slice(0, 10),
      phantomRowsRemoved,
      statLines,
      unmatchedLines: unmatched,
      pruned,
      seasonRebuild,
      duration: `${duration}s`,
      errors: errors.length ? errors : undefined,
      message: [
        `Synced ${totalUpserted} NFL game logs from ${verifiedGames.length} final games (${scope})`,
        inProgress ? `${inProgress} in progress, next run` : "",
        unverified.length ? `${unverified.length} skipped, no ESPN box score` : "",
        phantoms.length || phantomRowsRemoved ? `${phantoms.length} phantom lines dropped, ${phantomRowsRemoved} stored removed` : "",
      ].filter(Boolean).join("; "),
    };
    console.log("[sync-nfl-game-logs] Complete:", JSON.stringify(response));

    await completeSyncLog(supabase, syncLogId, startTime, {
      status,
      records_added: totalUpserted,
      error_message: errors.length ? errors.join("; ").slice(0, 500) : undefined,
      details: { season, scope, weeks: weeksCovered, games: targetGames.length, final_games: finalGames.length, in_progress_skipped: inProgress, unverified_games: unverified, box_sources: boxSources, phantom_lines_dropped: phantoms, phantom_rows_removed: phantomRowsRemoved, stat_lines: statLines, unmatched, pruned, season_rebuild: seasonRebuild },
    });

    return new Response(JSON.stringify(response), {
      status: status === "failed" ? 500 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync-nfl-game-logs] Error:", errorMessage);

    await completeSyncLog(supabase, syncLogId, startTime, {
      status: "failed",
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
