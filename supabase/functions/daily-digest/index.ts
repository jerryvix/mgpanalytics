import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { startSyncLog, completeSyncLog, detectTriggerSource } from "../_shared/sync-logger.ts";

// Daily Edge digest — re-engagement email. Composes a personalized brief
// (streak status, followed teams' next games, an edge nugget) for each opted-in
// user and sends via Resend.
//
// ACTIVATION (3 steps, all external to this code):
//   1. Add the profiles.digest_opt_in column (migration).
//   2. Set the RESEND_API_KEY secret + a verified sender domain in DIGEST_FROM.
//   3. Schedule this function daily (dispatch-syncs / cron).
// Until RESEND_API_KEY is present it runs as a safe dry-run (no emails sent).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const DIGEST_FROM = "MGP Analytics <edge@mgp-analytics.com>"; // must be a Resend-verified domain

const EDGE_LINES = [
  "Only one player has ever won the Heisman twice — Archie Griffin, back-to-back in '74-'75.",
  "The last 13 NFL MVPs have all been quarterbacks.",
  "Joe DiMaggio's 56-game hit streak (1941) still stands 80+ years later.",
  "Buffalo won five straight AFC East titles before New England took it in '25.",
];

interface NextGame {
  team: string;
  opponent: string;
  isHome: boolean;
  date: string;
}

const SPORT_TABLE: Record<string, { table: string; league?: string }> = {
  NFL: { table: "games", league: "NFL" },
  NBA: { table: "nba_games" },
  NCAAB: { table: "ncaab_games" },
  NCAAF: { table: "ncaaf_games" },
  MLB: { table: "mlb_games" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let syncLogId: string | null = null;
  const start = Date.now();
  let supabase: any;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    // Cron-secured (this is a scheduled job, not user-facing)
    const cronSecret = req.headers.get("x-cron-secret");
    if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    syncLogId = await startSyncLog(supabase, {
      sport: "ALL",
      data_type: "daily_digest",
      function_name: "daily-digest",
      trigger_source: detectTriggerSource(req),
      api_source: "resend",
    });

    // Opted-in users with an email
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, email, digest_opt_in")
      .eq("digest_opt_in", true)
      .not("email", "is", null)
      .limit(2000);
    if (profErr) throw new Error(`profiles read failed: ${profErr.message}`);

    const nowIso = new Date().toISOString();
    const edge = EDGE_LINES[new Date().getUTCDate() % EDGE_LINES.length];

    let sent = 0;
    let composed = 0;
    const dryRun = !RESEND_API_KEY;

    for (const p of profiles || []) {
      // Streak
      const { data: streakRow } = await supabase
        .from("user_streaks")
        .select("current_streak")
        .eq("user_id", p.id)
        .maybeSingle();
      const streak = streakRow?.current_streak ?? 0;

      // Followed teams' next games
      const { data: follows } = await supabase
        .from("user_follows")
        .select("entity_type, entity_key, entity_label, sport")
        .eq("user_id", p.id);
      const teamFollows = (follows || []).filter((f: any) => f.entity_type === "team");

      const nextGames: NextGame[] = [];
      const bySport = new Map<string, string[]>();
      for (const f of teamFollows) {
        const name = f.entity_label || String(f.entity_key).split(":").slice(1).join(":");
        const arr = bySport.get(f.sport) || [];
        arr.push(name);
        bySport.set(f.sport, arr);
      }
      for (const [sport, teams] of bySport) {
        const cfg = SPORT_TABLE[sport];
        if (!cfg) continue;
        const list = teams.map((t) => `"${t.replace(/"/g, "")}"`).join(",");
        let q = supabase
          .from(cfg.table)
          .select("home_team_name, visitor_team_name, date")
          .gte("date", nowIso)
          .or(`home_team_name.in.(${list}),visitor_team_name.in.(${list})`)
          .order("date", { ascending: true })
          .limit(20);
        if (cfg.league) q = q.eq("league", cfg.league);
        const { data: games } = await q;
        const seen = new Set<string>();
        for (const g of games || []) {
          for (const team of teams) {
            if (seen.has(team)) continue;
            const isHome = g.home_team_name === team;
            const isAway = g.visitor_team_name === team;
            if (!isHome && !isAway) continue;
            seen.add(team);
            nextGames.push({
              team,
              opponent: isHome ? g.visitor_team_name : g.home_team_name,
              isHome,
              date: g.date,
            });
          }
        }
      }

      // Only email users who have something personal to say to, or keep the
      // streak nudge — skip totally-empty profiles to avoid low-value sends.
      if (streak === 0 && nextGames.length === 0) continue;

      const gamesHtml = nextGames.length
        ? `<ul>${nextGames
            .map(
              (g) =>
                `<li><b>${g.team}</b> ${g.isHome ? "vs" : "@"} ${g.opponent} — ${new Date(
                  g.date
                ).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</li>`
            )
            .join("")}</ul>`
        : "";
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px">
          <h2>📈 Your Daily Edge</h2>
          ${streak > 0 ? `<p>🔥 <b>${streak}-day streak</b> — open MGP today to keep it alive.</p>` : ""}
          <p><b>Did you know:</b> ${edge}</p>
          ${nextGames.length ? `<h3>Your teams' next games</h3>${gamesHtml}` : ""}
          <p><a href="https://www.mgp-analytics.com/dashboard">Open MGP Analytics →</a></p>
        </div>`;

      composed++;
      if (!dryRun) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: DIGEST_FROM, to: [p.email], subject: "📈 Your Daily Edge — MGP", html }),
        });
        if (res.ok) sent++;
        else console.error(`Resend failed for ${p.email}: ${res.status} ${await res.text()}`);
      }
    }

    const response = {
      success: true,
      dryRun,
      recipients: (profiles || []).length,
      composed,
      sent,
      message: dryRun
        ? `Dry run — composed ${composed} digests (set RESEND_API_KEY to send)`
        : `Sent ${sent}/${composed} digests`,
    };
    await completeSyncLog(supabase, syncLogId, start, { status: "success", records_added: sent, details: response });
    return new Response(JSON.stringify(response), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("daily-digest error:", error);
    await completeSyncLog(supabase, syncLogId, start, {
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ success: false, error: "digest failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
