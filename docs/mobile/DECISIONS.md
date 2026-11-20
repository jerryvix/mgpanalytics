# Decision Log

Newest at the bottom. Each entry: what was decided, why, and who decided. "Owner" means Jerry. "Builder" means whoever is building (currently Claude). To reverse a decision, add a new entry that supersedes it; don't edit the old one.

---

### D-001 Apple Developer account is owned by the company (LLC), not an individual
**Date:** 2026-11-20 · **By:** Owner
**Why:** Apple expects apps in regulated areas (betting-related content) to come from a legal entity, and the seller name on the store listing should be the company, not a personal name. Requires a D-U-N-S number for the LLC.
**Consequence:** enrollment takes about 1 to 2 weeks instead of 1 to 2 days; it is the critical path.

### D-002 Free at launch, paywall built but switched off
**Date:** 2026-11-20 · **By:** Owner
**Why:** fastest approval, builds an audience first. Subscriptions add in-app purchase setup, banking and tax forms, and need a data-licensing check before charging (see `APP_STORE_COMPLIANCE.md`).
**Consequence:** screens read entitlements through one hook so v1.1 can turn on a subscription without restructuring.

### D-003 Native rebuild with Expo (React Native), not a wrapped website
**Date:** 2026-11-20 · **By:** Owner (on builder recommendation)
**Why:** Apple often rejects website wrappers (guideline 4.2). The screens are being redesigned anyway, so building them natively costs little extra. Expo builds in the cloud (no Mac), gives Android nearly free, and supports over-the-air fixes.
**Alternatives rejected:** Capacitor wrapper of the existing site (faster to package, but rejection risk and it would not feel native).

### D-004 Claude designs; the owner's advisor reviews in Figma
**Date:** 2026-11-20 · **By:** Owner
**Why:** keeps design moving without waiting on another person. Figma is the review surface; design tokens in code are the source of truth.

### D-005 Compressed timeline: submit around Dec 16, 2026
**Date:** 2026-11-20 · **By:** Builder (owner asked for faster than 12 weeks)
**Why:** the original 12-week estimate assumed a human team with a gated design phase and long beta. Design now runs alongside the build, and v1 scope is limited to first-week essentials (see `PLAN.md`).

### D-006 Web app stays at the repo root, untouched; mobile lives in `mobile/`
**Date:** 2026-11-20 · **By:** Builder
**Why:** moving the web app into a monorepo folder would require changing the Vercel project's root directory, which is a production deploy risk for no user benefit. Pure logic shared by both clients goes in `packages/shared/`.

### D-007 No mock or random data in the app
**Date:** 2026-11-20 · **By:** Builder
**Why:** `PublicBettingPreview` and parts of the NFL advanced stats use `Math.random()` (see `docs/positioning.md`). Shipping made-up numbers in a store app breaks MGP's "we don't make things up" positioning and risks guideline 2.3 (accurate metadata). Those surfaces are not ported until they have real data.

### D-008 No sportsbook links in v1
**Date:** 2026-11-20 · **By:** Builder
**Why:** some synced content contains DraftKings deep links with referral parameters. Linking out to real-money sportsbooks invites extra App Review scrutiny and state-by-state legality questions. Revisit if affiliate revenue becomes a goal.

### D-009 No league or team logos in the app icon, store screenshots or listing
**Date:** 2026-11-20 · **By:** Builder
**Why:** team logos are league trademarks and are currently loaded from ESPN's CDN (78 references in `src/`). In-app use is a known risk to review before charging money; store marketing must not use them at all (guideline 5.2).

### D-010 Practice bankroll ("simulator") deferred to v1.1
**Date:** 2026-11-20 · **By:** Builder
**Why:** it's the Stocks.News "practice with $100K" pattern and a good retention feature, but it is new scope and counts as simulated gambling for the age rating. Ship v1 first.

### D-011 Bundle identifier `com.mgpanalytics.app`
**Date:** 2026-11-20 · **By:** Builder
**Why:** bundle IDs are permanent once an app is created in App Store Connect. Matches the company domain family. App Store name "MGP Analytics" checked available on 2026-11-20.

