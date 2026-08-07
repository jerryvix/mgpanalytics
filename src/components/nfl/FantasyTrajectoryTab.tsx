// Fantasy trajectory analyzer: multi-season PPR positional finishes, per-game
// vs season-total ranks, and prior-season second-half momentum. Data comes
// from the nflverse-backed rank views via useNFLFantasyProfile.
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Flame, Snowflake, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendChart, TrendPoint } from "@/components/ui/TrendChart";
import { useNFLFantasyProfile } from "@/hooks/useNFLFantasyProfile";
import {
  classifyTrend,
  classifyMomentum,
  isTopTenFinish,
  type TrendDirection,
  type MomentumVerdict,
} from "@/utils/fantasyTrends";

// Green marks top-10 finishes only; everything else stays neutral.
const rankTone = (rank: number | null | undefined) =>
  isTopTenFinish(rank) ? "text-terminal-green" : "text-foreground";

interface FantasyTrajectoryTabProps {
  playerName: string;
  position: string;
  teamAbbr?: string | null;
}

const TREND_BADGE: Record<TrendDirection, { label: string; className: string; Icon: typeof TrendingUp }> = {
  ascending: {
    label: "Ascending",
    className: "bg-terminal-green/20 text-terminal-green border-terminal-green/30",
    Icon: TrendingUp,
  },
  descending: {
    label: "Descending",
    className: "bg-terminal-red/20 text-terminal-red border-terminal-red/30",
    Icon: TrendingDown,
  },
  flat: {
    label: "Flat",
    className: "bg-muted/40 text-muted-foreground border-border",
    Icon: Minus,
  },
  insufficient: {
    label: "—",
    className: "bg-muted/40 text-muted-foreground border-border",
    Icon: HelpCircle,
  },
};

const MOMENTUM_BADGE: Record<MomentumVerdict, { label: string; className: string; Icon: typeof Flame }> = {
  strong_closer: {
    label: "Strong Closer",
    className: "bg-terminal-green/20 text-terminal-green border-terminal-green/30",
    Icon: Flame,
  },
  faded: {
    label: "Faded Late",
    className: "bg-terminal-red/20 text-terminal-red border-terminal-red/30",
    Icon: Snowflake,
  },
  steady: {
    label: "Steady",
    className: "bg-muted/40 text-muted-foreground border-border",
    Icon: Minus,
  },
  insufficient: {
    label: "—",
    className: "bg-muted/40 text-muted-foreground border-border",
    Icon: HelpCircle,
  },
};

const fmtRank = (posGroup: string | null, rank: number | null | undefined) =>
  rank == null ? "—" : `${posGroup ?? ""}${rank}`;

const fmtNum = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : v.toFixed(digits);

