// The sports app-feed serves (DECISIONS D-116). Men's college basketball is built but stays out
// until the function secret ENABLE_NCAAB is "true" (`supabase secrets set ENABLE_NCAAB=true`).
// The app shows the list the feed returns, so turning it on needs no app update.

export type FeedSport = "NFL" | "NCAAF" | "NBA" | "NCAAB";

/** Labels are Title Case (D-027). */
export const SPORT_LABELS: Record<FeedSport, string> = {
  NFL: "NFL",
  NCAAF: "College Football",
  NBA: "NBA",
  NCAAB: "College Basketball",
};

const LIVE: FeedSport[] = ["NFL", "NCAAF", "NBA"];

/** The sports on, in the order the app lists them. Only the exact string "true" turns college basketball on. */
export function feedSports(enableNcaab: string | undefined | null): FeedSport[] {
  return enableNcaab === "true" ? [...LIVE, "NCAAB"] : [...LIVE];
}

/** `?sports=` narrowed to the sports that are on; anything else (or nothing) means all of them. */
export function requestedSports(param: string | null, on: FeedSport[]): FeedSport[] {
  const asked = (param ?? "").split(",").filter((s): s is FeedSport => (on as string[]).includes(s));
  return asked.length ? asked : on;
}

/** What the app reads to build its sport chips and sections: `[{ key: "NFL", label: "NFL" }, ...]`. */
export function sportList(on: FeedSport[]): { key: FeedSport; label: string }[] {
  return on.map((key) => ({ key, label: SPORT_LABELS[key] }));
}
