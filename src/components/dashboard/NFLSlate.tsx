import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Lock, Signal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

interface Game {
  id: number;
  home_team_name: string;
  visitor_team_name: string;
  status: string;
  date: string;
  league: string;
}

interface Odd {
  id: string;
  game_id: number;
  sportsbook: string;
  market_type: string;
  line: number;
  price: number;
}

export function NFLSlate() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [odds, setOdds] = useState<Odd[]>([]);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("league", "NFL")
      .order("date", { ascending: true });

    if (error) {
      console.error("Error fetching games:", error);
    } else {
      setGames(data || []);
    }
    setLoading(false);
  };

  const handleGameClick = async (game: Game) => {
    setSelectedGame(game);
    setSheetOpen(true);
    setOddsLoading(true);
    setOdds([]);

    const { data, error } = await supabase
      .from("odds")
      .select("*")
      .eq("game_id", game.id);

    if (error) {
      console.error("Error fetching odds:", error);
    } else {
      setOdds(data || []);
    }
    setOddsLoading(false);
  };

  const formatGameTime = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, "MMM d, h:mm a");
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "final") {
      return (
        <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px] font-mono">
          FINAL
        </Badge>
      );
    } else if (statusLower === "in progress" || statusLower === "live") {
      return (
        <Badge variant="outline" className="border-terminal-amber text-terminal-amber text-[10px] font-mono animate-pulse">
          LIVE
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-[10px] font-mono">
        SCHEDULED
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide font-mono">
            NFL SLATE
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Week 19 • Playoffs
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-green text-terminal-green font-mono">
          {games.length} GAMES
        </Badge>
      </motion.div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-terminal-green" />
          <span className="ml-2 font-mono text-muted-foreground">LOADING FEED...</span>
        </div>
      ) : games.length === 0 ? (
        <Card className="bg-card border-terminal-green/30">
          <CardContent className="py-12 text-center font-mono">
            <Signal className="w-8 h-8 mx-auto mb-4 text-terminal-amber" />
            <p className="text-muted-foreground">NO GAMES IN VAULT</p>
            <p className="text-xs text-muted-foreground mt-1">Sync games from Admin Panel</p>
          </CardContent>
        </Card>
      ) : (
        /* Games Grid */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {games.map((game, index) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                className="bg-card border-terminal-green/30 hover:border-terminal-green/60 transition-all cursor-pointer group"
                onClick={() => handleGameClick(game)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                      NFL • GAME {game.id}
                    </span>
                    {getStatusBadge(game.status)}
                  </div>

                  <div className="font-mono text-lg text-foreground group-hover:text-terminal-green transition-colors">
                    <span className="font-bold">{game.visitor_team_name}</span>
                    <span className="text-muted-foreground mx-2">@</span>
                    <span className="font-bold">{game.home_team_name}</span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border">
                    {game.status.toLowerCase() === "final" ? (
                      <span className="font-mono text-terminal-green text-sm">
                        FINAL SCORE AVAILABLE
                      </span>
                    ) : (
                      <span className="font-mono text-muted-foreground text-sm">
                        {formatGameTime(game.date)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Odds Side Panel */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-background border-l border-terminal-green/30 w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-foreground">
              {selectedGame && (
                <span>
                  {selectedGame.visitor_team_name} @ {selectedGame.home_team_name}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6">
            {oddsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-terminal-green" />
                <span className="ml-2 font-mono text-sm text-muted-foreground">
                  FETCHING ODDS DATA...
                </span>
              </div>
            ) : odds.length === 0 ? (
              <div className="border border-terminal-green/30 rounded-lg p-6 bg-card">
                <div className="flex items-center gap-3 mb-4">
                  <Lock className="w-5 h-5 text-terminal-amber" />
                  <span className="font-mono text-xs text-terminal-green tracking-wider">
                    TERMINAL OUTPUT
                  </span>
                </div>
                <div className="font-mono text-sm space-y-2 text-muted-foreground">
                  <p className="text-terminal-green">$ query odds --game_id={selectedGame?.id}</p>
                  <p className="text-foreground">DATA STATUS: SECURE CONNECTION ACTIVE.</p>
                  <p className="text-terminal-amber">ODDS FEED REQUIRES GOAT TIER PERMISSION.</p>
                  <p className="text-muted-foreground mt-4 text-xs">
                    [Sync odds from Admin Panel to populate this feed]
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Signal className="w-4 h-4 text-terminal-green" />
                  <span className="font-mono text-xs text-terminal-green tracking-wider">
                    LIVE ODDS FEED • {odds.length} LINES
                  </span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="border-terminal-green/30 hover:bg-transparent">
                      <TableHead className="font-mono text-xs text-muted-foreground">SPORTSBOOK</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground">MARKET</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground text-right">LINE</TableHead>
                      <TableHead className="font-mono text-xs text-muted-foreground text-right">PRICE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {odds.map((odd) => (
                      <TableRow key={odd.id} className="border-terminal-green/20 hover:bg-muted/30">
                        <TableCell className="font-mono text-sm text-foreground">
                          {odd.sportsbook}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <Badge variant="outline" className="border-terminal-cyan/50 text-terminal-cyan text-[10px]">
                            {odd.market_type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-terminal-amber text-right">
                          {odd.line > 0 ? `+${odd.line}` : odd.line}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-right">
                          <span className={odd.price >= 0 ? "text-terminal-green" : "text-terminal-red"}>
                            {odd.price >= 0 ? `+${odd.price}` : odd.price}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
