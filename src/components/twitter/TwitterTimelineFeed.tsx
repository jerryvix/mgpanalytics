import { useEffect, useRef, useState } from 'react';
import { TwitterTimelineEmbed } from 'react-twitter-embed';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Capper } from '@/types/capper';
import { CAPPER_CATEGORY_ICONS } from '@/types/capper';

interface TwitterTimelineFeedProps {
  capper: Capper;
  tweetLimit?: number;
  onVisible?: () => void;
}

export function TwitterTimelineFeed({ capper, tweetLimit = 3, onVisible }: TwitterTimelineFeedProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lazy loading with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
            onVisible?.();
          }
        });
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isVisible, onVisible]);

  return (
    <Card 
      ref={containerRef} 
      id={`timeline-${capper.x_username}`}
      className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm scroll-mt-24"
    >
      {/* Capper Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <Avatar className="h-10 w-10 ring-2 ring-border">
          <AvatarImage src={capper.x_profile_image || undefined} alt={capper.x_display_name} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {capper.x_display_name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {capper.x_display_name}
            </span>
            <Badge variant="outline" className="text-xs">
              {CAPPER_CATEGORY_ICONS[capper.category]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">@{capper.x_username}</p>
        </div>
        <a
          href={`https://x.com/${capper.x_username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Timeline Content */}
      <CardContent className="p-0">
        {!isVisible ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="twitter-timeline-wrapper">
            {isLoading && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
            <div style={{ display: isLoading ? 'none' : 'block' }}>
              <TwitterTimelineEmbed
                sourceType="profile"
                screenName={capper.x_username}
                options={{
                  height: 400,
                  tweetLimit: tweetLimit,
                }}
                theme="dark"
                transparent
                noBorders
                noFooter
                noHeader
                onLoad={() => setIsLoading(false)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
