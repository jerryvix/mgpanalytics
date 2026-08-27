import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";
import { fetchEspnOddsBatch } from "../_shared/espn-odds.ts";
import { espnFetch } from "../_shared/espn-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Power 5 + Top programs for featured games
const TOP_CONFERENCES = ["SEC", "Big Ten", "ACC", "Big 12", "Pac-12"];

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
      curatedRank?: { current?: number };
      team: {
        id: string;
        name: string;
        displayName: string;
        abbreviation: string;
        conferenceId?: string;
      };
      score?: string;
    }>;
  }>;
}

interface RankedTeam {
  teamId: string;
  rank: number;
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

    // Cron auth bypass — allows dispatch-syncs to call without user JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-ncaaf-games] Authenticated via cron secret`);
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

      console.log(`[sync-ncaaf-games] Admin user ${userId} authenticated, starting NCAAF games sync via ESPN...`);
    }

    syncLogId = await startSyncLog(supabase, {
      sport: "NCAAF",
      data_type: "games",
      function_name: "sync-ncaaf-games",
      trigger_source: detectTriggerSource(req),
      api_source: "espn",
    });

    // Date range: -7 to +60 days. The lookahead loads the upcoming season's
    // early slate during preseason and the coming weeks in-season; the
    // lookback re-fetches recently played games so their final scores get
    // written (a forward-only window left finals permanently null).
    const LOOKAHEAD_DAYS = 60;
    const LOOKBACK_DAYS = 7;
    const now = new Date();
    const windowStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    // Fetch AP Top 25 rankings
    const rankedTeams: RankedTeam[] = [];
    try {
      const rankingsUrl = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings";
      const rankingsRes = await espnFetch(rankingsUrl);
      if (rankingsRes.ok) {
        const rankingsData = await rankingsRes.json();
        const apPoll = rankingsData.rankings?.find(
          (r: { name?: string }) => r.name?.includes("AP") || r.name?.includes("Poll")
        );
        if (apPoll?.ranks) {
          for (const rank of apPoll.ranks) {
            if (rank.current <= 25 && rank.team?.id) {
              rankedTeams.push({
                teamId: String(rank.team.id),
                rank: rank.current,
              });
            }
          }
        }
        console.log(`Loaded ${rankedTeams.length} ranked NCAAF teams`);
      }
    } catch (err) {
      console.error("Error fetching NCAAF rankings:", err);
    }

    // Get dates across the full lookback + lookahead window
    const dates: string[] = [];
    for (let i = -LOOKBACK_DAYS; i <= LOOKAHEAD_DAYS; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      dates.push(date.toISOString().split("T")[0].replace(/-/g, ""));
    }

    console.log(`Fetching NCAAF games for dates: ${dates.join(", ")}`);

    const allGames: ESPNGame[] = [];
    let scoreboardOk = 0;

    for (const date of dates) {
      try {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${date}&limit=100`;
        const response = await espnFetch(espnUrl);

        if (!response.ok) {
          console.error(`ESPN API error for ${date}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const games = data.events || [];
        console.log(`Found ${games.length} NCAAF games for ${date}`);
        allGames.push(...games);
        scoreboardOk++;
      } catch (err) {
        console.error(`Error fetching date ${date}:`, err);
      }
    }

    // If every scoreboard request failed the upstream is refusing us rather
    // than the slate being empty (see _shared/espn-fetch.ts). Fail loudly:
    // upserting nothing and returning success is how the Aug 19 2026 outage
    // stayed hidden for a week.
    if (scoreboardOk === 0) {
      throw new Error(`All ${dates.length} ESPN NCAAF scoreboard requests failed`);
    }

    // Filter games within the window — including the lookback, so completed
    // games get their scores/is_final upserted instead of being dropped
    const upcomingGames = allGames.filter((game) => {
      const gameDate = new Date(game.date);
      return gameDate >= windowStart && gameDate <= windowEnd;
    });

    console.log(`Filtered to ${upcomingGames.length} games in -${LOOKBACK_DAYS}/+${LOOKAHEAD_DAYS} day window`);

    // Process games
    const processedGames = upcomingGames.map((game) => {
      const competition = game.competitions?.[0];
      const homeTeam = competition?.competitors?.find((c) => c.homeAway === "home");
      const awayTeam = competition?.competitors?.find((c) => c.homeAway === "away");

      const homeRank = rankedTeams.find((t) => t.teamId === homeTeam?.team?.id)?.rank || 
                       homeTeam?.curatedRank?.current || null;
      const awayRank = rankedTeams.find((t) => t.teamId === awayTeam?.team?.id)?.rank || 
                       awayTeam?.curatedRank?.current || null;

      const isCompleted = game.status?.type?.completed === true;
      const homeScore = homeTeam?.score ? parseInt(homeTeam.score) : null;
      const awayScore = awayTeam?.score ? parseInt(awayTeam.score) : null;

      // Season labeled by START year (fan convention: the 2026 season runs
      // Aug 2026 – Jan 2027), derived from the game's own date
      const gameDate = new Date(game.date);
      return {
        external_id: `espn_ncaaf_${game.id}`,
        date: game.date,
        season: gameDate.getMonth() >= 6 ? gameDate.getFullYear() : gameDate.getFullYear() - 1,
        status: game.status?.type?.name || "scheduled",
        home_team_name: homeTeam?.team?.displayName || homeTeam?.team?.name || "TBD",
        visitor_team_name: awayTeam?.team?.displayName || awayTeam?.team?.name || "TBD",
        home_team_id: homeTeam?.team?.id || null,
        visitor_team_id: awayTeam?.team?.id || null,
        home_team_rank: homeRank,
        visitor_team_rank: awayRank,
        venue: competition?.venue?.fullName || null,
        is_featured: (homeRank && homeRank <= 25) || (awayRank && awayRank <= 25),
        home_score: homeScore,
        away_score: awayScore,
        is_final: isCompleted,
        updated_at: new Date().toISOString(),
      };
    });

    // Sync the full slate; ranked matchups keep their is_featured flag so the
    // UI can spotlight them (preseason has no AP poll yet — don't drop games)
    const rankedGames = processedGames.filter(
      (g) => (g.home_team_rank && g.home_team_rank <= 25) || (g.visitor_team_rank && g.visitor_team_rank <= 25)
    );
    const gamesToSync = processedGames;

    console.log(`Syncing ${gamesToSync.length} games (${rankedGames.length} ranked)`);

    // Historical data preserved — no longer deleting old games

    let insertedCount = 0;
    if (gamesToSync.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from("ncaaf_games")
        .upsert(gamesToSync, { onConflict: "external_id" })
        .select("id, home_team_name, visitor_team_name, external_id, date, is_final");

      if (insertError) {
        console.error("Error inserting games:", insertError);
        throw new Error(`Failed to insert games: ${insertError.message}`);
      }

      insertedCount = insertedData?.length || 0;
      console.log(`Upserted ${insertedCount} NCAAF games`);

      // Fetch DraftKings lines from ESPN (free, keyless) for upcoming games.
      // ESPN event ids come straight from external_id, so no fuzzy matching.
      // Games without posted lines simply return nothing (normal for FCS
      // mismatches and far-out dates).
      if (insertedData && insertedData.length > 0) {
        try {
          const oddsTargets = (insertedData as Array<{
            id: string;
            external_id: string;
            date: string;
            is_final: boolean | null;
          }>)
            .filter((g) => {
              if (g.is_final || !g.external_id?.startsWith("espn_ncaaf_")) return false;
              const d = new Date(g.date);
              return d >= now && d <= windowEnd;
            })
            // Cap per run so a dense in-season window stays fast; nearest first
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 250);

          const idFor = (g: { external_id: string }) => g.external_id.replace("espn_ncaaf_", "");
          const oddsMap = await fetchEspnOddsBatch(
            "college-football",
            oddsTargets.map(idFor),
          );

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
              .from("ncaaf_odds")
              .upsert(oddsToUpsert, { onConflict: "game_id,sportsbook" });

            if (oddsError) {
              console.error("Error inserting odds:", oddsError);
            } else {
              console.log(`Upserted ${oddsToUpsert.length} NCAAF odds records via ESPN`);
            }
          } else {
            console.log("No NCAAF odds posted yet for the window");
          }
        } catch (oddsErr) {
          console.error("Error fetching odds:", oddsErr);
        }
      }
    }

    const response = {
      success: true,
      gamesCount: insertedCount,
      rankedGamesCount: rankedGames.length,
      message: `Synced ${insertedCount} NCAAF games (${rankedGames.length} Top 25)`,
    };

    console.log("NCAAF sync completed:", response);

    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: insertedCount,
      details: { total_espn_games: allGames.length, filtered_7d: upcomingGames.length, ranked_games: rankedGames.length },
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-ncaaf-games:", error);
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
