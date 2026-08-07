// Pure parsing for sync-win-totals — no Deno APIs so vitest can cover it
// against a checked-in fixture (src/test/winTotalsParse.test.ts, fixture
// src/test/fixtures/covers-win-totals-2024.html).
//
// Source page: https://www.covers.com/sportsoddshistory/nfl-win/?y={YEAR}&sa=nfl&t=win
// (sportsoddshistory.com 301-redirects here — fetch with redirect:"follow").
// One <table class='soh1'> with columns: Team | Win Total | Over Odds |
// Under Odds | Week bet settled | Actual Wins | Result. Above the table:
// optional "Lines courtesy of {book}" and "As of {Month D, YYYY}".
// Data © SportsOddsHistory.com — cite when displayed.

export interface WinTotalRow {
  teamName: string;
  teamAbbr: string | null;
  line: number;
  overOdds: number | null;
  underOdds: number | null;
  actualWins: number | null;
  /** The page's own grade (Over/Under/Push), lowercased. We re-grade in SQL;
   * this is kept for cross-checking the two agree. */
  pageResult: string | null;
}

export interface WinTotalsPage {
  book: string | null;
  asOf: string | null; // ISO date
  rows: WinTotalRow[];
}

import { NFL_TEAM_ABBR } from "../_shared/nfl-teams.ts";

export { NFL_TEAM_ABBR };

/** "+155" / "-185" / "+100" -> integer American odds; anything else -> null. */
export function parseAmericanOdds(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "");
  if (!/^[+-]?\d{3,5}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || Math.abs(n) < 100) return null;
  return n;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** "September 5, 2024" -> "2024-09-05" */
export function parseAsOfDate(text: string): string | null {
  const m = text.match(/As of\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseWinTotalsPage(html: string): WinTotalsPage {
  const tableMatch = html.match(/<table class=['"]soh1['"]>[\s\S]*?<\/table>/);
  if (!tableMatch) {
    throw new Error("No soh1 win-totals table found in page HTML");
  }
  const table = tableMatch[0];

  // Book + as-of live in the text just above the table.
  const preTable = stripTags(html.slice(Math.max(0, html.indexOf(tableMatch[0]) - 3000), html.indexOf(tableMatch[0])));
  const bookMatch = preTable.match(/Lines courtesy of\s+([A-Za-z0-9][A-Za-z0-9 .&']*?)(?:\s+As of|\s*$)/i);

  const rows: WinTotalRow[] = [];
  const trRe = /<tr>([\s\S]*?)<\/tr>/g;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(table)) !== null) {
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1])) !== null) {
      cells.push(stripTags(td[1]));
    }
    if (cells.length < 2) continue; // header or junk row

    const teamName = cells[0];
    const line = Number(cells[1]);
    if (!teamName || !Number.isFinite(line)) continue;

    const actualRaw = cells.length > 5 ? cells[5] : "";
    const actualWins = /^\d+$/.test(actualRaw) ? Number(actualRaw) : null;
    const resultRaw = cells.length > 6 ? cells[6].toLowerCase() : "";

    rows.push({
      teamName,
      teamAbbr: NFL_TEAM_ABBR[teamName] ?? null,
      line,
      overOdds: cells.length > 2 ? parseAmericanOdds(cells[2]) : null,
      underOdds: cells.length > 3 ? parseAmericanOdds(cells[3]) : null,
      actualWins,
      pageResult: ["over", "under", "push"].includes(resultRaw) ? resultRaw : null,
    });
  }

  return {
    book: bookMatch ? bookMatch[1].trim() : null,
    asOf: parseAsOfDate(preTable),
    rows,
  };
}
