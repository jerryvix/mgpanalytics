import { useEffect, useState } from "react";
import { MarkdownMessage } from "@/components/chatbot/MarkdownMessage";
import { Loader2, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NFL_TRENDING, NCAAF_TRENDING } from "@/data/trendingBets";

// Click-to-generate insight for a season futures line. Powered by the MGP
// Analyst (same grounding + zero-hallucination rules as chat). Cached in
// localStorage for 24h so a popular line costs one generation, not hundreds.

interface FuturesInsightProps {
  sport: string;
  subject: string;
  line: number;
  over: string;
  under: string;
  /** "team" = season win total; "player" = a player prop future */
  kind?: "team" | "player";
  marketLabel?: string; // e.g. "Passing Yards" for player props
}

const CACHE_HOURS = 24;

// v2: bump to invalidate angles generated before the grounding fixes
function cacheKey(sport: string, subject: string, line: number) {
  return `mgp-futins-v2:${sport}:${subject}:${line}`;
}

// Which of our season-stat columns backs each futures market — so the angle
// always carries the player's real prior-season number from our own database.
const MARKET_STAT: Record<string, { column: string; label: string }> = {
  "Passing Yards": { column: "pass_yards", label: "passing yards" },
  "Passing TDs": { column: "pass_td", label: "passing TDs" },
  "Rushing Yards": { column: "rush_yards", label: "rushing yards" },
  "Rushing TDs": { column: "rush_td", label: "rushing TDs" },
  "Receiving Yards": { column: "rec_yards", label: "receiving yards" },
  "Receiving TDs": { column: "rec_td", label: "receiving TDs" },
  Sacks: { column: "sacks", label: "sacks" },
};

async function playerStatNote(subject: string, sport: string, marketLabel?: string): Promise<string> {
  const stat = marketLabel ? MARKET_STAT[marketLabel] : undefined;
  if (!stat || sport !== "NFL") return "";
  try {
    const { data: players } = await supabase
      .from("players")
      .select("id, name, team_abbr")
      .eq("sport", "NFL")
      .ilike("name", `%${subject}%`)
      .limit(3);
    if (!players?.length) return "";
    const { data: rows } = await supabase
      .from("player_season_stats")
      .select(`player_id, ${stat.column}, games_played`)
      .eq("sport", "NFL")
      .eq("season", 2025)
      .in("player_id", players.map((p) => p.id))
      .not(stat.column, "is", null)
      .order(stat.column, { ascending: false })
      .limit(1);
    const r = rows?.[0] as Record<string, number> | undefined;
    if (!r || !r[stat.column]) return "";
    const p = players.find((x) => x.id === (r as any).player_id);
    return `- ${p?.name ?? subject} finished the 2025 season with ${Number(r[stat.column]).toLocaleString()} ${stat.label}${
      r.games_played ? ` in ${r.games_played} games` : ""
    }.`;
  } catch {
    return "";
  }
}

function readCache(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, content } = JSON.parse(raw);
    if (Date.now() - at > CACHE_HOURS * 3600_000) return null;
    return content;
  } catch {
    return null;
  }
}

export function FuturesInsight({ sport, subject, line, over, under, kind = "team", marketLabel }: FuturesInsightProps) {
  const [content, setContent] = useState<string | null>(() => readCache(cacheKey(sport, subject, line)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async () => {
    if (content || loading) return;
    setLoading(true);
    setError(false);
    try {
      // Ground the angle in everything we already know: curated verified
      // nuggets (teams) and the player's real prior-season stat line from our
      // own database — the angle must never claim ignorance of a number the
      // dashboard displays.
      const curated = [...NFL_TRENDING, ...NCAAF_TRENDING]
        .filter((b) => b.verified && (b.subject.includes(subject) || b.nugget.includes(subject) || subject.includes(b.subject)))
        .map((b) => `- ${b.nugget}`)
        .slice(0, 3)
        .join("\n");
      const statNote = kind === "player" ? await playerStatNote(subject, sport, marketLabel) : "";
      const notes = [statNote, curated].filter(Boolean).join("\n");

      const ask =
        kind === "player"
          ? `${sport} season player prop: ${subject}, 2026 regular season total ${marketLabel ?? "production"} O/U ${line} ` +
            `(Over ${over} / Under ${under}). Three bullets: (1) his 2025 production in this exact stat, ` +
            `(2) the most relevant situation change for 2026 (team, role, scheme, health), ` +
            `(3) what the line implies vs. his 2025 number.`
          : `${sport} season win total: ${subject}, 2026 regular season wins O/U ${line} ` +
            `(Over ${over} / Under ${under}). Three bullets: (1) how their 2025 season went, ` +
            `(2) the most important change since, (3) what the line implies about market expectations.`;

      const prompt =
        `${ask}\n\n` +
        `OUTPUT RULES (strict): respond with EXACTLY three markdown bullet points, one sentence each, and nothing else — ` +
        `no preamble, no closing line, no questions, no offers to search, no meta-commentary about data availability. ` +
        `Use the web search tool silently for anything the verified notes don't cover. ` +
        `If something truly cannot be confirmed, write the bullet around what IS verified instead of mentioning the gap. ` +
        `The odds quoted above are from the user's own board — treat them as given; do not question or "verify" them.` +
        (notes ? `\n\nVERIFIED MGP NOTES (authoritative — bullets MUST agree with these):\n${notes}` : "");

      const { data, error: fnError } = await supabase.functions.invoke("gemini-chat", {
        body: { messages: [{ role: "user", content: prompt }], webSearchEnabled: true },
      });
      if (fnError || !data?.content) throw fnError || new Error("empty");
      setContent(data.content);
      try {
        localStorage.setItem(cacheKey(sport, subject, line), JSON.stringify({ at: Date.now(), content: data.content }));
      } catch { /* storage full — fine, just no cache */ }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Kick off on mount (the row only mounts this when expanded)
  useEffect(() => {
    if (!content) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-lg bg-terminal-amber/5 border border-terminal-amber/20 p-3 my-1">
      <div className="flex items-center gap-1.5 mb-1">
        <Lightbulb className="w-3.5 h-3.5 text-terminal-amber" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-terminal-amber">
          MGP Angle · {subject}
        </span>
      </div>
      {loading && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground font-mono">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the market…
        </div>
      )}
      {error && (
        <button onClick={load} className="text-xs text-muted-foreground underline py-1">
          Couldn't load the angle — tap to retry
        </button>
      )}
      {content && <MarkdownMessage content={content} />}
      <p className="text-[10px] text-muted-foreground mt-2">
        AI-generated angle — can make mistakes. Please double-check.
      </p>
    </div>
  );
}
