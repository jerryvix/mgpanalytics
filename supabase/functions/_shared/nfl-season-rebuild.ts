// NFL season totals rebuilt from our own game logs (player_game_logs), shared
// by sync-nfl-season-stats and sync-nfl-game-logs (which runs it right after
// writing logs, so the two tables never drift apart for a whole cycle).
//
// Why logs and not BDL: BDL's /season_stats drifts from its own box scores
// (Sep 2026: targets off for 23 of 421 players, Kelce 17 vs 16), its
// postseason endpoint echoes regular-season lines, and its box scores carry
// phantom lines (14 in 2025). The logs are the box scores after the ESPN
// phantom guard in sync-nfl-game-logs, so a season row always equals the sum
// of that player's logs. From BDL's season line we keep only official games
// played (it counts appearances with no stat line) and extras like QBR.
// Postseason games played comes from ESPN's playoff game rosters instead
// (BDL has no usable postseason line), never below the logged games.
//
// Seasons without logs (before 2025) are never touched: there is nothing
// verified to rebuild them from.
import { selectAll } from "./select-all.ts";
import { bdlNflFetchAll } from "./bdl-nfl.ts";
import { espnPlayoffRosters } from "./espn-box.ts";
import {
  chunk,
  fantasyPoints,
  isFinalGame,
  logRowsToSeasonLines,
  mergeSeasonLines,
  officialGamesPlayed,
  passerRating,
  staleRows,
  type BdlGame,
  type BdlStat,
  type PostseasonPlayer,
  type SeasonLogRow,
} from "./nfl-sync.ts";

// Below this many source rows a season_type fetch is treated as incomplete and
// nothing is pruned (a fresh season's first week already returns ~400).
const MIN_ROWS_TO_PRUNE = 100;

const SKILL_POSITIONS = [
  "QB", "RB", "WR", "TE", "FB",
  "Quarterback", "Running Back", "Wide Receiver", "Tight End", "Fullback",
];

export interface SeasonRebuildResult {
  season: number;
  upserted: number;
  regular: { rebuilt: boolean; rows: number; logs: number; seasonOnly: number; note?: string };
  postseason: {
    rebuilt: boolean;
    rows: number;
    logs: number;
    finalGames: number;
    // players matched to ESPN's playoff rosters, and rows whose games played
    // the rosters raised above the box-score count
    officialGpMatched: number;
    gpRaised: number;
    note?: string;
  };
  pruned: { regular: number; postseason: number };
  errors: string[];
}

// deno-lint-ignore no-explicit-any
function seasonRow(stat: BdlStat, playerId: string, season: number, seasonType: "regular" | "postseason"): Record<string, any> {
  const fp = fantasyPoints(stat);
  const passInt: number | null = stat.passing_interceptions ?? null;
  return {
    player_id: playerId,
    sport: "NFL",
    season,
    season_type: seasonType,
    games_played: stat.games_played || 0,
    pass_attempts: stat.passing_attempts || 0,
    pass_completions: stat.passing_completions || 0,
    pass_yards: stat.passing_yards || 0,
    pass_td: stat.passing_touchdowns || 0,
    pass_int: passInt,
    // NFL passer rating from the season components (BDL season lines only
    // carry ESPN QBR, a different 0-100 scale)
    passer_rating: passerRating(
      stat.passing_completions || 0,
      stat.passing_attempts || 0,
      stat.passing_yards || 0,
      stat.passing_touchdowns || 0,
      passInt || 0,
    ),
    rush_attempts: stat.rushing_attempts || 0,
    rush_yards: stat.rushing_yards || 0,
    rush_td: stat.rushing_touchdowns || 0,
    receptions: stat.receptions || 0,
    rec_yards: stat.receiving_yards || 0,
    rec_td: stat.receiving_touchdowns || 0,
    targets: stat.receiving_targets || 0,
    fantasy_points: fp.fantasy_points,
    fantasy_points_ppr: fp.fantasy_points_ppr,
    raw_data: stat,
    updated_at: new Date().toISOString(),
  };
}

