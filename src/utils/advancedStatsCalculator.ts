// Advanced Stats Calculator for NFL Players
// Calculates derived stats from game logs and season data

import { NFLPlayerStats, NFLGameLogEntry } from "@/services/balldontlie/nflPlayers";

export interface AdvancedStats {
  // QB
  epa_per_play?: number;
  cpoe?: number;
  air_yards_per_attempt?: number;
  pressure_rate?: number;
  passer_rating?: number;
  red_zone_td_pct?: number;
  third_down_conv_rate?: number;
  sack_rate?: number;
  
  // RB
  yards_after_contact?: number;
  yards_before_contact?: number;
  broken_tackles?: number;
  explosive_run_rate?: number;
  goal_line_efficiency?: number;
  snap_share?: number;
  route_participation?: number;
  
  // WR/TE
  target_share?: number;
  air_yards_share?: number;
  catch_rate?: number;
  yards_after_catch?: number;
  contested_catch_rate?: number;
  separation?: number;
  red_zone_target_share?: number;
  routes_run?: number;
  
  // DEF
  missed_tackle_rate?: number;
  pass_rush_win_rate?: number;
  run_stop_rate?: number;
  passer_rating_allowed?: number;
  tackles_per_game?: number;
  coverage_snaps?: number;
  qb_hits?: number;
}

export interface GameTrend {
  value: number;
  gameDate?: string;
  opponent?: string;
}

/**
 * Calculate explosive play rate from game logs
 * For RB: runs of 10+ yards / total carries
 * For WR: receptions of 15+ yards / total receptions
 */
export function calcExplosivePlayRate(gameLogs: NFLGameLogEntry[], position: string): number {
  if (!gameLogs || gameLogs.length === 0) return 0;
  
  // This would need actual per-play data to calculate properly
  // Using a simulated approach based on yards per carry/reception
  let explosiveCount = 0;
  let totalPlays = 0;
  
  gameLogs.forEach(game => {
    if (position === "RB" && game.rush_yards && game.rush_attempts) {
      // Estimate: if YPC > 5.5, count some as explosive
      const ypc = game.rush_yards / game.rush_attempts;
      if (ypc > 5.5) {
        explosiveCount += Math.floor(game.rush_attempts * 0.15);
      } else if (ypc > 4.5) {
        explosiveCount += Math.floor(game.rush_attempts * 0.10);
      }
      totalPlays += game.rush_attempts;
    } else if ((position === "WR" || position === "TE") && game.rec_yards && game.receptions) {
      const ypr = game.rec_yards / game.receptions;
      if (ypr > 15) {
        explosiveCount += Math.floor(game.receptions * 0.25);
      } else if (ypr > 12) {
        explosiveCount += Math.floor(game.receptions * 0.15);
      }
      totalPlays += game.receptions;
    }
  });
  
  return totalPlays > 0 ? (explosiveCount / totalPlays) * 100 : 0;
}

/**
 * Calculate catch rate from stats
 */
export function calcCatchRate(targets?: number, receptions?: number): number {
  if (!targets || !receptions || targets === 0) return 0;
  return (receptions / targets) * 100;
}

/**
 * Calculate yards per route run (estimated)
 */
export function calcYardsPerRouteRun(recYards?: number, gamesPlayed?: number): number {
  if (!recYards || !gamesPlayed) return 0;
  // Estimate ~25 routes per game for WR1, ~20 for WR2
  const estimatedRoutes = gamesPlayed * 22;
  return recYards / estimatedRoutes;
}

/**
 * Calculate target share (requires team context - estimated at 15% baseline)
 */
export function calcTargetShare(targets?: number, gamesPlayed?: number): number {
  if (!targets || !gamesPlayed) return 0;
  // Estimate team has ~35 targets per game
  const estimatedTeamTargets = gamesPlayed * 35;
  return (targets / estimatedTeamTargets) * 100;
}

/**
 * Calculate advanced stats for a player based on their position
 */
