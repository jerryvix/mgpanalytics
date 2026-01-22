import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// High-profile conferences for featured games
const TOP_CONFERENCES = ["ACC", "Big Ten", "Big 12", "SEC", "Big East", "Pac-12", "American"];

interface ESPNGame {
  id: string;
  date: string;
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
    competitors: Array<{
      id: string;
      homeAway: string;
      curatedRank?: {
        current: number;
      };
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
  team: {
    id: string;
    name: string;
    displayName: string;
  };
  current: number; // rank
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting NCAAB games sync via ESPN...");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const THE_ODDS_API_KEY = Deno.env.get("THE_ODDS_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calculate date range: now to +24 hours
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Fetch AP Top 25 rankings
    let rankedTeams: Map<string, number> = new Map();
    try {
      const rankingsUrl = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings";
      const rankingsResponse = await fetch(rankingsUrl);
      if (rankingsResponse.ok) {
        const rankingsData = await rankingsResponse.json();
        // Find AP Poll
        const apPoll = rankingsData.rankings?.find(
          (r: { name: string }) => r.name === "AP Top 25" || r.name.includes("AP")
        );
        if (apPoll?.ranks) {
          for (const rank of apPoll.ranks) {
            if (rank.team?.id) {
              rankedTeams.set(rank.team.id, rank.current);
            }
          }
        }
        console.log(`Loaded ${rankedTeams.size} AP Top 25 teams`);
      }
    } catch (err) {
      console.error("Error fetching rankings:", err);
    }

    // Get today and tomorrow for 24-hour window
    const dates: string[] = [];
    for (let i = 0; i < 2; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      dates.push(date.toISOString().split("T")[0].replace(/-/g, ""));
    }

    console.log(`Fetching NCAAB games for dates: ${dates.join(", ")}`);

    const allGames: ESPNGame[] = [];

    for (const date of dates) {
      try {
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&limit=100`;
        const response = await fetch(espnUrl);

        if (!response.ok) {
          console.error(`ESPN API error for ${date}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const games = data.events || [];
        console.log(`Found ${games.length} NCAAB games for ${date}`);
        allGames.push(...games);
      } catch (err) {
        console.error(`Error fetching date ${date}:`, err);
      }
    }

    // Filter games within 24-hour window
    const upcomingGames = allGames.filter((game) => {
      const gameDate = new Date(game.date);
      return gameDate >= now && gameDate <= in24Hours;
    });

    console.log(`Filtered to ${upcomingGames.length} games in 24-hour window`);

    // Process games - categorize as ranked or featured
    const processedGames: Array<{
      external_id: string;
      date: string;
      season: number;
      status: string;
      home_team_name: string;
      visitor_team_name: string;
      home_team_id: string | null;
      visitor_team_id: string | null;
      home_team_rank: number | null;
      visitor_team_rank: number | null;
      home_team_conference: string | null;
      visitor_team_conference: string | null;
      is_featured: boolean;
    }> = [];

    for (const game of upcomingGames) {
      const competition = game.competitions?.[0];
      const homeTeam = competition?.competitors?.find((c) => c.homeAway === "home");
      const awayTeam = competition?.competitors?.find((c) => c.homeAway === "away");

      if (!homeTeam || !awayTeam) continue;

      const homeRank = homeTeam.curatedRank?.current || rankedTeams.get(homeTeam.team.id) || null;
      const awayRank = awayTeam.curatedRank?.current || rankedTeams.get(awayTeam.team.id) || null;

      // Only include ranked games (at least one team in top 25)
      const isRanked = (homeRank !== null && homeRank <= 25) || (awayRank !== null && awayRank <= 25);

      processedGames.push({
        external_id: `espn_ncaab_${game.id}`,
        date: game.date,
        season: 2025,
        status: game.status?.type?.name || "scheduled",
        home_team_name: homeTeam.team.displayName || homeTeam.team.name,
        visitor_team_name: awayTeam.team.displayName || awayTeam.team.name,
        home_team_id: homeTeam.team.id || null,
        visitor_team_id: awayTeam.team.id || null,
        home_team_rank: homeRank && homeRank <= 25 ? homeRank : null,
        visitor_team_rank: awayRank && awayRank <= 25 ? awayRank : null,
        home_team_conference: null, // ESPN doesn't always provide this in scoreboard
        visitor_team_conference: null,
        is_featured: !isRanked, // If not ranked, mark as featured
      });
    }

    // Separate ranked and featured games
    const rankedGames = processedGames.filter(
      (g) => g.home_team_rank !== null || g.visitor_team_rank !== null
    );
    const featuredCandidates = processedGames.filter(
      (g) => g.home_team_rank === null && g.visitor_team_rank === null
    );

    console.log(`Found ${rankedGames.length} ranked games, ${featuredCandidates.length} unranked games`);

    // If no ranked games, select ~5 featured games
    let gamesToInsert = rankedGames;
    if (rankedGames.length === 0 && featuredCandidates.length > 0) {
      // Take first 5 games as featured (they're already sorted by ESPN priority)
      gamesToInsert = featuredCandidates.slice(0, 5);
      console.log(`No ranked games found, using ${gamesToInsert.length} featured games`);
    }

    // Clean up old games first (older than 48 hours)
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await supabase.from("ncaab_games").delete().lt("date", cutoffDate);

    let insertedCount = 0;
    if (gamesToInsert.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from("ncaab_games")
        .upsert(gamesToInsert, { onConflict: "external_id" })
        .select("id, home_team_name, visitor_team_name");

      if (insertError) {
        console.error("Error inserting games:", insertError);
        throw new Error(`Failed to insert games: ${insertError.message}`);
      }

      insertedCount = insertedData?.length || 0;
      console.log(`Upserted ${insertedCount} NCAAB games`);

      // Fetch odds from The Odds API if available
      if (THE_ODDS_API_KEY && insertedData && insertedData.length > 0) {
        try {
          const oddsUrl = `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds?apiKey=${THE_ODDS_API_KEY}&markets=spreads,h2h,totals&regions=us&oddsFormat=american`;
          const oddsResponse = await fetch(oddsUrl);

          if (oddsResponse.ok) {
            const oddsData = await oddsResponse.json();
            console.log(`Fetched odds for ${oddsData.length} NCAAB games`);

            const oddsToUpsert: Array<{
              game_id: string;
              sportsbook: string;
              spread_value: number | null;
              spread_odds: number | null;
              moneyline_home: number | null;
              moneyline_away: number | null;
              total_value: number | null;
              total_over_odds: number | null;
              total_under_odds: number | null;
            }> = [];

            for (const oddsGame of oddsData) {
              // Match by team names (fuzzy match)
              const matchedGame = insertedData.find((g) => {
                const normalizeTeam = (name: string) =>
                  name.toLowerCase().replace(/[^a-z]/g, "");
                const homeNorm = normalizeTeam(g.home_team_name);
                const awayNorm = normalizeTeam(g.visitor_team_name);
                const oddsHomeNorm = normalizeTeam(oddsGame.home_team);
                const oddsAwayNorm = normalizeTeam(oddsGame.away_team);

                return (
                  (homeNorm.includes(oddsHomeNorm.slice(-8)) ||
                    oddsHomeNorm.includes(homeNorm.slice(-8))) &&
                  (awayNorm.includes(oddsAwayNorm.slice(-8)) ||
                    oddsAwayNorm.includes(awayNorm.slice(-8)))
                );
              });

              if (!matchedGame) continue;

              const allowedBooks = ["draftkings", "fanduel", "caesars", "betrivers"];
              for (const bookmaker of oddsGame.bookmakers || []) {
                if (!allowedBooks.includes(bookmaker.key.toLowerCase())) continue;

                let spreadValue: number | null = null;
                let spreadOdds: number | null = null;
                let moneylineHome: number | null = null;
                let moneylineAway: number | null = null;
                let totalValue: number | null = null;
                let totalOverOdds: number | null = null;
                let totalUnderOdds: number | null = null;

                for (const market of bookmaker.markets || []) {
                  if (market.key === "spreads") {
                    const homeOutcome = market.outcomes.find((o: { name: string }) =>
                      oddsGame.home_team.includes(o.name) || o.name.includes(oddsGame.home_team.split(" ").pop())
                    );
                    if (homeOutcome) {
                      spreadValue = homeOutcome.point || null;
                      spreadOdds = homeOutcome.price;
                    }
                  }
                  if (market.key === "h2h") {
                    for (const outcome of market.outcomes) {
                      if (oddsGame.home_team.includes(outcome.name) || outcome.name.includes(oddsGame.home_team.split(" ").pop())) {
                        moneylineHome = outcome.price;
                      } else {
                        moneylineAway = outcome.price;
                      }
                    }
                  }
                  if (market.key === "totals") {
                    for (const outcome of market.outcomes) {
                      if (outcome.name === "Over") {
                        totalValue = outcome.point || null;
                        totalOverOdds = outcome.price;
                      } else if (outcome.name === "Under") {
                        totalUnderOdds = outcome.price;
                      }
                    }
                  }
                }

                oddsToUpsert.push({
                  game_id: matchedGame.id,
                  sportsbook: bookmaker.key.toLowerCase(),
                  spread_value: spreadValue,
                  spread_odds: spreadOdds,
                  moneyline_home: moneylineHome,
                  moneyline_away: moneylineAway,
                  total_value: totalValue,
                  total_over_odds: totalOverOdds,
                  total_under_odds: totalUnderOdds,
                });
              }
            }

            if (oddsToUpsert.length > 0) {
              const { error: oddsError } = await supabase
                .from("ncaab_odds")
                .upsert(oddsToUpsert, { onConflict: "game_id,sportsbook" });

              if (oddsError) {
                console.error("Error inserting odds:", oddsError);
              } else {
                console.log(`Upserted ${oddsToUpsert.length} NCAAB odds records`);
              }
            }
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
      featuredGamesCount: gamesToInsert.length - rankedGames.length,
      message: `Synced ${insertedCount} NCAAB games (${rankedGames.length} ranked) for next 24 hours`,
    };

    console.log("NCAAB sync completed:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in sync-ncaab-games:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
