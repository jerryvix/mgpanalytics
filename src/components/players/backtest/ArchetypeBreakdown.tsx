// Archetype-level ADP trend analysis - the flagship insight layer. Pools
// player-seasons by bucket (experience year, draft capital, situation
// change) so sample size, not one player's history, carries the signal.
// Trend styling is gated on MIN_TREND_SAMPLE: under-threshold buckets render
// raw counts with no trend styling, exactly per spec.
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";
import type { PlayerSeasonRow } from "@/hooks/useBacktest";
import {
  summarizeAdp,
  inAdpUniverse,
  type AdpRow,
} from "@/utils/backtestMetrics";
import {
  experienceBucket,
  draftCapitalBucket,
  situationBucket,
} from "@/utils/backtestArchetypes";
import { labelBucket, MIN_TREND_SAMPLE } from "@/utils/backtestTrends";

interface Props {
  rows: PlayerSeasonRow[];
}

const toAdpRow = (r: PlayerSeasonRow): AdpRow => ({
  position: r.position,
  adpPosRank: r.adp_pos_rank,
  finishPosRank: r.finish_pos_rank,
  games: r.games,
});

interface BucketSpec {
  key: string;
  label: string;
  rows: PlayerSeasonRow[];
}

function bucketTable(title: string, note: string, buckets: BucketSpec[], baselineBeatRate: number | null) {
  return (
    <div key={title} className="space-y-1">
      <div className="flex items-baseline gap-2">
        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">{title}</h4>
        <span className="text-[10px] text-muted-foreground font-mono">{note}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-1.5 pr-2">Bucket</th>
              <th className="text-right font-medium py-1.5 px-2">Seasons</th>
              <th className="text-right font-medium py-1.5 px-2">Beat ADP</th>
              <th className="text-right font-medium py-1.5 px-2">Bust</th>
              <th className="text-left font-medium py-1.5 pl-2">Read</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => {
              const s = summarizeAdp(b.rows.map(toAdpRow));
              const isTrend = labelBucket(s.sample) === "trend";
              const delta =
                isTrend && s.beatRate !== null && baselineBeatRate !== null
                  ? s.beatRate - baselineBeatRate
                  : null;
              return (
                <tr key={b.key} className="border-b border-border/40">
                  <td className="py-1.5 pr-2 font-medium text-foreground">{b.label}</td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">{s.sample}</td>
                  {isTrend ? (
                    <>
                      <td
                        className={`py-1.5 px-2 text-right font-mono font-bold tabular-nums ${
                          delta !== null && delta >= 0.05
                            ? "text-terminal-green"
                            : delta !== null && delta <= -0.05
                              ? "text-destructive"
                              : "text-foreground"
                        }`}
                      >
                        {s.beatRate !== null ? `${(s.beatRate * 100).toFixed(0)}%` : "-"}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {s.bustRate !== null ? `${(s.bustRate * 100).toFixed(0)}%` : "-"}
                      </td>
                      <td className="py-1.5 pl-2">
                        {delta !== null && Math.abs(delta) >= 0.05 ? (
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono ${
                              delta > 0
                                ? "border-terminal-green/50 text-terminal-green"
                                : "border-destructive/50 text-destructive"
                            }`}
                          >
                            TREND {delta > 0 ? "+" : ""}
                            {(delta * 100).toFixed(0)} pts vs baseline
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-mono">near baseline</span>
                        )}
                      </td>
                    </>
                  ) : (
                    // Below MIN_TREND_SAMPLE: raw counts only, no trend styling.
                    <td colSpan={3} className="py-1.5 px-2 text-[11px] text-muted-foreground font-mono">
                      beat ADP in {s.beat} of {s.sample} player-seasons (n &lt; {MIN_TREND_SAMPLE} - not a trend)
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ArchetypeBreakdown({ rows }: Props) {
  const universe = rows.filter((r) => inAdpUniverse({ position: r.position, adpPosRank: r.adp_pos_rank }));
  const baseline = summarizeAdp(universe.map(toAdpRow)).beatRate;

  const byExperience: BucketSpec[] = (
    [
      ["year_1", "Year 1 (rookies)"],
      ["year_2", "Year 2"],
      ["year_3", "Year 3"],
      ["veteran", "Veteran (4+)"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    rows: universe.filter((r) => experienceBucket(r.experience_year) === key),
  }));

  const byDraftCapital: BucketSpec[] = (
    [
      ["rounds_1_2", "Rounds 1–2"],
      ["round_3", "Round 3"],
      ["day3_udfa", "Day 3 / UDFA"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    rows: universe.filter((r) => draftCapitalBucket(r.draft_round) === key),
  }));

  const bySituation: BucketSpec[] = (
    [
      ["new_team", "New team"],
      ["same_team", "Same team"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    rows: universe.filter((r) => situationBucket(r.new_team) === key),
  }));

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-5">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-terminal-green" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            Archetype Trends (ADP vs Finish)
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">
          Pooled player-seasons, baseline beat-ADP rate {baseline !== null ? `${(baseline * 100).toFixed(0)}%` : "-"}.
          A bucket earns trend styling only at n ≥ {MIN_TREND_SAMPLE} player-seasons (95% CI within ±14 pts);
          smaller buckets show raw counts.
        </p>

        {bucketTable("Experience Year", "season − rookie season + 1", byExperience, baseline)}
        {bucketTable(
          "Draft Capital",
          "NFL draft round - not ADP. Spec compares Rounds 1–2 vs Day 3/UDFA; Round 3 shown separately.",
          byDraftCapital,
          baseline
        )}
        {bucketTable(
          "Situation Change",
          "modal-team change vs prior season; rookies excluded",
          bySituation,
          baseline
        )}

        <p className="text-[10px] text-muted-foreground font-mono border-t border-border/40 pt-2">
          Role type (bell-cow vs committee, slot vs outside) is a fast-follow: bell-cow needs the nflverse
          snap-count ingest (2012+, pending); slot vs outside additionally needs alignment charting data.
          Not shown rather than approximated.
        </p>
      </CardContent>
    </Card>
  );
}
