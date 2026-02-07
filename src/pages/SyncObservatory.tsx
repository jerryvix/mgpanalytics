import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, RefreshCw, Activity, Loader2 } from "lucide-react";
import {
  SyncSummaryCards,
  DataFreshnessGrid,
  SyncLogTable,
  ApiQuotaTracker,
} from "@/components/observatory";
import type { SyncLogEntry } from "@/components/observatory";

const SPORTS = ["ALL", "NFL", "NBA", "NCAAB", "NCAAF", "MLB"];
const STATUSES = ["all", "success", "failed", "partial", "running"];
const PAGE_SIZE = 25;

export default function SyncObservatory() {
  const [sportFilter, setSportFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  // Fetch sync logs with filters
  const { data: logsResult, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["sync-logs", sportFilter, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("sync_log")
        .select("*", { count: "exact" })
        .order("started_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (sportFilter !== "all") {
        query = query.eq("sport", sportFilter);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error("Error fetching sync logs:", error);
        return { logs: [], count: 0 };
      }
      return { logs: (data || []) as SyncLogEntry[], count: count || 0 };
    },
    refetchInterval: 30000, // Auto-refresh every 30s
  });

  // Fetch last 24h logs for summary cards (unfiltered)
  const { data: recentLogs = [] } = useQuery({
    queryKey: ["sync-logs-recent"],
    queryFn: async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("sync_log")
        .select("*")
        .gte("started_at", yesterday)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Error fetching recent logs:", error);
        return [];
      }
      return (data || []) as SyncLogEntry[];
    },
    refetchInterval: 30000,
  });

  const logs = logsResult?.logs || [];
  const totalCount = logsResult?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/admin">
            <Button variant="ghost" size="sm" className="gap-1 font-mono text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3 h-3" />
              Admin Panel
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-terminal-cyan" />
            <h1 className="text-lg font-mono font-bold text-foreground tracking-tight">SYNC OBSERVATORY</h1>
          </div>
          <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan text-[10px]">
            ADMIN
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 font-mono text-xs border-terminal-cyan/50 hover:bg-terminal-cyan/10"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <SyncSummaryCards syncLogs={recentLogs} />

      {/* API Quota */}
      <ApiQuotaTracker syncLogs={recentLogs} />

      {/* Data Freshness Grid */}
      <DataFreshnessGrid syncLogs={recentLogs} />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground uppercase">Sport:</span>
          <Select value={sportFilter} onValueChange={(v) => { setSportFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[120px] h-8 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {SPORTS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground uppercase">Status:</span>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[120px] h-8 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground">
          {totalCount} log{totalCount !== 1 ? "s" : ""} found
        </div>
      </div>

      {/* Sync Log Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-terminal-cyan" />
          <span className="ml-2 font-mono text-sm text-muted-foreground">Loading sync history...</span>
        </div>
      ) : (
        <SyncLogTable
          syncLogs={logs}
          page={page}
          onPageChange={setPage}
          totalCount={totalCount}
        />
      )}

    </div>
  );
}
