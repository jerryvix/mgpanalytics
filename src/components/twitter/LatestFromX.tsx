import { ExternalLink, Twitter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TwitterEmbed } from './TwitterEmbed';

interface FeaturedTweet {
  tweetUrl: string;
  capperUsername: string;
  capperDisplayName: string;
}

interface LatestFromXProps {
  featuredTweets?: FeaturedTweet[];
  capperProfiles?: Array<{
    username: string;
    displayName: string;
    profileImage?: string | null;
  }>;
  title?: string;
  showEmbeds?: boolean;
}

// Sample featured tweets - in production these would come from admin curation
const SAMPLE_FEATURED_TWEETS: FeaturedTweet[] = [
  {
    tweetUrl: 'https://x.com/SharpFootball/status/1879911815847125343',
    capperUsername: 'SharpFootball',
    capperDisplayName: 'Warren Sharp',
  },
];

export function LatestFromX({ 
  featuredTweets = SAMPLE_FEATURED_TWEETS,
  capperProfiles = [],
  title = "Latest from X",
  showEmbeds = true,
}: LatestFromXProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Twitter className="h-5 w-5" />
            {title}
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
      <CardContent className="space-y-4">
        {showEmbeds && featuredTweets.length > 0 ? (
          <div className="space-y-4">
            {featuredTweets.map((tweet, index) => (
              <TwitterEmbed key={index} tweetUrl={tweet.tweetUrl} />
            ))}
          </div>
        ) : capperProfiles.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              View the latest from cappers you follow on X:
            </p>
            {capperProfiles.slice(0, 5).map((capper) => (
              <a
                key={capper.username}
                href={`https://x.com/${capper.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                  {capper.displayName.charAt(0)}
                </div>
                <div className="flex-1">
                  <span className="font-medium text-sm group-hover:text-primary transition-colors">
                    @{capper.username}
                  </span>
                  <p className="text-xs text-muted-foreground">{capper.displayName}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Twitter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Follow cappers to see their latest tweets here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
