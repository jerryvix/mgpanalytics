import { supabase } from "@/integrations/supabase/client";

interface PlayerProp {
  id: string;
  prop_type: string;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  sportsbook: string;
  opponent_team?: string;
  game_date: string;
}

interface PlayerWithProps {
  id: string;
  name: string;
  team_name: string;
  props: PlayerProp[];
  seasonAvg?: {
    points_per_game?: number;
    rebounds_per_game?: number;
    assists_per_game?: number;
  };
}

const formatOdds = (odds: number | null): string => {
  if (odds === null || odds === undefined) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
};

const getPropTypeLabel = (propType: string): string => {
  const labels: Record<string, string> = {
    points: "Points",
    rebounds: "Rebounds",
    assists: "Assists",
    threes: "3-Pointers",
    blocks: "Blocks",
    steals: "Steals",
    turnovers: "Turnovers",
    "pts+reb+ast": "PTS+REB+AST",
    "pts+reb": "PTS+REB",
    "pts+ast": "PTS+AST",
    "reb+ast": "REB+AST",
  };
  return labels[propType] || propType;
};

const getSportsbookLabel = (sportsbook: string): string => {
  const labels: Record<string, string> = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    betmgm: "BetMGM",
    caesars: "Caesars",
    pointsbet: "PointsBet",
  };
  return labels[sportsbook.toLowerCase()] || sportsbook;
};

// Check if query is about NBA player props
export function shouldHandleNbaPropsQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Must mention props, betting, over/under, line, or specific prop terms
  const propsPatterns = [
    /\bprops?\b/,
    /\bover\s*\/?\s*under\b/,
    /\bo\/u\b/,
    /\bpoints?\s+line\b/,
    /\brebounds?\s+line\b/,
    /\bassists?\s+line\b/,
    /\bbest\s+(points?|rebounds?|assists?)\s+prop/,
    /\btonight'?s?\s+props?\b/,
    /\bpoints?\s+prop\b/,
    /\brebounds?\s+prop\b/,
    /\bassists?\s+prop\b/,
  ];

  // Must also mention NBA or a player name context
  const nbaPatterns = [
    /\bnba\b/,
    /\bbasketball\b/,
    /\bceltics\b|\blakers\b|\bwarriors\b|\bheat\b|\bnets\b|\bknicks\b/,
    /lebron|curry|tatum|durant|giannis|jokic|doncic|morant|embiid/i,
  ];

  const hasPropsPattern = propsPatterns.some(pattern => pattern.test(lowerQuery));
  const hasNbaContext = nbaPatterns.some(pattern => pattern.test(lowerQuery));

  return hasPropsPattern || (hasNbaContext && lowerQuery.includes('prop'));
}

// Extract player name from query
function extractPlayerName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // Common player names to look for
  const knownPlayers = [
    "lebron james", "stephen curry", "kevin durant", "giannis antetokounmpo",
    "jayson tatum", "luka doncic", "nikola jokic", "joel embiid", "ja morant",
    "anthony davis", "jimmy butler", "damian lillard", "devin booker",
    "donovan mitchell", "trae young", "zion williamson", "anthony edwards",
    "lamelo ball", "paolo banchero", "victor wembanyama", "shai gilgeous-alexander"
  ];

  for (const player of knownPlayers) {
    if (lowerQuery.includes(player)) {
      return player;
    }
    // Check for last name only
    const lastName = player.split(' ').pop()!;
    const regex = new RegExp(`\\b${lastName}\\b`, 'i');
    if (regex.test(lowerQuery) && lastName.length > 4) {
      return player;
    }
  }

  // Try to extract name patterns like "What are X's props" or "X props"
  const namePatterns = [
    /what\s+are\s+([a-z]+(?:\s+[a-z]+)?)'?s?\s+props/i,
    /([a-z]+(?:\s+[a-z]+)?)'?s?\s+props/i,
    /props?\s+for\s+([a-z]+(?:\s+[a-z]+)?)/i,
    /([a-z]+(?:\s+[a-z]+)?)\s+over\s*\/?\s*under/i,
  ];

  for (const pattern of namePatterns) {
    const match = lowerQuery.match(pattern);
    if (match && match[1] && match[1].length > 3) {
      return match[1].trim();
    }
  }

  return null;
}

// Extract specific prop type from query
function extractPropType(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  if (/\bpoints?\b/.test(lowerQuery) && !/pts\+/.test(lowerQuery)) return "points";
  if (/\brebounds?\b/.test(lowerQuery)) return "rebounds";
  if (/\bassists?\b/.test(lowerQuery)) return "assists";
  if (/\bthrees?\b|\b3-?pointers?\b|\b3pm\b/.test(lowerQuery)) return "threes";
  if (/\bblocks?\b/.test(lowerQuery)) return "blocks";
  if (/\bsteals?\b/.test(lowerQuery)) return "steals";
  
  return null;
}

