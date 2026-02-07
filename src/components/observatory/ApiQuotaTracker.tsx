import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { SyncLogEntry } from "./SyncSummaryCards";

interface ApiQuotaTrackerProps {
  syncLogs: SyncLogEntry[];
}

interface ApiSourceStats {
  source: string;
  label: string;
  usedToday: number;
  remaining: number | null;
  hasQuota: boolean;
  syncCountToday: number;
}

export function ApiQuotaTracker({ syncLogs }: ApiQuotaTrackerProps) {
  const todayMidnightUTC = useMemo(() => {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();
  }, []);

  const stats = useMemo((): ApiSourceStats[] => {
    const todayLogs = syncLogs.filter((log) => log.started_at >= todayMidnightUTC);

    // The Odds API
    const oddsLogs = todayLogs.filter((log) => log.api_source === "the_odds_api");
    const oddsUsed = oddsLogs.reduce((sum, log) => sum + (log.api_requests_used ?? 0), 0);
    const latestOdds = oddsLogs
      .filter((log) => log.api_requests_remaining != null)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    const oddsRemaining = latestOdds.length > 0 ? latestOdds[0].api_requests_remaining : null;

    // ESPN
    const espnLogs = todayLogs.filter((log) => log.api_source === "espn");

    // BDL (balldontlie)
    const bdlLogs = todayLogs.filter((log) => log.api_source === "balldontlie");

    return [
      {
        source: "the_odds_api",
        label: "The Odds API",
        usedToday: oddsUsed,
        remaining: oddsRemaining,
        hasQuota: true,
        syncCountToday: oddsLogs.length,
      },
      {
        source: "espn",
        label: "ESPN",
        usedToday: 0,
        remaining: null,
        hasQuota: false,
        syncCountToday: espnLogs.length,
      },
      {
        source: "bdl",
        label: "BDL",
        usedToday: 0,
        remaining: null,
        hasQuota: false,
        syncCountToday: bdlLogs.length,
      },
    ];
  }, [syncLogs, todayMidnightUTC]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="font-mono text-xs text-muted-foreground tracking-wider">
          API QUOTA USAGE
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4 space-y-4">
        {stats.map((api) => {
          const total =
            api.hasQuota && api.remaining != null
              ? api.usedToday + api.remaining
              : null;
          const usagePercent =
            total != null && total > 0 ? (api.usedToday / total) * 100 : 0;

          return (
            <div key={api.source} className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-foreground font-semibold tracking-wider">
                  {api.label}
                </span>
                <span className="text-muted-foreground">
                  {api.syncCountToday} syncs today
                </span>
              </div>

              {api.hasQuota && total != null ? (
                <>
                  <Progress
                    value={usagePercent}
                    className="h-2 bg-muted"
                  />
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-muted-foreground">
                      {api.usedToday.toLocaleString()} used
                    </span>
                    <span
                      className={
                        api.remaining != null && api.remaining < 100
                          ? "text-destructive"
                          : "text-terminal-green"
                      }
                    >
                      {api.remaining != null ? api.remaining.toLocaleString() : "--"} remaining
                    </span>
                  </div>
                </>
              ) : (
                <div className="font-mono text-[10px] text-muted-foreground">
                  No rate limit -- volume tracking only
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
