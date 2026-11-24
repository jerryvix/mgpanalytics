// ingest-takes (DECISIONS D-074): the daily Takes job's server half.
//
// The GitHub Actions workflow `.github/workflows/takes-transcribe.yml` transcribes the
// shows' newest podcast episodes for free (D-062) and posts each transcript here. This
// function matches the picks to upcoming ESPN games with Claude Haiku 5.5 (D-063) and
// stores them in `takes`, which the website reads. Nothing is stored for a game that
// has started, and nothing about past results (D-065).
//
// Auth: no shared secret. Each call carries a GitHub Actions OIDC token, verified
// against GitHub's public keys, and must come from this repository's Takes workflow.
//
// Actions (POST JSON):
//   { action: "known" }  -> { guids: string[] } episodes already processed (last 30 days)
//   { action: "ingest", show, episode: { guid, title, pubDate, audio_seconds }, segments: [{ start, text }] }
//     -> { stored, picks }
//   { action: "ingest_text", show, episode: { guid, title, pubDate }, text }
//     -> { stored, picks }  a YouTube video's title and description, for shows whose
//        descriptions list their picks (scripts/takes/youtube_text.py). No audio or captions.
//
// Guard: a pick is dropped when either team in its matched game played a game that
// started after the episode came out. That earlier game is no longer a candidate, so
// the pick was most likely about it and got matched to the team's next game (Hold The
// Phone's Week 11 parlay legs landed on Week 12 games this way, Nov 24).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { candidatesFor, correctName, rosterNames, teamsPlayedSince, upcomingGames, type TakesSport } from "./games.ts";
import { extractPicks, plainDashes, TAKES_MODEL } from "./extract.ts";
import { creditedPerson } from "../_shared/takes-grade.ts";

const REPO = "jerryvix/mgpanalytics";
const WORKFLOW = `${REPO}/.github/workflows/takes-transcribe.yml@`;
const AUDIENCE = "mgp-ingest-takes";
// Only reviewed code on main may write production data (audit S5, D-101)
const ALLOWED_REFS = new Set(["refs/heads/main"]);
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

// Display credit and hosts per feed key (mirrors scripts/takes/transcribe.py FEEDS,
// scripts/takes/youtube_text.py CHANNELS and _shared/takes-sources.ts). SportsLine is
// the credit people know (D-071). `windowHours`: only games starting this soon after
// the episode are candidates (a daily show's "today" picks).
const SHOWS: Record<string, { name: string; hosts: string[]; sports: TakesSport[]; windowHours?: number }> = {
  "early-edge": {
    name: "SportsLine",
    hosts: ["Sia Nejad", "Larry Hartstein", "Mike McClure", "Brady Kannon", "Bob Konarski", "Martin Green", "Mike Barner"],
    sports: ["NFL", "NBA", "NCAAF", "NCAAB"],
  },
  "bear-bets": {
    name: "Bear Bets",
    hosts: ["Chris Fallica", "Geoff Schwartz", "Sammy Panayotovich", "Will Hill", "Bruce Feldman"],
    sports: ["NFL", "NCAAF", "NBA", "NCAAB"],
  },
  "hold-the-phone": { name: "Hold The Phone", hosts: [], sports: ["NFL", "NCAAF", "NBA", "NCAAB"] },
  // YouTube only, read from titles and descriptions (no host is named in them)
  "daft-previews": { name: "Daft Previews", hosts: [], sports: ["NBA"], windowHours: 36 },
};

const CORE_MARKETS = new Set(["spread", "total", "moneyline"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function verifyCaller(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return "missing token";
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: AUDIENCE,
    });
    if (payload.repository !== REPO) return "wrong repository";
    if (!ALLOWED_REFS.has(String(payload.ref))) return "branch not allowed";
    if (!String(payload.job_workflow_ref ?? "").startsWith(WORKFLOW)) return "wrong workflow";
    return null;
  } catch (e) {
    return `invalid token: ${(e as Error).message}`;
  }
}

