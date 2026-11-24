// Turn a batch of assistant-extracted X posts into takes rows and market notes.
// Pure: the HTTP handler fetches games and writes. Matching uses ingest-takes/games.ts.

import { MATCH_ONE, matchToGame, type UpcomingGame } from "../ingest-takes/games.ts";
import { plainDashes } from "../_shared/plain-dashes.ts";
import { xAccount, type XTakesAccount } from "../_shared/takes-sources.ts";

const SPORTS = new Set(["NFL", "NBA", "NCAAF", "NCAAB"]);
const MARKETS = new Set(["spread", "total", "moneyline", "prop", "parlay", "other"]);
const MAX_ITEMS = 40;
const POST_ID = /^[A-Za-z0-9_]{2,40}$/;

export interface PreparedPick {
  show: string;
  show_name: string;
  person: string;
  sport: string;
  espn_event_id: string;
  matchup: string;
  starts_at: string;
  market: string;
  pick: string;
  price: string | null;
  units: number | null;
  legs: string[];
  why: string | null;
  episode_guid: string;
  episode_title: string;
  episode_published_at: string;
  source: "x";
  external_id: string;
  url: string;
  match_confidence: number;
}

export interface PreparedNote {
  source: "x";
  handle: string;
  author_name: string;
  credit: string;
  sport: string;
  espn_event_id: string;
  matchup: string;
  starts_at: string;
  away_name: string;
  home_name: string;
  market: string | null;
  body: string;
  post_id: string;
  url: string;
  posted_at: string;
  match_confidence: number;
}

export interface ItemResult {
  post_id: string | null;
  status: "stored" | "unmatched" | "rejected" | "duplicate";
  kind?: "pick" | "note";
  reason?: string;
  espn_event_id?: string;
  matchup?: string;
  confidence?: number;
}

export interface PreparedBatch {
  picks: PreparedPick[];
  notes: PreparedNote[];
  results: ItemResult[];
}

function cleanLine(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const s = plainDashes(raw).replace(/\s+/g, " ").trim();
  if (!s || s.length > max) return null;
  return s;
}

function cleanPrice(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = plainDashes(String(raw)).replace(/\s/g, "");
  if (!s) return null;
  if (/^[+-]?\d{2,5}$/.test(s)) return s;
  if (/^even$/i.test(s) || s.toLowerCase() === "ev") return "EVEN";
  if (/^pk$/i.test(s)) return "PK";
  return null;
}

function cleanUnits(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number"
    ? raw
    : typeof raw === "string" && /^(\d+(?:\.\d+)?)u?$/i.test(raw.trim())
      ? Number(raw.trim().replace(/u$/i, ""))
      : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const ok = host === "x.com" || host === "www.x.com" || host === "twitter.com" || host === "www.twitter.com" || host === "mobile.twitter.com";
  if (!ok || !/\/status\/[A-Za-z0-9]+/.test(url.pathname)) return null;
  return url.toString();
}

function cleanLegs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const leg of raw.slice(0, 12)) {
    const s = cleanLine(leg, 160);
    if (s) out.push(s);
  }
  return out;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

interface Parsed {
  postId: string;
  url: string;
  account: XTakesAccount;
  postedAt: string;
  kind: "pick" | "note";
  sport: string;
  text: string;
  matchup: string;
  market: string | null;
  pick: string;
  price: string | null;
  units: number | null;
  legs: string[];
  why: string | null;
}

function parseItem(raw: unknown, now: Date): { ok: true; item: Parsed } | { ok: false; postId: string | null; reason: string } {
  const row = asRecord(raw);
  if (!row) return { ok: false, postId: null, reason: "item must be an object" };
  const postId = typeof row.post_id === "string" ? row.post_id.trim() : "";
  if (!POST_ID.test(postId)) return { ok: false, postId: postId || null, reason: "post_id must be 2 to 40 letters or digits" };

  const account = typeof row.handle === "string" ? xAccount(row.handle) : null;
  if (!account) return { ok: false, postId, reason: "unknown handle" };

  const author = cleanLine(row.author, 80);
  if (!author) return { ok: false, postId, reason: "author display name is required" };

  const kind = row.kind === "pick" || row.kind === "note" ? row.kind : null;
  if (!kind) return { ok: false, postId, reason: "kind must be pick or note" };
  if (kind === "pick" && account.kind === "notes") {
    return { ok: false, postId, reason: "this account files notes, not picks" };
  }

  const sport = typeof row.sport === "string" ? row.sport.trim().toUpperCase() : "";
  if (!SPORTS.has(sport)) return { ok: false, postId, reason: "sport must be NFL, NBA, NCAAF or NCAAB" };

  const text = cleanLine(row.text, kind === "note" ? 500 : 800);
  if (!text) return { ok: false, postId, reason: kind === "note" ? "text must be 1 to 500 characters" : "text is required" };

  const url = cleanUrl(row.url);
  if (!url) return { ok: false, postId, reason: "url must be an https://x.com or https://twitter.com status link" };

  const posted = typeof row.posted_at === "string" ? Date.parse(row.posted_at) : NaN;
  if (!Number.isFinite(posted)) return { ok: false, postId, reason: "posted_at must be an ISO time" };
  if (now.getTime() - posted > 14 * 86_400_000) return { ok: false, postId, reason: "posted_at is too old" };
  if (posted - now.getTime() > 3_600_000) return { ok: false, postId, reason: "posted_at is in the future" };

  const legs = cleanLegs(row.legs);
  let market = typeof row.market === "string" && MARKETS.has(row.market) ? row.market : null;
  const pick = cleanLine(row.pick, 200) ?? (kind === "pick" ? cleanLine(row.text, 200) : null) ?? "";
  if (kind === "pick" && !pick) return { ok: false, postId, reason: "pick is required" };
  if (!market && legs.length > 1) market = "parlay";

  const price = cleanPrice(row.price);
  if (row.price != null && row.price !== "" && price == null && kind === "pick") {
    return { ok: false, postId, reason: "price must look like -110, +200, EVEN or PK" };
  }

  return {
    ok: true,
    item: {
      postId,
      url,
      account,
      postedAt: new Date(posted).toISOString(),
      kind,
      sport,
      text,
      matchup: cleanLine(row.matchup, 120) ?? "",
      market,
      pick,
      price,
      units: cleanUnits(row.units),
      legs,
      why: cleanLine(row.why, 400),
    },
  };
}

