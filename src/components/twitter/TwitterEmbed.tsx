import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

interface TwitterEmbedProps {
  tweetUrl: string;
  className?: string;
}

// Types are defined in src/types/twitter.d.ts

export function TwitterEmbed({ tweetUrl, className }: TwitterEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadTwitterWidget = async () => {
      try {
        // Load the Twitter widgets script if not already loaded
        if (!window.twttr) {
          const script = document.createElement('script');
          script.src = 'https://platform.twitter.com/widgets.js';
          script.async = true;
          script.charset = 'utf-8';
          
          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Twitter widget'));
            document.head.appendChild(script);
          });
        }

        // Wait for twttr to be available
        await new Promise<void>((resolve) => {
          const checkTwttr = () => {
            if (window.twttr?.widgets) {
              resolve();
            } else {
              setTimeout(checkTwttr, 100);
            }
          };
          checkTwttr();
        });

        if (mounted && containerRef.current) {
          window.twttr?.widgets.load(containerRef.current);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to load tweet');
          setIsLoading(false);
        }
      }
    };

    loadTwitterWidget();

    return () => {
      mounted = false;
    };
  }, [tweetUrl]);

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground bg-muted/50 rounded-lg">
        <AlertCircle className="h-4 w-4" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {isLoading && (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      <div ref={containerRef}>
        <blockquote className="twitter-tweet" data-theme="dark">
          <a href={tweetUrl}>Loading tweet...</a>
        </blockquote>
      </div>
    </div>
  );
}
