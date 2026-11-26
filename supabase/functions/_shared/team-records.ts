// Team records for the Analyst (D-127): each team's record this season against the spread and on the
// total, from MGP's own games and closing lines (scripts/angles/team_records.py, stored daily in
// team_records). When a question names a team and asks about covering, totals or its record, the
// Analyst gets the record as an AUTHORITATIVE block, so it never pieces a record together from web
// pages with different windows (owner, Nov 26: "the math isn't footing").

export interface TeamRecordRow {
  sport: string;
  team: string;
  season: number;
  team_name: string;
  through: string;
  record: {
    games: number;
    su: string;
    ats: string;
    ats_rank: { place: number; tied: boolean; of: number } | null;
    ou: string;
    ou_games: number;
    home_ats: string;
    road_ats: string;
    neutral_ats: string;
    fav_ats: string;
    dog_ats: string;
    last5_ats: string;
    log: { date: string; opp: string; site: string; line: string; score: string; su: string; ats: string; total: number | null; ou: string | null; post: boolean }[];
  };
}

/** Questions the records answer: covering, totals, records, trends. */
export const RECORD_QUESTION = /\b(ats|against the spread|covers?|covered|covering|spreads?|o\/u|over\/under|overs?|unders?|totals?|records?|trends?|streaks?|this season|so far|lately|recently)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The ways a question can name a team, longest first: full name, then the name without its last one or two words. */
function aliases(row: TeamRecordRow): { text: string; drop: number }[] {
  const words = row.team_name.split(/\s+/);
  const out: { text: string; drop: number }[] = [{ text: row.team_name, drop: 0 }];
  if (row.sport === "NFL" || row.sport === "NBA") {
    // Pro teams go by nickname ("Bills", "Trail Blazers"); city names are shared ("Los Angeles", "New York")
    out.push({ text: words.slice(-1).join(" "), drop: 1 });
    if (words.length > 2) out.push({ text: words.slice(-2).join(" "), drop: 1 });
  } else {
    // Colleges go by school ("Ohio State", "Alabama"); mascots can be one or two words
    for (const drop of [1, 2]) {
      if (words.length > drop) out.push({ text: words.slice(0, -drop).join(" "), drop });
    }
  }
  return out.filter((a) => a.text.length >= 3);
}

