/**
 * Tidying every Analyst answer the same way, whatever the model wrote.
 *
 * No period at the end of a line (owner, Nov 26: "don't end bullets with a period"; D-040): a bullet
 * or paragraph with several sentences keeps the periods between them and drops the last one.
 *
 * Labels in the Analyst's answers read in Title Case (owner, Nov 26: "Capitalize all words that
 * aren't articles when they're used as a header or title"; D-027). The prompt asks for it; this
 * makes sure: markdown headings, a label alone on its line ("Worth knowing:" or **Worth
 * knowing**) and a bullet's short lead-in label ("- Home and primetime: Buffalo is...").
 * Sentences are left alone. The word rule matches packages/shared/text/title-case.ts.
 */

const SMALL_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs", "vs.",
]);

function capitalizeWord(word: string): string {
  if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
  return word
    .split(/([-/])/)
    .map((part) => (part === "-" || part === "/" ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

export function titleCase(input: string): string {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const last = words.length - 1;
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i !== 0 && i !== last && SMALL_WORDS.has(lower)) return lower;
      return capitalizeWord(word);
    })
    .join(" ");
}

// A label: 1 to 4 words, letters only (no numbers, so a record or a score is never touched)
const LABEL = "[A-Za-z][A-Za-z'/&-]*(?: [A-Za-z][A-Za-z'/&.-]*){0,3}";
const HEADING = /^(#{1,6} +)(.+?)\s*$/;
const ALONE = new RegExp(`^(\\*\\*)?(${LABEL})(:?)(\\*\\*)?(:?)\\s*$`);
const LEAD_IN = new RegExp(`^(\\s*(?:[-*•]|\\d+\\.) +)(\\*\\*)?(${LABEL})(:)(\\*\\*)?(:?)(?= )`);

export function titleCaseLabels(text: string): string {
  let inTable = false;
  return text
    .split("\n")
    .map((line) => {
      inTable = line.trim().startsWith("|");
      if (inTable) return line;
      const h = line.match(HEADING);
      if (h) return h[1] + titleCase(h[2]);
      const a = line.match(ALONE);
      // Alone on its line, it's a label only when it's bold or ends with a colon
      if (a && (a[1] || a[3] || a[5])) return `${a[1] ?? ""}${titleCase(a[2])}${a[3]}${a[4] ?? ""}${a[5]}`;
      return line.replace(LEAD_IN, (_m, lead, b1 = "", label, colon, b2 = "", colon2 = "") =>
        `${lead}${b1}${titleCase(label)}${colon}${b2}${colon2}`);
    })
    .join("\n");
}

// Endings that are abbreviations, not sentence periods
const ABBREVIATION = /(?:^|[\s(])(?:vs|Jr|Sr|St|Inc|Co|Mt|Ft|[A-Z](?:\.[A-Z])+)\.$/;

/** Drops the period that ends a line (inside closing italics or bold too). Tables and code are left alone. */
export function dropFinalPeriods(text: string): string {
  let code = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) code = !code;
      if (code || line.trim().startsWith("|")) return line;
      const m = line.match(/^(.*?[^.])\.([*_]*)\s*$/);
      if (!m || ABBREVIATION.test(`${m[1]}.`)) return line;
      return m[1] + m[2];
    })
    .join("\n");
}

/** Every answer: Title Case labels, then no final periods. */
export function tidyAnswer(text: string): string {
  return dropFinalPeriods(titleCaseLabels(text));
}
