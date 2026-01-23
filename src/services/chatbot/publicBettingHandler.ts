// Public Betting Data Handler for Chatbot
// Uses web search grounding to find and format public betting percentages

import { supabase } from "@/integrations/supabase/client";
import { 
  BettingLine, 
  detectSharpMoney, 
  formatBettingPercentages,
  generateSharpSummary 
} from "@/utils/sharpMoneyDetector";

// Cache for betting percentages (15 minute TTL)
interface CachedBettingData {
  data: string;
  timestamp: number;
  query: string;
}

const bettingCache = new Map<string, CachedBettingData>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Query patterns for public betting
const PUBLIC_BETTING_PATTERNS = [
  /public\s+betting\s+(.+)/i,
  /sharp\s+money\s+(.+)/i,
  /where\s+is\s+(?:the\s+)?money\s+(?:on\s+)?(.+)/i,
  /betting\s+percentages?\s+(.+)/i,
  /public\s+vs\s+sharp\s+(.+)/i,
  /consensus\s+(?:picks?|betting)\s+(.+)/i,
  /(?:what|where)\s+(?:is|are)\s+(?:the\s+)?(?:public|sharps?)\s+(?:betting|on)\s+(.+)/i,
  /line\s+movement\s+(.+)/i,
];

/**
 * Check if a query is asking about public betting data
 */
export function isPublicBettingQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Check explicit patterns
  if (PUBLIC_BETTING_PATTERNS.some(pattern => pattern.test(lowerQuery))) {
    return true;
  }
  
  // Check keyword combinations
  const hasPublicKeyword = lowerQuery.includes("public") || lowerQuery.includes("sharp");
  const hasBettingKeyword = lowerQuery.includes("betting") || lowerQuery.includes("money") || lowerQuery.includes("action");
  
  return hasPublicKeyword && hasBettingKeyword;
}

/**
 * Extract game/team info from query
 */
export function extractGameInfo(query: string): { teamA: string | null; teamB: string | null } {
  // Try to match "team vs team" or "team at team"
  const vsMatch = query.match(/(\w+(?:\s+\w+)?)\s+(?:vs\.?|versus|at|@)\s+(\w+(?:\s+\w+)?)/i);
  
  if (vsMatch) {
    return {
      teamA: vsMatch[1].trim(),
      teamB: vsMatch[2].trim()
    };
  }
  
  // Try to extract just a single team
  const teamPatterns = [
    /(?:chiefs|bills|eagles|49ers|lions|packers|ravens|cowboys|dolphins|jets|giants)/i,
    /(?:rams|chargers|seahawks|broncos|bucs|saints|falcons|panthers|vikings|bears)/i,
    /(?:cardinals|raiders|bengals|browns|steelers|colts|jaguars|titans|patriots|commanders)/i,
    /(?:texans)/i,
  ];
  
  for (const pattern of teamPatterns) {
    const match = query.match(pattern);
    if (match) {
      return { teamA: match[0], teamB: null };
    }
  }
  
  return { teamA: null, teamB: null };
}

/**
 * Generate cache key from query
 */
function getCacheKey(query: string): string {
  const { teamA, teamB } = extractGameInfo(query);
  return `${teamA || "unknown"}-${teamB || "unknown"}`.toLowerCase();
}

/**
 * Check cache for existing data
 */
function checkCache(query: string): string | null {
  const key = getCacheKey(query);
  const cached = bettingCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  return null;
}

/**
 * Save to cache
 */
function saveToCache(query: string, data: string): void {
  const key = getCacheKey(query);
  bettingCache.set(key, {
    data,
    timestamp: Date.now(),
    query
  });
}

/**
 * Build the search prompt for Gemini to find public betting data
 */
