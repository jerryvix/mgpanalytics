// Relay for DraftTek's NFL Draft big board pages.
//
// Why this exists: drafttek.com runs IIS 8.5 and only negotiates one TLS
// cipher, ECDHE-RSA-AES256-SHA384 (AES-CBC). Supabase Edge Functions run on
// Deno, whose TLS stack (rustls) only speaks AEAD ciphers, so every
// connection from sync-draft-board is reset during the handshake. Node's
// OpenSSL still supports that cipher, so this Vercel function fetches the
// page and hands the HTML back to the edge function.
//
// It can only fetch the board pages: a 4-digit draft year and pages 1-3,
// nothing else. Responses are cached at the edge for 30 minutes, so DraftTek
// sees at most a few requests an hour no matter who calls this.

const MIN_YEAR = 2026;
const MAX_YEAR = 2040;
const MAX_PAGE = 3;

function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function boardPageUrl(year, page) {
  return `https://www.drafttek.com/${year}-NFL-Draft-Big-Board/Top-NFL-Draft-Prospects-${year}-Page-${page}.asp`;
}

/** Returns { year, page } for a valid request, or null. */
export function parseBoardParams(query) {
  const year = Number(query?.year);
  const page = Number(query?.page);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return null;
  return { year, page };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).send("Method not allowed");
    return;
  }

  const params = parseBoardParams(req.query);
  if (!params) {
    res.status(400).send(`Expected ?year=${MIN_YEAR}-${MAX_YEAR}&page=1-${MAX_PAGE}`);
    return;
  }

  try {
    const upstream = await fetch(boardPageUrl(params.year, params.page), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MGPAnalytics/1.0; +https://www.mgp-analytics.com)",
        Accept: "text/html",
      },
      signal: timeoutSignal(20000),
    });
    const body = await upstream.text();
    if (!upstream.ok) {
      res.status(502).send(`DraftTek returned ${upstream.status} for page ${params.page}`);
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).send(body);
  } catch (err) {
    res.status(502).send(`DraftTek fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
