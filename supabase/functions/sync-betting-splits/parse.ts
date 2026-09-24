// DraftKings Network "Betting Splits" page parser. Pure (no Deno or Node
// APIs) so vitest exercises it against checked-in fixtures.
//
// Page anatomy (captured Sep 2026, dknetwork.draftkings.com/draftkings-
// sportsbook-betting-splits/?tb_eg=<event group>&tb_edate=n7days&tb_emt=0):
//   - #tbsedid holds one <div class="tb-se ..."> block per event.
//   - Block title: <a href=".../event/{dkEventId}?...">Away @ Home</a> (NFL
//     wraps team logos inside the anchor) plus "M/D, hh:mmAM" in Eastern time.
//   - Per market a header row whose four columns must read
//     [Moneyline|Spread|Total, "Odds", "% Handle", "% Bets"], then one
//     tb-sodd row per side: label ("Liberty -2.5", "Over 50.5", "Coastal
//     Carolina"), DK price, handle %, bets %. Row order is NOT fixed (the
//     moneyline lists home first, the spread favorite first), so sides are
//     resolved from the label, never from position.
//   - 10 events per page; ?tb_page=N pages, and a request past the last page
//     silently repeats the last page, so callers must follow "Next" (disabled
//     on the last page) and dedupe by event id.
// DK prints minus signs as U+2212. Anything structural that stops matching
// (container, column headers, labels) raises SplitsMarkupError so the sync
// fails loudly instead of writing numbers into the wrong columns.

export type SplitMarket = "moneyline" | "spread" | "total";
export type SplitSide = "away" | "home" | "over" | "under";

export interface DkSplitOutcome {
  side: SplitSide;
  /** Label exactly as DK prints it, entities decoded ("Texas A&M -3.5") */
  label: string;
  /** Spread points for that side, or the total; null for moneylines */
  line: number | null;
  /** American odds; null when DK shows no price (market off the board) */
  price: number | null;
  handlePct: number;
  betsPct: number;
}

