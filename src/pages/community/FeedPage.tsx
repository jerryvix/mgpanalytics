import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Users, Plus, Twitter, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NativeTwitterTimeline, NativeFeaturedTimeline } from "@/components/twitter";
import { useUserCapperFollows } from "@/hooks/useCappers";
import type { Capper } from "@/types/capper";
import { CAPPER_CATEGORY_ICONS } from "@/types/capper";

function formatFollowers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

export default function FeedPage() {
  const navigate = useNavigate();
  const feedContainerRef = useRef<HTMLDivElement>(null);

  // Get user's followed capper IDs
  const { data: followedCapperIds = [], isLoading: followsLoading } = useUserCapperFollows();

  // Fetch the actual capper data for followed cappers
  const { data: followedCappers = [], isLoading: cappersLoading } = useQuery({
    queryKey: ['followed-cappers', followedCapperIds],
    queryFn: async () => {
      if (followedCapperIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('cappers')
        .select('*')
        .in('id', followedCapperIds);

      if (error) throw error;
      return data as Capper[];
    },
    enabled: followedCapperIds.length > 0,
  });

  // Fetch featured capper for sidebar
  const { data: featuredCapper } = useQuery({
    queryKey: ['featured-capper-sidebar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cappers')
        .select('*')
        .eq('featured', true)
        .order('x_followers_count', { ascending: false })
        .limit(1)
        .single();

      if (error) return null;
      return data as Capper;
    },
  });

  const isLoading = followsLoading || cappersLoading;

  // Scroll to specific capper's timeline
  const scrollToTimeline = (username: string) => {
    const element = document.getElementById(`timeline-${username}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Add highlight effect
      element.classList.add('ring-2', 'ring-primary');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-primary');
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Back navigation */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Twitter className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Community Feed</h1>
          </div>
          <p className="text-muted-foreground">
            Live tweets from the cappers you follow
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Cappers You Follow */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="sticky top-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Following ({followedCappers.length})
                  </CardTitle>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/community/cappers" className="flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1 flex-1">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-2 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : followedCappers.length === 0 ? (
                  <div className="text-center py-6 px-4">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">
                      No cappers followed yet
                    </p>
                    <Button size="sm" asChild>
                      <Link to="/community/cappers">Browse Cappers</Link>
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="p-2 space-y-1">
                      {followedCappers.map((capper) => (
                        <button
                          key={capper.id}
                          onClick={() => scrollToTimeline(capper.x_username)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={capper.x_profile_image || undefined} alt={capper.x_display_name} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {capper.x_display_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                              @{capper.x_username}
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">
                                {CAPPER_CATEGORY_ICONS[capper.category]}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatFollowers(capper.x_followers_count)}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Featured Timeline in Sidebar */}
            {featuredCapper && (
              <NativeFeaturedTimeline
                username={featuredCapper.x_username}
                displayName={featuredCapper.x_display_name}
                tweetLimit={1}
              />
            )}
          </div>

          {/* Main Feed - Live Timelines */}
          <div ref={feedContainerRef} className="lg:col-span-3 space-y-6">
            {isLoading ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <Skeleton className="h-32 w-full" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : followedCappers.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Twitter className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Your Feed is Empty</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Follow your favorite cappers, analysts, and betting personalities to see their live tweets here.
                  </p>
                  <Button size="lg" asChild>
                    <Link to="/community/cappers" className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Explore Cappers Directory
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Info Banner */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <Twitter className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Live X Feed</p>
                        <p className="text-xs text-muted-foreground">
                          Showing the latest tweets from {followedCappers.length} capper{followedCappers.length !== 1 ? 's' : ''} you follow. 
                          Click a name in the sidebar to jump to their timeline.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline Cards with Lazy Loading */}
                {followedCappers.map((capper) => (
                  <NativeTwitterTimeline
                    key={capper.id}
                    capper={capper}
                    tweetLimit={3}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
