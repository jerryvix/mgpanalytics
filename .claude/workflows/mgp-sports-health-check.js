export const meta = {
  name: 'mgp-sports-health-check',
  description: 'Per-sport pipeline inspectors + judge produce a stoplight ops report',
  whenToUse: 'Twice-daily backend data health report. args: { health: <output of scripts/ops/health-check.mjs>, today: "Aug 9, 2026", label: "AM"|"PM" }',
  phases: [
    { title: 'Inspect', detail: 'one specialist agent per sport domain' },
    { title: 'Judge', detail: 'cross-check and compose final report' },
  ],
}

const health = args.health
const today = args.today ?? 'unknown date (derive from health.generated_at)'
const label = args.label ?? ''
const repo = 'C:\\Users\\VIXAM\\OneDrive\\Documents\\Repos\\mgpanalytics'

const REPORT_SCHEMA = {
  type: 'object',
  required: ['sport', 'light', 'items', 'summary'],
  properties: {
    sport: { type: 'string' },
    light: { enum: ['green', 'yellow', 'red'] },
    summary: { type: 'string', description: '2-3 plain sentences on the state of this domain' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'what', 'light', 'detail'],
        properties: {
          name: { type: 'string' },
          what: { type: 'string', description: 'plain-English "what is it" one-liner' },
          light: { enum: ['green', 'yellow', 'red', 'gray'] },
          detail: { type: 'string' },
        },
      },
    },
  },
}

const common = `You are a data-pipeline inspector for MGP Analytics (sports betting analytics app).
Repo: ${repo}. Supabase project: https://vwezujtftfccamoduglp.supabase.co (read-only REST access
with the publishable key found in ${repo}\\.env.local; query with curl:
curl -s "URL/rest/v1/<table>?..." -H "apikey: KEY" -H "Authorization: Bearer KEY").
A deterministic health snapshot taken minutes ago is included below. Your job: verify and enrich it
for YOUR domain only. Read edge function code under ${repo}\\supabase\\functions when a failure needs
diagnosis. Do NOT attempt any writes; do NOT call admin functions. Some tables (games, odds) are
RLS-blocked for anon; treat empty results there as "cannot probe", not as missing data.
Today is ${today}. Derive each sport's season phase from the date (MLB Mar-Nov, NFL Aug-Feb,
NCAAF Aug-Jan, NBA Oct-Jun, NCAAB Nov-Apr) and judge staleness accordingly.
Assign each item a stoplight: green = working as intended, yellow = degraded/watch, red = broken/stale,
gray = intentionally idle (off-season/disabled). Keep "what" fields plain-English for a non-engineer skim.
Health snapshot:
${JSON.stringify(health)}`