function fmt(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const denied = await verifyCaller(req);
  if (denied) return json({ error: denied }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));

  if (body.action === "known") {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data, error } = await supabase.from("takes_episodes").select("guid").gte("processed_at", since);
    if (error) return json({ error: error.message }, 500);
    return json({ guids: (data ?? []).map((r: { guid: string }) => r.guid) });
  }

  const isText = body.action === "ingest_text";
  if (body.action !== "ingest" && !isText) return json({ error: "unknown action" }, 400);
  const show = SHOWS[body.show];
  const ep = body.episode ?? {};
  const segments: { start: number; text: string }[] = Array.isArray(body.segments) ? body.segments : [];
  const text = typeof body.text === "string" ? body.text.slice(0, 20_000) : "";
  if (!show || !ep.guid || (isText ? !text.trim() : segments.length === 0)) {
    return json({ error: isText ? "show, episode.guid and text required" : "show, episode.guid and segments required" }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);

  const transcript = isText ? text : segments.map((s) => `[${fmt(s.start)}] ${s.text}`).join("\n");
  const publishedAt = ep.pubDate ? new Date(ep.pubDate).toISOString() : new Date().toISOString();
  // A week ahead: football shows make Saturday picks on Monday.
  const upcoming = await upcomingGames(show.sports, 8);
  const games = show.windowHours
    ? upcoming.filter((g) => Date.parse(g.startsAt) <= Date.parse(publishedAt) + show.windowHours! * 3600_000)
    : upcoming;
  const candidates = candidatesFor(games, transcript);
  const byId = new Map(games.map((g) => [g.id, g]));
  const playedSince = await teamsPlayedSince(show.sports, new Date(publishedAt)).catch(() => new Set<string>());

  const { picks, usage } = await extractPicks({
    apiKey, showName: show.name, hosts: show.hosts, episodeTitle: ep.title ?? "",
    publishedAt, transcript, candidates, source: isText ? "description" : "transcript",
  });

  // The show's newer episodes already stored, per game and bet type: an older episode never overrides them (D-069).
  const { data: newer } = await supabase.from("takes").select("espn_event_id, market")
    .eq("show", body.show).neq("episode_guid", ep.guid).gt("episode_published_at", publishedAt);
  const covered = new Set((newer ?? []).map((r: { espn_event_id: string; market: string }) => `${r.espn_event_id}|${r.market}`));
  const rosters = new Map<string, string[]>();

  const rows = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const p of picks) {
    const g = byId.get(String(p.event_id));
    if (!g || !p.pick.trim()) continue; // unknown or already started: never stored
    if (CORE_MARKETS.has(p.market) && covered.has(`${g.id}|${p.market}`)) continue;
    if (g.teamIds.some((id) => playedSince.has(`${g.sport}|${id}`))) {
      dropped.push(`${g.matchup}: ${p.pick} (a team played since the episode came out)`);
      continue;
    }
    if (p.market === "prop" || p.market === "parlay") {
      if (!rosters.has(g.id)) rosters.set(g.id, await rosterNames(g).catch(() => []));
      const roster = rosters.get(g.id)!;
      p.pick = correctName(p.pick, roster);
      p.legs = p.legs.map((leg) => correctName(leg, roster));
    }
    const pick = plainDashes(p.pick);
    // The same pick twice in one episode (a recap) would fail the upsert below
    if (seen.has(`${g.id}|${pick}`)) continue;
    seen.add(`${g.id}|${pick}`);
    rows.push({
      show: body.show,
      show_name: show.name,
      person: creditedPerson(p.person),
      sport: g.sport,
      espn_event_id: g.id,
      matchup: g.matchup,
      starts_at: g.startsAt,
      market: p.market,
      pick,
      price: plainDashes(p.price) || null,
      legs: p.legs.map(plainDashes).filter(Boolean),
      why: plainDashes(p.why) || null,
      risks: plainDashes(p.risks) || null,
      said_at_seconds: Number.isFinite(p.said_at_seconds) ? p.said_at_seconds : null,
      episode_guid: ep.guid,
      episode_title: ep.title ?? null,
      episode_published_at: publishedAt,
    });
  }

  if (rows.length) {
    const { error } = await supabase.from("takes").upsert(rows, { onConflict: "episode_guid,espn_event_id,pick" });
    if (error) return json({ error: error.message }, 500);
    // The newest episode wins: an older episode's spread, total or moneyline pick on the
    // same game from the same show is replaced (D-069).
    for (const r of rows) {
      if (!CORE_MARKETS.has(r.market)) continue;
      await supabase.from("takes").delete()
        .eq("show", r.show).eq("espn_event_id", r.espn_event_id).eq("market", r.market)
        .neq("episode_guid", r.episode_guid).lt("episode_published_at", r.episode_published_at);
    }
  }

  await supabase.from("takes_episodes").upsert({
    guid: ep.guid, show: body.show, title: ep.title ?? null, published_at: publishedAt,
    audio_seconds: Number.isFinite(ep.audio_seconds) ? ep.audio_seconds : null,
    picks_found: rows.length, model: TAKES_MODEL, processed_at: new Date().toISOString(),
  });

  return json({
    stored: rows.length,
    candidates: candidates.length,
    usage: { input: usage.input_tokens, output: usage.output_tokens },
    picks: rows.map((r) => `${r.sport} ${r.matchup}: ${r.pick}${r.price ? ` (${r.price})` : ""} · ${r.person ?? r.show_name}`),
    ...(dropped.length ? { dropped } : {}),
  });
});
