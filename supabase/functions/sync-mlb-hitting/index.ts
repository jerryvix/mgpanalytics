import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MLB_API = "https://statsapi.mlb.com/api/v1";
const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

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
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).single();
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

    // Map external MLB id -> internal players.id
    const { data: mlbPlayers, error: playersErr } = await supabase
      .from("players").select("id, external_id").eq("sport", "MLB");
    if (playersErr) throw new Error(`Failed to load MLB players: ${playersErr.message}`);
    if (!mlbPlayers || mlbPlayers.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0, message: "No MLB players found. Run sync-mlb-players first." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const idMap = new Map<string, string>(mlbPlayers.map((p: any) => [p.external_id, p.id]));

    // 1) Season hitting for every qualified hitter — one call
    const seasonRes = await fetch(
      `${MLB_API}/stats?stats=season&group=hitting&season=${season}&sportId=1&gameType=R&limit=2000`
    );
    if (!seasonRes.ok) throw new Error(`MLB season stats fetch failed: ${seasonRes.status}`);
    const seasonJson = await seasonRes.json();
    const seasonSplits: any[] = seasonJson.stats?.[0]?.splits || [];

    const seasonRows: any[] = [];
    const streakCandidates: { extId: string; pa: number }[] = [];
    for (const sp of seasonSplits) {
      const extId = String(sp.player?.id);
      const internal = idMap.get(extId);
      if (!internal) continue;
      const s = sp.stat || {};
      const atBats = num(s.atBats);
      seasonRows.push({
        player_id: internal, sport: "MLB", season, season_type: "regular",
        source: "mlb_statsapi", games_played: num(s.gamesPlayed),
        at_bats: atBats, hits: num(s.hits), doubles: num(s.doubles), triples: num(s.triples),
        home_runs: num(s.homeRuns), rbi: num(s.rbi), walks: num(s.baseOnBalls),
        strikeouts: num(s.strikeOuts), stolen_bases: num(s.stolenBases),
        batting_avg: num(s.avg), on_base_pct: num(s.obp), slugging_pct: num(s.slg), ops: num(s.ops),
        raw_data: s, updated_at: new Date().toISOString(),
      });
      const pa = num(s.plateAppearances) || atBats;
      if (pa >= 50) streakCandidates.push({ extId, pa });
    }

    // Upsert season stats
    for (let i = 0; i < seasonRows.length; i += 200) {
      const { error } = await supabase.from("player_season_stats")
        .upsert(seasonRows.slice(i, i + 200), { onConflict: "player_id,season,sport,season_type" });
      if (error) throw new Error(`Season stats upsert failed: ${error.message}`);
    }

    // 2) Game logs + current hit streak for active hitters (bounded to protect runtime)
    streakCandidates.sort((a, b) => b.pa - a.pa);
    const topHitters = streakCandidates.slice(0, 250);

    const gameLogRows: any[] = [];
    const streakUpdates: { player_id: string; streak: number; streak_avg: number }[] = [];
    let processed = 0;

    for (const cand of topHitters) {
      const internal = idMap.get(cand.extId)!;
      try {
        const logRes = await fetch(
          `${MLB_API}/people/${cand.extId}/stats?stats=gameLog&group=hitting&season=${season}&sportId=1&gameType=R`
        );
        if (!logRes.ok) continue;
        const logJson = await logRes.json();
        const splits: any[] = logJson.stats?.[0]?.splits || [];
        // splits are chronological; walk from most recent for the active streak
        const chron = [...splits].sort((a, b) => (a.date < b.date ? -1 : 1));

        for (const sp of chron) {
          const s = sp.stat || {};
          gameLogRows.push({
            player_id: internal, sport: "MLB", season,
            game_date: sp.date || null,
            home_away: sp.isHome ? "home" : "away",
            opponent_name: sp.opponent?.name || null,
            at_bats: num(s.atBats), hits: num(s.hits), doubles: num(s.doubles), triples: num(s.triples),
            home_runs: num(s.homeRuns), rbi: num(s.rbi), walks: num(s.baseOnBalls),
            strikeouts: num(s.strikeOuts), stolen_bases: num(s.stolenBases),
            total_bases: num(s.totalBases), raw_data: s,
          });
        }

        // Current consecutive-games-with-a-hit streak (games with an at-bat)
        let streak = 0, streakHits = 0, streakAb = 0;
        for (let i = chron.length - 1; i >= 0; i--) {
          const s = chron[i].stat || {};
          const ab = num(s.atBats);
          if (ab === 0) continue; // pinch-run / did not bat — skip, don't break
          const h = num(s.hits);
          if (h > 0) { streak++; streakHits += h; streakAb += ab; }
          else break;
        }
        if (streak > 0) {
          streakUpdates.push({
            player_id: internal, streak,
            streak_avg: streakAb > 0 ? streakHits / streakAb : 0,
          });
        }
        processed++;
      } catch (err) {
        console.error(`Game log error for ${cand.extId}:`, err);
      }
    }

    // Replace this season's MLB game logs, then insert fresh (avoids stale dupes)
    const logPlayerIds = [...new Set(gameLogRows.map((r) => r.player_id))];
    if (logPlayerIds.length > 0) {
      await supabase.from("player_game_logs").delete()
        .eq("sport", "MLB").eq("season", season).in("player_id", logPlayerIds);
      for (let i = 0; i < gameLogRows.length; i += 500) {
        const { error } = await supabase.from("player_game_logs").insert(gameLogRows.slice(i, i + 500));
        if (error) console.error("Game log insert error:", error);
      }
    }

    // Persist streaks onto the season row
    for (const u of streakUpdates) {
      await supabase.from("player_season_stats")
        .update({ hit_streak: u.streak, hit_streak_avg: u.streak_avg })
        .eq("player_id", u.player_id).eq("season", season).eq("sport", "MLB").eq("season_type", "regular");
    }

    const response = {
      success: true,
      seasonRows: seasonRows.length,
      hittersProcessed: processed,
      gameLogs: gameLogRows.length,
      activeStreaks: streakUpdates.length,
      message: `Synced ${seasonRows.length} MLB season lines, ${gameLogRows.length} game logs, ${streakUpdates.length} active hit streaks`,
    };
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success", records_added: seasonRows.length + gameLogRows.length, details: response,
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
