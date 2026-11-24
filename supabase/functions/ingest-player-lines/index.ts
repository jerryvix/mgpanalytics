// ingest-player-lines (DECISIONS D-105): stores the player lines the daily game-lines workflow
// computes (scripts/angles/player_angles.py): up to 3 per game, rank 1 being the one the app
// shows. Called only by that workflow on main, verified by its GitHub OIDC token (D-101). Each
// game in the payload has its rows replaced (an empty list clears it); games that have started
// are left as they are.
//
// POST { games: [{ espn_event_id, sport, starts_at, lines: [{ player_name, short_name, espn_athlete_id, team,
//        market, market_short, line, side, price, text, hits, games, record, tier, rank }] }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { verifyGithubWorkflow } from "../_shared/github-oidc.ts";
import { plainDashes } from "../_shared/plain-dashes.ts";

// A fact, never a pick (CLAUDE.md): a line with pick language is refused, not reworded
const PICK_WORDS = /\b(bet|bets|betting|lock|locks|pick|picks|take|should|hammer|smash|fade|tail|play|guarantee\w*)\b/i;
const SPORTS = new Set(["NFL", "NBA"]);

type Line = Record<string, unknown>;

function clean(l: Line, sport: string, startsAt: string): Line | null {
  const text = plainDashes(String(l.text ?? ""));
  const record = String(l.record ?? "");
  const hits = Number(l.hits), games = Number(l.games), rank = Number(l.rank), line = Number(l.line);
  if (!text || !record || !text.includes(record) || PICK_WORDS.test(text)) return null;
  if (!Number.isInteger(hits) || !Number.isInteger(games) || games <= 0 || hits < 0 || hits > games) return null;
  if (![1, 2, 3].includes(rank) || !Number.isFinite(line) || !["over", "under"].includes(String(l.side))) return null;
  if (!["strong", "fallback"].includes(String(l.tier))) return null;
  const price = l.price == null || l.price === "" ? null : plainDashes(String(l.price));
  if (price !== null && !/^[+-]\d{3,5}$/.test(price)) return null;
  return {
    sport, starts_at: startsAt, player_name: String(l.player_name ?? ""), short_name: String(l.short_name ?? ""),
    espn_athlete_id: String(l.espn_athlete_id ?? ""), team: String(l.team ?? ""), market: String(l.market ?? ""),
    market_short: String(l.market_short ?? ""), line, side: l.side, price, text, hits, games, record, tier: l.tier, rank,
  };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const denied = await verifyGithubWorkflow(req, "mgp-ingest-player-lines", "game-lines.yml");
  if (denied) return new Response(JSON.stringify({ error: denied }), { status: 401 });
  const body = await req.json().catch(() => ({}));
  const now = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let stored = 0, games = 0, refused = 0;
  for (const g of Array.isArray(body.games) ? body.games : []) {
    const id = String(g?.espn_event_id ?? "");
    const sport = String(g?.sport ?? "");
    const startsAt = String(g?.starts_at ?? "");
    if (!/^\d{1,20}$/.test(id) || !SPORTS.has(sport) || !(Date.parse(startsAt) > now)) continue;
    const rows = (Array.isArray(g.lines) ? g.lines : []).map((l: Line) => clean(l, sport, startsAt));
    refused += rows.filter((r: Line | null) => r === null).length;
    const ok = rows.filter(Boolean) as Line[];
    const { data, error } = await supabase.rpc("replace_player_lines", { p_event: id, p_rows: ok });
    if (error) return new Response(JSON.stringify({ error: error.message, stored, games }), { status: 500 });
    stored += Number(data ?? 0);
    games += 1;
  }
  return new Response(JSON.stringify({ games, stored, refused }), { headers: { "Content-Type": "application/json" } });
});
