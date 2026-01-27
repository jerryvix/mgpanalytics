import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Capper } from '@/types/capper';
import { CAPPER_CATEGORY_ICONS } from '@/types/capper';
import '@/types/twitter.d.ts';

interface NativeTwitterTimelineProps {
  capper: Capper;
  tweetLimit?: number;
}

export function NativeTwitterTimeline({ capper, tweetLimit = 3 }: NativeTwitterTimelineProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Lazy loading with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
          }
        });
      },
      { rootMargin: '200px', threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isVisible]);

  // Initialize Twitter widget when visible
  useEffect(() => {
    if (!isVisible || hasInitialized.current || !timelineRef.current) return;

    const initWidget = () => {
      if (window.twttr?.widgets?.createTimeline && timelineRef.current) {
        hasInitialized.current = true;
        
        window.twttr.widgets.createTimeline(
          { sourceType: 'profile', screenName: capper.x_username },
          timelineRef.current,
          {
            height: 400,
            tweetLimit: tweetLimit,
            theme: 'dark',
            chrome: 'noheader nofooter noborders transparent',
            dnt: true,
          }
        ).then(() => {
          setIsLoading(false);
        }).catch((err) => {
          console.error('Twitter widget error:', err);
          setError('Could not load timeline');
          setIsLoading(false);
        });
      }
    };

    // Check if twttr is ready, if not wait for it
    if (window.twttr?.widgets?.createTimeline) {
      initWidget();
    } else {
      // Wait for the script to load
      const checkTwitter = setInterval(() => {
        if (window.twttr?.widgets?.createTimeline) {
          clearInterval(checkTwitter);
          initWidget();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkTwitter);
        if (!hasInitialized.current) {
          setError('Twitter widget failed to load');
          setIsLoading(false);
        }
      }, 10000);

      return () => clearInterval(checkTwitter);
    }
  }, [isVisible, capper.x_username, tweetLimit]);

  return (
    <Card 
      ref={containerRef} 
      id={`timeline-${capper.x_username}`}
      className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm scroll-mt-24 transition-all duration-300"
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
        ) : error ? (
          <div className="p-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <a
              href={`https://x.com/${capper.x_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              View @{capper.x_username} on X →
            </a>
          </div>
        ) : (
          <>
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
            <div 
              ref={timelineRef} 
              className="twitter-timeline-container"
              style={{ minHeight: isLoading ? 0 : 'auto' }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
