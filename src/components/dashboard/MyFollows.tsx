import { Link } from "react-router-dom";
import { Star, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useFollows, FollowRow } from "@/hooks/useFollows";

const SPORT_SLUG: Record<string, string> = {
  NFL: "nfl",
  NBA: "nba",
  NCAAB: "ncaab",
  NCAAF: "ncaaf",
  MLB: "mlb",
};

const SPORT_EMOJI: Record<string, string> = {
  NFL: "🏈",
  NCAAF: "🏈",
  NBA: "🏀",
  NCAAB: "🏀",
  MLB: "⚾",
};

function linkFor(f: FollowRow): string {
  if (f.entity_type === "player") return `/dashboard/${SPORT_SLUG[f.sport || "mlb"] || "mlb"}/players/${f.entity_key}`;
  return `/dashboard/${SPORT_SLUG[f.sport || ""] || ""}`;
}

// Personalized "your teams & players" strip on the home page. Empty state
// nudges the user to follow, which is the on-ramp to a personalized feed.
export function MyFollows() {
  const { follows } = useFollows();

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-terminal-amber" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
            Following
          </h2>
          {follows.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {follows.length} tracked
            </span>
          )}
        </div>

        {follows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tap the <Star className="inline w-3.5 h-3.5 -mt-0.5 text-muted-foreground" /> on any team or
            player to follow them — your favorites show up here for one-tap access.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {follows.map((f) => (
              <Link
                key={f.id}
                to={linkFor(f)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs hover:border-terminal-green/40 transition-colors group"
              >
                <span>{SPORT_EMOJI[f.sport || ""] || "•"}</span>
                <span className="font-medium text-foreground group-hover:text-terminal-green transition-colors">
                  {f.entity_label || f.entity_key}
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
