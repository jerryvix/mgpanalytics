// Pure HTML extraction for DraftTek's NFL Draft Big Board - no Deno APIs so
// the vitest suite can exercise it against checked-in fixtures
// (src/test/fixtures/drafttek-big-board-p1.html, -p2.html). The board is
// paged 150 prospects per page and every row is server-rendered with data
// attributes (markup as of Sep 2026):
//
//   <tr data-rank="1" data-school="Ohio State" data-pos="WR">
//     <td class="rank-cell" data-label="Rank">1</td>
//     <td class="change-cell" data-label="CNG">...</td>
//     <td class="player-cell" data-label="Prospect">Jeremiah Smith</td>
//     <td class="college-cell" data-label="College">...</td>
//     <td class="pos-cell" data-label="Pos">WR</td>
//     <td class="ht-cell" data-label="Ht">6'3&quot;</td>
//     <td class="wt-cell" data-label="Wt">223</td>
//     ...
//
// Page 1 also stamps the revision:
//   <h1 id="bigBoardTitle">2027 NFL Draft Big Board</h1>
//   <span class="intro-date">September 17, 2026</span>
//   <span class="intro-revision">In-Season Rankings Week 3</span>
//
// Why DraftTek (Sep 2026): it is the one current, in-season board we can
// reach that ranks 200+ prospects (Tankathon's stops near 120). QC checked
// its top 50 against other boards: CBS 31 of 43, Bleacher Report 29 of the
// 41 visible, SI's top 10 all inside DraftTek's top 31, and sticktothemodel
// 40 of 48.

export interface ParsedProspect {
  rank: number;
  player_name: string;
  position: string | null;
  school: string;
  height: string | null;
  weight: number | null;
}

export interface SkippedRow {
  /** The row's rank when that much could be read. */
  rank: number | null;
  reason: string;
}

export interface ParsedBoardPage {
  draftYear: number | null;
  /** Revision date as printed on page 1 ("September 17, 2026"); null on later pages. */
  asOf: string | null;
  /** Revision label ("In-Season Rankings Week 3"); null on later pages. */
  revision: string | null;
  prospects: ParsedProspect[];
  /** Board rows that couldn't be parsed. Reported, never dropped silently. */
  skipped: SkippedRow[];
}

// DraftTek school labels that differ from CFBD school names (what the
// resolver in src/utils/cfbdSchools.ts matches against). Default is
// passthrough - DraftTek mostly uses CFBD-style names already.
const DRAFTTEK_TO_CFBD: Record<string, string> = {
  "Miami (FL)": "Miami",
  "Miami (Fla.)": "Miami",
  "Miami (Ohio)": "Miami (OH)",
  Cal: "California",
  Pitt: "Pittsburgh",
  Mississippi: "Ole Miss",
  "San Jose State": "San José State",
  Hawaii: "Hawai'i",
  USF: "South Florida",
  UMass: "Massachusetts",
  FIU: "Florida International",
  FAU: "Florida Atlantic",
  "North Carolina State": "NC State",
  "Appalachian State": "App State",
  "Louisiana-Monroe": "UL Monroe",
  "Louisiana Monroe": "UL Monroe",
  "Louisiana-Lafayette": "Louisiana",
  Connecticut: "UConn",
};

