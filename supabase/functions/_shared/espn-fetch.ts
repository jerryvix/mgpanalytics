// Shared fetch wrapper for ESPN's public APIs.
//
// On Aug 19 2026 ESPN's Akamai edge started returning 403 "Access Denied" to
// site.api.espn.com for any request whose User-Agent is not browser-like.
// Deno sends "User-Agent: Deno/x.y.z" by default, so every edge function
// calling the scoreboard endpoints began failing at once: MLB games, NCAAF
// games and the odds snapshots all stopped writing on the same day while the
// syncs still reported success (each call site logs the error and continues).
//
// sports.core.api.espn.com was NOT blocked, but it is routed through the same
// CDN, so send the browser User-Agent everywhere rather than waiting for the
// next tightening.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export function espnFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json, text/plain, */*",
      ...(init.headers ?? {}),
    },
  });
}
