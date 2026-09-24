// ESPN display name ("Alabama Crimson Tide") → CFBD school name ("Alabama").
// CFBD school names are what the ncaaf_roster_intel tables store natively.
//
// Mascots are 1–2 trailing words, so we generate strip-one and strip-two
// candidates and let the caller match them against rows that actually exist,
// in order - so "Georgia State Panthers" resolves to "Georgia State" before
// the also-real "Georgia" is ever considered. Schools whose CFBD name isn't
// a prefix of the ESPN name at all live in the override map.
//
// The strip-two candidate is skipped when the strip-one form already ends in
// a school qualifier ("Alabama State", "Texas Southern", "Florida A&M"):
// that form IS the full school name with a one-word mascot, so dropping
// another word would land on a different, real FBS school. Without this,
// FCS opponents like Texas Southern or Indiana State inherited Texas's or
// Indiana's roster data and draft prospects.
const SCHOOL_QUALIFIERS = new Set(["State", "Tech", "A&M", "A&T", "Christian", "Southern", "Central"]);

// CFBD's own spellings ("App State", "UL Monroe") match the ESPN prefix
// heuristic, so those schools need no override.
export const CFBD_SCHOOL_OVERRIDES: Record<string, string> = {
  "Miami RedHawks": "Miami (OH)",
  "Miami (OH) RedHawks": "Miami (OH)",
  "USF Bulls": "South Florida",
  "Pitt Panthers": "Pittsburgh",
  "San Jose State Spartans": "San José State", // ESPN sometimes drops the accent
  "Hawai'i Rainbow Warriors": "Hawai'i",
  "Hawaii Rainbow Warriors": "Hawai'i",
};

/**
 * Candidate CFBD school names for an ESPN display name, best-first.
 * Callers should accept the first candidate that matches a real row.
 */
export function cfbdSchoolCandidates(espnDisplayName: string): string[] {
  const name = espnDisplayName.trim();
  const override = CFBD_SCHOOL_OVERRIDES[name];
  if (override) return [override];

  const words = name.split(/\s+/);
  const candidates: string[] = [];
  if (words.length >= 2) candidates.push(words.slice(0, -1).join(" "));
  if (words.length >= 3 && !SCHOOL_QUALIFIERS.has(words[words.length - 2])) {
    candidates.push(words.slice(0, -2).join(" "));
  }
  return candidates.length ? candidates : [name];
}

/**
 * Pick the first candidate present in the set of schools that actually have
 * data. Returns null when nothing matches - callers treat that as the
 * signal's "insufficient" arm, never a hard error.
 */
export function pickCfbdSchool(
  candidates: string[],
  availableSchools: ReadonlySet<string>
): string | null {
  for (const c of candidates) {
    if (availableSchools.has(c)) return c;
  }
  return null;
}
