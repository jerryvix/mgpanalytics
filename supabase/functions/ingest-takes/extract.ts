// Pick extraction with Claude Haiku 5.5 (DECISIONS D-063): one request per episode,
// structured output against a JSON schema, so the result is always parseable.
// Cost is about a fifth of a cent per episode (a 45 minute show is ~12K input tokens).

import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import type { UpcomingGame } from "./games.ts";

export const TAKES_MODEL = "claude-haiku-5-5";

export interface ExtractedPick {
  event_id: string;
  market: "spread" | "total" | "moneyline" | "prop" | "parlay" | "other";
  pick: string;
  price: string;
  legs: string[];
  person: string;
  why: string;
  risks: string;
  said_at_seconds: number;
}

const SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "The id of the game from the candidate list" },
          market: { type: "string", enum: ["spread", "total", "moneyline", "prop", "parlay", "other"] },
          pick: { type: "string" },
          price: { type: "string", description: "American odds as said on the show, e.g. -110 or +400; empty if not said" },
          legs: { type: "array", items: { type: "string" } },
          person: { type: "string", description: "Full name of the one host who made the pick; empty if unclear or shared" },
          why: { type: "string" },
          risks: { type: "string" },
          said_at_seconds: { type: "integer" },
        },
        required: ["event_id", "market", "pick", "price", "legs", "person", "why", "risks", "said_at_seconds"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
} as const;

const SYSTEM = `You read transcripts of sports betting shows and list the bets the hosts make on upcoming games.

Rules:
- Only bets a host makes or clearly endorses ("give me", "I'm taking", "I like", "my pick", "best bet", a recap of the show's picks). Skip viewer or chat picks, past results, hypotheticals and anything a host argues against.
- Only games in the candidate list. Use its event id. If you cannot tell which listed game a pick belongs to, leave the pick out. A player prop belongs to the game that player's team plays in.
- If a host changes their mind, keep only their final position. If the show ends with a recap of its picks, the recap is authoritative.
- The transcript is machine-generated and misspells names. Write team and player names correctly.
- Write the pick in sportsbook shorthand with a plain hyphen, never a dash or minus sign:
  spread "Bengals -6", "Commanders +6"; total "Over 54.5", "Under 154.5"; moneyline "Bengals ML";
  player prop "Jarrett Allen U 15.5 Points", "Joe Burrow O 7.5 Rushing Yards", "Stefon Diggs Anytime TD";
  first half "Commanders 1H +3.5", "1H Under 27.5"; parlay pick "Same Game Parlay" with each leg in legs.
  Use the team's short name as it appears in the candidate list (city for college teams).
- price: the American odds the host said for that bet, with a plain hyphen ("-110"), or empty.
- person: the full name of the single host who made the pick, spelled correctly, only when the transcript makes it clear. If several hosts share the pick or you are unsure, leave it empty.
- why: one or two short sentences on the reasons they gave, in plain words. risks: one short sentence on the risks they named, or empty. No em dashes or en dashes, no hype, no final period.
- said_at_seconds: where in the episode the pick is made (from the [mm:ss] marks).
- If there are no qualifying picks, return an empty list.`;

export async function extractPicks(opts: {
  apiKey: string;
  showName: string;
  hosts: string[];
  episodeTitle: string;
  publishedAt: string;
  transcript: string; // "[mm:ss] text" lines
  candidates: UpcomingGame[];
}): Promise<{ picks: ExtractedPick[]; usage: Anthropic.Usage }> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const user = [
    `Show: ${opts.showName}`,
    opts.hosts.length ? `Known hosts: ${opts.hosts.join(", ")}` : "",
    `Episode: ${opts.episodeTitle} (published ${opts.publishedAt})`,
    "",
    "Candidate games (id | league | start | matchup):",
    ...opts.candidates.map((g) => g.line),
    "",
    "Transcript:",
    opts.transcript,
  ].filter((l, i) => l !== "" || i > 2).join("\n");

  const response = await client.messages.create({
    model: TAKES_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: user }],
  });

  if (response.stop_reason === "refusal") throw new Error("extraction refused");
  if (response.stop_reason === "max_tokens") throw new Error("extraction hit max_tokens");
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as { picks: ExtractedPick[] };
  return { picks: parsed.picks ?? [], usage: response.usage };
}

/** Last line of defense for the owner's rule: no em dash, en dash or minus sign anywhere. */
// Built from code points so the repo's no-dash guard (src/test/noEmDashes.test.ts) stays clean.
const MINUS = String.fromCharCode(0x2212), EN = String.fromCharCode(0x2013), EM = String.fromCharCode(0x2014);
const SPACED_DASH = new RegExp(`\\s+[${EM}${EN}]\\s+`, "g");
const ANY_DASH = new RegExp(`[${MINUS}${EN}${EM}]`, "g");

export function plainDashes(s: string): string {
  return s.replace(SPACED_DASH, ", ").replace(ANY_DASH, "-").replace(/\.\s*$/, "").trim();
}
