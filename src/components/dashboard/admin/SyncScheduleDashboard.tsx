import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
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
  const [sportFilter, setSportFilter] = useState<string>("all");

  const fetchSchedules = async () => {
    const { data, error } = await supabase
      .from("sync_schedule")
      .select("sport, data_type, cron_interval, is_enabled, last_sync_at, last_sync_status, records_synced, error_message")
      .order("sport")
      .order("data_type");

    if (!error && data) {
      setSchedules(data as unknown as ScheduleRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const toggleEnabled = async (sport: string, dataType: string, enabled: boolean) => {
    await supabase
      .from("sync_schedule")
      .update({ is_enabled: enabled } as never)
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
    if (status === "running") return <Badge variant="outline" className="text-[8px] text-terminal-amber border-terminal-amber/50">Running</Badge>;
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

  // Group schedules by sport
  const sports = useMemo(() => {
    const allSports = [...new Set(schedules.map(s => s.sport))];
    return allSports.sort((a, b) => {
      // Put ALL first, then alphabetical
      if (a === "ALL") return -1;
      if (b === "ALL") return 1;
      return a.localeCompare(b);
    });
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    if (sportFilter === "all") return schedules;
    return schedules.filter(s => s.sport === sportFilter);
  }, [schedules, sportFilter]);

  const groupedSchedules = useMemo(() => {
    const groups: Record<string, ScheduleRow[]> = {};
    for (const row of filteredSchedules) {
      if (!groups[row.sport]) groups[row.sport] = [];
      groups[row.sport].push(row);
    }
    return groups;
  }, [filteredSchedules]);

  const sportColor = (sport: string) => {
    switch (sport) {
      case "NBA": return "text-orange-400";
      case "NFL": return "text-blue-400";
      case "NCAAB": return "text-purple-400";
      case "NCAAF": return "text-red-400";
      case "MLB": return "text-green-400";
      case "ALL": return "text-terminal-cyan";
      default: return "text-muted-foreground";
    }
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
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
            <CalendarClock className="w-3 h-3 text-terminal-cyan" />
            Automated Sync Schedule
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="h-6 w-28 text-[10px] font-mono">
                <SelectValue placeholder="All Sports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-mono">All Sports</SelectItem>
                {sports.map(s => (
                  <SelectItem key={s} value={s} className="text-xs font-mono">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3 space-y-3">
        {Object.entries(groupedSchedules).map(([sport, rows]) => (
          <div key={sport}>
            {/* Sport group header */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[11px] font-mono font-bold ${sportColor(sport)}`}>{sport}</span>
              <div className="flex-1 border-b border-border/30" />
              <span className="text-[9px] text-muted-foreground font-mono">{rows.length} sync{rows.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Table for this sport */}
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[10px]">
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.sport}-${row.data_type}`}
                      className={`border-b border-border/30 ${!row.is_enabled ? "opacity-40" : ""} ${row.last_sync_status === "failed" ? "bg-destructive/5" : ""}`}
                    >
                      <td className="py-1 px-1 w-8">
                        <Switch
                          checked={row.is_enabled}
                          onCheckedChange={(checked) => toggleEnabled(row.sport, row.data_type, checked)}
                          className="scale-50"
                        />
                      </td>
                      <td className="py-1 px-1 text-muted-foreground w-28">{row.data_type}</td>
                      <td className="py-1 px-1 w-12">
                        <Badge variant="outline" className="text-[8px] px-1">{row.cron_interval || "24h"}</Badge>
                      </td>
                      <td className="py-1 px-1 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-2 h-2" />
                          {formatLastSync(row.last_sync_at)}
                        </span>
                      </td>
                      <td className="py-1 px-1 w-12">{getStatusBadge(row.last_sync_status)}</td>
                      <td className="py-1 px-1 text-right w-12">{row.records_synced ?? "—"}</td>
                      <td className="py-1 px-1 text-terminal-cyan w-28">{getNextSync(row)}</td>
                      <td className="py-1 px-1 text-right w-14">
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
          </div>
        ))}

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
