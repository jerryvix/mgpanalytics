/** Time labels in the viewer's own time zone. */

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "Tonight 8:15 PM", "Today 1:00 PM", "Tomorrow 7:30 PM", "Thu 4:30 PM". */
export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return `${d.getHours() >= 17 ? 'Tonight' : 'Today'} ${clock(iso)}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, tomorrow)) return `Tomorrow ${clock(iso)}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock(iso)}`;
}

/** "Monday, November 23". */
export function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** YYYY-MM-DD for a local date (the feed reads it as an Eastern date, close enough for US users). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtLine(x: number | null | undefined): string {
  if (x === null || x === undefined) return '';
  if (x === 0) return 'PK';
  return x > 0 ? `+${x}` : `${x}`;
}
