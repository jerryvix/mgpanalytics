// ingest-game-lines (DECISIONS D-075, D-078): stores the one line per game that the daily
// game-lines workflow computes (scripts/angles). Called only by that workflow, verified by
// its GitHub OIDC token. Lines for games that have started are never stored.
//
// POST { lines: [{ espn_event_id, sport, matchup, starts_at, line_text, supports, market, record, tier }] }
// POST { team_records: [{ sport, team, season, team_name, through, record }] }  (D-127, for the Analyst)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { verifyGithubWorkflow } from "../_shared/github-oidc.ts";

const DASHES = new RegExp(`[${String.fromCharCode(0x2212, 0x2013, 0x2014)}]`, "g");

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const denied = await verifyGithubWorkflow(req, "mgp-ingest-game-lines", "game-lines.yml");
  if (denied) return new Response(JSON.stringify({ error: denied }), { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body.team_records)) return storeTeamRecords(body.team_records);
  const now = Date.now();
  const rows = (Array.isArray(body.lines) ? body.lines : [])
    .filter((l: Record<string, string>) => l.espn_event_id && l.line_text && Date.parse(l.starts_at) > now)
    .map((l: Record<string, string>) => ({
      espn_event_id: String(l.espn_event_id), sport: l.sport, matchup: l.matchup, starts_at: l.starts_at,
      line_text: l.line_text.replace(DASHES, "-"), supports: l.supports.replace(DASHES, "-"), market: l.market,
      record: l.record, tier: l.tier, computed_at: new Date().toISOString(),
    }));
  if (!rows.length) return new Response(JSON.stringify({ stored: 0 }), { headers: { "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.from("game_lines").upsert(rows, { onConflict: "espn_event_id" });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ stored: rows.length }), { headers: { "Content-Type": "application/json" } });
});

const SPORTS = new Set(["NFL", "NCAAF", "NBA", "NCAAB"]);

// D-127: each team's season ATS and over/under record, replaced each run
async function storeTeamRecords(list: Record<string, unknown>[]): Promise<Response> {
  const rows = list
    .filter((r) => r && SPORTS.has(String(r.sport)) && typeof r.team === "string" && r.team && typeof r.team_name === "string"
      && Number.isInteger(r.season) && /^\d{4}-\d{2}-\d{2}$/.test(String(r.through)) && r.record && typeof r.record === "object")
    .map((r) => ({
      sport: r.sport, team: r.team, season: r.season, team_name: r.team_name, through: r.through, record: r.record,
      computed_at: new Date().toISOString(),
    }));
  if (!rows.length) return new Response(JSON.stringify({ team_records: 0 }), { headers: { "Content-Type": "application/json" } });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.from("team_records").upsert(rows, { onConflict: "sport,team" });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ team_records: rows.length }), { headers: { "Content-Type": "application/json" } });
}
