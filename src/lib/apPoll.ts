// AP Top 25 for the NCAAF slate, straight from ESPN's public rankings
// endpoint (CORS-open, keyless; browsers are not caught by the TLS block that
// stops the edge functions).
//
// Why the slate does not trust ncaaf_games ranks alone: those are a snapshot
// written by the sync, and when the sync died on Aug 19 2026 every row kept
// the preseason poll. A month later the slate still showed Texas A&M at #8
// with the AP poll at #23. A game on the slate has not been played, so the
// rank it should carry is the CURRENT poll, which this fetches live; the
// stored rank is only a fallback, and only while it is fresh.

export const AP_POLL_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings";

/** A stored rank older than this may predate the latest poll (released weekly). */
export const STORED_RANK_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export interface ApPoll {
  /** ESPN team id to rank, ranked teams only. */
  ranks: Map<string, number>;
  season: number | null;
  week: number | null;
}

/** Ranked means 1 to 25. ESPN writes 99 for unranked teams, which must never count. */
export function isTop25(rank: number | null | undefined): rank is number {
  return typeof rank === "number" && Number.isInteger(rank) && rank >= 1 && rank <= 25;
}

interface RawPoll {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  season?: { year?: unknown } | null;
  occurrence?: { value?: unknown } | null;
  ranks?: Array<{ current?: unknown; team?: { id?: unknown } | null } | null> | null;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The AP poll out of a site.api rankings payload, or null. Matched on the AP
 * type, id or exact name only: the Coaches, FCS and CFP polls ride in the
 * same list and must never be read as the AP Top 25.
 */
export function parseApPoll(payload: unknown): ApPoll | null {
  const rankings = (payload as { rankings?: unknown } | null)?.rankings;
  if (!Array.isArray(rankings)) return null;
  const ap = (rankings as Array<RawPoll | null>).find(
    (p) => !!p && (p.type === "ap" || String(p.id ?? "") === "1" || p.name === "AP Top 25"),
  );
  if (!ap || !Array.isArray(ap.ranks)) return null;
  const ranks = new Map<string, number>();
  for (const r of ap.ranks) {
    const rank = toNumber(r?.current);
    const id = r?.team?.id;
    if (!isTop25(rank) || id === undefined || id === null || String(id) === "") continue;
    ranks.set(String(id), rank);
  }
  if (ranks.size === 0) return null;
  const requested = (payload as { requestedSeason?: { year?: unknown } | null } | null)?.requestedSeason;
  return {
    ranks,
    season: toNumber(ap.season?.year) ?? toNumber(requested?.year),
    week: toNumber(ap.occurrence?.value),
  };
}

export async function fetchApPoll(signal?: AbortSignal): Promise<ApPoll | null> {
  const res = await fetch(AP_POLL_URL, { signal });
  if (!res.ok) throw new Error(`ESPN rankings ${res.status}`);
  return parseApPoll(await res.json());
}

/**
 * The rank to print next to a team on an upcoming or live game: the live AP
 * poll when it loaded (and belongs to the game's season), otherwise the rank
 * the sync stored, but only if that row was refreshed recently enough to be
 * on the current poll. Unranked, unknown or stale all come back null.
 */
export function slateRank(args: {
  teamId: string | null | undefined;
  storedRank: number | null | undefined;
  storedAt: string | null | undefined;
  gameSeason: number | null | undefined;
  poll: ApPoll | null | undefined;
  now?: number;
}): number | null {
  const { teamId, storedRank, storedAt, gameSeason, poll } = args;
  const pollFitsGame = !!poll && (poll.season === null || gameSeason == null || poll.season === gameSeason);
  if (poll && pollFitsGame) {
    return teamId ? poll.ranks.get(String(teamId)) ?? null : null;
  }
  if (poll && !pollFitsGame) return null; // last season's final poll, next season's game
  if (!isTop25(storedRank) || !storedAt) return null;
  const age = (args.now ?? Date.now()) - Date.parse(storedAt);
  return Number.isFinite(age) && age <= STORED_RANK_MAX_AGE_MS ? storedRank : null;
}
