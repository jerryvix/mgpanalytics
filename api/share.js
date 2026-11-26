// The share page for a game (D-128): mgp-analytics.com/g/<sport>/<id>?d=<date>, the link the app's
// Share button sends. vercel.json rewrites /g/... here.
//
// Link previews (iMessage, X, Slack and the rest) read this page's tags and show the game card
// image (Supabase share-card) with its title. A person who taps the link on an iPhone goes straight
// to the app download; anyone else sees the card and a button to get the app.

const SUPABASE = "https://vwezujtftfccamoduglp.supabase.co/functions/v1";
const SITE = "https://www.mgp-analytics.com";
const SPORTS = new Set(["nfl", "ncaaf", "nba", "ncaab", "mlb"]);
const SPORT_LABEL = { nfl: "NFL", ncaaf: "College Football", nba: "NBA", ncaab: "College Basketball", mlb: "MLB" };
const APP_STORE_ID = "6838568637";

/**
 * Where "Get the App" goes: the TestFlight public link while the app is in beta, the App Store
 * once it's live. Set MGP_DOWNLOAD_URL on Vercel, or change the default here.
 */
export const DOWNLOAD_URL = process.env.MGP_DOWNLOAD_URL || `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** Returns { sport, id, date } for a valid request, or null. */
export function parseShareParams(query) {
  const sport = String(query.sport ?? "").toLowerCase();
  const id = String(query.id ?? "");
  const d = String(query.d ?? "");
  if (!SPORTS.has(sport) || !/^\d{1,20}$/.test(id)) return null;
  return { sport, id, date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "Bears at Lions · CHI -1.5 · O/U 55.5" */
export function shareTitle(game) {
  if (!game) return "MGP Analytics";
  const matchup = `${game.away.name} ${game.neutral ? "vs" : "at"} ${game.home.name}`;
  if (game.state === "post" && game.home.score && game.away.score) {
    return `${game.away.name} ${game.away.score}, ${game.home.name} ${game.home.score} · Final`;
  }
  return [matchup, game.line, game.total ? `O/U ${game.total}` : null].filter(Boolean).join(" · ");
}

export function shareDescription(game) {
  return game?.oneLine?.text || "Betting Splits, trends and Capper Picks for every matchup";
}

export function sharePage({ params, game, download = DOWNLOAD_URL }) {
  const q = new URLSearchParams({ sport: params.sport, id: params.id, ...(params.date ? { d: params.date } : {}) });
  // A new image address when the splits move, so previews don't keep an old card
  if (game?.splitsAsOf) q.set("v", String(Date.parse(game.splitsAsOf) || ""));
  const image = `${SUPABASE}/share-card?${q}`;
  const pageUrl = `${SITE}/g/${params.sport}/${params.id}${params.date ? `?d=${params.date}` : ""}`;
  const title = escapeHtml(shareTitle(game));
  const description = escapeHtml(shareDescription(game));
  const sport = escapeHtml(SPORT_LABEL[params.sport] ?? "");
  const dl = escapeHtml(download);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | MGP</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MGP Analytics">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}${sport ? `, ${sport}` : ""}, on MGP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}">
<link rel="icon" href="/favicon.svg">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #000; color: #F5F5F7; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; gap: 20px; }
  img.card { width: 100%; max-width: 720px; height: auto; border-radius: 16px; border: 1px solid #1C1C1F; }
  a.get { display: inline-block; background: #2FE38A; color: #04140B; font-weight: 700; font-size: 17px; text-decoration: none; padding: 14px 28px; border-radius: 999px; }
  p { margin: 0; color: #A1A1A6; font-size: 15px; text-align: center; }
</style>
</head>
<body>
<img class="card" src="${escapeHtml(image)}" width="1200" height="630" alt="${title}">
<a class="get" href="${dl}">Get the App</a>
<p>Free on iPhone. Betting Splits, trends and Capper Picks for every game</p>
<script>
  // On an iPhone, the link goes straight to the download
  if (/iPhone|iPod/.test(navigator.userAgent)) location.replace(${JSON.stringify(download)});
</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).send("Method not allowed");
    return;
  }
  const params = parseShareParams(req.query ?? {});
  if (!params) {
    res.redirect(302, "/");
    return;
  }
  let game = null;
  try {
    const q = new URLSearchParams({ view: "game", id: params.id, sport: params.sport.toUpperCase(), ...(params.date ? { date: params.date } : {}) });
    const r = await fetch(`${SUPABASE}/app-feed?${q}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) game = (await r.json())?.game ?? null;
  } catch {
    // The page still works without the game: the plain MGP card and the download button
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(sharePage({ params, game }));
}