function haystack(item: Parsed): string {
  return [item.matchup, item.text, item.pick, ...item.legs].filter(Boolean).join(" ");
}

/**
 * Validate every item, match it to a game, and build the rows to upsert.
 * The same post id plus pick (or the same post id plus note text) keeps one row.
 * Items that fail the match are flagged and not stored.
 */
export function prepareXBatch(rawItems: unknown[], games: UpcomingGame[], now = new Date()): PreparedBatch {
  const picks: PreparedPick[] = [];
  const notes: PreparedNote[] = [];
  const results: ItemResult[] = [];
  const seenPick = new Map<string, number>();
  const seenNote = new Map<string, number>();

  const list = rawItems.slice(0, MAX_ITEMS);
  for (const raw of list) {
    const parsed = parseItem(raw, now);
    if (!parsed.ok) {
      results.push({ post_id: parsed.postId, status: "rejected", reason: parsed.reason });
      continue;
    }
    const item = parsed.item;
    const matched = matchToGame(games, { sport: item.sport, text: haystack(item) });
    if (!matched.ok) {
      results.push({ post_id: item.postId, status: "unmatched", kind: item.kind, reason: matched.reason });
      continue;
    }
    if (matched.confidence < MATCH_ONE) {
      results.push({ post_id: item.postId, status: "unmatched", kind: item.kind, reason: "match confidence too low" });
      continue;
    }
    const game = matched.game;
    if (item.kind === "note") {
      const key = `${item.postId}\n${item.text}`;
      const prev = seenNote.get(key);
      if (prev != null) results[prev] = { ...results[prev], status: "duplicate", reason: "same post and note later in this batch" };
      seenNote.set(key, results.length);
      notes.push({
        source: "x",
        handle: item.account.handle,
        author_name: item.account.person,
        credit: item.account.noteCredit,
        sport: game.sport,
        espn_event_id: game.id,
        matchup: game.matchup,
        starts_at: game.startsAt,
        away_name: game.awayName,
        home_name: game.homeName,
        market: item.market,
        body: item.text,
        post_id: item.postId,
        url: item.url,
        posted_at: item.postedAt,
        match_confidence: matched.confidence,
      });
      results.push({
        post_id: item.postId, status: "stored", kind: "note",
        espn_event_id: game.id, matchup: game.matchup, confidence: matched.confidence,
      });
      continue;
    }

    const key = `${item.postId}\n${item.pick}`;
    const prev = seenPick.get(key);
    if (prev != null) results[prev] = { ...results[prev], status: "duplicate", reason: "same post and pick later in this batch" };
    seenPick.set(key, results.length);
    picks.push({
      show: item.account.show,
      show_name: item.account.showName,
      person: item.account.person,
      sport: game.sport,
      espn_event_id: game.id,
      matchup: game.matchup,
      starts_at: game.startsAt,
      market: item.market ?? "other",
      pick: item.pick,
      price: item.price,
      units: item.units,
      legs: item.legs,
      why: item.why,
      episode_guid: item.postId,
      episode_title: "X post",
      episode_published_at: item.postedAt,
      source: "x",
      external_id: item.postId,
      url: item.url,
      match_confidence: matched.confidence,
    });
    results.push({
      post_id: item.postId, status: "stored", kind: "pick",
      espn_event_id: game.id, matchup: game.matchup, confidence: matched.confidence,
    });
  }

  // A duplicate earlier in the batch must not be written twice (Postgres rejects that upsert).
  const pickRows = new Map<string, PreparedPick>();
  for (const p of picks) pickRows.set(`${p.external_id}\n${p.pick}`, p);
  const noteRows = new Map<string, PreparedNote>();
  for (const n of notes) noteRows.set(`${n.post_id}\n${n.body}`, n);

  return { picks: [...pickRows.values()], notes: [...noteRows.values()], results };
}

export { MAX_ITEMS };
