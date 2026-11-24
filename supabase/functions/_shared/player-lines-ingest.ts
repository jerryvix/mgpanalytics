// Stores player lines (D-105, D-106): for each game, the judge picks the line to show from the
// engine's candidates, the code checks it, and the game's rows are replaced in one transaction.
// Used by ingest-player-lines (GitHub OIDC, main only). Games that have started are left as they are.

import { buildRows, type Candidate, finalLine, forJudge, type GamePayload } from "./player-lines.ts";
import { judgeGame } from "./player-judge.ts";

// Haiku 5.5 list prices per million tokens, for the cost line in the response
const PRICE_IN = 0.10, PRICE_OUT = 0.50;

export interface IngestResult {
  games: number;
  stored: number;
  judged: number;
  fallbacks: number;
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
  chosen: { espn_event_id: string; text: string; ticker: string | null; angle_type: string; by: string; why: string | null; reason: string | null; judge_text: string | null }[];
  angle_types_used: Record<string, number>;
}

// deno-lint-ignore no-explicit-any
export async function processGames(supabase: any, apiKey: string | undefined, body: { games?: GamePayload[]; angle_types_used?: Record<string, number> }, dryRun: boolean): Promise<IngestResult> {
  const now = Date.now();
  const used: Record<string, number> = { ...(body.angle_types_used ?? {}) };
  const out: IngestResult = { games: 0, stored: 0, judged: 0, fallbacks: 0, usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 }, chosen: [], angle_types_used: used };
  const games = (Array.isArray(body.games) ? body.games : [])
    .filter((g) => /^\d{1,20}$/.test(String(g?.espn_event_id ?? "")) && (g.sport === "NFL" || g.sport === "NBA") && Date.parse(g.starts_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  for (const g of games) {
    const cands = (g.candidates ?? []).filter((c: Candidate) => c && c.id && c.sentence && c.player_name);
    let chosen: Candidate | null = null;
    let line = null;
    let reason: string | null = null;
    let judgeText: string | null = null;
    if (cands.length) {
      const pool = forJudge(cands, used);
      let choice = null;
      if (apiKey) {
        try {
          const r = await judgeGame({ apiKey, game: g, candidates: pool, used });
          choice = r.choice;
          out.usage.input_tokens += r.usage.input_tokens;
          out.usage.output_tokens += r.usage.output_tokens;
          out.judged += 1;
        } catch (e) {
          console.error("judge failed", g.espn_event_id, (e as Error).message);
        }
      }
      chosen = (choice && pool.find((c) => c.id === choice!.candidate_id)) || pool[0];
      line = finalLine(chosen, choice && choice.candidate_id === chosen.id ? choice : null);
      reason = choice?.reason ?? null;
      judgeText = choice?.sentence ?? null;
      if (line.by === "engine") out.fallbacks += 1;
      used[chosen.angle_type] = (used[chosen.angle_type] ?? 0) + 1;
      out.chosen.push({ espn_event_id: g.espn_event_id, text: line.text, ticker: line.ticker, angle_type: chosen.angle_type, by: line.by, why: line.why, reason, judge_text: line.by === "engine" ? judgeText : null });
    }
    const rows = buildRows(g, chosen, line);
    out.games += 1;
    if (dryRun) continue;
    const { data, error } = await supabase.rpc("replace_player_lines", { p_event: g.espn_event_id, p_rows: rows });
    if (error) throw new Error(error.message);
    out.stored += Number(data ?? 0);
  }
  out.usage.cost_usd = Math.round((out.usage.input_tokens * PRICE_IN + out.usage.output_tokens * PRICE_OUT) / 1e6 * 10000) / 10000;
  return out;
}
