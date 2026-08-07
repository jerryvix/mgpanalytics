// Pure HTML extraction for Tankathon's NFL big board — no Deno APIs so the
// vitest suite can exercise it against a checked-in fixture
// (src/test/fixtures/tankathon-big-board.html). Row shape as of Aug 2026:
//
//   <div class="mock-row nfl" data-pos="WR">
//     <div class="mock-row-pick-number">1</div>
//     <div class="mock-row-logo"><a ...><img ... alt="Ohio State" .../></a></div>
//     <div class="mock-row-player"><a ...>
//       <div class="mock-row-name">Jeremiah Smith</div>
//       <div class="mock-row-school-position">WR | Ohio State </div></a></div>
//     <div class="mock-row-measurements nfl"><div class="section height-weight">
//       <div>6&#39;3&quot;</div><div>223 <span class="lbs">lbs</span></div></div></div>
//     ...

export interface ParsedProspect {
  rank: number;
  player_name: string;
  position: string | null;
  school: string;
  height: string | null;
  weight: number | null;
}

// Tankathon school labels that differ from CFBD school names. Default is
// passthrough — their labels are school-style names that match CFBD.
const TANKATHON_TO_CFBD: Record<string, string> = {
  "Miami (FL)": "Miami",
  "San Jose State": "San José State",
  "Hawaii": "Hawai'i",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

export function parseBigBoard(html: string): {
  draftYear: number | null;
  prospects: ParsedProspect[];
} {
  const yearMatch = html.match(/(\d{4}) NFL Draft Big Board/);
  const draftYear = yearMatch ? Number(yearMatch[1]) : null;

  const prospects: ParsedProspect[] = [];
  const chunks = html.split(/class="mock-row nfl"/).slice(1);
  let prevRank = 0;

  for (const chunk of chunks) {
    const rankMatch = chunk.match(/mock-row-pick-number">(\d+)</);
    const nameMatch = chunk.match(/mock-row-name">([^<]+)</);
    const schoolMatch = chunk.match(/mock-row-logo">[\s\S]*?alt="([^"]+)"/);
    const posSchoolMatch = chunk.match(/mock-row-school-position">([^<]+)</);
    const hwMatch = chunk.match(/height-weight">\s*<div>([^<]+)<\/div>\s*<div>(\d+)/);

    if (!rankMatch || !nameMatch || !schoolMatch) continue;
    const rank = Number(rankMatch[1]);

    // The page appends next year's class below the main board with ranks
    // restarting at 1 — a non-increasing rank means we've left this board.
    if (rank <= prevRank) break;
    prevRank = rank;

    const rawSchool = decodeEntities(schoolMatch[1]);
    prospects.push({
      rank,
      player_name: decodeEntities(nameMatch[1]),
      position: posSchoolMatch ? decodeEntities(posSchoolMatch[1]).split("|")[0].trim() || null : null,
      school: TANKATHON_TO_CFBD[rawSchool] ?? rawSchool,
      height: hwMatch ? decodeEntities(hwMatch[1]) : null,
      weight: hwMatch ? Number(hwMatch[2]) : null,
    });
  }

  return { draftYear, prospects };
}
