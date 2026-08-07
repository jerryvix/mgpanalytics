// Biggest Misses leaderboard (Tier 3) - a derived view over the graded
// Tier 1 data for the last completed season. Two player views:
//   Healthy-season misses (default): played ~a full season - the real
//     market signal, both the biggest beats and the biggest busts.
//   Injury outliers: missed significant time (or never played) - context,
//     not a conclusion. "Did not play" ADP rows are pinned here.
// Every magnitude is a signed number: positive/green = outperformed,
// negative/red = underperformed. Win totals have no injury dimension and
// render as a full two-column list (exceeded vs missed) instead.
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
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

type MissView = "healthy" | "injury";

interface MissRow {
  key: string;
  label: string;
  detail: string;
  /** Signed; positive = beat/exceeded (green), negative = missed (red). */
  value: number;
  isDnp?: boolean;
}

const LIST_LIMIT = 20;

function sortKey(r: MissRow): number {
  return r.isDnp ? Number.POSITIVE_INFINITY : Math.abs(r.value);
}

export function BiggestMisses({ playerSeasons, props, winTotals, lastCompleted }: Props) {
  const [view, setView] = useState<MissView>("healthy");

  // --- ADP: biggest beats AND busts vs draft slot (signed spot delta)
  const adpRows: { row: MissRow; healthy: boolean }[] = [];
  for (const r of playerSeasons) {
    if (r.season !== lastCompleted) continue;
    if (!inAdpUniverse({ position: r.position, adpPosRank: r.adp_pos_rank })) continue;
    if (r.finish_pos_rank === null) {
      adpRows.push({
        healthy: false, // did-not-play is injury-list by definition
        row: {
          key: `adp-${r.gsis_id}`,
          label: `${r.player_name} (${r.position}${r.adp_pos_rank})`,
          detail: `drafted ${r.position}${r.adp_pos_rank}, did not play`,
          value: 0,
          isDnp: true,
        },
      });
      continue;
    }
    const delta = adpSpotDelta({
      position: r.position,
      adpPosRank: r.adp_pos_rank,
      finishPosRank: r.finish_pos_rank,
      games: r.games,
    });
    if (delta === null) continue;
    adpRows.push({
      healthy: isHealthySeason(r.games, r.season),
      row: {
        key: `adp-${r.gsis_id}`,
        label: `${r.player_name} (${r.position})`,
        detail: `drafted ${r.position}${r.adp_pos_rank}, finished ${r.position}${r.finish_pos_rank} (${r.games ?? 0} gms)`,
        value: delta,
      },
    });
  }

  // --- Props: biggest overs AND unders (signed % deviation from the line)
  const propRows: { row: MissRow; healthy: boolean }[] = [];
  for (const p of props) {
    if (p.season !== lastCompleted) continue;
    if (p.result !== "over" && p.result !== "under") continue;
    const magnitude = propMissMagnitude({ actual: p.actual, line: p.line });
    if (magnitude === null) continue;
    const signed = p.result === "over" ? magnitude : -magnitude;
    propRows.push({
      healthy: isHealthySeason(p.games_played, p.season),
      row: {
        key: `prop-${p.subject_name}-${p.market}`,
        label: `${p.subject_name}, ${p.market.replace(/_/g, " ")}`,
        detail: `line ${p.line}, actual ${p.actual} (${p.games_played ?? "?"} gms)`,
        value: signed * 100,
      },
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

  const pick = (list: { row: MissRow; healthy: boolean }[]) =>
    list
      .filter((m) => (view === "healthy" ? m.healthy : !m.healthy))
      .map((m) => m.row)
      .sort((x, y) => sortKey(y) - sortKey(x))
      .slice(0, LIST_LIMIT);

  const missList = (title: string, rows: MissRow[], formatMag: (abs: number) => string) => (
    <div className="space-y-1">
      <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground font-mono">none in this view</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => {
            const negative = r.isDnp || r.value < 0;
            const text = r.isDnp ? "DNP" : `${r.value >= 0 ? "+" : "-"}${formatMag(Math.abs(r.value))}`;
            return (
              <li key={r.key} className="flex items-baseline justify-between gap-2 text-sm border-b border-border/30 pb-1">
                <span>
                  <span className="font-mono text-muted-foreground text-xs mr-2">{i + 1}.</span>
                  <span className="font-medium text-foreground">{r.label}</span>
                  <span className="text-[11px] text-muted-foreground font-mono ml-2">{r.detail}</span>
                </span>
                <span
                  className={`font-mono font-bold tabular-nums shrink-0 ${
                    negative ? "text-destructive" : "text-terminal-green"
                  }`}
                >
                  {text}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
              {lastCompleted} Biggest Misses
            </h3>
          </div>
          <div className="flex gap-1">
            {(
              [
                ["healthy", "Healthy-season misses"],
                ["injury", "Injury outliers"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                  key === view
                    ? "bg-terminal-green/20 text-terminal-green border-terminal-green/40"
                    : "bg-muted/30 text-muted-foreground border-border hover:border-terminal-green/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground font-mono">
          {view === "healthy"
            ? "Played close to a full season, the biggest beats and busts against ADP, and the largest prop overs/unders. This is the signal view."
            : "Missed significant time (or never played). Context only, do not draw market conclusions here."}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {missList(`ADP Movers, Draft Slot vs Finish (top ${LIST_LIMIT})`, pick(adpRows), (n) => `${Math.round(n)}`)}
          {missList(`Prop Overs & Unders (top ${LIST_LIMIT})`, pick(propRows), (n) => `${n.toFixed(0)}%`)}
        </div>

        <div className="border-t border-border/40 pt-3 space-y-2">
          <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
            Team Win Total Differential (Prior Year)
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {missList("Exceeded Total", winBeats, (n) => `${n.toFixed(1)} W`)}
            {missList("Missed Total", winMisses, (n) => `${n.toFixed(1)} W`)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
