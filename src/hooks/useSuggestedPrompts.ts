import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SuggestedPrompt {
  text: string;
  query: string;
}

type TimeOfDay = "morning" | "afternoon" | "evening" | "lateNight";

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 24) return "evening";
  return "lateNight"; // 12 AM - 6 AM
}

// Base prompts by time of day - these always work
const TIME_BASED_PROMPTS: Record<TimeOfDay, SuggestedPrompt[]> = {
  morning: [
    { text: "Tonight's NBA slate?", query: "Show me tonight's NBA games and odds" },
    { text: "NFL playoff schedule?", query: "What are the NFL playoff games this week?" },
    { text: "Key injuries today?", query: "Which players are listed as OUT tonight?" }
  ],
  afternoon: [
    { text: "Tonight's biggest spreads?", query: "Show me the biggest favorites in tonight's games" },
    { text: "NBA games today?", query: "What NBA games are on today?" },
    { text: "Tightest spreads?", query: "Which games have the tightest spreads today?" }
  ],
  evening: [
    { text: "Games starting soon?", query: "What games are starting in the next few hours?" },
    { text: "Tonight's odds?", query: "Show me the odds for tonight's games" },
    { text: "NBA injury report?", query: "Any key NBA injuries to know about tonight?" }
  ],
  lateNight: [
    { text: "Tomorrow's games?", query: "What games are scheduled for tomorrow?" },
    { text: "Tomorrow's early odds?", query: "Show me tomorrow's odds" },
    { text: "NBA schedule this week?", query: "What NBA games are coming up this week?" }
  ]
};

// Data-aware prompts that only show when relevant data exists
interface DataContext {
  hasNbaGames: boolean;
  hasNflGames: boolean;
  hasLineMovements: boolean;
  hasInjuries: boolean;
  gameCount: number;
  injuryCount: number;
}

async function fetchDataContext(): Promise<DataContext> {
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  
  try {
    // Check for NBA games in next 48 hours
    const { count: nbaCount } = await supabase
      .from("nba_games")
      .select("*", { count: "exact", head: true })
      .gte("date", now.toISOString())
      .lte("date", twoDaysFromNow.toISOString());

    // Check for NFL games in next 7 days (playoff schedule)
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { count: nflCount } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL")
      .gte("date", now.toISOString())
      .lte("date", oneWeekFromNow.toISOString());

    // Check for line movements in last 24 hours
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { count: movementCount } = await supabase
      .from("odds_history")
      .select("*", { count: "exact", head: true })
      .gte("timestamp", yesterday.toISOString());

    // Check for injuries (players with injury_status set)
    const { count: injuryCount } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .not("injury_status", "is", null)
      .neq("injury_status", "Healthy");

    return {
      hasNbaGames: (nbaCount || 0) > 0,
      hasNflGames: (nflCount || 0) > 0,
      hasLineMovements: (movementCount || 0) > 0,
      hasInjuries: (injuryCount || 0) > 0,
      gameCount: (nbaCount || 0) + (nflCount || 0),
      injuryCount: injuryCount || 0
    };
  } catch (error) {
    console.error("Error fetching data context for prompts:", error);
    return {
      hasNbaGames: false,
      hasNflGames: false,
      hasLineMovements: false,
      hasInjuries: false,
      gameCount: 0,
      injuryCount: 0
    };
  }
}

function buildDynamicPrompts(context: DataContext, timeOfDay: TimeOfDay): SuggestedPrompt[] {
  const prompts: SuggestedPrompt[] = [];
  
  // Add time-based base prompts
  const basePrompts = TIME_BASED_PROMPTS[timeOfDay];
  prompts.push(...basePrompts);
  
  // Add data-aware prompts if relevant data exists
  if (context.hasLineMovements) {
    prompts.unshift({
      text: "Line movements?",
      query: "Show me today's line movements"
    });
  }
  
  if (context.gameCount > 0) {
    prompts.unshift({
      text: `${context.gameCount} games today`,
      query: `What should I know about the ${context.gameCount} games today?`
    });
  }
  
  if (context.hasInjuries && context.injuryCount > 0) {
    prompts.push({
      text: `${context.injuryCount} players out`,
      query: `Show me the ${context.injuryCount} players listed as out today`
    });
  }

  // Return top 3 unique prompts
  const uniquePrompts = prompts.filter((prompt, index, self) =>
    index === self.findIndex(p => p.query === prompt.query)
  );
  
  return uniquePrompts.slice(0, 3);
}

export function useSuggestedPrompts() {
  const [prompts, setPrompts] = useState<SuggestedPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshPrompts = useCallback(async () => {
    setIsLoading(true);
    try {
      const timeOfDay = getTimeOfDay();
      const context = await fetchDataContext();
      const dynamicPrompts = buildDynamicPrompts(context, timeOfDay);
      setPrompts(dynamicPrompts);
    } catch (error) {
      console.error("Error generating suggested prompts:", error);
      // Fallback to reliable static prompts
      setPrompts([
        { text: "Games in next 48 hours?", query: "Show me all games in the next 48 hours" },
        { text: "Today's NBA odds?", query: "List today's NBA games and spreads" },
        { text: "Who's injured?", query: "Which players are listed as OUT tonight?" }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPrompts();
    
    // Refresh prompts every 30 minutes
    const interval = setInterval(refreshPrompts, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshPrompts]);

  return { prompts, isLoading, refreshPrompts };
}
