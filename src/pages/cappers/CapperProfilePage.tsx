import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, CheckCircle, Star, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CAPPER_CATEGORY_LABELS, CAPPER_CATEGORY_ICONS, CAPPER_TIER_COLORS } from "@/types/capper";
import type { Capper } from "@/types/capper";
import { cn } from "@/lib/utils";

function formatFollowers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

export default function CapperProfilePage() {
  const { username } = useParams<{ username: string }>();

  const { data: capper, isLoading, error } = useQuery({
    queryKey: ['capper', username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cappers')
        .select('*')
        .eq('x_username', username)
        .single();

      if (error) throw error;
      return data as Capper;
    },
    enabled: !!username,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !capper) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button variant="ghost" size="sm" asChild className="mb-6">
            <Link to="/community/cappers" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Directory
            </Link>
          </Button>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Capper not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const categoryIcon = CAPPER_CATEGORY_ICONS[capper.category];
  const categoryLabel = CAPPER_CATEGORY_LABELS[capper.category];
  const tierColor = CAPPER_TIER_COLORS[capper.tier];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" size="sm" asChild className="mb-6">
          <Link to="/community/cappers" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Directory
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24 ring-4 ring-border">
                <AvatarImage src={capper.x_profile_image || undefined} alt={capper.x_display_name} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {capper.x_display_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <CardTitle className="text-2xl">@{capper.x_username}</CardTitle>
                  {capper.x_verified && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                  {capper.featured && (
                    <Star className="h-5 w-5 text-accent-foreground fill-accent" />
                  )}
                </div>

                <p className="text-lg text-muted-foreground mb-2">
                  {capper.x_display_name} • <span className={cn("capitalize", tierColor)}>{capper.tier}</span>
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">
                    {categoryIcon} {categoryLabel}
                  </Badge>
                  {capper.mgp_verified && (
                    <Badge variant="secondary">✓ MGP Verified</Badge>
                  )}
                  {capper.sports.map((sport) => (
                    <Badge key={sport} variant="secondary">{sport}</Badge>
                  ))}
                </div>
              </div>

              <Button asChild>
                <a
                  href={`https://x.com/${capper.x_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on X
                </a>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {capper.description && (
              <div>
                <h3 className="font-semibold mb-2">About</h3>
                <p className="text-muted-foreground">{capper.description}</p>
              </div>
            )}

            {capper.specialty && capper.specialty.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Specialties</h3>
                <div className="flex flex-wrap gap-2">
                  {capper.specialty.map((spec) => (
                    <Badge key={spec} variant="outline">{spec}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{formatFollowers(capper.x_followers_count)}</p>
                  <p className="text-sm text-muted-foreground">X Followers</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{capper.mgp_followers.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">MGP Users Following</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
