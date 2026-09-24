// Known players' full names, so the chat's DraftKings matcher (pulse-chat.ts)
// can tell a player question from a game question: in "jalen hurts alabama"
// or "Bryce Young Alabama" the school is where the player went, not a game
// to price. The NFL and MLB rosters (players, every status) and the NCAAF
// draft board (ncaaf_draft_prospects), read once per process and kept for six
// hours; a failed read leaves the matcher without them rather than failing
// the chat. Covered by src/test/pulseChat.test.ts.

import { normalizeTeamName } from "../sync-betting-splits/match.ts";
import { selectAll } from "./select-all.ts";

/** Full names by their first word, each as normalized words ("jalen hurts" under "jalen") */
export interface PlayerNames {
  byFirst: Map<string, string[][]>;
}

const TTL_MS = 6 * 3600_000;
// Name suffixes a question usually drops ("Marvin Harrison Jr." asked as "Marvin Harrison")
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

let cache: { at: number; names: PlayerNames } | null = null;

/** An index of full names (two words or more), with and without a suffix */
export function indexPlayerNames(names: string[]): PlayerNames {
  const byFirst = new Map<string, string[][]>();
  const add = (words: string[]) => {
    if (words.length < 2) return;
    byFirst.set(words[0], [...(byFirst.get(words[0]) ?? []), words]);
  };
  for (const name of names) {
    const words = normalizeTeamName(name).split(" ").filter(Boolean);
    add(words);
    if (words.length > 2 && SUFFIXES.has(words[words.length - 1])) add(words.slice(0, -1));
  }
  return { byFirst };
}

/** Token spans [start, end) of the known players' full names in a normalized question, longest first */
export function playerSpans(tokens: string[], names: PlayerNames | null | undefined): Array<[number, number]> {
  if (!names) return [];
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i++) {
    let best = 0;
    for (const words of names.byFirst.get(tokens[i]) ?? []) {
      if (words.length > best && words.every((w, k) => tokens[i + k] === w)) best = words.length;
    }
    if (best) {
      spans.push([i, i + best]);
      i += best - 1;
    }
  }
  return spans;
}

/** The known players' names, read once per process (six-hour cache); null when the read fails */
// deno-lint-ignore no-explicit-any
export async function loadPlayerNames(client: any, now: Date = new Date()): Promise<PlayerNames | null> {
  if (cache && now.getTime() - cache.at < TTL_MS) return cache.names;
  try {
    const [pros, prospects] = await Promise.all([
      selectAll<{ name: string }>(() => client.from("players").select("name").in("sport", ["NFL", "MLB"]).order("id"), {
        label: "player names",
      }),
      client.from("ncaaf_draft_prospects").select("player_name").limit(1000),
    ]);
    if (prospects.error) throw new Error(prospects.error.message);
    const names = indexPlayerNames([
      ...pros.map((p) => p.name),
      ...((prospects.data ?? []) as Array<{ player_name: string }>).map((p) => p.player_name),
    ]);
    cache = { at: now.getTime(), names };
    return names;
  } catch (e) {
    console.error("[player-names] read failed; matching without player names", e);
    return null;
  }
}

/** The names already read in the last six hours, without a read (null before the first) */
export function cachedPlayerNames(now: Date = new Date()): PlayerNames | null {
  return cache && now.getTime() - cache.at < TTL_MS ? cache.names : null;
}

/** Tests: forget the cached names */
export function clearPlayerNames(): void {
  cache = null;
}
