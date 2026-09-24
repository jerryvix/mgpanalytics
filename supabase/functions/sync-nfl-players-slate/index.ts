import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { selectAll } from "../_shared/select-all.ts";
import { chunk } from "../_shared/nfl-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Sep 2026 rewrite. The old version issued one UPDATE plus one upsert per
// player, sequentially, for every team on the 7-day slate (about 2,400 round
// trips for a full week), and hit the 150s gateway timeout every run. It also
// had two silent bugs: usage was read with BDL field names (passing_attempts)
// off our DB rows (pass_attempts) and matched on "QB" while rosters store
// "Quarterback", so every usage was 0 and "featured" was arbitrary; and the
// association upsert targeted a PARTIAL unique index that ON CONFLICT cannot
// infer, so player_game_associations never received a row.
//
// Now: one paginated read each for players and season stats, updates grouped
// by identical payload and run with bounded concurrency, and associations
// inserted only for pairs that do not exist yet.

const UPDATE_CONCURRENCY = 10;

const POSITION_ABBR: Record<string, string> = {
  quarterback: "QB",
  "running back": "RB",
  fullback: "FB",
  "wide receiver": "WR",
  "tight end": "TE",
};

function positionAbbr(position: string | null): string {
  if (!position) return "UNKNOWN";
  return POSITION_ABBR[position.toLowerCase()] ?? position.toUpperCase();
}

interface StatRow {
  player_id: string;
  pass_attempts: number | null;
  rush_attempts: number | null;
  receptions: number | null;
  targets: number | null;
}

function usageMetric(stats: StatRow | undefined, pos: string): number {
  if (!stats) return 0;
  switch (pos) {
    case "QB":
      return stats.pass_attempts || 0;
    case "RB":
    case "FB":
      return (stats.rush_attempts || 0) + (stats.receptions || 0);
    case "WR":
    case "TE":
      return stats.targets || 0;
    default:
      return 0;
  }
}

