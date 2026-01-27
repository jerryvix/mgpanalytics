import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Twitter, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import '@/types/twitter.d.ts';

interface NativeFeaturedTimelineProps {
  username: string;
  displayName: string;
  tweetLimit?: number;
}

export function NativeFeaturedTimeline({ 
  username, 
  displayName,
  tweetLimit = 1 
}: NativeFeaturedTimelineProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current || !timelineRef.current) return;

    const initWidget = () => {
      if (window.twttr?.widgets?.createTimeline && timelineRef.current) {
        hasInitialized.current = true;
        
        window.twttr.widgets.createTimeline(
          { sourceType: 'profile', screenName: username },
          timelineRef.current,
          {
            height: 500,
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

    // Check if twttr is ready
    if (window.twttr?.widgets?.createTimeline) {
      initWidget();
    } else {
      const checkTwitter = setInterval(() => {
        if (window.twttr?.widgets?.createTimeline) {
          clearInterval(checkTwitter);
          initWidget();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkTwitter);
        if (!hasInitialized.current) {
          setError('Twitter widget failed to load');
          setIsLoading(false);
        }
      }, 10000);

      return () => clearInterval(checkTwitter);
    }
  }, [username, tweetLimit]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Twitter className="h-5 w-5" />
            Latest from X
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <a
              href={`https://x.com/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs"
            >
              Open X
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <div className="p-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <a
              href={`https://x.com/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              View @{username} on X →
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
              </div>
            )}
            <div 
              ref={timelineRef} 
              className="twitter-timeline-container"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
