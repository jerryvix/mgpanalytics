import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, Calendar, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

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
  atsRecord: string;
  overUnderRecord: string;
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
      // Fetch player injuries for both teams
      const { data: playersData } = await supabase
        .from("players")
        .select("name, team_name, injury_status, injury_designation")
        .eq("sport", "NBA")
        .or(`team_name.ilike.%${game.home_team_name}%,team_name.ilike.%${game.visitor_team_name}%`)
        .not("injury_status", "is", null);

      const injuryList = (playersData || [])
        .filter((p) => p.injury_status && p.injury_status.toLowerCase() !== "healthy")
        .map((p) => ({
          team: p.team_name || "",
          player: p.name,
          status: p.injury_designation || p.injury_status || "Unknown",
        }));

      setInjuries(injuryList);

      // Generate mock team stats for demo (would come from real API in production)
      setHomeStats(generateMockTeamStats());
      setVisitorStats(generateMockTeamStats());
      setHeadToHead("1-1 this season");
    } catch (error) {
      console.error("Error fetching preview data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Mock data generator for demo purposes
  const generateMockTeamStats = (): TeamStats => {
    const wins = Math.floor(Math.random() * 30) + 15;
    const losses = Math.floor(Math.random() * 25) + 10;
    const atsWins = Math.floor(Math.random() * (wins + losses));
    const overWins = Math.floor(Math.random() * (wins + losses));

    return {
      record: `${wins}-${losses}`,
      atsRecord: `${atsWins}-${wins + losses - atsWins} ATS`,
      overUnderRecord: `${overWins}-${wins + losses - overWins} O/U`,
      last5: Array(5)
        .fill(null)
        .map(() => ({
          result: Math.random() > 0.5 ? "W" : "L",
          opponent: ["LAL", "BOS", "MIA", "CHI", "NYK"][Math.floor(Math.random() * 5)],
          score: `${Math.floor(Math.random() * 20) + 100}-${Math.floor(Math.random() * 20) + 95}`,
        })),
    };
  };

  if (!game) return null;

  const homeInjuries = injuries.filter((i) =>
    i.team.toLowerCase().includes(game.home_team_name.split(" ").pop()?.toLowerCase() || "")
  );
  const visitorInjuries = injuries.filter((i) =>
    i.team.toLowerCase().includes(game.visitor_team_name.split(" ").pop()?.toLowerCase() || "")
  );

  const getTeamAbbrev = (teamName: string) => {
    return teamName.split(" ").pop()?.substring(0, 3).toUpperCase() || "TBD";
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
              {/* Home Team */}
              <div className="border border-terminal-green/20 rounded-lg p-3">
                <h3 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  🏀 {game.home_team_name}
                  <Badge variant="outline" className="text-[10px]">HOME</Badge>
                </h3>
                {homeStats && (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Record:</span>
                      <span className="text-foreground">{homeStats.record}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ATS:</span>
                      <span className="text-terminal-green">{homeStats.atsRecord}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">O/U:</span>
                      <span className="text-terminal-amber">{homeStats.overUnderRecord}</span>
                    </div>
                    <div className="pt-2 border-t border-border/30">
                      <span className="text-muted-foreground text-[10px] uppercase">Last 5 Games:</span>
                      <div className="flex gap-1 mt-1">
                        {homeStats.last5.map((g, idx) => (
                          <Badge
                            key={idx}
                            className={`text-[9px] ${
                              g.result === "W"
                                ? "bg-terminal-green/20 text-terminal-green"
                                : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {g.result}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Visitor Team */}
              <div className="border border-terminal-amber/20 rounded-lg p-3">
                <h3 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  🏀 {game.visitor_team_name}
                  <Badge variant="outline" className="text-[10px]">AWAY</Badge>
                </h3>
                {visitorStats && (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Record:</span>
                      <span className="text-foreground">{visitorStats.record}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ATS:</span>
                      <span className="text-terminal-green">{visitorStats.atsRecord}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">O/U:</span>
                      <span className="text-terminal-amber">{visitorStats.overUnderRecord}</span>
                    </div>
                    <div className="pt-2 border-t border-border/30">
                      <span className="text-muted-foreground text-[10px] uppercase">Last 5 Games:</span>
                      <div className="flex gap-1 mt-1">
                        {visitorStats.last5.map((g, idx) => (
                          <Badge
                            key={idx}
                            className={`text-[9px] ${
                              g.result === "W"
                                ? "bg-terminal-green/20 text-terminal-green"
                                : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {g.result}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
                      {getTeamAbbrev(game.home_team_name)}:
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
                      {getTeamAbbrev(game.visitor_team_name)}:
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
              📊 Stats are for informational purposes only. Always bet responsibly.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
