// Career batter-vs-pitcher lines from MLB's public Stats API
// (statsapi.mlb.com — free, no key, CORS-open; same client-side pattern as
// the ESPN live-score polling). Our synced BDL tables don't carry BvP
// history, so this is fetched on demand and cached hard: MLBAM player ids
// never change (localStorage), and career-vs lines only move once a day.

const API = "https://statsapi.mlb.com/api/v1";

export interface BvpLine {
  avg: number | null;
  atBats: number;
  hits: number;
  homeRuns: number;
  ops: number | null;
}

// Three honest states — "never faced him" is a real insight, an API hiccup is not.
export type BvpResult =
  | { status: "ok"; line: BvpLine }
  | { status: "never-faced" }
  | { status: "unavailable" };

interface StatsApiPerson {
  id: number;
  fullName: string;
  active?: boolean;
  primaryPosition?: { abbreviation?: string };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();

/**
 * Choose the right person from a name search: exact (accent/period-
 * insensitive) name match first, then the expected role — pitcher names
 * like "Cole" can collide with position players — then still-active.
 */
export function pickPerson(
  people: StatsApiPerson[],
  name: string,
  wantPitcher: boolean
): StatsApiPerson | null {
  if (!people?.length) return null;
  const n = norm(name);
  const exact = people.filter((p) => norm(p.fullName) === n);
  const pool = exact.length ? exact : people;
  const rolePool = pool.filter((p) =>
    wantPitcher ? p.primaryPosition?.abbreviation === "P" : p.primaryPosition?.abbreviation !== "P"
  );
  const candidates = rolePool.length ? rolePool : pool;
  return candidates.find((p) => p.active !== false) || candidates[0] || null;
}

export function parseVsPlayerTotal(json: unknown): BvpLine | null {
  const split = (json as { stats?: Array<{ splits?: Array<{ stat?: Record<string, unknown> }> }> })
    ?.stats?.[0]?.splits?.[0];
  if (!split?.stat) return null;
  const st = split.stat as { avg?: string; ops?: string; atBats?: number; hits?: number; homeRuns?: number };
  const avg = parseFloat(st.avg ?? "");
  const ops = parseFloat(st.ops ?? "");
  return {
    avg: Number.isFinite(avg) ? avg : null,
    atBats: st.atBats ?? 0,
    hits: st.hits ?? 0,
    homeRuns: st.homeRuns ?? 0,
    ops: Number.isFinite(ops) ? ops : null,
  };
}

const idCacheKey = (name: string) => `mgp-mlbam-id:${norm(name)}`;

async function resolveId(name: string, wantPitcher: boolean): Promise<number | null> {
  try {
    const cached = localStorage.getItem(idCacheKey(name));
    if (cached) return Number(cached) || null;
  } catch {
    /* storage unavailable — fall through to network */
  }
  const res = await fetch(`${API}/people/search?names=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { people?: StatsApiPerson[] };
  const person = pickPerson(json.people || [], name, wantPitcher);
  if (!person) return null;
  try {
    localStorage.setItem(idCacheKey(name), String(person.id));
  } catch {
    /* fine — just uncached */
  }
  return person.id;
}

/** Career line for a batter against a pitcher, by name. */
export async function careerVsPitcher(batterName: string, pitcherName: string): Promise<BvpResult> {
  try {
    const [batterId, pitcherId] = await Promise.all([
      resolveId(batterName, false),
      resolveId(pitcherName, true),
    ]);
    if (!batterId || !pitcherId) return { status: "unavailable" };
    const res = await fetch(
      `${API}/people/${batterId}/stats?stats=vsPlayerTotal&group=hitting&opposingPlayerId=${pitcherId}`
    );
    if (!res.ok) return { status: "unavailable" };
    const line = parseVsPlayerTotal(await res.json());
    if (!line || line.atBats === 0) return { status: "never-faced" };
    return { status: "ok", line };
  } catch {
    return { status: "unavailable" };
  }
}