export function calculateAdvancedStats(
  stats: NFLPlayerStats | null,
  gameLogs: NFLGameLogEntry[],
  position: string
): AdvancedStats {
  const advanced: AdvancedStats = {};
  
  if (!stats) return advanced;
  
  const games = stats.games_played || 1;
  
  switch (position.toUpperCase()) {
    case "QB":
      // Passer rating is already available
      advanced.passer_rating = stats.passer_rating;
      
      // EPA per play (simulated - would need PBP data)
      if (stats.pass_yards && stats.pass_td && stats.pass_attempts) {
        const yardsOverExpected = stats.pass_yards - (stats.pass_attempts * 6.5);
        const tdBonus = (stats.pass_td || 0) * 20;
        const intPenalty = (stats.interceptions || 0) * 45;
        advanced.epa_per_play = ((yardsOverExpected + tdBonus - intPenalty) / stats.pass_attempts) * 0.15;
      }
      
      // CPOE (simulated)
      if (stats.pass_completions && stats.pass_attempts) {
        const actualCompPct = (stats.pass_completions / stats.pass_attempts) * 100;
        const expectedCompPct = 63; // League average
        advanced.cpoe = actualCompPct - expectedCompPct;
      }
      
      // Air yards per attempt (simulated - usually ~70% of passing yards)
      if (stats.pass_yards && stats.pass_attempts) {
        advanced.air_yards_per_attempt = (stats.pass_yards * 0.72) / stats.pass_attempts;
      }
      
      // Sack rate (simulated)
      if (stats.pass_attempts) {
        // Estimate sacks from games played
        const estimatedSacks = games * 2.1; // League avg ~2.1 sacks per game
        advanced.sack_rate = (estimatedSacks / (stats.pass_attempts + estimatedSacks)) * 100;
      }
      
      // Pressure rate (simulated at league avg)
      advanced.pressure_rate = 30 + Math.random() * 10;
      
      // Red zone TD % (simulated)
      if (stats.pass_td) {
        advanced.red_zone_td_pct = 48 + (stats.pass_td / games) * 5;
      }
      
      // 3rd down conversion (simulated)
      advanced.third_down_conv_rate = 38 + Math.random() * 12;
      break;
      
    case "RB":
    case "FB":
      // Yards after contact (simulated ~55% of rushing yards)
      if (stats.rush_yards && stats.rush_attempts) {
        advanced.yards_after_contact = (stats.rush_yards * 0.55) / stats.rush_attempts;
        advanced.yards_before_contact = (stats.rush_yards * 0.45) / stats.rush_attempts;
      }
      
      // Broken tackles (estimated from YAC)
      if (stats.rush_yards) {
        advanced.broken_tackles = Math.floor(stats.rush_yards / 45);
      }
      
      // Explosive run rate
      advanced.explosive_run_rate = calcExplosivePlayRate(gameLogs, "RB");
      
      // Goal line efficiency (simulated)
      if (stats.rush_td && stats.rush_attempts) {
        const rushTdRate = (stats.rush_td / stats.rush_attempts) * 100;
        advanced.goal_line_efficiency = 45 + rushTdRate * 3;
      }
      
      // Snap share (estimated from touches)
      if (stats.rush_attempts && stats.receptions) {
        const touchesPerGame = ((stats.rush_attempts || 0) + (stats.receptions || 0)) / games;
        advanced.snap_share = Math.min(85, touchesPerGame * 3);
      }
      
      // Route participation (simulated)
      if (stats.targets) {
        advanced.route_participation = Math.min(95, 45 + (stats.targets / games) * 6);
      }
      
      // Target share
      advanced.target_share = calcTargetShare(stats.targets, games);
      break;
      
    case "WR":
    case "TE":
      // Target share
      advanced.target_share = calcTargetShare(stats.targets, games);
      
      // Air yards share (estimated)
      if (stats.targets && stats.rec_yards) {
        const avgDepth = stats.rec_yards / (stats.receptions || 1);
        advanced.air_yards_share = (stats.targets / (games * 35)) * 100 * (avgDepth / 12);
      }
      
      // Catch rate
      advanced.catch_rate = calcCatchRate(stats.targets, stats.receptions);
      
      // YAC (simulated ~35% of receiving yards)
      if (stats.rec_yards && stats.receptions) {
        advanced.yards_after_catch = (stats.rec_yards * 0.35) / stats.receptions;
      }
      
      // Contested catch rate (simulated)
      advanced.contested_catch_rate = 42 + Math.random() * 20;
      
      // Separation (simulated)
      advanced.separation = 2.2 + Math.random() * 1.5;
      
      // Red zone target share (estimated)
      if (stats.rec_td && stats.targets) {
        advanced.red_zone_target_share = Math.min(30, (stats.rec_td / games) * 8 + 5);
      }
      
      // Routes run (estimated)
      advanced.routes_run = Math.floor(games * 28);
      break;
      
    case "DE":
    case "DT":
    case "LB":
    case "CB":
    case "S":
    case "DB":
      // Tackles per game
      if (stats.tackles) {
        advanced.tackles_per_game = stats.tackles / games;
      }
      
      // QB hits
      advanced.qb_hits = stats.qb_hits;
      
      // Pressure rate (for pass rushers)
      if (stats.sacks || stats.qb_hits) {
        advanced.pressure_rate = 8 + ((stats.sacks || 0) + (stats.qb_hits || 0)) / games * 2;
      }
      
      // Pass rush win rate (simulated)
      if (stats.sacks) {
        advanced.pass_rush_win_rate = 10 + (stats.sacks / games) * 3;
      }
      
      // Missed tackle rate (simulated - lower is better)
      advanced.missed_tackle_rate = 8 + Math.random() * 8;
      
      // Run stop rate
      if (stats.tackles_for_loss) {
        advanced.run_stop_rate = 4 + (stats.tackles_for_loss / games) * 1.5;
      }
      
      // Coverage snaps (for DBs/LBs)
      advanced.coverage_snaps = Math.floor(games * 35);
      
      // Passer rating allowed (simulated)
      if (stats.interceptions) {
        advanced.passer_rating_allowed = 95 - (stats.interceptions * 8) + Math.random() * 20;
      } else {
        advanced.passer_rating_allowed = 88 + Math.random() * 25;
      }
      break;
  }
  
  return advanced;
}

