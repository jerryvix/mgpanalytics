import { Sport, Suggestion, QueryContext } from "./types";

// Sport-specific suggestion templates - aligned with actual MGP data availability
// Data available: Games, odds (spread/ML/total), player rosters, season stats (NFL)
// Limited: Props, game logs, advanced stats require sync

const NFL_SUGGESTIONS = {
  player: (player: string, position: string | null) => {
    const suggestions: Suggestion[] = [];
    
    if (position === "qb" || position === "quarterback") {
      suggestions.push({
        text: `${player}'s season stats?`,
        query: `${player} season stats`
      });
      suggestions.push({
        text: `${player}'s next game?`,
        query: `When does ${player} play next?`
      });
      suggestions.push({
        text: `Passing yards this season?`,
        query: `How many passing yards does ${player} have this season?`
      });
    } else if (position === "rb" || position === "running back") {
      suggestions.push({
        text: `${player}'s rushing stats?`,
        query: `${player} rushing yards this season`
      });
      suggestions.push({
        text: `${player}'s TDs?`,
        query: `How many touchdowns does ${player} have this season?`
      });
      suggestions.push({
        text: `${player}'s next game?`,
        query: `When does ${player} play next?`
      });
    } else if (position === "wr" || position === "wide receiver" || position === "te" || position === "tight end") {
      suggestions.push({
        text: `${player}'s receiving stats?`,
        query: `${player} receiving yards this season`
      });
      suggestions.push({
        text: `Receptions & targets?`,
        query: `How many receptions does ${player} have this season?`
      });
      suggestions.push({
        text: `${player}'s TDs?`,
        query: `How many touchdowns does ${player} have?`
      });
    } else {
      suggestions.push({
        text: `${player}'s stats?`,
        query: `${player} season stats`
      });
      suggestions.push({
        text: `${player}'s team?`,
        query: `What team does ${player} play for?`
      });
      suggestions.push({
        text: `${player}'s next game?`,
        query: `When does ${player} play next?`
      });
    }
    
    return suggestions;
  },
  gameLog: (player: string) => [
    {
      text: `Season averages?`,
      query: `${player} season stats`
    },
    {
      text: `Next game odds?`,
      query: `What are the odds for ${player}'s next game?`
    },
    {
      text: `Team schedule?`,
      query: `What's the schedule for ${player}'s team?`
    }
  ],
  prop: (player: string) => [
    {
      text: `Season average?`,
      query: `What's ${player}'s season average for this stat?`
    },
    {
      text: `Compare to line?`,
      query: `How does ${player}'s average compare to this line?`
    },
    {
      text: `Game matchup?`,
      query: `Who does ${player} play next?`
    }
  ],
  game: (teams: string[]) => [
    {
      text: "What's the spread?",
      query: `What's the spread for ${teams.join(" vs ")}?`
    },
    {
      text: "What's the total?",
      query: `What's the over/under for ${teams.join(" vs ")}?`
    },
    {
      text: "Moneyline?",
      query: `What are the moneyline odds for ${teams.join(" vs ")}?`
    }
  ],
  odds: (teams: string[]) => [
    {
      text: "Spread both sides?",
      query: `What's the full spread for ${teams.join(" vs ")}?`
    },
    {
      text: "Total O/U?",
      query: `What's the over/under total for ${teams.join(" vs ")}?`
    },
    {
      text: "Game time?",
      query: `When is ${teams.join(" vs ")}?`
    }
  ]
};

const NBA_SUGGESTIONS = {
  player: (player: string, statType: string | null) => {
    const suggestions: Suggestion[] = [];
    
    if (statType === "scoring") {
      suggestions.push({
        text: `${player}'s PPG?`,
        query: `What's ${player}'s points per game this season?`
      });
      suggestions.push({
        text: `Next game odds?`,
        query: `What are the odds for ${player}'s next game?`
      });
    } else if (statType === "rebounding") {
      suggestions.push({
        text: `${player}'s RPG?`,
        query: `What's ${player}'s rebounds per game this season?`
      });
      suggestions.push({
        text: `Game schedule?`,
        query: `When does ${player} play next?`
      });
    } else if (statType === "playmaking") {
      suggestions.push({
        text: `${player}'s APG?`,
        query: `What's ${player}'s assists per game this season?`
      });
    } else {
      suggestions.push({
        text: `${player}'s stats?`,
        query: `What are ${player}'s stats this season?`
      });
      suggestions.push({
        text: `Next game?`,
        query: `When does ${player} play next?`
      });
    }
    
    return suggestions;
  },
  prop: (player: string) => [
    {
      text: `Season average?`,
      query: `What's ${player}'s season average for this stat?`
    },
    {
      text: `Next game matchup?`,
      query: `Who does ${player} play next?`
    }
  ],
  game: (teams: string[]) => [
    {
      text: "What's the spread?",
      query: `What's the spread for ${teams.join(" vs ")}?`
    },
    {
      text: "What's the total?",
      query: `What's the over/under for ${teams.join(" vs ")}?`
    },
    {
      text: "Game time?",
      query: `When is ${teams.join(" vs ")}?`
    }
  ]
};

