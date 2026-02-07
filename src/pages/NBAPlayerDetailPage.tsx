import { useParams } from "react-router-dom";
import { NBAPlayerDetail } from "@/components/nba/NBAPlayerDetail";

export default function NBAPlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>();

  if (!playerId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Invalid player ID</h2>
      </div>
    );
  }

  return <NBAPlayerDetail playerId={playerId} />;
}
