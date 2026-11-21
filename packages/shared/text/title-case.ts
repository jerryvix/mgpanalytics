/**
 * Title Case for labels: anything on screen that isn't a full sentence (titles, headings,
 * buttons, tabs, chips, badges, menu items). Owner rule, docs/mobile/DECISIONS.md D-027.
 * Sentences (descriptions, empty states, alerts) stay in sentence case; don't run them through this.
 *
 *   titleCase("player props")          -> "Player Props"
 *   titleCase("player_points")         -> "Player Points"
 *   titleCase("season-long o/u board") -> "Season-Long O/U Board"
 *   titleCase("browse by sport")       -> "Browse by Sport"
 *   titleCase("NBA odds as of today")  -> "NBA Odds as of Today"
 */

/** Articles, short conjunctions and short prepositions stay lowercase unless first or last. */
const SMALL_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'vs.',
]);

function capitalizeWord(word: string): string {
  // Keep acronyms and codes as written (NBA, BOS, O/U, AP, MGP).
  if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
  // Capitalize each part of hyphenated or slashed words: "season-long" -> "Season-Long", "o/u" -> "O/U".
  return word
    .split(/([-/])/)
    .map((part) => (part === '-' || part === '/' ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

export function titleCase(input: string): string {
  const words = input.replace(/_/g, ' ').trim().split(/\s+/).filter(Boolean);
  const last = words.length - 1;
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i !== 0 && i !== last && SMALL_WORDS.has(lower)) return lower;
      return capitalizeWord(word);
    })
    .join(' ');
}
