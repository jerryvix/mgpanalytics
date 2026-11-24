import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  compactNumber,
  easternDateTime,
  niceMax,
  parseTraction,
  shortDay,
  sourceLabel,
  type Traction,
  type TractionDay,
} from "@/lib/traction";

// Traction (owner decision, Nov 24): accounts, guests, daily active people and Analyst
// use, from public.admin_traction (admins only; the RPC checks the role too). Days are
// US Eastern.
//
// Series colors are the dataviz reference palette's dark steps (blue, orange, aqua),
// validated on this card's surface (#171a21): every pair clears the CVD and
// normal-vision floors and 3:1 contrast. Text never wears them; swatches carry identity.
const COLOR = { app: "#3987e5", web: "#d95926", active: "#199e70" } as const;
const WINDOW_DAYS = 30;
const PLOT_H = 112; // px

async function fetchTraction(): Promise<Traction | null> {
  const { data, error } = await supabase.rpc("admin_traction", { days: WINDOW_DAYS });
  if (error) throw new Error(error.message);
  return parseTraction(data);
}

function StatTile({ label, value, caption }: { label: string; value: number; caption?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold text-foreground leading-tight">{compactNumber(value)}</div>
      {caption ? <div className="text-[10px] text-muted-foreground">{caption}</div> : null}
    </div>
  );
}

interface Segment {
  key: string;
  label: string;
  color: string;
  value: (d: TractionDay) => number;
}

