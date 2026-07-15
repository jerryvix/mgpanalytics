// Live scores straight from ESPN's public scoreboard (CORS-open, no key).
// Fetched client-side on demand — no cron, no schema, no backend changes.
// The batch syncs still own persistence; this layer is display-only.

export type LiveSport = "NFL" | "NBA" | "MLB" | "NCAAF" | "NCAAB";

const ESPN_PATH: Record<LiveSport, string> = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NCAAF: "football/college-football",
  NCAAB: "basketball/mens-college-basketball",
};

export interface LiveGame {
  espnId: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  state: "pre" | "in" | "post";
  detail: string; // e.g. "10:23 - 3rd", "Bot 7th", "Final"
  period: number | null;
  clock: string | null;
}

/** Stable matchup key: away @ home, lowercased. */
export function liveKey(awayName: string, homeName: string): string {
  return `${(awayName || "").trim().toLowerCase()}@${(homeName || "").trim().toLowerCase()}`;
}

/** Pure — parse an ESPN scoreboard payload into LiveGames (testable). */
export function normalizeScoreboard(json: unknown): LiveGame[] {
  const events = (json as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return [];
  const games: LiveGame[] = [];
  for (const ev of events as any[]) {
    const comp = ev?.competitions?.[0];
    const competitors: any[] = comp?.competitors || [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const status = ev?.status || comp?.status || {};
    const state = status?.type?.state;
    if (state !== "pre" && state !== "in" && state !== "post") continue;
    const score = (c: any) => {
      const n = Number(c?.score);
      return Number.isFinite(n) ? n : null;
    };
    games.push({
      espnId: String(ev.id ?? ""),
      homeName: home?.team?.displayName || "",
      awayName: away?.team?.displayName || "",
      homeScore: score(home),
      awayScore: score(away),
      state,
      detail: status?.type?.shortDetail || status?.type?.description || "",
      period: typeof status?.period === "number" ? status.period : null,
      clock: status?.displayClock ?? null,
    });
  }
  return games;
}

/** Fetch today's scoreboard for a sport, keyed by away@home matchup. */
export async function fetchLiveScores(sport: LiveSport): Promise<Map<string, LiveGame>> {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/scoreboard`);
  if (!res.ok) throw new Error(`ESPN scoreboard ${sport}: ${res.status}`);
  const games = normalizeScoreboard(await res.json());
  return new Map(games.map((g) => [liveKey(g.awayName, g.homeName), g]));
}
