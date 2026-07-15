import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface OddsSnapshot {
  game_id: string;
  sport: string;
  bookmaker: string;
  odds_type: string;
  team: string | null;
  current_line: number | null;
  previous_line: number | null;
  line_movement: string | null;
  opening_line: number | null;
  current_price: number | null;
  previous_price: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let syncLogId: string | null = null;
  const syncStartTime = Date.now();
  let supabase: any;

  try {
    // Parse request body for test mode and sport exclusions
    let testOnly = false;
    let excludeSports: string[] = [];
    try {
      const body = await req.json();
      testOnly = body?.testOnly === true;
      if (Array.isArray(body?.excludeSports)) {
        excludeSports = body.excludeSports;
      }
    } catch {
      // No body or invalid JSON, continue with full sync
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const THE_ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY");
    const BALLDONTLIE_API_KEY = Deno.env.get("BALLDONTLIE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    if (!THE_ODDS_API_KEY && !BALLDONTLIE_API_KEY) {
      throw new Error("Neither THE_ODDS_API_KEY nor BALLDONTLIE_API_KEY configured");
    }

    // Service client for database operations (used by both auth paths)
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cron auth bypass — allows dispatch-syncs to call without user JWT
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
      console.log(`[sync-odds-snapshot] Authenticated via cron secret`);
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
        .single();

      if (roleError || roleData?.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden - admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[sync-odds-snapshot] Admin user ${userId} authenticated`);
    }

    console.log(`[sync-odds-snapshot] Starting odds snapshot sync... (testOnly: ${testOnly})`);

    // Test mode - just verify API connection
    if (testOnly) {
      const testUrl = `https://api.the-odds-api.com/v4/sports?apiKey=${THE_ODDS_API_KEY}`;
      const testResponse = await fetch(testUrl);
      
      if (!testResponse.ok) {
        throw new Error(`The Odds API returned ${testResponse.status}`);
      }

      // Get usage info from headers
      const requestsUsed = parseInt(testResponse.headers.get("x-requests-used") || "0");
      const requestsRemaining = parseInt(testResponse.headers.get("x-requests-remaining") || "0");

      return new Response(
        JSON.stringify({
          success: true,
          message: "The Odds API connection successful",
          usage: {
            requests_used: requestsUsed,
            requests_remaining: requestsRemaining,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    syncLogId = await startSyncLog(supabase, {
      sport: "ALL",
      data_type: "odds_snapshot",
      function_name: "sync-odds-snapshot",
      trigger_source: detectTriggerSource(req),
      api_source: "odds_api+bdl",
    });

    // Skip out-of-season sports to save API quota
    function isSportInSeason(sport: string): boolean {
      const month = new Date().getMonth(); // 0=Jan, 11=Dec
      switch (sport) {
        case "NFL":   return month >= 8 || month <= 0;   // Sep–Jan
        case "NCAAF": return month >= 7 || month <= 0;   // Aug–Jan
        case "MLB":   return month >= 2 && month <= 10;   // Mar–Nov
        case "NBA":   return month >= 9 || month <= 5;    // Oct–Jun
        case "NCAAB": return month >= 10 || month <= 3;   // Nov–Apr
        default:      return true;
      }
    }

    // Sports sourced from The Odds API — feeds odds_history (line movement)
    const oddsApiSports = [
      { key: "americanfootball_nfl", name: "NFL", source: "odds_api" as const },
      { key: "americanfootball_ncaaf", name: "NCAAF", source: "odds_api" as const },
      { key: "baseball_mlb", name: "MLB", source: "odds_api" as const },
    ];
    // Sports sourced from BDL (NBA, NCAAB)
    const bdlSports = [
      { name: "NBA", bdlOddsUrl: "https://api.balldontlie.io/v2/odds", bdlGamesUrl: "https://api.balldontlie.io/v2/games", source: "bdl" as const },
      { name: "NCAAB", bdlOddsUrl: "https://api.balldontlie.io/ncaab/v1/odds", bdlGamesUrl: "https://api.balldontlie.io/ncaab/v1/games", source: "bdl" as const },
    ];

    const allSportNames = [...oddsApiSports.map(s => s.name), ...bdlSports.map(s => s.name)];
    const skippedOffseason = allSportNames.filter(n => !isSportInSeason(n));
    const skippedManual = allSportNames.filter(n => excludeSports.includes(n) && isSportInSeason(n));
    if (skippedOffseason.length > 0) {
      console.log(`[sync-odds-snapshot] Skipping out-of-season: ${skippedOffseason.join(", ")}`);
    }
    if (skippedManual.length > 0) {
      console.log(`[sync-odds-snapshot] Skipping manually disabled: ${skippedManual.join(", ")}`);
    }

    const allowedBooks = ["draftkings", "fanduel", "caesars", "betrivers"];
    const allSnapshots: OddsSnapshot[] = [];
    let totalProcessed = 0;
    let failedSports = 0;
    let requestsUsed = 0;
    let requestsRemaining = 0;
    const perSportCounts: Record<string, number> = {};

    // --- The Odds API sports (NFL) ---
    for (const sport of oddsApiSports) {
      if (!isSportInSeason(sport.name) || excludeSports.includes(sport.name)) continue;
      if (!THE_ODDS_API_KEY) {
        console.log(`[sync-odds-snapshot] Skipping ${sport.name} — THE_ODDS_API_KEY not set`);
        continue;
      }

      try {
        console.log(`Fetching odds for ${sport.name} via The Odds API...`);

        const oddsUrl = `https://api.the-odds-api.com/v4/sports/${sport.key}/odds?apiKey=${THE_ODDS_API_KEY}&markets=spreads,h2h,totals&regions=us&oddsFormat=american`;
        const response = await fetch(oddsUrl);

        requestsUsed = parseInt(response.headers.get("x-requests-used") || String(requestsUsed));
        requestsRemaining = parseInt(response.headers.get("x-requests-remaining") || String(requestsRemaining));

        if (!response.ok) {
          console.error(`Failed to fetch ${sport.name} odds: ${response.status} (used: ${requestsUsed}, remaining: ${requestsRemaining})`);
          failedSports++;
          continue;
        }

        const oddsData = await response.json();
        console.log(`Got ${oddsData.length} games for ${sport.name}`);

        for (const game of oddsData) {
          const gameId = `${sport.key}_${game.id}`;

          for (const bookmaker of game.bookmakers || []) {
            if (!allowedBooks.includes(bookmaker.key.toLowerCase())) continue;

            for (const market of bookmaker.markets || []) {
              if (!["spreads", "h2h", "totals"].includes(market.key)) continue;

              for (const outcome of market.outcomes || []) {
                let oddsType = "";
                let team: string | null = null;
                let line: number | null = null;

                if (market.key === "spreads") {
                  oddsType = "spread";
                  team = outcome.name;
                  line = outcome.point || null;
                } else if (market.key === "h2h") {
                  oddsType = "moneyline";
                  team = outcome.name;
                  line = outcome.price;
                } else if (market.key === "totals") {
                  oddsType = "total";
                  team = outcome.name;
                  line = outcome.point || null;
                }

                allSnapshots.push({
                  game_id: gameId,
                  sport: sport.name,
                  bookmaker: bookmaker.key.toLowerCase(),
                  odds_type: oddsType,
                  team: team,
                  current_line: line,
                  previous_line: null,
                  line_movement: null,
                  opening_line: null,
                  current_price: outcome.price,
                  previous_price: null,
                });
              }
            }
          }
        }

        totalProcessed += oddsData.length;
        perSportCounts[sport.name] = oddsData.length;
      } catch (err) {
        console.error(`Error processing ${sport.name}:`, err);
        failedSports++;
      }
    }

    // --- BDL sports (NBA, NCAAB) ---
    if (BALLDONTLIE_API_KEY) {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      for (const sport of bdlSports) {
        if (!isSportInSeason(sport.name) || excludeSports.includes(sport.name)) continue;

        try {
          console.log(`Fetching odds for ${sport.name} via BDL...`);

          const oddsUrl = `${sport.bdlOddsUrl}?dates[]=${todayStr}&dates[]=${tomorrowStr}`;
          const oddsResponse = await fetch(oddsUrl, {
            headers: { Authorization: BALLDONTLIE_API_KEY },
          });

          if (!oddsResponse.ok) {
            console.error(`Failed to fetch ${sport.name} BDL odds: ${oddsResponse.status}`);
            failedSports++;
            continue;
          }

          const bdlData = await oddsResponse.json();
          const bdlOdds = bdlData.data || [];

          // Fetch BDL games for team name resolution
          const gamesUrl = `${sport.bdlGamesUrl}?dates[]=${todayStr}&dates[]=${tomorrowStr}`;
          const gamesResp = await fetch(gamesUrl, {
            headers: { Authorization: BALLDONTLIE_API_KEY },
          });
          const gamesData = gamesResp.ok ? await gamesResp.json() : { data: [] };
          const bdlGames = gamesData.data || [];

          const bdlGameMap = new Map<number, { home: string; away: string }>();
          for (const g of bdlGames) {
            bdlGameMap.set(g.id, {
              home: g.home_team?.full_name || g.home_team?.name || "",
              away: g.visitor_team?.full_name || g.visitor_team?.name || "",
            });
          }

          // Count unique games processed
          const uniqueGames = new Set<number>();

          for (const odd of bdlOdds) {
            if (!allowedBooks.includes(odd.vendor?.toLowerCase())) continue;

            const bdlGame = bdlGameMap.get(odd.game_id);
            const homeTeam = bdlGame?.home || "Unknown";
            const awayTeam = bdlGame?.away || "Unknown";
            const sportKey = sport.name === "NBA" ? "basketball_nba" : "basketball_ncaab";
            const gameId = `${sportKey}_bdl_${odd.game_id}`;
            uniqueGames.add(odd.game_id);

            const vendor = odd.vendor.toLowerCase();

            // Spread snapshot (home)
            if (odd.spread_home_value != null) {
              allSnapshots.push({
                game_id: gameId,
                sport: sport.name,
                bookmaker: vendor,
                odds_type: "spread",
                team: homeTeam,
                current_line: parseFloat(odd.spread_home_value),
                previous_line: null,
                line_movement: null,
                opening_line: null,
                current_price: odd.spread_home_odds ?? null,
                previous_price: null,
              });
            }
            // Spread snapshot (away)
            if (odd.spread_away_value != null) {
              allSnapshots.push({
                game_id: gameId,
                sport: sport.name,
                bookmaker: vendor,
                odds_type: "spread",
                team: awayTeam,
                current_line: parseFloat(odd.spread_away_value),
                previous_line: null,
                line_movement: null,
                opening_line: null,
                current_price: odd.spread_away_odds ?? null,
                previous_price: null,
              });
            }
            // Moneyline snapshots
            if (odd.moneyline_home_odds != null) {
              allSnapshots.push({
                game_id: gameId,
                sport: sport.name,
                bookmaker: vendor,
                odds_type: "moneyline",
                team: homeTeam,
                current_line: odd.moneyline_home_odds,
                previous_line: null,
                line_movement: null,
                opening_line: null,
                current_price: odd.moneyline_home_odds,
                previous_price: null,
              });
            }
            if (odd.moneyline_away_odds != null) {
              allSnapshots.push({
                game_id: gameId,
                sport: sport.name,
                bookmaker: vendor,
                odds_type: "moneyline",
                team: awayTeam,
                current_line: odd.moneyline_away_odds,
                previous_line: null,
                line_movement: null,
                opening_line: null,
                current_price: odd.moneyline_away_odds,
                previous_price: null,
              });
            }
            // Total snapshots
            if (odd.total_value != null) {
              const totalVal = parseFloat(odd.total_value);
              allSnapshots.push({
                game_id: gameId,
                sport: sport.name,
                bookmaker: vendor,
                odds_type: "total",
                team: "Over",
                current_line: totalVal,
                previous_line: null,
                line_movement: null,
                opening_line: null,
                current_price: odd.total_over_odds ?? null,
                previous_price: null,
              });
              allSnapshots.push({
                game_id: gameId,
                sport: sport.name,
                bookmaker: vendor,
                odds_type: "total",
                team: "Under",
                current_line: totalVal,
                previous_line: null,
                line_movement: null,
                opening_line: null,
                current_price: odd.total_under_odds ?? null,
                previous_price: null,
              });
            }
          }

          totalProcessed += uniqueGames.size;
          perSportCounts[sport.name] = uniqueGames.size;
          console.log(`Got ${uniqueGames.size} games (${bdlOdds.length} odds entries) for ${sport.name} via BDL`);
        } catch (err) {
          console.error(`Error processing ${sport.name} via BDL:`, err);
          failedSports++;
        }

        await new Promise((r) => setTimeout(r, 200));
      }
    } else {
      console.log("[sync-odds-snapshot] BALLDONTLIE_API_KEY not set, skipping NBA/NCAAB");
    }

    console.log(`Processing ${allSnapshots.length} total snapshot entries`);

    // Batch-fetch previous and opening lines to avoid O(n) individual queries
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Build a lookup key for each snapshot
    const snapshotKey = (s: { game_id: string; bookmaker: string; odds_type: string; team: string | null }) =>
      `${s.game_id}|${s.bookmaker}|${s.odds_type}|${s.team || ""}`;

    // Collect unique game_ids for batch query
    const uniqueGameIds = [...new Set(allSnapshots.map((s) => s.game_id))];

    // Batch-fetch all odds_history for these games (latest + oldest per combo)
    const prevMap = new Map<string, { current_line: number | null; current_price: number | null; timestamp: string }>();
    const openingMap = new Map<string, { current_line: number | null }>();

    // Fetch in chunks of 50 game_ids to avoid query size limits
    for (let i = 0; i < uniqueGameIds.length; i += 50) {
      const gameIdBatch = uniqueGameIds.slice(i, i + 50);

      try {
        // Get all history rows for this batch of games, ordered by timestamp desc
        const { data: historyRows } = await supabase
          .from("odds_history")
          .select("game_id, bookmaker, odds_type, team, current_line, current_price, timestamp")
          .in("game_id", gameIdBatch)
          .order("timestamp", { ascending: false });

        if (historyRows?.length) {
          for (const row of historyRows) {
            const key = snapshotKey(row);
            // First occurrence (desc order) = most recent = previous
            if (!prevMap.has(key)) {
              prevMap.set(key, {
                current_line: row.current_line,
                current_price: row.current_price,
                timestamp: row.timestamp,
              });
            }
            // Keep overwriting = last occurrence (desc order) = oldest = opening
            openingMap.set(key, { current_line: row.current_line });
          }
        }
      } catch (err) {
        console.error(`Error batch-fetching odds_history chunk ${i / 50 + 1}:`, err);
      }
    }

    console.log(`Fetched history for ${prevMap.size} unique combos across ${uniqueGameIds.length} games`);

    // Apply previous/opening values and calculate movement
    for (const snapshot of allSnapshots) {
      const key = snapshotKey(snapshot);
      const prevSnapshot = prevMap.get(key);
      const openingSnapshot = openingMap.get(key);

      if (prevSnapshot) {
        snapshot.previous_line = prevSnapshot.current_line;
        snapshot.previous_price = prevSnapshot.current_price;

        // Calculate movement
        if (snapshot.current_line !== null && prevSnapshot.current_line !== null) {
          const diff = snapshot.current_line - prevSnapshot.current_line;
          if (Math.abs(diff) >= 1.5) {
            const prevTime = new Date(prevSnapshot.timestamp);
            const isRecent = prevTime >= new Date(thirtyMinsAgo);
            snapshot.line_movement = isRecent ? "steam" : (diff > 0 ? "up" : "down");
          } else if (Math.abs(diff) >= 0.5) {
            snapshot.line_movement = diff > 0 ? "up" : "down";
          } else {
            snapshot.line_movement = "neutral";
          }
        }
      }

      if (openingSnapshot) {
        snapshot.opening_line = openingSnapshot.current_line;
      } else {
        snapshot.opening_line = snapshot.current_line;
      }
    }

    // Insert all snapshots
    if (allSnapshots.length > 0) {
      // Batch insert in chunks of 100
      for (let i = 0; i < allSnapshots.length; i += 100) {
        const batch = allSnapshots.slice(i, i + 100);
        const { error: insertError } = await supabase.from("odds_history").insert(batch);

        if (insertError) {
          console.error(`Error inserting batch ${i / 100 + 1}:`, insertError);
        }
      }
    }

    console.log(`Inserted ${allSnapshots.length} odds history records`);

    const result = {
      success: true,
      snapshotsCreated: allSnapshots.length,
      gamesProcessed: totalProcessed,
      message: `Created ${allSnapshots.length} odds snapshots from ${totalProcessed} games`,
    };

    const totalSportsAttempted = Object.keys(perSportCounts).length + failedSports;
    const allFailed = failedSports === totalSportsAttempted && totalSportsAttempted > 0;
    await completeSyncLog(supabase, syncLogId, syncStartTime, {
      status: allFailed ? "failed" : "success",
      records_added: allSnapshots.length,
      api_requests_used: requestsUsed,
      api_requests_remaining: requestsRemaining,
      error_message: allFailed ? `All ${failedSports} sports failed (quota exhausted?)` : undefined,
      details: { games_processed: totalProcessed, per_sport: perSportCounts, skipped_offseason: skippedOffseason, skipped_manual: skippedManual, failed_sports: failedSports },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-odds-snapshot:", error);
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
