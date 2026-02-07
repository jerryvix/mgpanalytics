import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, AlertTriangle, Calendar, Trophy, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { getTeamAbbrev } from "@/utils/teamAbbreviations";

interface Game {
  id: string;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  season: number;
}

interface GamePreviewModalProps {
  game: Game | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TeamStats {
  record: string;
  homeRecord: string;
  awayRecord: string;
  atsRecord: string | null;
  overUnderRecord: string | null;
  last5: Array<{ result: string; opponent: string; score: string }>;
}

export function GamePreviewModal({ game, open, onOpenChange }: GamePreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [homeStats, setHomeStats] = useState<TeamStats | null>(null);
  const [visitorStats, setVisitorStats] = useState<TeamStats | null>(null);
  const [headToHead, setHeadToHead] = useState<string | null>(null);
  const [injuries, setInjuries] = useState<Array<{ team: string; player: string; status: string }>>([]);

  useEffect(() => {
    if (open && game) {
      fetchPreviewData();
    }
  }, [open, game]);

  const fetchPreviewData = async () => {
    if (!game) return;
    setLoading(true);

    try {
      // Parallel fetch: injuries + team records + head-to-head + last 5 games
      const [injuriesResult, homeRecord, awayRecord, h2h, homeLast5, awayLast5] =
        await Promise.all([
          // Injuries (real data from players table)
          supabase
            .from("players")
            .select("name, team_name, injury_status, injury_designation")
            .eq("sport", "NBA")
            .or(`team_name.ilike.%${game.home_team_name}%,team_name.ilike.%${game.visitor_team_name}%`)
            .not("injury_status", "is", null),
          // Home team record
          supabase.rpc("get_nba_team_record", { p_team_name: game.home_team_name }),
          // Away team record
          supabase.rpc("get_nba_team_record", { p_team_name: game.visitor_team_name }),
          // Head to head
          supabase.rpc("get_nba_head_to_head", {
            p_team1: game.home_team_name,
            p_team2: game.visitor_team_name,
          }),
          // Home last 10
          supabase.rpc("get_nba_team_last_n_games", {
            p_team_name: game.home_team_name,
            p_n: 10,
            p_before_date: game.date,
          }),
          // Away last 10
          supabase.rpc("get_nba_team_last_n_games", {
            p_team_name: game.visitor_team_name,
            p_n: 10,
            p_before_date: game.date,
          }),
        ]);

      // Process injuries
      const injuryList = (injuriesResult.data || [])
        .filter((p) => p.injury_status && p.injury_status.toLowerCase() !== "healthy")
        .map((p) => ({
          team: p.team_name || "",
          player: p.name,
          status: p.injury_designation || p.injury_status || "Unknown",
        }));
      setInjuries(injuryList);

      // Process home stats
      const homeData = homeRecord.data;
      const homeLast5Data = Array.isArray(homeLast5.data) ? homeLast5.data : [];
      setHomeStats({
        record: homeData?.record || "0-0",
        homeRecord: homeData?.home_record || "0-0",
        awayRecord: homeData?.away_record || "0-0",
        atsRecord: null, // Not yet available — historical odds being built
        overUnderRecord: null,
        last5: homeLast5Data.map((g: { result: string; opponent: string; score: string }) => ({
          result: g.result,
          opponent: getTeamAbbrev(g.opponent, "NBA"),
          score: g.score,
        })),
      });

      // Process away stats
      const awayData = awayRecord.data;
      const awayLast5Data = Array.isArray(awayLast5.data) ? awayLast5.data : [];
      setVisitorStats({
        record: awayData?.record || "0-0",
        homeRecord: awayData?.home_record || "0-0",
        awayRecord: awayData?.away_record || "0-0",
        atsRecord: null,
        overUnderRecord: null,
        last5: awayLast5Data.map((g: { result: string; opponent: string; score: string }) => ({
          result: g.result,
          opponent: getTeamAbbrev(g.opponent, "NBA"),
          score: g.score,
        })),
      });

      // Process head to head
      const h2hData = h2h.data;
      if (h2hData && h2hData.total_games > 0) {
        setHeadToHead(h2hData.summary);
      } else {
        setHeadToHead("No meetings this season");
      }
    } catch (error) {
      console.error("Error fetching preview data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!game) return null;

  const homeInjuries = injuries.filter((i) =>
    i.team.toLowerCase().includes(game.home_team_name.split(" ").pop()?.toLowerCase() || "")
  );
  const visitorInjuries = injuries.filter((i) =>
    i.team.toLowerCase().includes(game.visitor_team_name.split(" ").pop()?.toLowerCase() || "")
  );

  const hasData = (stats: TeamStats | null) =>
    stats && (stats.record !== "0-0" || stats.last5.length > 0);

  const renderTeamStats = (stats: TeamStats | null, teamName: string, isHome: boolean) => {
    if (!stats) return null;

    const borderColor = isHome ? "border-terminal-green/20" : "border-terminal-amber/20";
    const badge = isHome ? "HOME" : "AWAY";

    return (
      <div className={`border ${borderColor} rounded-lg p-3`}>
        <h3 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          {getTeamAbbrev(teamName, "NBA")}
          <Badge variant="outline" className="text-[10px]">{badge}</Badge>
        </h3>
        {!hasData(stats) ? (
          <p className="text-[10px] text-muted-foreground italic">Season data loading...</p>
        ) : (
          <div className="space-y-2 text-xs font-mono">
            {/* Overall Record */}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Record:</span>
              <span className="text-foreground">{stats.record}</span>
            </div>
            {/* Home/Away splits */}
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Home:</span>
              <span className="text-foreground/70">{stats.homeRecord}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Away:</span>
              <span className="text-foreground/70">{stats.awayRecord}</span>
            </div>
            {/* ATS - unavailable with tooltip */}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">ATS:</span>
              <span className="text-muted-foreground/50 flex items-center gap-1">
                <span>--</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[200px]">
                    <p className="text-xs">ATS records are computed from our historical odds data, currently being built.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </div>
            {/* O/U - unavailable with tooltip */}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">O/U:</span>
              <span className="text-muted-foreground/50 flex items-center gap-1">
                <span>--</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[200px]">
                    <p className="text-xs">O/U records are computed from our historical odds data, currently being built.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
            </div>
            {/* Last 5 Games */}
            {stats.last5.length > 0 && (
              <div className="pt-2 border-t border-border/30">
                <span className="text-muted-foreground text-[10px] uppercase">Last 10 Games:</span>
                <div className="flex gap-1 mt-1">
                  {stats.last5.map((g, idx) => (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <span>
                          <Badge
                            className={`text-[9px] cursor-help ${
                              g.result === "W"
                                ? "bg-terminal-green/20 text-terminal-green"
                                : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {g.result}
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs font-mono">
                          vs {g.opponent}: {g.score}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-terminal-cyan/30 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-terminal-cyan" />
              <span>
                {game.visitor_team_name} @ {game.home_team_name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-normal mt-1">
              {format(parseISO(game.date), "EEEE, MMMM d, yyyy • h:mm a")}
            </p>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-terminal-cyan" />
            <span className="ml-2 font-mono text-muted-foreground">Loading preview...</span>
          </div>
        ) : (
          <TooltipProvider>
            <div className="space-y-6 mt-4">
              {/* Head to Head */}
              {headToHead && (
                <div className="bg-terminal-cyan/5 border border-terminal-cyan/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-4 h-4 text-terminal-cyan" />
                    <span className="font-mono text-sm text-terminal-cyan">Head-to-Head</span>
                  </div>
                  <p className="text-sm text-muted-foreground font-mono">{headToHead}</p>
                </div>
              )}

              {/* Team Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                {renderTeamStats(homeStats, game.home_team_name, true)}
                {renderTeamStats(visitorStats, game.visitor_team_name, false)}
              </div>

              {/* Injuries Section */}
              {(homeInjuries.length > 0 || visitorInjuries.length > 0) && (
                <div className="bg-terminal-amber/5 border border-terminal-amber/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-terminal-amber" />
                    <span className="font-mono text-sm text-terminal-amber">Injury Report</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase">
                        {getTeamAbbrev(game.home_team_name, "NBA")}:
                      </span>
                      {homeInjuries.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {homeInjuries.map((i, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span className="text-foreground">{i.player}</span>
                              <Badge
                                className={`text-[9px] ${
                                  i.status.toLowerCase() === "out"
                                    ? "bg-destructive/20 text-destructive"
                                    : i.status.toLowerCase() === "questionable"
                                    ? "bg-terminal-amber/20 text-terminal-amber"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {i.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground mt-1">None</p>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase">
                        {getTeamAbbrev(game.visitor_team_name, "NBA")}:
                      </span>
                      {visitorInjuries.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {visitorInjuries.map((i, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span className="text-foreground">{i.player}</span>
                              <Badge
                                className={`text-[9px] ${
                                  i.status.toLowerCase() === "out"
                                    ? "bg-destructive/20 text-destructive"
                                    : i.status.toLowerCase() === "questionable"
                                    ? "bg-terminal-amber/20 text-terminal-amber"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {i.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground mt-1">None</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Betting Trends Note */}
              <div className="text-[10px] text-muted-foreground text-center font-mono pt-2 border-t border-border/30">
                Stats are for informational purposes only. Always bet responsibly.
              </div>
            </div>
          </TooltipProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