export async function rebuildNflSeasonStats(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  apiKey: string,
  season: number,
  opts: { prune: boolean },
): Promise<SeasonRebuildResult> {
  const result: SeasonRebuildResult = {
    season,
    upserted: 0,
    regular: { rebuilt: false, rows: 0, logs: 0, seasonOnly: 0 },
    postseason: { rebuilt: false, rows: 0, logs: 0, finalGames: 0, officialGpMatched: 0, gpRaised: 0 },
    pruned: { regular: 0, postseason: 0 },
    errors: [],
  };

  // Skill players: our id <-> BDL id. Paginated (NFL is past the 1,000-row cap).
  const players = await selectAll<{ id: string; external_id: string }>(
    () => supabase
      .from("players")
      .select("id, external_id")
      .eq("sport", "NFL")
      .in("position", SKILL_POSITIONS)
      .order("id"),
    { label: "fetch NFL players" },
  );
  const idByBdl = new Map<string, string>(players.map((p) => [String(p.external_id), p.id]));
  const bdlById = new Map<string, string>(players.map((p) => [p.id, String(p.external_id)]));

  // Every stored log of the season. Ordered by (week, player, game): ordering
  // by id over this multi-sport table hits the statement timeout.
  const logs = await selectAll<SeasonLogRow>(
    () => supabase
      .from("player_game_logs")
      .select("player_id, game_id, pass_attempts, pass_completions, pass_yards, pass_td, pass_int, rush_attempts, rush_yards, rush_td, targets, receptions, rec_yards, rec_td, postseason:raw_data->game->>postseason, team:raw_data->team->>full_name, first_name:raw_data->player->>first_name, last_name:raw_data->player->>last_name")
      .eq("sport", "NFL")
      .eq("season", season)
      .order("week")
      .order("player_id")
      .order("game_id"),
    { label: "fetch season game logs" },
  );
  const regularLogs = logs.filter((l) => l.postseason !== "true");
  const postLogs = logs.filter((l) => l.postseason === "true");
  result.regular.logs = regularLogs.length;
  result.postseason.logs = postLogs.length;

  const schedule: BdlGame[] = await bdlNflFetchAll(apiKey, "/games", [["seasons[]", season]]);
  const scheduleComplete = schedule.filter((g) => !g.postseason).length >= 250;
  const finalPlayoffGames = schedule.filter((g) => g.postseason && isFinalGame(g)).length;
  result.postseason.finalGames = finalPlayoffGames;

  // deno-lint-ignore no-explicit-any
  const upserts: Record<"regular" | "postseason", Record<string, any>[]> = { regular: [], postseason: [] };

  // Regular season: log sums + BDL's official games played
  if (regularLogs.length === 0) {
    result.regular.note = "no game logs for this season; rows left untouched";
  } else {
    const seasonLines: BdlStat[] = await bdlNflFetchAll(apiKey, "/season_stats", [
      ["season", season],
      ["postseason", "false"],
    ]);
    const merged = mergeSeasonLines(logRowsToSeasonLines(regularLogs, bdlById, season), seasonLines);
    result.regular.seasonOnly = merged.seasonOnly;
    for (const line of merged.lines) {
      const playerId = idByBdl.get(String(line.player?.id));
      if (playerId) upserts.regular.push(seasonRow(line, playerId, season, "regular"));
    }
    result.regular.rebuilt = true;
    result.regular.rows = upserts.regular.length;
  }

  // Postseason: stats are log sums (BDL's postseason season lines are
  // unusable). Games played is the official count from ESPN's playoff game
  // rosters, never below the number of logged games: box-score lines alone
  // miss special-teams and backup appearances.
  if (finalPlayoffGames > 0 && postLogs.length === 0) {
    result.postseason.note = "playoff games are final but no playoff logs are stored yet; rows left untouched";
  } else {
    const lines = logRowsToSeasonLines(postLogs, bdlById, season);
    let official = new Map<string, number>();
    if (lines.length) {
      try {
        const rosters = await espnPlayoffRosters(season);
        if (rosters) {
          const players = new Map<string, PostseasonPlayer>();
          for (const l of postLogs) {
            if (!players.has(l.player_id)) players.set(l.player_id, { key: l.player_id, team: l.team, first: l.first_name, last: l.last_name });
          }
          official = officialGamesPlayed(rosters, [...players.values()]);
        } else {
          result.postseason.note = "ESPN playoff rosters unavailable; games played from box scores";
        }
      } catch (err) {
        result.postseason.note = `ESPN playoff rosters failed (${err instanceof Error ? err.message : String(err)}); games played from box scores`;
      }
    }
    result.postseason.officialGpMatched = official.size;
    for (const line of lines) {
      const playerId = idByBdl.get(String(line.player?.id));
      if (!playerId) continue;
      const boxGames = line.games_played ?? 0;
      const gamesPlayed = Math.max(boxGames, official.get(playerId) ?? 0);
      if (gamesPlayed > boxGames) result.postseason.gpRaised++;
      upserts.postseason.push(seasonRow({ ...line, games_played: gamesPlayed }, playerId, season, "postseason"));
    }
    result.postseason.rebuilt = true;
    result.postseason.rows = upserts.postseason.length;
  }

  for (const batch of chunk([...upserts.regular, ...upserts.postseason], 500)) {
    const { error } = await supabase
      .from("player_season_stats")
      .upsert(batch, { onConflict: "player_id,sport,season,season_type", ignoreDuplicates: false });
    if (error) result.errors.push(error.message);
    else result.upserted += batch.length;
  }

  // Prune rows the rebuild did not produce (e.g. the Sep 7-8 2026 BDL glitch
  // that wrote prior-season totals under 2026, or BDL's postseason echoes).
  // Only after every upsert landed, only for a season type that was rebuilt,
  // and only with a complete source, so a partial run can never delete.
  if (opts.prune && result.errors.length === 0) {
    for (const seasonType of ["regular", "postseason"] as const) {
      if (!result[seasonType].rebuilt) continue;
      if (seasonType === "regular" && upserts.regular.length < MIN_ROWS_TO_PRUNE) continue;
      if (seasonType === "postseason" && !scheduleComplete) continue;
      const fresh = new Set<string>(upserts[seasonType].map((r) => r.player_id as string));
      const existing = await selectAll<{ id: string; player_id: string }>(
        () => supabase
          .from("player_season_stats")
          .select("id, player_id")
          .eq("sport", "NFL")
          .eq("season", season)
          .eq("season_type", seasonType)
          .order("id"),
        { label: `fetch ${seasonType} season stat ids` },
      );
      const stale = staleRows(existing, (r) => r.player_id, fresh);
      for (const ids of chunk(stale.map((r) => r.id), 200)) {
        const { error } = await supabase.from("player_season_stats").delete().in("id", ids);
        if (error) result.errors.push(`prune ${seasonType}: ${error.message}`);
        else result.pruned[seasonType] += ids.length;
      }
    }
  }

  return result;
}
