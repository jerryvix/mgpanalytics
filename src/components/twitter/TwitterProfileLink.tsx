import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TwitterProfileLinkProps {
  username: string;
  displayName: string;
  profileImage?: string | null;
  followersCount?: number;
  verified?: boolean;
  description?: string;
  compact?: boolean;
  className?: string;
}

function formatFollowers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

export function TwitterProfileLink({
  username,
  displayName,
  profileImage,
  followersCount,
  verified,
  description,
  compact = false,
  className,
}: TwitterProfileLinkProps) {
  const profileUrl = `https://x.com/${username}`;

  if (compact) {
    return (
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors group",
          className
        )}
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={profileImage || undefined} alt={displayName} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm group-hover:text-primary transition-colors">
            @{username}
          </span>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    );
  }

  return (
    <Card className={cn("hover:border-primary/50 transition-colors", className)}>
      <CardContent className="p-4">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-4 group"
        >
          <Avatar className="h-12 w-12 ring-2 ring-border">
            <AvatarImage src={profileImage || undefined} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold group-hover:text-primary transition-colors">
                @{username}
              </span>
              {verified && (
                <Badge variant="secondary" className="text-xs">✓ Verified</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{displayName}</p>
            {followersCount !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatFollowers(followersCount)} followers
              </p>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {description}
              </p>
            )}
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </a>
      </CardContent>
    </Card>
  );
}
