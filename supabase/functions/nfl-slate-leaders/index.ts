import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { bdlNflFetch, bdlNflFetchAll } from "../_shared/bdl-nfl.ts";
import { currentNflSeason } from "../_shared/nfl-sync.ts";
import { pairByValue, teamLeaders, type BDLTeam, type SeasonLine } from "./leaders.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sep 2026 rewrite. The previous version was built for Super Bowl LX
// (Feb 2026) and kept that game's hardcoding into the 2026 season: a forced
// "starter" list that would have shown DK Metcalf as a Seahawk, an exclusion
// list that hid Geno Smith, manual stat overrides, and a roster read of
// /players?team_ids[] (every player in franchise history, 500+ per team, of
// which only the first 100 by id were read, so recent draftees could never
// appear). Now each side's leaders come straight from BDL season stats
// filtered by team: two calls, no hand-maintained lists.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid user session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get('BALLDONTLIE_API_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!apiKey) {
      throw new Error('BALLDONTLIE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const season = currentNflSeason();

    // Step 1: next game from our database (authoritative schedule)
    const nowIso = new Date().toISOString();
    const { data: upcomingGames, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('league', 'NFL')
      .gt('date', nowIso)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .limit(1);

    if (gamesError) {
      console.error('[NFL-Slate] Database error:', gamesError);
      throw new Error('Failed to fetch games from database');
    }

    let nextGame = upcomingGames?.[0];

    // No future games: fall back to the most recent postseason game
    if (!nextGame) {
      const { data: postseasonGames } = await supabase
        .from('games')
        .select('*')
        .eq('league', 'NFL')
        .eq('postseason', true)
        .eq('season', season)
        .order('date', { ascending: false })
        .limit(1);
      nextGame = postseasonGames?.[0];
    }

    if (!nextGame) {
      return new Response(
        JSON.stringify({
          game: null,
          leaders: { passing: [], rushing: [], receiving: [] },
          message: `No games found for the ${season} NFL season.`,
          seasonComplete: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isPlayoffs = nextGame.postseason === true;
    // BDL numbers postseason weeks 1-5; week 5 is the Super Bowl
    const isSuperBowl = isPlayoffs && (nextGame.week ?? 0) >= 5;

    // Step 2: BDL team ids (DB team names are BDL full_name values)
    const teamsResult = await bdlNflFetch(apiKey, '/teams');
    const teams: BDLTeam[] = teamsResult.data || [];
    const byName = (name: string) =>
      teams.find((t) => t.full_name.toLowerCase() === name.toLowerCase()) ??
      teams.find((t) => name.toLowerCase().endsWith(` ${t.name.toLowerCase()}`)) ??
      null;
    const homeTeam = byName(nextGame.home_team_name);
    const awayTeam = byName(nextGame.visitor_team_name);

    if (!homeTeam || !awayTeam) {
      console.error(`[NFL-Slate] Team mapping failed: ${nextGame.visitor_team_name} @ ${nextGame.home_team_name}`);
      return new Response(
        JSON.stringify({
          game: {
            id: nextGame.id,
            date: nextGame.date,
            datetime: nextGame.date,
            week: nextGame.week,
            postseason: nextGame.postseason,
            status: nextGame.status,
            home_team: { id: 0, abbreviation: '???', full_name: nextGame.home_team_name, name: nextGame.home_team_name.split(' ').pop() },
            visitor_team: { id: 0, abbreviation: '???', full_name: nextGame.visitor_team_name, name: nextGame.visitor_team_name.split(' ').pop() },
          },
          leaders: { passing: [], rushing: [], receiving: [] },
          message: 'Team mapping failed. Stats unavailable.',
          isSuperBowl,
          isPlayoffs,
          seasonComplete: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: each side's season lines, one filtered call per team. Early in
    // a season with no lines yet (Week 1 kickoff), fall back to last season.
    const fetchTeam = (teamId: number, s: number) =>
      bdlNflFetchAll(apiKey, '/season_stats', [
        ['season', s],
        ['team_id', teamId],
        ['postseason', 'false'],
      ]) as Promise<SeasonLine[]>;

    let statsSeason = season;
    let [homeLines, awayLines] = await Promise.all([fetchTeam(homeTeam.id, season), fetchTeam(awayTeam.id, season)]);
    if (homeLines.length === 0 && awayLines.length === 0) {
      statsSeason = season - 1;
      [homeLines, awayLines] = await Promise.all([fetchTeam(homeTeam.id, statsSeason), fetchTeam(awayTeam.id, statsSeason)]);
    }

    const home = teamLeaders(homeLines, homeTeam);
    const away = teamLeaders(awayLines, awayTeam);

    const pair = pairByValue;

    const response = {
      game: {
        id: nextGame.id,
        date: nextGame.date,
        time: null,
        datetime: nextGame.date,
        week: nextGame.week,
        postseason: nextGame.postseason,
        status: nextGame.status,
        home_team: homeTeam,
        visitor_team: awayTeam,
      },
      leaders: {
        passing: pair(away.passing, home.passing),
        rushing: pair(away.rushing, home.rushing),
        receiving: pair(away.receiving, home.receiving),
      },
      isSuperBowl,
      isPlayoffs,
      seasonComplete: false,
      statsSource: statsSeason === season
        ? `${season} Regular Season`
        : `${statsSeason} Regular Season (no ${season} stats yet)`,
    };

    console.log(`[NFL-Slate] ${awayTeam.abbreviation} @ ${homeTeam.abbreviation}: ${homeLines.length + awayLines.length} season lines (${statsSeason})`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[NFL-Slate] Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        error: 'An error occurred while fetching NFL slate data. Please try again.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
