// Market notes (D-102): credited public posts shown beside betting splits.
// They are someone else's description of the market, not a pick.

export interface MarketNoteRow {
  id: string;
  sport: string;
  away_name: string;
  home_name: string;
  credit: string;
  body: string;
  url: string;
  starts_at: string;
}

const COMBINING = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

function tokens(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(COMBINING, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

/**
 * ESPN's "Cincinnati Bengals" and the slate's "Cincinnati Bengals" (or the nickname
 * "Bengals") are the same side. A leading word is not enough, so "Ohio" does not
 * match "Ohio State Buckeyes".
 */
export function namesMatch(a: string, b: string): boolean {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (shorter.length === 1) return longer[longer.length - 1] === shorter[0];
  return shorter.length < longer.length && shorter.every((t, i) => longer[i] === t);
}

/** Notes for this matchup, either home/away order. */
export function noteForTeams(notes: MarketNoteRow[], home: string, away: string): MarketNoteRow[] {
  return notes.filter((n) =>
    (namesMatch(n.home_name, home) && namesMatch(n.away_name, away))
    || (namesMatch(n.home_name, away) && namesMatch(n.away_name, home))
  );
}
