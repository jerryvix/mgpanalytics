// Kickoff labels for games whose time is not set yet.
//
// ESPN flags an unscheduled college kickoff with timeValid = false ("TBD") and
// stores a placeholder of midnight Eastern on the game's day
// (2026-10-03T04:00Z in EDT, T05:00Z in EST). ncaaf_games carries that as
// time_tbd. Read in the viewer's own zone the placeholder is a fake time on
// the wrong day for anyone west of Eastern: Pacific saw "Fri Oct 2, 9:00 PM"
// for a Saturday game with no kickoff time. So a TBD game shows the calendar
// day in Eastern time, where ESPN set it, and no clock time at all.

const EASTERN = "America/New_York";

const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN,
  year: "numeric",
  month: "short",
  day: "numeric",
  weekday: "short",
});

interface EasternDay {
  /** "2026-10-03", comparable across dates */
  key: string;
  /** "Sat Oct 3" */
  label: string;
}

function easternDay(date: Date): EasternDay | null {
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(DAY_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(
    parts.month,
  );
  if (monthIndex < 0) return null;
  const key = `${parts.year}-${String(monthIndex + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return { key, label: `${parts.weekday} ${parts.month} ${parts.day}` };
}

/** "Sat Oct 3": the Eastern calendar day of a (placeholder) kickoff. */
export function tbdGameDay(iso: string): string | null {
  return easternDay(new Date(iso))?.label ?? null;
}

/** "2026-10-03": the Eastern calendar day, for grouping a TBD game under its date. */
export function tbdGameDayKey(iso: string): string | null {
  return easternDay(new Date(iso))?.key ?? null;
}

/**
 * "Sat Oct 3 · TBD", or "Today · TBD" / "Tomorrow · TBD" when that Eastern day
 * is today or tomorrow in Eastern time.
 */
export function tbdKickoffLabel(iso: string, now: Date = new Date()): string {
  const day = easternDay(new Date(iso));
  if (!day) return "TBD";
  const today = easternDay(now);
  const tomorrow = easternDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  if (today && day.key === today.key) return "Today · TBD";
  if (tomorrow && day.key === tomorrow.key) return "Tomorrow · TBD";
  return `${day.label} · TBD`;
}
