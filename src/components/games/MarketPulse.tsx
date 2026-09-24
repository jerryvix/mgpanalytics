import { useState } from "react";
import { Activity, Crosshair, RotateCw, Undo2, Users, type LucideIcon } from "lucide-react";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { NCAAF_TEAM_IDS } from "@/data/ncaafTeamIds";
import { cn } from "@/lib/utils";
import {
  agoLabel,
  openToNow,
  PUBLIC_BETS_PCT,
  PULSE_MARKETS,
  SHARP_EDGE_PTS,
  SPLITS_SPORTS,
  type PulseMarket,
  type PulseMarketView,
  type PulseSideView,
} from "@/lib/marketPulse";
import type { MarketPulseState } from "@/hooks/useMarketPulse";

// Market Pulse - Game Insights' market section: DraftKings' number for each
// market with its move since DK opened it, where the bets and the money sit,
// and three markers computed from that data alone. One line source (see
// lib/marketPulse.ts); the sheet's Market Read uses the same moneyline.
// Sports without a synced split (MLB) and games DK hasn't posted a split for
// show just the line: no bars, no markers.

interface MarketPulseProps {
  sport: string;
  awayName: string;
  homeName: string;
  /** "Spread", or "Run Line" for MLB */
  spreadLabel: string;
  state: MarketPulseState;
}

const fmtPrice = (v: number | null) => (v === null ? null : v > 0 ? `+${v}` : `${v}`);
const fmtSpread = (v: number | null) => (v === null ? "-" : v === 0 ? "PK" : v > 0 ? `+${v}` : `${v}`);

interface MarkerDef {
  key: "sharp" | "public" | "reverse";
  icon: LucideIcon;
  label: string;
  meaning: string;
  lit: (s: PulseSideView) => boolean;
  litClass: string;
}

const MARKERS: MarkerDef[] = [
  {
    key: "sharp",
    icon: Crosshair,
    label: "Sharp money",
    meaning: `Under 50% of the bets but over 50% of the money, with at least ${SHARP_EDGE_PTS} more points of money than bets.`,
    lit: (s) => s.sharp,
    litClass: "border-terminal-green/60 bg-terminal-green/15 text-terminal-green",
  },
  {
    key: "public",
    icon: Users,
    label: "Public side",
    meaning: `${PUBLIC_BETS_PCT}% or more of all bets are on this side.`,
    lit: (s) => s.publicSide,
    litClass: "border-terminal-amber/60 bg-terminal-amber/15 text-terminal-amber",
  },
  {
    key: "reverse",
    icon: Undo2,
    label: "Reverse move",
    meaning: `Since DraftKings opened it, the line moved toward this side even though ${PUBLIC_BETS_PCT}%+ of the bets are on the other side.`,
    lit: (s) => s.reverseMove,
    litClass: "border-terminal-green/60 bg-terminal-green/15 text-terminal-green",
  },
];

