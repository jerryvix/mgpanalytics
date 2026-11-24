import { describe, expect, it } from "vitest";
import { bearerToken, isGuest, jwtClaims } from "../../supabase/functions/_shared/guest";

// An unsigned token with this payload (the functions read claims only after auth.getUser verified it)
function token(payload: Record<string, unknown>): string {
  const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url(JSON.stringify({ alg: "ES256" }))}.${b64url(JSON.stringify(payload))}.sig`;
}

describe("Guests (anonymous installs) in edge functions (_shared/guest.ts)", () => {
  it("reads the token's claims", () => {
    expect(jwtClaims(token({ sub: "u1", is_anonymous: true }))).toEqual({ sub: "u1", is_anonymous: true });
    expect(jwtClaims("not-a-jwt")).toBeNull();
    expect(jwtClaims("a.%%%.c")).toBeNull();
  });

  it("treats a user or a token marked anonymous as a guest", () => {
    expect(isGuest({ is_anonymous: true }, token({ sub: "u1" }))).toBe(true);
    expect(isGuest({ is_anonymous: false }, token({ sub: "u1", is_anonymous: true }))).toBe(true);
    expect(isGuest(null, token({ sub: "u1", is_anonymous: true }))).toBe(true);
  });

  it("lets accounts and older tokens without the claim through", () => {
    expect(isGuest({ is_anonymous: false }, token({ sub: "u1", is_anonymous: false }))).toBe(false);
    expect(isGuest({}, token({ sub: "u1" }))).toBe(false);
    expect(isGuest(null, "garbage")).toBe(false);
  });

  it("strips Bearer from the header", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("abc")).toBe("");
    expect(bearerToken(null)).toBe("");
  });
});
