# MGP Analytics: Agent and Developer Guide

Sports betting analytics (NFL, NBA, NCAAB, NCAAF, MLB): odds and line movement, player stats, hit streaks, and a grounded AI analyst chat. Web app live at mgp-analytics.com; an iPhone app is in progress.

## Read first

- **iPhone app work:** `docs/mobile/PLAN.md`, then `docs/mobile/STATUS.md` and `docs/mobile/DECISIONS.md`.
- **Any user-facing copy or claims:** `docs/positioning.md`. It lists what MGP may and may not claim. Consumer copy must trace to it.
- **Curated insight content:** `docs/nugget-grading.md`.

## Layout

```
src/                 web app (React 18, Vite, Tailwind, shadcn/ui, TanStack Query)
supabase/functions/  Deno edge functions (syncs, analyst chat, grading)
supabase/migrations/ database migrations
mobile/              Expo iPhone app (in progress, see docs/mobile)
packages/shared/     pure TypeScript shared by web and mobile (in progress)
scripts/ops/         ops tooling (health check)
.beads/              earlier issue history (JSONL); app work is tracked in docs/mobile/STATUS.md
```

## Commands (web)

```sh
npm install
npm run dev      # http://localhost:8080
npm test         # vitest
npm run lint
npm run build
```

Set `VITE_DEV_BYPASS_AUTH=true` in `.env` to preview the dashboard locally with a fake user (dev builds only).

## Rules

- **No mock or random data on user-facing surfaces.** Some legacy components still use `Math.random()`; they are listed in `docs/positioning.md` and must not be ported to the app or extended.
- **The analyst never gives picks.** It is descriptive only: no "should bet", "lock", or recommendations. Market numbers come only from synced data.
- **Odds math lives in `src/lib/odds.ts`:** consensus is computed in probability space; never average American odds directly.
- **Labels are Title Case** (titles, buttons, tabs, chips, badges, menu items): "Player Props", "Browse by Sport". Sentences, empty states, tooltips and screen-reader labels stay sentence case. Use `titleCase()` from `packages/shared/text/title-case.ts` for labels built from data. (DECISIONS D-027)
- **Consumer copy:** positive claims only, second person, short sentences, no em dashes, no competitor names. Odds update on a schedule (about every 6 hours), so don't call odds "real time".
- **The `gemini-chat` function runs Claude**, not Gemini; the name is legacy.
- **Secrets** never go in the repo or in chat. Edge function secrets are set with `supabase secrets set`.
- **No amber for ranks:** rank badges use the `rank` color (black/charcoal). (DECISIONS D-033)
- **Admin surfaces** (admin panel, sync observatory, data inspector) are web only.
- Record any non-obvious product or technical decision for the app in `docs/mobile/DECISIONS.md`.