const NCAAB_SUGGESTIONS = {
  player: (player: string) => [
    {
      text: `${player}'s conference play?`,
      query: `How has ${player} performed in conference games?`
    },
    {
      text: `Tournament history?`,
      query: `How does ${player} perform in high-pressure games?`
    }
  ],
  team: (teams: string[]) => [
    {
      text: "ATS record?",
      query: `What's ${teams[0] || "their"}'s record against the spread this season?`
    },
    {
      text: "Favorites vs underdogs?",
      query: `How do they perform as favorites vs underdogs?`
    }
  ],
  game: (teams: string[]) => [
    {
      text: "Tempo matchup?",
      query: `How do the tempo styles match up in ${teams.join(" vs ")}?`
    },
    {
      text: "Home court edge?",
      query: `How strong is the home court advantage in this matchup?`
    }
  ]
};

const NCAAF_SUGGESTIONS = {
  player: (player: string, position: string | null) => {
    if (position === "quarterback") {
      return [
        {
          text: `${player}'s big game stats?`,
          query: `How does ${player} perform against ranked opponents?`
        },
        {
          text: `Pressure performance?`,
          query: `What's ${player}'s completion rate under pressure?`
        }
      ];
    }
    return [
      {
        text: `${player}'s conference stats?`,
        query: `How has ${player} performed in conference play?`
      }
    ];
  },
  team: (teams: string[]) => [
    {
      text: "ATS record?",
      query: `What's ${teams[0] || "their"}'s record against the spread this season?`
    },
    {
      text: "Ranked opponent record?",
      query: `How do they perform against ranked teams?`
    }
  ],
  game: (teams: string[]) => [
    {
      text: "Historical matchup?",
      query: `What's the historical record between ${teams.join(" and ")}?`
    },
    {
      text: "Key matchup advantages?",
      query: `What are the key matchup advantages in ${teams.join(" vs ")}?`
    }
  ]
};

const MLB_SUGGESTIONS = {
  player: (player: string, statType: string | null) => {
    if (statType === "pitching") {
      return [
        {
          text: `${player}'s day vs night?`,
          query: `What's ${player}'s ERA in day games vs night games?`
        },
        {
          text: `Home/road splits?`,
          query: `How does ${player} pitch at home vs on the road?`
        },
        {
          text: `Strikeout trend?`,
          query: `What's ${player}'s strikeout rate in the last 5 starts?`
        }
      ];
    }
    // Hitter
    return [
      {
        text: `${player} vs lefties/righties?`,
        query: `How does ${player} hit against lefties vs righties?`
      },
      {
        text: `Home run trend?`,
        query: `What's ${player}'s home run rate in the last 10 games?`
      },
      {
        text: `Day/night splits?`,
        query: `Does ${player} hit better in day games or night games?`
      }
    ];
  },
  prop: (player: string) => [
    {
      text: `Recent hit rate?`,
      query: `What's ${player}'s hit rate for this prop in the last 5 games?`
    },
    {
      text: `Matchup history?`,
      query: `How has ${player} performed against this opponent?`
    }
  ],
  game: (teams: string[]) => [
    {
      text: "Starting pitchers?",
      query: `Who are the starting pitchers for ${teams.join(" vs ")}?`
    },
    {
      text: "Weather conditions?",
      query: `How might the weather affect the ${teams.join(" vs ")} game?`
    },
    {
      text: "Bullpen status?",
      query: `What's the bullpen availability for ${teams.join(" vs ")}?`
    }
  ]
};