// DraftTek splits positions by alignment (DL3T, OLB, CBN, ...). The Draft
// Talent card shows the broad group.
const POSITION_GROUPS: Record<string, string> = {
  DL1T: "DL",
  DL3T: "DL",
  DL5T: "DL",
  ILB: "LB",
  OLB: "LB",
  CBN: "CB",
  WRS: "WR",
  OC: "IOL",
  OG: "IOL",
};

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;|&#x27;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(row: string, cls: string): string | null {
  const m = row.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</td>`));
  return m ? decode(m[1]) : null;
}

export function parseDrafttekPage(html: string): ParsedBoardPage {
  const yearMatch = html.match(/(\d{4}) NFL Draft Big Board/);
  const asOfMatch = html.match(/class="intro-date">([^<]+)</);
  const revisionMatch = html.match(/class="intro-revision">([^<]+)</);

  const prospects: ParsedProspect[] = [];
  const skipped: SkippedRow[] = [];
  for (const row of html.split(/<tr data-rank="/).slice(1)) {
    const rawRank = Number(row.match(/^(\d+)"/)?.[1]);
    const rank = Number.isInteger(rawRank) && rawRank > 0 ? rawRank : null;
    const rawSchool = row.match(/data-school="([^"]*)"/)?.[1];
    const rawPos = row.match(/data-pos="([^"]*)"/)?.[1];
    const name = cell(row, "player-cell");
    const school = rawSchool ? decode(rawSchool) : "";
    if (rank === null || !school || !name) {
      skipped.push({
        rank,
        reason: rank === null ? "no readable rank" : !name ? "no player name" : "no school",
      });
      continue;
    }

    const pos = rawPos ? decode(rawPos).toUpperCase() : "";
    const weight = Number(cell(row, "wt-cell"));
    prospects.push({
      rank,
      player_name: name,
      position: pos ? POSITION_GROUPS[pos] ?? pos : null,
      school: DRAFTTEK_TO_CFBD[school] ?? school,
      height: cell(row, "ht-cell") || null,
      weight: Number.isFinite(weight) && weight > 0 ? weight : null,
    });
  }

  return {
    draftYear: yearMatch ? Number(yearMatch[1]) : null,
    asOf: asOfMatch ? decode(asOfMatch[1]) : null,
    revision: revisionMatch ? decode(revisionMatch[1]) : null,
    prospects,
    skipped,
  };
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * The board's printed revision date ("September 17, 2026") as YYYY-MM-DD, or
 * null when it's missing or unreadable. Stored as source_as_of: our scrape
 * time can't show that a source has stopped revising, this can.
 */
export function parseAsOfDate(label: string | null): string | null {
  const m = label?.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day));
  if (month < 0 || d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface AssembledBoard {
  prospects: ParsedProspect[];
  /** Repeat names skipped (the table's unique key is draft_year + player_name). */
  duplicates: string[];
  /** Unparseable rows across all pages (any inside 1..depth already threw). */
  skipped: SkippedRow[];
}

/** "57", "57, 58", or "57, 58, 59 and 12 more" for error messages. */
function listRanks(ranks: number[], max = 10): string {
  const shown = ranks.slice(0, max).join(", ");
  return ranks.length > max ? `${shown} and ${ranks.length - max} more` : shown;
}

/**
 * Stitch the board's pages (consecutive rank ranges of one board) into a
 * single list cut at `depth`. Before any de-duplication, ranks 1..depth must
 * all be present exactly once, so a partial capture (a row the parser
 * couldn't read, a page that came back short) fails loudly and names the
 * missing ranks instead of shipping a board with holes. A repeated player
 * name keeps its best rank.
 */
export function assembleBoard(pages: ParsedBoardPage[], depth: number): AssembledBoard {
  const all = pages.flatMap((p) => p.prospects).sort((a, b) => a.rank - b.rank);
  const skipped = pages.flatMap((p) => p.skipped);
  for (let i = 1; i < all.length; i++) {
    if (all[i].rank === all[i - 1].rank) {
      throw new Error(`Rank ${all[i].rank} appears twice - pages overlap or markup changed`);
    }
  }

  const present = new Set(all.map((p) => p.rank));
  const missing: number[] = [];
  for (let r = 1; r <= depth; r++) if (!present.has(r)) missing.push(r);
  if (missing.length) {
    const unreadable = skipped.length ? ` (${skipped.length} unparseable row${skipped.length === 1 ? "" : "s"} on the pages)` : "";
    throw new Error(
      `Board is missing rank${missing.length === 1 ? "" : "s"} ${listRanks(missing)} of 1-${depth}${unreadable} - partial capture, keeping last good board`
    );
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  const prospects: ParsedProspect[] = [];
  for (const p of all) {
    if (p.rank > depth) break;
    if (seen.has(p.player_name)) {
      duplicates.push(`${p.player_name} (#${p.rank})`);
      continue;
    }
    seen.add(p.player_name);
    prospects.push(p);
  }
  return { prospects, duplicates, skipped };
}
