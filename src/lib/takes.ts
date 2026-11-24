// Takes (DECISIONS D-060, D-065, D-066, D-074): picks from outside betting shows,
// grouped by game, soonest first. Shows that make the same pick share one row.

export interface TakeRow {
  id: string;
  show: string;
  show_name: string;
  person: string | null;
  sport: string;
  espn_event_id: string;
  matchup: string;
  starts_at: string;
  market: string;
  pick: string;
  price: string | null;
  legs: string[] | null;
  why: string | null;
  risks: string | null;
  /** Link to the original post, when the take came from X */
  url?: string | null;
  units?: number | null;
}

export interface TakeSource {
  show: string;
  showName: string;
  person: string | null;
  why: string | null;
  risks: string | null;
  url?: string | null;
  units?: number | null;
}

export interface GroupedTake {
  key: string;
  pick: string;
  price: string | null;
  legs: string[];
  sources: TakeSource[];
}

export interface TakesGame {
  eventId: string;
  sport: string;
  matchup: string;
  startsAt: string;
  takes: GroupedTake[];
}

const MARKET_ORDER: Record<string, number> = { spread: 0, moneyline: 1, total: 2, prop: 3, parlay: 4, other: 5 };

/** Upcoming games with their picks; games that have started are left out. */
export function groupTakes(rows: TakeRow[], now: Date = new Date()): TakesGame[] {
  const games = new Map<string, TakesGame & { order: Map<string, number> }>();
  for (const r of rows) {
    if (Date.parse(r.starts_at) <= now.getTime()) continue;
    let g = games.get(r.espn_event_id);
    if (!g) {
      g = { eventId: r.espn_event_id, sport: r.sport, matchup: r.matchup, startsAt: r.starts_at, takes: [], order: new Map() };
      games.set(r.espn_event_id, g);
    }
    const key = `${r.pick.toLowerCase()}|${(r.legs ?? []).join("|").toLowerCase()}`;
    let t = g.takes.find((x) => x.key === key);
    if (!t) {
      t = { key, pick: r.pick, price: r.price, legs: r.legs ?? [], sources: [] };
      g.takes.push(t);
      g.order.set(key, MARKET_ORDER[r.market] ?? 9);
    }
    if (!t.sources.some((s) => s.show === r.show && s.person === r.person)) {
      t.sources.push({
        show: r.show, showName: r.show_name, person: r.person, why: r.why, risks: r.risks,
        url: r.url ?? null, units: r.units ?? null,
      });
    }
  }
  return [...games.values()]
    .map(({ order, ...g }) => ({
      ...g,
      takes: [...g.takes].sort((a, b) => (order.get(a.key) ?? 9) - (order.get(b.key) ?? 9) || b.sources.length - a.sources.length),
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** "Mike McClure · SportsLine", or "Hold The Phone, Bear Bets" when shows share a pick. */
export function creditLine(sources: TakeSource[]): string {
  if (sources.length === 1) {
    const s = sources[0];
    return s.person ? `${s.person} · ${s.showName}` : s.showName;
  }
  return [...new Set(sources.map((s) => s.showName))].join(", ");
}

/** "5u" or "2.5u". Empty when there is no stake. */
export function unitsSuffix(units: number | null | undefined): string | null {
  if (units == null || !Number.isFinite(Number(units))) return null;
  const n = Math.round(Number(units) * 10) / 10;
  if (n <= 0 || n > 100) return null;
  return `${Number.isInteger(n) ? n.toFixed(0) : String(n)}u`;
}

/** Stake shown on the pick when every source that shares it names the same size. */
export function sharedUnits(sources: { units?: number | null }[]): number | null {
  if (!sources.length) return null;
  const first = sources[0].units;
  if (first == null || !sources.every((s) => s.units === first)) return null;
  return first;
}

export function withUnits(label: string, units: number | null | undefined): string {
  const u = unitsSuffix(units);
  return u ? `${label} · ${u}` : label;
}

/** "Same Game Parlay +400 (4 Legs)" or "Bengals -6 (-113)". */
export function pickLabel(t: Pick<GroupedTake, "pick" | "price" | "legs">): string {
  if (t.legs.length > 1) return `${t.pick}${t.price ? ` ${t.price}` : ""} (${t.legs.length} Legs)`;
  return t.price ? `${t.pick} (${t.price})` : t.pick;
}

/** League tag line: "NBA · Tonight 8:00 PM", "NFL · Thu 1:00 PM" (viewer's local time). */
export function whenLabel(startsAt: string, now: Date = new Date(), timeZone?: string): string {
  const d = new Date(startsAt);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  const dayKey = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(x);
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  const day = dayKey(d);
  if (day === today) return `${Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(d)) >= 17 ? "Tonight" : "Today"} ${time}`;
  if (day === tomorrow) return `Tomorrow ${time}`;
  return `${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(d)} ${time}`;
}

export const SHOW_LOGOS: Record<string, string> = {
  "early-edge": "/takes/sportsline.png",
  "bear-bets": "/takes/bear-bets.png",
  "hold-the-phone": "/takes/hold-the-phone.png",
};
