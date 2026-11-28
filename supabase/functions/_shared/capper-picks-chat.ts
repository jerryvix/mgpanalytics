// Capper Picks for the Analyst (D-129, owner Nov 28: "I'm looking to hear from @bearbets
// YouTube channel since we have the picks from there"). The app's Capper Picks section shows
// the shows' picks credited by name (D-059, D-093); the Analyst gets the same rows, so asking
// "what are Bear Bets' picks for the NFL?" is answered with theirs, never with MGP's own (MGP
// gives no picks).

export interface TakeRow {
  show: string;
  show_name: string | null;
  person: string | null;
  sport: string | null;
  matchup: string | null;
  starts_at: string | null;
  market: string | null;
  pick: string;
  price: string | null;
  units: number | null;
  episode_title: string | null;
  episode_published_at: string | null;
}

/** Each show's key in `takes`, its name, and the ways a question names it or its hosts */
export const SHOWS: { key: string; name: string; aliases: string[]; people: Record<string, string> }[] = [
  {
    key: "bear-bets", name: "Bear Bets",
    aliases: ["bear bets", "bearbets", "bear bet", "bearbetspod", "bear bets pod"],
    people: { "chris fallica": "Chris", fallica: "Chris", "the bear": "Chris", "geoff schwartz": "Geoff Schwartz", schwartz: "Geoff Schwartz",
      "sammy panayotovich": "Sammy Panayotovich", panayotovich: "Sammy Panayotovich", "will hill": "Will Hill", "bruce feldman": "Bruce Feldman" },
  },
  {
    key: "early-edge", name: "SportsLine",
    aliases: ["sportsline", "sports line", "early edge", "the early edge"],
    people: { "sia nejad": "Sia Nejad", "bob konarski": "Bob Konarski", "martin green": "Martin Green", "mike barner": "Mike Barner" },
  },
  { key: "hold-the-phone", name: "Hold The Phone", aliases: ["hold the phone", "holdthephone"], people: {} },
  { key: "daft-previews", name: "Daft Previews", aliases: ["daft previews", "daft preview", "daftpreviews"], people: {} },
  { key: "bookit-with-trent", name: "BookitWithTrent", aliases: ["bookitwithtrent", "bookit with trent", "bookit", "trent"], people: {} },
];

/** A question about picks in general ("capper picks for the Bills game") */
const PICKS_WORDS = /\b(cappers?|capper picks|picks?|picking|touts?|best bets?)\b/i;

const has = (text: string, phrase: string) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i").test(text);

/** The shows (and hosts) a question names; `any` when it asks about picks without naming one */
export function askedShows(message: string): { shows: string[]; people: string[]; any: boolean } {
  const shows: string[] = [];
  const people: string[] = [];
  for (const s of SHOWS) {
    let named = s.aliases.some((a) => has(message, a));
    for (const [alias, person] of Object.entries(s.people)) {
      if (has(message, alias)) {
        named = true;
        if (!people.includes(person)) people.push(person);
      }
    }
    if (named) shows.push(s.key);
  }
  return { shows, people, any: !shows.length && PICKS_WORDS.test(message) };
}

const SPORT_OF: Record<string, string> = { NFL: "NFL", NCAAF: "NCAAF", CFB: "NCAAF", NBA: "NBA", NCAAB: "NCAAB", MLB: "MLB" };

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${day} ${time} ET`;
}

export function formatCapperPicks(rows: TakeRow[], named: string[]): string {
  const names = named.map((k) => SHOWS.find((s) => s.key === k)?.name ?? k);
  let out = "\n🎙️ CAPPER PICKS: AUTHORITATIVE, MGP DATA (the same picks the app shows under Capper Picks)\n";
  out += "These are the shows' picks, credited by name, not MGP's. Asked what a show picked, report its picks: who picked what, for which game and when they said it. Don't open with \"I don't give picks\"; at most one short line that these are the show's picks, not MGP's. You may add the game's line or splits from MGP DATA. Never endorse, rank or grade them, and never add your own lean.\n";
  if (!rows.length) {
    out += `No upcoming picks stored${names.length ? ` from ${names.join(", ")}` : ""} for this. Say so plainly, and say the app adds a show's picks after its next episode.\n`;
    return out;
  }
  for (const r of rows) {
    const who = [r.show_name ?? r.show, r.person].filter(Boolean).join(", ");
    const pick = [r.pick, r.price, r.units ? `${r.units}u` : null].filter(Boolean).join(" ");
    const ep = r.episode_title ? ` · from "${r.episode_title}"${r.episode_published_at ? ` (${when(r.episode_published_at).split(" ").slice(0, 3).join(" ")})` : ""}` : "";
    out += `• ${who}: ${pick} · ${r.matchup ?? ""}${r.sport ? ` (${r.sport})` : ""}, ${when(r.starts_at)}${ep}\n`;
  }
  return out;
}

/** The block for a question, or "" when it isn't about a show's picks. Never throws. */
// deno-lint-ignore no-explicit-any
export async function capperPicksBlock(supabase: any, message: string, league: string | null | undefined): Promise<string> {
  const asked = askedShows(message);
  if (!asked.shows.length && !asked.any) return "";
  try {
    const sport = league ? SPORT_OF[league.toUpperCase()] : undefined;
    let q = supabase.from("takes")
      .select("show,show_name,person,sport,matchup,starts_at,market,pick,price,units,episode_title,episode_published_at")
      .gte("starts_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(60);
    if (asked.shows.length) q = q.in("show", asked.shows);
    if (sport) q = q.eq("sport", sport);
    const { data, error } = await q;
    if (error) return "";
    let rows = (data ?? []) as TakeRow[];
    // A host named: that host's picks (and the show's unattributed ones stay out)
    if (asked.people.length) rows = rows.filter((r) => r.person && asked.people.some((p) => r.person!.toLowerCase().includes(p.toLowerCase())));
    // "Picks" in general: only when the question names a game the shows picked, so a stray "pick" adds nothing
    if (asked.any) {
      const m = message.toLowerCase();
      rows = rows.filter((r) => (r.matchup ?? "").toLowerCase().split(/\s+(?:at|vs\.?)\s+/).some((team) => team && m.includes(team.split(" ").pop()!)));
      if (!rows.length) return "";
    }
    return formatCapperPicks(rows.slice(0, 30), asked.shows);
  } catch (e) {
    console.error("[capper-picks]", e instanceof Error ? e.message : e);
    return "";
  }
}
