// BALLDONTLIE NFL fetch helpers with pacing, 429/5xx retry and cursor paging.
//
// Params are [key, value] tuples so array filters can repeat a key
// (game_ids[]=1&game_ids[]=2), which a plain object cannot express.

const NFL_BASE_URL = "https://api.balldontlie.io/nfl/v1";
// GOAT tier allows 600 req/min; keep well under it even when two syncs overlap.
const MIN_SPACING_MS = 150;
const MAX_RETRIES = 4;

let lastCallAt = 0;

export type BdlParams = Array<[string, string | number]>;

async function pace(): Promise<void> {
  const wait = lastCallAt + MIN_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export async function bdlNflFetch(
  apiKey: string,
  endpoint: string,
  params: BdlParams = [],
  // deno-lint-ignore no-explicit-any
): Promise<{ data: any[]; meta?: { next_cursor?: number | string | null } }> {
  const url = new URL(`${NFL_BASE_URL}${endpoint}`);
  for (const [k, v] of params) url.searchParams.append(k, String(v));

  for (let attempt = 0; ; attempt++) {
    await pace();
    const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    if (res.ok) return await res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      const body = await res.text().catch(() => "");
      throw new Error(`BDL ${res.status} on ${endpoint}: ${body.slice(0, 200)}`);
    }
    const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 20000);
    console.log(`[bdl-nfl] ${res.status} on ${endpoint}, retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`);
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

// deno-lint-ignore no-explicit-any
export async function bdlNflFetchAll(apiKey: string, endpoint: string, params: BdlParams = [], maxPages = 100): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const pageParams: BdlParams = [...params, ["per_page", 100]];
    if (cursor) pageParams.push(["cursor", cursor]);
    const json = await bdlNflFetch(apiKey, endpoint, pageParams);
    out.push(...(json.data ?? []));
    const next = json.meta?.next_cursor;
    if (next === undefined || next === null || next === "") return out;
    cursor = String(next);
  }
  console.log(`[bdl-nfl] ${endpoint} stopped at the ${maxPages}-page safety cap`);
  return out;
}
