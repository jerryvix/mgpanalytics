// X accounts shown on the website (D-102, D-104). Mirrors X_TAKES_ACCOUNTS in
// supabase/functions/_shared/takes-sources.ts: keep the two in step.

export interface XAccountDisplay {
  /** Handle without @ */
  handle: string;
  name: string;
  avatarUrl?: string;
  verified?: boolean;
  /** Where the person works, shown as "via BetMGM" */
  source?: string;
}

export const X_ACCOUNTS: readonly XAccountDisplay[] = [
  { handle: "BookitWithTrent", name: "Trent Attyah" },
  {
    handle: "johnewing",
    name: "John Ewing",
    avatarUrl: "https://pbs.twimg.com/profile_images/1689058505876008960/070yJkxs_400x400.jpg",
    verified: true,
    source: "BetMGM",
  },
];

export function xAccountDisplay(handle?: string | null): XAccountDisplay | null {
  const key = (handle ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!key) return null;
  return X_ACCOUNTS.find((a) => a.handle.toLowerCase() === key) ?? null;
}

/** "now", "12m", "2h", "3d", then "Nov 20" */
export function timeAgo(iso?: string | null, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
