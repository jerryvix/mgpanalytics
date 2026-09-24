// Shared fetch wrapper for ESPN's public APIs.
//
// On Aug 19 2026 ESPN's Akamai edge started returning 403 "Access Denied" to
// site.api.espn.com for any request whose User-Agent is not browser-like.
// Deno sends "User-Agent: Deno/x.y.z" by default, so every edge function
// calling the scoreboard endpoints began failing at once: MLB games, NCAAF
// games and the odds snapshots all stopped writing on the same day while the
// syncs still reported success (each call site logs the error and continues).
//
// sports.core.api.espn.com was NOT blocked, but it is routed through the same
// CDN, so send the browser User-Agent everywhere rather than waiting for the
// next tightening.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export async function espnFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json, text/plain, */*",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 403) {
    const parsed = new URL(url);
    if (parsed.hostname === "site.api.espn.com") {
      const fallback = await espnCdnFallback(parsed).catch(() => null);
      if (fallback) return fallback;
    }
  }
  return res;
}

// Aug 28 2026: the UA fix above stopped working. Akamai now returns 403 on
// site.api.espn.com to any non-browser TLS client (curl and Deno get 403 even
// with a browser User-Agent, while real browsers still get 200), so no header
// change can fix it from an edge function. cdn.espn.com/core/{league}/{page}
// serves the identical payloads and still accepts non-browser clients:
// scoreboard JSON is wrapped at content.sbData and rankings at content.data.
// When site.api answers 403 for a scoreboard or rankings URL, retry through
// the CDN mirror and unwrap, so callers keep seeing the site.api shape.
const CDN_PAGES = new Set(["scoreboard", "rankings"]);

// site.api's scoreboard defaults to the full division; the CDN page defaults to
// the Top 25 view, which silently dropped 71 NCAAF games down to 18 and halved
// the NCAAB slate. site.api spells the filter "groups", the CDN "group".
const CDN_DEFAULT_GROUP: Record<string, string> = {
  "college-football": "80", // FBS
  "mens-college-basketball": "50", // Division I
};

// Football scoreboards are week-scoped, not day-scoped: /_/date/ on these
// leagues quietly serves the CURRENT week whatever date you ask for, so a
// caller walking 68 individual dates would rewrite this week's games 68 times
// and never see the rest of its window. These need /_/week/N/year/Y/seasontype/T.
const WEEK_SCOPED_LEAGUES = new Set(["college-football", "nfl"]);

type CalendarEntry = { startDate?: string; endDate?: string; value?: string };
type CalendarSeason = { value?: string; entries?: CalendarEntry[] };

const calendarCache = new Map<string, Promise<CalendarSeason[] | null>>();

