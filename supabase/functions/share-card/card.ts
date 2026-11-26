// The share card (D-128, owner Nov 26: "show the card of whatever you're sending within the link
// and then just at the bottom it says MGP"): a 1200x630 picture of a game, the size iMessage, X and
// the rest show for a shared link. Built as a satori element tree, no Deno or Node APIs, so the same
// code renders in the edge function and in a local check.
//
// Night List look (D-050): true black, Geist, one green. The game's matchup, time, line and total,
// Betting Splits (who has the bets and the money, and how much), the game's one line, and MGP along
// the bottom with "Based on DraftKings" (D-093).

export interface CardTeam { abbr: string; name: string; logo?: string; record?: string | null; rank?: number | null; score?: string | null }
export interface CardSide { bets: number; money: number; line: number | null; price?: number | null }
export interface CardGame {
  id: string;
  sport: string;
  start: string;
  state: "pre" | "in" | "post";
  status: string;
  tv: string | null;
  neutral: boolean;
  home: CardTeam;
  away: CardTeam;
  line?: string;
  total?: number;
  splits?: { spread?: { away: CardSide; home: CardSide }; total?: { over: CardSide; under: CardSide } };
  publicBets?: { pct: number; team: string; line?: number | null };
  publicMoney?: { pct: number; team: string; line?: number | null };
  oneLine?: { text: string; record: string };
}

export const WIDTH = 1200;
export const HEIGHT = 630;

const C = { bg: "#000000", surface: "#161618", raised: "#232326", text: "#F5F5F7", second: "#A1A1A6", third: "#89898E", border: "#1C1C1F", brand: "#2FE38A" };
const SPORT: Record<string, string> = { NFL: "NFL", NCAAF: "College Football", NBA: "NBA", NCAAB: "College Basketball", MLB: "MLB" };

type El = { type: string; props: Record<string, unknown> };
type Child = El | string | null | false | undefined;

