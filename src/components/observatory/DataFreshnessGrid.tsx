import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SyncLogEntry } from "./SyncSummaryCards";

interface DataFreshnessGridProps {
  syncLogs: SyncLogEntry[];
}

interface FreshnessRow {
  sport: string;
  dataType: string;
  lastSuccess: string | null;
  records: number;
  durationMs: number | null;
  apiSource: string | null;
  freshnessLevel: "fresh" | "stale" | "critical";
}

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getFreshnessLevel(
  lastSuccessAt: string | null,
  _expectedIntervalMs: number = DEFAULT_INTERVAL_MS
): "fresh" | "stale" | "critical" {
  if (!lastSuccessAt) return "critical";
  const elapsed = Date.now() - new Date(lastSuccessAt).getTime();
  if (elapsed <= _expectedIntervalMs) return "fresh";
  if (elapsed <= _expectedIntervalMs * 2) return "stale";
  return "critical";
}

function getFreshnessColor(level: "fresh" | "stale" | "critical"): string {
  switch (level) {
    case "fresh":
      return "text-terminal-green";
    case "stale":
      return "text-terminal-amber";
    case "critical":
      return "text-destructive";
  }
}

function getDotColor(level: "fresh" | "stale" | "critical"): string {
  switch (level) {
    case "fresh":
      return "bg-terminal-green";
    case "stale":
      return "bg-terminal-amber";
    case "critical":
      return "bg-destructive";
  }
}

const SPORT_ORDER = ["NFL", "NBA", "NCAAB", "ALL"];

export function DataFreshnessGrid({ syncLogs }: DataFreshnessGridProps) {
  const freshnessData = useMemo(() => {
    // Group by sport/data_type, take most recent successful log
    const grouped = new Map<string, SyncLogEntry>();

    const successLogs = syncLogs
      .filter((log) => log.status === "success")
      .sort((a, b) => b.started_at.localeCompare(a.started_at));

    for (const log of successLogs) {
      const key = `${log.sport}:${log.data_type}`;
      if (!grouped.has(key)) {
        grouped.set(key, log);
      }
    }

    // Build rows
    const rows: FreshnessRow[] = [];
    for (const [, log] of grouped) {
      rows.push({
        sport: log.sport,
        dataType: log.data_type,
        lastSuccess: log.completed_at ?? log.started_at,
        records: (log.records_added ?? 0) + (log.records_updated ?? 0),
        durationMs: log.duration_ms,
        apiSource: log.api_source,
        freshnessLevel: getFreshnessLevel(log.completed_at ?? log.started_at),
      });
    }

    return rows;
  }, [syncLogs]);

  // Group rows by sport
  const bySport = useMemo(() => {
    const map = new Map<string, FreshnessRow[]>();
    for (const row of freshnessData) {
      const existing = map.get(row.sport) ?? [];
      existing.push(row);
      map.set(row.sport, existing);
    }

    // Sort sports in defined order, then alphabetically for any extras
    const sorted = Array.from(map.entries()).sort(([a], [b]) => {
      const aIdx = SPORT_ORDER.indexOf(a);
      const bIdx = SPORT_ORDER.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    return sorted;
  }, [freshnessData]);

  if (bySport.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="font-mono text-xs text-muted-foreground tracking-wider">
            DATA FRESHNESS
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="font-mono text-xs text-muted-foreground">No sync data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="font-mono text-xs text-muted-foreground tracking-wider">
          DATA FRESHNESS
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4 overflow-x-auto">
        <table className="w-full font-mono text-[10px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-4 text-muted-foreground font-normal tracking-wider">
                SPORT:TYPE
              </th>
              <th className="text-left py-1.5 pr-4 text-muted-foreground font-normal tracking-wider">
                LAST SUCCESS
              </th>
              <th className="text-right py-1.5 pr-4 text-muted-foreground font-normal tracking-wider">
                RECORDS
              </th>
              <th className="text-right py-1.5 pr-4 text-muted-foreground font-normal tracking-wider">
                DURATION
              </th>
              <th className="text-left py-1.5 text-muted-foreground font-normal tracking-wider">
                API SOURCE
              </th>
            </tr>
          </thead>
          <tbody>
            {bySport.map(([sport, rows]) => (
              rows.map((row, idx) => (
                <tr
                  key={`${sport}-${row.dataType}`}
                  className="border-b border-border/50 hover:bg-muted/20"
                >
                  <td className="py-1.5 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${getDotColor(row.freshnessLevel)}`}
                      />
                      <span className="text-foreground">
                        {idx === 0 ? sport : ""}
                        <span className="text-muted-foreground">:</span>
                        {row.dataType}
                      </span>
                    </div>
                  </td>
                  <td className={`py-1.5 pr-4 ${getFreshnessColor(row.freshnessLevel)}`}>
                    {row.lastSuccess
                      ? formatDistanceToNow(new Date(row.lastSuccess), { addSuffix: true })
                      : "never"}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-foreground">
                    {row.records.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-foreground">
                    {row.durationMs != null ? `${(row.durationMs / 1000).toFixed(1)}s` : "--"}
                  </td>
                  <td className="py-1.5 text-muted-foreground">
                    {row.apiSource ?? "--"}
                  </td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
