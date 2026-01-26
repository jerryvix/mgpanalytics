import { CapperCard } from "./CapperCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Capper } from "@/types/capper";
import { cn } from "@/lib/utils";

interface CappersGridProps {
  cappers: Capper[];
  isLoading: boolean;
  followedCapperIds: string[];
  onFollow: (capperId: string) => void;
  onUnfollow: (capperId: string) => void;
  followLoading: boolean;
  viewMode: 'grid' | 'list';
}

export function CappersGrid({
  cappers,
  isLoading,
  followedCapperIds,
  onFollow,
  onUnfollow,
  followLoading,
  viewMode,
}: CappersGridProps) {
  if (isLoading) {
    return (
      <div className={cn(
        viewMode === 'grid' 
          ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          : "space-y-4"
      )}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  if (cappers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No cappers found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className={cn(
      viewMode === 'grid' 
        ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        : "space-y-4"
    )}>
      {cappers.map((capper) => (
        <CapperCard
          key={capper.id}
          capper={capper}
          isFollowing={followedCapperIds.includes(capper.id)}
          onFollow={() => onFollow(capper.id)}
          onUnfollow={() => onUnfollow(capper.id)}
          isLoading={followLoading}
        />
      ))}
    </div>
  );
}