// Handle NBA props query
export async function handleNbaPropsQuery(query: string): Promise<string | null> {
  const playerName = extractPlayerName(query);
  const propType = extractPropType(query);
  const today = new Date().toISOString().split('T')[0];

  // If no player specified, check for team-based queries
  if (!playerName) {
    // Check for "best points prop for [team]" pattern
    const teamPattern = /best\s+(\w+)\s+prop\s+(?:for\s+)?(?:the\s+)?(\w+)/i;
    const teamMatch = query.match(teamPattern);
    
    if (teamMatch) {
      return `To see the best props for a team, please specify a player name. For example: "What are LeBron's props tonight?" or "Tatum points over/under"`;
    }
    
    return null;
  }

  try {
    // Search for player
    const { data: players, error: playerError } = await supabase
      .from("players")
      .select("id, name, team_name")
      .eq("sport", "NBA")
      .ilike("name", `%${playerName}%`)
      .limit(1);

    if (playerError || !players?.length) {
      return `I couldn't find an NBA player matching "${playerName}". Try using their full name.`;
    }

    const player = players[0];

    // Fetch their props
    let propsQuery = supabase
      .from("player_props")
      .select("*")
      .eq("player_id", player.id)
      .eq("sport", "NBA")
      .eq("is_active", true)
      .gte("game_date", today)
      .order("sportsbook", { ascending: true });

    if (propType) {
      propsQuery = propsQuery.eq("prop_type", propType);
    }

    const { data: props, error: propsError } = await propsQuery;

    if (propsError) {
      console.error("Error fetching props:", propsError);
      return `I encountered an error looking up props for ${player.name}.`;
    }

    // Fetch season averages
    const { data: stats } = await supabase
      .from("player_season_stats")
      .select("points_per_game, rebounds_per_game, assists_per_game")
      .eq("player_id", player.id)
      .eq("sport", "NBA")
      .eq("season", 2025)
      .single();

    if (!props?.length) {
      return `No props are currently available for **${player.name}** (${player.team_name}). Props typically release on game day around 10 AM ET. Check back closer to game time.`;
    }

    // Group props by type
    const propsByType = props.reduce((acc, prop) => {
      if (!acc[prop.prop_type]) {
        acc[prop.prop_type] = [];
      }
      acc[prop.prop_type].push(prop);
      return acc;
    }, {} as Record<string, typeof props>);

    // Build response
    let response = `## ${player.name}'s Props Tonight\n\n`;
    
    const opponent = props[0]?.opponent_team;
    if (opponent) {
      response += `**vs ${opponent}**\n\n`;
    }

    for (const [type, typeProps] of Object.entries(propsByType)) {
      const primaryProp = typeProps.find(p => p.sportsbook.toLowerCase() === 'draftkings') || typeProps[0];
      
      response += `### ${getPropTypeLabel(type).toUpperCase()}: O/U ${primaryProp.line}\n`;
      
      // Find best odds
      let bestOver = { odds: -999, book: "" };
      let bestUnder = { odds: -999, book: "" };
      
      for (const prop of typeProps) {
        if (prop.over_odds && prop.over_odds > bestOver.odds) {
          bestOver = { odds: prop.over_odds, book: prop.sportsbook };
        }
        if (prop.under_odds && prop.under_odds > bestUnder.odds) {
          bestUnder = { odds: prop.under_odds, book: prop.sportsbook };
        }
      }

      // List by sportsbook
      for (const prop of typeProps) {
        const isbestOver = prop.sportsbook === bestOver.book && prop.over_odds === bestOver.odds;
        const isBestUnder = prop.sportsbook === bestUnder.book && prop.under_odds === bestUnder.odds;
        
        response += `- **${getSportsbookLabel(prop.sportsbook)}**: ${formatOdds(prop.over_odds)}${isbestOver ? ' ✓' : ''} / ${formatOdds(prop.under_odds)}${isBestUnder ? ' ✓' : ''}\n`;
      }

      // Add season avg comparison
      if (stats) {
        const avgMap: Record<string, number | undefined> = {
          points: stats.points_per_game ?? undefined,
          rebounds: stats.rebounds_per_game ?? undefined,
          assists: stats.assists_per_game ?? undefined,
        };
        
        const avg = avgMap[type];
        if (avg !== undefined) {
          const trend = avg > primaryProp.line ? "📈" : "📉";
          response += `\n${trend} **Season Avg**: ${avg.toFixed(1)} (${avg > primaryProp.line ? 'over' : 'under'} line)\n`;
        }
      }

      response += `\n`;
    }

    return response.trim();
  } catch (error) {
    console.error("Error handling NBA props query:", error);
    return null;
  }
}
