import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Database, Users, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function AdminPanel() {
  const [isSyncingNFL, setIsSyncingNFL] = useState(false);

  const handleSyncNFLGames = async () => {
    setIsSyncingNFL(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-nfl-games");
      
      if (error) {
        throw error;
      }

      toast({
        title: "NFL Games Synchronized",
        description: `Successfully synced ${data.count} games.`,
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync NFL games",
        variant: "destructive",
      });
    } finally {
      setIsSyncingNFL(false);
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
                <Settings className="w-4 h-4 text-terminal-amber" />
                System Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start font-mono text-xs"
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
              <Button variant="outline" size="sm" className="w-full justify-start font-mono text-xs">
                <Database className="w-3 h-3 mr-2" />
                Clear Cache
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-foreground">
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 font-mono text-xs">
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
