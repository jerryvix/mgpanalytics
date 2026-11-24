/** Display cleanup for model text (D-073): no em dashes, en dashes or minus signs. */
const MINUS = String.fromCharCode(0x2212);
const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const SPACED = new RegExp(`\\s+[${EM}${EN}]\\s+`, 'g');
const ANY = new RegExp(`[${MINUS}${EN}${EM}]`, 'g');

export function plainDashes(s: string): string {
  return s.replace(SPACED, ', ').replace(ANY, '-');
}
