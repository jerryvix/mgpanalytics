// Biggest Misses leaderboard (Tier 3) - a derived view over the graded
// Tier 1 data for the last completed season. Healthy seasons only: players
// who missed significant time (or never played) are excluded outright as
// forecasting noise (owner call, Aug 2026 - the old "Injury outliers" toggle
// was removed; isHealthySeason in backtestMetrics still draws the line).
// Every magnitude is a signed number: positive/green = outperformed,
// negative/red = underperformed. Win totals have no injury dimension and
// render as a full two-column list (exceeded vs missed).
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TrendingDown, ChevronDown, ChevronRight } from "lucide-react";
import type { PlayerSeasonRow, PropResultRow, WinTotalResultRow } from "@/hooks/useBacktest";
import {
  isHealthySeason,
  inAdpUniverse,
  adpSpotDelta,
  propMissMagnitude,
  winTotalMissMagnitude,
} from "@/utils/backtestMetrics";

interface Props {
  playerSeasons: PlayerSeasonRow[];
  props: PropResultRow[];
  winTotals: WinTotalResultRow[];
  lastCompleted: number;
}

interface MissRow {
  key: string;
  label: string;
  detail: string;
  /** Signed; positive = beat/exceeded (green), negative = missed (red). */
  value: number;
}

const LIST_LIMIT = 20;

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left group">
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground group-hover:text-terminal-green transition-colors">
          {title}
        </h4>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function BiggestMisses({ playerSeasons, props, winTotals, lastCompleted }: Props) {
  // --- ADP: biggest beats AND busts vs draft slot (signed spot delta)
  const adpRows: MissRow[] = [];
  for (const r of playerSeasons) {
    if (r.season !== lastCompleted) continue;
    if (!inAdpUniverse({ position: r.position, adpPosRank: r.adp_pos_rank })) continue;
    if (!isHealthySeason(r.games, r.season)) continue; // injury noise excluded
    const delta = adpSpotDelta({
      position: r.position,
      adpPosRank: r.adp_pos_rank,
      finishPosRank: r.finish_pos_rank,
      games: r.games,
    });
    if (delta === null) continue;
    adpRows.push({
      key: `adp-${r.gsis_id}`,
      label: `${r.player_name} (${r.position})`,
      detail: `drafted ${r.position}${r.adp_pos_rank}, finished ${r.position}${r.finish_pos_rank} (${r.games ?? 0} gms)`,
      value: delta,
    });
  }

  // --- Props: biggest overs AND unders (signed % deviation from the line)
  const propRows: MissRow[] = [];
  for (const p of props) {
    if (p.season !== lastCompleted) continue;
    if (p.result !== "over" && p.result !== "under") continue;
    if (!isHealthySeason(p.games_played, p.season)) continue; // injury noise excluded
    const magnitude = propMissMagnitude({ actual: p.actual, line: p.line });
    if (magnitude === null) continue;
    const signed = p.result === "over" ? magnitude : -magnitude;
    propRows.push({
      key: `prop-${p.subject_name}-${p.market}`,
      label: `${p.subject_name}, ${p.market.replace(/_/g, " ")}`,
      detail: `line ${p.line}, actual ${p.actual} (${p.games_played ?? "?"} gms)`,
      value: signed * 100,
    });
  }

  // --- Win totals: every graded team, split into exceeded vs missed
  const winBeats: MissRow[] = [];
  const winMisses: MissRow[] = [];
  for (const w of winTotals) {
    if (w.season !== lastCompleted) continue;
    if (w.result !== "over" && w.result !== "under") continue;
    const magnitude = winTotalMissMagnitude({ actual: w.actual, line: w.line });
    if (magnitude === null) continue;
    const signed = w.result === "over" ? magnitude : -magnitude;
    const row: MissRow = {
      key: `win-${w.team_abbr}`,
      label: w.subject_name,
      detail: `line ${w.line}, won ${w.actual}`,
      value: signed,
    };
    (signed >= 0 ? winBeats : winMisses).push(row);
  }
  winBeats.sort((a, b) => b.value - a.value);
  winMisses.sort((a, b) => a.value - b.value);

  // Split every source the same way as win totals: beats on the left,
  // misses on the right, each capped at LIST_LIMIT.
  const adpBeats = adpRows.filter((r) => r.value >= 0).sort((a, b) => b.value - a.value).slice(0, LIST_LIMIT);
  const adpMisses = adpRows.filter((r) => r.value < 0).sort((a, b) => a.value - b.value).slice(0, LIST_LIMIT);
  const propBeats = propRows.filter((r) => r.value >= 0).sort((a, b) => b.value - a.value).slice(0, LIST_LIMIT);
  const propMisses = propRows.filter((r) => r.value < 0).sort((a, b) => a.value - b.value).slice(0, LIST_LIMIT);

  const missList = (title: string, rows: MissRow[], formatMag: (abs: number) => string) => (
    <div className="space-y-1">
      <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground font-mono">no qualifying results</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-baseline justify-between gap-2 text-sm border-b border-border/30 pb-1">
              <span>
                <span className="font-mono text-muted-foreground text-xs mr-2">{i + 1}.</span>
                <span className="font-medium text-foreground">{r.label}</span>
                <span className="text-[11px] text-muted-foreground font-mono ml-2">{r.detail}</span>
              </span>
              <span
                className={`font-mono font-bold tabular-nums shrink-0 ${
                  r.value < 0 ? "text-destructive" : "text-terminal-green"
                }`}
              >
                {`${r.value >= 0 ? "+" : "-"}${formatMag(Math.abs(r.value))}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-destructive" />
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            Biggest Market Movers
          </h3>
        </div>

        <p className="text-[11px] text-muted-foreground font-mono">
          Beats on the left, misses on the right. Healthy seasons only; players who missed significant time
          are excluded as forecasting noise.
        </p>

        <div className="border-t border-border/40 pt-3">
          <CollapsibleSection title="ADP Movers (Draft Slot vs Finish)">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {missList("Beat ADP", adpBeats, (n) => `${Math.round(n)}`)}
              {missList("Missed ADP", adpMisses, (n) => `${Math.round(n)}`)}
            </div>
          </CollapsibleSection>
        </div>

        <div className="border-t border-border/40 pt-3">
          <CollapsibleSection title="Season Prop Results">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {missList("Beat The Line", propBeats, (n) => `${n.toFixed(0)}%`)}
              {missList("Fell Short", propMisses, (n) => `${n.toFixed(0)}%`)}
            </div>
          </CollapsibleSection>
        </div>

        <div className="border-t border-border/40 pt-3">
          <CollapsibleSection title="Team Win Total Differential (Prior Year)">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {missList("Exceeded Total", winBeats, (n) => `${n.toFixed(1)} W`)}
              {missList("Missed Total", winMisses, (n) => `${n.toFixed(1)} W`)}
            </div>
          </CollapsibleSection>
        </div>
      </CardContent>
    </Card>
  );
}
