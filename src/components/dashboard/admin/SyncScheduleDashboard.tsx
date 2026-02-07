import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  CalendarClock,
  Play,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface ScheduleRow {
  sport: string;
  data_type: string;
  cron_interval: string | null;
  is_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  records_synced: number | null;
  error_message: string | null;
}

export function SyncScheduleDashboard() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [runningSync, setRunningSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = async () => {
    const { data, error } = await supabase
      .from("sync_schedule")
      .select("sport, data_type, cron_interval, is_enabled, last_sync_at, last_sync_status, records_synced, error_message")
      .order("sport")
      .order("data_type");

    if (!error && data) {
      setSchedules(data as ScheduleRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const toggleEnabled = async (sport: string, dataType: string, enabled: boolean) => {
    await supabase
      .from("sync_schedule")
      .update({ is_enabled: enabled })
      .eq("sport", sport)
      .eq("data_type", dataType);
    await fetchSchedules();
  };

  const handleDispatchAll = async () => {
    setIsDispatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-syncs", {
        body: {},
      });

      if (error) {
        toast({ title: "Dispatch Failed", description: error.message, variant: "destructive" });
      } else {
        toast({
          title: "Dispatch Complete",
          description: data?.message || "Syncs dispatched",
        });
        await fetchSchedules();
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to dispatch syncs", variant: "destructive" });
    } finally {
      setIsDispatching(false);
    }
  };

  const handleForceSync = async (sport: string, dataType: string) => {
    const key = `${sport}:${dataType}`;
    setRunningSync(key);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-syncs", {
        body: { force: [key] },
      });

      if (error) {
        toast({ title: `${key} Failed`, description: error.message, variant: "destructive" });
      } else {
        toast({
          title: `${key} Dispatched`,
          description: data?.message || "Sync started — check back in 30s for results.",
        });
        // Refresh after a short delay to show results
        setTimeout(() => fetchSchedules(), 5000);
      }
    } catch (err) {
      toast({ title: "Error", description: `Failed to run ${key}`, variant: "destructive" });
    } finally {
      setRunningSync(null);
      await fetchSchedules();
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-[8px] text-muted-foreground">Never</Badge>;
    if (status === "success") return <Badge variant="outline" className="text-[8px] text-terminal-green border-terminal-green/50">OK</Badge>;
    if (status === "failed") return <Badge variant="outline" className="text-[8px] text-destructive border-destructive/50">Fail</Badge>;
    if (status === "stopped") return <Badge variant="outline" className="text-[8px] text-terminal-amber border-terminal-amber/50">Stop</Badge>;
    return <Badge variant="outline" className="text-[8px]">{status}</Badge>;
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return "Never";
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  const getNextSync = (row: ScheduleRow): string => {
    if (!row.is_enabled) return "Disabled";
    if (!row.last_sync_at || !row.cron_interval) return "Due now";
    const intervalMatch = row.cron_interval.match(/^(\d+)(h|m|d)$/);
    if (!intervalMatch) return "Due now";
    const value = parseInt(intervalMatch[1]);
    const unit = intervalMatch[2];
    const ms = unit === "m" ? value * 60000 : unit === "h" ? value * 3600000 : value * 86400000;
    const nextTime = new Date(new Date(row.last_sync_at).getTime() + ms);
    if (nextTime <= new Date()) return "Due now";
    return formatDistanceToNow(nextTime, { addSuffix: true });
  };

  if (loading) {
    return (
      <Card className="bg-card border-primary/30">
        <CardContent className="py-4 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-terminal-cyan/30">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
            <CalendarClock className="w-3 h-3 text-terminal-cyan" />
            Automated Sync Schedule
          </CardTitle>
          <Button
            size="sm"
            className="bg-terminal-cyan hover:bg-terminal-cyan/80 text-background font-mono text-[10px] h-6 px-3"
            onClick={handleDispatchAll}
            disabled={isDispatching}
          >
            {isDispatching ? (
              <><Loader2 className="w-2 h-2 mr-1 animate-spin" />Dispatching...</>
            ) : (
              <><Zap className="w-2 h-2 mr-1" />Run Due Syncs</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3">
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[10px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1 px-1">On</th>
                <th className="text-left py-1 px-1">Sport</th>
                <th className="text-left py-1 px-1">Type</th>
                <th className="text-left py-1 px-1">Interval</th>
                <th className="text-left py-1 px-1">Last Sync</th>
                <th className="text-left py-1 px-1">Status</th>
                <th className="text-right py-1 px-1">Records</th>
                <th className="text-left py-1 px-1">Next</th>
                <th className="text-center py-1 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((row) => (
                <tr
                  key={`${row.sport}-${row.data_type}`}
                  className={`border-b border-border/50 ${!row.is_enabled ? "opacity-50" : ""} ${row.last_sync_status === "failed" ? "bg-destructive/5" : ""}`}
                >
                  <td className="py-1 px-1">
                    <Switch
                      checked={row.is_enabled}
                      onCheckedChange={(checked) => toggleEnabled(row.sport, row.data_type, checked)}
                      className="scale-50"
                    />
                  </td>
                  <td className="py-1 px-1 font-medium">{row.sport}</td>
                  <td className="py-1 px-1 text-muted-foreground">{row.data_type}</td>
                  <td className="py-1 px-1">
                    <Badge variant="outline" className="text-[8px] px-1">{row.cron_interval || "24h"}</Badge>
                  </td>
                  <td className="py-1 px-1 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-2 h-2" />
                      {formatLastSync(row.last_sync_at)}
                    </span>
                  </td>
                  <td className="py-1 px-1">{getStatusBadge(row.last_sync_status)}</td>
                  <td className="py-1 px-1 text-right">{row.records_synced ?? "—"}</td>
                  <td className="py-1 px-1 text-terminal-cyan">{getNextSync(row)}</td>
                  <td className="py-1 px-1 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-[9px] font-mono text-terminal-cyan hover:text-terminal-green hover:bg-terminal-green/10"
                      disabled={runningSync === `${row.sport}:${row.data_type}` || !row.is_enabled}
                      onClick={() => handleForceSync(row.sport, row.data_type)}
                    >
                      {runningSync === `${row.sport}:${row.data_type}` ? (
                        <Loader2 className="w-2 h-2 animate-spin" />
                      ) : (
                        <><Play className="w-2 h-2 mr-0.5" />Run</>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {schedules.some(r => r.error_message) && (
          <div className="mt-2 space-y-1">
            {schedules.filter(r => r.error_message).map(r => (
              <div key={`${r.sport}-${r.data_type}-err`} className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1 font-mono text-[9px] text-destructive">
                {r.sport}/{r.data_type}: {r.error_message}
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 text-[9px] text-muted-foreground font-mono">
          Tip: Set up an external cron (e.g., cron-job.org) to call the dispatch-syncs function every 5-10 minutes.
        </div>
      </CardContent>
    </Card>
  );
}
