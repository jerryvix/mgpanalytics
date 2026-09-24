import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assembleBoard,
  parseAsOfDate,
  parseDrafttekPage,
} from "../../supabase/functions/sync-draft-board/parse";

// Fixtures are trimmed captures of DraftTek's real 2027 board (Sep 17 2026,
// "In-Season Rankings Week 3"): page 1 = ranks 1-150, page 2 = 151-300. Row
// markup is unchanged; logos, bio links, nav and scripts were stripped.
const fixture = (name: string) => readFileSync(resolve(__dirname, "fixtures", name), "utf-8");
const html1 = fixture("drafttek-big-board-p1.html");
const html2 = fixture("drafttek-big-board-p2.html");
const page1 = parseDrafttekPage(html1);
const page2 = parseDrafttekPage(html2);

// Fixture rows are one <tr> per line; these build broken variants of a page
const rowPattern = (rank: number) => new RegExp(`<tr data-rank="${rank}"[^\\n]*</tr>\\n`);
const withoutRow = (html: string, rank: number) => html.replace(rowPattern(rank), "");
const withBlankName = (html: string, rank: number) =>
  html.replace(rowPattern(rank), (row) => row.replace(/(data-label="Prospect">)[^<]*(<\/td>)/, "$1$2"));

describe("parseDrafttekPage", () => {
  it("reads the draft year and the revision stamp", () => {
    expect(page1.draftYear).toBe(2027);
    expect(page1.asOf).toBe("September 17, 2026");
    expect(page1.revision).toBe("In-Season Rankings Week 3");
    // Later pages carry the year in the title but no revision stamp
    expect(page2.draftYear).toBe(2027);
    expect(page2.asOf).toBeNull();
  });

  it("extracts every row on each page in rank order", () => {
    expect(page1.prospects).toHaveLength(150);
    expect(page2.prospects).toHaveLength(150);
    expect(page1.prospects[0].rank).toBe(1);
    expect(page2.prospects[0].rank).toBe(151);
    expect(page2.prospects[149].rank).toBe(300);
    expect(page1.skipped).toEqual([]);
    expect(page2.skipped).toEqual([]);
  });

  it("reports rows it can't parse instead of dropping them silently", () => {
    const broken = parseDrafttekPage(withBlankName(html1, 57));
    expect(broken.prospects).toHaveLength(149);
    expect(broken.skipped).toEqual([{ rank: 57, reason: "no player name" }]);
  });

  it("extracts name, position, school, and measurements for the top prospect", () => {
    expect(page1.prospects[0]).toEqual({
      rank: 1,
      player_name: "Jeremiah Smith",
      position: "WR",
      school: "Ohio State",
      height: "6'3\"",
      weight: 223,
    });
  });

  it("collapses DraftTek's alignment labels into position groups", () => {
    const byName = (n: string) => [...page1.prospects, ...page2.prospects].find((p) => p.player_name === n);
    expect(byName("Will Echoles")?.position).toBe("DL"); // DL3T
    expect(byName("Austin Siereveld")?.position).toBe("IOL"); // OG
    expect(byName("Iapani Laloulu")?.position).toBe("IOL"); // OC
    expect(byName("Rasheem Biles")?.position).toBe("LB"); // OLB
    expect(byName("Eli Bowen")?.position).toBe("CB"); // CBN
    expect(byName("Mario Craver")?.position).toBe("WR"); // WRS
  });

  it("maps DraftTek school labels onto CFBD names the resolver matches", () => {
    const all = [...page1.prospects, ...page2.prospects];
    expect(all.find((p) => p.player_name === "Jordan Lyle")?.school).toBe("Miami"); // "Miami (FL)"
    expect(all.filter((p) => p.player_name === "Daniel Harris").map((p) => p.school)).toEqual([
      "California",
      "California", // listed once as "California", once as "Cal"
    ]);
    for (const p of all) {
      expect(p.school.length).toBeGreaterThan(0);
      expect(`${p.player_name}${p.school}${p.height}`).not.toMatch(/&#?\w+;/); // entities decoded
    }
  });

  it("returns an empty page (→ loud sync failure) on unrecognized markup", () => {
    const result = parseDrafttekPage("<html><body>redesigned page</body></html>");
    expect(result.prospects).toEqual([]);
    expect(result.draftYear).toBeNull();
  });
});

describe("parseAsOfDate", () => {
  it("turns the printed revision date into an ISO date", () => {
    expect(parseAsOfDate(page1.asOf)).toBe("2026-09-17");
    expect(parseAsOfDate("Sept. 3, 2026")).toBe("2026-09-03");
    expect(parseAsOfDate("December 31 2026")).toBe("2026-12-31");
  });

  it("returns null (→ the sync fails loudly) for a missing or unreadable stamp", () => {
    expect(parseAsOfDate(null)).toBeNull();
    expect(parseAsOfDate(page2.asOf)).toBeNull(); // page 2 carries no stamp
    expect(parseAsOfDate("In-Season Rankings Week 3")).toBeNull();
    expect(parseAsOfDate("February 30, 2026")).toBeNull(); // not a real date
    expect(parseAsOfDate("Smarch 4, 2026")).toBeNull();
  });
});

describe("assembleBoard", () => {
  it("stitches the pages into a clean top 200", () => {
    const { prospects, duplicates, skipped } = assembleBoard([page1, page2], 200);
    expect(prospects).toHaveLength(200);
    expect(prospects.map((p) => p.rank)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(duplicates).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("throws and names the missing ranks when a row vanished (partial capture)", () => {
    const short = parseDrafttekPage(withoutRow(withoutRow(html1, 57), 58));
    expect(() => assembleBoard([short, page2], 200)).toThrow(/missing ranks 57, 58 of 1-200/);
  });

  it("throws on an unparseable row inside the top 200, naming it and counting the bad rows", () => {
    const broken = parseDrafttekPage(withBlankName(html1, 150));
    expect(() => assembleBoard([broken, page2], 200)).toThrow(
      /missing rank 150 of 1-200 \(1 unparseable row on the pages\)/
    );
  });

  it("throws when a whole page is gone", () => {
    expect(() => assembleBoard([page1], 200)).toThrow(/missing ranks 151, 152, 153.* and 40 more of 1-200/);
  });

  it("reports, but doesn't block on, unparseable rows past the cut", () => {
    const { prospects, skipped } = assembleBoard([page1, parseDrafttekPage(withBlankName(html2, 250))], 200);
    expect(prospects).toHaveLength(200);
    expect(skipped).toEqual([{ rank: 250, reason: "no player name" }]);
  });

  it("checks ranks before removing repeat names, so a known repeat isn't read as a hole", () => {
    // Ranks 236 and 250 are the same Daniel Harris: both ranks are present,
    // so the cut at 300 passes the check, then dedupe drops #250
    const { prospects, duplicates } = assembleBoard([page1, page2], 300);
    expect(prospects).toHaveLength(299);
    expect(duplicates).toEqual(["Daniel Harris (#250)"]);
  });

  it("keeps a repeated name at its best rank (the table key is draft_year + name)", () => {
    // DraftTek lists Daniel Harris at #236 and again at #250
    const { prospects, duplicates } = assembleBoard([page2, page1], 300);
    expect(prospects).toHaveLength(299);
    expect(prospects.find((p) => p.player_name === "Daniel Harris")?.rank).toBe(236);
    expect(duplicates).toEqual(["Daniel Harris (#250)"]);
  });

  it("throws when pages overlap, e.g. a redirect served page 1 twice", () => {
    expect(() => assembleBoard([page1, page1], 200)).toThrow(/appears twice/);
  });
});
