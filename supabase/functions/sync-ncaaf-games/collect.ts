// Fetches the NCAAF (FBS) schedule and the AP polls that rank it.
//
// Kept apart from index.ts (auth, database, odds) so it can be exercised
// locally in Deno without writing anything. Deno is what ESPN blocks, so a
// local Deno run takes the same CDN-fallback path production does.
import { espnFetch } from "../_shared/espn-fetch.ts";
import {
  apRankMap,
  type EspnEvent,
  findApPoll,
  type PollSet,
  type ScoreboardWeek,
  servedPoll,
  type ServedPoll,
  slimEvent,
  startedRegularSeasonWeeks,
  weekKey,
  weeksInWindow,
} from "./ranks.ts";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";

type Fetcher = (url: string) => Promise<Response>;

export interface CollectResult {
  events: EspnEvent[];
  polls: PollSet;
  diagnostics: {
    weeks: string[];
    weeksFailed: string[];
    latestPoll: ServedPoll | null;
    latestRanked: number;
    weekPolls: string[];
    weekPollsMissing: string[];
  };
}

const label = (w: ScoreboardWeek) => `${w.year}/${w.seasonType}/${w.week}`;

interface ScoreboardPayload {
  events?: EspnEvent[];
  week?: { number?: number };
  season?: { year?: number; type?: number };
  leagues?: Array<{ calendar?: unknown; season?: { year?: number } }>;
}

async function getJson<T>(fetcher: Fetcher, url: string): Promise<T | null> {
  const res = await fetcher(url);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    console.error(`[sync-ncaaf-games] ESPN ${res.status} for ${url}`);
    return null;
  }
  return (await res.json()) as T;
}

export async function collectNcaaf(
  windowStart: Date,
  windowEnd: Date,
  fetcher: Fetcher = espnFetch,
): Promise<CollectResult> {
  const diagnostics: CollectResult["diagnostics"] = {
    weeks: [],
    weeksFailed: [],
    latestPoll: null,
    latestRanked: 0,
    weekPolls: [],
    weekPollsMissing: [],
  };

  // The current scoreboard carries the season calendar that maps dates to
  // weeks. If this fails, nothing else can be trusted: throw.
  const current = await getJson<ScoreboardPayload>(fetcher, `${ESPN}/scoreboard?groups=80&limit=500`);
  const league = current?.leagues?.[0];
  const seasonYear = league?.season?.year ?? current?.season?.year;
  if (!current || !Array.isArray(league?.calendar) || typeof seasonYear !== "number") {
    throw new Error("ESPN NCAAF scoreboard unavailable (no calendar)");
  }

  // Week by week, once each. Walking 68 dates re-downloaded every week about
  // 7 times through the CDN mirror (1.6 MB a copy) and returned every game
  // once per date, which the upsert rejects as a duplicate key.
  const weeks = weeksInWindow(league.calendar, seasonYear, windowStart, windowEnd);
  diagnostics.weeks = weeks.map(label);
  const eventsById = new Map<string, EspnEvent>();
  const keep = (payload: ScoreboardPayload) => {
    for (const ev of payload.events ?? []) {
      if (!ev?.id) continue;
      const slim = slimEvent(ev, {
        year: payload.season?.year,
        type: payload.season?.type,
        week: payload.week?.number,
      });
      eventsById.set(slim.id, slim);
    }
  };

  for (const w of weeks) {
    const isCurrent = current.season?.type === w.seasonType && current.week?.number === w.week;
    try {
      const payload = isCurrent ? current : await getJson<ScoreboardPayload>(
        fetcher,
        `${ESPN}/scoreboard?dates=${w.year}&seasontype=${w.seasonType}&week=${w.week}&groups=80&limit=500`,
      );
      if (!payload) {
        diagnostics.weeksFailed.push(label(w));
        continue;
      }
      // Never accept a substituted week: an ignored filter serves the current
      // week, which would silently rewrite the wrong games.
      if (w.seasonType === 2 && (payload.week?.number !== w.week || payload.season?.type !== 2)) {
        console.error(
          `[sync-ncaaf-games] asked for week ${label(w)}, got ${payload.season?.type}/${payload.week?.number}`,
        );
        diagnostics.weeksFailed.push(label(w));
        continue;
      }
      keep(payload);
    } catch (err) {
      console.error(`[sync-ncaaf-games] week ${label(w)} failed:`, err);
      diagnostics.weeksFailed.push(label(w));
    }
  }
  if (weeks.length > 0 && diagnostics.weeksFailed.length === weeks.length) {
    // Upserting nothing and returning success is how the Aug 19 2026 outage
    // stayed hidden for a week.
    throw new Error(`All ${weeks.length} ESPN NCAAF week scoreboards failed`);
  }
  const events = [...eventsById.values()];

  // The newest AP poll ranks every game that has not kicked off.
  const polls: PollSet = { latest: null, byWeek: new Map() };
  try {
    const payload = await getJson<{ rankings?: unknown }>(fetcher, `${ESPN}/rankings`);
    const ranks = apRankMap(findApPoll(payload?.rankings));
    if (payload && ranks) {
      const served = servedPoll(payload);
      polls.latest = { season: served.season, ranks };
      diagnostics.latestPoll = served;
      diagnostics.latestRanked = ranks.size;
      if (served.season !== null && served.seasonType === 2 && served.week !== null) {
        polls.byWeek.set(weekKey(served.season, served.week), ranks);
      }
    } else {
      console.error("[sync-ncaaf-games] no AP Top 25 in the rankings payload");
    }
  } catch (err) {
    console.error("[sync-ncaaf-games] rankings fetch failed:", err);
  }

  // Games already played keep the AP poll of their own week (rank at kickoff).
  for (const { season, week } of startedRegularSeasonWeeks(events)) {
    const key = weekKey(season, week);
    if (polls.byWeek.has(key)) {
      diagnostics.weekPolls.push(key);
      continue;
    }
    try {
      const payload = await getJson<{ rankings?: unknown }>(
        fetcher,
        `${ESPN}/rankings?seasons=${season}&types=2&weeks=${week}`,
      );
      const served = servedPoll(payload);
      const ranks = apRankMap(findApPoll(payload?.rankings));
      // Week 1 has no AP poll of its own (the preseason poll governs it), and a
      // payload for any other week than the one asked for is refused. Either
      // way those games fall back to ESPN's curatedRank for that week.
      if (ranks && served.season === season && served.seasonType === 2 && served.week === week) {
        polls.byWeek.set(key, ranks);
        diagnostics.weekPolls.push(key);
      } else {
        diagnostics.weekPollsMissing.push(key);
      }
    } catch (err) {
      console.error(`[sync-ncaaf-games] AP poll for ${key} failed:`, err);
      diagnostics.weekPollsMissing.push(key);
    }
  }

  return { events, polls, diagnostics };
}
