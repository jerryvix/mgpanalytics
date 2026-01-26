import { useState, useMemo } from "react";
import { Users } from "lucide-react";
import { CappersFilters, CappersGrid, FeaturedCappers } from "@/components/cappers";
import { useCappers, useFeaturedCappers, useUserCapperFollows, useFollowCapper, useUnfollowCapper } from "@/hooks/useCappers";
import type { CapperCategory, Sport } from "@/types/capper";
import { Separator } from "@/components/ui/separator";

export default function CappersDirectory() {
  // Filter state
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [category, setCategory] = useState<CapperCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'mgp_followers' | 'x_followers_count' | 'added_at'>('mgp_followers');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useMemo(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Data hooks
  const { data: featuredCappers = [], isLoading: featuredLoading } = useFeaturedCappers();
  const { data: allCappers = [], isLoading: cappersLoading } = useCappers({
    search: debouncedSearch,
    sport,
    category,
    sortBy,
  });
  const { data: followedCapperIds = [] } = useUserCapperFollows();

  // Mutation hooks
  const followMutation = useFollowCapper();
  const unfollowMutation = useUnfollowCapper();

  const handleFollow = (capperId: string) => {
    followMutation.mutate(capperId);
  };

  const handleUnfollow = (capperId: string) => {
    unfollowMutation.mutate(capperId);
  };

  const isFollowLoading = followMutation.isPending || unfollowMutation.isPending;

  // Filter out featured cappers from main list when showing featured section
  const nonFeaturedCappers = allCappers.filter(c => !c.featured);
  const showFeatured = !debouncedSearch && sport === 'all' && category === 'all';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Users className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Cappers Directory</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Find and follow the best sports betting minds on X
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <CappersFilters
            search={search}
            onSearchChange={setSearch}
            sport={sport}
            onSportChange={setSport}
            category={category}
            onCategoryChange={setCategory}
            sortBy={sortBy}
            onSortChange={setSortBy}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>

        {/* Featured Section */}
        {showFeatured && (
          <>
            <FeaturedCappers
              cappers={featuredCappers}
              isLoading={featuredLoading}
              followedCapperIds={followedCapperIds}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              followLoading={isFollowLoading}
            />
            <Separator className="my-8" />
          </>
        )}

        {/* All Cappers */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {showFeatured ? 'All Cappers' : 'Cappers'}
            </h2>
            <span className="text-sm text-muted-foreground">
              Showing {showFeatured ? nonFeaturedCappers.length : allCappers.length} cappers
            </span>
          </div>
          <CappersGrid
            cappers={showFeatured ? nonFeaturedCappers : allCappers}
            isLoading={cappersLoading}
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
