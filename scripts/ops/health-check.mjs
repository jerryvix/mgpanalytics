// MGP Analytics backend health check.
//
// Read-only: queries Supabase REST with the publishable (anon) key, the same
// key the browser ships with. Prints a JSON health report to stdout covering
// (1) sync_schedule staleness vs each row's own interval and (2) direct data
// freshness probes per sport, so a dispatcher that lies about "success" still
// gets caught by the data itself.
//
// Usage: node scripts/ops/health-check.mjs [--pretty]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function envFromDotLocal() {
  try {
    const raw = readFileSync(join(repoRoot, ".env.local"), "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const dotEnv = envFromDotLocal();
const URL_BASE = process.env.VITE_SUPABASE_URL ?? dotEnv.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? dotEnv.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!URL_BASE || !KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (env or .env.local)");
  process.exit(2);
}

async function rest(pathAndQuery) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathAndQuery}: ${await res.text()}`);
  return res.json();
}

// Mirrors supabase/functions/dispatch-syncs/index.ts (keep in lockstep).
function isSportInSeason(sport, month = new Date().getUTCMonth()) {
  switch (sport) {
    case "NFL":   return month >= 7 || month <= 1;
    case "NBA":   return month >= 9 || month <= 5;
    case "NCAAB": return month >= 10 || month <= 3;
    case "NCAAF": return month >= 6 || month <= 0;
    case "MLB":   return month >= 2 && month <= 10;
    default:      return true;
  }
}

function intervalToMs(interval) {
  const m = /^(\d+)(h|m|d)$/.exec(interval ?? "");
  if (!m) return 24 * 3600 * 1000;
  const v = Number(m[1]);
  return m[2] === "m" ? v * 60_000 : m[2] === "h" ? v * 3600_000 : v * 86_400_000;
}

const now = Date.now();
const hoursAgo = (iso) => (iso ? (now - Date.parse(iso)) / 3600_000 : null);

// ---------------------------------------------------------------------------
// 1. sync_schedule analysis
// ---------------------------------------------------------------------------
async function checkSchedules() {
  const rows = await rest("sync_schedule?select=*&order=sport,data_type");
  return rows.map((r) => {
    const age = hoursAgo(r.last_sync_at);
    const intervalH = intervalToMs(r.cron_interval) / 3600_000;
    const inSeason = isSportInSeason(r.sport);
    // Grace: the external cron only invokes the dispatcher every ~4h, so a
    // row's effective max age is interval + 4h even when everything is healthy.
    const DISPATCH_PERIOD_H = 4;
    const late = age !== null && age > intervalH + DISPATCH_PERIOD_H + 1;
    const overdue = age !== null && age > intervalH * 2 + DISPATCH_PERIOD_H + 1;
    let status = "green";
    let note = "";
    if (!r.is_enabled) {
      status = "gray";
      note = "disabled";
    } else if (!inSeason) {
      status = "gray";
      note = "out of season (staleness expected)";
    } else if (r.last_sync_status === "failed") {
      status = "red";
      note = `last run FAILED: ${r.error_message ?? "no error message"}`;
    } else if (overdue) {
      status = "red";
      note = `overdue: last sync ${age.toFixed(1)}h ago vs ${r.cron_interval} interval`;
    } else if (late) {
      status = "yellow";
      note = `running late: last sync ${age.toFixed(1)}h ago vs ${r.cron_interval} interval`;
    }
    return {
      sport: r.sport,
      data_type: r.data_type,
      interval: r.cron_interval,
      enabled: r.is_enabled,
      in_season: inSeason,
      last_sync_at: r.last_sync_at,
      hours_since_sync: age === null ? null : Number(age.toFixed(2)),
      last_sync_status: r.last_sync_status,
      records_synced: r.records_synced,
      error_message: r.error_message,
      status,
      note,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Data freshness probes (independent of what sync_schedule claims)
// ---------------------------------------------------------------------------
// Each probe: query returning [{ value }] where value is a timestamp or date;
// maxAgeHours is how old the newest row may be before the probe goes red.
// Probes only fire for in-season sports.
const PROBES = [
  {
    sport: "MLB", name: "hit_streak_stats_updated",
    what: "MLB season stats incl. hit streaks last written",
    query: "player_season_stats?select=updated_at&sport=eq.MLB&order=updated_at.desc&limit=1",
    field: "updated_at", maxAgeHours: 9, // 4h interval, allow two misses
  },
  {
    sport: "MLB", name: "mlb_game_logs_latest",
    what: "newest MLB player game log (feeds streak math)",
    query: "player_game_logs?select=game_date&sport=eq.MLB&order=game_date.desc&limit=1",
    field: "game_date", maxAgeHours: 42, // yesterday's games by mid-morning
  },
  {
    sport: "MLB", name: "mlb_games_synced",
    what: "MLB games/odds table last written",
    query: "mlb_games?select=updated_at&order=updated_at.desc&limit=1",
    field: "updated_at", maxAgeHours: 10,
  },
  // NOTE: the `games` (NFL) and `odds` tables are RLS-restricted to
  // authenticated users, so the anon key cannot probe them directly; their
  // sync_schedule rows are the signal for those. player_game_logs filtered by
  // sport=NFL also times out under the anon statement limit, so NFL freshness
  // is probed via season stats instead.
  {
    sport: "NFL", name: "nfl_season_stats_updated",
    what: "NFL player season stats last written",
    query: "player_season_stats?select=updated_at&sport=eq.NFL&order=updated_at.desc&limit=1",
    field: "updated_at", maxAgeHours: 30,
  },
  {
    sport: "NCAAF", name: "ncaaf_games_synced",
    what: "NCAAF games table last written",
    query: "ncaaf_games?select=updated_at&order=updated_at.desc&limit=1",
    field: "updated_at", maxAgeHours: 30,
  },
  {
    sport: "ALL", name: "odds_snapshot_latest",
    what: "line-movement odds history last captured",
    query: "odds_history?select=created_at&order=created_at.desc&limit=1",
    field: "created_at", maxAgeHours: 13, // 6h interval, allow two misses
  },
];

async function runProbes() {
  const results = [];
  for (const p of PROBES) {
    if (p.sport !== "ALL" && !isSportInSeason(p.sport)) {
      results.push({ ...pick(p), status: "gray", note: "out of season" });
      continue;
    }
    try {
      const rows = await rest(p.query);
      const iso = rows[0]?.[p.field];
      if (!iso) {
        results.push({ ...pick(p), status: "red", note: "no rows found" });
        continue;
      }
      const age = hoursAgo(iso);
      const status = age <= p.maxAgeHours ? "green" : "red";
      results.push({
        ...pick(p), status,
        newest: iso, hours_old: Number(age.toFixed(2)), max_age_hours: p.maxAgeHours,
        note: status === "green" ? "" : `newest row is ${age.toFixed(1)}h old (limit ${p.maxAgeHours}h)`,
      });
    } catch (e) {
      results.push({ ...pick(p), status: "red", note: `probe error: ${e.message}` });
    }
  }
  return results;

  function pick(p) {
    return { sport: p.sport, name: p.name, what: p.what };
  }
}

// ---------------------------------------------------------------------------
const [schedules, probes] = await Promise.all([checkSchedules(), runProbes()]);

const worst = (items) =>
  items.some((i) => i.status === "red") ? "red"
  : items.some((i) => i.status === "yellow") ? "yellow"
  : "green";

const active = [...schedules.filter((s) => s.status !== "gray"), ...probes.filter((p) => p.status !== "gray")];

const report = {
  generated_at: new Date().toISOString(),
  overall: worst(active),
  schedules,
  probes,
};

const pretty = process.argv.includes("--pretty");
console.log(JSON.stringify(report, null, pretty ? 2 : 0));
process.exit(report.overall === "red" ? 1 : 0);