export function MarketPulse({ sport, awayName, homeName, spreadLabel, state }: MarketPulseProps) {
  const { pulse, isLoading, isError, refetch } = state;
  const available = pulse ? PULSE_MARKETS.filter((m) => pulse[m]) : [];
  const [picked, setPicked] = useState<PulseMarket | null>(null);
  const market = picked && pulse?.[picked] ? picked : available[0] ?? null;
  const view = market && pulse ? pulse[market] : null;

  const labels: Record<PulseMarket, string> = { spread: spreadLabel, total: "Total", moneyline: "Moneyline" };
  const anySplits = PULSE_MARKETS.some((m) => pulse?.[m]?.hasSplits);

  return (
    <section>
      <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest mb-2 text-terminal-amber">
        <Activity className="w-3.5 h-3.5" /> Market Pulse
      </div>

      {isError ? (
        // A failed read is not an empty market: never show the empty-state copy here
        <div className="flex items-center justify-between gap-3 border border-border rounded-lg p-3 bg-card/50 font-mono text-xs text-muted-foreground">
          <span>Couldn't load DraftKings data.</span>
          <button
            type="button"
            onClick={refetch}
            className="flex items-center gap-1 text-foreground hover:text-terminal-green shrink-0"
          >
            <RotateCw className="w-3 h-3" /> Retry
          </button>
        </div>
      ) : isLoading || !pulse ? (
        <Skeleton className="h-40 w-full" />
      ) : !view ? (
        <p className="text-xs text-muted-foreground font-mono border border-border rounded-lg p-4 bg-card/50">
          No DraftKings line posted for this game yet. Lines post through the week.
        </p>
      ) : (
        <div className="border border-border rounded-lg bg-card/50">
          <div role="tablist" aria-label="Market" className="grid grid-cols-3 gap-0.5 m-2 p-0.5 rounded-md bg-muted/50">
            {PULSE_MARKETS.map((m) => {
              const on = m === market;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  disabled={!pulse[m]}
                  onClick={() => setPicked(m)}
                  className={cn(
                    "h-7 rounded font-mono text-[11px] uppercase tracking-wider transition-colors",
                    on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    !pulse[m] && "opacity-40 pointer-events-none",
                  )}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          <div className="px-3 divide-y divide-border/60">
            {view.sides.map((s) => (
              <SideRow key={s.side} sport={sport} view={view} side={s} awayName={awayName} homeName={homeName} />
            ))}
          </div>

          <MarketFooter
            view={view}
            awayName={awayName}
            splitsEnabled={SPLITS_SPORTS.has(sport)}
            anySplits={anySplits}
          />
        </div>
      )}
    </section>
  );
}

function SideRow({
  sport,
  view,
  side,
  awayName,
  homeName,
}: {
  sport: string;
  view: PulseMarketView;
  side: PulseSideView;
  awayName: string;
  homeName: string;
}) {
  const team = side.side === "away" ? awayName : side.side === "home" ? homeName : null;
  const name = team ?? (side.side === "over" ? "Over" : "Under");
  const main =
    view.market === "moneyline"
      ? fmtPrice(side.price) ?? "-"
      : view.market === "spread"
        ? fmtSpread(side.line)
        : `${side.line ?? "-"}`;
  // Prices show only as a pair: one side priced and the other blank reads as broken
  const pricedPair = view.sides.every((s) => s.price !== null);
  const price = view.market === "moneyline" || !pricedPair ? null : fmtPrice(side.price);
  const markers = MARKERS.filter((m) => m.key !== "reverse" || view.hasOpen);

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        {team && (
          <TeamLogo sport={sport} name={team} espnId={sport === "NCAAF" ? NCAAF_TEAM_IDS[team] : undefined} size={16} />
        )}
        <span className="text-[13px] truncate flex-1 min-w-0" title={name}>
          {name}
        </span>
        <span className="font-mono text-sm font-bold tabular-nums">{main}</span>
        {price && <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-9 text-right">{price}</span>}
      </div>

      {view.hasSplits && (
        <div className="mt-2 flex items-center gap-3">
          <div className="flex gap-1 shrink-0" aria-label="Market markers">
            {markers.map((m) => {
              const on = !view.thin && m.lit(side);
              const Icon = m.icon;
              return (
                <span
                  key={m.key}
                  role="img"
                  aria-label={`${m.label}: ${on ? "yes" : "no"}`}
                  title={`${m.label}${on ? "" : " (not on this side)"}: ${m.meaning}`}
                  className={cn(
                    "w-6 h-6 rounded-md border flex items-center justify-center",
                    on ? m.litClass : "border-border/70 text-muted-foreground/35",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
              );
            })}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <SplitBar label="Bets" pct={side.betsPct} className="bg-foreground/45" />
            <SplitBar label="Money" pct={side.handlePct} className="bg-terminal-green/80" />
          </div>
        </div>
      )}
    </div>
  );
}

function SplitBar({ label, pct, className }: { label: string; pct: number | null; className: string }) {
  if (pct === null) return null;
  return (
    <div className="grid grid-cols-[40px_1fr_30px] items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-right">{pct}%</span>
    </div>
  );
}

function MarketFooter({
  view,
  awayName,
  splitsEnabled,
  anySplits,
}: {
  view: PulseMarketView;
  awayName: string;
  splitsEnabled: boolean;
  anySplits: boolean;
}) {
  const move = openToNow(view);
  const whose = view.market === "spread" ? ` · ${awayName}` : view.market === "moneyline" ? " · away / home" : "";
  const lineAgo = agoLabel(view.lineAsOf);
  const splitAgo = view.hasSplits ? agoLabel(view.splitsAsOf) : null;
  const stamp = [lineAgo ? `line updated ${lineAgo}` : null, splitAgo ? `split ${splitAgo}` : null].filter(Boolean).join(" · ");
  const markers = MARKERS.filter((m) => m.key !== "reverse" || view.hasOpen);

  return (
    <div className="px-3 pb-3 pt-1 space-y-2 font-mono text-[10px] text-muted-foreground">
      {move && (
        <p className="tabular-nums truncate text-foreground/80" title={`${move}${whose}`}>
          {move}
          <span className="text-muted-foreground">{whose}</span>
        </p>
      )}

      {view.lineSource === null && <p>DraftKings' line isn't stored for this market yet; the split is below.</p>}
      {view.thin && (
        <p>Light, one-sided action so far (a side at 0% of the bets or the money): markers stay off until both sides draw action.</p>
      )}
      {!view.hasSplits && splitsEnabled && (
        <p>{anySplits ? "No public split on this market yet." : "DraftKings hasn't posted a public split for this game yet."}</p>
      )}

      {view.hasSplits && (
        <details className="group">
          <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            {markers.map((m) => (
              <span key={m.key} className="inline-flex items-center gap-1">
                <m.icon className="w-3 h-3" /> {m.label}
              </span>
            ))}
            <span className="underline decoration-dotted underline-offset-2 group-open:hidden">what these mean</span>
          </summary>
          <ul className="mt-1.5 space-y-1 leading-relaxed">
            {markers.map((m) => (
              <li key={m.key}>
                <b className="text-foreground/80">{m.label}:</b> {m.meaning}
              </li>
            ))}
            <li>Bets = share of tickets. Money = share of dollars wagered. Market signal, not a pick.</li>
          </ul>
        </details>
      )}

      <p className="flex justify-between gap-2">
        <span>Source: DraftKings</span>
        {stamp && <span className="tabular-nums text-right">{stamp}</span>}
      </p>
    </div>
  );
}
