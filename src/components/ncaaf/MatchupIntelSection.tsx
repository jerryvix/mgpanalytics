import { Users, History, GraduationCap, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatchupIntel } from "@/hooks/useMatchupIntel";
import type { ContinuityVerdict, SignalLean } from "@/utils/matchupIntel";
import type { ContinuityRow } from "@/hooks/useMatchupIntel";

// Matchup Intel - the CFB pre-game read inside GameInsightsSheet. Executive
// summary first (composite lean tile), then drill-down cards per signal.
// House rule applies: a signal without verified data doesn't render.

const CONTINUITY_META: Record<ContinuityVerdict, { label: string; className: string }> = {
  intact: { label: "INTACT", className: "bg-terminal-green/20 text-terminal-green border-terminal-green/50" },
  retooled: { label: "RETOOLED", className: "bg-terminal-amber/20 text-terminal-amber border-terminal-amber/50" },
  rebuilt: { label: "REBUILT", className: "bg-terminal-red/20 text-terminal-red border-terminal-red/50" },
  insufficient: { label: "NO DATA", className: "bg-muted text-muted-foreground border-border" },
};

const fmtPct = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v)}%`);
// Keep prospect lists scannable on a phone; a loaded roster collapses to a count
const MAX_PROSPECTS_SHOWN = 4;

function leanLabel(lean: SignalLean, home: string, away: string): string {
  switch (lean) {
    case "home":
      return home;
    case "away":
      return away;
    case "even":
      return "EVEN";
    default:
      return "NO READ";
  }
}

export function MatchupIntelSection({
  homeTeamName,
  visitorTeamName,
  gameDate,
}: {
  homeTeamName: string;
  visitorTeamName: string;
  gameDate: string;
}) {
  // CFB season labeled by start year: Jul-Dec = that year, Jan-Jun = prior
  const d = new Date(gameDate);
  const season = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;

  const intel = useMatchupIntel(homeTeamName, visitorTeamName, season);

  if (intel.isLoading) {
    return (
      <section>
        <SectionTitle icon={<Gauge className="w-3.5 h-3.5" />} text="Matchup Intel" />
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>
    );
  }

  // No signal has data (FCS teams, preseason gaps) - render nothing at all
  if (!intel.matched) return null;

  const home = intel.homeSchool ?? homeTeamName;
  const away = intel.awaySchool ?? visitorTeamName;
  const { continuity, h2h, talent, composite } = intel;

  return (
    <section>
      <SectionTitle icon={<Gauge className="w-3.5 h-3.5" />} text="Matchup Intel" />

      {/* Executive summary - the quick read */}
      <div className="border border-terminal-amber/30 rounded-lg p-3 bg-terminal-amber/5 mb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Signal Lean
          </span>
          <span className="font-mono text-sm font-bold text-terminal-amber uppercase">
            {leanLabel(composite.lean, home, away)}
          </span>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground mt-1">
          {composite.signalsUsed} of 3 signals with verified data · roster continuity weighted
          heaviest: last season matters less if the roster left.
        </p>
      </div>

      <div className="space-y-3">
        {/* Signal 3 - roster continuity (heaviest weight) */}
        {(continuity.home || continuity.away) && (
          <div className="border border-border rounded-lg p-3 bg-card/50">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              <Users className="w-3 h-3" /> Roster Continuity
              {continuity.lean !== "insufficient" && continuity.lean !== "even" && (
                <span className="ml-auto text-terminal-amber font-bold">
                  edge: {leanLabel(continuity.lean, home, away)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { school: away, row: continuity.away, verdict: continuity.awayVerdict },
                { school: home, row: continuity.home, verdict: continuity.homeVerdict },
              ].map(({ school, row, verdict }) => (
                <ContinuityCell key={school} school={school} row={row} verdict={verdict} />
              ))}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground mt-2">
              PPA = Predicted Points Added, CollegeFootballData's per-play value model.
              Returning PPA is the share of last season's production still on the roster.
            </p>
          </div>
        )}

        {/* Signal 2 - head-to-head, last 5 seasons */}
        {h2h.summary && h2h.summary.verdict !== "insufficient" && (
          <div className="border border-border rounded-lg p-3 bg-card/50">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              <History className="w-3 h-3" /> Head-to-Head · Last 5 Seasons
            </div>
            <p className="font-mono text-sm">
              {home} <b className="tabular-nums">{h2h.summary.team1Wins}</b>
              <span className="text-muted-foreground mx-1">–</span>
              <b className="tabular-nums">{h2h.summary.team2Wins}</b> {away}
              {h2h.summary.streak && (
                <span className="block text-[11px] text-terminal-amber mt-0.5">
                  {h2h.summary.streak.school} has won {h2h.summary.streak.count} straight in the series
                </span>
              )}
            </p>
            <div className="mt-2 divide-y divide-dashed divide-border">
              {h2h.games.slice(0, 5).map((g, i) => (
                <div key={i} className="py-1 font-mono text-[11px] tabular-nums flex justify-between text-muted-foreground">
                  <span>{g.season}</span>
                  <span>
                    {g.away_school} {g.away_points} @ {g.home_school} {g.home_points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signal 1 - draft talent density */}
        {talent.result.lean !== "insufficient" && (
          <div className="border border-border rounded-lg p-3 bg-card/50">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              <GraduationCap className="w-3 h-3" /> NFL Draft Talent
              {talent.result.lean !== "even" && (
                <span className="ml-auto text-terminal-amber font-bold">
                  edge: {leanLabel(talent.result.lean, home, away)}
                </span>
              )}
            </div>
            {talent.homeProspects.length === 0 && talent.awayProspects.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                No consensus top-100 prospects on either roster, so the talent edge reads even.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { school: away, prospects: talent.awayProspects },
                  { school: home, prospects: talent.homeProspects },
                ].map(({ school, prospects }) => (
                  <div key={school}>
                    <p className="font-mono text-[11px] font-bold mb-1">{school}</p>
                    {prospects.length === 0 ? (
                      <p className="font-mono text-[10px] text-muted-foreground">none on board</p>
                    ) : (
                      <>
                        {prospects.slice(0, MAX_PROSPECTS_SHOWN).map((p) => (
                          <p key={p.rank} className="font-mono text-[11px] tabular-nums leading-relaxed truncate">
                            <span className="text-terminal-amber">#{p.rank}</span> {p.player_name}
                            <span className="text-muted-foreground"> {p.position ?? ""}</span>
                          </p>
                        ))}
                        {prospects.length > MAX_PROSPECTS_SHOWN && (
                          <p className="font-mono text-[10px] text-muted-foreground">
                            +{prospects.length - MAX_PROSPECTS_SHOWN} more on board
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {talent.capturedAt && (
              <p className="font-mono text-[10px] text-muted-foreground mt-2">
                Consensus big board captured {new Date(talent.capturedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ContinuityCell({
  school,
  row,
  verdict,
}: {
  school: string;
  row: ContinuityRow | null;
  verdict: ContinuityVerdict;
}) {
  const meta = CONTINUITY_META[verdict];
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[11px] font-bold truncate">{school}</span>
        <Badge className={`${meta.className} text-[9px] font-mono px-1.5 py-0`}>{meta.label}</Badge>
      </div>
      {row ? (
        <div className="font-mono text-[11px] tabular-nums space-y-1">
          <StatRow label="Returning" value={fmtPct(row.percent_ppa)} emphasize />
          <StatRow label="Portal" value={`${row.portal_in ?? 0} in · ${row.portal_out ?? 0} out`} />
          <StatRow label="To NFL" value={`${row.draft_departures ?? 0}`} />
        </div>
      ) : (
        <p className="font-mono text-[10px] text-muted-foreground">no CFBD data</p>
      )}
    </div>
  );
}

function StatRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasize ? "font-bold text-foreground" : "text-foreground/80"}>{value}</span>
    </div>
  );
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest mb-2 text-terminal-amber">
      {icon} {text}
    </div>
  );
}
