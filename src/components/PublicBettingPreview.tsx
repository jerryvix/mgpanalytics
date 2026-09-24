import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Crosshair, RotateCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { shortTeamName } from "@/lib/teamNames";
import {
  agoLabel,
  buildMarketPulse,
  PULSE_MARKETS,
  SPLITS_SPORTS,
  splitAsOf,
  type LineRowLike,
  type OddsRowLike,
  type PulseMarket,
  type PulseMarketView,
  type PulseSideView,
  type SplitRowLike,
} from "@/lib/marketPulse";
import { selectAll } from "../../supabase/functions/_shared/select-all";

// Slate-card public split: DraftKings' real share of bets and share of money
// for this game, read from betting_splits (NCAAF and NFL). This replaced a
// random-number mock. A sport without stored splits, or a game DK hasn't
// posted a split for, renders nothing at all: no placeholder, no bars.
// Markers follow Game Insights > Market Pulse (lib/marketPulse.ts), so the
// card and the sheet one tap away always agree. No lines or prices here: the
// card already shows the game's line, and one market gets one number.
// Layout mirrors the card's WinProbBar: home on the left in terminal-green,
// away on the right in terminal-amber, each labeled with its short name.

interface PublicBettingPreviewProps {
  homeTeam: string;
  awayTeam: string;
  gameId: string | number;
  sport: string;
  /**
   * The card's DraftKings odds row. The markers read the same line as Market
   * Pulse (chooseLine): the stored line, or this row when it is the fresher,
   * different capture.
   */
  odds?: OddsRowLike | null;
  className?: string;
}

interface SlateSplitRow extends SplitRowLike {
  game_id: string;
}

interface SlateLineRow extends LineRowLike {
  game_id: string;
}

const MARKET_LABELS: Record<PulseMarket, string> = { spread: "Spread", total: "Total", moneyline: "Moneyline" };

function groupByGame<T extends { game_id: string }>(rows: T[]): Map<string, T[]> {
  const byGame = new Map<string, T[]>();
  for (const r of rows) byGame.set(r.game_id, [...(byGame.get(r.game_id) ?? []), r]);
  return byGame;
}

/**
 * Every stored split AND DraftKings line on the sport's current slate, one
 * request pair shared by all cards. The line matters even though the card
 * shows none: the reverse-move marker reads DK's open against it, exactly as
 * Market Pulse does.
 */
function useSlateSplits(sport: string) {
  return useQuery({
    queryKey: ["slate-betting-splits", sport],
    enabled: SPLITS_SPORTS.has(sport),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Games still in progress stay on the slate, with their last pre-kickoff split
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const splits = await selectAll<SlateSplitRow>(
        () =>
          supabase
            .from("betting_splits")
            .select("game_id, market, side, bets_pct, handle_pct, captured_at, source_as_of")
            .eq("source", "draftkings")
            .eq("sport", sport)
            .gte("event_start", since)
            .order("id"),
        { label: "slate betting splits" },
      );
      const splitsByGame = groupByGame(splits);
      const gameIds = [...splitsByGame.keys()];
      const lines: SlateLineRow[] = [];
      for (let i = 0; i < gameIds.length; i += 100) {
        const chunk = gameIds.slice(i, i + 100);
        lines.push(
          ...(await selectAll<SlateLineRow>(
            () =>
              supabase
                .from("betting_lines")
                .select("game_id, market, side, line, price, open_line, open_price, captured_at")
                .eq("source", "draftkings")
                .eq("sport", sport)
                .in("game_id", chunk)
                .order("id"),
            { label: "slate betting lines" },
          )),
        );
      }
      return { splitsByGame, linesByGame: groupByGame(lines) };
    },
  });
}

interface Side {
  name: string;
  view: PulseSideView;
}

/** [left, right] as WinProbBar draws them: home left for team markets, Over left for totals. */
function orient(view: PulseMarketView, home: string, away: string): [Side, Side] {
  const [first, second] = view.sides; // [away, home] or [over, under]
  if (view.market === "total") return [{ name: "Over", view: first }, { name: "Under", view: second }];
  return [{ name: home, view: second }, { name: away, view: first }];
}

function SplitBar({ left, right, pick }: { left: Side; right: Side; pick: (s: PulseSideView) => number | null }) {
  const l = pick(left.view);
  const r = pick(right.view);
  if (l === null || r === null) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 font-mono tabular-nums text-[10px]">
        <span className="text-terminal-green truncate">
          {left.name} {l}%
        </span>
        <span className="text-terminal-amber truncate text-right">
          {r}% {right.name}
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-terminal-green" style={{ width: `${l}%` }} />
        <div className="bg-terminal-amber flex-1" />
      </div>
    </div>
  );
}

