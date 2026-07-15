// Canonical stat-leaderboard question detector.
//
// The chat edge function (supabase/functions/gemini-chat/index.ts) contains a
// byte-for-byte mirror of this logic — it must, because it runs on Deno and
// can't import from src. This copy is the one the test harness locks
// (src/test/statLeaderDetect.test.ts). If you change one, change both.
//
// Purpose: any "who leads / most / top / best in <stat>" question is answered
// from our own player_season_stats (the exact leaderboard the Players pages
// show) instead of web search, so chat can never contradict the dashboard.

export interface StatLeaderReq {
  sport: "MLB" | "NBA" | "NFL";
  column: string;
  label: string;
  isRate: boolean; // rate stats (AVG/OPS/%) need a minimum-sample filter
}

export const RATE_COLUMNS = new Set([
  "batting_avg", "ops", "slugging_pct", "on_base_pct",
  "fg_pct", "three_point_pct", "ft_pct", "passer_rating",
]);

const MLB: Array<[RegExp, string, string]> = [
  [/\bops\b|on-?base plus slugging/, "ops", "OPS"],
  [/home ?runs?|\bhrs?\b|homers?|long ?balls?/, "home_runs", "home runs"],
  [/\brbis?\b|runs batted in/, "rbi", "RBI"],
  [/batting average|\bavg\b|\bba\b|\bhitting\b/, "batting_avg", "batting average"],
  [/stolen bases?|\bsb\b|steals/, "stolen_bases", "stolen bases"],
  [/slugging/, "slugging_pct", "slugging %"],
  [/on-?base|\bobp\b/, "on_base_pct", "on-base %"],
  [/\bhits\b/, "hits", "hits"],
  [/\bdoubles\b/, "doubles", "doubles"],
  [/\bwalks\b|bases on balls/, "walks", "walks"],
];
const NBA: Array<[RegExp, string, string]> = [
  [/points|scoring|\bppg\b/, "points_per_game", "points per game"],
  [/rebounds?|\brpg\b/, "rebounds_per_game", "rebounds per game"],
  [/assists?|\bapg\b/, "assists_per_game", "assists per game"],
  [/steals?|\bspg\b/, "steals_per_game", "steals per game"],
  [/blocks?|\bbpg\b/, "blocks_per_game", "blocks per game"],
];
const NFL: Array<[RegExp, string, string]> = [
  [/passing yards|pass yards|passing yds/, "pass_yards", "passing yards"],
  [/rushing yards|rush yards|rushing yds/, "rush_yards", "rushing yards"],
  [/receiving yards|rec yards|receiving yds/, "rec_yards", "receiving yards"],
  [/passing (td|touchdown)/, "pass_td", "passing TDs"],
  [/rushing (td|touchdown)/, "rush_td", "rushing TDs"],
  [/receiving (td|touchdown)/, "rec_td", "receiving TDs"],
  [/receptions|\bcatches\b/, "receptions", "receptions"],
  [/\bsacks\b/, "sacks", "sacks"],
  [/interceptions|\bints?\b/, "interceptions", "interceptions"],
];

function pick(arr: Array<[RegExp, string, string]>, m: string) {
  for (const [re, col, label] of arr) if (re.test(m)) return { col, label };
  return null;
}

export function detectStatLeader(message: string, league: string): StatLeaderReq | null {
  const m = (message || "").toLowerCase();
  if (!/\b(leads?|leader|leading|most|top|best|highest|fewest|lowest)\b/.test(m)) return null;

  let sport = "";
  let hit: { col: string; label: string } | null = null;
  if (league === "MLB" || /\bmlb\b|baseball/.test(m)) { sport = "MLB"; hit = pick(MLB, m); }
  else if (league === "NBA" || /\bnba\b|basketball/.test(m)) { sport = "NBA"; hit = pick(NBA, m); }
  else if (league === "NFL" || /\bnfl\b|football/.test(m)) { sport = "NFL"; hit = pick(NFL, m); }
  else {
    hit = pick(MLB, m); if (hit) sport = "MLB";
    if (!hit) { hit = pick(NBA, m); if (hit) sport = "NBA"; }
    if (!hit) { hit = pick(NFL, m); if (hit) sport = "NFL"; }
  }
  if (!hit || !sport) return null;
  return { sport: sport as StatLeaderReq["sport"], column: hit.col, label: hit.label, isRate: RATE_COLUMNS.has(hit.col) };
}

// Hit-streak questions are always grounded in MLB streak data.
export function isHitStreakQuestion(message: string): boolean {
  return /hit(ting)?[ -]?streaks?|hot(test)?\s+(hitter|bat)|longest\s+(active\s+)?streak/i.test(message || "");
}
