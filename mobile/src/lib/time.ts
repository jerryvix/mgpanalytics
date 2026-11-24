/**
 * Time labels in the viewer's own time zone. A missing or unreadable date gives an empty
 * label, never "Invalid Date".
 */

/** The instant an ISO string names, or null when it's missing or unreadable. */
export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function clock(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

/** "Tonight 8:15 PM", "Today 1:00 PM", "Tomorrow 7:30 PM", "Thu 4:30 PM". */
export function whenLabel(iso: string | null | undefined, now = new Date()): string {
  const d = toDate(iso);
  if (!d) return '';
  if (sameDay(d, now)) return `${d.getHours() >= 17 ? 'Tonight' : 'Today'} ${clock(iso)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, tomorrow)) return `Tomorrow ${clock(iso)}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock(iso)}`;
}

/** Calendar days from `d` back to `now` in local time: 0 today, 1 yesterday. */
export function daysAgo(d: Date, now = new Date()): number {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(now) - start(d)) / 86_400_000);
}

/** "Monday, November 23". */
export function longDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** YYYY-MM-DD for a local date (the feed reads it as an Eastern date, close enough for US users). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD of an instant on the Eastern calendar (America/New_York), the date the feed files games under. */
export function easternDate(iso: string | null | undefined): string | null {
  const d = toDate(iso);
  if (!d) return null;
  try {
    const s = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
  } catch {
    return null;
  }
}

export function fmtLine(x: number | null | undefined): string {
  if (x === null || x === undefined) return '';
  if (x === 0) return 'PK';
  return x > 0 ? `+${x}` : `${x}`;
}
