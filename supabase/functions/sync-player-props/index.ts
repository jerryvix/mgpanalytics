import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports";

// Markets to fetch per sport
const SPORT_MARKETS: Record<string, { key: string; markets: string[] }> = {
  NFL: {
    key: "americanfootball_nfl",
    markets: [
      "player_pass_yds",
      "player_pass_tds",
      "player_rush_yds",
      "player_receptions",
      "player_reception_yds",
      "player_anytime_td",
    ],
  },
  NBA: {
    key: "basketball_nba",
    markets: [
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes",
      "player_points_rebounds_assists",
    ],
  },
};

const ALLOWED_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "betrivers"];

// Normalize a player name for fuzzy matching:
// lowercase, strip periods/apostrophes, strip suffixes (Jr, Sr, II, III, IV, V),
// collapse whitespace
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.']/g, "")          // "T.J." → "TJ", "De'Aaron" → "DeAaron"
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "") // strip suffixes
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize The Odds API market keys to our prop_type values
function normalizePropType(market: string): string {
  const map: Record<string, string> = {
    player_pass_yds: "passing_yards",
    player_pass_tds: "passing_touchdowns",
    player_rush_yds: "rushing_yards",
    player_receptions: "receptions",
    player_reception_yds: "receiving_yards",
    player_anytime_td: "anytime_touchdown",
    player_points: "points",
    player_rebounds: "rebounds",
    player_assists: "assists",
    player_threes: "threes",
    player_points_rebounds_assists: "pts+reb+ast",
  };
  return map[market] || market;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let syncLogId: string | null = null;
  const syncStartTime = Date.now();
  let totalPropsAdded = 0;
  let requestsUsed = 0;
  let requestsRemaining = 0;
  let supabase: any;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const THE_ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    if (!THE_ODDS_API_KEY) {
      throw new Error(
        "THE_ODDS_API_KEY not configured - add it in Supabase project secrets"
      );
    }

    // Service client for database operations (used by both auth paths)
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron auth bypass — allows dispatch-syncs to call without user JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-player-props] Authenticated via cron secret`);
    } else {
      // Authenticate user - require admin role
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - no token" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const {
        data: { user },
        error: userError,
      } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized - invalid token" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Forbidden - admin access required",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Parse optional request body for sport filter
    let sportFilter: string | null = null;
    try {
      const body = await req.json();
      sportFilter = body?.sport || null;
    } catch {
      // No body, sync all sports
    }

    const sportsToSync = sportFilter
      ? Object.entries(SPORT_MARKETS).filter(([k]) => k === sportFilter)
      : Object.entries(SPORT_MARKETS);

    console.log(
      `[sync-player-props] Starting props sync for: ${sportsToSync.map(([k]) => k).join(", ")}`
    );

    // Start sync log
    const triggerSource = detectTriggerSource(req);
    syncLogId = await startSyncLog(supabase, {
      sport: sportFilter || "ALL",
      data_type: "player_props",
      function_name: "sync-player-props",
      trigger_source: triggerSource,
      api_source: "the_odds_api",
    });

    let totalEventsProcessed = 0;
    const unmatchedNames: string[] = [];
    const fuzzyMatchedNames: string[] = [];

    for (const [sport, config] of sportsToSync) {
      try {
        // Step 1: Get upcoming events for this sport
        const eventsUrl = `${ODDS_API_BASE}/${config.key}/events?apiKey=${THE_ODDS_API_KEY}`;
        const eventsResponse = await fetch(eventsUrl);

        if (!eventsResponse.ok) {
          console.error(
            `[sync-player-props] Failed to fetch ${sport} events: ${eventsResponse.status}`
          );
          continue;
        }

        const events = await eventsResponse.json();
        requestsUsed = parseInt(
          eventsResponse.headers.get("x-requests-used") || "0"
        );
        requestsRemaining = parseInt(
          eventsResponse.headers.get("x-requests-remaining") || "0"
        );

        // Filter to events starting within the next 48 hours
        const now = new Date();
        const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const upcomingEvents = events.filter((e: { commence_time: string }) => {
          const start = new Date(e.commence_time);
          return start >= now && start <= cutoff;
        });

        console.log(
          `[sync-player-props] ${sport}: ${upcomingEvents.length} events in next 48h (of ${events.length} total)`
        );

        if (upcomingEvents.length === 0) continue;

        // Mark old props inactive for this sport before importing new ones
        const today = new Date().toISOString().split("T")[0];
        await supabase
          .from("player_props")
          .update({ is_active: false })
          .eq("sport", sport)
          .lt("game_date", today);

        // Step 2: For each event, fetch player props
        const marketsParam = config.markets.join(",");

        for (const event of upcomingEvents) {
          try {
            const propsUrl = `${ODDS_API_BASE}/${config.key}/events/${event.id}/odds?apiKey=${THE_ODDS_API_KEY}&markets=${marketsParam}&regions=us&oddsFormat=american`;
            const propsResponse = await fetch(propsUrl);

            requestsUsed = parseInt(
              propsResponse.headers.get("x-requests-used") || String(requestsUsed)
            );
            requestsRemaining = parseInt(
              propsResponse.headers.get("x-requests-remaining") ||
                String(requestsRemaining)
            );

            if (!propsResponse.ok) {
              console.error(
                `[sync-player-props] ${sport} event ${event.id}: ${propsResponse.status}`
              );
              continue;
            }

            const propsData = await propsResponse.json();
            const gameDate = event.commence_time?.split("T")[0] || today;
            const homeTeam = event.home_team || null;
            const awayTeam = event.away_team || null;

            const propsToUpsert: {
              sport: string;
              sportsbook: string;
              prop_type: string;
              player_name: string;
              line: number;
              over_odds: number | null;
              under_odds: number | null;
              game_date: string;
              opponent_team: string | null;
              external_game_id: string;
              is_active: boolean;
            }[] = [];

            for (const bookmaker of propsData.bookmakers || []) {
              if (!ALLOWED_BOOKS.includes(bookmaker.key.toLowerCase()))
                continue;

              const bookName = formatBookName(bookmaker.key);

              for (const market of bookmaker.markets || []) {
                const propType = normalizePropType(market.key);

                // Group outcomes by player description to pair over/under
                const playerOutcomes: Record<
                  string,
                  { over: number | null; under: number | null; line: number }
                > = {};

                for (const outcome of market.outcomes || []) {
                  const playerName = outcome.description;
                  if (!playerName) continue;

                  if (!playerOutcomes[playerName]) {
                    playerOutcomes[playerName] = {
                      over: null,
                      under: null,
                      line: outcome.point ?? 0,
                    };
                  }

                  if (outcome.name === "Over") {
                    playerOutcomes[playerName].over = outcome.price;
                    playerOutcomes[playerName].line = outcome.point ?? 0;
                  } else if (outcome.name === "Under") {
                    playerOutcomes[playerName].under = outcome.price;
                  }
                }

                for (const [playerName, odds] of Object.entries(
                  playerOutcomes
                )) {
                  propsToUpsert.push({
                    sport,
                    sportsbook: bookName,
                    prop_type: propType,
                    player_name: playerName,
                    line: odds.line,
                    over_odds: odds.over,
                    under_odds: odds.under,
                    game_date: gameDate,
                    opponent_team: awayTeam,
                    external_game_id: event.id,
                    is_active: true,
                  });
                }
              }
            }

            // Match player names to player_id from our players table
            if (propsToUpsert.length > 0) {
              const uniqueNames = [
                ...new Set(propsToUpsert.map((p) => p.player_name)),
              ];

              // Pass 1: Exact match by name
              const { data: exactPlayers } = await supabase
                .from("players")
                .select("id, name")
                .eq("sport", sport)
                .in("name", uniqueNames);

              const nameToId: Record<string, string> = {};
              for (const p of exactPlayers || []) {
                nameToId[p.name] = p.id;
              }

              // Pass 2: Fuzzy match for unmatched names
              const stillUnmatched = uniqueNames.filter((n) => !nameToId[n]);
              if (stillUnmatched.length > 0) {
                // Fetch all players for this sport to build normalized lookup
                const { data: allPlayers } = await supabase
                  .from("players")
                  .select("id, name")
                  .eq("sport", sport);

                const normalizedMap = new Map<string, { id: string; name: string }>();
                for (const p of allPlayers || []) {
                  normalizedMap.set(normalizeName(p.name), p);
                }

                for (const apiName of stillUnmatched) {
                  const normalized = normalizeName(apiName);
                  const match = normalizedMap.get(normalized);
                  if (match) {
                    nameToId[apiName] = match.id;
                    fuzzyMatchedNames.push(`${apiName} → ${match.name}`);
                  } else {
                    unmatchedNames.push(apiName);
                  }
                }

                if (stillUnmatched.length > 0) {
                  console.log(
                    `[sync-player-props] ${sport}: ${stillUnmatched.length} names needed fuzzy match, ` +
                    `${stillUnmatched.length - unmatchedNames.length} resolved, ${unmatchedNames.length} unmatched`
                  );
                }
              }

              // Upsert props in batches
              const dbRows = propsToUpsert.map((prop) => ({
                player_id: nameToId[prop.player_name] || null,
                sport: prop.sport,
                sportsbook: prop.sportsbook,
                prop_type: prop.prop_type,
                line: prop.line,
                over_odds: prop.over_odds,
                under_odds: prop.under_odds,
                game_date: prop.game_date,
                opponent_team: prop.opponent_team,
                external_game_id: prop.external_game_id,
                is_active: prop.is_active,
              }));

              for (let i = 0; i < dbRows.length; i += 100) {
                const batch = dbRows.slice(i, i + 100);
                const { error: upsertError } = await supabase
                  .from("player_props")
                  .upsert(batch, {
                    onConflict: "player_id,sportsbook,prop_type,game_date",
                  });

                if (upsertError) {
                  console.error(
                    `[sync-player-props] Upsert error for ${sport} event ${event.id}:`,
                    upsertError.message
                  );
                }
              }

              totalPropsAdded += dbRows.length;
            }

            totalEventsProcessed++;

            // Rate limit: small delay between events
            await new Promise((r) => setTimeout(r, 150));
          } catch (eventErr) {
            console.error(
              `[sync-player-props] Error processing event ${event.id}:`,
              eventErr
            );
          }
        }
      } catch (sportErr) {
        console.error(
          `[sync-player-props] Error processing ${sport}:`,
          sportErr
        );
      }
    }

    // Update sync_schedule
    for (const [sport] of sportsToSync) {
      await supabase
        .from("sync_schedule")
        .upsert(
          {
            sport,
            data_type: "props",
            last_sync_at: new Date().toISOString(),
            last_sync_status: "success",
          },
          { onConflict: "sport,data_type" }
        );
    }

    const result = {
      success: true,
      propsAdded: totalPropsAdded,
      eventsProcessed: totalEventsProcessed,
      usage: {
        requests_used: requestsUsed,
        requests_remaining: requestsRemaining,
      },
      message: `Synced ${totalPropsAdded} props from ${totalEventsProcessed} events`,
    };

    console.log(`[sync-player-props] Complete:`, result);

    // Complete sync log — success
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "success",
      records_added: totalPropsAdded,
      api_requests_used: requestsUsed,
      api_requests_remaining: requestsRemaining,
      details: {
        events_processed: totalEventsProcessed,
        sports_synced: sportsToSync.map(([k]) => k),
        fuzzy_matched: fuzzyMatchedNames.length > 0 ? fuzzyMatchedNames : undefined,
        unmatched_names: unmatchedNames.length > 0 ? unmatchedNames : undefined,
      },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[sync-player-props] Error:", error);

    // Complete sync log — failure
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: "failed",
      records_added: totalPropsAdded,
      api_requests_used: requestsUsed,
      api_requests_remaining: requestsRemaining,
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

function formatBookName(key: string): string {
  const names: Record<string, string> = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    betmgm: "BetMGM",
    caesars: "Caesars",
    betrivers: "BetRivers",
  };
  return names[key.toLowerCase()] || key;
}
