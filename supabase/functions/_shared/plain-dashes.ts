/** Last line of defense for the owner's rule: no em dash, en dash or minus sign anywhere. */
// Built from code points so the repo's no-dash guard (src/test/noEmDashes.test.ts) stays clean.
const MINUS = String.fromCharCode(0x2212);
const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const SPACED_DASH = new RegExp(`\\s+[${EM}${EN}]\\s+`, "g");
const ANY_DASH = new RegExp(`[${MINUS}${EN}${EM}]`, "g");

export function plainDashes(s: string): string {
  return s.replace(SPACED_DASH, ", ").replace(ANY_DASH, "-").replace(/\.\s*$/, "").trim();
}
