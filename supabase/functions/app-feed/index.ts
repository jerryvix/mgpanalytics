// app-feed (DECISIONS D-079): the iPhone app's one read-only data endpoint.
//
// Joins, per game: ESPN's schedule, status and DraftKings line; the latest DraftKings
// Betting Splits (betting_splits, synced every 4 hours); the one line per game
// (game_lines, D-075); and the shows' picks (takes, D-074). Public data only, so it runs
// without a user token and is cached briefly at the edge.
//
// GET ?view=day&date=YYYY-MM-DD&sports=NFL,NCAAF,NBA   games on one Eastern date
// GET ?view=game&id=<ESPN event id>&sport=NBA           one game with every market's splits and its Takes
// GET ?view=pulse&sports=NFL,NCAAF,NBA                  boards across the next 3 days, Takes, the day's strongest lines

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { espnFetch } from "../_shared/espn-fetch.ts";

type Sport = "NFL" | "NCAAF" | "NBA";
const PATHS: Record<Sport, string> = {
  NFL: "football/nfl",
  NCAAF: "football/college-football",
  NBA: "basketball/nba",
};
const QUERY: Record<Sport, string> = { NFL: "", NCAAF: "&groups=80&limit=300", NBA: "" };
const ALL: Sport[] = ["NFL", "NCAAF", "NBA"];
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
    .select("espn_event_id, show, show_name, person, market, pick, price, legs, why, risks")
    .in("espn_event_id", ids).gt("starts_at", new Date().toISOString());
  for (const g of games) {
    const mine = (takes ?? []).filter((t: Record<string, string>) => t.espn_event_id === g.id);
    g.takesCount = mine.length;
    if (withTakes) g.takes = mine;
  }
}

function json(body: unknown, maxAge = 120): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "day";
  const sports = (url.searchParams.get("sports")?.split(",").filter((s) => (ALL as string[]).includes(s)) as Sport[]) ?? ALL;
  const want = sports.length ? sports : ALL;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (view === "day") {
    const date = url.searchParams.get("date") ?? etDate(new Date());
    const lists = await Promise.all(want.map((s) => espnEvents(s, date)));
    const games = lists.flat().sort((a, b) => a.start.localeCompare(b.start));
    await attachSplits(supabase, games);
    await attachLinesAndTakes(supabase, games, false);
    return json({ date, games });
  }

  if (view === "game") {
    const id = url.searchParams.get("id") ?? "";
    const sport = (url.searchParams.get("sport") ?? "NFL") as Sport;
    const date = url.searchParams.get("date") ?? "";
    // The game is on its own date; look a week either side if the caller didn't say.
    const dates = date ? [date] : Array.from({ length: 9 }, (_, i) => etDate(new Date(Date.now() + (i - 1) * 86_400_000)));
    for (const d of dates) {
      const g = (await espnEvents(sport, d)).find((x) => x.id === id);
      if (g) {
        await attachSplits(supabase, [g]);
        await attachLinesAndTakes(supabase, [g], true);
        return json({ game: g });
      }
    }
    return json({ error: "not found" }, 30);
  }

  if (view === "pulse") {
    const days = [0, 1, 2].map((i) => etDate(new Date(Date.now() + i * 86_400_000)));
    const lists = await Promise.all(want.flatMap((s) => days.map((d) => espnEvents(s, d))));
    const games = lists.flat().filter((g) => g.state === "pre");
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
    const { data: takes } = await supabase.from("takes")
      .select("id, show, show_name, person, sport, espn_event_id, matchup, starts_at, market, pick, price, legs, why, risks")
      .gt("starts_at", new Date().toISOString()).order("starts_at").limit(300);
    const strongest = games.filter((g) => g.oneLine?.tier === "strong").map((g) => ({
      gameId: g.id, sport: g.sport, start: g.start, matchup: `${g.away.name} ${g.neutral ? "vs" : "at"} ${g.home.name}`,
      logo: g.home.logo, ...g.oneLine,
    }));
    return json({
      mostMoney: top(sides, (x) => x.money),
      biggestSplits: top(sides.filter((x) => x.money - x.bets >= 10), (x) => x.money - x.bets),
      mostBets: top(sides, (x) => x.bets),
      takes: (takes ?? []).filter((t: Record<string, string>) => (want as string[]).includes(t.sport)),
      lines: strongest,
    });
  }

  return json({ error: "unknown view" }, 30);
});
