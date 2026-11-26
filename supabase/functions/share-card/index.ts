// share-card (D-128): the picture a shared game link shows in iMessage, X and the rest. Public, no
// sign-in: GET ?sport=nfl&id=401873081&d=2026-11-26 returns a 1200x630 PNG of the game card (card.ts),
// read from the same app-feed the app uses. A game that can't be found gets the plain MGP card.
// The share page (api/share.js on the website, mgp-analytics.com/g/...) points its og:image here.

import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
import { type CardGame, fallbackCard, HEIGHT, shareCard, WIDTH } from "./card.ts";
import { WORDMARK } from "./wordmark.ts";

const SITE = "https://www.mgp-analytics.com";
const FEED = `${Deno.env.get("SUPABASE_URL")}/functions/v1/app-feed`;
const SPORTS = new Set(["NFL", "NCAAF", "NBA", "NCAAB", "MLB"]);

// Geist (OFL), from the website's public/fonts, or the same files from the npm package the app uses;
// loaded once per instance
const NPM = "https://cdn.jsdelivr.net/npm/@expo-google-fonts";
const FONT_FILES = [
  { name: "Geist", file: "Geist_400Regular.ttf", npm: `${NPM}/geist@0.4.2/400Regular`, weight: 400, style: "normal" },
  { name: "Geist", file: "Geist_400Regular_Italic.ttf", npm: `${NPM}/geist@0.4.2/400Regular_Italic`, weight: 400, style: "italic" },
  { name: "Geist", file: "Geist_600SemiBold.ttf", npm: `${NPM}/geist@0.4.2/600SemiBold`, weight: 600, style: "normal" },
  { name: "Geist", file: "Geist_700Bold.ttf", npm: `${NPM}/geist@0.4.2/700Bold`, weight: 700, style: "normal" },
  { name: "Geist Mono", file: "GeistMono_500Medium.ttf", npm: `${NPM}/geist-mono@0.4.3/500Medium`, weight: 500, style: "normal" },
] as const;

/** A TrueType font's first bytes, so an HTML page served in its place is never taken for one */
const isFont = (b: ArrayBuffer) => {
  const v = new DataView(b);
  return b.byteLength > 1000 && (v.getUint32(0) === 0x00010000 || v.getUint32(0) === 0x74727565 || v.getUint32(0) === 0x4f54544f);
};

async function fontBytes(urls: string[]): Promise<ArrayBuffer> {
  for (const u of urls) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const b = await res.arrayBuffer();
      if (isFont(b)) return b;
    } catch {
      // the next source
    }
  }
  throw new Error(`no font at ${urls.join(", ")}`);
}
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: number; style: string }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(FONT_FILES.map(async (f) => {
    const data = await fontBytes([`${SITE}/fonts/${f.file}`, `${f.npm}/${f.file}`]);
    return { name: f.name, data, weight: f.weight, style: f.style };
  })).catch((e) => {
    fonts = null; // try again on the next request
    throw e;
  });
  return fonts;
}

async function fetchGame(sport: string, id: string, date: string | null): Promise<CardGame | null> {
  const q = new URLSearchParams({ view: "game", id, sport, ...(date ? { date } : {}) });
  const res = await fetch(`${FEED}?${q}`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.game ?? null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sport = (url.searchParams.get("sport") ?? "").toUpperCase();
  const id = url.searchParams.get("id") ?? "";
  const d = url.searchParams.get("d");
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  try {
    let game = SPORTS.has(sport) && /^\d{1,20}$/.test(id) ? await fetchGame(sport, id, date) : null;
    // A late game can sit on ESPN's previous day: without the date, look across the week
    if (!game && date && SPORTS.has(sport)) game = await fetchGame(sport, id, null);
    const element = game ? shareCard(game, WORDMARK) : fallbackCard(WORDMARK);
    // deno-lint-ignore no-explicit-any
    return new ImageResponse(element as any, {
      width: WIDTH,
      height: HEIGHT,
      fonts: await loadFonts(),
      headers: { "Cache-Control": `public, max-age=${game ? 600 : 60}, s-maxage=${game ? 600 : 60}` },
    });
  } catch (e) {
    console.error("[share-card]", e instanceof Error ? e.message : e);
    return new Response("card unavailable", { status: 500 });
  }
});