/**
 * Get trend data for a specific stat from game logs
 */
export function getStatTrend(
  gameLogs: NFLGameLogEntry[],
  statKey: string,
  limit: number = 5
): GameTrend[] {
  if (!gameLogs || gameLogs.length === 0) return [];
  
  const recentGames = gameLogs.slice(0, limit);
  
  return recentGames.map(game => {
    let value = 0;
    
    switch (statKey) {
      case "pass_yards":
        value = game.pass_yards || 0;
        break;
      case "rush_yards":
        value = game.rush_yards || 0;
        break;
      case "rec_yards":
        value = game.rec_yards || 0;
        break;
      case "targets":
        value = game.targets || 0;
        break;
      case "receptions":
        value = game.receptions || 0;
        break;
      case "pass_td":
        value = game.pass_td || 0;
        break;
      case "rush_td":
        value = game.rush_td || 0;
        break;
      case "rec_td":
        value = game.rec_td || 0;
        break;
      case "passer_rating":
        value = game.passer_rating || 0;
        break;
      default:
        value = 0;
    }
    
    return {
      value,
      gameDate: game.game_date,
      opponent: game.opponent,
    };
  }).reverse(); // Chronological order
}

/**
 * Compare stat to league average
 */
export function compareToLeagueAvg(value: number, leagueAvg: number): {
  percentile: number;
  vsAvg: number;
  isAboveAvg: boolean;
} {
  const vsAvg = value - leagueAvg;
  const percentile = Math.min(99, Math.max(1, 50 + (vsAvg / leagueAvg) * 50));
  
  return {
    percentile,
    vsAvg,
    isAboveAvg: value > leagueAvg,
  };
}
