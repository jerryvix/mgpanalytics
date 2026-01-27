import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Users, Plus, Twitter, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LatestFromX } from "@/components/twitter";
import { useUserCapperFollows } from "@/hooks/useCappers";
import type { Capper } from "@/types/capper";
import { CAPPER_CATEGORY_ICONS } from "@/types/capper";

function formatFollowers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

export default function FeedPage() {
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

  // Fetch featured cappers for the "Latest from X" section
  const { data: featuredCappers = [], isLoading: featuredLoading } = useQuery({
    queryKey: ['featured-cappers-for-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cappers')
        .select('*')
        .eq('featured', true)
        .order('x_followers_count', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as Capper[];
    },
  });

  const isLoading = followsLoading || cappersLoading;
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
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
            Your personalized feed from cappers you follow
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Feed Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Following Section */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Cappers You Follow ({followedCappers.length})
                  </CardTitle>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/community/cappers" className="flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Find More
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : followedCappers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <h3 className="font-semibold mb-1">No Cappers Followed Yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Follow your favorite betting experts to see them here
                    </p>
                    <Button asChild>
                      <Link to="/community/cappers">Browse Cappers</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {followedCappers.map((capper) => (
                      <a
                        key={capper.id}
                        href={`https://x.com/${capper.x_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <Avatar className="h-10 w-10 ring-2 ring-border">
                          <AvatarImage src={capper.x_profile_image || undefined} alt={capper.x_display_name} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {capper.x_display_name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium group-hover:text-primary transition-colors">
                              @{capper.x_username}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {CAPPER_CATEGORY_ICONS[capper.category]}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {capper.x_display_name} • {formatFollowers(capper.x_followers_count)} followers
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </a>
                    ))}
                    <Separator className="my-3" />
                    <p className="text-xs text-muted-foreground text-center">
                      Click on any capper to view their latest tweets on X
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How It Works */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Twitter className="h-5 w-5" />
                  How the Feed Works
                </h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    📌 <strong>Follow cappers</strong> from the directory to add them to your personalized feed
                  </p>
                  <p>
                    🔗 <strong>Click any capper</strong> to view their latest tweets directly on X
                  </p>
                  <p>
                    📰 <strong>Featured tweets</strong> from top cappers are embedded in the sidebar
                  </p>
                  <p>
                    🚀 <strong>Coming soon:</strong> Full timeline integration with your followed cappers
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Latest from X - Featured Tweets */}
            <LatestFromX
              title="Featured Tweets"
              capperProfiles={featuredCappers.map(c => ({
                username: c.x_username,
                displayName: c.x_display_name,
                profileImage: c.x_profile_image,
              }))}
              showEmbeds={true}
            />

            {/* Quick Links */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/community/cappers">
                    <Users className="h-4 w-4 mr-2" />
                    Browse All Cappers
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/community/cappers/sharps">
                    <span className="mr-2">🎯</span>
                    Sharp Bettors
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/community/cappers/analysts">
                    <span className="mr-2">📊</span>
                    Analysts
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