/** Daily columns, stacked when there are several segments, with a per-day hover readout. */
function DailyColumns({
  title,
  days,
  segments,
  details,
  empty,
}: {
  title: string;
  days: TractionDay[];
  segments: Segment[];
  details: (d: TractionDay) => Array<{ label: string; value: number; color?: string }>;
  empty: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = days.map((d) => segments.reduce((n, s) => n + s.value(d), 0));
  const top = niceMax(Math.max(0, ...totals));
  const n = days.length;
  const h = hover === null ? null : days[hover];
  const align = hover === null ? "" : hover < 4 ? "left" : hover > n - 5 ? "right" : "center";
  const summary = `${title}, last ${n} days: ${totals.reduce((a, b) => a + b, 0)} in all`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-foreground">{title}</h3>
        {segments.length > 1 ? (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {segments.map((s) => (
              <span key={s.key} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative mt-3 flex" role="img" aria-label={summary}>
        {/* Y axis: 0 and a rounded top */}
        <div className="relative w-7 shrink-0 text-[10px] tabular-nums text-muted-foreground" style={{ height: PLOT_H }}>
          <span className="absolute -top-1.5 right-1">{compactNumber(top)}</span>
          <span className="absolute -bottom-1.5 right-1">0</span>
        </div>
        <div className="relative flex-1" style={{ height: PLOT_H }} onMouseLeave={() => setHover(null)}>
          <div className="absolute inset-x-0 top-0 border-t border-border" />
          <div className="absolute inset-x-0 bottom-0 border-t border-border" />
          <div className="absolute inset-0 flex items-end">
            {days.map((d, i) => {
              const shown = segments.map((s) => ({ s, v: s.value(d) })).filter((x) => x.v > 0);
              return (
                <div
                  key={d.day}
                  tabIndex={0}
                  aria-label={`${shortDay(d.day)}: ${details(d).map((x) => `${x.label} ${x.value}`).join(", ")}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className={`flex h-full flex-1 items-end justify-center px-px outline-none focus-visible:ring-1 focus-visible:ring-ring ${hover === i ? "bg-muted/40" : ""}`}
                >
                  <div className="flex w-full max-w-[24px] flex-col-reverse gap-[2px]">
                    {shown.map(({ s, v }, j) => (
                      <div
                        key={s.key}
                        className={j === shown.length - 1 ? "rounded-t-[4px]" : ""}
                        style={{ height: Math.max(2, Math.round((v / top) * PLOT_H)), backgroundColor: s.color }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {h ? (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md"
              style={
                align === "left"
                  ? { left: `${(hover! / n) * 100}%` }
                  : align === "right"
                    ? { right: `${((n - hover! - 1) / n) * 100}%` }
                    : { left: `${((hover! + 0.5) / n) * 100}%`, transform: "translate(-50%, -100%)" }
              }
            >
              <div className="font-medium text-foreground">{shortDay(h.day)}</div>
              {details(h).map((x) => (
                <div key={x.label} className="flex items-center gap-1.5 tabular-nums">
                  {x.color ? <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: x.color }} /> : <span className="inline-block w-2" />}
                  <span className="text-muted-foreground">{x.label}</span>
                  <span className="ml-auto pl-2 text-foreground">{x.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="ml-7 mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{n ? shortDay(days[0].day) : ""}</span>
        <span>{n > 2 ? shortDay(days[Math.floor(n / 2)].day) : ""}</span>
        <span>{n ? shortDay(days[n - 1].day) : ""}</span>
      </div>
      {totals.every((t) => t === 0) ? <p className="mt-1 text-[10px] text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

function DailyTable({ days }: { days: TractionDay[] }) {
  const cols: Array<[string, (d: TractionDay) => number]> = [
    ["Sign-Ups App", (d) => d.signups_app],
    ["Sign-Ups Web", (d) => d.signups_web],
    ["New Guests", (d) => d.new_guests],
    ["Active App", (d) => d.active_app],
    ["Active Web", (d) => d.active_web],
    ["Active Total", (d) => d.active_total],
    ["Analyst Questions", (d) => d.questions],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-1 pr-2 text-left font-normal">Day</th>
            {cols.map(([label]) => (
              <th key={label} className="px-2 py-1 text-right font-normal whitespace-nowrap">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.day} className="border-b border-border/50">
              <td className="py-1 pr-2 text-foreground whitespace-nowrap">{shortDay(d.day)}</td>
              {cols.map(([label, get]) => (
                <td key={label} className="px-2 py-1 text-right tabular-nums text-foreground">{get(d)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TractionView({ t }: { t: Traction }) {
  const [showTable, setShowTable] = useState(false);
  const today = t.daily.find((d) => d.day === t.today);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Accounts" value={t.accounts} caption={t.converted_guests ? `${t.converted_guests} from guests` : undefined} />
        <StatTile label="Guests" value={t.guests} />
        <StatTile label="Active Today" value={t.active.today} caption={today ? `App ${today.active_app}, Web ${today.active_web}` : undefined} />
        <StatTile label="Active 7 Days" value={t.active.last_7} />
        <StatTile label="Active 30 Days" value={t.active.last_30} />
        <StatTile label="Analyst Questions Today" value={t.questions_today} />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span>Thumbs Up <span className="text-foreground">{compactNumber(t.feedback.up)}</span> ({t.feedback.up_7d} in 7 days)</span>
        <span>Thumbs Down <span className="text-foreground">{compactNumber(t.feedback.down)}</span> ({t.feedback.down_7d} in 7 days)</span>
        <span>Saved Chats <span className="text-foreground">{compactNumber(t.chats.total)}</span> ({t.chats.in_window} in {t.days} days)</span>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DailyColumns
          title="Sign-Ups by Day"
          days={t.daily}
          segments={[
            { key: "app", label: "App", color: COLOR.app, value: (d) => d.signups_app },
            { key: "web", label: "Web", color: COLOR.web, value: (d) => d.signups_web },
          ]}
          details={(d) => [
            { label: "App", value: d.signups_app, color: COLOR.app },
            { label: "Web", value: d.signups_web, color: COLOR.web },
            { label: "New guests", value: d.new_guests },
          ]}
          empty="No sign-ups in this window"
        />
        <DailyColumns
          title="Active Users by Day"
          days={t.daily}
          segments={[{ key: "active", label: "Active", color: COLOR.active, value: (d) => d.active_total }]}
          details={(d) => [
            { label: "Active", value: d.active_total, color: COLOR.active },
            { label: "App", value: d.active_app },
            { label: "Web", value: d.active_web },
          ]}
          empty="No activity recorded in this window"
        />
      </div>

      <div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
          {showTable ? "Hide Table" : "Show Table"}
        </Button>
        {showTable ? <DailyTable days={t.daily} /> : null}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-medium text-foreground">Newest Accounts</h3>
        {t.newest_accounts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1 pr-2 text-left font-normal">Email</th>
                  <th className="px-2 py-1 text-left font-normal">Source</th>
                  <th className="py-1 pl-2 text-right font-normal">Joined</th>
                </tr>
              </thead>
              <tbody>
                {t.newest_accounts.map((a, i) => (
                  <tr key={`${a.email ?? "none"}-${i}`} className="border-b border-border/50">
                    <td className="py-1 pr-2 text-foreground">
                      {a.email ?? <span className="text-muted-foreground">No email</span>}
                      {a.was_guest ? <span className="ml-2 whitespace-nowrap text-[10px] text-muted-foreground">From Guest</span> : null}
                    </td>
                    <td className="px-2 py-1 text-foreground">{sourceLabel(a.signup_source)}</td>
                    <td className="py-1 pl-2 text-right tabular-nums text-foreground whitespace-nowrap">{easternDateTime(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No accounts yet</p>
        )}
      </div>
    </div>
  );
}

export function TractionCard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-traction", WINDOW_DAYS],
    queryFn: fetchTraction,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <Card className="bg-card border-terminal-cyan/30">
      <CardHeader className="py-2 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-mono text-foreground flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-terminal-cyan" />
          Traction
          <span className="font-normal text-muted-foreground">Last {WINDOW_DAYS} Days, Eastern Time</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {data?.generated_at ? (
            <span className="hidden text-[10px] text-muted-foreground sm:inline">Updated {easternDateTime(data.generated_at)}</span>
          ) : null}
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-[11px] text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading traction
          </div>
        ) : error ? (
          <p className="py-4 text-[11px] text-terminal-red">Couldn't load traction: {(error as Error).message}</p>
        ) : data ? (
          <TractionView t={data} />
        ) : (
          <p className="py-4 text-[11px] text-muted-foreground">No traction data</p>
        )}
      </CardContent>
    </Card>
  );
}
