import { useQuery } from "@tanstack/react-query";
import { Loader2, Flame, Lightbulb, Signal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { WinProbBar } from "@/components/ui/WinProbBar";
import { trendingFor } from "@/data/trendingBets";
import { MatchupIntelSection } from "@/components/ncaaf/MatchupIntelSection";
import { MarketPulse } from "@/components/games/MarketPulse";
import { useMarketPulse } from "@/hooks/useMarketPulse";
import { ProbablePitcherRow } from "@/components/mlb/ProbablePitcher";
import { useMlbProbables } from "@/hooks/useMlbProbables";
import { findMatchupForGame } from "@/services/mlb/probablePitchers";
import { queryView } from "@/lib/queryView";
import { format, parseISO } from "date-fns";
import { tbdKickoffLabel } from "@/lib/kickoff";
import { nickname, titleTeamName } from "@/lib/teamNames";
import { postedMlbOdds } from "@/lib/mlbRunLine";
import { NCAAF_TEAM_IDS } from "@/data/ncaafTeamIds";

// Game Insights - the tap-a-game deep dive. Every number here is real MGP
// data: DraftKings' line and its move since open (one number per market, in
// Market Pulse), and player stats we compute ourselves. No simulated or "estimated" figures - if a section has
// no verified data, it doesn't render. Adding a sport = one config entry
// plus (optionally) a sport-specific rail.

export type InsightsSport = "MLB" | "NFL" | "NCAAF";

interface SportConfig {
  oddsTable: string;
  spreadLabel: string;
}

const SPORT_CONFIG: Record<InsightsSport, SportConfig> = {
  MLB: { oddsTable: "mlb_odds", spreadLabel: "Run Line" },
  NFL: { oddsTable: "odds", spreadLabel: "Spread" },
  NCAAF: { oddsTable: "ncaaf_odds", spreadLabel: "Spread" },
};

const SPORTSBOOKS = ["draftkings", "fanduel", "caesars", "betrivers"];

export interface InsightsGame {
  id: string | number;
  date: string;
  home_team_name: string;
  visitor_team_name: string;
  venue?: string | null;
  starting_pitcher_home?: string | null;
  starting_pitcher_away?: string | null;
  /** NCAAF: kickoff not set yet, so `date` is a midnight-ET placeholder. */
  time_tbd?: boolean | null;
  /** Feed id (espn_mlb_...): MLB's DraftKings open comes from odds_history by it */
  external_id?: string | null;
}

interface BookOdds {
  sportsbook: string;
  spread_value: number | null;
  spread_odds: number | null;
  moneyline_home: number | null;
  moneyline_away: number | null;
  total_value: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
}

interface HotBat {
  name: string;
  team: string;
  streak: number;
  streakAvg: number | null;
  seasonAvg: number | null;
}

const fmtAvg = (v: number | null) => (v == null ? "-" : v.toFixed(3).replace(/^0/, ""));

async function loadInsights(sport: InsightsSport, game: InsightsGame) {
  const cfg = SPORT_CONFIG[sport];

  // 1) Every book's current lines for this game. Every read here throws on
  // error: a failed read must show the sheet's error + Retry state, not
  // quietly drop "Market Read" or "Hot Bats" as if there were no data.
  const { data: oddsData, error: oddsError } = await supabase
    .from(cfg.oddsTable as "odds")
    .select("*")
    .eq("game_id", game.id as never)
    .in("sportsbook", SPORTSBOOKS);
  if (oddsError) throw new Error(`Game odds failed to load: ${oddsError.message}`);
  // MLB: a run line DraftKings hasn't posted (stored as 0, no price) is no run
  // line, so Market Pulse shows none rather than "PK"
  const books = ((oddsData || []) as unknown as BookOdds[]).map((b) => (sport === "MLB" ? postedMlbOdds(b) : b));

  // 2) Line movement lives in Market Pulse now: DraftKings' open to its
  // current line, one number per market. (This block used to average every
  // odds_history capture, which invented prices and counted captures as
  // books; Sep 24 2026 QC.)

  // 3) Hot bats in this game (MLB) - real streaks from our own game logs
  let hotBats: HotBat[] = [];
  if (sport === "MLB") {
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, team_name, team_abbr")
      .eq("sport", "MLB")
      .eq("status", "active")
      .in("team_name", [game.home_team_name, game.visitor_team_name]);
    if (playersError) throw new Error(`Rosters failed to load: ${playersError.message}`);
    const ids = (players || []).map((p) => p.id);
    if (ids.length) {
      const { data: stats, error: statsError } = await supabase
        .from("player_season_stats")
        .select("player_id, hit_streak, hit_streak_avg, batting_avg")
        .eq("sport", "MLB")
        .eq("season", new Date().getFullYear())
        .gte("hit_streak", 5)
        .in("player_id", ids)
        .order("hit_streak", { ascending: false })
        .limit(6);
      if (statsError) throw new Error(`Hit streaks failed to load: ${statsError.message}`);
      const pm = new Map((players || []).map((p) => [p.id, p]));
      hotBats = (stats || []).map((s) => {
        const p = s.player_id ? pm.get(s.player_id) : undefined;
        return {
          name: p?.name || "Unknown",
          team: p?.team_abbr || nickname(p?.team_name || ""),
          streak: s.hit_streak as number,
          streakAvg: s.hit_streak_avg as number | null,
          seasonAvg: s.batting_avg as number | null,
        };
      });
    }
  }

  // 4) Verified angles touching either team - curated, checkable facts only
  const angles = trendingFor(sport)
    .filter((b) =>
      [game.home_team_name, game.visitor_team_name].some(
        (t) => b.subject.includes(nickname(t)) || b.nugget.includes(nickname(t))
      )
    )
    .slice(0, 3);

  return { books, hotBats, angles };
}

export function GameInsightsSheet({
  sport,
  game,
  open,
  onOpenChange,
}: {
  sport: InsightsSport;
  game: InsightsGame | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const cfg = SPORT_CONFIG[sport];
  const insights = useQuery({
    queryKey: ["game-insights", sport, game?.id],
    queryFn: () => loadInsights(sport, game!),
    enabled: open && !!game,
    staleTime: 60_000,
  });
  const { data } = insights;
  // A paused or failed first load must not read as "no verified data"
  const insightsView = queryView(insights);

  const isMobile = useIsMobile();
  // MLB: the announced (or labeled projected) starters with their season and
  // last-3-start lines. Synced names stand in only while MLB's data is missing.
  const { data: probables } = useMlbProbables(sport === "MLB" && open && !!game);
  const mlbMatchup = sport === "MLB" && game ? findMatchupForGame(probables, game) : null;
  const pitcherFallback = !probables;

  // One read of the market for the whole sheet: Market Pulse shows it and
  // Market Read's win probability uses the same DraftKings moneyline
  const pulse = useMarketPulse({
    sport,
    gameId: game?.id,
    externalId: game?.external_id,
    homeName: game?.home_team_name,
    awayName: game?.visitor_team_name,
    books: data?.books ?? [],
    enabled: open && !!game,
  });
  const ml = pulse.pulse?.moneyline;
  const mlAway = ml?.sides[0].price ?? null;
  const mlHome = ml?.sides[1].price ?? null;

  // College logos need ESPN's team id (TeamLogo has no name-based URL for them)
  const espnId = (name: string) => (sport === "NCAAF" ? NCAAF_TEAM_IDS[name] : undefined);

  const headerBlock = game && (
    <div>
      <div className="flex items-center gap-2 text-lg">
        <TeamLogo sport={sport} name={game.visitor_team_name} espnId={espnId(game.visitor_team_name)} size={20} />
        {titleTeamName(game.visitor_team_name, sport)}
        <span className="text-terminal-green">@</span>
        <TeamLogo sport={sport} name={game.home_team_name} espnId={espnId(game.home_team_name)} size={20} />
        {titleTeamName(game.home_team_name, sport)}
      </div>
      <p className="text-xs text-muted-foreground font-normal mt-1">
        {game.time_tbd ? tbdKickoffLabel(game.date) : format(parseISO(game.date), "EEE MMM d, h:mm a")}
        {game.venue ? ` · ${game.venue}` : ""}
      </p>
      {sport === "MLB" ? (
        <div className="mt-2 space-y-1.5 font-normal">
          <ProbablePitcherRow
            teamName={game.visitor_team_name}
            line={mlbMatchup?.away}
            fallbackName={pitcherFallback ? game.starting_pitcher_away : null}
          />
          <ProbablePitcherRow
            teamName={game.home_team_name}
            line={mlbMatchup?.home}
            fallbackName={pitcherFallback ? game.starting_pitcher_home : null}
          />
        </div>
      ) : (
        (game.starting_pitcher_away || game.starting_pitcher_home) && (
          <p className="text-xs text-muted-foreground font-normal mt-0.5">
            ⚾ {game.starting_pitcher_away || "TBD"} vs {game.starting_pitcher_home || "TBD"}
          </p>
        )
      )}
    </div>
  );

  const body = (
    <>
      {!game || insightsView === "loading" || insightsView === "waiting" ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-terminal-green" />
            <span className="ml-2 font-mono text-sm text-muted-foreground">
              {insightsView === "waiting" ? "WAITING FOR CONNECTION..." : "BUILDING GAME INTEL..."}
            </span>
          </div>
        ) : insightsView === "error" ? (
          <div className="py-12 text-center space-y-3" role="alert">
            <p className="font-mono text-sm text-foreground">Couldn't load game intel.</p>
            <button
              onClick={() => void insights.refetch()}
              className="font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-md border text-terminal-green border-terminal-green/50 bg-terminal-green/10 hover:bg-terminal-green/20 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {/* CFB matchup intelligence - executive summary first */}
            {sport === "NCAAF" && (
              <MatchupIntelSection
                homeTeamName={game.home_team_name}
                visitorTeamName={game.visitor_team_name}
                gameDate={game.date}
              />
            )}

            {/* Market consensus - no-vig win probability from the same
                DraftKings moneyline Market Pulse shows */}
            {mlHome != null && mlAway != null && (
              <section>
                <SectionTitle icon={<Signal className="w-3.5 h-3.5" />} text="Market Read" />
                <div className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
                  <WinProbBar
                    homeName={game.home_team_name}
                    awayName={game.visitor_team_name}
                    moneylineHome={mlHome}
                    moneylineAway={mlAway}
                    sport={sport}
                  />
                  <p className="font-mono text-[10px] text-muted-foreground">
                    DraftKings moneyline, vig removed. The market's own probability, not an MGP pick.
                  </p>
                </div>
              </section>
            )}

            {/* Hot bats (MLB) */}
            {(data?.hotBats.length ?? 0) > 0 && (
              <section>
                <SectionTitle icon={<Flame className="w-3.5 h-3.5" />} text="Hot Bats in This Game" />
                <div className="border border-border rounded-lg p-3 bg-card/50 divide-y divide-dashed divide-border">
                  {data!.hotBats.map((h, i) => (
                    <div key={i} className="py-2 first:pt-0 last:pb-0 text-sm flex items-baseline justify-between gap-2">
                      <span>
                        {h.name} <span className="text-muted-foreground font-mono text-[10px]">{h.team}</span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-right">
                        <b className="text-terminal-amber">{h.streak}-game streak</b>
                        <span className="text-muted-foreground"> · {fmtAvg(h.streakAvg)} in it · {fmtAvg(h.seasonAvg)} szn</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Verified angles */}
            {(data?.angles.length ?? 0) > 0 && (
              <section>
                <SectionTitle icon={<Lightbulb className="w-3.5 h-3.5" />} text="Verified Angles" />
                <div className="border border-border rounded-lg p-3 bg-card/50 divide-y divide-dashed divide-border">
                  {data!.angles.map((a) => (
                    <div key={a.id} className="py-2 first:pt-0 last:pb-0 text-sm">
                      {a.nugget}
                      <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                        verified · Trending Bets integrity rules apply
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Market Pulse: DraftKings' line and its move since open, the
                public split, market markers */}
            <MarketPulse
              sport={sport}
              awayName={game.visitor_team_name}
              homeName={game.home_team_name}
              spreadLabel={cfg.spreadLabel}
              state={pulse}
            />

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Everything above is synced sportsbook data and MGP-computed stats: market signal,
              not a recommendation. Sections without verified data simply don't show.
            </p>
          </div>
        )}
    </>
  );

  // Phones get a draggable bottom sheet (the pattern DraftKings/FanDuel
  // users know for game detail): swipe the handle down to dismiss. Desktop
  // keeps the right-side panel.
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92dvh] bg-background/95 backdrop-blur-xl border-terminal-green/30">
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
            <DrawerHeader className="px-0 pt-2 pb-4 border-b border-terminal-green/20 text-left">
              <DrawerTitle className="font-mono text-foreground">{headerBlock}</DrawerTitle>
            </DrawerHeader>
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-background/85 backdrop-blur-xl border-l border-terminal-green/30 w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-terminal-green/20">
          <SheetTitle className="font-mono text-foreground">{headerBlock}</SheetTitle>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest mb-2 text-terminal-amber">
      {icon} {text}
    </div>
  );
}
