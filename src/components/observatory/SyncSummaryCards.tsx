import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SyncLogEntry {
  id: string;
  sport: string;
  data_type: string;
  function_name: string;
  trigger_source: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  records_added: number | null;
  records_updated: number | null;
  records_failed: number | null;
  api_source: string | null;
  api_requests_used: number | null;
  api_requests_remaining: number | null;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

interface SyncSummaryCardsProps {
  syncLogs: SyncLogEntry[];
}

export function SyncSummaryCards({ syncLogs }: SyncSummaryCardsProps) {
  const todayMidnightUTC = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  }, []);

  const last24h = useMemo(() => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return syncLogs.filter((log) => log.started_at >= cutoff);
  }, [syncLogs]);

  const syncsToday = useMemo(() => {
    return syncLogs.filter((log) => log.started_at >= todayMidnightUTC).length;
  }, [syncLogs, todayMidnightUTC]);

  const failureRate = useMemo(() => {
    if (last24h.length === 0) return 0;
    const failed = last24h.filter((log) => log.status === "failed").length;
    return (failed / last24h.length) * 100;
  }, [last24h]);

  const avgDuration = useMemo(() => {
    const successful = last24h.filter(
      (log) => log.status === "success" && log.duration_ms != null
    );
    if (successful.length === 0) return null;
    const total = successful.reduce((sum, log) => sum + (log.duration_ms ?? 0), 0);
    return total / successful.length;
  }, [last24h]);

  const oddsApiQuota = useMemo(() => {
    const todayOddsLogs = syncLogs.filter(
      (log) =>
        log.api_source === "the_odds_api" && log.started_at >= todayMidnightUTC
    );

    const usedToday = todayOddsLogs.reduce(
      (sum, log) => sum + (log.api_requests_used ?? 0),
      0
    );

    // Get the latest remaining value from the most recent log entry
    const sorted = todayOddsLogs
      .filter((log) => log.api_requests_remaining != null)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));

    const latestRemaining = sorted.length > 0 ? sorted[0].api_requests_remaining ?? 0 : 0;

    return { used: usedToday, remaining: latestRemaining };
  }, [syncLogs, todayMidnightUTC]);

  const cards = [
    {
      label: "SYNCS TODAY",
      value: syncsToday.toString(),
      color: "text-terminal-cyan",
    },
    {
      label: "FAILURE RATE (24H)",
      value: `${failureRate.toFixed(1)}%`,
      color: failureRate > 10 ? "text-destructive" : failureRate > 5 ? "text-terminal-amber" : "text-terminal-green",
    },
    {
      label: "AVG DURATION (24H)",
      value: avgDuration != null ? `${(avgDuration / 1000).toFixed(1)}s` : "--",
      color: "text-terminal-green",
    },
    {
      label: "ODDS API QUOTA",
      value: `${oddsApiQuota.used} / ${oddsApiQuota.used + oddsApiQuota.remaining}`,
      color: oddsApiQuota.remaining < 100 ? "text-destructive" : "text-terminal-cyan",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card border-border">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="font-mono text-[10px] text-muted-foreground tracking-wider">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <span className={`font-mono text-2xl font-bold ${card.color}`}>
              {card.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
