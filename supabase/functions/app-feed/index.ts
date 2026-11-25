// app-feed (DECISIONS D-079): the iPhone app's one read-only data endpoint.
//
// Joins, per game: ESPN's schedule, status and DraftKings line; the latest DraftKings
// Betting Splits (betting_splits, synced every 4 hours); the one line per game
// (game_lines, D-075); the shows' picks (takes, D-074); and, on the game view,
// credited market notes from public X posts (market_notes, D-102) and the game's
// strongest player line (player_lines, D-105). Public data only, so it runs without a
// user token and is cached briefly at the edge.
//
// GET ?view=day&date=YYYY-MM-DD&sports=NFL,NCAAF,NBA   games on one Eastern date
// GET ?view=game&id=<ESPN event id>&sport=NBA           one game with every market's splits, its Takes and its player line
// GET ?view=pulse&sports=NFL,NCAAF,NBA                  boards across the next 3 days, Takes, the day's strongest lines
// GET ?view=sports                                      the sports the feed serves, [{ key, label }]
//
// Sports (D-116): NFL, college football and the NBA. Men's college basketball (NCAAB) joins only
// when the function secret ENABLE_NCAAB is "true"; the day and pulse views also return `sports`,
// which the app uses for its sport chips and sections, so turning it on needs no app update.
//
// Capper Picks (D-093, D-112): a show's pick stays up for 12 hours after its game starts. Each
// pick on the pulse and game views carries `state` (ESPN's pre, in or post), `final`
// ("WSH 22, CIN 20" once the game is final) and `result` (hit, miss, push, or null when
// it can't be graded; see _shared/takes-grade.ts). `person` is one host's name only
// when exactly one is known; otherwise null and the app credits the show.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { espnFetch } from "../_shared/espn-fetch.ts";
import { xAccount } from "../_shared/takes-sources.ts";
import { creditedPerson, finalLabel, type GameBox, gradeTake, needsBox, parseBox } from "../_shared/takes-grade.ts";
import { type FeedSport, feedSports, requestedSports, sportList } from "../_shared/feed-sports.ts";

type Sport = FeedSport;
const PATHS: Record<Sport, string> = {
  NFL: "football/nfl",
  NCAAF: "football/college-football",
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
};
// College basketball: Division I only (ESPN group 50)
const QUERY: Record<Sport, string> = { NFL: "", NCAAF: "&groups=80&limit=300", NBA: "", NCAAB: "&groups=50&limit=400" };
const LEAGUE: Record<Sport, string> = { NFL: "nfl", NCAAF: "college-football", NBA: "nba", NCAAB: "mens-college-basketball" };
const ET = "America/New_York";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };

interface Side { pct: number; team: string; line: number | null; price: number | null }
interface Market { away?: { bets: number; money: number; line: number | null; price: number | null }; home?: { bets: number; money: number; line: number | null; price: number | null }; over?: { bets: number; money: number; line: number | null; price: number | null }; under?: { bets: number; money: number; line: number | null; price: number | null } }

function etDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function nameMatch(dk: string, team: Record<string, string>): boolean {
  const a = norm(dk);
  const candidates = [team.displayName, team.shortDisplayName, team.location, `${team.location} ${team.name}`].filter(Boolean).map(norm);
  return candidates.some((c) => c === a || a.startsWith(c + " ") || c.startsWith(a + " "));
}

// deno-lint-ignore no-explicit-any
function shapeTeam(c: any) {
  const t = c.team ?? {};
  return {
    id: String(t.id), abbr: t.abbreviation, name: t.shortDisplayName, location: t.location, displayName: t.displayName,
    logo: t.logo, color: t.color ? `#${t.color}` : null, altColor: t.alternateColor ? `#${t.alternateColor}` : null, record: c.records?.[0]?.summary ?? null,
    rank: c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : null,
    score: c.score ?? null,
  };
}

