/**
 * Constant-time compare for the ingest secret. A missing or empty expected
 * secret never matches, so an unset env var cannot be bypassed with a blank header.
 */
export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected) return false;
  const a = new TextEncoder().encode(provided ?? "");
  const b = new TextEncoder().encode(expected);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
