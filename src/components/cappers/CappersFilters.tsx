import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, LayoutGrid, List } from "lucide-react";
import type { CapperCategory, Sport, CapperTier } from "@/types/capper";
import { CAPPER_CATEGORY_LABELS } from "@/types/capper";

interface CappersFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  sport: Sport | 'all';
  onSportChange: (value: Sport | 'all') => void;
  category: CapperCategory | 'all';
  onCategoryChange: (value: CapperCategory | 'all') => void;
  sortBy: 'mgp_followers' | 'x_followers_count' | 'added_at';
  onSortChange: (value: 'mgp_followers' | 'x_followers_count' | 'added_at') => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (value: 'grid' | 'list') => void;
}

const SPORTS: (Sport | 'all')[] = ['all', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAAB', 'NCAAF'];
const CATEGORIES: (CapperCategory | 'all')[] = ['all', 'sharp_bettor', 'analyst', 'media', 'insider', 'odds_provider', 'community'];

export function CappersFilters({
  search,
  onSearchChange,
  sport,
  onSportChange,
  category,
  onCategoryChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
}: CappersFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search cappers..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Sport Filter */}
        <Select value={sport} onValueChange={(v) => onSportChange(v as Sport | 'all')}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Sport" />
          </SelectTrigger>
          <SelectContent>
            {SPORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? 'All Sports' : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category Filter */}
        <Select value={category} onValueChange={(v) => onCategoryChange(v as CapperCategory | 'all')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c === 'all' ? 'All Categories' : CAPPER_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort By */}
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as 'mgp_followers' | 'x_followers_count' | 'added_at')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mgp_followers">MGP Followers</SelectItem>
            <SelectItem value="x_followers_count">X Followers</SelectItem>
            <SelectItem value="added_at">Recently Added</SelectItem>
          </SelectContent>
        </Select>

        {/* View Mode Toggle */}
        <div className="ml-auto">
          <ToggleGroup 
            type="single" 
            value={viewMode} 
            onValueChange={(v) => v && onViewModeChange(v as 'grid' | 'list')}
          >
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </div>
  );
}