const DOMAINS = [
  {
    key: 'MLB',
    prompt: `${common}

DOMAIN: MLB. Cover: games+odds sync (mlb_games/mlb_odds), player roster sync, hitting stats + HIT STREAKS
(player_season_stats.hit_streak, player_game_logs). Hit streaks are the owner's top concern.
Verify with fresh queries: newest player_game_logs game_date for MLB (should include yesterday's slate),
newest player_season_stats.updated_at for MLB, count of players with hit_streak >= 5, and whether mlb_games
has rows for today. Also sanity-check one streak: pick the top hit_streak player row and confirm their
recent game logs (hits column) are consistent with the streak number. Note: sync-mlb-hitting only covers the
top ~250 hitters by plate appearances (pa >= 50), and deletes/re-inserts season game logs each run.`,
  },
  {
    key: 'NFL',
    prompt: `${common}

DOMAIN: NFL. Cover all NFL schedule rows in the snapshot: games, players, players_slate, season_stats,
game_logs, player_ids, adp, win_totals, preseason_props, props, advanced_stats. For any FAILED row,
read the matching function under ${repo}\\supabase\\functions to diagnose (e.g. sync-nfl-game-logs
timeouts, sync-win-totals scraper breakage). advanced_stats is a known orphan row with no function mapped.
Cross-check freshness through player_season_stats sport=NFL (the games/odds tables are anon-blocked).`,
  },
  {
    key: 'NCAAF',
    prompt: `${common}

DOMAIN: NCAAF/CFB. Cover: games+odds (ncaaf_games/ncaaf_odds via ESPN), CFBD results/H2H (ncaaf_game_results),
roster intel (7d cadence), draft board (ncaaf_draft_prospects, DraftTek top 200 since Sep 2026, 24h cadence; judge freshness by source_as_of, DraftTek's own revision date, not captured_at).
Verify ncaaf_games has upcoming season games with odds coverage, results table has prior-season data, and
roster intel + draft board tables are populated. Flag anything that would embarrass the product during
season kickoff weeks.`,
  },
  {
    key: 'OFFSEASON',
    prompt: `${common}

DOMAIN: NBA + NCAAB. If these are off-season on today's date, staleness is EXPECTED - do not cry wolf;
confirm nothing is actively erroring in a way that will bite at season restart, and that last-season data
(nba_games, player_season_stats sport=NBA) still exists so historical views render. NBA:backfill is a
historical backfill left on a recurring schedule (a repo migration disables it; prod may lag).
If in season, treat them as first-class: check games/odds/stats freshness like the other inspectors.
Assign gray/green appropriately; red only if something matters now or at restart.`,
  },
  {
    key: 'CROSS-SPORT',
    prompt: `${common}

DOMAIN: cross-sport infrastructure. Cover: player props sync (ALL:player_props), odds_snapshot line-movement
history (odds_history), grade_props results grading, and the dispatch-syncs external cron itself: look at the
spread of last_sync_at times across ALL rows to confirm the ~4h dispatch cadence is still firing (dispatches
cluster at 01:00/05:00/09:00 UTC etc). If the newest last_sync_at across every enabled in-season row is older
than ~5h, the external cron itself may be down: that is a top-priority red affecting everything.
Also assess records_synced=0 rows: read ${repo}\\supabase\\functions\\_shared\\sync-logger.ts to judge whether
that field is simply not written back (cosmetic) or data is genuinely not flowing; verify player_props has
recent rows regardless.`,
  },
]

phase('Inspect')
const inspections = await parallel(DOMAINS.map(d => () =>
  agent(d.prompt, { label: `inspect:${d.key}`, phase: 'Inspect', schema: REPORT_SCHEMA, effort: 'medium' })
))

phase('Judge')
const judged = await agent(`You are the final judge for MGP Analytics' twice-daily backend ops report.
Five specialist inspectors examined their domains. Cross-check their reports against each other and the raw
health snapshot for contradictions or gaps (a modality nobody covered, a red that two agents explain differently).
Then compose the final report EXACTLY in this shape (plain text/markdown, no em dashes anywhere - use commas,
colons or parentheses instead; this is a hard product rule):

1. Subject line: "MGP Backend Health: <emoji> <one-phrase verdict> (${today} ${label})"
2. A 2-4 sentence executive summary a founder can read on his phone.
3. One section per domain (MLB, NFL, NCAAF, NBA/NCAAB, Cross-sport), each item as:
   <stoplight emoji> **<thing>**: <"what is it" one-liner>. <status detail, one line>
   Use these emoji exactly: green circle, yellow circle, red circle, white circle (idle/off-season).
4. "Action needed" list: only items that need Jerry to do something, each with a concrete step.
5. A one-line footer noting this report was generated by the automated per-sport agent check.

Raw snapshot: ${JSON.stringify(health)}

Inspector reports:
${JSON.stringify(inspections.filter(Boolean))}`, {
  label: 'judge', phase: 'Judge', effort: 'high',
  schema: {
    type: 'object',
    required: ['overall_light', 'subject', 'report_markdown'],
    properties: {
      overall_light: { enum: ['green', 'yellow', 'red'] },
      subject: { type: 'string' },
      report_markdown: { type: 'string' },
      cross_check_notes: { type: 'string', description: 'contradictions or gaps found between inspectors, if any' },
    },
  },
})

return { judged, inspections: inspections.filter(Boolean) }