// deno-lint-ignore no-explicit-any
async function espnEvents(sport: Sport, date: string): Promise<any[]> {
  const res = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/${PATHS[sport]}/scoreboard?dates=${date.replaceAll("-", "")}${QUERY[sport]}`);
  if (!res.ok) return [];
  const body = await res.json();
  // deno-lint-ignore no-explicit-any
  return (body.events ?? []).map((e: any) => {
    const c = e.competitions?.[0] ?? {};
    // deno-lint-ignore no-explicit-any
    const home = c.competitors?.find((x: any) => x.homeAway === "home");
    // deno-lint-ignore no-explicit-any
    const away = c.competitors?.find((x: any) => x.homeAway === "away");
    const odds = c.odds?.[0] ?? {};
    return {
      id: String(e.id), sport, start: e.date, state: c.status?.type?.state ?? "pre", status: c.status?.type?.shortDetail ?? "",
      neutral: Boolean(c.neutralSite), venue: c.venue?.fullName ?? null,
      // National channels only (D-092): local and team streams ("DAZN MEM", "BlazerVision") mean little to most people
      tv: (c.broadcasts ?? []).filter((b: { market?: string }) => b.market === "national").flatMap((b: { names?: string[] }) => b.names ?? [])[0] ?? null,
      home: shapeTeam(home ?? {}), away: shapeTeam(away ?? {}),
      espnLine: odds.details ?? null, espnTotal: odds.overUnder ?? null,
    };
  });
}

// deno-lint-ignore no-explicit-any
async function attachSplits(supabase: any, games: any[]) {
  if (!games.length) return;
  const starts = games.map((g) => Date.parse(g.start));
  const from = new Date(Math.min(...starts) - 6 * 3600_000).toISOString();
  const to = new Date(Math.max(...starts) + 6 * 3600_000).toISOString();
  const { data } = await supabase.from("betting_splits")
    .select("sport, away_team, home_team, event_start, market, side, line, price, bets_pct, handle_pct, captured_at")
    .in("sport", [...new Set(games.map((g) => g.sport))]).gte("event_start", from).lte("event_start", to)
    .order("captured_at", { ascending: false }).limit(5000);
  // Latest capture per DraftKings game, market and side
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of data ?? []) {
    const k = `${r.sport}|${r.away_team}|${r.home_team}|${r.event_start}|${r.market}|${r.side}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  const rows = [...latest.values()] as Array<Record<string, any>>; // deno-lint-ignore no-explicit-any
  for (const g of games) {
    const mine = rows.filter((r) => r.sport === g.sport && Math.abs(Date.parse(r.event_start) - Date.parse(g.start)) <= 4 * 3600_000
      && nameMatch(r.home_team, g.home) && nameMatch(r.away_team, g.away));
    if (!mine.length) continue;
    const markets: Record<string, Market> = {};
    let asOf = "";
    for (const r of mine) {
      (markets[r.market] ??= {})[r.side as keyof Market] = {
        bets: r.bets_pct, money: r.handle_pct, line: r.line === null ? null : Number(r.line), price: r.price,
      };
      if (r.captured_at > asOf) asOf = r.captured_at;
    }
    g.splits = markets;
    g.splitsAsOf = asOf;
    const sp = markets.spread;
    const placeholder = (m?: { bets: number; money: number }) => !m || m.bets <= 2 || m.bets >= 98 || m.money <= 2 || m.money >= 98;
    if (sp?.away && sp?.home && placeholder(sp.away) && placeholder(sp.home)) g.splitsPending = true;
    if (sp?.away && sp?.home && !g.splitsPending) {
      const bets: Side = sp.away.bets >= sp.home.bets ? { pct: sp.away.bets, team: g.away.abbr, line: sp.away.line, price: sp.away.price } : { pct: sp.home.bets, team: g.home.abbr, line: sp.home.line, price: sp.home.price };
      const money: Side = sp.away.money >= sp.home.money ? { pct: sp.away.money, team: g.away.abbr, line: sp.away.line, price: sp.away.price } : { pct: sp.home.money, team: g.home.abbr, line: sp.home.line, price: sp.home.price };
      g.publicBets = bets;
      g.publicMoney = money;
      const fav = (sp.home.line ?? 0) < 0 ? { team: g.home.abbr, line: sp.home.line } : (sp.away.line ?? 0) < 0 ? { team: g.away.abbr, line: sp.away.line } : { team: g.home.abbr, line: 0 };
      g.line = fav.line === 0 ? "PK" : `${fav.team} ${fav.line}`;
    }
    const tot = markets.total;
    if (tot?.over?.line) g.total = tot.over.line;
  }
  for (const g of games) {
    if (!g.line && g.espnLine) g.line = g.espnLine === "EVEN" ? "PK" : g.espnLine;
    if (!g.total && g.espnTotal) g.total = g.espnTotal;
  }
}

