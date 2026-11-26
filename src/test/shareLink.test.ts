import { describe, expect, it } from "vitest";

import { DOWNLOAD_URL, parseShareParams, sharePage, shareTitle } from "../../api/share.js";
import { shareCard, fallbackCard } from "../../supabase/functions/share-card/card";
import vercel from "../../vercel.json";

// D-128: a shared game link previews as the game card with MGP along the bottom, and on an
// iPhone it goes straight to the app download.
const game = {
  id: "401873081", sport: "NFL", start: "2026-11-26T18:00Z", state: "pre" as const, status: "11/26 - 1:00 PM EST", tv: "CBS", neutral: false,
  home: { abbr: "DET", name: "Lions", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/det.png", record: "8-2" },
  away: { abbr: "CHI", name: "Bears", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/chi.png", record: "8-2" },
  line: "CHI -1.5", total: 55.5,
  splits: { spread: { away: { bets: 46, money: 50, line: -1.5 }, home: { bets: 54, money: 50, line: 1.5 } } },
  publicBets: { pct: 54, team: "DET", line: 1.5 }, publicMoney: { pct: 50, team: "CHI", line: -1.5 },
  oneLine: { text: "The over is 32-19 in Dan Campbell's games at home since 2021", record: "32-19" },
  splitsAsOf: "2026-11-26T02:00:31.671+00:00",
};
const params = { sport: "nfl", id: "401873081", date: "2026-11-26" };
const allText = (el: unknown): string => {
  if (typeof el === "string") return el;
  if (!el || typeof el !== "object") return "";
  const kids = (el as { props?: { children?: unknown } }).props?.children;
  return Array.isArray(kids) ? kids.map(allText).join(" ") : allText(kids);
};
const DASHES = [0x2212, 0x2013, 0x2014].map((c) => String.fromCharCode(c));

describe("share links", () => {
  it("accepts a sport, a numeric id and an optional date", () => {
    expect(parseShareParams({ sport: "NFL", id: "401873081", d: "2026-11-26" })).toEqual(params);
    expect(parseShareParams({ sport: "nfl", id: "401873081" })).toEqual({ ...params, date: null });
    expect(parseShareParams({ sport: "nfl", id: "401873081", d: "<x>" })).toEqual({ ...params, date: null });
    expect(parseShareParams({ sport: "soccer", id: "1" })).toBeNull();
    expect(parseShareParams({ sport: "nfl", id: "1;drop" })).toBeNull();
  });

  it("gives previews the card image, the matchup and a large image card", () => {
    const html = sharePage({ params, game, download: "https://testflight.apple.com/join/ABC" });
    expect(shareTitle(game)).toBe("Bears at Lions · CHI -1.5 · O/U 55.5");
    expect(html).toContain('<meta property="og:title" content="Bears at Lions · CHI -1.5 · O/U 55.5">');
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/vwezujtftfccamoduglp\.supabase\.co\/functions\/v1\/share-card\?sport=nfl&amp;id=401873081&amp;d=2026-11-26&amp;v=\d+">/);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain("The over is 32-19 in Dan Campbell&#39;s games at home since 2021");
    expect(html).toContain('location.replace("https://testflight.apple.com/join/ABC")');
    expect(html).toContain(">Get the App</a>");
    expect(DASHES.some((d) => html.includes(d))).toBe(false);
  });

  it("still works without the game", () => {
    const html = sharePage({ params, game: null });
    expect(html).toContain('<meta property="og:title" content="MGP Analytics">');
    expect(html).toContain(DOWNLOAD_URL);
  });

  it("escapes what it puts in the page", () => {
    const html = sharePage({ params, game: { ...game, home: { ...game.home, name: '<script>"x"' } } });
    expect(html).not.toContain('<script>"x"');
  });

  it("routes /g/ links to the share page before the app's catch-all", () => {
    expect(vercel.rewrites[0]).toEqual({ source: "/g/:sport/:id", destination: "/api/share?sport=:sport&id=:id" });
    expect(vercel.rewrites[vercel.rewrites.length - 1].source).toBe("/((?!api/).*)");
  });

  it("draws the one line, then the splits, then the matchup, with only MGP named", () => {
    const card = shareCard(game, "https://www.mgp-analytics.com/logos/mgp-wordmark.png");
    const t = allText(card);
    for (const s of ["32-19", "BETS", "DET +1.5", "54%", "MONEY", "50%", "Bears", "Lions", "CHI -1.5 · O/U 55.5", "mgp-analytics.com"]) {
      expect(t).toContain(s);
    }
    // Owner, Nov 26: the one line first, the splits next, the matchup after
    expect(t.indexOf("32-19")).toBeLessThan(t.indexOf("BETS"));
    expect(t.indexOf("MONEY")).toBeLessThan(t.indexOf("Bears"));
    expect(JSON.stringify(card)).not.toMatch(/DraftKings/i);
    expect(JSON.stringify(card)).toContain("mgp-wordmark.png");
    expect(DASHES.some((d) => JSON.stringify(card).includes(d))).toBe(false);
    expect(allText(fallbackCard("w"))).toContain("The numbers behind every game");
  });
});
