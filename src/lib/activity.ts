// Daily activity for the admin panel's Traction numbers: one app_activity row per
// signed-in person per US Eastern day per surface (migration 20261124080000_traction.sql).
// The website writes 'web' once a day; the app writes 'app'. Errors are ignored: a missed
// row only means one person is missing from one day's count.

const ET_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The US Eastern date as YYYY-MM-DD (the day app_activity and admin_traction count by). */
export function easternDay(d: Date = new Date()): string {
  return ET_DAY.format(d);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const activityStorageKey = (userId: string) => `mgp-activity-web:${userId}`;

export interface ActivityDeps {
  upsert: (row: { user_id: string; day: string; source: "web" }) => PromiseLike<{ error: unknown }>;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: Date;
}

/**
 * Records today's 'web' visit once per Eastern day per person. Returns true when a row
 * was written. Skips guests, the dev preview user and anything without a real id.
 */
export async function recordWebActivity(
  user: { id: string; is_anonymous?: boolean } | null | undefined,
  deps: ActivityDeps,
): Promise<boolean> {
  if (!user || user.is_anonymous || !UUID_RE.test(user.id)) return false;
  const day = easternDay(deps.now ?? new Date());
  const key = activityStorageKey(user.id);
  try {
    if (deps.storage?.getItem(key) === day) return false;
  } catch {
    /* storage blocked: write anyway, the upsert ignores duplicates */
  }
  try {
    const { error } = await deps.upsert({ user_id: user.id, day, source: "web" });
    if (error) return false;
  } catch {
    return false;
  }
  try {
    deps.storage?.setItem(key, day);
  } catch {
    /* fine: tomorrow's check just writes again */
  }
  return true;
}
