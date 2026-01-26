import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExternalLink, UserPlus, UserMinus, CheckCircle, Star, Users } from "lucide-react";
import type { Capper } from "@/types/capper";
import { CAPPER_CATEGORY_LABELS, CAPPER_CATEGORY_ICONS, CAPPER_TIER_COLORS } from "@/types/capper";
import { cn } from "@/lib/utils";

interface CapperCardProps {
  capper: Capper;
  isFollowing: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  isLoading?: boolean;
}

function formatFollowers(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}K`;
  }
  return count.toString();
}

export function CapperCard({ capper, isFollowing, onFollow, onUnfollow, isLoading }: CapperCardProps) {
  const categoryIcon = CAPPER_CATEGORY_ICONS[capper.category];
  const categoryLabel = CAPPER_CATEGORY_LABELS[capper.category];
  const tierColor = CAPPER_TIER_COLORS[capper.tier];

  return (
    <Card className="group hover:border-primary/50 transition-colors">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="h-14 w-14 sm:h-16 sm:w-16 ring-2 ring-border">
            <AvatarImage src={capper.x_profile_image || undefined} alt={capper.x_display_name} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {capper.x_display_name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">
                @{capper.x_username}
              </h3>
              {capper.x_verified && (
                <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
              )}
              {capper.mgp_verified && (
                <Badge variant="secondary" className="text-xs">
                  ✓ MGP Verified
                </Badge>
              )}
              {capper.featured && (
                <Star className="h-4 w-4 text-accent-foreground fill-accent flex-shrink-0" />
              )}
            </div>
            
            <p className="text-sm text-muted-foreground">
              {capper.x_display_name} • <span className={cn("capitalize", tierColor)}>{capper.tier}</span>
            </p>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {categoryIcon} {categoryLabel}
              </Badge>
              {capper.sports.slice(0, 3).map((sport) => (
                <Badge key={sport} variant="secondary" className="text-xs">
                  {sport}
                </Badge>
              ))}
              {capper.sports.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{capper.sports.length - 3}
                </Badge>
              )}
            </div>

            {capper.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {capper.description}
              </p>
            )}

            {capper.specialty.length > 0 && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Specialty:</span>
                {capper.specialty.slice(0, 3).map((spec) => (
                  <span key={spec} className="text-xs text-primary">
                    {spec}{capper.specialty.indexOf(spec) < Math.min(2, capper.specialty.length - 1) ? ',' : ''}
                  </span>
                ))}
              </div>
            )}

            {/* Stats Row */}
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {formatFollowers(capper.x_followers_count)} X followers
              </span>
              <span className="text-primary font-medium">
                {capper.mgp_followers.toLocaleString()} MGP users
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
          <Button
            variant={isFollowing ? "outline" : "default"}
            size="sm"
            className="flex-1"
            onClick={isFollowing ? onUnfollow : onFollow}
            disabled={isLoading}
          >
            {isFollowing ? (
              <>
                <UserMinus className="h-4 w-4 mr-1" />
                Unfollow
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-1" />
                Follow
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a
              href={`https://x.com/${capper.x_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <ExternalLink className="h-4 w-4" />
              View on X
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
