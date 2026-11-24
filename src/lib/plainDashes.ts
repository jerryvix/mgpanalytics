// Owner rule (Nov 2026): no em dashes, en dashes or typographic minus signs
// anywhere on the site. The Analyst's prompt asks for plain hyphens, and this
// is the display-time backstop for model text that slips one through. Pure and
// idempotent, so it is safe to run on every render of a streamed, partial reply.
//
// The characters are built from code points (and the examples below name them
// as EM, EN and MINUS) so this file passes the repo's no-dashes source scan
// (src/test/noEmDashes.test.ts).

const MINUS_SIGN = String.fromCharCode(0x2212);
const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const DASH = `[${EN}${EM}]`;

const RULES: Array<[RegExp, string]> = [
  // Typographic minus: "Oregon MINUS6.5 (MINUS110)" -> "Oregon -6.5 (-110)"
  [new RegExp(MINUS_SIGN, "g"), "-"],
  // Ranges and scores: "5EN7", "24 EN 17", "5EM7" -> "5-7", "24-17", "5-7"
  [new RegExp(`(\\d)[ \\t]*${EN}[ \\t]*(?=\\d)`, "g"), "$1-"],
  [new RegExp(`(\\d)${EM}(?=\\d)`, "g"), "$1-"],
  // A dash used as a sign before a number: "Oregon EN6.5" -> "Oregon -6.5"
  [new RegExp(`(^|[\\s(|/])${DASH}(?=\\d)`, "gm"), "$1-"],
  // A missing-value table cell, or a line holding only a dash: "| EM |" -> "| - |"
  [new RegExp(`(^|\\|)([ \\t]*)${DASH}+(?=[ \\t]*(\\||$))`, "gm"), "$1$2-"],
  // A dash used as a bullet: "EM item" -> "- item"
  [new RegExp(`^([ \\t]*)${DASH}(?=[ \\t])`, "gm"), "$1-"],
  // A dash ending a line introduces what follows: "Tonight's board EM" -> "Tonight's board:"
  [new RegExp(`[ \\t]*${DASH}[ \\t]*$`, "gm"), ":"],
  // Sentence punctuation: "the line moved EM a full point" -> "the line moved, a full point"
  [new RegExp(`[ \\t]*${EM}[ \\t]*`, "g"), ", "],
  [new RegExp(`[ \\t]+${EN}[ \\t]+`, "g"), ", "],
  // Anything left is a range between words: "JanENFeb" -> "Jan-Feb"
  [new RegExp(EN, "g"), "-"],
];

/** Replaces em dashes, en dashes and minus signs in display text with a hyphen or a comma */
export function plainDashes(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}
