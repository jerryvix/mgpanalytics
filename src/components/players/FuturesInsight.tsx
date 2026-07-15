import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Click-to-generate insight for a season futures line. Powered by the MGP
// Analyst (same grounding + zero-hallucination rules as chat). Cached in
// localStorage for 24h so a popular line costs one generation, not hundreds.

interface FuturesInsightProps {
  sport: string;
  subject: string;
  line: number;
  over: string;
  under: string;
}

const CACHE_HOURS = 24;

function cacheKey(sport: string, subject: string, line: number) {
  return `mgp-futins:${sport}:${subject}:${line}`;
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

export function FuturesInsight({ sport, subject, line, over, under }: FuturesInsightProps) {
  const [content, setContent] = useState<string | null>(() => readCache(cacheKey(sport, subject, line)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async () => {
    if (content || loading) return;
    setLoading(true);
    setError(false);
    try {
      const prompt =
        `Season win total insight: ${subject} 2026 regular season wins O/U ${line} ` +
        `(Over ${over} / Under ${under}). In exactly 3 short bullet points: ` +
        `(1) how last season went for them, (2) the most important change since, ` +
        `(3) what this line implies about market expectations. ` +
        `Keep each bullet to one sentence. No betting advice, no follow-up questions.`;
      const { data, error: fnError } = await supabase.functions.invoke("gemini-chat", {
        body: { messages: [{ role: "user", content: prompt }] },
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
      {content && (
        <div className="text-sm text-foreground/90 leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mt-1">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">
        AI-generated angle — can make mistakes. Please double-check.
      </p>
    </div>
  );
}
