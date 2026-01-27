import { useState } from 'react';
import { TwitterTimelineEmbed } from 'react-twitter-embed';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Twitter, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FeaturedTimelineEmbedProps {
  username: string;
  displayName: string;
  tweetLimit?: number;
}

export function FeaturedTimelineEmbed({ 
  username, 
  displayName,
  tweetLimit = 1 
}: FeaturedTimelineEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);

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
              href="https://x.com"
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
        <div style={{ display: isLoading ? 'none' : 'block' }}>
          <TwitterTimelineEmbed
            sourceType="profile"
            screenName={username}
            options={{
              height: 500,
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
      </CardContent>
    </Card>
  );
}