### D-012 Push permission is requested at the end of onboarding, not on first launch
**Date:** 2026-11-20 · **By:** Builder
**Why:** iOS shows the system permission prompt once. Asking after the user has picked teams and alert types (so they know what they'll get) gets far higher opt-in. Alerts are the core feature, so this matters.

### D-013 App visual direction (proposed, pending owner review)
**Date:** 2026-11-20 · **By:** Builder
**What:** keep MGP green; system font (SF Pro) for UI with Space Grotesk for titles and big numbers; sentence case instead of uppercase mono; 10/12/16px corners; light and dark themes following the phone setting. Tokens in `packages/shared/design-tokens/tokens.json`.
**Why:** the web app's terminal style (IBM Plex Mono, uppercase, 4px corners, dark only) reads as a pro tool; the goal is "clean and easy for new users". Review board: https://claude.ai/artifact/94MNqZHA2ELsZdyq87HKJ7 (private; owner shares it with reviewers).

### D-014 Guest browsing: no login wall (approved by owner 2026-11-20)
**Date:** 2026-11-20 · **By:** Builder
**What:** the app opens on Today with no account. An account is requested only to follow something, set an alert, or use the Analyst, through a bottom sheet over the content (the Stocks.News pattern).
**Why:** the owner's recording shows Stocks.News never asks a browsing user to sign in. Apple's guideline 5.1.1(v) asks apps whose core features aren't account-based to let people use them without logging in. A login wall is where most new users drop off.
**How:** Supabase anonymous sign-in gives each guest a user id, so follows and alert settings save from the first tap; signing up links the guest to a real account and keeps them. The Analyst requires a real account (LLM cost and per-user rate limits). Needs anonymous sign-ins enabled in the Supabase dashboard, with CAPTCHA, and an RLS review so anonymous users can't read other users' data.
**Supersedes:** the welcome-then-sign-up flow in the original PLAN v1 scope rows 1 to 3.

### D-015 Home is a feed of modules under a sport bar
**Date:** 2026-11-20 · **By:** Builder
**What:** a scrolling sport bar (All, NFL, NBA, NCAAB, NCAAF, MLB) above short modules that each end in "More": biggest line moves, your teams today, tonight's games, hot streaks (in season), insiders, games this week. Sports out of season show a short offseason module, never an empty screen.
**Why:** the recording shows this is how Stocks.News Home works (category bar plus modules); it scales to five sports without nested tabs. Replaces "one ranked list" from the store screenshots.

### D-016 No verdict gauges or ratings
**Date:** 2026-11-20 · **By:** Builder
**Why:** Stocks.News shows "Strong sell / Strong buy" gauges. For MGP that would be picks language, which the product and the Analyst forbid (`docs/positioning.md`). Show data, never a verdict.

### D-017 No paid placements in the feed
**Date:** 2026-11-20 · **By:** Builder
**Why:** Stocks.News places sponsored press releases at the top of Home, and its reviews accuse it of pump-and-dump. MGP's position is "we don't make things up"; paid placement that looks editorial undermines it.

### D-018 Notification permission via soft asks (amends D-012)
**Date:** 2026-11-20 · **By:** Builder
**What:** onboarding ends with an optional "Get alerts for your teams" screen. After that, a slim "Turn on alerts" bar above the tab bar and "Alert me" buttons on modules. The iPhone system prompt appears only after the user taps one of these.
**Why:** the system prompt can be shown once; Stocks.News keeps a persistent soft prompt plus per-module buttons, which keeps the system prompt for people who already said yes.

### D-019 Access ladder: guest, then free account, then Pro
**Date:** 2026-11-20 · **By:** Owner direction, builder design
**What:** three levels. Guests browse everything public (Today, Games, game detail, Insiders list). A free account unlocks following, alerts and the Analyst. Pro (v1.1, off at launch per D-002) unlocks deeper features to be chosen later. Every locked feature uses the same bottom sheet over visible content, so people see what they'd get.
**Why:** the owner's read of Stocks.News: "slowly getting people there". Each step asks for a little more after showing value.

### D-020 Sign-up is one tap
**Date:** 2026-11-20 · **By:** Owner direction, builder design
**What:** the sign-up sheet leads with Sign in with Apple (Face ID, no typing), then Google, then email with a 6-digit code (no password to invent). Existing web users can still sign in with their password. No profile questions at sign-up; sports and teams were already picked as a guest and carry over.
**Why:** the owner asked for sign-up to be as easy as possible. Every extra field loses people.

### D-021 Insiders shows what popular X accounts are saying, pulled server-side (ON HOLD, see D-023)
**Date:** 2026-11-20 · **By:** Owner direction, builder design
**What:** a sync job pulls new posts from a curated list of insider accounts through the X API, stores them, and the app shows them natively in the Insiders tab and on game pages, with name, handle, time and a link to the original post on X.
**Why:** the website uses X's embed widget plus one hard-coded sample post (`src/components/twitter/LatestFromX.tsx`). Embeds are slow and unreliable on a phone and can't be filtered or ranked. A native feed needs the API.
**Cost:** X sells API access pay-per-use, reported at about $0.005 per post read (third-party sources, Nov 2026; confirm on console.x.com). Fetching only new posts, 50 accounts posting about 10 times a day is roughly 15,000 reads, about $75 a month. Owner approves before it's switched on. Without it, Insiders launches with profiles, follow and "Open on X" links.

### D-022 Keep recurring costs as low as possible
**Date:** 2026-11-20 · **By:** Owner
**What:** no new paid service or plan upgrade without the owner's approval. Prefer data MGP already syncs and free tiers. When a feature needs paid data, ship the free version first and bring the cost as a separate decision.

### D-023 X API on hold; Insiders launches without in-app posts
**Date:** 2026-11-20 · **By:** Owner (cost, D-022)
**What:** v1 Insiders shows profiles, categories (Sharps, Insiders, Analysts, Media, Props), follow, and "Open on X" for each account. No X API spend. Showing posts inside the app (D-021) waits until the owner approves the cost.

### D-024 Launch alerts, plus a bell to follow any single game
**Date:** 2026-11-20 · **By:** Owner
**What:** v1 push alerts: your team's game is starting, final scores for your teams, and big line moves on your teams' games. A bell on every game page follows just that game: you get the same alerts for it whether or not you follow either team. Low build cost (one more subscription type).
**Line moves without new cost:** alerts use the odds refresh MGP already runs (about every 6 hours), and their copy says so plainly ("moved 2 points since this morning"), never "live". Before launch, check The Odds API quota MGP already pays for. If there's headroom, refresh more often on game days at no extra cost. Any plan upgrade goes to the owner (D-022).

### D-025 Owner answers on the review board (notes 8 and 23)
**Date:** 2026-11-20 · **By:** Owner
**What:** the fourth tab is named **Insiders**. The practice bankroll is confirmed for **v1.1** (D-010).
**Note 4 (what leads Home):** the owner reframed it around the pitch: beat the books, the upper hand pros have, a level playing field. A simulated survey of 1,000 bettors and industry people is testing these headlines and the first Home module. Results go in `docs/mobile/research/`.
