# MGP iPhone App: Plan

**Start here.** This folder is the single source of truth for taking MGP from a web app to an App Store app. Anyone picking this up (a developer, a designer, or a Claude session) should read this file, then `STATUS.md`, then `DECISIONS.md`.

| File | What it is |
|---|---|
| `PLAN.md` | Goal, scope, architecture, timeline (this file) |
| `STATUS.md` | Where things stand right now, updated as work moves |
| `DECISIONS.md` | Every product and technical decision, with the reason |
| `OWNER_ACTIONS.md` | Things only the owner (Jerry) can do: accounts, money, legal sign-off |
| `APP_STORE_COMPLIANCE.md` | App Review rules this app must meet, and how we meet each one |
| `REFERENCE_STOCKS_NEWS.md` | Teardown of the reference app and how each pattern maps to MGP |
| `RUNBOOK.md` | How to build, test, and ship a release |

---

## North star

The Bloomberg terminal of sports betting: every number a bettor needs, in one place, without telling them what to bet. Nobody can predict outcomes; MGP gives people the information. This phrase is internal only. App Store and in-app copy can't use it (`docs/positioning.md` bans analogies in shipped copy, and Apple rejects other companies' trademarks in store listings).

## Goal

Ship MGP as a native iPhone app in the App Store that feels as clean and easy for new users as Stocks.News (App Store id 6476615803), while keeping the existing website live and sharing one backend and one set of user accounts.

## Approach (see DECISIONS D-003)

- **Native rebuild of the screens with Expo (React Native).** The Supabase backend, database, sync pipelines and analyst chat stay exactly as they are. Only the presentation layer is new.
- **Web app is untouched** at the repo root and keeps deploying to Vercel as today.
- **Cloud builds (EAS).** No Mac needed. TestFlight and App Store submission run from EAS.
- **iOS first.** Android builds from the same code after iOS is live (Google Play is a $25 one-time fee).

## Repo layout

```
/                     existing web app (Vite + React), unchanged
mobile/               Expo app (expo-router, TypeScript)
packages/shared/      pure TypeScript shared by web and mobile (odds math, types, sport helpers)
supabase/             backend, shared by both clients
docs/mobile/          this folder
```

## v1 scope (ship before Christmas)

The rule for v1: only what a brand-new user needs in the first week. Everything else goes to v1.1.

| # | Screen / feature | Notes |
|---|---|---|
| 1 | First launch | One welcome screen, then pick sports and teams (skippable), then an optional "Get alerts for your teams" screen. No account needed (D-014) |
| 2 | Sign in / sign up | Bottom sheet shown when a guest follows, sets an alert, or opens the Analyst. Sign in with Apple, Google, email. Same accounts as the website; guest data carries over |
| 3 | Notification asks | Soft asks only: slim bar above the tab bar and "Alert me" on modules; system prompt after a tap (D-018) |
| 4 | Today (home) | Sport bar over modules: biggest line moves, your teams today, tonight's games, hot streaks (in season), insiders, games this week (D-015) |
| 5 | Games | Day strip with game counts, sport chips, slate list. Game detail: header with bell, star, share; current line large with change since open and "odds as of"; section bar (Odds, Line movement, Matchup, Streaks, Props, Analyst); disclaimer block at the bottom |
| 6 | Alerts | Your team's game starting, final scores, big line moves (current odds refresh, worded honestly), plus a bell on any game page to follow that game (D-024). In-app inbox with filter chips and swipe to edit or remove |
| 7 | Insiders | Sharps, insiders, analysts and media with category chips, follow, and "Open on X". Posts shown in the app wait for X API approval (D-023) |
| 8 | Analyst | The grounded AI chat, with a one-time consent screen for third-party AI |
| 9 | Profile | Sports and teams, notification settings, legal pages, responsible gaming, sign out, **delete account** |

**Not in v1 (v1.1 or later):** player status alerts (Out, Questionable, Active; the sports version of trading-halt alerts), "most talked-about games" from X mentions, practice bankroll (fake-money "simulator"), home screen widgets, Live Activities for live games, community feed, fantasy tools, draft board, player pages beyond what game detail needs, paywall (built behind a switch, off at launch).

**Never ported:** admin panel, sync observatory, data inspector (stay web only), and any component that shows mock or random data (see `docs/positioning.md`).

## Timeline

Today is Fri Nov 20, 2026. Target: **submit to App Review around Dec 16, live before Christmas.** Worst realistic case: first week of January.

| Week | Dates | Build (Claude) | Owner (Jerry) |
|---|---|---|---|
| 1 | Nov 20 to Nov 27 | Handoff docs, design system, Figma boards, Expo scaffold, backend prerequisites (account deletion, push tables) | Start D-U-N-S and Apple enrollment (critical path) |
| 2 | Nov 30 to Dec 4 | Core screens: onboarding, Today, Games, game detail, Profile | React to design notes in Figma (one pass) |
| 3 | Dec 7 to Dec 11 | Alerts engine + inbox, Analyst, Insiders, Sign in with Apple. First TestFlight build | Install TestFlight, use it for a few days |
| 4 | Dec 14 to Dec 18 | Fixes from feedback, store listing, screenshots, privacy labels, legal pages. Submit | Approve listing and legal pages |
| 5 | Dec 21 onward | Answer App Review; fix and resubmit if rejected | None unless a rejection needs a business decision |

**Critical path:** Apple verifying the LLC (D-U-N-S, then enrollment review) gates the first TestFlight build. Everything else runs in parallel with it. If Apple approval slips past Dec 9, launch slides day for day.

**Known schedule risks:** Apple verification delays; one App Review rejection (adds 2 to 5 days); App Review slows down around Christmas.

## Architecture (mobile)

- **Framework:** Expo SDK 58, expo-router (file-based routes), TypeScript strict.
- **Data:** `@supabase/supabase-js` against the same project as the web app; TanStack Query for caching (same as web). Session stored in the device keychain.
- **Auth:** Supabase Auth. Guests get an anonymous session on first launch (D-014); signing up links it to Sign in with Apple, Google, or email. The existing website accounts work unchanged. The Analyst requires a full account.
- **Push alerts:** `expo-notifications` with the Expo push service. New tables: device push tokens, alert preferences, alert inbox. A new edge function evaluates alert rules after each sync and sends pushes.
- **Paywall-ready:** an entitlement hook that returns "everything unlocked" at launch, so a subscription can be switched on in v1.1 without restructuring screens.
- **Releases:** EAS Build (cloud), EAS Submit (TestFlight and App Store), EAS Update for over-the-air JavaScript fixes between store releases.

## Design

Claude designs; the owner's advisor reviews in Figma. Code is the source of truth for design tokens (`packages/shared/design-tokens`), and Figma mirrors them for review.

- Page 1 of the Figma file: the current web app at phone size, broken into its design system.
- Page 2 ("App"): Stocks.News screens with comments on what to adopt and how it compares to MGP today.

We adopt Stocks.News **patterns** (onboarding flow, alert-first home, filter chips, follow lists, inbox), not its visual identity or artwork. See `REFERENCE_STOCKS_NEWS.md`.

## When the owner is pulled in

Only for:

1. Anything needing the owner's identity, money, or signature: accounts, payments, legal pages.
2. Two taste checkpoints: the Figma review (week 2) and the TestFlight feel check (week 3).
3. Any recurring cost increase (for example a faster odds plan for real-time alerts).
4. An App Review rejection that needs a business decision.

Everything else is decided by the builder and logged in `DECISIONS.md`.