function markerText(view: PulseMarketView, sides: [Side, Side]): string | null {
  if (view.thin) return null;
  const parts: string[] = [];
  for (const s of sides) {
    if (s.view.sharp) parts.push(`Sharp money: ${s.name}`);
    if (s.view.publicSide) parts.push(`Public side: ${s.name}`);
    if (s.view.reverseMove) parts.push(`Reverse move: ${s.name}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function PublicBettingPreview({ homeTeam, awayTeam, gameId, sport, odds, className }: PublicBettingPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isError, fetchStatus, refetch } = useSlateSplits(sport);
  if (!SPLITS_SPORTS.has(sport)) return null;
  // First read still out, or PAUSED (offline, a retry held while the tab is
  // hidden: React Query 5 reports that as neither loading nor error). A
  // placeholder, never "no split", until the read settles.
  if (data === undefined && !(isError && fetchStatus === "idle")) {
    return (
      <div
        role="status"
        aria-label="Loading DraftKings splits"
        className={cn("border-t border-terminal-green/10 pt-2 mt-2 space-y-1.5 py-1", className)}
      >
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    );
  }
  if (isError && data === undefined) {
    // A failed read is not "no split": say so, small, with a way to retry
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "border-t border-terminal-green/10 pt-2 mt-2 flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground",
          className,
        )}
      >
        <span>DK splits couldn't load.</span>
        <button type="button" onClick={() => void refetch()} className="flex items-center gap-1 text-foreground hover:text-terminal-green">
          <RotateCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }
  const rows = data?.splitsByGame.get(String(gameId));
  if (!rows?.length) return null;

  const pulse = buildMarketPulse({ splits: rows, lines: data?.linesByGame.get(String(gameId)) ?? [], odds: odds ?? null });
  const markets = PULSE_MARKETS.filter((m) => pulse[m]?.hasSplits);
  if (markets.length === 0) return null;

  // College football by school ("Coastal"), pro teams by nickname ("Chiefs")
  const home = shortTeamName(homeTeam, sport);
  const away = shortTeamName(awayTeam, sport);
  const headline = pulse[markets[0]]!; // the spread whenever DK posts one
  const headSides = orient(headline, home, away);
  const sharp = headline.thin ? undefined : headSides.find((s) => s.view.sharp);
  // DK's page freshness, not our fetch time (sync-betting-splits freshness.ts)
  const capturedAt = rows.map(splitAsOf).sort().pop();
  // Rendered inside clickable slate cards: never let a tap here open the sheet
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("border-t border-terminal-green/10 pt-2 mt-2", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={stop}
          aria-label={`DraftKings ${MARKET_LABELS[headline.market].toLowerCase()} bets: ${headSides[0].name} ${headSides[0].view.betsPct}%, ${headSides[1].name} ${headSides[1].view.betsPct}%`}
          className="w-full space-y-1 text-left py-1 hover:bg-terminal-green/5 rounded transition-colors"
        >
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">DK {MARKET_LABELS[headline.market]} bets</span>
            {sharp && (
              <span className="flex items-center gap-0.5 normal-case tracking-normal text-foreground">
                <Crosshair className="h-3 w-3" /> Sharp: {sharp.name}
              </span>
            )}
            {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
          <SplitBar left={headSides[0]} right={headSides[1]} pick={(s) => s.betsPct} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent onClick={stop}>
        <div className="space-y-3 pt-2">
          {markets.map((m) => {
            const view = pulse[m]!;
            const sides = orient(view, home, away);
            const markers = markerText(view, sides);
            return (
              <div key={m} className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{MARKET_LABELS[m]}</span>
                  {view.thin && <span className="normal-case tracking-normal">light, one-sided action</span>}
                </div>
                {(["Bets", "Money"] as const).map((label) => (
                  <div key={label} className="grid grid-cols-[40px_1fr] items-end gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground pb-px">{label}</span>
                    <SplitBar left={sides[0]} right={sides[1]} pick={(s) => (label === "Bets" ? s.betsPct : s.handlePct)} />
                  </div>
                ))}
                {markers && <p className="font-mono text-[10px] text-foreground/80">{markers}</p>}
              </div>
            );
          })}
          <p className="font-mono text-[9px] text-muted-foreground border-t border-border/30 pt-1.5">
            DraftKings{capturedAt ? ` · updated ${agoLabel(capturedAt)}` : ""} · full read in Game Insights
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
