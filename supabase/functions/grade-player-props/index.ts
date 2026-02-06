import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Map prop_type to the column(s) in player_game_logs
const PROP_STAT_MAP: Record<string, string[]> = {
  points: ["points"],
  rebounds: ["rebounds"],
  assists: ["assists"],
  threes: ["three_made"],
  blocks: ["blocks"],
  steals: ["steals"],
  turnovers: ["turnovers"],
  "pts+reb+ast": ["points", "rebounds", "assists"],
  "pts+reb": ["points", "rebounds"],
  "pts+ast": ["points", "assists"],
  "reb+ast": ["rebounds", "assists"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth: cron secret or admin JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log("[grade-player-props] Authenticated via cron secret");
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[grade-player-props] Admin user ${user.id} authenticated`);
    }

    const today = new Date().toISOString().split("T")[0];

    // Fetch ungraded props from past games
    const { data: ungradedProps, error: fetchError } = await supabase
      .from("player_props")
      .select("id, player_id, prop_type, line, game_date, sport")
      .eq("graded", false)
      .eq("is_active", true)
      .lt("game_date", today)
      .order("game_date", { ascending: false })
      .limit(500);

    if (fetchError) {
      throw new Error(`Failed to fetch ungraded props: ${fetchError.message}`);
    }

    if (!ungradedProps?.length) {
      return new Response(
        JSON.stringify({ success: true, graded: 0, message: "No props to grade" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[grade-player-props] Found ${ungradedProps.length} ungraded props`);

    // Collect unique player_ids and game_dates for batch lookup
    const playerIds = [...new Set(ungradedProps.map((p) => p.player_id).filter(Boolean))];
    const gameDates = [...new Set(ungradedProps.map((p) => p.game_date).filter(Boolean))];

    // Batch-fetch game logs for these players and dates
    const gameLogMap = new Map<string, Record<string, number | null>>();

    // Fetch in chunks of 30 player_ids at a time
    for (let i = 0; i < playerIds.length; i += 30) {
      const playerBatch = playerIds.slice(i, i + 30);

      const { data: gameLogs, error: logError } = await supabase
        .from("player_game_logs")
        .select("player_id, game_date, points, rebounds, assists, three_made, blocks, steals, turnovers")
        .in("player_id", playerBatch)
        .in("game_date", gameDates);

      if (logError) {
        console.error(`[grade-player-props] Error fetching game logs batch: ${logError.message}`);
        continue;
      }

      if (gameLogs) {
        for (const log of gameLogs) {
          const key = `${log.player_id}|${log.game_date}`;
          gameLogMap.set(key, {
            points: log.points,
            rebounds: log.rebounds,
            assists: log.assists,
            three_made: log.three_made,
            blocks: log.blocks,
            steals: log.steals,
            turnovers: log.turnovers,
          });
        }
      }
    }

    console.log(`[grade-player-props] Found game logs for ${gameLogMap.size} player-date combos`);

    // Grade each prop
    const results = { over: 0, under: 0, push: 0, void: 0 };
    const updates: { id: string; actual_value: number | null; result: string; graded: boolean; graded_at: string }[] = [];
    const now = new Date().toISOString();

    for (const prop of ungradedProps) {
      const key = `${prop.player_id}|${prop.game_date}`;
      const gameLog = gameLogMap.get(key);

      if (!gameLog) {
        // Player didn't play or no game log available
        updates.push({
          id: prop.id,
          actual_value: null,
          result: "void",
          graded: true,
          graded_at: now,
        });
        results.void++;
        continue;
      }

      const statColumns = PROP_STAT_MAP[prop.prop_type];
      if (!statColumns) {
        // Unknown prop type — void
        updates.push({
          id: prop.id,
          actual_value: null,
          result: "void",
          graded: true,
          graded_at: now,
        });
        results.void++;
        continue;
      }

      // Sum the relevant stat columns
      let actualValue = 0;
      let hasData = false;
      for (const col of statColumns) {
        const val = gameLog[col];
        if (val !== null && val !== undefined) {
          actualValue += val;
          hasData = true;
        }
      }

      if (!hasData) {
        updates.push({
          id: prop.id,
          actual_value: null,
          result: "void",
          graded: true,
          graded_at: now,
        });
        results.void++;
        continue;
      }

      // Compare to line
      let result: string;
      if (actualValue > prop.line) {
        result = "over";
        results.over++;
      } else if (actualValue < prop.line) {
        result = "under";
        results.under++;
      } else {
        result = "push";
        results.push++;
      }

      updates.push({
        id: prop.id,
        actual_value: actualValue,
        result,
        graded: true,
        graded_at: now,
      });
    }

    // Batch update in chunks of 50
    let updatedCount = 0;
    for (let i = 0; i < updates.length; i += 50) {
      const batch = updates.slice(i, i + 50);

      for (const update of batch) {
        const { error: updateError } = await supabase
          .from("player_props")
          .update({
            actual_value: update.actual_value,
            result: update.result,
            graded: update.graded,
            graded_at: update.graded_at,
          })
          .eq("id", update.id);

        if (updateError) {
          console.error(`[grade-player-props] Error updating prop ${update.id}: ${updateError.message}`);
        } else {
          updatedCount++;
        }
      }
    }

    console.log(`[grade-player-props] Graded ${updatedCount} props: ${JSON.stringify(results)}`);

    return new Response(
      JSON.stringify({
        success: true,
        graded: updatedCount,
        results,
        message: `Graded ${updatedCount} props (${results.over} over, ${results.under} under, ${results.push} push, ${results.void} void)`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[grade-player-props] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