// A div with flex on, since satori needs display set on every box with children
function box(style: Record<string, unknown>, ...children: Child[]): El {
  const kids = children.filter((c): c is El | string => !!c);
  return { type: "div", props: { style: { display: "flex", ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
const text = (s: string, style: Record<string, unknown> = {}) => box(style, s);
const img = (src: string, size: number): El => ({ type: "img", props: { src, width: size, height: size, style: { width: size, height: size, objectFit: "contain" } } });

/** "-6.5", "+3", "PK" with plain hyphens (D-039) */
function fmtLine(x: number | null | undefined): string {
  if (x === null || x === undefined) return "";
  return x === 0 ? "PK" : `${x > 0 ? "+" : ""}${x}`;
}

/** "Thu, Nov 26 · 1:00 PM ET" from the start time */
export function whenLabel(startIso: string): string {
  const d = new Date(startIso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${day} · ${time} ET`;
}

/** DraftKings shows 100% / 0% before real betting comes in; those stay hidden (D-071, D-088) */
const realSplit = (m?: CardSide) => !!m && m.bets > 2 && m.bets < 98 && m.money > 2 && m.money < 98;

function teamRow(t: CardTeam, showScore: boolean, bold: boolean | null): El {
  const dim = bold === false ? { color: C.third } : {};
  return box({ alignItems: "center", gap: 22 },
    box({ flexShrink: 0, width: 66, height: 66, borderRadius: 33, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
      t.logo ? img(t.logo, 48) : text(t.abbr, { fontSize: 20, fontWeight: 600, color: C.text })),
    text(`${t.rank ? `#${t.rank} ` : ""}${t.name}`, { fontSize: 48, fontWeight: 600, color: C.text, letterSpacing: -0.8, ...dim }),
    showScore && t.score ? text(t.score, { fontSize: 48, fontWeight: 600, color: C.text, marginLeft: 14, ...dim }) : null,
  );
}

function splitRow(label: string, logo: string | undefined, side: string, pct: number): El {
  // Fixed columns don't shrink, so the two rows line up whatever the team names
  const fixed = { flexShrink: 0 };
  return box({ alignItems: "center", gap: 18, height: 40, width: "100%" },
    text(label, { ...fixed, width: 108, fontSize: 20, letterSpacing: 3, color: C.second, fontFamily: "Geist Mono" }),
    box({ ...fixed, width: 32, height: 32 }, logo ? img(logo, 32) : null),
    text(side, { ...fixed, width: 210, fontSize: 28, fontWeight: 600, color: C.text }),
    text(`${pct}%`, { ...fixed, width: 86, fontSize: 28, fontWeight: 600, color: C.text, justifyContent: "flex-end" }),
    box({ flexGrow: 1, flexShrink: 1, minWidth: 0, height: 8, borderRadius: 4, backgroundColor: C.raised, overflow: "hidden" },
      box({ width: `${pct}%`, height: 8, backgroundColor: C.text })),
  );
}

/** The record in the one line, in bold, the rest regular */
function oneLine(line: { text: string; record: string }): El {
  const at = line.text.indexOf(line.record);
  const parts = at < 0 ? [line.text] : [line.text.slice(0, at), line.record, line.text.slice(at + line.record.length)];
  return box({ alignItems: "flex-start", gap: 16 },
    box({ flexShrink: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: C.brand, marginTop: 14 }),
    // One box per word, spaced by a margin: renderers differ on spaces between boxes, margins they don't
    box({ flexWrap: "wrap", fontSize: 28, lineHeight: 1.3, color: C.text, maxWidth: 1040 },
      ...parts.flatMap((p, i) => p.split(/\s+/).filter(Boolean).map((w) => ({ w, bold: i === 1 })))
        .map(({ w, bold }, j, all) => text(w, { ...(bold ? { fontWeight: 700 } : {}), ...(j < all.length - 1 ? { marginRight: 7 } : {}) }))),
  );
}

export function shareCard(g: CardGame, wordmark: string): El {
  const logoOf = (abbr: string) => (abbr === g.home.abbr ? g.home.logo : abbr === g.away.abbr ? g.away.logo : undefined);
  const spread = g.splits?.spread;
  const showSplits = realSplit(spread?.away) && realSplit(spread?.home) && g.publicBets && g.publicMoney;
  const winner = g.state === "post" && g.home.score && g.away.score
    ? (Number(g.home.score) > Number(g.away.score) ? "home" : Number(g.home.score) < Number(g.away.score) ? "away" : null) : null;
  const status = g.state === "pre" ? whenLabel(g.start) : g.status;
  const facts = [SPORT[g.sport] ?? g.sport, status, g.state === "post" ? null : g.tv].filter(Boolean).join(" · ");
  const market = [g.line, g.total ? `O/U ${g.total}` : null].filter(Boolean).join(" · ");
  return box({ width: WIDTH, height: HEIGHT, flexDirection: "column", backgroundColor: C.bg, color: C.text, fontFamily: "Geist", padding: "48px 64px 0 64px" },
    text(facts.toUpperCase(), { fontSize: 20, letterSpacing: 3, color: C.second, fontFamily: "Geist Mono" }),
    box({ flexDirection: "column", gap: 10, marginTop: 20 },
      teamRow(g.away, g.state !== "pre", winner ? winner === "away" : null),
      teamRow(g.home, g.state !== "pre", winner ? winner === "home" : null)),
    market ? text(market, { fontSize: 28, color: C.second, marginTop: 16 }) : null,
    showSplits ? box({ flexDirection: "column", gap: 4, marginTop: 18 },
      splitRow("BETS", logoOf(g.publicBets!.team), `${g.publicBets!.team} ${fmtLine(g.publicBets!.line)}`.trim(), g.publicBets!.pct),
      splitRow("MONEY", logoOf(g.publicMoney!.team), `${g.publicMoney!.team} ${fmtLine(g.publicMoney!.line)}`.trim(), g.publicMoney!.pct)) : null,
    g.oneLine ? box({ marginTop: showSplits ? 20 : 30 }, oneLine(g.oneLine)) : null,
    // MGP along the bottom, so the picture says where it's from
    box({ position: "absolute", left: 0, right: 0, bottom: 0, height: 92, alignItems: "center", justifyContent: "space-between",
      padding: "0 64px", borderTop: `2px solid ${C.border}`, backgroundColor: C.bg },
      { type: "img", props: { src: wordmark, width: 128, height: 58, style: { width: 128, height: 58, objectFit: "contain" } } },
      text(showSplits ? "Splits based on DraftKings · mgp-analytics.com" : "mgp-analytics.com", { fontSize: 22, color: C.third, fontStyle: "italic" })),
  );
}

/** The card when the game can't be found: MGP and what it does */
export function fallbackCard(wordmark: string): El {
  return box({ width: WIDTH, height: HEIGHT, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, backgroundColor: C.bg, fontFamily: "Geist" },
    { type: "img", props: { src: wordmark, width: 360, height: 163, style: { width: 360, height: 163, objectFit: "contain" } } },
    text("The numbers behind every game", { fontSize: 44, fontWeight: 600, color: C.text, letterSpacing: -0.8 }),
    text("Betting Splits, trends and Capper Picks for every matchup", { fontSize: 28, color: C.second }));
}
