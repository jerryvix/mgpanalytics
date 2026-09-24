import { TeamLogo } from "@/components/ui/TeamLogo";
import {
  eraWhip,
  handLabel,
  last3Line,
  recordKIp,
  type PitcherLine,
  type ProbableMatchup,
} from "@/services/mlb/probablePitchers";

const fmtEra = (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toFixed(2));

function fullTitle(line: PitcherLine | null | undefined, name: string | null): string | undefined {
  if (!line?.season) return name ?? undefined;
  const parts = [
    `${line.name}${handLabel(line) ? ` (${handLabel(line)})` : ""}${
      line.projected ? ", projected: MLB has not announced this starter" : ""
    }`,
    `${recordKIp(line)} · ${eraWhip(line)}`,
  ];
  const l3 = last3Line(line);
  if (l3) parts.push(`${l3} (last three starts)`);
  return parts.join("\n");
}

/** Muted marker for a starter MLB has not announced (ESPN's projection). */
export function ProjectedTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80 shrink-0 ${className}`}
      title="MLB has not announced this starter yet; this is the projected starter"
    >
      Projected
    </span>
  );
}

/**
 * One probable starter on a game card: logo, name and hand, ERA as the
 * headline number, then the season line and the last three starts.
 *
 * `line` is MLB's announced starter, a projected one (line.projected), or null
 * (TBD). `fallbackName` is only for when MLB's data could not be loaded at
 * all; callers leave it out otherwise so an unresolved projection reads TBD.
 */
export function ProbablePitcherRow({
  teamName,
  line,
  fallbackName,
}: {
  teamName: string;
  line: PitcherLine | null | undefined;
  fallbackName?: string | null;
}) {
  const name = line?.name || fallbackName || null;
  const hand = handLabel(line);
  const season = line?.season;
  const l3 = last3Line(line);
  return (
    <div className="min-w-0" title={fullTitle(line, name)}>
      <div className="flex items-center gap-2 min-w-0">
        <TeamLogo sport="MLB" name={teamName} size={14} />
        <span className={`text-xs font-mono truncate ${name ? "text-foreground" : "text-muted-foreground"}`}>
          {name || "TBD"}
        </span>
        {hand && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{hand}</span>}
        {line?.projected && <ProjectedTag />}
        {season && (
          <span className="ml-auto text-xs font-mono tabular-nums text-foreground shrink-0">
            {fmtEra(season.era)} <span className="text-muted-foreground text-[10px]">ERA</span>
          </span>
        )}
      </div>
      {season && (
        <div className="pl-[22px] text-[11px] font-mono tabular-nums text-muted-foreground leading-snug">
          {season.wins}-{season.losses} · {fmtEra(season.whip)} WHIP · {season.strikeouts} K · {season.inningsPitched} IP
        </div>
      )}
      {l3 && (
        <div className="pl-[22px] text-[11px] font-mono tabular-nums text-muted-foreground/80 leading-snug">{l3}</div>
      )}
    </div>
  );
}

const lastName = (name: string) => name.trim().split(/\s+/).pop() || name;

/**
 * " · Holmes vs Bennett" for one-line game rows, on the same rule as the
 * slate cards, game sheet, streak table and chat: MLB's announced starter by
 * last name, a projected one tagged "Projected", TBD when unresolvable.
 * Pass the synced names as fallbacks ONLY while MLB's data is missing (then
 * they show as before, without a label, since official and projected cannot
 * be told apart). Renders nothing when neither starter is known.
 */
export function InlineStarters({
  matchup,
  fallbackAway,
  fallbackHome,
  separator = true,
}: {
  matchup: ProbableMatchup | null | undefined;
  fallbackAway?: string | null;
  fallbackHome?: string | null;
  /** Leading " · " for use mid-line; off when the starters get their own line. */
  separator?: boolean;
}) {
  const lead = separator ? " · " : "";
  if (!matchup) {
    if (!fallbackAway || !fallbackHome) return null;
    return <>{`${lead}${lastName(fallbackAway)} vs ${lastName(fallbackHome)}`}</>;
  }
  if (!matchup.away && !matchup.home) return null;
  const side = (line: PitcherLine | null) =>
    line ? (
      <span title={line.projected ? `${line.name}, projected: MLB has not announced this starter` : line.name}>
        {lastName(line.name)}
        {line.projected && (
          <>
            {" "}
            <ProjectedTag />
          </>
        )}
      </span>
    ) : (
      <span>TBD</span>
    );
  return (
    <>
      {lead}
      {side(matchup.away)}
      {" vs "}
      {side(matchup.home)}
    </>
  );
}

/** Compact two-line cell for tables: name and hand, then ERA and WHIP. */
export function OppStarterCell({
  line,
  fallbackName,
  dayLabel,
}: {
  line: PitcherLine | null | undefined;
  fallbackName?: string | null;
  /** e.g. "Fri" when the team is off today and this is its next game's starter */
  dayLabel?: string | null;
}) {
  const name = line?.name || fallbackName || null;
  if (!name) return <span className="text-muted-foreground">TBD</span>;
  const hand = handLabel(line);
  const stats = eraWhip(line);
  const l3 = line?.last3 ? `L${line.last3.starts.length} ${fmtEra(line.last3.era)}` : null;
  return (
    <div className="leading-tight" title={fullTitle(line, name)}>
      <div className="text-foreground whitespace-nowrap">
        {dayLabel && <span className="text-muted-foreground text-[10px] font-mono mr-1">{dayLabel}</span>}
        {name}
        {hand && <span className="text-muted-foreground text-[10px] font-mono ml-1">{hand}</span>}
      </div>
      {(stats || line?.projected) && (
        <div className="text-[10px] font-mono tabular-nums text-muted-foreground whitespace-nowrap">
          {line?.projected && <ProjectedTag className="mr-1" />}
          {stats}
          {l3 && <span> · {l3}</span>}
        </div>
      )}
    </div>
  );
}