function buildSearchPrompt(query: string): string {
  const { teamA, teamB } = extractGameInfo(query);
  const gameDesc = teamB ? `${teamA} vs ${teamB}` : teamA || "NFL";
  
  return `Find the current public betting percentages and sharp money data for ${gameDesc}. 
I need:
1. Spread: What percentage of bets and money are on each side
2. Total (Over/Under): What percentage of bets and money are on over vs under  
3. Moneyline: What percentage of bets are on each team
4. Any sharp money indicators or reverse line movement

Search Action Network, Covers.com, and OddsAssist for this data. 
Format the response with specific percentages and indicate where sharp money differs from public betting.
Include the current lines (spread number, total number) if available.`;
}

/**
 * Parse the AI response and format it nicely
 */
function formatPublicBettingResponse(
  aiResponse: string, 
  teamA: string | null, 
  teamB: string | null
): string {
  const gameHeader = teamB 
    ? `**${teamA?.toUpperCase() || 'TEAM A'} vs ${teamB?.toUpperCase() || 'TEAM B'}** - Public Betting Breakdown\n\n`
    : `**${teamA?.toUpperCase() || 'NFL'}** - Public Betting Breakdown\n\n`;
  
  // If the AI response already has good formatting, use it
  if (aiResponse.includes("Spread") || aiResponse.includes("SPREAD") || 
      aiResponse.includes("%") && aiResponse.includes("bets")) {
    return gameHeader + aiResponse + "\n\n*Data from web sources. Percentages update throughout the day.*";
  }
  
  // Otherwise, add a note that data was found
  return gameHeader + aiResponse + "\n\n*Data from web sources. Refresh for latest percentages.*";
}

/**
 * Handle a public betting query
 */
export async function handlePublicBettingQuery(query: string): Promise<string> {
  // Check cache first
  const cached = checkCache(query);
  if (cached) {
    return cached + "\n\n*(Cached data - ask again to refresh)*";
  }
  
  const { teamA, teamB } = extractGameInfo(query);
  
  if (!teamA) {
    return `To get public betting data, please specify a team or matchup. Examples:
• "Public betting Chiefs vs Bills"
• "Sharp money on the Eagles game"
• "Where is the money on Ravens vs Steelers"`;
  }
  
  try {
    // Call the Gemini chat function with a search-focused prompt
    const searchPrompt = buildSearchPrompt(query);
    
    const { data, error } = await supabase.functions.invoke('gemini-chat', {
      body: {
        messages: [
          { role: "user", content: searchPrompt }
        ]
      }
    });
    
    if (error) {
      console.error("Error fetching public betting data:", error);
      return `I couldn't fetch public betting data right now. This feature uses live web search which may be rate-limited. Try again in a moment.\n\nIn the meantime, you can check these sources directly:\n• [Action Network](https://actionnetwork.com/nfl/public-betting)\n• [Covers Consensus](https://contests.covers.com/consensus)`;
    }
    
    const aiContent = data?.content || data?.choices?.[0]?.message?.content || "";
    
    if (!aiContent) {
      return `I couldn't find public betting data for ${teamA}${teamB ? ` vs ${teamB}` : ""}. The game may not be available yet or the search returned no results.`;
    }
    
    // Format the response
    const formattedResponse = formatPublicBettingResponse(aiContent, teamA, teamB);
    
    // Cache the result
    saveToCache(query, formattedResponse);
    
    return formattedResponse;
    
  } catch (err) {
    console.error("Public betting query error:", err);
    return `Error fetching public betting data. Please try again later.`;
  }
}

/**
 * Generate follow-up suggestions for public betting queries
 */
export function getPublicBettingSuggestions(teamA: string | null, teamB: string | null): Array<{text: string; query: string}> {
  const suggestions = [];
  
  if (teamA) {
    suggestions.push({
      text: `${teamA} odds?`,
      query: `What are the odds for ${teamA}?`
    });
  }
  
  if (teamA && teamB) {
    suggestions.push({
      text: "Line movement?",
      query: `How has the line moved for ${teamA} vs ${teamB}?`
    });
    suggestions.push({
      text: "Key injuries?",
      query: `What are the key injuries for ${teamA} vs ${teamB}?`
    });
  }
  
  suggestions.push({
    text: "All NFL consensus?",
    query: "What's the public betting consensus for all NFL games this week?"
  });
  
  return suggestions.slice(0, 3);
}
