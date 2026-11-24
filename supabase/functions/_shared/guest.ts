// Guests (owner decision, Nov 24): the app signs every install in as an anonymous
// Supabase user, so a guest has a valid JWT. Signed-in-only features (the Analyst,
// deleting an account) refuse them with 403. Pure (no Deno or Supabase imports), so
// src/test/guest.test.ts pins it.

/** The token's payload, read without verifying it: only use it after auth.getUser has verified the token. */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True when the user or the token says anonymous (a guest install). */
export function isGuest(user: { is_anonymous?: boolean | null } | null | undefined, token: string): boolean {
  if (user?.is_anonymous === true) return true;
  const claim = jwtClaims(token)?.is_anonymous;
  return claim === true || claim === "true";
}

/** Strips "Bearer " from an Authorization header. */
export function bearerToken(header: string | null | undefined): string {
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
}