export interface EasternWallClock {
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface DkSplitsEvent {
  eventId: string;
  away: string;
  home: string;
  /** Kickoff as printed ("9/24, 07:30PM"), Eastern time, no year */
  kickoffLabel: string;
  kickoff: EasternWallClock;
  markets: Partial<Record<SplitMarket, [DkSplitOutcome, DkSplitOutcome]>>;
}

export interface DkSplitsPage {
  events: DkSplitsEvent[];
  /** DK's explicit "No events match your current selections" state */
  empty: boolean;
  /** Whether the pagination bar links a next page */
  hasNext: boolean;
  /** Event blocks dropped for per-event anomalies (reported, never guessed) */
  skipped: string[];
}

export class SplitsMarkupError extends Error {
  constructor(message: string) {
    super(`DK splits markup changed: ${message}`);
    this.name = "SplitsMarkupError";
  }
}

const EXPECTED_COLUMNS = ["Odds", "% Handle", "% Bets"];
const MARKET_BY_HEADER: Record<string, SplitMarket> = {
  moneyline: "moneyline",
  spread: "spread",
  total: "total",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Tags stripped, entities decoded, whitespace collapsed. */
function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** DK's typographic minus (U+2212) and stray en dashes become ASCII "-". */
function asciiSigns(s: string): string {
  return s.replace(/[−–]/g, "-");
}

/**
 * American price from DK's odds cell. Empty or "-" means no price posted
 * (null); anything that is not a legal American price (|n| >= 100) throws, so
 * a switch to decimal odds or a new cell layout cannot slip through.
 */
export function parseAmericanPrice(raw: string): number | null {
  const s = asciiSigns(text(raw)).toUpperCase();
  if (s === "" || s === "-") return null;
  if (s === "EVEN" || s === "EV") return 100;
  if (!/^[+-]?\d+$/.test(s)) throw new Error(`unreadable price "${s}"`);
  const n = parseInt(s, 10);
  if (Math.abs(n) < 100) throw new Error(`illegal American price "${s}"`);
  return n;
}

function parsePoints(raw: string): number {
  const s = asciiSigns(raw.trim()).toUpperCase();
  if (s === "PK" || s === "PICK" || s === "EVEN") return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`unreadable line "${raw}"`);
  return n;
}

export function parseKickoffLabel(label: string): EasternWallClock {
  const m = label.match(/^(\d{1,2})\/(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*([AP])M$/i);
  if (!m) throw new Error(`unreadable kickoff "${label}"`);
  let hour = Number(m[3]) % 12;
  if (m[5].toUpperCase() === "P") hour += 12;
  return { month: Number(m[1]), day: Number(m[2]), hour, minute: Number(m[4]) };
}

const ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function easternParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = ET_FORMAT.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/**
 * DK prints kickoffs in Eastern time without a year. Resolve the year closest
 * to `now` (a January bowl seen in late December lands in the next year),
 * then pick whichever of EDT/EST round-trips to the printed wall clock.
 */
export function kickoffToUtc(k: EasternWallClock, now: Date): Date {
  const y = now.getUTCFullYear();
  let best: Date | null = null;
  for (const year of [y - 1, y, y + 1]) {
    let resolved: Date | null = null;
    for (const offsetHours of [4, 5]) {
      const guess = new Date(Date.UTC(year, k.month - 1, k.day, k.hour + offsetHours, k.minute));
      const p = easternParts(guess);
      if (p.year === year && p.month === k.month && p.day === k.day && p.hour === k.hour && p.minute === k.minute) {
        resolved = guess;
        break;
      }
    }
    resolved ??= new Date(Date.UTC(year, k.month - 1, k.day, k.hour + 5, k.minute));
    if (!best || Math.abs(resolved.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime())) {
      best = resolved;
    }
  }
  return best!;
}

function parsePct(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`bad percentage "${raw}"`);
  return Math.round(n);
}

function parseMarket(
  market: SplitMarket,
  sectionHtml: string,
  away: string,
  home: string,
): [DkSplitOutcome, DkSplitOutcome] {
  const rows = sectionHtml.split(/<div class="tb-sodd(?=[\s"])/).slice(1);
  if (rows.length !== 2) throw new Error(`${market} has ${rows.length} rows, expected 2`);

  const outcomes = rows.map((row): DkSplitOutcome => {
    const labelMatch = row.match(/class="tb-slipline[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!labelMatch) throw new Error(`${market} row without a label`);
    const label = text(labelMatch[1]);
    const priceMatch = row.match(/class="tb-odd-s[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const price = priceMatch ? parseAmericanPrice(priceMatch[1]) : null;
    const pcts = [...row.matchAll(/<div class="flex-1">\s*(\d{1,3}(?:\.\d+)?)%/g)].map((m) => parsePct(m[1]));
    if (pcts.length !== 2) throw new Error(`${market} row "${label}" has ${pcts.length} percentages, expected 2`);
    // Column order was verified against the header: handle first, then bets
    const [handlePct, betsPct] = pcts;

    if (market === "total") {
      const m = asciiSigns(label).match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
      if (!m) throw new Error(`total label "${label}" is not Over/Under N`);
      return { side: m[1].toLowerCase() as SplitSide, label, line: Number(m[2]), price, handlePct, betsPct };
    }

    let team = label;
    let line: number | null = null;
    if (market === "spread") {
      const m = asciiSigns(label).match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?|PK|PICK|EVEN)$/i);
      if (!m) throw new Error(`spread label "${label}" has no number`);
      team = m[1].trim();
      line = parsePoints(m[2]);
    }
    const side: SplitSide | null = team === away ? "away" : team === home ? "home" : null;
    if (!side) throw new Error(`${market} label "${label}" names neither ${away} nor ${home}`);
    return { side, label, line, price, handlePct, betsPct };
  });

  const [a, b] = outcomes;
  if (a.side === b.side) throw new Error(`${market} lists ${a.side} twice`);
  if (market === "spread" && a.line !== null && b.line !== null && a.line + b.line !== 0) {
    throw new Error(`spread lines ${a.line}/${b.line} do not mirror`);
  }
  if (market === "total" && a.line !== b.line) {
    throw new Error(`total lines ${a.line}/${b.line} differ`);
  }
  // Canonical order: away/home, over/under
  const first: SplitSide = market === "total" ? "over" : "away";
  return a.side === first ? [a, b] : [b, a];
}