// General fallback suggestions - aligned with actual MGP data availability
// Available: Game schedules, game odds (spread/ML/total), player rosters
// Limited: Props, game logs, advanced stats (sync dependent)
const GENERAL_SUGGESTIONS = {
  player: (player: string) => [
    {
      text: `${player}'s season stats?`,
      query: `What are ${player}'s season stats?`
    },
    {
      text: `${player}'s next game?`,
      query: `When is ${player}'s next game?`
    }
  ],
  game: () => [
    {
      text: "What's the spread?",
      query: "What's the spread for this game?"
    },
    {
      text: "What's the total?",
      query: "What's the over/under total for this game?"
    }
  ],
  prop: () => [
    {
      text: "Compare sportsbooks?",
      query: "Compare the odds across sportsbooks for this prop"
    },
    {
      text: "Recent performance?",
      query: "How has this player performed recently for this stat?"
    }
  ],
  odds: () => [
    {
      text: "Line movement?",
      query: "Has the line moved from the opener?"
    },
    {
      text: "Moneyline odds?",
      query: "What are the moneyline odds for this game?"
    }
  ],
  default: () => [
    {
      text: "NBA games today?",
      query: "What NBA games are on today?"
    },
    {
      text: "NFL playoff schedule?",
      query: "What are the NFL playoff games this week?"
    },
    {
      text: "Tonight's odds?",
      query: "What are the odds for tonight's games?"
    }
  ]
};

export function getSportSpecificSuggestions(context: QueryContext): Suggestion[] {
  const { sport, queryType, playerName, teams, statType, position } = context;
  let suggestions: Suggestion[] = [];
  
  // Get sport-specific suggestions
  switch (sport) {
    case "NFL":
      if (queryType === "player" && playerName) {
        // Check if query was about game logs - provide post-gamelog suggestions
        if (context.queryType === "player" && statType === "historical") {
          suggestions = NFL_SUGGESTIONS.gameLog(playerName);
        } else {
          suggestions = NFL_SUGGESTIONS.player(playerName, position);
        }
      } else if (queryType === "prop" && playerName) {
        suggestions = NFL_SUGGESTIONS.prop(playerName);
      } else if (queryType === "game" && teams.length > 0) {
        suggestions = NFL_SUGGESTIONS.game(teams);
      }
      break;
      
    case "NBA":
      if (queryType === "player" && playerName) {
        suggestions = NBA_SUGGESTIONS.player(playerName, statType);
      } else if (queryType === "prop" && playerName) {
        suggestions = NBA_SUGGESTIONS.prop(playerName);
      } else if (queryType === "game" && teams.length > 0) {
        suggestions = NBA_SUGGESTIONS.game(teams);
      }
      break;
      
    case "NCAAB":
      if (queryType === "player" && playerName) {
        suggestions = NCAAB_SUGGESTIONS.player(playerName);
      } else if (teams.length > 0) {
        if (queryType === "game") {
          suggestions = NCAAB_SUGGESTIONS.game(teams);
        } else {
          suggestions = NCAAB_SUGGESTIONS.team(teams);
        }
      }
      break;
      
    case "NCAAF":
      if (queryType === "player" && playerName) {
        suggestions = NCAAF_SUGGESTIONS.player(playerName, position);
      } else if (teams.length > 0) {
        if (queryType === "game") {
          suggestions = NCAAF_SUGGESTIONS.game(teams);
        } else {
          suggestions = NCAAF_SUGGESTIONS.team(teams);
        }
      }
      break;
      
    case "MLB":
      if (queryType === "player" && playerName) {
        suggestions = MLB_SUGGESTIONS.player(playerName, statType);
      } else if (queryType === "prop" && playerName) {
        suggestions = MLB_SUGGESTIONS.prop(playerName);
      } else if (queryType === "game" && teams.length > 0) {
        suggestions = MLB_SUGGESTIONS.game(teams);
      }
      break;
  }
  
  // If no sport-specific suggestions, use general fallbacks
  if (suggestions.length === 0) {
    switch (queryType) {
      case "player":
        if (playerName) {
          suggestions = GENERAL_SUGGESTIONS.player(playerName);
        }
        break;
      case "game":
        suggestions = GENERAL_SUGGESTIONS.game();
        break;
      case "prop":
        suggestions = GENERAL_SUGGESTIONS.prop();
        break;
      case "odds":
        suggestions = GENERAL_SUGGESTIONS.odds();
        break;
      default:
        suggestions = GENERAL_SUGGESTIONS.default();
    }
  }
  
  return suggestions;
}
