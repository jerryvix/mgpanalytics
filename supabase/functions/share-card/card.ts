// The share card (D-128, owner Nov 26: "show the card of whatever you're sending within the link
// and then just at the bottom it says MGP"): a 1200x630 picture of a game, the size iMessage, X and
// the rest show for a shared link. Built as a satori element tree, no Deno or Node APIs, so the same
// code renders in the edge function and in a local check.
//
// Night List look (D-050): true black, Geist, one green. Top to bottom (owner, Nov 26): the game's one
// line as the headline, Betting Splits (who has the bets and the money, and how much), the matchup with
// its time, line and total, and MGP along the bottom. No other company is named on the card.

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

/** "Bears at Lions" with both logos */
function matchup(g: CardGame, winner: "home" | "away" | null): El {
  const team = (t: CardTeam, side: "home" | "away") => box({ alignItems: "center", gap: 14 },
    box({ flexShrink: 0, width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
      t.logo ? img(t.logo, 38) : text(t.abbr, { fontSize: 16, fontWeight: 600, color: C.text })),
    text(`${t.rank ? `#${t.rank} ` : ""}${t.name}${g.state !== "pre" && t.score ? ` ${t.score}` : ""}`,
      { fontSize: 34, fontWeight: 600, letterSpacing: -0.5, color: winner && winner !== side ? C.third : C.text }));
  return box({ alignItems: "center", gap: 18 },
    team(g.away, "away"),
    text(g.neutral ? "vs" : "at", { fontSize: 28, color: C.third }),
    team(g.home, "home"));
}

function splitRow(label: string, logo: string | undefined, side: string, pct: number): El {
  // Fixed columns don't shrink, so the two rows line up whatever the team names
  const fixed = { flexShrink: 0 };
  return box({ alignItems: "center", gap: 18, height: 44, width: "100%" },
    text(label, { ...fixed, width: 112, fontSize: 21, letterSpacing: 3, color: C.second, fontFamily: "Geist Mono" }),
    box({ ...fixed, width: 34, height: 34 }, logo ? img(logo, 34) : null),
    text(side, { ...fixed, width: 220, fontSize: 30, fontWeight: 600, color: C.text }),
    text(`${pct}%`, { ...fixed, width: 92, fontSize: 30, fontWeight: 600, color: C.text, justifyContent: "flex-end" }),
    box({ flexGrow: 1, flexShrink: 1, minWidth: 0, height: 9, borderRadius: 5, backgroundColor: C.raised, overflow: "hidden" },
      box({ width: `${pct}%`, height: 9, backgroundColor: C.text })),
  );
}

/** The game's one line, the headline: its record in bold, the rest regular */
function oneLine(line: { text: string; record: string }): El {
  const at = line.text.indexOf(line.record);
  const parts = at < 0 ? [line.text] : [line.text.slice(0, at), line.record, line.text.slice(at + line.record.length)];
  const size = line.text.length > 90 ? 36 : 42;
  // One box per word, spaced by a margin: renderers differ on spaces between boxes, margins they don't
  return box({ flexWrap: "wrap", fontSize: size, lineHeight: 1.22, color: C.text, letterSpacing: -0.4 },
    ...parts.flatMap((p, i) => p.split(/\s+/).filter(Boolean).map((w) => ({ w, bold: i === 1 })))
      .map(({ w, bold }, j, all) => text(w, { ...(bold ? { fontWeight: 700, color: C.brand } : {}), ...(j < all.length - 1 ? { marginRight: Math.round(size * 0.26) } : {}) })));
}

export function shareCard(g: CardGame, wordmark: string): El {
  const logoOf = (abbr: string) => (abbr === g.home.abbr ? g.home.logo : abbr === g.away.abbr ? g.away.logo : undefined);
  const spread = g.splits?.spread;
  const showSplits = realSplit(spread?.away) && realSplit(spread?.home) && g.publicBets && g.publicMoney;
  const winner = g.state === "post" && g.home.score && g.away.score
    ? (Number(g.home.score) > Number(g.away.score) ? "home" : Number(g.home.score) < Number(g.away.score) ? "away" : null) : null;
  const status = g.state === "pre" ? whenLabel(g.start) : g.status;
  const facts = [SPORT[g.sport] ?? g.sport, status, g.line, g.total ? `O/U ${g.total}` : null].filter(Boolean).join(" · ");
  // Owner, Nov 26: the one line first, then the splits, then the matchup; everything sits well inside
  // the edges and above the MGP band, so a preview that crops the picture keeps what matters
  return box({ width: WIDTH, height: HEIGHT, flexDirection: "column", backgroundColor: C.bg, color: C.text, fontFamily: "Geist", padding: "0 80px 84px 80px" },
    box({ flexDirection: "column", justifyContent: "center", flexGrow: 1, gap: 34 },
      g.oneLine ? oneLine(g.oneLine) : null,
      showSplits ? box({ flexDirection: "column", gap: 4 },
        splitRow("BETS", logoOf(g.publicBets!.team), `${g.publicBets!.team} ${fmtLine(g.publicBets!.line)}`.trim(), g.publicBets!.pct),
        splitRow("MONEY", logoOf(g.publicMoney!.team), `${g.publicMoney!.team} ${fmtLine(g.publicMoney!.line)}`.trim(), g.publicMoney!.pct)) : null,
      box({ flexDirection: "column", gap: 10 },
        matchup(g, winner),
        text(facts.toUpperCase(), { fontSize: 19, letterSpacing: 2.5, color: C.second, fontFamily: "Geist Mono" }))),
    // MGP along the bottom, so the picture says where it's from (and only MGP: owner, Nov 26)
    box({ position: "absolute", left: 0, right: 0, bottom: 0, height: 84, alignItems: "center", justifyContent: "space-between",
      padding: "0 80px", borderTop: `2px solid ${C.border}`, backgroundColor: C.bg },
      { type: "img", props: { src: wordmark, width: 120, height: 54, style: { width: 120, height: 54, objectFit: "contain" } } },
      text("mgp-analytics.com", { fontSize: 22, color: C.third })),
  );
}

/** The card when the game can't be found: MGP and what it does */
export function fallbackCard(wordmark: string): El {
  return box({ width: WIDTH, height: HEIGHT, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, backgroundColor: C.bg, fontFamily: "Geist" },
    { type: "img", props: { src: wordmark, width: 360, height: 163, style: { width: 360, height: 163, objectFit: "contain" } } },
    text("The numbers behind every game", { fontSize: 44, fontWeight: 600, color: C.text, letterSpacing: -0.8 }),
    text("Betting Splits, trends and Capper Picks for every matchup", { fontSize: 28, color: C.second }));
}