function parseEvent(block: string): DkSplitsEvent {
  const h5 = block.match(/<h5[^>]*>([\s\S]*?)<\/h5>/);
  if (!h5) throw new Error("event block without a title");
  const idMatch = h5[1].match(/sportsbook\.draftkings\.com\/event\/(\d+)/);
  if (!idMatch) throw new Error("event title without a DK event link");
  const title = text(h5[1]);
  const teams = title.split(" @ ");
  if (teams.length !== 2 || !teams[0] || !teams[1]) throw new Error(`title "${title}" is not "Away @ Home"`);
  const [away, home] = teams.map((t) => t.trim());

  const afterTitle = block.slice(block.indexOf(h5[0]) + h5[0].length);
  const kickoffMatch = afterTitle.match(/<span[^>]*>([\s\S]*?)<\/span>/);
  const kickoffLabel = kickoffMatch ? text(kickoffMatch[1]) : "";
  const kickoff = parseKickoffLabel(kickoffLabel);

  const markets: DkSplitsEvent["markets"] = {};
  for (const section of block.split(/<div class="tb-se-head(?=[\s"])/).slice(1)) {
    const headEnd = section.indexOf('<div class="tb-sm');
    const head = headEnd >= 0 ? section.slice(0, headEnd) : section;
    const columns = [...head.matchAll(/<div class="flex-1">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]));
    if (columns.length !== 4 || EXPECTED_COLUMNS.some((c, i) => columns[i + 1] !== c)) {
      throw new SplitsMarkupError(`market header reads [${columns.join(", ")}], expected [market, ${EXPECTED_COLUMNS.join(", ")}]`);
    }
    const market = MARKET_BY_HEADER[columns[0].toLowerCase()];
    if (!market) continue; // a market we do not track (none on NCAAF/NFL today)
    if (markets[market]) throw new Error(`${market} listed twice`);
    markets[market] = parseMarket(market, section.slice(Math.max(headEnd, 0)), away, home);
  }
  if (Object.keys(markets).length === 0) throw new Error(`"${title}" has no readable markets`);

  return { eventId: idMatch[1], away, home, kickoffLabel, kickoff, markets };
}

export function parseDkSplitsPage(html: string): DkSplitsPage {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const start = stripped.indexOf('id="tbsedid"');
  if (start < 0) throw new SplitsMarkupError("splits container #tbsedid not found");
  // The splits list ends at the pagination bar (or the article end when a
  // window fits on one page); nothing after that is ours to read.
  const articleEnd = stripped.indexOf("</article>", start);
  const paginationAt = stripped.indexOf("tb_pagination", start);
  const listEnd = paginationAt >= 0 ? paginationAt : articleEnd >= 0 ? articleEnd : stripped.length;
  const section = stripped.slice(start, listEnd);
  const pagination = paginationAt >= 0 ? stripped.slice(paginationAt, articleEnd > paginationAt ? articleEnd : undefined) : "";

  const empty = /No events match your current selections/i.test(section);
  const blocks = section.split(/<div class="tb-se(?=[\s"])/).slice(1);
  if (blocks.length === 0 && !empty) {
    throw new SplitsMarkupError("no event blocks and no empty-state message");
  }

  const events: DkSplitsEvent[] = [];
  const skipped: string[] = [];
  for (const block of blocks) {
    try {
      events.push(parseEvent(block));
    } catch (err) {
      if (err instanceof SplitsMarkupError) throw err;
      const title = text(block.match(/<h5[^>]*>([\s\S]*?)<\/h5>/)?.[1] ?? "untitled event");
      skipped.push(`${title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // "Next" is a real link except on the last page, where it is href="#"
  const nextAnchor = [...pagination.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].find(
    (m) => text(m[2]) === "Next",
  );
  const hasNext = !!nextAnchor && /tb_page=\d+/.test(nextAnchor[1]);

  return { events, empty, hasNext, skipped };
}
