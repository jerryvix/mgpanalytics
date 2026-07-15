import { Star } from "lucide-react";
import { useFollows, FollowEntity } from "@/hooks/useFollows";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  entity: FollowEntity;
  className?: string;
  withLabel?: boolean;
}

// A star toggle. Fills amber when followed. Stops propagation so it works
// inside clickable cards/links.
export function FollowButton({ entity, className, withLabel }: FollowButtonProps) {
  const { isFollowing, toggleFollow } = useFollows();
  const following = isFollowing(entity);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFollow(entity);
      }}
      title={following ? "Following — click to unfollow" : "Follow"}
      aria-pressed={following}
      className={cn(
        "inline-flex items-center gap-1 rounded-md p-1 transition-colors hover:bg-muted/50",
        className
      )}
    >
      <Star
        className={cn(
          "w-4 h-4 transition-colors",
          following ? "fill-terminal-amber text-terminal-amber" : "text-muted-foreground"
        )}
      />
      {withLabel && (
        <span className="text-xs font-mono text-muted-foreground">
          {following ? "Following" : "Follow"}
        </span>
      )}
    </button>
  );
}
