import type { MarketNoteRow } from "@/lib/marketNotes";

// A credited public post beside the splits. Quieter than a pick: no price, no stake.
export function MarketNoteList({ notes }: { notes: Pick<MarketNoteRow, "id" | "body" | "credit" | "url">[] }) {
  if (!notes.length) return null;
  return (
    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      {notes.map((n) => (
        <div key={n.id} className="space-y-0.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Market Note</p>
          <p className="text-xs leading-snug text-foreground">{n.body}</p>
          <a
            href={n.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-mono text-[10px] uppercase tracking-wider text-foreground underline underline-offset-2"
          >
            {n.credit}
          </a>
        </div>
      ))}
    </div>
  );
}
