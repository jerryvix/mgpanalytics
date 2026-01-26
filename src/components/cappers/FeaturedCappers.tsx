import { Star } from "lucide-react";
import { CapperCard } from "./CapperCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Capper } from "@/types/capper";

interface FeaturedCappersProps {
  cappers: Capper[];
  isLoading: boolean;
  followedCapperIds: string[];
  onFollow: (capperId: string) => void;
  onUnfollow: (capperId: string) => void;
  followLoading: boolean;
}

export function FeaturedCappers({
  cappers,
  isLoading,
  followedCapperIds,
  onFollow,
  onUnfollow,
  followLoading,
}: FeaturedCappersProps) {
  if (isLoading) {
    return (
      <section className="space-y-4">
      <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-accent-foreground fill-accent" />
          <h2 className="text-xl font-semibold">Featured Cappers</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (cappers.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-accent-foreground fill-accent" />
        <h2 className="text-xl font-semibold">Featured Cappers</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cappers.slice(0, 4).map((capper) => (
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
    </section>
  );
}
