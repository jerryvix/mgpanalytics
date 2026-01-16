import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Database, Users, RefreshCw, Loader2, Trophy, Dribbble, Zap, CheckCircle, XCircle, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function AdminPanel() {
  const [isSyncingNFL, setIsSyncingNFL] = useState(false);
  const [isSyncingNBA, setIsSyncingNBA] = useState(false);
  const [isSyncingOdds, setIsSyncingOdds] = useState(false);
  const [isSyncingNFLPlayers, setIsSyncingNFLPlayers] = useState(false);
  const [isTestingAPI, setIsTestingAPI] = useState(false);
  const [apiStatus, setApiStatus] = useState<{ success: boolean; message: string } | null>(null);
  
  // NFL counts
  const [gamesCount, setGamesCount] = useState<number | null>(null);
  const [postseasonCount, setPostseasonCount] = useState<number | null>(null);
  const [oddsCount, setOddsCount] = useState<number | null>(null);
  
  // NBA counts
  const [nbaGamesCount, setNbaGamesCount] = useState<number | null>(null);
  const [nbaOddsCount, setNbaOddsCount] = useState<number | null>(null);
  
  // Player counts
  const [nflPlayersCount, setNflPlayersCount] = useState<number | null>(null);

  const fetchGamesCount = async () => {
    // Fetch total NFL games
    const { count, error } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL");
    
    if (!error && count !== null) {
      setGamesCount(count);
    }

    // Fetch postseason games count
    const { count: psCount, error: psError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NFL")
      .eq("postseason", true);
    
    if (!psError && psCount !== null) {
      setPostseasonCount(psCount);
    }
  };

  const fetchOddsCount = async () => {
    const { count, error } = await supabase
      .from("odds")
      .select("*", { count: "exact", head: true });
    
    if (!error && count !== null) {
      setOddsCount(count);
    }
  };

  const fetchNBAGamesCount = async () => {
    const { count, error } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("league", "NBA");
    
    if (!error && count !== null) {
      setNbaGamesCount(count);
    }
  };

  const fetchNBAOddsCount = async () => {
    // Get all NBA game IDs first
    const { data: nbaGames } = await supabase
      .from("games")
      .select("id")
      .eq("league", "NBA");
    
    if (nbaGames && nbaGames.length > 0) {
      const nbaGameIds = nbaGames.map(g => g.id);
      const { count, error } = await supabase
        .from("odds")
        .select("*", { count: "exact", head: true })
        .in("game_id", nbaGameIds);
      
      if (!error && count !== null) {
        setNbaOddsCount(count);
      }
    } else {
      setNbaOddsCount(0);
    }
  };

  const fetchNFLPlayersCount = async () => {
    const { count, error } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NFL");
    
    if (!error && count !== null) {
      setNflPlayersCount(count);
    }
  };

  useEffect(() => {
    fetchGamesCount();
    fetchOddsCount();
    fetchNBAGamesCount();
    fetchNBAOddsCount();
    fetchNFLPlayersCount();
  }, []);

  const handleSyncNFLGames = async () => {
    setIsSyncingNFL(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-games");
      
      if (error) {
        throw error;
      }

      toast({
        title: "NFL Games & Odds Synced",
        description: data.message || `Synced ${data.gamesCount} games with live odds`,
      });

      fetchGamesCount();
      fetchOddsCount();
    } catch (error: unknown) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync NFL games and odds",
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFL(false);
    }
  };

  const handleSyncNBAGames = async () => {
    setIsSyncingNBA(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nba-odds");
      
      if (error) {
        throw error;
      }

      toast({
        title: "NBA Games & Odds Synced",
        description: data.message || `Synced ${data.gamesCount} NBA games with live odds`,
      });

      fetchNBAGamesCount();
      fetchNBAOddsCount();
    } catch (error: unknown) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync NBA games and odds",
        variant: "destructive",
      });
    } finally {
      setIsSyncingNBA(false);
    }
  };

  const handleSyncNFLOdds = async () => {
    setIsSyncingOdds(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-odds");
      
      if (error) {
        throw error;
      }

      toast({
        title: "Bloomberg Feed: NFL Odds Synced",
        description: `Successfully synced ${data.count} odds.`,
      });

      fetchOddsCount();
    } catch (error: unknown) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync NFL odds",
        variant: "destructive",
      });
    } finally {
      setIsSyncingOdds(false);
    }
  };

  const handleSyncNFLPlayers = async () => {
    setIsSyncingNFLPlayers(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-players");
      
      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || "Sync failed");
      }

      toast({
        title: "NFL Players Synced",
        description: `✓ Synced ${data.playersSync?.toLocaleString() || 0} NFL players in ${data.duration}`,
      });

      fetchNFLPlayersCount();
    } catch (error: unknown) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync NFL players",
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFLPlayers(false);
    }
  };

  const handleTestAPIConnection = async () => {
    setIsTestingAPI(true);
    setApiStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("balldontlie", {
        body: { action: "test", sport: "nfl" }
      });
      
      if (error) {
        throw error;
      }

      setApiStatus(data);
      toast({
        title: data.success ? "API Connection Successful" : "API Connection Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    } catch (error: unknown) {
      console.error("API test error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to test API connection";
      setApiStatus({ success: false, message: errorMessage });
      toast({
        title: "API Test Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTestingAPI(false);
    }
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
          <h1 className="text-2xl font-bold text-foreground tracking-wide">
            ADMIN PANEL
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            System configuration and management
          </p>
        </div>
        <Badge variant="outline" className="border-terminal-red text-terminal-red">
          ADMIN ACCESS
        </Badge>
      </motion.div>

      {/* Admin Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Database className="w-4 h-4 text-terminal-green" />
                Database Status
              </CardTitle>
              <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px]">
                CONNECTED
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Tables</span>
                  <span className="text-foreground">12</span>
                </div>
                <div className="flex justify-between">
                  <span>Records</span>
                  <span className="text-foreground">4,521</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync</span>
                  <span className="text-foreground">2 min ago</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-terminal-cyan" />
                Active Users
              </CardTitle>
              <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan text-[10px]">
                LIVE
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Online Now</span>
                  <span className="text-foreground">23</span>
                </div>
                <div className="flex justify-between">
                  <span>Today</span>
                  <span className="text-foreground">156</span>
                </div>
                <div className="flex justify-between">
                  <span>This Week</span>
                  <span className="text-foreground">892</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* NFL Sync Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-card border-terminal-green/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-terminal-green" />
                NFL Data Sync
              </CardTitle>
              <Badge variant="outline" className="border-terminal-green text-terminal-green text-[10px]">
                NFL
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLGames}
                  disabled={isSyncingNFL}
                >
                  {isSyncingNFL ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-2" />
                  )}
                  Sync NFL Games
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
                  onClick={handleSyncNFLPlayers}
                  disabled={isSyncingNFLPlayers}
                >
                  {isSyncingNFLPlayers ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <UserCircle className="w-3 h-3 mr-2" />
                  )}
                  Sync NFL Players
                </Button>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Games in Vault:</span>
                <span className="text-terminal-green">{postseasonCount !== null ? postseasonCount : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Odds in Vault:</span>
                <span className="text-terminal-green">{oddsCount !== null ? oddsCount : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Players in Vault:</span>
                <span className="text-terminal-green">{nflPlayersCount !== null ? nflPlayersCount.toLocaleString() : "..."}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* NBA Sync Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-card border-terminal-cyan/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Dribbble className="w-4 h-4 text-terminal-cyan" />
                NBA Data Sync
              </CardTitle>
              <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan text-[10px]">
                NBA
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 justify-start font-mono text-xs border-terminal-cyan/50 hover:bg-terminal-cyan/10"
                  onClick={handleSyncNBAGames}
                  disabled={isSyncingNBA}
                >
                  {isSyncingNBA ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-2" />
                  )}
                  Sync NBA Games
                </Button>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Games in Vault:</span>
                <span className="text-terminal-cyan">{nbaGamesCount !== null ? nbaGamesCount : "..."}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Odds in Vault:</span>
                <span className="text-terminal-cyan">{nbaOddsCount !== null ? nbaOddsCount : "..."}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Ball Don't Lie API Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-card border-terminal-amber/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-terminal-amber" />
                Ball Don't Lie API
              </CardTitle>
              {apiStatus && (
                <Badge 
                  variant="outline" 
                  className={apiStatus.success 
                    ? "border-terminal-green text-terminal-green text-[10px]" 
                    : "border-terminal-red text-terminal-red text-[10px]"
                  }
                >
                  {apiStatus.success ? "CONNECTED" : "ERROR"}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start font-mono text-xs border-terminal-amber/50 hover:bg-terminal-amber/10"
                onClick={handleTestAPIConnection}
                disabled={isTestingAPI}
              >
                {isTestingAPI ? (
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                ) : apiStatus?.success ? (
                  <CheckCircle className="w-3 h-3 mr-2 text-terminal-green" />
                ) : apiStatus ? (
                  <XCircle className="w-3 h-3 mr-2 text-terminal-red" />
                ) : (
                  <Zap className="w-3 h-3 mr-2" />
                )}
                Test API Connection
              </Button>
              {apiStatus && (
                <p className={`font-mono text-xs ${apiStatus.success ? 'text-terminal-green' : 'text-terminal-red'}`}>
                  {apiStatus.message}
                </p>
              )}
              <div className="font-mono text-xs text-muted-foreground">
                <p>Endpoints: NFL, NBA, NCAAB</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* System Health */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-foreground">
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API Response</span>
                  <span className="text-terminal-green">45ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CPU Usage</span>
                  <span className="text-terminal-green">12%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Memory</span>
                  <span className="text-terminal-amber">67%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Uptime</span>
                  <span className="text-foreground">99.9%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
