import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { creditLine, groupTakes, pickLabel, sharedUnits, SHOW_LOGOS, whenLabel, withUnits, type GroupedTake, type TakeRow, type TakeSource } from "@/lib/takes";

// Takes (DECISIONS D-060, D-065, D-066, D-074, D-102): real picks from outside betting
// shows and credited public posts. Upcoming games only; a pick leaves at kickoff, and
// no records are shown. MGP itself gives no picks.

const SPORTS = ["NFL", "NBA", "NCAAF", "NCAAB"] as const;

async function fetchTakes(): Promise<TakeRow[]> {
  // `takes` is newer than the generated Supabase types, hence the cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("takes")
    .select("id, show, show_name, person, sport, espn_event_id, matchup, starts_at, market, pick, price, units, legs, why, risks, url")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as TakeRow[]).map((r) => {
    const raw = r.units as unknown;
    const n = typeof raw === "number" ? raw : Number(raw);
    return { ...r, units: raw == null || raw === "" || !Number.isFinite(n) ? null : n };
  });
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] ?? "X").slice(0, 2).toUpperCase();
}

function Avatar({ show, name, className }: { show: string; name: string; className?: string }) {
  const src = SHOW_LOGOS[show];
  if (!src) {
    return (
      <span aria-hidden="true" className={cn("flex items-center justify-center rounded-full bg-muted font-mono text-[11px] text-foreground", className)}>
        {initials(name)}
      </span>
    );
  }
  return <img src={src} alt="" aria-hidden="true" className={cn("rounded-full object-cover", className)} />;
}

function ShowLogos({ sources }: { sources: TakeSource[] }) {
  const unique = sources.filter((s, i) => sources.findIndex((x) => x.show === s.show) === i).slice(0, 2);
  const nameOf = (s: TakeSource) => s.person ?? s.showName;
  if (unique.length === 2) {
    return (
      <span aria-hidden="true" className="relative h-10 w-10 shrink-0">
        <Avatar show={unique[0].show} name={nameOf(unique[0])} className="absolute left-0 top-0 h-7 w-7 border-2 border-background" />
        <Avatar show={unique[1].show} name={nameOf(unique[1])} className="absolute bottom-0 right-0 h-7 w-7 border-2 border-background" />
      </span>
    );
  }
  const one = unique[0];
  return <Avatar show={one.show} name={nameOf(one)} className="h-10 w-10 shrink-0" />;
}

function Credit({ sources }: { sources: TakeSource[] }) {
  if (sources.length === 1) {
    const label = creditLine(sources);
    const url = sources[0].url;
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{label}</a>
    ) : (
      <span>{label}</span>
    );
  }
  return (
    <span>
      {sources.map((s, i) => {
        const label = s.person ? `${s.person} · ${s.showName}` : s.showName;
        const node = s.url ? (
          <a key={`${s.show}-${s.person ?? ""}`} href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{label}</a>
        ) : (
          <span key={`${s.show}-${s.person ?? ""}`}>{label}</span>
        );
        return i === 0 ? node : <span key={`sep-${s.show}-${i}`}>, {node}</span>;
      })}
    </span>
  );
}

function TakeRowView({ take }: { take: GroupedTake }) {
  const [open, setOpen] = useState(false);
  const details = take.sources.filter((s) => s.why || s.risks);
  return (
    <li className="border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <ShowLogos sources={take.sources} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold tabular-nums text-foreground">{withUnits(pickLabel(take), sharedUnits(take.sources))}</p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-foreground"><Credit sources={take.sources} /></p>
        </div>
        {details.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Hide reasons for ${take.pick}` : `Show reasons for ${take.pick}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <ChevronDown className={cn("h-5 w-5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {take.legs.length > 1 && (
        <ol className="ml-[52px] mt-2 space-y-1.5">
          {take.legs.map((leg, i) => (
            <li key={leg} className="flex gap-3 text-sm text-foreground">
              <span className="w-3 font-mono text-[11px] leading-5">{i + 1}</span>
              <span className="font-medium">{leg}</span>
            </li>
          ))}
        </ol>
      )}
      {open && (
        <div className="ml-[52px] mt-3 space-y-3 text-sm leading-relaxed text-foreground">
          {details.map((s) => (
            <div key={`${s.show}-${s.person ?? ""}`} className="space-y-2">
              {details.length > 1 && <p className="font-mono text-[11px] uppercase tracking-wider">{s.person ? `${s.person} · ${s.showName}` : s.showName}</p>}
              {s.why && (
                <p>
                  <span className="block font-mono text-[11px] uppercase tracking-wider">Why</span>
                  {s.why}
                </p>
              )}
              {s.risks && (
                <p>
                  <span className="block font-mono text-[11px] uppercase tracking-wider">Risks Flagged</span>
                  {s.risks}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export default function Takes() {
  const [sport, setSport] = useState<string>("All Sports");
  const { data, isLoading, isError } = useQuery({ queryKey: ["takes"], queryFn: fetchTakes, staleTime: 5 * 60_000 });
  const games = useMemo(() => groupTakes(data ?? []), [data]);
  const present = SPORTS.filter((s) => games.some((g) => g.sport === s));
  const shown = sport === "All Sports" ? games : games.filter((g) => g.sport === sport);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Takes</h1>
      <p className="mt-1 font-mono text-xs uppercase tracking-wider text-foreground">Real Picks from Betting Experts</p>

      {present.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Sport">
          {["All Sports", ...present].map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={sport === s}
              onClick={() => setSport(s)}
              className={cn(
                "h-9 rounded-full px-4 text-sm text-foreground transition-colors",
                sport === s ? "bg-muted font-semibold" : "hover:bg-muted/60",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      )}

      {isError && <p className="mt-8 text-sm text-foreground">Takes couldn't load. Try again in a minute</p>}

      {!isLoading && !isError && shown.length === 0 && (
        <p className="mt-8 text-sm text-foreground">New picks land here around noon and 6 PM Eastern</p>
      )}

      <div className="mt-4 space-y-2">
        {shown.map((g) => (
          <section key={g.eventId} aria-label={g.matchup} className="pt-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-foreground">
              {g.sport} · {whenLabel(g.startsAt)}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{g.matchup}</h2>
            <ul className="mt-1">
              {g.takes.map((t) => <TakeRowView key={t.key} take={t} />)}
            </ul>
          </section>
        ))}
      </div>

      {shown.length > 0 && (
        <p className="mt-8 font-mono text-[11px] uppercase tracking-wider text-foreground">
          From betting shows and public posts · A pick leaves at kickoff
        </p>
      )}
    </div>
  );
}