/** The teams a question names, at most `limit`, in the order they appear. */
export function matchTeams(message: string, rows: TeamRecordRow[], limit = 2): TeamRecordRow[] {
  const cands: { re: RegExp; len: number; drop: number; row: TeamRecordRow }[] = [];
  for (const row of rows) {
    for (const a of aliases(row)) {
      cands.push({ re: new RegExp(`(^|[^A-Za-z0-9])${escape(a.text)}(?=$|[^A-Za-z0-9])`, "i"), len: a.text.length, drop: a.drop, row });
    }
    // An abbreviation of 3+ letters, written in capitals ("OKC", "BUF")
    if (row.team.length >= 3) cands.push({ re: new RegExp(`(^|[^A-Za-z0-9])${escape(row.team)}(?=$|[^A-Za-z0-9])`), len: row.team.length, drop: 1, row });
  }
  // Longest name first, and the closer name first on a tie, so "Ohio State" beats "Ohio" and "Miami" means
  // the Hurricanes, not Miami (OH); each part of the question names one team at most
  cands.sort((a, b) => b.len - a.len || a.drop - b.drop);
  let rest = message;
  const found: { at: number; row: TeamRecordRow }[] = [];
  for (const c of cands) {
    if (found.some((f) => f.row === c.row)) continue;
    const m = rest.match(c.re);
    if (!m || m.index === undefined) continue;
    const at = m.index + m[1].length;
    found.push({ at, row: c.row });
    rest = rest.slice(0, at) + "#".repeat(m[0].length - m[1].length) + rest.slice(at + m[0].length - m[1].length);
  }
  return found.sort((a, b) => a.at - b.at).slice(0, limit).map((f) => f.row);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function seasonLabel(sport: string, season: number): string {
  const yy = (y: number) => `'${String(y).slice(-2)}`;
  return sport === "NBA" || sport === "NCAAB" ? `${yy(season - 1)}-${yy(season)}` : yy(season);
}

export function formatTeamRecords(rows: TeamRecordRow[]): string {
  if (!rows.length) return "";
  let out = "\n📈 TEAM RECORDS AGAINST THE SPREAD AND ON THE TOTAL: AUTHORITATIVE, MGP DATA\n";
  out += "Closing lines, every game this season (regular season and postseason). Use these for any ATS, cover or over/under record this season: no web search for them, and no web figure beside them. Every record adds up to its games. Name the window as given (\"this season (10 games)\").\n";
  for (const r of rows) {
    const x = r.record;
    const rank = x.ats_rank ? ` (${x.ats_rank.tied ? "tied for " : ""}${ordinal(x.ats_rank.place)} of ${x.ats_rank.of})` : "";
    // Every label says which record it is, so an ATS record is never read as straight up
    const parts = [
      `Straight up (W-L) ${x.su}`, `ATS ${x.ats}${rank}`,
      `Over/under (overs-unders) ${x.ou}${x.ou_games < x.games ? ` in ${x.ou_games} games with a total` : ""}`,
      `ATS at home ${x.home_ats}`, `ATS on the road ${x.road_ats}`,
      ...(x.neutral_ats !== "0-0" ? [`ATS at neutral sites ${x.neutral_ats}`] : []),
      `ATS as a favorite ${x.fav_ats}`, `ATS as an underdog ${x.dog_ats}`, `ATS in the last 5 ${x.last5_ats}`,
    ];
    out += `• ${r.team_name} (${seasonLabel(r.sport, r.season)} ${r.sport === "NCAAF" ? "college football" : r.sport}, ${x.games} games through ${day(r.through)}): ${parts.join(" · ")}\n`;
    out += `  Last ${x.log.length} games: ` + x.log.map((g) =>
      `${day(g.date)} ${g.site === "road" ? "at" : "vs"} ${g.opp}${g.site === "neutral" ? " (neutral)" : ""}${g.post ? " (postseason)" : ""}, ${r.team} ${g.line}, ${g.su} ${g.score}, ${g.ats}` +
      (g.total !== null && g.ou ? `, total ${g.total} ${g.ou}` : "")).join("; ") + "\n";
  }
  return out;
}

const SPORT_OF: Record<string, string> = { NFL: "NFL", NBA: "NBA", NCAAF: "NCAAF", CFB: "NCAAF", NCAAB: "NCAAB" };

/** The block for a question, or "" when it names no team or isn't about records. Never throws. */
// deno-lint-ignore no-explicit-any
export async function teamRecordsBlock(supabase: any, message: string, league: string | null | undefined): Promise<string> {
  if (!RECORD_QUESTION.test(message)) return "";
  try {
    const sport = league ? SPORT_OF[league.toUpperCase()] : undefined;
    if (league && !sport) return ""; // MLB and the rest: no records stored
    const order = sport ? [sport] : ["NFL", "NBA", "NCAAF"];
    for (const s of order) {
      // Names first (small), then the full records of the teams named
      const { data, error } = await supabase.from("team_records").select("sport,team,team_name").eq("sport", s);
      if (error || !data?.length) continue;
      const named = matchTeams(message, data as TeamRecordRow[]);
      if (!named.length) continue;
      const { data: full } = await supabase.from("team_records").select("*").eq("sport", s).in("team", named.map((t) => t.team));
      const rows = named.map((t) => (full ?? []).find((f: TeamRecordRow) => f.team === t.team)).filter(Boolean) as TeamRecordRow[];
      if (rows.length) return formatTeamRecords(rows);
    }
  } catch (e) {
    console.error("[team-records]", e instanceof Error ? e.message : e);
  }
  return "";
}
