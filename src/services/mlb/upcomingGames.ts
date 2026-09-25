// The dashboard's next MLB games. Kept out of the component file so the read
// is testable (src/test/calledOffQueries.test.ts).
import { supabase } from "@/integrations/supabase/client";
import { excludeCalledOff } from "@/lib/gameStatus";

/**
 * Up to 10 MLB games in the next 48 hours, else in the next 7 days. Finals,
 * postponed and canceled games are left out in the query: filtered after the
 * read, a 48-hour window holding only called-off games came back empty
 * instead of falling back to the week.
 */
export async function upcomingMlbGames(now: Date = new Date()) {
  const within = (hours: number) =>
    excludeCalledOff(supabase.from("mlb_games").select("*").not("status", "ilike", "%final%"))
      .gte("date", now.toISOString())
      .lte("date", new Date(now.getTime() + hours * 3600_000).toISOString())
      .order("date", { ascending: true })
      .limit(10);
  const { data } = await within(48);
  if (data?.length) return data;
  const { data: week } = await within(7 * 24);
  return week;
}
