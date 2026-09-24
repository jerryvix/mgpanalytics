// MLB starting pitchers for the chat's context block. Pure (no Deno or
// Supabase imports), so src/test/chatMlbStarters.test.ts pins the rules.
import {
  formatPitcherLast3,
  formatPitcherSeason,
  type MlbScheduleGame,
  type PitcherLine,
  type ProbableMatchup,
} from "../_shared/mlb-statsapi.ts";

/**
 * Today's and tomorrow's games in every state, first pitch first. Games that
 * already started or ended stay: "Who is pitching for the Pirates today?"
 * after their 2-1 win over the Cardinals (Sep 24 2026) got only Friday's
 * starter, because finals were dropped here. Postponed and cancelled
 * placeholders are not games.
 */
export function chatStarterGames(all: ProbableMatchup[]): ProbableMatchup[] {
  return all
    .filter((m) => !m.game.isPlaceholder)
    .sort((a, b) => Date.parse(a.game.gameDate) - Date.parse(b.game.gameDate));
}

export function pitcherBrief(line: PitcherLine | null | undefined): string {
  if (!line) return "TBD";
  const projected = line.projected ? " (projected, not yet announced by MLB)" : "";
  const hand = line.hand ? `, ${line.hand}HP` : "";
  const season = formatPitcherSeason(line);
  const last3 = formatPitcherLast3(line);
  return `${line.name}${projected}${hand}${season ? `: ${season}` : ""}${last3 ? `; ${last3}` : ""}`;
}

export function etGameTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  });
}

/** "FINAL: St. Louis Cardinals 1, Pittsburgh Pirates 2", "IN PROGRESS: ...", "SUSPENDED: ..."; null before first pitch. */
export function gameStateLabel(game: MlbScheduleGame): string | null {
  const label = game.isFinal
    ? "FINAL"
    : game.state === "in"
      ? "IN PROGRESS"
      : game.status === "STATUS_SUSPENDED"
        ? "SUSPENDED"
        : null;
  if (!label) return null;
  const { away, home } = game;
  return away.score !== null && home.score !== null ? `${label}: ${away.name} ${away.score}, ${home.name} ${home.score}` : label;
}

/** One line of the MLB STARTING PITCHERS block: time, state and score once under way, both starters. */
export function starterLine(m: ProbableMatchup): string {
  const state = gameStateLabel(m.game);
  // A game under way with no listed starter: "TBD" would read as not yet decided
  const who = (line: PitcherLine | null) => (line || !state ? pitcherBrief(line) : "starter not listed");
  return `• ${etGameTime(m.game.gameDate)} ET${state ? ` [${state}]` : ""}: ${m.game.away.name} (${who(m.away)}) @ ${m.game.home.name} (${who(m.home)})`;
}