function isFeaturedByPosition(pos: string, rank: number): boolean {
  switch (pos) {
    case "QB":
      return rank <= 1;
    case "RB":
    case "FB":
      return rank <= 2;
    case "WR":
    case "TE":
      return rank <= 3;
    default:
      return false;
  }
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let syncLogId: string | null = null;
  const syncStartTime = Date.now();
  // deno-lint-ignore no-explicit-any
  let supabase: any;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret (dispatch-syncs), service role key, or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-nfl-players-slate] Authenticated via cron secret`);
    } else if (bearer && bearer === SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[sync-nfl-players-slate] Authenticated via service role key`);
    } else {
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
      data_type: "players_slate",
      function_name: "sync-nfl-players-slate",
      trigger_source: triggerSource,
      api_source: "supabase",
    });

    // Step 1: NFL games in the slate window (now -> +7 days)
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, home_team_name, visitor_team_name, date")
      .eq("league", "NFL")
      .gte("date", now.toISOString())
      .lte("date", in7Days.toISOString());

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`);
    }

    if (!games || games.length === 0) {
      console.log("[sync-nfl-players-slate] No games in slate window");
      await completeSyncLog(supabase, syncLogId, syncStartTime, {
        status: "success",
        records_added: 0,
        details: { message: "No games in slate window" },
      });
      return new Response(
        JSON.stringify({ success: true, message: "No games in slate window", playersUpdated: 0, count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // team full name -> slate game ids (a team can appear twice in 7 days)
    const gamesByTeam = new Map<string, number[]>();
    for (const g of games) {
      for (const team of [g.home_team_name, g.visitor_team_name]) {
        gamesByTeam.set(team, [...(gamesByTeam.get(team) ?? []), g.id]);
      }
    }
    console.log(`[sync-nfl-players-slate] ${games.length} games, ${gamesByTeam.size} teams in window`);

    // Step 2: every active NFL player on those teams (one paginated read)
    const allPlayers = await selectAll<{ id: string; position: string | null; team_name: string | null }>(
      () => supabase
        .from("players")
        .select("id, position, team_name")
        .eq("sport", "NFL")
        .eq("status", "active")
        .order("id"),
      { label: "fetch NFL players" },
    );
    const slatePlayers = allPlayers.filter((p) => p.team_name && gamesByTeam.has(p.team_name));

    // Step 3: current-season stats for usage ranking (one paginated read)
    const statsSeason = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const stats = await selectAll<StatRow>(
      () => supabase
        .from("player_season_stats")
        .select("player_id, pass_attempts, rush_attempts, receptions, targets")
        .eq("sport", "NFL")
        .eq("season", statsSeason)
        .eq("season_type", "regular")
        .order("id"),
      { label: "fetch NFL season stats" },
    );
    const statsMap = new Map<string, StatRow>(stats.map((s) => [s.player_id, s]));

    // Step 4: rank usage within each team + position
    interface Ranked { id: string; team: string; pos: string; usage: number; rank: number; featured: boolean }
    const groups = new Map<string, Ranked[]>();
    for (const p of slatePlayers) {
      const pos = positionAbbr(p.position);
      const key = `${p.team_name}|${pos}`;
      const entry: Ranked = { id: p.id, team: p.team_name!, pos, usage: usageMetric(statsMap.get(p.id), pos), rank: 0, featured: false };
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    const ranked: Ranked[] = [];
    for (const members of groups.values()) {
      members.sort((a, b) => b.usage - a.usage);
      members.forEach((m, i) => {
        m.rank = i + 1;
        m.featured = isFeaturedByPosition(m.pos, m.rank);
        ranked.push(m);
      });
    }

    // Step 5: write. Players sharing (rank, usage, featured) get one UPDATE.
    const slateStartIso = now.toISOString();
    const slateEndIso = in7Days.toISOString();
    const updateGroups = new Map<string, { ids: string[]; rank: number; usage: number; featured: boolean }>();
    for (const r of ranked) {
      const k = `${r.rank}|${r.usage}|${r.featured}`;
      const g = updateGroups.get(k) ?? { ids: [], rank: r.rank, usage: r.usage, featured: r.featured };
      g.ids.push(r.id);
      updateGroups.set(k, g);
    }
    const updateJobs = [...updateGroups.values()].flatMap((g) =>
      chunk(g.ids, 200).map((ids) => ({ ...g, ids }))
    );

    const errors: string[] = [];
    let playersUpdated = 0;
    await runPool(updateJobs, UPDATE_CONCURRENCY, async (job) => {
      const { error } = await supabase
        .from("players")
        .update({
          is_featured: job.featured,
          featured_reason: job.featured ? "high_usage" : null,
          slate_window_start: slateStartIso,
          slate_window_end: slateEndIso,
          usage_rank: job.rank,
          usage_metric: job.usage,
          updated_at: new Date().toISOString(),
        })
        .in("id", job.ids);
      if (error) errors.push(`players update: ${error.message}`);
      else playersUpdated += job.ids.length;
    });

    // Step 6: player <-> game associations, inserting only missing pairs
    const slateGameIds = games.map((g: { id: number }) => g.id);
    let assocReadError: string | null = null;
    const existingAssoc = await selectAll<{ player_id: string; nfl_game_id: number }>(
      () => supabase
        .from("player_game_associations")
        .select("player_id, nfl_game_id")
        .eq("sport", "NFL")
        .in("nfl_game_id", slateGameIds)
        .order("id"),
      { label: "fetch slate associations" },
    ).catch((err: Error) => {
      assocReadError = err.message;
      errors.push(`associations read: ${err.message}`);
      return [];
    });
    const existingPairs = new Set<string>(existingAssoc.map((a) => `${a.player_id}|${a.nfl_game_id}`));

    const newAssoc: { player_id: string; nfl_game_id: number; sport: string; status: string; is_starter: boolean }[] = [];
    const starterIdsByGame = new Map<number, { starters: string[]; others: string[] }>();
    for (const r of ranked) {
      for (const gameId of gamesByTeam.get(r.team) ?? []) {
        const bucket = starterIdsByGame.get(gameId) ?? { starters: [], others: [] };
        (r.featured ? bucket.starters : bucket.others).push(r.id);
        starterIdsByGame.set(gameId, bucket);
        if (!existingPairs.has(`${r.id}|${gameId}`)) {
          newAssoc.push({ player_id: r.id, nfl_game_id: gameId, sport: "NFL", status: "active", is_starter: r.featured });
        }
      }
    }

    let associationsInserted = 0;
    if (!assocReadError) {
      for (const batch of chunk(newAssoc, 500)) {
        const { error } = await supabase.from("player_game_associations").insert(batch);
        if (error) errors.push(`associations insert: ${error.message}`);
        else associationsInserted += batch.length;
      }
      // Existing pairs: refresh is_starter with two grouped updates per game
      for (const [gameId, bucket] of starterIdsByGame) {
        for (const [flag, ids] of [[true, bucket.starters], [false, bucket.others]] as const) {
          for (const idChunk of chunk(ids, 200)) {
            const { error } = await supabase
              .from("player_game_associations")
              .update({ is_starter: flag, status: "active" })
              .eq("nfl_game_id", gameId)
              .in("player_id", idChunk);
            if (error) errors.push(`associations update: ${error.message}`);
          }
        }
      }
    }

    const status = errors.length === 0 ? "success" : playersUpdated > 0 ? "partial" : "failed";
    await supabase
      .from("sync_schedule")
      .upsert({
        sport: "NFL",
        data_type: "players_slate",
        last_sync_at: new Date().toISOString(),
        last_sync_status: status,
        records_synced: playersUpdated,
        error_message: errors.length ? errors.slice(0, 5).join("; ") : null,
      }, { onConflict: "sport,data_type" });

    const teamsProcessed = [...new Set(ranked.map((r) => r.team))];
    const duration = Math.round((Date.now() - syncStartTime) / 1000);
    const response = {
      success: status !== "failed",
      playersUpdated,
      count: playersUpdated,
      featured: ranked.filter((r) => r.featured).length,
      associationsInserted,
      teamsProcessed,
      duration: `${duration}s`,
      errors: errors.length ? errors.slice(0, 5) : undefined,
      message: `Updated ${playersUpdated} NFL players from ${teamsProcessed.length} teams for slate`,
    };
    console.log("[sync-nfl-players-slate] Sync completed:", JSON.stringify({ ...response, teamsProcessed: teamsProcessed.length }));

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status,
      records_added: playersUpdated,
      error_message: errors.length ? errors.slice(0, 5).join("; ") : undefined,
      details: { teams_processed: teamsProcessed, associations_inserted: associationsInserted },
    });

    return new Response(JSON.stringify(response), {
      status: status === "failed" ? 500 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sync-nfl-players-slate] Error:", error);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
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