// Capper Picks stay up for 12 hours after their game starts, so tonight's picks are still there in the morning (D-093)
const TAKES_KEEP_MS = 12 * 3600_000;
const takesSince = () => new Date(Date.now() - TAKES_KEEP_MS).toISOString();

// deno-lint-ignore no-explicit-any
async function summaryJson(sport: Sport, id: string): Promise<any | null> {
  // site.api can 403 edge functions (see espn-fetch.ts); site.web.api and the CDN box score answer them
  for (const host of ["site.api.espn.com", "site.web.api.espn.com"]) {
    try {
      const res = await espnFetch(`https://${host}/apis/site/v2/sports/${PATHS[sport]}/summary?event=${id}`);
      if (!res.ok) {
        await res.body?.cancel();
        continue;
      }
      const body = await res.json();
      if (body?.boxscore?.players?.length) return body;
    } catch { /* try the next source */ }
  }
  try {
    const res = await espnFetch(`https://cdn.espn.com/core/${LEAGUE[sport]}/boxscore?xhr=1&gameId=${id}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body?.gamepackageJSON?.boxscore?.players?.length ? body.gamepackageJSON : null;
  } catch {
    return null;
  }
}

// A final game's box score never changes, so a warm instance keeps it
const boxCache = new Map<string, Promise<GameBox | null>>();
function finalBox(sport: Sport, id: string): Promise<GameBox | null> {
  if (!PATHS[sport]) return Promise.resolve(null);
  const key = `${sport}|${id}`;
  let box = boxCache.get(key);
  if (!box) {
    if (boxCache.size > 300) boxCache.clear();
    box = summaryJson(sport, id).then((s) => (s ? parseBox(s) : null)).catch(() => null);
    boxCache.set(key, box);
    box.then((b) => { if (!b) boxCache.delete(key); });
  }
  return box;
}

/**
 * Adds `state`, `result` and `final` to each pick, from its game in `byId` (ESPN), and
 * keeps `person` only when it names one host. Props and parlays on a final game are
 * graded from the box score.
 */
// deno-lint-ignore no-explicit-any
async function attachTakeResults(takes: any[], byId: Map<string, any>) {
  const now = Date.now();
  const boxes = new Map<string, Promise<GameBox | null>>();
  for (const t of takes) {
    const g = byId.get(t.espn_event_id);
    t.person = creditedPerson(t.person);
    if (g) {
      t.state = g.state;
      t.result = null;
      t.final = g.state === "post" && /^final/i.test(g.status ?? "") ? finalLabel(g) : null;
    } else {
      // ESPN didn't answer for this game: go by the start time
      const start = Date.parse(t.starts_at);
      t.state = !(start <= now) ? "pre" : now - start < 5 * 3600_000 ? "in" : "post";
      t.result = null;
      t.final = null;
    }
    const sport = (t.sport ?? g?.sport) as Sport;
    if (t.final && needsBox(t) && !boxes.has(t.espn_event_id)) boxes.set(t.espn_event_id, finalBox(sport, t.espn_event_id));
  }
  const loaded = new Map(await Promise.all([...boxes].map(async ([id, box]) => [id, await box] as const)));
  for (const t of takes) {
    if (!t.final) continue;
    const g = byId.get(t.espn_event_id);
    t.result = gradeTake({ ...t, sport: t.sport ?? g?.sport }, g, loaded.get(t.espn_event_id) ?? null);
  }
}

// deno-lint-ignore no-explicit-any
async function attachLinesAndTakes(supabase: any, games: any[], withTakes: boolean) {
  const ids = games.map((g) => g.id);
  if (!ids.length) return;
  const { data: lines } = await supabase.from("game_lines").select("espn_event_id, line_text, record, supports, market, tier").in("espn_event_id", ids);
  const byId = new Map((lines ?? []).map((l: Record<string, string>) => [l.espn_event_id, l]));
  for (const g of games) {
    const l = byId.get(g.id) as Record<string, string> | undefined;
    if (l) g.oneLine = { text: l.line_text, record: l.record, supports: l.supports, market: l.market, tier: l.tier };
  }
  const { data: takes } = await supabase.from("takes")
    .select("id, espn_event_id, show, show_name, person, market, pick, price, units, legs, why, risks, url, source")
    .in("espn_event_id", ids).gte("starts_at", takesSince());
  for (const row of takes ?? []) coerceTake(row);
  for (const g of games) {
    const mine = (takes ?? []).filter((t: Record<string, string>) => t.espn_event_id === g.id);
    g.takesCount = mine.length;
    if (withTakes) {
      await attachTakeResults(mine, new Map([[g.id, g]]));
      g.takes = mine;
    }
  }
}

// numeric columns can come back as strings; the app reads units as a number
// deno-lint-ignore no-explicit-any
function coerceTake(t: any) {
  if (t.units == null || t.units === "") {
    t.units = null;
    return;
  }
  const n = Number(t.units);
  t.units = Number.isFinite(n) ? n : null;
}

// Market notes sit beside Betting Splits. Final games don't carry them.
// deno-lint-ignore no-explicit-any
async function attachNotes(supabase: any, games: any[]) {
  const open = games.filter((g) => g.state !== "post");
  for (const g of games) g.notes = [];
  if (!open.length) return;
  const { data, error } = await supabase.from("market_notes")
    .select("id, espn_event_id, credit, body, url, market, handle, author_name, posted_at")
    .in("espn_event_id", open.map((g) => g.id))
    .order("posted_at", { ascending: false });
  if (error) return;
  // Shown as posts from people in the industry (D-104): name, photo and check come from the registry
  // deno-lint-ignore no-explicit-any
  const shaped = (data ?? []).map((n: any) => {
    const acct = xAccount(n.handle ?? "");
    return { ...n, name: acct?.person ?? n.author_name ?? n.handle, avatar_url: acct?.avatarUrl ?? null,
             verified: acct?.verified ?? false, source: acct?.source ?? null };
  });
  for (const g of open) g.notes = shaped.filter((n: { espn_event_id: string }) => n.espn_event_id === g.id);
}

// The game's player line (D-105, D-106), rank 1 of the up to 3 stored: the judge's pick of the verified
// facts measured against the game's DraftKings prop number, shown under the one line, with `ticker`
// (tonight's opponent's rank, "CHI DEF 7th in Rush YPG Allowed") when the line needs it. Not on final games.
// deno-lint-ignore no-explicit-any
async function attachPlayerLine(supabase: any, g: any) {
  if (g.state === "post" || (g.sport !== "NFL" && g.sport !== "NBA")) return;
  const { data, error } = await supabase.from("player_lines")
    .select("text, record, player_name, short_name, espn_athlete_id, team, market, market_short, line, side, price, hits, games, tier, ticker")
    .eq("espn_event_id", g.id).order("rank").limit(1);
  const l = error ? null : data?.[0];
  if (!l) return;
  g.playerLine = { ...l, line: Number(l.line), sport: g.sport };
}

function json(body: unknown, maxAge = 120): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });
}

// Query checks (audit S8, A11): a date is YYYY-MM-DD and an ESPN event id is digits,
// so neither reaches an ESPN URL or a query as anything else
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_ID_RE = /^\d{1,20}$/;
function badRequest(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "day";
  // D-116: college basketball only when ENABLE_NCAAB is "true"
  const on = feedSports(Deno.env.get("ENABLE_NCAAB"));
  const want = requestedSports(url.searchParams.get("sports"), on);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (view === "day") {
    const date = url.searchParams.get("date") ?? etDate(new Date());
    if (!DATE_RE.test(date)) return badRequest("date must be YYYY-MM-DD");
    const lists = await Promise.all(want.map((s) => espnEvents(s, date)));
    const games = lists.flat().sort((a, b) => a.start.localeCompare(b.start));
    await attachSplits(supabase, games);
    await attachLinesAndTakes(supabase, games, false);
    return json({ date, games, sports: sportList(on) });
  }

  if (view === "game") {
    const id = url.searchParams.get("id") ?? "";
    const sport = (url.searchParams.get("sport") ?? "NFL") as Sport;
    if (!on.includes(sport)) return json({ error: "not found" }, 30);
    const date = url.searchParams.get("date") ?? "";
    if (!EVENT_ID_RE.test(id)) return badRequest("id must be an ESPN event id (digits only)");
    if (date && !DATE_RE.test(date)) return badRequest("date must be YYYY-MM-DD");
    // The game is on its own date; look a week either side if the caller didn't say.
    const dates = date ? [date] : Array.from({ length: 9 }, (_, i) => etDate(new Date(Date.now() + (i - 1) * 86_400_000)));
    for (const d of dates) {
      const g = (await espnEvents(sport, d)).find((x) => x.id === id);
      if (g) {
        await attachSplits(supabase, [g]);
        await attachLinesAndTakes(supabase, [g], true);
        await attachNotes(supabase, [g]);
        await attachPlayerLine(supabase, g);
        return json({ game: g });
      }
    }
    return json({ error: "not found" }, 30);
  }

  if (view === "pulse") {
    const days = [0, 1, 2].map((i) => etDate(new Date(Date.now() + i * 86_400_000)));
    // Picks from the last 12 hours, soonest game first; fetched alongside the scoreboards
    const takesQuery = supabase.from("takes")
      .select("id, show, show_name, person, sport, espn_event_id, matchup, starts_at, market, pick, price, units, legs, why, risks, url, source")
      .gte("starts_at", takesSince()).order("starts_at").limit(300)
      .then((r: { data: Record<string, unknown>[] | null }) => r);
    const lists = await Promise.all(want.flatMap((s) => days.map((d) => espnEvents(s, d))));
    const allGames = lists.flat();
    const games = allGames.filter((g) => g.state === "pre");
    await attachSplits(supabase, games);
    await attachLinesAndTakes(supabase, games, false);
    // DraftKings shows 100% / 0% on games with almost no bets yet: hold those back until real numbers come in
    const real = (m: { bets: number; money: number }) => m.bets > 2 && m.bets < 98 && m.money > 2 && m.money < 98;
    const sides = games.filter((g) => g.splits?.spread?.away && g.splits?.spread?.home && real(g.splits.spread.away) && real(g.splits.spread.home)).flatMap((g) => (["away", "home"] as const).map((s) => {
      const m = g.splits.spread[s];
      const team = g[s];
      return { gameId: g.id, sport: g.sport, start: g.start, team: team.name, abbr: team.abbr, logo: team.logo,
               opponent: g[s === "away" ? "home" : "away"].name, home: s === "home", line: m.line, bets: m.bets, money: m.money };
    }));
    const top = (arr: typeof sides, key: (x: typeof sides[number]) => number) => [...arr].sort((a, b) => key(b) - key(a)).slice(0, 5);
    const { data: takeRows } = await takesQuery;
    const takes = (takeRows ?? []).filter((t) => (want as string[]).includes(String(t.sport)));
    for (const t of takes) coerceTake(t);
    // Last night's games sit on an earlier ESPN date than the boards: look those dates up too
    const byId = new Map(allGames.map((g) => [g.id, g]));
    const missing = new Set<string>();
    for (const t of takes) {
      if (!byId.has(String(t.espn_event_id)) && Date.parse(String(t.starts_at)) <= Date.now()) {
        missing.add(`${t.sport}|${etDate(new Date(String(t.starts_at)))}`);
      }
    }
    const extra = await Promise.all([...missing].map((k) => espnEvents(k.split("|")[0] as Sport, k.split("|")[1])));
    for (const g of extra.flat()) if (!byId.has(g.id)) byId.set(g.id, g);
    await attachTakeResults(takes, byId);
    const strongest = games.filter((g) => g.oneLine?.tier === "strong").map((g) => ({
      gameId: g.id, sport: g.sport, start: g.start, matchup: `${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}`,
      logo: g.home.logo, ...g.oneLine,
    }));
    return json({
      mostMoney: top(sides, (x) => x.money),
      biggestSplits: top(sides.filter((x) => x.money - x.bets >= 10), (x) => x.money - x.bets),
      mostBets: top(sides, (x) => x.bets),
      takes,
      lines: strongest,
      sports: sportList(on),
    });
  }

  if (view === "sports") return json({ sports: sportList(on) }, 300);

  return json({ error: "unknown view" }, 30);
});
