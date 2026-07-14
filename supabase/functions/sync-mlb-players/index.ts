import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Free official MLB Stats API — no key required
const MLB_API = "https://statsapi.mlb.com/api/v1";

interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
}

interface RosterEntry {
  person: { id: number; fullName: string };
  jerseyNumber?: string;
  position: { abbreviation: string; name: string; type: string };
  status: { code: string };
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

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron auth bypass, else require admin
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log("[sync-mlb-players] Authenticated via cron secret");
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

    syncLogId = await startSyncLog(supabase, {
      sport: "MLB",
      data_type: "players",
      function_name: "sync-mlb-players",
      trigger_source: detectTriggerSource(req),
      api_source: "mlb_statsapi",
    });

    // 1) All MLB teams
    const teamsRes = await fetch(`${MLB_API}/teams?sportId=1`);
    if (!teamsRes.ok) throw new Error(`MLB teams fetch failed: ${teamsRes.status}`);
    const teamsJson = await teamsRes.json();
    const teams: MlbTeam[] = (teamsJson.teams || []).filter((t: any) => t.active !== false);
    console.log(`[sync-mlb-players] ${teams.length} MLB teams`);

    // 2) Active roster per team → players rows
    const playersToUpsert: any[] = [];
    for (const team of teams) {
      try {
        const rosterRes = await fetch(`${MLB_API}/teams/${team.id}/roster?rosterType=active`);
        if (!rosterRes.ok) {
          console.error(`Roster fetch failed for ${team.name}: ${rosterRes.status}`);
          continue;
        }
        const rosterJson = await rosterRes.json();
        const roster: RosterEntry[] = rosterJson.roster || [];
        for (const entry of roster) {
          const [first, ...rest] = (entry.person.fullName || "").split(" ");
          playersToUpsert.push({
            external_id: String(entry.person.id),
            sport: "MLB",
            name: entry.person.fullName,
            first_name: first || null,
            last_name: rest.join(" ") || null,
            position: entry.position?.abbreviation || null,
            team_id: String(team.id),
            team_name: team.name,
            team_abbr: team.abbreviation,
            jersey_number: entry.jerseyNumber || null,
            headshot_url: `https://midfield.mlbstatic.com/v1/people/${entry.person.id}/spots/120`,
            status: entry.status?.code === "A" ? "active" : "inactive",
            updated_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`Error processing team ${team.name}:`, err);
      }
    }

    console.log(`[sync-mlb-players] Upserting ${playersToUpsert.length} MLB players`);
    let synced = 0;
    // Upsert in chunks to stay under payload limits
    for (let i = 0; i < playersToUpsert.length; i += 200) {
      const chunk = playersToUpsert.slice(i, i + 200);
      const { error } = await supabase
        .from("players")
        .upsert(chunk, { onConflict: "external_id,sport" });
      if (error) {
        console.error("Upsert error:", error);
        throw new Error(`Failed to upsert players: ${error.message}`);
      }
      synced += chunk.length;
    }

    const response = { success: true, playersSync: synced, message: `Synced ${synced} MLB players` };
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: synced,
      details: { teams: teams.length },
    });
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-mlb-players:", error);
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
