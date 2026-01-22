import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface TheOddsApiCardProps {
  onSyncComplete?: () => void;
}

export function TheOddsApiCard({ onSyncComplete }: TheOddsApiCardProps) {
  const [isTestingAPI, setIsTestingAPI] = useState(false);
  const [isSyncingOdds, setIsSyncingOdds] = useState(false);
  const [apiStatus, setApiStatus] = useState<{ success: boolean; message: string; usage?: { requests_used: number; requests_remaining: number } } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const handleTestAPIConnection = async () => {
    setIsTestingAPI(true);
    try {
      // Test connection via edge function that uses the secret
      const { data, error } = await supabase.functions.invoke("sync-odds-snapshot", {
        body: { testOnly: true }
      });

      if (error) {
        setApiStatus({ success: false, message: error.message });
        toast({ title: "API Error", description: error.message, variant: "destructive" });
      } else if (data?.success) {
        setApiStatus({ 
          success: true, 
          message: "Connected",
          usage: data.usage
        });
        toast({ title: "The Odds API Connected", description: "Successfully connected to The Odds API" });
      } else {
        setApiStatus({ success: false, message: data?.error || "Connection failed" });
        toast({ title: "API Error", description: data?.error || "Connection failed", variant: "destructive" });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Connection failed";
      setApiStatus({ success: false, message: msg });
      toast({ title: "API Error", description: msg, variant: "destructive" });
    } finally {
      setIsTestingAPI(false);
    }
  };

  const handleSyncOddsNow = async () => {
    setIsSyncingOdds(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-odds-snapshot");

      if (error) {
        toast({ title: "Sync Error", description: error.message, variant: "destructive" });
      } else if (data?.success) {
        setLastSyncTime(new Date().toLocaleTimeString());
        toast({ 
          title: "Odds Synced", 
          description: `${data.snapshotsCreated || 0} odds snapshots captured` 
        });
        onSyncComplete?.();
      } else {
        toast({ title: "Sync Error", description: data?.error || "Sync failed", variant: "destructive" });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      toast({ title: "Sync Error", description: msg, variant: "destructive" });
    } finally {
      setIsSyncingOdds(false);
    }
  };

  return (
    <Card className="bg-card border-terminal-amber/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-terminal-amber" />
          The Odds API
        </CardTitle>
        {apiStatus && (
          <Badge 
            variant="outline" 
            className={apiStatus.success 
              ? "border-terminal-green text-terminal-green text-[10px]" 
              : "border-terminal-red text-terminal-red text-[10px]"}
          >
            {apiStatus.success ? "CONNECTED" : "ERROR"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="justify-start font-mono text-xs border-terminal-amber/50 hover:bg-terminal-amber/10"
            onClick={handleTestAPIConnection}
            disabled={isTestingAPI || isSyncingOdds}
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
            Test Connection
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="justify-start font-mono text-xs border-terminal-green/50 hover:bg-terminal-green/10"
            onClick={handleSyncOddsNow}
            disabled={isTestingAPI || isSyncingOdds}
          >
            {isSyncingOdds ? (
              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-2" />
            )}
            Sync Odds Now
          </Button>
        </div>
        
        <div className="space-y-1 font-mono text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Sports Covered</span>
            <span className="text-foreground">NFL, NBA, NCAAB</span>
          </div>
          <div className="flex justify-between">
            <span>Primary Book</span>
            <span className="text-terminal-green">DraftKings</span>
          </div>
          {apiStatus?.usage && (
            <>
              <div className="flex justify-between">
                <span>API Usage</span>
                <span className="text-foreground">
                  {apiStatus.usage.requests_used.toLocaleString()} / {(apiStatus.usage.requests_used + apiStatus.usage.requests_remaining).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Remaining</span>
                <span className={apiStatus.usage.requests_remaining < 1000 ? "text-terminal-red" : "text-terminal-green"}>
                  {apiStatus.usage.requests_remaining.toLocaleString()}
                </span>
              </div>
            </>
          )}
          {lastSyncTime && (
            <div className="flex justify-between">
              <span>Last Sync</span>
              <span className="text-foreground">{lastSyncTime}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
