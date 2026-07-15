// Compact last-N form sparkline. Each bar is one game, oldest → newest.
// A tall filled bar = a hit (or productive game); a short muted bar = no hit.
// Turns a streak/slump into a shape you read in a glance.
interface FormBarProps {
  games: boolean[]; // true = hit / productive
  className?: string;
}

export function FormBar({ games, className }: FormBarProps) {
  if (!games || games.length === 0) return null;
  const hits = games.filter(Boolean).length;
  return (
    <div
      className={`flex items-end gap-0.5 h-4 ${className ?? ""}`}
      title={`Last ${games.length} games, oldest → newest. Tall green bar = got a hit, short gray = held hitless. (${hits} of ${games.length} with a hit)`}
    >
      {games.map((hit, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-sm transition-all ${
            hit
              ? "bg-terminal-green h-4"
              : "bg-muted h-2 ring-1 ring-inset ring-foreground/50"
          }`}
        />
      ))}
    </div>
  );
}
