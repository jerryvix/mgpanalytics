import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { SyncLogEntry } from "./SyncSummaryCards";

interface SyncLogTableProps {
  syncLogs: SyncLogEntry[];
  page: number;
  onPageChange: (page: number) => void;
  totalCount: number;
}

const PAGE_SIZE = 25;

function getStatusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <Badge
          variant="outline"
          className="border-terminal-green/50 text-terminal-green text-[9px] px-1.5 py-0"
        >
          OK
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="outline"
          className="border-destructive/50 text-destructive text-[9px] px-1.5 py-0"
        >
          FAIL
        </Badge>
      );
    case "partial":
      return (
        <Badge
          variant="outline"
          className="border-terminal-amber/50 text-terminal-amber text-[9px] px-1.5 py-0"
        >
          PARTIAL
        </Badge>
      );
    case "running":
      return (
        <Badge
          variant="outline"
          className="border-terminal-cyan/50 text-terminal-cyan text-[9px] px-1.5 py-0"
        >
          <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
          RUN
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="border-muted-foreground/50 text-muted-foreground text-[9px] px-1.5 py-0"
        >
          {status.toUpperCase()}
        </Badge>
      );
  }
}

function formatDetails(details: Record<string, unknown> | null): { key: string; value: string }[] {
  if (!details) return [];
  return Object.entries(details).map(([key, value]) => ({
    key,
    value: typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? ""),
  }));
}

export function SyncLogTable({ syncLogs, page, onPageChange, totalCount }: SyncLogTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-xs text-muted-foreground tracking-wider">
            SYNC LOG
          </CardTitle>
          <span className="font-mono text-[10px] text-muted-foreground">
            {totalCount.toLocaleString()} entries
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-3 px-4 overflow-x-auto">
        <table className="w-full font-mono text-[10px]">
          <thead>
            <tr className="border-b border-border">
              <th className="w-4" />
              <th className="text-left py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                TIME
              </th>
              <th className="text-left py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                SPORT
              </th>
              <th className="text-left py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                TYPE
              </th>
              <th className="text-left py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                FUNCTION
              </th>
              <th className="text-left py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                TRIGGER
              </th>
              <th className="text-left py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                STATUS
              </th>
              <th className="text-right py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                DURATION
              </th>
              <th className="text-right py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                RECORDS
              </th>
              <th className="text-right py-1.5 pr-3 text-muted-foreground font-normal tracking-wider">
                API REQS
              </th>
              <th className="text-left py-1.5 text-muted-foreground font-normal tracking-wider">
                ERROR
              </th>
            </tr>
          </thead>
          <tbody>
            {syncLogs.map((log) => {
              const isExpanded = expandedRow === log.id;
              const detailPairs = formatDetails(log.details);
              const recordsTotal = (log.records_added ?? 0) + (log.records_updated ?? 0);

              return (
                <TooltipProvider key={log.id}>
                  <tr
                    className={`border-b border-border/50 cursor-pointer hover:bg-muted/20 ${
                      isExpanded ? "bg-muted/10" : ""
                    }`}
                    onClick={() => toggleRow(log.id)}
                  >
                    <td className="py-1.5 pl-1">
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-foreground whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="font-mono text-[10px]">
                          {format(new Date(log.started_at), "yyyy-MM-dd HH:mm:ss 'UTC'")}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-1.5 pr-3 text-terminal-cyan">{log.sport}</td>
                    <td className="py-1.5 pr-3 text-foreground">{log.data_type}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                      {log.function_name}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{log.trigger_source}</td>
                    <td className="py-1.5 pr-3">{getStatusBadge(log.status)}</td>
                    <td className="py-1.5 pr-3 text-right text-foreground">
                      {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : "--"}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-foreground">
                      {recordsTotal > 0 ? (
                        <span>
                          {recordsTotal}
                          {log.records_added != null && log.records_added > 0 && (
                            <span className="text-terminal-green ml-1">+{log.records_added}</span>
                          )}
                        </span>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-foreground">
                      {log.api_requests_used ?? "--"}
                    </td>
                    <td className="py-1.5 text-destructive truncate max-w-[200px]">
                      {log.error_message ?? ""}
                    </td>
                  </tr>
                  {isExpanded && detailPairs.length > 0 && (
                    <tr className="bg-muted/5">
                      <td colSpan={11} className="py-2 px-6">
                        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-[10px]">
                          {detailPairs.map(({ key, value }) => (
                            <div key={key} className="contents">
                              <span className="text-terminal-cyan">{key}:</span>
                              <span className="text-foreground whitespace-pre-wrap break-all">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </TooltipProvider>
              );
            })}
            {syncLogs.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-muted-foreground">
                  No sync logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="font-mono text-[10px] text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-[10px] h-7 px-3"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-[10px] h-7 px-3"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
