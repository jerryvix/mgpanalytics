// The player-line judge (D-106): Claude Haiku 5.5 picks the one line a game page shows from
// the engine's verified candidates and may polish its wording, calibrated to the owner's taste
// (his feedback and taste test, Nov 24, quoted in RUBRIC). Structured output against a JSON
// schema; the code in player-lines.ts checks every number before anything is stored.
// Cost: about a tenth of a cent per game (a few thousand input tokens, a short answer).

import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import type { Candidate, GamePayload, JudgeChoice } from "./player-lines.ts";

export const JUDGE_MODEL = "claude-haiku-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    candidate_id: { type: "string", description: "The id of the chosen candidate" },
    sentence: { type: "string", description: "The final sentence: the candidate's, polished at most" },
    show_ticker: { type: "boolean", description: "Show the candidate's ticker (tonight's opponent's rank) under the sentence" },
    reason: { type: "string", description: "One short sentence on why this line, for the logs" },
  },
  required: ["candidate_id", "sentence", "show_ticker", "reason"],
  additionalProperties: false,
} as const;

export const RUBRIC = `You choose the one player line MGP's iPhone app shows on a game page, and you may polish its wording. MGP shows facts, never picks.

The reader is a sports bettor looking at this game. Ask of every candidate: does this sentence give someone the context they need to make a decision on the prop or the game?

What the owner wants (his words, Nov 24):
- Game-specific angles. "This is a Thanksgiving game, Thanksgiving angles matter."
- Matchup angles, with context like a TV sports ticker under the sentence that says where tonight's opponent ranks: "TB DEF 3rd in Rec YPG Allowed".
- Simple, relevant angles are fine when they are strong. Niche angles are fine if they are written clearly and are strong.
- Concise stat names in the sentence ("Pass Yds", "Rush Yds", "Rec Yds", "catches", "Pts", "Reb", "Ast", "threes"), not words.
- Varied verbs (gone over, cleared, topped, gone for more than, been held under, stayed under, finished under, scored in), not "has topped" every time.
- Context only when it's needed. Don't make every line on the slate the same kind of stat, and don't get templatized.

What he dislikes:
- A condition that is true for (nearly) all of the sample is not a stat ("with Dak Prescott at quarterback" when Dak was the QB in all 14 games).
- Word garbage: "against the 10 defenses with the fewest missed tackles after a win".
- Vague jargon: "vs defenses that pressure a lot".

His taste test (real lines). Liked:
- "Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games"
- "CeeDee Lamb has been held under 7.5 catches in all 5 of his Thanksgiving games"
- "Dak Prescott has cleared 263.5 Pass Yds in 15 of his last 20 indoor games"
- "CeeDee Lamb has stayed under 7.5 catches in 16 straight games after a Cowboys win"
- "Jahmyr Gibbs has scored in 10 of his last 11 games vs Top-10 run defenses", ticker "CHI DEF 7th in Rush YPG Allowed"
- "Dalton Kincaid has been held to 3 catches or fewer in 8 of his last 10 as a favorite vs Top-10 pass defenses", ticker "KC DEF 7th in Pass YPG Allowed"
- "Matthew Stafford has cleared 232.5 Pass Yds in 25 of his last 30 prime-time games"
He preferred the versions with the ticker over the plain versions.
Disliked:
- "Jared Goff has thrown fewer than 35 passes in 7 of his last 8 division games vs defenses that pressure a lot" (vague jargon)
- "James Cook has topped 84.5 Rush Yds in 11 of his last 15 games vs the league's surest-tackling defenses" (missed tackles)
Voice: he picked the plain sentence ("Dak Prescott has gone over 263.5 Pass Yds in 5 of his last 6 Thanksgiving games") over round numbers ("264+"), ticker-style sentences, and raw game logs.

How to choose:
- Pick exactly one candidate, by its id. Prefer what is most relevant to this game and strong: a special date (Thanksgiving, Christmas, a season opener) and tonight's matchup come first; a plain split (home or road, favorite, after a win) only when it is clearly the strongest and clearest line here.
- Prefer bigger samples and higher hit rates when two lines are equally relevant. A "stale" sample (mostly older seasons) is a last resort.
- Variety across the slate: the angle types already shown on other games are listed; don't repeat one that is already on two games unless nothing else here is close.

How to write:
- Start from the candidate's sentence. You may reword it for flow, but keep every number exactly as written (the line stays 3.5, not 3; the hits; the games), the player's full name, the stat name, the side (over or under) and every condition, word for word after the record ("since moving into the starting lineup", "home", "after a win"). Don't add facts, numbers or opinions. "vs" or "against" are both fine.
- Some lines are a milestone: a round number just above the prop's line, shown beside it ("Giannis Antetokounmpo has scored 30 or more Pts in 8 of his last 10 games" over "O 28.5 Pts"). Keep its number and "or more"; never swap in the prop's line. A streak ("in 9 straight games") is his current run against tonight's number.
- No pick language: never "bet", "take", "lock", "should", "play", "value", "edge", "hammer", "fade", "tail". No em dashes or en dashes; plain hyphens only. No period at the end.
- show_ticker: true when the sentence refers to a class of opponents (Top-10, Bottom-10, blitz-heavy, fast-paced) and the candidate has a ticker; otherwise false.
- Name a class of opponents the short way, with "Top" and "Bottom" always capitalized: "Top-10 three-point defenses", "Bottom-10 pass rushes", "blitz-heavy defenses". Never "the 10 teams that allow the fewest threes" or "the 10 defenses with the most sacks" (the owner said it reads weird).
- Sentence shape, in every sport (owner, Nov 25, "super ugly"): the player's full name first, then what he has done, then the sample, then the setting and time frame. Never put the time frame first ("Since 2021, ..." or "In his career, ..."), never a percentage ("76% of his games"), never points per game against a line ("by 4.2 points a game"), never the opponent as the subject ("Teams facing ..."), and never two splits in one sentence ("at home and ... on the road").`;

function describe(c: Candidate): string {
  const parts = [
    `id ${c.id} | ${c.family} (${c.angle_type}) | ${c.tier}${c.stale ? " | stale: mostly older seasons" : ""}`,
    `  sentence: ${c.sentence}`,
    `  record: ${c.hits} of ${c.games} | prop: ${c.short_name} ${c.side === "over" ? "O" : "U"} ${c.line} ${c.market_short}`,
  ];
  if (c.ticker) parts.push(`  ticker: ${c.ticker}`);
  return parts.join("\n");
}

export async function judgeGame(opts: {
  apiKey: string;
  game: GamePayload;
  candidates: Candidate[];
  used: Record<string, number>;
}): Promise<{ choice: JudgeChoice | null; usage: { input_tokens: number; output_tokens: number } }> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const ctx = opts.game.context ?? {};
  const used = Object.entries(opts.used).filter(([, n]) => n > 0).map(([t, n]) => `${t} x${n}`).join(", ") || "none yet";
  const user = [
    `Game: ${opts.game.matchup ?? opts.game.espn_event_id} (${opts.game.sport})`,
    `Context: ${JSON.stringify(ctx)}`,
    `Angle types already shown on other games: ${used}`,
    "",
    "Candidates (every record is verified; the engine's order, best first):",
    ...opts.candidates.map(describe),
  ].join("\n");
  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    system: RUBRIC,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: user }],
  });
  const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  if (response.stop_reason !== "end_turn") return { choice: null, usage };
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  try {
    const choice = JSON.parse(text) as JudgeChoice;
    return { choice: opts.candidates.some((c) => c.id === choice.candidate_id) ? choice : null, usage };
  } catch {
    return { choice: null, usage };
  }
}
