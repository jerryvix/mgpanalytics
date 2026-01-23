import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Filter, Clock, TrendingUp, Target } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export type SortOption = "time" | "spread" | "total";
export type FilterOption = "all" | "primetime" | "close";

interface NBASlateFiltersProps {
  gamesCount: number;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
  lastUpdated: Date | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function NBASlateFilters({
  gamesCount,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  showCompleted,
  onShowCompletedChange,
  lastUpdated,
  onRefresh,
  isRefreshing,
}: NBASlateFiltersProps) {
  const getTimeAgo = (date: Date | null) => {
    if (!date) return "Never";
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes === 1) return "1 min ago";
    if (minutes < 60) return `${minutes} mins ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div className="space-y-3">
      {/* Header Row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-wide font-mono">
            NBA SLATE
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Games in the Next 48 Hours
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-terminal-cyan text-terminal-cyan font-mono">
            {gamesCount} GAMES
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="border-terminal-cyan/50 text-terminal-cyan hover:bg-terminal-cyan/10 font-mono text-xs"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center gap-4 flex-wrap bg-card/50 border border-border/50 rounded-lg p-3">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <Label className="text-xs font-mono text-muted-foreground">Sort:</Label>
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
            <SelectTrigger className="w-[120px] h-8 text-xs font-mono bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time" className="text-xs font-mono">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Time
                </div>
              </SelectItem>
              <SelectItem value="spread" className="text-xs font-mono">
                <div className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  Spread Size
                </div>
              </SelectItem>
              <SelectItem value="total" className="text-xs font-mono">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Total
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Label className="text-xs font-mono text-muted-foreground">Filter:</Label>
          <Select value={filterBy} onValueChange={(v) => onFilterChange(v as FilterOption)}>
            <SelectTrigger className="w-[140px] h-8 text-xs font-mono bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-mono">All Games</SelectItem>
              <SelectItem value="primetime" className="text-xs font-mono">Primetime Only</SelectItem>
              <SelectItem value="close" className="text-xs font-mono">Close Spreads (&lt;5)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Show Completed Toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="show-completed"
            checked={showCompleted}
            onCheckedChange={onShowCompletedChange}
            className="scale-75"
          />
          <Label htmlFor="show-completed" className="text-xs font-mono text-muted-foreground cursor-pointer">
            Show Completed
          </Label>
        </div>

        {/* Last Updated */}
        <div className="ml-auto text-[10px] font-mono text-muted-foreground">
          Updated: {getTimeAgo(lastUpdated)}
        </div>
      </div>
    </div>
  );
}
