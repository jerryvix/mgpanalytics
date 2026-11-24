import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { creditLine, groupTakes, pickLabel, SHOW_LOGOS, whenLabel, type GroupedTake, type TakeRow } from "@/lib/takes";

// Takes (DECISIONS D-060, D-065, D-066, D-074): real picks from outside betting shows,
// pulled from their newest episodes twice a day. Upcoming games only; a pick leaves at
// kickoff, and no records are shown. MGP itself gives no picks.

const SPORTS = ["NFL", "NBA", "NCAAF", "NCAAB"] as const;

async function fetchTakes(): Promise<TakeRow[]> {
  // `takes` is newer than the generated Supabase types, hence the cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("takes")
    .select("id, show, show_name, person, sport, espn_event_id, matchup, starts_at, market, pick, price, legs, why, risks")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as TakeRow[];
}

function ShowLogos({ shows }: { shows: string[] }) {
  const unique = [...new Set(shows)].slice(0, 2);
  if (unique.length === 2) {
    return (
      <span aria-hidden="true" className="relative h-10 w-10 shrink-0">
        <img src={SHOW_LOGOS[unique[0]]} alt="" className="absolute left-0 top-0 h-7 w-7 rounded-full border-2 border-background object-cover" />
        <img src={SHOW_LOGOS[unique[1]]} alt="" className="absolute bottom-0 right-0 h-7 w-7 rounded-full border-2 border-background object-cover" />
      </span>
    );
  }
  return <img src={SHOW_LOGOS[unique[0]]} alt="" aria-hidden="true" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
}

function TakeRowView({ take }: { take: GroupedTake }) {
  const [open, setOpen] = useState(false);
  const details = take.sources.filter((s) => s.why || s.risks);
  const credit = creditLine(take.sources);
  return (
    <li className="border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <ShowLogos shows={take.sources.map((s) => s.show)} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold tabular-nums text-foreground">{pickLabel(take)}</p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-foreground">{credit}</p>
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
        <p className="mt-8 text-sm text-foreground">New picks from the shows land here around noon and 6 PM Eastern</p>
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
          From each show's newest episodes · A pick leaves at kickoff
        </p>
      )}
    </div>
  );
}
