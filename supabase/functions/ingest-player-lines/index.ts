// ingest-player-lines (DECISIONS D-105, D-106): stores the player lines the daily game-lines
// workflow computes (scripts/angles/player_angles.py). For each game the judge (Claude Haiku 5.5,
// _shared/player-judge.ts) picks the one line the app shows from the engine's verified
// candidates and may reword it; the code checks every number before it's stored and falls back
// to the engine's draft when anything doesn't hold. Called only by that workflow on main,
// verified by its GitHub OIDC token (D-101). Each game in the payload has its rows replaced;
// games that have started are left as they are. `dry_run: true` judges without writing.
//
// POST { games: [{ espn_event_id, sport, starts_at, matchup, context, candidates: [...] }],
//        angle_types_used?: { "defense:rush": 1 }, dry_run?: boolean }
// -> { games, stored, judged, fallbacks, usage: { input_tokens, output_tokens, cost_usd }, chosen, angle_types_used }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { verifyGithubWorkflow } from "../_shared/github-oidc.ts";
import { processGames } from "../_shared/player-lines-ingest.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const denied = await verifyGithubWorkflow(req, "mgp-ingest-player-lines", "game-lines.yml");
  if (denied) return new Response(JSON.stringify({ error: denied }), { status: 401 });
  const body = await req.json().catch(() => ({}));
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const result = await processGames(supabase, Deno.env.get("ANTHROPIC_API_KEY"), body, body.dry_run === true);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
