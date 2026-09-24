// Team labels. Pro teams read fine by nickname ("Chiefs"), but a college
// mascot alone ("Tigers", "Bulldogs") could be any of a dozen schools, so
// college football uses ESPN's own school labels instead (src/data/ncaafSchools.ts).
// Display only: keep the full stored name for lookups, follows and matching.
import { NCAAF_SCHOOLS } from "@/data/ncaafSchools";

const isNcaaf = (sport?: string | null) => sport?.toUpperCase() === "NCAAF";

// Pro nicknames longer than one word; the last word alone ("Sox") would not
// tell the Red Sox from the White Sox
const TWO_WORD_NICKNAMES = ["Red Sox", "White Sox", "Blue Jays", "Trail Blazers"];

/** A pro team's nickname: "Kansas City Chiefs" -> "Chiefs", "Boston Red Sox" -> "Red Sox". */
export function nickname(full: string): string {
  const name = full.trim();
  const two = TWO_WORD_NICKNAMES.find((n) => name.endsWith(` ${n}`));
  return two ?? (name.split(/\s+/).pop() || full);
}

/**
 * The school, the way ESPN's scoreboard names it: "Texas A&M Aggies" ->
 * "Texas A&M". A name we have no ESPN entry for comes back whole rather than
 * guessed, so a lone mascot never shows.
 */
export function ncaafSchool(full: string): string {
  return NCAAF_SCHOOLS[full]?.school ?? full;
}

/**
 * Main label for a team: the school for college football, the full name
 * otherwise.
 */
export function displayTeamName(full: string, sport?: string | null): string {
  return isNcaaf(sport) ? ncaafSchool(full) : full;
}

/**
 * Compact label for tight spots: ESPN's short scoreboard name for college
 * football ("FIU", "Pitt"), the nickname for everyone else ("Chiefs").
 */
export function shortTeamName(full: string, sport?: string | null): string {
  if (isNcaaf(sport)) return NCAAF_SCHOOLS[full]?.short ?? full;
  return nickname(full);
}

/**
 * Label for a card or sheet title: the school for college football, the
 * nickname otherwise ("Texas A&M -3.5", "Chiefs -3.5").
 */
export function titleTeamName(full: string, sport?: string | null): string {
  return isNcaaf(sport) ? ncaafSchool(full) : nickname(full);
}

/** ESPN's abbreviation for a college football team ("TA&M"), if we have it. */
export function ncaafAbbrev(full: string): string | undefined {
  return NCAAF_SCHOOLS[full]?.abbr;
}
