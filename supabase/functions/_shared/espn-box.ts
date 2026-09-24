// ESPN NFL box scores for the phantom-line guard (sync-nfl-game-logs).
//
// site.api.espn.com 403s edge functions (TLS fingerprinting), so neither path
// here touches it:
//   - event ids: the week-scoped CDN scoreboard,
//     cdn.espn.com/core/nfl/scoreboard/_/week/W/year/SEASON/seasontype/T?xhr=1
//     (the same mirror the games and odds syncs already run on),
//   - the box itself: cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=ID (~170 KB),
//     falling back to site.web.api.espn.com's summary (~500 KB), which also
//     answers non-browser clients.
import {
  boxParticipants,
  normalizePersonName,
  rosterAppearances,
  sharedLastNameIds,
  type BdlGame,
  type BoxParticipants,
  type PlayoffRoster,
} from "./nfl-sync.ts";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/** "home|away" (normalized full names) -> ESPN event id, for one week of games. */
export async function espnWeekEventIds(season: number, postseason: boolean, week: number): Promise<Map<string, string>> {
  const type = postseason ? 3 : 2;
  // deno-lint-ignore no-explicit-any
  const body: any = await getJson(`https://cdn.espn.com/core/nfl/scoreboard/_/week/${week}/year/${season}/seasontype/${type}?xhr=1`);
  const out = new Map<string, string>();
  for (const e of body?.content?.sbData?.events ?? []) {
    const comps = e.competitions?.[0]?.competitors ?? [];
    // deno-lint-ignore no-explicit-any
    const home = comps.find((c: any) => c.homeAway === "home")?.team?.displayName;
    // deno-lint-ignore no-explicit-any
    const away = comps.find((c: any) => c.homeAway === "away")?.team?.displayName;
    if (e.id && home && away) out.set(`${normalizePersonName(home)}|${normalizePersonName(away)}`, String(e.id));
  }
  return out;
}

export function espnEventKey(game: BdlGame): string {
  return `${normalizePersonName(game.home_team?.full_name)}|${normalizePersonName(game.visitor_team?.full_name)}`;
}

/**
 * ESPN's game rosters for every completed playoff game of a season (Wild Card,
 * Divisional, Conference, Super Bowl; week 4 is the Pro Bowl), for the official
 * postseason games-played count (see officialGamesPlayed). The scoreboards come
 * from the CDN mirror, the rosters from sports.core.api.espn.com, which answers
 * edge functions. Null when no scoreboard can be read.
 */
export async function espnPlayoffRosters(season: number): Promise<PlayoffRoster[] | null> {
  const games: Array<{ eventId: string; teamId: string; team: string }> = [];
  let scoreboards = 0;
  for (const week of [1, 2, 3, 5]) {
    // deno-lint-ignore no-explicit-any
    const body: any = await getJson(`https://cdn.espn.com/core/nfl/scoreboard/_/week/${week}/year/${season}/seasontype/3?xhr=1`);
    if (!body) continue;
    scoreboards++;
    for (const e of body?.content?.sbData?.events ?? []) {
      const final = e.status?.type?.completed === true || /FINAL/i.test(e.status?.type?.name ?? "");
      if (!final || !e.id) continue;
      for (const c of e.competitions?.[0]?.competitors ?? []) {
        if (c.id && c.team?.displayName) games.push({ eventId: String(e.id), teamId: String(c.id), team: c.team.displayName });
      }
    }
  }
  if (scoreboards === 0) return null;
  const rosters: PlayoffRoster[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, games.length) }, async () => {
    while (next < games.length) {
      const g = games[next++];
      const roster = await getJson(
        `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${g.eventId}/competitions/${g.eventId}/competitors/${g.teamId}/roster?lang=en&region=us`,
      );
      if (roster) rosters.push({ team: g.team, entries: rosterAppearances(roster) });
    }
  }));

  // Game rosters name players by last name only. Where two teammates share
  // one, look up their full names (a handful of small athlete calls).
  const ambiguous = [...sharedLastNameIds(rosters)];
  const fullNames = new Map<string, string>();
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(4, ambiguous.length) }, async () => {
    while (k < ambiguous.length) {
      const id = ambiguous[k++];
      // deno-lint-ignore no-explicit-any
      const athlete: any = await getJson(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${id}?lang=en&region=us`);
      const name = athlete?.displayName ?? [athlete?.firstName, athlete?.lastName].filter(Boolean).join(" ");
      if (name) fullNames.set(id, name);
    }
  }));
  for (const r of rosters) for (const e of r.entries) if (fullNames.has(e.espnId)) e.fullName = fullNames.get(e.espnId);
  return rosters;
}

/** Players with any stat, per team, or null when neither source returns both teams. */
export async function espnBoxParticipants(eventId: string): Promise<{ participants: BoxParticipants; source: string } | null> {
  // deno-lint-ignore no-explicit-any
  const cdn: any = await getJson(`https://cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=${eventId}`);
  const fromCdn = boxParticipants(cdn?.gamepackageJSON?.boxscore);
  if (fromCdn.size === 2) return { participants: fromCdn, source: "cdn_boxscore" };

  // deno-lint-ignore no-explicit-any
  const web: any = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`);
  const fromWeb = boxParticipants(web?.boxscore);
  if (fromWeb.size === 2) return { participants: fromWeb, source: "site_web_summary" };
  return null;
}
