import { Sport, Suggestion, QueryContext } from "./types";

// Sport-specific suggestion templates
const NFL_SUGGESTIONS = {
  player: (player: string, position: string | null) => {
    const suggestions: Suggestion[] = [];
    
    if (position === "qb" || position === "quarterback") {
      suggestions.push({
        text: `${player}'s last 5 games?`,
        query: `${player} last 5 games`
      });
      suggestions.push({
        text: `Season stats?`,
        query: `${player} this season stats`
      });
      suggestions.push({
        text: `Red zone efficiency?`,
        query: `How efficient is ${player} in the red zone this season?`
      });
    } else if (position === "rb" || position === "running back") {
      suggestions.push({
        text: `${player}'s last 5 games?`,
        query: `${player} last 5 games`
      });
      suggestions.push({
        text: `Goal-line carries?`,
        query: `What are ${player}'s carries inside the 10 this season?`
      });
      suggestions.push({
        text: `Receiving work?`,
        query: `How many targets is ${player} getting out of the backfield?`
      });
    } else if (position === "wr" || position === "wide receiver" || position === "te" || position === "tight end") {
      suggestions.push({
        text: `${player}'s last 5 games?`,
        query: `${player} last 5 games`
      });
      suggestions.push({
        text: `Red zone targets?`,
        query: `How many red zone targets does ${player} have this season?`
      });
      suggestions.push({
        text: `Target share trend?`,
        query: `What's ${player}'s target share in the last 5 games?`
      });
    } else {
      suggestions.push({
        text: `${player}'s last 5 games?`,
        query: `${player} last 5 games`
      });
      suggestions.push({
        text: `This season stats?`,
        query: `${player} this season`
      });
      suggestions.push({
        text: `Fantasy outlook?`,
        query: `What's ${player}'s fantasy outlook for this week?`
      });
    }
    
    return suggestions;
  },
  gameLog: (player: string) => [
    {
      text: `Compare to season avg?`,
      query: `${player} season stats`
    },
    {
      text: `Prop lines next game?`,
      query: `What are ${player}'s prop lines for the next game?`
    },
    {
      text: `Fantasy projection?`,
      query: `What's ${player}'s fantasy outlook this week?`
    }
  ],
  prop: (player: string) => [
    {
      text: `Home/away splits?`,
      query: `Does ${player} typically go over or under this line at home vs away?`
    },
    {
      text: `Hit rate this season?`,
      query: `What's ${player}'s hit rate for this prop line this season?`
    }
  ],
  game: (teams: string[]) => [
    {
      text: "Public betting?",
      query: `Public betting ${teams.join(" vs ")}`
    },
    {
      text: "Key injuries?",
      query: `What are the key injuries to watch for ${teams.join(" vs ")}?`
    },
    {
      text: "Weather impact?",
      query: `How might the weather affect the ${teams.join(" vs ")} game?`
    }
  ],
  odds: (teams: string[]) => [
    {
      text: "Sharp money?",
      query: `Where is the sharp money on ${teams.join(" vs ")}?`
    },
    {
      text: "Public betting?",
      query: `Public betting percentages ${teams.join(" vs ")}`
    },
    {
      text: "Line movement?",
      query: `How has the line moved for ${teams.join(" vs ")}?`
    }
  ]
};

const NBA_SUGGESTIONS = {
  player: (player: string, statType: string | null) => {
    const suggestions: Suggestion[] = [];
    
    if (statType === "scoring") {
      suggestions.push({
        text: `${player} on back-to-backs?`,
        query: `How does ${player} perform on back-to-back games?`
      });
      suggestions.push({
        text: `Usage rate trend?`,
        query: `What's ${player}'s usage rate in the last 10 games?`
      });
    } else if (statType === "rebounding") {
      suggestions.push({
        text: `${player}'s rebounding lately?`,
        query: `How are ${player}'s rebounds trending in the last 5 games?`
      });
      suggestions.push({
        text: `Matchup impact?`,
        query: `How does ${player} rebound against top frontcourts?`
      });
    } else if (statType === "playmaking") {
      suggestions.push({
        text: `${player} without key teammates?`,
        query: `How does ${player}'s assist rate change when key teammates are out?`
      });
    } else {
      suggestions.push({
        text: `${player} on back-to-backs?`,
        query: `How does ${player} perform on back-to-back games?`
      });
      suggestions.push({
        text: `${player}'s minutes lately?`,
        query: `What's ${player}'s minutes trend in the last 5 games?`
      });
    }
    
    return suggestions;
  },
  prop: (player: string) => [
    {
      text: `Hit rate last 10?`,
      query: `What's the hit rate for this prop over ${player}'s last 10 games?`
    },
    {
      text: `Home vs away?`,
      query: `Does ${player} typically hit this prop better at home or away?`
    }
  ],
  game: (teams: string[]) => [
    {
      text: "Pace factor?",
      query: `How does the pace factor affect the ${teams.join(" vs ")} matchup?`
    },
    {
      text: "Rest advantage?",
      query: `Is there a rest advantage for either team in ${teams.join(" vs ")}?`
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

// General fallback suggestions
const GENERAL_SUGGESTIONS = {
  player: (player: string) => [
    {
      text: `${player}'s recent form?`,
      query: `How has ${player} performed in the last 5 games?`
    },
    {
      text: `${player}'s next game?`,
      query: `When is ${player}'s next game and who do they play?`
    }
  ],
  game: () => [
    {
      text: "Current odds?",
      query: "What are the current odds for this game?"
    },
    {
      text: "Over/under line?",
      query: "What's the over/under total for this game?"
    }
  ],
  prop: () => [
    {
      text: "Best sportsbook line?",
      query: "Which sportsbook has the best line for this prop?"
    },
    {
      text: "Line movement?",
      query: "Has this line moved since opening?"
    }
  ],
  odds: () => [
    {
      text: "Sharp action?",
      query: "Where is the sharp money on this game?"
    },
    {
      text: "Best sportsbook?",
      query: "Which sportsbook has the best line?"
    }
  ],
  default: () => [
    {
      text: "Today's games?",
      query: "What games are happening today?"
    },
    {
      text: "Best betting values?",
      query: "What are the best betting values for today?"
    },
    {
      text: "Line movements?",
      query: "Which lines have moved the most today?"
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
