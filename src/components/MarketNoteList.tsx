import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import type { MarketNoteRow } from "@/lib/marketNotes";
import { timeAgo, xAccountDisplay } from "@/lib/xAccounts";

// Word from the Window (D-102, D-104): credited public posts from people in the industry,
// styled as posts, not game data. No team or line chips, so a note never reads like a pick.
type Note = Pick<MarketNoteRow, "id" | "body" | "credit" | "url"> & Partial<Pick<MarketNoteRow, "handle" | "author_name" | "posted_at">>;

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-label="X" role="img" className="h-3.5 w-3.5 fill-current text-foreground">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function Avatar({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return src && !failed ? (
    <img src={src} alt="" onError={() => setFailed(true)} className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">{initials}</span>
  );
}

function NoteCard({ note: n }: { note: Note }) {
  const acct = xAccountDisplay(n.handle);
  const name = acct?.name ?? n.author_name ?? n.credit;
  const handle = n.handle ? `@${n.handle.replace(/^@/, "")}` : "";
  const meta = [handle, timeAgo(n.posted_at)].filter(Boolean).join(" · ");
  return (
    <article className="rounded-[12px] border border-[#2a2a2a] bg-[#111] p-[13px] space-y-2.5">
      <header className="flex items-center gap-2.5">
        <Avatar src={acct?.avatarUrl} name={name} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-sm font-bold text-foreground">
            <span className="truncate">{name}</span>
            {acct?.verified && <BadgeCheck className="h-4 w-4 shrink-0 fill-[#1D9BF0] text-[#111]" aria-label="Verified" />}
          </p>
          {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
        </div>
        <XLogo />
      </header>
      <p className="text-sm leading-snug text-foreground">{n.body}</p>
      <footer className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{acct?.source ? `via ${acct.source}` : ""}</span>
        <a href={n.url} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline underline-offset-2">
          View on X ↗
        </a>
      </footer>
    </article>
  );
}

export function MarketNoteList({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <section className="mt-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Word from the Window</p>
      {notes.map((n) => <NoteCard key={n.id} note={n} />)}
    </section>
  );
}
