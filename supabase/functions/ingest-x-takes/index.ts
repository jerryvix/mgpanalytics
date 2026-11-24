// ingest-x-takes (DECISIONS D-102): public X posts as a free Takes source.
//
// There is no paid X API. An assistant reads public posts with its own access,
// extracts each item, and POSTs the batch here. This function checks a shared
// secret, validates the batch, matches each item to an upcoming or in-progress
// ESPN game (ingest-takes/games.ts) and stores it.
//
// Picks (BookitWithTrent) go into `takes` and show up as Takes. Market notes
// (johnewing) go into `market_notes` and show up beside betting splits. A note
// is never stored as a pick. Unmatched items are returned and not stored.
// Sending the same post id and pick (or the same post id and note text) again
// updates the row.
//
// Auth: header `x-takes-ingest-secret` must equal the Supabase secret
// X_TAKES_INGEST_SECRET. The value is never logged and never read from the body.
// Contract: docs/mobile/X_TAKES.md
//
// POST { items: [ { post_id, url, handle, author, posted_at, kind, sport, text,
//   matchup?, market?, pick?, price?, units?, legs?, why? } ] }
// -> { picks, notes, results: [{ post_id, status, ... }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { upcomingGames, type TakesSport } from "../ingest-takes/games.ts";
import { MAX_ITEMS, prepareXBatch } from "./accept.ts";
import { secretMatches } from "./auth.ts";

const SPORTS: TakesSport[] = ["NFL", "NBA", "NCAAF", "NCAAB"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const expected = (Deno.env.get("X_TAKES_INGEST_SECRET") ?? "").trim();
  if (!expected) return json({ error: "X_TAKES_INGEST_SECRET not set" }, 500);
  const provided = req.headers.get("x-takes-ingest-secret")?.trim() ?? "";
  if (!secretMatches(provided, expected)) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const items = body && typeof body === "object" ? (body as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return json({ error: "items must be an array" }, 400);
  if (items.length > MAX_ITEMS) return json({ error: `at most ${MAX_ITEMS} items` }, 400);
  if (items.length === 0) return json({ picks: 0, notes: 0, results: [] });

  let games;
  try {
    games = await upcomingGames(SPORTS, 8, new Date(), { includeInProgress: true });
  } catch (e) {
    return json({ error: `games lookup failed: ${(e as Error).message}` }, 502);
  }
  if (!games.length) return json({ error: "no upcoming or in-progress games from ESPN", picks: 0, notes: 0, results: [] }, 503);

  const prepared = prepareXBatch(items, games);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (prepared.notes.length) {
    const { error } = await supabase.from("market_notes").upsert(prepared.notes, { onConflict: "post_id,body" });
    if (error) return json({ error: error.message }, 500);
  }
  if (prepared.picks.length) {
    const { error } = await supabase.from("takes").upsert(prepared.picks, { onConflict: "episode_guid,espn_event_id,pick" });
    if (error) return json({ error: error.message }, 500);
    // The same post and pick matched to a different game on an earlier call: drop that row.
    for (const p of prepared.picks) {
      await supabase.from("takes").delete().eq("external_id", p.external_id).eq("pick", p.pick).neq("espn_event_id", p.espn_event_id);
    }
  }

  return json({
    picks: prepared.picks.length,
    notes: prepared.notes.length,
    games: games.length,
    results: prepared.results,
  });
});
