// The admin panel's Traction numbers: the shape public.admin_traction(days) returns
// (migration 20261124080000_traction.sql) and the small pure helpers the section uses.
// Days are US Eastern dates (YYYY-MM-DD).

export interface TractionDay {
  day: string;
  signups_app: number;
  signups_web: number;
  new_guests: number;
  active_app: number;
  active_web: number;
  active_total: number;
  questions: number;
}

export interface TractionAccount {
  email: string | null;
  created_at: string;
  signup_source: "app" | "web";
  was_guest: boolean;
}

export interface Traction {
  generated_at: string;
  today: string;
  days: number;
  accounts: number;
  guests: number;
  converted_guests: number;
  active: { today: number; last_7: number; last_30: number };
  questions_today: number;
  feedback: { up: number; down: number; up_7d: number; down_7d: number };
  chats: { total: number; in_window: number };
  daily: TractionDay[];
  newest_accounts: TractionAccount[];
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Reads the RPC's jsonb defensively: missing numbers are 0, missing lists are empty. */
export function parseTraction(raw: unknown): Traction | null {
  const r = obj(raw);
  if (!Object.keys(r).length) return null;
  const active = obj(r.active);
  const feedback = obj(r.feedback);
  const chats = obj(r.chats);
  return {
    generated_at: String(r.generated_at ?? ""),
    today: String(r.today ?? ""),
    days: num(r.days),
    accounts: num(r.accounts),
    guests: num(r.guests),
    converted_guests: num(r.converted_guests),
    active: { today: num(active.today), last_7: num(active.last_7), last_30: num(active.last_30) },
    questions_today: num(r.questions_today),
    feedback: { up: num(feedback.up), down: num(feedback.down), up_7d: num(feedback.up_7d), down_7d: num(feedback.down_7d) },
    chats: { total: num(chats.total), in_window: num(chats.in_window) },
    daily: (Array.isArray(r.daily) ? r.daily : []).map((d) => {
      const x = obj(d);
      return {
        day: String(x.day ?? ""),
        signups_app: num(x.signups_app),
        signups_web: num(x.signups_web),
        new_guests: num(x.new_guests),
        active_app: num(x.active_app),
        active_web: num(x.active_web),
        active_total: num(x.active_total),
        questions: num(x.questions),
      };
    }),
    newest_accounts: (Array.isArray(r.newest_accounts) ? r.newest_accounts : []).map((a) => {
      const x = obj(a);
      return {
        email: typeof x.email === "string" ? x.email : null,
        created_at: String(x.created_at ?? ""),
        signup_source: x.signup_source === "app" ? "app" : "web",
        was_guest: x.was_guest === true,
      };
    }),
  };
}

/** 1,284 / 12.9K / 4.2M: in full under 10,000, compact above. */
export function compactNumber(n: number): string {
  if (Math.abs(n) < 10_000) return Math.round(n).toLocaleString("en-US");
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** The smallest 1, 2 or 5 times a power of ten at or above `max` (an axis top), at least 1. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** "Nov 24" for a YYYY-MM-DD day, without shifting it through a time zone. */
export function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Nov 24, 3:15 PM" in US Eastern time. */
export function easternDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const sourceLabel = (s: "app" | "web") => (s === "app" ? "App" : "Web");