async function leagueCalendar(league: string): Promise<CalendarSeason[] | null> {
  const cached = calendarCache.get(league);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const res = await fetch(`https://cdn.espn.com/core/${league}/scoreboard?xhr=1`, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json, text/plain, */*" },
      });
      if (!res.ok) return null;
      const body = await res.json();
      const cal = body?.content?.sbData?.leagues?.[0]?.calendar;
      return Array.isArray(cal) ? (cal as CalendarSeason[]) : null;
    } catch {
      return null;
    }
  })();
  calendarCache.set(league, pending);
  return pending;
}

// "20260919" -> "/_/week/3/year/2026/seasontype/2", or null when the date falls
// outside the season ESPN is currently publishing (then the caller's date is
// genuinely unavailable and we would rather fetch nothing than the wrong week).
async function weekPathFor(league: string, yyyymmdd: string): Promise<string | null> {
  const calendar = await leagueCalendar(league);
  if (!calendar) return null;
  const target = Date.parse(
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T12:00:00Z`,
  );
  if (Number.isNaN(target)) return null;
  for (const season of calendar) {
    for (const entry of season.entries ?? []) {
      const start = Date.parse(entry.startDate ?? "");
      const end = Date.parse(entry.endDate ?? "");
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      if (target >= start && target <= end) {
        const year = new Date(start).getUTCFullYear();
        return `/_/week/${entry.value}/year/${year}/seasontype/${season.value}`;
      }
    }
  }
  return null;
}

async function cdnMirrorUrl(original: URL): Promise<URL | null> {
  // /apis/site/v2/sports/{sport}/{league}/{page} -> /core/{league}/{page}
  const parts = original.pathname.split("/").filter(Boolean);
  const sportsIdx = parts.indexOf("sports");
  if (sportsIdx === -1 || parts.length < sportsIdx + 3) return null;
  const league = parts[sportsIdx + 2];
  const page = parts[sportsIdx + 3];
  if (!CDN_PAGES.has(page)) return null;

  // Sep 23 2026: the CDN mirror silently IGNORES ?dates=, so every date in a
  // caller's loop came back as today's slate. sync-mlb-games walks -2/+4 days
  // and sync-ncaaf-games walks -7/+60, so the forward schedule (and the odds
  // that hang off it) would never populate. The date has to move into the path.
  const dates = original.searchParams.get("dates");
  let scopePath = "";
  if (dates && /^\d{8}$/.test(dates)) {
    if (WEEK_SCOPED_LEAGUES.has(league)) {
      scopePath = (await weekPathFor(league, dates)) ?? "";
      if (!scopePath) return null;
    } else {
      scopePath = `/_/date/${dates}`;
    }
  }

  const mirror = new URL(`https://cdn.espn.com/core/${league}/${page}${scopePath}`);
  original.searchParams.forEach((v, k) => {
    if (scopePath && k === "dates") return;
    if (k === "limit") return; // CDN pages ignore it and it suppresses `group`
    mirror.searchParams.set(k === "groups" ? "group" : k, v);
  });
  if (page === "scoreboard" && !mirror.searchParams.has("group") && CDN_DEFAULT_GROUP[league]) {
    mirror.searchParams.set("group", CDN_DEFAULT_GROUP[league]);
  }
  // site.api picks a past poll with plural filters (seasons/types/weeks); the
  // CDN page honors only the singular web ones and, handed the plural
  // spelling, silently serves the LATEST poll, so a request for Week 3 would
  // come back as this week's rankings with nothing to flag it.
  if (page === "rankings") {
    for (const [from, to] of [["seasons", "year"], ["types", "seasontype"], ["weeks", "week"]]) {
      const v = mirror.searchParams.get(from);
      if (v === null) continue;
      mirror.searchParams.delete(from);
      mirror.searchParams.set(to, v);
    }
  }
  // Sep 23 2026: the CDN keeps serving some cached scoreboard URLs long past
  // their max-age (a finished extra-inning MLB game still read "Bottom 10th"
  // 40 minutes after the final out) and ignores "_" as a cache buster. Any new
  // query key forces a fresh render; a per-minute value still lets the calls
  // one sync makes within that minute share a cache entry.
  if (page === "scoreboard") mirror.searchParams.set("mgpts", String(Math.floor(Date.now() / 60_000)));
  mirror.searchParams.set("xhr", "1");
  return mirror;
}

// The CDN rankings payload is the shape the web page renders, not the site.api
// shape: entries are flat ({ rank, team_display_name, team_url }) where callers
// expect { current, team: { id, displayName } }, and the team id survives only
// inside team_url. Without this the fallback "succeeds" and yields zero ranked
// teams, which is how the AP Top 25 would come back blank.
function normalizeCdnRankings(payload: Record<string, unknown>): Record<string, unknown> {
  const polls = payload?.rankings;
  if (!Array.isArray(polls)) return payload;
  const alreadySiteShape = polls.some(
    (p: { ranks?: Array<{ current?: unknown }> }) => p?.ranks?.[0]?.current !== undefined,
  );
  if (alreadySiteShape) return payload;

  // The web payload has no requestedSeason either. The selected week filter's
  // href (/college-football/rankings/_/week/3/year/2026/seasontype/2) says
  // which poll was actually served, so callers can refuse a substituted week.
  const filters = Array.isArray(payload.weekFilters) ? payload.weekFilters : [];
  const selected = filters.find((f: { selected?: unknown }) => f?.selected === true) as
    | { href?: unknown }
    | undefined;
  const served = String(selected?.href ?? "").match(/\/week\/(\d+)\/year\/(\d+)\/seasontype\/(\d+)/);

  return {
    ...payload,
    ...(payload.requestedSeason === undefined && served
      ? {
        requestedSeason: {
          year: Number(served[2]),
          type: { type: Number(served[3]) },
          week: { number: Number(served[1]) },
        },
      }
      : {}),
    rankings: polls.map((poll: Record<string, unknown>) => {
      const ranks = Array.isArray(poll.ranks) ? poll.ranks : [];
      return {
        ...poll,
        shortName: poll.shortName ?? poll.short_name ?? null,
        ranks: ranks.map((r: Record<string, unknown>) => ({
          ...r,
          current: r.rank,
          previous: r.previous_rank,
          team: {
            // team_url ends /id/251/texas-longhorns; the logo URL (.../500/251.png)
            // backs it up so a reshaped link cannot silently unrank a team.
            id: String(r.team_url ?? "").match(/\/id\/(\d+)(?:[/?#]|$)/)?.[1] ??
              String(r.team_logo ?? "").match(/\/(\d+)\.png/)?.[1] ??
              null,
            displayName: r.team_display_name ?? null,
            abbreviation: r.team_abbreviation ?? null,
          },
        })),
      };
    }),
  };
}

async function espnCdnFallback(original: URL): Promise<Response | null> {
  const mirror = await cdnMirrorUrl(original);
  if (!mirror) return null;
  const res = await fetch(mirror, {
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json, text/plain, */*" },
  });
  if (!res.ok) return null;
  const wrapped = await res.json().catch(() => null);
  const scoreboard = wrapped?.content?.sbData ?? null;
  const payload = scoreboard ?? (wrapped?.content?.data ? normalizeCdnRankings(wrapped.content.data) : null);
  if (!payload) return null;
  console.log(`[espn-fetch] site.api 403, served via CDN mirror: ${mirror.pathname}`);
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
