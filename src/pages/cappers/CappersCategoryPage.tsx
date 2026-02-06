import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { CappersFilters, CappersGrid } from "@/components/cappers";
import { useCappers, useUserCapperFollows, useFollowCapper, useUnfollowCapper } from "@/hooks/useCappers";
import type { CapperCategory, Sport } from "@/types/capper";
import { Button } from "@/components/ui/button";

interface CappersCategoryPageProps {
  category: CapperCategory;
  title: string;
  description: string;
  icon: string;
}

export function CappersCategoryPage({ category, title, description, icon }: CappersCategoryPageProps) {
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [sortBy, setSortBy] = useState<'mgp_followers' | 'x_followers_count' | 'added_at'>('mgp_followers');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useMemo(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: cappers = [], isLoading } = useCappers({
    search: debouncedSearch,
    sport,
    category,
    sortBy,
  });
  const { data: followedCapperIds = [] } = useUserCapperFollows();

  const followMutation = useFollowCapper();
  const unfollowMutation = useUnfollowCapper();

  const handleFollow = (capperId: string) => followMutation.mutate(capperId);
  const handleUnfollow = (capperId: string) => unfollowMutation.mutate(capperId);
  const isFollowLoading = followMutation.isPending || unfollowMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Back navigation */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/community/cappers" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Directory
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{icon}</span>
            <h1 className="text-3xl font-bold">{title}</h1>
          </div>
          <p className="text-muted-foreground text-lg">{description}</p>
        </div>

        {/* Filters - category is fixed, so we hide the category filter */}
        <div className="mb-8">
          <CappersFilters
            search={search}
            onSearchChange={setSearch}
            sport={sport}
            onSportChange={setSport}
            category={category}
            onCategoryChange={() => {}} // No-op since category is fixed
            sortBy={sortBy}
            onSortChange={setSortBy}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            hideCategory
          />
        </div>

        {/* Results */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Showing {cappers.length} {cappers.length === 1 ? 'capper' : 'cappers'}
              </span>
            </div>
          </div>
          <CappersGrid
            cappers={cappers}
            isLoading={isLoading}
            followedCapperIds={followedCapperIds}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            followLoading={isFollowLoading}
            viewMode={viewMode}
          />
        </section>
      </div>
    </div>
  );
}
