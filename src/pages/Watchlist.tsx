import { YourTeams } from "@/components/dashboard/YourTeams";
import { MyFollows } from "@/components/dashboard/MyFollows";

export default function Watchlist() {
  return (
    <div className="space-y-6">
      <h1 className="font-mono text-sm text-foreground uppercase tracking-widest font-bold">
        My Watchlist
      </h1>
      <YourTeams />
      <MyFollows />
    </div>
  );
}
