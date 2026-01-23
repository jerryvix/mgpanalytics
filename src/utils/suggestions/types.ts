export interface Suggestion {
  text: string;
  query: string;
}

export type Sport = "NFL" | "NBA" | "NCAAB" | "NCAAF" | "MLB" | "unknown";

export type QueryType = "player" | "game" | "prop" | "odds" | "general";

export interface QueryContext {
  sport: Sport;
  queryType: QueryType;
  playerName: string | null;
  teams: string[];
  statType: string | null;
  position: string | null;
}
