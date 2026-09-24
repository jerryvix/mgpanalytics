/**
 * Compact player name for narrow rows: first initial plus the full surname.
 * Keeps multi-word surnames and suffixes intact, so "Elly De La Cruz" becomes
 * "E. De La Cruz" and "Ronald Acuña Jr." becomes "R. Acuña Jr." (taking only
 * the last word would turn the latter into "Jr.").
 */
export function initialLastName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const [first, ...rest] = parts;
  return `${first.charAt(0).toUpperCase()}. ${rest.join(" ")}`;
}