export function FantasyTrajectoryTab({ playerName, position, teamAbbr }: FantasyTrajectoryTabProps) {
  const { seasons, latestSeason, secondHalf, isLoading, matched } = useNFLFantasyProfile(
    playerName,
    position,
    teamAbbr
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!matched || seasons.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground font-mono">
            No fantasy finish history found for {playerName}.
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Rookies and players outside QB/RB/WR/TE don't have positional finish data.
          </p>
        </CardContent>
      </Card>
    );
  }

  const posGroup = seasons[seasons.length - 1]?.pos_group ?? null;
  const latest = seasons[seasons.length - 1];

  const trend = classifyTrend(
    seasons
      .filter((s) => s.season != null && s.position_rank != null)
      .map((s) => ({ season: s.season!, rank: s.position_rank! }))
  );
  const momentum = classifyMomentum(
    latest?.position_rank,
    secondHalf?.second_half_rank,
    secondHalf?.second_half_games
  );

  const trendBadge = TREND_BADGE[trend];
  const momentumBadge = MOMENTUM_BADGE[momentum];

  // TrendChart plots larger = higher, so plot negative rank (RB1 on top).
  const chartPoints: TrendPoint[] = seasons
    .filter((s) => s.season != null && s.position_rank != null)
    .map((s) => ({
      label: `${s.season} — ${fmtRank(s.pos_group, s.position_rank)} · ${fmtNum(s.total_ppr)} pts (${s.games} gm)`,
      value: -s.position_rank!,
    }));

  const tiles = [
    {
      label: `${latest?.season ?? ""} Finish`,
      node: <span className={rankTone(latest?.position_rank)}>{fmtRank(posGroup, latest?.position_rank)}</span>,
    },
    {
      label: "Per-Game Rank",
      node: <span className={rankTone(latest?.ppg_position_rank)}>{fmtRank(posGroup, latest?.ppg_position_rank)}</span>,
    },
    {
      label: "Trajectory",
      node: (
        <Badge className={`${trendBadge.className} font-mono`}>
          <trendBadge.Icon className="w-3 h-3 mr-1" />
          {trendBadge.label}
        </Badge>
      ),
    },
    {
      label: "2nd-Half Form",
      node: (
        <Badge className={`${momentumBadge.className} font-mono`}>
          <momentumBadge.Icon className="w-3 h-3 mr-1" />
          {momentumBadge.label}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Verdict tiles */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        {tiles.map((t) => (
          <Card key={t.label} className="bg-card border-border">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                {t.label}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums flex items-center justify-center min-h-7">
                {t.node}
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Trajectory chart */}
      {chartPoints.length >= 2 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground mb-1">
                Positional Finish Trajectory
              </h2>
              <p className="text-[11px] text-muted-foreground mb-2">
                Season-end PPR finish at {posGroup} — higher on the chart is a better finish.
              </p>
              <TrendChart points={chartPoints} yFmt={(v) => `#${Math.round(-v)}`} />
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground font-mono">
              Not enough history for a trajectory — {seasons.length === 1 ? "only one ranked season" : "no ranked seasons"} yet.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Season-by-season table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground px-4 py-3 border-b border-border">
              Season Finishes
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left font-medium px-4 py-2">Season</th>
                    <th className="text-left font-medium px-2 py-2">Team</th>
                    <th className="text-right font-medium px-2 py-2">Finish</th>
                    <th className="text-right font-medium px-2 py-2">PPR Pts</th>
                    <th className="text-right font-medium px-2 py-2">/Gm Rank</th>
                    <th className="text-right font-medium px-2 py-2">PPG</th>
                    <th className="text-right font-medium px-4 py-2">G</th>
                  </tr>
                </thead>
                <tbody>
                  {[...seasons].reverse().map((s, i) => (
                    <tr key={s.season} className={`border-b border-border/50 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{s.season}</td>
                      <td className="px-2 py-2 font-mono">{s.team ?? "—"}</td>
                      <td className={`px-2 py-2 text-right font-mono tabular-nums font-bold ${rankTone(s.position_rank)}`}>
                        {fmtRank(s.pos_group, s.position_rank)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtNum(s.total_ppr)}</td>
                      <td className={`px-2 py-2 text-right font-mono tabular-nums ${rankTone(s.ppg_position_rank)}`}>
                        {fmtRank(s.pos_group, s.ppg_position_rank)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtNum(s.ppg_ppr)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{s.games ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground px-4 py-2">
              Per-game rank counts seasons with 6+ games — it separates a player's level from their availability.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Second-half momentum */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground mb-1">
              {latestSeason} Closing Stretch
            </h2>
            <p className="text-[11px] text-muted-foreground mb-3">
              Weeks 10–18 positional rank vs. the full-season finish — a strong close is a leading
              indicator for the following year.
            </p>
            {secondHalf ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Full Season
                  </div>
                  <div className={`text-lg font-bold font-mono tabular-nums ${rankTone(latest?.position_rank)}`}>
                    {fmtRank(posGroup, latest?.position_rank)}
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Weeks 10–18
                  </div>
                  <div className={`text-lg font-bold font-mono tabular-nums ${rankTone(secondHalf.second_half_rank)}`}>
                    {fmtRank(posGroup, secondHalf.second_half_rank)}
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    2H PPG
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums">
                    {fmtNum(secondHalf.second_half_ppg)}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      ({secondHalf.second_half_games} gm)
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground font-mono">
                No weeks 10–18 data for {latestSeason}.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <p className="text-[11px] text-muted-foreground">
        PPR finishes computed from nflverse official scoring, {seasons[0]?.season}–{latestSeason}.
      </p>
    </div>
  );
}
