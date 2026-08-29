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

export async function espnFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json, text/plain, */*",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 403) {
    const parsed = new URL(url);
    if (parsed.hostname === "site.api.espn.com") {
      const fallback = await espnCdnFallback(parsed).catch(() => null);
      if (fallback) return fallback;
    }
  }
  return res;
}

// Aug 28 2026: the UA fix above stopped working. Akamai now returns 403 on
// site.api.espn.com to any non-browser TLS client (curl and Deno get 403 even
// with a browser User-Agent, while real browsers still get 200), so no header
// change can fix it from an edge function. cdn.espn.com/core/{league}/{page}
// serves the identical payloads and still accepts non-browser clients:
// scoreboard JSON is wrapped at content.sbData and rankings at content.data.
// When site.api answers 403 for a scoreboard or rankings URL, retry through
// the CDN mirror and unwrap, so callers keep seeing the site.api shape.
const CDN_PAGES = new Set(["scoreboard", "rankings"]);

function cdnMirrorUrl(original: URL): URL | null {
  // /apis/site/v2/sports/{sport}/{league}/{page} -> /core/{league}/{page}
  const parts = original.pathname.split("/").filter(Boolean);
  const sportsIdx = parts.indexOf("sports");
  if (sportsIdx === -1 || parts.length < sportsIdx + 3) return null;
  const league = parts[sportsIdx + 2];
  const page = parts[sportsIdx + 3];
  if (!CDN_PAGES.has(page)) return null;
  const mirror = new URL(`https://cdn.espn.com/core/${league}/${page}`);
  original.searchParams.forEach((v, k) => mirror.searchParams.set(k, v));
  mirror.searchParams.set("xhr", "1");
  return mirror;
}

async function espnCdnFallback(original: URL): Promise<Response | null> {
  const mirror = cdnMirrorUrl(original);
  if (!mirror) return null;
  const res = await fetch(mirror, {
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json, text/plain, */*" },
  });
  if (!res.ok) return null;
  const wrapped = await res.json().catch(() => null);
  const payload = wrapped?.content?.sbData ?? wrapped?.content?.data ?? null;
  if (!payload) return null;
  console.log(`[espn-fetch] site.api 403, served via CDN mirror: ${mirror.pathname}`);
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
